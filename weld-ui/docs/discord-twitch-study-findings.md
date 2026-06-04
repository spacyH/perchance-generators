# What Weld can learn from the Discord & Twitch front-ends

A study of two saved front-ends — the **Discord #general** of perchance.org's own server, and a **Twitch** live-stream page ("Good Morning Moonbase") — read for interaction patterns and UI affordances worth adapting into Weld. These are full rendered DOM snapshots, so the patterns are observed from the actual shipped markup (aria-labels, data-targets, message anatomy) rather than inferred from bundles.

Both are mature, high-velocity chat surfaces, which is exactly the shape of app many Weld users build (AI character chat, multiplayer rooms, comment threads). The discipline, as with prior studies, is *fit*: take the reusable interaction primitives, leave the platform-specific machinery (Discord's guild/voice infrastructure, Twitch's video pipeline) alone.

## What the two surfaces reveal

**Discord** (`#general`): reactions with running tallies (emoji + count + who-reacted, surfaced from the `react with…` / `Add Reaction` controls), a per-message action row (Reply, Forward, More), threads, channels carrying unread state, `:shortcode:` emoji, and search. The reaction is the headline pattern — a lightweight, aggregate, social signal attached to any message.

**Twitch** (live chat): inline **emotes** tokenized straight out of message text (`lrrSPOT`, `lrrSIG` → images via `data-a-target="emote-name"`), a rich **badge / role vocabulary** rendered before the username (Moderator, VIP, Verified Partner, Prime, Turbo, subscriber tiers, cheer tiers — 26 badge instances in one view), per-message moderation (report button, message-actions menu on all 89 messages), coloured usernames, and a chat that has to stay readable under high message velocity.

## Mapping against Weld today

Weld already covers a surprising amount: `chatui` (bubbles, streaming, typing indicator), `spamguard` (similarity/fingerprint spam detection), `banlist` (banned users/phrases), `comments` (threads on any object), `sync` (cross-tab **presence detection** already exists), `toast` (notifications), `voice` (TTS). So several Discord/Twitch ideas are already home. The gaps are specific and real:

- `chatui` has **no reactions, no emotes, no badges**.
- Moderation is **binary** (`banlist` = banned-or-not; `spamguard` = spam-or-not) with no **graduated** tier (timeout, slow-mode, role-gating) that both platforms lean on.
- There's no **emote/shortcode** primitive anywhere in the suite.

## Worth building (clear fit)

### 1. `weld.reactions` — aggregate reactions on any item ★ top pick
The single most reusable idea across both apps. A small, backend-agnostic primitive: attach emoji (or arbitrary token) reactions to any id'd item — a chat turn, a gallery image, a comment, a generated result — and track aggregate counts plus "did *I* react." Pure data + events; the app supplies storage (drop it on `weld.kv` for shared counts, or `weld.persist`/in-memory for local). API shape: `react(itemId, emoji)`, `unreact(itemId, emoji)`, `toggle`, `countsFor(itemId) -> { '👍': 3, '❤️': 1 }`, `mine(itemId)`, `onChange`. This is the Discord reaction model distilled to its essence, and it composes with `chatui`, `comments`, and `gallery` immediately. Small, high-value, no backend lock-in.

