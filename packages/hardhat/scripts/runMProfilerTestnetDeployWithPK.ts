import * as dotenv from "dotenv";
import { spawn } from "node:child_process";
import password from "@inquirer/password";
import { Wallet } from "ethers";

dotenv.config();

const expectedChainId = "0x279f";

async function preflight(endpoint: string) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`QuickNode preflight returned HTTP ${response.status}.`);
  const payload = (await response.json()) as { result?: unknown };
  if (payload.result !== expectedChainId) throw new Error("QuickNode preflight returned an unexpected chain ID.");
}

async function main() {
  const endpoint = process.env.QUICKNODE_MONAD_TESTNET_RPC_URL;
  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;
  if (!endpoint || !new URL(endpoint).hostname.endsWith(".monad-testnet.quiknode.pro")) {
    throw new Error(
      "Set QUICKNODE_MONAD_TESTNET_RPC_URL to a QuickNode Monad Testnet endpoint in packages/hardhat/.env.",
    );
  }
  if (!encryptedKey) throw new Error("No encrypted deployer account found.");
  await preflight(endpoint);
  const passphrase = await password({ message: "Enter password to unlock the dedicated Testnet signer:" });
  const wallet = await Wallet.fromEncryptedJson(encryptedKey, passphrase);
  const child = spawn("hardhat", ["run", "scripts/deploy-mprofiler-testnet.ts", "--network", "monadTestnet"], {
    stdio: "inherit",
    env: { ...process.env, __RUNTIME_DEPLOYER_PRIVATE_KEY: wallet.privateKey },
  });
  child.on("error", error => {
    console.error(`Could not start Monad Testnet deployment: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("close", code => {
    process.exitCode = code ?? 1;
  });
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Monad Testnet deployment failed.");
  process.exitCode = 1;
});
