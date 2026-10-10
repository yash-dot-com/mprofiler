# PEV primitives reviewed for MProfiler

Reference: [Silk-Nodes/pev](https://github.com/Silk-Nodes/pev), inspected on 2026-10-10. PEV declares the MIT License. MProfiler uses it as a design reference; no PEV source code or UI assets were copied, so no third-party code notice is required for this implementation. If code is copied later, retain the upstream copyright and MIT license text and record the source in `THIRD_PARTY_NOTICES.md`.

## Files reviewed

- [`src/lib/parallel-probe.ts`](https://github.com/Silk-Nodes/pev/blob/main/src/lib/parallel-probe.ts): trace response parsing, per-transaction read/write sets, directed conflict edges, wave assignment, and hot-slot aggregation.
- [`src/components/parallel/ConflictGraph.tsx`](https://github.com/Silk-Nodes/pev/blob/main/src/components/parallel/ConflictGraph.tsx): conflict-only graph nodes, transaction ordering, wave placement, edge classes, and selection highlighting.
- [`src/components/parallel/HotSlots.tsx`](https://github.com/Silk-Nodes/pev/blob/main/src/components/parallel/HotSlots.tsx): ranked repeated slot touches and selected-transaction highlighting.
- [`src/app/api/v1/block/[number]/route.ts`](https://github.com/Silk-Nodes/pev/blob/main/src/app/api/v1/block/%5Bnumber%5D/route.ts) and [`src/app/api/v1/tx/[hash]/route.ts`](https://github.com/Silk-Nodes/pev/blob/main/src/app/api/v1/tx/%5Bhash%5D/route.ts): serving block graph data and transaction-level dependencies.
- [`LICENSE`](https://github.com/Silk-Nodes/pev/blob/main/LICENSE): MIT License, copyright Silk Nodes (2026).

## Ideas selected

MProfiler independently implements these data-analysis ideas:

- Normalize per-call storage accesses before graph generation.
- Direct edges from an earlier workload call to a later call when both have evidence for a common slot and at least one access writes.
- Keep dependency kind, exact contract/slot, evidence references, and confidence on each edge.
- Derive graph waves from predecessor depth, and label them as a model rather than observed scheduler output.
- Rank repeated storage slots and count touches separately from the number of graph edges they support.
- Expose transaction-level graph data so a future UI can cross-highlight calls and slots.

PEV's visual interactions are useful product references only; its React context, SVG components, theme, database model, indexer, and product branding are not part of MProfiler's backend implementation.

## Trace coverage limitation

PEV's `parallel-probe.ts` reads storage keys from `prestateTracer` `diffMode: true`'s `pre` map and labels them reads, then reads writes from `post`. That diff represents state changes and does not guarantee that every key in `pre` was read or that read-only accesses are present. Its `diffMode: false` enrichment adds touched account addresses, not a complete storage-slot read set. Therefore, MProfiler does not use these prestate results as exact read evidence.

MProfiler's current local adapter parses Hardhat `debug_traceTransaction` opcode `structLogs`, taking the storage slot from the stack at `SLOAD`/`SSTORE` and retaining program counter and call depth. This is provider-specific evidence. It still needs controlled tests for read-only calls, writes, nested contexts, reverts, mappings/dynamic arrays, and delegatecall context before graph output can be treated as validated. Unsupported or missing trace data must stay partial; it must not be filled with inferred accesses.

## Interpretation boundary

Graph edges and waves describe relationships derived from observed local trace accesses under one workload. They do not report Monad's internal scheduling, actual parallel execution, or throughput. Hot-slot touch counts count observed access records; conflict counts count derived graph edges involving a slot. Any future heuristic based on storage pages is separate from observed accesses and must be labeled as such.
