import { forwardToWorker, readJsonLimited } from "../_worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readJsonLimited(request, 128_000);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Expected a profiling job object." }, { status: 400 });
  }

  const requestBody = body as Record<string, unknown>;
  if (requestBody.mode === "contract") {
    if (Object.keys(requestBody).some(key => !["mode", "baseline", "revision", "workload"].includes(key))) {
      return Response.json({ error: "Unexpected contract profiling request fields." }, { status: 400 });
    }
    const hasSource = (value: unknown): value is { source: string } =>
      Boolean(value) &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as { source?: unknown }).source === "string" &&
      (value as { source: string }).source.length > 0 &&
      (value as { source: string }).source.length <= 64_000;
    if (!hasSource(requestBody.baseline) || (requestBody.revision !== undefined && !hasSource(requestBody.revision))) {
      return Response.json(
        { error: "Provide a baseline Solidity source file up to 64 KB, plus an optional revision." },
        { status: 400 },
      );
    }
    const workload = requestBody.workload;
    if (!workload || typeof workload !== "object" || Array.isArray(workload)) {
      return Response.json({ error: "Provide a contract workload manifest." }, { status: 400 });
    }
    const manifest = workload as Record<string, unknown>;
    if (
      typeof manifest.contractName !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(manifest.contractName) ||
      !Array.isArray(manifest.constructorArgs) ||
      !Array.isArray(manifest.calls) ||
      manifest.calls.length < 1 ||
      manifest.calls.length > 20
    ) {
      return Response.json(
        { error: "The workload needs a contract name, constructor arguments, and one to twenty call definitions." },
        { status: 400 },
      );
    }
    return forwardToWorker("/jobs", "POST", requestBody);
  }
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
