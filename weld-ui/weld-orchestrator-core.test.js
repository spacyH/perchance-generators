// Tests the orchestrator core over an in-memory shared bus with mock worker tabs.
const { createOrchestrator } = require('/tmp/orch/orchestrator-core.js');
let pass = 0, fail = 0;
function ok(n, c, e) { if (c) pass++; else { fail++; console.error('  FAIL: ' + n + (e ? ' -- ' + e : '')); } }

// shared in-memory bus = the cross-tab transport (BroadcastChannel stand-in)
function makeBus() {
  const subs = [];
  return {
    endpoint(id) {
      return {
        send: (msg) => setTimeout(() => subs.forEach(s => { if (s.id !== id) s.fn(msg); }), 0),
        onMessage: (fn) => subs.push({ id, fn })
      };
    }
  };
}

// a mock worker tab: registers as 'worker', answers 'task' by running a fake agent
function mockWorker(bus, id, workFn) {
  const t = bus.endpoint(id);
  const inbox = [];
  t.onMessage(async (msg) => {
    if (msg.type === 'task' && (msg.to === id || msg.to === 'worker' || msg.to === '*')) {
      const out = await workFn(msg.payload);
      t.send({ id: 'r', from: id, to: msg.from, type: 'result', corr: msg.corr, payload: out, t: Date.now() });
    }
  });
  // announce presence
  t.send({ id: 'reg', from: id, to: '*', type: 'register', role: 'worker', payload: { caps: ['agent'] }, t: Date.now() });
  return t;
}

(async () => {
  const bus = makeBus();
  const orch = createOrchestrator({ id: 'orch', transport: bus.endpoint('orch') });

  // bring up 3 worker tabs
  const order = [];
  mockWorker(bus, 'w1', async (task) => { order.push('w1-start'); await new Promise(r => setTimeout(r, 40)); return { by: 'w1', n: task.n * 2 }; });
  mockWorker(bus, 'w2', async (task) => { order.push('w2-start'); await new Promise(r => setTimeout(r, 40)); return { by: 'w2', n: task.n * 2 }; });
  mockWorker(bus, 'w3', async (task) => { order.push('w3-start'); await new Promise(r => setTimeout(r, 40)); return { by: 'w3', n: task.n * 2 }; });
  // a user tab
  const u = bus.endpoint('u1'); u.send({ id: 'reg', from: 'u1', to: '*', type: 'register', role: 'user', payload: {}, t: Date.now() });

  await new Promise(r => setTimeout(r, 20)); // let registrations land

  ok('registry: sees 3 workers', orch.workers().length === 3, 'got ' + orch.workers().length);
  ok('registry: sees 1 user', orch.users().length === 1);
  ok('registry: 4 peers total', orch.peers().length === 4);

  // single dispatch -> awaits that worker's result
  const one = await orch.dispatch('w1', { n: 5 }, 2000);
  ok('dispatch: single worker result', one.by === 'w1' && one.n === 10, JSON.stringify(one));

  // parallel fan-out: 3 tasks, concurrency 3 -> all start before any finishes (true parallel)
  order.length = 0;
  const t0 = Date.now();
  const many = await orch.dispatchMany([{ n: 1 }, { n: 2 }, { n: 3 }], { concurrency: 3, timeoutMs: 2000 });
  const elapsed = Date.now() - t0;
  ok('dispatchMany: results in order', many[0].n === 2 && many[1].n === 4 && many[2].n === 6, JSON.stringify(many));
  ok('dispatchMany: ran in parallel (all 3 started)', order.filter(x => /start/.test(x)).length === 3 && elapsed < 100, 'elapsed=' + elapsed + ' starts=' + order.length);

  // bounded concurrency: 4 tasks, concurrency 2 -> two waves
  let peakActive = 0, active = 0;
  function busyWorker(id) { const t = bus.endpoint(id); t.onMessage(async (m) => { if (m.type==='task' && (m.to===id||m.to==='worker')) { active++; peakActive=Math.max(peakActive,active); await new Promise(r=>setTimeout(r,30)); active--; t.send({id:'r',from:id,to:m.from,type:'result',corr:m.corr,payload:{ok:true},t:Date.now()}); } }); t.send({id:'reg',from:id,to:'*',type:'register',role:'worker',payload:{},t:Date.now()}); }
  const bus2 = makeBus(); const orch2 = createOrchestrator({ id: 'o2', transport: bus2.endpoint('o2') });
  ['x1','x2'].forEach(id => { const t = bus2.endpoint(id); t.onMessage(async (m)=>{ if(m.type==='task'&&(m.to===id||m.to==='worker')){active++;peakActive=Math.max(peakActive,active);await new Promise(r=>setTimeout(r,30));active--;t.send({id:'r',from:id,to:m.from,type:'result',corr:m.corr,payload:{ok:true},t:Date.now()});} }); t.send({id:'reg',from:id,to:'*',type:'register',role:'worker',payload:{},t:Date.now()}); });
  await new Promise(r => setTimeout(r, 20));
  await orch2.dispatchMany([{},{},{},{}], { concurrency: 2, timeoutMs: 2000 });
  ok('concurrency cap respected (peak <= 2)', peakActive <= 2 && peakActive >= 1, 'peak=' + peakActive);

  // presence pruning: a peer that stops heartbeating falls out after TTL
  const orch3 = createOrchestrator({ id: 'o3', transport: makeBus().endpoint('o3'), peerTTL: 50 });
  orch3._ingest({ from: 'ghost', type: 'register', role: 'worker', payload: {}, t: Date.now() });
  ok('presence: peer present before TTL', orch3.workers().length === 1);
  await new Promise(r => setTimeout(r, 70));
  ok('presence: peer pruned after TTL', orch3.workers().length === 0);

  // worker timeout surfaces as an error, not a hang
  const orch4 = createOrchestrator({ id: 'o4', transport: makeBus().endpoint('o4') });
  orch4._ingest({ from: 'silent', type: 'register', role: 'worker', payload: {}, t: Date.now() });
  let timedOut = false;
  try { await orch4.dispatch('silent', { n: 1 }, 60); } catch (e) { timedOut = /timeout/.test(e.message); }
  ok('dispatch: timeout surfaces as error', timedOut);

  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('harness error:', e && e.stack || e); process.exit(2); });
