# Research spike: on-device AI for Medilog

*October 2026 · Expo SDK 58 · question: can a model running on the phone replace or augment the rule-based engine, so testers get AI-quality notes without anything leaving the device?*

## Answer

**Yes, but only on recent phones, and not as a replacement for the rules.** The realistic design is layered:

1. The **rule engine always runs first.** It is instant, gives the red-flag screen, and is the fallback everywhere.
2. Where the phone has a **built-in model**, that model re-reads the note and fills in the structured fields. This means Apple Intelligence on iOS 26, or Gemini Nano on recent Android flagships.
3. **Claude via the relay stays opt-in** for everyone else.

The red-flag screen and every number in the appointment report stay deterministic in all modes.

For a user beta, I would not make on-device AI a launch requirement. Many testers' phones won't have a built-in model, and the path that covers them (downloading a 1–3 GB open model) is heavy for a symptom journal. Build it behind a flag, and measure it with the eval kit in `eval/` plus the in-app correction rate.

The spike also found a **safety gap in the existing red-flag rules**, fixed in this change (see [Red-flag rules](#red-flag-rules-found-and-fixed)).

## Options

| Route | Phones it covers | Structured output | Maturity | Notes |
| --- | --- | --- | --- | --- |
| **Apple Foundation Models** (built-in, ~3B) | iOS 26 with Apple Intelligence turned on (iPhone 15 Pro and later) | Native constrained decoding ("guided generation") | Shipping OS feature | Reported 4K-token context shared by prompt and answer. The model may still be downloading or switched off: check availability at runtime. Usage policy below. |
| **Gemini Nano** via ML Kit GenAI Prompt API | Recent Android flagships (Pixel 9/10, selected Samsung, OnePlus, Xiaomi and others). Google says it runs best on Pixel 10 (nano-v3). | JSON plus validation (no native constrained decoding found) | Alpha as of Oct 2025; Expo's alpha docs reference `1.0.0-beta4` | Foreground only. Device list changes often, so check Google's device-support page. |
| **Downloadable open models** (Gemma, Qwen, Phi, Llama via LiteRT-LM, ExecuTorch or llama.cpp) | Most phones with ~6 GB+ RAM | llama.cpp: JSON schema to grammar (guaranteed). Others: prompt plus validation | Libraries are active but young | 1–3 GB download per user, battery and heat, and a slow first run. Quality at 1–4B parameters is the open question (see eval). |
| **Claude via relay** (already built) | Every phone with a network connection | Schema-enforced | Production API | Sends de-identified text off the phone; opt-in only. |

### Libraries for Expo

| Library | What it gives us | Status | Verdict |
| --- | --- | --- | --- |
| [`expo-ai-kit`](https://www.npmjs.com/package/expo-ai-kit) 0.18 | Apple and Gemini Nano built-in models **plus** downloadable Gemma/Qwen/Phi (LiteRT-LM), JSON output, Vercel AI SDK provider. Opt-in per feature through a config plugin. | Active (Sep 2026). Single maintainer. SDK 54+. About 30 MB extra on iOS and 21 MB on Android when `llm` is on. No Expo Go. | **Best fit today** for a prototype covering both platforms |
| `expo-ai` (Expo's own) | Apple Foundation Models, Gemini Nano, and the browser Prompt API, with schema helpers and availability/prepare APIs | **Alpha and unreleased:** only in Expo's main-branch docs, and the npm name is an empty placeholder. Schemas don't support `null` or unions, so our schema would need optional fields instead. | **Migrate to it when it ships** in a future SDK |
| [`react-native-executorch`](https://www.npmjs.com/package/react-native-executorch) 0.10 | Downloadable models (Llama 3.2, Qwen, LFM2) with a `useLLM` hook | Active; Expo SDK 55+ | Viable fallback for phones without a built-in model. **Model downloads send an anonymous telemetry event unless `setTelemetryEnabled(false)` is called**, which matters given our privacy promise. |
| [`llama.rn`](https://www.npmjs.com/package/llama.rn) | llama.cpp with JSON-schema/grammar-constrained output (strongest guarantee of valid JSON) | Newest stable is 0.12.9. npm's `latest` tag points at the 0.13 release candidate, so pin the version explicitly. | Strong option for the download route if guaranteed JSON matters most |
| `@react-native-ai/apple` 0.12 | Apple model as a Vercel AI SDK provider | No release since Feb 2026 | Superseded by the two above |

## Policy

Apple's [acceptable use requirements](https://developer.apple.com/apple-intelligence/acceptable-use-requirements-for-the-foundation-models-framework/) for the on-device model prohibit uses that:

> "Provides inaccurate or dangerous outputs, or makes decisions without human supervision that have a material impact on individual rights, in high-risk domains, including in employment, medical, legal, or finance."

Medilog doesn't make decisions: it restructures the patient's own words and never diagnoses or triages. The live risk is **"inaccurate outputs" in a medical domain.** Our design already mitigates it:
- the original note is shown alongside the tags;
- every tag is patient-editable;
- the one-pager says it is patient-entered and descriptive only.

Before shipping, I'd also **ask Apple Developer Support** to confirm this use is acceptable. Some third-party summaries quote an older or alternative wording ("engages in regulated healthcare… services") that the live page no longer carries; the live page has no blanket healthcare ban.

Google's GenAI policy pages weren't reachable from the research environment. Check Google's prohibited-use terms for Gemini Nano before an Android rollout.

## Evaluation kit

`eval/` holds 24 **held-out notes** written in realistic, varied language: slang ("did sweet FA", "brain like soup"), drug brands the rules don't know (Gaviscon, rizatriptan), negations and a "good day" note. Each note has hand-labelled expected fields. The runner scores any engine with the **same prompt and schema the relay uses**:

```bash
npx tsx eval/run.ts rules                     # on-device rule engine
ANTHROPIC_API_KEY=… npx tsx eval/run.ts claude  # Claude via the SDK
# Any small model through an OpenAI-compatible local server, e.g. Ollama:
ollama pull gemma3n:e4b && npx tsx eval/run.ts local --model gemma3n:e4b
npx tsx eval/run.ts local --base-url http://localhost:8080/v1 --model qwen   # llama.cpp llama-server
```

Add `--verbose` for per-note misses and `--out results.json` to save them.

Desktop runs of the same open models (Gemma 3n, Qwen 3 1.7B/4B, Phi-4-mini) are a fair stand-in for the downloadable-model route. Apple's built-in model can only be measured on Apple hardware (macOS 26 includes the same framework), which needs a small Swift harness: a follow-up task.

### Results so far

The research environment couldn't download model weights (Hugging Face and the Ollama registry are blocked there), so only the rule engine has been scored. Run the commands above on a laptop to fill in the other columns.

| Metric (24 held-out notes) | Rules | Claude | Small local model |
| --- | --- | --- | --- |
| Complaint correct | 83% | *run* | *run* |
| Site correct | 71% | | |
| Severity correct | 88% | | |
| Severity invented when none stated | 1 note | | |
| Treatments found | 78% | | |
| Treatment effect right (of found) | 71% | | |
| Symptoms + impact found | 67% | | |
| Pertinent negatives found | 83% | | |
| Median latency | 1 ms | | |

The rules fail exactly where you'd expect, on phrasing outside their vocabulary:
- "Sex was really painful", "itchy raised welts" and "brain like soup" were missed;
- "did sweet FA" wasn't understood as "no relief";
- Gaviscon and rizatriptan weren't recognised;
- "the light was unbearable" was misread as severity 9.

That is the gap a model should close. The question the eval answers is whether a 2–4B on-device model closes enough of it **without inventing things** (the "invented" rows), since inaccurate output is both a clinical risk and the line in Apple's policy.

### Red-flag rules: found and fixed

The same kit includes 15 red-flag notes. The original rules caught only **5 of 10** paraphrased emergencies:

| Missed | Why |
| --- | --- |
| "Crushing pressure in my chest and my jaw aches" | Only "chest pressure" word order was matched |
| "Worst headache I've ever had, came on in seconds" | Only "worst headache of my life/ever" was matched |
| "Face went numb on one side and my words came out slurred" | Fixed phrases only |
| "Soaked through a super tampon in two hours and I'm really dizzy" | Required "every hour" |
| "I've been thinking everyone would be better off without me" | Only "better off dead" was matched |

They also raised a false alarm on "Haven't fainted, just a bit lightheaded" ("haven't" wasn't treated as a negation). All six are fixed in `packages/engine/src/redflags.ts`, with regression tests. The rules now score 10/10 caught and 0/5 false alarms, **but that's on the cases used to find the bugs, so it's not an independent measure.**

These rules need **clinical review and a larger, independently written test set** before real patients use the app. A model can add a second safety net here (flag when either the rules *or* the model sees an emergency), but must never replace the rules.

Two presentations are reported but not scored, because handling them is a product decision: right-sided pain with fever (appendicitis-like) and early pregnancy with one-sided pain and spotting (possible ectopic). They need "see a doctor today" guidance rather than a 000 interrupt. Currently the app has only the 000 interrupt, so neither triggers anything.

## If we build it: proposed design

1. **Rules first, always.** Red flags are screened before any model runs, as today.
2. **Model fills fields only.** Send the note with a slimmed schema (no follow-up question), then pick the follow-up with the existing `nextQuestion()`. This shrinks the output, keeps question wording deterministic, and leaves room in Apple's ~4K window. Today's prompt plus schema is about 2.1K tokens before the note and answer.
3. **Grounding checks before accepting model output** (deterministic, cheap):
   - drop any treatment whose name or brand doesn't appear in the note;
   - accept a severity only if the note contains a number or a severity word;
   - clamp everything to the schema.

   These directly target the "inaccurate outputs" risk.
4. **Time-box it:** if the model isn't ready or takes over about 6 s, keep the rules result and say nothing.
5. **Schema shape:** use optional fields instead of `null` and unions. Expo's `expo-ai` requires it, and it suits small models better.
6. **Measure in the beta:** the app already records which tags a patient edits (`editedTags`). The **correction rate per engine** is the real-world quality metric, alongside this offline eval.
7. **Library:** prototype with `expo-ai-kit` (Apple and Gemini Nano now, Gemma download later if needed), then move to Expo's `expo-ai` when it is released.

## Sources

- Apple, [Acceptable use requirements for the Foundation Models framework](https://developer.apple.com/apple-intelligence/acceptable-use-requirements-for-the-foundation-models-framework/) (read October 2026)
- Apple, [Foundation Models documentation](https://developer.apple.com/documentation/foundationmodels). The 4K context figure comes from secondary write-ups ([atelier-socle.com](https://www.atelier-socle.com/en/articles/foundation-models-api-guide)), so verify it against Apple's "Managing the context window" page.
- Android Developers blog, [ML Kit's Prompt API](https://developer.android.com/blog/posts/ml-kit-s-prompt-api-unlock-custom-on-device-gemini-nano-experiences) (Oct 2025); [ML Kit GenAI overview and device support](https://developers.google.com/ml-kit/genai)
- Expo `expo-ai` docs, main branch: [`docs/pages/versions/unversioned/sdk/ai.mdx`](https://github.com/expo/expo/blob/main/docs/pages/versions/unversioned/sdk/ai.mdx)
- Package READMEs read from npm: `expo-ai-kit@0.18.2`, `react-native-executorch@0.10.7`, `llama.rn@0.13.0-rc.8` (and its release list), `@react-native-ai/apple@0.12.0`
- Callstack, [On-device Apple LLM support comes to React Native](https://www.callstack.com/blog/on-device-apple-llm-support-comes-to-react-native)
