---
name: perchance-api
description: >
  Use this skill whenever working with Perchance.org — building generators, AI chat apps, plugins,
  or any JavaScript code that runs on perchance.org. Covers the Perchance DSL syntax including
  `$preprocess` for source transformation, `$output` for import-time list overriding, the full
  list-property API (selectOne, selectMany, selectUnique, consumableList, evaluateItem, joinItems,
  pluralForm, titleCase, getName, getParent, getChildNames, getPropertyNames, getFunctionNames,
  getAllKeys, getRawListText, getOdds, getLength, createClone), the `this` keyword for modular
  hierarchies, function syntax including async, if/else (long-form, JS-form, ternary), inline
  lists `{a|b|c}` and `{1-100}`, static `^N` and dynamic `^[expr]` odds, comma-in-square-blocks
  for hidden side-effects, page load order with the module-script `root.<list>` rule, runtime
  globals (generatorName, generatorPublicId, generatorLastEditTime), `createPerchanceTree(text)`,
  `window.ignorePerchanceErrors`/`clearPerchanceErrors`, and dynamic page-state mutation via
  `document.title`/`window.location.hash`/`history.replaceState`. Covers the ai-text-plugin API,
  text-to-image plugin, the Perchance HTTP API toolkit (getGeneratorScreenshot, getGeneratorList,
  getGeneratorStats, downloadGenerator, getGeneratorsAndDependencies, generateList.php), the
  DIY/self-hosted JSDOM pattern with `__cacheBust`, and the critical fact that **ai-text-plugin
  and text-to-image-plugin are origin-locked to perchance.org and won't work on self-hosted forks
  or downloaded HTML**. Covers secret-plugin for quantum-resistant client-side encryption,
  text-editor-plugin-v1 for high-performance styled textareas with inline AI completion and Yjs
  collaboration, character/thread/message data models, IndexedDB (Dexie.js) patterns, hierarchical
  summarization, lorebooks, memory systems, streaming responses, sandboxed custom code,
  share-link/upload patterns including the hash-share fallback for forked deployments, upload-plugin
  domain-allowlist mitigation, the `expires`+`deletionUrl` upload options, embedding via
  `null.perchance.org/<name>`, the download-button-plugin, offline-edit by appending `#edit` to
  a downloaded HTML's URL, AI runtime sentinels for letting the AI drive scene/runtime side-effects,
  and natural-language wizard skips. Trigger this skill for any mention of perchance, ai-text-plugin,
  perchance generator, ai-character-chat, or building a Perchance-hosted AI app. Also trigger when
  the user shows code that uses `root.aiTextPlugin`, `root.textToImagePlugin`, `root.uploadPlugin`,
  `root.secret`, `superFetch`, `secret.generateKeyPair`, `createTextEditor`, `generateList.php`,
  `getGeneratorList`, `$preprocess`, `$output`, `selectUnique`, `selectMany`, `consumableList`,
  `evaluateItem`, `getParent`, `getName`, `createPerchanceTree`, `null.perchance.org`,
  `__cacheBust`, JSDOM, Perchance list syntax, the `{import:...}` pattern, `[BG:type]` /
  `[VIZ:type]` / `[PAUSE n]` markers, hash-share URLs like `#cfg=` / `#persona=`, or
  `PUBLIC_…_PUBLIC_END` / `PRIVATE_…_PRIVATE_END` key envelopes. Trigger when seeing the upload
  error "Forbidden: This API Key is locked to specific domains" or the complaint
  "ai-text-plugin doesn't work on my server / fork / download".
---

# Perchance API & AI Chat Skill

This skill encodes the complete architecture of a production Perchance AI chat application, distilled
from real source code. Use it to build, debug, or extend any Perchance-hosted generator or AI app.

---

## 1 · Perchance DSL Fundamentals

Perchance pages have two zones: the **top generator** (Perchance DSL) and the **HTML panel** (standard HTML/JS).

### 1.1 List Syntax (top editor)
```
listName
  item one
  item two
  {nestedList}         // embed another list by name
  {import:plugin-name} // import a plugin

// Calling a function defined in a list:
result = root.myFunction(arg1, arg2)
```

### 1.2 Async Functions in Lists
```
async myFunction(opts) =>
  if(!opts) opts = {};
  let result = await someAsyncThing();
  return result;
```
- **All lines are auto-dedented** inside list functions — if you move code to a `<script>`, re-add indentation manually.
- Access sibling list items/functions via `root.listName` or `root.functionName()`.

### 1.3 Key Built-in Plugins (imported at top)
```
loadDependencies = {import:ai-character-chat-dependencies-v1} // bundles Dexie.js, DOMPurify, etc.
aiTextPlugin = {import:ai-text-plugin}
textToImagePlugin = {import:text-to-image-plugin}
uploadPlugin = {import:upload-plugin}          // for character share links
superFetch = {import:super-fetch-plugin}        // bypass CORS
commentsPlugin = {import:comments-plugin}
tabbedCommentsPlugin = {import:tabbed-comments-plugin-v1}
fullscreenButtonPlugin = {import:fullscreen-button-plugin}
combineEmojis = {import:combine-emojis-plugin}
bugReport = {import:bug-report-plugin}          // browser debug info for bug reports
dynamicImport = {import:dynamic-import-plugin}  // lazy-load other generators at runtime
secret = {import:secret-plugin}                  // quantum-resistant client-side encryption
literal = {import:literal-plugin}                // allow [] / {} in user-supplied strings
createTextEditor = {import:text-editor-plugin-v1} // higher-perf <textarea> with styling
faviconPlugin = {import:favicon-plugin}          // dynamic favicon swap
bugReportPlugin = {import:bug-report-plugin}     // alias used in some generators
dice = {import:dice-plugin}                      // dice("1d6"), dice("2d6+3") notation
downloadButton = {import:download-button-plugin} // adds a "download as HTML" button
randomSelect = {import:random-select-plugin}     // pick which LIST (not item) to draw from
createInstance = {import:create-instance-plugin} // template/instance pattern for entities
makeTable = {import:make-table-plugin}           // build HTML tables from list data
selectLeaf = {import:select-leaf-plugin}         // selectOne but always reaches a leaf node
```

### 1.4 `dynamicImport` — Lazy Loading External Generators
Use `dynamicImport` to load another Perchance generator's lists at runtime, avoiding page-load cost:
```
customBots
  FreemanBots = [dynamicImport('sjjhkyohfs')]
  BegginnerBots = [dynamicImport('7876aw570s')]
```
Equivalent static import (loads at page start, not lazy):
```
// FreemanBots = {import:sjjhkyohfs}
```
Use `dynamicImport` for optional/large dependencies; use `{import:...}` for required dependencies.

### 1.5 Meta / SEO
```
$meta
  header
    mode = minimal
  async dynamic(inputs) =>      // MUST be fully self-contained — no outside refs
    let urlParams = inputs.urlParams;
    return { title: "...", description: "...", image: "..." };
```

**Critical `$meta.dynamic` constraint:** This function cannot reference `root.*`, other lists, or
any global variables defined outside itself. If your generator uses a `urlNamedCharacters` list,
you must **duplicate the mapping inline** inside `$meta.dynamic` — it cannot read the list:
```
// Top list:
urlNamedCharacters
  ai-adventure = 6c2f68e41de41e75a51971487c97b2d9.gz
  therapist = 5cdaa39f9aabc7424c3b2e1b780a1e29.gz
  // NOTE: must add named chars to $meta.dynamic too

// $meta.dynamic — must re-declare the same map:
async dynamic(inputs) =>
  let urlNamedCharacters = {         // can't use root.* — duplicate it here
    "ai-adventure": "6c2f68e41de41e75a51971487c97b2d9.gz",
    "therapist": "5cdaa39f9aabc7424c3b2e1b780a1e29.gz",
  };
  let fileName = urlNamedCharacters[inputs.urlParams.char];
  ...
```

### 1.6 List Properties (selection, evaluation, introspection)

Every list on Perchance has a small "API" of dotted properties. The selection ones are the workhorses:

| Property | Behavior |
|---|---|
| `list.selectOne` | Single random item. Square blocks `[list]` apply this implicitly. |
| `list.selectMany(n)` | Array of `n` items, **duplicates allowed**. |
| `list.selectUnique(n)` | Array of `n` items, **never the same item twice**. |
| `list.selectUnique(min, max)` | Random count between min and max, all unique. |
| `list.consumableList` | Returns a *copy* of the list that removes items as they're chosen. Persists across multiple uses — set it once, then each `[cl]` consumes one. |
| `list.joinItems(sep)` | Joins a `selectMany`/`selectUnique` array into a string. |
| `list.evaluateItem` | Selects + fully evaluates inline lists (`{red\|pink}`) before returning. Use this when storing into a variable. |
| `list.pluralForm` | Plural-form selection. Override per-item if Perchance's heuristic is wrong. |
| `list.titleCase` | Title-cased selection. |

Introspection / hierarchy:

| Property | Returns |
|---|---|
| `list.getName` | The list's own name (the leaf identifier in the DSL). |
| `list.getParent` | The parent list (walks up the hierarchy). |
| `list.getChildNames` | Names of direct children. |
| `list.getPropertyNames` | Names of property-style children (e.g. `height` in `person.height = …`). |
| `list.getFunctionNames` | Names of function-style children. |
| `list.getAllKeys` | Everything — children + properties + functions. |
| `list.getRawListText` | The raw DSL source of the list (pre-evaluation). |
| `list.getOdds` | The currently-effective odds value of an item (after dynamic-odds evaluation). |
| `list.getLength` | Number of items in the list. |
| `list.createClone` | A fresh copy you can mutate independently of the original. |

Globals available inside any list/function:
- `generatorName` — the URL slug (`perchance.org/<this>`)
- `generatorPublicId` — the random-looking public ID
- `generatorLastEditTime` — epoch ms of last save
- `root` — the top of the Perchance tree (root of all lists)

### 1.7 The `this` Keyword and `getParent` (Modular Hierarchies)

Inside a list item, `this` refers to the **parent of the current item** (not a JS-style "self"). This lets you write self-contained, renameable hierarchies:

```
person
  height = {100-200}
  eyeColor = {brown^3|blue|grey^0.2|green^0.3}
  description = The person is [this.height]cm tall with [this.eyeColor] eyes.
```

`description` doesn't reference `person` by name — rename `person → human` and nothing breaks. To climb further, chain `.getParent`:

```
cake
  flavor = {strawberry|dark chocolate|vanilla}
  description
    A tasty [this.getParent.flavor] cake.
```

