import type { TraceAccessReport } from "./traceAccess";
import { buildProfileGraph } from "./profileGraph";

export type ProfileReportCall = {
  workloadCaseId?: string;
  input: string;
  transactionHash: string;
  status: "success" | "reverted";
  gasUsed: string;
  trace: TraceAccessReport;
};

export type ProfileReport = {
  schemaVersion: "1.0.0";
  generatedAt: string;
  environment: {
    network: "hardhat" | "anvil";
    chainId: string;
    compilerVersion: string;
    executionNote: string;
  };
  contract: { name: string; address: string; scenarioAddresses?: Record<string, string> };
  workload: {
    id: string;
    scenarios: string[];
    batchSize: number;
    controlledAccountCount: number;
    inputs: string[];
  };
  summary: {
    callCount: number;
    successfulCalls: number;
    revertedCalls: number;
    totalGasUsed: string;
  };
  compilerDiagnostics: {
    captured: false;
    note: string;
  };
  metricProvenance: {
    localMeasurements: string[];
    derivedGraphProperties: string[];
    monadSpecificEstimates: string;
  };
  calls: ProfileReportCall[];
  traceCoverage: "complete" | "partial";
  dependencyGraph: {
    nodes: ReturnType<typeof buildProfileGraph>["nodes"];
    edges: ReturnType<typeof buildProfileGraph>["edges"];
    evidence: ReturnType<typeof buildProfileGraph>["evidence"];
    hotSlots: ReturnType<typeof buildProfileGraph>["hotSlots"];
    modeledExecutionDepth: number;
    note: string;
  };
  findings: Array<{
    kind: "heuristic" | "trace-backed";
    title: string;
    evidence: string;
  }>;
  limitations: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateProfileReport(value: unknown): asserts value is ProfileReport {
  if (!isRecord(value) || value.schemaVersion !== "1.0.0" || !Array.isArray(value.calls)) {
    throw new Error("Invalid MProfiler report: missing supported schema version or calls.");
  }
  if (value.traceCoverage !== "complete" && value.traceCoverage !== "partial") {
    throw new Error("Invalid MProfiler report: traceCoverage must be complete or partial.");
  }
  if (
    !isRecord(value.metricProvenance) ||
    !Array.isArray(value.metricProvenance.localMeasurements) ||
    !Array.isArray(value.metricProvenance.derivedGraphProperties) ||
    typeof value.metricProvenance.monadSpecificEstimates !== "string"
  ) {
    throw new Error("Invalid MProfiler report: metric provenance is missing.");
  }
  const graph = value.dependencyGraph;
  if (
    !isRecord(graph) ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    !Array.isArray(graph.evidence) ||
    !Array.isArray(graph.hotSlots)
  ) {
    throw new Error("Invalid MProfiler report: incomplete dependency graph.");
  }
  const evidenceIds = new Set<string>();
  for (const evidence of graph.evidence) {
    if (
      !isRecord(evidence) ||
      typeof evidence.id !== "string" ||
      typeof evidence.contractAddress !== "string" ||
      typeof evidence.slot !== "string" ||
      (evidence.mode !== "read" && evidence.mode !== "write") ||
      typeof evidence.txIndex !== "number"
    ) {
      throw new Error("Invalid MProfiler report: malformed storage evidence.");
    }
    evidenceIds.add(evidence.id);
  }
  for (const edge of graph.edges) {
    if (
      !isRecord(edge) ||
      !Array.isArray(edge.evidenceIds) ||
      edge.evidenceIds.some(id => typeof id !== "string" || !evidenceIds.has(id)) ||
      !Array.isArray(edge.sharedSlots)
    ) {
      throw new Error("Invalid MProfiler report: dependency edge references invalid evidence.");
    }
  }
  for (const call of value.calls) {
    if (
      !isRecord(call) ||
      !isRecord(call.trace) ||
      typeof call.trace.complete !== "boolean" ||
      !Array.isArray(call.trace.accesses) ||
      !Array.isArray(call.trace.warnings)
    ) {
      throw new Error("Invalid MProfiler report: malformed call trace.");
    }
  }
}

export function createProfileReport(input: {
  chainId: bigint;
  compilerVersion: string;
  contractAddress: string;
  calls: ProfileReportCall[];
  network?: "hardhat" | "anvil";
  contractName?: string;
  scenarioAddresses?: Record<string, string>;
  workload?: {
    id: string;
    scenarios: string[];
    batchSize: number;
    controlledAccountCount: number;
  };
}): ProfileReport {
  const graph = buildProfileGraph(input.calls);

  const successfulCalls = input.calls.filter(call => call.status === "success").length;
  const totalGasUsed = input.calls.reduce((sum, call) => sum + BigInt(call.gasUsed), 0n).toString();

  const report: ProfileReport = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    environment: {
      network: input.network ?? "hardhat",
      chainId: input.chainId.toString(),
      compilerVersion: input.compilerVersion,
      executionNote:
        input.network === "anvil"
          ? "Disposable local Anvil EVM; graph metrics are derived from this local workload and do not represent Monad Testnet/Mainnet or actual scheduler decisions."
          : "Ephemeral local Hardhat EVM; these measurements do not represent Monad Testnet or Mainnet execution.",
    },
    contract: {
      name: input.contractName ?? "YourContract",
      address: input.contractAddress,
      ...(input.scenarioAddresses ? { scenarioAddresses: input.scenarioAddresses } : {}),
    },
    workload: {
      id: input.workload?.id ?? "mprofiler-fixed-greeting-v1",
      scenarios: input.workload?.scenarios ?? [],
      batchSize: input.workload?.batchSize ?? input.calls.length,
      controlledAccountCount: input.workload?.controlledAccountCount ?? 1,
      inputs: input.calls.map(call => call.input),
    },
    summary: {
      callCount: input.calls.length,
      successfulCalls,
      revertedCalls: input.calls.length - successfulCalls,
      totalGasUsed,
    },
    compilerDiagnostics: {
      captured: false,
      note: "The spike uses Hardhat's compile step but does not capture structured solc diagnostics.",
    },
    metricProvenance: {
      localMeasurements: ["transaction receipt gasUsed", "observed SLOAD/SSTORE trace steps"],
      derivedGraphProperties: ["storage dependency edges", "modeled graph depth", "hot-slot touch and edge counts"],
      monadSpecificEstimates:
        "None generated. This report does not measure or estimate actual Monad scheduler decisions.",
    },
    calls: input.calls,
    traceCoverage: input.calls.every(call => call.trace.complete) ? "complete" : "partial",
    dependencyGraph: {
      nodes: graph.nodes,
      edges: graph.edges,
      evidence: graph.evidence,
      hotSlots: graph.hotSlots,
      modeledExecutionDepth: graph.executionDepth,
      note: "Edges and waves are derived from observed opcode accesses in this sequential local workload; they are a dependency model, not Monad scheduler observations or a parallel execution measurement.",
    },
    findings: [],
    limitations: [
      "This report covers one isolated local EVM execution. It does not measure Monad Testnet/Mainnet execution or scheduler decisions.",
      "Calls run sequentially on a local Hardhat EVM with a fixed input sequence.",
      "Structured compiler diagnostics and source locations are not captured by this report.",
      "Nested CALL, CALLCODE, DELEGATECALL, and STATICCALL storage contexts are not resolved by the current adapter; affected traces are marked incomplete.",
      "Reverted writes are observed but excluded as committed writes when deriving outgoing dependencies.",
      "Graph depth is a derived dependency property only; no Monad scheduler or parallelism measurements are reported.",
    ],
  };
  validateProfileReport(report);
  return report;
}
