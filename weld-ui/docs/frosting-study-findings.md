# What Weld can learn from Frosting.ai

A study of a saved copy of **frosting.ai** — a production React front-end for "dream-chats" (chat + image generation with characters/personas). It solves the same problem as Weld's Smart-story, but as a single monolithic app rather than a composable plugin suite. That contrast is exactly what makes it useful: it shows which *capabilities* a mature product in this space ships, which Weld can then provide as plugins.

This is an architectural read of its shipped JavaScript and network traffic, not a line-by-line decompile. Where a claim rests on a single observed token it's flagged as such.

## What Frosting is, structurally

A React SPA (Create-React-App-style chunks: `runtime`, a vendor `2.2.chunk`, an `app.0.chunk`) talking to one REST API at `api.frosting.ai` with a clean resource hierarchy — `dream-chats/{id}/dream-messages-list` and `.../dream-messages-detail/{id}`. PostHog is wired in for product analytics. The whole thing is the "monolith" end of the spectrum: one store, one bundle, one backend.

Weld is deliberately the opposite — many small generators each exposing a `window.weld.*` API, composed per app. Neither is wrong; the lesson isn't "become a monolith," it's "here are the capabilities the monolith found necessary, packaged for a plugin world."

## The big-picture takeaway

Frosting's data model is **one unified `dreamChat` object** that owns both the conversation and the images — messages and generations are the same timeline, not two systems bolted together. Weld currently splits these across `stream` (text), `image` (pictures), `branching`/`regen` (alternates), `history` (sessions), and `persona` (characters), and it's the *app* (Smart-story) that has to weave them. That weaving is real work, and it's where the cross-plugin bugs we hit (regen↔branching return types, swipe wraparound) actually lived.

**The single most valuable idea to steal: a thin "session/timeline" plugin that is the one model an app talks to**, internally delegating to the existing plugins. Call it `weld.dreamchat` or `weld.session`. It would own the unified timeline (text turns + image turns + branches as one ordered structure), and expose one coherent API, so app authors don't re-implement the weave each time and don't trip over the seams between plugins. This is the plugin Smart-story would have wanted to import instead of building its branch-tree glue by hand.

## Concrete capability gaps Frosting exposes

Each of these is something Frosting ships that Weld either lacks or under-serves. Ordered by how clearly they'd improve the suite.

### 1. Rich generation parameters (`weld.image` is too thin)
Frosting's per-image model carries far more than a prompt: `negativePrompt`, `cfgScale`, sampling `steps`, `scheduler`/`sampler`, `aspectRatio` (named ratios like "square", not just raw w/h), `batchSize`, `clipSkip`, and a full **ControlNet** block (`controlnetImage`, `controlnetStrength`, `controlnetScale`, `controlnetEndPercent`, types like Canny/Depth) plus img2img/inpaint/upscale. Weld's `image` plugin is comparatively bare. Even though Perchance's `text-to-image-plugin` won't expose all of these, Weld could define the *vocabulary* — a normalized generation-parameter object with sane defaults — so apps and `promptforge` speak one schema and degrade gracefully on the backends that support less. This is the clearest, most concrete win.

### 2. A real generation queue with lifecycle states
Frosting has explicit job states (`PROCESSING`, etc.) and a websocket. Weld has `weld.queue`, but Frosting's pattern argues for a *typed lifecycle* — `queued → processing → completed | failed` with per-job retry — surfaced consistently. Worth auditing `weld.queue` against that state machine; if it only does concurrency control, adding explicit lifecycle states + a status callback would match what a real image app needs (the queued-thumbnail-then-fill-in UX).

### 3. Remix / variations as first-class
"Remix" and "variations" are core verbs in Frosting — take an existing generation, tweak parameters, regenerate. Weld has `regen` (swipe alternates of the *same* prompt) but not "remix" (fork with *edited* params). Given the unified-param object from #1, a `remix(generation, paramOverrides)` helper — likely a method on `weld.image` or the session plugin — would close this. It's a small addition with high user value.

### 4. NSFW handling: blur-by-default + reveal, not just block
Frosting leans heavily on `blur` (26 occurrences) alongside `moderation`/`nsfw` — i.e. it *blurs* flagged images and lets the user reveal, rather than only blocking. Weld's `banlist`/`spamguard` are deny-list/similarity gates (block-oriented). A blur-then-reveal presentation primitive (probably a `weld.ui`/`gallery` capability: render flagged media blurred with a tap-to-reveal and a per-session "show all" toggle) is a more humane, more standard pattern. **Note the hard line:** Frosting's source also references CSAM detection — that is a server-side, legally-mandated control, not something a client plugin should attempt to replicate. Weld should stay in the realm of *user-preference* blurring and leave true safety enforcement to the platform.

