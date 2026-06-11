# respool — for perchance.org

Rewind an **ai-character-chat** session and watch its **Memories** re-form, in
order, as if the chat were being replayed — with a scrubbable playhead and a live
time-scale slider.

It can either **regenerate** memories with real AI calls (the true pipeline) or
**replay** the memories already stored in the file (instant, no AI).

---

## Files

| File | Where it goes on Perchance |
|---|---|
| `respool-lists.txt` | the **top editor** (the lists/DSL tab) |
| `respool.html` | the **HTML** tab |

Create a new generator, paste the lists into the top editor, paste the HTML into
the HTML tab, save, and open it.

---

## How to use

1. **Load a chat.** Paste an ai-character-chat link, or drop an exported save:
   - `…cbor.gz` — a full "raw database export" (the emergency-export backup)
   - `…gz` / `…json` — a Dexie thread/character export
   - `…zip` — any of the above inside a zip
   - a `perchance.org/ai-character-chat?data=Name~hash` share link (note: a
     *character* share link has no chat thread to replay)
2. **Pick a thread.** You'll see every thread in the file, labelled by character
   and message count. Choose one.
3. **Watch it build.** Press **Play**. The transcript advances and memories pop
   into the right-hand column at the points where the chat would actually
   summarise.

### Controls

- **Source** — `Regenerate (live AI)` runs the real summary + memory-extraction
  prompts block-by-block, in order; `Replay from file` shows the memories already
  stored on the messages (no AI, instant).
- **Timing** — `Faithful (bursts)` reproduces the real app: memories appear only
  when the running conversation crosses the context budget, condensing the oldest
  ~1500 characters into up to 3 timeless facts. `Simple` runs a memory pass every
  ~1500 characters of chat.
- **Time scale** — slows the playhead down to study each memory, or pushes it to
  **instant** ("without delay"). In live-AI mode the playhead never outruns
  generation; at instant it jumps to the end as fast as the backend allows.
- **Playhead** — scrub to any point; the memory list rebuilds to match.

---

## How "regenerate" works (faithful to the real pipeline)

The real character chat doesn't make a memory per message. It waits until the
running context exceeds `idealMaxContextTokens − 800`, then condenses the oldest
~1500 characters into one summary **and** (if memories are enabled) up to three
*timeless* fact entries, repeating as the chat grows. This tool reproduces that
timing, then fires the same two prompts per block:

- a **summary** prompt (single paragraph, ~half length), and
- a **memory** prompt (up to 3 self-contained timeless facts, real names not
  pronouns), parsed the same way the app parses them.

The summary and memory calls for a block run in parallel and use a shared context
prefix, mirroring the app's prefix-cache-friendly structure.

> A short thread may legitimately produce **zero** memories in Faithful mode —
> that's correct; the real app wouldn't summarise it yet. Switch to **Simple** to
> force memory passes anyway.

Embeddings are intentionally **not** computed — they're only used for retrieval
during a live chat, not for viewing the memories.

---

## Notes & limits

- Higher-level summaries (summaries-of-summaries) are modelled for context
  accounting but, like the real app, only **level-1** blocks produce memories.
- `seed` is not honoured by the platform and no images are generated here.
- Live-AI mode needs to run on perchance.org (the `ai-text-plugin` broker only
  works inside a real generator page). The loader, parsing, timing model and
  "Replay from file" mode all work without any AI.
- Big `.cbor.gz` backups load a CBOR decoder and (for zips) `fflate` from
  jsDelivr on first use.

made by **west-ninja** · deviantart.com/west-ninja · github.com/therealwestninja
