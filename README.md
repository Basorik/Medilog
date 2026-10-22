# Medilog: proof-of-concept demo

**Translate, don't diagnose.** A 15-second voice note logged at home becomes a structured History of Presenting Illness (HPI) that a clinician can read in under a minute.

This repository is an interactive investor demo of the three-screen product in the venture proposal:

1. **Log**: one microphone button. The note is mapped onto the SOCRATES clinical schema, and the app asks the *single* highest-yield follow-up question as tap-to-answer pills.
2. **Timeline**: notes are organised into clinical tags automatically. Tap any tag to correct it, so the patient owns the record without filling in a form.
3. **Appointment mode**: pick a timeframe and get two outputs. One is a 60-second first-person opener for the patient to read aloud. The other is a one-page clinical HPI for the doctor, which can be printed, saved as PDF, copied or emailed.

On desktop, an **Under the hood** panel sits beside the phone and narrates every step as it happens: the red-flag screen, the identifiers stripped, exactly what leaves the device, which model ran, its token count and cost, and the projected AI cost per user per month. On a phone, the ⓘ button opens the same panel.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173 (web + API relay together)
```

The app needs no API key. Without one it runs entirely on the **on-device engine**: deterministic, offline, instant and free. To use live Claude, give the server a key:

```bash
cp .env.example .env   # then set ANTHROPIC_API_KEY
ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

For a single-process production build (serves the app and the API on one port):

```bash
npm run build && ANTHROPIC_API_KEY=sk-ant-... npm start   # http://localhost:8787
```

`npm test` runs the engine and API tests. `npm run typecheck` runs the TypeScript checks.

> **Pitch tip:** if the venue wifi is unreliable, open ⚙︎ Settings and choose **On-device only**. Every screen keeps working with no network at all.

## Suggested demo path (about 3 minutes)

The app opens with a fictional sample patient, Maya: 17 logs over 10 weeks of recurrent right-sided pelvic pain, a story that ends with "probably just bad periods".

1. **Log**: tap **🌙 3 AM pelvic pain**. The note "types itself" as if dictated. The schema grid shows what was captured and highlights the gap. The app asks *"Did the ibuprofen and heat pack help, and did you have any fever or nausea?"* Tap an answer.
2. **Timeline**: point out the 30-day severity chart with period markers, then tap a tag (such as `7/10` or `Ibuprofen: no relief`) to correct it. Show "What your doctor sees" next to "In your words".
3. **Appointment**: choose **Last 30 days**, then **Prepare my appointment**. Read the opener aloud with **▶ Practise**. Switch to **🩺 For the doctor** for the one-pager: metrics, pertinent negatives, treatments tried and functional impact.
4. **Safety**: back on Log, tap **🚨 Red-flag test**. A fixed rule interrupts logging with an emergency directive before any AI is involved.

You can also type or dictate your own notes. The engine covers pelvic and abdominal pain, headache and migraine, joint flares, back pain, fatigue and rash.

## How the proposal maps to the code

| Proposal claim | Where it lives |
| --- | --- |
| Clinical gap detection and a one-question follow-up | `src/lib/extract.ts` (`coverage`, `nextQuestion`); `server/claude.ts` (same priority order in the prompt) |
| Patient words → clinical vocabulary (e.g. "hurts when I go to the toilet" → *Dyschezia*) | `src/lib/lexicon.ts`; every field is stored as a `{ patient, clinical }` pair (`src/lib/types.ts`) |
| Editable tags, 100% patient ownership | `src/lib/tags.ts`, `src/components/Sheets.tsx` |
| Soapbox script + HPI one-pager | `src/lib/report.ts`, `src/components/Appointment.tsx` |
| Numbers never come from the model | `buildReportData` computes every count, date and severity on the device. The model only writes prose, and `computeMetrics` re-attaches the computed figures. |
| Never diagnoses | Prompts in `server/claude.ts`, plus `findDiagnosticLanguage` in `src/lib/report.ts`. Model output that contains diagnostic or advice language is replaced with the deterministic template, and the panel logs it as a guardrail event. |
| Deterministic red-flag guardrails (000 / 911) | `src/lib/redflags.ts`. The rules run before any AI call, on the device, and again on the server. |
| PII-stripped stateless relay | `src/lib/pii.ts` (device and server); `server/index.ts` keeps nothing, never logs bodies, and rate-limits by IP |
| Local-first encrypted storage | `src/lib/store.ts`: AES-256-GCM with a non-extractable key held in IndexedDB; nothing is stored on the server |
| Fast model for daily extraction, frontier model for reports | `claude-haiku-5-5` for extraction and `claude-sonnet-5-5` for reports (override with `MEDILOG_EXTRACT_MODEL` / `MEDILOG_REPORT_MODEL`). Both use schema-enforced structured outputs. The report call opts into server-side refusal fallbacks. |
| Unit economics under $0.10 per user per month | The panel shows measured cost per call and projects 30 logs plus 2 reports a month. Typical totals are $0.04–0.08. |

Where the proposal names Claude Haiku 4.5 and Sonnet 4.6, the demo defaults to their current successors, Haiku 5.5 and Sonnet 5.5, which are cheaper per token. That strengthens the COGS story.

## What is real and what is simulated

This is a proof of concept, so it is worth being precise in the room:

- **Real:** the extraction engine and follow-up logic, the Claude integration, red-flag screening, PII scrubbing, encrypted on-device storage, report statistics, guardrails, print/PDF and read-aloud.
- **Speech-to-text:** uses the browser's Web Speech API, requesting on-device recognition where the browser supports it. Some browsers (for example Chrome on desktop) may send audio to the browser vendor's speech service. The demo phrases simulate dictation and send no audio anywhere. Production would use an on-device Whisper or Moonshine model.
- **Zero data retention and onshore hosting:** the demo relay calls the Claude API directly. A ZDR agreement and an `ap-southeast-2` deployment (for example via Amazon Bedrock) are production steps. Note that server-side fallbacks are a Claude API feature; on Bedrock, use the SDK's client-side fallback middleware instead.
- **Red-flag rules and the PII scrubber:** both are illustrative and auditable, but neither is clinically validated or exhaustive. Both need clinical and privacy review before real patients use them.
- **Not built yet:** accounts, encrypted cloud backup, a native mobile shell and clinic sharing.

## Project layout

```
src/
  lib/            engine: extract, lexicon, redflags, pii, report, tags, store, pipeline, seed
  components/     Capture, Timeline, Appointment, Hood (under-the-hood panel), Sheets
  App.tsx         state, persistence, orchestration
server/
  index.ts        stateless relay + static file server
  claude.ts       prompts, schemas and the two Claude calls
```
