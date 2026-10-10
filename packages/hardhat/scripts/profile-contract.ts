import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FunctionFragment, InterfaceAbi } from "ethers";
import { ethers, network, run } from "hardhat";
import { compareProfileReports } from "./profileCompare";
import { createProfileReport, type ProfileReportCall } from "./profileReport";
import { parseTraceAccess } from "./traceAccess";

type ContractSource = { source: string };
type ContractCall = {
  function: string;
  args: unknown[];
  caller: number;
  repeat: number;
  label?: string;
};
type ContractJob = {
  mode: "contract";
  baseline: ContractSource;
  revision?: ContractSource;
  workload: {
    contractName: string;
    constructorArgs: unknown[];
    calls: ContractCall[];
  };
};

const jobPath = process.env.MPROFILER_CONTRACT_JOB_PATH;
const reportPath = resolve(process.env.MPROFILER_REPORT_PATH ?? "/tmp/mprofiler-contract-report.json");
const tracePath = resolve(process.env.MPROFILER_RAW_TRACE_PATH ?? "/tmp/mprofiler-contract-traces.json");
const workspaceRoot = resolve(__dirname, "..");
const uploadRoot = resolve(workspaceRoot, "contracts", ".mprofiler");

function parseJob(value: unknown): ContractJob {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Contract profile job is malformed.");
  const job = value as Partial<ContractJob>;
  if (job.mode !== "contract" || !job.baseline || typeof job.baseline.source !== "string" || !job.workload) {
    throw new Error("Contract profile job is missing baseline source or workload.");
  }
  return job as ContractJob;
}

function safeFileStem(label: string) {
  return label.replace(/[^A-Za-z0-9_]/g, "_");
}

async function compileSource(source: string, label: "baseline" | "revision") {
  const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const fileName = `${safeFileStem(label)}_${unique}.sol`;
  const sourcePath = resolve(uploadRoot, fileName);
  const artifactDirectory = resolve(workspaceRoot, "artifacts", "contracts", ".mprofiler", fileName);
  await mkdir(uploadRoot, { recursive: true });
  await writeFile(sourcePath, source);

  try {
    await run("compile", { quiet: true });
    return { fileName, artifactDirectory, sourcePath };
  } catch (error) {
    await Promise.all([rm(sourcePath, { force: true }), rm(artifactDirectory, { recursive: true, force: true })]);
    const message = error instanceof Error ? error.message : "Solidity compilation failed.";
    throw new Error(`Solidity compilation failed for the ${label} source: ${message}`);
  }
}

async function loadArtifact(fileName: string, artifactDirectory: string, contractName: string) {
  const artifactPath = resolve(artifactDirectory, `${contractName}.json`);
  try {
    return {
      artifact: JSON.parse(await readFile(artifactPath, "utf8")) as { abi: unknown; bytecode: string },
      contractName,
    };
  } catch {
    const available = (await readdir(artifactDirectory).catch(() => []))
      .filter(file => file.endsWith(".json") && !file.endsWith(".dbg.json"))
      .map(file => file.slice(0, -".json".length));
    if (available.length === 1) {
      const revisionContractName = available[0];
      return {
        artifact: JSON.parse(await readFile(resolve(artifactDirectory, `${revisionContractName}.json`), "utf8")) as {
          abi: unknown;
          bytecode: string;
        },
        contractName: revisionContractName,
      };
    }
    throw new Error(
      `Compiled ${fileName}, but did not find contract ${contractName}. Available contracts: ${available.join(", ") || "none"}.`,
    );
  }
}

function workloadScenarios(calls: ContractCall[]) {
  const scenarios: string[] = [];
  for (const call of calls) {
    const id = call.label?.trim() || call.function;
    if (!scenarios.includes(id)) scenarios.push(id);
  }
  return scenarios;
}

