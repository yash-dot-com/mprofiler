import { DebugContracts } from "./_components/DebugContracts";
import type { NextPage } from "next";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Debug Contracts",
  description: "Debug your deployed 🏗 Scaffold-ETH 2 contracts in an easy way",
});

const Debug: NextPage = () => {
  return (
    <main className="min-h-full bg-[#07070c] text-[#f6f4ff]">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200">
              MProfiler · contract console
            </p>
            <h1 className="mb-0 mt-2 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
              Inspect and interact with contracts
            </h1>
            <p className="mb-0 mt-3 max-w-3xl text-sm leading-6 text-[#a7a5b6]">
              Read deployed state, submit wallet-signed writes, and inspect transaction receipts from one focused
              console. This page uses the currently selected wallet network.
            </p>
          </div>
          <div className="rounded-lg border border-sky-300/20 bg-sky-400/[0.06] px-4 py-3 text-sm leading-6 text-sky-100">
            <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
              Interaction boundary
            </p>
            <p className="mb-0 mt-1">
              Reads are RPC calls. Writes require your connected wallet to confirm a transaction.
            </p>
          </div>
        </section>
        <DebugContracts />
      </div>
    </main>
  );
};

export default Debug;