`.getName` is great for descriptive output without hardcoding labels:

```
animal
  mammal
    mouse
      description = a [this.getName] is a type of [this.getParent.getName]
```

### 1.8 The `$output` Keyword (overriding what a list "is")

By default, when you `{import:my-gen}` from another generator, the importer gets a random *top-level list name* (`"animal"`, `"adjective"`, ...). To make `{import:my-gen}` return something useful, define `$output`:

```
$output = [description]   // {import:my-gen} now returns a random description

description
  It's {a} [adjective] [thing] that looks {10-70} years old.
adjective
  ...
thing
  ...
```

`$output` also works *inside* a list to combine its multi-line items into a single string:

```
output
  $output = [this.joinItems("")]
  [d = dice.selectOne, n = name.selectOne, ""]
  [if(name == "Sae") {d = d*2, ""} else {""}]
  [name] attacked and dealt [d] damage.
```

The function form is `$output(text) => ...; return text;` — used by **preprocessors** (see 1.13).

### 1.9 Comma-in-Square-Blocks Pattern

Square blocks emit only their **last expression**. Earlier expressions execute for side-effects only:

```
[a = animal.selectOne, ""]                    // assigns a, outputs nothing
[a = animal.selectOne, b = a.pastTense, c = a.futureTense]  // outputs c only
[a = animal.selectOne, "blah blah blah"]      // outputs the literal string
```

This is the standard idiom for "run code without printing it". Functions don't need this trick — they hide all statements by default and only output what's after `return`.

### 1.10 Function Syntax

```
calculateDamage() =>
  d = dice.selectOne
  if(n == "Sae") {
    d = d * 2
  } else if(n == "Jin" && d <= 2) {
    d = d + 2
  }
  return d
```

- Arguments separated by commas: `getAnimals(num, joiner) => return animal.selectMany(num).joinItems(joiner)`
- Async: `async doThing(a, b) => ... await ... return ...`
- Treat the call site like any value: `[d = calculateDamage()]`, `[d > 5 ? "high" : "low"]`
- **Indentation inside list-editor functions is stripped** (see 1.14 gotchas). HTML-panel `<script>` functions keep theirs.

### 1.11 If/Else and Ternary

Three forms — all equivalent. Pick whichever is least painful:

```
[if (n < 4) {sad} else {happy}]                  // long form
[if (n < 4) sad ;else happy]                     // JS-style (note ;else)
[n < 4 ? sad : happy]                            // ternary
```

**Critical rule: if/else must occupy its own square block.** This won't parse:

```
[n=num.selectOne, if(n==4) {"a"} else {"b"}]     // ❌ syntax error
```

Split it:

```
[n=num.selectOne, ""][if(n==4) {"a"} else {"b"}] // ✅
```

Inside the curly branches, refer to lists/variables **without** brackets, and quote literal text:

```
[if(c == "blue") {sad} else {happy}]   // ✅ — sad/happy are list refs, "blue" is literal
[if([c] == blue) {[sad]} else {[happy]}] // ❌ — brackets around list refs, no quotes around literal
```

### 1.12 Inline Lists and Dynamic Odds

Inline lists are anonymous one-liners using `{a|b|c}` or `{1-100}`:

```
eyeColor = {brown^3|blue|grey^0.2|green^0.3}    // static odds via ^
score = {1-4}                                    // numeric range
size = {{tiny|small}|{huge|massive}}             // nested
```

`^N` static odds: `^3` = 3× weight, `^0.2` = 1/5× weight. **Dynamic odds** wrap the weight in square brackets so it re-evaluates per selection:

```
adjective
  not great ^[s == 1]      // only selectable when s==1
  good      ^[s == 2]
  great     ^[s > 2]
```

Combine with sub-list selection for "if/else by data":

```
shade
  blue ^[c == "blue"]
    cyan
    navy blue
  red ^[c == "red"]
    maroon
    cherry
```

### 1.13 `$preprocess` (Code Transformation Before Compilation)

`$preprocess` is a function at the top of a generator that transforms the raw source text before Perchance parses it. Define it inline or import a community preprocessor:

```
// Inline — replace :smile: with 😊 everywhere:
$preprocess(text) =>
  text = text.replaceAll(":smile:", "😊");
  return text;

// Or import:
$preprocess = {import:inline-dent-preprocessor}
```

To create a *shareable* preprocessor, make a generator whose top-level is `$output(text) => ... return text;`. Other people import it via `$preprocess = {import:your-preprocessor-name}`.

Official + community preprocessors worth knowing:
- `inline-dent-preprocessor` — official; lets you write properties inline
- `inferno-shorthand-preprocessor-v1` — community shorthand syntax
- `eatham-emoji-preprocessor-v1` — text → emoji substitution

### 1.14 Page Load Order & Module Script Caveat

Per-page execution sequence:
1. HTML is added to the page (script tags **not yet** run).
2. All `<script>` tags execute top-to-bottom.
3. All square blocks in the HTML execute top-to-bottom, left-to-right within each line.

Inside a single list, the same left-to-right rule applies — `[n] said "[say]"` will fail if `[say]` is what assigns `n`. Reorder so the variable is created before it's used.

**`<script type="module">` exception:** module scripts have implicit `defer` and can use top-level `await`, so they run *after* DOM parsing but their relative order isn't guaranteed. Crucially, **inside a module script you cannot reference Perchance lists by bare name** — you must go through `root`:

```html
<script type="module">
  // ❌ animal.selectOne   — undefined inside a module script
  // ✅ root.animal.selectOne
  let pick = root.animal.selectOne;
</script>
```

### 1.15 Runtime Helpers: `update`, `createPerchanceTree`, error suppression

```js
update();                                  // re-evaluates all square blocks in HTML
                                            // — does NOT clear variables or reset state
let tree = createPerchanceTree("name\n\tbob");
console.log(tree.name);                    // "bob"
// Caveat: if your text uses {import:foo}, you must ALSO have {import:foo}
// somewhere in the host generator so the data is preloaded.

window.ignorePerchanceErrors(() => { /* code that might throw */ });
window.clearPerchanceErrors();             // clear the in-page error log
```

### 1.16 Dynamic Page-State Mutation

These work as expected from inside a generator (despite running in an iframe):

```js
document.title = "New title";
window.location.hash = "#chapter-2";
history.replaceState({}, "", `/${generatorName}?foo=123`);
```

You **cannot** change the URL pathname (the `generatorName` part) — that's blocked to prevent spoofing other generators.

### 1.17 User-Side CSP

Viewers can opt into Content Security Policy enforcement on any generator by appending `?$csp` to the URL. Useful when reviewing a fork before trusting it with credentials or external requests.

---

## 2 · `ai-text-plugin` API  ← Core AI generation

```js
// Basic call (non-streaming):
let data = await root.aiTextPlugin({
  instruction: "System context + task description",
  startWith: "Text the AI will continue from",
  stopSequences: ["\n\n[[", "\n[["],
  hideStartWith: true,   // don't echo startWith back in generatedText
});
let text = data.generatedText;    // string
let stopReason = data.stopReason; // "stop_sequence" | "max_tokens" | "error"

// Streaming call:
let streamObj = root.aiTextPlugin({
  instruction,
  startWith,
  stopSequences,
  hideStartWith: true,
  onChunk: (data) => {
    if(data.isFromStartWith) return;   // skip echo of startWith
    let chunk = data.textChunk;        // string delta
    // update UI here
  },
});
streamObj.stop(); // call to abort early
let finalData = await streamObj;      // resolves when complete

// Preload (warm up inference engine):
// On mobile, delay preload to avoid slowing page load:
if(window.innerWidth < 500) setTimeout(() => root.aiTextPlugin({preload:true}), 5000);
else root.aiTextPlugin({preload:true});

// Token utilities:
const { countTokens, idealMaxContextTokens } = root.aiTextPlugin({ getMetaObject: true });
// countTokens(text: string) => number
// idealMaxContextTokens => ~4000–8000

// Text embedding for semantic search:
// CORRECT signature — pass an object, not a bare array:
let [vector] = await window.embedTexts({ textArr: ["text a"], modelName: thread.textEmbeddingModelName });
// returns Float32Array[]
let distance = cosineDistance(vec1, vec2); // lower = more similar

// Always guard before embedding — not all browsers can load the model:
if(window.textEmbedderFunction) {
  let [embedding] = await window.embedTexts({ textArr: [memText], modelName: thread.textEmbeddingModelName });
}
```

### 2.1 Instruction Patterns (used in production)

**Chat completion** — the canonical `[[CharacterName]]: message` format:
```js
let instruction = `
<MESSAGES>
[[User]]: Hello!
[[Chloe]]: Hi there, how can I help?
</MESSAGES>

REMINDER for writing Chloe's messages: "Keep replies short and in character."

>>> TASK: Your task is to write the next 3 messages in this chat.
`.trim();

let startWith = `[[Chloe]]:`;   // AI continues from here
```

**Summarisation task** — the `[A]/[B]/[C]` block-labeling format (from production):
```js
// startWith contains real [A] and [B] examples so the AI can see the pattern:
let startWith = `
>>> FULL TEXT of [A]: <previously seen text>
>>> SUMMARY of [A]: <already written summary>
---
>>> FULL TEXT of [B]: <another block of text>
>>> SUMMARY of [B]: <already written summary>
---
>>> FULL TEXT of [C]: ${messagesToSummarize}
>>> SUMMARY of [C]:`.trim();

// Append to force quality (in production: slice off last char and append this):
startWith = startWith + " (full, natural, readable sentences with correct grammar):";

let stopSequences = ["\n\n", "\n---", "\n>>> FULL TEXT", "FULL TEXT"];

// Post-process: strip artifacts from returned summary text
let summary = data.generatedText.trim()
  .replace(/\n+/g, " ").trim()
  .replace(/---$/, "")
  .replace(">>> FULL TEXT", "").replace("FULL TEXT", "").trim()
  .replaceAll(/ *[—–] */g, ", ").trim();
```

**Summarisation instruction tips** (improves quality when included):
```
TIP: In order to ensure the summary is half the length of the full text, consider what's happening
at a "higher level", rather than simply re-stating individual facts in terse form.
TIP: Ensure summaries use full, natural, readable sentences with correct grammar.
NOTE: Don't append commentary or word counts. Just do the task and end your response.
IMPORTANT: Avoid repetition within summaries! Remove or ignore erroneously repeated elements.
```

