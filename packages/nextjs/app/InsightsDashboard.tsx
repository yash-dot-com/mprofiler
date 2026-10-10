"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "~~/components/ui/card";
import {
  type ContractInsightsReport,
  type ProfilingEvidence,
  createCodingAgentHandoff,
} from "~~/lib/mprofiler/insights";
import { loadStoredInsightDraft, loadStoredProfileResult, saveInsightDraft } from "~~/lib/mprofiler/profileStorage";

const fixtureSource = `// SPDX-License-Identifier: MIT
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
const insightSourceStorageKey = "mprofiler.insights.source";

type ReportEvidence = {
  baseline?: {
    traceCoverage?: "complete" | "partial";
    calls?: Array<{ trace?: { accesses?: unknown[] } }>;
    dependencyGraph?: { edges?: Array<{ scenarioId?: string }>; hotSlots?: unknown[] };
  };
};

function createEvidence(report: ReportEvidence | null): ProfilingEvidence {
  const baseline = report?.baseline;
  const edges = baseline?.dependencyGraph?.edges ?? [];
  return {
    traceCoverage: baseline?.traceCoverage,
    observedAccesses: baseline?.calls?.reduce((count, call) => count + (call.trace?.accesses?.length ?? 0), 0),
    dependencyEdges: edges.length,
    hotSlots: baseline?.dependencyGraph?.hotSlots?.length,
    sharedCounterEdges: edges.filter(edge => edge.scenarioId === "shared-global-counter-writes").length,
  };
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Request failed.");
  return payload as T;
}

export default function InsightsDashboard() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job");
  const [source, setSource] = useState(fixtureSource);
  const [evidence, setEvidence] = useState<ProfilingEvidence>({});
  const [reportLoaded, setReportLoaded] = useState(!jobId);
  const [reportError, setReportError] = useState<string | null>(null);
  const [report, setReport] = useState<ContractInsightsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [evidenceRestoredFromBrowser, setEvidenceRestoredFromBrowser] = useState(false);

  useEffect(() => {
    const attachedSource = window.sessionStorage.getItem(insightSourceStorageKey);
    if (attachedSource) {
      setSource(attachedSource);
      setReport(null);
      saveInsightDraft(attachedSource, null);
      window.sessionStorage.removeItem(insightSourceStorageKey);
      return;
    }
    const draft = loadStoredInsightDraft();
    if (draft) {
      setSource(draft.source);
      setReport(draft.report as ContractInsightsReport | null);
    }
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    fetch(`/api/profile/jobs/${jobId}/report`, { cache: "no-store" })
      .then(readResponse<ReportEvidence>)
      .then(profile => {
        if (!cancelled) setEvidence(createEvidence(profile));
      })
      .catch(requestError => {
        const saved = loadStoredProfileResult();
        const savedJob = saved?.job as { id?: unknown } | undefined;
        if (!cancelled && savedJob?.id === jobId && saved?.report) {
          setEvidence(createEvidence(saved.report as ReportEvidence));
          setEvidenceRestoredFromBrowser(true);
        } else if (!cancelled) {
          setReportError(requestError instanceof Error ? requestError.message : "Could not load profiling evidence.");
        }
      })
      .finally(() => {
        if (!cancelled) setReportLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    setCopyState("idle");
    try {
      const nextReport = await readResponse<ContractInsightsReport>(
        await fetch("/api/profile/insights", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source, evidence }),
        }),
      );
      setReport(nextReport);
      saveInsightDraft(source, nextReport);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not analyze this source.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handoff = useMemo(() => (report ? createCodingAgentHandoff(source, report) : ""), [report, source]);
  const copyHandoff = async () => {
    if (!handoff) return;
    try {
      await navigator.clipboard.writeText(handoff);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 64_000) {
      setError("Solidity source files must be 64 KB or smaller for this diagnostic pass.");
      return;
    }
    const nextSource = await file.text();
    setSource(nextSource);
    setReport(null);
    saveInsightDraft(nextSource, null);
  };

  return (
    <div className="mprofiler-page min-h-full bg-[#f6f8fb] text-slate-900">
      <main className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              MProfiler · contract insights
            </p>
            <h1 className="mb-0 mt-2 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
              Compiler-style performance diagnostics
            </h1>
            <p className="mb-0 mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Attach source from the completed profile or upload it here. Deterministic source checks are combined with
              available profile evidence; inferences and recommendations stay separate from observed measurements.
            </p>
          </div>
          {jobId && (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Back to profiler
              </Link>
              <Link
                href={`/compare?job=${jobId}`}
                className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                Review comparison
              </Link>
            </div>
          )}
        </div>

        {reportError && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-amber-300/30 bg-amber-400/[0.08] px-4 py-3 text-sm text-amber-100"
          >
            Profiling evidence could not be loaded: {reportError}
          </p>
        )}
        {evidenceRestoredFromBrowser && (
          <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            Profiling evidence was restored from this browser&apos;s saved completed report.
          </p>
        )}
        <section className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="border border-slate-200 !bg-white !p-0 !text-slate-950 shadow-sm">
            <CardContent className="!p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="m-0 font-mono text-[11px] uppercase tracking-[0.15em] text-blue-700">Source input</p>
                  <h2 className="mb-0 mt-2 text-lg font-semibold">Solidity contract</h2>
                </div>
                <label className="cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  Upload .sol
                  <input className="sr-only" type="file" accept=".sol,text/plain" onChange={loadFile} />
                </label>
              </div>
              <textarea
                aria-label="Solidity source"
                value={source}
                onChange={event => {
                  setSource(event.target.value);
                  setReport(null);
                  saveInsightDraft(event.target.value, null);
                }}
                spellCheck={false}
                className="mt-5 h-[560px] w-full resize-y rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 text-xs text-slate-500">
                  {source.split("\n").length} lines ·{" "}
                  {reportLoaded ? "profile evidence attached when available" : "loading profile evidence…"}
                </p>
                <button
                  type="button"
                  onClick={runAnalysis}
                  disabled={isAnalyzing || !reportLoaded}
                  className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {isAnalyzing ? "Reviewing…" : "Generate AI review"}
                </button>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 !bg-white !p-0 !text-slate-950 shadow-sm">
            <CardContent className="!p-5">
              <p className="m-0 font-mono text-[11px] uppercase tracking-[0.15em] text-emerald-700">
                Diagnostic report
              </p>
              <h2 className="mb-0 mt-2 text-lg font-semibold">Evidence and recommendations</h2>
              {!report && (
                <p className="mb-0 mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-600">
                  Generate the review to combine deterministic checks, available trace evidence, and an optional OpenAI
                  explanation. The report keeps observed evidence separate from inferences.
                </p>
              )}
              {error && (
                <p
                  role="alert"
                  className="mb-0 mt-5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-800"
                >
                  {error}
                </p>
              )}
              {report && (
                <>
                  <div className="mt-5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-xs leading-5 text-sky-800">
                    <strong>
                      Analysis mode:{" "}
                      {report.analysis === "deterministic+ai" ? "deterministic + OpenAI" : "deterministic"}.
                    </strong>{" "}
                    {report.compiler.note}
                  </div>
                  {report.ai?.status === "unavailable" && (
                    <p className="mb-0 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                      OpenAI review is unavailable: {report.ai.note}
                    </p>
                  )}
                  {report.ai?.status === "failed" && (
                    <p className="mb-0 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-800">
                      OpenAI review failed: {report.ai.note}
                    </p>
                  )}
                  {report.ai?.status === "completed" && (
                    <section className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                      <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
                        OpenAI review · {report.ai.result.model}
                      </p>
                      <p className="mb-0 mt-2 text-sm leading-6 text-emerald-950">{report.ai.result.summary}</p>
                      <div className="mt-3 space-y-3">
                        {report.ai.result.diagnostics.map(diagnostic => (
                          <article
                            key={`${diagnostic.code}-${diagnostic.location.line}`}
                            className="rounded-md border border-emerald-200 bg-white p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <code className="font-semibold text-emerald-800">{diagnostic.code}</code>
                              <span className="text-xs text-emerald-700">line {diagnostic.location.line}</span>
                            </div>
                            <p className="mb-0 mt-2 text-sm font-semibold text-slate-900">{diagnostic.title}</p>
                            <p className="mb-0 mt-2 text-xs leading-5 text-slate-700">{diagnostic.inference}</p>
                            <p className="mb-0 mt-2 text-xs leading-5 text-emerald-900">
                              <strong>Suggested action:</strong> {diagnostic.recommendation}
                            </p>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                  <div className="mt-4 space-y-3">
                    {report.diagnostics.length === 0 ? (
                      <p className="m-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                        No supported performance pattern was detected. This is not proof that the contract has no
                        performance issues.
                      </p>
                    ) : (
                      report.diagnostics.map(diagnostic => (
                        <article key={diagnostic.code} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <code className="font-semibold text-blue-700">{diagnostic.code}</code>
                            <span
                              className={
                                diagnostic.severity === "warning"
                                  ? "rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800"
                                  : "rounded-full bg-sky-400/15 px-2 py-1 text-xs text-sky-800"
                              }
                            >
                              {diagnostic.severity}
                            </span>
                          </div>
                          <h3 className="mt-3 text-base font-semibold text-slate-950">{diagnostic.title}</h3>
                          <p className="m-0 mt-2 font-mono text-xs text-slate-500">
                            line {diagnostic.location.line}, columns {diagnostic.location.column}-
                            {diagnostic.location.endColumn}
                          </p>
                          <p className="mb-0 mt-3 text-sm leading-6 text-slate-700">{diagnostic.inference}</p>
                          <p className="mb-0 mt-3 text-sm leading-6 text-emerald-800">
                            <strong>Suggested action:</strong> {diagnostic.recommendation}
                          </p>
                          {diagnostic.observedEvidence.length > 0 && (
                            <ul className="mb-0 mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">
                              {diagnostic.observedEvidence.map(item => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          )}
                        </article>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={copyHandoff}
                    className="mt-5 w-full rounded-md border border-emerald-300/30 bg-emerald-400/[0.11] px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/[0.18]"
                  >
                    {copyState === "copied"
                      ? "Copied coding-agent handoff"
                      : copyState === "failed"
                        ? "Clipboard unavailable"
                        : report.ai?.status === "completed"
                          ? "Copy AI + evidence coding-agent handoff"
                          : "Copy evidence coding-agent handoff"}
                  </button>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
