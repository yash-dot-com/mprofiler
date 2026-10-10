export type TraceAccess = {
  contractAddress: string;
  operation: "read" | "write";
  opcode: "SLOAD" | "SSTORE";
  slot: string;
  programCounter: number;
  depth: number | null;
};

export type TraceAccessReport = {
  reverted: boolean;
  complete: boolean;
  accesses: TraceAccess[];
  committedWriteSlots: string[];
  warnings: string[];
};

type StructLog = {
  op?: unknown;
  pc?: unknown;
  depth?: unknown;
  stack?: unknown;
};

type HardhatTrace = {
  failed?: unknown;
  structLogs?: unknown;
};

const SLOT_PATTERN = /^(?:0x)?[0-9a-fA-F]{1,64}$/;

export function parseTraceAccess(input: unknown, contractAddress: string): TraceAccessReport {
  const warnings: string[] = [];
  const trace = input && typeof input === "object" ? (input as HardhatTrace) : {};
  const reverted = trace.failed === true;
  const logs = Array.isArray(trace.structLogs) ? (trace.structLogs as StructLog[]) : null;

  if (!logs) {
    return {
      reverted,
      complete: false,
      accesses: [],
      committedWriteSlots: [],
      warnings: ["Trace did not contain a structLogs array."],
    };
  }

  const accesses: TraceAccess[] = [];
  let complete = true;

  for (const [index, log] of logs.entries()) {
    if (["CALL", "CALLCODE", "DELEGATECALL", "STATICCALL"].includes(String(log?.op))) {
      complete = false;
      warnings.push(`Nested call at trace step ${index}; storage context is not resolved by this adapter.`);
    }
    if (log?.op !== "SLOAD" && log?.op !== "SSTORE") continue;

    const stack = Array.isArray(log.stack) ? log.stack : null;
    const rawSlot = stack?.[stack.length - 1];
    if (typeof rawSlot !== "string" || !SLOT_PATTERN.test(rawSlot)) {
      complete = false;
      warnings.push(`Storage opcode at trace step ${index} has no valid slot on the stack.`);
      continue;
    }

    const slot = `0x${rawSlot.replace(/^0x/i, "").toLowerCase().padStart(64, "0")}`;
    accesses.push({
      contractAddress: contractAddress.toLowerCase(),
      operation: log.op === "SLOAD" ? "read" : "write",
      opcode: log.op,
      slot,
      programCounter: typeof log.pc === "number" ? log.pc : -1,
      depth: typeof log.depth === "number" ? log.depth : null,
    });
  }

  const committedWriteSlots = reverted
    ? []
    : [...new Set(accesses.filter(access => access.operation === "write").map(access => access.slot))];

  if (reverted && accesses.some(access => access.operation === "write")) {
    warnings.push("SSTORE operations were observed, but the transaction reverted; no writes were committed.");
  }

  return { reverted, complete, accesses, committedWriteSlots, warnings };
}
