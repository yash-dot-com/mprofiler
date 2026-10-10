"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "~~/components/ui/card";
import { loadStoredProfileResult } from "~~/lib/mprofiler/profileStorage";

type Call = { workloadCaseId: string; trace: { accesses: unknown[] } };
type Side = {
  summary: { callCount: number; successfulCalls: number; revertedCalls: number; totalGasUsed: string };
  calls: Call[];
  dependencyGraph: { edges: unknown[]; hotSlots: unknown[]; modeledExecutionDepth: number };
};
type Scenario = {
  scenarioId: string;
  baselineGasUsed: string;
  revisionGasUsed: string;
  gasDeltaRevisionMinusBaseline: string;
  baselineCallCount: number;
  baselineReadAccesses: number;
  baselineWriteAccesses: number;
  baselineDependencyEdges: number;
  revisionDependencyEdges: number;
};
type Report = {
  baseline: Side;
  revision?: Side | null;
  comparison?: {
    workloadIdentical: boolean;
    totalGasUsed: { baseline: string; revision: string; deltaRevisionMinusBaseline: string };
    scenarios: Scenario[];
    note: string;
  } | null;
};

const labels: Record<string, string> = {
  "independent-mapping-writes": "Independent mapping writes",
  "shared-global-counter-writes": "Shared global-counter writes",
  "same-key-writes": "Same-key writes",
  "mixed-reads-writes": "Mixed reads and writes",
  "read-heavy": "Read-heavy",
};
const formatInteger = (value: string | number | bigint) => new Intl.NumberFormat("en-US").format(BigInt(value));
function formatDelta(value: string) {
  const delta = BigInt(value);
  return `${delta < 0n ? "−" : delta > 0n ? "+" : ""}${formatInteger(delta < 0n ? -delta : delta)}`;
}
function accessCount(side: Side) {
  return side.calls.reduce((count, call) => count + call.trace.accesses.length, 0);
}
async function readReport(response: Response): Promise<Report> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not retrieve this report.");
  return body as Report;
}

