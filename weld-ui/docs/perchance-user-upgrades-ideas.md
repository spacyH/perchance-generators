# Beyond Weld: user-facing Perchance upgrades

A brainstorm of quality-of-life and UI improvements for *users* of Perchance — readers and players of generators, not just authors writing code. Grounded in what the engine source actually exposes (the editor shell carries the viewer chrome too), and deliberately scoped to things Perchance does **not** already do, so nothing here is reinventing a built-in.

These mostly take the shape of a **userscript** (the "Weld Companion" idea from the source study), because that's the only layer that can add UI *around* any generator regardless of who wrote it. A few are small enough to ship as tiny standalone Weld plugins an author can drop in. Each notes which it is.

## What Perchance already gives users (so we don't duplicate it)
From the source: system dark/light via `prefers-color-scheme`, a notifications system (`localStorage.pendingNotifications`), an "AI helper" button, an editor with find/replace/regex, generator screenshots (`getGeneratorScreenshot`), and a sense of which generators you likely own (`generatorsLikelyOwned`). What's conspicuously **absent for a viewer**: no per-generator theme control, no favorites/history of generators you've *used* (only owned), no reading-comfort controls, no easy save/share of a single result. That absence is the opportunity.

---

## Tier 1 — small, easy, high-frequency wins

### 1. Favorites & "recently used" for generators ★ likely the most-wanted
Perchance tracks generators you *own*, not ones you *use*. A userscript could keep a local list (in `GM_setValue` / localStorage) of generators you've visited and let you star favorites, then show a little launcher — a dropdown or a `/`-key palette — to jump back to them. No account, no server. This is the single most universal gap: people use the same handful of AI-chat / image / name generators repeatedly and have to re-find them every time.

### 2. Per-generator theme / reading comfort
The platform only follows the system theme. A small floating control could add, per generator (remembered locally): a **light/dark/sepia** toggle that overrides the page, an **adjustable font size / line-height / max-width** for text-heavy generators (story and chat generators are often a wall of edge-to-edge text), and a **dyslexia-friendly font** option. Pure CSS injection over the output area; nothing the generator author has to support.

### 3. One-click "save this result"
Generators produce text and images, but saving a single *result* is fiddly (select, copy, or right-click-save). A userscript could add a hover toolbar on the output: **copy as text**, **copy as image** (render the output node to canvas), **download**, and **"pin"** (stash the result locally so you can compare several rolls side by side). The reroll-and-compare workflow is huge for name/character/image generators and the platform doesn't help with it.

### 4. Result history / "undo reroll"
When you reroll a generator you lose the previous output forever. A userscript could keep the last N outputs in memory with **back/forward arrows** — so the classic "wait, the one before was better" has an answer. Trivial to implement (snapshot the output node's HTML on each change), genuinely missed by users.

### 5. Bigger / resizable AI-chat & text input
A recurring complaint on text generators is the cramped input box. A small enhancement: a **drag-to-resize handle** and an **expand-to-fullscreen** toggle on textareas, plus **Shift+Enter = newline / Enter = submit** normalization where it's inconsistent. Reading-comfort's twin for *writing* comfort.

## Tier 2 — meatier QoL

### 6. Prompt / input library with autocomplete
For AI image and chat generators, users retype the same prompt fragments constantly ("masterpiece, best quality, …", a character's description, a style tag). A userscript could offer a **local snippet library** with autocomplete in any Perchance input — type a trigger, expand a saved block. Cross-generator, account-free. This is the highest-value Tier-2 idea for the AI-tools crowd.

### 7. Gallery / session export for image generators
Image generators show results transiently. A userscript could maintain a **local gallery** of everything you've generated this session (thumbnails in a collapsible tray), with select-all → download-zip. Pairs conceptually with `weld.gallery`/`weld.background` but works on *any* image generator without the author adopting Weld.

### 8. Keyboard shortcuts for viewers
The editor has shortcuts; the *viewer* experience has almost none. A userscript could add: **space / R to reroll**, **C to copy output**, **F to favorite**, **/ to open the favorites palette**, **? to show the shortcut sheet**. Power-user speed on generators people hit dozens of times a day.

### 9. "Focus / reading mode"
One key hides everything but the output and its primary control — no menu bar, no ads (where the user has chosen to, within terms), no sidebars — for distraction-free reading of story/chat generators or clean screenshots. A toggle that adds a class to `<body>` and lets local CSS take over.

### 10. Shareable result permalinks (best-effort)
Sharing a *specific* output is hard. Where a generator's output is reconstructable from inputs, a userscript could encode the input state into the URL hash and restore it on load — a "share this exact result" link that works without the author building it. Best-effort (only works for input-deterministic generators), but a real gap for collaborative use.

## Tier 3 — bigger ideas, noted not recommended

- **Cross-device sync of favorites/snippets** — needs a server or a user-supplied store; against the account-free ethos unless optional.
- **Generator ratings/notes overlay** — a personal "I liked this one / my notes" layer per generator; useful but starts to overlap the comment system.
- **Accessibility pass** — ARIA-labelling and focus-order improvements injected over generators that lack them; high-value but per-generator and fragile.

---

## What ships as a Weld plugin vs. a userscript

- **Userscript (works on any generator, even non-Weld):** favorites/history (#1), theme/comfort (#2), save-result (#3), result history (#4), input resize (#5), snippet library (#6), session gallery (#7), viewer shortcuts (#8), focus mode (#9), result permalinks (#10). These need to wrap *other people's* generators, which only a userscript can do.
- **Tiny Weld plugin (author opts in):** a result-history/undo-reroll primitive, a reading-comfort control, and a "save/pin this output" widget could each be a small plugin for authors who want it built in — but the userscript versions reach far more users.

## Recommended first cut
Bundle the cheapest, highest-frequency Tier-1 items into the **Weld Companion userscript**: **favorites + recently-used (#1)**, **theme/font comfort (#2)**, **save/copy/pin result (#3)**, **result history (#4)**, and **viewer keyboard shortcuts (#8)**. That's one cohesive "Perchance, but nicer to use" layer, all local, all account-free, none of it duplicating a built-in — and it dovetails with the author-facing Weld Lint / autosave userscript ideas from the source study into a single companion extension.

## Caveats
The viewer chrome and storage hooks are Perchance internals; a userscript must feature-detect and degrade. CSS injected over arbitrary generators can collide with an author's own styles, so theme/comfort changes should be scoped and reversible. And anything touching ads must respect Perchance's terms — the focus-mode and reading-mode ideas should hide *the user's own* clutter, not strip the page in ways that violate the platform.
