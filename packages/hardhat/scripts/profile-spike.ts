import { writeFile } from "node:fs/promises";
import { ethers, network } from "hardhat";
import { createProfileReport } from "./profileReport";
import { parseTraceAccess } from "./traceAccess";

const workload = ["mprofiler:alpha", "mprofiler:beta", "mprofiler:alpha"];

async function main() {
  const [signer] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("YourContract", signer);
  const contract = await factory.deploy(signer.address);
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  const calls = [];
  for (const greeting of workload) {
    const transaction = await contract.setGreeting(greeting);
    const receipt = await transaction.wait();
    if (!receipt) throw new Error(`Missing receipt for ${transaction.hash}`);

    const trace = await network.provider.send("debug_traceTransaction", [receipt.hash]);
    const traceAccess = parseTraceAccess(trace, contractAddress);
    calls.push({
      input: greeting,
      greeting,
      transactionHash: receipt.hash,
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
      traceAccess,
      trace,
    });
  }

  const result = {
    network: "hardhat (ephemeral local EVM)",
    compiler: "0.8.20 (from hardhat.config.ts)",
    contractAddress,
    workload,
    totalGasUsed: calls.reduce((sum, call) => sum + BigInt(call.gasUsed), 0n).toString(),
    calls: calls.map(({ trace, traceAccess, ...call }) => ({
      ...call,
      traceStructLogs: trace.structLogs?.length ?? null,
      traceReturnValue: trace.returnValue ?? null,
      storageReadCount: traceAccess.accesses.filter(access => access.operation === "read").length,
      storageWriteSlots: traceAccess.committedWriteSlots,
      traceWarnings: traceAccess.warnings,
    })),
  };

  const report = createProfileReport({
    chainId: (await ethers.provider.getNetwork()).chainId,
    compilerVersion: "0.8.20",
    contractAddress,
    calls: calls.map(call => ({
      input: call.input,
      transactionHash: call.transactionHash,
      status: call.status === 1 ? "success" : "reverted",
      gasUsed: call.gasUsed,
      trace: call.traceAccess,
    })),
  });

  const rawTraceOutput = process.env.MPROFILER_RAW_TRACE_PATH ?? "/tmp/mprofiler-spike.json";
  const reportOutput = process.env.MPROFILER_REPORT_PATH ?? "/tmp/mprofiler-report.json";
  await writeFile(rawTraceOutput, JSON.stringify({ ...result, calls }, null, 2));
  await writeFile(reportOutput, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...result, reportOutput, rawTraceOutput }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
