# Perchance source-code study: plugin improvements + userscript ideas

Two source files were studied: `source_1.txt` (the "Minimal" generator, which carries the full Perchance **editor shell**) and `source_2.txt` (the core Perchance page, carrying the **template engine** itself — the `PERCH.*` namespace). Unlike every prior study, this is the platform's *own* code, so the findings are ground truth rather than inference: how `[...]` and `{...}` are actually parsed, the real escape rules, the editor API, the save lifecycle, and the global hooks a userscript can reach.

This answers both questions: (A) what the engine internals teach us about improving Weld plugins, and (B) what we can build *outside* the generator sandbox with a Tampermonkey/Greasemonkey userscript. A later **Part C** records the cross-frame and userscript-sandbox facts confirmed while actually building that userscript and the **Skybridge** link between it and Weld generators — the environment rules that govern any code spanning the shell, the generator iframe, and the userscript sandbox.

---

## Part A — Engine internals → Weld plugin improvements

### A1. The real escape set sharpens `weld.safe` ★ highest-confidence
`PERCH.processEscapedCharacters` defines exactly which characters a backslash escapes:

`=` `{` `}` `[` `]` `^` `|` `n`(→newline) `t`(→tab) `s`(→space)

This is authoritative, and it both **validates and extends** what `weld.safe` documents. weld.safe correctly flags `\{ \} \[ \] \|` — but the engine also escapes `\=` and `\^` (the odds/conditional operators), and supports the whitespace escapes `\n \t \s`. `weld.safe` should: (1) confirm its bracket/brace/pipe advice against this canonical list, (2) add `=` and `^` to the set of characters it knows are escapable (relevant when literal `=` or `^` appears in displayed content and gets misread as an assignment/odds operator), and (3) optionally surface the `\s` trick (escaping a leading/trailing space, which the engine otherwise trims). This is a small, exact, high-value update to the suite's most foundational plugin.

### A2. `evaluateSquareBlock` confirms *why* the list-ref trap fires — and the precise tell
The engine's `evaluateSquareBlock` runs every `[expression]` as a **list reference**, gated by `PERCH.isValidJavaScriptIdentifier(expression)` and a `throwErrorIfNonDirectListReferenceIsFound…` flag. That is the exact origin of the `'[]' returned nothing (undefined)` crash the whole brace-interception campaign has been chasing. Two concrete takeaways:
- `weld.safe`'s scanner is right to treat **any** `[word]` / `[]` / `[obj.prop]` as dangerous, but it can be *more precise*: the engine only trips when the bracket content is **not a valid JS identifier path** in a position the parser reaches. weld.safe could lower false-positive noise by distinguishing "definitely a list-ref trap" (bare `[]`, `[123]`, `[a+b]`) from "benign" cases, citing `isValidJavaScriptIdentifier` as the rule. (Lower priority — over-flagging is the safe default — but worth a documented note.)
- `weld.diag`/`weld.monitor` could add a check that mirrors `isValidJavaScriptIdentifier`, so the lint message explains *why* a bracket is a trap in the engine's own terms.

### A3. `PERCH.evaluateText` / `splitTextAtAllBlocks` — a real reference for any text-processing plugin
The engine exposes `evaluateText`, `splitTextAtAllBlocks`, `evaluateSquareBlock`, `createPerchanceTree`, and `escapeHTMLSpecialChars` on `window.PERCH`. Plugins that manipulate Perchance-flavored text — `weld.promptforge`, `weld.clean`, `weld.markdown` — could **reuse `PERCH.escapeHTMLSpecialChars`** instead of rolling their own HTML-escape, guaranteeing parity with the platform. A small `weld.safe.escapeHTML = PERCH.escapeHTMLSpecialChars` passthrough (when present) would be exact-by-construction. Also: `PERCH.nlpCompromise` exposes the bundled `compromise` NLP library — `weld.summarize`/`weld.memory` could borrow it for sentence-splitting without bundling their own.

### A4. `window.PERCH.perchanceError` — speak the platform's error dialect
The engine surfaces author errors through `PERCH.perchanceError(message, …)`. Weld plugins currently throw plain `Error`s. Where a plugin detects an authoring mistake (e.g. `weld.safe` finding a trap, `weld.import` rejecting bad input), routing through `perchanceError` when available would make the message appear in the same place and format authors already expect, rather than only in the console. A soft, optional integration.

