"use client";

import { useEffect, useMemo } from "react";
import { useSessionStorage } from "usehooks-ts";
import { BarsArrowUpIcon } from "@heroicons/react/20/solid";
import { ContractUI } from "~~/app/debug/_components/contract";
import { ContractName, GenericContract } from "~~/utils/scaffold-eth/contract";
import { useAllContracts } from "~~/utils/scaffold-eth/contractsData";

const selectedContractStorageKey = "scaffoldEth2.selectedContract";

export function DebugContracts() {
  const contractsData = useAllContracts();
  const contractNames = useMemo(
    () =>
      Object.keys(contractsData).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
      }) as ContractName[],
    [contractsData],
  );

  const [selectedContract, setSelectedContract] = useSessionStorage<ContractName>(
    selectedContractStorageKey,
    contractNames[0],
    { initializeWithValue: false },
  );

  useEffect(() => {
    if (!contractNames.includes(selectedContract)) {
      setSelectedContract(contractNames[0]);
    }
  }, [contractNames, selectedContract, setSelectedContract]);

  return (
    <div className="flex w-full flex-col gap-y-6 py-7 lg:gap-y-8 lg:py-9">
      {contractNames.length === 0 ? (
        <section className="rounded-xl border border-dashed border-white/15 bg-[#0e0e17] px-5 py-12 text-center">
          <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300">
            No contract metadata
          </p>
          <h2 className="mb-0 mt-3 text-xl font-semibold text-white">No configured contracts found</h2>
          <p className="mx-auto mb-0 mt-3 max-w-xl text-sm leading-6 text-[#aaa9bb]">
            Deploy a contract and generate its frontend metadata, then return here to inspect its read and write
            methods.
          </p>
        </section>
      ) : (
        <>
          {contractNames.length > 1 && (
            <section className="rounded-xl border border-white/10 bg-[#0e0e17] p-4">
              <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[#aaa9bb]">
                Available contracts
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {contractNames.map(contractName => (
                  <button
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-sm transition-colors ${
                      contractName === selectedContract
                        ? "border-violet-300/50 bg-violet-400/15 text-violet-100"
                        : "border-white/12 bg-black/20 text-[#c9c7d4] hover:border-white/25 hover:bg-white/[0.06]"
                    }`}
                    key={contractName}
                    onClick={() => setSelectedContract(contractName)}
                  >
                    {contractName}
                    {(contractsData[contractName] as GenericContract)?.external && (
                      <span title="External contract">
                        <BarsArrowUpIcon className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}
          {contractNames.map(contractName => (
            <ContractUI
              key={contractName}
              contractName={contractName}
              className={contractName === selectedContract ? "" : "hidden"}
            />
          ))}
        </>
      )}
    </div>
  );
}
