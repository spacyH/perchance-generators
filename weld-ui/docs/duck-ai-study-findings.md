# What Weld can learn from Duck.ai

A study of a saved copy of **Duck.ai** (DuckDuckGo's AI Chat) — a privacy-first, multi-provider chat front-end. Where Frosting.ai was a feature-rich image-generation monolith, Duck.ai is the opposite emphasis: a *thin, local-first, privacy-forward* chat client that fronts many model providers behind one anonymized interface. That makes its lessons complementary to Frosting's, and unusually well-aligned with Weld's own ethos (composable, backend-agnostic, privacy-conscious).

This is an architectural read of its shipped React bundle and HAR, not a decompile. Single-token claims are flagged.

## What Duck.ai is, structurally

A React SPA (webpack chunks: `entry.duckai`, `entry.vendors`, a localized `en_US` strings bundle). State and conversations live **locally** — heavy `indexedDB` (26+ refs) plus `localStorage` (38+), with almost nothing persisted server-side. It fronts a roster of models from multiple providers (GPT-5/o4, Claude opus/sonnet/haiku, Llama-4, Mistral) behind one UI, and authenticates **without accounts** using a rotating anonymous token (`x-vqd` / `x-vqd-accept` headers) rather than a login. Responses stream over SSE (`text/event-stream`, `delta`/`chunk` decoding).

Two things stand out as genuinely novel and directly transferable.

## The headline idea: per-model privacy classification

Duck.ai tags every model with an explicit, user-facing **privacy claim**, surfaced before you pick it. The taxonomy in the bundle is a clean five-category vocabulary:

- **Anonymized** — requests stripped of identifying metadata before reaching the provider.
- **Encrypted Inference** — the inference path is encrypted end-to-end.
- **Zero Data Retention** — the provider keeps nothing.
- **Limited Data Retention** — the provider keeps data for a bounded window.
- **No AI Training** — your data is never used to train models.

Each has a title + description string, shown as a badge/claim on the model. This is the most interesting design move in the whole app: it turns "which model is private?" from a hidden policy question into a visible, per-model UI fact.

**Why it matters for Weld:** Weld already has the privacy *instinct* (the encrypted `weld.report`, the local-first `persist`/`history`). What it lacks is a *vocabulary* for expressing the privacy posture of a backend. On Perchance the picture differs — calls route through Perchance's own plugins, not arbitrary providers — but the *pattern* is portable: a small `weld.privacy` (or a field on `weld.stream`/`weld.registry`) that lets an app declare and display, per text/image backend, what data handling applies (e.g. "runs through Perchance's ai-text broker," "your kv data is server-side cross-device," "uploads expire in N months"). This makes Weld apps *legible* about data flow — a real differentiator, and squarely in Weld's wheelhouse.

## The second idea: a normalized, tiered model registry

Every model is a normalized descriptor: `{ provider, tier, modelId, modelName, displayName, contextLength, settings }`, with `tier` being **Free / Paid** (and an explicit `"unknown"` fallback). The app renders a picker from this registry; the rest of the code talks to `modelId`, never to a provider directly.

This is the same instinct as the `weld.genparams` schema we just built for *image* params, applied to *text model selection*. Weld's `weld.stream` wraps Perchance's single ai-text broker today; it has no notion of "a catalog of models with capabilities." Perchance is largely single-backend for text, so a full provider registry is overkill — **but** a lightweight **model-capability descriptor** would still pay off: a normalized `{ id, displayName, contextLength, supportsVision, maxOutputTokens, privacyClaim }` that `weld.stream` exposes, so apps can show context-window limits, warn before overflowing, and (if Perchance ever exposes model choice) pick among them through one shape. Pairs naturally with the privacy-claim idea above.

## Confirmations of choices Weld already made

Studying Duck.ai mostly *validates* Weld's existing architecture, which is worth stating:

- **Local-first storage.** Duck.ai stores conversations in IndexedDB/localStorage, not on a server. That's exactly what Smart-story does via Dexie and what `weld.persist`/`weld.history` provide. Duck.ai's `chatId` / `messageId` / `pinned` / `summary` / `title` conversation model maps almost one-to-one onto what `weld.history` already tracks — including **pinned** and **summary**, two fields worth confirming Weld's history plugin supports (pinning a session; a generated summary/title per chat).
- **SSE streaming with delta decoding.** Duck.ai uses `TextDecoder` + chunked SSE; `weld.stream` already normalizes Perchance's streaming the same way (and we added truncation-awareness).
- **Ephemerality as a first-class verb.** Duck.ai has `deleteAll` / `clearAll` (31+ refs) with `Cache-Control: no-store`. Weld has `weld.persist`/`weld.backup` but no single "burn everything" primitive. A `clearAll()` / "fireproof" affordance — wipe all weld-managed IndexedDB + localStorage for this generator in one call — would be a small, high-trust addition.

## Concrete, prioritized takeaways for Weld

1. **`weld.privacy` — per-backend privacy claims.** The headline idea. A tiny plugin (or a shared field) defining the claim vocabulary (anonymized / limited-retention / zero-retention / no-training / local-only) and a way for apps to declare and *display* which applies to each backend they use. Highest novelty, strong fit with Weld's ethos, low risk. Must be honest: it describes posture, it doesn't *enforce* anything — the labels have to reflect what Perchance actually does.
2. **A model-capability descriptor on `weld.stream`.** Normalized `{ id, displayName, contextLength, maxOutputTokens, supportsVision, privacyClaim }`, so apps can show/limit context usage and (future-proof) pick among models. The text-side analogue of `weld.genparams`.
3. **A `clearAll()` / ephemerality primitive.** One call that wipes all weld-managed storage for the current generator, with a confirmation pattern. Likely a method on `weld.persist` or a small `weld.ephemeral`.
4. **Confirm `weld.history` has `pinned` + per-session `summary`/`title`.** Duck.ai treats these as core; quick audit, cheap to add if missing.

## What Weld does that Duck.ai can't

For honesty and balance:

- **Composability & inspectability.** Duck.ai is a 1.5MB opaque bundle; Weld is 54 inspectable plugins with a manifest, linter, test harness, and monitor.
- **Branching.** Duck.ai's conversation model is linear (`chatId` → `messages`); no evidence of the per-message branch *tree* Weld has via `branching` + `regen`.
- **Image generation depth.** Duck.ai is text-first (it has an image *view* but the generation richness lives in Frosting's class of app); Weld's `image` + new `genparams` cover this.
- **Encrypted reporting.** Weld's `report` (mandatory-encryption, expiring URLs) is arguably *more* privacy-rigorous than a telemetry pixel — and notably, Duck.ai still fires telemetry "pixels" (`fireContextPixel`, `checkShouldFireDailyTelemetry` in the bundle), so its privacy-first stance is real but not absolute. Weld imposes none.

## Recommended next step

Build **`weld.privacy`** (takeaway #1). It's the single most distinctive idea here, it's small, it strengthens exactly the dimension Weld already cares about, and it composes with the model-capability descriptor (#2) for a combined "here's the model and here's how your data is handled" surface. Treat the claim labels as *honest descriptions of Perchance's actual behavior*, not aspirational — the value evaporates if a label overstates the guarantee.

## Caveats

The HAR's chat request/response bodies weren't usefully captured (the live chat endpoint didn't surface in the archive), so the streaming wire format and the exact model-registry JSON are inferred from the minified bundle's identifier vocabulary, not from live payloads. Token counts indicate emphasis, not precise contracts. The `x-vqd` anonymous-token scheme is DuckDuckGo-specific and not replicable on Perchance — it's cited as evidence of the *account-free* design philosophy, not as something to copy. As always: borrow the capability ideas, validate against what Perchance actually supports and actually does before attaching a privacy label to it.
