import Anthropic from "@anthropic-ai/sdk";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { scrubPII, screenRedFlags } from "@medilog/engine";
import { extractWithClaude, MODELS, ModelDeclined, reportWithClaude } from "./claude";

// Stateless relay. It holds the API key, re-applies the on-device safety and
// privacy checks as defence in depth, and forwards to the model. Request bodies
// are never logged or stored.

const PORT = Number(process.env.PORT ?? 8787);
const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const MAX_BODY = 64 * 1024;
const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) && process.env.MEDILOG_AI !== "off";

// Small per-IP budget so a public demo URL can't run up the bill.
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

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function handleApi(req: IncomingMessage, res: ServerResponse, path: string) {
  if (path === "/api/status") return send(res, 200, { ai: aiEnabled, models: MODELS });
  if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });
  if (!aiEnabled) return send(res, 503, { error: "AI relay not configured" });
  if (rateLimited(req.socket.remoteAddress ?? "?")) return send(res, 429, { error: "rate limited" });

  const body = await readJson(req);
  if (path === "/api/extract") {
    const text = String(body.text ?? "").slice(0, 2000);
    if (!text.trim()) return send(res, 400, { error: "empty note" });
    const flag = screenRedFlags(text);
    if (flag) return send(res, 409, { error: "red flag", redFlag: flag });
    const out = await extractWithClaude({
      text: scrubPII(text).text,
      loggedAt: String(body.loggedAt ?? ""),
      prior: body.prior ? String(body.prior).slice(0, 300) : null,
    });
    return send(res, 200, out);
  }
  if (path === "/api/report") {
    const out = await reportWithClaude(body.facts ?? {});
    return send(res, 200, out);
  }
  return send(res, 404, { error: "not found" });
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

function serveStatic(res: ServerResponse, path: string) {
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) return send(res, 403, { error: "forbidden" });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  if (!existsSync(file)) return send(res, 404, { error: "run `npm run build` first" });
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  try {
    if (path.startsWith("/api/")) return await handleApi(req, res, path);
    return serveStatic(res, path);
  } catch (err) {
    // Log the failure class only, never the request content.
    if (err instanceof ModelDeclined) return send(res, 422, { error: "model declined" });
    if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: "upstream rate limited" });
    if (err instanceof Anthropic.APIError) {
      console.error(`upstream error ${err.status}`);
      return send(res, 502, { error: "upstream error" });
    }
    console.error(`request failed: ${(err as Error).name}`);
    return send(res, 500, { error: "server error" });
  }
}).listen(PORT, () => {
  console.log(`Medilog relay on http://localhost:${PORT} · AI ${aiEnabled ? `on (${MODELS.extract} / ${MODELS.report})` : "off: on-device engine only"}`);
});
