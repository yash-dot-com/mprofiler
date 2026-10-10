import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "Profile one contract",
    body: "Upload one Solidity file, select the state-changing call, and run it inside an isolated local EVM.",
  },
  {
    number: "02",
    title: "Inspect real evidence",
    body: "Review receipt gas, SLOAD/SSTORE traces, hot slots, and a dependency graph derived from those accesses.",
  },
  {
    number: "03",
    title: "Improve with confidence",
    body: "Copy an evidence-bound AI handoff, profile the revision with identical inputs, then attest the report hash on Testnet.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-full bg-[#f6f8fb] text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-12 lg:py-24">
          <div>
            <p className="m-0 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
              MProfiler · Solidity performance workspace
            </p>
            <h1 className="mb-0 mt-5 max-w-3xl text-4xl font-semibold leading-[1.03] tracking-[-0.065em] text-slate-950 sm:text-6xl">
              Find storage bottlenecks before they become production problems.
            </h1>
            <p className="mb-0 mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              MProfiler turns a controlled Solidity workload into trace-backed evidence, practical diagnostics, and a
              revision comparison your coding agent can act on.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/profile" className="rounded-md bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800">
                Launch profiler
              </Link>
              <a href="#workflow" className="rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                See the workflow
              </a>
            </div>
            <p className="mb-0 mt-5 text-xs leading-5 text-slate-500">
              Local receipts and traces are measured. Hot slots and graph edges are derived. MProfiler does not claim
              to measure Monad scheduler decisions, realized parallelism, TPS, or throughput.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 shadow-xl shadow-slate-300/40 sm:p-7">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <span className="font-mono text-xs uppercase tracking-[0.16em] text-sky-300">Trace evidence</span>
              <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-300">Local EVM</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                ["Receipt gas", "128,440"],
                ["Observed accesses", "34"],
                ["Hot EVM slots", "3"],
                ["Derived edges", "4"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
                  <p className="m-0 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
                  <p className="mb-0 mt-2 font-mono text-2xl font-semibold tracking-[-0.05em] text-white">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-sky-400/20 bg-sky-400/10 p-4">
              <p className="m-0 font-mono text-xs font-semibold text-sky-200">MPF-PERF-001 · shared-state write pattern</p>
              <p className="mb-0 mt-2 text-sm leading-6 text-slate-300">
                Observed slot evidence is attached to the coding-agent handoff, together with the constraints needed to preserve behavior.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12">
        <div className="max-w-2xl">
          <p className="m-0 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">One clear loop</p>
          <h2 className="mb-0 mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">From source file to verifiable revision</h2>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map(step => (
            <article key={step.number} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="m-0 font-mono text-xs font-semibold tracking-[0.16em] text-blue-700">{step.number}</p>
              <h3 className="mb-0 mt-5 text-lg font-semibold text-slate-950">{step.title}</h3>
              <p className="mb-0 mt-3 text-sm leading-6 text-slate-600">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="evidence" className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:px-12">
          <div>
            <p className="m-0 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Evidence boundaries</p>
            <h2 className="mb-0 mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">Say exactly what the data proves.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="m-0 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <strong className="text-slate-950">Measured locally</strong><br />Receipt gas, transaction outcomes, and normalized EVM storage accesses.
            </p>
            <p className="m-0 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <strong className="text-slate-950">Derived from traces</strong><br />Hot slots, dependency edges, and modeled graph depth.
            </p>
            <p className="m-0 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <strong className="text-slate-950">AI-assisted review</strong><br />Recommendations remain separate from observed evidence and preserve explicit constraints.
            </p>
            <p className="m-0 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <strong className="text-slate-950">Monad Testnet</strong><br />Bounded deployment, transaction, event, trace, and report-hash attestation verification.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 py-16 text-center sm:px-8 lg:px-12">
        <p className="m-0 text-3xl font-semibold tracking-[-0.055em] text-slate-950">Bring the contract you actually want to improve.</p>
        <p className="mx-auto mb-0 mt-3 max-w-xl text-sm leading-6 text-slate-600">Start with a single `.sol` file and one state-changing function. MProfiler guides the rest of the loop.</p>
        <Link href="/profile" className="mt-6 inline-flex rounded-md bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800">
          Start profiling
        </Link>
      </section>
    </main>
  );
}
