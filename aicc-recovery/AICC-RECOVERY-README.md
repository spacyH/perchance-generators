# AICC Save Recovery — standalone generator

A self-contained Perchance generator that recovers broken **AI Character Chat**
exports. No userscript, no account, no upload — everything runs locally in the
generator's sandboxed iframe.

## What it recovers

| File | What it is |
| :--- | :--------- |
| `…cbor.gz` | A full AICC database backup: `gzip( CBOR( { meta, stores } ) )` |
| `…gz` | A character share file: `gzip( JSON( { addCharacter, quickAdd } ) )` |
| `.cbor` / `.json` | The same payloads with the gzip layer already stripped |

It is built to tolerate **damage**. Each stage falls back instead of giving up:

1. **Decompress** — tries gzip; if the gzip stream is truncated/invalid, it
   falls back to treating the bytes as already-decompressed.
2. **Decode** — tries CBOR, then UTF-8 + JSON, then *scavenges* the first
   complete brace-balanced object out of partial/garbage text.
3. **Salvage** — rebuilds AICC's store arrays using AICC's own repair rules:
   characters are normalized to a bootable shape (and get a minted `uuid`/`id`
   where missing), threads with a dead `characterId` are recovered from their
   messages, and structurally broken messages/lore are dropped. A character with
   no id from a *full-DB* export is dropped (it can't be a valid row); from a
   *share* file an id is minted (normal — AICC assigns one on import).
4. **Re-export** — download a clean, re-importable **full backup**
   (`recovered.…cbor.gz`), a **characters-only** JSON, or a **per-character
   share file**, plus a readable report of exactly what was kept, recovered, or
   dropped.

## Install (as a Perchance generator)

1. Create a new generator on perchance.org.
2. Paste `aicc-recovery-top-panel.txt` into the **top (DSL) panel**.
3. Paste `aicc-recovery.html` into the **HTML panel**.
4. Save. Open the generator, drop a broken file on it, and follow the report.

## Importing a recovered full backup

The repaired `.cbor.gz` re-imports through AICC's own **import** button (on its
data page, which offers a delete-all + import flow), or via Weld Companion's
Data tab. Character files import through AICC's character **add/import**.

## Privacy

Nothing leaves the browser. The tool reads the file you choose, repairs it in
memory, and hands back downloads. There are no network calls except loading the
CBOR decoder library (the same one AICC itself uses) from its CDN.

## Tests

- `aicc-recovery.test.js` — 17 checks on the pure pipeline (extract / salvage /
  scavenge / decode fallbacks), runnable with `node aicc-recovery.test.js`.
- `aicc-recovery-e2e.test.js` — 6 checks that build a real `cbor.gz` with AICC's
  cbor-x library and prove the decompress→decode round-trip (plus truncated-gzip
  fallback). Needs `npm install cbor-x`.
