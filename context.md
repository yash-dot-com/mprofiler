# PEV Primitives, MIP-8 Storage Analysis & MProfiler Workbench Vision

I reviewed PEV's README, documentation, MIT license, changelog, trace and graph algorithms, block indexer, database access layer, API routes, interactive views, source enrichment, and contract audit logic. I also compared its local-analysis concepts with MProfiler's existing implementation.

My conclusion: we should extract PEV's useful analysis and interaction primitives, adapt them to MProfiler's local profiling engine, and make them available inside developer workflows. We should not clone the entire PEV application.

---

## 1. What PEV Actually Gives Us
PEV is the Parallel Execution Visualizer built by Silk Nodes. It analyzes Monad Mainnet transactions and surfaces storage conflicts, hot slots, transaction dependencies, and theoretical parallelism. It also provides contract-specific and network-wide analytics.

Its architecture has three major parts:
1. **Chain observation and indexing**: Block watcher, RPC tracing, background job queue, and PostgreSQL storage.
2. **Conflict analysis**: Per-transaction access sets, directed conflict graph, modeled execution waves, and hot-slot attribution.
3. **Developer-facing analysis**: Block timelines, conflict graphs, transaction details, contract audits, analytics, and read-only API.

The key insight: The graph, hotspot ranking, metrics, source attribution, and interactive explanation are distinct capabilities. We can extract those capabilities without adopting PEV's complete production indexer.

---

## 2. The PEV Primitives Worth Extracting

### Primitive A: Storage-Access Conflict Graph
Represent every transaction as a set of storage reads and writes. Compare earlier transaction $T_i$ with later transaction $T_j$.
A potential dependency exists when:
$$W_i \cap (R_j \cup W_j) \ne \varnothing$$
where $R_j$ is the later transaction's read set and $W_i$ is the earlier transaction's write set.

Three patterns:
- **Write–write**: Both transactions write a shared storage location.
- **Write–read**: The earlier transaction writes a location the later transaction reads.
- **Mixed**: The pair shares multiple locations with both kinds of dependency.
- *(Read–read overlap alone does not create a conflict).*

Clicking an edge should reveal:
- Both affected calls.
- The shared storage slot.
- Corresponding read/write evidence.
- Source location or variable name, when known.
- Why the graph derived a dependency.
- Whether trace evidence is complete enough to trust the conclusion.

### Primitive B: Modeled Execution Waves
Assigns transactions to waves based on the longest dependency chain.
- Wave 0: Transactions with no preceding dependencies.
- Wave $N$: Transactions depending on an earlier wave ($wave_j = \max(wave_{pred}) + 1$).
- Label clearly as **Derived dependency waves**, not observed scheduler output.

### Primitive C: Hot-Slot Analysis
Separate metrics:
- **Access count**: How frequently the workload touched this slot (SLOADs and SSTOREs).
- **Conflict contribution**: How many derived transaction-pair conflict edges involve this slot.
- **Calls touched**: Number of distinct calls accessing the slot.
- **Source mapping**: Variable or storage expression, if resolvable.

### Primitive D: Cross-Linked Visualizations (PEVContext)
Synchronize selection across all views:
- **Timeline**: Call positions grouped by execution order / wave.
- **Conflict Graph**: Directed graph of conflicting transactions.
- **Hot Slots**: Ranking of repeated storage accesses and conflict contribution.
- **WhyPanel**: Explanation of which transactions block or depend on the selected transaction/slot.

### Primitive E: Method and Source Attribution
Connect:
`Storage slot → contract variable → executed function → trace evidence → graph dependency`

### Primitive F: Root-Cause Explanation and Remediation Direction
Every finding separates:
1. **Observed evidence**: What trace or benchmark data shows.
2. **Interpretation**: What the evidence suggests.
3. **Suggested experiment**: A change worth testing.
4. **Validation**: Workload to confirm or reject the hypothesis.

---

## 3. What We Should NOT Copy
- No chain-wide indexer or PostgreSQL database.
- No network-wide leaderboards.
- No contract co-occurrence graph.
- Production PEV data should be an optional link or integration adapter, not an embedded database.

---

## 4. MIP-8: Page-ified Storage State Analysis

### What is MIP-8?
Monad MIP-8 groups storage into logical pages of 128 consecutive slots (4,096 bytes / 4 KB).
Accessing a slot warms its entire page, allowing subsequent accesses to other slots in that page to receive warm-access pricing.

Formulas:
$$\text{pageIndex} = \text{slot} \gg 7$$
$$\text{offset} = \text{slot} \ \& \ 127$$

Gas schedule:
- **8,100 gas**: First SLOAD of a page (cold page).
- **100 gas**: SLOAD from an already accessed warm page.

Sequential state variables, array elements, and fields inside a struct naturally share pages. Different mapping keys are hashed and generally do not.

### Probing and Visualizations for MIP-8
1. **MIP-8 Impact Analysis**:
   - Distinct slots vs. distinct pages touched.
   - Cold page accesses vs. warm page reuses.
   - Modeled storage gas under per-slot cold model vs. MIP-8 page-aware model.
   - Explicitly label as a **modeled estimate**, distinct from Hardhat EVM receipt gas.
2. **Storage Page Inspector**:
   - Interactive 128-slot grid (offsets 0–127) for a selected page.
   - Colored by access mode (read, write, both) with intensity representing access count.
   - Hover/click cell to see slot key, offset, touched calls, and trace details.
3. **Page Locality Ranking Table**:
   - Rank pages by observed accesses, distinct slots used, reads, writes, reuse, and modeled cost.
4. **Baseline vs. Revision MIP-8 Comparison**:
   - Compare page locality, page reuse, and modeled storage costs before and after contract revisions.

---

## 5. The Unified MProfiler Workbench

One engineering workbench with 6 synchronized views:
1. **Overview**: Health of run, total gas, call outcomes, trace coverage, key findings, headline storage/MIP-8 metrics.
2. **Execution**: Call & transaction timeline with receipt gas, opcode trace (`SLOAD`/`SSTORE`), program counter, call depth, warnings.
3. **Storage**: Slot table + MIP-8 Page Inspector (128-slot visual grid) and page locality table.
4. **Dependencies**: Interactive conflict graph, modeled execution waves, hot slots, and the **WhyPanel** explaining dependencies.
5. **Compare**: Baseline vs Revision side-by-side with identical workload proof, gas deltas, read/write diffs, dependency edge changes, and MIP-8 page locality changes.
6. **Findings / Insights**: Structured 4-part findings, coding-agent handoff copyable prompt, and optional OpenAI review.
