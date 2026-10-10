import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.MPROFILER_WORKER_HOST ?? "127.0.0.1";
const port = Number(process.env.MPROFILER_WORKER_PORT ?? process.env.PORT ?? 4012);
const token = process.env.MPROFILER_WORKER_TOKEN;
const timeoutMs = Number(process.env.MPROFILER_JOB_TIMEOUT_MS ?? 30_000);
const queueLimit = 3;
const maxRetainedJobs = 20;
const retentionMs = 15 * 60_000;
const expiredRetentionMs = 60_000;
const maxRequestBytes = 128_000;
const maxOutputBytes = 1_000_000;
const maxReportBytes = 15_000_000;
const maxTraceBytes = 50_000_000;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const jobs = new Map();
const queue = [];
let active = false;

if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("MPROFILER_WORKER_PORT must be a valid TCP port.");
if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 5 * 60_000) {
  throw new Error("MPROFILER_JOB_TIMEOUT_MS must be between 1000 and 300000.");
}
if (!token || token.length < 24) throw new Error("Set MPROFILER_WORKER_TOKEN to a random value of at least 24 characters.");

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error,
  };
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    let tooLarge = false;
    request.on("data", chunk => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > maxRequestBytes) {
        tooLarge = true;
        rejectBody(new Error("Request body exceeds the worker limit."));
      }
    });
    request.on("end", () => {
      try {
        resolveBody(JSON.parse(body));
      } catch {
        rejectBody(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", rejectBody);
  });
}

async function runProfileJob(job) {
  job.status = "running";
  job.updatedAt = new Date().toISOString();
  let directory;

  try {
    directory = await mkdtemp(resolve(tmpdir(), "mprofiler-job-"));
    const reportPath = resolve(directory, "report.json");
    const tracePath = resolve(directory, "traces.json");
    const contractJobPath = resolve(directory, "contract-job.json");
    if (job.mode === "contract") await writeFile(contractJobPath, JSON.stringify(job.contractJob));

    await new Promise((resolveProcess, rejectProcess) => {
      const child = spawn(
        "yarn",
        ["workspace", "@se-2/hardhat", job.mode === "contract" ? "profile:contract" : "profile:scenarios"],
        {
          cwd: root,
          env: {
            ...process.env,
            MPROFILER_REPORT_PATH: reportPath,
            MPROFILER_RAW_TRACE_PATH: tracePath,
            MPROFILER_BATCH_SIZE: String(job.batchSize),
            MPROFILER_ACCOUNT_COUNT: String(job.controlledAccountCount),
            MPROFILER_REVISION_ARTIFACT: job.revisionArtifact ?? "",
            MPROFILER_CONTRACT_JOB_PATH: job.mode === "contract" ? contractJobPath : "",
          },
          detached: process.platform !== "win32",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let outputBytes = 0;
      let output = "";
      let timedOut = false;
      let outputExceeded = false;
      const killProcessTree = () => {
        try {
          if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      };
      const workloadSize = job.mode === "contract"
        ? job.contractJob.workload.calls.reduce((total, call) => total + call.repeat, 0)
        : job.batchSize;
      const jobTimeoutMs = Math.min(300_000, Math.max(timeoutMs, 10_000 + workloadSize * 2_000));
      const timer = setTimeout(() => {
        timedOut = true;
        killProcessTree();
      }, jobTimeoutMs);

      const collect = chunk => {
        outputBytes += chunk.length;
        if (outputBytes > maxOutputBytes) {
          outputExceeded = true;
          killProcessTree();
          return;
        }
        output += chunk.toString();
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.on("error", error => {
        clearTimeout(timer);
        rejectProcess(error);
      });
      child.on("close", code => {
        clearTimeout(timer);
        if (timedOut) return rejectProcess(new Error("Profiler worker timed out."));
        if (outputExceeded) return rejectProcess(new Error("Profiler output exceeded the worker limit."));
        if (code !== 0) {
          const message = output.slice(-2_000).trim();
          return rejectProcess(new Error(message || `Profiler process exited with status ${code}.`));
        }
        resolveProcess();
      });
    });

    const [reportStats, traceStats] = await Promise.all([stat(reportPath), stat(tracePath)]);
    if (reportStats.size > maxReportBytes) throw new Error("Profiler report exceeded the worker limit.");
    if (traceStats.size > maxTraceBytes) throw new Error("Profiler trace exceeded the worker limit.");
    job.report = JSON.parse(await readFile(reportPath, "utf8"));
    job.status = "completed";
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Profiler process failed.";
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
    job.updatedAt = new Date().toISOString();
  }
}

function expireOldJobs(now = Date.now()) {
  for (const [id, job] of jobs) {
    const age = now - Date.parse(job.createdAt);
    if (age < retentionMs || job.status === "running") continue;
    if (job.status !== "expired") {
      job.status = "expired";
      job.report = null;
      job.error = null;
      job.updatedAt = new Date(now).toISOString();
      job.expiredAt = now;
    } else if (now - job.expiredAt >= expiredRetentionMs) {
      jobs.delete(id);
    }
  }
}

async function drainQueue() {
  if (active) return;
  const job = queue.shift();
  if (!job) return;
  active = true;
  try {
    await runProfileJob(job);
  } finally {
    active = false;
    void drainQueue();
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateContractRequest(body) {
  if (!isRecord(body) || body.mode !== "contract"
    || Object.keys(body).some(key => !["mode", "baseline", "revision", "workload"].includes(key))) {
    return { error: "Expected mode contract with baseline source, optional revision source, and a workload manifest." };
  }
  const source = value => isRecord(value) && typeof value.source === "string" && value.source.length > 0 && value.source.length <= 64_000;
  if (!source(body.baseline) || (body.revision !== undefined && !source(body.revision))) {
    return { error: "baseline and revision must contain Solidity source strings no larger than 64 KB." };
  }
  if (!isRecord(body.workload) || typeof body.workload.contractName !== "string"
    || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(body.workload.contractName)
    || !Array.isArray(body.workload.constructorArgs) || !Array.isArray(body.workload.calls)
    || body.workload.calls.length < 1 || body.workload.calls.length > 20) {
    return { error: "workload requires a contractName, constructorArgs array, and one to twenty calls." };
  }
  const calls = [];
  for (const call of body.workload.calls) {
    if (!isRecord(call) || typeof call.function !== "string" || call.function.length < 1 || call.function.length > 160
      || !Array.isArray(call.args) || !Number.isInteger(call.caller) || call.caller < 0 || call.caller > 19
      || !Number.isInteger(call.repeat) || call.repeat < 1 || call.repeat > 20
      || (call.label !== undefined && (typeof call.label !== "string" || call.label.length > 80))) {
      return { error: "Each workload call needs function, args, caller (0–19), repeat (1–20), and an optional short label." };
    }
    calls.push({ function: call.function, args: call.args, caller: call.caller, repeat: call.repeat, ...(call.label ? { label: call.label } : {}) });
  }
  if (calls.reduce((total, call) => total + call.repeat, 0) > 100) {
    return { error: "The contract workload may contain at most 100 total call repetitions." };
  }
  return {
    value: {
      mode: "contract",
      baseline: { source: body.baseline.source },
      ...(body.revision ? { revision: { source: body.revision.source } } : {}),
      workload: { contractName: body.workload.contractName, constructorArgs: body.workload.constructorArgs, calls },
    },
  };
}

const server = createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`) return sendJson(response, 401, { error: "Unauthorized." });

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "POST" && url.pathname === "/jobs") {
    expireOldJobs();
    let body;
    try {
      body = await readRequestBody(request);
    } catch (error) {
      return sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid request." });
    }
    if (body?.mode === "contract") {
      const parsed = validateContractRequest(body);
      if (parsed.error) return sendJson(response, 400, { error: parsed.error });
      if (queue.length >= queueLimit) return sendJson(response, 429, { error: "The profiling queue is full. Try again shortly." });
      if (jobs.size >= maxRetainedJobs) return sendJson(response, 429, { error: "The worker's retained job limit is full. Try again shortly." });
      const now = new Date().toISOString();
      const job = {
        id: randomUUID(), status: "queued", createdAt: now, updatedAt: now, expiredAt: null, error: null, report: null,
        mode: "contract", contractJob: parsed.value,
      };
      jobs.set(job.id, job);
      queue.push(job);
      void drainQueue();
      return sendJson(response, 202, publicJob(job));
    }
    if (body?.mode !== "scenarios" || Object.keys(body).some(key => !["mode", "batchSize", "controlledAccountCount", "revisionArtifact"].includes(key))) {
      return sendJson(response, 400, { error: "Expected mode scenarios with optional batchSize, controlledAccountCount, and revisionArtifact." });
    }
    const batchSize = body.batchSize ?? 5;
    const controlledAccountCount = body.controlledAccountCount ?? Math.min(Math.max(batchSize, 2), 10);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
      return sendJson(response, 400, { error: "batchSize must be an integer between 1 and 100." });
    }
    if (!Number.isInteger(controlledAccountCount) || controlledAccountCount < 2 || controlledAccountCount > 20) {
      return sendJson(response, 400, { error: "controlledAccountCount must be an integer between 2 and 20." });
    }
    const revisionArtifact = body.revisionArtifact;
    if (revisionArtifact !== undefined && (typeof revisionArtifact !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(revisionArtifact))) {
      return sendJson(response, 400, { error: "revisionArtifact must be a compiled Solidity contract name." });
    }
    if (queue.length >= queueLimit) return sendJson(response, 429, { error: "The profiling queue is full. Try again shortly." });
    if (jobs.size >= maxRetainedJobs) return sendJson(response, 429, { error: "The worker's retained job limit is full. Try again shortly." });

    const now = new Date().toISOString();
    const job = { id: randomUUID(), status: "queued", createdAt: now, updatedAt: now, expiredAt: null, error: null, report: null, mode: "scenarios", batchSize, controlledAccountCount, revisionArtifact };
    jobs.set(job.id, job);
    queue.push(job);
    void drainQueue();
    return sendJson(response, 202, publicJob(job));
  }

  const match = url.pathname.match(/^\/jobs\/([0-9a-f-]+)(\/report)?$/i);
  if (request.method === "GET" && match) {
    expireOldJobs();
    const job = jobs.get(match[1]);
    if (!job) return sendJson(response, 404, { error: "Job not found or expired." });
    if (match[2] === "/report") {
      if (job.status !== "completed") return sendJson(response, 409, { error: "Report is not ready.", status: job.status });
      return sendJson(response, 200, job.report);
    }
    return sendJson(response, 200, publicJob(job));
  }

  sendJson(response, 404, { error: "Not found." });
});

setInterval(expireOldJobs, 60_000).unref();

server.listen(port, host, () => {
  console.log(`MProfiler worker listening at http://${host}:${port}`);
});
