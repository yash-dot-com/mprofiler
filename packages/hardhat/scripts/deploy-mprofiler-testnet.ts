import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ethers } from "hardhat";

const expectedChainId = 10143n;
const outputPath = resolve(process.env.MPROFILER_TESTNET_DEPLOYMENT_PATH ?? "/tmp/mprofiler-testnet-deployment.json");

async function deployContract(name: "ProfileWorkloads" | "MProfilerAttestation") {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy();
  const transaction = contract.deploymentTransaction();
  if (!transaction) throw new Error(`${name} did not produce a deployment transaction.`);
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`${name} deployment did not succeed.`);
  const address = await contract.getAddress();
  if (await ethers.provider.getCode(address) === "0x") throw new Error(`${name} has no bytecode at its receipt address.`);
  return { name, address, transactionHash: receipt.hash, gasUsed: receipt.gasUsed.toString() };
}

async function main() {
  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== expectedChainId) {
    throw new Error(`Refusing deployment: expected Monad Testnet chain ID ${expectedChainId}, received ${chain.chainId}.`);
  }
  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No dedicated Testnet signer is configured.");
  const signerAddress = await signer.getAddress();
  const balance = await ethers.provider.getBalance(signerAddress);
  if (balance === 0n) throw new Error("The dedicated Testnet signer has no MON.");

  const contracts = [await deployContract("ProfileWorkloads"), await deployContract("MProfilerAttestation")];
  const output = {
    network: "Monad Testnet",
    chainId: chain.chainId.toString(),
    signerAddress,
    contracts,
    note: "Public Testnet fixture and report-hash attestation registry. Local profiling measurements remain off-chain.",
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  for (const contract of contracts) {
    console.log(`${contract.name}: ${contract.address}`);
    console.log(`Transaction: ${contract.transactionHash}`);
  }
  console.log(`Wrote Monad Testnet deployment record to ${outputPath}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Monad Testnet deployment failed.");
  process.exitCode = 1;
});
