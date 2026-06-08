# Perchance Editor & Userscript / Companion Patterns — Reference

The other reference files describe the generator **runtime** (the sandboxed iframe a visitor
sees). This file describes the **authoring/editor environment** at `perchance.org` and the
patterns for a browser **userscript** (Tampermonkey / Greasemonkey) that augments it — e.g.
a build companion or a capability "bridge" for generators.

Sections marked [MEASURED — editor] come from instrumented work against the live editor
(console probes + HAR captures) during companion development. They are internal,
undocumented surfaces: treat every global and endpoint named here as *unstable* and resolve
it defensively (feature-detect, wrap in `try/catch`, parse responses without assuming shape).

---

## 1 · The Editor Page vs the Sandbox

```
perchance.org/<name>            ← editor / generator page (TOP frame)  ← userscripts run HERE
  └─ <iframe> 32-hex.perchance.org/<name>   ← the sandboxed generator runtime
       └─ <iframe> text-generation.perchance.org/embed  ← AI broker (see platform.md §1.2)
```

- The editor UI (code panes, preview, save) lives in the **top frame** at `perchance.org`.
  The generator runtime is a nested, separate-origin iframe — the sandbox the rest of this
  skill documents.
- A userscript that wants to touch the editor must run in the top frame only. Use
  `@noframes` and match both `perchance.org/*` and `*.perchance.org/*` (some editor routes
  are on subdomains), then bail early if the expected editor globals are absent.
- The editor is a single-page app; the panes and globals appear after load. Run at
  `document-idle` and still guard for late-arriving globals.

---

## 2 · The Code Panes (CodeMirror 6) [MEASURED — editor]

The editor uses **CodeMirror 6**. There are two panes that matter:

| Pane | Holds | Internal doc id |
|------|-------|-----------------|
| "Top" / DSL editor | the list/function source (the DSL) | `modelText` |
| HTML panel editor | the HTML panel (markup + `<script>`) | `outputTemplate` |

These are reachable through the editor's internal CodeMirror view objects (keyed by the doc
ids above). They are **not** a public API — the lookup path and object shape can change, so
resolve them behind a single helper and degrade gracefully if it returns nothing.

A CM6 view exposes the standard surface:

```js
// read the current text of a pane
const text = view.state.doc.toString();

// insert at the cursor (preferred): replaceSelection via a dispatched transaction
view.dispatch(view.state.replaceSelection(snippetText));

// fallback if replaceSelection is unavailable on the build: a manual change tx
const pos = view.state.selection.main.head;
view.dispatch({ changes: { from: pos, insert: snippetText } });
```

**Practical rule:** wrap pane access in a resolver that tries the known path, verifies the
object looks like a CM6 view (`view.state && view.state.doc`), and returns `null` otherwise.
Never assume a pane is mounted — the HTML pane in particular may be collapsed/absent
depending on editor layout.

---

## 3 · Ownership, Edit Keys & Save State [MEASURED — editor]

These read-only signals let a tool reason about whether (and how) a save will succeed,
without credentials of its own:

| Signal | Meaning |
|--------|---------|
| `window.userOwnsThisGenerator` | boolean — the current user owns this generator |
| URL hash `#edit:collab=<KEY>` | a **collaborator** edit key was supplied in the link |
| `localStorage['perchance_generatorEditKey_<name>']` | the **owner's** stored edit key for `<name>` |
| `lastEditTimeByDocId` | a per-pane last-edit timestamp map on the editor page |
| `getGeneratorStats?name=<name>` (public API, platform.md §6.1) | returns `lastEditTime` for the published build |

A "can I save?" preflight composes these: **owner** (`userOwnsThisGenerator`), **collab**
(`#edit:collab=` present), **edit-key** (localStorage key present), or **copy/unknown**
(none → a save would fork or fail). All of the above are reads only — no write, no creds.

**Save semantics.** Saving writes the build **in place**; the public editor keeps **no
version history**. Propagation to viewers is governed by the CDN edge cache, which can serve
a stale build for a long time after a save (see platform.md §1.3). Two consequences for
tooling:

- There is no built-in "undo last save" or diff-against-previous in the platform. If you
  want history, keep your own (e.g. push each version to an external store / Git before
  saving) and diff locally.
- After a save, a viewer may not see the change until the edge cache is purged — don't treat
  "saved" as "live everywhere."

---

## 4 · The Userscript Bridge ("Skybridge") Capability Model [MEASURED — editor]

A sandboxed generator cannot reach arbitrary cross-origin hosts, cannot persist outside its
own storage quota, and `superFetch` will not sustain relay/realtime endpoints (platform.md
§6.4). A **userscript** on the editor/top frame has none of those limits — in particular
`GM_xmlhttpRequest` makes cross-origin calls the sandbox and `superFetch` cannot. This is the
basis of a *bridge*: the userscript advertises capabilities, and a generator detects and
uses them when present, degrading cleanly when absent.

**Shape of a bridge (one workable design):**

