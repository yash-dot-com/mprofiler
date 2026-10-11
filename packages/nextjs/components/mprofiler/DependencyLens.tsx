"use client";

import { useMemo, useState } from "react";

type DependencyEdge = {
  id?: string;
  scenarioId: string;
  fromTxIndex: number;
  toTxIndex: number;
  kind: string; // "write-read" | "write-write" | "mixed"
  sharedSlots: Array<{ contractAddress: string; slot: string }>;
  confidence?: string;
};

type DependencyNode = {
  callIndex: number;
  transactionHash: string;
  wave: number;
};

type HotSlot = {
  scenarioId: string;
  contractAddress: string;
  slot: string;
  touches: number;
  callCount: number;
  dependencyEdgeCount: number;
};

type Props = {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  hotSlots: HotSlot[];
  modeledExecutionDepth: number;
  selectedCallIndex: number | null;
  selectedSlot: string | null;
  onSelectCall: (callIndex: number) => void;
  onSelectSlot: (slot: string) => void;
};

const shortHash = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`;

export function DependencyLens({
  nodes,
  edges,
  hotSlots,
  modeledExecutionDepth,
  selectedCallIndex,
  selectedSlot,
  onSelectCall,
  onSelectSlot,
}: Props) {
  const [selectedEdgeIndex, setSelectedEdgeIndex] = useState<number | null>(null);

  // Filter edges if a call or slot is selected
  const filteredEdges = useMemo(() => {
    return edges.filter(edge => {
      if (selectedCallIndex !== null) {
        if (edge.fromTxIndex !== selectedCallIndex && edge.toTxIndex !== selectedCallIndex) {
          return false;
        }
      }
      if (selectedSlot !== null) {
        const lower = selectedSlot.toLowerCase();
        if (!edge.sharedSlots.some(s => s.slot.toLowerCase() === lower)) {
          return false;
        }
      }
      return true;
    });
  }, [edges, selectedCallIndex, selectedSlot]);

  // Group nodes by wave for the swimlane layout
  const wavesMap = useMemo(() => {
    const map = new Map<number, DependencyNode[]>();
    for (const node of nodes) {
      const list = map.get(node.wave) ?? [];
      list.push(node);
      map.set(node.wave, list);
    }
    return map;
  }, [nodes]);

  const waveNumbers = useMemo(() => {
    return [...wavesMap.keys()].sort((a, b) => a - b);
  }, [wavesMap]);

  // Active edge for WhyPanel
  const activeEdge = useMemo(() => {
    if (selectedEdgeIndex !== null && filteredEdges[selectedEdgeIndex]) {
      return filteredEdges[selectedEdgeIndex];
    }
    if (filteredEdges.length > 0) return filteredEdges[0];
    return null;
  }, [filteredEdges, selectedEdgeIndex]);

  // Hot slots sorted by Conflict Contribution (dependency edges)
  const sortedByConflict = useMemo(() => {
    return [...hotSlots].sort((a, b) => b.dependencyEdgeCount - a.dependencyEdgeCount || b.touches - a.touches);
  }, [hotSlots]);

  return (
    <div className="space-y-6">
      {/* Active Filter Bar if a call or slot is active */}
      {(selectedCallIndex !== null || selectedSlot !== null) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-2.5 text-xs text-blue-900 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Active Filter:</span>
            {selectedCallIndex !== null && (
              <span className="rounded-full bg-blue-700 px-2 py-0.5 font-bold text-white">
                Call T{selectedCallIndex}
              </span>
            )}
            {selectedSlot !== null && (
              <span className="rounded-full bg-slate-900 px-2 py-0.5 font-mono text-white">
                Slot {shortHash(selectedSlot)}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {selectedCallIndex !== null && (
              <button
                type="button"
                onClick={() => onSelectCall(selectedCallIndex)}
                className="underline hover:text-blue-700"
              >
                Clear call filter
              </button>
            )}
            {selectedSlot !== null && (
              <button type="button" onClick={() => onSelectSlot("")} className="underline hover:text-blue-700">
                Clear slot filter
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modeled Execution Waves (Swimlanes) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="m-0 text-sm font-bold text-slate-900">Modeled Execution Waves</h3>
            <p className="mb-0 mt-0.5 text-xs text-slate-500">
              Transactions partitioned by longest predecessor dependency depth ($wave = \max(pred) + 1$). Total depth:{" "}
              <span className="font-bold text-slate-900">{modeledExecutionDepth} waves</span>.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            DERIVED DEPENDENCY MODEL
          </span>
        </div>

        <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
          {waveNumbers.map(waveNum => {
            const waveNodes = wavesMap.get(waveNum) ?? [];

            return (
              <div key={waveNum} className="min-w-[160px] flex-1 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-xs font-bold text-slate-900">Wave {waveNum + 1}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600 shadow-xs">
                    {waveNodes.length} calls
                  </span>
                </div>

                <div className="mt-2.5 space-y-2">
                  {waveNodes.map(node => {
                    const isSelected = selectedCallIndex === node.callIndex;
                    const inEdges = edges.filter(e => e.toTxIndex === node.callIndex).length;
                    const outEdges = edges.filter(e => e.fromTxIndex === node.callIndex).length;

                    return (
                      <button
                        key={node.callIndex}
                        type="button"
                        onClick={() => onSelectCall(node.callIndex)}
                        className={`w-full rounded-lg border p-2 text-left transition ${
                          isSelected
                            ? "border-blue-600 bg-blue-600 text-white shadow-md ring-2 ring-blue-300"
                            : "border-slate-200 bg-white text-slate-900 hover:border-blue-400 hover:shadow-xs"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold">Call T{node.callIndex}</span>
                          <span className={`text-[10px] ${isSelected ? "text-blue-100" : "text-slate-400"}`}>
                            {shortHash(node.transactionHash)}
                          </span>
                        </div>
                        <div
                          className={`mt-1 flex gap-2 text-[10px] font-medium ${isSelected ? "text-blue-100" : "text-slate-500"}`}
                        >
                          <span>In: {inEdges}</span>
                          <span>Out: {outEdges}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2-Column Section: Conflict Graph / Edges list on Left, WhyPanel on Right */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left Column: Conflict Edges List */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="m-0 text-sm font-bold text-slate-900">Storage Dependency Edges</h3>
              <p className="mb-0 mt-0.5 text-xs text-slate-500">
                Directed edges where an earlier write is read or overwritten by a later call.
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
              {filteredEdges.length} edges
            </span>
          </div>

          <div className="mt-4 max-h-[460px] space-y-2 overflow-y-auto pr-1">
            {filteredEdges.map((edge, index) => {
              const isSelected = activeEdge === edge;

              let badgeColor = "bg-blue-100 text-blue-800";
              if (edge.kind === "write-write") badgeColor = "bg-emerald-100 text-emerald-800";
              if (edge.kind === "mixed") badgeColor = "bg-purple-100 text-purple-800";

              return (
                <div
                  key={edge.id || `${edge.fromTxIndex}-${edge.toTxIndex}-${index}`}
                  onClick={() => setSelectedEdgeIndex(index)}
                  className={`cursor-pointer rounded-xl border p-3 transition ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-500"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/70"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        T{edge.fromTxIndex} → T{edge.toTxIndex}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}>
                        {edge.kind}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500">
                      {edge.sharedSlots.length} shared slot{edge.sharedSlots.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {edge.sharedSlots.map((slotObj, sIdx) => (
                      <span
                        key={sIdx}
                        onClick={e => {
                          e.stopPropagation();
                          onSelectSlot(slotObj.slot);
                        }}
                        className="rounded bg-white px-2 py-0.5 font-mono text-[10px] text-slate-700 hover:bg-blue-100 hover:text-blue-800 border border-slate-200"
                      >
                        {shortHash(slotObj.slot)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}

            {filteredEdges.length === 0 && (
              <p className="m-0 py-8 text-center text-xs text-slate-400">
                No dependency edges match the active selection.
              </p>
            )}
          </div>
        </div>

        {/* Right Column: The "WhyPanel" */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="border-b border-slate-100 pb-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-blue-700">
              PEV Root-Cause Analysis
            </span>
            <h3 className="mb-0 mt-1 text-sm font-bold text-slate-900">WhyPanel: Dependency Explanation</h3>
          </div>

          {activeEdge ? (
            <div className="mt-4 flex-1 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>Predecessor (Earlier)</span>
                  <span>Successor (Later)</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onSelectCall(activeEdge.fromTxIndex)}
                    className="font-mono text-base font-bold text-blue-700 hover:underline"
                  >
                    Call T{activeEdge.fromTxIndex}
                  </button>
                  <span className="font-mono text-xs text-slate-400">────────▶</span>
                  <button
                    type="button"
                    onClick={() => onSelectCall(activeEdge.toTxIndex)}
                    className="font-mono text-base font-bold text-blue-700 hover:underline"
                  >
                    Call T{activeEdge.toTxIndex}
                  </button>
                </div>
              </div>

              <div>
                <h4 className="m-0 text-xs font-bold uppercase tracking-wide text-slate-500">Conflict Mechanism</h4>
                <p className="mb-0 mt-1.5 text-xs leading-5 text-slate-700">
                  {activeEdge.kind === "write-read" && (
                    <>
                      Call <strong>T{activeEdge.fromTxIndex}</strong> executed an <code>SSTORE</code> writing to a
                      storage slot, which Call <strong>T{activeEdge.toTxIndex}</strong> subsequently read with{" "}
                      <code>SLOAD</code>. This creates a data dependency ordering requirement.
                    </>
                  )}
                  {activeEdge.kind === "write-write" && (
                    <>
                      Both Call <strong>T{activeEdge.fromTxIndex}</strong> and Call{" "}
                      <strong>T{activeEdge.toTxIndex}</strong> executed <code>SSTORE</code> writing to the same storage
                      slot. In parallel EVM execution, these writes must be serialized to avoid state overwrite
                      conflicts.
                    </>
                  )}
                  {activeEdge.kind === "mixed" && (
                    <>
                      Calls <strong>T{activeEdge.fromTxIndex}</strong> and <strong>T{activeEdge.toTxIndex}</strong>{" "}
                      share multiple storage slots with both read and write accesses, creating bidirectional state
                      coupling.
                    </>
                  )}
                </p>
              </div>

              <div>
                <h4 className="m-0 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Conflicting Storage Slots
                </h4>
                <div className="mt-2 space-y-1.5">
                  {activeEdge.sharedSlots.map((slotObj, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2 text-xs"
                    >
                      <span className="font-mono text-[11px] text-slate-800">{slotObj.slot}</span>
                      <button
                        type="button"
                        onClick={() => onSelectSlot(slotObj.slot)}
                        className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        Inspect in Storage →
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto rounded-lg border border-slate-100 bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
                <strong>Remediation Direction:</strong> To eliminate this edge, consider partitioning the shared storage
                location (e.g., sharded counters, unique mapping keys per user) or deferring state writes.
              </div>
            </div>
          ) : (
            <div className="mt-12 text-center text-xs text-slate-400">
              Select any dependency edge on the left to inspect its root-cause explanation.
            </div>
          )}
        </div>
      </div>

      {/* Hot Slots by Conflict Contribution Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="m-0 text-sm font-bold text-slate-900">Hot Slots by Conflict Contribution</h3>
            <p className="mb-0 mt-0.5 text-xs text-slate-500">
              Ranked by the number of cross-call dependency edges they induce, prioritizing optimization targets.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
            {sortedByConflict.length} slots
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 font-semibold">Rank & Slot Key</th>
                <th className="pb-2 font-semibold text-right">Conflict Contribution (Edges)</th>
                <th className="pb-2 font-semibold text-right">Total Touches</th>
                <th className="pb-2 font-semibold text-right">Calls Touched</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedByConflict.map((slot, index) => {
                const isSelected = selectedSlot && slot.slot.toLowerCase() === selectedSlot.toLowerCase();

                return (
                  <tr
                    key={slot.slot}
                    className={`transition ${isSelected ? "bg-blue-50/80 font-semibold" : "hover:bg-slate-50"}`}
                  >
                    <td className="py-2.5 font-mono">
                      <span className="mr-2 font-bold text-slate-400">#{index + 1}</span>
                      <span className="text-slate-800">{slot.slot}</span>
                    </td>
                    <td className="py-2.5 text-right font-bold text-blue-700">{slot.dependencyEdgeCount} edges</td>
                    <td className="py-2.5 text-right text-slate-700">{slot.touches}</td>
                    <td className="py-2.5 text-right text-slate-700">{slot.callCount} calls</td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectSlot(slot.slot)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        Filter →
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
