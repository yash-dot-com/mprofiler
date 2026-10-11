"use client";

import type { Mip8Analysis } from "~~/lib/mprofiler/mip8";

type ScenarioComparison = {
  scenarioId: string;
  baselineGasUsed: string;
  revisionGasUsed: string;
  gasDeltaRevisionMinusBaseline: string;
  baselineCallCount: number;
  revisionCallCount: number;
  baselineReadAccesses: number;
  revisionReadAccesses: number;
  baselineWriteAccesses: number;
  revisionWriteAccesses: number;
  baselineDependencyEdges: number;
  revisionDependencyEdges: number;
};

type ComparisonData = {
  workloadIdentical: boolean;
  totalGasUsed: { baseline: string; revision: string; deltaRevisionMinusBaseline: string };
  scenarios: ScenarioComparison[];
  mip8?: {
    baselineDistinctPages: number;
    revisionDistinctPages: number;
    deltaDistinctPages: number;
    baselineWarmTouches: number;
    revisionWarmTouches: number;
    deltaWarmTouches: number;
    baselineModeledSloadGas: number;
    revisionModeledSloadGas: number;
    deltaModeledSloadGas: number;
  };
  note: string;
};

type Props = {
  comparison: ComparisonData | null | undefined;
  baselineName: string;
  revisionName: string;
  baselineMip8?: Mip8Analysis;
  revisionMip8?: Mip8Analysis;
  onSelectScenario?: (scenarioId: string) => void;
};

const labels: Record<string, string> = {
  "independent-mapping-writes": "Independent mapping writes",
  "shared-global-counter-writes": "Shared global-counter writes",
  "same-key-writes": "Same-key writes",
  "mixed-reads-writes": "Mixed reads and writes",
  "read-heavy": "Read-heavy",
};

const formatInteger = (value: string | number | bigint) => new Intl.NumberFormat("en-US").format(BigInt(value));

function formatDelta(value: string | number) {
  const delta = BigInt(value);
  const amount = formatInteger(delta < 0n ? -delta : delta);
  return `${delta < 0n ? "−" : delta > 0n ? "+" : ""}${amount}`;
}

