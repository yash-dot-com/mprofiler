"use client";

import { useReducer } from "react";
import { ContractReadMethods } from "./ContractReadMethods";
import { ContractVariables } from "./ContractVariables";
import { ContractWriteMethods } from "./ContractWriteMethods";
import { Address, Balance } from "~~/components/scaffold-eth";
import { useDeployedContractInfo, useNetworkColor } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { ContractName } from "~~/utils/scaffold-eth/contract";

type ContractUIProps = {
  contractName: ContractName;
  className?: string;
};

export const ContractUI = ({ contractName, className = "" }: ContractUIProps) => {
  const [refreshDisplayVariables, triggerRefreshDisplayVariables] = useReducer(value => !value, false);
  const { targetNetwork } = useTargetNetwork();
  const { data: deployedContractData, isLoading: deployedContractLoading } = useDeployedContractInfo({ contractName });
  const networkColor = useNetworkColor();

  if (deployedContractLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0e0e17] px-5 py-10 text-center">
        <span className="loading loading-spinner loading-lg text-violet-300"></span>
        <p className="mb-0 mt-3 text-sm text-[#aaa9bb]">Loading contract metadata…</p>
      </div>
    );
  }

  if (!deployedContractData) {
    return (
      <section className="rounded-xl border border-amber-300/25 bg-amber-400/[0.07] px-5 py-5 text-amber-100">
        <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-200">
          Contract unavailable
        </p>
        <p className="mb-0 mt-2 text-sm leading-6">{`No contract named "${contractName}" is configured on ${targetNetwork.name}.`}</p>
      </section>
    );
  }

  return (
    <div
      className={`grid w-full grid-cols-1 gap-5 [&_.input]:!rounded-md [&_.input]:!border [&_.input]:!border-white/15 [&_.input]:!bg-black/30 [&_.input]:!text-[#f6f4ff] [&_.input]:placeholder:!text-[#747386] lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.7fr)] ${className}`}
    >
      <aside className="flex flex-col gap-4">
        <section className="rounded-xl border border-white/10 bg-[#0e0e17] p-5">
          <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-300">
            Selected contract
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <span className="font-mono text-lg font-semibold text-white">{contractName}</span>
            <div className="text-sm text-[#d7d5df]">
              <Address address={deployedContractData.address} onlyEnsOrAddress />
            </div>
            <div className="flex items-center gap-2 text-sm text-[#b4b2c1]">
              <span>Balance</span>
              <Balance address={deployedContractData.address} className="h-4 min-h-0 px-0 text-[#e4e2ea]" />
            </div>
            <p className="mb-0 text-sm text-[#b4b2c1]">
              Network: <span style={{ color: networkColor }}>{targetNetwork.name}</span>
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-[#0e0e17] p-5">
          <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-200">Live state</p>
          <div className="mt-4 divide-y divide-white/10">
            <ContractVariables
              refreshDisplayVariables={refreshDisplayVariables}
              deployedContractData={deployedContractData}
            />
          </div>
        </section>
      </aside>

      <div className="flex flex-col gap-4">
        <section className="rounded-xl border border-white/10 bg-[#0e0e17] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-200">
                Read methods
              </p>
              <p className="mb-0 mt-1 text-sm text-[#aaa9bb]">Query contract state without sending a transaction.</p>
            </div>
            <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2 py-1 font-mono text-[10px] text-sky-100">
              RPC
            </span>
          </div>
          <div className="mt-4 divide-y divide-white/10">
            <ContractReadMethods deployedContractData={deployedContractData} />
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-[#0e0e17] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-300">
                Write methods
              </p>
              <p className="mb-0 mt-1 text-sm text-[#aaa9bb]">A connected wallet must approve every transaction.</p>
            </div>
            <span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-2 py-1 font-mono text-[10px] text-violet-100">
              WALLET
            </span>
          </div>
          <div className="mt-4 divide-y divide-white/10">
            <ContractWriteMethods
              deployedContractData={deployedContractData}
              onChange={triggerRefreshDisplayVariables}
            />
          </div>
        </section>
      </div>
    </div>
  );
};
