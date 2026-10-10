const storageKey = "mprofiler.profile-result.v1";
const insightStorageKey = "mprofiler.insight-draft.v1";

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

export type StoredInsightDraft = {
  source: string;
  report: unknown | null;
  savedAt: string;
};

export function loadStoredInsightDraft(): StoredInsightDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(insightStorageKey) ?? "null");
    if (!value || typeof value !== "object") return null;
    const draft = value as Partial<StoredInsightDraft>;
    if (typeof draft.source !== "string" || typeof draft.savedAt !== "string") return null;
    return { source: draft.source, report: draft.report ?? null, savedAt: draft.savedAt };
  } catch {
    return null;
  }
}

export function saveInsightDraft(source: string, report: unknown | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      insightStorageKey,
      JSON.stringify({ source, report, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Draft persistence is optional when browser storage is unavailable.
  }
}
