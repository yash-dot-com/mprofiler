export type SourceLocation = { line: number; column: number; endColumn: number };

export type ProfilingEvidence = {
  traceCoverage?: "complete" | "partial";
  observedAccesses?: number;
  dependencyEdges?: number;
  hotSlots?: number;
  sharedCounterEdges?: number;
};

export type InsightDiagnostic = {
  code: string;
  severity: "warning" | "info";
  title: string;
  location: SourceLocation;
  observedEvidence: string[];
  inference: string;
  recommendation: string;
};

export type AIInsights = {
  model: string;
  summary: string;
  diagnostics: InsightDiagnostic[];
  handoff: {
    goal: string;
    requestedChanges: string[];
    tradeoffs: string[];
    verification: string[];
  };
};

export type ContractInsightsReport = {
  analysis: "deterministic" | "deterministic+ai";
  sourceLines: number;
  compiler: { status: "not-run"; note: string };
  evidence: ProfilingEvidence;
  diagnostics: InsightDiagnostic[];
  ai?: { status: "completed"; result: AIInsights } | { status: "unavailable" | "failed"; note: string };
};

function locationAt(source: string, index: number, width: number): SourceLocation {
  const before = source.slice(0, index);
  const line = before.split("\n").length;
  const lastLineStart = before.lastIndexOf("\n") + 1;
  const column = index - lastLineStart + 1;
  return { line, column, endColumn: column + Math.max(width, 1) };
}

function firstLocation(source: string, expression: RegExp): SourceLocation | null {
  const match = expression.exec(source);
  return match?.index === undefined ? null : locationAt(source, match.index, match[0].length);
}

function scenarioEvidence(evidence: ProfilingEvidence) {
  const observed: string[] = [];
  if (evidence.observedAccesses !== undefined)
    observed.push(`${evidence.observedAccesses} observed SLOAD/SSTORE accesses in the local report.`);
  if (evidence.sharedCounterEdges !== undefined)
    observed.push(`${evidence.sharedCounterEdges} derived dependency edges in the shared global-counter scenario.`);
  if (evidence.traceCoverage) observed.push(`Trace coverage is ${evidence.traceCoverage}.`);
  return observed;
}

export function analyzeSolidity(source: string, evidence: ProfilingEvidence = {}): ContractInsightsReport {
  const diagnostics: InsightDiagnostic[] = [];
  const sharedCounter = [
    ...source.matchAll(
      /\b(?:u?int(?:8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?|uint|int)\s+(?:public\s+|private\s+|internal\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:;|=)/g,
    ),
  ].find(match => /counter/i.test(match[1]));
  if (sharedCounter?.index !== undefined) {
    const variable = sharedCounter[1];
    const writes = [...source.matchAll(new RegExp(`\\b${variable}\\s*(?:\\+=|=|\\+\\+|--)`, "g"))];
    if (writes.length > 0) {
      diagnostics.push({
        code: "MPF-PERF-001",
        severity: "warning",
        title: "Shared counter may concentrate storage writes",
        location: locationAt(source, sharedCounter.index, sharedCounter[0].length),
        observedEvidence: scenarioEvidence(evidence),
        inference: `Source inspection found ${variable} and ${writes.length} write expression${writes.length === 1 ? "" : "s"}. Shared state can create overlapping storage access across calls.`,
        recommendation:
          "Check whether one global counter is required. Consider partitioned counters only when they preserve access control, accounting, and all required invariants.",
      });
    }
  }

  const mapping = /mapping\s*\([^)]*\)\s+(?:public\s+|private\s+|internal\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*;/.exec(
    source,
  );
  if (mapping?.index !== undefined) {
    const variable = mapping[1];
    const usages = [...source.matchAll(new RegExp(`\\b${variable}\\s*\\[`, "g"))];
    if (usages.length >= 2) {
      diagnostics.push({
        code: "MPF-PERF-002",
        severity: "info",
        title: "Mapping has repeated access sites",
        location: locationAt(source, mapping.index, mapping[0].length),
        observedEvidence:
          evidence.hotSlots !== undefined
            ? [`${evidence.hotSlots} repeated EVM storage slots were derived from the local trace.`]
            : [],
        inference: `Source inspection found ${usages.length} indexed access sites for ${variable}. Repeated reads and writes to the same key can increase storage work for a workload.`,
        recommendation:
          "Use the profile evidence to identify the actual hot key before changing layout. Preserve mapping-key semantics and verify the same workload after any revision.",
      });
    }
  }

  const dynamicKeyLocation = firstLocation(source, /keccak256\s*\(/);
  if (dynamicKeyLocation) {
    diagnostics.push({
      code: "MPF-PERF-003",
      severity: "info",
      title: "Computed storage key requires workload-specific evidence",
      location: dynamicKeyLocation,
      observedEvidence:
        evidence.dependencyEdges !== undefined
          ? [`${evidence.dependencyEdges} dependency edges were derived from observed accesses.`]
          : [],
      inference:
        "Source inspection found a computed key. Static source alone cannot identify whether calls overlap on the same resulting storage slot.",
      recommendation:
        "Keep the deterministic workload inputs in the report and compare the resulting observed slots before and after a revision.",
    });
  }

  return {
    analysis: "deterministic",
    sourceLines: source.split("\n").length,
    compiler: {
      status: "not-run",
      note: "No untrusted source compilation was run in this request. Compiler output can be attached by the future isolated compilation worker.",
    },
    evidence,
    diagnostics,
  };
}

export function createCodingAgentHandoff(source: string, report: ContractInsightsReport) {
  const diagnostics =
    report.diagnostics.length === 0
      ? "No deterministic performance diagnostics were emitted. Review the local trace report before making changes."
      : report.diagnostics
          .map(diagnostic =>
            [
              `${diagnostic.code} (${diagnostic.severity}) — ${diagnostic.title}`,
              `Location: line ${diagnostic.location.line}, columns ${diagnostic.location.column}-${diagnostic.location.endColumn}.`,
              `Observed evidence: ${diagnostic.observedEvidence.join(" ") || "No profiling evidence was attached."}`,
              `Inference: ${diagnostic.inference}`,
              `Suggested action: ${diagnostic.recommendation}`,
            ].join("\n"),
          )
          .join("\n\n");
  const aiHandoff =
    report.ai?.status === "completed"
      ? [
          `AI review summary: ${report.ai.result.summary}`,
          `AI goal: ${report.ai.result.handoff.goal}`,
          `AI requested changes: ${report.ai.result.handoff.requestedChanges.join(" ")}`,
          `AI trade-offs: ${report.ai.result.handoff.tradeoffs.join(" ")}`,
          `AI verification: ${report.ai.result.handoff.verification.join(" ")}`,
        ].join("\n")
      : "AI review: unavailable. Use the deterministic findings and observed evidence below.";
  return [
    "Goal: Improve the identified performance characteristic without claiming unmeasured Monad scheduler behavior.",
    `Evidence: The source below has ${report.sourceLines} lines. Analysis mode: ${report.analysis}.`,
    diagnostics,
    aiHandoff,
    "Constraints: Preserve behavior, access control, event semantics, accounting, and required invariants. Do not infer parallelism from receipts, Promise.all, transaction counts, or wall-clock throughput.",
    "Requested changes: Propose the smallest revision, explain trade-offs, and identify any behavior that needs explicit approval.",
    "Verification: Compile, run tests, and profile the revision with the identical deterministic workload. Report local measurements separately from graph-derived properties and Monad Testnet observations.",
    "Source:\n```solidity\n" + source + "\n```",
  ].join("\n\n");
}
