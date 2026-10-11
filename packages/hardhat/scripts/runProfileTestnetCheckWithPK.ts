import * as dotenv from "dotenv";
dotenv.config();
import { Wallet } from "ethers";
import password from "@inquirer/password";
import { spawn } from "node:child_process";

const expectedChainId = "0x279f";

async function wait(milliseconds: number) {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function preflightQuickNode(endpoint: string) {
  let lastFailure = "unknown network error";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: attempt, method: "eth_chainId", params: [] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { result?: unknown; error?: { message?: unknown } };
      if (payload.error)
        throw new Error(typeof payload.error.message === "string" ? payload.error.message : "RPC returned an error.");
      if (payload.result !== expectedChainId) throw new Error("RPC returned an unexpected chain ID.");
      return;
    } catch (error) {
      lastFailure = error instanceof Error ? error.name : "network error";
      if (attempt < 3) await wait(attempt * 1_000);
    }
  }
  throw new Error(`QuickNode Testnet RPC preflight failed after 3 attempts (${lastFailure}). Try again in a moment.`);
}

async function main() {
  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;
  if (!encryptedKey) {
    throw new Error("No encrypted deployer account found. Run yarn account:generate or yarn account:import first.");
  }
  const endpoint = process.env.QUICKNODE_MONAD_TESTNET_RPC_URL;
  if (!endpoint || !new URL(endpoint).hostname.endsWith(".monad-testnet.quiknode.pro")) {
    throw new Error(
      "Set QUICKNODE_MONAD_TESTNET_RPC_URL to a QuickNode Monad Testnet endpoint in packages/hardhat/.env.",
    );
  }

  await preflightQuickNode(endpoint);

  const passphrase = await password({ message: "Enter password to unlock the dedicated Testnet signer:" });
  const wallet = await Wallet.fromEncryptedJson(encryptedKey, passphrase);
  const child = spawn("hardhat", ["run", "scripts/profile-testnet-check.ts", "--network", "monadTestnet"], {
    stdio: "inherit",
    env: { ...process.env, __RUNTIME_DEPLOYER_PRIVATE_KEY: wallet.privateKey },
  });

  child.on("error", error => {
    console.error(`Could not start the Testnet check: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("close", code => {
    process.exitCode = code ?? 1;
  });
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Testnet check failed.");
  process.exitCode = 1;
});
