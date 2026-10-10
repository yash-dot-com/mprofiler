import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { artifacts, ethers, network } from "hardhat";
import { compareProfileReports } from "./profileCompare";
import { createProfileReport, ProfileReportCall } from "./profileReport";
import { generateWorkloads, SCENARIO_IDS } from "./profileWorkloads";
import { parseTraceAccess } from "./traceAccess";

const batchSize = Number(process.env.MPROFILER_BATCH_SIZE ?? 5);
const controlledAccountCount = Number(process.env.MPROFILER_ACCOUNT_COUNT ?? Math.min(Math.max(batchSize, 2), 10));
const baselineArtifact = process.env.MPROFILER_BASELINE_ARTIFACT ?? "ProfileWorkloads";
const revisionArtifact = process.env.MPROFILER_REVISION_ARTIFACT || undefined;
const reportPath = resolve(process.env.MPROFILER_REPORT_PATH ?? "/tmp/mprofiler-scenario-report.json");
const tracePath = resolve(process.env.MPROFILER_RAW_TRACE_PATH ?? "/tmp/mprofiler-scenario-traces.json");

type RunResult = { report: ReturnType<typeof createProfileReport>; rawTraces: unknown[] };

async function runWorkload(artifactName: string): Promise<RunResult> {
  const workload = generateWorkloads(batchSize, controlledAccountCount);
  const signers = await ethers.getSigners();
  if (controlledAccountCount > signers.length) {
    throw new Error(`Requested ${controlledAccountCount} controlled accounts, but Hardhat provides ${signers.length}.`);
  }

  const calls: ProfileReportCall[] = [];
  const rawTraces: unknown[] = [];
  const scenarioAddresses: Record<string, string> = {};
  let contractAddress = "";

  for (const scenario of workload) {
    const contract = await ethers.deployContract(artifactName, [], { signer: signers[0] });
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    scenarioAddresses[scenario.id] = address;
    contractAddress ||= address;

    for (const step of scenario.steps) {
      const method = contract.connect(signers[step.accountIndex]).getFunction(step.method);
      const transaction = await method(...step.args);
      const receipt = await transaction.wait();
      if (!receipt) throw new Error(`Transaction ${step.workloadCaseId} did not return a receipt.`);

      const rawTrace: unknown = await network.provider.send("debug_traceTransaction", [receipt.hash]);
      rawTraces.push({ scenarioId: step.scenarioId, workloadCaseId: step.workloadCaseId, transactionHash: receipt.hash, trace: rawTrace });
      calls.push({
        workloadCaseId: step.workloadCaseId,
        input: contract.interface.encodeFunctionData(step.method, step.args),
        transactionHash: receipt.hash,
        status: receipt.status === 1 ? "success" : "reverted",
        gasUsed: receipt.gasUsed.toString(),
        trace: parseTraceAccess(rawTrace, address),
      });
    }
  }

  const chain = await ethers.provider.getNetwork();
  const report = createProfileReport({
    chainId: chain.chainId,
    compilerVersion: "0.8.20",
    contractAddress,
    calls,
    network: "hardhat",
    contractName: artifactName,
    scenarioAddresses,
    workload: {
      id: "mprofiler-deterministic-scenarios-v1",
      scenarios: [...SCENARIO_IDS],
      batchSize,
      controlledAccountCount,
    },
  });
  return { report, rawTraces };
}

async function main() {
  // Artifact lookup fails early with a clear error if the selected revision was not compiled.
  await artifacts.readArtifact(baselineArtifact);
  if (revisionArtifact) await artifacts.readArtifact(revisionArtifact);

  const snapshotId = await network.provider.send("evm_snapshot");
  const baseline = await runWorkload(baselineArtifact);
  let output: unknown = baseline.report;
  let allTraces: unknown = [{ version: "1.0.0", baseline: baseline.rawTraces }];

  if (revisionArtifact) {
    const reverted = await network.provider.send("evm_revert", [snapshotId]);
    if (reverted !== true) throw new Error("Could not restore the Hardhat snapshot before the revision run.");
    const revision = await runWorkload(revisionArtifact);
    const comparison = compareProfileReports(baseline.report, revision.report, {
      baseline: baselineArtifact,
      revision: revisionArtifact,
    });
    output = { baseline: baseline.report, revision: revision.report, comparison };
    allTraces = [{ version: "1.0.0", baseline: baseline.rawTraces, revision: revision.rawTraces }];
  }

  await mkdir(dirname(reportPath), { recursive: true });
  await mkdir(dirname(tracePath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`);
  await writeFile(tracePath, `${JSON.stringify(allTraces)}\n`);
  console.log(`Wrote local Hardhat scenario report to ${reportPath}`);
  console.log(`Wrote raw Hardhat execution traces to ${tracePath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

