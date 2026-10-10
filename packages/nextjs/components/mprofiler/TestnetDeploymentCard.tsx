"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { monadTestnet } from "viem/chains";
import { useAccount, useDeployContract, useSwitchChain, useWaitForTransactionReceipt } from "wagmi";
import { profileWorkloadsBytecode } from "~~/lib/mprofiler/profileWorkloadsFixture";

function shortHash(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function TestnetDeploymentCard() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { deployContractAsync, data: deploymentHash, isPending: isSubmitting } = useDeployContract();
  const {
    data: receipt,
    isLoading: isConfirming,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: deploymentHash });
  const [error, setError] = useState<string | null>(null);
  const explorerUrl = monadTestnet.blockExplorers?.default.url;

  const deploy = async () => {
    setError(null);
    try {
      if (!isConnected) {
        setError("Connect a wallet before deploying the Testnet fixture.");
        return;
      }
      if (chainId !== monadTestnet.id) await switchChainAsync({ chainId: monadTestnet.id });
      await deployContractAsync({ abi: [], bytecode: profileWorkloadsBytecode, chainId: monadTestnet.id });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Wallet deployment was not submitted.");
    }
  };

  return (
    <section className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.15em] text-teal-700">
            Step 4 · Testnet verification
          </p>
          <h2 className="mb-0 mt-2 text-base font-semibold text-slate-950">
            Deploy the public workload fixture from your wallet
          </h2>
          <p className="mb-0 mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Your wallet signs the deployment. The dashboard records the transaction and receipt; the local profiler
            remains a separate deterministic Hardhat measurement.
          </p>
        </div>
        {!isConnected ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button
                type="button"
                onClick={openConnectModal}
                className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Connect wallet
              </button>
            )}
          </ConnectButton.Custom>
        ) : (
          <button
            type="button"
            onClick={deploy}
            disabled={isSwitching || isSubmitting || isConfirming}
            className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
          >
            {isSwitching
              ? "Switching network…"
              : isSubmitting
                ? "Confirm in wallet…"
                : isConfirming
                  ? "Confirming receipt…"
                  : "Deploy on Testnet"}
          </button>
        )}
      </div>
      {isConnected && (
        <p className="mb-0 mt-3 font-mono text-xs text-teal-800">
          Wallet: {address ? shortHash(address) : "connected"} ·{" "}
          {chainId === monadTestnet.id ? "Monad Testnet" : "network switch required"}
        </p>
      )}
      {deploymentHash && (
        <p className="mb-0 mt-3 text-sm text-slate-700">
          Submitted:{" "}
          <a
            className="font-mono text-teal-700 underline underline-offset-4"
            href={`${explorerUrl}/tx/${deploymentHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {shortHash(deploymentHash)}
          </a>
        </p>
      )}
      {receipt?.contractAddress && (
        <p className="mb-0 mt-2 text-sm text-slate-700">
          Deployed contract:{" "}
          <a
            className="font-mono text-teal-700 underline underline-offset-4"
            href={`${explorerUrl}/address/${receipt.contractAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            {receipt.contractAddress}
          </a>
        </p>
      )}
      {(error || receiptError) && (
        <p
          role="alert"
          className="mb-0 mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {error ?? receiptError?.message}
        </p>
      )}
    </section>
  );
}
