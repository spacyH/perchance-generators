# weld.skybridge — roadmap

The bridge punches holes in the generator sandbox by letting a generator ask the **companion** (a userscript in the top frame) to do things it structurally cannot. Today the bridge brokers two capabilities — the user's own AI model, and storage the companion holds — but the companion *has* far more privilege than that, and the frontier tier below is about brokering the rest.

Design law for everything here: **degrade gracefully** when the companion is absent (own-AI → broker, shared storage → per-generator/local), so a generator built on the bridge still works for everyone.

---

## Tier 0 — the keystone (build first)

- **Shared-namespace storage.** Today storage is namespaced per generator (`sbk:<gen>:<key>`) for safety. Add an opt-in **shared** scope (its own consent prompt: "let generators share data with each other") keyed e.g. `sbs:<key>`. Small change, and it's the prerequisite for the entire cross-generator class in Tier 1.

## Tier 1 — obvious payoff (the expected apps)

*Own-model AI (works now):*
- BYO-GPT for any story/chat/VN generator — route AI through the user's GPT-4o / Claude / Gemini, key never crosses.
- Long-session memory compression — own-model hierarchical summarization so sessions outrun the broker budget.
- In-generator authoring help — critique / rewrite-in-voice / sheet→portrait-prompt, on the user's model.

*Cross-generator shared storage (needs Tier 0):*
- Shared "my OCs" roster — define a character once; every generator reads it.
- Cross-generator world state / "continue" — one campaign save shared by town/combat/dialogue generators.
- One profile honored everywhere — pronouns, POV, content settings, theme.
- Shared lorebook — author once (weld.lorebook), inject across the suite.
- Cross-generator gallery / stats / achievements — unified feed, or a local account-free XP/currency economy across linked generators.

*The combination (needs both):*
- Persistent AI companion that follows you across generators — memory in shared storage, brain = your model.
- Creator "studio" hub generator — dashboard over all your characters/saves/outputs with own-model actions.

---

## Tier 2 — frontier (new capability classes the sandbox simply lacks)

Each is "couldn't do this before" because it brokers a companion privilege beyond AI+storage. Feasibility / sharp edges noted.

- **CORS-free fetch broker (shipped: companion `fetch` capability).** Generator asks the companion to fetch a URL; companion uses `GM_xmlhttpRequest` (no CORS) and returns it. Unlocks live web data inside generators: RSS, public JSON APIs, wiki/dictionary lookups, reference images. *Needs:* broader `@connect` (or a user-managed allowlist) + per-host consent. *Edge:* effectively the user's browser as origin — gate hosts, never auto-allow.
- **Local-model bridge.** Route AI to a model running on the user's own machine (Ollama / LM Studio) via `@connect localhost`. Free, private, offline AI in a Perchance generator. *Needs:* localhost in `@connect` + a base-URL setting. *Edge:* none really — it's the user's own box; great for power users.
- **Agent runtime.** Combine own-model + fetch broker: the generator declares tools, the companion runs the model→fetch→model loop. A generator becomes an AI agent with real web access and the user's model. *Edge:* loop/budget caps; same host-gating as the fetch broker.
- **Self-authoring generators.** The companion has `modelTextEditor` / `saveGenerator`. A running generator could write new list entries (or whole generators) back into actual source — a generator that learns and edits the codebase, or an AI that scaffolds a new generator and saves it. *Edge:* powerful footgun; strong explicit consent, dry-run/preview, never silent writes.
- **Background / persistent jobs.** The top frame survives iframe reloads and navigation; the companion can run a slow batch (e.g. generate 100 variations on the user's model) while the user navigates away, with results in storage on return. The sandbox dies on reload; this can't be done inside it. *Edge:* show a queue/cancel UI; cap concurrency.
- **Cross-tab coordination (shipped: companion `bus` capability + weld.swarm).** GM storage is shared across tabs/sessions; the companion can relay between two open generators — a GM-runs-the-world tab driving a player tab, or a director/stage split. Local "multiplayer," no server. *Edge:* it's near-real-time via polling, not instant; fine for turn-based.
- **Library introspection.** The companion can read the user's *other* generators' source via the editor/API: "index all my OCs by scanning my generators," "find everything that imports weld.chatui," account-wide lint/refactor driven from a generator. *Edge:* read access only by default.
- **Out-of-band notifications.** Companion fires a top-frame/browser notification when a long generation finishes even if the user tabbed away. Sandbox can't notify reliably.
- **Shared cache layer.** Companion caches expensive AI results / fetched assets across generators and sessions — repeated prompts become instant and free.
- **Top-frame UI ("sudo UI").** A generator requests UI it can't render itself — a real modal outside the iframe, a menu-bar button, a page-chrome toast — and the companion renders it.
- **Provenance / attestation.** Companion signs/stamps outputs with a key it holds ("made with the user's own model at time T") — local provenance for the AI-art / OC crowd. *Edge:* niche; not anti-forgery, just self-labeling.
- **Author-local self-instrumentation.** Opt-in, **local-only** usage stats of *your own* generator across *your own* sessions, to improve it. *Edge:* must stay local and author-scoped — not user telemetry; keep faith with the suite's no-telemetry ethos.

---

## Deliberately not building
Cross-device sync (needs a server, against account-free ethos), user-facing telemetry, tip-jar / monetary features (real money + finite gem risk), CSAM detection. Anything that ships data off the user's machine without an explicit, per-use opt-in.

## Suggested order
1. **Tier 0 shared-namespace storage** (keystone; unlocks Tier 1 cross-generator apps).
2. **Local-model bridge** (lowest risk frontier item, highest power-user delight).
3. **CORS-free fetch broker** → **agent runtime** (the biggest new capability class; build the broker with host-gating first).
4. Pick end-user apps (OC roster, persistent companion) once Tier 0 lands.
5. Self-authoring + background jobs later — most powerful, sharpest edges, design consent carefully.
