import Anthropic from "@anthropic-ai/sdk";
import { scrubPII, screenRedFlags } from "@medilog/engine";
import { timingSafeEqual } from "node:crypto";
import { aiConfigured, extractWithClaude, MODELS, ModelDeclined, PROCESSOR, PROVIDER, reportWithClaude } from "./claude";

// The relay's request handling, shared by the local Node server (index.ts) and
// AWS Lambda (lambda.ts). Stateless: it re-applies the on-device safety and
// privacy checks, forwards to the model, and keeps nothing. Request bodies and
// model output are never logged; only outcome counts are.

export interface RelayRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: string;
  ip: string;
}

export interface RelayResponse {
  status: number;
  body: unknown;
}

const TOKEN = process.env.MEDILOG_ACCESS_TOKEN ?? "";
const ON_LAMBDA = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
export const MAX_BODY = 64 * 1024;

// A deployed relay must have an access token: without one it refuses AI calls.
export const aiEnabled = aiConfigured() && process.env.MEDILOG_AI !== "off" && (!ON_LAMBDA || TOKEN.length >= 16);

// ---------------------------------------------------------------- access

function authorised(headers: RelayRequest["headers"]): boolean {
  if (!TOKEN) return true;
  const given = Buffer.from(headers["x-medilog-token"] ?? "");
  const want = Buffer.from(TOKEN);
  return given.length === want.length && timingSafeEqual(given, want);
}

// Per-IP budget. On Lambda this is per warm instance, so it's a speed bump;
// the real limits are the access token and the AWS budget alarm.
const hits = new Map<string, { n: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + 10 * 60_000 });
    return false;
  }
  return ++h.n > 120;
}

// ---------------------------------------------------------------- metrics

const started = new Date().toISOString();
const counts: Record<string, number> = {};

/**
 * Counts an outcome. On Lambda it is also written as a CloudWatch embedded
 * metric (namespace Medilog/Relay), so declines and errors can be graphed and
 * alarmed on. Only the endpoint, outcome and latency are recorded.
 */
function record(endpoint: "extract" | "report", outcome: string, ms: number) {
  const key = `${endpoint}.${outcome}`;
  counts[key] = (counts[key] ?? 0) + 1;
  if (!ON_LAMBDA) return;
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Medilog/Relay",
            Dimensions: [["Endpoint", "Outcome"]],
            Metrics: [
              { Name: "Requests", Unit: "Count" },
              { Name: "Latency", Unit: "Milliseconds" },
            ],
          },
        ],
      },
      Endpoint: endpoint,
      Outcome: outcome,
      Requests: 1,
      Latency: ms,
    }),
  );
}

// ---------------------------------------------------------------- handler

async function callModel(endpoint: "extract" | "report", run: () => Promise<unknown>): Promise<RelayResponse> {
  const t0 = Date.now();
  try {
    const out = await run();
    record(endpoint, "ok", Date.now() - t0);
    return { status: 200, body: out };
  } catch (err) {
    const ms = Date.now() - t0;
    if (err instanceof ModelDeclined) {
      record(endpoint, err.category ? `declined:${err.category}` : "unusable", ms);
      return { status: 422, body: { error: "model declined", category: err.category } };
    }
    if (err instanceof Anthropic.RateLimitError) {
      record(endpoint, "upstream-rate-limited", ms);
      return { status: 429, body: { error: "upstream rate limited" } };
    }
    if (err instanceof Anthropic.APIError) {
      // Status and error class only: enough to tell "model access not
      // enabled" (403) from a bad model ID (400/404) without logging content.
      console.error(`upstream error ${err.status} ${err.constructor.name}`);
      record(endpoint, `upstream-${err.status ?? "error"}`, ms);
      return { status: 502, body: { error: "upstream error" } };
    }
    console.error(`request failed: ${(err as Error).name}`);
    record(endpoint, "error", ms);
    return { status: 500, body: { error: "server error" } };
  }
}

export async function handle(req: RelayRequest): Promise<RelayResponse> {
  if (req.path === "/api/status") return { status: 200, body: { ai: aiEnabled, provider: PROVIDER, processor: PROCESSOR, models: MODELS } };
  if (req.path === "/api/metrics") {
    if (!authorised(req.headers)) return { status: 401, body: { error: "unauthorised" } };
    return { status: 200, body: { since: started, counts } };
  }
  if (req.path !== "/api/extract" && req.path !== "/api/report") return { status: 404, body: { error: "not found" } };
  if (req.method !== "POST") return { status: 405, body: { error: "method not allowed" } };
  if (!aiEnabled) return { status: 503, body: { error: "AI relay not configured" } };
  if (!authorised(req.headers)) return { status: 401, body: { error: "unauthorised" } };
  if (rateLimited(req.ip)) return { status: 429, body: { error: "rate limited" } };
  if (req.body.length > MAX_BODY) return { status: 413, body: { error: "body too large" } };

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(req.body || "{}");
  } catch {
    return { status: 400, body: { error: "invalid JSON" } };
  }

  if (req.path === "/api/extract") {
    const text = String(body.text ?? "").slice(0, 2000);
    if (!text.trim()) return { status: 400, body: { error: "empty note" } };
    const flag = screenRedFlags(text);
    if (flag) return { status: 409, body: { error: "red flag", redFlag: flag } };
    return callModel("extract", () =>
      extractWithClaude({ text: scrubPII(text).text, loggedAt: String(body.loggedAt ?? ""), prior: body.prior ? String(body.prior).slice(0, 300) : null }),
    );
  }
  return callModel("report", () => reportWithClaude(body.facts ?? {}));
}
