"use client";

import { useState } from "react";

type TraceAccess = {
  contractAddress: string;
  operation: "read" | "write";
  opcode: string;
  slot: string;
  programCounter: number;
  depth: number | null;
};

type ProfileCall = {
  workloadCaseId: string;
  transactionHash: string;
  status: string;
  gasUsed: string;
  trace: { complete: boolean; accesses: TraceAccess[]; warnings: string[] };
};

type Props = {
  calls: ProfileCall[];
  selectedCallIndex: number | null;
  selectedSlot: string | null;
  onSelectCall: (callIndex: number) => void;
  onSelectSlot: (slot: string) => void;
};

const shortHash = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`;
const formatInteger = (value: string | number) => new Intl.NumberFormat("en-US").format(BigInt(value));

export function ExecutionTimeline({ calls, selectedCallIndex, selectedSlot, onSelectCall, onSelectSlot }: Props) {
  const [expandedCalls, setExpandedCalls] = useState<Record<number, boolean>>({});

  const toggleExpand = (index: number) => {
    setExpandedCalls(prev => ({ ...prev, [index]: !prev[index] }));
  };

  if (!calls || calls.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
        No execution calls available in this profile run.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <h3 className="m-0 text-sm font-bold text-slate-900">Execution Timeline</h3>
          <p className="mb-0 mt-0.5 text-xs text-slate-500">
            {calls.length} sequential calls executed in local Hardhat EVM. Select any call to inspect its opcode trace
            and gas receipt.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const all: Record<number, boolean> = {};
              calls.forEach((_, i) => (all[i] = true));
              setExpandedCalls(all);
            }}
            className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setExpandedCalls({})}
            className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {calls.map((call, index) => {
          const isSelected = selectedCallIndex === index;
          const isExpanded = expandedCalls[index] || isSelected;
          const touchesSelectedSlot =
            selectedSlot && call.trace.accesses.some(a => a.slot.toLowerCase() === selectedSlot.toLowerCase());

          const readCount = call.trace.accesses.filter(a => a.operation === "read").length;
          const writeCount = call.trace.accesses.filter(a => a.operation === "write").length;

          return (
            <div
              key={call.workloadCaseId || index}
              className={`p-4 transition-colors ${
                isSelected ? "bg-blue-50/70" : touchesSelectedSlot ? "bg-amber-50/50" : "hover:bg-slate-50/60"
              }`}
            >
              {/* Call Summary Row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectCall(index)}
                    className={`grid h-8 w-8 place-items-center rounded-lg font-mono text-xs font-bold transition ${
                      isSelected
                        ? "bg-blue-700 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700 hover:bg-blue-100 hover:text-blue-700"
                    }`}
                  >
                    T{index}
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {call.workloadCaseId || `Call #${index}`}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          call.status === "success" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {call.status}
                      </span>
                      {touchesSelectedSlot && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          Touches Selected Slot
                        </span>
                      )}
                    </div>
                    <p className="mb-0 mt-0.5 font-mono text-[11px] text-slate-400">
                      Tx: {shortHash(call.transactionHash)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-slate-400">Gas: </span>
                    <span className="font-mono font-semibold text-slate-900">{formatInteger(call.gasUsed)}</span>
                  </div>

                  <div className="flex gap-1.5 text-[11px]">
                    <span className="rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                      {readCount} SLOAD
                    </span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                      {writeCount} SSTORE
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpand(index)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    {isExpanded ? "Hide Trace ▲" : "Inspect Trace ▼"}
                  </button>
                </div>
              </div>

              {/* Trace Drawer */}
              {isExpanded && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-900 p-4 text-white">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs">
                    <span className="font-semibold text-slate-300">
                      Opcode Trace Events ({call.trace.accesses.length} total storage accesses)
                    </span>
                    <span className={`text-[11px] ${call.trace.complete ? "text-emerald-400" : "text-amber-400"}`}>
                      {call.trace.complete ? "✓ Complete Trace Coverage" : "⚠ Incomplete (Nested Calls Detected)"}
                    </span>
                  </div>

                  {call.trace.warnings && call.trace.warnings.length > 0 && (
                    <div className="mt-2 rounded bg-amber-500/10 p-2 text-xs text-amber-200">
                      {call.trace.warnings.map((warning, wIdx) => (
                        <p key={wIdx} className="m-0 leading-5">
                          ⚠ {warning}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto font-mono text-[11px]">
                    {call.trace.accesses.map((access, accIdx) => {
                      const isTargetSlot = selectedSlot && access.slot.toLowerCase() === selectedSlot.toLowerCase();

                      return (
                        <div
                          key={accIdx}
                          className={`flex flex-wrap items-center justify-between rounded px-2.5 py-1.5 transition ${
                            isTargetSlot
                              ? "bg-blue-600 text-white font-bold"
                              : "bg-slate-800/80 hover:bg-slate-800 text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                access.operation === "write"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-blue-500/20 text-blue-300"
                              }`}
                            >
                              {access.opcode}
                            </span>
                            <span className="text-slate-400">PC: {access.programCounter}</span>
                            <span>Depth: {access.depth ?? 1}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span>Slot: {access.slot}</span>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                onSelectSlot(access.slot);
                              }}
                              className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-blue-500 hover:text-white"
                              title="Select slot globally"
                            >
                              Inspect Slot →
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {call.trace.accesses.length === 0 && (
                      <p className="m-0 py-2 text-center text-slate-500">
                        No storage reads or writes observed during this call execution.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