### 5. Sharing / permalinks
Frosting has share + per-dream permalink pages (`/dream/{id}`) and a "Report" affordance. Weld has `comments` and now `report`, but no "share this generation/conversation as a link" primitive. On Perchance this maps cleanly to the existing stack: serialize the session, `weld.upload` it (now that we know `{expires}` works), and produce a shareable URL — a natural `weld.share` or a method on the session plugin.

### 6. Analytics hook (optional, opt-in)
Frosting wires PostHog throughout. Weld has no analytics surface, and arguably *shouldn't* impose one — but a tiny, no-op-by-default `weld.telemetry` that an app can point at its own sink (and that respects a global opt-out) would let app authors instrument funnels without each reinventing it. Lower priority and must be privacy-first to fit Weld's ethos.

## UX-resilience patterns worth adopting (cheap, broadly useful)

Frosting's bundle is dense with `retry`, `throttle`, `debounce`, optimistic-`notification`/`toast` patterns. Weld has `toast` and `regen`, but these resilience behaviors are currently per-app. Two small library additions would pay off across the suite:

- **Optimistic timeline updates with rollback** — show the user's action immediately, reconcile when the backend responds, roll back on failure. This is the pattern that makes a chat feel instant. A helper in the session plugin (or a `weld.optimistic` micro-utility) would standardize it.
- **A debounce/throttle/retry-with-backoff utility** — Frosting throttles aggressively (8 hits). Weld plugins each hand-roll this. A `weld.rl` (rate-limit) or additions to an existing utility plugin would remove that duplication and the bugs that come with hand-rolled backoff.

## What Weld already does as well or better

Worth stating, so the takeaways stay honest:

- **Composability & auditability.** Frosting is an opaque 1MB+ bundle; Weld is 53 inspectable plugins with a manifest, a linter (`diag`), a self-test harness (`testrig`), and a platform monitor. For an ecosystem meant to be built *on*, that's the right architecture.
- **Branching.** Frosting shows a "Regenerate" verb but no evidence of the full per-message branch *tree* Weld now has via `branching` + `regen`. Weld's swipe-between-takes model is arguably richer.
- **Backend-agnostic wrappers.** Weld's `stream`/`image`/`fetch`/`kv`/`upload` normalize Perchance's quirky plugins; Frosting is hard-wired to one proprietary API.
- **Privacy-first `report`.** Weld's new `report` plugin (mandatory encryption, expiring URLs) is more privacy-conscious than a blanket analytics pipe.

## Recommended next steps, in priority order

1. **Define a normalized generation-parameter schema** and enrich `weld.image` to speak it (with graceful degradation). Highest value, lowest risk. (#1)
2. **Prototype `weld.session`** (a.k.a. `dreamchat`) — the unified text+image+branch timeline plugin that supersedes the hand-weaving Smart-story does. Biggest architectural win; do it as a real design pass, not a quick wrapper. (Big-picture takeaway)
3. **Add `remix(generation, overrides)`** once the param schema exists. (#3)
4. **Add a blur-then-reveal media primitive** to `weld.ui`/`gallery` for user-preference NSFW handling — explicitly *not* a safety-enforcement claim. (#4)
5. **Audit `weld.queue` against an explicit job-lifecycle state machine**; add status callbacks if missing. (#2)
6. **Add a small backoff/throttle utility and an optimistic-update helper** to reduce per-app duplication. (UX-resilience)
7. Consider `weld.share` (serialize → expiring upload → link) and, only if wanted and privacy-first, an opt-in `weld.telemetry`. (#5, #6)

## Caveats

The HAR's response bodies were empty (not captured), so the exact field-level shape of `dreamChat`/`dream-message` is inferred from the minified app bundle's identifier vocabulary, not from live payloads. Counts (e.g. "40 aspectRatio") are token frequencies in minified code and indicate emphasis, not precise API contracts. Anything built from this should be validated against Frosting's actual behavior or, better, against what Perchance's backends can support — the goal is to borrow *capability ideas*, not copy an API.