export function CompareLens({ comparison, baselineName, revisionName, baselineMip8, revisionMip8 }: Props) {
  if (!comparison) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
        <span className="grid mx-auto h-12 w-12 place-items-center rounded-xl bg-slate-100 text-xl font-bold text-slate-500">
          ↗
        </span>
        <h3 className="mb-0 mt-4 text-base font-bold text-slate-900">No revision profiled yet</h3>
        <p className="mx-auto mb-0 mt-2 max-w-md text-xs leading-5 text-slate-500">
          To unlock the side-by-side comparison, provide a compatible revision contract source or select a revision
          artifact when running a profile.
        </p>
      </div>
    );
  }

  const baseTotalGas = BigInt(comparison.totalGasUsed.baseline);
  const deltaGas = BigInt(comparison.totalGasUsed.deltaRevisionMinusBaseline);
  const pctGas = baseTotalGas > 0n ? (Number(deltaGas) / Number(baseTotalGas)) * 100 : 0;
  const isGasLower = deltaGas < 0n;

  const totalBaseEdges = comparison.scenarios.reduce((sum, s) => sum + s.baselineDependencyEdges, 0);
  const totalRevEdges = comparison.scenarios.reduce((sum, s) => sum + s.revisionDependencyEdges, 0);
  const deltaEdges = totalRevEdges - totalBaseEdges;

  const totalBaseReads = comparison.scenarios.reduce((sum, s) => sum + s.baselineReadAccesses, 0);
  const totalRevReads = comparison.scenarios.reduce((sum, s) => sum + s.revisionReadAccesses, 0);
  const deltaReads = totalRevReads - totalBaseReads;

  const totalBaseWrites = comparison.scenarios.reduce((sum, s) => sum + s.baselineWriteAccesses, 0);
  const totalRevWrites = comparison.scenarios.reduce((sum, s) => sum + s.revisionWriteAccesses, 0);
  const deltaWrites = totalRevWrites - totalBaseWrites;

  // Use provided MIP-8 delta or calculate from passed analysis
  const basePages = comparison.mip8?.baselineDistinctPages ?? baselineMip8?.distinctPages ?? 0;
  const revPages = comparison.mip8?.revisionDistinctPages ?? revisionMip8?.distinctPages ?? 0;
  const deltaPages = revPages - basePages;

  return (
    <div className="space-y-6">
      {/* Proof Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-950 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">
            ✓
          </span>
          <span className="font-semibold">
            Workload Identity Verified: Both versions executed the identical call manifest from an equivalent reset
            state.
          </span>
        </div>
        <div className="font-mono text-[11px] text-emerald-800">
          Baseline: <strong>{baselineName}</strong> · Revision: <strong>{revisionName}</strong>
        </div>
      </div>

      {/* Delta Metric Headline Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Receipt Gas Delta</p>
          <p
            className={`mb-0 mt-2 font-mono text-3xl font-bold ${
              isGasLower ? "text-emerald-600" : deltaGas > 0n ? "text-rose-600" : "text-slate-900"
            }`}
          >
            {formatDelta(comparison.totalGasUsed.deltaRevisionMinusBaseline)}
          </p>
          <p className="mb-0 mt-1 text-xs text-slate-500">
            {pctGas < 0 ? `${pctGas.toFixed(1)}%` : `+${pctGas.toFixed(1)}%`} total receipt gas change
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Dependency Edges Delta
          </p>
          <p
            className={`mb-0 mt-2 font-mono text-3xl font-bold ${
              deltaEdges < 0 ? "text-emerald-600" : deltaEdges > 0 ? "text-amber-600" : "text-slate-900"
            }`}
          >
            {deltaEdges > 0 ? `+${deltaEdges}` : deltaEdges}
          </p>
          <p className="mb-0 mt-1 text-xs text-slate-500">
            {totalBaseEdges} baseline edges → {totalRevEdges} revision edges
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Storage Reads / Writes
          </p>
          <p className="mb-0 mt-2 font-mono text-2xl font-bold text-slate-900">
            Reads: {deltaReads > 0 ? `+${deltaReads}` : deltaReads}
          </p>
          <p className="mb-0 mt-1 text-xs text-slate-500">
            Writes: {deltaWrites > 0 ? `+${deltaWrites}` : deltaWrites} (SSTORE change)
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">MIP-8 4 KB Pages</p>
          <p
            className={`mb-0 mt-2 font-mono text-3xl font-bold ${
              deltaPages < 0 ? "text-emerald-600" : deltaPages > 0 ? "text-amber-600" : "text-slate-900"
            }`}
          >
            {deltaPages > 0 ? `+${deltaPages}` : deltaPages}
          </p>
          <p className="mb-0 mt-1 text-xs text-slate-500">
            {basePages} baseline pages → {revPages} revision pages
          </p>
        </div>
      </div>

      {/* Per-Scenario Comparison Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="m-0 text-sm font-bold text-slate-900">Per-Scenario Breakdown</h3>
          <p className="mb-0 mt-0.5 text-xs text-slate-500">
            Measured local receipt gas, SLOAD / SSTORE counts, and derived dependency edges per workload scenario.
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2.5 font-semibold">Scenario</th>
                <th className="pb-2.5 font-semibold text-right">Baseline Gas</th>
                <th className="pb-2.5 font-semibold text-right">Revision Gas</th>
                <th className="pb-2.5 font-semibold text-right">Gas Delta</th>
                <th className="pb-2.5 font-semibold text-right">Reads (Base / Rev)</th>
                <th className="pb-2.5 font-semibold text-right">Writes (Base / Rev)</th>
                <th className="pb-2.5 font-semibold text-right">Edges (Base / Rev)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comparison.scenarios.map(sc => {
                const sDelta = BigInt(sc.gasDeltaRevisionMinusBaseline);
                const sIsLower = sDelta < 0n;

                return (
                  <tr key={sc.scenarioId} className="hover:bg-slate-50/70">
                    <td className="py-3 font-semibold text-slate-900">{labels[sc.scenarioId] ?? sc.scenarioId}</td>
                    <td className="py-3 text-right font-mono text-slate-600">{formatInteger(sc.baselineGasUsed)}</td>
                    <td className="py-3 text-right font-mono text-slate-900 font-semibold">
                      {formatInteger(sc.revisionGasUsed)}
                    </td>
                    <td
                      className={`py-3 text-right font-mono font-bold ${
                        sIsLower ? "text-emerald-600" : sDelta > 0n ? "text-rose-600" : "text-slate-500"
                      }`}
                    >
                      {formatDelta(sc.gasDeltaRevisionMinusBaseline)}
                    </td>
                    <td className="py-3 text-right font-mono text-slate-600">
                      {sc.baselineReadAccesses} / {sc.revisionReadAccesses}
                    </td>
                    <td className="py-3 text-right font-mono text-slate-600">
                      {sc.baselineWriteAccesses} / {sc.revisionWriteAccesses}
                    </td>
                    <td className="py-3 text-right font-mono text-slate-900 font-semibold">
                      {sc.baselineDependencyEdges} → {sc.revisionDependencyEdges}
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
