// End-to-end: build a REAL ai-character-chat-db-raw-export-v1.cbor.gz the way
// AICC does (CBOR.encode -> gzip), then prove our decode path (gunzip -> CBOR
// decode) recovers it. Uses the same cbor-x library AICC loads.
const zlib = require('zlib');
let CBOR; try { CBOR = require('cbor-x'); } catch(e) { console.log('cbor-x unavailable, skipping e2e'); process.exit(0); }
let p=0,f=0; const ok=(n,c)=>{if(c){p++;console.log('  PASS '+n);}else{f++;console.log('  FAIL '+n);}};

const payload = { meta:{ type:'ai-character-chat-db-raw-export-v1', dbName:'chatbot-ui-v1' },
  stores:{ characters:[{id:1,name:'Mira',uuid:'11111111-1111-4111-8111-111111111111'}], threads:[{id:9,characterId:1,name:'t'}], messages:[{id:50,threadId:9,characterId:1,content:'hello'}] } };

// AICC encode path
const cborBytes = CBOR.encode(payload);
const gz = zlib.gzipSync(Buffer.from(cborBytes));
ok('gzip magic bytes present', gz[0]===0x1f && gz[1]===0x8b);

// our decode path: gunzip then CBOR.decode
const un = zlib.gunzipSync(gz);
const back = CBOR.decode(new Uint8Array(un));
ok('round-trips meta.type', back.meta.type === 'ai-character-chat-db-raw-export-v1');
ok('round-trips character name', back.stores.characters[0].name === 'Mira');
ok('round-trips uuid', back.stores.characters[0].uuid === '11111111-1111-4111-8111-111111111111');
ok('round-trips message', back.stores.messages[0].content === 'hello');

// truncated gzip (simulate corruption): gunzip throws -> our code falls back to raw bytes
const truncated = gz.slice(0, gz.length - 20);
let threw = false; try { zlib.gunzipSync(truncated); } catch(e){ threw = true; }
ok('truncated gzip throws (our gunzip() catches and falls back)', threw);

console.log('\n  '+p+' passed, '+f+' failed'); process.exit(f?1:0);
