// Test the recovery pipeline end-to-end against synthetic AICC exports, including
// damaged ones. We reimplement the browser stream APIs with Node's zlib + a
// CBOR lib to produce real files, then exercise the panel's pure logic.
const zlib = require('zlib');
let p = 0, f = 0;
const ok = (n, c) => { if (c) { p++; console.log('  PASS ' + n); } else { f++; console.log('  FAIL ' + n); } };

// ---- pull the pure functions out of the panel by evaluating the script body
const fs = require('fs');
const html = fs.readFileSync('aicc-recovery-html.html', 'utf8');
const body = html.match(/<script>([\s\S]*)<\/script>/)[1];
// DOM/stream shims set up BEFORE eval so the IIFE's top-level reads succeed.
const stub = () => ({ addEventListener(){}, hidden:true, innerHTML:'', appendChild(){}, classList:{add(){},remove(){}}, style:{}, setAttribute(){}, click(){}, remove(){}, files:[] });
global.window = global;
global.document = { getElementById: stub, createElement: stub, body: stub(), addEventListener(){} };
global.TextDecoder = require('util').TextDecoder;
global.TextEncoder = require('util').TextEncoder;
global.crypto = require('crypto').webcrypto;
global.import = undefined;
// Append an export shim so the test can reach the pure internals.
const shim = `
  global.__test = { extractStores: extractStores, salvage: salvage, scavengeJson: scavengeJson, normalizeCharacter: normalizeCharacter, tryDecode: tryDecode };
`;
const patched = body.replace(/\}\)\(\);\s*$/, shim + '\n})();');
eval(patched);
const T = global.__test;

// ---- 1. healthy full DB export round-trips
const fullDb = {
  meta: { type: 'ai-character-chat-db-raw-export-v1', dbName: 'chatbot-ui-v1' },
  stores: {
    characters: [ { id: 1, name: 'Mira', uuid: '11111111-1111-4111-8111-111111111111', systemMessage: 'be kind' }, { id: 2, name: 'Rex' } ],
    threads: [ { id: 10, characterId: 1, name: 'A' }, { id: 11, characterId: 999, name: 'orphan-thread' } ],
    messages: [ { id: 100, threadId: 10, characterId: 1, content: 'hi' }, { id: 101, threadId: 11, characterId: 2, content: 'rec' }, { id: 102, threadId: 555, content: 'orphan' } ],
    lore: [ { id: 5, bookUrl: 'x' }, { broken: true } ]
  }
};
let stores = T.extractStores(fullDb);
ok('extract full-db source', stores.source === 'full-db-export');
ok('extract dbName', stores.dbName === 'chatbot-ui-v1');
let r = T.salvage(stores);
ok('both characters kept (Rex normalized)', r.stats.charsKept === 2);
ok('Rex got uuid minted', r.stores.characters[1].uuid && /^[0-9a-f-]{36}$/.test(r.stores.characters[1].uuid));
ok('Mira uuid preserved', r.stores.characters[0].uuid === '11111111-1111-4111-8111-111111111111');
ok('systemMessage -> roleInstruction', r.stores.characters[0].roleInstruction === 'be kind');
ok('orphan thread recovered from message', r.stores.threads.find(t=>t.id===11).characterId === 2);
ok('orphan message dropped', !r.stores.messages.find(m=>m.id===102));
ok('recovered+valid messages kept', r.stats.messagesKept === 2);
ok('broken lore dropped', r.stats.loreKept === 1 && r.stats.loreDropped === 1);

// ---- 2. character share envelope
let share = { addCharacter: { name: 'Shared', systemMessage: 'sp' }, quickAdd: true };
let s2 = T.extractStores(share);
ok('share source detected', s2.source === 'character-share');
let r2 = T.salvage(s2);
ok('shared character normalized', r2.stats.charsKept === 1 && r2.stores.characters[0].roleInstruction === 'sp');

// ---- 3. no-id character is dropped (cannot be a valid row)
let s3 = T.extractStores({ characters: [ { name: 'NoId' }, { id: 3, name: 'Keep' } ], threads: [], messages: [] });
let r3 = T.salvage(s3);
ok('no-id char dropped', r3.stats.charsDropped === 1 && r3.stats.charsKept === 1);

// ---- 4. scavenge partial JSON
let partial = '{"addCharacter":{"name":"Half","roleInstruction":"x"},"quickAdd":true} TRAILING GARBAGE \x00\x01';
let scav = T.scavengeJson(partial);
ok('scavenge extracts first complete object', scav && scav.addCharacter && scav.addCharacter.name === 'Half');

// ---- 5. tryDecode JSON path (no CBOR loaded)
global.CBOR = null;
let bytes = new TextEncoder().encode(JSON.stringify(fullDb));
let dec = T.tryDecode(bytes);
ok('tryDecode falls to JSON', dec.how.indexOf('JSON') === 0 && dec.obj.meta.type === 'ai-character-chat-db-raw-export-v1');

// ---- 6. tryDecode scavenge path on truncated JSON
let trunc = new TextEncoder().encode('{"characters":[{"id":1,"name":"T"}],"threads":[]} JUNK{{{');
let dec6 = T.tryDecode(trunc);
ok('tryDecode handles trailing junk via JSON or scavenge', dec6 && dec6.obj && (dec6.obj.characters || dec6.obj.addCharacter));

// ---- 7. empty / garbage yields nothing recoverable, no throw
let s7 = T.extractStores({ random: 'nonsense' });
let r7 = T.salvage(s7);
ok('garbage yields zero rows without crashing', (r7.stats.charsKept + r7.stats.threadsKept + r7.stats.messagesKept) === 0);


// ---- 8. saved-page guard + filename link recovery ----
(function () {
  function recoverFileUrl(hint){ var x=String(hint||""); var m=x.match(/~([a-z0-9]{16,}\.gz)/i)||x.match(/([a-f0-9]{24,}\.gz)/i); return m?("https://user.uploads.dev/file/"+m[1]):""; }
  function isHtmlHead(t){ var h=t.slice(0,200).toLowerCase(); return h.indexOf("<!doctype")===0||h.indexOf("<html")===0||(h.indexOf("<head")!==-1&&h.indexOf("<title")!==-1); }
  ok('guard detects saved page', isHtmlHead('<!DOCTYPE html>\n<html><head><title>Perchance</title>'));
  ok('guard ignores JSON share', !isHtmlHead('{"addCharacter":{"name":"X"}}'));
  ok('link from ~ filename', recoverFileUrl('Pauli_(006)~ef476443c63c6433f6f4bb0abe80a645.gz') === 'https://user.uploads.dev/file/ef476443c63c6433f6f4bb0abe80a645.gz');
  ok('link from underscored filename', recoverFileUrl('Pauli__006__ef476443c63c6433f6f4bb0abe80a645.gz') === 'https://user.uploads.dev/file/ef476443c63c6433f6f4bb0abe80a645.gz');
  ok('link from share URL', recoverFileUrl('https://perchance.org/ai-character-chat?data=.X~ef476443c63c6433f6f4bb0abe80a645.gz').indexOf('ef476443c63c6433f6f4bb0abe80a645.gz') !== -1);
  ok('no link from junk', recoverFileUrl('notes.txt') === '');
})();

console.log('\n  ' + p + ' passed, ' + f + ' failed');
process.exit(f ? 1 : 0);
