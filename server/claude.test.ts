import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Exercises the real SDK calls against a local stand-in for the Messages API,
// checking the request we send and how the structured response is parsed.

let server: Server;
let lastBody: Record<string, unknown> = {};
let lastHeaders: Record<string, string | string[] | undefined> = {};
let reply: unknown = {};

const message = (model: string, json: unknown) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model,
  content: [{ type: "text", text: JSON.stringify(json) }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 1200, output_tokens: 300 },
});

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastBody = JSON.parse(raw);
      lastHeaders = req.headers;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterAll(() => server.close());

const term = (p: string, c = p) => ({ patient: p, clinical: c });

describe("Claude relay calls", () => {
  it("extraction: sends schema-constrained request and normalises the reply", async () => {
    const { extractWithClaude } = await import("./claude");
    reply = message("claude-haiku-5-5", {
      fields: {
        complaint: term("Pelvic pain", "Lower abdominal / pelvic pain"),
        site: term("Lower right side", "RLQ / right pelvis"),
        character: [term("Sharp")],
        radiation: null,
        onset: term("Woke me at 3 AM", "Woken from sleep ~03:00"),
        onsetTime: "03:00",
        nocturnal: true,
        duration: null,
        severity: 12,
        associated: [],
        negatives: [],
        exacerbating: [],
        relieving: [],
        treatments: [{ name: "Ibuprofen", dose: "×2", efficacy: "somewhat" }],
        functional: [],
        cycle: null,
      },
      followUp: {
        question: "Logged. Did the ibuprofen help?",
        targets: ["relief", "bogus"],
        options: [{ label: "Barely helped", patch: { treatmentEfficacy: "partial", addAssociated: [], addNegatives: [], severity: null, addFunctional: [], duration: null, site: null } }],
      },
    });
    const out = await extractWithClaude({ text: "Woke at 3 with sharp pain", loggedAt: "Thu 03:10", prior: null });
    expect(lastBody.model).toBe("claude-haiku-5-5");
    expect(lastBody.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    expect((lastBody.messages as { content: string }[])[0].content).toContain("<note>\nWoke at 3 with sharp pain\n</note>");
    expect(out.result.fields.severity).toBe(10);
    expect(out.result.fields.treatments[0].efficacy).toBe("unknown");
    expect(out.result.followUp?.targets).toEqual(["relief"]);
    expect(out.usage).toMatchObject({ model: "claude-haiku-5-5", inputTokens: 1200, outputTokens: 300 });
    expect(out.usage.costUsd).toBeCloseTo((1200 * 0.1 + 300 * 0.5) / 1e6);
  });

  it("report: uses server-side fallbacks and returns prose only", async () => {
    const { reportWithClaude } = await import("./claude");
    reply = message("claude-sonnet-5-5", {
      soapbox: ["I've had 12 episodes of sharp right-sided pelvic pain in 30 days."],
      chiefComplaint: "Recurrent R pelvic pain, 12 episodes / 30d",
      sections: [{ title: "Onset & course", lines: ["First logged 27 Sept."] }],
    });
    const out = await reportWithClaude({ episodes: 12 });
    expect(lastBody).toMatchObject({ model: "claude-sonnet-5-5", fallbacks: "default", output_config: { effort: "medium" } });
    expect(String(lastHeaders["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(out.prose.soapbox).toHaveLength(1);
    expect(out.usage.costUsd).toBeCloseTo((1200 * 2 + 300 * 10) / 1e6);
  });
});