**Auto-fix repetition in summaries:**
```js
// Detect: if final 30 chars appear many times earlier in text, repetition is likely
if(summary.split(summary.slice(-30)).length > 5) {
  let result = await root.aiTextPlugin({
    instruction: [
      `Does the following story summary snippet shown within <story_summary_snippet>...</story_summary_snippet>`,
      `include erroneous/unnecessary repetition? If so, respond with fixed text within`,
      `<fixed_story_summary_snippet>...</fixed_story_summary_snippet>. If fine, respond with exactly 'no_repetition'.`,
      ``,
      `<story_summary_snippet>`,
      summary,
      `</story_summary_snippet>`,
    ].join("\n"),
    stopSequences: ["</fixed_story_summary_snippet>"],
  });
  let fixedSummary = result.generatedText
    .match(/<fixed_story_summary_snippet>(.+)<\/fixed_story_summary_snippet>/s)?.[1].trim();
  if(fixedSummary) summary = fixedSummary;
}
```

**Memory / lore extraction:**
```js
let instruction = `
@@@ TASK: Condense the *NEW_TEXT* below into up to 3 lore/memory/fact entries for a facts database.
- Only extract "timeless facts" — things that will ALWAYS be true.
- Example timeless: "Bob was born in Paris". Example NOT timeless: "Bob is hungry right now".
- Each entry must be fully self-contained (may be read in isolation — include full context).
- Use actual names, not pronouns. "Bob said to Alice..." not "He said to her..."
- Each entry: no more than 3 sentences.
- If unsure if a fact is timeless, add context: "Bob was kind to Alice when he first met her."
- IMPORTANT: Do NOT repeat things already known from above context. Only extract NEW information.
# NEW_TEXT:
${messagesSummarizedText}
Use this format:
# Lore/memory entries from NEW_TEXT:
1. <something we can deduce directly from NEW_TEXT>
2. <something else>
3. <another thing>
`.trim();

let startWith = `# Lore/memory entries from NEW_TEXT:\n1.`;
let stopSequences = ["\n4."];

// Post-process extracted memories:
memories = ("1."+data.generatedText).trim()
  .split("\n").map(l => l.trim())
  .filter(l => l && /^[0-9]\. .+/.test(l))
  .map(l => l.replace(/^[0-9]\. /, "").replaceAll(/ *[—–] */g, ", "));
```

**Shared prefix cache** — structure summary AND memory calls to share a common prefix.
This avoids re-tokenising the shared context for each call:
```js
let sharedContextPrefixText = [
  `# Extra context:\n${extraContext}`,
  `# Prior events summary:`,
  (priorSummaries.length > 0 ? priorSummaries : ["(None.)"]).join("\n"),
].join("\n");

// Summary call uses: [sharedContextPrefixText, "", summaryTaskPrompt]
// Memory call uses:  [sharedContextPrefixText, "", memoryTaskPrompt]
// Both share the same prefix → better prefix-cache hit rates
```

---

## 3 · `text-to-image-plugin` API

```js
// In messages, AI writes image tags — the plugin renders them automatically:
// <image>A detailed description of the scene</image>

// To trigger image generation directly:
let imageUrl = await root.textToImagePlugin({
  prompt: "anime girl in a sunny field",
  // negative: "blurry, bad quality",
  // style: "photorealistic",
});
```

Character-level image controls (set on character object):
- `imagePromptPrefix` — prepended to every image prompt
- `imagePromptSuffix` — appended to every image prompt
- `imagePromptTriggers` — `"keyword: description\nother: @prepend desc"` format

---

## 3.5 · Perchance HTTP API (server-side metadata + content fetching)

Perchance exposes a small REST surface at `https://perchance.org/api/...` for fetching generator content, listings, screenshots, and dependency graphs. **All of these endpoints require `superFetch`** when called from a generator (browser CORS will block plain `fetch`). External apps (Discord bots, backends) can call them with normal `fetch`.

### 3.5.1 The five toolkit endpoints

```js
// 1. Screenshot (returns image blob)
const r1 = await superFetch(
  `https://perchance.org/api/getGeneratorScreenshot?generatorName=${name}`
);
const imgUrl = URL.createObjectURL(await r1.blob());

// 2. Recently edited generators (returns JSON {generators: [...]})
const r2 = await superFetch(
  'https://perchance.org/api/getGeneratorList?max=20&tags=cool,ai'
);
const { generators } = await r2.json();
// Each generator: { name, views, lastEditTime, publicId, metaData: {title, description, image} }

// 3. Stats (single or batch). Returns { status: 'success', data: {...} | [...] }
const r3 = await superFetch(
  'https://perchance.org/api/getGeneratorStats?name=animal'
);
const r3b = await superFetch(
  'https://perchance.org/api/getGeneratorStats?names=animal,noun,adjective'
);
const { status, data } = await r3.json();

// 4. Download generator source as HTML blob (or just the lists)
const r4 = await superFetch(
  `https://perchance.org/api/downloadGenerator?generatorName=${name}&listsOnly=true`
);
const html = await r4.blob(); // serve as a download

// 5. Generators + their full dependency tree
const r5 = await superFetch(
  `https://perchance.org/api/getGeneratorsAndDependencies?generatorNames=${csv}`
);
const { generators: depMap, unfound } = await r5.json();
// depMap: { 'animal': { imports: ['noun', 'adjective', ...] }, ... }
```

### 3.5.2 The public list endpoint (`generateList.php`)

Separate from the toolkit above — this endpoint returns generated *output* from any public generator as a JSON array:

```js
// Returns ["lion", "tiger", "bear"] (or whatever the generator emits)
const r = await fetch(
  `https://perchance.org/api/generateList.php?generator=${name}&count=${n}`
);
const items = await r.json();
```

**External-app CORS note:** If you're calling this from a non-Perchance domain (Discord bot, your own site), you may hit CORS. Options: (a) use a CORS proxy, (b) call from a backend/server, (c) request CORS access for your domain from Perchance. Inside a Perchance generator, prefer `superFetch`.

### 3.5.3 When to use which

| Use case | Endpoint |
|---|---|
| Show "browse generators" UI | `getGeneratorList` |
| Show stats card / preview thumbnail | `getGeneratorStats` + `getGeneratorScreenshot` |
| Mirror/backup another generator's source | `downloadGenerator` |
| Map a generator's import graph | `getGeneratorsAndDependencies` |
| **Pull live output** for an app/bot | `generateList.php?generator=…&count=…` |

`generateList.php` is the only one of these that actually *runs* the generator. The others read static metadata.

### 3.5.4 Self-hosting / DIY API (Node.js + JSDOM)

Perchance doesn't ship a server-side library, but you can run a generator under JSDOM by combining `downloadGenerator` with `__cacheBust`. The Glitch-hosted reference template is at `glitch.com/edit/#!/diy-perchance-api`:

```js
const { JSDOM } = require("jsdom");
const fetch = require("node-fetch");

const html = await fetch(
  `https://perchance.org/api/downloadGenerator?generatorName=${name}&__cacheBust=${Math.random()}`
).then(r => r.text());

const { window } = new JSDOM(html, { runScripts: "dangerously" });

console.log(window.root.output.toString());
console.log(window.root.character.description.evaluateItem);

// Mutate state then re-render:
window.root.character.hitpoints = 10;
window.update();
```

Notes:
- The `__cacheBust=${Math.random()}` query param is the trick for bypassing the Cloudflare CDN cache when iterating during development.
- First request to a generator is slow (cold cache); subsequent ones are fast.
- For Discord bots specifically, use the dedicated template at `glitch.com/edit/#!/perchance-discord-server-bot-template`. Self-hosting via Node + pm2 also works (`pm2 start server.js`).

### 3.5.5 ⚠ Critical: `ai-text-plugin` and `text-to-image-plugin` are origin-locked

**These two plugins do NOT work on self-hosted servers, forks, or anything other than `perchance.org`.** They're funded by ads on perchance.org generators, and the AI servers gate requests by origin. If you (or a user) reports "ai-text-plugin doesn't work on my Glitch server / my fork / my downloaded HTML", this is why — there is no workaround other than running on perchance.org.

Practical implications:
- The DIY/self-hosted patterns in 3.5.4 work fine for **list-based** generators, but cannot drive the AI plugins.
- A downloaded HTML file (via the Settings → Download button or the `download-button-plugin`) will run offline for list generation, but AI features will fail.
- If a user wants their AI app to live on a custom domain, the workable shape is: host the *frontend* anywhere, but proxy AI calls back through a perchance.org-hosted generator they control.

---

## 3.6 · `secret-plugin` — Quantum-resistant client-side encryption

Three-method API for end-to-end encrypted messaging. Keys are stable strings with magic envelopes you can pattern-match.

```js
// 1. Generate a keypair (no async — synchronous)
const keys = secret.generateKeyPair();
// keys.public  — string starting with "PUBLIC_"  ending "_PUBLIC_END"
// keys.private — string starting with "PRIVATE_" ending "_PRIVATE_END"

// 2. Encrypt with recipient's PUBLIC key
const ciphertext = secret.encrypt(plaintext, recipientPublicKey);

// 3. Decrypt with own PRIVATE key. Throws on failure — wrap in try/catch
let plaintext;
try {
  plaintext = secret.decrypt(ciphertext, myPrivateKey);
} catch (e) {
  // wrong key, tampered ciphertext, or not actually a secret-plugin message
}
```

### 3.6.1 Key validation helpers (recommended)

```js
const isPublicKey  = (s) => typeof s === 'string'
  && s.startsWith('PUBLIC_')  && s.endsWith('_PUBLIC_END');
const isPrivateKey = (s) => typeof s === 'string'
  && s.startsWith('PRIVATE_') && s.endsWith('_PRIVATE_END');

// Round-trip probe to verify a keypair matches before trusting it:
function doesKeyPairMatch(publicKey, privateKey) {
  if (!isPublicKey(publicKey) || !isPrivateKey(privateKey)) return false;
  try {
    const probe = `probe:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    return secret.decrypt(secret.encrypt(probe, publicKey), privateKey) === probe;
  } catch { return false; }
}
```

### 3.6.2 The canonical anonymous-messaging pattern

Combine `secret-plugin` + `upload-plugin` + `comments-plugin` for a full anonymous-inbox app:

```js
// Profile owner generates keypair on first run, persists privateKey locally:
const keys = secret.generateKeyPair();
await idbSet('profile', { publicKey: keys.public, privateKey: keys.private });

// Owner uploads only the PUBLIC key in profile JSON, gets a share URL:
const { url } = await uploadPlugin(JSON.stringify({
  publicKey: keys.public,
  profile: { name, bio, avatarUrl },
}));

