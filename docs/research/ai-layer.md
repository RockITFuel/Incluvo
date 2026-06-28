# Incluvo AI Layer — Research & Recommendation

**Date:** 2026-06-06
**Author:** Research subagent
**Constraints:** Bun monorepo · oRPC on `Bun.serve` · SolidJS + TanStack Solid Router/Query · Drizzle/Postgres · better-auth · Zod · **NL/EU data residency + digital sovereignty required**

> All version numbers, API shapes and statuses below were fetched from official sources (npm registry, tanstack.com, ai-sdk.dev / npm, developers.openai.com, orm.drizzle.team, openai.com, learn.microsoft.com, mistral.ai). URLs and dates are cited inline. Where official info is missing or ambiguous, this is stated explicitly.

---

## 1. Does "TanStack AI" exist? Is it production-ready? Does it support Solid?

**Yes, it exists and it is real — but it is in ALPHA.**

TanStack AI is described officially as a *"Type-safe, provider-agnostic TypeScript SDK for building streaming chat, tool-calling agents, structured outputs, realtime voice, media generation, and framework-native AI apps."*

- Docs: <https://tanstack.com/ai/latest/docs>
- Repo: <https://github.com/TanStack/ai>
- Announcement blog: *"TanStack AI Alpha: Your AI, Your Way"*, published **2025-12-04** — <https://tanstack.com/blog/tanstack-ai-alpha-your-ai-your-way>. The post states plainly: *"The only catch is that we're still in alpha. There will be bugs. There will be rough edges."*

**Exact packages and latest versions** (from npm registry, fetched 2026-06-06; all last published 2026-06-05):

| Package | dist-tag `latest` | Role |
|---|---|---|
| `@tanstack/ai` | **0.28.0** | Server core: provider adapters, chat, streaming, isomorphic tool calling, agent loop |
| `@tanstack/ai-client` | **0.16.3** | Framework-agnostic headless client (transports, realtime, media) |
| `@tanstack/ai-solid` | **0.13.4** | **Solid hooks** — `useChat`, structured outputs, media generation |
| `@tanstack/ai-react` | **0.15.4** | React hooks (incl. realtime voice) |

Source for versions: npm registry (`https://registry.npmjs.org/<pkg>`).

