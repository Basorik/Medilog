import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RelayRequest } from "./relay";

// The relay core: access token, safety screen before any model call,
// decline handling and outcome counters. The model is a local stand-in.

let server: Server;
let modelCalls = 0;
let reply: unknown = {};
const TOKEN = "beta-token-0123456789abcdef";

beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      modelCalls++;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  Object.assign(process.env, {
    MEDILOG_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "test-key",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    MEDILOG_ACCESS_TOKEN: TOKEN,
  });
});

afterAll(() => server.close());

const req = (path: string, body: unknown, headers: Record<string, string> = {}, method = "POST"): RelayRequest => ({
  method,
  path,
  headers,
  body: typeof body === "string" ? body : JSON.stringify(body),
  ip: "203.0.113.7",
});
const auth = { "x-medilog-token": TOKEN };

const ok = (json: unknown) => ({
  id: "m",
  type: "message",
  role: "assistant",
  model: "claude-haiku-5-5",
  content: [{ type: "text", text: JSON.stringify(json) }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

describe("relay", () => {
  it("status is public and says where notes are processed", async () => {
    const { handle } = await import("./relay");
    const res = await handle(req("/api/status", "", {}, "GET"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ai: true, provider: "anthropic", processor: expect.stringContaining("outside Australia") });
  });

  it("rejects model calls without the access token", async () => {
    const { handle } = await import("./relay");
    const before = modelCalls;
    expect((await handle(req("/api/extract", { text: "pelvic pain" }))).status).toBe(401);
    expect((await handle(req("/api/extract", { text: "pelvic pain" }, { "x-medilog-token": "wrong" }))).status).toBe(401);
    expect(modelCalls).toBe(before);
  });

  it("blocks red-flag notes before any model call", async () => {
    const { handle } = await import("./relay");
    const before = modelCalls;
    const res = await handle(req("/api/extract", { text: "Crushing pressure in my chest and my jaw aches" }, auth));
    expect(res.status).toBe(409);
    expect(modelCalls).toBe(before);
  });

  it("rejects malformed and oversized bodies", async () => {
    const { handle } = await import("./relay");
    expect((await handle(req("/api/extract", "{not json", auth))).status).toBe(400);
    expect((await handle(req("/api/extract", "x".repeat(70_000), auth))).status).toBe(413);
  });

  it("returns declines with their category and counts outcomes, never content", async () => {
    const { handle } = await import("./relay");
    reply = { ...ok({}), content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms", explanation: null } };
    const res = await handle(req("/api/extract", { text: "Pain after sex again, about a 6" }, auth));
    expect(res).toEqual({ status: 422, body: { error: "model declined", category: "general_harms" } });

    reply = ok({ soapbox: ["x"], chiefComplaint: "y", sections: [] });
    expect((await handle(req("/api/report", { facts: { episodes: 3 } }, auth))).status).toBe(200);

    expect((await handle(req("/api/metrics", "", {}, "GET"))).status).toBe(401);
    const metrics = await handle(req("/api/metrics", "", auth, "GET"));
    expect(metrics.body).toMatchObject({ counts: { "extract.declined:general_harms": 1, "report.ok": 1 } });
    expect(JSON.stringify(metrics.body)).not.toMatch(/sex|pain/i);
  });
});
