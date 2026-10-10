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
    <section className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-400/[0.055] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-200">
            Monad Testnet evidence
          </p>
          <h2 className="mb-0 mt-2 text-base font-semibold text-white">
            Deploy the public workload fixture from your wallet
          </h2>
          <p className="mb-0 mt-2 max-w-3xl text-sm leading-6 text-[#b9cabc]">
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
                className="rounded-md bg-emerald-400 px-3 py-2 text-sm font-semibold text-[#052d22] hover:bg-emerald-300"
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
            className="rounded-md bg-emerald-400 px-3 py-2 text-sm font-semibold text-[#052d22] hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"
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
        <p className="mb-0 mt-3 font-mono text-xs text-emerald-100">
          Wallet: {address ? shortHash(address) : "connected"} ·{" "}
          {chainId === monadTestnet.id ? "Monad Testnet" : "network switch required"}
        </p>
      )}
      {deploymentHash && (
        <p className="mb-0 mt-3 text-sm text-[#d6eadc]">
          Submitted:{" "}
          <a
            className="font-mono text-emerald-200 underline underline-offset-4"
            href={`${explorerUrl}/tx/${deploymentHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {shortHash(deploymentHash)}
          </a>
        </p>
      )}
      {receipt?.contractAddress && (
        <p className="mb-0 mt-2 text-sm text-[#d6eadc]">
          Deployed contract:{" "}
          <a
            className="font-mono text-emerald-200 underline underline-offset-4"
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
          className="mb-0 mt-3 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
        >
          {error ?? receiptError?.message}
        </p>
      )}
    </section>
  );
}