**SolidJS support: YES, first-class.** Both the blog ("Vanilla JS, React, and Solid are ready now. Svelte and more are on the way.") and the package matrix confirm a dedicated `@tanstack/ai-solid` package exporting a `useChat` hook with automatic state management and type-safe messages (<https://tanstack.com/ai/latest/docs>). Officially supported providers include OpenAI, Anthropic, Gemini, Ollama, OpenRouter, xAI Grok, Groq, ElevenLabs and fal.ai.

**Verdict:** The product owner's suggestion is *not* a phantom — TanStack AI is real, actively published (daily-ish releases, all packages bumped 2026-06-05), Solid-native, and aligned with our existing TanStack stack. **However, it is pre-1.0 alpha** (`@tanstack/ai` at `0.28.0`, Solid bindings at `0.13.4`). For a healthcare-adjacent product this is the single biggest risk: API churn and no stability guarantee.

---

## 2. Streaming AI chat + tool calling in Solid talking to a Bun/oRPC backend

Three realistic options. All keep the API key server-side (mandatory — never ship OpenAI keys to the Solid client).

### Option A — Vercel AI SDK (`ai`) with `@ai-sdk/solid`  ⚠️ DEPRECATED for Solid

- Current `ai` package: `latest` = **6.0.197** (published 2026-06-04). The SDK has long supported React/Svelte/Vue/Angular/Solid UI bindings — <https://ai-sdk.dev/docs/ai-sdk-ui/overview>.
- **BUT** the Solid binding is dead: `@ai-sdk/solid` `latest` = **1.2.13**, last published **2025-05-07**, and its npm description carries a warning: *"`@ai-sdk/solid` has been deprecated and will be removed in AI SDK 5."* — <https://www.npmjs.com/package/@ai-sdk/solid>.
- We are now on AI SDK **6**. So `@ai-sdk/solid` is two majors behind and officially removed. Solid is *not* a supported first-class UI target in current AI SDK.

**Conclusion on A:** The *server-side* core of the Vercel AI SDK (`ai` + `@ai-sdk/openai` `latest` = **3.0.68**) is excellent and current, but its **Solid UI hooks are deprecated/abandoned**. You would have to hand-roll the Solid client against the data-stream protocol — losing the main reason to pick it. Not recommended for the UI layer.

### Option B — OpenAI SDK on the oRPC server, stream over oRPC Event Iterator to Solid  ✅ Most sovereign / least magic

- `openai` (official TS SDK) `latest` = **6.42.0** (published 2026-06-03). Runs fine on Bun.
- oRPC natively serializes `AsyncIteratorObject` at the root level — this is the **Event Iterator**, oRPC's type-safe SSE-style streaming. Docs: <https://orpc.unnoq.com/docs/rpc-handler> and a concrete worked example *"OpenAI Streaming Example"* — <https://orpc.unnoq.com/examples/openai-streaming>. (Note: Event Iterator does *not* auto-retry on error unless you add the Client Retry Plugin.)
- You define a procedure returning an async generator; the Solid client consumes it as an async iterable and you drive a `createSignal`/`createStore` yourself.

**Server sketch (oRPC + openai):**
```ts
import OpenAI from 'openai'
import { os } from '@orpc/server'
import * as z from 'zod'

const openai = new OpenAI() // OPENAI_API_KEY from env (server only)

export const chatStream = os
  .input(z.object({ messages: z.array(z.object({
    role: z.enum(['user','assistant','system']), content: z.string(),
  })) }))
  .handler(async function* ({ input }) {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      stream: true,
      messages: input.messages,
      // tools: [...]  // function/tool calling goes here
    })
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield { delta }            // becomes an oRPC event
    }
  })
```

**Solid client sketch (TanStack-Solid friendly):**
```tsx
import { createSignal } from 'solid-js'
import { client } from '~/lib/orpc' // typed oRPC client

function Chat() {
  const [text, setText] = createSignal('')
  async function send(messages) {
    setText('')
    const iterator = await client.chatStream({ messages }) // AsyncIterable
    for await (const ev of iterator) setText(t => t + ev.delta)
  }
  return <div>{text()}</div>
}
```

Tool calling is implemented server-side in the generator loop (read `tool_calls` deltas, execute, feed results back) — full control, no extra dependency, fully EU-routable because you choose the endpoint.

### Option C — TanStack AI (`@tanstack/ai` + `@tanstack/ai-solid`)  ✅ Best DX, alpha risk

- Server: define provider adapter + isomorphic tools with `toolDefinition()` (`.server()` / `.client()`), agent loop and approval flow built in.
- Solid: `useChat` from `@tanstack/ai-solid` gives streaming + state management + type-safe tool calls out of the box, and it slots naturally next to TanStack Router/Query.
- The streaming transport can run over your oRPC/Bun server.

**Solid sketch (shape per docs; treat as alpha, verify against `0.13.x`):**
```tsx
import { useChat } from '@tanstack/ai-solid'
const chat = useChat({ transport: /* points at your Bun/oRPC endpoint */ })
// chat.messages(), chat.sendMessage(...), streaming + tools handled by the hook
```

**Maturity comparison:**

| Option | Solid support | Maturity | Key calls / tools | Verdict |
|---|---|---|---|---|
| A. Vercel `ai` + `@ai-sdk/solid` | **Deprecated** (1.2.13, removed in v5; we're on v6) | Server core mature; Solid UI dead | Strong server, no Solid UI | ❌ for Solid UI |
| B. `openai` + oRPC Event Iterator | Native (it's just our stack) | **Mature/stable** building blocks | Manual but full control | ✅ Safe default |
| C. `@tanstack/ai` + `@tanstack/ai-solid` | **First-class** | **Alpha** (0.x) | Best ergonomics, agents/tools/approval built in | ✅ if alpha acceptable |

---

## 3. Audio transcription (backlog #18 — transcribe coach↔student, propose form answers)

Official OpenAI speech-to-text: <https://developers.openai.com/api/docs/guides/speech-to-text> (the `platform.openai.com/docs/guides/speech-to-text` URL now 301-redirects to `developers.openai.com`).

- **Endpoint:** `POST /v1/audio/transcriptions`
- **Models:** `gpt-4o-transcribe` (highest quality), `gpt-4o-mini-transcribe` (cheaper/faster), `whisper-1` (original; widest feature set), and `gpt-4o-transcribe-diarize` (speaker diarization — relevant for coach↔student!).
- **Input formats:** `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm`. **Max file size: 25 MB** (chunk longer recordings).
- **Response formats:** gpt-4o models → `json` or `text`; `whisper-1` → `json`, `text`, `srt`, `verbose_json`, `vtt`; `gpt-4o-transcribe-diarize` → `json`, `text`, `diarized_json`.
- **Features:** word/segment timestamps via `timestamp_granularities[]` (**whisper-1 only**); `stream=true` for incremental events; `prompt` to bias domain terms; log-probs on gpt-4o transcribe models with `response_format=json`.

**Bun/Node usage (official `openai` SDK 6.42.0):**
```ts
import fs from 'node:fs'
import OpenAI from 'openai'
const openai = new OpenAI()

const transcription = await openai.audio.transcriptions.create({
  file: fs.createReadStream('/path/to/conversation.m4a'),
  model: 'gpt-4o-transcribe',          // or 'gpt-4o-transcribe-diarize' for speakers
  // language: 'nl',                    // Dutch
  // prompt: 'coach, student, ...',     // bias domain vocabulary
})
console.log(transcription.text)
```

For #18: transcribe → feed transcript into a chat/responses completion that emits **structured output** (Zod schema) proposing form answers. Note the **25 MB cap** and that **diarization** is what distinguishes the two speakers.

---

## 4. AI assistant / RAG over knowledge docs (backlog #22 — advice from coachplan + knowledge docs)

**Recommended official approach: embeddings + pgvector retrieval + a chat/responses completion.**

- **Embeddings model:** `text-embedding-3-large` (native **3072 dims**, reducible via the `dimensions` parameter, e.g. 1024) or the cheaper `text-embedding-3-small`. Only `text-embedding-3` and later support `dimensions`. Docs: <https://developers.openai.com/api/docs/guides/embeddings>, <https://developers.openai.com/api/docs/models/text-embedding-3-large>.
- **Store vectors in Postgres via pgvector** — we already run Drizzle/Postgres, so no new datastore needed. Drizzle has first-class pgvector support: <https://orm.drizzle.team/docs/guides/vector-similarity-search> and the `vector` column type at <https://orm.drizzle.team/docs/column-types/pg>.

**Drizzle schema + query sketch:**
```ts
import { pgTable, serial, text, vector, index } from 'drizzle-orm/pg-core'
import { sql, cosineDistance, desc, gt } from 'drizzle-orm'

export const docs = pgTable('docs', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
}, (t) => [
  index('docs_embed_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
])

// retrieval
const similarity = sql<number>`1 - (${cosineDistance(docs.embedding, queryEmbedding)})`
const rows = await db.select({ content: docs.content, similarity })
  .from(docs).where(gt(similarity, 0.5)).orderBy(t => desc(t.similarity)).limit(5)
```

Flow: embed each knowledge doc + coachplan chunk → store → at query time embed the question, retrieve top-k by cosine distance (HNSW index), inject as context into the chat/responses call → return grounded advice. **Enable the `vector` extension** in Postgres first (`CREATE EXTENSION vector`).

> Note: if EU residency wins (section 5), swap the OpenAI embeddings model for **Mistral embeddings** (`mistral-embed`) — same pgvector/Drizzle plumbing, just a different dimension count.

---

## 5. EU / NL data residency & digital sovereignty

This is a hard requirement, so it constrains everything above.

### OpenAI — has EU data residency, but with caveats
- Official: *"Introducing data residency in Europe"* — <https://openai.com/index/introducing-data-residency-in-europe/>; help article <https://help.openai.com/en/articles/10503543-data-residency-for-the-openai-api>.
- Enable by creating a **new Project** with **Europe** as the region (existing projects **cannot** be migrated). API traffic goes through **`eu.api.openai.com`** with **zero data retention** at rest.
- **Eligibility gating:** you must **contact OpenAI sales** to be enabled — not self-serve for everyone.
- **Pricing:** a **10% uplift** for residency-eligible models released on/after 2026-03-05.

### Azure OpenAI — strongest EU-residency guarantees
- Use **Data Zone deployments** in EU regions (**Sweden Central**, **Germany West Central**); the EU Data Zone spans France, Germany, Italy, Netherlands, Norway, Poland, Spain, Sweden, Switzerland (as of May 2026). Docs: <https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/deployment-types>, <https://azure.microsoft.com/en-us/blog/announcing-the-availability-of-azure-openai-data-zones-and-latest-updates-from-azure-ai/>.
- **Critical:** *Global Standard* / *Worldwide Standard* deployments **may route data outside the EU** — only **Data Zone (EUR)** deployments keep storage *and* processing in-EU. Choose the deployment type deliberately.

### Mistral (EU / French) — strongest sovereignty story
- Mistral's servers are **hosted in the EU**; it selects EU GDPR-compliant providers. Help center: <https://help.mistral.ai/en/articles/347629-where-do-you-store-my-data-or-my-organization-s-data>; EU playbook <https://europe.mistral.ai/>.
- Caveat: some features may *temporarily* transfer data outside the EU per the Subprocessors list, and there is an explicit **US API endpoint** (don't use it). For "digital sovereignty," a French/EU vendor is the cleanest narrative.

**Residency summary:** All three can be made EU-resident. **Mistral** is the strongest sovereignty narrative (EU company, EU hosting); **Azure OpenAI Data Zone (EUR)** is the strongest *enterprise-grade contractual* guarantee while keeping GPT-class quality; **OpenAI EU residency** works but requires sales onboarding, is new-project-only, and adds a 10% uplift.

---

## FINAL RECOMMENDATION for Incluvo

**Architecture (do this regardless of vendor):** Keep all AI calls **server-side in oRPC procedures on Bun**, and stream to Solid via the **oRPC Event Iterator** (Option B is the stable, sovereign backbone — proven, no extra deps, EU-routable because *you* pick the endpoint). Store knowledge-doc/coachplan embeddings in **Postgres + pgvector via Drizzle** (we already have the DB).

**Provider, given the EU/sovereignty requirement:** Standardize the server adapter on a **provider-agnostic abstraction** and point it at an **EU-resident endpoint**. Concretely:
- **Primary: Azure OpenAI with a Data Zone (EUR) deployment in Sweden Central** — GPT-4o-class chat + structured outputs, `text-embedding-3-large` for RAG (#22), and `gpt-4o-transcribe`/`-diarize` for transcription (#18), all contractually EU-resident. This best satisfies "NL/EU hosting + digital sovereignty" *and* keeps the best model quality.
- **Sovereignty-max alternative / fallback: Mistral (EU)** for chat + `mistral-embed` for RAG, if a fully European *vendor* (not just region) is required by the customer. Note Mistral's native transcription is weaker, so #18 may still need Azure/OpenAI transcribe.

**On TanStack AI (the PO's suggestion):** It is **real, Solid-native, and a genuinely good fit for our TanStack stack** — but it is **alpha (`@tanstack/ai` 0.28.0, `@tanstack/ai-solid` 0.13.4)**. Recommendation: **adopt it for the Solid client `useChat` UX (Option C) but pin exact versions and isolate it behind our own thin hook**, so we can fall back to a hand-rolled oRPC-Event-Iterator client (Option B) without touching feature code if the alpha churns or breaks. Do **not** put alpha code on the critical path for a compliance-sensitive product without that escape hatch.

**Do NOT use `@ai-sdk/solid`** — it is deprecated (1.2.13, removed in AI SDK 5; the SDK is now on v6). If you want Vercel's SDK, only its *server* core is current, and that overlaps with what TanStack AI / the raw `openai` SDK already give us.

### Single most important caveat
**EU data residency is a configuration choice that is easy to get wrong and silently lose.** The default OpenAI API and Azure *Global/Worldwide Standard* deployments route data outside the EU; only **OpenAI EU Projects (`eu.api.openai.com`, sales-gated, new-project-only, +10%)**, **Azure Data Zone (EUR) deployments**, or **Mistral's EU endpoints** are actually in-region. This must be verified at the infrastructure/contract level and asserted in tests/runtime config — it cannot be assumed from "we use a European-sounding endpoint."

---

## Sources
- TanStack AI docs — <https://tanstack.com/ai/latest/docs>
- TanStack AI alpha blog (2025-12-04) — <https://tanstack.com/blog/tanstack-ai-alpha-your-ai-your-way>
- TanStack/ai repo — <https://github.com/TanStack/ai>
- npm registry (`@tanstack/ai` 0.28.0, `@tanstack/ai-client` 0.16.3, `@tanstack/ai-solid` 0.13.4, `@tanstack/ai-react` 0.15.4, `ai` 6.0.197, `@ai-sdk/openai` 3.0.68, `@ai-sdk/solid` 1.2.13 [deprecated], `openai` 6.42.0) — `https://registry.npmjs.org/`
- `@ai-sdk/solid` (deprecation warning) — <https://www.npmjs.com/package/@ai-sdk/solid>
- AI SDK UI overview — <https://ai-sdk.dev/docs/ai-sdk-ui/overview>
- oRPC Event Iterator / RPC Handler — <https://orpc.unnoq.com/docs/rpc-handler> · OpenAI streaming example — <https://orpc.unnoq.com/examples/openai-streaming>
- OpenAI speech-to-text — <https://developers.openai.com/api/docs/guides/speech-to-text>
- OpenAI embeddings + text-embedding-3-large — <https://developers.openai.com/api/docs/guides/embeddings> · <https://developers.openai.com/api/docs/models/text-embedding-3-large>
- Drizzle pgvector — <https://orm.drizzle.team/docs/guides/vector-similarity-search> · <https://orm.drizzle.team/docs/column-types/pg>
- OpenAI EU data residency — <https://openai.com/index/introducing-data-residency-in-europe/> · <https://help.openai.com/en/articles/10503543-data-residency-for-the-openai-api>
- Azure OpenAI Data Zones — <https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/deployment-types> · <https://azure.microsoft.com/en-us/blog/announcing-the-availability-of-azure-openai-data-zones-and-latest-updates-from-azure-ai/>
- Mistral EU data hosting — <https://help.mistral.ai/en/articles/347629-where-do-you-store-my-data-or-my-organization-s-data> · <https://europe.mistral.ai/>
