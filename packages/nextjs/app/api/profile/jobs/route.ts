import { forwardToWorker, readJsonLimited } from "../_worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readJsonLimited(request);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Expected a scenario workload object." }, { status: 400 });
  }

  const requestBody = body as Record<string, unknown>;
  if (
    requestBody.mode !== "scenarios" ||
    Object.keys(requestBody).some(
      key => !["mode", "batchSize", "controlledAccountCount", "revisionArtifact"].includes(key),
    )
  ) {
    return Response.json(
      { error: "Expected mode scenarios with optional batchSize, controlledAccountCount, and revisionArtifact." },
      { status: 400 },
    );
  }
  if (
    requestBody.batchSize !== undefined &&
    (!Number.isInteger(requestBody.batchSize) ||
      Number(requestBody.batchSize) < 1 ||
      Number(requestBody.batchSize) > 100)
  ) {
    return Response.json({ error: "batchSize must be an integer between 1 and 100." }, { status: 400 });
  }
  if (
    requestBody.controlledAccountCount !== undefined &&
    (!Number.isInteger(requestBody.controlledAccountCount) ||
      Number(requestBody.controlledAccountCount) < 2 ||
      Number(requestBody.controlledAccountCount) > 20)
  ) {
    return Response.json({ error: "controlledAccountCount must be an integer between 2 and 20." }, { status: 400 });
  }
  if (
    requestBody.revisionArtifact !== undefined &&
    (typeof requestBody.revisionArtifact !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(requestBody.revisionArtifact))
  ) {
    return Response.json({ error: "revisionArtifact must be a compiled Solidity contract name." }, { status: 400 });
  }

  return forwardToWorker("/jobs", "POST", {
    ...requestBody,
    batchSize: requestBody.batchSize ?? 5,
    controlledAccountCount:
      requestBody.controlledAccountCount ?? Math.min(Math.max(Number(requestBody.batchSize ?? 5), 2), 10),
  });
}
