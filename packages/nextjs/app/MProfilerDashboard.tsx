"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AttestationCard } from "~~/components/mprofiler/AttestationCard";
import { CompareLens } from "~~/components/mprofiler/CompareLens";
import { DependencyLens } from "~~/components/mprofiler/DependencyLens";
import { ExecutionTimeline } from "~~/components/mprofiler/ExecutionTimeline";
import { FindingsLens } from "~~/components/mprofiler/FindingsLens";
import { StorageLens } from "~~/components/mprofiler/StorageLens";
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
import { type ContractInsightsReport } from "~~/lib/mprofiler/insights";
import { type Mip8Analysis, deriveClientMip8 } from "~~/lib/mprofiler/mip8";
import {
  clearStoredProfileResult,
  loadStoredContractDraft,
  loadStoredProfileResult,
  saveContractDraft,
  saveInsightDraft,
  saveProfileResult,
} from "~~/lib/mprofiler/profileStorage";

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
  mip8?: Mip8Analysis;
};

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

type ProfileReport = {
  baseline: ReportSide;
  revision?: ReportSide | null;
  comparison?: {
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
  } | null;
};

type QuickNodeCheck = { state: "idle" | "checking" | "connected" | "wrong-network" | "failed"; detail: string };

type LensTab = "overview" | "execution" | "storage" | "dependencies" | "compare" | "findings";

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
  baseline: { label: "Baseline", color: "#2563eb" },
  revision: { label: "Revision", color: "#0f766e" },
} satisfies ChartConfig;

const waveChartConfig = { calls: { label: "Calls", color: "#2563eb" } } satisfies ChartConfig;

const defaultFixtureSource = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract ProfileWorkloads {
    mapping(uint256 => uint256) private independentValues;
    uint256 private globalCounter;
    mapping(bytes32 => uint256) private keyedValues;
    bytes32 private constant SHARED_KEY = keccak256("mprofiler-shared-key-v1");

    event ReadObserved(uint256 indexed key, uint256 value);

    function writeIndependent(uint256 key, uint256 value) external {
        independentValues[key] = value;
    }

    function writeSharedCounter(uint256 amount) external {
        globalCounter += amount;
    }

    function writeSameKey(uint256 value) external {
        keyedValues[SHARED_KEY] = value;
    }

    function mixedReadWrite(uint256 key, uint256 amount) external {
        bytes32 slot = bytes32(key);
        uint256 current = keyedValues[slot];
        keyedValues[slot] = current + amount;
        globalCounter += current;
    }

    function readHeavy(uint256 key) external returns (uint256 value) {
        value = keyedValues[bytes32(key)];
        emit ReadObserved(key, value);
    }
}`;

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const scenarioName = (id: string) => scenarioLabels[id] ?? id.replaceAll("-", " ");
const shortScenarioName = (id: string) => shortScenarioLabels[id] ?? scenarioName(id);
const shortHash = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`;
const formatInteger = (value: string | number | bigint) => new Intl.NumberFormat("en-US").format(BigInt(value));

type ManifestCallDraft = { function: string; args: unknown[]; caller: number; repeat: number; label: string };

function sampleArgument(type: string): unknown {
  const normalized = type.replace(/\s+(memory|calldata|storage|payable)\b/g, "").trim();
  if (/^(u?int)([0-9]{0,3})?$/.test(normalized)) return 0;
  if (normalized === "bool") return false;
  if (normalized === "string") return "";
  if (normalized === "address") return "0x0000000000000000000000000000000000000000";
  if (/^bytes([0-9]{1,2})?$/.test(normalized)) return "0x".padEnd(66, "0");
  if (/\[\]$/.test(normalized)) return [];
  return 0;
}