// Visitor fetches the profile, encrypts a message with the PUBLIC key,
// posts it via comments-plugin to the profile's channel:
const profile = await fetch(profileUrl).then(r => r.json());
const encrypted = secret.encrypt(messageText, profile.publicKey);
await commentsPlugin.submit(encrypted);

// Owner reads comments and decrypts each with their PRIVATE key:
for (const c of comments) {
  try {
    const plaintext = secret.decrypt(c.message.trim(), state.currentPrivateKey);
    messages.push({ time: c.timestamp, text: plaintext });
  } catch { /* skip — wrong key or non-secret message */ }
}
```

**Key trust model:** the private key never leaves the owner's device. Anyone who gets the profile URL can *send* messages but not read them. The owner can additionally make a "reader-access link" by sharing the privateKey via another `uploadPlugin` upload — anyone with that link can read the inbox on their own device.

### 3.6.3 Idioms

- `secret.encrypt`/`secret.decrypt` are **synchronous**. No `await`.
- Decrypt **always** wrapped in try/catch — comments from non-allowlisted senders will fail.
- For inter-channel anonymity in `comments-plugin`, use the `+ids:channelName` channel suffix so user IDs are scoped per-channel (a user posting on two profile inboxes won't reveal they're the same person).

---

## 3.7 · `text-editor-plugin-v1` — Higher-performance textarea with styling

Drop-in replacement for `<textarea>` backed by CodeMirror 6, with optional inline text styling (e.g. asterisks → italics, `**word**` → bold). Used when you need (a) better performance than a plain textarea on long inputs, (b) inline formatting without a full rich-text editor, or (c) features like collaborative cursors, syntax highlighting, or AI inline-completion.

```js
// In top-list:
createTextEditor = {import:text-editor-plugin-v1}

// In your custom code:
const editor = createTextEditor({
  parent: document.getElementById('writingArea'),
  initialValue: 'Hello *world*',
  placeholder: 'Type here…',
  spellcheck: true,
  darkMode: true,
});

// editor exposes:
editor.value           // get/set as a string (cached for cheap reads)
editor.dom             // the mount element
editor.focus()
editor.replaceSelection(text)
editor.on('change', cb) // fired on doc edits
```

### 3.7.1 Underlying CodeMirror access

The plugin re-exports CodeMirror 6 modules so you can extend the editor with full CM extensions:

```js
const cm = window.textEditorPluginMeta9973752983.codemirror6;
const { CMView, CMState, CMCommands, oneDark, createInlineCopilotExtension, yCollab } = cm;

// Add an extension after construction:
editor.dispatch({ effects: CMState.StateEffect.appendConfig.of([oneDark]) });
```

### 3.7.2 Bundled extensions worth knowing

- **`oneDark`** — the One Dark theme, ready to plug in
- **`createInlineCopilotExtension(docId)`** — ghost-text AI completion. Wires up `window.copilotAutoCompleteFn[docId] = async (before, after) => string` which you implement using `aiTextPlugin`. Tab accepts the suggestion.
- **`yCollab`** — Yjs collaborative editing (presence cursors + CRDT sync). Requires you bring your own Yjs provider (WebRTC, WebSocket, etc.) — Perchance doesn't ship one.

### 3.7.3 When NOT to use it

- For a single-line input, use `<input>`.
- For a quick scratchpad, plain `<textarea>` is simpler and cheaper.
- For full rich text (images inline, tables, links), use a dedicated editor like TipTap or ProseMirror.

The sweet spot is **medium-to-long-form prose with light formatting** — story authoring, journal entries, character descriptions — where you want responsiveness on multi-thousand-word inputs and asterisk-italics rendering, but not a full CMS.

---

## 3.8 · Embedding & Distribution

### 3.8.1 iframe embed

Any public generator embeds via the `null.perchance.org` subdomain:

```html
<iframe src="https://null.perchance.org/my-generator-name"></iframe>
```

Size and styling are controlled by the embedder's CSS, not the generator.

### 3.8.2 Single-file HTML download

Settings → Download produces a self-contained HTML file with the generator inlined. The `download-button-plugin` lets you put a "Download" button directly in your generator so visitors can save it.

**Editing a downloaded HTML file:** append `#edit` to the URL, press Enter, then refresh — the offline editor opens. This is the supported "what if perchance.org disappears" continuity story.

### 3.8.3 Privacy / takedown

Generators are public by default and forkable by anyone. Settings → "Make private" removes a generator from the public listing pages (e.g. `/generators`) but the URL itself remains accessible to anyone with the link.

---

## 4 · Data Model (IndexedDB via Dexie.js)

```js
// DB opened at app startup:
const db = new Dexie("chatbot-ui-v1");
db.version(N).stores({
  characters: "++id, name, uuid",
  threads: "++id, characterId, lastViewTime, lastMessageTime",
  messages: "++id, threadId, characterId, order",
  memories: "++id, threadId",
  lore: "++id, bookId, bookUrl",
  summaries: "hash",
  usageStats: "++id, threadId",
  misc: "key",        // general key-value store for app-level settings
});
```

**`db.misc` usage** — key-value store for app-level settings and custom code:
```js
// Read:
let value = (await db.misc.get("customPostPageLoadMainThreadCode"))?.value || "";
// Write:
await db.misc.put({ key: "customPostPageLoadMainThreadCode", value: "..." });
// Run custom post-load code if set (allows user-injected JS at startup):
if(customPostPageLoadMainThreadCode.trim()) eval(customPostPageLoadMainThreadCode);
```

### 4.1 Character Object Schema
```js
{
  id, uuid,
  name: "Chloe",
  roleInstruction: "Character description / system prompt (keep < 1000 words)",
  reminderMessage: "Short reminder note appended near the end (< 100 words)",
  generalWritingInstructions: "@roleplay1" | "@roleplay2" | "custom text",
  initialMessages: [{ author:"user"|"ai"|"system", content:"..." }],
  avatar: { url: "https://...", size: 1, shape: "square" },
  userCharacter: { name, roleInstruction, reminderMessage, avatar: { url } },
  systemCharacter: { avatar: {} },
  modelName: "good" | "great",  // maps to underlying LLM
  scene: { background: { url }, music: { url } },
  loreBookUrls: ["https://user.uploads.dev/file/xxx.txt"],
  autoGenerateMemories: "none" | "enabled",
  textEmbeddingModelName: "default",
  maxParagraphCountPerMessage: null | 1 | 2 | 3 | 4,
  streamingResponse: true,
  customCode: "",   // JavaScript run in sandboxed iframe
  // Default custom code — apply named global preset if character has no custom code:
  // character.customCode = character.customCode?.length
  //   ? character.customCode
  //   : window.globalCustomJavaScripts["@removeHyphens"];
  imagePromptPrefix: "",
  imagePromptSuffix: "",
  imagePromptTriggers: "",
  metaTitle: "",        // optional — overrides SEO title on this character's share URL
  metaDescription: "", // optional — overrides SEO description
  metaImage: "",        // optional — overrides SEO image
  customData: {},
  folderPath: "",
  creationTime: Date.now(),
  lastMessageTime: Date.now(),
}
```

### 4.2 Message Object Schema
```js
{
  id, threadId, characterId,
  message: "Text of the message",
  name: null,        // name override (null = use character default)
  order: id,         // used for sorting; can be non-contiguous
  hiddenFrom: [],    // [] | ["ai"] | ["user"]
  expectsReply: undefined | true | false,
  variants: [null],  // swipe variants; null = current message
  summariesEndingHere: {},   // { level: "summary text" }
  memoriesEndingHere: {},    // { level: [{text, embedding}] } — parallel to summariesEndingHere
  memoryIdBatchesUsed: [],
  loreIdsUsed: [],
  memoryQueriesUsed: [],
  messageIdsUsed: [],
  scene: null,
  avatar: {},
  customData: {},
  wrapperStyle: "",
  instruction: null,  // replyInstruction used when message was generated
}
```

**`memoriesEndingHere`** — memories extracted from the same block that was summarized:
```js
// During summarization, push memories to the last-summarized message:
if(!m.memoriesEndingHere) m.memoriesEndingHere = {};
if(!m.memoriesEndingHere[level]) m.memoriesEndingHere[level] = [];
m.memoriesEndingHere[level].push(
  ...memories.map(memText => ({ text: memText, embedding: null }))
  // embedding: null here — computed lazily only at DB write time
);

// At DB write time, compute embeddings (only if browser supports it):
if(window.textEmbedderFunction && m.memoriesEndingHere) {
  for(let lvl in m.memoriesEndingHere) {
    for(let memory of m.memoriesEndingHere[lvl]) {
      if(!memory.embedding) {
        let [embedding] = await window.embedTexts({
          textArr: [memory.text],
          modelName: thread.textEmbeddingModelName,
        });
        memory.embedding = embedding;
      }
    }
  }
}
await db.messages.update(m.id, {
  summariesEndingHere: m.summariesEndingHere,
  memoriesEndingHere: m.memoriesEndingHere,
});
```

### 4.3 Thread Object Schema
```js
{
  id, characterId,
  name: "Thread name",
  modelName, textEmbeddingModelName,
  character: { /* thread-level character overrides */ },
  userCharacter: { name, roleInstruction, reminderMessage, avatar: {} },
  systemCharacter: { avatar: {} },
  isFav: false,
  folderPath: "",
  lastViewTime, lastMessageTime,
  currentSummaryHashChain: [],
  customCodeWindow: { visible: false, width: null },
  customData: {},
}
```

---

## 5 · Message Format (wire format sent to AI)

Messages are serialised as plain text before being sent to `aiTextPlugin`:
```
[[CharacterName]]: Message content here.

[[AnotherCharacter]]: Their reply.

[[CharacterName]]: Next line...
```

- Separator: `\n\n` between messages
- Stop sequences: `["\n\n[[", "\n[["]` (add `"\n\n"` to limit to 1 paragraph)
- `hiddenFrom: ["ai"]` messages are filtered out before sending
- `<!--hidden-from-ai-start-->…<!--hidden-from-ai-end-->` strips inline sections
- Template variables: `{{user}}` → userName, `{{char}}` → characterName

---

## 6 · Hierarchical Summarisation

Long conversations are compressed in background after every reply.

### 6.1 Concept
```
Level 0 = raw messages (bottom of stack)
Level 1 = summaries of ~1500-char blocks of raw messages
Level 2 = summaries of level-1 summaries
...
```

