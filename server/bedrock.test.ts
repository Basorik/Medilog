import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The Bedrock path of the relay, against a local stand-in for bedrock-runtime:
// checks the invoke URL, SigV4 signing, the body we send, and decline handling.

let server: Server;
let last: { url: string; auth: string; body: Record<string, unknown> } = { url: "", auth: "", body: {} };
let reply: unknown = {};

const message = (json: unknown, extra: Record<string, unknown> = {}) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-haiku-5-5",
  content: [{ type: "text", text: JSON.stringify(json) }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 1000, output_tokens: 200 },
  ...extra,
});

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      last = { url: req.url ?? "", auth: String(req.headers.authorization ?? ""), body: JSON.parse(raw) };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  Object.assign(process.env, {
    MEDILOG_PROVIDER: "bedrock",
    AWS_REGION: "ap-southeast-2",
    AWS_ACCESS_KEY_ID: "AKIATESTTESTTEST",
    AWS_SECRET_ACCESS_KEY: "test-secret",
    ANTHROPIC_BEDROCK_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  });
});

afterAll(() => server.close());

const fields = {
  complaint: null,
  site: null,
  character: [],
  radiation: null,
  onset: null,
  onsetTime: null,
  nocturnal: false,
  duration: null,
  severity: 6,
  associated: [],
  negatives: [],
  exacerbating: [],
  relieving: [],
  treatments: [],
  functional: [],
  cycle: null,
};

describe("Bedrock provider", () => {
  it("defaults to the Australian profile and describes the processor", async () => {
    const { MODELS, PROCESSOR, PROVIDER } = await import("./claude");
    expect(PROVIDER).toBe("bedrock");
    expect(MODELS).toEqual({ extract: "au.anthropic.claude-haiku-5-5", report: "au.anthropic.claude-sonnet-5-5" });
    expect(PROCESSOR).toBe("Amazon Bedrock in Australia");
  });

  it("extraction: signed InvokeModel call with structured output, priced with the regional premium", async () => {
    const { extractWithClaude } = await import("./claude");
    reply = message({ fields, followUp: null });
    const out = await extractWithClaude({ text: "Pelvic pain about a 6", loggedAt: "Tue 09:30", prior: null });
    expect(last.url).toBe("/model/au.anthropic.claude-haiku-5-5/invoke");
    expect(last.auth).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIATESTTESTTEST\/\d{8}\/ap-southeast-2\/bedrock\/aws4_request/);
    expect(last.body.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    expect(last.body).toHaveProperty("anthropic_version");
    expect(out.result.fields.severity).toBe(6);
    expect(out.usage.costUsd).toBeCloseTo(((1000 * 0.1 + 200 * 0.5) / 1e6) * 1.1);
  });

  it("report: no server-side fallback parameters on Bedrock", async () => {
    const { reportWithClaude } = await import("./claude");
    reply = message({ soapbox: ["I've had 12 episodes."], chiefComplaint: "Recurrent pelvic pain", sections: [] });
    await reportWithClaude({ episodes: 12 });
    expect(last.url).toBe("/model/au.anthropic.claude-sonnet-5-5/invoke");
    expect(last.body).not.toHaveProperty("fallbacks");
    expect(last.body).not.toHaveProperty("betas");
  });

  it("surfaces a safeguard decline with its category and no content", async () => {
    const { extractWithClaude, ModelDeclined } = await import("./claude");
    reply = message({}, { content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms", explanation: null } });
    const err = await extractWithClaude({ text: "x", loggedAt: "", prior: null }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelDeclined);
    expect((err as InstanceType<typeof ModelDeclined>).category).toBe("general_harms");
  });
});
