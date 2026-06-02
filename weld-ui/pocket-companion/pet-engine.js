/* =====================================================================
 * Pocket Companion — core pet engine
 * ---------------------------------------------------------------------
 * Pure, framework-agnostic logic for a Tamagotchi-style virtual pet.
 * NO DOM, NO Date.now() inside — every entry point takes an explicit
 * `now` (ms) and a `cfg` (tunables) so it is fully deterministic and
 * unit-testable. The Perchance HTML panel inlines this verbatim and
 * supplies `now = Date.now()` + the user's settings at each call site.
 *
 * Design decisions (locked with the user):
 *  - Companion-first: stats SHAPE the chat voice; chat is the centre.
 *  - Gentle: stats can bottom out (misery) but the pet NEVER dies.
 *  - Body is an AI cutout sprite; engine only produces the *prompt* and
 *    a stable seed, the HTML layer drives weld.image + weld.background.
 *
 * Stats are all 0..100. Higher = better (fullness, energy, happiness,
 * cleanliness, health, bond). "Hunger" is the inverse of fullness, etc.
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PetEngine = api;
})(this, function () {
  "use strict";

  var STAT_KEYS = ["fullness", "energy", "happiness", "cleanliness", "health", "bond"];
  var STAGES = ["egg", "baby", "child", "teen", "adult"];

  // ---- Tunables -----------------------------------------------------
  // Per-minute decay while awake, at timeScale 1. Health is derived
  // (cascades from neglect) rather than decayed directly.
  var DEFAULT_CFG = {
    timeScale: 1,            // multiplier on elapsed real time (settings: chill .5 / normal 1 / lively 2 / demo 120)
    maxCatchupMin: 4320,     // cap a single catch-up at 3 days of decay (gentle: a long absence won't nuke everything)
    stepMin: 5,              // simulation granularity
    decay: {                 // points lost per minute, awake
      fullness: 0.110,
      energy: 0.070,
      happiness: 0.055,
      cleanliness: 0.045,
      bond: 0.015
    },
    sleepEnergyRegen: 0.55,  // energy gained per minute asleep
    healthRegen: 0.040,      // health gained per minute when all is well
    healthDrop: 0.090,       // health lost per minute under active neglect/illness
    healthFloor: 1,          // gentle: never reaches 0
    poopIntervalMin: 220,    // ~ how often a fed pet leaves a mess
    poopMax: 6,
    poopHygienePerMin: 0.030, // cleanliness lost per poop per minute
    illnessOnsetMin: 90,     // sustained-neglect minutes before sickness sets in
    illnessClearMin: 60,     // minutes of good care to shake off neglect pressure
    // Stage gates in real minutes (timeScale divides these).
    stageMinutes: { egg: 3, baby: 1440, child: 4320, teen: 10080 } // adult is terminal
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function mergeCfg(cfg) {
    cfg = cfg || {};
    var out = JSON.parse(JSON.stringify(DEFAULT_CFG));
    for (var k in cfg) {
      if (k === "decay" || k === "stageMinutes") {
        out[k] = Object.assign({}, out[k], cfg[k] || {});
      } else if (cfg[k] !== undefined) {
        out[k] = cfg[k];
      }
    }
    return out;
  }

  // ---- Construction -------------------------------------------------
  function createPet(opts) {
    opts = opts || {};
    var now = num(opts.now, 0);
    return {
      v: 2,
      name: String(opts.name || "Pip").slice(0, 40),
      appearance: String(opts.appearance || "").slice(0, 600), // user-authored sprite prompt
      spriteSeed: (opts.spriteSeed != null) ? (opts.spriteSeed | 0)
                  : Math.floor((opts.rand ? opts.rand() : 0.5) * 1000000),
      bornAt: now,
      lastTick: now,
      stage: "egg",
      form: "bright",        // care-quality flavour baked into the sprite prompt at each evolution
      sprites: {},           // stage -> dataURL (filled by the HTML layer)
      stats: { fullness: 80, energy: 90, happiness: 75, cleanliness: 90, health: 92, bond: 20 },
      flags: { sick: false, sleeping: false, poop: 0 },
      acc: { poopTimer: 0, neglectMin: 0, careScore: 70 },
      cooldowns: {},         // action -> ms-until-allowed (absolute timestamps)
      stats_seenStage: "egg" // last stage the UI celebrated; lets caller detect evolutions
    };
  }

  // ---- Time integration --------------------------------------------
  // Advance the pet from state.lastTick to `now`, applying decay,
  // pooping, illness onset/recovery, health cascade and sleep regen.
  // Returns { state, events:[...] } where events are discrete things the
  // UI may want to react to: "pooped", "fellAsleep"/"wokeUp", "gotSick",
  // "recovered".
  function tick(stateIn, now, cfg) {
    cfg = mergeCfg(cfg);
    var s = JSON.parse(JSON.stringify(stateIn));
    now = num(now, s.lastTick);
    var events = [];
    var realMin = (now - s.lastTick) / 60000;
    if (realMin <= 0) { s.lastTick = now; return { state: s, events: events }; }

    var simMin = Math.min(realMin * cfg.timeScale, cfg.maxCatchupMin);
    var remaining = simMin;
    var step = cfg.stepMin;
    var wasSick = !!s.flags.sick;

    while (remaining > 0.0001) {
      var dt = Math.min(step, remaining);
      remaining -= dt;
      integrateStep(s, dt, cfg, events);
    }

    // Auto-wake when fully rested.
    if (s.flags.sleeping && s.stats.energy >= 99) {
      s.flags.sleeping = false;
      events.push("wokeUp");
    }
    if (!wasSick && s.flags.sick) events.push("gotSick");
    if (wasSick && !s.flags.sick) events.push("recovered");

    s.lastTick = now;
    return { state: s, events: events };
  }

  function integrateStep(s, dt, cfg, events) {
    var st = s.stats, fl = s.flags, ac = s.acc, d = cfg.decay;

    // --- core decays
    st.fullness   = clamp(st.fullness   - d.fullness * dt, 0, 100);
    st.cleanliness = clamp(st.cleanliness - d.cleanliness * dt, 0, 100);
    st.bond       = clamp(st.bond       - d.bond * dt, 0, 100);

    if (fl.sleeping) {
      st.energy = clamp(st.energy + cfg.sleepEnergyRegen * dt, 0, 100);
    } else {
      st.energy = clamp(st.energy - d.energy * dt, 0, 100);
    }

    // happiness decays, faster when other needs are unmet
    var unmet = 0;
    if (st.fullness < 25) unmet++;
    if (st.cleanliness < 25) unmet++;
    if (st.energy < 20) unmet++;
    if (fl.sick) unmet++;
    var happyDecay = d.happiness * (1 + 0.6 * unmet);
    st.happiness = clamp(st.happiness - happyDecay * dt, 0, 100);

    // --- pooping (only a hatched pet)
    if (s.stage !== "egg") {
      ac.poopTimer += dt;
      while (ac.poopTimer >= cfg.poopIntervalMin && fl.poop < cfg.poopMax) {
        ac.poopTimer -= cfg.poopIntervalMin;
        fl.poop += 1;
        events.push("pooped");
      }
      if (fl.poop >= cfg.poopMax) ac.poopTimer = 0;
      // mess drags cleanliness down
      if (fl.poop > 0) {
        st.cleanliness = clamp(st.cleanliness - cfg.poopHygienePerMin * fl.poop * dt, 0, 100);
      }
    }

    // --- neglect pressure -> illness (gentle, recoverable)
    var neglected = (st.fullness < 15) || (st.cleanliness < 10) || (fl.poop >= 4) || (st.health < 25);
    if (neglected) {
      ac.neglectMin += dt;
    } else {
      ac.neglectMin = Math.max(0, ac.neglectMin - (dt * (cfg.illnessOnsetMin / cfg.illnessClearMin)));
    }
    if (!fl.sick && ac.neglectMin >= cfg.illnessOnsetMin) fl.sick = true;
    if (fl.sick && ac.neglectMin <= 0 && !neglected) fl.sick = false;

    // --- health cascade
    var harming = fl.sick || st.fullness < 20 || st.cleanliness < 20;
    if (harming) {
      st.health = clamp(st.health - cfg.healthDrop * dt, cfg.healthFloor, 100);
    } else if (st.fullness > 40 && st.cleanliness > 40 && st.energy > 25) {
      st.health = clamp(st.health + cfg.healthRegen * dt, cfg.healthFloor, 100);
    }

    // --- care score: slow rolling average of overall wellbeing (drives evolution form)
    var wellbeing = (st.fullness + st.energy + st.happiness + st.cleanliness + st.health) / 5;
    var alpha = clamp(dt / 720, 0, 1); // ~12h to substantially shift
    ac.careScore = clamp(ac.careScore + (wellbeing - ac.careScore) * alpha, 0, 100);
  }

  // ---- Stage / evolution -------------------------------------------
  function ageMinutes(s, now) { return (num(now, s.lastTick) - s.bornAt) / 60000; }

  // The stage the pet *should* be at, by scaled age.
  function stageFor(s, now, cfg) {
    cfg = mergeCfg(cfg);
    var aMin = ageMinutes(s, now) * cfg.timeScale;
    var g = cfg.stageMinutes;
    if (aMin < g.egg) return "egg";
    if (aMin < g.egg + g.baby) return "baby";
    if (aMin < g.egg + g.baby + g.child) return "child";
    if (aMin < g.egg + g.baby + g.child + g.teen) return "teen";
    return "adult";
  }

  function formFor(careScore) {
    if (careScore >= 78) return "radiant";
    if (careScore >= 55) return "bright";
    if (careScore >= 32) return "scruffy";
    return "frazzled";
  }

  // Returns { evolved:bool, from, to, form } and MUTATES the stage/form
  // on the returned state when an evolution is due. Caller regenerates
  // the sprite + celebrates when evolved.
  function checkEvolution(stateIn, now, cfg) {
    var s = JSON.parse(JSON.stringify(stateIn));
    var target = stageFor(s, now, cfg);
    if (STAGES.indexOf(target) > STAGES.indexOf(s.stage)) {
      var from = s.stage;
      s.stage = target;
      s.form = formFor(s.acc.careScore);
      // hatching gives a little bond + happiness bump
      if (from === "egg") {
        s.stats.bond = clamp(s.stats.bond + 10, 0, 100);
        s.stats.happiness = clamp(s.stats.happiness + 10, 0, 100);
      }
      return { evolved: true, from: from, to: target, form: s.form, state: s };
    }
    return { evolved: false, from: s.stage, to: s.stage, form: s.form, state: s };
  }

  // ---- Mood --------------------------------------------------------
  // Single most-pressing mood + a 0..1 intensity. Drives both the chat
  // persona and the sprite pose/expression.
  function mood(s) {
    var st = s.stats, fl = s.flags;
    if (s.stage === "egg") return { key: "egg", label: "dormant", intensity: 0.2, need: null };
    if (fl.sick) return { key: "sick", label: "sick", intensity: clamp((30 - st.health) / 30, 0.4, 1), need: "heal" };
    if (fl.sleeping) return { key: "sleepy", label: "asleep", intensity: 0.6, need: null };

    var candidates = [
      { key: "hungry",  label: "hungry",    val: st.fullness,    need: "feed" },
      { key: "tired",   label: "exhausted", val: st.energy,      need: "sleep" },
      { key: "dirty",   label: "grubby",    val: st.cleanliness, need: "clean" },
      { key: "lonely",  label: "lonely",    val: st.bond,        need: "talk" },
      { key: "sad",     label: "down",      val: st.happiness,   need: "play" }
    ];
    var worst = null;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c.val < 30 && (!worst || c.val < worst.val)) worst = c;
    }
    if (worst) return { key: worst.key, label: worst.label, intensity: clamp((30 - worst.val) / 30, 0.3, 1), need: worst.need };

    var avg = (st.fullness + st.energy + st.happiness + st.cleanliness + st.health) / 5;
    if (avg >= 85 && st.happiness >= 80) return { key: "ecstatic", label: "overjoyed", intensity: 0.9, need: null };
    if (avg >= 65) return { key: "content", label: "content", intensity: 0.5, need: null };
    return { key: "meh", label: "so-so", intensity: 0.4, need: null };
  }

  // Ordered list of needs worth nudging the user about (for toasts).
  function needsAttention(s) {
    var out = [];
    if (s.stage === "egg") return out;
    var st = s.stats, fl = s.flags;
    if (fl.sick) out.push({ need: "heal", urgency: 3, msg: s.name + " is sick and needs medicine." });
    if (st.fullness < 20) out.push({ need: "feed", urgency: fl.sick ? 2 : 3, msg: s.name + " is very hungry." });
    if (fl.poop >= 3 || st.cleanliness < 20) out.push({ need: "clean", urgency: 2, msg: s.name + "'s space needs cleaning." });
    if (st.energy < 15 && !fl.sleeping) out.push({ need: "sleep", urgency: 2, msg: s.name + " is worn out." });
    if (st.bond < 20) out.push({ need: "talk", urgency: 1, msg: s.name + " misses you." });
    if (st.happiness < 20) out.push({ need: "play", urgency: 1, msg: s.name + " is feeling low." });
    out.sort(function (a, b) { return b.urgency - a.urgency; });
    return out;
  }

  // ---- Actions ------------------------------------------------------
  var ACTIONS = {
    feed:  { cool: 90000,  apply: function (st, fl) { st.fullness = clamp(st.fullness + 35, 0, 100); st.happiness = clamp(st.happiness + 4, 0, 100); } },
    snack: { cool: 45000,  apply: function (st, fl) { st.fullness = clamp(st.fullness + 12, 0, 100); st.happiness = clamp(st.happiness + 8, 0, 100); st.health = clamp(st.health - 1, 1, 100); } },
    play:  { cool: 60000,  apply: function (st, fl) { st.happiness = clamp(st.happiness + 25, 0, 100); st.bond = clamp(st.bond + 8, 0, 100); st.energy = clamp(st.energy - 10, 0, 100); st.fullness = clamp(st.fullness - 4, 0, 100); } },
    clean: { cool: 30000,  apply: function (st, fl) { st.cleanliness = 100; fl.poop = 0; st.happiness = clamp(st.happiness + 3, 0, 100); } },
    heal:  { cool: 120000, apply: function (st, fl, ac) { fl.sick = false; ac.neglectMin = 0; st.health = clamp(st.health + 30, 1, 100); st.happiness = clamp(st.happiness - 5, 0, 100); } },
    pet:   { cool: 20000,  apply: function (st, fl) { st.bond = clamp(st.bond + 5, 0, 100); st.happiness = clamp(st.happiness + 6, 0, 100); } }
  };

  // Toggle-style: sleep is not in ACTIONS because it flips a flag.
  function act(stateIn, action, now, cfg) {
    var s = JSON.parse(JSON.stringify(stateIn));
    now = num(now, s.lastTick);

    if (s.stage === "egg") return { state: s, ok: false, reason: "egg", msg: "The egg just needs a little warmth and time." };

    if (action === "sleep") {
      s.flags.sleeping = !s.flags.sleeping;
      return { state: s, ok: true, msg: s.flags.sleeping ? (s.name + " curls up to sleep.") : (s.name + " wakes up.") };
    }
    if (action === "heal" && !s.flags.sick && s.stats.health > 70) {
      return { state: s, ok: false, reason: "not-needed", msg: s.name + " is perfectly healthy right now." };
    }

    var def = ACTIONS[action];
    if (!def) return { state: s, ok: false, reason: "unknown", msg: "Unknown action." };

    var until = s.cooldowns[action] || 0;
    if (now < until) {
      return { state: s, ok: false, reason: "cooldown", waitMs: until - now, msg: s.name + " isn't ready for that yet." };
    }
    // Acting while asleep wakes the pet (except heal).
    if (s.flags.sleeping && action !== "heal") s.flags.sleeping = false;

    def.apply(s.stats, s.flags, s.acc);
    s.cooldowns[action] = now + def.cool;
    return { state: s, ok: true, msg: actionMsg(action, s) };
  }

  function actionMsg(action, s) {
    var n = s.name;
    switch (action) {
      case "feed":  return n + " happily eats a full meal.";
      case "snack": return n + " nibbles a treat.";
      case "play":  return "You play with " + n + ".";
      case "clean": return "All tidy! " + n + " looks fresh.";
      case "heal":  return "You give " + n + " some medicine.";
      case "pet":   return n + " leans into your hand.";
      default:      return "";
    }
  }

  function cooldownLeft(s, action, now) {
    var until = (s.cooldowns && s.cooldowns[action]) || 0;
    return Math.max(0, until - num(now, 0));
  }

  // ---- Sprite prompt -----------------------------------------------
  // Build the text-to-image prompt for the CURRENT stage + mood, on top
  // of the user's authored appearance. Kept free of bracket- and brace-
  // shaped DSL tokens so it is safe to inline inside a Perchance panel.
  var STAGE_DESC = {
    egg: "a softly glowing speckled egg, smooth shell",
    baby: "as a tiny wide-eyed newborn, oversized head, stubby limbs, adorable",
    child: "as a small playful youngster, energetic, rounded features",
    teen: "as a lanky adolescent, taller, more defined features",
    adult: "as a fully grown adult, confident, majestic"
  };
  var MOOD_POSE = {
    egg: "resting still, gentle highlight",
    sick: "looking unwell and droopy, small sweat drop, pale",
    sleepy: "curled up sleeping, eyes closed, peaceful",
    hungry: "looking hungry, pleading eyes, tummy rumbling",
    tired: "yawning, heavy eyelids, sleepy",
    dirty: "a bit messy and dishevelled, smudges",
    lonely: "looking up hopefully, longing expression",
    sad: "downcast, ears lowered, melancholy",
    content: "relaxed and content, soft smile",
    ecstatic: "beaming with joy, sparkling eyes, mid-bounce",
    meh: "neutral calm expression"
  };
  var FORM_DESC = {
    radiant: "glowing with health, glossy, vibrant colours",
    bright: "healthy and bright",
    scruffy: "a little scruffy and unkempt",
    frazzled: "worn and frazzled, tired-looking"
  };

  function spritePrompt(s, opts) {
    opts = opts || {};
    var m = opts.mood || mood(s);
    var parts = [];
    var base = String(s.appearance || "a cute round fantasy creature").trim();
    parts.push(base);
    parts.push(STAGE_DESC[s.stage] || "");
    if (s.stage !== "egg") {
      parts.push(FORM_DESC[s.form] || "");
      parts.push(MOOD_POSE[m.key] || MOOD_POSE.content);
    } else {
      parts.push(MOOD_POSE.egg);
    }
    // Framing that makes the background removal clean.
    parts.push("full body, centered, single subject, simple flat pastel background, soft studio lighting, cute illustrated mascot style, high detail");
    return parts.filter(Boolean).join(", ");
  }

  // ---- Chat persona block ------------------------------------------
  // Text injected into the chat instruction so the model's voice matches
  // the pet's species, life stage and current state. The HTML layer may
  // additionally fold in weld.persona.mood() cues.
  function personaBlock(s) {
    var m = mood(s);
    var st = s.stats;
    var lines = [];
    lines.push("You ARE " + s.name + ", a living virtual pet creature the user is raising. Stay fully in character as the pet — never break character, never describe yourself as an AI.");
    lines.push("Appearance: " + (s.appearance || "a small cute creature") + ".");
    lines.push("Life stage: " + s.stage + (s.stage === "baby" ? " (you can only babble simple words and sounds)" :
                s.stage === "child" ? " (you speak in short, excitable, simple sentences)" :
                s.stage === "teen" ? " (you are chatty, a little cheeky and dramatic)" :
                s.stage === "adult" ? " (you are articulate, warm and expressive)" : "") + ".");
    lines.push("Right now you feel: " + m.label + ".");
    lines.push("Your needs (0=empty, 100=full): hunger " + Math.round(st.fullness) +
               ", energy " + Math.round(st.energy) + ", happiness " + Math.round(st.happiness) +
               ", cleanliness " + Math.round(st.cleanliness) + ", health " + Math.round(st.health) +
               ", bond with the user " + Math.round(st.bond) + ".");
    if (m.need === "feed") lines.push("Let your hunger colour your reply — you might beg for food.");
    if (m.need === "sleep") lines.push("You are drowsy; your words trail off sleepily.");
    if (m.need === "clean") lines.push("You feel grubby and a bit grumpy about it.");
    if (m.need === "heal") lines.push("You feel poorly and weak; be a little pitiful.");
    if (m.need === "play") lines.push("You crave attention and fun.");
    if (m.need === "talk" || st.bond < 25) lines.push("You have missed the user and are happy they are here.");
    if (m.key === "ecstatic") lines.push("You are bursting with joy and affection.");
    lines.push("Keep replies short, warm and creature-like. Show feeling through actions in *asterisks* where it fits.");
    return lines.join("\n");
  }

  function statusLine(s) {
    if (s.stage === "egg") return "A quiet egg, waiting to hatch…";
    var m = mood(s);
    if (s.flags.sleeping) return s.name + " is fast asleep 💤";
    if (s.flags.sick) return s.name + " is feeling sick 🤒";
    var n = needsAttention(s);
    if (n.length) return n[0].msg;
    return s.name + " is " + m.label + ".";
  }

  return {
    STAT_KEYS: STAT_KEYS, STAGES: STAGES, DEFAULT_CFG: DEFAULT_CFG,
    createPet: createPet,
    tick: tick,
    act: act,
    cooldownLeft: cooldownLeft,
    stageFor: stageFor,
    checkEvolution: checkEvolution,
    formFor: formFor,
    mood: mood,
    needsAttention: needsAttention,
    spritePrompt: spritePrompt,
    personaBlock: personaBlock,
    statusLine: statusLine,
    ageMinutes: ageMinutes,
    _clamp: clamp, _mergeCfg: mergeCfg
  };
});