### 6.2 Global State Object (per thread)
```js
if(!window.__aiHierarchicalSummaryStuff) window.__aiHierarchicalSummaryStuff = {};
if(!window.__aiHierarchicalSummaryStuff[threadId]) {
  window.__aiHierarchicalSummaryStuff[threadId] = {
    summariesReadyToInject: [],   // pending — batched before DB write
    alreadyDoingSummary: false,   // mutex — only one bg summary at a time
  };
}
```

### 6.3 When to Summarize
```js
const { countTokens, idealMaxContextTokens } = root.aiTextPlugin({ getMetaObject: true });
// Leave an 800-token buffer to prevent prefix-cache invalidation on every message:
let tokenBudget = idealMaxContextTokens - 800;

let currentLength = countTokens(
  messageTextWithSummaryReplacements.join("\n\n") + (opts.extraTextForAccurateTokenCount || "")
);
if(currentLength < tokenBudget) {
  return; // no summarization needed
}
// Trigger background summarization (in an IIFE so it doesn't block reply generation)
```

### 6.4 Batch Injection (protects prefix cache)
```js
// Only write summaries to DB when >= 3 are ready.
// Avoids invalidating the prefix cache after every single message.
if(window.__aiHierarchicalSummaryStuff[threadId].summariesReadyToInject.length >= 3) {
  for(let m of messagesToUpdate) {
    await db.messages.update(m.id, { summariesEndingHere: m.summariesEndingHere });
  }
  window.__aiHierarchicalSummaryStuff[threadId].summariesReadyToInject = [];
}
```

### 6.5 Block Size Heuristic
```js
const numCharsToSummarizeAtATime = 1500;
// Don't go higher — the summary call's own context can overflow when hierarchy is deep.

// Trim final block to target size:
while(block.length > 1) {
  let numChars = block.reduce((a, v) => a + v.length, 0);
  if(numChars < numCharsToSummarizeAtATime) break;
  // Drop half at once if way too big (speed optimization):
  if(numChars > numCharsToSummarizeAtATime * 10) {
    let half = Math.floor(block.length / 2);
    for(let j = 0; j < half; j++) block.pop();
  } else {
    block.pop();
  }
}
```

### 6.6 `getMessageObjsWithoutSummarizedOnes` — Context Reconstruction Algorithm
```js
getMessageObjsWithoutSummarizedOnes(messages, opts) =>
  // Returns minimal set of messages/summaries needed to reconstruct context.
  // Walks BACKWARDS, collecting messages while monotonically climbing levels.
  messages = messages.slice(0);
  let result = [];
  let highestLevelSeen = 0;

  while(messages.length > 0) {
    let m = messages.pop();
    let level = m.summariesEndingHere
      ? Math.max(...Object.keys(m.summariesEndingHere).map(Number))
      : 0;
    if(level < (opts?.minimumMessageLevel || 0)) continue;
    if(level >= highestLevelSeen) {
      result.unshift(m);
      highestLevelSeen = level;
    }
    // When we hit a higher-level summary, it "covers" all previous raw messages.
    // By monotonically climbing, we naturally prefer summaries over raw messages.
  }
  return result;
  // NOTE: When using result for inference, read the HIGHEST level summary from each message:
  // let text = (level > 0) ? m.summariesEndingHere[level] : m.content;
```

### 6.7 Sanity Check Before Injecting Summaries
```js
// Verify that the last summarized message still matches. If the user edited messages,
// discard the summary and recompute it next time.
let expected = level === 1
  ? `${lastMessageObj.name}: ${lastMessageObj.content}`
  : lastMessageObj.summariesEndingHere[level - 1];

if(expected.trim() === lastSummarizedText.trim()) {
  // safe to inject
} else {
  console.warn("Content mismatch — summary discarded. Will recompute next send.");
}
```

---

## 7 · Memory & Lore

**Associative memory** — facts extracted from past conversations, stored in `db.memories`,
retrieved via text embedding similarity search before each reply:
```js
let memories = await db.memories.where("threadId").equals(threadId).toArray();
// Each memory: { id, threadId, text: "Bob was born in Paris" }
// Retrieve relevant subset: embed query, sort by cosineDistance, take top N
```

**Lorebooks** — static fact files hosted at `user.uploads.dev`, loaded and embedded
at thread start:
```js
// Each line is a fact; blank lines separate entries.
// Loaded from character.loreBookUrls[], cached in db.lore
```

**Injection into prompt** (when relevant items found):
```
<ignore_this_if_irrelevant>
[MEMORIES & LORE]
• Bob was born in Paris (memory)
• The castle has three towers (lore)
</ignore_this_if_irrelevant>
```

---

## 8 · File Hosting & Share Links

The Perchance ecosystem offers two complementary share mechanisms. **Use both in cascade**: hash-share first (no server roundtrip, never expires, works on forks), upload-share when the payload is too large for a URL fragment, clipboard-JSON as a final fallback. The cascade matters because of a server-side restriction described below.

### 8.1 The domain-allowlist constraint (READ THIS FIRST)

The `upload-plugin` posts `window.generatorName` to `https://upload.perchance.org` as part of every upload request. The upload server's API key is **locked to specific generator slugs at the server side**. Forks and hex-named subdomains (e.g. `64116dfabfc9f6706198dbf7f23c4240.perchance.org`, the slug of an unsaved fork) are rejected with:

```
Forbidden: This API Key is locked to specific domains.
Current origin: https://<slug>.perchance.org.
Ensure your generator name is added to the allowed list.
```

**This is server-side. You cannot bypass it from the client.** Overriding `window.generatorName` would circumvent Perchance's security model — don't. The right mitigation is to design your share path so it doesn't require the upload server in the first place. That's what the hash-share pattern below does.

The audit-server-side fix (allowlisting your fork slug) requires intervention from Perchance's maintainers.

### 8.2 The three URL shapes

| Shape | Mechanism | Persistence | Works on forks? | Use when |
|---|---|---|---|---|
| `?data=<fileId>.gz` | `upload-plugin` → `user.uploads.dev` CDN | 30 days (default) – permanent | ❌ no (allowlist) | payload doesn't fit in URL fragment |
| `#cfg=<params>` (legacy) | URL fragment, key-value | permanent — URL is the data | ✅ yes | small structured config (preset references) |
| `#kind=<gzip-base64>` | URL fragment, opaque encoded blob | permanent — URL is the data | ✅ yes | any JSON ≤ ~3 KB after gzip |

The hash-share `#kind=<…>` is the most general. Use it as your default. Fall back to upload only when the payload exceeds the URL budget.

### 8.3 Hash-share helpers (recommended default)

```js
const HASH_SHARE_URL_BUDGET = 1900; // chars total — leaves headroom for clients that strip whitespace or add prefixes (Discord, Slack)

async function buildHashShareUrl(payload, kind) {
  try {
    const json = JSON.stringify(payload);
    // Gzip compress
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    const compressed = await new Response(stream).arrayBuffer();
    // URL-safe base64 (+ → -, / → _, no padding)
    const bytes = new Uint8Array(compressed);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const base = window.location.origin + window.location.pathname;
    const url = `${base}#${kind}=${b64}`;
    if (url.length > HASH_SHARE_URL_BUDGET) return null; // too large; caller falls through to upload
    return url;
  } catch { return null; }
}

async function decodeHashShareFragment(b64) {
  try {
    let std = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (std.length % 4) std += '=';
    const bin = atob(std);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const json = await new Response(stream).text();
    return JSON.parse(json);
  } catch { return null; }
}
```

**Budget math:** origin + pathname is typically 60-100 chars. Gzip compresses JSON 50-70%; base64 expands by 33%. Net: JSON payloads up to ~3 KB after gzip fit comfortably in 1900 chars.

### 8.4 Upload-plugin: `expires` for quota boost

The `upload-plugin` accepts an `expires` (epoch ms) option. Per its docs:

| `expires` | Quota boost |
|---|---|
| ≤ 24 hours | **400×** |
| 30 days | ~50-100× (interpolated) |
| 1 year | **20×** |
| omitted (permanent) | 1× (baseline) |

For temporary-style shares (the common case — a friend opens the link within hours/days), pass `expires: Date.now() + 30 * 86400 * 1000`. You get a meaningful quota boost in exchange for a 30-day expiry that almost no realistic share lifecycle hits.

```js
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const result = await uploadPlugin(file, { expires: Date.now() + THIRTY_DAYS_MS });
```

### 8.5 Upload-plugin: `deletionUrl` capture

The upload-plugin response includes a `deletionUrl` that's valid for **3 days** after upload. After that, the deletion endpoint expires.

```js
const { url, size, error, deletionUrl } = await uploadPlugin(file, opts);
// Persist deletionUrl + createdAt in IDB so the user can revoke later:
await idbSet('shared_links', [...existing, {
  id: 'sh_' + Date.now().toString(36),
  url, deletionUrl,
  createdAt: Date.now(),
  expiresAt: opts.expires || null,
}]);

// To revoke later (within 3-day window):
const res = await fetch(deletionUrl).then(r => r.json());
// res.success will be true if deletion succeeded. Mark revoked locally
// regardless — server may cache, and re-trying is wasteful.
```

### 8.6 The three-tier cascade pattern

For any share-link feature, structure your code as:

```js
async function shareThing(payload, opts = {}) {
  // Tier 1 — hash-share (no server, permanent, works on forks)
  const hashUrl = await buildHashShareUrl(payload, opts.kind || 'data');
  if (hashUrl) {
    showShareModal(hashUrl);
    return;
  }
  // Tier 2 — upload-share (might 403 on forks; 30-day expiry by default)
  const uploadUrl = await createShareUpload(payload, {
    fileName: opts.kind || 'share',
    expires: Date.now() + THIRTY_DAYS_MS,
  });
  if (uploadUrl) {
    showShareModal(uploadUrl);
    return;
  }
  // Tier 3 — clipboard JSON (always works, manual paste)
  const accepted = await confirmAsync(
    'Couldn\'t create a share link. Copy the JSON to your clipboard so you can send it directly?'
  );
  if (accepted) await copyJsonToClipboard(payload);
}
```

**The cascade matters because hash-share NEVER fails on size-fit payloads.** The upload server is the unreliable component (allowlist + quotas + content moderation). Only hit it when you must.

### 8.7 Modal copy: distinguish the URL shapes

Users need to know whether a link will expire. Detect the URL shape and render an appropriate footer note:

```js
const isUploadShare = /\?data=/.test(url);
const isHashShare   = /#\w+=/.test(url);
let footerNote = '';
if (isUploadShare) {
  footerNote = 'Note: Upload-based share links expire after 30 days. ' +
    'For permanent sharing, send a hash-share link or use cloud upload.';
} else if (isHashShare) {
  footerNote = 'Permanent: The data is encoded in the link itself, ' +
    'so it never expires and works on any deployment — no upload server needed.';
}
```

### 8.8 `$meta.dynamic` link previews for hash-shares

`$meta.dynamic` runs in a sandboxed context with no network access, so it can't decompress the hash-share payload to extract a title. Use a generic preview based on the `kind` in the URL fragment:

```js
$meta.dynamic
  $output(params, hash) =>
    if (hash.indexOf("persona=") === 0) {
      return {
        title: "Shared Custom Guide (Persona)",
        description: "Someone shared a custom guide with you. " +
          "Open to review it and add it to your library.",
        image: defaultImage,
      };
    }
    if (hash.indexOf("cfg=") === 0) {
      // Legacy human-readable form — can parse fields directly:
      let qs = new URLSearchParams(hash.slice(4));
      return {
        title: "Shared session: " + (qs.get("m") || "custom"),
        description: "...",
        image: defaultImage,
      };
    }
    if (params.data) {
      // Upload-share — opaque from here too
      return {
        title: "Shared content",
        description: "...",
        image: defaultImage,
      };
    }