function deriveCallManifest(source: string): ManifestCallDraft[] {
  const matches = source.matchAll(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*([^\{;]*)/g);
  const candidates: ManifestCallDraft[] = [];
  for (const match of matches) {
    const [, name, rawArguments, modifiers] = match;
    if (/\b(view|pure)\b/.test(modifiers)) continue;
    const argumentTypes = rawArguments.trim()
      ? rawArguments
          .split(",")
          .map(argument => argument.trim().split(/\s+/)[0])
          .filter(Boolean)
      : [];
    candidates.push({
      function: `${name}(${argumentTypes.join(",")})`,
      args: argumentTypes.map(sampleArgument),
      caller: 0,
      repeat: 3,
      label: name,
    });
  }
  const preferred = candidates.find(call => /(?:update|write|set|increment|decrement|mutate)/i.test(call.label));
  return preferred ? [preferred] : candidates.slice(0, 1);
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
  accent: "blue" | "sky" | "teal" | "green" | "amber";
}) {
  const colors = {
    blue: "from-blue-100 via-blue-50 to-transparent text-blue-800",
    sky: "from-sky-100 via-sky-50 to-transparent text-sky-800",
    teal: "from-teal-100 via-teal-50 to-transparent text-teal-800",
    green: "from-emerald-100 via-emerald-50 to-transparent text-emerald-800",
    amber: "from-amber-100 via-amber-50 to-transparent text-amber-800",
  }[accent];
  const [gradient, textColor] = colors.split(" text-");
  return (
    <Card className="relative min-h-[120px] overflow-hidden border border-slate-200 !bg-white !p-0 !text-slate-900 shadow-sm">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${gradient}`} />
      <CardContent className="relative flex min-h-[120px] flex-col justify-between !p-4">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p>
        <div>
          <p className={`m-0 font-mono text-2xl font-semibold tracking-[-0.06em] text-${textColor}`}>{value}</p>
          <p className="m-0 mt-1 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MProfilerDashboard() {
  // Navigation & PEV Synchronization State
  const [activeLens, setActiveLens] = useState<LensTab>("overview");
  const [selectedCallIndex, setSelectedCallIndex] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  // Workload and Run State
  const [batchSize, setBatchSize] = useState("3");
  const [accountCount, setAccountCount] = useState("2");
  const [revisionArtifact, setRevisionArtifact] = useState("ProfileWorkloadsRevision");
  const [job, setJob] = useState<ProfileJob | null>(null);
  const [report, setReport] = useState<ProfileReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [browserResultRestored, setBrowserResultRestored] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  // Solidity Editor Drafts
  const [baselineSource, setBaselineSource] = useState("");
  const [revisionSource, setRevisionSource] = useState("");
  const [baselineFileName, setBaselineFileName] = useState("");
  const [revisionFileName, setRevisionFileName] = useState("");
  const [showRevision, setShowRevision] = useState(false);
  const [contractName, setContractName] = useState("");
  const [constructorArgs, setConstructorArgs] = useState("[]");
  const [callManifest, setCallManifest] = useState("[]");
  const [manifestHint, setManifestHint] = useState("Upload or paste source, then generate a starter call.");

  // Diagnostics and Insights State
  const [insightsReport, setInsightsReport] = useState<ContractInsightsReport | null>(null);
  const [isAnalyzingInsights, setIsAnalyzingInsights] = useState(false);

  // Monad Testnet QuickNode State
  const [quickNodeUrl, setQuickNodeUrl] = useState("");
  const [quickNodeCheck, setQuickNodeCheck] = useState<QuickNodeCheck>({
    state: "idle",
    detail: "Paste a Monad Testnet QuickNode URL to run a browser-only chain identity check.",
  });

  // Restore saved state from local storage
  useEffect(() => {
    const saved = loadStoredProfileResult();
    if (saved) {
      const savedJob = saved.job as Partial<ProfileJob>;
      if (typeof savedJob.id === "string" && savedJob.status === "completed") {
        setJob(saved.job as ProfileJob);
        setReport(saved.report as ProfileReport);
        setBrowserResultRestored(true);
      }
    }
    const draft = loadStoredContractDraft();
    if (draft) {
      setBaselineSource(draft.baselineSource);
      setRevisionSource(draft.revisionSource);
      setContractName(draft.contractName);
      setConstructorArgs(draft.constructorArgs);
      setCallManifest(draft.callManifest);
      setShowRevision(Boolean(draft.revisionSource));
      if (draft.baselineSource) setManifestHint("Restored your local contract draft.");
    }
    setStorageReady(true);
  }, []);

  // Persist completed run to local storage
  useEffect(() => {
    if (!storageReady || job?.status !== "completed" || !report) return;
    saveProfileResult(job, report);
  }, [job, report, storageReady]);

  // Persist code draft
  useEffect(() => {
    if (!storageReady) return;
    saveContractDraft({ baselineSource, revisionSource, contractName, constructorArgs, callManifest });
  }, [baselineSource, revisionSource, contractName, constructorArgs, callManifest, storageReady]);

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
        const completedReport = await readJson<ProfileReport>(
          await fetch(`/api/profile/jobs/${current.id}/report`, { cache: "no-store" }),
        );
        saveProfileResult(current, completedReport);
        setReport(completedReport);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not retrieve the completed report.");
      }
    } else if (current.status === "failed") {
      setError(current.error ?? "The profiling job failed.");
    } else if (current.status === "expired") {
      setError("This job expired. Run the workload again to create a fresh report.");
    }
  };

  const handleContractSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    let parsedConstructorArgs: unknown[];
    let parsedCalls: unknown[];
    try {
      parsedConstructorArgs = JSON.parse(constructorArgs) as unknown[];
      parsedCalls = JSON.parse(callManifest) as unknown[];
      if (!Array.isArray(parsedConstructorArgs) || !Array.isArray(parsedCalls) || parsedCalls.length === 0) {
        throw new Error("Constructor arguments must be an array and the call manifest needs at least one call.");
      }
    } catch (manifestError) {
      setError(manifestError instanceof Error ? manifestError.message : "The workload JSON is invalid.");
      return;
    }
    if (!baselineSource.trim()) {
      setError("Upload or paste the baseline Solidity contract first.");
      return;
    }
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(contractName.trim())) {
      setError("Enter the exact Solidity contract name to deploy.");
      return;
    }
    setIsSubmitting(true);
    setReport(null);
    setJob(null);
    setSelectedCallIndex(null);
    setSelectedSlot(null);
    setBrowserResultRestored(false);
    try {
      window.sessionStorage.setItem(insightSourceStorageKey, baselineSource);
      saveInsightDraft(baselineSource, null);
      const startedJob = await readJson<ProfileJob>(
        await fetch("/api/profile/jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "contract",
            baseline: { source: baselineSource },
            ...(revisionSource.trim() ? { revision: { source: revisionSource } } : {}),
            workload: {
              contractName: contractName.trim(),
              constructorArgs: parsedConstructorArgs,
              calls: parsedCalls,
            },
          }),
        }),
      );
      await watchJob(startedJob);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start the contract profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFixtureSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setReport(null);
    setJob(null);
    setError(null);
    setSelectedCallIndex(null);
    setSelectedSlot(null);
    setBrowserResultRestored(false);
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

  const loadContractFile = async (kind: "baseline" | "revision", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 64_000) {
      setError("Solidity source files must be 64 KB or smaller for an isolated local profile.");
      return;
    }
    const source = await file.text();
    if (kind === "baseline") {
      setBaselineSource(source);
      setBaselineFileName(file.name);
      const calls = deriveCallManifest(source);
      if (calls.length > 0) {
        setCallManifest(JSON.stringify(calls, null, 2));
        setManifestHint(`Generated starter call: ${calls[0].function}.`);
      } else {
        setCallManifest("[]");
        setManifestHint("No state-changing function detected. Add calls manually.");
      }
      if (!contractName) {
        const match = source.match(/\bcontract\s+([A-Za-z][A-Za-z0-9_]*)/);
        if (match) setContractName(match[1]);
      }
    } else {
      setRevisionSource(source);
      setRevisionFileName(file.name);
    }
  };

  const generateCallManifest = () => {
    const calls = deriveCallManifest(baselineSource);
    if (calls.length === 0) {
      setError("No state-changing Solidity function was detected in this source.");
      return;
    }
    setCallManifest(JSON.stringify(calls, null, 2));
    if (!contractName.trim()) {
      const contractMatch = baselineSource.match(/\bcontract\s+([A-Za-z][A-Za-z0-9_]*)/);
      if (contractMatch) setContractName(contractMatch[1]);
    }
    setManifestHint(`Generated starter call: ${calls[0].function}.`);
    setError(null);
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

  const clearSavedResult = () => {
    clearStoredProfileResult();
    setJob(null);
    setReport(null);
    setError(null);
    setBrowserResultRestored(false);
    setSelectedCallIndex(null);
    setSelectedSlot(null);
  };

  const checkQuickNode = async () => {
    const endpoint = quickNodeUrl.trim();
    if (!endpoint) {
      setQuickNodeCheck({ state: "failed", detail: "Paste your QuickNode Monad Testnet URL first." });
      return;
    }
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:") throw new Error("Use an HTTPS QuickNode endpoint.");
      setQuickNodeCheck({ state: "checking", detail: "Checking eth_chainId directly from this browser…" });
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      const payload = (await response.json().catch(() => ({}))) as { result?: unknown };
      if (!response.ok || typeof payload.result !== "string")
        throw new Error("The endpoint did not return an eth_chainId result.");
      if (payload.result !== "0x279f") {
        setQuickNodeCheck({
          state: "wrong-network",
          detail: `Connected, but this endpoint returned ${payload.result}. Monad Testnet should return 0x279f (10143).`,
        });
        return;
      }
      setQuickNodeCheck({ state: "connected", detail: "Monad Testnet confirmed: chain ID 10143 (0x279f)." });
    } catch (requestError) {
      setQuickNodeCheck({
        state: "failed",
        detail: requestError instanceof Error ? requestError.message : "Could not check that RPC endpoint.",
      });
    }
  };

  // Synchronized PEV Selection Handlers
  const handleSelectCall = (index: number) => {
    setSelectedCallIndex(prev => (prev === index ? null : index));
  };

  const handleSelectSlot = (slot: string | null) => {
    setSelectedSlot(prev => (prev === slot ? null : slot));
  };

  const handleClearFilters = () => {
    setSelectedCallIndex(null);
    setSelectedSlot(null);
  };

  // Run Insights Analysis
  const runInsightsAnalysis = async () => {
    const src = baselineSource.trim() || defaultFixtureSource;
    setIsAnalyzingInsights(true);
    try {
      const evidence = {
        traceCoverage: baseline?.traceCoverage,
        observedAccesses: totalObservedAccesses,
        dependencyEdges: baseline?.dependencyGraph.edges.length,
        hotSlots: baseline?.dependencyGraph.hotSlots.length,
        sharedCounterEdges: baseline?.dependencyGraph.edges.filter(e => e.scenarioId === "shared-global-counter-writes")
          .length,
      };
      const res = await fetch("/api/profile/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: src, evidence }),
      });
      const data = await res.json();
      if (res.ok) setInsightsReport(data);
    } catch (err) {
      console.error("Failed to run insights analysis:", err);
    } finally {
      setIsAnalyzingInsights(false);
    }
  };

  // Computed Analytical Data
  const isActive = job?.status === "queued" || job?.status === "running";
  const baseline = report?.baseline;
  const comparison = report?.comparison;

  const totalObservedAccesses = useMemo(() => {
    return baseline?.calls.reduce((total, call) => total + call.trace.accesses.length, 0) ?? 0;
  }, [baseline]);

  // MIP-8 Derivation
  const baselineMip8: Mip8Analysis | null = useMemo(() => {
    if (!baseline) return null;
    return baseline.mip8 ?? deriveClientMip8(baseline.calls);
  }, [baseline]);

  const revisionMip8: Mip8Analysis | null = useMemo(() => {
    if (!report?.revision) return null;
    return report.revision.mip8 ?? deriveClientMip8(report.revision.calls);
  }, [report?.revision]);

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

  const waveChartData = useMemo(() => {
    if (!baseline) return [];
    const counts = new Map<number, number>();
    baseline.dependencyGraph.nodes.forEach(node => counts.set(node.wave, (counts.get(node.wave) ?? 0) + 1));
    return [...counts.entries()].map(([wave, calls]) => ({ wave: `Wave ${wave + 1}`, calls }));
  }, [baseline]);

  const heatMapSlots = baseline?.dependencyGraph.hotSlots.slice(0, 16) ?? [];
  const maxTouches = Math.max(1, ...heatMapSlots.map(slot => slot.touches));

  return (
    <div className="mprofiler-workbench min-h-screen bg-[#f8fafc] text-slate-900 selection:bg-blue-100">
      <main className="mx-auto w-full max-w-[1480px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Top Header & Workspace Identity */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10">
                  MProfiler Workbench
                </span>
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  PEV Cross-Linking + MIP-8 Analysis
                </span>
              </div>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Monad Concurrency & Storage Profiler
              </h1>
              <p className="mb-0 mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                Inspect trace-backed storage evidence, analyze MIP-8 128-slot logical page locality, discover directed
                execution dependencies, and generate evidence-bound coding-agent handoffs.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsSetupOpen(prev => !prev)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {isSetupOpen ? "Close Workload Setup ▲" : "Workload Setup & Source ▼"}
              </button>
              {baseline && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveLens("findings");
                    if (!insightsReport) runInsightsAnalysis();
                  }}
                  className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-800"
                >
                  Generate Agent Handoff ✦
                </button>
              )}
            </div>
          </div>

          {/* Quick Active Run Status Summary */}
          {baseline && !isSetupOpen && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-700">Active Profile:</span>
                <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-900 font-semibold">
                  {baseline.contract.name}
                </code>
                <span>·</span>
                <span>{baseline.summary.callCount} calls</span>
                <span>·</span>
                <span className="font-mono">{formatInteger(baseline.summary.totalGasUsed)} gas</span>
                <span>·</span>
                <span>{baselineMip8?.distinctPages ?? 0} MIP-8 pages</span>
                <span>·</span>
                <span>{baseline.dependencyGraph.edges.length} conflict edges</span>
              </div>
              <button
                type="button"
                onClick={() => setIsSetupOpen(true)}
                className="font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-900"
              >
                Reconfigure Workload or Add Revision
              </button>
            </div>
          )}
        </section>

        {/* Collapsible Workload Setup Drawer */}
        {isSetupOpen && (
          <section className="mt-6 rounded-2xl border border-blue-200 bg-white p-6 shadow-md transition-all">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="m-0 text-base font-bold text-slate-950">Workload Configuration & Contract Deployment</h2>
                <p className="mb-0 mt-1 text-xs text-slate-500">
                  Profile custom Solidity contracts or run the built-in reference fixture workloads.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSetupOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Custom Solidity Flow */}
            <form onSubmit={handleContractSubmit} className="mt-5">
              <div className="grid gap-5 lg:grid-cols-2">
                {/* Baseline Source */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="m-0 text-xs font-bold text-slate-900">Baseline Contract (Required)</p>
                      <p className="mb-0 text-[11px] text-slate-500">The primary version you want to profile</p>
                    </div>
                    <label className="cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                      Upload .sol
                      <input
                        className="sr-only"
                        type="file"
                        accept=".sol,text/plain"
                        onChange={e => loadContractFile("baseline", e)}
                      />
                    </label>
                  </div>
                  <textarea
                    value={baselineSource}
                    onChange={e => setBaselineSource(e.target.value)}
                    placeholder="Paste a standalone Solidity contract, or upload a .sol file."
                    rows={7}
                    spellCheck={false}
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="mb-0 mt-1.5 text-[11px] text-slate-500">
                    {baselineFileName || `${baselineSource.length} characters loaded`}
                  </p>
                </div>

                {/* Revision Source */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="m-0 text-xs font-bold text-slate-900">Revision Contract (Optional)</p>
                      <p className="mb-0 text-[11px] text-slate-500">Compare against an optimized version</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!showRevision && (
                        <button
                          type="button"
                          onClick={() => setShowRevision(true)}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                          Enable revision
                        </button>
                      )}
                      {showRevision && (
                        <label className="cursor-pointer rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                          Upload .sol
                          <input
                            className="sr-only"
                            type="file"
                            accept=".sol,text/plain"
                            onChange={e => loadContractFile("revision", e)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                  {showRevision ? (
                    <>
                      <textarea
                        value={revisionSource}
                        onChange={e => setRevisionSource(e.target.value)}
                        placeholder="Paste a revised contract to execute identical calls and compare storage access."
                        rows={7}
                        spellCheck={false}
                        className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <p className="mb-0 mt-1.5 text-[11px] text-slate-500">
                        {revisionFileName || `${revisionSource.length} characters loaded`}
                      </p>
                    </>
                  ) : (
                    <div className="mt-3 flex h-[164px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center">
                      <p className="text-xs text-slate-500">No revision enabled.</p>
                      <button
                        type="button"
                        onClick={() => setShowRevision(true)}
                        className="mt-2 text-xs font-semibold text-blue-700 underline"
                      >
                        Add revision source to compare side-by-side
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Deployment Settings */}
              <div className="mt-5 grid gap-4 lg:grid-cols-[180px_0.6fr_1.4fr_auto] lg:items-end">
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                  Contract Name
                  <input
                    className="mt-1.5 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    value={contractName}
                    onChange={e => setContractName(e.target.value)}
                    placeholder="Counter"
                    required
                  />
                </label>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                  Constructor Args (JSON)
                  <input
                    className="mt-1.5 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    value={constructorArgs}
                    onChange={e => setConstructorArgs(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                  <span className="flex items-center justify-between">
                    Transaction Manifest (JSON)
                    <button
                      type="button"
                      onClick={generateCallManifest}
                      className="text-[11px] font-semibold normal-case text-blue-700 underline hover:text-blue-900"
                    >
                      Generate from source
                    </button>
                  </span>
                  <textarea
                    className="mt-1.5 block h-16 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    value={callManifest}
                    onChange={e => setCallManifest(e.target.value)}
                    placeholder='[{"function": "method(uint256)", "args": [1], "caller": 0, "repeat": 2}]'
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSubmitting || isActive}
                  className="h-10 rounded-lg bg-blue-700 px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-50"
                >
                  {isSubmitting || isActive ? "Profiling…" : showRevision ? "Profile + Compare" : "Compile + Profile"}
                </button>
              </div>
              <p className="mb-0 mt-2 text-[11px] text-slate-500">{manifestHint}</p>
            </form>

            {/* Built-in Reference Fixtures Form */}
            <details className="mt-5 border-t border-slate-100 pt-4">
              <summary className="cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-900">
                Or run built-in deterministic scenarios (Reference Fixture)
              </summary>
              <form
                onSubmit={handleFixtureSubmit}
                className="mt-3 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[140px_160px_1fr_auto] md:items-end"
              >
                <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Batch Size
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={batchSize}
                    onChange={e => setBatchSize(e.target.value)}
                    className="mt-1 block h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900"
                  />
                </label>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Controlled Accounts
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={accountCount}
                    onChange={e => setAccountCount(e.target.value)}
                    className="mt-1 block h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900"
                  />
                </label>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Revision Artifact
                  <input
                    type="text"
                    value={revisionArtifact}
                    onChange={e => setRevisionArtifact(e.target.value)}
                    className="mt-1 block h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSubmitting || isActive}
                  className="h-9 rounded-md bg-slate-800 px-4 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                >
                  {isSubmitting || isActive ? "Profiling…" : "Run Fixture"}
                </button>
              </form>
            </details>
          </section>
        )}

        {/* Global Progress & Notification Bar */}
        {(job || error) && (
          <section
            aria-live="polite"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm"
          >
            <div className="flex items-center gap-3 text-sm">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  job?.status === "completed" ? "bg-emerald-500" : error ? "bg-rose-500" : "animate-pulse bg-blue-600"
                }`}
              />
              <span className="text-slate-500">Status:</span>
              <strong
                className={job?.status === "completed" ? "text-emerald-700" : error ? "text-rose-700" : "text-blue-700"}
              >
                {error
                  ? "Execution issue"
                  : job?.status === "running"
                    ? "Tracing EVM storage accesses"
                    : (job?.status ?? "Queued")}
              </strong>
              {job && <code className="hidden font-mono text-xs text-slate-400 sm:inline">{job.id}</code>}
            </div>
            <div className="flex items-center gap-3">
              {error && isActive && (
                <button
                  onClick={handleReconnect}
                  disabled={isReconnecting}
                  className="text-xs font-semibold text-blue-700 underline"
                >
                  {isReconnecting ? "Reconnecting…" : "Reconnect to Job"}
                </button>
              )}
              {browserResultRestored && job?.status === "completed" && (
                <button
                  onClick={clearSavedResult}
                  className="text-xs font-semibold text-slate-500 underline hover:text-slate-900"
                >
                  Clear Saved Result
                </button>
              )}
            </div>
          </section>
        )}

        {/* Error Notification */}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-sm">
            {error}
          </div>
        )}

        {/* Empty State Prompt */}
        {!baseline && !isActive && !error && (
          <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">No Profile Workload Executed Yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              Configure and run a Solidity workload to explore execution traces, MIP-8 storage locality, and directed
              concurrency conflict graphs.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsSetupOpen(true)}
                className="rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-800"
              >
                Open Workload Setup
              </button>
            </div>
          </section>
        )}

        {/* Profile Workbench Main Area */}
        {baseline && (
          <div className="mt-6 space-y-6">
            {/* Synchronized PEV Filter Ribbon */}
            {(selectedCallIndex !== null || selectedSlot !== null) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-blue-900">Synchronized PEV Filter:</span>
                  {selectedCallIndex !== null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 font-medium text-blue-800">
                      Call T{selectedCallIndex}
                      <button type="button" onClick={() => setSelectedCallIndex(null)} className="hover:text-blue-950">
                        ✕
                      </button>
                    </span>
                  )}
                  {selectedSlot !== null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-800">
                      Slot {shortHash(selectedSlot)}
                      <button type="button" onClick={() => setSelectedSlot(null)} className="hover:text-amber-950">
                        ✕
                      </button>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="font-semibold text-blue-700 underline hover:text-blue-900"
                >
                  Clear all filters
                </button>
              </div>
            )}

            {/* 6 Dedicated Workbench Perspectives (Lenses) */}
            <div className="border-b border-slate-200">
              <nav className="-mb-px flex space-x-2 overflow-x-auto" aria-label="Workbench Lenses">
                {[
                  { id: "overview" as LensTab, label: "Overview", icon: "📊" },
                  {
                    id: "execution" as LensTab,
                    label: "Execution Timeline",
                    icon: "⏱",
                    badge: `${baseline.calls.length} calls`,
                  },
                  {
                    id: "storage" as LensTab,
                    label: "Storage & MIP-8",
                    icon: "💾",
                    badge: `${baselineMip8?.distinctPages ?? 0} pages`,
                  },
                  {
                    id: "dependencies" as LensTab,
                    label: "Dependencies",
                    icon: "🔀",
                    badge: `${baseline.dependencyGraph.edges.length} edges`,
                  },
                  {
                    id: "compare" as LensTab,
                    label: "Compare",
                    icon: "⚖️",
                    badge: comparison ? (comparison.workloadIdentical ? "Identical" : "Diff") : undefined,
                  },
                  {
                    id: "findings" as LensTab,
                    label: "Findings & Remediation",
                    icon: "💡",
                    badge: `${insightsReport?.diagnostics.length ?? 4} rules`,
                  },
                ].map(tab => {
                  const isActiveTab = activeLens === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveLens(tab.id);
                        if (tab.id === "findings" && !insightsReport) {
                          runInsightsAnalysis();
                        }
                      }}
                      className={`group inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
                        isActiveTab
                          ? "border-blue-600 text-blue-700"
                          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                      }`}
                    >
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                      {tab.badge && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${
                            isActiveTab ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* TAB 1: OVERVIEW LENS */}
            {activeLens === "overview" && (
              <div className="space-y-6">
                {/* 4 Headline Metrics Cards */}
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    label="Local EVM Gas"
                    value={formatInteger(baseline.summary.totalGasUsed)}
                    detail={`Across ${baseline.summary.callCount} calls (${baseline.summary.revertedCalls} reverted)`}
                    accent="blue"
                  />
                  <MetricCard
                    label="Storage Accesses"
                    value={formatInteger(totalObservedAccesses)}
                    detail={`${baseline.traceCoverage} trace coverage (${baseline.calls.filter(c => c.trace.complete).length}/${baseline.calls.length})`}
                    accent="sky"
                  />
                  <MetricCard
                    label="Conflict Graph"
                    value={`${baseline.dependencyGraph.edges.length} edges`}
                    detail={`Modeled depth ${baseline.dependencyGraph.modeledExecutionDepth} · ${baseline.dependencyGraph.hotSlots.length} hot slots`}
                    accent="teal"
                  />
                  <MetricCard
                    label="MIP-8 Locality"
                    value={`${baselineMip8?.pageReuseRate ?? 0}% reuse`}
                    detail={`${baselineMip8?.distinctPages ?? 0} distinct 4 KB pages (${baselineMip8?.warmPageTouches ?? 0} warm reuses)`}
                    accent="green"
                  />
                </section>

                {/* Key Bottlenecks Alert Banner */}
                {baseline.dependencyGraph.edges.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="text-xl">⚠️</span>
                      <div>
                        <h3 className="m-0 text-sm font-bold text-amber-950">Storage Access Bottlenecks Detected</h3>
                        <p className="mb-0 mt-1 text-xs text-amber-800">
                          Found {baseline.dependencyGraph.edges.length} storage-access conflicts across{" "}
                          {baseline.dependencyGraph.hotSlots.length} shared slots. Top bottleneck slot:{" "}
                          <code className="font-mono font-semibold">
                            {shortHash(baseline.dependencyGraph.hotSlots[0]?.slot ?? "none")}
                          </code>{" "}
                          with {baseline.dependencyGraph.hotSlots[0]?.touches ?? 0} touches.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (baseline.dependencyGraph.hotSlots[0]) {
                            setSelectedSlot(baseline.dependencyGraph.hotSlots[0].slot);
                          }
                          setActiveLens("dependencies");
                        }}
                        className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
                      >
                        Inspect in Dependencies →
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (baseline.dependencyGraph.hotSlots[0]) {
                            setSelectedSlot(baseline.dependencyGraph.hotSlots[0].slot);
                          }
                          setActiveLens("storage");
                        }}
                        className="rounded-lg border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-amber-900 shadow-sm hover:bg-amber-50"
                      >
                        Inspect MIP-8 Page →
                      </button>
                    </div>
                  </div>
                )}

                {/* Charts Grid: Gas by Scenario & Modeled Execution Waves */}
                <section className="grid gap-5 xl:grid-cols-[1.55fr_0.95fr]">
                  <Card className="border border-slate-200 !bg-white !p-0 !text-slate-900 shadow-sm">
                    <CardContent className="!p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-wider text-blue-700">
                            Scenario Gas Comparison
                          </p>
                          <h2 className="mb-0 mt-1 text-base font-bold text-slate-950">Local Gas by Scenario</h2>
                        </div>
                        <p className="m-0 text-xs text-slate-500">
                          Identical Workload:{" "}
                          {comparison?.workloadIdentical ? "Verified ✓" : comparison ? "Diff" : "Baseline Only"}
                        </p>
                      </div>

                      <ChartContainer config={gasChartConfig} className="mt-4 min-h-[260px] w-full !aspect-auto">
                        <BarChart
                          accessibilityLayer
                          data={scenarioChartData}
                          margin={{ top: 8, right: 4, left: -18, bottom: 0 }}
                        >
                          <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
                          <XAxis
                            dataKey="scenario"
                            tickLine={false}
                            tickMargin={10}
                            axisLine={false}
                            tick={{ fill: "#64748b", fontSize: 11 }}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: "#64748b", fontSize: 11 }}
                            tickFormatter={val =>
                              new Intl.NumberFormat("en-US", { notation: "compact" }).format(Number(val))
                            }
                          />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent className="border-slate-200 !bg-white !text-slate-900 shadow-sm" />
                            }
                          />
                          <ChartLegend content={<ChartLegendContent className="text-slate-600" />} />
                          <Bar dataKey="baseline" fill="var(--color-baseline)" radius={[4, 4, 0, 0]} />
                          {comparison && <Bar dataKey="revision" fill="var(--color-revision)" radius={[4, 4, 0, 0]} />}
                        </BarChart>
                      </ChartContainer>
                      <p className="mb-0 mt-3 text-xs text-slate-500">
                        Measured directly from local transaction receipts.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border border-slate-200 !bg-white !p-0 !text-slate-900 shadow-sm">
                    <CardContent className="!p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-wider text-sky-700">
                            Dependency Model
                          </p>
                          <h2 className="mb-0 mt-1 text-base font-bold text-slate-950">Modeled Wave Distribution</h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveLens("dependencies")}
                          className="text-xs font-semibold text-blue-700 underline"
                        >
                          View Swimlanes →
                        </button>
                      </div>

                      <ChartContainer config={waveChartConfig} className="mt-4 min-h-[180px] w-full !aspect-auto">
                        <BarChart
                          accessibilityLayer
                          data={waveChartData}
                          margin={{ top: 8, right: 4, left: -18, bottom: 0 }}
                        >
                          <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
                          <XAxis
                            dataKey="wave"
                            tickLine={false}
                            tickMargin={10}
                            axisLine={false}
                            tick={{ fill: "#64748b", fontSize: 11 }}
                          />
                          <YAxis
                            allowDecimals={false}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: "#64748b", fontSize: 11 }}
                          />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent className="border-slate-200 !bg-white !text-slate-900 shadow-sm" />
                            }
                          />
                          <Bar dataKey="calls" fill="var(--color-calls)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ChartContainer>

                      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
                        <div>
                          <dt className="text-slate-500">Conflict Edges</dt>
                          <dd className="mt-0.5 font-mono font-bold text-slate-900">
                            {formatInteger(baseline.dependencyGraph.edges.length)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Modeled Depth</dt>
                          <dd className="mt-0.5 font-mono font-bold text-slate-900">
                            {baseline.dependencyGraph.modeledExecutionDepth}
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                </section>

                {/* Storage Access Intensity Matrix & Quick Actions */}
                <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                  <Card className="border border-slate-200 !bg-white !p-0 !text-slate-900 shadow-sm">
                    <CardContent className="!p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                            Storage Intensity
                          </p>
                          <h2 className="mb-0 mt-1 text-base font-bold text-slate-950">Observed Storage Hot Slots</h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveLens("storage")}
                          className="text-xs font-semibold text-blue-700 underline"
                        >
                          Open MIP-8 Page Inspector →
                        </button>
                      </div>

                      {heatMapSlots.length > 0 ? (
                        <div className="mt-4">
                          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                            {heatMapSlots.map((slot, idx) => {
                              const intensity = Math.max(0.15, slot.touches / maxTouches);
                              const isSelected = selectedSlot === slot.slot;
                              return (
                                <button
                                  key={`${slot.slot}-${idx}`}
                                  type="button"
                                  onClick={() => handleSelectSlot(slot.slot)}
                                  title={`Slot: ${slot.slot}\nTouches: ${slot.touches}\nEdges: ${slot.dependencyEdgeCount}`}
                                  className={`aspect-square rounded-lg border transition duration-150 ${
                                    isSelected
                                      ? "border-amber-500 ring-2 ring-amber-400"
                                      : "border-slate-200 hover:border-amber-400"
                                  }`}
                                  style={{
                                    backgroundColor: `hsla(${278 - intensity * 228}, 88%, ${30 + intensity * 35}%, ${
                                      0.3 + intensity * 0.7
                                    })`,
                                  }}
                                />
                              );
                            })}
                          </div>
                          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                            <span>Lower touches</span>
                            <div className="h-2 w-24 rounded-full bg-gradient-to-r from-blue-700 via-sky-500 to-amber-300" />
                            <span>Higher touches</span>
                          </div>
                        </div>
                      ) : (
                        <p className="mb-0 mt-4 text-xs text-slate-500">No repeated slots observed.</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-slate-200 !bg-white !p-0 !text-slate-900 shadow-sm">
                    <CardContent className="!p-5">
                      <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                        Remediation & Handoff
                      </p>
                      <h2 className="mb-0 mt-1 text-base font-bold text-slate-950">Engineering Workflows</h2>
                      <div className="mt-4 space-y-2.5">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">1. Inspect Opcode Execution Trace</span>
                            <button
                              type="button"
                              onClick={() => setActiveLens("execution")}
                              className="text-xs font-semibold text-blue-700 underline"
                            >
                              Open Timeline →
                            </button>
                          </div>
                          <p className="mb-0 mt-1 text-[11px] text-slate-500">
                            Inspect each SLOAD/SSTORE opcode, depth, and program counter across calls.
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">
                              2. Inspect MIP-8 128-Slot Page Grid
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveLens("storage")}
                              className="text-xs font-semibold text-blue-700 underline"
                            >
                              Open Storage →
                            </button>
                          </div>
                          <p className="mb-0 mt-1 text-[11px] text-slate-500">
                            See how slots cluster into 4 KB physical pages and calculate cold vs warm gas.
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">3. Diagnostic Findings & AI Prompt</span>
                            <button
                              type="button"
                              onClick={() => setActiveLens("findings")}
                              className="text-xs font-semibold text-blue-700 underline"
                            >
                              Open Findings →
                            </button>
                          </div>
                          <p className="mb-0 mt-1 text-[11px] text-slate-500">
                            Review evidence-bound remediation experiments and copy the full prompt for your AI coder.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </div>
            )}

            {/* TAB 2: EXECUTION TIMELINE LENS */}
            {activeLens === "execution" && (
              <ExecutionTimeline
                calls={baseline.calls}
                selectedCallIndex={selectedCallIndex}
                selectedSlot={selectedSlot}
                onSelectCall={handleSelectCall}
                onSelectSlot={handleSelectSlot}
              />
            )}

            {/* TAB 3: STORAGE & MIP-8 LENS */}
            {activeLens === "storage" && baselineMip8 && (
              <StorageLens
                mip8={baselineMip8}
                hotSlots={baseline.dependencyGraph.hotSlots}
                selectedSlot={selectedSlot}
                onSelectSlot={handleSelectSlot}
                onSelectCall={idx => {
                  handleSelectCall(idx);
                  setActiveLens("execution");
                }}
              />
            )}

            {/* TAB 4: DEPENDENCIES LENS */}
            {activeLens === "dependencies" && (
              <DependencyLens
                nodes={baseline.dependencyGraph.nodes}
                edges={baseline.dependencyGraph.edges}
                hotSlots={baseline.dependencyGraph.hotSlots}
                modeledExecutionDepth={baseline.dependencyGraph.modeledExecutionDepth}
                selectedCallIndex={selectedCallIndex}
                selectedSlot={selectedSlot}
                onSelectCall={handleSelectCall}
                onSelectSlot={handleSelectSlot}
              />
            )}

            {/* TAB 5: COMPARE LENS */}
            {activeLens === "compare" && (
              <CompareLens
                comparison={report.comparison}
                baselineName={baseline.contract.name}
                revisionName={report.revision?.contract.name ?? "Revision"}
                baselineMip8={baselineMip8 ?? undefined}
                revisionMip8={revisionMip8 ?? undefined}
              />
            )}

            {/* TAB 6: FINDINGS & REMEDIATION LENS */}
            {activeLens === "findings" && (
              <FindingsLens
                source={baselineSource || defaultFixtureSource}
                report={insightsReport}
                isAnalyzing={isAnalyzingInsights}
                onRunAnalysis={runInsightsAnalysis}
              />
            )}
          </div>
        )}

        {/* Monad Testnet Lane & Attestation (Bottom Lane) */}
        <section className="mt-12 overflow-hidden rounded-2xl border border-slate-900 bg-slate-950 text-white shadow-xl">
          <div className="grid gap-6 px-6 py-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-wider text-blue-300">
                Monad Testnet Integration
              </p>
              <h2 className="mb-0 mt-2 text-xl font-bold tracking-tight text-white">Verify RPC & Bounded Deployment</h2>
              <p className="mb-0 mt-2 max-w-md text-xs leading-5 text-slate-400">
                Check that your QuickNode endpoint points at Monad Testnet (Chain ID 10143) before deploying and
                creating cryptographic attestations.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-medium">
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-slate-300">
                  Browser-only check
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-slate-300">
                  Expected Chain ID: 10143
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-slate-300">
                  Zero secrets logged
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.05] p-4">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                QuickNode Monad Testnet RPC URL
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    aria-label="QuickNode Monad Testnet RPC URL"
                    type="url"
                    value={quickNodeUrl}
                    onChange={e => setQuickNodeUrl(e.target.value)}
                    placeholder="https://…monad-testnet.quiknode.pro/…/"
                    className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 font-mono text-xs text-white outline-none placeholder:text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                  />
                  <button
                    type="button"
                    onClick={checkQuickNode}
                    disabled={quickNodeCheck.state === "checking"}
                    className="h-10 shrink-0 rounded-lg bg-white px-4 text-xs font-bold text-slate-950 transition hover:bg-blue-50 disabled:opacity-60"
                  >
                    {quickNodeCheck.state === "checking" ? "Checking…" : "Test RPC"}
                  </button>
                </div>
              </label>

              <div
                className={`mt-3 rounded-lg px-3 py-2 text-xs leading-5 ${
                  quickNodeCheck.state === "connected"
                    ? "bg-emerald-400/10 text-emerald-200"
                    : quickNodeCheck.state === "wrong-network" || quickNodeCheck.state === "failed"
                      ? "bg-rose-400/10 text-rose-200"
                      : "bg-white/[0.04] text-slate-400"
                }`}
              >
                {quickNodeCheck.detail}
              </div>
            </div>
          </div>
        </section>

        {/* Attestation & Testnet Deployment Section */}
        {baseline && (
          <section id="attestation" className="mt-6 grid gap-5 xl:grid-cols-2">
            <TestnetDeploymentCard />
            <AttestationCard report={report} />
          </section>
        )}

        {/* Footer */}
        <footer className="mt-12 border-t border-slate-200 py-6 text-center text-xs leading-5 text-slate-500">
          MProfiler Workbench · Local EVM traces · MIP-8 128-slot logical page model · Directed storage conflict graph ·
          Monad Testnet bounded validation
        </footer>
      </main>
    </div>
  );
}
