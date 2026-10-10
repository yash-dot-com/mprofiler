const WORKER_TIMEOUT_MS = 5_000;

export async function forwardToWorker(path: string, method: "GET" | "POST", body?: unknown) {
  const baseUrl = process.env.MPROFILER_WORKER_URL;
  const token = process.env.MPROFILER_WORKER_TOKEN;
  if (!baseUrl || !token) {
    return Response.json({ error: "The profiling worker is not configured." }, { status: 503 });
  }

  let url: URL;
  try {
    url = new URL(path, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported worker protocol.");
  } catch {
    return Response.json({ error: "The profiling worker URL is invalid." }, { status: 503 });
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
    });
    const responseBody = await response.json();
    if (response.status === 401) {
      return Response.json(
        { error: "The dashboard and profiling worker do not share the same connection token." },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(responseBody, { status: response.status, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "The profiling worker could not be reached." }, { status: 502 });
  }
}

export async function readJsonLimited(request: Request, maximumBytes = 4_096): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes)
    throw new Error("Request body exceeds the size limit.");

  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body is required.");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new Error("Request body exceeds the size limit.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
