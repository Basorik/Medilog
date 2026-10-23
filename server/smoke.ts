// One-shot check that the AI path works, with a synthetic note (no real data).
//
//   Direct to Bedrock with your AWS login (before deploying):
//     AWS_PROFILE=medilog MEDILOG_PROVIDER=bedrock npm run smoke
//   The deployed relay (after deploying):
//     npm run smoke -- --relay https://xxxx.lambda-url.ap-southeast-2.on.aws --token <token>

import Anthropic from "@anthropic-ai/sdk";
import { extractWithClaude, MODELS, ModelDeclined, PROCESSOR, PROVIDER, reportWithClaude } from "./claude";

const NOTE = "Woke at 3am with sharp cramping low on my right side, about a 7. Took two ibuprofen, didn't really help.";
const FACTS = { range: { label: "Last 30 days", days: 30 }, episodes: 4, severity: { median: 6, min: 4, max: 8 }, workDaysMissed: 1 };

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function hint(err: unknown): string {
  const name = (err as Error)?.name ?? "";
  if (/Credential|ExpiredToken|TokenRefresh/i.test(name) || /credential/i.test(String(err)))
    return "No usable AWS credentials. Run `aws sso login --profile medilog` and set AWS_PROFILE=medilog.";
  if (err instanceof Anthropic.PermissionDeniedError)
    return "Access denied (403). Either this model hasn't been enabled for the account yet (run one prompt in the Bedrock playground in Sydney, step 3 of deploy/aws/README.md) or this identity lacks bedrock:InvokeModel.";
  if (err instanceof Anthropic.NotFoundError || err instanceof Anthropic.BadRequestError)
    return "Bedrock rejected the request. Check the model IDs against Bedrock → Cross-region inference in ap-southeast-2 and set MEDILOG_EXTRACT_MODEL / MEDILOG_REPORT_MODEL if they differ.";
  if (err instanceof ModelDeclined) return `The model declined (category: ${err.category ?? "none"}). Unexpected for this synthetic note; please report it.`;
  return "Unexpected error; see above.";
}

async function direct() {
  console.log(`Provider: ${PROVIDER} · ${PROCESSOR}\nModels:   ${MODELS.extract} / ${MODELS.report}\n`);
  let failed = false;
  for (const [label, run] of [
    ["Extraction", () => extractWithClaude({ text: NOTE, loggedAt: "Tue 03:10", prior: null })],
    ["Report", () => reportWithClaude(FACTS)],
  ] as const) {
    const t0 = Date.now();
    try {
      const out = (await run()) as { usage: { model: string; inputTokens: number; outputTokens: number; costUsd: number } };
      console.log(`✓ ${label}: ${Date.now() - t0} ms · ${out.usage.inputTokens} in / ${out.usage.outputTokens} out · $${out.usage.costUsd.toFixed(5)}`);
    } catch (err) {
      failed = true;
      console.log(`✗ ${label} failed: ${(err as Error).name}: ${(err as Error).message.slice(0, 300)}\n  → ${hint(err)}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

async function relay(url: string, token: string) {
  const base = url.replace(/\/$/, "");
  const status = await (await fetch(`${base}/api/status`)).json();
  console.log("Status:", JSON.stringify(status));
  const t0 = Date.now();
  const res = await fetch(`${base}/api/extract`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-medilog-token": token },
    body: JSON.stringify({ text: NOTE, loggedAt: "Tue 03:10" }),
  });
  const body = (await res.json()) as { result?: { fields: { severity: number | null } }; usage?: { costUsd: number }; error?: string };
  if (res.ok) console.log(`✓ Extraction via relay: ${Date.now() - t0} ms · severity ${body.result?.fields.severity} · $${body.usage?.costUsd.toFixed(5)}`);
  else {
    console.log(`✗ Relay returned ${res.status}: ${JSON.stringify(body)}`);
    if (res.status === 401) console.log("  → The token doesn't match MEDILOG_ACCESS_TOKEN on the function.");
    if (res.status === 502) console.log("  → Bedrock refused the call. Check the function's CloudWatch logs for the upstream status (403 = model access or IAM).");
    if (res.status === 503) console.log("  → The function has no access token configured (or MEDILOG_AI=off).");
    process.exitCode = 1;
  }
}

const relayUrl = arg("relay");
if (relayUrl) await relay(relayUrl, arg("token") ?? process.env.MEDILOG_ACCESS_TOKEN ?? "");
else await direct();
