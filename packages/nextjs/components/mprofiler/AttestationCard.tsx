"use client";

import { useEffect, useMemo, useState } from "react";
import { type Address, getEventSelector, isAddress, keccak256, toHex } from "viem";
import { monadTestnet } from "viem/chains";
import { useAccount, useDeployContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { mprofilerAttestationAbi, mprofilerAttestationBytecode } from "~~/lib/mprofiler/mprofilerAttestationFixture";

type Props = { report: unknown };

const eventSelector = getEventSelector("ProfileAttested(bytes32,address,string)");
const shortHash = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`;

export function AttestationCard({ report }: Props) {
  const reportHash = useMemo(() => keccak256(toHex(JSON.stringify(report))), [report]);
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { deployContractAsync, data: deploymentHash, isPending: isDeploying } = useDeployContract();
  const {
    data: deploymentReceipt,
    isLoading: isConfirmingDeployment,
    error: deploymentError,
  } = useWaitForTransactionReceipt({
    hash: deploymentHash,
  });
  const { writeContractAsync, data: attestationHash, isPending: isAttesting } = useWriteContract();
  const {
    data: attestationReceipt,
    isLoading: isConfirmingAttestation,
    error: attestationError,
  } = useWaitForTransactionReceipt({
    hash: attestationHash,
  });
  const [contractAddress, setContractAddress] = useState("");
  const [reportUri, setReportUri] = useState("");
  const [error, setError] = useState<string | null>(null);
  const explorerUrl = monadTestnet.blockExplorers?.default.url;

  useEffect(() => {
    if (deploymentReceipt?.contractAddress) setContractAddress(deploymentReceipt.contractAddress);
  }, [deploymentReceipt]);

  const emittedExpectedEvent = useMemo(
    () =>
      Boolean(
        attestationReceipt?.logs.some(
          log =>
            log.address.toLowerCase() === contractAddress.toLowerCase() &&
            log.topics[0] === eventSelector &&
            log.topics[1]?.toLowerCase() === reportHash.toLowerCase(),
        ),
      ),
    [attestationReceipt, contractAddress, reportHash],
  );

  const onTestnet = chainId === monadTestnet.id;
  const ensureTestnet = async () => {
    if (!isConnected) throw new Error("Connect a wallet before publishing an attestation.");
    if (!onTestnet) await switchChainAsync({ chainId: monadTestnet.id });
  };

  const deploy = async () => {
    setError(null);
    try {
      await ensureTestnet();
      await deployContractAsync({
        abi: mprofilerAttestationAbi,
        bytecode: mprofilerAttestationBytecode,
        chainId: monadTestnet.id,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Attestation deployment was not submitted.");
    }
  };

  const attest = async () => {
    setError(null);
    if (!isAddress(contractAddress)) {
      setError("Deploy the attestation contract or enter its valid Testnet address.");
      return;
    }
    try {
      await ensureTestnet();
      await writeContractAsync({
        address: contractAddress as Address,
        abi: mprofilerAttestationAbi,
        functionName: "attest",
        args: [reportHash, reportUri.trim()],
        chainId: monadTestnet.id,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Attestation was not submitted.");
    }
  };

  const busy = isSwitching || isDeploying || isConfirmingDeployment || isAttesting || isConfirmingAttestation;

  return (
    <section className="mt-5 rounded-xl border border-sky-300/20 bg-sky-400/[0.055] p-4">
      <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-200">
        Public Testnet attestation
      </p>
      <h2 className="mb-0 mt-2 text-base font-semibold text-white">Publish this report hash from your wallet</h2>
      <p className="mb-0 mt-2 max-w-3xl text-sm leading-6 text-[#b9cabc]">
        The chain stores the Keccak-256 hash, publisher, timestamp, and optional evidence URI. Local measurements stay
        off-chain and can be verified against this exact hash.
      </p>
      <p className="mb-0 mt-3 break-all rounded-md border border-sky-200/15 bg-black/20 px-3 py-2 font-mono text-xs text-sky-100">
        Report hash: {reportHash}
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="text-xs text-[#a8a8be]">
          Attestation contract address
          <input
            value={contractAddress}
            onChange={event => setContractAddress(event.target.value.trim())}
            placeholder="Deploy below or paste an existing Testnet address"
            className="mt-1 block w-full rounded-md border border-white/15 bg-black/25 px-3 py-2 font-mono text-xs text-white outline-none focus:border-sky-300"
          />
        </label>
        <label className="text-xs text-[#a8a8be]">
          Evidence URI (optional)
          <input
            value={reportUri}
            onChange={event => setReportUri(event.target.value)}
            maxLength={512}
            placeholder="ipfs://… or a public report URL"
            className="mt-1 block w-full rounded-md border border-white/15 bg-black/25 px-3 py-2 font-mono text-xs text-white outline-none focus:border-sky-300"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={deploy}
            disabled={busy}
            className="rounded-md border border-sky-300/40 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-300/10 disabled:cursor-wait disabled:opacity-60"
          >
            Deploy registry
          </button>
          <button
            type="button"
            onClick={attest}
            disabled={busy || !isAddress(contractAddress)}
            className="rounded-md bg-sky-300 px-3 py-2 text-sm font-semibold text-[#06233a] hover:bg-sky-200 disabled:cursor-wait disabled:opacity-60"
          >
            {isSwitching
              ? "Switching…"
              : isDeploying
                ? "Deploying…"
                : isConfirmingDeployment
                  ? "Confirming…"
                  : isAttesting
                    ? "Confirm in wallet…"
                    : isConfirmingAttestation
                      ? "Verifying…"
                      : "Publish hash"}
          </button>
        </div>
      </div>
      <p className="mb-0 mt-3 text-xs text-[#a8a8be]">
        {isConnected
          ? `${shortHash(address ?? "wallet")} · ${onTestnet ? "Monad Testnet" : "network switch required"}`
          : "Connect a Testnet wallet using the deployment card above."}
      </p>
      {deploymentHash && (
        <p className="mb-0 mt-2 text-sm text-sky-100">
          Registry transaction:{" "}
          <a
            className="font-mono text-sky-200 underline underline-offset-4"
            href={`${explorerUrl}/tx/${deploymentHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {shortHash(deploymentHash)}
          </a>
        </p>
      )}
      {attestationHash && (
        <p className="mb-0 mt-2 text-sm text-sky-100">
          Attestation transaction:{" "}
          <a
            className="font-mono text-sky-200 underline underline-offset-4"
            href={`${explorerUrl}/tx/${attestationHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {shortHash(attestationHash)}
          </a>
        </p>
      )}
      {emittedExpectedEvent && (
        <p className="mb-0 mt-2 rounded-md border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
          Verified from the receipt: the registry emitted <span className="font-mono">ProfileAttested</span> for this
          exact report hash.
        </p>
      )}
      {(error || deploymentError || attestationError) && (
        <p
          role="alert"
          className="mb-0 mt-3 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
        >
          {error ?? deploymentError?.message ?? attestationError?.message}
        </p>
      )}
    </section>
  );
}
