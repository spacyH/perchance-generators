# Weld Companion (userscript)

Quality-of-life upgrades for **Perchance**, for both readers/players and authors. It runs *outside* the generator sandbox (as a Tampermonkey/Greasemonkey userscript), so it works on any generator — not just ones built with Weld. Everything is local and account-free; the only network calls it ever makes are to an AI provider **you** choose, with **your** key.

## Install
1. Install a userscript manager: **Tampermonkey** (Chrome/Edge/Safari/Opera) or **Violentmonkey / Greasemonkey** (Firefox).
2. Open `weld-companion.user.js` and confirm the install. Your manager may ask you to approve an `unsafeWindow` permission — this is required for the Skybridge bridge (see below); approve it.
3. Browse Perchance — a single **⚡ Weld** item is added to Perchance's own menu bar, just left of the **edit** button. Click it (or press **`/`**) to open the Weld drawer. On pages with no Perchance bar (e.g. *minimal* mode), nothing is injected — `/` still opens the drawer, and the item appears automatically if the bar shows up later.

## What it adds

The ⚡ Weld item opens a drawer with a result-tools row in its header (**Copy / Save / Pin** + undo-reroll arrows) and three tabs:

### ★ Generators
- **Favorites & recently-used** — every generator you open is remembered; star the ones you keep returning to. Press **`/`** anywhere for a search palette (↑/↓ to move, Enter to open).
- **Manager** — sort (recent / name / favorites-first), filter-as-you-type, and per-row **open / edit / ✕ remove**.
- **CRUD shortcuts** that drive Perchance's own functions when you're in the editor: **New**, **Fork**, **Save** (`saveGenerator`), **Delete** (the platform's own delete, behind a confirm).

### 👁 Comfort *(per-generator, remembered)*
- **Theme** — Off / Dim / Warm / Sepia / Gray / Dark, applied as a full-page **`backdrop-filter` overlay** that themes any generator without touching its layout (each swatch previews its real effect).
- **Typography** — font size, max width, line height for text-heavy story/chat generators; a **dyslexia-friendly font**; and a one-key **Focus mode** that hides chrome for distraction-free reading and clean screenshots.

### 🤖 AI Helper — edit it, or use your own GPT
- **Custom instruction** — override the AI Helper's system prompt with your own.
- **Use your own model** — route the Helper through **OpenAI (GPT)**, **Anthropic (Claude)**, or **Google (Gemini)** with your own API key and chosen model. A **Test** button verifies the key. When a provider is selected, the Helper's submit is intercepted and the result is written straight into the code editor. Or keep **Perchance built-in** (the default) and just use a custom instruction.

### Result tools & history
- **Copy / Save / Pin** appear in the drawer header whenever a generator has output; **Pin** stashes results in a tray to compare rolls.
- **Result history (undo-reroll)** — step **back / forward** through previous outputs (`[` and `]`), up to 50 snapshots per session.

## Skybridge — the bridge to Weld generators
The companion is also the **anchor end** of `weld.skybridge`. A generator that imports the `weld-skybridge-plugin` can, *with your per-generator consent*, ask the companion for two things it can't do from inside the sandbox:
- **Cross-generator storage** — namespaced, persistent key/value that the companion holds for it (falls back to the generator's own storage / memory when the companion isn't installed).
- **Your own AI model** — run a completion through the model **you** configured in the AI Helper tab. Your API key **never crosses the bridge**; only the prompt goes out and the text comes back.

The link is a two-way `postMessage` handshake between the companion (top frame) and the plugin (the generator's child iframe). Consent is **per-capability and per-generator**, asked once and remembered. With no companion installed the plugin degrades gracefully and reports the truth (`has('storage')`/`has('ai')` return `false`). Because the userscript runs in the manager's sandbox, the bridge binds to the real page window via `unsafeWindow` — hence the install-time permission.

## Keyboard shortcuts (viewer)
`/` launcher · `f` favorite · `c` copy output · `[` `]` result history · `?` show this list. *(Ignored while typing in an input.)*

## Privacy & safety
- Favorites, history, comfort settings, and pins live in your browser's userscript storage. Nothing is uploaded.
- Your AI API key is stored **only** in this browser and is sent **only** to the provider you pick. `@connect` is limited to `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, and `perchance.org`.
- `@grant unsafeWindow` is used **only** to attach the Skybridge listener/announce to the real page window; it is not used to read or modify page content beyond the bridge handshake.
- The script touches Perchance internals (`modelTextEditor`, `saveGenerator`, the AI-helper DOM, `/api/*`). These are **not** a documented API — every feature is feature-detected and silently no-ops if Perchance changes something, so the script never breaks the host page.
- Focus mode hides *your own* clutter (menus, sidebars); it is not an ad blocker and should be used within Perchance's terms.

## Compatibility & caveats
- Runs on `perchance.org` and `*.perchance.org`, **top frame only**.
- The **Dark** theme is an inversion (the standard dark-mode trick) and renders photos in negative; on image-heavy generators prefer Dim / Warm / Sepia / Gray. Needs a browser with `backdrop-filter`.
- **Skybridge requires both halves to be deployed:** update the userscript *and* re-save the `weld-skybridge-plugin` generator (and re-save any generator that imports it, to bust Perchance's import cache). The console logs the handshake on both ends (`[WeldCompanion]` / `[skybridge]`); if the plugin lines are missing, the plugin generator is still the cached old version.

## Relationship to Weld
This is the first piece of the Weld project that runs outside a generator — the companion to the plugin suite, and the home for everything a plugin (inside the sandbox) structurally cannot do. Planned author-facing additions: a **Weld Lint** overlay (run `weld.safe`'s trap scanner live in the editor) and **local autosave / version-history** for generator source.

© 2026 therealwestninja · DeviantArt west-ninja · GitHub therealwestninja
