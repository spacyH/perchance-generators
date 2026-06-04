// weld orchestrator core -- the companion's "brain" for cross-tab, multi-agent work.
// Transport-injected so it is unit-testable without a browser. In production the
// transport is a BroadcastChannel on the perchance.org apex origin (shared across
// all same-origin top frames) backed by GM storage for a durable registry/queue.
//
//   roles: 'user' (a Perchance chat = the human), 'worker' (a tab running weld.agent)
//   message: { id, from, to, type, payload, corr?, t }   to = genId | role | '*'
function createOrchestrator(env) {
  env = env || {};
  var transport = env.transport;            // { send(msg), onMessage(fn) }
  var now = env.now || Date.now;
  var TTL = env.peerTTL || 8000;
  var selfId = env.id || 'orchestrator';
  var peers = {};                           // genId -> { genId, role, caps, lastSeen }
  var handlers = {};                        // type -> [fn]
  var pending = {};                         // corr -> { resolve, reject, timer }
  var seq = 0;
  function uid(p) { return (p || 'm_') + (now()).toString(36) + '_' + (++seq); }
  function emit(type, msg) { (handlers[type] || []).forEach(function (f) { try { f(msg); } catch (e) {} }); }

  function on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); return function () { handlers[type] = handlers[type].filter(function (f) { return f !== fn; }); }; }

  function touch(genId, role, caps) { peers[genId] = { genId: genId, role: role || (peers[genId] && peers[genId].role), caps: caps || (peers[genId] && peers[genId].caps) || [], lastSeen: now() }; }
  function livePeers(role) { var t = now(); return Object.keys(peers).map(function (k) { return peers[k]; }).filter(function (p) { return (t - p.lastSeen) < TTL && (!role || p.role === role); }); }

  function handleIncoming(msg) {
    if (!msg || !msg.type || msg.from === selfId) return;
    if (msg.type === 'register') { touch(msg.from, msg.role, msg.payload && msg.payload.caps); emit('peer', peers[msg.from]); return; }
    if (msg.type === 'heartbeat') { touch(msg.from); return; }
    if (msg.type === 'bye') { delete peers[msg.from]; emit('peerleave', { genId: msg.from }); return; }
    if (peers[msg.from]) peers[msg.from].lastSeen = now();
    if (msg.type === 'result' && msg.corr && pending[msg.corr]) { var p = pending[msg.corr]; clearTimeout(p.timer); delete pending[msg.corr]; p.resolve(msg.payload); return; }
    if (msg.to && msg.to !== selfId && msg.to !== '*' && peers[msg.to] === undefined && !livePeers(msg.to).length) { /* not for us / unknown */ }
    emit(msg.type, msg); emit('message', msg);
  }
  if (transport && transport.onMessage) transport.onMessage(handleIncoming);

  function send(to, type, payload, opts) {
    var msg = { id: uid(), from: selfId, to: to, type: type, payload: payload, t: now() };
    if (opts && opts.corr) msg.corr = opts.corr;
    transport.send(msg);
    return msg.id;
  }

  // assign one task to one worker, await its 'result' (request/response over the bus)
  function dispatch(workerId, task, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var corr = uid('c_');
      var timer = setTimeout(function () { delete pending[corr]; reject(new Error('worker timeout: ' + workerId)); }, timeoutMs || 30000);
      pending[corr] = { resolve: resolve, reject: reject, timer: timer };
      send(workerId, 'task', task, { corr: corr });
    });
  }

  // fan tasks out across live workers with bounded concurrency -> results in order
  function dispatchMany(tasks, opts) {
    opts = opts || {};
    var workers = livePeers('worker');
    if (!workers.length) return Promise.reject(new Error('no workers available'));
    var limit = opts.concurrency || workers.length;
    var results = new Array(tasks.length); var done = 0; var next = 0; var active = 0;
    return new Promise(function (resolve) {
      function settle(idx, val) { results[idx] = val; done++; active--; if (done === tasks.length) resolve(results); else pump(); }
      function pump() {
        while (active < limit && next < tasks.length) {
          (function (idx) {
            active++;
            var w = workers[idx % workers.length];
            dispatch(w.genId, tasks[idx], opts.timeoutMs).then(function (r) { settle(idx, r); }, function (e) { settle(idx, { error: String(e && e.message || e) }); });
          })(next++);
        }
      }
      pump();
    });
  }

  return {
    selfId: selfId,
    on: on,
    send: send,
    peers: function () { return livePeers(); },
    workers: function () { return livePeers('worker'); },
    users: function () { return livePeers('user'); },
    dispatch: dispatch,
    dispatchMany: dispatchMany,
    _ingest: handleIncoming   // exposed for tests
  };
}
if (typeof module !== 'undefined') module.exports = { createOrchestrator: createOrchestrator };