### 2. `weld.emotes` — text → inline emote/shortcode rendering
The Twitch/Discord shared pattern: turn tokens in a string into inline images or styled spans. Register an emote set (`{ name → url }`, or `:shortcode:` → unicode), then `render(text)` returns HTML (or tokens) with emotes inlined, with an allowlist so arbitrary HTML never slips through (pairs with `weld.markdown`'s sanitizer discipline). Useful well beyond chat — reaction pickers, persona flavour, any user-facing text. Include a tiny built-in `:shortcode:`→emoji map so it's useful with zero config, and let apps register custom sets. Keep it pure/string-in-string-out so it's testable and safe.

### 3. `weld.badges` — a role/status badge vocabulary + renderer
Twitch's badge row is a compact, legible way to show role and status (mod, VIP, subscriber, "first message," tenure). A `weld.badges` plugin would define a small vocabulary (`role`, `status`, `tenure`, `custom`) with a renderer that produces the little inline badge spans before a username, plus helpers to assign/query badges per user. This is the visible half of a moderation/roles story and dovetails with #4 below. Backend-agnostic: the app decides who has which badge; the plugin standardizes the vocabulary and rendering.

### 4. `weld.moderation` — graduated moderation (the tier `banlist` lacks)
Both platforms moderate on a gradient, not a binary. `banlist` is ban-or-nothing; `spamguard` is spam-or-nothing. A `weld.moderation` layer would add the middle: **timeout** (mute a user for N seconds/minutes), **slow-mode** (minimum gap between messages, per user), and **role-gating** (e.g. "links only from trusted users"). It would sit *on top of* `spamguard` (consume its spam signal) and `banlist` (consume its hard-ban list) and add the graduated responses, returning a decision (`allow` / `delay` / `block` / `timeout`) the app enforces. This is the highest-effort item and the one most worth a real design pass — it's a policy engine, and it pairs naturally with the just-built `weld.rules` (a timeout could be a rule action).

## Worth adopting as a smaller enhancement

### 5. `chatui` upgrades — message-actions row + readable high-velocity chat
Two concrete `chatui` additions justified by both front-ends: (a) a **per-message action row** (react / reply / copy / regenerate) — every Twitch message and Discord message has one, and `chatui` currently renders a bare bubble; (b) **density/velocity affordances** for fast chat — compact mode, "new messages" jump-to-bottom pill, grouping consecutive messages from the same author (Discord groups; Twitch interleaves). These are `chatui` v-next features, not new plugins, and would consume `weld.reactions` (#1) for the react action.

### 6. `weld.notify` patterns into `toast` — unread/mention awareness
Discord's unread-channel tracking and mention badges are a notification *model* (per-channel unread counts, @-mention highlight, jump-to-unread). `weld.toast` covers transient notifications; the persistent "you have unread / you were mentioned" surface is unaddressed. Likely a small extension to `toast` or `chatui` rather than a new plugin: track unread counts per channel/thread and expose a mention predicate. Lower priority; only matters for multi-channel apps.

## Deliberately not building

- **Discord guild/voice infrastructure, Twitch video pipeline** — out of scope; Weld is generators, not a platform.
- **Real emote *hosting/CDN*** — `weld.emotes` should render from app-supplied URLs, not host images.
- **Algorithmic timeline/recommendations** (Twitch's carousel of suggested streams) — not a generator concern.
- **Full presence/voice rooms** — `weld.sync` already does lightweight peer presence; anything heavier needs a real-time server Weld doesn't assume.

## Recommended order

1. **`weld.reactions`** — smallest, highest-reuse, composes everywhere. (#1)
2. **`weld.emotes`** — small, pure, useful zero-config; pairs with markdown's sanitizer ethos. (#2)
3. **`weld.badges`** — small renderer + vocabulary; sets up #4. (#3)
4. **`chatui` v-next** — message-actions row + velocity affordances, consuming #1. (#5)
5. **`weld.moderation`** — the graduated layer, as a real design pass on top of spamguard/banlist/rules. (#4)
6. Hold: unread/mention model (#6) until a multi-channel app needs it.

## Caveats

These are saved snapshots of third-party apps; I read structure (aria-labels, data-targets, message anatomy), not their source logic, so the patterns are the *observable interaction model*, not their implementation. Everything above is extracted at the primitive level — a reaction is a count on an id, an emote is a token→image map, a badge is a role label, moderation is a graduated decision — specifically so none of Discord's or Twitch's platform coupling comes along. Anything built should keep Weld's posture: backend-agnostic (app supplies storage and identity), pure where possible, sanitizer-safe for anything that renders user text, and composable with the chat plugins already in the suite.
