# Perchance Platform — Technical Reference

A complete technical reference for building on Perchance.org: generators, AI chat
applications, plugins, and any JavaScript that runs inside a Perchance generator.

This document covers the platform architecture, the four core plugins (`ai-text-plugin`,
`text-to-image-plugin`, `upload-plugin`, `super-fetch-plugin`), the Perchance DSL, the
`root` bridge, the public HTTP API, the AI character-chat data model, and the patterns
used in production Perchance applications.

Where the behavior described here differs from Perchance's official plugin documentation,
this document reflects the observed runtime behavior.

---

## Table of Contents

1. [Platform Architecture](#1--platform-architecture)
2. [Perchance DSL Fundamentals](#2--perchance-dsl-fundamentals)
3. [ai-text-plugin](#3--ai-text-plugin)
4. [text-to-image-plugin](#4--text-to-image-plugin)
5. [upload-plugin](#5--upload-plugin)
6. [super-fetch-plugin](#6--super-fetch-plugin)
7. [The `root` Proxy](#7--the-root-proxy)
8. [Public HTTP API](#8--public-http-api)
9. [Sandbox Capabilities](#9--sandbox-capabilities)
10. [AI Character-Chat Data Model](#10--ai-character-chat-data-model)
11. [Message Format & Wire Protocol](#11--message-format--wire-protocol)
12. [Hierarchical Summarization](#12--hierarchical-summarization)
13. [Memory & Lore](#13--memory--lore)
14. [File Hosting & Share Links](#14--file-hosting--share-links)
15. [Sandboxed Custom Code](#15--sandboxed-custom-code)
16. [UI Utilities](#16--ui-utilities)
17. [Page Initialization](#17--page-initialization)
18. [Common Patterns](#18--common-patterns)
19. [Security Notes](#19--security-notes)
20. [Common Pitfalls](#20--common-pitfalls)
21. [Quick Reference](#21--quick-reference)

---

## 1 · Platform Architecture

A Perchance generator has two authoring zones and a backend broker layer.

```
┌──────────────────────────────────────────────────────────────────┐
│  perchance.org  (parent frame, cross-origin from the sandbox)     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Sandbox iframe — <hex>.perchance.org/slug                  │ │
│  │                                                             │ │
│  │  ┌──────────────────┐   ┌──────────────────────────────┐   │ │
│  │  │ Top editor       │   │ HTML panel                   │   │ │
│  │  │ (Perchance DSL)  │   │ (standard HTML + CSS + JS)   │   │ │
│  │  │ lists, functions │   │ application code             │   │ │
│  │  │ plugin imports   │   │ accesses plugins via root.x  │   │ │
│  │  └──────────────────┘   └──────────────────────────────┘   │ │
│  │                                                             │ │
│  │  <iframe src="text-generation.perchance.org/embed">  ◄──────┼─┼─ broker
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 1.1 The Sandbox

The HTML panel runs in a sandboxed iframe served from a per-generator 32-hex subdomain:

```
https://<32-hex-id>.perchance.org/your-slug
```

| Property | Value |
|----------|-------|
| Parent origin | `https://perchance.org` |
| `crossOriginIsolated` | `false` — `SharedArrayBuffer` is unavailable |
| `window.top === window` | `false` — the panel is nested inside the parent frame |
| Storage quota | ~10 GB, already persisted |
| Sandbox flags | `allow-scripts allow-same-origin` |

`location.search` carries Perchance boot parameters such as `?__generatorLastEditTime=...`.
Never use `location.origin` to build share links — always hardcode `https://perchance.org`,
because `location.origin` inside the panel is the per-generator hex subdomain.

### 1.2 Backend Topology — the Broker Model

Plugins do **not** call the AI backend directly from the panel frame. They communicate by
`postMessage` RPC with dedicated broker iframes that the runtime injects into the sandbox
document:

```
panel JS  →  root.aiTextPlugin({...})
          →  plugin postMessages  →  text-generation.perchance.org/embed  (broker iframe)
                                  →  broker performs the real backend request
          ←  postMessage replies stream back  ←
```

No `fetch`, `XHR`, `WebSocket`, or `SSE` traffic leaves the sandbox during an AI call —
all transport is `postMessage`. The broker iframe is visible in the panel's DOM:

```js
document.querySelector('iframe').getAttribute('src')
// → "https://text-generation.perchance.org/embed"
```

The brokers are independent services, so calls to different services run in parallel:

| Service | Broker origin |
|---------|---------------|
| Text generation | `text-generation.perchance.org/embed` |
| Image generation | `image-generation.perchance.org` |
| File upload | `upload.perchance.org` |
| CORS proxy (`superFetch`) | `fetch-plugin.perchance.org` |

**Full subdomain map** (from Certificate Transparency logs and DNS probing):

| Subdomain | Purpose | Status |
|-----------|---------|--------|
| `perchance.org` | Main site + public API | Active (HTTP 200) |
| `www.perchance.org` | Redirects to `perchance.org` | Active |
| `<32-hex>.perchance.org` | Per-generator sandbox iframes (wildcard cert) | Active |
| `text-generation.perchance.org` | AI text broker + `/api/generate` backend | Active |
| `image-generation.perchance.org` | AI image broker + `/api/generate` + `/gallery` | Active |
| `upload.perchance.org` | File upload broker + `/api/upload,fileInfo,delete` | Active |
| `user-uploads.perchance.org` | Upload CDN origin (same backend as `user.uploads.dev`) | Active |
| `fetch-plugin.perchance.org` | CORS proxy (`/proxy1/`) | Active |
| `comments-plugin.perchance.org` | Comments backend (404 via proxy; loads via iframe) | Live |
| `generated-images.perchance.org` | Image CDN/storage (separate from upload CDN) | Live (CORS-blocked) |
| `browser-runner.perchance.org` | Headless browser / screenshot service | Live (CORS-blocked) |
| `connect-plugin.perchance.org` | WebSocket/real-time connection plugin | Live (CORS-blocked) |
| `count-plugin.perchance.org` | Counter/analytics plugin backend | Live (CORS-blocked) |
| `db-plugin.perchance.org` | Database plugin backend | Live (CORS-blocked) |
| `editor-collab.perchance.org` | Collaborative editing service | CT cert (untested) |
| `editor-copilot.perchance.org` | AI copilot — `POST /api/findBugsInCode` (editor-only) | Active (editor context) |
| `posts-plugin.perchance.org` | Posts CRUD API broker (WIP, source has bugs) | Down (HTTP 522 — origin timeout) |
| `rss-feeds.perchance.org` | RSS feed per generator (path = name; strict CSP) | Live |
| `server-plugin.perchance.org` | WebTransport/WebSocket gateway (wildcard: `*.server-plugin`) | Down (HTTP 526 — invalid SSL cert) |
| `wt0.server-plugin.perchance.org` | WebTransport endpoint for server-plugin | Down (depends on server-plugin) |
| `null.perchance.org` | Test/sentinel subdomain | Live (CORS-blocked) |
| `ads.perchance.org` | Ad service for image generation (loads `?provider=vli`) | Live |
| `api.perchance.org` | DNS exists (CF 520/522 — origin error) | Inactive |
| `cdn.perchance.org` | DNS exists (CF 520/522) | Inactive |
| `static.perchance.org` | DNS exists (CF 520/522) | Inactive |
| `assets.perchance.org` | DNS exists (CF 520/522) | Inactive |
| `app.perchance.org` | DNS exists (CF 520/522) | Inactive |
| `beta.perchance.org` | DNS exists (CF 520/522) | Inactive |
| `dev.perchance.org` | DNS exists (CF 520/522) | Inactive |
| `staging.perchance.org` | DNS exists (CF 520/522) | Inactive |
| `admin.perchance.org` | DNS exists (CF 520/522) | Inactive |

**External domains (non-perchance.org):**

| Domain | Purpose |
|--------|---------|
| `user.uploads.dev` | Upload CDN origin (shared backend with `user-uploads.perchance.org`) |
| `aigc.uploads.dev` | AI-generated content CDN origin |
| `hf-mirror.uploads.dev` | HuggingFace model mirror (`X-Frame-Options: sameorigin`) |
| `hf-mirror-eastern-europe.uploads.dev` | Regional HuggingFace mirror |
| `cdn.rollbar.com` | Error tracking (in text-generation broker) |
| `challenges.cloudflare.com` | Cloudflare Turnstile (image-gen + upload brokers) |
| `cdn.jsdelivr.net` | JavaScript CDN (all brokers) |
| `analytics.google.com` | GA4 tracking (ID: `G-YJWJRNESS5`) |

**Analytics endpoints** (fire-and-forget, return HTTP 200 with empty body — called
automatically by every generator page on load):

| Endpoint | Purpose |
|----------|---------|
| `/api/count?keys=uaine,abpsgp` | Counter/analytics (called on page load) |
| `/api/cv?generatorName=...&isFromEmbed=0` | View counter (increments the `views` in `getGeneratorStats`) |
| `/api/securityData` | Spam hostname blocklist — `{spamHostnames: string[58]}` |

**Message protocol for one text-generation call:**

| Step | `type` | Other fields | Meaning |
|------|--------|--------------|---------|
| 1 | `embedIsReady` | — | Broker iframe finished loading |
| 2–3 | `verified` | — | Auth handshake (fires twice; subsequent calls reuse it) |
| 4…N | `streamData` | `requestId`, `value.text` | One token chunk each |
| N+1 | `streamData` | `requestId`, `value.text`, `value.final`, `value.stopReason` | Final chunk |
| N+2 | `streamEnd` | `requestId` | Stream closed |

Every AI call is internally a stream, even non-streaming ones. The `requestId` format is
`aiTextCompletion` followed by 17 digits. The broker silently ignores malformed or unknown
messages — there is no error-reply surface.

### 1.3 Generator Serving & Stale Builds

Generator HTML is served with:

```
Cache-Control: public, max-age=0, s-maxage=31104000
```

`max-age=0` means browsers always revalidate, but `s-maxage=31104000` means the Cloudflare
edge may hold a build for up to 360 days. When a generator is saved, Perchance purges the
edge cache; if that purge is delayed, the edge can serve a stale HTML panel. No service
worker is involved — stale builds are always a CDN purge-delay issue. The actual
invalidation is performed by the `clearCacheIfGeneratorOrImportsHaveBeenUpdated` endpoint
(see [§8](#8--public-http-api)).

---

## 2 · Perchance DSL Fundamentals

The top editor uses the Perchance domain-specific language: indentation-structured lists,
functions, and plugin imports.

### 2.1 List & Function Syntax

```
listName
  item one
  item two
  {nestedList}           // embed another list
  {import:plugin-name}   // import a plugin

// Single-line function — expression only, no `return` keyword:
myFunc(x) => "result: " + x

// Multi-line async function — body indented under the signature:
async myFunc(opts) =>
  if(!opts) opts = {};
  let result = await someAsyncThing();
  return result;
```

**Naming rules** (enforced by the engine — violations are errors):

- List names may contain letters, numbers, and underscores only — no spaces, hyphens, or
  parentheses.
- A name cannot start with a number.
- A name cannot be a JavaScript reserved word (`return`, `function`, `for`, `let`,
  `const`, …).
- Function bodies must be indented relative to the signature.
- Single-line functions must be `name(args) => expression` on one physical line.

### 2.2 Core Plugin Imports

```
aiTextPlugin      = {import:ai-text-plugin}
textToImagePlugin = {import:text-to-image-plugin}
uploadPlugin      = {import:upload-plugin}
superFetch        = {import:super-fetch-plugin}
loadDependencies  = {import:ai-character-chat-dependencies-v1}   // Dexie, DOMPurify, etc.
commentsPlugin    = {import:comments-plugin}
dynamicImport     = {import:dynamic-import-plugin}
bugReport         = {import:bug-report-plugin}
```

**Defensive plugin access from panel JS** — handles the case where a plugin handle is not
yet present:

```js
function grab(name) {
  try { if (typeof root !== 'undefined' && root[name] !== undefined) return root[name]; } catch (e) {}
  try { if (window[name] !== undefined) return window[name]; } catch (e) {}
  return undefined;
}
const plugin = grab('aiTextPlugin');
if (typeof plugin !== 'function') { /* not loaded yet */ }
```

### 2.3 `$meta.dynamic`

The `$meta.dynamic` function generates page metadata. It must be fully self-contained — it
cannot reference `root.*` or external globals, so any list data it needs must be duplicated
as a literal inside it:

```
$meta
  header
    mode = minimal
  async dynamic(inputs) =>
    let urlNamedCharacters = { "ai-adventure": "abc123.gz" };  // duplicated inline
    return { title: "...", description: "..." };
```

### 2.4 `dynamicImport` — Lazy Loading

```
customBots
  ExtraBots = [dynamicImport('some-generator-id')]
```

Use `dynamicImport` for optional or large dependencies; use `{import:...}` for required
ones. `dynamicImport` lazy-loads another generator on demand.

---

## 3 · ai-text-plugin

The text-generation plugin. The underlying model is a DeepSeek model, which accounts for
its characteristically direct, informal response style.

### 3.1 Call Signature

```js
// Non-streaming:
const result = await root.aiTextPlugin({
  instruction:   "System prompt / task description",
  startWith:     "Text the model continues from",
  stopSequences: ["\n\n[[", "\n[["],
  hideStartWith: true,   // exclude startWith from generatedText
});
const text       = String(result);        // always String() — see §3.2
const stopReason = result.stopReason;      // see §3.3

// Streaming:
const handle = root.aiTextPlugin({
  instruction, startWith, stopSequences, hideStartWith,
  onChunk: ({ textChunk, isFromStartWith, fullTextSoFar }) => {
    if (isFromStartWith) return;
    updateUI(textChunk);
  },
});
const final = await handle;

// Token utilities:
const { countTokens, idealMaxContextTokens } = root.aiTextPlugin({ getMetaObject: true });
```

The options that take effect are `instruction`, `startWith`, `hideStartWith`,
`stopSequences`, and `onChunk`. Fields such as `temperature`, `model`/`modelName`, `topP`,
`frequencyPenalty`, and `maxTokens` are accepted without error but have **no effect** —
they are stored in the character-chat UI and database but never passed to the plugin.
`instruction`, `startWith`, and `stopSequences` may each also be a function returning the
value.

### 3.2 The Return Value is a Boxed String

The awaited return is **not** a plain string or plain object — it is a `String` object
(`new String(text)`) with extra named properties. This is the most common source of silent
bugs in Perchance code.

```js
typeof result                          // "object"
result instanceof String               // true
Object.prototype.toString.call(result) // "[object String]"
result.valueOf()                       // the primitive string

result.text            // trimmed output text
result.generatedText   // full output text — use this
result.stopReason      // see §3.3
result.length          // string length (works correctly)
```

Safe access:

```js
// Correct:
const text = String(result);
const text = result.generatedText;
if (String(result) === "hello") { }
if (result.generatedText === "hello") { }

// Wrong — an object reference never strict-equals a primitive string:
if (result === "hello") { }
```

The same rule applies to `uploadPlugin` (`result.url` is a boxed String) and to
`textToImagePlugin` (the awaited result is a boxed String).

### 3.3 The Synchronous Handle

`aiTextPlugin(...)` returns two different things at two different times. After `await` you
receive the boxed String above. The value returned *synchronously* — the awaitable handle —
is an extended **Promise** carrying additional properties:

```js
const handle = root.aiTextPlugin({ instruction: "..." });
// Object.getPrototypeOf(handle) === Promise.prototype

handle.stop                  // function — abort generation (resolved stopReason → "user")
handle.inputs                // object  — { instruction, startWith, stopSequences }
handle.liveResponseText      // string  — current text; updates live, includes user edits
handle.textStream            // ReadableStream — yields plain string chunks
handle.onFinishPromise       // Promise — resolves to { text, generatedText, stopReason }
handle.id                    // string  — completion id: "aiTextCompletion" + 17 digits
handle.loadingIndicatorHtml  // string  — inline SVG spinner markup (~519 chars)
handle.submitUserRating      // async function — submit a response-quality rating

const result = await handle; // → the boxed String
```

**`textStream`** is a standard web `ReadableStream` of plain string chunks — a cleaner
alternative to the `onChunk` callback:

```js
const handle = root.aiTextPlugin({ instruction: "Write a story." });
for await (const chunk of handle.textStream) {
  process(chunk);            // chunk is a bare string fragment
}
const result = await handle; // boxed String, as usual
// handle.textStream.getReader() is also available
```

**`submitUserRating`** is an `async` function feeding the response-quality system:

```js
await handle.submitUserRating({ score: 0.8, reason: "optional explanation" });
// score:  number from 0 (bad) to 1 (good), e.g. 0.4 or 0.8 — out-of-range values are rejected
// reason: optional string
// It refuses (logs an error) if generation has not finished or ended with an error.
// It performs a network round-trip and resolves to undefined.
```

Note: `handle.inputs.instruction` holds the original instruction text you passed. The
plugin applies a small mutation (see §3.7) to the internal wire payload only, not to
`handle.inputs`.

### 3.4 `stopReason` Vocabulary

| Value | Meaning |
|-------|---------|
| `"natural"` | The model finished on its own |
| `"artificial"` | A stop sequence was hit, or the output token limit was reached — both map here |
| `"error"` | Malformed request; `generatedText` is `""` |
| `"user"` | Generation was stopped via `handle.stop()` or an aborted stream |

`"stop_sequence"` and `"max_tokens"` are never returned — code branching on those strings
is dead. `"artificial"` cannot distinguish a stop-sequence hit from a token-limit hit.
`"user"` appears on the resolved result's `stopReason`; the `onChunk` callback's
`stopReason` stays `null` when a stream is stopped.

```js
if (result.stopReason === "error") {
  // malformed request — generatedText is empty
  return;
}
```

### 3.5 Context Window

`idealMaxContextTokens` is `6000`. It is advisory, not server-enforced — inputs well beyond
it (10,000+ tokens) are processed without truncation. Use `idealMaxContextTokens - 800` as
a practical prompt budget; the 800-token buffer keeps a single new message or summary
update from invalidating the backend prefix cache on every send.

`countTokens(str)` is an **approximate** token counter — a fast bigram statistical
estimator (a small embedded model), not a true tokenizer. Every value it returns is the
ceiling of an estimate. It runs locally with no network call, so token counts are
approximate but instant.

### 3.6 Concurrency & Performance

```
Concurrency:        1 call at a time per broker (strictly serial)
Cross-service:      text, image, and upload brokers are independent — they run in parallel
Rate limiting:      none observed across sequential calls
```

| Metric | Approximate value |
|--------|-------------------|
| Round-trip, short output | ~2,000 ms |
| Time-to-first-token | ~4,200 ms |
| Inter-chunk gap | ~286 ms average; first chunk up to ~2,300 ms |
| Output throughput | ~6 tokens/second |
| Practical output ceiling | ~900 tokens (~146 s), then `stopReason: "artificial"` |

The ~900-token ceiling is backend-enforced but not a hard limit — the model sometimes
stops naturally earlier. For longer output, chain sequential calls.

### 3.7 Streaming Details

Two streaming approaches are available — the `onChunk` callback and `handle.textStream`
(§3.3). The `onChunk` payload:

```js
{
  textChunk:       "...",  // the new delta
  isFromStartWith: false,  // true while echoing startWith
  fullTextSoFar:   "...",  // accumulated text so far
}
```

Aborting:

```js
handle.stop();
// → the promise resolves (it does not reject)
// → stopReason becomes "user"
// → onChunk fires zero more times after stop() returns
// → the queue slot is freed immediately; the next call starts at normal latency
```

**Instruction mutation:** every `instruction` is silently rewritten before being sent — the
first space becomes a non-breaking space (`\u00a0`), and if no regular space remains, a
trailing space is appended (so single-word instructions are padded). This applies to the
wire payload, not to `handle.inputs`.

### 3.8 Input Validation

| Input | Result |
|-------|--------|
| Numeric `instruction` | Coerced to string; `stopReason: "natural"` |
| Object or array as `instruction` | Throws a `TypeError` inside plugin code |
| Empty `{}` | Accepted; the model free-runs |
| 21+ `stopSequences` | `stopReason: "error"`, empty `generatedText` — the maximum is **20** |
| Null byte in instruction | Accepted (appears stripped) |

After a `stopReason: "error"` or an uncaught throw, the queue recovers cleanly — a bad
request cannot wedge the pipeline for later callers.

### 3.9 Instruction Patterns

**Chat completion:**

```js
const instruction = `
<MESSAGES>
[[User]]: Hello!
[[Chloe]]: Hi, how can I help?
</MESSAGES>
REMINDER: Keep replies short and in character.
>>> TASK: Write the next 3 messages.
`.trim();
const startWith = `[[Chloe]]:`;
const stopSequences = ["\n\n[[", "\n[["];
```

**Summarization:**

```js
const startWith = `
>>> FULL TEXT of [C]: ${messagesToSummarize}
>>> SUMMARY of [C]: (full, natural, readable sentences):`.trim();
const stopSequences = ["\n\n", "\n---", "\n>>> FULL TEXT", "FULL TEXT"];
const summary = result.generatedText.trim()
  .replace(/\n+/g, " ").replace(/---$/, "")
  .replace(">>> FULL TEXT", "").replace("FULL TEXT", "").trim()
  .replaceAll(/ *[—–] */g, ", ").trim();
```

**Memory extraction:**

```js
const instruction = `
@@@ TASK: Condense *NEW_TEXT* into up to 3 lore/memory/fact entries.
- Timeless facts only ("Bob was born in Paris", not "Bob is hungry").
- Each entry fully self-contained; use real names not pronouns.
# NEW_TEXT: ${messagesSummarizedText}
`.trim();
const startWith = `# Lore/memory entries from NEW_TEXT:\n1.`;
const stopSequences = ["\n4."];
const memories = ("1." + result.generatedText).trim()
  .split("\n").map(l => l.trim())
  .filter(l => /^[0-9]\. .+/.test(l))
  .map(l => l.replace(/^[0-9]\. /, "").replaceAll(/ *[—–] */g, ", "));
```

**Shared prefix cache** — structure related calls so they begin with an identical prefix;
the backend caches the token sequence and tokenizes the shared segment only once:

```js
const sharedPrefix = `# Context:\n${extraContext}\n# Prior summary:\n${priorSummary}`;
// Both the summary call and the memory call start with sharedPrefix.
```

---

## 4 · text-to-image-plugin

The image-generation plugin.

### 4.1 Call Modes

`textToImagePlugin(...)` returns two things at two times. The **synchronous return** is a
plain object (not a boxed String) with four own properties: `iframeHtml`, `evaluateItem`,
`onFinishPromise`, `toString`. After `await`, the result is a boxed String with three own
properties: `canvas`, `dataUrl`, `inputs`.

```js
// Template-injection mode — inject the iframe HTML directly:
container.innerHTML = `${root.textToImagePlugin(options)}`;
// String(result) is the raw iframe HTML (also result.iframeHtml / result.evaluateItem)

// Recommended — await the result directly:
const result = root.textToImagePlugin({ prompt, resolution, negativePrompt });
const data = await result;
// data.canvas   — HTMLCanvasElement
// data.dataUrl  — canvas.toDataURL("image/jpeg")
// data.inputs   — echoed options (prompt, resolution, guidanceScale, seed, width, style, save*)
// the awaited result has exactly these three own keys — there is no data.iframe

// Advanced — manual iframe injection. The iframe MUST be appended directly to
// document.body (not inside a hidden or clipped wrapper) or onFinishPromise hangs forever:
const raw = root.textToImagePlugin(options);
const tmp = document.createElement("div");
tmp.innerHTML = raw.iframeHtml;
const iframeEl = tmp.firstElementChild;
document.body.appendChild(iframeEl);
const data2 = await raw.onFinishPromise;
// after generation, the iframe ELEMENT gains a .textToImagePluginOutput property:
//   iframeEl.textToImagePluginOutput.canvas / .dataUrl / .inputs
iframeEl.remove();
```

### 4.2 Resolution

Only four resolution strings are accepted; any other value is silently dropped client-side
(0×0 canvas, `inputs.resolution` absent):

```
"512x512"   "512x768"   "768x512"   "768x768"
```

| Scenario | Resolution |
|----------|-----------|
| Plugin called with no `resolution` option | 512×512 (bare default) |
| AI character chat, no orientation keywords | 768×768 |
| `portrait` or `selfie` in the prompt | 512×768 |
| `landscape` or `wide angle` in the prompt | 768×512 |

The AI character chat resolves orientation before calling the plugin:

```js
if (!prompt.includes("(resolution:::")) {
  if (/\b(portrait|selfie)\b/i.test(prompt))            options.resolution = "512x768";
  else if (/\b(landscape|wide.?angle)\b/i.test(prompt)) options.resolution = "768x512";
  else                                                  options.resolution = "768x768";
}
if (!prompt.includes("(negativePrompt:::")) {
  options.negativePrompt = "low quality, worst quality, blurry";
}
```

### 4.3 Inline Prompt Parameters

The plugin parses a fixed set of `(key:::value)` parameters embedded anywhere in the prompt
text. They are extracted into `inputs` and stripped from the prompt before it reaches the
model:

```
A beautiful sunset (resolution:::768x512) (negativePrompt:::cars, buildings) (seed:::42)
```

| Inline parameter | Type | Notes |
|------------------|------|-------|
| `(seed:::N)` | number | `-1` = random |
| `(resolution:::WxH)` | string | one of the four valid sizes |
| `(negativePrompt:::text)` | string | bracket-depth parser; a missing `)` makes the rest of the string the negative prompt |
| `(guidanceScale:::N)` | number | 1–30, default 7 |
| `(size:::N)` | number | square size |
| `(width:::N)`, `(height:::N)` | number | echoed as a `"512px"` CSS string in `inputs` |
| `(style:::CSS)` | string | CSS for the iframe DOM element |
| `(saveTitle:::text)`, `(saveDescription:::text)` | string | public-gallery metadata |

### 4.4 Options & Behavior

| Option / property | Behavior |
|-------------------|----------|
| `negativePrompt` | Honored — measurably changes output |
| `seed` | Echoed in `inputs` but not reliably honored — output varies regardless |
| `guidanceScale` | Default 7, range 1–30; reaches the backend |
| `style` | CSS string applied to the iframe DOM element — not an image-style preset |
| `removeBackground: true` | Runs client-side (see below) |
| Generation time | ~13–14 s |
| Queue | Independent from text generation — image and text run in parallel |

**`removeBackground: true`** runs entirely client-side: it downloads the `briaai/RMBG-1.4`
model via transformers.js (q8 quantization, WASM backend) and strips the background
in-browser. The server generates a normal image; the device removes the background. Output
is a **PNG with alpha** rather than JPEG. The option is not echoed in `inputs` because it
is a post-process, not a server parameter. The first call is slow (model download); later
calls reuse the cached model.

**Empty or inline-only prompts hang forever.** A `prompt` of `""`, or one consisting only
of inline parameters, passes client-side validation but the backend never responds — the
call never resolves and never times out. Always pass real description text:

```js
// Hangs — never resolves:
await t2i({ prompt: '', resolution: '512x512' });
await t2i({ prompt: '(resolution:::512x768)' });

// Fine — both accepted, generate normally:
await t2i({ prompt: 'a red apple', negativePrompt: '' });
await t2i({ prompt: 'a red apple', negativePrompt: null });
```

The AI character chat guards against this by stripping empty `<image></image>` tags before
rendering — custom code must do the same.

### 4.5 Image Persistence

Images regenerate by default on every render. A "Keep" button saves the JPEG to
`message.customData.__savedImages[corePrompt]` in IndexedDB. Including `@noKeepButton`
anywhere in an image description suppresses the keep/delete UI (useful for transient
images).

### 4.6 The `<image>` Tag in AI Chat

When an AI message contains `<image>description</image>`, the character chat extracts the
description, applies `imagePromptPrefix` / `imagePromptSuffix` / `imagePromptTriggers`,
resolves the resolution, calls `textToImagePlugin`, and injects the iframe.

The model only knows about the `<image>` syntax when it is explicitly told. Without the
hint, the model either ignores image requests or refuses them outright. Provide the hint in
the instruction whenever image generation should be available:

```js
const IMAGE_TAG_HINT =
  'Note: You can embed an AI-generated image in your reply using this exact syntax: ' +
  '`<image>A detailed description of the scene or subject</image>` ' +
  '— the content inside the tag will be used to generate an actual image. ' +
  'Use this when the user asks for an image or when an image would enhance the reply.';
```

Once the hint is given, the model reliably produces well-formed single and multiple
`<image>...</image>` tags. Structural priming with `startWith: '<image>'` does not work —
the model writes the description but never closes the tag.

`imagePromptTriggers` syntax (one rule per line; values may contain Perchance
`{option|option}` syntax):

```
CharacterName: physical description to append when the name appears in the prompt
/regex/flags: text to append when the regex matches the prompt
keyword: @prepend description    ← @ prefix prepends instead of appending
```

---

## 5 · upload-plugin

Anonymous file hosting on Perchance's content-addressed CDN.

```js
const result = await root.uploadPlugin(blob);
const url = String(result.url);   // String() required — url is a boxed String
const { size, error, deletionUrl } = result;
```

### 5.1 Return Shape

```js
{
  url:         BoxedString,   // "https://user.uploads.dev/file/<hash>.<ext>"
  size:        number,        // file size in bytes
  error:       string | null,
  deletionUrl: string,        // GET this URL to permanently delete the file
}
```

### 5.2 Content Addressing

The CDN is content-addressed, but the hash covers **bytes plus MIME type**, not bytes
alone:

```js
const a = await uploadPlugin(new Blob([data], { type: 'text/plain' }));
const b = await uploadPlugin(new Blob([data], { type: 'application/octet-stream' }));
String(a.url) !== String(b.url);   // different hash and different extension
```

Identical bytes with an identical MIME type deduplicate to the same URL.

### 5.3 Deletion

```js
// deletionUrl format:
// https://upload.perchance.org/api/delete?fileId=<id>&deletionKey=<key>
await fetch(result.deletionUrl);
// The file is deleted immediately; subsequent requests to the file URL return 404.
```

### 5.4 MIME Type Coverage

| MIME type | Result | Served as |
|-----------|--------|-----------|
| `text/plain` | accepted | `.txt` |
| `image/png`, `image/jpeg`, `image/gif`, `image/webp` | accepted | matching |
| `image/svg+xml` | accepted — see [§19](#19--security-notes) | `.svg` |
| `application/json` | accepted | `.json` |
| `application/pdf` | accepted | `.pdf` |
| `application/javascript` | accepted, stored as `.bin` (served as `application/octet-stream`, not executable) | `.bin` |
| `application/octet-stream` | accepted | `.bin` |
| `video/mp4` | accepted | `.mp4` |
| `audio/mpeg` | accepted | `.mp3` |
| `text/html` | **rejected** → `invalid_filetype` | — |

The service is very permissive. `text/html` is the only confirmed rejection. JavaScript is
accepted but defanged to `.bin`. SVG is accepted and is script-capable — see the security
notes.

### 5.5 Size Limits

| Item | Value |
|------|-------|
| Maximum accepted | 5 MB |
| Rejected | 6 MB → `file_too_big` |
| Zero-byte blob | accepted |

### 5.6 Anti-Abuse & the `expires` Option

The upload broker runs a Cloudflare Turnstile verification before the first anonymous
upload of a session. The two Turnstile sitekeys are:
- `0x4AAAAAAAJn3pYzPx4ATVOt` — text-generation broker
- `0x4AAAAAAAA8g8NphwaSOT59` — image-generation broker
- `0x4AAAAAAAIXRUXRfqyYaEMy` — upload broker (distinct from image-gen!) It is usually invisible, but it is a real anti-abuse gate that can
challenge automated upload pipelines. The first upload of a session is slow (it includes
the verification); subsequent uploads reuse the token and are fast.

`uploadPlugin(blob, { expires: ... })` accepts an `expires` option that is passed through
to the upload backend. It is validated client-side and is format-strict — plain numbers and
duration strings are rejected with `invalid_expiry`. The accepted format is a timestamp.

### 5.7 Error Handling

```js
if (result.error) {
  alert(`Upload error: ${result.error}${
    result.error === "disallowed_content"
      ? ". Edit the character description to explicitly state the character is 18+ —"
        + " the moderation system can flag ambiguous descriptions."
      : ""
  }`);
  return;
}
```

---

## 6 · super-fetch-plugin

A server-side CORS proxy. Requests egress from Cloudflare infrastructure rather than the
user's browser, which bypasses CORS restrictions inside the sandbox.

```js
const response = await root.superFetch(url, init);
// Returns a standard Response-like object:
const data = await response.json();
const text = await response.text();
const buf  = await response.arrayBuffer();
```

### 6.1 Behavior

| Feature | Result |
|---------|--------|
| GET, POST, PUT, DELETE | All work; correct status codes are returned |
| POST/PUT request body | Forwarded to the upstream |
| Redirects | Followed; the final status code is returned |
| Status passthrough | Yes (e.g. 418 → 418) |
| `data:` URLs | Handled |
| Slow upstreams | The proxy waits; no client-side timeout was observed |
| Custom request headers | **Stripped** — they never reach the upstream |
| Cookie jar | **None** — each call is cookie-isolated |
| Response size | **No general cap** — large files (hundreds of KB and up) return in full |
| Caching | By full URL including query string |

For authenticated requests, put credentials in URL parameters rather than headers — custom
headers are stripped:

```js
// Wrong — the header never arrives:
root.superFetch(url, { headers: { Authorization: 'Bearer token' } });
// Correct:
root.superFetch(url + '?token=' + encodeURIComponent(token));

// Cache-bust when fresh data is required:
const fresh = await root.superFetch(`${url}?_=${Date.now()}`);
```

### 6.2 Proxy Bypass List

Requests to a small set of origins are sent via plain `window.fetch`, skipping the proxy
entirely (faster, no header handling):

- `*.jsdelivr.net`
- `*.catbox.moe`
- `raw.githubusercontent.com`
- `huggingface.co` URLs containing `/resolve/`

The upload origins (`user-uploads.perchance.org`, `user.uploads.dev`, `aigc.uploads.dev`)
attempt a direct fetch first and fall back to the proxy on failure.

### 6.3 SSRF Protection

Requests to internal and private addresses fail immediately (`Failed to fetch`, within
~65–160 ms): `localhost`, `127.0.0.1`, `0.0.0.0`, `169.254.169.254` (cloud metadata), and
RFC-1918 ranges (`192.168.x.x`, `10.x.x.x`, `172.16.x.x`). The proxy attempts the request,
but Cloudflare cannot route to private addresses. There is no SSRF exposure via
`superFetch`.

---

## 7 · The `root` Proxy

`root` is a JavaScript `Proxy` wrapping a callable function target. It is the bridge
between the Perchance DSL (top editor) and panel JavaScript.

### 7.1 Proxy Characteristics

```js
typeof root              // "function" — a callable Proxy
'aiTextPlugin' in root   // true — the in-operator works
root.__nonexistent__     // undefined — safe for feature detection
Reflect.ownKeys(root)    // THROWS — the ownKeys trap is non-spec-compliant
JSON.stringify(root)     // undefined — no enumerable keys
root[Symbol.iterator]    // undefined — not iterable
root()                   // THROWS, and corrupts the Proxy for all subsequent reads
```

**Never call `root()` directly.** Doing so throws and also leaves the Proxy in a broken
state where every later `root.x` read throws as well. Only ever read properties from
`root`.

### 7.2 DSL List Objects

`root.myList` returns the internal Perchance List object, not an evaluated string:

```js
const list = root.myList;

// Own keys:
// $root, $declarationLineNumber, $moduleName, $valueChildren, $functionChildren,
// $allKeys, $allKeysSet, $perchanceCode, $odds,
// getOdds, getName, getParent, getLength, getRawListText, getSelf,
// getPropertyKeys, getPropertyNames, getChildNames, getFunctionNames, getAllKeys

list.toString()        // the list name as a string
list.evaluateItem      // a STRING — a pre-evaluated item snapshot, not a callable
list[Symbol.iterator]  // undefined — not iterable
```

### 7.3 DSL Functions — a One-Way Bridge

Functions defined in the top editor are exposed as callable properties, but their return
values do not cross back to panel JavaScript:

```js
// Top editor:  greet(name) => "Hello " + name
const fn = root.greet;
typeof fn      // "function"
fn.length      // 1 — arity is passed through
fn("world")    // undefined — the return value is dropped at the bridge boundary
```

The Perchance engine executes the DSL function, but the result stays on the DSL side. Any
logic that must return a value should be written directly in the panel script.

---

## 8 · Public HTTP API

Server-callable endpoints on `https://perchance.org/api/`. They require no broker handshake
and work from anywhere — a server, a script, or another origin. They expose generator
**metadata and source only**; they do not run the AI plugins.

| Endpoint | Returns |
|----------|---------|
| `getGeneratorStats?name=NAME` | JSON: views, last-edit time, public id, metadata |
| `getGeneratorStats?names=N1,N2` | JSON array for multiple generators |
| `getGeneratorList?max=N&tags=...` | JSON: recently-edited generators |
| `downloadGenerator?generatorName=NAME` | The full generator as HTML |
| `downloadGenerator?...&listsOnly=true` | DSL lists only, without the HTML wrapper |
| `getGeneratorsAndDependencies?generatorNames=...` | JSON: generators plus their imports |
| `getGeneratorScreenshot?generatorName=NAME` | `image/jpeg` |
| `upload.perchance.org/api/fileInfo?url=...` or `?id=...` | JSON file information |
| `upload.perchance.org/api/upload` | Upload endpoint — returns `anti_bot_verification_needed` without Turnstile |
| `upload.perchance.org/api/delete?fileId=...&deletionKey=...` | Delete a file by ID + key |
| `upload.perchance.org/api/checkVerificationStatus` | Check Turnstile verification state |
| `upload.perchance.org/api/cloudflareTurnstileVerify` | Submit Turnstile token for verification |

**Backend endpoints** (require broker-minted auth tokens — not directly callable):

| Endpoint | Auth | Response without auth |
|----------|------|-----------------------|
| `text-generation.perchance.org/api/generate` | `userKey` (64-hex, from broker handshake) | `{"status":"invalid_key"}` |
| `image-generation.perchance.org/api/generate` | `userKey` (same pattern) | `{"status":"invalid_key"}` |
| `image-generation.perchance.org/gallery` | Parameter-dependent | `{"status":"invalid_parameter"}` |

**Platform-internal endpoints** (observed on load, not part of the stable API):

| Endpoint | Method | Response |
|----------|--------|----------|
| `getCommunityData` | GET | JSON — community/forum data |
| `checkGeneratorOwnership` | POST (with `{generatorName}`) | `{"status":"is-not-owner"}` or `"is-owner"` |
| `clearCacheIfGeneratorOrImportsHaveBeenUpdated` | GET (with params) | `true` — the CDN edge-cache invalidation mechanism |
| `getGeneratorHtml` | GET (needs params) | `{"success":false,"status":"invalid-request"}` without valid params |

`downloadGenerator` carries an explicit backwards-compatibility guarantee and is the safe
endpoint to build on. The older `generateList.php` endpoint is legacy and unreliable —
prefer `downloadGenerator` with client-side DSL evaluation, or `getGeneratorStats` /
`getGeneratorList` for metadata.

**Response schemas** (confirmed via probing):

```
getGeneratorStats?name=NAME
  → { name, views, lastEditTime, metaData: { title, description, ... }, publicId }

getGeneratorList?max=N
  → { status, generators: [{ name, views, lastEditTime, lastEditTime_ago, metaData }] }

getGeneratorsAndDependencies?generatorNames=N1,N2
  → { success, generators: { slug: { name, imports, code, lastEditTime } }, unfound }

getGeneratorHtml?generatorName=NAME
  → HTML panel content only (no DSL lists); only accepts generatorName param

downloadGenerator?generatorName=NAME
  → full generator as HTML; with &listsOnly=true → DSL lists only

upload.perchance.org/api/fileInfo?url=URL (or ?id=ID)
  → { tags, extension }
```

**Backend API wire format** (from console log analysis of a live chat session):

Text generation (`POST text-generation.perchance.org/api/generate`):
```
?userKey=<64-hex>                    # Turnstile-minted session key
&thread=0                            # conversation thread ID
&requestId=aiTextCompletion<17-digits>
&__cacheBust=<Math.random>
```

Image generation (`POST image-generation.perchance.org/api/generate`):
```
?userKey=<64-hex>                    # different key from text-gen
&requestId=<Math.random>             # NOT the aiTextCompletion format
&adAccessCode=<64-hex>               # ad completion proof token
&v=<64-hex>                          # build/version verification hash
&__cacheBust=<Math.random>
```

Image generation requires an `adAccessCode` — a token proving the user watched an ad via
`ads.perchance.org/?provider=vli`. Each broker mints its own `userKey` independently via
Turnstile verification. The `v` parameter appears to be a build verification hash.

None of these endpoints can drive AI generation. `aiTextPlugin` and `textToImagePlugin`
require the in-page broker handshake, which requires a real browser loading a real
generator page.

**`/api/save`** (POST, session-based) — saves a generator. Only callable by the
generator owner from the editor context.

**Complete API endpoint catalog** (34 endpoints from saved page source analysis):

Public (no auth): `downloadGenerator`, `getGeneratorList`, `getGeneratorStats`,
`getGeneratorScreenshot`, `getGeneratorsAndDependencies`, `getCommunityData`,
`getDynamicMetaData`, `getGeneratorHtml`, `securityData`, `generate`, `cv`, `count`.

Session-based (require `sessionToken`): `save`, `checkGeneratorOwnership`,
`changeGeneratorName`, `changeGeneratorPrivacy`, `deleteGenerator`,
`duplicateGenerator`, `getGeneratorsByUser`, `saveUserGeneratorFolderMap`,
`getPrivateNotes`, `setPrivateNotes`, `getGeneratorDiffPatches`.

Account management: `login`, `verify`, `changeEmail`, `changePassword`,
`deleteAccount`, `requestPasswordResetCode`, `resetPassword`.

Collab editing (all live, return JSON): `getCollabEditKey`
(→ `{"status":"invalid-credentials"}` without auth), `validateCollabEditKey`
(→ `{"status":"invalid"}`), `deleteCollabEditKey` (POST, → `{"status":"server-error"}`),
`regenerateCollabEditKey` (POST, → `{"status":"server-error"}`).

**API error vocabulary** (complete set observed R22-R23):
`server-error`, `session-token-error`, `invalid-credentials`, `invalid`,
`captcha-needed`, `incorrect-code`, `invalid_data_type`, `is-not-owner`, `is-owner`.

Note: `getDynamicMetaData` is **GET-only** (404 on POST). `getGeneratorsByUser`
returns the distinct `session-token-error` status (not generic `server-error`).
`verify` accepts body and checks code without verifying user existence first.
`/api/rateGeneratedText` is a quality-feedback endpoint (from broker source).

Infrastructure: `clearCacheIfGeneratorOrImportsHaveBeenUpdated`,
`getAccessCodeForAdPoweredStuff` (GET, returns 64-hex ad token — no auth needed),
`aiHelper` (POST-only, GET times out), `alc` (GET, returns `1` — meaning TBD),
`iusb` (GET, returns `0` — meaning TBD).

Non-existent: `/api/generate` returns 404 on both GET and POST — it's referenced
in source but doesn't exist as an endpoint.

POST-only endpoints (404 on GET): `login` (returns `{"status":"captcha-needed"}`),
`verify`, `changeGeneratorName`, `changeGeneratorPrivacy`, `deleteGenerator`,
`duplicateGenerator`, `getGeneratorsByUser`, `saveUserGeneratorFolderMap`,
`getPrivateNotes`, `setPrivateNotes`, `getGeneratorDiffPatches`,
`requestPasswordResetCode`.

**Platform-internal endpoint details** (from probing — not a stable API):

`clearCacheIfGeneratorOrImportsHaveBeenUpdated` returns a boolean:
- `true` = CDN cache was invalidated.
- `false` = no invalidation (insufficient params, or generator doesn't exist).
- Requires the full param set: `generatorName`, `importedGeneratorNames`,
  `clientHtmlServerRenderTime`, `transferSize`. With `generatorName` alone → `false`.
  A far-future `clientHtmlServerRenderTime` always triggers invalidation (`true`).

`checkGeneratorOwnership` is **session-based** — it checks the caller's browser session,
not a request-body field. POST with any body returns `{"status":"is-not-owner"}` (or
`"is-owner"` for the logged-in creator). GET returns 404 — POST only.

`getCommunityData` returns `{status:"success", data:{lastPost, posts}}` — a community
forum feed. Accepts query parameters that slightly vary the response.

**Backend `/api/generate`** (on `text-generation` and `image-generation`): the `userKey`
is validated first; every request without a valid key returns `{"status":"invalid_key"}`
regardless of other parameters or HTTP method.

**`image-generation.perchance.org/gallery`** is authentication-gated — returns
`{"status":"invalid_parameter"}` for all query-param variants tested.

**Upload `/api/upload`** validates the `expires` query parameter *before* the Turnstile
check — `?expires=test` returns `invalid_expiry` while all other params return
`anti_bot_verification_needed`.

**`rss-feeds.perchance.org/<generatorName>`** serves an RSS 2.0 XML feed per generator.
The path is the generator name (e.g. `/animal`, `/ai-character-chat`). Each feed has a
`<title>` matching the generator name and contains 1 `<item>`. Even nonexistent generator
names return a 200 with a valid RSS feed. The root `/` returns 404. The service has a
strict CSP (`default-src 'none'`) blocking all external scripts.

**Infrastructure behavior:**

- `fetch-plugin.perchance.org` validates `?origin=` before routing — every request
  without a valid origin returns `HTTP 400 "Invalid origin."`.
- `comments-plugin.perchance.org` returns 404 for all probed paths (36 tested).
- Generator page query parameters (`?raw=1`, `?json=1`, `?debug=1`, etc.) are ignored by
  the server — all return the identical full HTML. URL-param handling is client-side only.
- `robots.txt` disallows only `/api/downloadGenerator`.

---

## 9 · Sandbox Capabilities

The sandbox iframe (`allow-scripts allow-same-origin`) exposes a wider capability set than
many developers expect:

| Capability | Available | Notes |
|-----------|-----------|-------|
| Popups (`window.open`) | No | Returns `null` |
| Notifications | API present | Permission pre-denied |
| Fullscreen | Yes | |
| Cache Storage | Yes | `caches.open()` succeeds |
| OPFS (`storage.getDirectory`) | Yes | |
| Geolocation | Present | State `prompt` — the user can be asked |
| Camera / microphone | Present | State `prompt` — the user can be asked |
| Clipboard read | Present | Denied by default |
| `localStorage` / `indexedDB` | Yes | Functional |
| `document.cookie` | Yes | Readable and writable |
| `SharedArrayBuffer` | No | `crossOriginIsolated` is `false` |
| Child iframes with scripts | Yes | Inherit `allow-scripts` |

---

## 10 · AI Character-Chat Data Model

The AI character chat persists state in IndexedDB via Dexie.js:

```js
const db = new Dexie("chatbot-ui-v1");
db.version(N).stores({
  characters: "++id, name, uuid",
  threads:    "++id, characterId, lastViewTime, lastMessageTime",
  messages:   "++id, threadId, characterId, order",
  memories:   "++id, threadId",
  lore:       "++id, bookId, bookUrl",
  summaries:  "hash",
  usageStats: "++id, threadId",
  misc:       "key",
});
```

### 10.1 Character

```js
{
  id, uuid,
  name: "Chloe",
  roleInstruction: "...",            // < 1000 words
  reminderMessage: "...",            // < 100 words
  generalWritingInstructions: "@roleplay1" | "@roleplay2" | "custom text",
  initialMessages: [{ author: "user"|"ai"|"system", content: "..." }],
  avatar: { url: "https://...", size: 1, shape: "square" },
  userCharacter: { name, roleInstruction, reminderMessage, avatar: { url } },
  systemCharacter: { avatar: {} },
  modelName: "good" | "great",       // stored and shown in UI, but not passed to aiTextPlugin
  scene: { background: { url }, music: { url } },
  loreBookUrls: ["https://user.uploads.dev/file/xxx.txt"],
  autoGenerateMemories: "none" | "enabled",
  textEmbeddingModelName: "default",
  maxParagraphCountPerMessage: null | 1 | 2 | 3 | 4,
  streamingResponse: true,
  customCode: "",
  imagePromptPrefix: "",             // prepended to every image prompt; supports Perchance syntax
  imagePromptSuffix: "",             // appended to every image prompt; supports Perchance syntax
  imagePromptTriggers: "",           // conditional appends — see §4.6
  metaTitle: "", metaDescription: "", metaImage: "",
  customData: {}, folderPath: "",
  creationTime: Date.now(), lastMessageTime: Date.now(),
}
```

`temperature`, `modelName`, `topP`, and `frequencyPenalty` are stored on characters and
threads but are never passed to `aiTextPlugin` — they are effectively inert in the current
implementation.

### 10.2 Message

```js
{
  id, threadId, characterId,
  message: "Text of the message",
  name: null,
  order: id,
  hiddenFrom: [],                // [] | ["ai"] | ["user"]
  expectsReply: undefined | true | false,
  variants: [null],
  summariesEndingHere: {},       // { level: "summary text" }
  memoriesEndingHere: {},        // { level: [{ text, embedding }] }
  memoryIdBatchesUsed: [],
  loreIdsUsed: [],
  memoryQueriesUsed: [],
  messageIdsUsed: [],
  scene: null, avatar: {}, customData: {}, wrapperStyle: "",
  instruction: null,
}
```

### 10.3 Thread

```js
{
  id, characterId,
  name: "Thread name",
  modelName, textEmbeddingModelName,
  character: {},
  userCharacter: { name, roleInstruction, reminderMessage, avatar: {} },
  systemCharacter: { avatar: {} },
  isFav: false, folderPath: "",
  lastViewTime, lastMessageTime,
  currentSummaryHashChain: [],
  customCodeWindow: { visible: false, width: null },
  customData: {},
}
```

---

## 11 · Message Format & Wire Protocol

The AI character chat serializes conversation history into a simple bracketed format:

```
[[CharacterName]]: Message content here.

[[AnotherCharacter]]: Their reply.
```

- Messages are separated by `\n\n`.
- Standard stop sequences are `["\n\n[[", "\n[["]`; add `"\n\n"` to limit output to a
  single paragraph.
- Messages with `hiddenFrom: ["ai"]` are filtered out before sending.
- `<!--hidden-from-ai-start-->…<!--hidden-from-ai-end-->` strips inline sections from what
  the AI sees.
- Template variables: `{{user}}` → the user's name, `{{char}}` → the character's name.

---

## 12 · Hierarchical Summarization

Long conversations are compressed with multi-level summarization:

```
Level 0 = raw messages
Level 1 = summaries of ~1500-character blocks of level 0
Level 2 = summaries of level-1 summaries
...
```

**When to summarize** — compare the current conversation length against a token budget:

```js
const { countTokens, idealMaxContextTokens } = root.aiTextPlugin({ getMetaObject: true });
const budget = idealMaxContextTokens - 800;   // the 800-token buffer protects the prefix cache
const currentLength = countTokens(messageText + extraTextForAccurateTokenCount);
if (currentLength < budget) return;
(async () => { /* background summarization — non-blocking */ })();
```

**Batch injection** — write summaries to the database only once several are ready, so the
backend prefix cache is not invalidated on every message:

```js
if (window.__aiHierarchicalSummaryStuff[threadId].summariesReadyToInject.length >= 3) {
  for (const m of messagesToUpdate) {
    await db.messages.update(m.id, { summariesEndingHere: m.summariesEndingHere });
  }
  window.__aiHierarchicalSummaryStuff[threadId].summariesReadyToInject = [];
}
```

**Block size** — summarize ~1500 characters at a time. Larger blocks risk overflowing the
context when summarizing summaries at deeper levels.

```js
const numCharsToSummarizeAtATime = 1500;
```

**Context reconstruction** — walk backward through messages, collecting them while
monotonically climbing summary levels; a higher-level summary covers all the lower-level
raw messages it replaced:

```js
let highestLevelSeen = 0;
while (messages.length > 0) {
  const m = messages.pop();
  const level = m.summariesEndingHere
    ? Math.max(...Object.keys(m.summariesEndingHere).map(Number))
    : 0;
  if (level >= highestLevelSeen) { result.unshift(m); highestLevelSeen = level; }
}
```

---

## 13 · Memory & Lore

**Associative memory** — timeless facts extracted from conversations, stored in
`db.memories`. Embeddings are computed lazily at database-write time:

```js
if (window.textEmbedderFunction && m.memoriesEndingHere) {
  for (const lvl in m.memoriesEndingHere) {
    for (const mem of m.memoriesEndingHere[lvl]) {
      if (!mem.embedding) {
        [mem.embedding] = await window.embedTexts({
          textArr: [mem.text],
          modelName: thread.textEmbeddingModelName,
        });
      }
    }
  }
}
```

**Lorebooks** — static fact files hosted on `user.uploads.dev`, loaded and embedded at
thread start.

**Text embedding** — requires `{import:ai-character-chat-dependencies-v1}`:

```js
if (window.textEmbedderFunction) {
  const [vector] = await window.embedTexts({ textArr: ["text"], modelName: "default" });
  const dist = cosineDistance(vec1, vec2);   // lower = more similar
}
```

**Injection format** — retrieved memories and lore are wrapped so the model can disregard
them when irrelevant:

```
<ignore_this_if_irrelevant>
[MEMORIES & LORE]
• Bob was born in Paris (memory)
• The castle has three towers (lore)
</ignore_this_if_irrelevant>
```

---

## 14 · File Hosting & Share Links

Share links pack application state into a gzip-compressed upload and reference it by URL:

```js
async function generateShareLink(json) {
  if (!window.CompressionStream) {
    alert("Share links require a modern browser.");
    return;
  }
  const blob = await fetch("data:text/plain;charset=utf-8,"
    + JSON.stringify(json).replace(/#/g, "%23")).then(r => r.blob());
  const compressed = await compressBlobWithGzip(blob);
  const result = await root.uploadPlugin(compressed);
  if (result.error) { /* handle */ return; }
  const fileName = String(result.url)   // String() — url is a boxed String
    .replace("https://user.uploads.dev/file/", "");
  const charName = json.addCharacter.name.replace(/\s+/g, "_").replaceAll("~", "");
  return `https://perchance.org/${window.generatorName}?data=${charName}~${fileName}`;
}

async function loadDataFromShareUrl() {
  const dataParam = new URL(window.location.href).searchParams.get("data");
  const fileName = dataParam.split("~").slice(-1)[0];
  const blob = await fetch("https://user.uploads.dev/file/" + fileName, {
    signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : null,
  }).then(r => r.ok ? r.blob() : null).catch(console.error);
  if (!blob) { return null; }
  return JSON.parse(await (await decompressBlobWithGzip(blob)).text());
}

async function compressBlobWithGzip(blob) {
  const cs = new CompressionStream("gzip");
  return new Blob([await new Response(blob.stream().pipeThrough(cs)).blob()],
                  { type: "application/gzip" });
}
async function decompressBlobWithGzip(blob) {
  return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).blob();
}
```

---

## 15 · Sandboxed Custom Code

User-supplied code is evaluated inside a separate sandboxed iframe with a strict origin
check and a timeout:

```js
const result = await root.evaluatePerchanceTextInSandbox(codeString, { timeout: 5000 });

async function evaluatePerchanceTextInSandbox(text, opts = {}) {
  const SANDBOX_ORIGIN = 'https://<sandbox-hex-id>.perchance.org';
  let iframe = document.querySelector('#perchanceCodeEvaluationSandboxIframe');
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.src = SANDBOX_ORIGIN + "/ai-character-chat-sandboxed-executor";
    iframe.id = "perchanceCodeEvaluationSandboxIframe";
    iframe.sandbox = "allow-scripts allow-same-origin";
    iframe.style.cssText =
      "position:fixed;width:1px;height:1px;opacity:0.01;top:-10px;right:-10px;"
      + "pointer-events:none;border:0;";
    document.body.append(iframe);
    iframe._resolvers = {};
    let readyResolve;
    const ready = new Promise(r => readyResolve = r);
    window.addEventListener('message', event => {
      if (event.origin !== SANDBOX_ORIGIN) return;          // origin check is mandatory
      if (event.data.finishedLoading) { readyResolve(); return; }
      const { requestId, text } = event.data;
      if (iframe._resolvers[requestId]) {
        iframe._resolvers[requestId](text);
        delete iframe._resolvers[requestId];
      }
    });
    await ready;
  }
  const requestId = Math.random().toString();
  return new Promise((resolve, reject) => {
    iframe._resolvers[requestId] = resolve;
    if (opts.timeout) setTimeout(() => {
      if (iframe._resolvers[requestId]) reject("Sandbox timeout");
    }, opts.timeout);
    iframe.contentWindow.postMessage({ text, requestId }, SANDBOX_ORIGIN);
  });
}
```

Always verify `event.origin` against the expected sandbox origin before trusting a message.

---

## 16 · UI Utilities

**`confirmAsync`** — a promise-returning confirmation modal:

```js
async function confirmAsync(message, opts = {}) {
  return new Promise(resolve => {
    const overlay = Object.assign(document.createElement("div"), { tabIndex: 0 });
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999999;display:grid;place-items:center;"
      + "background:rgba(0,0,0,.65);font:16px/1.4 system-ui";
    overlay.innerHTML = `<div style="max-width:min(97vw,450px);padding:15px;border-radius:8px;
      background:light-dark(#fff,#222);color:light-dark(#000,#fff);">
      <p style="margin:0 0 20px;white-space:pre-wrap;">${
        message.replace(/[<>&]/g, m => ({ '<':'&lt;','&':'&amp;','>':'&gt;' }[m]))}</p>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button ${opts.hideCancel ? "hidden" : ""}>Cancel</button>
        <button autofocus>Okay</button>
      </div></div>`;
    const [cancelBtn, okBtn] = overlay.querySelectorAll("button");
    const done = val => { overlay.remove(); resolve(val); };
    cancelBtn.onclick = () => done(false);
    okBtn.onclick = () => done(true);
    overlay.onkeydown = e => {
      if (e.key === "Escape") done(false);
      else if (e.key === "Enter") done(true);
    };
    document.body.append(overlay);
    overlay.focus({ preventScroll: true });
  });
}
```

**`prompt2`** — a rich form modal:

```js
const result = await window.prompt2({
  fieldName: { type: "textLine", label: "Name", placeholder: "...", defaultValue: "" },
  bio:       { type: "text",     label: "Bio",  placeholder: "..." },
  model:     { type: "select",   label: "Model", options: ["good", "great"] },
  extra:     { type: "textLine", show: (v) => v.model === "great" },
});
// Returns null if cancelled, otherwise { fieldName: "...", ... }
```

**Loading and floating windows:**

```js
const modal = createLoadingModal("Processing...");
modal.delete();
const win = createFloatingWindow({
  header: "Title", body: element, initialWidth: 400, initialHeight: 300,
});
```

---

## 17 · Page Initialization

A typical AI-chat generator initializes in this order:

```
1. Open the IndexedDB database
2. Parse the URL for hash/data commands
3. Render the thread list
4. Auto-open the most recent thread (or add a starter character)
5. Reveal the UI, hide the loading modal
6. Persist browser storage
7. Preload the AI plugin
```

```js
async function checkForHashCommand() {
  let urlHashJson = null;
  try { urlHashJson = JSON.parse(decodeURIComponent(window.location.hash.slice(1))); }
  catch (e) {}
  if (urlHashJson?.addCharacter
      || new URL(window.location.href).searchParams.get("data")) {
    const data = await loadDataFromShareUrl();
    const character = data?.addCharacter;
    if (character) {
      const confirmed = await confirmAsync(
        "You've visited a character sharing link. This character may discuss sensitive"
        + " themes — please click cancel if you are under 18."
      );
      if (confirmed) {
        const result = await characterDetailsPrompt(character,
          { autoSubmit: urlHashJson?.quickAdd });
        if (result) {
          const newChar = await addCharacter(result);
          await createNewThreadWithCharacterId(newChar.id);
        }
      }
    }
    if (window.location.hash) { window.location.hash = ""; }
  }
}

async function tryPersistBrowserStorageData() {
  if (navigator.storage?.persist) await navigator.storage.persist();
}
```

Preload the AI plugin once at the end of initialization with
`root.aiTextPlugin({ preload: true })`.

---

## 18 · Common Patterns

**CORS bypass:**

```js
const r = await root.superFetch("https://api.example.com/data");
const text = await r.text();
const fresh = await root.superFetch(`https://api.example.com/data?_=${Date.now()}`);
```

**Conditional image generation** — only tell the model about the `<image>` tag when an
image is likely wanted:

```js
const imageKeywords = /\b(images?|pics?|photos?|selfie|draw|paint|generate)\b/i;
if (imageKeywords.test(fullContext)) {
  // append the IMAGE_TAG_HINT from §4.6 to the instruction
}
```

**iOS Safari viewport fix** — prevent auto-zoom when an input is focused:

```js
try {
  if (navigator.vendor?.includes('Apple') && window.innerWidth < 800
      && window.matchMedia("(pointer: coarse)").matches) {
    const m = document.querySelector("[name=viewport]");
    if (!m.content.includes("maximum-scale")) m.content += ", maximum-scale=1";
  }
} catch (e) {}
```

**Token budget management:**

```js
const { countTokens, idealMaxContextTokens } = root.aiTextPlugin({ getMetaObject: true });
const budget = idealMaxContextTokens - 800;
if (countTokens(roleInstructionText) > budget * 0.3) {
  roleInstructionText = truncateRoleInstruction(roleInstructionText, 3000);
}
// Drop the oldest messages first until the conversation fits within budget.
```

---

## 19 · Security Notes

### 19.1 SVG Uploads — Stored XSS Risk

`uploadPlugin` accepts SVG files and the CDN serves them verbatim as `image/svg+xml` with
no sanitization, no `Content-Disposition: attachment`, and no `Content-Security-Policy`. An
SVG can carry script (`<svg onload="...">`), and that script executes on the
`user.uploads.dev` origin when the file URL is opened directly in a browser. The `text/html`
MIME type is rejected, but SVG is an equally capable script-execution context and is not
filtered.

Implications for generators that allow user-controlled SVG uploads:

- Never surface a raw `user.uploads.dev` SVG URL for direct navigation by untrusted users.
- Embed uploaded images with `<img src="...">` rather than direct links — browsers do not
  execute scripts in SVGs loaded via `<img>`.

### 19.2 Plugin Input Validation

Passing a plain object or array as `instruction` to `ai-text-plugin` throws an uncaught
`TypeError` from inside the plugin. The plugin expects `instruction` to be a string (or a
Perchance DSL object). Always pass a string.

### 19.3 Camera & Microphone

A generator can call `navigator.mediaDevices.getUserMedia()` and prompt the user for camera
or microphone access — the sandbox does not block these requests. Users visiting
third-party generators should be aware that generators are able to make such prompts.

---

## 20 · Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| `result === "string"` never matches | `String(result) === "string"` |
| `result.url === otherUrl` always false | `String(result.url) === otherUrl` |
| `stopReason === "stop_sequence"` always false | Use `"artificial"` |
| `stopReason === "max_tokens"` always false | Use `"artificial"` |
| Calling `root()` corrupts the Proxy | Only ever read `root.propertyName` |
| `root.myFunc()` returns `undefined` | The DSL→JS bridge is one-way; no return values cross |
| Output truncates silently near ~900 tokens | Chain sequential calls for longer output |
| `superFetch` auth header never arrives | Put credentials in URL parameters |
| Empty or inline-only image prompt hangs forever | Always pass real description text |
| Uploaded SVG is a stored-XSS vector | Never serve raw SVG CDN URLs; embed via `<img>` |
| `temperature` / `model` / `topP` have no effect | They are inert; not passed to the plugin |
| `idealMaxContextTokens` treated as a hard limit | It is advisory; use it for budget planning |
| HTML panel stale after saving | CDN edge cache; wait for the purge or hard-refresh |
| `countTokens` treated as exact | It is an approximate estimate |
| 21+ `stopSequences` causes an error | The maximum is 20 |

---

## 21 · Quick Reference

**ai-text-plugin**

```
Effective options : instruction, startWith, hideStartWith, stopSequences, onChunk
Inert options     : temperature, model/modelName, topP, frequencyPenalty, maxTokens
Awaited result    : boxed String — use String(r) or r.generatedText
Sync handle       : Promise + stop, inputs, liveResponseText, textStream,
                    onFinishPromise, id, loadingIndicatorHtml, submitUserRating
stopReason        : "natural" | "artificial" | "error" | "user"
onChunk payload   : { textChunk, isFromStartWith, fullTextSoFar }
Context           : idealMaxContextTokens = 6000 (advisory; real window is larger)
stopSequences max : 20
Output ceiling    : ~900 tokens — chain calls for more
Concurrency       : 1 per broker; text + image + upload run in parallel
Abort             : handle.stop() — resolves, stopReason "user", frees the slot
```

**text-to-image-plugin**

```
Sync return   : { iframeHtml, evaluateItem, onFinishPromise, toString }
Awaited result: boxed String — { canvas, dataUrl, inputs }
Resolutions   : 512x512, 512x768, 768x512, 768x768 (others silently rejected)
Defaults      : 512x512 bare; 768x768 in the AI chat
Orientation   : portrait/selfie → 512x768; landscape/wide-angle → 768x512
Inline params : (resolution:::) (negativePrompt:::) (seed:::) (guidanceScale:::)
                (size:::) (width:::) (height:::) (style:::) (saveTitle:::) (saveDescription:::)
negativePrompt: honored;  seed: not reliably honored
removeBackground: client-side (RMBG-1.4 via transformers.js); PNG output
Generation    : ~13–14 s
Empty prompt  : hangs forever — always pass real description text
```

**upload-plugin**

```
result.url   : boxed String — String(result.url) before any comparison
Hash         : bytes + MIME type (not bytes alone)
Size         : 5 MB accepted, 6 MB rejected (file_too_big)
Rejected MIME: text/html only
deletionUrl  : GET it to permanently delete the file
expires      : timestamp-format option, passed to the backend
SVG          : accepted but a stored-XSS vector — never serve raw SVG URLs
First upload : slow — runs a Turnstile verification
```

**super-fetch-plugin**

```
Methods      : GET / POST / PUT / DELETE — all work; bodies and redirects forwarded
Headers      : custom request headers are stripped — put auth in URL params
Cookies      : none — each call is cookie-isolated
Response size: no general cap
Caching      : by full URL — add ?_=Date.now() to bust
Bypass list  : jsdelivr, catbox, raw.githubusercontent, huggingface /resolve/ URLs
SSRF         : private/internal addresses are blocked
```

**root Proxy**

```
typeof root  : "function" — but NEVER call root()
root.missing : undefined — safe for feature detection
root.myList  : internal List object ($root, evaluateItem string, getName(), …)
root.myFunc(): undefined — the DSL→JS bridge is one-way
```

**Backend RPC**

```
Broker     : text-generation.perchance.org/embed (an iframe in the panel DOM)
Transport  : postMessage only — no fetch/XHR/WebSocket leaves the sandbox
Sequence   : embedIsReady → verified ×2 → streamData ×N → streamEnd
requestId  : "aiTextCompletion" + 17 digits
```



---

## 22 · Plugin API Reference

All names below are valid `{import:...}` targets (12 confirmed importable generators).
Seven subdomain names (`connect-plugin`, `count-plugin`, `rss-feeds-plugin`,
`browser-runner`, `editor-collab`, `editor-copilot`, `generated-images`) are NOT
importable — they are backend-only infrastructure with no Perchance generator.

### Function Plugins

**`serverPlugin(worldName)`** — WebTransport/WebSocket multiplayer gateway.

Returns a transport object with datagrams and bidirectional/unidirectional streams for
real-time multiplayer communication. Each generator is its own "universe"
(`window.generatorPublicId`); worlds are isolated within the universe.

```js
const transport = await root.serverPlugin("my-world");
// World name regex (from source): /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
//   Valid:   "my-app", "test-world", "a", "a-b-c", "abc123"
//   Invalid: "123abc" (digit start), "my_world" (underscores),
//            "MY-APP" (uppercase), "my world" (space), "my.app" (dot)
// Returns a transport object (WebTransport or WebSocket-backed):
//   transport.datagrams.readable  — ReadableStream (fire-and-forget messages)
//   transport.datagrams.writable  — WritableStream
//   transport.incomingBidirectionalStreams  — ReadableStream of {readable, writable}
//   transport.incomingUnidirectionalStreams — ReadableStream of ReadableStream
//   transport.createBidirectionalStream()  — Promise<{readable, writable}>
//   transport.createUnidirectionalStream() — Promise<WritableStream>
//   transport.close({closeCode, reason})
```

Handshake (from source — the `$output` creates an iframe to
`server-plugin.perchance.org/embed`):

```
1. iframe loads  →  embed sends {type:"loaded"}
2. parent sends  →  {type:"init", universe, origin, webtransportOrigin, ...}
3. embed sends   →  {type:"ready"}
4. parent sends  →  {type:"connect", world, requestId}
5. embed sends   →  {type:"connect_ready", wtUrl, wsUrl, token}
6. client opens WebTransport to wtUrl (or WebSocket to wsUrl as fallback)
```

WebTransport endpoint: `wt0.server-plugin.perchance.org`. WebSocket fallback is
triggered by `#forceUseWS=1` in the URL hash. Binary framing over WebSocket uses
frame types: DATAGRAM(1), STREAM_OPEN_BI(2), STREAM_OPEN_UNI(3), STREAM_DATA(4),
STREAM_FIN(5), CONTROL(6), CLOSE(7).

**`commentsPlugin(opts)`** — Channel-based comment system with moderation.

```js
const c = root.commentsPlugin();             // default channel
const c = root.commentsPlugin({channel: "my-channel"});
// Returns:
// {
//   submit(text)                     // post a comment (async — needs iframe context)
//   banUser(userId)                  // ban a user from commenting
//   unbanUser(userId)                // unban a user
//   setNicknameForNextComment(name)  // set display name before posting
//   setAvatarUrlForNextComment(url)  // set avatar URL before posting
//   channel                          // string — current channel name
//   comments                         // array — loaded comments (initially [])
//   inputText                        // string — current input text
// }
// commentsPlugin({getMetaObject:true}) returns the same object.
// The plugin uses comments-plugin.perchance.org as its backend.
```

The source code (1,094 lines) reveals it creates an iframe with `postMessage` RPC,
supports channel rules (`channelName+u:username,ids:channel`), and has nickname/avatar
management for anonymous posting.

**Architecture:** The `$output` function returns a `<span>` marker tag (not an iframe)
with `data-folder-name="generatorName+channelName"`. The Perchance runtime detects this
marker and replaces it with the full comment widget iframe. Methods like
`setNicknameForNextComment` work after the marker is rendered into the DOM.

**Important:** The comments iframe is NOT automatically injected. It is only created when
the plugin's `$output()` function is called (which renders the comment widget HTML).
Without the rendered widget, `setNicknameForNextComment`, `setAvatarUrlForNextComment`,
`submit`, and `inputText` all throw `"Cannot read properties of undefined (reading
'postMessage')"`. The `channel` and `comments` properties work without the iframe.

**`fullscreenBtn(element, options, callback)`** — Fullscreen toggle button (arity 3).

**`dynamicImport(generatorName, opts)`** — Lazy-load another generator at runtime (arity 2).

### Object Plugins

**`postsPlugin`** — Post/content database with voting and feeds. Backed by
`posts-plugin.perchance.org/embed`. **Currently WIP — the plugin source has two bugs**
(listener on `iframe.contentWindow` instead of `window`; `delete...()` syntax error) that
prevent broker responses from arriving. The intended API from source:

```js
const posts = root.postsPlugin;
// Basic CRUD:
//   posts.add({content, id?, tags?})                 // auto-generated ID, default channel
//   posts.<channel>.add({id, tags, title, content})  // add to named channel (e.g. posts.blog)
//   posts.<channel>.get(id)                          // retrieve by ID
//   posts.<channel>.vote(id, value)                  // vote: value between -1 and 1
//   posts.<channel>.seen(id)                         // increment view count
//   posts.<channel>.update(id, partialObj)            // partial update
//   posts.<channel>.replace(id, fullObj)              // full replacement
// Querying:
//   posts.query({sort, tags, after, limit})           // sort: "new"/"best"/"trending"/"value"
//   posts.stream({channel})                          // real-time feed
//   posts.<channel>.feed({sort, period})              // rendered feed widget (for DSL)
```

The config system supports voting weights, score decay, per-key max votes,
public/private values, and Ed25519 encrypted direct messages.

**`kvPlugin`** — Key-value storage. Empty object on `root.*`; the full API is on
`kvPlugin.folder`:

```js
const folder = root.kvPlugin.folder;
// CRUD (all operations 0-5ms):
//   folder.set(key, value)       // write — types preserved (string, number, object, boolean, array)
//   folder.setMany(entries)      // batch write — takes an ITERABLE, NOT a plain object
//   folder.get(key)              // read — returns the value with original type preserved
//   folder.getMany([keys])       // batch read — returns array; null for missing keys
//   folder.update(key, fn)       // fn receives old value, returns new: update(k, v => v + "!")
//   folder.has(key)              // returns boolean true/false
// Delete:
//   folder.delete(key)           // get() returns undefined after delete
//   folder.deleteMany([keys])    // batch delete
//   folder.clear()               // delete ALL keys — use with caution
// Enumeration:
//   folder.keys()                // returns array of key strings
//   folder.values()              // returns array of values (types preserved)
//   folder.entries()             // returns array of [key, value] pairs
```

Type preservation: `42` round-trips as `number`, `{x:1}` as `object`, `true` as
`boolean`. Overwriting a key replaces the value. Operations are synchronous-fast
(0-5ms) despite being async.

**Backend:** IndexedDB database `"folder-db-kv-plugin"` v1. The database name is
derived from `this.$root.$moduleName` in the plugin source, so forked plugins get
their own isolated database. No server-side persistence — data is local to the browser.

### DSL List Plugins

`dbPlugin = {import:db-plugin}` resolves to the DSL tree root (52 `$`-prefixed internal
keys). It is NOT a database API — `kvPlugin` is the database. The `$moduleSpace` key on
`dbPlugin` lists all loaded modules.

`bugReport = {import:bug-report-plugin}` is a DSL list with a `$output` handler
containing `createTemporaryDebugInfo`.

### Invalid Import Names (backend-only infrastructure)

These subdomain names exist but are NOT importable generators:

```
connect-plugin      → undefined on root (backend: real-time connections)
count-plugin        → undefined on root (backend: analytics counters)
rss-feeds-plugin    → undefined on root (backend: RSS feed generation)
browser-runner      → undefined on root (backend: headless browser)
editor-collab       → undefined on root (backend: collaborative editing)
editor-copilot      → undefined on root (backend: AI editor assistant — HTTP 404)
generated-images    → undefined on root (backend: image CDN)
```

### Broker Protocol Details

**Only 3 broker iframes** are injected when all 12 valid plugins are imported:

| Iframe | Plugin | Protocol |
|--------|--------|----------|
| `text-generation.perchance.org/embed` | ai-text-plugin | `embedIsReady` → auto-`verified` |
| `upload.perchance.org/embed#{"email":false,"sessionToken":false}` | upload-plugin | `uploadEmbedIsReady` (fires 2×) → `anonUploadResponse` |
| `posts-plugin.perchance.org/embed` | posts-plugin | Silent (no auto-announce) |

Upload auth passes via URL **hash** (not query params): `{"email":false,"sessionToken":false}`.

Upload response: `{type:"anonUploadResponse", requestId, result:{url:BoxedString, size, error, deletionUrl}}`.

**Complete postMessage vocabulary** (from broker source code analysis):

Text-generation broker: `embedIsReady`, `verified`, `verifying`, `streamData`,
`streamEnd`, `streamError`, `tokenizerPerformance`, `ttft_withRecentRequest`,
`ttft_withoutRecentRequest`.

Image-generation broker: `readyForData`, `finished`, `plsGibAccessCodeForAdPoweredStuff`
(requests ad token from ads iframe), `imageSavedToSubChannel`,
`updateContentGuardVisibility`, `ImageFeatureExtractor`. Image generation is
**queue-based** (`joinQueue`, `updateQueuePos` in broker source).

Upload broker: `uploadEmbedIsReady`, `anonUploadResponse`, `file`.
Outgoing from plugin: `anonUploadRequest`, `init`.

**Text-generation broker internals** (from 72,969-byte embed source) [R23]:

- Streaming wire format: `postMessage({type:"streamData", requestId, value})` —
  `value` is the token chunk. Stop: `{type:"stopStream", requestId}`.
- LRU thread pool: `moveToLeastRecentlyUsedThread()` selects thread.
  User identity: `localStorage["userKey-{thread}"]`, sent as URL query param.
- Prompt truncation: `middleOut` algorithm (`middleOutWithoutTokenizer()` for
  fast mode). Sets `postData.didMiddleOut = true` when active.
- Hash function: `djb2Hash(str)` — `hash=5381; hash=((hash<<5)+hash)+charCode`.
- **Tokenizer: DeepSeek-R1-0528** from HuggingFace (`deepseek-ai/DeepSeek-R1-0528`
  `tokenizer.json` + `tokenizer_config.json`).
- Quality feedback: `/api/rateGeneratedText` endpoint (new, not in original catalog).
- Error tracking: Rollbar v2.26.0.
- Token limits: `TokenCount`, `maxToken` references.
- Turnstile flow: `verifyUser` with `alreadyVerifying` guard.

**Image-generation broker internals** (from 76,155-byte embed source) [R23]:

- Full parameter set: `joinQueue({prompt, seed, resolution, guidanceScale,
  negativePrompt, referenceImage})`.
- Ad token flow: `updateAdAccessCode()` — Promise-based, listens for postMessage
  from parent with the 64-hex code. Tokens are time-bucketed (same token across requests).
- Background removal: `removeBackground(imageUrl)` — uses transformers.js with
  RMBG-1.4 model (cached in Cache API `"transformers-cache"`).
- Gallery: `saveImageToGallery()` — modal UI with subChannel selection.
- Content moderation: `contentGuardMessageEl` CSS class.

**Runtime globals** set by the Perchance platform:

```
window.generatorName           // generator slug ("my-gen")
window.generatorPublicId       // 32-hex string (= sandbox subdomain)
window.generatorLastEditTime   // unix timestamp of last edit
window.update(selector?)       // trigger DSL re-render
window.createPerchanceTree     // DSL parser function
window.logPerchanceListsFunctionError
window.clearPerchanceErrors / window.__clearPerchanceErrors
window.ignorePerchanceErrors
```

**⚠ DSL parser curly-brace warning:** The Perchance DSL parser scans the
*entire* HTML panel — including `<script>` tag content — for `{...}` patterns
before JavaScript executes. String literals containing `{import:...}`,
`{word}`, `{A|B}`, or `{1-10}` will be interpreted as DSL commands and break
your code. To avoid this, base64-encode complex scripts:
`<script>eval(atob("base64encodedscript"))<` + `/script>`, or build such
strings at runtime with `String.fromCharCode(123)` for `{`.

**Google Analytics:** Property ID `G-YJWJRNESS5`. Cloudflare Real User
Monitoring at `/cdn-cgi/rum`. Tracking keys via `/api/count?keys=uaine,abpsgp`.

### The `root` Proxy [VERIFIED R23]

`root` is a **Proxy wrapping a function** (`typeof root === "function"`), not
a plain object. Behavioral details:

- **get trap** works: `root.myList` returns the DSL list proxy.
- **set trap** works: `root.x = 42` stores and retrieves correctly.
- **has trap** works: `"aiTextPlugin" in root` → `true`, `"nonExistent"` → `false`.
- **delete trap** works: `delete root.x` → `true`.
- **ownKeys trap is BUGGY**: `Object.keys(root)` throws `"ownKeys trap result
  did not include 'prototype'"` because the handler returns DSL list names but
  omits `prototype` (required for function-based Proxy targets). Do NOT call
  `Object.keys(root)`.
- **toString()** picks a **random** top-level list name each call (nondeterministic).
- **constructor** = `bound Object`.

**Dollar-prefixed metadata properties** (accessible via get, but NOT in has trap):

| Property | Type | Value |
|---|---|---|
| `root.$moduleName` | string | generator slug (e.g. "my-gen") |
| `root.$meta` | object | the `$meta` DSL block contents |
| `root.$root` | function | circular reference back to root |
| `root.$children` | object | child nodes of the DSL tree |
| `root.$perchanceCode` | string | **full DSL source** of the generator |
| `root.$output` | undefined | NOT accessible (lives in tree, not proxy) |

### Upload Plugin Behavior [VERIFIED R23]

- **Result keys:** `url`, `error`, `size`, `deletionUrl`
- **result.url is a boxed String** (`[object Object]`) — same as aiTextPlugin.
  Always use `String(result.url)` to get a primitive string.
- **File host:** `user.uploads.dev` (NOT `user-uploads.perchance.org`)
- **Deletion URLs:** `https://user.uploads.dev/file/{hash}.{ext}`
- **Type restriction:** `text/plain` Blobs return `error: "invalid_data_type"`.
  Upload plugin accepts image types; other types may be rejected.
- **Error on reject still returns deletionUrl** — partial result object.

### Cross-Tab Coordination [VERIFIED R23]

The platform does NOT use standard browser cross-tab APIs:
- BroadcastChannel: channels can be created but no messages are exchanged.
- SharedWorker: available but not used by the runtime.
- localStorage events: 0 received.
- navigator.locks: no locks held or pending.
Tab coordination likely uses server-plugin's WebTransport/WebSocket connection
(when server-plugin is operational).

**Browser storage** used by the platform:

- IndexedDB: `"folder-db-kv-plugin"` v1 — the kvPlugin.folder backend (local to browser)
- Cache API: `"transformers-cache"` (2 entries) — RMBG-1.4 model cache for `removeBackground`
- localStorage/sessionStorage: empty in the sandbox (used by the editor for backups)
- Cookies: ad tracking (`_gid`, `_pubcid`, `__qca`, `cto_bundle`)

### Complete DSL List Accessor Map (35 accessors)

Every DSL list object (from `root.myList`) exposes these accessors and methods:

```
Selection:     evaluateItem    → random item as string ("charlie")
               selectOne       → random item as LIST ITEM OBJECT (not a string!)
               selectAll       → array of ALL items as list item objects
               selectUnique(n) → array of n unique item objects
               selectMany(n)   → array of n item objects (may repeat)
Metadata:      getName         → list name string ("monitorTestList")
               getLength       → item count as number (3) — PROPERTY, not method
               getOdds         → odds value (1)
               getParent       → parent list in the DSL tree
               getSelf         → the list object itself with named children
Structure:     getPropertyKeys → array of property names (keys with = values)
               getPropertyNames→ same as getPropertyKeys
               getChildNames   → array of child item text (["alpha","bravo","charlie"])
               getFunctionNames→ array of function names defined on the list
               getAllKeys       → all keys (children + properties + functions)
Content:       getRawListText  → raw DSL source ("listName\n  alpha\n  bravo\n")
               joinItems(sep)  → "alpha, bravo, charlie"
               sumItems        → concatenates "0" + all items (not numeric sum for strings)
               replaceText(a,b)→ evaluates a random item with replacement applied
Cloning:       consumableList  → the list object with named children
               createClone     → DOES NOT EXIST on list objects (throws)
String:        toString()      → evaluates to a random item string
               valueOf()       → same as toString()
Case:          upperCase       → random item uppercased ("ALPHA")
               lowerCase       → random item lowercased ("alpha")
               titleCase       → random item title-cased ("Bravo")
               sentenceCase    → random item sentence-cased ("Bravo")
Grammar:       pluralForm      → random item pluralized ("alphas")
               singularForm    → random item singularized ("alpha")
               pastTense       → THROWS "PERCH is not defined" (needs top-editor context)
               presentTense    → random item with present tense ("alphas")
               futureTense     → "will " + random item ("will alpha")
               negativeForm    → random item ("alpha")
```

Case and grammar transforms pick a **random item** first, then apply the transform.
Each access may return a different item. `pastTense` requires the `PERCH` global
which is only available in the top editor, not in panel JavaScript.

`selectOne` and `selectAll` return **list item objects** (the same type as `root.myList`),
not plain strings. Use `String(list.selectOne)` or `list.evaluateItem` for a string.



### PERCH Engine Runtime (~100 methods)

**Important:** `window.PERCH` and `window.nlp` exist ONLY on the parent/editor
frame — they are NOT available in the sandbox iframe where panel JS (`$output`,
HTML panel scripts) executes. These methods are used internally by the runtime
to process DSL, not as a public API for generator authors.

The `window.PERCH` object is the DSL runtime engine. Key method groups
(from saved page source analysis of `pa7xdy82ob.html`):

**DSL parsing & evaluation:**
`createPerchanceTree`, `evaluateText`, `evaluateCurlyBlock`, `evaluateSquareBlock`,
`splitTextAtAllBlocks`, `splitTextAtCurlyBlocks`, `splitTextAtSquareBlocks`,
`splitUpCurlyOrBlock`, `processEscapedBrackets`, `processEscapedCharacters`,
`normaliseLineIndentsToTabs`, `stripCommentFromLine`, `collectTemplatableTextChunks`,
`collectNonHoistedTopLevelDeclarations`, `collectImportedModuleNamesFromText`.

**List item methods (exposed as DSL accessors):**
`selectOneMethod`, `selectManyMethod`, `selectManyMethodStringNum`,
`selectUniqueMethod`, `selectAllMethod`, `consumableListMethod`,
`joinItemsMethod`, `replaceTextMethod`, `toStringMethod`, `valueOfMethod`.

**Grammar transforms (powered by compromise.js v11.12.4):**
`pastTenseMethod`, `presentTenseMethod`, `futureTenseMethod`, `pluralFormMethod`,
`singularFormMethod`, `negativeFormMethod`, `pluralize`.

**Case transforms:**
`upperCaseMethod`, `lowerCaseMethod`, `titleCaseMethod`, `sentenceCaseMethod`.

**Template & DOM:**
`updateOutput`, `updateOutputMessageHandler`, `updateTemplatedNodes`,
`addNodeMethods`, `addNodeTemplates`, `addAttributeTemplateToEl`,
`isTemplatableAttributeName`, `isDomEventAttributeName`, `domEventAttributeNames`,
`executeScriptTag`, `executeScriptTags`, `htmlToElements`,
`reAttachAllDomElementEventsWithRoot`, `reAttachSpecificDomElementEventWithRoot`,
`getAllDescendentNodesIncludingTextNodes`, `getAllTextNodeDescendents`.

**Curly-block functions** (`{A|B}`, `{import:x}`, `{a/b}`, `{1-10}`, `{s}`):
`curlyFunctions`, `curlyFunction_Or`, `curlyFunction_Import`,
`curlyFunction_Range`, `curlyFunction_A`, `curlyFunction_S`.

**Node/tree manipulation:**
`duplicatePerchanceNode`, `clonedNodeToOriginalNodeWeakMap`,
`getPrimitiveNodeDetails`, `getFunctionDetails`, `getFunctionHeaderDetails`,
`getFunctionArgumentsDetails`, `getInlineFunctionDetails`,
`getTextOddsDetails`, `oddsTextToNumber`, `chooseRandomTextByOdds`.

**Error handling:**
`perchanceError`, `perchanceErrorString`, `showPerchanceErrorBox`,
`clearPerchanceErrors`, `ignorePerchanceErrors`, `currentPerchanceErrorCount`,
`lastPerchanceErrorTime`, `maxPerchanceErrorCount`.

**Utility:** `AvsAnSimple`, `escapeHTMLSpecialChars`, `getAllMatches`,
`isValidJavaScriptIdentifier`, `isServedOnPerchanceSubdomain`,
`updateGeneratorMetaData`, `dynamicMetaDataCache`.

**NLP library:** `PERCH.nlpCompromise` — compromise.js v11.12.4, the NLP engine
behind grammar transforms. Loaded from `perchance.org/lib/compromise-11.12.4.min.js`
(URL-encoded inline in the runtime). Provides POS tagging, verb conjugation,
noun pluralization, and other morphological transforms.

### Editor Infrastructure

**Editor bundle:** `editors.bundle.min.js` (847KB) — the CodeMirror-based editor with:

- **Collab editing:** WebSocket to `wss://editor-collab.perchance.org` for real-time
  multi-user editing. Key flow: `getCollabEditKey` → share link → `validateCollabEditKey`.
  Keys can be regenerated (`regenerateCollabEditKey`) or deleted (`deleteCollabEditKey`).

- **AI copilot:** Two POST endpoints on `editor-copilot.perchance.org`:
  - `/api/autocomplete` — inline code completion (triggered by Tab, stored in
    `localStorage.copilotIsEnabledV2`). Uses prefix/suffix context up to 20K chars.
    Returns HTTP 400 from sandbox — requires editor context.
  - `/api/findBugsInCode` — static analysis of DSL code, returns bug annotations
    (empty `[]` array when no bugs found). Also returns 400 from sandbox.
  Both endpoints are live but only accept requests from the editor frame
  (`editors.bundle.min.js`), not from the sandbox iframe.
  Copilot can be toggled; state is in `localStorage.copilotIsEnabledV2`.

- **Linting:** ESLint v9.14.0 (`eslint-linter-browserify`) + htmlparser2 v9.1.0,
  both loaded from `/lib/` on perchance.org.

- **User session:** `app.store.data.user` = `{email, sessionToken, loggedIn}`.
  Generator data: `generatorData` = `{name, imports, canLink}`.

### Debug & Diagnostics

- `null.perchance.org/debug-freeze` — debug freeze mode URL
- `window.DEBUG_FREEZE_MODE` — enables freeze diagnostics
- `window.codeWarningsArray` — collected editor warnings
- `window.diffStuff` / `window.dmp` — diff-match-patch for generator versioning
- `window.downloadLocalBackup` / `window.downloadTextFile` — backup utilities
- Ad system: `window.freestar` (Freestar ad network), `window.adsAreShowing`,
  `window.forceDisableAds`, `window.advertHeight`

---

## 23 · Community Plugins Catalog

A non-exhaustive but representative map of widely-used community plugins. Import any of
them with `name = {import:plugin-slug}` and call as `name(args)` or `name.subMember(args)`.
Source for each is on `perchance.org/<slug>#edit`. The full directory is at
<https://perchance.org/plugins>.

### State, Persistence, and Variables

**`createInstance` / `create-instance-plugin`** — freeze a "blueprint" list into an
"instance" whose `selectOne` results are fixed in place. Critical for hierarchical
randomization where you want `c.eyeColor` and `c.height` to stay consistent.

```
createInstance = {import:create-instance-plugin}

character
  name = {Molly|Anita|Murphy}
  age = {18-90}
  // NOTE: only `=` properties freeze. Sub-lists (no equals sign) keep randomizing —
  // collapse them to `mood = {happy|sad}` to fix them too.

output
  [c = createInstance(character), ""] [c.name] is [c.age]. [c.name] said hi.
  // → "Murphy is 22. Murphy said hi."
```

`create-instances-plugin` (plural) creates multiple at once.

**`remember-plugin`** — persist variables to `localStorage` so they survive page reloads.
Pass `@inputs` to auto-persist input field values.

```
remember = {import:remember-plugin}

// At the top of HTML panel:
[remember(root, "score, level, @inputs")]
[remember(root, "@forget")]   // wipe everything and reload
```

**`kv-plugin`** — namespaced async key-value store backed by IndexedDB. Usable as
`kv.myStoreName.get/set/keys/entries/delete/clear/update/setMany/getMany/deleteMany`.
Stores survive forever; each generator has its own partitioned IDB.

```
kv = {import:kv-plugin}

async start() =>
  await kv.scores.set("user42", { score: 100, level: 3 })
  let entries = await kv.scores.entries()    // [[key, value], ...]
```

**`locker-plugin`** — "lock" a randomized value in place so it survives `update()`. Shows
a 🔓/🔐 toggle button for the user. Useful for character generators where you randomize
a face but want to keep it while rerolling clothes.

```
lockable = {import:locker-plugin}

output
  Name: [lockable("characterName", name.selectOne)]
        [lockable("characterName_button")]   // <-- 🔓/🔐 toggle button
```

**`seeder-plugin`** — deterministic randomization. Override `Math.random` with a seeded
PRNG so the same seed always produces the same generator output. Useful for shareable
"share this exact result" URLs.

```
seed = {import:seeder-plugin}

// Set seed from URL parameter so same URL → same result:
[seed(window.location.hash || "default")]

// Or with a cache option to memoize:
[seed("hello world", "cache")]
[seed("hello world", true)]              // forceUpdate (legacy boolean form)
[seed("")]                                // un-seed (restore Math.random)
```

**`url-params-plugin`** — exposes URL query params as a Perchance-side object. Read with
`[urlParams.foo]`.

```
urlParams = {import:url-params-plugin}

output
  Hello [urlParams.name || "stranger"].
  // visit ?name=Alice → "Hello Alice."
```

**`literal-plugin`** — escape user-controlled text so it can be safely interpolated into
DSL templates without triggering `[…]` / `{…}` interpretation. Essential whenever you put
user input into an `instruction` list.

```
literal = {import:literal-plugin}

// User typed "[evil] {code}" into an input — without literal() it would be evaluated:
instruction
  The character's name is: [literal(nameEl.value.trim())]
  $output = [this.joinItems("\n")]

// Optional second arg "+html" also HTML-escapes:
[literal(userInput, "+html")]
```

### Content & Formatting

**`markdown-plugin`** — render Markdown to HTML. Pass either a string or a Perchance list
(it calls `.getRawListText` and strips the first line + leading indent for you).

```
md = {import:markdown-plugin}

myText
  # A heading
  Some **bold** content.
  \s
  - A list item

[md(myText)]
```

**`perchance-callouts`** — Obsidian-style callouts (`note`, `warning`, `tip`, etc.) with
optional collapsibility and per-callout styling. Accepts either a Perchance list with
nested `type`, `header`, `data`, `collapsible.state`, `style.*` properties, or an inline
JS object.

```
callout = {import:perchance-callouts}

exampleNote
  type = warning
  header = Heads up
  data = Pay attention.
  collapsible
    state = open

[callout(exampleNote)]
[callout({type:"note", header:"Inline", data:"or pass an object"})]
```

Types include `note`/`info`/`abstract`/`todo`/`tip`/`done`/`question`/`warning`/`fail`/
`danger`/`bug`/`example`/`quote`. Icons are Bootstrap Icons.

**`docs-plugin`** — a Markdown-based documentation site builder. Author each page as a
`<script type="text/markdown" data-hash="page-id" data-title="Page Title">` block, then
call `docsPlugin()` once. Handles navigation, anchor scrolling, code highlighting.

```html
<script type="text/markdown" data-hash="overview" data-title="📘 Overview">
# Overview
Hello world.
</script>

<script type="text/markdown" data-hash="api" data-title="API">
# API
</script>

<script>docsPlugin()</script>
```

**`combine-emojis-plugin`** — composite multiple emojis into a single image (Google's
emoji-kitchen API).

**`text-editor-plugin-v1`** — higher-performance `<textarea>` replacement with inline
styling (asterisks → italic, etc.). Used in the canonical AI chat for the message editor.

### Layout & UI Widgets

**`tabs-plugin`** — tab viewer over a list of `*`-items with `title` and `content`. Set
one item's `default = true` for the initial tab; set `rememberActiveTab = true` to
persist. Each tab can have an `id` so `update(thatId)` re-rolls just that tab.

```
tabs = {import:tabs-plugin}

tabList
  rememberActiveTab = true
  backgroundColor = #ffffff
  *
    title = Tab 1
    content = Hello!
    default = true
  *
    title = Tab 2
    content = <button onclick="update(myTab)">re-roll</button> [animal]
    id = myTab
```

**`go-to-plugin`** — clickable text that appends, moves, or replaces content into a
target element. Useful for branching text-adventure UIs without a routing library.

```
goto = {import:go-to-plugin}

// goto(location, anchorText, type, elementId, style?, sep?)
//   type:  'a' append   |  'm' move (append then clear source)
//          'r' replace  |  'g' go (replace + clear source) — default 'g'
[goto(loc2, "Continue →", "g", "mainStage")]
```

**`nested-plugin`** — render a hierarchical Perchance list as an expandable tree UI with
+/− toggles. Each branch lazy-loads on expand.

```
nested = {import:nested-plugin}

world
  Europe
    France
      description = the wine country
    Italy
      description = the pasta country
  Asia
    Japan
      description = land of the rising sun

[nested(world)]
```

**`tldraw-plugin`** — embed a tldraw whiteboard. Channels are namespaced by
`generatorName`-`channel`, so two generators with the same channel don't collide.
Fullscreen toggle included; intersection observer defers iframe load until visible.

```
tldraw = {import:tldraw-plugin}
[tldraw({ channel: "my-board", width: 800, height: 600 })]
```

**`prompt2-plugin` — async modal form builder from spec object, supports select/text/textarea/checkbox, dark/light mode** — async form-modal builder. Renders a dialog with typed fields
(`textLine`, `text`, `select`, `buttons`, `none`+inline `html`); resolves to an object or
`null` if cancelled. Conditional field visibility via `show: (v) => …`.

```js
const result = await prompt2({
  name:  { type: "textLine", label: "Name", defaultValue: "" },
  model: { type: "select", label: "Model", options: ["good", "great"] },
  bio:   { type: "text", label: "Bio", show: v => v.model === "great" },
}, { submitButtonText: "Save", cancelButtonText: "Cancel" });
if (result) console.log(result.name, result.model);
```

**`tap-plugin` — click-to-randomize inline spans, returns `{html, noTap, noTapNoUpdate}` object** — wrap a list so its rendered item re-rolls when clicked. Can render as
`<span>` (default), `<button>` (style="button"), or with custom inline CSS.

```
tap = {import:tap-plugin}

animal
  cat
  dog
  fish

// In HTML:
Click to reroll: [tap(animal)]
[tap(animal, "button")]
```

**`tap-anywhere-plugin` — one-liner: adds global click → `update()` listener** — like `tap-plugin` — click-to-randomize inline spans, returns `{html, noTap, noTapNoUpdate}` object but the entire page is the click target.
Click anywhere → page re-rolls.

**`tooltip-plugin` — Tippy.js wrapper with Perchance list → options interop (46KB source)** — hover tooltips with rich content.

**`pattern-maker-plugin`** / **`layout-maker-plugin` — CSS Grid layout from DSL spec, wraps `update()` for area-specific re-evaluation** — visual editors for repeating
patterns and page layouts.

**`flat-avatar-plugin`** — generate simple flat-color avatar images from a seed string
(no AI; pure SVG).

**`rpg-icon-plugin`** — SVG icon set for RPG/fantasy generators (swords, potions, etc.).

**`fullscreen-button-plugin`** — a button that toggles fullscreen mode.

**`favicon-plugin`** — set the page favicon programmatically (useful with emoji).

**`perchance-logo-plugin`** — drop-in branded "Made with Perchance" badge.

**`live-activity-plugin`** — display a real-time count of users currently viewing a
generator.

### Visualization, Images, and Media

**`text-to-image-plugin`** — AI image generation (covered in §4).

**`image-plugin`** — non-AI image utility (loading, sizing, basic effects).

**`background-image-plugin` — fixed fullscreen background with opacity/blur/filter, accepts URL or config list** — fixed-position background image with `opacity`, `blur`,
and CSS-filter options. Accepts a URL string or a list of URLs (picks randomly).

```
bg = {import:background-image-plugin}

[bg("https://example.com/sunset.jpg", 0.3, 5)]   // url, opacity, blur(px)
[bg(bgUrlList)]                                   // picks one randomly from the list
```

**`background-audio-plugin` — embeds YouTube (IFrame API) or SoundCloud audio, auto-plays on first click** — embed a background audio player (SoundCloud or YouTube)
that auto-plays on first user interaction (browser autoplay policy compliant).

```
bgAudio = {import:background-audio-plugin}
[bgAudio("https://www.youtube.com/watch?v=…", { volume: 30 })]
```

**`image-layer-combiner-plugin` — composites multiple images via canvas, supports CSS filters per layer** — composite multiple images into one (alpha blending,
per-layer CSS filters). Includes a download-as-PNG button.

**`font-plugin` — Google Fonts loader, applies to element/body/span with size and color options** — load and use custom Google Fonts (or any web font URL).

**`t2i-styles`** — a curated catalog of `text-to-image-plugin` prompt-engineering
styles (`Painted Anime`, `Casual Photo`, `Cinematic`, etc.), each with a tagged scoring
profile. Used as a backing list for style-picker UIs. Communicates with the t2i call via
the **`window.input` scope-bridge pattern** — see §22.X below.

**`t2i-framework-plugin-v2`** — the framework that backs `t2i-styles`. Provides
`window.input = { description, negative }` as a bridge for styles to interpolate the
user's prompt.

### Comments, Community, and Moderation

**`comments-plugin`** — drop-in comment box backed by Perchance servers. Accepts a
settings list (a `co` block is conventional) with `channel`, `style`,
`messageBubbleStyle`, `inputAreaStyle`, `adminPasswordHash`, `adminFlair`,
`bannedWords`, `onComment(comment) =>`, and many more options. Channels are *global*
across all generators sharing the channel name.

```
c = {import:comments-plugin}

co
  channel = my-channel
  style = width: 100%; height: 360px;
  bannedWords = [bwList]
  onComment(comment) =>
    if(comment.byCurrentUser) console.log("posted:", comment.message)

[c(co)]
```

**`tabbed-comments-plugin-v1`** — comments-plugin with tabs (popular / new / sticky).
Used in the canonical `ai-chat` generator.

**`comments-plugin-oncomment-example`** — official example of the `onComment` callback.

**`bw-list`** — pre-built banned-words list (sourced from public GitHub banned-words
repos) you can plug into `comments-plugin.bannedWords` or `text-to-image-plugin` gallery
moderation.

**`secret-plugin`** — gated content. Wrap a value so it's only shown after the user
enters a passphrase (hashed client-side).

### Selection Algorithms

**`select-leaf-plugin`** — pick a single random *leaf* (item with no children) from a
hierarchical list. Repeatedly applies `selectOne` until it hits a leaf.

```
selectLeaf = {import:select-leaf-plugin}

animal
  mammal
    cat
    dog
  reptile
    lizard

[selectLeaf(animal)]   // "cat" | "dog" | "lizard" — never "mammal" or "reptile"
```

**`select-leaves-plugin`** — pick *N* random leaves.

**`select-all-leaves-plugin`** — return *every* leaf in the tree.

**`select-range-plugin`** — pick a contiguous slice of a list by index.

**`consumable-leaf-list-plugin`** — a "deck of cards" over leaves: each `selectOne` call
removes the picked leaf so it can't be picked again until reset. Exposes
`.getLength` (remaining count), `.selectMany(n)`, `.reset()`.

```
clp = {import:consumable-leaf-list-plugin}

deck
  hearts
    A
    K
    Q
  spades
    A
    K
    Q

cards = [clp(deck), ""]                  // create once
[cards.selectOne]  [cards.selectOne]     // never the same card twice
```

### Math, Dice, and Generators

**`dice-plugin`** — standard dice notation. `dice("1d6")`, `dice("3d20")`,
`dice("2d6+3")`. Returns a number.

```
dice = {import:dice-plugin}
output
  You rolled [dice("2d6+3")].
```

### Speech and Accessibility

**`text-to-speech-plugin` — Web Speech API with streaming support via ReadableStream, auto-sentence splitting** — speak text using the Web Speech API. Accepts a string, a
stream from `ai-text-plugin.textStream`, or an options object. Returns a handle with
`.stop()`. Auto-splits long text into sentence chunks for finer-grained `.stop()`.

```
speak = {import:text-to-speech-plugin}

let handle = speak({ text: "Hello world", voice: "Google US English", speed: 1.2 });
await handle;
handle.stop();

// Stream directly from ai-text-plugin:
let aiHandle = ai({ instruction: "Tell me a story." });
speak({ textStream: aiHandle.textStream });
```

### Data & Network

**`google-sheets-plugin`** — import published Google Sheets columns as DSL lists. The
plugin attaches columns as sub-lists under a parent of your choice. URLs in DSL must
escape `=` as `\=`.

```
gs = {import:google-sheets-plugin}

sheetsSettings
  urls
    https://docs.google.com/spreadsheets/d/e/.../pub?gid\=0&single\=true&output\=tsv
  onLoad() =>
    update(myList)

[gs(root, sheetsSettings)]
```

**`super-fetch-plugin`** — CORS-bypassing fetch (covered in §6).

**`generator-stats-plugin-v2`** — read public view-count and last-edit time from
`/api/getGeneratorStats`. Mounts a `<span>` and fills it asynchronously.

```
gen = {import:generator-stats-plugin-v2}
This generator has [gen("views")] views, last edited [gen("lastEditTime")].
```

### Time

**`power-timer-plugin`** — countdown / count-up timers with a date target. Returns an
object whose properties (`year`, `month`, `day`, `hour`, …, `totalSeconds`) are
*auto-updating spans*, so `[myTimer.day]` ticks on its own.

```
pt = {import:power-timer-plugin}

timerOpts
  time = 2030-01-01
  onTimeUp = passed since
  onTimeDown = until
  timeZone = -3

[pt(timerOpts).year] years [pt(timerOpts).onTimeOutput()]
```

### Power Plugin Family

A loosely-coordinated family of generator-styling plugins, all by the same author:

- **`power-generator-styler`** — apply a unified visual theme to a generator.
- **`power-plugin-template`** — boilerplate scaffolding for new plugins.
- **`power-plugin-temps`** — collection of plugin templates to fork.
- **`power-footer-plugin`** — drop-in styled page footer.
- **`power-scroll-remember-plugin`** — restore scroll position across reloads.

### Lazy Loading and Discovery

**`dynamic-import-plugin`** — lazy-load another generator's lists on demand. Use for
optional or large dependencies (see §2.4).

```
optional
  ExtraBots = [dynamicImport('some-bot-pack-slug')]
```

**`bug-report-plugin`** — collect browser / device info into a debug blob for bug
reports.

### Themed / Decorative

**`pride-plugin`** — display Pride imagery during Pride month (June by default), or on
custom calendar dates. Accepts a number (size in rem) or an options object mapping date
names (`"june"`, `"march 31"`, …) to image/HTML strings.

### AI-Chat Foundation

**`ai-text-plugin`** — text generation (covered in §3).

**`ai-character-chat-dependencies-v1`** — bundle import pulling in Dexie.js, DOMPurify,
the embedding model loader, etc. Required for AI-chat-style applications.

### Cross-Plugin Patterns

**The `window.input` scope-bridge.** Some plugins (notably `t2i-styles`, the
`t2i-framework-plugin-v2`) read values from `window.input` rather than receiving them as
function arguments. To pass data into such a plugin, temporarily set `window.input`,
evaluate the plugin's property, then restore:

```js
function addStyleToPrompt(prompt) {
  const original = window.input;
  window.input = { description: prompt };
  const result = visualStyles[styleSelectEl.value].prompt.evaluateItem;
  window.input = original;
  return result;
}
```

This is the canonical pattern for "evaluate another generator's DSL templates while
making my data visible to them".

### Discovery

The full plugin directory is at <https://perchance.org/plugins>. Most plugins have a
fully-rendered example/demo at the same URL as their import slug; their source is
editable at `perchance.org/<slug>#edit`. Each plugin's page typically also has a `<slug>-example` companion generator demonstrating typical usage.

---

## 24 · Pre-Built Word Lists — The `/useful-generators` Tier

Perchance hosts ~200 pre-built importable word lists at <https://perchance.org/useful-generators>.
These are *not* plugins — they're plain Perchance lists exported with `$output = [theList]`,
designed to be pulled into your own generator via `{import:slug}`. They make randomized
text dramatically easier to author.

A representative slice:

| Category | Examples |
|----------|----------|
| Language | `noun`, `concrete-noun`, `abstract-noun`, `sci-fi-noun`, `pronoun`, `adjective`, `comparative-adjective`, `superlative-adjective`, `verb`, `speech-verb`, `adverb`, `time-adverb`, `intensifier`, `interjection`, `common-word`, `rare-word`, `archaic-word`, `long-word`, `cliche`, `simile`, `sentence` |
| Life & nature | `animal`, `dog-breed`, `cat-breed`, `pet-animal`, `dinosaur`, `reptile-species`, `fish-species`, `sea-creature`, `flower-species`, `plant-species`, `tree-species`, `bird-species`, `body-part`, `body-of-water` |
| Food & drink | `vegetable`, `fruit`, `ingredient`, `spice`, `herb`, `dessert`, `cocktail`, `tea-variety` |
| People | `common-first-name`, `common-last-name`, `common-male-name`, `common-female-name`, `common-unisex-name`, `surname`, `japanese-surname`, `aesthetic-username`, `couple-name`, `celebrity`, `us-president`, `pope`, `famous-scientist`, `person-build`, `person-height`, `face-shape` |
| Geography | `country`, `nationality`, `continent`, `us-city`, `us-state`, `japanese-city`, `german-town`, `english-town-name`, `river-name`, `sea-name`, `geographic-location` |
| History / culture | `roman-city`, `ancient-greek-city`, `egyptian-god`, `greek-god`, `norse-deity`, `religion`, `tarot-prediction`, `zodiac-sign` |
| Symbols | `emoji`, `bw-emoji`, `ascii-face`, `wingding`, `braille` |
| Color | `css-color`, `hex-color`, `paint-color`, `crayon-color`, `color-palette` |
| Sci-fi / fantasy | `star-trek-planet`, `fantasy-language`, `monster-type`, `lotr-character` |
| Internet | `website`, `youtube-thumbnail`, `imgur-image`, `instagram-username`, `social-network` |
| Tech | `programming-languge` (yes, misspelled in the canonical), `mime-type`, `gtld`, `phone-brand` |
| Misc | `password`, `phobia`, `fabric-type`, `object`, `knot-name`, `container-type`, `fact`, `playing-card`, `mood`, `hobby`, `occupation` |

**Use:**

```
animal = {import:animal}
noun   = {import:concrete-noun}
name   = {import:common-first-name}

output
  [name = name.selectOne, ""][name] saw a {strange|fluffy|tiny} [animal]
  and immediately needed a [noun].
```

The canonical word lists are stable and maintained — the page is curated, and unlisted
or placeholder entries are visually dimmed (rendered with grey opacity).

