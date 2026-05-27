# gen-tools — Generator Introspection & Remix Toolkit

A Perchance plugin that lets you read any generator's source code, inspect its
structure, search across lists, load remote generators at runtime, and
programmatically mutate the DSL tree.

---

## Installation

### 1. Create a new generator at [perchance.org](https://perchance.org)

### 2. Top Editor (DSL panel) — paste the contents of `gen-tools-dsl.txt`

This defines the plugin function and its two dependencies:
- `dynamic-import-plugin` — loads remote generators at runtime
- `super-fetch-plugin` — CORS proxy for API calls

### 3. HTML Panel — paste the contents of `gen-tools-html.txt`

This provides a minimal, customizable starter UI with:
- **Self-inspection** panel — shows your generator's own lists and source
- **Remote loader** — type any generator name, load & inspect it
- **Search** — search across all list items by keyword
- **Runtime mutation** — set, get, and delete root properties live

### 4. Save and run

The UI initializes after a 2-second delay (waits for plugins to load).

---

## Using as an Imported Plugin

Other generators can import gen-tools as a library:

```
genTools = {import:your-gen-tools-generator-name}
```

Then in HTML panel JavaScript:

```js
const gt = genTools();

// Inspect self
console.log(gt.source());       // full DSL source
console.log(gt.lists());        // all lists with metadata

// Load any public generator
let info = await gt.inspect("animal-generator");
console.log(info.lists);        // {[animal]: {length: 0}, ...}
console.log(info.imports);      // ["rpg-icon-plugin", "dice-plugin"]
console.log(info.source);       // raw DSL text

// Search across items
let hits = gt.search(null, "dragon");
// [{list: "creature", index: 3, item: "dragon"}, ...]

// Runtime mutation
gt.set("myVar", 42);
gt.get("myVar");                // 42
gt.del("myVar");                // true
```

---

## API Reference

### Self-Inspection

| Method | Returns | Description |
|--------|---------|-------------|
| `gt.source()` | `string` | Full DSL source of the current generator |
| `gt.meta()` | `object\|null` | The `$meta` block contents |
| `gt.moduleName()` | `string` | Generator slug (e.g. `"my-gen"`) |
| `gt.children()` | `object` | Raw DSL tree child nodes |
| `gt.lists()` | `object` | Map of list names → `{name, type, length, childNames, propertyNames, functionNames, rawText}` |

### Remote Loading

| Method | Returns | Description |
|--------|---------|-------------|
| `await gt.load(name)` | `object\|function` | Load & parse a generator via `dynamicImport`. Function plugins return a callable function; list generators return an object with `.getLength` on each list. |
| `await gt.exists(name)` | `boolean` | Check if a generator exists (lightweight API call) |
| `await gt.sourceOf(name)` | `string` | Fetch raw DSL source of any public generator (via `downloadGenerator?listsOnly=true`) |
| `await gt.inspect(name)` | `object` | Full breakdown: `{name, type, arity, source, lists, functions, imports, loadError}` |

### Runtime Mutation

| Method | Returns | Description |
|--------|---------|-------------|
| `gt.set(name, value)` | `any` | Create or overwrite a property on `root` |
| `gt.get(name)` | `any` | Read a property from `root` |
| `gt.del(name)` | `boolean` | Delete a property from `root` |
| `gt.has(name)` | `boolean` | Check if a property exists on `root` |

### Analysis

| Method | Returns | Description |
|--------|---------|-------------|
| `gt.listNames(tree?)` | `string[]` | Top-level list names (excluding `$`-prefixed). Pass a loaded tree or omit for self. |
| `gt.flatten(tree?)` | `object` | `{listName: [item1, item2, ...]}` — all items as flat string arrays |
| `gt.search(tree?, query)` | `array` | `[{list, index, item}]` — all items matching the query string |
| `gt.diff(treeA, treeB)` | `object` | `{onlyA, onlyB, both}` — list-level comparison of two trees |

---

## Customizing the UI

The HTML panel is designed to be modified. Key customization points:

### Theming — CSS variables at the top
```css
:root {
  --bg: #0c0e12;        /* page background */
  --surface: #14171d;   /* card background */
  --accent: #5bc0eb;    /* primary accent */
  --accent2: #9b72cf;   /* secondary (function badges) */
  --ink: #cdd5e0;       /* body text */
  --dim: #6b7a8d;       /* muted text */
  --font: 'DM Sans', system-ui;
  --mono: 'JetBrains Mono', monospace;
}
```

### Adding new cards
Copy the card HTML pattern:
```html
<div class="card">
  <div class="card-hdr"><h2>My Section</h2></div>
  <div class="card-body">
    <!-- your content -->
  </div>
</div>
```

### Extending the JS
The JavaScript is base64-encoded to bypass the Perchance DSL parser's
curly-brace interception. To edit it:

1. Decode: `atob("...")` → paste into a text editor
2. Edit the JS
3. Re-encode: `btoa(yourEditedJS)` in browser console
4. Replace the base64 string in the HTML panel

Or use a simpler approach — add a second `<script>` tag after the
base64 one with your custom code (keeping it free of `{word}` patterns):

```html
<script>
// This runs AFTER gen-tools initializes
// Avoid {import:...} or {word} patterns in string literals
setTimeout(function() {
  var gt = root.genTools();
  // your custom logic here
}, 3000);
</script>
```

---

## Technical Notes

- **Base64 encoding:** The HTML panel JS is base64-encoded because the
  Perchance DSL parser scans `<script>` content for `{...}` patterns before
  JS executes. Any `{word}` or `{import:x}` in string literals would be
  intercepted. Base64 hides the JS from the parser entirely.

- **`Object.keys(root)` is broken:** The root Proxy's `ownKeys` trap has a
  bug (doesn't include `prototype` for the function-based target). We use
  `root.$children` + `Object.keys()` instead for enumeration.

- **Boxed Strings:** `dynamicImport` and several plugin return values are
  boxed String objects, not primitives. Always use `String(x)` for comparison.

- **DSL→JS bridge:** DSL function return values are dropped when called from
  panel JS (`root.myFunc()` returns `undefined`). The `$output` function works
  across the bridge ONLY when accessed via an import alias
  (`gt = {import:gen-tools}` → `root.gt()` returns the API). For standalone use,
  the HTML panel builds its own API instance by accessing `root.$perchanceCode`,
  `root.$children`, `root.dynamicImport`, and `root.superFetch` directly — all
  of which ARE accessible from panel JS as property reads (not function calls).

- **`root.$perchanceCode`:** Returns the full DSL source of the *current*
  generator. For remote generators, use `gt.sourceOf(name)` which calls the
  `downloadGenerator` API endpoint.

- **Function vs Object plugins:** `dynamicImport` returns a function for
  function-plugins (e.g. `markdown-plugin` → `typeof result === "function"`)
  and an object for list-generators (e.g. `animal-generator` → object with
  list properties that have `.getLength`).