---

## Part B — Userscript ideas (outside the sandbox)

The editor shell hands a userscript everything it needs: `window.modelTextEditor` and `window.outputTemplateEditor` are **CodeMirror instances** (`.getValue()`, `.setValue()`, `.on(...)`, `.scrollDOM`, `.setOption`), plus `window.root` (the live generator), `saveGenerator`, `editsHaveBeenMade…`, `generatorLastSaveTime/EditTime`, `codeWarningsArray`, and `generatorDependenciesData`. A userscript runs *above* the sandbox, so it can do things no plugin can: touch the editor, persist outside the generator, span multiple generators, and act before/after save. Ideas, strongest first:

### B1. **"Weld Lint" live editor overlay** ★ the killer app — and it dogfoods weld.safe
A userscript that runs `weld.safe`'s trap scanner over `modelTextEditor.getValue()` on every `modelTextEditor.on("change")`, and underlines the offending `[word]` / unescaped `{…}` / in-string brackets **right in the editor**, with a hover tip ("list-reference trap — use `new Array()` / `Reflect.get`"). Perchance's own `codeWarningsArray` already does generic warnings; this adds the *Weld-specific, trap-aware* layer the whole brace campaign has been about — but interactively, at author time, instead of after a crash. It could even offer one-click fixes (replace `[]`→`new Array()`). This turns weld.safe from a library into a visible tool, and is the single highest-leverage thing a userscript could do for Weld authors.

### B2. **Local autosave / version history / draft recovery**
The shell tracks `editsHaveBeenMadeSincePageLoad`, `generatorLastSaveTime`, and a `beforeunload` guard, but there's no local revision history. A userscript could snapshot `modelTextEditor.getValue()` + `outputTemplateEditor.getValue()` to `GM_setValue` (or IndexedDB) on a debounce, keeping the last N versions per `generatorName` — a local undo-across-sessions and crash-recovery that survives even an accidental discard. This is the OCLB "remember across tabs" pattern (from the earlier GitHub study) applied to generator source. Pure win, zero server.

### B3. **One-click Weld scaffold inserter**
A toolbar button that injects a Weld plugin skeleton (the exact `$meta` + `$output() => { 'use strict'; … }` boilerplate, with the idempotent guard and the conventions baked in) into the editor at the cursor — and a second button that inserts an `{import:weld-<slug>-plugin}` line for any plugin picked from a dropdown built off the live manifest. Removes the boilerplate tax for every new Weld plugin and makes the suite discoverable from inside the editor.

### B4. **Cross-generator Weld dashboard**
Because a userscript persists outside any one generator, it can maintain a registry of *which* Weld plugins each of your generators imports (read from `generatorDependenciesData` / the source on each visit) and present a dashboard: "you're on weld.history 1.0.0 here but 1.1.0 elsewhere," surfacing exactly the version-desync class of bug we just spent a session fixing — but across your whole account. It could link straight to each generator's editor.

### B5. **Editor ergonomics the shell lacks**
Small quality-of-life bindings via the CodeMirror API: a "wrap selection in `\{ \}` / `\[ \]`" key (apply the A1 escapes to a selection in one keystroke — the single most common Weld-authoring chore), a "jump to `$output`" shortcut, a "duplicate this list block" command, and a format-on-save that normalizes indentation in the `$output` body (Weld plugins require a 2-space-indented body — a userscript could enforce it automatically). These directly attack the friction points this project has hit repeatedly.

### B6. **`?$csp` / privacy badge**
A userscript could detect when a generator imports outbound-capable plugins (superFetch, fetch-plugin) and show a small badge indicating whether the page is running under `?$csp`, reusing exactly the `weld.privacy.cspRestricted()` logic — giving *users* (not just authors) an at-a-glance read on a generator's network posture. Pairs the userscript layer with the privacy plugin.

---

---

## Part C — Cross-frame topology & the userscript sandbox (ground truth from building Skybridge)