export default function ComparisonDashboard() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(jobId));
  const [restoredFromBrowser, setRestoredFromBrowser] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    fetch(`/api/profile/jobs/${jobId}/report`, { cache: "no-store" })
      .then(readReport)
      .then(nextReport => {
        if (!cancelled) setReport(nextReport);
      })
      .catch(requestError => {
        const saved = loadStoredProfileResult();
        const savedJob = saved?.job as { id?: unknown } | undefined;
        if (!cancelled && savedJob?.id === jobId && saved?.report) {
          setReport(saved.report as Report);
          setRestoredFromBrowser(true);
        } else if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Could not retrieve this report.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const rows = useMemo(() => report?.comparison?.scenarios ?? [], [report]);
  const baseline = report?.baseline;
  const revision = report?.revision;
  const comparison = report?.comparison;

  return (
    <div className="mprofiler-page min-h-full bg-[#f6f8fb] text-slate-900">
      <main className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
              MProfiler · comparison
            </p>
            <h1 className="mb-0 mt-2 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
              Comparable local workload results
            </h1>
            <p className="mb-0 mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Both contracts must receive the same generated inputs from the same reset state. This view compares
              measured local values and derived graph properties only.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Run profile
            </Link>
            {jobId && (
              <Link
                href={`/insights?job=${jobId}`}
                className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                Open insights
              </Link>
            )}
          </div>
        </div>

        {!jobId && (
          <section className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Select a completed profiling job</h2>
            <p className="mb-0 mt-3 text-sm text-slate-500">
              Run a local profile with a revision artifact, then open this comparison from the report.
            </p>
          </section>
        )}
        {loading && (
          <p className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            Loading completed report…
          </p>
        )}
        {error && (
          <p role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </p>
        )}
        {restoredFromBrowser && (
          <p className="mt-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            Loaded the saved browser copy of this completed report. The worker&apos;s temporary copy is unavailable.
          </p>
        )}
        {baseline && (
          <>
            {!revision || !comparison ? (
              <p
                role="alert"
                className="mt-6 rounded-lg border border-amber-300/30 bg-amber-400/[0.08] px-4 py-3 text-sm text-amber-100"
              >
                This job has no revision report. Run the profile with a compiled revision artifact to create a valid
                comparison.
              </p>
            ) : (
              <>
                <section
                  className={`mt-6 rounded-xl border px-5 py-4 ${comparison.workloadIdentical ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
                >
                  <p
                    className={`m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] ${comparison.workloadIdentical ? "text-emerald-700" : "text-rose-700"}`}
                  >
                    Workload validity
                  </p>
                  <p className="mb-0 mt-2 text-sm leading-6 text-slate-950">
                    {comparison.workloadIdentical
                      ? "Valid comparison: baseline and revision reused the canonical generated workload from the same reset state."
                      : "Invalid comparison: the runner reported different workload inputs. Do not draw conclusions from any delta below."}
                  </p>
                </section>
                <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {[
                    {
                      label: "Total local gas",
                      before: baseline.summary.totalGasUsed,
                      after: revision.summary.totalGasUsed,
                      delta: comparison.totalGasUsed.deltaRevisionMinusBaseline,
                    },
                    {
                      label: "Successful calls",
                      before: baseline.summary.successfulCalls,
                      after: revision.summary.successfulCalls,
                    },
                    { label: "Observed accesses", before: accessCount(baseline), after: accessCount(revision) },
                    {
                      label: "Derived edges",
                      before: baseline.dependencyGraph.edges.length,
                      after: revision.dependencyGraph.edges.length,
                    },
                    {
                      label: "Hot EVM slots",
                      before: baseline.dependencyGraph.hotSlots.length,
                      after: revision.dependencyGraph.hotSlots.length,
                    },
                  ].map(item => (
                    <Card key={item.label} className="border border-slate-200 !bg-white !p-0 !text-slate-950 shadow-sm">
                      <CardContent className="!p-4">
                        <p className="m-0 text-[11px] uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                        <p className="mb-0 mt-3 font-mono text-xl font-semibold">
                          {formatInteger(item.before)} <span className="text-slate-400">→</span>{" "}
                          {formatInteger(item.after)}
                        </p>
                        {item.delta !== undefined && (
                          <p
                            className={`mb-0 mt-2 font-mono text-xs ${BigInt(item.delta) < 0n ? "text-emerald-700" : BigInt(item.delta) > 0n ? "text-rose-700" : "text-slate-500"}`}
                          >
                            {formatDelta(item.delta)} gas
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </section>
                <Card className="mt-4 border border-slate-200 !bg-white !p-0 !text-slate-950 shadow-sm">
                  <CardContent className="!p-5">
                    <p className="m-0 font-mono text-[11px] uppercase tracking-[0.15em] text-blue-700">
                      Scenario deltas
                    </p>
                    <h2 className="mb-0 mt-2 text-lg font-semibold">Same generated workload inputs</h2>
                    <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full min-w-[980px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Scenario</th>
                            <th className="px-4 py-3 text-right">Baseline gas</th>
                            <th className="px-4 py-3 text-right">Revision gas</th>
                            <th className="px-4 py-3 text-right">Gas delta</th>
                            <th className="px-4 py-3 text-right">Read accesses</th>
                            <th className="px-4 py-3 text-right">Write accesses</th>
                            <th className="px-4 py-3 text-right">Derived edges</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(row => (
                            <tr key={row.scenarioId} className="border-t border-slate-100">
                              <th className="px-4 py-3 font-medium text-slate-800">
                                {labels[row.scenarioId] ?? row.scenarioId}
                              </th>
                              <td className="px-4 py-3 text-right font-mono text-slate-600">
                                {formatInteger(row.baselineGasUsed)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-600">
                                {formatInteger(row.revisionGasUsed)}
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-mono ${BigInt(row.gasDeltaRevisionMinusBaseline) < 0n ? "text-emerald-700" : BigInt(row.gasDeltaRevisionMinusBaseline) > 0n ? "text-rose-700" : "text-slate-600"}`}
                              >
                                {formatDelta(row.gasDeltaRevisionMinusBaseline)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-600">
                                {formatInteger(row.baselineReadAccesses)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-600">
                                {formatInteger(row.baselineWriteAccesses)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-600">
                                {formatInteger(row.baselineDependencyEdges)} →{" "}
                                {formatInteger(row.revisionDependencyEdges)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mb-0 mt-4 text-xs leading-5 text-[#858497]">
                      Receipt gas and storage accesses are local measurements. Dependency edges are derived from
                      observed accesses. Neither measures Monad scheduler decisions.
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
