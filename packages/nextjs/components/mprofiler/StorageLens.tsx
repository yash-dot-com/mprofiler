"use client";

import { useMemo, useState } from "react";
import { Mip8PageInspector } from "./Mip8PageInspector";
import type { Mip8Analysis } from "~~/lib/mprofiler/mip8";

type HotSlot = {
  scenarioId: string;
  contractAddress: string;
  slot: string;
  touches: number;
  callCount: number;
  dependencyEdgeCount: number;
};

type Props = {
  mip8: Mip8Analysis;
  hotSlots: HotSlot[];
  selectedSlot: string | null;
  onSelectSlot: (slot: string | null) => void;
  onSelectCall?: (callIndex: number) => void;
};

const formatInteger = (value: number | string | bigint) => new Intl.NumberFormat("en-US").format(BigInt(value));

export function StorageLens({ mip8, hotSlots, selectedSlot, onSelectSlot, onSelectCall }: Props) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredSlots = useMemo(() => {
    if (!searchTerm.trim()) return hotSlots;
    const term = searchTerm.toLowerCase();
    return hotSlots.filter(s => s.slot.toLowerCase().includes(term) || s.scenarioId.toLowerCase().includes(term));
  }, [hotSlots, searchTerm]);

  return (
    <div className="space-y-6">
      {/* MIP-8 Impact Analysis Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">MIP-8 Logical Pages</p>
          <p className="mb-0 mt-2 font-mono text-3xl font-bold text-blue-700">{mip8.distinctPages}</p>
          <p className="mb-0 mt-1 text-xs text-slate-500">
            Across {mip8.distinctSlots} unique 32-byte slots ($128$ slots / 4 KB page)
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Page Reuse Rate</p>
          <p className="mb-0 mt-2 font-mono text-3xl font-bold text-emerald-600">{mip8.pageReuseRate}%</p>
          <p className="mb-0 mt-1 text-xs text-slate-500">
            {mip8.warmPageTouches} warm reuses (100 gas) / {mip8.coldPageTouches} cold loads (8,100 gas)
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Modeled SLOAD Gas</p>
          <p className="mb-0 mt-2 font-mono text-3xl font-bold text-slate-900">{formatInteger(mip8.modeledSloadGas)}</p>
          <p className="mb-0 mt-1 text-xs text-slate-500">
            vs. {formatInteger(mip8.legacyPerSlotGas)} under legacy cold per-slot model
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            MIP-8 Locality Savings
          </p>
          <p className="mb-0 mt-2 font-mono text-3xl font-bold text-emerald-600">
            −{formatInteger(mip8.modeledSavings)}
          </p>
          <p className="mb-0 mt-1 text-xs text-slate-500">Modeled storage gas reduction from 4 KB page warming</p>
        </div>
      </div>

      {/* Protocol Explanation Alert */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs leading-6 text-blue-950">
        <strong>Monad MIP-8 (Page-ified Storage State):</strong> Groups EVM storage into 4 KB logical pages containing
        128 consecutive slots ($pageIndex = slot \gg 7, offset = slot \ \& \ 127$). The first access to a page warms the
        entire 4 KB boundary (8,100 gas), allowing subsequent accesses to slots in that page to execute at warm pricing
        (100 gas).
        <span className="block mt-1 font-semibold text-blue-800">
          Note: These figures are modeled protocol estimates, distinct from local EVM receipt gas.
        </span>
      </div>

      {/* Interactive 128-Slot Page Inspector */}
      <Mip8PageInspector
        mip8={mip8}
        selectedSlot={selectedSlot}
        onSelectSlot={onSelectSlot}
        onSelectCall={onSelectCall}
      />

      {/* Hot Storage Slots Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="m-0 text-sm font-bold text-slate-900">Observed Storage Slots</h3>
            <p className="mb-0 mt-0.5 text-xs text-slate-500">
              Ranked list of slots accessed by multiple calls, with derived dependency conflict contribution.
            </p>
          </div>
          <input
            type="text"
            placeholder="Search slot or scenario…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 font-semibold">Slot Key</th>
                <th className="pb-2 font-semibold">Page & Offset</th>
                <th className="pb-2 font-semibold text-right">Total Touches</th>
                <th className="pb-2 font-semibold text-right">Calls Touched</th>
                <th className="pb-2 font-semibold text-right">Dependency Edges</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredSlots.map(slot => {
                const isSelected = selectedSlot && slot.slot.toLowerCase() === selectedSlot.toLowerCase();

                let pageIdx = "0x0";
                let offset = 0;
                try {
                  const raw = BigInt(slot.slot);
                  pageIdx = `0x${(raw >> 7n).toString(16)}`;
                  offset = Number(raw & 127n);
                } catch {
                  // ignore
                }

                return (
                  <tr
                    key={slot.slot}
                    className={`transition ${isSelected ? "bg-blue-50/80 font-bold" : "hover:bg-slate-50"}`}
                  >
                    <td className="py-2.5 text-slate-900">{slot.slot}</td>
                    <td className="py-2.5 text-slate-600 font-sans">
                      <span className="font-mono text-blue-700 font-semibold">{pageIdx}</span> · Offset #{offset}
                    </td>
                    <td className="py-2.5 text-right font-sans font-bold text-slate-900">{slot.touches}</td>
                    <td className="py-2.5 text-right font-sans text-slate-700">{slot.callCount} calls</td>
                    <td className="py-2.5 text-right font-sans font-bold text-blue-700">
                      {slot.dependencyEdgeCount} edges
                    </td>
                    <td className="py-2.5 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => onSelectSlot(slot.slot)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        Inspect →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
