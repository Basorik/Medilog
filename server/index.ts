import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS, PROCESSOR } from "./claude";
import { aiEnabled, handle, MAX_BODY } from "./relay";

// Local and single-container server: the relay API plus the built web demo.
// The deployed relay runs the same handler on AWS Lambda (lambda.ts).

const PORT = Number(process.env.PORT ?? 8787);
const DIST = fileURLToPath(new URL("../dist", import.meta.url));
// Behind a proxy or load balancer, trust its X-Forwarded-For for rate limiting.
const TRUST_PROXY = process.env.MEDILOG_TRUST_PROXY === "1";

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
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
    if (!path.startsWith("/api/")) return serveStatic(res, path);
    const body = await readBody(req);
    if (body === null) return send(res, 413, { error: "body too large" });
    const forwarded = TRUST_PROXY ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() : "";
    const out = await handle({
      method: req.method ?? "GET",
      path,
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
      body,
      ip: forwarded || req.socket.remoteAddress || "?",
    });
    return send(res, out.status, out.body);
  } catch (err) {
    console.error(`request failed: ${(err as Error).name}`);
    return send(res, 500, { error: "server error" });
  }
}).listen(PORT, () => {
  console.log(`Medilog relay on http://localhost:${PORT} · AI ${aiEnabled ? `on via ${PROCESSOR} (${MODELS.extract} / ${MODELS.report})` : "off: on-device engine only"}`);
});
