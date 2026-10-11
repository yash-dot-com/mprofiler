import type { ProfileReportCall } from "./profileReport";
import { analyzeMip8Locality } from "./mip8";

export type StorageAccessEvidence = {
  id: string;
  scenarioId: string;
  workloadCaseId: string;
  txIndex: number;
  contractAddress: string;
  slot: string;
  mode: "read" | "write";
  opcode: "SLOAD" | "SSTORE";
  programCounter: number;
  callDepth: number | null;
};

export type DependencyEdge = {
  id: string;
  scenarioId: string;
  fromTxIndex: number;
  toTxIndex: number;
  kind: "write-write" | "write-read" | "mixed";
  sharedSlots: Array<{ contractAddress: string; slot: string }>;
  evidenceIds: string[];
  confidence: "high" | "medium";
  interpretation: "observed-access-derived";
};

export function buildProfileGraph(calls: ProfileReportCall[]) {
  const evidence: StorageAccessEvidence[] = [];
  for (const [txIndex, call] of calls.entries()) {
    const workloadCaseId = call.workloadCaseId ?? `default:${String(txIndex).padStart(4, "0")}`;
    for (const [accessIndex, access] of call.trace.accesses.entries()) {
      evidence.push({
        id: `access-${txIndex}-${accessIndex}`,
        scenarioId: workloadCaseId.split(":")[0],
        workloadCaseId,
        txIndex,
        contractAddress: access.contractAddress,
        slot: access.slot,
        mode: access.operation,
        opcode: access.opcode,
        programCounter: access.programCounter,
        callDepth: access.depth,
      });
    }
  }

  const edges: DependencyEdge[] = [];
  for (let fromTxIndex = 0; fromTxIndex < calls.length; fromTxIndex++) {
    const earlier = calls[fromTxIndex];
    const earlierWrites = evidence.filter(
      access => access.txIndex === fromTxIndex && access.mode === "write" && !earlier.trace.reverted,
    );
    for (let toTxIndex = fromTxIndex + 1; toTxIndex < calls.length; toTxIndex++) {
      const fromScenario = calls[fromTxIndex].workloadCaseId?.split(":")[0] ?? "default";
      const toScenario = calls[toTxIndex].workloadCaseId?.split(":")[0] ?? "default";
      if (fromScenario !== toScenario) continue;
      const laterAccesses = evidence.filter(access => access.txIndex === toTxIndex);
      const shared = new Map<
        string,
        { contractAddress: string; slot: string; evidenceIds: string[]; hasRead: boolean; hasWrite: boolean }
      >();
      for (const write of earlierWrites) {
        const key = `${write.contractAddress}:${write.slot}`;
        const matches = laterAccesses.filter(
          access =>
            access.contractAddress === write.contractAddress &&
            access.slot === write.slot &&
            (access.mode === "read" || !calls[toTxIndex].trace.reverted),
        );
        if (matches.length === 0) continue;
        const item = shared.get(key) ?? {
          contractAddress: write.contractAddress,
          slot: write.slot,
          evidenceIds: [],
          hasRead: false,
          hasWrite: false,
        };
        item.evidenceIds.push(write.id, ...matches.map(access => access.id));
        item.hasRead ||= matches.some(access => access.mode === "read");
        item.hasWrite ||= matches.some(access => access.mode === "write" && !calls[toTxIndex].trace.reverted);
        shared.set(key, item);
      }
      const slots = [...shared.values()];
      if (slots.length === 0) continue;
      const hasRead = slots.some(slot => slot.hasRead);
      const hasWrite = slots.some(slot => slot.hasWrite);
      edges.push({
        id: `dependency-${fromTxIndex}-${toTxIndex}`,
        scenarioId: fromScenario,
        fromTxIndex,
        toTxIndex,
        kind: hasRead && hasWrite ? "mixed" : hasWrite ? "write-write" : "write-read",
        sharedSlots: slots.map(({ contractAddress, slot }) => ({ contractAddress, slot })),
        evidenceIds: [...new Set(slots.flatMap(slot => slot.evidenceIds))].sort(),
        confidence: calls.slice(fromTxIndex, toTxIndex + 1).every(call => call.trace.complete) ? "high" : "medium",
        interpretation: "observed-access-derived",
      });
    }
  }

  const waves: number[] = [];
  for (let index = 0; index < calls.length; index++) {
    const predecessors = edges.filter(edge => edge.toTxIndex === index);
    waves[index] = predecessors.length === 0 ? 0 : Math.max(...predecessors.map(edge => waves[edge.fromTxIndex] + 1));
  }
  const hot = new Map<
    string,
    {
      scenarioId: string;
      contractAddress: string;
      slot: string;
      touches: number;
      callIndexes: Set<number>;
      edgeCount: number;
    }
  >();
  for (const access of evidence) {
    const key = `${access.scenarioId}:${access.contractAddress}:${access.slot}`;
    const item = hot.get(key) ?? {
      scenarioId: access.scenarioId,
      contractAddress: access.contractAddress,
      slot: access.slot,
      touches: 0,
      callIndexes: new Set<number>(),
      edgeCount: 0,
    };
    item.touches++;
    item.callIndexes.add(access.txIndex);
    hot.set(key, item);
  }
  for (const edge of edges) {
    for (const slot of edge.sharedSlots) {
      const item = hot.get(`${edge.scenarioId}:${slot.contractAddress}:${slot.slot}`);
      if (item) item.edgeCount++;
    }
  }
  const hotSlots = [...hot.values()]
    .filter(slot => slot.callIndexes.size > 1)
    .sort(
      (a, b) =>
        b.touches - a.touches ||
        a.scenarioId.localeCompare(b.scenarioId) ||
        a.contractAddress.localeCompare(b.contractAddress) ||
        a.slot.localeCompare(b.slot),
    )
    .map(({ scenarioId, contractAddress, slot, touches, callIndexes, edgeCount }) => ({
      scenarioId,
      contractAddress,
      slot,
      touches,
      callCount: callIndexes.size,
      dependencyEdgeCount: edgeCount,
    }));

  const mip8 = analyzeMip8Locality(calls);

  return {
    evidence,
    nodes: calls.map((call, callIndex) => ({
      callIndex,
      transactionHash: call.transactionHash,
      wave: waves[callIndex],
    })),
    edges,
    hotSlots,
    executionDepth: waves.length === 0 ? 0 : Math.max(...waves) + 1,
    mip8,
  };
}
