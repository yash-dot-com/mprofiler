import { ProfileReport, validateProfileReport } from "./profileReport";

export type ProfileComparison = {
  schemaVersion: "1.0.0";
  baselineAnalysisId: string;
  revisionAnalysisId: string;
  workloadIdentical: true;
  environment: "local-evm-measurements";
  totalGasUsed: { baseline: string; revision: string; deltaRevisionMinusBaseline: string };
  scenarios: Array<{
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
  }>;
  note: string;
};

function canonicalWorkload(report: ProfileReport): string {
  return JSON.stringify({
    workload: report.workload,
    calls: report.calls.map(call => ({ workloadCaseId: call.workloadCaseId, input: call.input })),
  });
}

function gasForCalls(calls: ProfileReport["calls"]): bigint {
  return calls.reduce((total, call) => total + BigInt(call.gasUsed), 0n);
}

export function compareProfileReports(
  baselineInput: unknown,
  revisionInput: unknown,
  analysisIds = { baseline: "baseline", revision: "revision" },
): ProfileComparison {
  validateProfileReport(baselineInput);
  validateProfileReport(revisionInput);
  const baseline = baselineInput;
  const revision = revisionInput;
  if (canonicalWorkload(baseline) !== canonicalWorkload(revision)) {
    throw new Error("Cannot compare reports: workload scenarios, batch configuration, or call inputs differ.");
  }

  const scenarioIds = baseline.workload.scenarios;
  const scenarios = scenarioIds.map(scenarioId => {
    const baseCalls = baseline.calls.filter(call => call.workloadCaseId?.startsWith(`${scenarioId}:`));
    const revisionCalls = revision.calls.filter(call => call.workloadCaseId?.startsWith(`${scenarioId}:`));
    const baseGas = gasForCalls(baseCalls);
    const revisionGas = gasForCalls(revisionCalls);
    return {
      scenarioId,
      baselineGasUsed: baseGas.toString(),
      revisionGasUsed: revisionGas.toString(),
      gasDeltaRevisionMinusBaseline: (revisionGas - baseGas).toString(),
      baselineCallCount: baseCalls.length,
      revisionCallCount: revisionCalls.length,
      baselineReadAccesses: baseCalls.reduce((sum, call) => sum + call.trace.accesses.filter(access => access.operation === "read").length, 0),
      revisionReadAccesses: revisionCalls.reduce((sum, call) => sum + call.trace.accesses.filter(access => access.operation === "read").length, 0),
      baselineWriteAccesses: baseCalls.reduce((sum, call) => sum + call.trace.accesses.filter(access => access.operation === "write").length, 0),
      revisionWriteAccesses: revisionCalls.reduce((sum, call) => sum + call.trace.accesses.filter(access => access.operation === "write").length, 0),
      baselineDependencyEdges: baseline.dependencyGraph.edges.filter(edge => edge.scenarioId === scenarioId).length,
      revisionDependencyEdges: revision.dependencyGraph.edges.filter(edge => edge.scenarioId === scenarioId).length,
    };
  });
  const baseGas = gasForCalls(baseline.calls);
  const revisionGas = gasForCalls(revision.calls);
  return {
    schemaVersion: "1.0.0",
    baselineAnalysisId: analysisIds.baseline,
    revisionAnalysisId: analysisIds.revision,
    workloadIdentical: true,
    environment: "local-evm-measurements",
    totalGasUsed: {
      baseline: baseGas.toString(),
      revision: revisionGas.toString(),
      deltaRevisionMinusBaseline: (revisionGas - baseGas).toString(),
    },
    scenarios,
    note: "Gas and opcode counts are local EVM measurements. Edge counts are graph-derived. Deltas are descriptive and do not establish Monad scheduler, throughput, or optimization effects.",
  };
}
