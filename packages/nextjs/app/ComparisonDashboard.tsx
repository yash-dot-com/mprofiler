"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CompareLens } from "~~/components/mprofiler/CompareLens";
import { type Mip8Analysis, deriveClientMip8 } from "~~/lib/mprofiler/mip8";
import { loadStoredProfileResult } from "~~/lib/mprofiler/profileStorage";

type TraceAccess = { contractAddress: string; operation: "read" | "write"; slot: string };
type Call = { workloadCaseId: string; trace: { accesses: TraceAccess[] } };
type Side = {
  contract?: { name: string };
  summary: { callCount: number; successfulCalls: number; revertedCalls: number; totalGasUsed: string };
  calls: Call[];
  dependencyGraph: { edges: unknown[]; hotSlots: unknown[]; modeledExecutionDepth: number };
  mip8?: Mip8Analysis;
};
type Scenario = {
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
type Report = {
  baseline: Side;
  revision?: Side | null;
  comparison?: {
    workloadIdentical: boolean;
    totalGasUsed: { baseline: string; revision: string; deltaRevisionMinusBaseline: string };
    scenarios: Scenario[];
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
  } | null;
};

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
    if (!jobId) {
      // Attempt restoring from local storage if no job query param is provided
      const saved = loadStoredProfileResult();
      if (saved?.report) {
        setReport(saved.report as Report);
        setRestoredFromBrowser(true);
      }
      return;
    }
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

  const baseline = report?.baseline;
  const revision = report?.revision;
  const comparison = report?.comparison;

  const baselineMip8 = useMemo(() => {
    if (!baseline) return undefined;
    return baseline.mip8 ?? deriveClientMip8(baseline.calls);
  }, [baseline]);

  const revisionMip8 = useMemo(() => {
    if (!revision) return undefined;
    return revision.mip8 ?? deriveClientMip8(revision.calls);
  }, [revision]);

  return (
    <div className="mprofiler-page min-h-full bg-[#f8fafc] text-slate-900">
      <main className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
              MProfiler Workbench · Comparison Lens
            </p>
            <h1 className="mb-0 mt-2 text-3xl font-extrabold tracking-tight text-slate-950">
              Comparable Local Workload Results
            </h1>
            <p className="mb-0 mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Both contracts receive identical generated inputs from the same reset state. Compare measured receipt gas,
              trace storage accesses, conflict graph edges, and MIP-8 128-slot logical page locality.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/profile"
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              ← Back to Workbench
            </Link>
            {jobId && (
              <Link
                href={`/insights?job=${jobId}`}
                className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-800"
              >
                Open Insights & Handoff ✦
              </Link>
            )}
          </div>
        </div>

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

        {restoredFromBrowser && !loading && (
          <p className="mt-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">
            Loaded report saved in this browser.
          </p>
        )}

        {!baseline && !loading && !error && (
          <section className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center shadow-sm">
            <h2 className="text-base font-bold text-slate-950">No Completed Profile Run Found</h2>
            <p className="mb-0 mt-2 text-xs text-slate-500">
              Run a local profile with both baseline and revision contracts in the workbench first.
            </p>
            <Link
              href="/profile"
              className="mt-4 inline-block rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              Open Workbench
            </Link>
          </section>
        )}

        {baseline && (
          <div className="mt-6">
            <CompareLens
              comparison={comparison}
              baselineName={baseline.contract?.name ?? "Baseline"}
              revisionName={revision?.contract?.name ?? "Revision"}
              baselineMip8={baselineMip8}
              revisionMip8={revisionMip8}
            />
          </div>
        )}
      </main>
    </div>
  );
}
