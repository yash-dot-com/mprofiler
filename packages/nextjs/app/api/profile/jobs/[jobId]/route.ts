import { forwardToWorker } from "../../_worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return Response.json({ error: "Invalid job ID." }, { status: 400 });
  return forwardToWorker(`/jobs/${encodeURIComponent(jobId)}`, "GET");
}
