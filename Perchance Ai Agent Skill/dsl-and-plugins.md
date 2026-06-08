# Perchance DSL & Plugin Authoring — Reference

A practitioner's reference for the **non-AI** side of Perchance: writing generators,
using the DSL's full templating power, accessing list internals from panel JavaScript,
and authoring or composing community plugins. For platform-level architecture and the
four core AI plugins, see [`platform.md`](./platform.md). For the AI character-chat
application patterns (data model, summaries, share links), see
[`ai-chat-app.md`](./ai-chat-app.md). For the full plugin catalog (~40 plugins by
category, with usage examples) and the pre-built word-list tier, see
[`platform.md` §22 and §23](./platform.md#22--community-plugins-catalog).

---

## 1 · The Two Editing Zones

Every Perchance page is a single HTML file with two editing zones in the editor:

```
┌──────────────────────────────────────┬──────────────────────────────────────┐
│  TOP EDITOR — Perchance DSL          │  HTML PANEL — standard HTML + JS     │
│                                       │                                       │
│  • lists, functions                   │  • templates: [list], [expr]          │
│  • plugin imports                     │  • <script>, <style>                  │
│  • $output, $meta                     │  • panel-side JS reads root.x         │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

The DSL is indentation-structured. The HTML panel is plain HTML except that anything in
square brackets `[…]` is evaluated as a Perchance template expression at page-render time
and on every `update()`.

**⚠ Curly-brace gotcha [VERIFIED R22]:** The DSL parser also scans the HTML panel —
including `<script>` content — for `{...}` curly-brace patterns. String literals like
`'{import:foo}'` or `'hello {world}'` will be intercepted as DSL commands. Regular JS
object literals `{}` are safe; only DSL-matching patterns (`{word}`, `{import:x}`,
`{A|B}`, `{1-10}`, `{s}`) cause problems. Fix by building such strings at runtime:
`String.fromCharCode(123) + 'import:foo' + String.fromCharCode(125)`, or base64-encode
the entire script: `<script>eval(atob("..."))</script>`.

---

## 2 · DSL Syntax Reference

### 2.1 Lists

```
listName
  item one
  item two
  another item
```

- Names: letters, digits, underscores. No spaces, hyphens, or JS reserved words. Can't
  start with a digit.
- Each child line is one *item*. The whole list is sampled by writing `[listName]` or
  `{listName}`.

### 2.2 Templating Inside Items

A list item is a *template string*. The engine resolves these constructs wherever they
appear inside an item:

| Construct | Meaning | Example |
|-----------|---------|---------|
| `[listName]` | Pick one item from `listName`. Standard inside the HTML panel. | `[animal]` |
| `{listName}` | Same, but conventional inside other list items. | `A {animal} ran by.` |
| `{a\|b\|c}` | Pick one of the inline choices. | `{small\|big\|huge}` |
| `{1-10}` | Random integer in the range, inclusive. | `{1-100}` coins |
| `{a-z}` / `{A-Z}` / `{0-9}` | Random character in range. | `id = {{a-z}\|{A-Z}\|{0-9}}` |
| `^N` | Weight multiplier on a list item (default `1`). | `worm^2` is twice as likely |
| `^[expr]` | **Dynamic** weight — JS re-evaluated on each pick. | `gift^[isBirthday ? 5 : 0]` |
| `{a}` / `{A}` | Auto-article — chooses "a"/"an" to match the next word. | `{A} apple` → `An apple` |
| `\s` | Blank line / paragraph break inside a list. | useful for markdown content |
| `\=` `\[` `\]` `\{` `\}` | Escape literal `=`, brackets, braces inside an item. | URLs need `\=` for query params |
| `// comment` | Line comment. Can appear at end of an item line. | `worm^2  // twice as common` |
| `a \|\| b \|\| c` (inside `[…]`) | Fallback chain — first existing/truthy value wins. | `[a.body \|\| "fur"]` |

**Property modifiers** chain after a list reference with `.`:

```
[animal.upperCase]          // PIG
[animal.titleCase]          // Pig
[animal.lowerCase]          // pig
[animal.pluralForm]         // pigs   (heuristic — fine for common nouns)
[animal.indefiniteArticle]  // "a pig" / "an apple"
[verb.pastTense]            // walked
[verb.futureTense]          // will walk
[animal.pluralForm.titleCase]  // chained
```

Built-in modifiers can be **overridden** by defining them as properties on your list —
useful for made-up words:

```
fizzwarble
  fizzwarbles
  pluralForm = fizzwarbles    // overrides the built-in heuristic
```

### 2.3 Functions

Single-line:

```
greet(name) => "Hello " + name
double(n) => n * 2
```

Multi-line (body indented under the signature):

```
formatPrice(cents) =>
  let dollars = (cents / 100).toFixed(2);
  return "$" + dollars;

async loadData(url) =>
  let response = await fetch(url);
  return await response.json();
```

Functions live alongside lists in the same namespace. `[formatPrice(599)]` works inside
templates; `root.formatPrice(599)` calls them from panel JS — but **return values do not
cross the DSL→JS boundary** (see [`platform.md` §7.3](./platform.md#73-dsl-functions--a-one-way-bridge)).
Use functions for templating-side composition; use panel JS when you need a value back.

### 2.4 Properties and Sub-Lists

A child line containing `=` defines a **property** of the parent list. A child line that
introduces *its own indented block* defines a **sub-list** (or sub-function):

```
character
  name = Chloe
  age = 28
  greet() => "Hi, I'm " + this.name
  hobbies
    reading
    hiking
    painting
```

Access:

```
[character.name]            // Chloe
[character.greet()]         // Hi, I'm Chloe
[character.hobbies]         // one random hobby
[character.hobbies.selectAll.length]  // 3
```

In panel JS, `root.character.name` is the string `"Chloe"`. `root.character.hobbies` is
a List object — see §3 below.

### 2.5 Anonymous Items — `*`

When a list's *items* are themselves objects (records with properties), use `*` to mark
each item. The `*` introduces an anonymous item whose properties are indented under it:

```
tabList
  *
    title = Overview
    content = This tab shows the {summary|overview}.
  *
    title = Details
    content = Detail content.
    default = true
```

`tabList.selectAll` then yields two items, each with `.title`, `.content`, and (for the
second) `.default` accessors. This is the canonical shape for plugins that consume an
*array of structured records* — `tabs-plugin`, `perchance-callouts`, comments-plugin
moderator lists, etc.

### 2.6 Imports

```
md       = {import:markdown-plugin}
tabs     = {import:tabs-plugin}
animal   = {import:animal}      // a plain word-list shared by another generator
fruit    = {import:fruit}

// dynamic / lazy:
optional
  Extras = [dynamicImport('some-generator-slug')]
```

- `{import:slug}` is loaded at page start. Required dependencies.
- `dynamicImport('slug')` is loaded on first use. Optional or large dependencies.

Imported names are now first-class lists/functions in your generator and can be referenced
exactly like local lists.

### 2.7 `$meta` and `$meta.dynamic`

```
$meta
  title       = My Generator
  description = What it does
  tags        = utility, text
  image       = https://...
  header
    mode = minimal       // hide the perchance navbar
```

`$meta.dynamic(inputs)` lets per-URL metadata vary based on URL parameters — for example,
giving every character in a chat app its own SEO card. **`$meta.dynamic` runs in an
isolated context and cannot reference `root.*` or any other list in your generator.**
Anything it needs must be duplicated inline (see [`platform.md` §2.3](./platform.md#23-metadynamic)
for the full pattern).

---

## 3 · List Property Accessors

`root.myList` returns a Perchance List object. These are the accessors you'll actually
reach for in panel JS or inline `[expr]` blocks. **For variable-assignment semantics, use
`selectOne`** — see §6 for why this matters.

**Selection & Evaluation:**

| Accessor | Returns | Notes |
|----------|---------|-------|
| `list.selectOne` | list item **object** | Pick one random item — returns a list item object, NOT a plain string. Use `String(list.selectOne)` or `list.evaluateItem` to get a string. Works with `[v = list.selectOne]` so `v` becomes a reference. |
| `list.selectMany(n)` | array of item objects | Pick `n` random items (may repeat). Chain: `list.selectMany(3).joinItems(", ")`. Two-arg `selectMany(min, max)` for variable count. |
| `list.selectUnique(n)` | array of item objects | Pick `n` *unique* items (no duplicates). Two-arg `selectUnique(min, max)` for variable count. |
| `list.selectAll` | array of item objects | Every item as a list item object. Iterate this. |
| `list.evaluateItem` | string | One random item, fully evaluated to a string. Use to freeze a random pick or force execution (see §6.4). |
| `list.joinItems(sep)` | string | Every item joined with separator, in declaration order (not random). Common: `$output = [this.joinItems("\n")]`. |
| `list.sumItems` | number or string | Adds all items. For string items, concatenates with leading `"0"`: `"0alphabravocharlie"`. |
| `list.replaceText(find, replace)` | string | Evaluates a random item with text replacement applied. |

**Metadata (all are properties, not methods — no `()` needed):**

| Accessor | Returns | Notes |
|----------|---------|-------|
| `list.getName` | string | List's own name: `"monitorTestList"`. |
| `list.getLength` | number | Number of top-level items. **This is a PROPERTY, not a method** — `list.getLength` not `list.getLength()`. |
| `list.getOdds` | number | Weight value (default `1`). |
| `list.getParent` | list object or null | Parent in the DSL tree. The generator root returns `null`. |
| `list.getSelf` | list object | The list itself with named children: `{alpha, bravo, charlie}`. |

**Structure (all are properties):**

| Accessor | Returns | Notes |
|----------|---------|-------|
| `list.getPropertyKeys` | string array | Names of `key = value` properties. Same as `getPropertyNames`. |
| `list.getPropertyNames` | string array | Synonym of `getPropertyKeys`. |
| `list.getChildNames` | string array | Names of child items: `["alpha","bravo","charlie"]`. |
| `list.getFunctionNames` | string array | Names of `name(args) =>` children. |
| `list.getAllKeys` | string array | Everything: properties + sub-lists + functions. |
| `list.getRawListText` | string | Raw DSL source with newlines: `"myList\n  alpha\n  bravo\n"`. |

**Cloning:**

| Accessor | Returns | Notes |
|----------|---------|-------|
| `list.consumableList` | list object | A copy whose items disappear as picked (like a deck of cards). |
| `list.createClone` | — | **Does NOT exist** on list objects despite appearing in some docs. Throws `"not a function"`. |

**Case Transforms (each picks a random item first, then transforms):**

| Accessor | Example output | Notes |
|----------|---------------|-------|
| `list.upperCase` | `"ALPHA"` | Random item uppercased. |
| `list.lowerCase` | `"alpha"` | Random item lowercased. |
| `list.titleCase` | `"Bravo"` | Random item title-cased. |
| `list.sentenceCase` | `"Bravo"` | Random item sentence-cased. |

**Grammar Transforms (each picks a random item first, then transforms):**

| Accessor | Example output | Notes |
|----------|---------------|-------|
| `list.pluralForm` | `"alphas"` | Appends `s` (basic English pluralization). |
| `list.singularForm` | `"alpha"` | Attempts singularization. |
| `list.presentTense` | `"alphas"` | Present tense (adds `s`). |
| `list.futureTense` | `"will alpha"` | Prepends `"will "`. |
| `list.pastTense` | — | **THROWS** `"PERCH is not defined"` in panel JS. Only works in the top editor context. |
| `list.negativeForm` | `"alpha"` | Currently a no-op for simple words. |

**String Conversion:**

| Accessor | Returns | Notes |
|----------|---------|-------|
| `list.toString()` | string | Evaluates to a random item string. |
| `list.valueOf()` | string | Same as `toString()`. |
| `list[i]` | string | Item at integer index. |
| `list["propName"]` | any | Property/sub-list by name (same as `list.propName`). |

> **Key insight:** Case and grammar transforms pick a **random item** each time they're
> accessed. Accessing `list.upperCase` twice may return different items. To freeze a
> specific item's transform, first `selectOne` then transform: `String(list.selectOne).toUpperCase()`.

### 3.1 Random Sub-List Pick

```
words
  common = {import:common-word}
  rare   = {import:rare-word}
  long   = {import:long-word}

rP(L) => L.getPropertyKeys[Math.floor(Math.random() * L.getPropertyKeys.length)]
output = A [words[rP(words)]] word.
```

Each render: pick one of `common`/`rare`/`long`, then pick one word from it.

### 3.2 Passing Verbatim Text to a Plugin

`markdown-plugin` will call `.getRawListText` for you if given a list, but if you want to
do it manually (e.g. drop the first 2 lines like `hub-external-card` does):

```
$output = [this.getRawListText.split("\n").slice(2).join("\n")]
```

This is the common idiom for "include the rest of this list as-is, without Perchance
trying to interpret the brackets".

### 3.3 Iterating With `selectAll`

```
team
  *
    name = Alice
    role = Engineer
  *
    name = Bob
    role = Designer

// HTML panel:
<ul>
  [team.selectAll.map(m => `<li><b>${m.name}</b> — ${m.role.evaluateItem}</li>`).join("")]
</ul>
```

Note: `m.role` is itself a List object until you ask for `.evaluateItem` or coerce with
`String(m.role)`.

---

## 4 · Inline JavaScript in DSL — `[expr]`

The square brackets are a JavaScript expression context. Anywhere a list item evaluates,
`[expr]` runs `expr` and substitutes the result:

```
output
  Today is [new Date().toLocaleDateString()].
  Pi is [Math.PI.toFixed(4)].
  You [score > 100 ? "win" : "lose"]!
  Mix me a {a|the} [drink.upperCase] — costs [formatPrice(599)].
```

Inside `[…]`:

- **DSL names are bare globals.** `animal`, `drink`, `formatPrice` resolve to the
  corresponding list/function.
- **`this`** is the current list object (useful in `$output = [this.getRawListText…]`).
- **JS globals are available** — `Math`, `Date`, `JSON`, `console`, `window`, `document`.
- **HTML element IDs are globals** — `myDiv.innerHTML = "..."` works without
  `getElementById`. See §5 below.

### 4.1 Side-Effect-with-Empty-Output Pattern

`[expr1, expr2]` evaluates left-to-right and emits the *last* operand. To run a side
effect and emit nothing, end with `''`:

```
lemmyFeed = perchance
mainLemmy = [lemmyFeed = 'perchance', '']  [homeLemmyCarousel()]
casualLemmy = [lemmyFeed = 'casual_perchance', ''] [homeLemmyCarousel()]
```

This is the production idiom from the Perchance Hub generator: clicking a different button
changes the DSL variable `lemmyFeed`, then the carousel reads it.

### 4.2 Dynamic Odds — `^[expr]`

`^[expr]` after an item makes its weight dynamic — re-evaluated on every roll:

```
gifts
  socks
  candy^2
  videoGame^[isBirthday ? 10 : 1]   // 10x more likely on a birthday
  car^[totalScore >= 100 ? 1 : 0]   // unavailable until score is high enough
```

### 4.3 The Reverse Direction — Brace Interception in HTML Panel Strings [VERIFIED R24]

The DSL parser doesn't just evaluate `[expr]` and `{expr}` in **DSL** contexts — it ALSO
scans the entire HTML panel source (including inside `<script>` tags) for the same
patterns, BEFORE JavaScript runs. This causes silent breakage when string literals in your
JS code happen to contain DSL-shaped patterns:

```js
// ❌ BREAKS — parser sees [vibrant] and tries to evaluate it as a list reference
let testPrompts = ['a [vibrant] colorful flower'];

// ❌ BREAKS — parser sees {import:my-plugin}
let docsText = 'Add {import:my-plugin} to your lists editor';

// ❌ BREAKS — parser sees {1F3B2} as a range/expression
let dice = '\u{1F3B2}';   // ES6 unicode escape

// ✓ FIX — backslash escape (JS treats \[ \{ as no-op, parser respects them as literal)
let testPrompts = ['a \[vibrant\] colorful flower'];
let docsText = 'Add \{import:my-plugin\} to your lists editor';

// ✓ FIX — surrogate pair instead of \u{...}
let dice = '\uD83C\uDFB2';

// ✓ FIX — runtime construction with String.fromCharCode / fromCodePoint
let dice = String.fromCodePoint(0x1F3B2);
let bracketChar = String.fromCharCode(91); // '['

// ✓ FIX — inject content via innerHTML at runtime (after parser has run)
el.innerHTML = '<code>literal {brace} text</code>'; // parser sees the JS source, not the runtime DOM
```

Patterns the parser intercepts in string literals:

| Pattern | Treated as |
|---------|------------|
| `{word}`, `{import:x}`, `{1-10}`, `{A\|B\|C}`, `{s}`, `{a}` | Curly template expression |
| `[word]`, `[A:B:N]`, `[A\|B]` | Square template expression |
| `\u{XXXXX}` (ES6 escapes inside strings) | The `{XXXXX}` portion as a curly expression |
| `&#123;`, `&#x7b;` (HTML entities) | **Decoded before scanning** — still triggers |

JS array indexing (`arr[i]`, `state.prompts[i]`) and object literals (`{x: 1}`) are
generally safe because they don't match the DSL pattern shape. Single-letter or numeric
indices, dot-prefixed access, and curly object literals with property-value pairs don't
look like template expressions to the parser.

The cleanest workflow when authoring HTML panel JS that needs to display DSL-syntax text
to the user: write the JS source with backslash-escaped braces, JS evaluates them as
literals, the parser leaves them alone, and the runtime content is what you want.

---

### Dollar-Prefixed Root Properties [VERIFIED R23]

The `root` object supports `$`-prefixed metadata properties:
- `root.$moduleName` → generator slug string (e.g. `"my-gen"`)
- `root.$meta` → object containing the `$meta` DSL block
- `root.$root` → circular reference to root itself
- `root.$children` → child nodes of the DSL parse tree
- `root.$perchanceCode` → **full DSL source code** of the generator

**Warning:** `typeof root === "function"` (not `"object"`). `Object.keys(root)`
throws due to a Proxy bug. Use `root.myList` access directly, never enumerate.

### dynamicImport Behavior [VERIFIED R23]

`root.dynamicImport(generatorName)` fetches a generator via
`getGeneratorsAndDependencies`, parses it with `createPerchanceTree`, and returns
the tree as an object. The return value depends on the generator type:
- **Function plugins** (e.g. `markdown-plugin`): returns a function with `length`
  indicating argument count.
- **List generators** (e.g. `random-color-generator`): returns an object where
  keys are top-level list names and values are list objects with `.getLength`.
- Sub-imports are automatically compiled (e.g. `dice-roller` imports `rpg-icon-plugin`
  and `dice-plugin`).

### Plugin Source Code Patterns (from 76-generator archive)

**Function plugins** (`$output(args) =>`) — the dominant pattern. Every plugin
that "does something" is a function. Key implementation patterns observed:

**Singleton initialization guard:**
```js
$output(args) =>
  if(!window.__alreadyInitialized12345) {
    window.__alreadyInitialized12345 = true;
    // one-time setup: add event listeners, create iframes, load scripts
  }
  // per-call logic
```
Used by: upload-plugin, background-audio-plugin, tap-anywhere-plugin,
layout-maker-plugin, locker-plugin, remember-plugin.

**Seeded PRNG** (seeder-plugin): Replaces `Math.random` globally with a
deterministic function. Uses xfnv1a hash (FNV-1a variant) + mulberry32 PRNG.
Supports `cache` and `forceUpdate` commands. `Math.random.toString` overridden
to return `""` so it stringifies cleanly in DSL.

**Tree traversal** (select-leaf-plugin, consumable-leaf-list-plugin,
select-all-leaves-plugin): Walk DSL trees using `selectAll` + `Object.keys(node).length === 0`
as the leaf test. consumable-leaf-list creates a stateful wrapper with cascading
exhaustion — consumed leaves propagate up to mark parent branches as exhausted.

**Instance freezing** (create-instance-plugin): Walks a DSL node, evaluates all
`= value` properties once, and freezes them. Sublists (no `=`) remain random.
`create-instances-plugin` is just `new Array(num).fill(0).map(_ => createInstance(list))`.

**Persistent state** (remember-plugin): Saves DSL variables AND input form values
to localStorage. Uses CSS selector paths (`getCssPath(el)`) as keys for form inputs.
Runs a `setInterval` to periodically persist. `@forget` command clears all and reloads.
`@inputs` command auto-saves/restores all `<input>`, `<select>`, `<textarea>` elements.

**kv-plugin internals:** Bundles idb-keyval v6.2.1 inline (minified). Proxy-based
store access: `kv.myStore.get(key)`. IndexedDB naming: `${storeName}-db-${moduleName}`.
12 methods: `get`, `has`, `getMany`, `entries`, `keys`, `values`, `set`, `setMany`,
`update`, `delete`, `deleteMany`, `clear`.

**Upload plugin internals:** Creates a hidden iframe to `upload.perchance.org/embed`,
pings it until `uploadEmbedIsReady`, then communicates via postMessage
(`anonUploadRequest` → `anonUploadResponse`). Result URL is a boxed String.
File host: `user.uploads.dev`. Deletion URLs expire after 3 days.

**Layout-maker-plugin:** Wraps `window.update()` to intercept layout area updates.
Saves original DSL content in a Map, re-evaluates on update. Uses CSS Grid with
named template areas.

**Live-activity-plugin:** Uses PubNub for real-time visitor counting. Source is
heavily obfuscated (8 different obfuscated switch cases for different PubNub keys).
Each case has unique pub/sub keys, suggesting multiple PubNub accounts for scaling.

**Literal-plugin:** Escapes `[]{}` with backslashes to prevent DSL interpretation.
`+html` mode additionally escapes `&<>"'` for safe HTML output.

**Tap-plugin:** Creates click-to-randomize spans. Stores list reference on `window`
with random ID. Returns object with `.html`, `.noTap`, `.noTapNoUpdate` variants.

**Text-to-speech-plugin:** Supports both one-shot and streaming text via
`ReadableStream`. Auto-splits text into sentences at 4+ sentences for granular
`stop()` tracking. Accepts `{text, voice, pitch, speed, delay, onSpoken}` options.

**Background-audio-plugin:** Embeds YouTube or SoundCloud. YouTube uses the
IFrame API (`window.onYouTubeIframeAPIReady`). Auto-plays on first click event.

**Tooltip-plugin:** Wraps Tippy.js with Perchance list interop — converts DSL
list options to Tippy options object via `getPropertyNames` iteration.

**Prompt2-plugin:** Async function that builds a modal form UI from a spec object.
Supports `select`, `text`, `textarea`, `checkbox` types. Returns user input as
structured data. Dark/light mode aware.

## 5 · The `update()` Global and HTML-ID Globals

### 5.1 Element IDs Are Globals

Every HTML element with an `id` is automatically a global variable named the same:

```html
<div id="myBox">old text</div>
<button id="myBtn">Change</button>
```

```js
// Anywhere in panel JS — no getElementById:
myBox.innerHTML = "new text";
myBox.style.color = "red";
myBtn.onclick = () => myBox.classList.toggle("highlight");
```

**Caveats.** Two elements with the same id collide on one global. An id matching a real
DOM API name (`name`, `length`, `top`, …) can shadow it. Treat the global as a convenience
for unique, named anchor elements — not a substitute for proper selectors when you have
collections of similar elements.

### 5.2 `update()` — Re-Render

`update()` walks the DOM and re-evaluates any element containing Perchance template
expressions:

```js
update()                  // re-render everything (what the page's randomize button calls)
update(myBox)             // re-render just one element + its subtree
update(myBox, otherDiv)   // re-render several
```

`update(element)` is the right primitive for "re-roll this one panel without disturbing
the rest of the page". Plugins occasionally hook `window.update` themselves — `tabs-plugin`
extends it so calling `update(myTabId)` re-evaluates the templates inside that specific
tab.

### 5.3 The `onLoad` Idiom for Async Imports

Plugins that load data asynchronously (`google-sheets-plugin`, `dynamicImport`) typically
expose an `onLoad` callback so you can target updates rather than re-rendering the world:

```
sheetsSettings
  urls
    https://docs.google.com/.../pub?output\=tsv
  onLoad() =>
    update(myList)        // refresh just this element
    update(otherWidget)   // and this one
```

Without `onLoad`, the default behavior is `update()` (full page re-render), which can be
jarring on a complex page.

---

## 6 · DSL Semantics — The Rules That Actually Matter

Three semantic rules govern almost all surprising Perchance behavior. They are easy to
miss because the surface syntax looks declarative — but the engine has runtime state, an
execution order, and an implicit difference between "mentioning" a list and "executing"
it.

### 6.1 `selectOne`, `selectMany`, and `evaluateItem`

A list is a *passive collection* of items. To get values out, you execute it:

| Method | Returns | Use |
|--------|---------|-----|
| `list.selectOne` | One random item, as a *reference* (suitable for variable assignment) | Pick one — the most common operation |
| `list.selectMany(n)` | An array of `n` random items | Pick a few |
| `list.selectAll` | An array of every item, each evaluated once | Iterate all |
| `list.evaluateItem` | One random item, fully evaluated to a string | Force execution when the list isn't the last operand in a `[…]` |
| `list[i]` | Item at integer index | Direct indexing |

`.selectOne` is the workhorse. Almost every non-trivial template uses it via variable
assignment (next subsection).

### 6.2 Variable Assignment in `[…]`

Inside `[…]`, `name = expr` creates a Perchance runtime variable that lives for the rest
of the current render and is readable from any later `[name]`:

```
output
  [w = word.selectOne] is a nice word. Do you also like [w]?
```

First bracket: picks a random word, stores it in `w`, **and prints it** (because a
`[…]` block always emits its last operand).

Subsequent `[w]`: reads the stored value. Without the assignment, two separate
`[word]` references would each randomize.

**Assign without printing** — terminate the bracket with `""`:

```
[w = word.selectOne, ""]                          // assigns, prints nothing
[a = dice("1d6"), b = dice("1d6"), c = a+b, ""]   // chain multiple assignments
```

A `[expr1, expr2, expr3]` block evaluates left to right and emits only the last operand.
`""` as the last operand suppresses output.

**Hierarchical pattern.** Variable assignment is the standard way to pick from a parent
list and sample from the chosen child:

```
race
  elf
    eyeColor = {green|emerald}
  human
    eyeColor = {blue|brown}

output
  A [r = race.selectOne] with [r.eyeColor] eyes.
```

`r` is a reference to the chosen sub-list, not its name. Reading `r.eyeColor` samples
from the eye-color list of the race that was actually picked.

### 6.3 Left-to-Right, Top-to-Bottom Execution

The engine reads list items and HTML-panel templates strictly left-to-right,
top-to-bottom. A `[v]` that appears *before* its `[v = …]` will read `undefined`. This
is the **#1 cause** of "[v] returned undefined" errors.

```
// WRONG — n is read before it is assigned:
output
  [n] said "My name is [n = name.selectOne]"

// RIGHT — assignment first:
output
  [n = name.selectOne] said "My name is [n]"
```

The same rule applies across lists:

```
output
  [n = name.selectOne] said "[say]"     // assigns n, then [say] runs
say
  My name is [n].                        // reads n — works
```

Reverse the order and it breaks.

In the HTML panel, elements render in document order. A variable assigned in the second
`<p>` cannot be read by the first `<p>`.

### 6.4 Mentioning a List ≠ Executing It

Subtle. `[init, ""]` does **not** execute `init` — it just mentions the name. Mentioning
has no effect.

A `[…]` block auto-executes a list reference only when the list is the **last** operand
in the block. So `[init]` executes; `[init, ""]` does not.

Three fixes:

```
// Option A — call .evaluateItem explicitly:
[init.evaluateItem, ""]Rest of the line...

// Option B — put the list as the last operand:
[someOtherWork(), init]

// Option C — single-line "random variable" shorthand:
//   `name = [single bracket]` creates a list whose ONE item is the bracket,
//   and merely mentioning `name` auto-executes the bracket each time:
init = [a=dice("1d6"), b=dice("1d6"), c=dice("1d6")]
output
  [init, ""]The rolls are stored in a, b, c.
```

The Option C shorthand creates what's sometimes called a "dynamic variable" — every
mention re-executes the bracket. It is **not** the same as a multi-line list.

### 6.5 Perchance `if/else`

Perchance has its own `if/else` syntax that lives **inside `[…]`** and uses **curly
braces** for the branches:

```
// Long-hand:
[if(cond) {outputThis} else {outputThat}]

// Chained:
[if(cond1) {a} else if(cond2) {b} else {c}]

// Short-hand (JS ternary, also works):
[cond ? a : b]
```

Inside `{…}` branches:

- **Bare names** refer to lists/variables: `{sad}` looks up the `sad` list.
- **Quoted strings** are literals: `{"Too bad"}` outputs the string.
- Forgetting the quotes is the most common error.

```
// WRONG — looks for a list named `perfect`, errors:
[if(t == 24) {perfect} else {terrible}]

// RIGHT:
[if(t == 24) {"perfect"} else {"terrible"}]
```

**Operators are JavaScript:** `<`, `>`, `<=`, `>=`, `==`, `!=`, `&&`, `||`, `!`. Use
`==` (not `=`) for comparison — single-equals is assignment.

**`if/else` in dynamic odds.** Same syntax, just inside `^[…]`:

```
fruit
  apple
  blueberries ^[if(c == "Jamie") {0} else {1}]    // Jamie is allergic
  watermelon
```

**Boolean-to-numeric coercion** in `^[…]`: `true` → `1`, `false` → `0`. So
`^[c != "Jamie"]` is `^1` when c isn't Jamie and `^0` when it is. For a custom weight,
multiply: `^[(t == 24) * 8]` gives `^8` when `t == 24`, else `^0`.

**Gotcha (from known-bugs):** `if/else` must be in its **own** bracket. Mixing with
comma-separated expressions in one bracket fails:

```
// WRONG:
[n = num.selectOne, if(n == 4) {"a"} else {"b"}]

// RIGHT:
[n = num.selectOne, ""][if(n == 4) {"a"} else {"b"}]
```

### 6.6 Dynamic Sub-List Referencing

To look up a sub-list whose name is *stored in a variable*, use `[…]` for the property
key — like JS bracket notation:

```
output
  My gender is [g = gender.selectOne] and my name is [names[g].selectOne].

gender = {female|male|non-binary^0.1}

names
  female
    Anita
    Jessica
  male
    Kalid
    Bob
  non-binary
    Airlie
    Riley
```

`names.g` would literally look for a child named `g` and fail. `names[g]` uses the
*value* of `g` as the key.

Chains, mixed access, concatenation:

```
world[a][b][c]                  // chain dynamic keys
world[a].country[b][c].town     // mix static and dynamic
thing[a + b]                    // concatenate variables
thing[a + "blah"]               // variable + literal
```

### 6.7 Self-Referential Lists for Loops

A list item that references its own list creates a loop, terminated by a dynamic-odds
condition:

```
battle
  [turn]<br>[status]<br>[battle] ^[character.hp > 0]
  It's over. ^[character.hp <= 0]
```

Each `[battle]` picks one item. The first item recurses; the second is the base case.
When HP drops, the dynamic odds flip and recursion stops.

**Escape hatch for runaway loops:** if you save a generator with an infinite loop, the
page freezes on visit. Append `#debugFreeze` to the URL to load the editor *without*
executing the code:

```
https://perchance.org/your-generator-name#debugFreeze
```

This is the only reliable recovery path.

### 6.8 `$preprocess` — Source-Code Transformation

`$preprocess(text) => …` transforms the raw source text of your generator before the
engine compiles it. Useful for custom shorthand syntax.

```
$preprocess(text) =>
  text = text.replaceAll(":smile:", "😊");
  return text;
```

A preprocessor *plugin* exports its transform via `$output`, then the consumer writes
`$preprocess = {import:smile-preprocessor}` at the top of their generator.

Notable: **`inline-dent-preprocessor`** (official) — adds inline property syntax to the
DSL.

### 6.9 Page Load Order

When a generator loads:

1. HTML panel content is inserted into the DOM. Inline `<script>` tags do **not** run yet.
2. All `<script>` tags execute in document order, top to bottom.
3. All `[…]` square blocks execute in document order, top to bottom, left to right within each line.

So variables set by `<script>` blocks are available to template `[…]` blocks. Variables
set by one `[…]` block are *not* available to a `[…]` block earlier on the page.

**Module scripts (`<script type="module">`)** behave differently:

- They have implicit `defer` and may run out of order with classic scripts.
- They **cannot reference DSL lists by bare name** — use `root.listName` instead.

```html
<script type="module">
  // WRONG:  let a = animal.selectOne;
  let a = root.animal.selectOne;
</script>
```

### 6.10 Global Variables and Utilities

| Name | What it is |
|------|------------|
| `generatorName` | Current generator's slug |
| `generatorPublicId` | Per-generator public ID (also visible in the sandbox hex subdomain) |
| `generatorLastEditTime` | Timestamp of last edit |
| `root` | Top of the Perchance tree — reach any top-level list as `root.x` |
| `update()`, `update(el)` | Re-render the page or one element |
| `createPerchanceTree(text)` | Compile a DSL string into a fresh tree at runtime |
| `window.ignorePerchanceErrors(callback)` | Run callback while suppressing Perchance error logs (for evaluating user-provided DSL) |
| `window.clearPerchanceErrors()` | Clear logged errors |

**Built-in modifier overrides.** You can override built-in modifiers like `pluralForm`
for made-up words by defining them as properties:

```
fizzwarble
  fizzwarbles
  pluralForm = fizzwarbles
```

---

### 6.11 Canonical Engine Gotchas (from the author's known-bugs page)

Straight from Perchance's own "Known Bugs/Gotchas" page — authoritative, and the root of
several surprises documented elsewhere in this skill:

- **HTML parsing gets priority.** The panel's `innerHTML` is set first; square/curly blocks
  are evaluated *afterward* in the text nodes. So you **cannot put HTML inside a `[…]` block
  in the HTML panel** — write `<` as `\u003c` (e.g. `\[p = "\u003cp>hi\u003c/p>"\]`), or
  build the markup in the DSL panel. This is the same mechanism behind the brace-interception
  in §4.3.
- **`if`/`else` needs its own square block.** `\[n = num.selectOne, if(n==4){"a"} else {"b"}\]`
  errors; split it: `\[n = num.selectOne, ""\]\[if(n==4){"a"} else {"b"}\]`.
- **Square blocks always evaluate before "returning."** `foo = \["hi {1-100}"\]` then
  `console.log(foo)` prints e.g. `"hi 87"`, not the raw template. For raw values use a
  function: `foo() => return "hi {1-100}"`.
- **`x = {[a]|[b]}` then `x.selectOne` yields plain text, not a list reference.** Use the
  `random-select-plugin` if you need the chosen *list* object back.
- **JS-function indentation is stripped in the lists (DSL) editor** — but NOT in the HTML
  panel. Put indentation-sensitive JS (template literals, significant whitespace) in the HTML
  panel, not in a top-editor function body.
- **Backslash escaping is non-standard.** `\s` → space, `\[` → literal `[`, but `\o` stays
  `\o` (the backslash is *not* removed before a non-escapable char), and a real backslash is
  `\\`. Escape stripping also differs between `<script>` tags and `[…]` blocks.
- **Object literals in a square block need parens:** write `\[({foo:1})\]`, not `\[{foo:1}\]`
  (otherwise `{…}` is read as a labelled statement).

## 7 · Plugin Authoring

A Perchance plugin is just another generator that defines a magic name: **`$output`**.

### 7.1 `$output` as a Function

The simplest form. `$output` is called when the importing generator writes
`myPlugin(args)`:

```
$output(opts) =>
  if(!opts) opts = {};
  let width = opts.width || 400;
  return `<div class="my-widget" style="width:${width}px">hello</div>`;

$meta
  title       = My Widget
  description = A small example plugin.
```

In another generator:

```
mw = {import:my-plugin-slug}

// HTML panel:
[mw({width: 600})]
```

### 7.1a Plugin `$output` Does NOT Auto-Run on Import [VERIFIED R24]

This is the trap that breaks every plugin that builds its API via window stashing.
Importing a plugin only makes its `$output` *available as a callable* — it does not
execute it. Until something calls it, no side effects run.

```
// In importer's DSL:
myPlugin = {import:my-plugin-slug}   // $output NOT executed yet

// In importer's panel JS — assumes $output already ran (it didn't):
if (!window.__myPlugin) {            // ❌ always falsy
  showError('plugin not loaded');
  return;
}
```

**The fix** (importer side): explicitly call the plugin's import alias to trigger
`$output`:

```js
function init() {
  // 1. Did the import succeed? Check the alias exists.
  if (typeof root === 'undefined' || typeof root.myPlugin !== 'function') {
    // Try again — plugins load asynchronously (2-5s typical)
    if (attempts < maxAttempts) return setTimeout(init, 300);
    return showError('plugin not imported');
  }

  // 2. Invoke $output explicitly — this is what was missing
  try {
    var api = root.myPlugin();
    pipe = window.__myPlugin || api;   // prefer the side-effect stash; fall back to return value
  } catch (e) {
    return showError('plugin failed to init: ' + e.message);
  }

  renderPage();
}
```

**The fix** (plugin author side): make `$output` idempotent so repeated calls are cheap,
and stash the API on `window` AND return it for both consumption patterns:

```
$output() =>
  // Return cached on subsequent calls
  if (window.__myPlugin) return window.__myPlugin;

  const api = {};
  api.greet = function(name) { return "hello " + name; };
  // ... build API ...

  window.__myPlugin = api;  // side-effect for panel JS that reads window
  return api;               // return value for callers that use root.myPlugin()
```

This works whether the importer's HTML panel checks `window.__myPlugin` OR captures the
return of `root.myPlugin()` — and repeated calls (e.g. multiple example demos on one
page) are O(1).

### 7.2 `$output` as a Block

When a plugin wants to expose multiple named helpers rather than one entry point, define
`$output` as a block with indented sub-functions / sub-lists. The caller addresses them
with dots:

```
$output
  commandBar(pos) =>
    return `<table class="bar" data-pos="${pos}">…</table>`;

  credit(url) =>
    return `<div class="attrib">Made by <a href="${url}">${url}</a></div>`;

  defaults
    fontSize = 14
    padding = 8

  _aaa(x) => return x   // private helper — leading underscore by convention
```

In the importer:

```js
[mw.commandBar('top')]
[mw.credit('https://example.com')]
[mw.defaults.fontSize]
```

### 7.3 Globals Available to Plugin Code

| Name | What it is |
|------|------------|
| `window.generatorName` | The current generator's slug (the importing generator's slug, when the plugin is invoked). Useful for namespacing globals, building "back to source" links, error messages. |
| `root` | The DSL bridge (one-way — return values from DSL→JS are dropped; see [`platform.md` §7](./platform.md#7--the-root-proxy)). |
| `update()`, `update(el)` | Page rerender. |
| `console`, `fetch`, `document`, etc. | All standard browser globals. |

### 7.4 One-Time CSS Injection

Inject styles once, even if your `$output` function is called dozens of times:

```js
if(!window.__alreadyAddedFooCSS_84729374) {
  let style = document.createElement('style');
  style.innerHTML = `
    .foo-widget { padding: 1em; border: 1px solid #ccc; }
    .foo-widget:hover { background: #f6f6f6; }
  `;
  document.head.appendChild(style);
  window.__alreadyAddedFooCSS_84729374 = true;
}
```

The random numeric suffix prevents collisions if multiple plugins independently choose
flag names like `__alreadyAddedCSS`.

### 7.5 Backwards-Compatible Versioning — `@version1`

The idiomatic pattern for evolving a plugin without breaking older consumers: take a
**version sentinel** as the last argument and branch on it.

```
$output(parent, settings, version) =>
  if(version === "@version1") {
    // old behavior — settings was a URL string
    let url = settings;
    return loadFromUrl(parent, url);
  } else {
    // new behavior — settings is an object with .urls and .onLoad
    return loadFromObject(parent, settings);
  }
```

Old consumers explicitly pass `"@version1"` to keep the old shape; new consumers omit it
and get the new behavior. The plugin author can iterate the API as `@version2`,
`@version3`, … without breaking deployed generators.

### 7.6 Channel-Scoped Iframes

Plugins that embed third-party iframes (whiteboards, chats, drawing tools) typically
namespace per-generator + per-channel to avoid collisions:

```js
const url = `https://example.com/r/perchance-${window.generatorName}-${channel}`;
```

This guarantees two unrelated generators using the same plugin with the same `channel`
name don't share state.

### 7.7 Lazy Iframe Loading

Defer the heavy iframe load until the element is actually in view, using
`IntersectionObserver`:

```js
const observer = new IntersectionObserver(entries => {
  if(entries[0].isIntersecting) {
    placeholderEl.outerHTML = `<iframe src="${url}" …></iframe>`;
    observer.disconnect();
  }
});
observer.observe(containerEl);
```

Pattern from `tldraw-plugin`. Cuts page-load cost for content below the fold.

### 7.8 Hooking `window.update`

When you want `update(myElement)` to do something special (re-render the contents of a
plugin-managed widget), wrap the global once:

```js
if(!window.__pluginUpdateHookInstalled) {
  const originalUpdate = window.update;
  window.update = function(...args) {
    originalUpdate.bind(window)(...args);
    if(args[0]?.dataset?.belongsToMyPlugin) {
      // do post-update work for our element
      myCustomRefresh(args[0]);
    }
  };
  window.__pluginUpdateHookInstalled = true;
}
```

Pattern from `tabs-plugin`. Adds a hook without removing the page's default `update`
behavior.

### 7.9 Recommended `$meta` for Plugins

```
$meta
  title       = My Plugin
  description = One-line description shown on /plugins and in search.
  tags        = ui, formatting, helper
  // image     = optional preview image
```

Plugin pages also have an HTML panel — that's where you put your documentation, demo, and
examples. Visitors landing on `perchance.org/my-plugin` see the rendered HTML panel; the
top editor is shown when they click "edit".

---

## 8 · Putting It Together — A Minimal Plugin Example

A complete, copy-pasteable plugin that wraps text in a colored box and supports a `color`
option:

**Top editor (DSL):**

```
$meta
  title       = Colored Box Plugin
  description = Wrap content in a colored box. Pass {text, color}.
  tags        = formatting, ui

$output(opts) =>
  if(!opts) opts = {};
  let text  = opts.text  || "(no text)";
  let color = opts.color || "#3b82f6";

  // one-time CSS injection:
  if(!window.__cbpStyleAdded_84729374) {
    let s = document.createElement('style');
    s.innerHTML = `
      .cbp-box {
        display: inline-block;
        padding: 0.6em 1em;
        margin: 0.4em 0;
        border-radius: 6px;
        color: white;
        font-weight: 600;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      }
    `;
    document.head.appendChild(s);
    window.__cbpStyleAdded_84729374 = true;
  }

  return `<span class="cbp-box" style="background:${color}">${text}</span>`;

// Demo content for the plugin's own HTML panel:
demoText
  This is the **Colored Box** plugin.
  Pass it `{text, color}` and you'll get a colored box back.
```

**HTML panel** (the plugin's own demo page):

```html
<h1>Colored Box Plugin</h1>
<p>Demo:</p>
<p>[$output({text: "Hello, world!", color: "#3b82f6"})]</p>
<p>[$output({text: "Warning", color: "#ef4444"})]</p>
<p>[$output({text: "Success", color: "#10b981"})]</p>

<p>To use this in your own generator:</p>
<pre>
cbp = \{import:colored-box-plugin-slug\}

// In your HTML:
\[cbp(\{text: "your content", color: "#7c3aed"\})\]
</pre>
```

Save the generator, then any other generator can import it and call `cbp({text, color})`.

---

## 9 · Cheat Sheet

```
LIST                              FUNCTION
listName                          name(args) => expr            // single-line
  item                            async name(args) =>           // multi-line
  item                              statements
                                    return value

PROPERTY (= sign)                 SUB-LIST (indented block)
  key = value                       subListName
                                      child item
                                      child item

ANONYMOUS ITEMS                   IMPORTS
listOfRecords                     name = {import:slug}          // eager
  *                               lazy = [dynamicImport('slug')] // on demand
    field1 = ...
    field2 = ...

TEMPLATING                        ESCAPES
{a|b|c}     random choice         \=  literal =     \s   blank line
{1-10}      random int            \[ \]  literal brackets
{a-z}       random char range     \{ \}  literal braces
{A-Z} {0-9} (any range)           \\  literal backslash
^N          weight                // comment        line comment
^[expr]     dynamic weight        a || b   fallback (a if exists, else b)
{A} {a}     auto-article

VARIABLES (inside [...])          SAMPLING
[v = list.selectOne]              .selectOne          one item (reference)
[v = list.evaluateItem]   freeze  .selectMany(n)      n items (may repeat)
[v = expr, ""]   assign+silent    .selectMany(min,max) random count
[v = a, w = b, v+w]   chain       .selectUnique(n)    n unique
[v]              read later       .selectUnique(min,max)
                                  .selectAll          all items
PERCHANCE IF/ELSE                 .evaluateItem       fully evaluated string
[if(cond) {a} else {b}]           .joinItems(sep)     join all (decl order)
[if(c) {a} else if(d) {e}         .consumableList     deck-of-cards copy
       else {f}]                  .createClone        non-destructive copy
[cond ? a : b]   (ternary works)

DYNAMIC SUB-LIST                  ACCESSORS (cont.)
names[g].selectOne                .getRawListText  source text
world[a][b].country               .getName / .getName()
                                  .getParent / .getParent()
INLINE JS in [expr]               .getLength()  .getOdds()
[expr]   run JS                   .getPropertyKeys (no parens — getter)
[a, b, '']   side fx + empty      .getChildNames .getFunctionNames

GLOBALS in inline JS              PAGE FUNCTIONS
  listName     — DSL list           update()         re-render all
  funcName     — DSL function       update(element)  re-render one
  myDivId      — element id=...
  generatorName, generatorPublicId, generatorLastEditTime,
  root, createPerchanceTree(text), update,
  ignorePerchanceErrors, Math, Date, JSON, document, ...

PLUGIN MAGIC NAMES                EXECUTION ORDER (critical!)
$output(args) => return ...       Left-to-right, top-to-bottom.
$output                           [v] BEFORE [v = ...] reads undefined.
  fnName(args) => ...
  property = value                MENTION ≠ EXECUTE
$meta                             [init, ""] does NOT run init.
  title = ...                     Use [init.evaluateItem, ""] or
  description = ...               put init as the LAST operand.
$preprocess(text) =>
  return modifiedText             ESCAPE HATCH
                                  perchance.org/myGen#debugFreeze
                                  ↑ load editor without running code
VERSIONING                          (recovers from saved infinite loops)
$output(a, opts, version) =>
  if(version === "@version1") {   ONE-TIME GUARD (one-time CSS injection)
    /* old behavior */            if(!window.__addedX_NNN) {
  } else { /* new */ }              /* do once */
                                    window.__addedX_NNN = true;
SELF-REF LOOPS                    }
battle
  [turn][battle] ^[hp > 0]
  Game over. ^[hp <= 0]
```

