import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Log, LogDescription } from "ethers";
import { ethers, network } from "hardhat";

const expectedChainId = 10143n;
const reportPath = resolve(process.env.MPROFILER_TESTNET_REPORT_PATH ?? "/tmp/mprofiler-testnet-check.json");
const sharedKeyHash = ethers.keccak256(ethers.toUtf8Bytes("mprofiler-shared-key-v1"));
const sharedKey = BigInt(sharedKeyHash);

function summarizePrestateTrace(trace: unknown) {
  if (trace === null || typeof trace !== "object" || Array.isArray(trace)) {
    throw new Error("QuickNode prestateTracer returned an unexpected result shape.");
  }
  const accounts = Object.values(trace as Record<string, unknown>);
  const storageSlots = accounts.reduce<number>((count, account) => {
    if (account === null || typeof account !== "object" || Array.isArray(account)) return count;
    const storage = (account as Record<string, unknown>).storage;
    return count + (storage && typeof storage === "object" ? Object.keys(storage).length : 0);
  }, 0);
  return { tracer: "prestateTracer", accountCount: accounts.length, storageSlotCount: storageSlots };
}

function redactEndpoint(message: string) {
  const endpoint = process.env.QUICKNODE_MONAD_TESTNET_RPC_URL;
  return endpoint ? message.split(endpoint).join("[QuickNode Testnet endpoint]") : message;
}

async function main() {
  const endpoint = process.env.QUICKNODE_MONAD_TESTNET_RPC_URL;
  if (!endpoint || !new URL(endpoint).hostname.endsWith(".monad-testnet.quiknode.pro")) {
    throw new Error(
      "Set QUICKNODE_MONAD_TESTNET_RPC_URL to a QuickNode Monad Testnet endpoint in packages/hardhat/.env.",
    );
  }

  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== expectedChainId) {
    throw new Error(
      `Refusing to deploy: expected Monad Testnet chain ID ${expectedChainId}, received ${chain.chainId}.`,
    );
  }

  const [signer] = await ethers.getSigners();
  if (!signer)
    throw new Error("No Testnet signer is configured. Create or import a dedicated encrypted account first.");
  const signerAddress = await signer.getAddress();
  const balance = await ethers.provider.getBalance(signerAddress);
  if (balance === 0n) throw new Error("The dedicated Testnet signer has no MON. Fund it before running this check.");

  const factory = await ethers.getContractFactory("ProfileWorkloads", signer);
  const contract = await factory.deploy();
  const deployTransaction = contract.deploymentTransaction();
  if (!deployTransaction) throw new Error("Deployment transaction was not created.");
  const deployReceipt = await deployTransaction.wait();
  if (!deployReceipt || deployReceipt.status !== 1) throw new Error("Probe deployment did not succeed.");
  const contractAddress = await contract.getAddress();
  if ((await ethers.provider.getCode(contractAddress)) === "0x")
    throw new Error("Probe deployment has no code at its receipt address.");

  const submitted: Array<Record<string, unknown>> = [];
  const traceNewTransaction = async (hash: string) => {
    const trace: unknown = await network.provider.send("debug_traceTransaction", [hash, { tracer: "prestateTracer" }]);
    return summarizePrestateTrace(trace);
  };

  submitted.push({
    kind: "deployment",
    transactionHash: deployReceipt.hash,
    status: deployReceipt.status,
    gasUsed: deployReceipt.gasUsed.toString(),
    trace: await traceNewTransaction(deployReceipt.hash),
  });

  const actions = [
    { kind: "writeSameKey", method: "writeSameKey", args: [7n] },
    { kind: "readHeavy", method: "readHeavy", args: [sharedKey] },
    { kind: "writeIndependent", method: "writeIndependent", args: [42n, 1337n] },
  ];
  let eventVerified = false;
  for (const action of actions) {
    const transaction = await contract.getFunction(action.method)(...action.args);
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`${action.method} transaction did not succeed.`);

    if (action.method === "readHeavy") {
      const event = receipt.logs
        .map((log: Log): LogDescription | null => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed: LogDescription | null) => parsed?.name === "ReadObserved");
      if (!event || event.args.key !== sharedKey || event.args.value !== 7n) {
        throw new Error("readHeavy receipt did not contain the expected ReadObserved(keccak key, 7) event.");
      }
      eventVerified = true;
    }

    submitted.push({
      kind: action.kind,
      transactionHash: receipt.hash,
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
      trace: await traceNewTransaction(receipt.hash),
    });
  }

  if (!eventVerified) throw new Error("Expected ReadObserved event was not verified.");
  const report = {
    schemaVersion: "1.0.0",
    network: "Monad Testnet",
    chainId: chain.chainId.toString(),
    signerAddress,
    signerStartingBalanceWei: balance.toString(),
    contract: { name: "ProfileWorkloads", address: contractAddress },
    eventVerified,
    transactions: submitted,
    note: "Bounded Testnet integration check only; receipts, one event, and QuickNode prestate traces on these submitted transactions. This is not a workload benchmark or Monad scheduler measurement.",
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Verified one Testnet deployment, three transactions, the ReadObserved event, and four traces. Report: ${reportPath}`,
  );
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "Testnet check failed.";
  console.error(redactEndpoint(message));
  process.exitCode = 1;
});
