export const SCENARIO_IDS = [
  "independent-mapping-writes",
  "shared-global-counter-writes",
  "same-key-writes",
  "mixed-reads-writes",
  "read-heavy",
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

export type WorkloadStep = {
  scenarioId: ScenarioId;
  workloadCaseId: string;
  callIndex: number;
  accountIndex: number;
  method: "writeIndependent" | "writeSharedCounter" | "writeSameKey" | "mixedReadWrite" | "readHeavy";
  args: bigint[];
};

export function generateWorkloads(batchSize: number, controlledAccountCount: number) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error("batchSize must be an integer between 1 and 100.");
  }
  if (!Number.isInteger(controlledAccountCount) || controlledAccountCount < 2 || controlledAccountCount > 20) {
    throw new Error("controlledAccountCount must be an integer between 2 and 20.");
  }

  const scenarios: Array<{ id: ScenarioId; method: WorkloadStep["method"] }> = [
    { id: "independent-mapping-writes", method: "writeIndependent" },
    { id: "shared-global-counter-writes", method: "writeSharedCounter" },
    { id: "same-key-writes", method: "writeSameKey" },
    { id: "mixed-reads-writes", method: "mixedReadWrite" },
    { id: "read-heavy", method: "readHeavy" },
  ];

  return scenarios.map(({ id, method }) => ({
    id,
    steps: Array.from({ length: batchSize }, (_, callIndex): WorkloadStep => {
      const accountIndex = callIndex % controlledAccountCount;
      const common: WorkloadStep = {
        scenarioId: id,
        workloadCaseId: `${id}:${String(callIndex).padStart(4, "0")}`,
        callIndex,
        accountIndex,
        method,
        args: [],
      };
      switch (id) {
        case "independent-mapping-writes":
          return { ...common, args: [BigInt(callIndex), BigInt(callIndex + 1)] };
        case "shared-global-counter-writes":
          return { ...common, args: [1n] };
        case "same-key-writes":
          return { ...common, args: [BigInt(callIndex + 1)] };
        case "mixed-reads-writes":
          return { ...common, args: [BigInt(callIndex % 4), 1n] };
        case "read-heavy":
          return { ...common, args: [BigInt(callIndex % 4)] };
      }
    }),
  }));
}