```

### 8.9 Legacy upload-only example (for reference)

The original ai-character-chat pattern, kept for reference. Use the cascade above instead unless you specifically need this legacy shape:

```js
// Upload a Blob to Perchance CDN:
let { url, size, error } = await uploadPlugin(blob);
// url format: "https://user.uploads.dev/file/<filename>"

// Handle upload errors (including content moderation):
if(error) {
  alert(`Error: ${error}${error === "disallowed_content"
    ? ". If you believe this is incorrect, you may need to edit the character description to"
      + " explicitly state that the character is 18 or older, since the moderation system can"
      + " make mistakes if there is ambiguity."
    : ""}`);
  return;
}

// Compression helpers (for upload payload):
async function compressBlobWithGzip(blob) {
  const cs = new CompressionStream("gzip");
  let out = await new Response(blob.stream().pipeThrough(cs)).blob();
  return new Blob([out], { type: "application/gzip" });
}
async function decompressBlobWithGzip(blob) {
  const ds = new DecompressionStream("gzip");
  return await new Response(blob.stream().pipeThrough(ds)).blob();
}

// Loading a `?data=…` upload-share:
async function loadDataFromShareUrl() {
  let dataParam = new URL(window.location.href).searchParams.get("data");
  if (!dataParam) return null;
  let fileName = dataParam.split("~").slice(-1)[0]; // strip cosmetic prefix
  let blob = await fetch("https://user.uploads.dev/file/" + fileName, {
    signal: AbortSignal.timeout?.(15000)
  }).then(r => r.ok ? r.blob() : null).catch(console.error);
  if (!blob) {
    // File may have been quarantined: perchance.org/quarantined-files
    return null;
  }
  let decompressed = await decompressBlobWithGzip(blob);
  return JSON.parse(await decompressed.text());
}
```

### 8.10 Upload-plugin error handling — observed taxonomy

```js
} catch (e) {
  const msg = String(e?.message || e);
  if (/locked to specific domains/i.test(msg) || /Forbidden/i.test(msg)) {
    // Fork / non-allowlisted deployment — fall through to hash-share
    // or clipboard. Do NOT retry.
  } else if (msg.includes('disallowed_content')) {
    // Content moderation — surface the under-18 clarification message.
  } else if (/over_daily_allowance|file_too_big|invalid_filetype/.test(msg)) {
    // Quota / shape errors — surface to user.
  } else {
    // Unknown — log and surface generic message.
  }
}
```

### 8.11 What window.generatorName is and isn't

`window.generatorName` is set by Perchance's generator-loading infrastructure. It identifies which generator slug is running. The upload server reads this to enforce the API-key allowlist. **It is not a security primitive that you should override.** Lying about it would (a) defeat the allowlist, (b) violate Perchance's terms, (c) likely break in production when the upload server adds origin verification.

---

## 9 · Sandboxed Custom Code

Characters can run user-supplied JavaScript in a hidden sandboxed iframe:
```js
// Evaluation:
let result = await root.evaluatePerchanceTextInSandbox(codeString, {
  timeout: 5000,  // ms, optional
});

// Implementation — lazy-created hidden iframe, reused across calls:
async function evaluatePerchanceTextInSandbox(text, opts = {}) {
  let iframe = document.querySelector('#perchanceCodeEvaluationSandboxIframe');
  if(!iframe) {
    iframe = document.createElement("iframe");
    iframe.src = "https://7deabe31ae18ea5ed27c5f71b9633999.perchance.org/ai-character-chat-sandboxed-executor";
    iframe.id = "perchanceCodeEvaluationSandboxIframe";
    iframe.sandbox = "allow-scripts allow-same-origin";
    iframe.style.cssText = "position:fixed;width:1px;height:1px;opacity:0.01;top:-10px;right:-10px;pointer-events:none;border:0;";
    document.body.append(iframe);
    iframe._resolvers = {};
    let iframeLoadResolver;
    let iframeLoadPromise = new Promise(r => iframeLoadResolver = r);
    window.addEventListener('message', (event) => {
      if(event.origin !== 'https://7deabe31ae18ea5ed27c5f71b9633999.perchance.org') return;
      if(event.data.finishedLoading) { iframeLoadResolver(); return; }
      const { requestId, text } = event.data;
      if(iframe._resolvers[requestId]) {
        iframe._resolvers[requestId](text);
        delete iframe._resolvers[requestId];
      }
    });
    await iframeLoadPromise;
  }
  const requestId = Math.random().toString();
  return new Promise((resolve, reject) => {
    iframe._resolvers[requestId] = resolve;
    if(opts.timeout) {
      setTimeout(() => {
        if(iframe._resolvers[requestId]) reject("Sandbox did not respond in time.");
      }, opts.timeout);
    }
    iframe.contentWindow.postMessage({ text, requestId },
      'https://7deabe31ae18ea5ed27c5f71b9633999.perchance.org');
  });
}
```

Properties visible to custom code: `oc.character`, `oc.thread`, `oc.userCharacter`,
`oc.messages`, `oc.customData`, etc.

---

## 10 · Token Budget Management

```js
// Always check before building prompts:
const { countTokens, idealMaxContextTokens } = root.aiTextPlugin({ getMetaObject: true });
// Leave 800-token buffer — reduces prefix-cache invalidation frequency:
let budget = idealMaxContextTokens - 800;

// Character descriptions: cap at 30% of budget
if(countTokens(roleInstructionText) > budget * 0.3) {
  roleInstructionText = truncateRoleInstruction(roleInstructionText, 3000);
}

// Messages: drop oldest first until fits in remaining budget
// Keep at least 3–5 most recent exchanges
```

---

## 11 · UI Utilities

### `confirmAsync(message, opts)` — Accessible Promise-based Confirm Dialog
```js
async function confirmAsync(message, opts = {}) {
  if(!message) message = "Are you sure?";
  return new Promise(resolve => {
    const overlay = Object.assign(document.createElement("div"), { tabIndex: 0 });
    overlay.style.cssText = `position:fixed;inset:0;z-index:99999999;display:grid;place-items:center;background:rgba(0,0,0,.65);font:16px/1.4 system-ui`;
    overlay.innerHTML = `<div style="max-width:min(97vw,450px);padding:15px;border-radius:8px;background:light-dark(#fff,#222);color:light-dark(#000,#fff);">
      <p style="margin:0 0 20px;white-space:pre-wrap;">${message.replace(/[<>&]/g, m => ({"<":"&lt;","&":"&amp;",">":"&gt;"}[m]))}</p>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button ${opts.hideCancel ? "hidden" : ""} style="padding:6px 16px;border:1px solid light-dark(#ccc,#555);border-radius:6px;background:light-dark(#f6f6f6,#333);color:inherit;cursor:pointer;">Cancel</button>
        <button autofocus style="padding:6px 16px;border:none;border-radius:6px;background:light-dark(#1677ff,#2b87ff);color:#fff;cursor:pointer;">Okay</button>
      </div>
    </div>`;
    const [cancelBtn, okBtn] = overlay.querySelectorAll("button");
    const finish = val => { overlay.remove(); resolve(val); };
    cancelBtn.onclick = () => finish(false);
    okBtn.onclick = () => finish(true);
    overlay.onkeydown = e => {
      if(e.key === "Escape") finish(false);
      else if(e.key === "Enter") finish(true);
    };
    document.body.append(overlay);
    overlay.focus({ preventScroll: true });
  });
}
```

### `prompt2(specs, opts)` — Rich Form Modal
```js
// Standard field-based form:
let result = await window.prompt2({
  fieldName: { type: "textLine", label: "Name", placeholder: "...", defaultValue: "" },
  bio:       { type: "text",     label: "Bio",  placeholder: "..." },
  model:     { type: "select",   label: "Model", options: ["good", "great"] },
  // show(values) → bool: conditionally hide a field based on other field values
  extra:     { type: "textLine", label: "Extra", show: (values) => values.model === "great" },
}, {
  submitButtonText: "Save",
  cancelButtonText: "Cancel",  // null to hide cancel button
});
if(result) console.log(result.fieldName, result.bio);

// Raw HTML content (no form fields) — e.g. for showing a share URL:
let result = await window.prompt2({
  content: {
    type: "none",
    html: `<div style="display:flex; gap:0.5rem;">
      <input value="${shareUrl}" style="flex-grow:1;">
      <button onclick="navigator.clipboard.writeText(this.parentElement.querySelector('input').value);
        this.textContent='copied ✅'; setTimeout(()=>{ this.textContent='copy url'; }, 2000);">
        copy url
      </button>
    </div>`,
  },
}, { cancelButtonText: null, submitButtonText: "finished" });

// Available spec types: "textLine", "text", "select", "buttons", "none" (+ html)
```

### Other Modal Utilities
```js
let modal = createLoadingModal("⏳ Processing...");
modal.delete(); // remove when done

