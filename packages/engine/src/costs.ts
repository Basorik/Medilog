import type { Usage } from "./types";

// USD per million tokens (Claude API list prices, prompts ≤100K tokens).
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export function priceUsage(model: string, inputTokens: number, outputTokens: number, estimated = false): Usage {
  const p = PRICING[model] ?? PRICING["claude-sonnet-5-5"];
  return {
    model,
    inputTokens,
    outputTokens,
    costUsd: (inputTokens * p.input + outputTokens * p.output) / 1_000_000,
    estimated,
  };
}

/** Rough token estimate for the on-device engine's "what this would cost in the cloud" readout. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 4);

export const fmtUsd = (usd: number) =>
  usd === 0 ? "$0" : usd < 0.01 ? `$${usd.toFixed(5)}` : `$${usd.toFixed(3)}`;
