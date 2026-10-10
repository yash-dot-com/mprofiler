const storageKey = "mprofiler.profile-result.v1";

export type StoredProfileResult = {
  job: unknown;
  report: unknown;
  savedAt: string;
};

export function loadStoredProfileResult(): StoredProfileResult | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    if (!value || typeof value !== "object") return null;
    const saved = value as Partial<StoredProfileResult>;
    if (!saved.job || !saved.report || typeof saved.savedAt !== "string") return null;
    return saved as StoredProfileResult;
  } catch {
    return null;
  }
}

export function saveProfileResult(job: unknown, report: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ job, report, savedAt: new Date().toISOString() }));
  } catch {
    // Browser storage may be disabled or full. The live report remains usable for this session.
  }
}

export function clearStoredProfileResult() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Storage is optional for the profiler workflow.
  }
}
