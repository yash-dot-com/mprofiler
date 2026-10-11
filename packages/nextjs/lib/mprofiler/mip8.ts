export type Mip8SlotCell = {
  offset: number; // 0..127
  slot: string;
  touches: number;
  reads: number;
  writes: number;
  callIndexes: number[];
};

export type Mip8Page = {
  pageKey: string;
  contractAddress: string;
  pageIndex: string;
  totalTouches: number;
  reads: number;
  writes: number;
  distinctSlotsCount: number;
  offsets: Mip8SlotCell[];
  participatingCalls: number[];
};

export type Mip8Analysis = {
  distinctSlots: number;
  distinctPages: number;
  totalAccesses: number;
  totalReads: number;
  totalWrites: number;
  coldPageTouches: number;
  warmPageTouches: number;
  modeledSloadGas: number;
  legacyPerSlotGas: number;
  modeledSavings: number;
  pageReuseRate: number;
  pages: Mip8Page[];
  note: string;
};

export function slotToPageIndex(slotHex: string): string {
  try {
    const raw = BigInt(slotHex);
    return `0x${(raw >> 7n).toString(16)}`;
  } catch {
    return "0x0";
  }
}

export function slotToPageOffset(slotHex: string): number {
  try {
    const raw = BigInt(slotHex);
    return Number(raw & 127n);
  } catch {
    return 0;
  }
}

type TraceAccess = {
  contractAddress: string;
  operation: "read" | "write" | string;
  slot: string;
};

type ProfileCallLike = {
  trace: { accesses: TraceAccess[] };
};

export function deriveClientMip8(calls: ProfileCallLike[]): Mip8Analysis {
  let totalReads = 0;
  let totalWrites = 0;
  let coldPageTouches = 0;
  let warmPageTouches = 0;

  const globalSlots = new Set<string>();
  const pageMap = new Map<
    string,
    {
      contractAddress: string;
      pageIndex: string;
      totalTouches: number;
      reads: number;
      writes: number;
      slots: Map<string, { offset: number; touches: number; reads: number; writes: number; callIndexes: Set<number> }>;
      participatingCalls: Set<number>;
    }
  >();

  for (const [callIndex, call] of calls.entries()) {
    const warmPagesInCall = new Set<string>();

    for (const access of call.trace?.accesses ?? []) {
      if (!access.slot) continue;
      const slot = access.slot.toLowerCase();
      globalSlots.add(slot);
      const contractAddress = (access.contractAddress || "").toLowerCase();
      const pageIndex = slotToPageIndex(slot);
      const offset = slotToPageOffset(slot);
      const pageKey = `${contractAddress}:${pageIndex}`;

      const isRead = access.operation === "read";
      const isWrite = access.operation === "write";
      if (isRead) totalReads++;
      if (isWrite) totalWrites++;

      if (isRead) {
        if (!warmPagesInCall.has(pageKey)) {
          coldPageTouches++;
          warmPagesInCall.add(pageKey);
        } else {
          warmPageTouches++;
        }
      } else if (isWrite) {
        warmPagesInCall.add(pageKey);
      }

      let pageRecord = pageMap.get(pageKey);
      if (!pageRecord) {
        pageRecord = {
          contractAddress,
          pageIndex,
          totalTouches: 0,
          reads: 0,
          writes: 0,
          slots: new Map(),
          participatingCalls: new Set(),
        };
        pageMap.set(pageKey, pageRecord);
      }
      pageRecord.totalTouches++;
      if (isRead) pageRecord.reads++;
      if (isWrite) pageRecord.writes++;
      pageRecord.participatingCalls.add(callIndex);

      let slotRecord = pageRecord.slots.get(slot);
      if (!slotRecord) {
        slotRecord = {
          offset,
          touches: 0,
          reads: 0,
          writes: 0,
          callIndexes: new Set(),
        };
        pageRecord.slots.set(slot, slotRecord);
      }
      slotRecord.touches++;
      if (isRead) slotRecord.reads++;
      if (isWrite) slotRecord.writes++;
      slotRecord.callIndexes.add(callIndex);
    }
  }

  const pages: Mip8Page[] = [...pageMap.entries()]
    .map(([pageKey, page]) => {
      const offsets: Mip8SlotCell[] = [...page.slots.entries()]
        .map(([slot, cell]) => ({
          offset: cell.offset,
          slot,
          touches: cell.touches,
          reads: cell.reads,
          writes: cell.writes,
          callIndexes: [...cell.callIndexes].sort((a, b) => a - b),
        }))
        .sort((a, b) => a.offset - b.offset);

      return {
        pageKey,
        contractAddress: page.contractAddress,
        pageIndex: page.pageIndex,
        totalTouches: page.totalTouches,
        reads: page.reads,
        writes: page.writes,
        distinctSlotsCount: page.slots.size,
        offsets,
        participatingCalls: [...page.participatingCalls].sort((a, b) => a - b),
      };
    })
    .sort((a, b) => b.totalTouches - a.totalTouches);

  const modeledSloadGas = coldPageTouches * 8_100 + warmPageTouches * 100;
  const legacyPerSlotGas = totalReads * 8_100;
  const modeledSavings = Math.max(0, legacyPerSlotGas - modeledSloadGas);
  const totalPageInteractions = coldPageTouches + warmPageTouches;
  const pageReuseRate = totalPageInteractions > 0 ? (warmPageTouches / totalPageInteractions) * 100 : 0;

  return {
    distinctSlots: globalSlots.size,
    distinctPages: pageMap.size,
    totalAccesses: totalReads + totalWrites,
    totalReads,
    totalWrites,
    coldPageTouches,
    warmPageTouches,
    modeledSloadGas,
    legacyPerSlotGas,
    modeledSavings,
    pageReuseRate: Math.round(pageReuseRate * 10) / 10,
    pages,
    note: "MIP-8 page analysis derives logical 128-slot pages (pageIndex = slot >> 7, offset = slot & 127). SLOAD gas modeled at 8,100 gas (cold page) / 100 gas (warm page). Modeled estimates are distinct from local EVM receipt gas.",
  };
}
