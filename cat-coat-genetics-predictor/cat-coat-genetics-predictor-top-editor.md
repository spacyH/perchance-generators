$meta
  title = Cat Coat Genetics
  description = 12-locus Perchance plugin for domestic cat coat inheritance. Predict kitten phenotype distributions, infer unknown parents from observed offspring, generate random cats, and render tinted SVG avatars.
  tags = plugin, cats, genetics, library, science
  header
    mode = minimal

// Plugin API. Built by $output, cached on window for both own-panel and importer access.
// Importers alias this generator and invoke the alias as a function from panel JS;
// the return value crosses the DSL to JS bridge for imported plugins.
// The plugins own panel triggers $output and then reads window.__catCoatGenetics
// because own-panel DSL function returns do not cross the bridge per gotcha 0.4.

$output(args) =>
  if (window.__catCoatGenetics) return window.__catCoatGenetics;

  // -------- gamete distributions --------
  function autosomalGametes(g) {
    var a = g.charAt(0), b = g.charAt(1);
    var o = {};
    if (a === b) { o[a] = 1.0; return o; }
    o[a] = 0.5; o[b] = 0.5;
    return o;
  }
  function combineAutosomal(gA, gB) {
    var out = {};
    var keysA = Object.keys(gA), keysB = Object.keys(gB);
    for (var ai = 0; ai < keysA.length; ai++) {
      for (var bi = 0; bi < keysB.length; bi++) {
        var a = keysA[ai], b = keysB[bi];
        var sorted = [a, b].sort();
        var geno = sorted[0] + sorted[1];
        out[geno] = (out[geno] || 0) + gA[a] * gB[b];
      }
    }
    return out;
  }
  function collapseDist(dist, effectFn) {
    var out = {};
    var ks = Object.keys(dist);
    for (var i = 0; i < ks.length; i++) {
      var e = effectFn(ks[i]);
      out[e] = (out[e] || 0) + dist[ks[i]];
    }
    return out;
  }

  // -------- phenotype-effect functions --------
  var EFFECT = {
    orange_F: function(g) {
      if (g === 'OO') return 'orange';
      if (g === 'oo') return 'eumelanin';
      return 'tortie';
    },
    orange_M: function(g) { return g === 'O' ? 'orange' : 'eumelanin'; },
    bLocus: function(g) {
      if (g.indexOf('B') >= 0) return 'black';
      if (g.indexOf('b') >= 0) return 'chocolate';
      return 'cinnamon';
    },
    dilute:   function(g) { return g === 'dd' ? 'dilute' : 'dense'; },
    agouti:   function(g) { return g === 'aa' ? 'solid' : 'tabby'; },
    tabbyT:   function(g) { return g.indexOf('M') >= 0 ? 'mackerel' : 'classic'; },
    tabbyTi:  function(g) { return g.indexOf('T') >= 0 ? 'ticked' : 'untkd'; },
    tabbySp:  function(g) { return g.indexOf('P') >= 0 ? 'spmod' : 'nospmod'; },
    silver:   function(g) { return g.indexOf('I') >= 0 ? 'silver' : 'nonsilver'; },
    point:    function(g) { return g === 'ff' ? 'point' : 'full'; },
    white: function(g) {
      var c = (g.match(/S/g) || []).length;
      if (c === 0) return 'none';
      if (c === 1) return 'some';
      return 'high';
    },
    domWhite: function(g) { return g.indexOf('W') >= 0 ? 'white' : 'nonwhite'; },
    longhair: function(g) { return g === 'll' ? 'long' : 'short'; },
  };

  var AUTOSOMAL_LOCI = ['bLocus','dilute','agouti','tabbyT','tabbyTi','tabbySp','silver','point','white','domWhite','longhair'];

  function offspringEffectDist(mother, father, sex) {
    var motherX = autosomalGametes(mother.orange);
    var orangeGenoDist;
    if (sex === 'F') {
      orangeGenoDist = {};
      var keys = Object.keys(motherX);
      for (var i = 0; i < keys.length; i++) {
        var sorted = [keys[i], father.orange].sort();
        var geno = sorted[0] + sorted[1];
        orangeGenoDist[geno] = (orangeGenoDist[geno] || 0) + motherX[keys[i]];
      }
    } else {
      orangeGenoDist = motherX;
    }
    var orangeEffect = collapseDist(orangeGenoDist, sex === 'F' ? EFFECT.orange_F : EFFECT.orange_M);
    var result = { sex: sex, orange: orangeEffect };
    for (var li = 0; li < AUTOSOMAL_LOCI.length; li++) {
      var locus = AUTOSOMAL_LOCI[li];
      var genoDist = combineAutosomal(autosomalGametes(mother[locus]), autosomalGametes(father[locus]));
      result[locus] = collapseDist(genoDist, EFFECT[locus]);
    }
    return result;
  }

  // -------- phenotype builder --------
  function describePhenotype(p) {
    if (p.base === 'white') {
      return 'white' + (p.isLonghair ? ' \u00b7 longhair' : ' \u00b7 shorthair');
    }
    var parts = [];
    if (p.pattern === 'solid')             parts.push(p.color);
    else if (p.pattern === 'smoke')        parts.push(p.color + ' smoke');
    else if (p.pattern === 'tortie')       parts.push(p.color);
    else if (p.pattern === 'smoke tortie') parts.push(p.color + ' smoke');
    else                                   parts.push(p.color + ' ' + p.pattern);
    if (p.whiteClass === 'some')           parts.push('+ white');
    else if (p.whiteClass === 'high')      parts.push('+ high white');
    if (p.calico)                          parts.push('\u00b7 calico');
    parts.push(p.isLonghair ? '\u00b7 longhair' : '\u00b7 shorthair');
    return parts.join(' ');
  }

  function phenotypeFromEffects(sex, e) {
    if (e.domWhite === 'white') {
      var lh0 = e.longhair === 'long';
      var ph0 = {
        sex: sex === 'F' ? 'female' : 'male', sexShort: sex,
        base: 'white', color: 'white', eumFamily: null,
        pattern: 'solid', tabbyPattern: null,
        isDilute: e.dilute === 'dilute', isSilver: e.silver === 'silver',
        isColorpoint: e.point === 'point', isDomWhite: true,
        isLonghair: lh0, whiteClass: 'all', sCount: 2,
        calico: false, showsTabby: false,
        key: sex + '|white|||' + (lh0 ? 'L' : 'S'),
      };
      ph0.label = describePhenotype(ph0);
      return ph0;
    }
    var base = e.orange;
    var isDilute = e.dilute === 'dilute';
    var eumFamily = e.bLocus;
    var showsTabby = e.agouti !== 'solid';
    var isSilver = e.silver === 'silver';
    var isColorpoint = e.point === 'point';
    var sCount = e.white === 'none' ? 0 : e.white === 'some' ? 1 : 2;
    var whiteClass = e.white;
    var isLonghair = e.longhair === 'long';

    var tabbyPattern;
    if (e.tabbyTi === 'ticked') tabbyPattern = 'ticked';
    else if (e.tabbyT === 'mackerel') tabbyPattern = e.tabbySp === 'spmod' ? 'spotted' : 'mackerel';
    else tabbyPattern = 'classic';

    var color;
    if (base === 'orange') {
      color = isDilute ? 'cream' : 'red';
    } else if (base === 'eumelanin') {
      if (eumFamily === 'black')          color = isDilute ? 'blue'  : 'black';
      else if (eumFamily === 'chocolate') color = isDilute ? 'lilac' : 'chocolate';
      else                                color = isDilute ? 'fawn'  : 'cinnamon';
    } else {
      if (eumFamily === 'black')          color = isDilute ? 'blue-cream' : 'tortoiseshell';
      else if (eumFamily === 'chocolate') color = isDilute ? 'lilac tortie' : 'chocolate tortie';
      else                                color = isDilute ? 'fawn tortie' : 'cinnamon tortie';
    }

    var pattern;
    if (base === 'orange') {
      pattern = tabbyPattern;
      if (isSilver) pattern = pattern + ' cameo';
    } else if (base === 'eumelanin') {
      if (showsTabby) pattern = isSilver ? 'silver ' + tabbyPattern : tabbyPattern;
      else            pattern = isSilver ? 'smoke' : 'solid';
    } else {
      if (showsTabby) pattern = isSilver ? 'silver torbie (' + tabbyPattern + ')' : 'torbie (' + tabbyPattern + ')';
      else            pattern = isSilver ? 'smoke tortie' : 'tortie';
    }
    if (isColorpoint) pattern = pattern + ' point';

    var calico = base === 'tortie' && sCount > 0;
    var keyStr = sex + '|' + color + '|' + pattern + '|' + whiteClass + '|' + (isLonghair ? 'L' : 'S');

    var ph = {
      sex: sex === 'F' ? 'female' : 'male', sexShort: sex,
      base: base, color: color, eumFamily: eumFamily,
      pattern: pattern, tabbyPattern: tabbyPattern,
      isDilute: isDilute, isSilver: isSilver, isColorpoint: isColorpoint,
      isDomWhite: false, isLonghair: isLonghair,
      whiteClass: whiteClass, sCount: sCount, calico: calico,
      showsTabby: showsTabby, key: keyStr,
    };
    ph.label = describePhenotype(ph);
    return ph;
  }

  // -------- predict --------
  function predict(mother, father) {
    var dist = {};
    var sexes = ['F', 'M'];
    for (var si = 0; si < sexes.length; si++) {
      var sex = sexes[si];
      var d = offspringEffectDist(mother, father, sex);
      var oKeys = Object.keys(d.orange);
      var bKeys = Object.keys(d.bLocus);
      var dlKeys = Object.keys(d.dilute);
      var aKeys = Object.keys(d.agouti);
      var tKeys = Object.keys(d.tabbyT);
      var tiKeys = Object.keys(d.tabbyTi);
      var spKeys = Object.keys(d.tabbySp);
      var iKeys = Object.keys(d.silver);
      var ptKeys = Object.keys(d.point);
      var wKeys = Object.keys(d.white);
      var dwKeys = Object.keys(d.domWhite);
      var lKeys = Object.keys(d.longhair);
      for (var oi = 0; oi < oKeys.length; oi++)
      for (var bi = 0; bi < bKeys.length; bi++)
      for (var dli = 0; dli < dlKeys.length; dli++)
      for (var ai = 0; ai < aKeys.length; ai++)
      for (var ti2 = 0; ti2 < tKeys.length; ti2++)
      for (var tii = 0; tii < tiKeys.length; tii++)
      for (var spi = 0; spi < spKeys.length; spi++)
      for (var ii = 0; ii < iKeys.length; ii++)
      for (var pti = 0; pti < ptKeys.length; pti++)
      for (var wi = 0; wi < wKeys.length; wi++)
      for (var dwi = 0; dwi < dwKeys.length; dwi++)
      for (var li = 0; li < lKeys.length; li++) {
        var effects = {
          orange: oKeys[oi], bLocus: bKeys[bi], dilute: dlKeys[dli], agouti: aKeys[ai],
          tabbyT: tKeys[ti2], tabbyTi: tiKeys[tii], tabbySp: spKeys[spi],
          silver: iKeys[ii], point: ptKeys[pti], white: wKeys[wi],
          domWhite: dwKeys[dwi], longhair: lKeys[li],
        };
        var ph = phenotypeFromEffects(sex, effects);
        var p = 0.5 * d.orange[oKeys[oi]] * d.bLocus[bKeys[bi]] * d.dilute[dlKeys[dli]] * d.agouti[aKeys[ai]] * d.tabbyT[tKeys[ti2]] * d.tabbyTi[tiKeys[tii]] * d.tabbySp[spKeys[spi]] * d.silver[iKeys[ii]] * d.point[ptKeys[pti]] * d.white[wKeys[wi]] * d.domWhite[dwKeys[dwi]] * d.longhair[lKeys[li]];
        if (!dist[ph.key]) {
          var copy = {};
          for (var k in ph) copy[k] = ph[k];
          copy.prob = 0;
          dist[ph.key] = copy;
        }
        dist[ph.key].prob += p;
      }
    }
    var result = [];
    var distKeys = Object.keys(dist);
    for (var ri = 0; ri < distKeys.length; ri++) {
      if (dist[distKeys[ri]].prob > 1e-9) result.push(dist[distKeys[ri]]);
    }
    result.sort(function(a, b) { return b.prob - a.prob; });
    return result;
  }

  // -------- sample one random kitten --------
  function pickFromDist(distMap) {
    var keys = Object.keys(distMap);
    var r = Math.random();
    var acc = 0;
    for (var i = 0; i < keys.length; i++) {
      acc += distMap[keys[i]];
      if (r <= acc) return keys[i];
    }
    return keys[keys.length - 1];
  }
  function effectsFromGenotype(geno) {
    var sex = geno.sex;
    var effects = {
      orange: (sex === 'F' ? EFFECT.orange_F : EFFECT.orange_M)(geno.orange),
    };
    for (var li = 0; li < AUTOSOMAL_LOCI.length; li++) {
      effects[AUTOSOMAL_LOCI[li]] = EFFECT[AUTOSOMAL_LOCI[li]](geno[AUTOSOMAL_LOCI[li]]);
    }
    return effects;
  }
  function sampleKitten(mother, father) {
    var sex = Math.random() < 0.5 ? 'F' : 'M';
    var motherX = autosomalGametes(mother.orange);
    var orangeGeno;
    if (sex === 'F') {
      var motherAllele = pickFromDist(motherX);
      var sorted = [motherAllele, father.orange].sort();
      orangeGeno = sorted[0] + sorted[1];
    } else {
      orangeGeno = pickFromDist(motherX);
    }
    var geno = { sex: sex, orange: orangeGeno };
    for (var li = 0; li < AUTOSOMAL_LOCI.length; li++) {
      var locus = AUTOSOMAL_LOCI[li];
      var combined = combineAutosomal(autosomalGametes(mother[locus]), autosomalGametes(father[locus]));
      geno[locus] = pickFromDist(combined);
    }
    return { genotype: geno, phenotype: phenotypeFromEffects(sex, effectsFromGenotype(geno)) };
  }

  // -------- random cat from population frequencies --------
  function rollGeno2(domFreq, domLetter, recLetter) {
    var a = Math.random() < domFreq ? domLetter : recLetter;
    var b = Math.random() < domFreq ? domLetter : recLetter;
    return [a, b].sort().join('');
  }
  function rollGeno3B() {
    function pick() {
      var r = Math.random();
      if (r < 0.85) return 'B';
      if (r < 0.97) return 'b';
      return 'c';
    }
    return [pick(), pick()].sort().join('');
  }
  function randomCat(opts) {
    opts = opts || {};
    var sex = opts.sex || (Math.random() < 0.5 ? 'F' : 'M');
    var orangeFreq = 0.18;
    var orange;
    if (sex === 'F') {
      orange = [Math.random() < orangeFreq ? 'O' : 'o', Math.random() < orangeFreq ? 'O' : 'o'].sort().join('');
    } else {
      orange = Math.random() < orangeFreq ? 'O' : 'o';
    }
    var geno = {
      sex: sex, orange: orange,
      bLocus:   rollGeno3B(),
      dilute:   rollGeno2(0.70, 'D', 'd'),
      agouti:   rollGeno2(0.55, 'A', 'a'),
      tabbyT:   rollGeno2(0.65, 'M', 'm'),
      tabbyTi:  rollGeno2(0.05, 'T', 't'),
      tabbySp:  rollGeno2(0.10, 'P', 'p'),
      silver:   rollGeno2(0.05, 'I', 'i'),
      point:    rollGeno2(0.95, 'F', 'f'),
      white:    rollGeno2(0.30, 'S', 's'),
      domWhite: rollGeno2(0.02, 'W', 'w'),
      longhair: rollGeno2(0.25, 'L', 'l'),
    };
    return { genotype: geno, phenotype: phenotypeFromEffects(sex, effectsFromGenotype(geno)) };
  }

  // -------- inference --------
  function normalize(raw) {
    var total = 0;
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) total += raw[keys[i]];
    var out = {};
    if (total > 0) for (var j = 0; j < keys.length; j++) out[keys[j]] = raw[keys[j]] / total;
    else            for (var j2 = 0; j2 < keys.length; j2++) out[keys[j2]] = 0;
    out.__impossible = total === 0;
    return out;
  }
  function inferOrangeFather(motherOrange, observations) {
    var mg = autosomalGametes(motherOrange);
    var candidates = ['O', 'o'];
    var raw = {};
    for (var ci = 0; ci < candidates.length; ci++) {
      var cand = candidates[ci];
      var logL = 0, viable = true;
      for (var oi = 0; oi < observations.length; oi++) {
        var obs = observations[oi];
        var lk;
        if (obs.sex === 'M') {
          if (obs.base === 'orange')          lk = mg.O || 0;
          else if (obs.base === 'eumelanin')  lk = mg.o || 0;
          else                                lk = 0;
        } else {
          var fO = cand === 'O' ? 1 : 0;
          var fo = cand === 'o' ? 1 : 0;
          if (obs.base === 'orange')          lk = (mg.O || 0) * fO;
          else if (obs.base === 'eumelanin')  lk = (mg.o || 0) * fo;
          else                                lk = (mg.O || 0) * fo + (mg.o || 0) * fO;
        }
        if (lk === 0) { viable = false; break; }
        logL += Math.log(lk);
      }
      raw[cand] = viable ? Math.exp(logL) : 0;
    }
    return normalize(raw);
  }
  function inferDiallelic(motherGeno, observations, domLetter, observationIsRecessive) {
    var rec = domLetter.toLowerCase();
    var candidates = [domLetter + domLetter, domLetter + rec, rec + rec];
    var raw = {};
    for (var ci = 0; ci < candidates.length; ci++) {
      var cand = candidates[ci];
      var logL = 0, viable = true;
      for (var oi = 0; oi < observations.length; oi++) {
        var obs = observations[oi];
        var mg = autosomalGametes(motherGeno);
        var fg = autosomalGametes(cand);
        var pRecRec = (mg[rec] || 0) * (fg[rec] || 0);
        var lk;
        if (observationIsRecessive) lk = obs ? pRecRec : 1 - pRecRec;
        else                         lk = obs ? 1 - pRecRec : pRecRec;
        if (lk === 0) { viable = false; break; }
        logL += Math.log(lk);
      }
      raw[cand] = viable ? Math.exp(logL) : 0;
    }
    return normalize(raw);
  }
  function inferWhiteFather(motherGeno, observations) {
    var candidates = ['SS', 'Ss', 'ss'];
    var raw = {};
    for (var ci = 0; ci < candidates.length; ci++) {
      var cand = candidates[ci];
      var logL = 0, viable = true;
      for (var oi = 0; oi < observations.length; oi++) {
        var obs = observations[oi];
        var mg = autosomalGametes(motherGeno);
        var fg = autosomalGametes(cand);
        var pmS = mg.S || 0, pms = mg.s || 0, pfS = fg.S || 0, pfs = fg.s || 0;
        var lk;
        if (obs === 0)      lk = pms * pfs;
        else if (obs === 2) lk = pmS * pfS;
        else                lk = pmS * pfs + pms * pfS;
        if (lk === 0) { viable = false; break; }
        logL += Math.log(lk);
      }
      raw[cand] = viable ? Math.exp(logL) : 0;
    }
    return normalize(raw);
  }
  function inferBLocusFather(motherGeno, observations) {
    var candidates = ['BB', 'Bb', 'Bc', 'bb', 'bc', 'cc'];
    var raw = {};
    for (var ci = 0; ci < candidates.length; ci++) {
      var cand = candidates[ci];
      var logL = 0, viable = true;
      for (var oi = 0; oi < observations.length; oi++) {
        var obs = observations[oi];
        var mg = autosomalGametes(motherGeno);
        var fg = autosomalGametes(cand);
        var pBlack = 0, pChoc = 0, pCinn = 0;
        var mgKeys = Object.keys(mg), fgKeys = Object.keys(fg);
        for (var mi = 0; mi < mgKeys.length; mi++)
        for (var fi = 0; fi < fgKeys.length; fi++) {
          var kgeno = [mgKeys[mi], fgKeys[fi]].sort().join('');
          var pp = mg[mgKeys[mi]] * fg[fgKeys[fi]];
          var fam = EFFECT.bLocus(kgeno);
          if (fam === 'black') pBlack += pp;
          else if (fam === 'chocolate') pChoc += pp;
          else pCinn += pp;
        }
        var lk;
        if (obs === 'black') lk = pBlack;
        else if (obs === 'chocolate') lk = pChoc;
        else lk = pCinn;
        if (lk === 0) { viable = false; break; }
        logL += Math.log(lk);
      }
      raw[cand] = viable ? Math.exp(logL) : 0;
    }
    return normalize(raw);
  }
  function inferFather(mother, observations) {
    var orangeObs = [], bLocusObs = [], diluteObs = [], silverObs = [];
    var pointObs = [], domWhiteObs = [], whiteObs = [], longObs = [];
    for (var i = 0; i < observations.length; i++) {
      var k = observations[i];
      orangeObs.push({ sex: k.sex, base: k.base });
      if ((k.base === 'eumelanin' || k.base === 'tortie') && k.eumFamily) {
        bLocusObs.push(k.eumFamily);
      }
      domWhiteObs.push(!!k.isDomWhite);
      if (!k.isDomWhite) {
        diluteObs.push(!!k.isDilute);
        silverObs.push(!!k.isSilver);
        pointObs.push(!!k.isColorpoint);
        whiteObs.push(k.whiteClass || 0);
        longObs.push(!!k.isLonghair);
      }
    }
    var result = {
      orange:   inferOrangeFather(mother.orange, orangeObs),
      bLocus:   bLocusObs.length > 0 ? inferBLocusFather(mother.bLocus, bLocusObs) : null,
      dilute:   diluteObs.length > 0 ? inferDiallelic(mother.dilute, diluteObs, 'D', true) : null,
      silver:   silverObs.length > 0 ? inferDiallelic(mother.silver, silverObs, 'I', false) : null,
      point:    pointObs.length > 0 ? inferDiallelic(mother.point, pointObs, 'F', true) : null,
      white:    whiteObs.length > 0 ? inferWhiteFather(mother.white, whiteObs) : null,
      domWhite: inferDiallelic(mother.domWhite, domWhiteObs, 'W', false),
      longhair: longObs.length > 0 ? inferDiallelic(mother.longhair, longObs, 'L', true) : null,
    };
    result.anyImpossible = false;
    var keys = Object.keys(result);
    for (var k2 = 0; k2 < keys.length; k2++) {
      var v = result[keys[k2]];
      if (v && v.__impossible) { result.anyImpossible = true; break; }
    }
    return result;
  }

  // -------- avatar --------
  var COLOR = {
    black:'#262626', blue:'#7d8590', chocolate:'#5e3a23', lilac:'#a89a92',
    cinnamon:'#a96f3d', fawn:'#c7a98a', red:'#d97a3e', cream:'#e6c79a', white:'#fafafa',
  };
  function bodyColorOf(ph) {
    if (ph.isDomWhite) return COLOR.white;
    if (ph.base === 'orange') return ph.isDilute ? COLOR.cream : COLOR.red;
    if (ph.base === 'eumelanin' || ph.base === 'tortie') {
      if (ph.eumFamily === 'black')     return ph.isDilute ? COLOR.blue  : COLOR.black;
      if (ph.eumFamily === 'chocolate') return ph.isDilute ? COLOR.lilac : COLOR.chocolate;
      return ph.isDilute ? COLOR.fawn : COLOR.cinnamon;
    }
    return COLOR.black;
  }
  function blendToward(hex, toward, amt) {
    function p(h) { return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }
    var a = p(hex), b = p(toward);
    function mix(i) { return Math.round(a[i]*(1-amt) + b[i]*amt); }
    function hx(n) { var s = n.toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + hx(mix(0)) + hx(mix(1)) + hx(mix(2));
  }
  var __catUid = 0;

  function avatar(ph, opts) {
    opts = opts || {};
    var size = opts.size || 80;
    var uid = ++__catUid;
    var cpId = 'cp_' + uid;
    var origBody = bodyColorOf(ph);
    var bodyFill = origBody;
    if (ph.isSilver && !ph.isDomWhite) {
      bodyFill = blendToward(bodyFill, '#ffffff', ph.showsTabby ? 0.45 : 0.55);
    }
    var pointFill = null;
    if (ph.isColorpoint && !ph.isDomWhite) {
      pointFill = bodyFill;
      bodyFill = blendToward(bodyFill, '#fff5e8', 0.78);
    }

    var s = '<svg width="' + size + '" height="' + Math.round(size * 60 / 80) + '" viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
    s += '<defs><clipPath id="' + cpId + '">';
    s += '<ellipse cx="40" cy="38" rx="22" ry="14"/>';
    s += '<circle cx="40" cy="22" r="13"/>';
    s += '</clipPath></defs>';

    // Tail
    s += '<path d="M 60 38 Q 72 30 70 18" stroke="' + bodyFill + '" stroke-width="5" fill="none" stroke-linecap="round"/>';
    if (pointFill) s += '<circle cx="70" cy="18" r="3" fill="' + pointFill + '"/>';

    // Body + head
    s += '<ellipse cx="40" cy="38" rx="22" ry="14" fill="' + bodyFill + '"/>';
    s += '<circle cx="40" cy="22" r="13" fill="' + bodyFill + '"/>';
    var earFill = pointFill || bodyFill;
    s += '<polygon points="30,12 34,4 38,12" fill="' + earFill + '"/>';
    s += '<polygon points="42,12 46,4 50,12" fill="' + earFill + '"/>';

    // Colorpoint face mask + paws
    if (pointFill) {
      s += '<g clip-path="url(#' + cpId + ')">';
      s += '<ellipse cx="40" cy="26" rx="9" ry="5" fill="' + pointFill + '" opacity="0.7"/>';
      s += '</g>';
      s += '<ellipse cx="28" cy="50" rx="4" ry="3" fill="' + pointFill + '"/>';
      s += '<ellipse cx="52" cy="50" rx="4" ry="3" fill="' + pointFill + '"/>';
    }

    // Tortie patches
    if (ph.base === 'tortie' && !ph.isDomWhite) {
      var patch = ph.isDilute ? COLOR.cream : COLOR.red;
      if (ph.isSilver) patch = blendToward(patch, '#ffffff', 0.4);
      s += '<g clip-path="url(#' + cpId + ')">';
      s += '<ellipse cx="32" cy="32" rx="9" ry="7" fill="' + patch + '" opacity="0.95"/>';
      s += '<ellipse cx="48" cy="42" rx="7" ry="6" fill="' + patch + '" opacity="0.95"/>';
      s += '<ellipse cx="44" cy="18" rx="5" ry="4" fill="' + patch + '" opacity="0.95"/>';
      s += '</g>';
    }

    // Tabby pattern overlays (vary by subtype)
    var hasPattern = !ph.isDomWhite && (
      ph.base === 'orange' ||
      (ph.base === 'eumelanin' && ph.showsTabby) ||
      (ph.base === 'tortie' && ph.showsTabby)
    );
    if (hasPattern && ph.tabbyPattern) {
      var stripeColor = origBody;
      if (ph.isSilver) stripeColor = blendToward(origBody, '#000000', 0.2);
      if (ph.tabbyPattern === 'mackerel') {
        s += '<g clip-path="url(#' + cpId + ')" stroke="' + stripeColor + '" stroke-width="1.4" fill="none" opacity="0.78">';
        s += '<path d="M 22 30 Q 24 36 22 44"/>';
        s += '<path d="M 28 28 Q 30 36 28 46"/>';
        s += '<path d="M 34 28 Q 36 36 34 46"/>';
        s += '<path d="M 40 28 Q 42 36 40 46"/>';
        s += '<path d="M 46 28 Q 48 36 46 46"/>';
        s += '<path d="M 52 28 Q 54 36 52 46"/>';
        s += '<path d="M 58 30 Q 60 36 58 44"/>';
        s += '</g>';
      } else if (ph.tabbyPattern === 'classic') {
        s += '<g clip-path="url(#' + cpId + ')" stroke="' + stripeColor + '" stroke-width="1.5" fill="none" opacity="0.78">';
        s += '<ellipse cx="40" cy="38" rx="11" ry="6"/>';
        s += '<ellipse cx="40" cy="38" rx="7" ry="4"/>';
        s += '<path d="M 30 32 Q 26 38 30 44"/>';
        s += '<path d="M 50 32 Q 54 38 50 44"/>';
        s += '</g>';
      } else if (ph.tabbyPattern === 'spotted') {
        s += '<g clip-path="url(#' + cpId + ')" fill="' + stripeColor + '" opacity="0.78">';
        s += '<circle cx="26" cy="34" r="1.8"/>';
        s += '<circle cx="32" cy="40" r="1.8"/>';
        s += '<circle cx="38" cy="34" r="1.8"/>';
        s += '<circle cx="44" cy="42" r="1.8"/>';
        s += '<circle cx="50" cy="34" r="1.8"/>';
        s += '<circle cx="56" cy="40" r="1.8"/>';
        s += '<circle cx="30" cy="44" r="1.6"/>';
        s += '<circle cx="42" cy="32" r="1.6"/>';
        s += '<circle cx="54" cy="44" r="1.6"/>';
        s += '</g>';
      }
      // (ticked: no body stripes — just the forehead M, added below for any tabby)
      // Forehead "M" mark for all tabby patterns
      s += '<g stroke="' + stripeColor + '" stroke-width="1.2" fill="none" opacity="0.85">';
      s += '<path d="M 35 17 L 37 14 L 40 17 L 43 14 L 45 17"/>';
      s += '</g>';
    }

    // White spotting patches
    if (!ph.isDomWhite && (ph.whiteClass === 'some' || ph.whiteClass === 'high')) {
      var amt = ph.whiteClass === 'some' ? 0.5 : 0.85;
      s += '<g clip-path="url(#' + cpId + ')">';
      var rx = 10 + amt * 10;
      var ry = 6 + amt * 4;
      var op = (0.65 + amt * 0.3).toFixed(2);
      s += '<ellipse cx="40" cy="46" rx="' + rx + '" ry="' + ry + '" fill="#fafafa" opacity="' + op + '"/>';
      if (amt > 0.7) {
        s += '<ellipse cx="40" cy="26" rx="6" ry="4" fill="#fafafa" opacity="0.8"/>';
      }
      s += '</g>';
    }

    // Longhair fluff
    if (ph.isLonghair) {
      s += '<g opacity="0.7" stroke="' + bodyFill + '" stroke-width="1" fill="none">';
      s += '<path d="M 18 38 q -3 2 -4 6"/>';
      s += '<path d="M 22 48 q -2 3 -2 6"/>';
      s += '<path d="M 58 48 q 2 3 2 6"/>';
      s += '<path d="M 62 38 q 3 2 4 6"/>';
      s += '</g>';
    }

    // Eyes (blue for colorpoint and often for dominant white)
    var eyeColor = (ph.isColorpoint || ph.isDomWhite) ? '#5db1d1' : '#1a1a1a';
    s += '<circle cx="35" cy="22" r="1.6" fill="' + eyeColor + '"/>';
    s += '<circle cx="45" cy="22" r="1.6" fill="' + eyeColor + '"/>';
    s += '<path d="M 38 26 L 42 26 L 40 28 Z" fill="#5a2a2a"/>';
    s += '</svg>';
    return s;
  }

  // -------- defaults + validation --------
  function defaultGenotype(sex) {
    return {
      sex: sex,
      orange:   sex === 'F' ? 'oo' : 'o',
      bLocus:   'BB', dilute:   'DD', agouti:   'AA',
      tabbyT:   'MM', tabbyTi:  'tt', tabbySp:  'pp',
      silver:   'ii', point:    'FF', white:    'ss',
      domWhite: 'ww', longhair: 'LL',
    };
  }
  var VALID = {
    orange_F: ['OO','Oo','oo'], orange_M: ['O','o'],
    bLocus:   ['BB','Bb','Bc','bb','bc','cc'],
    dilute:   ['DD','Dd','dd'], agouti: ['AA','Aa','aa'],
    tabbyT:   ['MM','Mm','mm'], tabbyTi: ['TT','Tt','tt'],
    tabbySp:  ['PP','Pp','pp'], silver: ['II','Ii','ii'],
    point:    ['FF','Ff','ff'], white: ['SS','Ss','ss'],
    domWhite: ['WW','Ww','ww'], longhair: ['LL','Ll','ll'],
  };
  function validateGenotype(g) {
    var errors = [];
    if (g.sex !== 'F' && g.sex !== 'M') errors.push('sex must be F or M');
    var orangeValid = (g.sex === 'F') ? VALID.orange_F : VALID.orange_M;
    if (orangeValid.indexOf(g.orange) < 0) errors.push('orange invalid for sex ' + g.sex);
    for (var li = 0; li < AUTOSOMAL_LOCI.length; li++) {
      var locus = AUTOSOMAL_LOCI[li];
      if (VALID[locus].indexOf(g[locus]) < 0) errors.push(locus + ' invalid: ' + g[locus]);
    }
    return { valid: errors.length === 0, errors: errors };
  }

  var LOCI = {
    orange:   { letters: ['O','o'],     desc: 'X-linked. Females: OO orange, Oo tortie, oo eumelanin. Males: O orange, o eumelanin.' },
    bLocus:   { letters: ['B','b','c'], desc: 'Eumelanin family. B>b>c. B black, b chocolate, c cinnamon.' },
    dilute:   { letters: ['D','d'],     desc: 'dd dilutes pigment. black to blue, red to cream, etc.' },
    agouti:   { letters: ['A','a'],     desc: 'A shows tabby pattern on eumelanin; aa solid. Orange always shows pattern.' },
    tabbyT:   { letters: ['M','m'],     desc: 'M mackerel, m classic. M dominant. Only visible if agouti shows.' },
    tabbyTi:  { letters: ['T','t'],     desc: 'T ticked (Abyssinian-like). Epistatic to T-locus and Sp.' },
    tabbySp:  { letters: ['P','p'],     desc: 'P spotted modifier — turns mackerel into spotted pattern.' },
    silver:   { letters: ['I','i'],     desc: 'I silver inhibitor. Lightens base toward silver; smoke when on solid, silver tabby on tabby.' },
    point:    { letters: ['F','f'],     desc: 'f colorpoint (Siamese-type). Recessive temperature-sensitive pigmentation.' },
    white:    { letters: ['S','s'],     desc: 'S white spotting, dosage matters. 0/1/2 copies for none/some/high white.' },
    domWhite: { letters: ['W','w'],     desc: 'W dominant white masks all pigment.' },
    longhair: { letters: ['L','l'],     desc: 'l recessive long hair.' },
  };

  var api = {
    predict: predict,
    sampleKitten: sampleKitten,
    randomCat: randomCat,
    inferFather: inferFather,
    describePhenotype: describePhenotype,
    avatar: avatar,
    defaultGenotype: defaultGenotype,
    validateGenotype: validateGenotype,
    LOCI: LOCI,
    VERSION: '2.0.0',
  };
  window.__catCoatGenetics = api;
  return api;