Everything below was confirmed against `source_1` and against live console/HAR logs while building the Weld Companion userscript and **weld.skybridge** (the bridge that lets a generator's plugins reach the companion). These are the rules that bit us — each cost a debugging round — so they're recorded as hard facts, strongest first.

### C1. A generator's output runs in a *cross-subdomain* child iframe ★
Viewing `perchance.org/<gen>`, the **top frame** is the editor shell at `perchance.org` (apex origin). The generator's own HTML and its imported plugins run in a **child iframe** whose `src` is `https://<32-hex>.perchance.org/minimal?__generatorLastEditTime=…` (confirmed in `source_1`). Its `sandbox` attribute includes `allow-scripts allow-same-origin`, so the iframe **keeps that `*.perchance.org` subdomain origin** — it is *not* forced to an opaque/`null` origin.

Consequences for anything spanning the two:
- Communication between a userscript (top) and a plugin (child) is genuinely **cross-origin** (apex ↔ an unpredictable random subdomain). Use `postMessage` with an origin check that accepts **both** `perchance.org` **and** `*.perchance.org`, and post with `targetOrigin: '*'` toward the child (you can't predict the hex).
- The iframe URL carries `__generatorLastEditTime=<ms>`, which is also Perchance's **import cache key**. Re-saving a generator (or one of its imports) changes this timestamp and forces a fresh fetch. An **unchanged** timestamp across reloads is a reliable tell that the deployed code is the cached *old* version — i.e. a save/deploy didn't actually take. (This is exactly how we proved a "fixed" plugin hadn't been redeployed.)

### C2. A userscript's `window` is **not** the page window — bind to `unsafeWindow` ★ the costly one
With any `@grant` set (we use `GM_*`), Tampermonkey/Violentmonkey run the script in a **sandbox**. In that sandbox `window` is a wrapper: a `message` listener placed on it may **not** receive the page's real cross-frame `postMessage`s, and `window.frames` may **not** enumerate the real child iframes. A bridge anchor attached to the sandbox `window` therefore hears nothing and announces into an empty frame list — a *silent* failure.

Fix, and the pattern to reuse for any cross-frame userscript work:
- Add `// @grant unsafeWindow`.
- Resolve the real page window once: `var W = (function(){ try { return (typeof unsafeWindow!=='undefined' && unsafeWindow) || window; } catch(e){ return window; } })();`
- Bind everything that touches the page's event loop or frame tree to `W`: `W.addEventListener('message', …)`, `W.frames`, `W.top`, `W.self`.
- The **plugin** side (a normal page script *inside* the iframe) is **not** sandboxed and correctly uses plain `window`.
- Sandbox gotcha #2: `window.top !== window.self` can be *falsely true* in the top frame (wrapper vs real). Test top-ness on one object: `W.top === W.self`.

### C3. Cross-frame handshakes must be order-independent
The two ends mount at unpredictable times: the userscript at the shell's `document-idle` (after several `/api/*` fetches), the plugin whenever its iframe finishes loading — **either can be first**. A reply-only handshake (anchor only answers the plugin's `hello`) deadlocks whenever the plugin greets before the anchor is listening, with no recovery. Make it order-independent:
- The **top** side *announces* itself down to child frames (`W.frames[i].postMessage(…, '*')`) on a **bounded interval** (e.g. every ~600 ms for ~12 s), so a late or slow iframe still gets greeted.
- The **child** side *retries* its greeting a few times and treats an unsolicited announce as a connect.
- Keep it safe with the C1 origin check plus a per-message **nonce**; never let message *direction* substitute for a trust check.

### C4. `$meta` absorbs every indented line under it — put imports at COLUMN 0
`source_2`: the engine reads `root.$meta.$allKeys` and errors (*"invalid properties in your $meta list"*) on any key outside **{title, description, image, tags, header, dynamic}**. The grouping rule is purely **indentation**: any indented `name = …` line following `$meta` is treated as a `$meta` property — a blank line does **not** end the block, and this happens **whether or not an `$output` follows** (earlier notes here were wrong to tie it to `$output`; import-only examples with indented imports error too). So a `name = {import:…}` line indented under `$meta` becomes an invalid `$meta` key.

House pattern for example generators (verified across the suite — 48 examples do this, the 14 that didn't all errored): the `$meta` properties may be indented, but the **import lines must be at column 0**, after a blank line:
```
$meta
  title       = weld.X examples
  description = …
  tags        = …

weldX = {import:weld-X-plugin}        ← column 0, NOT indented
```
Keep examples import-only (no `$output`); put demo logic in the example HTML `<script>`. Quick check: `grep -lE '^  \S+ *= *\{import:' weld-*-example-dsl.txt` must return nothing.

### C5. Braces/brackets: escape in markup, leave raw in `<script>`/`<style>`
`{ } [ ]` in ordinary page **markup** (`<pre>`, `<code>`, `<p>`, …) are parsed as directives and must be escaped `\{ \} \[ \]`. Inside `<style>` **and** `<script>` blocks they are tolerated **raw** (engine-confirmed on working pages). So documentation code-samples in `<pre>` must escape; demo logic in `<script>` need not. Reliable lint: grep for unescaped `{ } [ ]` **outside** `<style>`/`<script>`. (Note: the `node --check` / `[[`–`{{` scanners do **not** catch single-bracket `[word]` traps, `$meta` grouping, or brace-in-markup — diff a new DSL/page against a known-good sibling of the *same kind* instead.)

### C6. The connected bridge path can only be tested on real `*.perchance.org` origins
A headless harness that loads pages over `file://` cannot exercise the connected path — `file://` fails the `perchance.org` origin check, so it only ever shows the *fallback* path (and silently hides origin/sandbox bugs). To test the live link, intercept requests so the top is `https://perchance.org/…` and the child is `https://<sub>.perchance.org/…`, and run the anchor inside a **simulated sandbox** (`window` = inert wrapper, `unsafeWindow` = real). That is the only configuration that reproduces C1+C2 together. **And** to reproduce C7, the harness must define the plugin's `$output` as a callable that is *not* auto-invoked, then have the page call it — otherwise the harness runs the plugin for free and masks the real bug.

### C7. An imported plugin's `$output` is NOT auto-invoked — you must call it ★ the one that masked everything
This is the highest-impact gotcha and is **engine-VERIFIED** (perchance-api skill §0.6). `{import:foo}` makes `foo`'s `$output` available as a *function definition*; it does **not** run on import. A plugin that builds its API as a side effect of `$output` (every Weld plugin: it stashes on `window.weld.X`) therefore **never initializes** unless something calls it:

- From panel JS: `root.<alias>()` (e.g. `root.weldSkybridge()`).
- From DSL: reference the alias, e.g. `[<alias>()]` in an `$output`/list.

Symptom when missed: `window.weld.<plugin>` is `undefined` forever, even though the import "succeeded" and the generator was re-saved — and even an early deployment beacon set on the first line of `$output` stays absent (because line one never executed). An import-only example whose HTML never calls the alias will *look* wired up but the plugin is inert. Fix: trigger it once, early, in panel JS (the `$output` should be idempotent so repeat calls are cheap — Weld plugins already guard with `if (window.weld.X) return window.weld.X;`). This single missing call masked an entire bridge-debugging campaign: the companion was mounting and announcing correctly the whole time, but the plugin half had never run, so there was nothing to answer.

---



**Plugin side (do first — small, exact, grounded in the engine source):**
1. **`weld.safe` escape-set update** — add `=` `^` and the `\n \t \s` escapes, cite `processEscapedCharacters` as canonical. (A1)
2. **`weld.safe` / `weld.diag`**: optional `PERCH.escapeHTMLSpecialChars` passthrough + an `isValidJavaScriptIdentifier`-aware note explaining the trap. (A2, A3)
3. Soft `perchanceError` routing for author-facing messages. (A4)

**Userscript side (the "outside the box" answer):**
1. **Weld Lint live editor overlay** (B1) — highest leverage; makes weld.safe interactive.
2. **Local autosave / version history** (B2) — universal win, trivial risk.
3. **Scaffold inserter** (B3) + **editor ergonomics** (B5) — remove the Weld-authoring boilerplate and escaping tax.
4. Cross-generator dashboard (B4) and `?$csp` badge (B6) as follow-ons.

A single **"Weld Companion" userscript** could bundle B1–B3 + B5 and ship as a sibling to the plugin suite — the first piece of Weld that runs *outside* a generator, and the natural home for everything a plugin structurally cannot do.

## Part D — Cross-check against the official Perchance docs (per-docs-html, 2026-06)

A separate study of the official Perchance documentation page corroborates the inferred findings above and adds two precise refinements.

### D1. C5 reconciled — tag contents are raw, but the docs give a blanter rule (and a sanctioned escape-free path)
The docs **confirm** C5's escape-in-markup rule (`\{ \} \[ \]`) and confirm C4's symptom name: an unescaped brace in the HTML panel triggers *"Doesn't appear to have the correct syntax"* because the engine tries to parse `{ … }` as a shorthand list. **However**, the docs also tell authors to escape braces *even in CSS inside the HTML panel* — a blanket rule that, read literally, contradicts C5's "raw inside `<style>`/`<script>`". The reconciliation: Perchance leaves the **contents of `<style>` and `<script>` tags raw** (C5 holds — our own live-rendering pages contain raw braces in `<style>` and raw `arr[parseInt(...)]` indexing in `<script>`, and they parse and run on real `*.perchance.org`, e.g. the skybridge example connecting live). The docs' CSS advice is the conservative beginner-safe version for authors who may place CSS *outside* a tag. **Keep C5 as the precise rule; treat the docs' version as the safe default.** The docs also surface the sanctioned escape-free option we weren't using: **`literal-plugin`** ("automatically put backslashes in front of curly/square brackets") or a separate file, for large code blocks one doesn't want to hand-escape.

### D2. New, sharper hazard — an unescaped `[call()]` in a docs panel *executes* on view ★
Beyond the brace-syntax error, the docs flag a distinct danger C5 didn't name: an **unescaped `[myPlugin()]` in the HTML/docs panel is actually invoked every time someone views the page** — infinite loops, page slowdown, corrupted plugin state. This is why doc usage-examples must be written `\[myPlugin("x")\]`. Acted on: `check_pages.js` now scans markup (with `<style>`/`<script>` stripped, since those are raw per D1) for unescaped `[ident(...)]` and fails the page if any are found. A full sweep of the suite's ~130 pages reported **none** — but the guard now prevents a future docs edit from reintroducing it. (The same sweep surfaced one *pre-existing, unrelated* script-extraction parse warning on `weld-markdown-example-html.txt` — a harness artifact, not a page defect.)

### D3. Independent corroboration of C7 and the API-object convention
The docs' own "Returning Objects or Arrays" plugin example returns `{ greet, farewell, version: "1.0.0" }` and is **called** as `[myTools = myPlugin(), ""] [myTools.greet("Alice")]` — independently confirming (a) the `window.weld.X` API-object shape the whole suite uses, (b) the literal `version` convention the lint enforces, and most importantly (c) **C7**: an imported plugin's `$output` runs only when *called*, never on import. The single fact that masked the original bridge bug is the platform's documented behavior.

### D4. Plugin-architecture cross-checks (from the docs' "Avoid `import` in your plugin" + the official-plugin list)
- The docs say *don't import other plugins into your plugin* (dependency chains break and slow loads) but that **official plugins are safe** to depend on. Audit of the suite: official-plugin imports are sanctioned (`super-fetch` in `weld.fetch`, `kv-plugin` in `weld.kv`, `text-to-image` in `weld.image`, `ai-text` in `weld.stream`, `dynamic-import` in `weld.gen`/`weld.report`). The one matching the anti-pattern is **`weld.portrait-studio`, which imports three *other Weld* plugins** (background/ui/toast) — acceptable since co-maintained, but the lone dependency-chain to keep an eye on.
- **`weld.crew`'s `web.fetch` tool was unplugged from our own `weld.fetch`** (it only checked for a companion `fetch` capability that no build advertises). Since `weld.fetch` already wraps the official CORS-free `super-fetch` proxy, `web.fetch` now falls back to it — the agent can browse today when the host imports `weld-fetch-plugin`, no companion broker needed. (Fixed in crew 1.0.1.)
- The hub (`weld.ui-index`) statically imports 61 plugins and already pulls in `dynamic-import-plugin` — a candidate to move those imports onto dynamic-import to cut catalog load time.
- `weld.kv` (server-side, cross-device, wrapping `kv-plugin`) exists but is *not* in skybridge's storage chain (companion → persist → memory, all same-device). Adding it as a tier would give companion-less users cross-device persistence.

## Part E — The realtime/cross-device reality (canonical plugin-source trove, 2026-06)

A trove of Perchance's *own* plugin sources was studied (the `kv-plugin`, `server-plugin`,
`super-fetch-plugin`, `remember-plugin`, etc. as published on perchance.org). Two findings
directly correct the suite's cross-device storage/realtime story — both are ground truth
from the plugins' actual code, not inference.

### E1. `server-plugin` is the *only* real cross-device primitive — and the suite never mentions it ★
`server-plugin` is Perchance's **official realtime/multiplayer backend**: the plugin opens a
**WebSocket** to `server-plugin.perchance.org`, joining a per-generator "universe" keyed by
`window.generatorPublicId` (binary-framed protocol with multiplexed, bidirectional streams;
`#forceUseWS=1` forces the WS path). It is the right — and essentially only — way for a
sandboxed generator to share state **across devices/browsers**. The realtime ladder by reach:
`BroadcastChannel` (same browser, same generator) → **`server-plugin`** (cross-device) →
`superFetch` polling (request/response only; relays return HTTP 530 → `Failed to fetch`) →
userscript bridge (arbitrary hosts / own-model AI). Its demo warns **do not fork it** — the
plugin code is coupled to the server; import and wrap it instead.
- **`weld.sync` now says so.** Its `$meta` and header previously implied "multiplayer" without
  qualification; it is **same-browser only** (BroadcastChannel + namespaced localStorage, both
  origin-scoped). Updated to state the scope explicitly and to point cross-device/multiplayer
  needs at `server-plugin`. (weld.sync 1.0.1.) No behavior change — honesty + a pointer.

### E2. `kv-plugin` is **local IndexedDB, not server-side** — `weld.kv` ships a false promise ★ highest-impact
`weld.kv`'s `$meta` reads *"Server-side, cross-device key-value storage... kv data follows the
user across devices... Everything is async (it hits the server)."* The canonical `kv-plugin`
source contradicts every word of that:
- It builds its store with `indexedDB.open(...)` via a bundled **idb-keyval**, and creates
  `createStore(`${storeName}-db-${moduleName}`, ...)`.
- Its own comment: *"each generator has its own subdomain, and hence its own partitioned
  **IndexedDB** database."* The backend is the local `folder-db-kv-plugin` IndexedDB —
  **local to the browser**, exactly like `weld.persist`. There is no server and no network hop.
- Consequence: `weld.kv` data does **not** follow a user to another device. Anyone trusting it
  to sync saves to their phone silently loses that guarantee. This also invalidates the D4
  note that proposed adding `weld.kv` as skybridge's *cross-device* storage tier — same wrong
  premise.

**Remediation (a design call, not yet applied to `weld.kv` itself):**
1. **Relabel as local.** Correct the `$meta`/comments to describe per-generator local
   IndexedDB (a folder/namespaced API over the same scope as `weld.persist`), and drop the
   cross-device claims. Lowest-risk; current behavior already matches this.
2. **Re-implement on `server-plugin`.** Rebuild `weld.kv` (or a new `weld.cloud`) on the
   official WebSocket backend to *actually* be cross-device, preserving the value prop. Larger;
   the server-plugin call surface should be wrapped, not guessed, and not forked.

## Caveats
These globals (`PERCH`, `modelTextEditor`, `saveGenerator`, `generatorDependenciesData`, `codeWarningsArray`) are Perchance internals, not a documented API — a userscript built on them must feature-detect each and degrade gracefully, because Perchance can rename them at any time. The engine escape set (A1) is the most durable finding and worth acting on regardless; the userscript hooks are powerful but should be written defensively, exactly as the existing studies advise for any platform-internal surface. The Part C topology facts (the `<hex>.perchance.org` child-iframe origin, the `__generatorLastEditTime` cache key, the sandbox `window`/`unsafeWindow` split) are equally internal and equally subject to change — treat origin checks, frame enumeration, and the handshake as defensive code that fails *soft* (fall back, never throw into the host page).
