"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { loadStoredProfileResult } from "~~/lib/mprofiler/profileStorage";

const routeFor = (path: "/compare" | "/insights", jobId: string | null) => (jobId ? `${path}?job=${jobId}` : path);

export function FlowNavigation() {
  const pathname = usePathname();
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadStoredProfileResult();
    const job = saved?.job as { id?: unknown } | undefined;
    if (typeof job?.id === "string") setJobId(job.id);
  }, []);

  const links = [
    { label: "Profile", href: "/profile", active: pathname === "/profile" },
    { label: "Compare", href: routeFor("/compare", jobId), active: pathname === "/compare" },
    { label: "Insights", href: routeFor("/insights", jobId), active: pathname === "/insights" },
  ];

  return (
    <nav
      aria-label="Profiler workflow"
      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1"
    >
      {links.map(link => (
        <Link
          key={link.label}
          href={link.href}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
            link.active ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:bg-white hover:text-slate-900"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
