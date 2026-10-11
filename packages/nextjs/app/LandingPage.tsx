import Link from "next/link";

const matrix = Array.from({ length: 96 }, (_, index) => {
  const activity = (index * 11 + Math.floor(index / 12) * 5) % 13;
  if (activity < 3) return "bg-slate-100";
  if (activity < 6) return "bg-blue-100";
  if (activity < 9) return "bg-blue-300";
  if (activity < 11) return "bg-blue-500";
  return "bg-slate-950";
});

const capabilities = [
  ["⌁", "Trace evidence"],
  ["▣", "Hot storage slots"],
  ["↗", "Revision comparison"],
  ["✦", "AI handoff"],
];

export default function LandingPage() {
  return (
    <main className="min-h-full bg-white text-[#111113]">
      <section className="mx-auto max-w-[1500px] px-5 pb-14 pt-16 sm:px-8 lg:px-12 lg:pb-24 lg:pt-24">
        <div className="mx-auto max-w-5xl text-center">
          <p className="m-0 text-sm font-semibold tracking-[-0.02em] text-blue-700">
            MProfiler for Solidity developers
          </p>
          <h1 className="mb-0 mt-5 text-5xl font-semibold leading-[0.92] tracking-[-0.075em] text-[#111113] sm:text-7xl lg:text-[88px]">
            Build contracts that
            <br />
            prove their performance.
          </h1>
          <p className="mx-auto mb-0 mt-7 max-w-2xl text-base leading-7 tracking-[-0.025em] text-slate-500 sm:text-xl sm:leading-8">
            Profile real Solidity workloads, inspect storage evidence, and validate every revision before it reaches
            Monad Testnet.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/profile"
              className="rounded-xl bg-[#111113] px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Start profiling
            </Link>
            <a
              href="https://youtu.be/E0OgbbPYkLk"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Watch 3-min demo ↗
            </a>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
              Local EVM receipts
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
              Storage traces
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
              Evidence-bound AI review
            </span>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-[#f8fafc] px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1260px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-2 pb-4 sm:px-3">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-700 text-sm font-bold text-white">
                M
              </span>
              <div>
                <p className="m-0 text-sm font-semibold tracking-[-0.025em] text-slate-950">Profile report</p>
                <p className="mb-0 mt-0.5 text-xs text-slate-400">SloppyVault.sol · local Hardhat EVM</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              24 / 24 traces complete
              <span className="ml-2 rounded-md border border-slate-200 px-2 py-1 font-mono text-[10px] text-slate-600">
                RUN 0x8F2…3C1
              </span>
            </div>
          </div>

          <div className="grid gap-4 p-2 pt-5 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="m-0 text-sm font-semibold text-slate-950">Observed workload</p>
                  <p className="mb-0 mt-1 text-xs text-slate-400">Storage reads and writes across controlled calls</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                  LOCAL MEASUREMENT
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  ["Receipt gas", "128,440", "Actual EVM receipt"],
                  ["Storage accesses", "34", "SLOAD + SSTORE"],
                  ["Hot slots", "3", "Trace-derived"],
                ].map(([label, value, note]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3 sm:p-4">
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
                    <p className="mb-0 mt-2 text-2xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-3xl">
                      {value}
                    </p>
                    <p className="mb-0 mt-1 text-[10px] text-slate-400">{note}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="m-0 text-xs font-semibold text-slate-700">Observed access matrix</p>
                  <p className="m-0 font-mono text-[10px] text-slate-400">slot intensity</p>
                </div>
                <div className="mt-4 grid grid-cols-12 gap-1.5">
                  {matrix.map((color, index) => (
                    <span key={index} className={`aspect-square rounded-[3px] ${color}`} />
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">Global counter · 20 observed accesses</span>
                  <span className="font-semibold text-blue-700">Inspect every slot →</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col rounded-xl border border-slate-200 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="m-0 text-sm font-semibold text-slate-950">Revision result</p>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                  SAME INPUTS
                </span>
              </div>
              <div className="mt-7">
                <p className="m-0 text-xs text-slate-400">Measured gas delta</p>
                <p className="mb-0 mt-2 text-4xl font-semibold tracking-[-0.07em] text-emerald-600">−28,074</p>
                <p className="mb-0 mt-1 text-xs text-slate-500">under an identical call manifest and reset state</p>
              </div>
              <div className="mt-7 border-t border-slate-100 pt-5">
                <p className="m-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                  MPF-PERF-001
                </p>
                <p className="mb-0 mt-2 text-sm font-semibold leading-5 text-slate-950">
                  Shared counter may concentrate writes
                </p>
                <p className="mb-0 mt-2 text-xs leading-5 text-slate-500">
                  Multiple observed calls accessed the same storage slot. The handoff includes the trace evidence and
                  constraints.
                </p>
              </div>
              <Link href="/profile" className="mt-auto pt-7 text-sm font-semibold text-blue-700 hover:text-blue-800">
                Open profiling workspace →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-[1200px] px-5 py-20 text-center sm:px-8 lg:py-28">
        <p className="m-0 text-sm font-semibold text-blue-700">Everything needed for one clean loop</p>
        <h2 className="mb-0 mt-3 text-3xl font-semibold tracking-[-0.055em] text-slate-950 sm:text-5xl">
          From code to evidence to a better revision.
        </h2>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map(([icon, label]) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-lg font-semibold text-slate-800">
                {icon}
              </span>
              <span className="text-sm font-semibold text-slate-800">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-[#f8fafc] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
          <div>
            <p className="m-0 text-sm font-semibold text-blue-700">Monad, used carefully</p>
            <h2 className="mb-0 mt-3 text-4xl font-semibold leading-[0.98] tracking-[-0.065em] text-slate-950 sm:text-5xl">
              From a local trace to a verifiable Monad record.
            </h2>
            <p className="mb-0 mt-5 max-w-lg text-sm leading-6 text-slate-600">
              Profiling stays local and reproducible. Monad is where a developer proves who published a specific profile
              report and where anyone can verify its evidence fingerprint.
            </p>
            <div className="mt-7 space-y-3">
              {[
                [
                  "01",
                  "Local evidence",
                  "Compile in an isolated EVM and capture receipt gas plus normalized storage accesses.",
                ],
                [
                  "02",
                  "Monad Testnet",
                  "Validate wallet deployment, submitted transactions, receipts, events, and available QuickNode traces.",
                ],
                [
                  "03",
                  "Monad Mainnet",
                  "Publish a report hash through the attestation registry after the Testnet journey is proven.",
                ],
              ].map(([number, title, body]) => (
                <div key={number} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4">
                  <span className="font-mono text-xs font-semibold text-blue-700">{number}</span>
                  <div>
                    <p className="m-0 text-sm font-semibold text-slate-950">{title}</p>
                    <p className="mb-0 mt-1 text-xs leading-5 text-slate-500">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.1)] sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="m-0 text-sm font-semibold text-slate-950">Verifiable profile record</p>
                <p className="mb-0 mt-1 text-xs text-slate-400">
                  The Mainnet attestation is deliberately small and public.
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                Mainnet path
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {[
                ["Profile report", "source hash · compiler version · workload manifest · trace summary"],
                ["Keccak-256 fingerprint", "one deterministic hash for the complete canonical report"],
                ["Monad attestation", "publisher address · timestamp · optional evidence URI"],
                ["Public verification", "recompute the hash, read the event, and compare the record"],
              ].map(([label, body], index) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-50 text-[10px] font-semibold text-blue-700">
                    {index + 1}
                  </span>
                  <div>
                    <p className="m-0 text-sm font-semibold text-slate-800">{label}</p>
                    <p className="mb-0 mt-0.5 text-xs leading-5 text-slate-500">{body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl bg-slate-950 px-4 py-3 font-mono text-[11px] leading-5 text-slate-300">
              report.json → keccak256(report) → ProfileAttested(reportHash, publisher, timestamp, evidenceUri)
            </div>
          </div>
        </div>
      </section>

      <section id="evidence" className="border-t border-slate-200 bg-[#111113] px-5 py-16 text-center sm:px-8 lg:py-20">
        <p className="m-0 text-sm font-semibold text-blue-300">Evidence stays honest</p>
        <h2 className="mx-auto mb-0 mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.055em] text-white sm:text-5xl">
          Measure locally. Derive carefully. Verify publicly.
        </h2>
        <p className="mx-auto mb-0 mt-5 max-w-2xl text-sm leading-6 text-slate-400">
          Receipt gas and trace accesses are measured. Hot slots and dependency edges are derived. Monad Testnet is used
          for bounded deployment and attestation verification.
        </p>
        <Link
          href="/profile"
          className="mt-8 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
        >
          Start with your .sol file
        </Link>
      </section>
    </main>
  );
}