async function runWorkload(
  artifact: { abi: unknown; bytecode: string },
  contractName: string,
  callsInput: ContractCall[],
  constructorArgs: unknown[],
  label: string,
) {
  const signers = await ethers.getSigners();
  const highestCaller = Math.max(...callsInput.map(call => call.caller), 0);
  if (highestCaller >= signers.length)
    throw new Error(`Call manifest needs account ${highestCaller}, but the local EVM has fewer signers.`);

  const factory = new ethers.ContractFactory(artifact.abi as InterfaceAbi, artifact.bytecode, signers[0]);
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const calls: ProfileReportCall[] = [];
  const rawTraces: unknown[] = [];
  const scenarios = workloadScenarios(callsInput);
  const callableFunctions = contract.interface.fragments.flatMap(fragment => {
    if (fragment.type !== "function") return [];
    const functionFragment = fragment as FunctionFragment;
    return functionFragment.stateMutability === "view" || functionFragment.stateMutability === "pure"
      ? []
      : [functionFragment.format("sighash")];
  });
  let callIndex = 0;

  for (const definition of callsInput) {
    const scenarioId = definition.label?.trim() || definition.function;
    let method;
    try {
      method = contract.connect(signers[definition.caller]).getFunction(definition.function);
    } catch {
      const available = callableFunctions.length > 0 ? callableFunctions.join(", ") : "none";
      throw new Error(
        `Call manifest function ${definition.function} is not in ${contractName}'s state-changing ABI. Available functions: ${available}.`,
      );
    }
    for (let repeatIndex = 0; repeatIndex < definition.repeat; repeatIndex += 1) {
      const workloadCaseId = `${scenarioId}:${String(callIndex).padStart(4, "0")}`;
      const transaction = await method(...definition.args);
      const receipt = await transaction.wait();
      if (!receipt) throw new Error(`Transaction ${workloadCaseId} did not return a receipt.`);
      const rawTrace: unknown = await network.provider.send("debug_traceTransaction", [receipt.hash]);
      rawTraces.push({ workloadCaseId, transactionHash: receipt.hash, trace: rawTrace });
      calls.push({
        workloadCaseId,
        input: contract.interface.encodeFunctionData(definition.function, definition.args),
        transactionHash: receipt.hash,
        status: receipt.status === 1 ? "success" : "reverted",
        gasUsed: receipt.gasUsed.toString(),
        trace: parseTraceAccess(rawTrace, address),
      });
      callIndex += 1;
    }
  }

  const chain = await ethers.provider.getNetwork();
  return {
    rawTraces,
    report: createProfileReport({
      chainId: chain.chainId,
      compilerVersion: "0.8.20",
      contractAddress: address,
      calls,
      network: "hardhat",
      contractName,
      workload: {
        id: "mprofiler-uploaded-contract-v1",
        scenarios,
        batchSize: calls.length,
        controlledAccountCount: highestCaller + 1,
      },
    }),
    label,
  };
}

async function main() {
  if (!jobPath) throw new Error("MPROFILER_CONTRACT_JOB_PATH is required.");
  const job = parseJob(JSON.parse(await readFile(jobPath, "utf8")));
  const generatedFiles: Array<{ sourcePath: string; artifactDirectory: string }> = [];

  try {
    const baselineCompiled = await compileSource(job.baseline.source, "baseline");
    generatedFiles.push(baselineCompiled);
    const baselineLoaded = await loadArtifact(
      baselineCompiled.fileName,
      baselineCompiled.artifactDirectory,
      job.workload.contractName,
    );

    const snapshotId = await network.provider.send("evm_snapshot");
    const baseline = await runWorkload(
      baselineLoaded.artifact,
      baselineLoaded.contractName,
      job.workload.calls,
      job.workload.constructorArgs,
      "baseline",
    );
    let output: unknown = { baseline: baseline.report, revision: null, comparison: null };
    let allTraces: unknown = { version: "1.0.0", baseline: baseline.rawTraces };

    if (job.revision) {
      const reverted = await network.provider.send("evm_revert", [snapshotId]);
      if (reverted !== true) throw new Error("Could not reset the local EVM before profiling the revision.");
      const revisionCompiled = await compileSource(job.revision.source, "revision");
      generatedFiles.push(revisionCompiled);
      const revisionLoaded = await loadArtifact(
        revisionCompiled.fileName,
        revisionCompiled.artifactDirectory,
        job.workload.contractName,
      );
      const revision = await runWorkload(
        revisionLoaded.artifact,
        revisionLoaded.contractName,
        job.workload.calls,
        job.workload.constructorArgs,
        "revision",
      );
      output = {
        baseline: baseline.report,
        revision: revision.report,
        comparison: compareProfileReports(baseline.report, revision.report, {
          baseline: `${job.workload.contractName} baseline`,
          revision: `${revisionLoaded.contractName} revision`,
        }),
      };
      allTraces = { version: "1.0.0", baseline: baseline.rawTraces, revision: revision.rawTraces };
    }

    await mkdir(dirname(reportPath), { recursive: true });
    await mkdir(dirname(tracePath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`);
    await writeFile(tracePath, `${JSON.stringify(allTraces)}\n`);
    console.log(`Wrote uploaded-contract profile report to ${reportPath}`);
  } finally {
    await Promise.all(
      generatedFiles.map(file =>
        Promise.all([
          rm(file.sourcePath, { force: true }),
          rm(file.artifactDirectory, { recursive: true, force: true }),
        ]),
      ),
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
