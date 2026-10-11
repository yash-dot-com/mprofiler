"use client";

import { useMemo, useState } from "react";
import {
  type ContractInsightsReport,
  type InsightDiagnostic,
  createCodingAgentHandoff,
} from "~~/lib/mprofiler/insights";

type Props = {
  source: string;
  report: ContractInsightsReport | null;
  isAnalyzing: boolean;
  onRunAnalysis: () => void;
};

export function FindingsLens({ source, report, isAnalyzing, onRunAnalysis }: Props) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const handoffPrompt = useMemo(() => {
    if (!report || !source) return "";
    return createCodingAgentHandoff(source, report);
  }, [source, report]);

  const handleCopyHandoff = async () => {
    if (!handoffPrompt) return;
    try {
      await navigator.clipboard.writeText(handoffPrompt);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("failed");
    }
  };

  const diagnostics: InsightDiagnostic[] = report?.diagnostics ?? [];

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h3 className="m-0 text-sm font-bold text-slate-900">Solidity Diagnostics & Remediation Direction</h3>
          <p className="mb-0 mt-0.5 text-xs text-slate-500">
            Evidence-bound findings separating observed trace facts from code patterns, suggested experiments, and
            validation tests.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onRunAnalysis}
            disabled={isAnalyzing}
            className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-50"
          >
            {isAnalyzing ? "Analyzing Source…" : "Run Insights Analysis"}
          </button>

          {handoffPrompt && (
            <button
              type="button"
              onClick={handleCopyHandoff}
              className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${
                copyState === "copied"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              {copyState === "copied" ? "✓ Copied to Clipboard!" : "Copy Coding-Agent Handoff ↗"}
            </button>
          )}
        </div>
      </div>

      {/* AI Review Status & Summary (if enabled) */}
      {report?.ai?.status === "completed" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              OpenAI Review · {report.ai.result.model}
            </span>
            <span className="rounded-full bg-emerald-200/70 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-900">
              Evidence-Bound AI Pass
            </span>
          </div>
          <p className="mb-0 mt-2 text-sm leading-6 text-emerald-950 font-medium">{report.ai.result.summary}</p>
        </div>
      )}

      {report?.ai?.status === "failed" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          <strong>OpenAI Review:</strong> {report.ai.note}. Deterministic findings remain fully available below.
        </div>
      )}

      {/* Diagnostics List */}
      <div className="space-y-4">
        {diagnostics.map((diag, index) => (
          <div
            key={diag.code || index}
            className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
              diag.severity === "warning" ? "border-amber-200" : "border-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${
                    diag.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {diag.code}
                </span>
                <span className="text-sm font-bold text-slate-900">{diag.title}</span>
              </div>
              <span className="font-mono text-xs text-slate-400">
                Line {diag.location.line}, Col {diag.location.column}
              </span>
            </div>

            {/* 4-Part Structure specified in context.md */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {/* 1. Observed Evidence */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs">
                <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                  1. Observed Evidence
                </span>
                <p className="mb-0 mt-1.5 leading-5 text-slate-700 font-medium">
                  {diag.observedEvidence.join(" ") || "No local trace evidence was attached."}
                </p>
              </div>

              {/* 2. Interpretation */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs">
                <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">2. Interpretation</span>
                <p className="mb-0 mt-1.5 leading-5 text-slate-700">{diag.inference}</p>
              </div>

              {/* 3. Suggested Experiment */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs">
                <span className="font-bold uppercase tracking-wider text-blue-700 text-[10px]">
                  3. Suggested Experiment
                </span>
                <p className="mb-0 mt-1.5 leading-5 text-blue-950 font-medium">{diag.recommendation}</p>
              </div>

              {/* 4. Validation */}
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5 text-xs">
                <span className="font-bold uppercase tracking-wider text-emerald-700 text-[10px]">4. Validation</span>
                <p className="mb-0 mt-1.5 leading-5 text-emerald-950 font-medium">
                  {diag.validation || "Re-profile with the identical call manifest and reset state; verify gas delta."}
                </p>
              </div>
            </div>
          </div>
        ))}

        {diagnostics.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500 shadow-sm">
            No active diagnostics emitted yet. Click <strong>Run Insights Analysis</strong> above to inspect contract
            source and trace evidence.
          </div>
        )}
      </div>

      {/* Copyable Coding-Agent Handoff Box */}
      {handoffPrompt && (
        <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-blue-400">
                Coding-Agent Prompt Template
              </span>
              <h4 className="mb-0 mt-0.5 text-sm font-bold text-white">
                Evidence-Bound Handoff for Cursor, Claude Code, or Codex
              </h4>
            </div>
            <button
              type="button"
              onClick={handleCopyHandoff}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
            >
              {copyState === "copied" ? "✓ Copied!" : "Copy Handoff"}
            </button>
          </div>

          <pre className="mt-4 max-h-72 overflow-y-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-300">
            {handoffPrompt}
          </pre>
        </div>
      )}
    </div>
  );
}