- A stable global namespace the generator can probe (e.g. `window.weld.skybridge`), carrying
  a protocol version and a capability set: `{ ai, stream, image, fetch, bus, store, model, transport }`.
- A request/response channel (postMessage or a shared object) the generator calls; the
  userscript performs the privileged work (`GM_xmlhttpRequest`, `GM_setValue`/`getValue`,
  `GM_registerMenuCommand`, etc.) and replies.
- **Consent-gated:** prompt the user once before the bridge services a generator — a page
  script gaining network/storage powers it normally lacks is exactly what the sandbox is
  meant to prevent. Make it explicit and revocable.

> For cross-device **realtime/multiplayer** specifically, prefer Perchance's official
> `server-plugin` (WebSocket; see `platform.md` §6.4) rather than the bridge. The bridge is
> for what the sandbox *cannot* reach at all: arbitrary cross-origin hosts, an own-model AI,
> and durable storage beyond the quota.

**Capability detection on the generator side (degrade gracefully):**

```js
function caps() {
  var b = (window.weld && window.weld.skybridge) || null;
  return {
    bridge: !!b,
    ai:    !!(b && b.caps && b.caps.ai),     // own-model AI via the bridge
    fetch: !!(b && b.caps && b.caps.fetch),  // arbitrary cross-origin fetch
    bus:   !!(b && b.caps && b.caps.bus),    // pub/sub across tabs/peers
    store: !!(b && b.caps && b.caps.store)   // durable storage outside the quota
  };
}
// Then choose a transport: bridge bus → BroadcastChannel → superFetch polling → local-only.
```

**Own-model AI note.** When a bridge supplies its own AI model, options the native
`ai-text-plugin` ignores (notably `temperature`; see platform.md §3.8) *can* take effect on
the bridge path. Gate any such control to the bridge-present case — on the native model it is
inert, so surfacing it unconditionally is misleading. (Confirmed by threading a temperature
control end-to-end: it only changed output on the companion/own-model path.)

---

## 5 · Editor AI Lint Endpoint [MEASURED — editor]

The editor's copilot exposes a server-side bug-finder, authenticated by the editor's
**same-origin cookies** (no API key of your own):

```
POST https://editor-copilot.perchance.org/api/findBugsInCode
Content-Type: application/json
body: { code, contentType, generatorName }
```

- `code` — the pane text to analyse; `contentType` — which pane/kind; `generatorName` — the
  current generator. Cookies carry auth, so this only works from the editor origin (a
  userscript with the host in `@connect`, or same-origin `fetch`).
- **Response shape is not documented or stable.** Parse defensively: accept an array, or an
  object under any of `bugs` / `issues` / `results` / `problems`, or a plain string; log the
  raw payload and show it verbatim if the shape is unrecognised. Probe first, tighten later.
- This is an **editor** endpoint — distinct from the runtime brokers. It does not run the
  generator or its plugins; it only analyses source.

---

## 6 · Userscript Metadata & Grants (reference) [MEASURED — editor]

A companion that edits panes, calls the lint endpoint, talks to GitHub, and bridges
capabilities needs roughly this metadata block:

```
// @run-at      document-idle          // editor SPA globals exist by idle; still guard
// @noframes                           // top frame only — never run inside the generator iframe
// @match       https://perchance.org/*
// @match       https://*.perchance.org/*
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_deleteValue
// @grant       GM_listValues
// @grant       GM_xmlhttpRequest      // the cross-origin power the sandbox lacks
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
// @grant       unsafeWindow           // to read editor globals (userOwnsThisGenerator, etc.)
// @connect     editor-copilot.perchance.org
// @connect     api.github.com
// @connect     raw.githubusercontent.com
// @connect     perchance.org
// @connect     *                      // only if the bridge must reach arbitrary hosts
```

`GM_xmlhttpRequest` is the linchpin: it is what lets the companion fetch hosts (and sustain
the kind of relay/poll a generator's `superFetch` cannot — see platform.md §6.4) on behalf
of a generator that opts into the bridge.

---

## 7 · Checklist — Editor / Userscript Tools

- [ ] `@noframes` + top-frame guard — never execute inside the generator iframe
- [ ] Pane access behind a resolver that verifies `view.state.doc` and returns `null` on miss
- [ ] Insert via `view.state.replaceSelection(text)`, with a manual change-tx fallback
- [ ] Inserted snippet text obeys the brace-interception rules (dsl-and-plugins.md §4.3 /
      `SKILL.md` §0.5) — no bare `{word}` / `[word]` / `\u{...}` in HTML-pane string literals
- [ ] Ownership/save preflight is read-only (`userOwnsThisGenerator`, `#edit:collab=`,
      `localStorage` edit key) — no writes, no credentials
- [ ] `findBugsInCode` response parsed defensively (array | `{bugs|issues|results|problems}`
      | string), raw payload logged
- [ ] Bridge is consent-gated and revocable; generators degrade when it is absent
- [ ] Bridge-only options (e.g. `temperature`) gated to the bridge-present case
- [ ] No reliance on platform version history (there is none) — keep your own if needed