let win = createFloatingWindow({
  header: "Window Title",
  body: someHtmlElement,
  initialWidth: 400,
  initialHeight: 300,
});
```

---

## 12 · Page Initialization Pattern

```js
// Protect against load failures — show emergency export after 10s of no progress:
window.lastKnownActivelyLoadingTime = Date.now();
window.emergencyExportButtonDisplayTimeout = setInterval(() => {
  if(Date.now() - window.lastKnownActivelyLoadingTime > 10000) {
    emergencyExportCtn.hidden = false;
    initialPageLoadingModal.hidden = true;
    clearInterval(window.emergencyExportButtonDisplayTimeout);
  }
}, 5000);
// Update window.lastKnownActivelyLoadingTime during slow legit operations (e.g. lore loading)

// Standard load sequence:
// 1. Open DB
// 2. Parse URL params / hash for share link commands → checkForHashCommand()
// 3. renderThreadList()
// 4. Auto-click most recently viewed thread (or add starter character if no threads yet)
// 5. Show UI, hide loading modal
// 6. tryPersistBrowserStorageData()  ← call once, prevents browser from clearing IndexedDB
// 7. AI preload: root.aiTextPlugin({ preload: true })
// 8. Clear emergency timer: clearInterval(window.emergencyExportButtonDisplayTimeout)

// Share link / hash command routing:
let ignoreHashChange = false;
async function checkForHashCommand() {
  let urlHashJson = null;
  try { urlHashJson = JSON.parse(decodeURIComponent(window.location.hash.slice(1))); } catch(e) {}

  if(urlHashJson?.addCharacter || new URL(window.location.href).searchParams.get("data")) {
    let data = await loadDataFromShareUrl();
    let character = data?.addCharacter;
    if(character) {
      // Age-gate — warn new users about potentially sensitive content:
      let confirmed = await root.confirmAsync(
        "You've visited a character sharing link... This character may discuss sensitive themes" +
        " — please click cancel if you are under 18."
      );
      if(confirmed) {
        let result = await characterDetailsPrompt(character, {
          // quickAdd=true in URL skips the character details form:
          autoSubmit: urlHashJson.quickAdd && !editingExistingCharacter && !sameNameExists,
        });
        if(result) {
          const newCharacter = await addCharacter(result);
          await createNewThreadWithCharacterId(newCharacter.id);
        }
      }
    }
    // Clean up URL hash after processing:
    if(window.location.hash) {
      ignoreHashChange = true;
      window.location.hash = "";
      await new Promise(r => setTimeout(r, 20));
      ignoreHashChange = false;
    }
  }
}
window.addEventListener('hashchange', () => { if(!ignoreHashChange) checkForHashCommand(); });
```

### Emergency Data Export
```js
async function exportRawDb(dbName, opts = {}) {
  // Opens DB → reads all object stores → serialises to CBOR+gzip → triggers download
  // If getAll() times out for a store, falls back to one-by-one individual gets (slower but safer)
  // opts.corruptItemReplacer({storeName, id, dbData}) → return a placeholder object
  //   so corrupt records don't abort the whole export
  // opts.onProgress({message, type}) → progress callback
  // opts.skipStores → array of store names to skip
}
// Export file format: <dbName>.<timestamp>.cbor.gz
// Usage:
await exportRawDb(window.dbName, {
  onProgress: (e) => console[e.type]("exportRawDb:", e.message),
  corruptItemReplacer: ({ storeName, id, dbData }) => {
    if(storeName === "characters") return { id, name: "CORRUPT" };
    if(storeName === "threads") return { id, characterId: dbData.characters[0].id, name: "CORRUPT" };
    // returning undefined effectively deletes the corrupt item (safe for messages/lore/etc.)
  },
});
```

---

## 13 · Common Patterns

### Natural-language wizard skip ("SmartAssist")

Multi-step wizards are friction. Let the user describe what they want in plain English; have the AI return structured JSON; dispatch each field as if the user had filled it in. Pattern:

```js
async function runSmartAssist(userCommand) {
  const instruction = buildSmartAssistPrompt(userCommand);
  // CRITICAL — `startWith: '{'` strips the opening brace from the response.
  // CRITICAL — include the chat-format-bleed safety net stops EVEN for direct
  //            aiTextPlugin calls (the aiGenerate wrapper auto-merges them,
  //            but direct callers must add manually).
  const data = await root.aiTextPlugin({
    instruction,
    startWith: '{',
    stopSequences: ['\n\n\n', '\n\n}\n', '```', '\n\n[[', '\n[['],
    hideStartWith: true,
  });
  if (!data || data.stopReason === 'error') throw new Error('AI returned an error.');
  let text = (data.generatedText || '').trim();
  if (!text) throw new Error('AI returned empty output.');
  // Re-attach the stripped opening brace + scan for matching close to defend
  // against trailing chatter:
  if (!text.startsWith('{')) text = '{' + text;
  const lb = text.lastIndexOf('}');
  if (lb > -1) text = text.substring(0, lb + 1);
  const cfg = JSON.parse(text);
  // Dispatch each field as if the user had picked it manually — fire `change`
  // events on the corresponding inputs/selects so the rest of the app's
  // wiring catches up.
  applySmartAssistConfig(cfg);
}
```

**Build the prompt by enumerating valid options inline** so the AI returns values that map cleanly:

```js
function buildSmartAssistPrompt(userCommand) {
  return `User wants: "${userCommand}"

Return a JSON object choosing values from these options:

PERSONAS (pick ONE id): ${PERSONAS.map(p => `"${p.id}" (${p.tagline})`).join(', ')}
METHODS (pick ONE id): ${METHODS.map(m => `"${m.id}" (${m.tagline})`).join(', ')}
INTENTIONS: ${Object.keys(INTENTION_TYPES).join(', ')}
LENGTHS: ${Object.keys(PHASE_DURATIONS).join(', ')}
SOUNDSCAPES: ${SOUNDSCAPES.join(', ')}

Return ONLY a JSON object like:
{"persona": "id", "method": "id", "intention": "type", "length": "size",
 "soundscape": "name", "intentionInput": "user-paraphrased intent"}

If a field is unclear from the request, omit it (don't guess). Keep
"intentionInput" to ≤120 characters.`;
}
```

**UI:** chat-style composer (textarea + accent-bordered send button on the right) so users recognize it as a chat input, not another form field. Plain Enter submits; Shift+Enter inserts a newline (chat convention).

### Conditional image generation (chat messages)
```js
const imageKeywords = /\b(images?|pics?|photos?|selfie|draw|paint|generate)\b/i;
if(imageKeywords.test(fullContext)) {
  // include image syntax note in instruction
}
// AI writes: <image>detailed scene description here</image>
// Plugin renders this automatically
```

### CORS bypass (for fetching external URLs in custom code)
```js
let response = await root.superFetch("https://external.api.com/data");
let data = await response.json();
```

### Named URL characters
```js
// URL: /ai-character-chat?char=my-char-name → loads gz file from user.uploads.dev
urlNamedCharacters
  my-char-name = abc123.gz
  // NOTE: must add named chars to $meta.dynamic too (duplicate — no root.* access there)
```

### iOS Safari viewport fix (prevent auto-zoom on input focus)
```js
try {
  let isTouchScreen = window.matchMedia("(pointer: coarse)").matches;
  let isSafari = navigator.vendor?.indexOf('Apple') > -1
    && !navigator.userAgent.includes('CriOS')
    && !navigator.userAgent.includes('FxiOS');
  if(isSafari && window.innerWidth < 800 && isTouchScreen) {
    let viewportMeta = document.querySelector("[name=viewport]");
    if(!viewportMeta.getAttribute("content").includes("maximum-scale")) {
      viewportMeta.setAttribute("content",
        viewportMeta.getAttribute("content") + ", maximum-scale=1");
    }
  }
} catch(e) { console.error(e); }
```

### Persist browser storage (prevent browser clearing IndexedDB)
```js
async function tryPersistBrowserStorageData() {
  if(navigator.storage?.persist) await navigator.storage.persist();
}
// Call once after page load completes
```

### Custom modals / prompts summary
```js
// confirmAsync(message, {hideCancel}) → Promise<boolean>
// prompt2(specs, opts) → Promise<formData | null>
// createLoadingModal(text) → { delete() }
// createFloatingWindow({ header, body, initialWidth, initialHeight }) → element
```

### AI runtime sentinels — letting the AI direct the runtime

Sometimes you want the AI to drive the runtime, not just emit text. Example: in a hypnosis app, when the AI writes "let the rain wash through your shoulders", the soundscape *should* be rain at that moment. Hardcoding rain in the wizard is wrong (the user picked something else); ignoring the language is also wrong (jarring mismatch).

**Pattern:** let the AI emit bracketed directives in its output that get parsed before display, dispatched to the runtime, and stripped from text. Same shape as `[PAUSE n]` markers but for any side-effect:

```js
// Strict allowlist — the AI cannot drive the runtime into invalid states
const VALID_BG_VALUES = new Set(['rain', 'ocean', 'fire', /* … */]);
const VALID_VIZ_VALUES = new Set(['spiral', 'tunnel', 'aurora', /* … */]);

function extractSceneSentinels(text) {
  const dispatches = [];
  const stripped = text.replace(/\[(BG|VIZ):\s*([\w\-]+)\s*\]/gi, (_, kind, value) => {
    const k = kind.toUpperCase();
    const v = String(value || '').toLowerCase().trim();
    if (k === 'BG' && VALID_BG_VALUES.has(v))   dispatches.push({ kind: 'bg', value: v });
    if (k === 'VIZ' && VALID_VIZ_VALUES.has(v)) dispatches.push({ kind: 'viz', value: v });
    return ''; // ALWAYS strip from text — never leak into TTS
  });
  return { stripped, dispatches };
}

