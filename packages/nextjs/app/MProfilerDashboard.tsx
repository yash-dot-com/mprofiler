"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AttestationCard } from "~~/components/mprofiler/AttestationCard";
import { TestnetDeploymentCard } from "~~/components/mprofiler/TestnetDeploymentCard";
import { Card, CardContent } from "~~/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "~~/components/ui/chart";

type JobStatus = "queued" | "running" | "completed" | "failed" | "expired";
type ProfileJob = { id: string; status: JobStatus; createdAt: string; updatedAt: string; error: string | null };
type TraceAccess = {
  contractAddress: string;
  operation: "read" | "write";
  opcode: string;
  slot: string;
  programCounter: number;
  depth: number;
};
type ProfileCall = {
  workloadCaseId: string;
  transactionHash: string;
  status: string;
  gasUsed: string;
  trace: { complete: boolean; accesses: TraceAccess[]; warnings: string[] };
};
type DependencyEdge = {
  scenarioId: string;
  fromTxIndex: number;
  toTxIndex: number;
  kind: string;
  sharedSlots: Array<{ contractAddress: string; slot: string }>;
};
type DependencyNode = { callIndex: number; transactionHash: string; wave: number };
type HotSlot = {
  scenarioId: string;
  contractAddress: string;
  slot: string;
  touches: number;
  callCount: number;
  dependencyEdgeCount: number;
};
type ReportSide = {
  contract: { name: string };
  workload: { batchSize: number; controlledAccountCount: number; scenarios: string[] };
  summary: { callCount: number; successfulCalls: number; revertedCalls: number; totalGasUsed: string };
  traceCoverage: "complete" | "partial";
  calls: ProfileCall[];
  dependencyGraph: {
    nodes: DependencyNode[];
    edges: DependencyEdge[];
    hotSlots: HotSlot[];
    modeledExecutionDepth: number;
    note: string;
  };
};
type ScenarioComparison = {
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
type ProfileReport = {
  baseline: ReportSide;
  revision?: ReportSide | null;
  comparison?: {
    workloadIdentical: boolean;
    totalGasUsed: { baseline: string; revision: string; deltaRevisionMinusBaseline: string };
    scenarios: ScenarioComparison[];
    note: string;
  } | null;
};

const insightSourceStorageKey = "mprofiler.insights.source";

const scenarioLabels: Record<string, string> = {
  "independent-mapping-writes": "Independent mapping writes",
  "shared-global-counter-writes": "Shared global-counter writes",
  "same-key-writes": "Same-key writes",
  "mixed-reads-writes": "Mixed reads and writes",
  "read-heavy": "Read-heavy",
};
const shortScenarioLabels: Record<string, string> = {
  "independent-mapping-writes": "Independent",
  "shared-global-counter-writes": "Global counter",
  "same-key-writes": "Same key",
  "mixed-reads-writes": "Mixed R/W",
  "read-heavy": "Read-heavy",
};
const gasChartConfig = {
  baseline: { label: "Baseline", color: "#a855f7" },
  revision: { label: "Revision", color: "#38bdf8" },
} satisfies ChartConfig;
const slotChartConfig = {
  touches: { label: "Observed accesses", color: "#e879f9" },
  edges: { label: "Derived edges", color: "#60a5fa" },
} satisfies ChartConfig;
const waveChartConfig = { calls: { label: "Calls", color: "#60a5fa" } } satisfies ChartConfig;

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const scenarioName = (id: string) => scenarioLabels[id] ?? id.replaceAll("-", " ");
const shortScenarioName = (id: string) => shortScenarioLabels[id] ?? scenarioName(id);
const shortHash = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`;
const formatInteger = (value: string | number) => new Intl.NumberFormat("en-US").format(BigInt(value));
function formatDelta(value: string) {
  const delta = BigInt(value);
  const amount = new Intl.NumberFormat("en-US").format(delta < 0n ? -delta : delta);
  return delta < 0n ? `−${amount}` : delta > 0n ? `+${amount}` : "0";
}
function sumScenarioGas(side: ReportSide, scenarioId: string) {
  return side.calls
    .filter(call => call.workloadCaseId.startsWith(`${scenarioId}:`))
    .reduce((sum, call) => sum + BigInt(call.gasUsed), 0n)
    .toString();
}
async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      payload && typeof payload.error === "string" ? payload.error : `Request failed (${response.status}).`,
    );
  return payload as T;
}

function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: "violet" | "blue" | "pink" | "green" | "amber";
}) {
  const colors = {
    violet: "from-violet-500/30 via-violet-500/5 to-transparent text-violet-200",
    blue: "from-sky-500/30 via-sky-500/5 to-transparent text-sky-200",
    pink: "from-pink-500/30 via-pink-500/5 to-transparent text-pink-200",
    green: "from-emerald-500/30 via-emerald-500/5 to-transparent text-emerald-200",
    amber: "from-amber-400/30 via-amber-400/5 to-transparent text-amber-100",
  }[accent];
  const [gradient, textColor] = colors.split(" text-");
  return (
    <Card className="relative min-h-[132px] overflow-hidden border border-white/10 !bg-[#0e0e17] !p-0 !text-white shadow-[0_16px_45px_rgba(0,0,0,0.2)]">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${gradient}`} />
      <CardContent className="relative flex min-h-[132px] flex-col justify-between !p-4">
        <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[#a8a8be]">{label}</p>
        <div>
          <p className={`m-0 font-mono text-2xl font-semibold tracking-[-0.06em] sm:text-3xl text-${textColor}`}>
            {value}
          </p>
          <p className="m-0 mt-1 text-xs leading-5 text-[#9b9bad]">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const MProfilerDashboard = () => {
  const [batchSize, setBatchSize] = useState("3");
  const [accountCount, setAccountCount] = useState("2");
  const [revisionArtifact, setRevisionArtifact] = useState("ProfileWorkloadsRevision");
  const [job, setJob] = useState<ProfileJob | null>(null);
  const [report, setReport] = useState<ProfileReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [activeMatrixSlot, setActiveMatrixSlot] = useState<HotSlot | null>(null);

  const watchJob = async (initialJob: ProfileJob) => {
    let current = initialJob;
    setJob(current);
    setError(null);
    while (current.status === "queued" || current.status === "running") {
      await wait(900);
      try {
        current = await readJson<ProfileJob>(await fetch(`/api/profile/jobs/${current.id}`, { cache: "no-store" }));
        setJob(current);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not refresh job status.");
        return;
      }
    }
    if (current.status === "completed") {
      try {
        setReport(
          await readJson<ProfileReport>(await fetch(`/api/profile/jobs/${current.id}/report`, { cache: "no-store" })),
        );
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not retrieve the completed report.");
      }
    } else if (current.status === "failed") {
      setError(current.error ?? "The profiling job failed.");
    } else if (current.status === "expired") {
      setError("This job expired. Run the workload again to create a fresh report.");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setReport(null);
    setJob(null);
    setError(null);
    setCopyState("idle");
    setActiveMatrixSlot(null);
    try {
      const startedJob = await readJson<ProfileJob>(
        await fetch("/api/profile/jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "scenarios",
            batchSize: Number(batchSize),
            controlledAccountCount: Number(accountCount),
            ...(revisionArtifact.trim() ? { revisionArtifact: revisionArtifact.trim() } : {}),
          }),
        }),
      );
      await watchJob(startedJob);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start the profiling job.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReconnect = async () => {
    if (!job) return;
    setIsReconnecting(true);
    setError(null);
    try {
      await watchJob(await readJson<ProfileJob>(await fetch(`/api/profile/jobs/${job.id}`, { cache: "no-store" })));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not reconnect to the profiling job.");
    } finally {
      setIsReconnecting(false);
    }
  };

  const isActive = job?.status === "queued" || job?.status === "running";
  const baseline = report?.baseline;
  const comparison = report?.comparison;
  const comparisonByScenario = useMemo(
    () => new Map((comparison?.scenarios ?? []).map(item => [item.scenarioId, item])),
    [comparison],
  );
  const scenarioChartData = useMemo(
    () =>
      baseline?.workload.scenarios.map(scenarioId => {
        const item = comparisonByScenario.get(scenarioId);
        return {
          scenario: shortScenarioName(scenarioId),
          baseline: Number(item?.baselineGasUsed ?? sumScenarioGas(baseline, scenarioId)),
          ...(item ? { revision: Number(item.revisionGasUsed) } : {}),
        };
      }) ?? [],
    [baseline, comparisonByScenario],
  );
  const slotChartData = useMemo(
    () =>
      baseline?.dependencyGraph.hotSlots.slice(0, 6).map((slot, index) => ({
        label: `${index + 1}. ${shortHash(slot.slot)}`,
        scenario: shortScenarioName(slot.scenarioId),
        touches: slot.touches,
        edges: slot.dependencyEdgeCount,
      })) ?? [],
    [baseline],
  );
  const waveChartData = useMemo(() => {
    if (!baseline) return [];
    const counts = new Map<number, number>();
    baseline.dependencyGraph.nodes.forEach(node => counts.set(node.wave, (counts.get(node.wave) ?? 0) + 1));
    return [...counts.entries()].map(([wave, calls]) => ({ wave: `Wave ${wave + 1}`, calls }));
  }, [baseline]);
  const heatMapSlots = baseline?.dependencyGraph.hotSlots.slice(0, 10) ?? [];
  const maxTouches = Math.max(1, ...heatMapSlots.map(slot => slot.touches));
  const totalObservedAccesses = baseline?.calls.reduce((total, call) => total + call.trace.accesses.length, 0) ?? 0;
  const completeTraceCount = baseline?.calls.filter(call => call.trace.complete).length ?? 0;
  const gasDelta = comparison?.totalGasUsed.deltaRevisionMinusBaseline;
  const handoffText = baseline
    ? [
        `MProfiler local report — ${baseline.contract.name}`,
        `Workload: ${baseline.workload.scenarios.length} deterministic scenarios, batch ${baseline.workload.batchSize}, ${baseline.workload.controlledAccountCount} controlled accounts.`,
        `Local gas: ${formatInteger(baseline.summary.totalGasUsed)} across ${baseline.summary.callCount} calls.`,
        comparison
          ? `Inputs identical: ${comparison.workloadIdentical ? "yes" : "no"}. Revision gas delta: ${formatDelta(comparison.totalGasUsed.deltaRevisionMinusBaseline)}.`
          : "No revision artifact was included.",
        `Trace coverage: ${baseline.traceCoverage}; observed SLOAD/SSTORE accesses: ${totalObservedAccesses}.`,
        `Derived graph: ${baseline.dependencyGraph.edges.length} edges, depth ${baseline.dependencyGraph.modeledExecutionDepth}, ${baseline.dependencyGraph.hotSlots.length} hot EVM slots.`,
        "Scope: local EVM measurements and graph-derived properties only. No Monad scheduler decisions or throughput are measured.",
      ].join("\n")
    : "";
  const handleCopyHandoff = async () => {
    if (!handoffText) return;
    try {
      await navigator.clipboard.writeText(handoffText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  const attachSourceAndOpenInsights = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !job?.id) return;
    if (file.size > 64_000) {
      setError("Solidity source files must be 64 KB or smaller for the diagnostic pass.");
      return;
    }
    try {
      window.sessionStorage.setItem(insightSourceStorageKey, await file.text());
      window.location.assign(`/insights?job=${job.id}`);
    } catch {
      setError("Could not attach this Solidity source for analysis.");
    }
  };

  return (
    <div className="min-h-full bg-[#07070c] text-[#f6f4ff] selection:bg-violet-500/35">
      <main className="mx-auto w-full max-w-[1540px] px-4 py-6 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.19em] text-violet-300">
              MProfiler · local EVM
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-white sm:text-4xl">
              Storage workload profiler
            </h1>
            <p className="mb-0 mt-3 max-w-3xl text-sm leading-6 text-[#a7a5b6] sm:text-base">
              Deterministic scenario runs with receipt gas, observed storage accesses, and an evidence-derived
              dependency graph.
            </p>
          </div>
          <div className="flex max-w-xl items-start gap-3 rounded-lg border border-violet-400/20 bg-violet-500/[0.07] px-4 py-3 text-sm leading-5 text-violet-100">
            <span
              aria-hidden="true"
              className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-300 shadow-[0_0_14px_#c084fc]"
            />
            <span>
              Local measurements and derived graph properties only. Monad scheduler decisions are not measured.
            </span>
          </div>
        </section>

        <section
          aria-label="MProfiler workflow"
          className="mt-5 grid gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:grid-cols-4"
        >
          {[
            { step: "01", label: "Profile", detail: "Run deterministic local workloads", active: true },
            { step: "02", label: "Compare", detail: "Validate identical inputs", active: Boolean(report?.comparison) },
            { step: "03", label: "Improve", detail: "Attach source and inspect evidence", active: false },
            { step: "04", label: "Verify", detail: "Publish Testnet report hash", active: false },
          ].map(item => (
            <div
              key={item.step}
              className={`rounded-lg border px-3 py-2.5 ${item.active ? "border-violet-300/25 bg-violet-400/[0.08]" : "border-white/8 bg-black/15"}`}
            >
              <p
                className={`m-0 font-mono text-[10px] font-semibold tracking-[0.14em] ${item.active ? "text-violet-200" : "text-[#77768a]"}`}
              >
                {item.step} · {item.label}
              </p>
              <p className="mb-0 mt-1 text-xs text-[#aaa9bb]">{item.detail}</p>
            </div>
          ))}
        </section>

        <form
          onSubmit={handleSubmit}
          className="mt-5 grid gap-4 rounded-xl border border-white/10 bg-[#0e0e17] p-4 md:grid-cols-[150px_170px_minmax(220px,1fr)_auto] md:items-end"
        >
          <label className="block text-xs font-medium uppercase tracking-[0.12em] text-[#aaa9bb]">
            Batch size
            <input
              aria-label="Batch size per scenario"
              className="mt-2 block h-11 w-full rounded-md border border-white/12 bg-[#090910] px-3 font-mono text-base text-white outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/25"
              type="number"
              min={1}
              max={100}
              step={1}
              required
              value={batchSize}
              onChange={event => setBatchSize(event.target.value)}
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-[0.12em] text-[#aaa9bb]">
            Controlled accounts
            <input
              aria-label="Controlled account count"
              className="mt-2 block h-11 w-full rounded-md border border-white/12 bg-[#090910] px-3 font-mono text-base text-white outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/25"
              type="number"
              min={2}
              max={20}
              step={1}
              required
              value={accountCount}
              onChange={event => setAccountCount(event.target.value)}
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-[0.12em] text-[#aaa9bb]">
            Revision artifact <span className="normal-case tracking-normal text-[#6f6e80]">(optional)</span>
            <input
              aria-label="Revision contract artifact"
              className="mt-2 block h-11 w-full rounded-md border border-white/12 bg-[#090910] px-3 font-mono text-sm text-white outline-none transition placeholder:text-[#666577] focus:border-violet-400 focus:ring-2 focus:ring-violet-500/25"
              type="text"
              maxLength={64}
              placeholder="ProfileWorkloadsRevision"
              value={revisionArtifact}
              onChange={event => setRevisionArtifact(event.target.value)}
            />
          </label>
          <button
            className="h-11 rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(139,92,246,0.28)] transition hover:from-violet-400 hover:to-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-2 focus:ring-offset-[#0e0e17] disabled:cursor-wait disabled:opacity-60"
            type="submit"
            disabled={isSubmitting || isActive}
          >
            {isSubmitting || isActive ? "Profiling…" : "Run local profile"}
          </button>
        </form>
        <TestnetDeploymentCard />

        {(job || error) && (
          <section
            aria-live="polite"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.025] px-4 py-3"
          >
            <div className="flex items-center gap-3 text-sm">
              <span
                className={`h-2.5 w-2.5 rounded-full ${job?.status === "completed" ? "bg-emerald-400" : error ? "bg-rose-400" : "animate-pulse bg-violet-400"}`}
              />
              <span className="text-[#aaa9bb]">Status</span>
              <strong
                className={
                  job?.status === "completed" ? "text-emerald-300" : error ? "text-rose-300" : "text-violet-200"
                }
              >
                {error
                  ? "Needs attention"
                  : job?.status === "running"
                    ? "Tracing local calls"
                    : (job?.status ?? "Queued")}
              </strong>
              {job && <code className="hidden text-xs text-[#77768a] sm:inline">{job.id}</code>}
            </div>
            {error && isActive && (
              <button
                className="text-sm font-semibold text-violet-200 underline underline-offset-4 disabled:opacity-50"
                onClick={handleReconnect}
                disabled={isReconnecting}
                type="button"
              >
                {isReconnecting ? "Reconnecting…" : "Reconnect to job"}
              </button>
            )}
          </section>
        )}
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100"
          >
            {error}
          </div>
        )}
        {isActive && !error && (
          <p className="mt-4 rounded-lg border border-sky-400/20 bg-sky-400/[0.06] px-4 py-3 text-sm leading-6 text-sky-100">
            The worker runs each scenario sequentially and captures execution traces. The report will not infer
            throughput or parallel execution.
          </p>
        )}

        {!baseline && !isActive && !error && (
          <section className="mt-8 rounded-xl border border-dashed border-white/15 bg-[#0d0d15] px-5 py-12 text-center">
            <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
              Ready for evidence
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">
              Run the five deterministic workloads
            </h2>
            <p className="mx-auto mb-0 mt-3 max-w-xl text-sm leading-6 text-[#9c9bad]">
              The result view will populate with actual receipt gas, trace coverage, observed EVM slots, and dependency
              evidence from your local run.
            </p>
            <div className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-2">
              {Object.values(scenarioLabels).map(label => (
                <span
                  key={label}
                  className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-[#c6c4d2]"
                >
                  {label}
                </span>
              ))}
            </div>
          </section>
        )}

        {baseline && (
          <>
            {job?.status === "completed" && (
              <section className="mt-5 rounded-xl border border-violet-300/20 bg-violet-400/[0.06] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-200">
                      Profile complete · next steps
                    </p>
                    <p className="mb-0 mt-1 text-sm text-[#d8d6e1]">
                      Continue with this exact job&apos;s evidence. The source you attach is carried into Insights.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/compare?job=${job.id}`}
                      className="rounded-md bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400"
                    >
                      1. Compare revision
                    </Link>
                    <label className="cursor-pointer rounded-md border border-violet-300/30 px-3 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-400/[0.1]">
                      2. Upload source + analyze
                      <input
                        className="sr-only"
                        type="file"
                        accept=".sol,text/plain"
                        onChange={attachSourceAndOpenInsights}
                      />
                    </label>
                    <Link
                      href={`/insights?job=${job.id}`}
                      className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-[#d8d6e1] hover:bg-white/5"
                    >
                      Analyze fixture
                    </Link>
                  </div>
                </div>
              </section>
            )}
            <div id="attestation">
              <AttestationCard report={report} />
            </div>
            {comparison && !comparison.workloadIdentical && (
              <p
                role="alert"
                className="mt-5 rounded-lg border border-amber-300/35 bg-amber-400/[0.09] px-4 py-3 text-sm text-amber-100"
              >
                The report says the baseline and revision workloads differ. Treat the comparison as invalid.
              </p>
            )}
            <section aria-label="Measured report summary" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Local gas"
                value={formatInteger(baseline.summary.totalGasUsed)}
                detail="Receipt gas across baseline calls"
                accent="violet"
              />
              <MetricCard
                label="Calls completed"
                value={`${baseline.summary.successfulCalls}/${baseline.summary.callCount}`}
                detail={`${baseline.summary.revertedCalls} reverted`}
                accent="green"
              />
              <MetricCard
                label="Observed accesses"
                value={formatInteger(totalObservedAccesses)}
                detail="Recorded SLOAD and SSTORE steps"
                accent="blue"
              />
              <MetricCard
                label="Derived edges"
                value={formatInteger(baseline.dependencyGraph.edges.length)}
                detail={`Dependency depth ${baseline.dependencyGraph.modeledExecutionDepth}`}
                accent="pink"
              />
              <MetricCard
                label="Hot EVM slots"
                value={formatInteger(baseline.dependencyGraph.hotSlots.length)}
                detail={`${baseline.traceCoverage} trace coverage`}
                accent="amber"
              />
            </section>

            <section className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_0.95fr]">
              <Card className="border border-white/10 !bg-[#0e0e17] !p-0 !text-white">
                <CardContent className="!p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-300">
                        Local gas by scenario
                      </p>
                      <h2 className="mb-0 mt-2 text-lg font-semibold text-white">Baseline versus revision</h2>
                    </div>
                    <p className="m-0 text-xs leading-5 text-[#8e8da0]">
                      Identical generated inputs:{" "}
                      {comparison?.workloadIdentical ? "yes" : comparison ? "no" : "not compared"}
                    </p>
                  </div>
                  <ChartContainer config={gasChartConfig} className="mt-5 min-h-[280px] w-full !aspect-auto">
                    <BarChart
                      accessibilityLayer
                      data={scenarioChartData}
                      margin={{ top: 8, right: 4, left: -18, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.09)" />
                      <XAxis
                        dataKey="scenario"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        tick={{ fill: "#9998aa", fontSize: 11 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#9998aa", fontSize: 11 }}
                        tickFormatter={value =>
                          new Intl.NumberFormat("en-US", { notation: "compact" }).format(Number(value))
                        }
                      />
                      <ChartTooltip
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                        content={<ChartTooltipContent className="border-white/15 !bg-[#12121d] !text-white" />}
                      />
                      <ChartLegend content={<ChartLegendContent className="text-[#c4c2d0]" />} />
                      <Bar dataKey="baseline" fill="var(--color-baseline)" radius={[4, 4, 0, 0]} />
                      {comparison && <Bar dataKey="revision" fill="var(--color-revision)" radius={[4, 4, 0, 0]} />}
                    </BarChart>
                  </ChartContainer>
                  <p className="mb-0 mt-3 text-xs leading-5 text-[#858497]">
                    Measured from local transaction receipts. A gas delta does not establish functional equivalence or
                    an optimization claim by itself.
                  </p>
                </CardContent>
              </Card>
              <Card className="border border-white/10 !bg-[#0e0e17] !p-0 !text-white">
                <CardContent className="!p-5">
                  <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-300">
                    Dependency model
                  </p>
                  <h2 className="mb-0 mt-2 text-lg font-semibold text-white">Observed graph waves</h2>
                  <ChartContainer config={waveChartConfig} className="mt-4 min-h-[190px] w-full !aspect-auto">
                    <BarChart
                      accessibilityLayer
                      data={waveChartData}
                      margin={{ top: 8, right: 4, left: -18, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.09)" />
                      <XAxis
                        dataKey="wave"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        tick={{ fill: "#9998aa", fontSize: 11 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#9998aa", fontSize: 11 }}
                      />
                      <ChartTooltip
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                        content={<ChartTooltipContent className="border-white/15 !bg-[#12121d] !text-white" />}
                      />
                      <Bar dataKey="calls" fill="var(--color-calls)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
                    <div>
                      <dt className="text-[#88879a]">Edges</dt>
                      <dd className="mt-1 font-mono text-white">
                        {formatInteger(baseline.dependencyGraph.edges.length)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#88879a]">Model depth</dt>
                      <dd className="mt-1 font-mono text-white">{baseline.dependencyGraph.modeledExecutionDepth}</dd>
                    </div>
                  </dl>
                  <p className="mb-0 mt-4 text-xs leading-5 text-[#858497]">
                    Waves are computed from observed storage dependencies in this sequential local run.
                  </p>
                </CardContent>
              </Card>
            </section>

            <section className="mt-4 grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
              <Card className="border border-white/10 !bg-[#0e0e17] !p-0 !text-white">
                <CardContent className="!p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-pink-300">
                        Observed EVM slots
                      </p>
                      <h2 className="mb-0 mt-2 text-lg font-semibold text-white">Hot-slot access evidence</h2>
                    </div>
                    <span className="rounded-full border border-pink-400/20 bg-pink-400/[0.07] px-2.5 py-1 text-xs text-pink-100">
                      Trace backed
                    </span>
                  </div>
                  {slotChartData.length > 0 ? (
                    <ChartContainer config={slotChartConfig} className="mt-5 min-h-[265px] w-full !aspect-auto">
                      <BarChart
                        accessibilityLayer
                        data={slotChartData}
                        layout="vertical"
                        margin={{ top: 0, right: 4, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.09)" />
                        <XAxis
                          type="number"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "#9998aa", fontSize: 11 }}
                          allowDecimals={false}
                        />
                        <YAxis
                          dataKey="label"
                          type="category"
                          width={112}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "#b8b6c5", fontSize: 10 }}
                        />
                        <ChartTooltip
                          cursor={{ fill: "rgba(255,255,255,0.05)" }}
                          content={
                            <ChartTooltipContent
                              className="border-white/15 !bg-[#12121d] !text-white"
                              labelKey="scenario"
                            />
                          }
                        />
                        <ChartLegend content={<ChartLegendContent className="text-[#c4c2d0]" />} />
                        <Bar dataKey="touches" fill="var(--color-touches)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="edges" fill="var(--color-edges)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <p className="mb-0 mt-5 rounded-md border border-white/10 bg-white/[0.025] px-3 py-4 text-sm text-[#9d9bad]">
                      No repeated slot accesses were observed for this workload.
                    </p>
                  )}
                  <p className="mb-0 mt-3 text-xs leading-5 text-[#858497]">
                    Slots are EVM storage keys from SLOAD/SSTORE traces. They are not physical Monad storage pages.
                  </p>
                </CardContent>
              </Card>
              <Card className="border border-white/10 !bg-[#0e0e17] !p-0 !text-white">
                <CardContent className="!p-5">
                  <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-200">
                    Slot intensity
                  </p>
                  <h2 className="mb-0 mt-2 text-lg font-semibold text-white">Observed access matrix</h2>
                  {heatMapSlots.length > 0 ? (
                    <div className="mt-5">
                      <div
                        className="grid grid-cols-5 gap-2 sm:grid-cols-8"
                        aria-label="Observed storage-slot intensity matrix"
                      >
                        {heatMapSlots.map((slot, index) => {
                          const intensity = Math.max(0.14, slot.touches / maxTouches);
                          const isActive =
                            activeMatrixSlot?.slot === slot.slot && activeMatrixSlot?.scenarioId === slot.scenarioId;
                          return (
                            <button
                              key={`${slot.scenarioId}-${slot.contractAddress}-${slot.slot}`}
                              type="button"
                              title={`${shortScenarioName(slot.scenarioId)} · ${slot.touches} observed accesses · ${slot.callCount} calls touching this slot`}
                              aria-label={`Storage slot ${index + 1}: ${shortScenarioName(slot.scenarioId)}, ${slot.touches} observed accesses, ${slot.callCount} calls, ${slot.dependencyEdgeCount} derived edges`}
                              onMouseEnter={() => setActiveMatrixSlot(slot)}
                              onFocus={() => setActiveMatrixSlot(slot)}
                              onClick={() => setActiveMatrixSlot(slot)}
                              className={`aspect-square rounded-md border transition duration-150 focus:outline-none focus:ring-2 focus:ring-amber-200/80 ${isActive ? "border-amber-100 scale-[1.06]" : "border-white/10 hover:border-amber-200/70 hover:scale-[1.04]"}`}
                              style={{
                                backgroundColor: `hsla(${278 - intensity * 228}, 88%, ${20 + intensity * 40}%, ${0.35 + intensity * 0.6})`,
                                boxShadow: intensity > 0.75 ? "0 0 18px rgba(251, 191, 36, 0.28)" : undefined,
                              }}
                            >
                              <span className="sr-only">{shortHash(slot.slot)}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-[#8d8b9c]">
                        <span>Lower observed intensity</span>
                        <div className="h-2 w-24 rounded-full bg-gradient-to-r from-violet-700 via-fuchsia-500 to-amber-300" />
                        <span>Higher observed intensity</span>
                      </div>
                      {(() => {
                        const slot = activeMatrixSlot ?? heatMapSlots[0];
                        return (
                          <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-400/[0.06] p-3 text-xs leading-5 text-[#ddd9c9]">
                            <p className="m-0 font-mono font-semibold text-amber-100">
                              {shortHash(slot.slot)} · {shortScenarioName(slot.scenarioId)}
                            </p>
                            <p className="mb-0 mt-1">
                              {slot.touches} observed SLOAD/SSTORE accesses across {slot.callCount} calls;{" "}
                              {slot.dependencyEdgeCount} derived dependency edges. Full EVM slot:{" "}
                              <code className="break-all text-[#faf7e9]">{slot.slot}</code>
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className="mb-0 mt-5 rounded-md border border-white/10 bg-white/[0.025] px-3 py-4 text-sm text-[#9d9bad]">
                      No repeated slots were found in the trace evidence.
                    </p>
                  )}
                  <p className="mb-0 mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-[#858497]">
                    Each block is one observed hot EVM storage slot. Color is relative only to observed touches in this
                    report; hover, focus, or tap a block for its evidence.
                  </p>
                </CardContent>
              </Card>
            </section>

            <section className="mt-4 grid gap-4 xl:grid-cols-[1.16fr_0.84fr]">
              <Card className="border border-white/10 !bg-[#0e0e17] !p-0 !text-white">
                <CardContent className="!p-5">
                  <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-300">
                    Comparison ledger
                  </p>
                  <h2 className="mb-0 mt-2 text-lg font-semibold text-white">Scenario measurements</h2>
                  <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                      <thead className="bg-white/[0.045] text-xs uppercase tracking-[0.11em] text-[#aaa9bb]">
                        <tr>
                          <th className="px-4 py-3 font-medium">Scenario</th>
                          <th className="px-4 py-3 text-right font-medium">Calls</th>
                          <th className="px-4 py-3 text-right font-medium">Baseline gas</th>
                          {comparison && <th className="px-4 py-3 text-right font-medium">Revision gas</th>}
                          {comparison && <th className="px-4 py-3 text-right font-medium">Gas Δ</th>}
                          <th className="px-4 py-3 text-right font-medium">Edges</th>
                        </tr>
                      </thead>
                      <tbody>
                        {baseline.workload.scenarios.map(scenarioId => {
                          const row = comparisonByScenario.get(scenarioId);
                          const edges = baseline.dependencyGraph.edges.filter(
                            edge => edge.scenarioId === scenarioId,
                          ).length;
                          return (
                            <tr key={scenarioId} className="border-t border-white/8">
                              <th scope="row" className="px-4 py-3 font-medium text-[#e2e0e9]">
                                {scenarioName(scenarioId)}
                              </th>
                              <td className="px-4 py-3 text-right font-mono tabular-nums text-[#c5c3cf]">
                                {formatInteger(
                                  row?.baselineCallCount ??
                                    baseline.calls.filter(call => call.workloadCaseId.startsWith(`${scenarioId}:`))
                                      .length,
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums text-[#c5c3cf]">
                                {formatInteger(row?.baselineGasUsed ?? sumScenarioGas(baseline, scenarioId))}
                              </td>
                              {comparison && (
                                <td className="px-4 py-3 text-right font-mono tabular-nums text-[#c5c3cf]">
                                  {formatInteger(row?.revisionGasUsed ?? 0)}
                                </td>
                              )}
                              {comparison && (
                                <td
                                  className={`px-4 py-3 text-right font-mono tabular-nums ${row && BigInt(row.gasDeltaRevisionMinusBaseline) < 0n ? "text-emerald-300" : row && BigInt(row.gasDeltaRevisionMinusBaseline) > 0n ? "text-rose-300" : "text-[#c5c3cf]"}`}
                                >
                                  {row ? formatDelta(row.gasDeltaRevisionMinusBaseline) : "—"}
                                </td>
                              )}
                              <td className="px-4 py-3 text-right font-mono tabular-nums text-[#c5c3cf]">
                                {formatInteger(edges)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-white/10 !bg-[#0e0e17] !p-0 !text-white">
                <CardContent className="!p-5">
                  <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-200">
                    Evidence summary
                  </p>
                  <h2 className="mb-0 mt-2 text-lg font-semibold text-white">Review handoff</h2>
                  <div className="mt-5 space-y-3 text-sm leading-6 text-[#c2c0cd]">
                    <p className="m-0 rounded-md border border-white/10 bg-white/[0.025] px-3 py-2.5">
                      <span className="font-medium text-white">Trace coverage:</span> {baseline.traceCoverage} (
                      {completeTraceCount}/{baseline.calls.length} traces complete)
                    </p>
                    {comparison && (
                      <p className="m-0 rounded-md border border-white/10 bg-white/[0.025] px-3 py-2.5">
                        <span className="font-medium text-white">Measured gas delta:</span>{" "}
                        <span className={gasDelta && BigInt(gasDelta) < 0n ? "text-emerald-300" : "text-[#d8d6e1]"}>
                          {gasDelta ? formatDelta(gasDelta) : "—"}
                        </span>{" "}
                        across the current local input set.
                      </p>
                    )}
                    <p className="m-0 rounded-md border border-white/10 bg-white/[0.025] px-3 py-2.5">
                      <span className="font-medium text-white">Top repeated slot:</span>{" "}
                      {heatMapSlots[0]
                        ? `${shortHash(heatMapSlots[0].slot)} with ${heatMapSlots[0].touches} observed accesses`
                        : "none observed"}
                      .
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!baseline}
                    onClick={handleCopyHandoff}
                    className="mt-5 w-full rounded-md border border-violet-300/30 bg-violet-400/[0.11] px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-400/[0.18] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copyState === "copied"
                      ? "Copied review handoff"
                      : copyState === "failed"
                        ? "Clipboard unavailable"
                        : "Copy review handoff"}
                  </button>
                  <p className="mb-0 mt-3 text-xs leading-5 text-[#858497]">
                    Includes workload, recorded measurements, and the measurement boundary for an engineering review.
                  </p>
                </CardContent>
              </Card>
            </section>

            <details className="mt-4 rounded-xl border border-white/10 bg-[#0e0e17] px-5 py-4">
              <summary className="cursor-pointer text-sm font-semibold text-[#e4e2ea]">
                Inspect transaction traces ({baseline.calls.length})
              </summary>
              <div className="mt-4 divide-y divide-white/10">
                {baseline.calls.map(call => (
                  <details key={call.transactionHash} className="py-3">
                    <summary className="grid cursor-pointer gap-2 text-xs sm:grid-cols-[minmax(180px,1fr)_160px_105px_120px] sm:items-center">
                      <span className="text-sm text-[#dedce6]">{call.workloadCaseId}</span>
                      <code className="text-[#918fa1]" title={call.transactionHash}>
                        {shortHash(call.transactionHash)}
                      </code>
                      <span className="font-mono text-[#bcbac8]">{formatInteger(call.gasUsed)} gas</span>
                      <span className={call.trace.complete ? "text-emerald-300" : "text-amber-200"}>
                        {call.trace.complete ? `${call.trace.accesses.length} accesses` : "Trace incomplete"}
                      </span>
                    </summary>
                    <div className="mt-3 overflow-x-auto rounded-md border border-white/10 bg-black/20">
                      <table className="w-full min-w-[560px] text-left text-xs">
                        <thead className="text-[#8c8a9c]">
                          <tr>
                            <th className="px-3 py-2">Operation</th>
                            <th className="px-3 py-2">Slot</th>
                            <th className="px-3 py-2">Contract</th>
                          </tr>
                        </thead>
                        <tbody>
                          {call.trace.accesses.map((access, index) => (
                            <tr
                              key={`${access.slot}-${access.programCounter}-${index}`}
                              className="border-t border-white/8"
                            >
                              <td className="px-3 py-2 font-mono text-[#d4d2dc]">
                                {access.opcode} · {access.operation}
                              </td>
                              <td className="px-3 py-2 font-mono text-[#a9a7b7]" title={access.slot}>
                                {shortHash(access.slot)}
                              </td>
                              <td className="px-3 py-2 font-mono text-[#a9a7b7]" title={access.contractAddress}>
                                {shortHash(access.contractAddress)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {call.trace.warnings.length > 0 && (
                        <p className="m-0 px-3 py-2 text-amber-200">{call.trace.warnings.join(" ")}</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          </>
        )}
        <footer className="mt-8 border-t border-white/10 py-5 text-xs leading-5 text-[#77768a]">
          Local EVM measurements · graph-derived properties · Monad Testnet checks stay separate · no Monad scheduler
          decisions measured
        </footer>
      </main>
    </div>
  );
};

export default MProfilerDashboard;
