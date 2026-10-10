import Link from "next/link";

const proofCards = [
  { label: "Receipt gas", value: "128,440", detail: "measured locally" },
  { label: "Storage accesses", value: "34", detail: "SLOAD + SSTORE" },
  { label: "Shared slots", value: "3", detail: "derived from traces" },
];

const workflow = [
  {
    number: "01",
    title: "Bring one contract",
    body: "Upload a standalone Solidity file and choose the state-changing call you want to measure.",
  },
  {
    number: "02",
    title: "Run controlled evidence",
    body: "MProfiler deploys into a disposable local EVM, then records receipts and storage-access traces.",
  },
  {
    number: "03",
    title: "Improve and re-prove",
    body: "Copy an evidence-bound agent handoff, profile the revision with identical inputs, and compare the delta.",
  },
];

const evidence = [
  ["Measured", "Receipt gas, transaction outcomes, and normalized SLOAD/SSTORE accesses."],
  ["Derived", "Hot slots and dependency edges calculated from the observed trace evidence."],
  ["Recommended", "AI-assisted explanations and minimal-change suggestions that stay separate from evidence."],
];

export default function LandingPage() {
  return (
    <main className="min-h-full overflow-hidden bg-[#f5f7fb] text-slate-950">
      <section className="relative border-b border-slate-200 bg-white">
        <div className="absolute inset-x-0 top-0 h-1 bg-blue-700" />
        <div className="mx-auto grid max-w-[1440px] gap-12 px-5 pb-16 pt-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:pb-24 lg:pt-24">
          <div className="max-w-3xl">
            <p className="m-0 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-800">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              Solidity performance workspace
            </p>
            <h1 className="mb-0 mt-6 text-5xl font-semibold leading-[0.98] tracking-[-0.07em] text-slate-950 sm:text-6xl lg:text-7xl">
              Make every contract optimization prove itself.
            </h1>
            <p className="mb-0 mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              MProfiler turns one controlled Solidity workload into trace-backed storage evidence, practical diagnostics,
              and a revision comparison your coding agent can act on.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/profile"
                className="rounded-md bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800"
              >
                Start profiling
              </Link>
              <a
                href="https://youtu.be/E0OgbbPYkLk"
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Watch the 3-min demo ↗
              </a>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
              <span>Local EVM measurement</span>
              <span className="before:mr-2 before:text-slate-300 before:content-['•']">Evidence-bound AI review</span>
              <span className="before:mr-2 before:text-slate-300 before:content-['•']">Monad Testnet attestation</span>
            </div>
          </div>

          <div className="relative self-center rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl shadow-slate-400/30 sm:p-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300">Observed execution report</p>
                <p className="mb-0 mt-1 text-sm text-slate-400">SloppyVault · local Hardhat EVM</p>
              </div>
              <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                24 / 24 traces
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {proofCards.map(card => (
                <div key={card.label} className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
                  <p className="m-0 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500">{card.label}</p>
                  <p className="mb-0 mt-2 font-mono text-xl font-semibold tracking-[-0.06em] text-white">{card.value}</p>
                  <p className="mb-0 mt-1 text-[10px] text-slate-500">{card.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-slate-900 p-4">
              <div className="flex items-center justify-between">
                <p className="m-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Observed access matrix</p>
                <span className="font-mono text-[10px] text-sky-300">hover in workspace</span>
              </div>
              <div className="mt-4 grid grid-cols-12 gap-1.5">
                {Array.from({ length: 72 }, (_, index) => {
                  const intensity = (index * 7 + Math.floor(index / 12) * 3) % 10;
                  const colors = ["bg-slate-800", "bg-blue-950", "bg-blue-900", "bg-blue-700", "bg-cyan-500", "bg-teal-400"];
                  return <span key={index} className={`aspect-square rounded-[2px] ${colors[Math.min(5, Math.floor(intensity / 2))]}`} />;
                })}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-slate-400">Shared global-counter write</span>
                <span className="font-mono font-semibold text-amber-300">MPF-PERF-001</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-lg border border-teal-400/20 bg-teal-400/10 px-4 py-3">
              <span className="text-sm text-slate-200">Revision gas delta</span>
              <span className="font-mono text-lg font-semibold text-emerald-300">−28,074</span>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="m-0 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">One complete loop</p>
            <h2 className="mb-0 mt-3 text-3xl font-semibold tracking-[-0.055em] text-slate-950 sm:text-4xl">From a source file to an engineering decision.</h2>
          </div>
          <Link href="/profile" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
            Open the workspace →
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {workflow.map(step => (
            <article key={step.number} className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
              <p className="m-0 font-mono text-xs font-semibold tracking-[0.16em] text-blue-700">{step.number}</p>
              <h3 className="mb-0 mt-10 text-xl font-semibold tracking-[-0.035em] text-slate-950">{step.title}</h3>
              <p className="mb-0 mt-3 text-sm leading-6 text-slate-600">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="evidence" className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:px-12">
          <div>
            <p className="m-0 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Evidence boundary</p>
            <h2 className="mb-0 mt-3 text-3xl font-semibold tracking-[-0.055em] text-slate-950">Separate facts from recommendations.</h2>
            <p className="mb-0 mt-4 max-w-md text-sm leading-6 text-slate-600">
              The report makes the measurement boundary visible, so a developer can decide what to trust and what to test next.
            </p>
          </div>
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
            {evidence.map(([label, body], index) => (
              <div key={label} className="grid gap-3 px-5 py-5 sm:grid-cols-[130px_1fr] sm:items-center">
                <span className={`font-mono text-xs font-semibold uppercase tracking-[0.14em] ${index === 0 ? "text-blue-700" : index === 1 ? "text-teal-700" : "text-amber-700"}`}>
                  {label}
                </span>
                <p className="m-0 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="rounded-2xl bg-blue-700 px-6 py-10 text-center shadow-xl shadow-blue-700/20 sm:px-12">
          <p className="m-0 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">Ready when your contract is</p>
          <h2 className="mb-0 mt-3 text-3xl font-semibold tracking-[-0.055em] text-white sm:text-4xl">Profile. Understand. Optimize. Re-profile.</h2>
          <p className="mx-auto mb-0 mt-4 max-w-2xl text-sm leading-6 text-blue-100">
            Start with one `.sol` file and a state-changing call. MProfiler keeps the workload and evidence attached to the decision.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/profile" className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-blue-800 shadow-sm hover:bg-blue-50">
              Launch profiler
            </Link>
            <a href="https://youtu.be/E0OgbbPYkLk" target="_blank" rel="noreferrer" className="rounded-md border border-blue-300 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-600">
              Watch demo ↗
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