function dispatchSceneSentinels(dispatches) {
  let delay = 0;
  for (const d of dispatches) {
    setTimeout(() => switchSceneLive(d.kind, d.value), delay);
    delay += 800; // gap so audio engine doesn't churn
  }
}
```

**Five non-obvious rules:**

1. **Always strip, even when disabled.** A "disable AI scene directives" toggle should disable the *dispatch*, not the strip. Sentinels must never leak into TTS as "open bracket BG colon rain close bracket".
2. **Strict allowlist, silent drop.** AI output is non-deterministic. `[BG:waterfall]` — drop it silently. Don't throw; don't log noisily.
3. **Inter-dispatch gap.** Audio/visual engines take time to start/stop. Stacked directives like `[BG:rain][VIZ:waveform][BG:ocean]` need ~800ms between dispatches so engines don't fight each other.
4. **Fire and forget.** The dispatch is a side-effect on the runtime; don't `await` it inside the speech path. Speech should not block on engine churn.
5. **Prompt the AI sparingly.** Add the sentinel primer to your shared context as a *low-priority* block (e.g. priority 2 in your token-budget hierarchy) so it trims out under tight context. List the valid values explicitly, instruct "use sparingly, prefer at phase start, skip when current scene already fits".

**Hooking in:** put the extraction BEFORE your generic bracket-strip pass. The order matters because the generic strip would erase your sentinels if it ran first.

```js
// In speakScript or equivalent text-to-speech handler:
canonical = canonical.replace(/\[\[(.+?)\]\]/g, '\u0001$1\u0002'); // protect [[ ]] markers
const ext = extractSceneSentinels(canonical);
canonical = ext.stripped;
if (state.aiSceneDirectivesEnabled !== false) dispatchSceneSentinels(ext.dispatches);
canonical = canonical.replace(/\[[^\]]+\]/g, m =>
  /^\[PAUSE\s+\d+\]$/i.test(m) ? m : ''
); // generic strip — preserves PAUSE, erases everything else
```

This pattern generalizes beyond audio/visuals — any runtime side-effect the AI could meaningfully direct (camera angles in a 3D app, lighting in a scene generator, character moods in an RPG) fits the same shape.

---

## 13.5 · Gotchas & Known Issues

These are limitations of the Perchance engine itself — not bugs in any one app. They tend to bite in code review.

### 13.5.1 HTML elements inside square blocks (HTML editor panel)

The HTML panel renders innerHTML *first*, then evaluates square blocks in resulting text nodes. So this **breaks**:

```html
[p = "<p>hello</p>"]    <!-- ❌ HTML parser eats the brackets/tags first -->
```

Fixes:
1. Move construction into the Perchance code panel (preferred), or
2. Replace `<` with the JS unicode escape `\u003c`:

```html
[p = "\u003cp>hello\u003c/p>"]   <!-- ✅ -->
```

### 13.5.2 if/else needs its own square block

Already covered in 1.11 — it's the single most common syntax error. `[n=num.selectOne, if(n==4) {"a"} else {"b"}]` won't parse. Always split: `[n=num.selectOne, ""][if(n==4) {"a"} else {"b"}]`.

### 13.5.3 Inline lists re-evaluate on every access

```
foo = ["hello {1-100}"]
console.log(foo)   // outputs "hello 87" (or "hello 12", or "hello 99"...)
```

Each access re-rolls the inline `{1-100}`. If you need the *raw* value, wrap it in a function:

```
foo() => return "hello {1-100}"
console.log(foo())   // "hello {1-100}" — exactly as written
```

Square blocks **always** evaluate their contents before returning.

### 13.5.4 `x = {[a]|[b]}` returns plain text, not list refs

```
x = {[a]|[b]}
x.selectOne   // returns plain text from a or b — NOT a reference to the a/b list
```

If you want to randomly pick *which list* to draw from (preserving the list reference for `.pluralForm`, `.consumableList`, etc.), use `random-select-plugin` instead.

### 13.5.5 Indentation stripped inside list-editor JS functions

```
// In the LISTS panel:
myFunc() =>
  if (x) {
    doThing()    // indentation will be stripped at parse time
  }
```

Indentation inside JS functions defined in the **list editor** is removed. Functions in the **HTML panel** `<script>` tags keep their indentation. If you need precise whitespace for a multi-line string or template, build it in a script tag.

### 13.5.6 Backslash semantics

Perchance's escape rules differ from most languages:
- `\[` → `[` (literal bracket — correct as expected)
- `\s` → space
- `\o` → `\o` (the backslash is **kept** for non-escapable characters, unlike C/JS)
- `\\` → `\` (this is how you produce a literal backslash)

If your code runs inside a `<script>` tag vs. inside a square block, escape behavior may differ slightly. When in doubt, test both contexts.

### 13.5.7 JS objects in square blocks need outer parens

```
[{foo: 1}]      // ❌ parsed as a labelled statement (ancient JS feature)
[({foo: 1})]    // ✅ parens force expression-context
```

This is a JavaScript language wart, not a Perchance one — labelled statements look syntactically identical to object literals at statement position.

### 13.5.8 `update()` doesn't reset state

`update()` re-runs square blocks in the HTML, but **does not** clear variables, reset random seeds, or re-import generators. If you need a true fresh state (e.g., a "reroll" button that starts from scratch), reload the iframe / `location.reload()`.

### 13.5.9 Module scripts can't access lists by bare name

Already covered in 1.14: inside `<script type="module">`, write `root.animal.selectOne`, never `animal.selectOne`. Module scripts run with implicit `defer` and have a different scope chain.

---

## 14 · Code Review Checklist (Perchance-specific)

- [ ] All list functions use `async functionName() =>` syntax (not `function`)
- [ ] `$meta.dynamic` is fully self-contained (no `root.*` refs)
- [ ] `urlNamedCharacters` map **duplicated** inside `$meta.dynamic` — cannot use `root.*` there
- [ ] `stopSequences` always includes `"\n\n[["` for chat completions
- [ ] **Direct `root.aiTextPlugin` callers ALSO include `"\n[["`** — chat-format-bleed shows up with single newline too. The `aiGenerate` wrapper auto-merges both; direct callers must add manually.
- [ ] `hideStartWith: true` set when using `startWith` to avoid double-printing
- [ ] **`startWith: '{'` callers re-attach the brace + scan for matching `}` to defend against trailing chatter** — the option strips the opening brace from the response
- [ ] CORS-sensitive fetches in custom code use `superFetch`
- [ ] Token budget: `idealMaxContextTokens - 800` buffer to protect prefix cache
- [ ] `countTokens(text) > idealMaxContextTokens * 0.3` guard on role instructions
- [ ] `window.textEmbedderFunction` checked before calling `embedTexts()`
- [ ] `embedTexts()` called with `{ textArr, modelName }` object signature (not bare array)
- [ ] Share link JSON strips private user data (`id`, `lastMessageTime`, etc.)
- [ ] **Share path uses the three-tier cascade** — hash-share → upload → clipboard JSON. Hash-share is preferred (no server roundtrip, never expires, works on forks).
- [ ] **Upload calls pass `expires`** — 30 days default for ~50-100× quota boost. Permanent retention is rarely worth the quota tax.
- [ ] **`deletionUrl` from upload response is captured + persisted** — IDB ring buffer per-share with 3-day revoke window. Don't strand it in console logs.
- [ ] **Upload errors are matched specifically** — `/locked to specific domains/i` (allowlist), `disallowed_content` (moderation), `over_daily_allowance|file_too_big|invalid_filetype` (quota/shape). Each gets a different user-facing message.
- [ ] **DON'T override `window.generatorName`** to bypass the upload-plugin allowlist. Use hash-share fallback instead.
- [ ] `$meta.dynamic` covers all share URL shapes — `?data=…`, `#cfg=…`, `#kind=…` — with appropriate generic previews when the payload is opaque.
- [ ] Sandbox origin check: `event.origin === 'https://7deabe31ae18ea5ed27c5f71b9633999.perchance.org'`
- [ ] `data.stopReason === "error"` handled before using `data.generatedText`
- [ ] Summary injection batched (`summariesReadyToInject.length >= 3` before DB write)
- [ ] `window.__aiHierarchicalSummaryStuff[threadId].alreadyDoingSummary` mutex checked
- [ ] `CompressionStream` / `DecompressionStream` availability checked before use
- [ ] `uploadPlugin` `"disallowed_content"` error handled with under-18 clarification message
- [ ] iOS Safari `maximum-scale=1` viewport patch applied for touch devices
- [ ] `tryPersistBrowserStorageData()` called once at end of page load
- [ ] Mobile preload delayed: `if(window.innerWidth < 500) setTimeout(..., 5000)`
- [ ] **`secret-plugin` decrypts always wrapped in try/catch** — non-allowlisted senders or wrong keys throw, not return null.
- [ ] **`secret-plugin` keys validated by envelope** — `PUBLIC_…_PUBLIC_END` and `PRIVATE_…_PRIVATE_END` patterns. Reject obviously-malformed strings before decrypt.
- [ ] **Private keys never leave the device** — uploaded profiles ship `keys.public` only. Reader-access links are an opt-in second upload, never automatic.
- [ ] **Perchance HTTP API calls use `superFetch`** inside generators — plain `fetch` will be CORS-blocked. External apps (Discord bots, backends) use plain `fetch` and may need a CORS proxy.
- [ ] **Don't confuse `generateList.php` with the toolkit endpoints** — only `generateList.php` actually *runs* a generator. The five toolkit endpoints (`getGenerator*`, `downloadGenerator`) read static metadata.
- [ ] **`text-editor-plugin-v1` extensions added via `dispatch({ effects: appendConfig.of(...) })`**, not by re-creating the editor.
- [ ] `$meta.dynamic` `urlNamedCharacters` comment reminder: `// NOTE: must add named chars to $meta.dynamic too`
- [ ] **if/else lives in its own square block** — `[n=x.selectOne, ""][if(n==4) {"a"} else {"b"}]`, never combined.
- [ ] **Module scripts use `root.<list>`** — bare names don't resolve inside `<script type="module">`.
- [ ] **Inline-list raw values use functions, not `=`** — `foo() => return "{1-100}"` for the unevaluated form; `foo = ["{1-100}"]` re-rolls on every access.
- [ ] **Don't promise AI plugins on self-hosted/forked deployments** — `ai-text-plugin` and `text-to-image-plugin` are origin-locked to perchance.org. Recommend the proxy-via-perchance pattern instead.
- [ ] **HTML elements in HTML-panel square blocks need `\u003c`** — innerHTML parses before square blocks evaluate. Or move construction to the Perchance code panel.
- [ ] **JS objects in square blocks wrap with parens** — `[({foo:1})]`, never `[{foo:1}]` (avoids the labelled-statement trap).
- [ ] **`update()` is NOT a state reset** — it re-runs square blocks, but variables, randomness, and imports persist. Use `location.reload()` for a true reset.
- [ ] **Variables created in a list are visible only after their creation point** — left-to-right, top-to-bottom. `[n] said "[say]"` fails if `[say]` is what assigns `n`.
- [ ] **`evaluateItem` used when storing values that contain inline lists** — `[f = fruit.selectOne.evaluateItem]` to lock in a specific evaluation, otherwise `[f]` re-evaluates each access.

---

## Reference Files

- `references/data-model.md` — complete DB schema with upgrade/migration patterns
- `references/message-format.md` — full message serialization spec with all edge cases
- `references/plugin-api.md` — ai-text-plugin and text-to-image-plugin extended docs

Read a reference file when you need exhaustive detail on a specific subsystem.
