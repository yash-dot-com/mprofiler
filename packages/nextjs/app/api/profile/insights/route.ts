import { readJsonLimited } from "../_worker";
import { type ProfilingEvidence, analyzeSolidity } from "~~/lib/mprofiler/insights";
import { generateOpenAIInsights } from "~~/lib/mprofiler/openaiInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readJsonLimited(request, 70_000);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Expected Solidity source and optional profiling evidence." }, { status: 400 });
  }
  const { source, evidence } = body as { source?: unknown; evidence?: unknown };
  if (typeof source !== "string" || source.trim().length === 0 || source.length > 64_000) {
    return Response.json(
      { error: "source must be a non-empty Solidity string no longer than 64 KB." },
      { status: 400 },
    );
  }
  if (evidence !== undefined && (typeof evidence !== "object" || evidence === null || Array.isArray(evidence))) {
    return Response.json({ error: "evidence must be an object when supplied." }, { status: 400 });
  }
  const deterministic = analyzeSolidity(source, (evidence ?? {}) as ProfilingEvidence);
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { ...deterministic, ai: { status: "unavailable", note: "Set OPENAI_API_KEY to enable the OpenAI review." } },
      { headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const ai = await generateOpenAIInsights({ source, evidence: deterministic.evidence, deterministic });
    return Response.json(
      { ...deterministic, analysis: "deterministic+ai", ai: { status: "completed", result: ai } },
      {
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    return Response.json(
      {
        ...deterministic,
        ai: { status: "failed", note: error instanceof Error ? error.message : "The OpenAI review failed." },
      },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
