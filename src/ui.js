(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var LSKEY = 'omgym-state-v1';
  var TODAY = OM.ymd(new Date());
  function refreshToday() { var t = OM.ymd(new Date()); if (t !== TODAY) { if (foodDate === TODAY) foodDate = t; if (workDate === TODAY) workDate = t; TODAY = t; render(); } }

  /* ---------- state ---------- */
  function freshState() { return { v: 1, profile: null, startDate: null, kcalAdj: 0, adjDate: null, weights: [], days: {}, loads: {}, swaps: {}, prices: {}, shopTicks: {}, cart: {}, orderName: '', sellerView: false, nudgeHide: {} }; }
  var S = freshState();
  var EXAMPLE = {
    name: 'Example', units: 'metric', sex: 'female', age: 32, heightCm: 165, weightKg: 82, goalKg: 70, neckCm: 34, waistCm: 92, hipCm: 110,
    activity: 'light', experience: 'beginner', days: [1, 3, 5], style: 'mix', equipment: 'gym', pace: 'standard', injuries: [], parq: [false, false, false, false, false, false, false],
    pregnant: false, region: 'JM', diet: 'none', allergies: []
  };
  function exampleWeights() { var w = []; for (var i = 27; i >= 0; i -= 3) w.push({ d: OM.addDays(TODAY, -i), kg: Math.round((82 + i * 0.07 + ((i * 7) % 5 - 2) * 0.12) * 10) / 10 }); return w; }
  function isExample() { return !S.profile; }
  function P() { return S.profile || EXAMPLE; }
  function startDate() { return S.startDate || OM.addDays(TODAY, -3); }
  function weights() { return S.profile ? S.weights : exampleWeights(); }
  function targets() { return OM.calcTargets(P(), S.profile ? S.kcalAdj : 0, S.profile ? proPlan() : null); }
  function prices() { return OM.priceTable(P(), S.profile ? (S.prices[P().region] || {}) : {}); }

  /* ---------- storage: private per-user doc in the artifact db, browser storage as fallback ---------- */
  var store = { kind: 'local', ref: null }, saveTimer = null, saving = false, dirty = false;
  function setStatus(t) { var el = $('#status'); if (el) el.textContent = t; }
  function save() {
    if (!S.profile) return;
    try { localStorage.setItem(LSKEY, JSON.stringify(S)); } catch (e) { }
    if (store.kind !== 'db') { setStatus('Saved on this device'); return; }
    dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700);
  }
  function flush() {
    if (saving || !dirty) return;
    saving = true; dirty = false; setStatus('Saving…');
    store.ref.set(JSON.parse(JSON.stringify(S))).then(function () { saving = false; setStatus('Saved to your account'); if (dirty) flush(); })
      .catch(function (e) { saving = false; setStatus(e && e.code === 'quota_exceeded' ? 'Storage full. Older days will be trimmed.' : 'Saved on this device only'); if (e && e.code === 'unavailable') { dirty = true; setTimeout(flush, 1500 + Math.random() * 1000); } });
  }
  function trim() {
    // keep the record small: 180 days of day logs
    var cut = OM.addDays(TODAY, -180);
    Object.keys(S.days).forEach(function (d) { if (d < cut) delete S.days[d]; });
    Object.keys(S.swaps).forEach(function (d) { if (d < OM.addDays(TODAY, -14)) delete S.swaps[d]; });
    Object.keys(S.shopTicks).forEach(function (d) { if (d < OM.addDays(TODAY, -21)) delete S.shopTicks[d]; });
    Object.keys(S.nudgeHide || {}).forEach(function (k) { if (k.slice(0, 10) < OM.addDays(TODAY, -3)) delete S.nudgeHide[k]; });
    if (S.weights.length > 400) S.weights = S.weights.slice(-400);
  }
  function adopt(data) { if (data && data.profile) { var f = freshState(); Object.keys(f).forEach(function (k) { if (data[k] != null) f[k] = data[k]; }); S = JSON.parse(JSON.stringify(f)); S.cart = OM.normalizeCart(S.cart); } }
  function initStore() {
    var local = null;
    try { var raw = localStorage.getItem(LSKEY); if (raw) local = JSON.parse(raw); } catch (e) { }
    if (local) adopt(local);
    render();
    var c = window.claude;
    if (!c || typeof c.use !== 'function') { setStatus(S.profile ? 'Saved on this device' : 'Example plan'); return; }
    Promise.all([c.use('db'), c.use('user')]).then(function (r) {
      var db = r[0], user = r[1];
      if (!db || !user) { setStatus(S.profile ? 'Saved on this device' : 'Example plan'); return null; }
      return user.id().then(function (id) {
        if (!id) { setStatus('Sign in to sync across devices'); return; }
        store = { kind: 'db', ref: db.doc('data/users/' + id + '/state') };
        return store.ref.get().then(function (snap) {
          if (snap.exists) { adopt(snap.data()); setStatus('Synced to your account'); render(); }
          else if (S.profile) { dirty = true; flush(); }
          else setStatus('Example plan');
        });
      });
    }).catch(function () { setStatus(S.profile ? 'Saved on this device' : 'Example plan'); });
  }

  /* ---------- formatting ---------- */
  function money(v, pt) { pt = pt || prices(); var m = pt.meta; return m.symbol + Number(v).toLocaleString('en-US', { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals }); }
  function imperial() { return P().units === 'imperial'; }
  function wt(kg, dp) { dp = dp == null ? 1 : dp; return imperial() ? (kg * 2.20462).toFixed(dp) + ' lb' : kg.toFixed(dp) + ' kg'; }
  function wtv(kg) { return imperial() ? Math.round(kg * 2.20462 * 10) / 10 : Math.round(kg * 10) / 10; }
  function wUnit() { return imperial() ? 'lb' : 'kg'; }
  function len(cm) { return imperial() ? (cm / 2.54).toFixed(1) + ' in' : Math.round(cm) + ' cm'; }
  function niceDate(s, opts) { return OM.parseYmd(s).toLocaleDateString('en-GB', opts || { weekday: 'long', day: 'numeric', month: 'long' }); }
  function amount(id, g) {
    var I = OM.ING[id];
    if (I.each && id === 'egg') { var n = Math.round(g / I.each); return n + (n === 1 ? ' egg' : ' eggs'); }
    var s = Math.round(g) + ' g';
    if (I.scoop) s += ' (' + Math.round(g / I.scoop * 2) / 2 + ' scoop' + (Math.round(g / I.scoop * 2) / 2 === 1 ? '' : 's') + ')';
    else if (I.slice) s += ' (' + Math.round(g / I.slice * 2) / 2 + ' slices)';
    else if (I.tbsp) s += ' (' + Math.round(g / I.tbsp * 2) / 2 + ' tbsp)';
    else if (I.tin) { var t = Math.max(0.5, Math.round(g / I.tin * 2) / 2); s += ' drained (about ' + t + (t === 1 ? ' tin' : ' tins') + ')'; }
    else if (I.dry) s += ' dry' + (imperial() ? ' (' + (g / 28.35).toFixed(1) + ' oz)' : '');
    else if (I.cup) { var c = g / I.cup; s += ' (' + (c < 0.3 ? Math.round(c * 16) + ' tbsp' : (Math.round(c * 4) / 4) + ' cup') + ')'; }
    else if (imperial()) s += ' (' + (g / 28.35).toFixed(1) + ' oz)';
    return s;
  }
  var DISHES = { auto: 'Follow my region', jm: 'Jamaican', us: 'American', mix: 'Both' };
  var LIKE_LABEL = { greekyog: 'Greek yogurt', cottage: 'Cottage cheese', berries: 'Berries', whey: 'Whey protein', chickbreast: 'Chicken breast', beef: 'Lean beef', turkey: 'Ground turkey', salmon: 'Salmon', wwbread: 'Whole-wheat bread', pasta: 'Pasta', broccoli: 'Broccoli', mixveg: 'Frozen veg', oats: 'Oats', egg: 'Eggs', tuna: 'Tuna', soya: 'Soya chunks', chickpeas: 'Chickpeas' };
  function budgetLabel(p) { return OM.BUDGETS[OM.budgetTier(p)].label; }
  // one-tap region and budget switch on the Meals and List tabs
  function quickBar(p) {
    var reg = p.region === 'US' ? 'US' : p.region === 'JM' ? 'JM' : 'OTHER', b = OM.budgetTier(p);
    var chip = function (k, v, label, on) { return '<button class="chip" data-act="quick" data-k="' + k + '" data-v="' + v + '" aria-pressed="' + on + '">' + label + '</button>'; };
    return '<section class="card quick"><div class="qrow"><span class="label">Prices</span><div class="seg" role="group" aria-label="Region">' + chip('region', 'JM', 'Jamaica', reg === 'JM') + chip('region', 'US', 'USA', reg === 'US') + chip('region', 'OTHER', 'Elsewhere', reg === 'OTHER') + '</div></div>' +
      '<div class="qrow"><span class="label">Budget</span><div class="seg" role="group" aria-label="Food budget">' + [1, 2, 3].map(function (t) { return chip('budget', t, OM.BUDGETS[t].label, b === t); }).join('') + '</div></div>' +
      '<p class="small muted" style="margin:0">' + esc(OM.BUDGETS[b].note) + ' Dishes: ' + esc({ jm: 'Jamaican', us: 'American', mix: 'Jamaican and American' }[OM.cuisineOf(p)]) + (p.likes && p.likes.length ? ' · you buy ' + esc(p.likes.map(function (id) { return LIKE_LABEL[id] || id; }).join(', ')) : '') + '. <button class="linkbtn small" data-act="setupfood">Change foods</button></p></section>';
  }
  function packText(it, pt) { return money(it.pr, pt) + (it.weighed ? ' per lb' : ' · ' + it.u); }
  function weekShop() { return OM.shoppingList(TODAY, 7, P(), targets(), prices(), S.swaps); }
  function day(d) { if (!S.days[d]) S.days[d] = { sets: {}, done: false, habits: {} }; return S.days[d]; }
  function toast(t) { var el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { el.hidden = true; }, 2600); }
  function needSetup() { if (isExample()) { toast('Set up your own plan first'); openSetup(); return true; } return false; }

  /* ---------- views ---------- */
  var tab = 'today', foodDate = TODAY, workDate = TODAY, confirmReset = false, editPrice = null, dataMode = null, dataCheck = null, dataUndo = null;
  var UNDOKEY = 'omgym-state-undo';
  var VALID_TABS = ['today', 'food', 'shop', 'store', 'progress', 'me', 'pro'];
  var storeCat = 'all', orderCopied = false;

  function exampleBanner() {
    return isExample() ? '<div class="banner example"><div><strong>You are looking at an example plan.</strong><div class="small muted">A 32-year-old woman, 82 kg, aiming for 70 kg, training 3 days a week in Jamaica.</div></div><button class="btn" data-act="setup">Set up my plan</button></div>' : '';
  }
  function flagsHtml(T) { return T.flags.map(function (f) { return '<div class="flag ' + f.level + '">' + esc(f.text) + '</div>'; }).join(''); }

  // Today tab can show another day of the week so a forgotten workout can be logged afterwards (up to LOG_BACK days back)
  var LOG_BACK = 28;
  function workDay() { return workDate; }
  function canLog(d) { return d <= TODAY && OM.dayNum(TODAY) - OM.dayNum(d) <= LOG_BACK; }
  function renderToday() {
    var p = P(), T = targets(), pt = prices(), D = workDay(), isToday = D === TODAY, future = D > TODAY;
    var w = OM.buildWorkout(D, p, startDate(), T.caution, S.profile ? proPlan() : null);
    var plan = OM.planDay(D, p, T, pt, S.swaps);
    var shop = weekShop();
    var dd = S.days[D] || { sets: {}, habits: {} };
    var h = exampleBanner() + flagsHtml(T);
    if (!isToday) h += '<div class="flag info" id="otherday">' + (future ? 'This is a preview of ' + esc(niceDate(D)) + '. You can log it on the day.' : 'You are logging ' + esc(niceDate(D)) + '. Tick sets, weights and habits as you did them.') + ' <button class="linkbtn" data-act="wday" data-d="' + TODAY + '">Back to today</button></div>';
    h += '<section class="dayhead"><span class="label">' + esc(niceDate(D)) + '</span><h1>' + esc(w.title) + '</h1><span class="muted">' + (w.rest ? 'Rest day · ' : 'Week ' + w.week + ' · ' + esc(w.phase.name) + ' phase · ') + w.minutes + ' min' + (w.pro ? ' · <span class="pill done">PRO ' + esc(OM.PRO_PHASES[proPlan().phase].label) + '</span>' : '') + '</span></section>';
    h += '<section class="kpis"><div class="kpi"><div class="v num">' + T.kcal.toLocaleString() + '</div><div class="u">' + (isToday ? 'kcal today' : 'kcal a day') + '</div></div><div class="kpi"><div class="v num">' + T.protein + ' g</div><div class="u">protein</div></div><div class="kpi"><div class="v num">' + money(shop.total, pt) + '</div><div class="u">week\'s shop</div></div></section>';
    h += weekStrip(p, D);
    // workout
    h += '<section class="card hero">';
    if (!w.rest) h += '<p class="small"><strong>' + esc(w.phase.name) + ':</strong> ' + esc(w.phase.note) + (w.caution ? ' Keep effort moderate until your doctor clears you.' : '') + '</p>';
    w.blocks.forEach(function (b, bi) {
      h += '<div class="block"><div class="blockhead"><h3>' + esc(b.title) + '</h3><span class="small muted num">' + b.minutes + ' min</span></div>';
      if (b.circuit) h += '<p class="small muted">Do one set of each exercise in order, then repeat the round.</p>';
      if (b.lines) h += '<ul class="lines">' + b.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
      (b.items || []).forEach(function (it) {
        var id = it.ex.id, doneSets = (dd.sets && dd.sets[id]) || 0, lr = S.loads[id], lo = lr && typeof lr === 'object' ? (lr.d === D ? lr.prev : lr) : null, last = lo ? lo.v : '';
        h += '<div class="ex"><div><div class="name">' + esc(it.ex.name) + '</div><div class="rx">' + it.sets + ' × ' + esc(it.reps) + ' · rest ' + it.rest + ' s' + (it.ex.kind === 'c' || it.ex.kind === 'a' ? ' · ' + esc(it.rir) + ' reps in reserve' : '') + '</div></div><div></div>';
        h += '<div class="sets">';
        for (var i = 1; i <= it.sets; i++) h += '<button class="setbox" data-act="set" data-ex="' + id + '" data-n="' + i + '" data-rest="' + it.rest + '" aria-pressed="' + (i <= doneSets) + '" aria-label="Set ' + i + ' of ' + esc(it.ex.name) + '">' + i + '</button>';
        if (it.ex.kind === 'c' || it.ex.kind === 'a' || it.ex.kind === 'm') h += '<label class="load"><span class="last">' + (last ? 'Last: ' + esc(last) : 'Weight') + '</span><input id="load-' + id + '" data-act="load" data-ex="' + id + '" type="text" inputmode="decimal" placeholder="' + wUnit() + '" value="' + esc((dd.loads && dd.loads[id]) || '') + '" aria-label="Weight used for ' + esc(it.ex.name) + '"></label>';
        h += '</div><details><summary>How to do it</summary>' + esc(it.ex.cue) + ' <a href="https://www.youtube.com/results?search_query=' + encodeURIComponent(it.ex.name + ' exercise proper form') + '" target="_blank" rel="noopener">Watch demos</a></details></div>';
      });
      h += '</div>';
    });
    h += '<div>' + (dd.done ? '<span class="pill done">Workout logged</span> <button class="linkbtn" data-act="undone">Undo</button>' : future ? '<button class="btn" disabled>Log it on the day</button>' : '<button class="btn" data-act="done">' + (w.rest ? (isToday ? 'Log recovery day' : 'Log this recovery day') : (isToday ? 'Finish workout' : 'Log this workout')) + '</button>') + '</div></section>';
    if (isToday && !w.rest) {
      var hasCond = w.blocks.some(function (b) { return b.cond; });
      h += hasCond ? nudge('jump-rope', 'Do the cardio finisher anywhere, no machine needed.') : nudge(OM.dayNum(TODAY) % 2 ? 'gloves' : 'straps', 'Better grip on today\'s pulls and presses.');
    } else if (isToday) h += nudge('bands', 'Recovery days: band warm-ups and glute work at home.');
    // habits
    var HB = [['protein', 'Hit protein'], ['sleep', '7+ hours sleep'], ['steps', '8,000+ steps'], ['water', '2 L water']];
    h += '<section class="card"><div class="cardhead"><h3>Daily habits</h3><span class="small muted">Tap when done</span></div><div class="habits">' + HB.map(function (x) { return '<button class="chip" data-act="habit" data-h="' + x[0] + '" aria-pressed="' + !!(dd.habits && dd.habits[x[0]]) + '">' + x[1] + '</button>'; }).join('') + '</div></section>';
    // meals summary
    h += '<section class="card"><div class="cardhead"><h3>' + (isToday ? 'Today\'s food' : 'Food for ' + esc(niceDate(D, { weekday: 'long' }))) + '</h3><button class="linkbtn" data-act="tab" data-tab="food">Recipes & amounts</button></div><div>';
    plan.meals.forEach(function (m) { if (m.empty) return; h += '<div class="mealrow"><span class="label">' + m.slot.name + '</span><span>' + esc(m.name) + '</span><span class="small muted num">' + Math.round(m.tot.k) + ' kcal</span></div>'; });
    h += '</div><p class="small muted num">' + Math.round(plan.tot.k).toLocaleString() + ' kcal · ' + Math.round(plan.tot.p) + ' g protein</p></section>';
    return h;
  }

  function weekStrip(p, sel) {
    sel = sel || TODAY;
    var dn = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    var mon = OM.addDays(sel, -((OM.weekday(sel) + 6) % 7)), thisMon = OM.addDays(TODAY, -((OM.weekday(TODAY) + 6) % 7));
    var prevOk = canLog(OM.addDays(mon, -1)), nextOk = mon < thisMon;
    var h = '<section class="weeknav"><button class="iconbtn sm" data-act="wweek" data-n="-7" aria-label="Previous week"' + (prevOk ? '' : ' disabled') + '>‹</button><span class="small muted">' + (mon === thisMon ? 'This week' : 'Week of ' + esc(niceDate(mon, { day: 'numeric', month: 'short' }))) + ' · tap a day to log it</span><button class="iconbtn sm" data-act="wweek" data-n="7" aria-label="Next week"' + (nextOk ? '' : ' disabled') + '>›</button></section>';
    h += '<section class="week" aria-label="Week">';
    for (var i = 0; i < 7; i++) {
      var d = OM.addDays(mon, i), s = OM.sessionFor(d, p, startDate()), done = S.days[d] && S.days[d].done;
      var nm = s ? OM.buildWorkout(d, p, startDate(), false, S.profile ? proPlan() : null).title.replace(/ body/, '').replace('Conditioning + core', 'Cardio') : 'Rest';
      var tooOld = d < TODAY && !canLog(d);
      h += '<button class="wd' + (d === TODAY ? ' now' : '') + (d === sel ? ' sel' : '') + (s ? ' train' : '') + (done ? ' done' : '') + '" data-act="wday" data-d="' + d + '"' + (tooOld ? ' disabled' : '') + ' aria-pressed="' + (d === sel) + '" aria-label="' + esc(niceDate(d)) + ': ' + esc(nm) + (done ? ', logged' : '') + '"><span class="wl">' + dn[OM.weekday(d)] + '</span><span class="wn">' + esc(nm) + '</span><span class="wt" aria-hidden="true">' + (done ? '✓' : '') + '</span></button>';
    }
    return h + '</section>';
  }
  function macroBar(label, v, target, unit) {
    var pc = Math.min(130, v / target * 100);
    return '<div class="macro"><div class="blockhead"><span class="small"><strong>' + label + '</strong></span><span class="small num muted">' + Math.round(v) + ' / ' + target + ' ' + unit + '</span></div><div class="bar' + (pc > 110 ? ' over' : '') + '"><i style="width:' + Math.min(100, pc) + '%"></i></div></div>';
  }
  // Move my data between the Home Screen app, Safari and the claude.ai version: a text code the person copies themselves.
  function dataCard() {
    var h = '<p class="small muted">To move your plan to another version of OMGym (Home Screen app, Safari or claude.ai), tap Copy my data here, then Paste my data there. Nothing is uploaded; only you can see it.</p>';
    if (dataUndo) h += '<div class="flag info" id="dataundo">Your data was replaced. <button class="linkbtn" data-act="dataundo">Undo</button></div>';
    if (dataMode === 'copy') {
      h += '<div class="databox" id="datacopybox"><label class="f" for="datacode">Your data code</label><textarea id="datacode" class="codebox" readonly rows="4" autocapitalize="off" autocorrect="off" spellcheck="false">' + esc(OM.exportCode(S)) + '</textarea><p class="small muted">If it didn\'t copy by itself, press and hold the code, Select All, then Copy. Then open the other version, go to Plan, tap Paste my data.</p><button class="linkbtn" data-act="dataclose">Done</button></div>';
    }
    if (dataMode === 'paste') {
      h += '<div class="databox" id="datapastebox"><label class="f" for="datain">Paste your data code</label><textarea id="datain" class="codebox" rows="4" placeholder="OMGYM1:..." autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false"></textarea>';
      if (dataCheck && !dataCheck.ok) h += '<p class="err" role="alert">' + esc(dataCheck.msg) + '</p>';
      if (dataCheck && dataCheck.ok) {
        var sm = dataCheck.summary;
        h += '<div class="confirm" id="dataconfirm"><span>Found: <strong>' + esc(sm.name) + '</strong>, ' + sm.weighIns + ' weigh-in' + (sm.weighIns === 1 ? '' : 's') + ', ' + sm.workouts + ' workout' + (sm.workouts === 1 ? '' : 's') + ' logged. ' + (S.profile ? 'This replaces the plan on this device (you can undo once).' : '') + '</span><button class="btn small" data-act="dataapply">Use this data</button><button class="linkbtn" data-act="dataclose">Cancel</button></div>';
      } else h += '<div class="datarow"><button class="btn small" data-act="datacheck">Check code</button><button class="linkbtn" data-act="dataclose">Cancel</button></div>';
      h += '</div>';
    }
    return h;
  }
  function renderFood() {
    var p = P(), T = targets(), pt = prices();
    var plan = OM.planDay(foodDate, p, T, pt, S.swaps);
    var h = exampleBanner();
    h += '<section class="datenav"><button class="iconbtn" data-act="fd" data-n="-1" aria-label="Previous day">‹</button><div style="text-align:center"><span class="label">' + (foodDate === TODAY ? 'Today' : esc(niceDate(foodDate, { weekday: 'long' }))) + '</span><h2>' + esc(niceDate(foodDate, { day: 'numeric', month: 'short' })) + '</h2></div><button class="iconbtn" data-act="fd" data-n="1" aria-label="Next day">›</button></section>';
    h += quickBar(p);
    h += '<section class="card"><div class="macros">' + macroBar('Calories', plan.tot.k, T.kcal, 'kcal') + macroBar('Protein', plan.tot.p, T.protein, 'g') + macroBar('Carbs', plan.tot.c, T.carbs, 'g') + macroBar('Fat', plan.tot.f, T.fat, 'g') + '</div><p class="small">Everything on this page comes from the week\'s shopping list: <strong class="num">' + money(weekShop().total, pt) + '</strong> in packs at ' + esc(pt.meta.label) + ' prices. <button class="linkbtn" data-act="tab" data-tab="shop">See the list</button></p>';
    if (plan.tot.p < T.protein * 0.92) h += nudge(p.diet === 'vegan' || (p.allergies || []).indexOf('dairy') >= 0 ? 'orgain-plant' : 'on-whey-5', 'This day is ' + Math.round(T.protein - plan.tot.p) + ' g short of your protein target. One scoop closes most of the gap.');
    if (plan.tot.p < T.protein * 0.8) h += '<div class="flag info">This day is short on protein for your diet settings. Extra red peas, eggs or a glass of milk (if they suit you) close the gap. Soya chunks are about half protein by dry weight, so a small handful adds a lot.</div>';
    h += '</section>';
    plan.meals.forEach(function (m) {
      if (m.empty) { h += '<section class="card"><h3>' + m.slot.name + '</h3><p class="muted">No meal fits your diet settings for this slot yet.</p></section>'; return; }
      h += '<section class="card"><div class="cardhead"><div><span class="label">' + m.slot.name + '</span><h3 style="margin-top:2px">' + esc(m.name) + '</h3></div><button class="btn ghost small" data-act="swap" data-slot="' + m.slot.key + '"' + (m.options < 2 ? ' disabled' : '') + '>Swap</button></div>';
      h += '<p class="small num"><strong>' + Math.round(m.tot.k) + ' kcal</strong> · ' + Math.round(m.tot.p) + ' g protein · ' + Math.round(m.tot.c) + ' g carbs · ' + Math.round(m.tot.f) + ' g fat</p>';
      h += '<div class="tablewrap"><table><thead><tr><th>Ingredient</th><th>Amount</th><th>Pack you buy</th></tr></thead><tbody>';
      m.items.forEach(function (it) { h += '<tr' + (it.role === 'topup' ? ' class="topup"' : '') + '><td>' + esc(OM.ingName(pt, it.id)) + (it.role === 'topup' ? ' <span class="pill pro">PRO top-up</span>' : '') + '</td><td class="num">' + esc(amount(it.id, it.g)) + '</td><td class="small num">' + esc(packText(pt.items[it.id], pt)) + '</td></tr>'; });
      h += '</tbody></table></div><p class="how">' + esc(m.how) + (m.topup ? ' <strong>PRO top-up:</strong> add ' + esc(m.topup) + ' to reach your higher protein target; the starch in your other meals is trimmed to make room.' : '') + '</p><p class="small muted">Amounts are raw, edible weight (peeled, off the bone).</p></section>';
    });
    return h;
  }

  function shopStart() { return TODAY; }
  function renderShop() {
    var p = P(), T = targets(), pt = prices();
    var start = shopStart();
    var sl = OM.shoppingList(start, 7, p, T, pt, S.swaps);
    var packs = sl.rows.reduce(function (a, r) { return a + (r.price.weighed ? 0 : r.qty); }, 0);
    var ticks = S.shopTicks[start] || {};
    var h = exampleBanner();
    h += '<section class="dayhead"><span class="label">' + esc(niceDate(start, { day: 'numeric', month: 'short' })) + ' – ' + esc(niceDate(OM.addDays(start, 6), { day: 'numeric', month: 'short' })) + '</span><h1>Shopping list</h1></section>';
    h += quickBar(p);
    var wk = OM.weekCostByTier(start, p, T, pt, S.swaps), bt = OM.budgetTier(p), eaten = sl.eatenCost;
    h += '<section class="card"><h3>Your food budget</h3><div class="tiers">' + [1, 2, 3].map(function (t) { return '<button class="tier' + (t === bt ? ' on' : '') + '" data-act="quick" data-k="budget" data-v="' + t + '" aria-pressed="' + (t === bt) + '"><span class="label">' + OM.BUDGETS[t].label + '</span><span class="v num">' + money(Math.round(wk[t]), pt) + '</span><span class="small muted">a week</span></button>'; }).join('') + '</div>';
    if (wk[1] > wk[2] * 1.01 || wk[2] > wk[3] * 1.01) h += '<p class="small">For you, a higher level works out cheaper this week: it leans on protein-rich foods like tuna and chicken breast, which cost less per gram of protein than eggs or mackerel.</p>';
    h += '<p class="small muted">Cost of the food you actually eat in 7 days at each level, with your foods and prices. The list below rounds up to whole packs, and packs like oil or oats last longer than a week.</p>';
    if (p.foodCap > 0) {
      var over = eaten - p.foodCap;
      h += '<p>' + (over > 0 ? '<strong>' + money(Math.round(over), pt) + ' over</strong> your weekly food budget of ' : 'Within your weekly food budget of ') + '<strong class="num">' + money(p.foodCap, pt) + '</strong> (this week: ' + money(Math.round(eaten), pt) + ').</p>';
      if (over > 0) { var fit = [3, 2, 1].filter(function (t) { return t < bt && wk[t] <= p.foodCap; })[0]; h += fit ? '<div><button class="btn small" data-act="quick" data-k="budget" data-v="' + fit + '">Switch to ' + OM.BUDGETS[fit].label + ' (' + money(Math.round(wk[fit]), pt) + ')</button></div>' : '<p class="small muted">' + (p.likes && p.likes.length ? 'Your ticked foods add to the cost: untick some under Change foods, or raise the budget a little.' : 'Even the Budget level is above this at your calorie target. Raise the budget a little, or enter your own prices with Edit price.') + '</p>'; }
    } else if (!isExample()) h += '<p class="small"><button class="linkbtn" data-act="setupfood">Set a weekly food budget</button> and the app tells you when a week goes over.</p>';
    h += '</section>';
    if (pt.region === 'OTHER') h += '<div class="flag warn">These are US prices standing in for ' + esc(pt.meta.label) + '. Tap <strong>Edit price</strong> on each item to enter what your store charges per pack; the list updates straight away.</div>';
    h += '<section class="kpis"><div class="kpi"><div class="v num">' + money(sl.total, pt) + '</div><div class="u">to buy this week</div></div><div class="kpi"><div class="v num">' + packs + '</div><div class="u">packs, tins & bags</div></div><div class="kpi"><div class="v num">' + sl.rows.length + '</div><div class="u">items</div></div></section>';
    h += '<p class="small muted">Prices are per pack as the supermarket sells it. Bigger packs (oil, peanut butter, oats, flour) last more than a week. Produce that is weighed at the counter is listed by the pound.</p>';
    var grp = null;
    h += '<section class="card">';
    sl.rows.forEach(function (r) {
      if (r.grp !== grp) { if (grp) h += '</div>'; grp = r.grp; h += '<div class="shopgrp"><h3 style="margin-top:6px">' + esc(grp) + '</h3>'; }
      var t = !!ticks[r.id];
      h += '<div class="shoprow' + (t ? ' ticked' : '') + '"><input type="checkbox" id="tick-' + r.id + '" data-act="tick" data-id="' + r.id + '"' + (t ? ' checked' : '') + ' aria-label="Bought ' + esc(r.name) + '"><label for="tick-' + r.id + '"><span class="nm"><strong>' + esc(r.name) + '</strong></span><br><span class="small num">' + esc(r.qtyText) + '</span></label><span class="num"><strong>' + money(r.cost, pt) + '</strong></span>';
      h += '<div class="src"><span class="pill ' + r.price.conf + '">' + ({ survey: 'Gov. survey', market: 'Market', store: 'Store', estimate: 'Estimate', placeholder: 'Placeholder', yours: 'Your price' }[r.price.conf] || r.price.conf) + '</span><span><strong>' + esc(packText(r.price, pt)) + '</strong> · ' + esc(r.price.store) + ' · ' + esc(r.price.src) + (r.price.date ? ', ' + esc(r.price.date) : '') + '</span><button class="linkbtn small" data-act="editprice" data-id="' + r.id + '">Edit price</button></div>';
      if (editPrice === r.id) {
        var stores = pt.meta.stores && pt.meta.stores.length ? pt.meta.stores : ['My store'];
        var curStore = r.price.conf === 'yours' ? r.price.store : stores[0];
        h += '<div class="priceedit"><label class="small" for="price-' + r.id + '">Price ' + (r.price.weighed ? 'per lb' : 'for ' + esc(r.price.u)) + ' (' + esc(pt.meta.symbol) + ')</label><input id="price-' + r.id + '" type="number" inputmode="decimal" min="0" step="any" value="' + r.price.pr + '"><label class="small" for="store-' + r.id + '">at</label><select id="store-' + r.id + '" style="width:auto">' + stores.map(function (s) { return '<option' + (s === curStore ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select><button class="btn small" data-act="saveprice" data-id="' + r.id + '">Save</button>' + (r.price.conf === 'yours' ? '<button class="linkbtn small" data-act="resetprice" data-id="' + r.id + '">Use survey price</button>' : '') + '<button class="linkbtn small" data-act="cancelprice">Cancel</button></div>';
      }
      h += '</div>';
    });
    if (grp) h += '</div>';
    h += '</section><p class="small muted">' + (pt.region === 'JM' ? 'Also keep on hand: salt, black pepper, thyme, garlic, curry powder, browning, limes and scotch bonnet. Saw a different price at PriceSmart, Hi-Lo or Loshusan? Tap Edit price and pick the store; your price is used everywhere in the app.' : 'Also keep on hand: salt, black pepper, garlic, soy sauce, chili powder, cumin, paprika and lemons or limes. ' + (OM.cuisineOf(p) !== 'us' ? 'For the Jamaican dishes add thyme, curry powder, browning and scotch bonnet. ' : '') + 'Paid a different price? Tap Edit price; your price is used everywhere in the app.') + '</p>';
    return h;
  }

  function chartSvg(ws, T) {
    if (ws.length < 2) return '<p class="muted small">Log at least two weigh-ins to see your chart.</p>';
    var W = 400, H = 220, L = 40, R = 8, Tp = 16, B = 26;
    var xs = ws.map(function (w) { return OM.dayNum(w.d); }), ys = ws.map(function (w) { return wtv(w.kg); });
    var goal = wtv(T.goalKg);
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs); if (x1 === x0) x1 = x0 + 1;
    var lo = Math.min.apply(null, ys.concat([goal])), hi = Math.max.apply(null, ys.concat([goal]));
    var pad = Math.max(0.5, (hi - lo) * 0.08); lo -= pad; hi += pad;
    var sx = function (x) { return L + (x - x0) / (x1 - x0) * (W - L - R); };
    var sy = function (y) { return Tp + (hi - y) / (hi - lo) * (H - Tp - B); };
    var step = (hi - lo) / 4, g = '';
    for (var i = 0; i <= 4; i++) { var v = lo + step * i, yy = sy(v); g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--line)" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="12" fill="var(--muted)">' + v.toFixed(1) + '</text>'; }
    // 7-day rolling average
    var avg = ws.map(function (w, i) { var dn = xs[i]; var win = ws.filter(function (u, j) { return xs[j] <= dn && xs[j] > dn - 7; }); return [dn, win.reduce(function (a, u) { return a + wtv(u.kg); }, 0) / win.length]; });
    var path = avg.map(function (q, i) { return (i ? 'L' : 'M') + sx(q[0]).toFixed(1) + ' ' + sy(q[1]).toFixed(1); }).join(' ');
    var area = path + ' L' + sx(avg[avg.length - 1][0]).toFixed(1) + ' ' + (H - B) + ' L' + sx(avg[0][0]).toFixed(1) + ' ' + (H - B) + ' Z';
    var dots = ws.map(function (w, i) { return '<circle cx="' + sx(xs[i]).toFixed(1) + '" cy="' + sy(ys[i]).toFixed(1) + '" r="3" fill="var(--muted)" opacity="0.7"/>'; }).join('');
    var last = avg[avg.length - 1];
    var gy = sy(goal);
    var lbl = '<text x="' + L + '" y="' + (H - 8) + '" font-size="12" fill="var(--muted)">' + esc(niceDate(ws[0].d, { day: 'numeric', month: 'short' })) + '</text><text x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end" font-size="12" fill="var(--muted)">' + esc(niceDate(ws[ws.length - 1].d, { day: 'numeric', month: 'short' })) + '</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Weight trend chart">' + g +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" stroke="var(--mango)" stroke-width="2" stroke-dasharray="6 5"/><text x="' + (W - R) + '" y="' + (gy - 6) + '" text-anchor="end" font-size="12" font-weight="700" fill="var(--mango-ink)">Goal ' + goal.toFixed(1) + '</text>' +
      '<path d="' + area + '" fill="var(--iron)" opacity="0.08"/><path d="' + path + '" fill="none" stroke="var(--iron)" stroke-width="2.5" stroke-linejoin="round"/>' + dots +
      '<circle cx="' + sx(last[0]).toFixed(1) + '" cy="' + sy(last[1]).toFixed(1) + '" r="5" fill="var(--iron)" stroke="var(--surface)" stroke-width="2"/>' + lbl + '</svg>';
  }
  /* ---------- store ---------- */
  function prod(id) { return OM.productById(id); }
  var pickVar = {};
  function inCart(id) { return Object.keys(S.cart || {}).some(function (k) { return k === id || k.indexOf(id + '.') === 0; }); }
  // seller mode is remembered on this device only, so order links never show costs to customers
  /* ---------- What's new: header button with a dot until the viewer has seen the newest entry ---------- */
  var NEWSKEY = 'omgym-news-seen', newsOpenUnseen = 0, newsMem = '';
  function newsSeen() { try { return localStorage.getItem(NEWSKEY) || ''; } catch (e) { return newsMem; } }
  function setNewsSeen(k) { try { localStorage.setItem(NEWSKEY, k); } catch (e) { } newsMem = k; }
  function updateNewsDot() {
    var n = OM.unseenChanges(OM.CHANGES, newsSeen()), dot = document.getElementById('newdot'), b = document.getElementById('newsbtn');
    if (dot) dot.hidden = !n;
    if (b) b.setAttribute('aria-label', n ? 'What\'s new: ' + n + ' new update' + (n === 1 ? '' : 's') : 'What\'s new');
  }
  function renderNews() {
    var h = '<div class="wrap"><div class="newshead"><h2 id="news-h">What\'s new</h2><button class="iconbtn" data-act="closenews" aria-label="Close">×</button></div>';
    h += '<section class="card">' + OM.CHANGES.map(function (c, i) {
      return '<div class="newsitem"><span class="label">' + esc(niceDate(c.d, { day: 'numeric', month: 'short', year: 'numeric' })) + (i < newsOpenUnseen ? ' <span class="pill new">New</span>' : '') + '</span><strong>' + esc(c.t) + '</strong><ul class="lines small">' + c.b.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    }).join('') + '</section>';
    h += '<div><button class="btn ghost" data-act="closenews">Close</button></div></div>';
    $('#news').innerHTML = h;
  }
  function openNews() {
    newsOpenUnseen = OM.unseenChanges(OM.CHANGES, newsSeen());
    renderNews(); $('#news').hidden = false; $('#news').scrollTop = 0; document.body.style.overflow = 'hidden';
    if (OM.CHANGES.length) setNewsSeen(OM.changeKey(OM.CHANGES[0]));
    updateNewsDot();
    var c = $('#news [data-act=closenews]'); if (c) c.focus();
  }
  function closeNews() { $('#news').hidden = true; document.body.style.overflow = ''; var b = document.getElementById('newsbtn'); if (b) b.focus(); }
  function sellerOn() { try { return localStorage.getItem('omgym-seller') === '1'; } catch (e) { return !!S.sellerView; } }
  function setSeller(on) { try { localStorage.setItem('omgym-seller', on ? '1' : '0'); } catch (e) { } S.sellerView = on; }
  // simple drawn pictures (generic, no brand artwork)
  var PICS = {
    tub: '<rect class="pa" x="36" y="12" width="48" height="12" rx="3"/><rect class="ps" x="31" y="22" width="58" height="62" rx="9"/><rect class="pb" x="32.5" y="40" width="55" height="24"/><path class="pw" d="M45 52h30"/>',
    plant: '<rect class="pa" x="36" y="12" width="48" height="12" rx="3"/><rect class="ps" x="31" y="22" width="58" height="62" rx="9"/><path class="pb" d="M60 70c-14-4-18-18-12-30 10 2 18 12 12 30z"/><path class="pl" d="M60 70c-2-10-6-18-12-30"/>',
    jar: '<rect class="pa" x="44" y="16" width="32" height="10" rx="3"/><rect class="ps" x="40" y="24" width="40" height="60" rx="8"/><rect class="pb" x="41.5" y="44" width="37" height="18"/><circle class="pw2" cx="60" cy="53" r="4"/>',
    bolt: '<rect class="pa" x="38" y="14" width="44" height="11" rx="3"/><rect class="ps" x="34" y="23" width="52" height="61" rx="9"/><path class="pb" d="M63 34L50 56h10l-4 18 14-24H60z"/>',
    gloves: '<rect class="ps" x="40" y="34" width="40" height="38" rx="10"/><rect class="ps" x="40" y="20" width="9" height="18" rx="4.5"/><rect class="ps" x="50.5" y="16" width="9" height="22" rx="4.5"/><rect class="ps" x="61" y="17" width="9" height="21" rx="4.5"/><rect class="ps" x="71" y="22" width="9" height="16" rx="4.5"/><rect class="ps" x="28" y="44" width="16" height="9" rx="4.5" transform="rotate(-35 36 48)"/><rect class="pb" x="38" y="70" width="44" height="12" rx="4"/>',
    rope: '<path class="pl" d="M30 28c-6 40 66 60 60 0"/><rect class="pa" x="24" y="10" width="12" height="26" rx="6"/><rect class="pb" x="84" y="10" width="12" height="26" rx="6"/>',
    bands: '<ellipse class="pr1" cx="48" cy="50" rx="26" ry="16"/><ellipse class="pr2" cx="66" cy="44" rx="26" ry="16"/><ellipse class="pr3" cx="60" cy="60" rx="26" ry="16"/>',
    shaker: '<rect class="pa" x="46" y="10" width="28" height="12" rx="4"/><path class="pl" d="M74 14c10 0 10 12 0 12"/><path class="ps" d="M42 22h36l-4 62H46z"/><path class="pb" d="M44.5 50h31l-1.6 22h-27.8z"/>',
    straps: '<rect class="ps" x="22" y="40" width="76" height="16" rx="8"/><rect class="pb" x="22" y="40" width="24" height="16" rx="8"/><path class="pl" d="M92 48c8-10 8-24-6-24"/>',
    wraps: '<circle class="ps" cx="48" cy="52" r="20"/><circle class="pb" cx="48" cy="52" r="8"/><path class="ps" d="M66 44h28v16H66z"/><path class="pl" d="M94 52c10 0 10-16 0-16"/>'
  };
  function pic(kind, cls) { return '<div class="' + (cls || 'pic') + '" aria-hidden="true"><svg viewBox="0 0 120 96">' + (PICS[kind] || PICS.tub) + '</svg></div>'; }
  function jm(v) { return 'J$' + Math.round(v).toLocaleString('en-US'); }
  function cartCount() { return Object.keys(S.cart || {}).reduce(function (a, k) { return a + (S.cart[k] || 0); }, 0); }
  function nudge(id, why) {
    var pr = prod(id); if (!pr || OM.STORE.paused) return '';
    var key = TODAY + ':' + id;
    if ((S.nudgeHide || {})[key] || inCart(id) || OM.productView(pr, P()).hidden) return '';
    var l = OM.landed(pr);
    var addBtn = pr.variants ? '<button class="btn small" data-act="gostore" data-id="' + id + '">Choose ' + esc(pr.vlabel.toLowerCase()) + '</button>' : '<button class="btn small" data-act="cartadd" data-key="' + OM.cartKey(id) + '">Add to bag</button>';
    return '<section class="nudge">' + pic(pr.pic, 'pic sm') + '<div class="nudge-txt"><span class="label">From the OMGym Store</span><strong>' + esc(pr.name) + '</strong><span class="small muted">' + esc(why) + '</span></div><div class="nudge-act"><span class="num nudge-price">' + jm(l.price) + '</span>' + addBtn + '<button class="linkbtn small" data-act="nudgehide" data-key="' + key + '">Not now</button></div></section>';
  }
  function storeRegionNote() { return P().region !== 'JM' ? '<div class="flag info">The OMGym Store delivers in Jamaica only. Prices are in J$ and include shipping to Jamaica, customs duty and GCT.</div>' : ''; }
  function renderStorePaused() {
    var cfg = OM.STORE;
    var h = '<section class="dayhead"><span class="label">Paused for now</span><h1>OMGym Store</h1></section>';
    h += '<section class="card hero" id="store-paused"><h3>The Store is paused</h3><p>' + esc(cfg.pauseNote) + '</p><p class="small muted">Nothing can be ordered right now. Your meal plan still reaches its targets with food.</p></section>';
    S.cart = OM.normalizeCart(S.cart);
    var keys = Object.keys(S.cart).filter(function (k) { return S.cart[k] && OM.parseKey(k); });
    if (keys.length) {
      h += '<section class="card bag"><h3>Your saved bag</h3>' + keys.map(function (k) { var pk = OM.parseKey(k); return '<div class="logrow"><span>' + esc(pk.prod.name) + ' <span class="small muted">' + esc(pk.prod.size.split(' · ')[0]) + (pk.variant ? ', ' + esc(pk.variant.label) : '') + '</span></span><span class="num">× ' + S.cart[k] + '</span><span></span></div>'; }).join('') + '<p class="small muted">Prices will be checked again when the Store reopens.</p><div><button class="linkbtn small" data-act="emptybag">Empty the bag</button></div></section>';
    }
    return h + renderSeller(cfg);
  }
  function renderStore() {
    if (OM.STORE.paused) return renderStorePaused();
    var p = P(), cfg = OM.STORE;
    var h = '<section class="dayhead"><span class="label">Delivered to Jamaica in ' + esc(cfg.leadTime) + '</span><h1>OMGym Store</h1><p class="small muted">Prices include shipping, customs duty and GCT. Pay and arrange delivery with OMGym on WhatsApp.</p></section>';
    h += storeRegionNote();
    // bag
    S.cart = OM.normalizeCart(S.cart);
    var ord = OM.orderText(S.cart, cfg, S.orderName, TODAY);
    if (ord.count) {
      h += '<section class="card hero bag"><div class="cardhead"><div><h3>Your bag</h3><span class="small muted num">Order ' + esc(ord.id) + '</span></div><span class="num" style="font-family:var(--display);font-weight:800;font-size:1.5rem">' + jm(ord.total) + '</span></div>';
      Object.keys(S.cart).forEach(function (k) {
        var q = S.cart[k], pk = OM.parseKey(k); if (!q || !pk) return;
        h += '<div class="bagrow">' + pic(pk.prod.pic, 'pic xs bp') + '<span class="bn">' + esc(pk.prod.name) + ' <span class="small muted">' + esc(pk.prod.size.split(' · ')[0]) + '</span>' + (pk.variant ? '<br><span class="small"><strong>' + esc(pk.variant.label) + '</strong></span>' : '') + '</span><span class="qty bq"><button class="iconbtn sm" data-act="cartdec" data-key="' + k + '" aria-label="One fewer">−</button><span class="num">' + q + '</span><button class="iconbtn sm" data-act="cartadd" data-key="' + k + '" aria-label="One more">+</button></span><span class="num br">' + jm(OM.landed(pk.prod).price * q) + '</span></div>';
      });
      h += '<div class="formrow"><label class="f" for="order-name">Your name</label><input id="order-name" type="text" autocomplete="name" value="' + esc(S.orderName || '') + '" placeholder="So OMGym knows who is ordering"></div>';
      if (cfg.whatsapp) h += '<a class="btn wa" id="wa-link" href="https://wa.me/' + cfg.whatsapp + '?text=' + encodeURIComponent(ord.text) + '" target="_blank" rel="noopener">Send order on WhatsApp</a>';
      h += '<details><summary class="small">Or copy the order</summary><textarea id="order-text" readonly rows="6">' + esc(ord.text) + '</textarea><button class="btn ghost small" data-act="copyorder">' + (orderCopied ? 'Copied' : 'Copy order') + '</button>' + (cfg.whatsapp ? '<p class="small muted">WhatsApp: +' + cfg.whatsapp.replace(/^1(\d{3})(\d{3})(\d{4})$/, '1 ($1) $2-$3') + '</p>' : '') + '</details>';
      h += '<p class="small muted">Nothing is charged here. OMGym confirms the price, payment and delivery with you on WhatsApp.</p><div><button class="linkbtn small" data-act="emptybag">Empty the bag</button></div></section>';
    }
    var cats = [['all', 'All'], ['protein', 'Protein'], ['creatine', 'Creatine'], ['preworkout', 'Pre-workout'], ['gear', 'Gym gear']];
    h += '<div class="seg" role="group" aria-label="Category">' + cats.map(function (c) { return '<button class="chip" data-act="storecat" data-c="' + c[0] + '" aria-pressed="' + (storeCat === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>';
    var hiddenStim = false;
    h += '<section class="products">';
    OM.PRODUCTS.forEach(function (pr) {
      if (storeCat !== 'all' && pr.cat !== storeCat) return;
      var v = OM.productView(pr, isExample() ? null : p);
      if (v.hidden) { hiddenStim = true; return; }
      var l = OM.landed(pr), chosen = OM.variantOf(pr, pickVar[pr.id]), key = OM.cartKey(pr.id, chosen && chosen.id), q = (S.cart || {})[key] || 0;
      h += '<article class="prod">' + pic(pr.pic) + '<div class="prod-top"><span class="pill">' + ({ protein: 'Protein', creatine: 'Creatine', preworkout: 'Pre-workout', gear: 'Gym gear' }[pr.cat]) + '</span>' + (v.conflict.length ? '<span class="pill estimate">Contains ' + esc(v.conflict.map(function (t) { return t === 'dairy' ? 'milk' : t; }).join(', ')) + '</span>' : '') + '</div>';
      h += '<h3>' + esc(pr.name) + '</h3><p class="small muted">' + esc(pr.size) + '</p><p class="small">' + esc(pr.desc) + '</p>';
      if (pr.variants) h += '<div class="formrow"><label class="small" for="var-' + pr.id + '"><strong>' + esc(pr.vlabel) + '</strong></label><select id="var-' + pr.id + '" data-act="pickvar" data-id="' + pr.id + '">' + pr.variants.map(function (v) { return '<option value="' + v.id + '"' + (chosen && v.id === chosen.id ? ' selected' : '') + '>' + esc(v.label) + '</option>'; }).join('') + '</select></div>';
      h += '<div class="prod-foot"><div><div class="num prod-price">' + jm(l.price) + '</div>' + (l.perServing ? '<div class="small muted num">' + jm(l.perServing) + ' a serving · ' + esc(pr.perServing) + '</div>' : '') + '</div>';
      h += q ? '<span class="qty"><button class="iconbtn sm" data-act="cartdec" data-key="' + key + '" aria-label="One fewer">−</button><span class="num">' + q + '</span><button class="iconbtn sm" data-act="cartadd" data-key="' + key + '" aria-label="One more">+</button></span>' : '<button class="btn small" data-act="cartadd" data-key="' + key + '">Add to bag</button>';
      h += '</div></article>';
    });
    h += '</section>';
    if (hiddenStim) h += '<div class="flag info">Pre-workout is hidden for you because of your health answers. It contains caffeine; check with your doctor first.</div>';
    h += '<p class="small muted">Supplements are optional: your meal plan reaches its targets with food. Supplement claims are not evaluated by health authorities.</p>';
    return h + renderSeller(cfg);
  }
  function renderSeller(cfg) {
    var h = '', sv = sellerOn();
    h += '<section class="card"><div class="cardhead"><h3>Seller view</h3><button class="chip" data-act="sellerview" aria-pressed="' + sv + '">' + (sv ? 'On' : 'Off') + '</button></div>';
    if (sv) h += '<p class="small muted">Seller view is on for this phone only. Order links you receive on WhatsApp will show your cost and profit here; customers who open a link see only the items.</p>';
    if (sv) {
      h += '<p class="small muted">How each price is built. ' + esc(OM.PRODUCT_PRICES_NOTE) + '</p><div class="tablewrap"><table class="small"><thead><tr><th>Item</th><th class="r">Amazon</th><th class="r">Goods J$</th><th class="r">Freight</th><th class="r">Duty</th><th class="r">GCT</th><th class="r">Fees</th><th class="r">Landed</th><th class="r">Price</th><th class="r">Profit</th></tr></thead><tbody>';
      OM.PRODUCTS.forEach(function (pr) { var l = OM.landed(pr); h += '<tr><td>' + esc(pr.name.replace('Optimum Nutrition', 'ON')) + ' ' + esc(pr.size.split(' · ')[0]) + '</td><td class="r">US$' + pr.usd.toFixed(2) + '</td><td class="r">' + jm(l.goods) + '</td><td class="r">' + jm(l.freight) + '</td><td class="r">' + jm(l.duty) + '</td><td class="r">' + jm(l.gct) + '</td><td class="r">' + jm(l.fees) + '</td><td class="r">' + jm(l.cost) + '</td><td class="r"><strong>' + jm(l.price) + '</strong></td><td class="r">' + jm(l.profit) + '</td></tr>'; });
      h += '</tbody></table></div><h4 class="small">Where each Amazon price came from</h4><ul class="lines small" id="pricesources">';
      OM.PRODUCTS.forEach(function (pr) { var c = OM.priceCheck(pr, TODAY); h += '<li><strong>' + esc(pr.name.replace('Optimum Nutrition', 'ON')) + ' ' + esc(pr.size.split(' · ')[0]) + '</strong> US$' + pr.usd.toFixed(2) + ' <span class="pill ' + (pr.conf === 'estimate' ? 'estimate' : 'retail') + '">' + esc(c.label) + '</span>' + (c.stale ? ' <span class="pill estimate">Check again</span>' : '') + '<br><span class="muted">' + esc(pr.src || '') + (pr.date ? ' · ' + esc(pr.date) : '') + '</span></li>'; });
      h += '</ul><ul class="lines small muted">' + (cfg.paused ? '<li><strong>The Store is paused: customers see no prices and cannot order.</strong> Set STORE.paused to false in core.js to reopen.</li>' : '') + '<li>' + esc(cfg.fxNote) + ' → J$' + cfg.fx + '.</li><li>' + esc(cfg.usTaxNote) + '.</li><li>' + esc(cfg.freightNote) + '.</li><li>' + esc(cfg.dutyNote) + '.</li><li>Markup ' + Math.round(cfg.markup * 100) + '% on landed cost, rounded up to J$' + cfg.roundTo + '.</li><li>Supplements need a Ministry of Health import permit before they are imported for sale.</li></ul>';
    }
    h += '</section>';
    return h;
  }

  /* ---------- PRO ---------- */
  var PROKEY = 'omgym-pro';
  function proLoad() { var d = null; try { d = JSON.parse(localStorage.getItem(PROKEY) || 'null'); } catch (e) { } d = d || {}; if (!d.id) d.id = OM.newProId(); d.invoices = d.invoices || []; d.unlocks = d.unlocks || []; d.graceLog = d.graceLog || []; return d; }
  var PD = proLoad();
  function proSave() { try { localStorage.setItem(PROKEY, JSON.stringify(PD)); } catch (e) { } }
  proSave();
  var proVerified = [], proChecked = false, proNotice = null, proView = null, proLinkError = '';
  function proStatusNow() { return OM.proStatus(TODAY, PD.id, proVerified, PD.grace); }
  function proActive() { return proStatusNow().active; }
  function proPlan() { return proActive() && PD.plan && OM.PRO_PHASES[PD.plan.phase] ? PD.plan : null; }
  function verifyStored() {
    return Promise.all(PD.unlocks.map(function (f) { return OM.proVerify(f).then(function (ok) { return ok ? f : null; }); }))
      .then(function (r) { proVerified = r.filter(Boolean); proChecked = true; });
  }
  // add an unlock link (from the address bar or pasted); returns a message for the person
  function acceptLink(search) {
    var f = OM.parseProLink(search);
    if (!f) return Promise.resolve({ ok: false, msg: 'That isn\'t an OMGym PRO unlock link. Copy the whole link from OMGym\'s WhatsApp message.' });
    return OM.proVerify(f).then(function (ok) {
      if (!ok) return { ok: false, msg: 'This unlock link has been changed or is damaged. Ask OMGym on WhatsApp to send it again.' };
      if (f.id !== PD.id) return { ok: false, other: true, f: f, msg: 'This link is for PRO ID ' + f.id + ', but this app\'s PRO ID is ' + PD.id + '.' };
      if (!PD.unlocks.some(function (u) { return u.sig === f.sig; })) PD.unlocks.push(f);
      PD.invoices.forEach(function (inv) { if (inv.no === f.inv) inv.status = 'paid'; });
      if (!PD.invoices.some(function (inv) { return inv.no === f.inv; })) PD.invoices.push({ no: f.inv, id: f.id, name: f.n, start: OM.expandDate(f.s), until: OM.expandDate(f.u), method: f.m, created: OM.expandDate(f.pd), status: 'paid' });
      PD.grace = null; proSave();
      return verifyStored().then(function () { return { ok: true, f: f, msg: 'PRO is unlocked until ' + niceDate(OM.expandDate(f.u), { day: 'numeric', month: 'long', year: 'numeric' }) + '. Your receipt is saved below.' }; });
    });
  }
  function money2(v) { return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function dmy(d) { return niceDate(d, { day: 'numeric', month: 'short', year: 'numeric' }); }
  function isPages() { return /github\.io$/.test(location.hostname); }
  function unlockFor(no) { return proVerified.filter(function (f) { return f.inv === no; })[0]; }
  function renderInvoice(inv) {
    var paid = unlockFor(inv.no), jmd = OM.proJmd(OM.PRO.priceUsd, OM.PRO.boj.rate), B = OM.PRO.bank;
    var status = paid ? 'Paid' : inv.status === 'sent' ? 'Awaiting confirmation' : 'Unpaid';
    var h = '<section class="card invoice" id="invoice"><div class="cardhead"><div><span class="label">' + (paid ? 'Receipt' : 'Invoice') + '</span><h2 class="nowrap">' + esc(inv.no) + '</h2></div><span class="pill ' + (paid ? 'done' : inv.status === 'sent' ? 'estimate' : '') + '">' + status + '</span></div>';
    h += '<div class="invgrid small"><div><span class="label">Date</span><br>' + esc(dmy(inv.created)) + '</div><div><span class="label">From</span><br>' + esc(OM.PRO.seller) + '<br>WhatsApp +1 (658) 218-4432</div><div><span class="label">Bill to</span><br>' + esc(inv.name || '—') + '<br>PRO ID ' + esc(inv.id) + '</div></div>';
    h += '<div class="tablewrap"><table><thead><tr><th>Item</th><th class="r">Amount</th></tr></thead><tbody><tr><td>OMGym PRO, 1 month<br><span class="small muted">' + esc(dmy(inv.start)) + ' to ' + esc(dmy(inv.until)) + '</span></td><td class="r">US$' + money2(OM.PRO.priceUsd) + '</td></tr><tr><td><strong>' + (paid ? 'Total paid' : 'Total due') + '</strong></td><td class="r"><strong>US$' + money2(OM.PRO.priceUsd) + '</strong></td></tr></tbody></table></div>';
    if (paid) {
      h += '<p class="paidline"><strong>Paid</strong> by ' + esc(OM.PRO_METHODS[paid.m] || paid.m) + ', US$' + esc(paid.amt) + '. Confirmed by OMGym on ' + esc(dmy(OM.expandDate(paid.pd))) + '.</p>';
    } else {
      h += '<h3>How to pay</h3>';
      if (OM.PRO.lynk) h += '<div class="payopt"><strong>Lynk (J$)</strong><p class="small">Send <strong class="num">J$' + money2(jmd) + '</strong> to <strong>' + esc(OM.PRO.lynk) + '</strong> in the Lynk app, with ' + esc(inv.no) + ' in the note. US$10 at the Bank of Jamaica rate of J$' + OM.PRO.boj.rate + ' (' + esc(dmy(OM.PRO.boj.date)) + ').</p><button class="btn ghost small" data-act="copylynk">Copy Lynk username</button></div>';
      if (OM.PRO.showBank || !OM.PRO.lynk) h += '<div class="payopt"><strong>Scotiabank transfer (J$)</strong><dl class="small"><dt>Name</dt><dd>' + esc(B.holder) + '</dd><dt>Bank</dt><dd>' + esc(B.bank) + '</dd><dt>Account type</dt><dd>' + esc(B.type) + '</dd><dt>Account number</dt><dd class="num">' + esc(B.number) + '</dd><dt>Currency</dt><dd>' + esc(B.currency) + '</dd><dt>Reference</dt><dd>' + esc(inv.no) + '</dd><dt>Amount</dt><dd class="num"><strong>J$' + money2(jmd) + '</strong></dd></dl><p class="small muted">US$10 at the Bank of Jamaica rate of J$' + OM.PRO.boj.rate + ' (' + esc(dmy(OM.PRO.boj.date)) + '). If you pay on another day, use that day\'s Bank of Jamaica rate.</p><button class="btn ghost small" data-act="copybank" data-no="' + esc(inv.no) + '">Copy bank details</button></div>';
      h += '<div class="payopt"><strong>PayPal (US$)</strong><p class="small">' + (OM.PRO.paypal ? 'Send US$' + money2(OM.PRO.priceUsd) + ' to <strong>' + esc(OM.PRO.paypal) + '</strong> with ' + esc(inv.no) + ' in the note. Choose "Friends and family" only if you know the seller; otherwise "Goods and services" protects you.' : 'Ask OMGym on WhatsApp for the PayPal address, then send US$' + money2(OM.PRO.priceUsd) + ' with ' + esc(inv.no) + ' in the note.') + '</p></div>';
    }
    h += '<details><summary class="small">Terms</summary><ul class="lines small">' + OM.PRO.terms.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></details>';
    if (isPages()) h += '<div class="noprint"><button class="btn ghost small" data-act="printinv">Print or save as PDF</button></div>';
    return h + '</section>';
  }
  function renderPro() {
    var st = proStatusNow(), h = '';
    h += '<section class="dayhead"><span class="label">For lifters with 3+ years of training</span><h1>OMGym <span class="pro-word">PRO</span></h1></section>';
    if (proNotice) h += '<div class="flag ' + (proNotice.ok ? 'info' : 'warn') + '" role="status">' + esc(proNotice.msg) + (proNotice.other ? ' Open OMGym from your Home Screen, go to PRO and paste this link under "Already paid?". <button class="linkbtn" data-act="copyprolink">Copy this link</button>' : '') + '</div>';
    if (st.active) {
      h += '<section class="card hero"><div class="cardhead"><h3>' + (st.via === 'grace' ? 'PRO is open while OMGym checks your payment' : 'PRO is active') + '</h3><span class="pill done">PRO</span></div><p>' + (st.via === 'grace' ? 'Early access ends ' + esc(dmy(st.until)) + '. It becomes a full month as soon as OMGym confirms your payment.' : 'Active until <strong>' + esc(dmy(st.until)) + '</strong> (' + st.daysLeft + ' day' + (st.daysLeft === 1 ? '' : 's') + ' left).') + '</p>' + (st.renewSoon ? '<p><strong>Renew now</strong> to keep PRO without a gap. The new month starts when this one ends.</p><button class="btn" data-act="pronew">Renew PRO</button>' : '') + '</section>';
      if (PD.invoices.some(function (i) { return !unlockFor(i.no) && i.status !== 'void'; })) h += renderProStart(st);
      h += renderProPlan();
    } else {
      h += '<section class="card"><h3>What you get</h3><ul class="lines"><li>Choose your phase: <strong>cut</strong>, <strong>lean bulk</strong> or <strong>maintain</strong>, with the rate set for experienced lifters.</li><li>Higher protein when cutting (2.3 g per kg), from the sports nutrition research for trained lifters.</li><li>Harder training weeks: top sets close to failure, 5–8 reps on a cut to keep strength.</li><li>Weekly sets for every muscle group, and calorie check-ins every week instead of every two.</li></ul><p class="small muted">US$' + money2(OM.PRO.priceUsd) + ' a month. Nothing renews by itself.</p></section>';
      h += renderProStart(st);
    }
    // invoices and receipts
    if (PD.invoices.length) {
      h += '<section class="card"><h3>Invoices and receipts</h3>' + PD.invoices.slice().reverse().map(function (inv) { var pd = unlockFor(inv.no); return '<div class="logrow"><span><strong>' + esc(inv.no) + '</strong><br><span class="small muted">' + esc(dmy(inv.start)) + ' to ' + esc(dmy(inv.until)) + '</span></span><span class="pill ' + (pd ? 'done' : 'estimate') + '">' + (pd ? 'Paid' : inv.status === 'sent' ? 'Awaiting' : 'Unpaid') + '</span><button class="linkbtn small" data-act="showinv" data-no="' + esc(inv.no) + '">Open</button></div>'; }).join('') + '</section>';
      var show = PD.invoices.filter(function (i) { return i.no === proView; })[0];
      if (show) h += renderInvoice(show);
    }
    // paste link
    h += '<section class="card"><h3>Already paid?</h3><p class="small muted">Paste the unlock link OMGym sent you on WhatsApp.</p><div class="formrow"><label class="small" for="pro-paste">Unlock link</label><input id="pro-paste" type="text" inputmode="url" autocomplete="off" placeholder="https://876lab.github.io/omgym/?pro=1…"></div>' + (proLinkError ? '<p class="err">' + esc(proLinkError) + '</p>' : '') + '<div><button class="btn" data-act="propaste">Unlock PRO</button></div><p class="small muted">Your PRO ID on this phone: <strong class="num">' + esc(PD.id) + '</strong></p></section>';
    return h;
  }
  function renderProStart(st) {
    var open = PD.invoices.filter(function (i) { return !unlockFor(i.no) && i.status !== 'void'; }).slice(-1)[0];
    var h = '<section class="card hero" id="pro-start"><h3>Get PRO</h3>';
    if (!open) {
      h += '<div class="formrow"><label class="f" for="pro-name">Your name</label><input id="pro-name" type="text" autocomplete="name" value="' + esc(PD.name || (S.profile && S.profile.name) || '') + '"></div>';
      h += '<label class="tick small"><input type="checkbox" id="pro-years"> I have trained consistently for 3 years or more</label>';
      h += '<p class="small muted">PRO plans run harder than the standard plan. If you\'re newer to training, the standard plan will serve you better.</p>';
      h += '<div><button class="btn" data-act="pronew">Create my invoice</button></div>';
    } else {
      h += '<p>Invoice <strong>' + esc(open.no) + '</strong> is ready. Pay by ' + OM.proPayMethods().map(function (m) { return OM.PRO_METHODS[m]; }).join(' or ').replace(' or ', OM.proPayMethods().length > 2 ? ', ' : ' or ') + ', then send OMGym your payment screenshot on WhatsApp.</p>';
      h += renderInvoice(open);
      h += '<div class="formrow"><span class="f">How did you pay?</span><div class="seg" role="group">' + OM.proPayMethods().map(function (m) { return '<button class="chip" data-act="promethod" data-m="' + m + '" aria-pressed="' + ((open.method || OM.proPayMethods()[0]) === m) + '">' + OM.PRO_METHODS[m] + '</button>'; }).join('') + '</div></div>';
      var txt = OM.proProofText(Object.assign({}, open, { start: open.start, until: open.until }), open.method || OM.proPayMethods()[0]);
      h += '<a class="btn wa" id="pro-proof" data-act="proproof" data-no="' + esc(open.no) + '" href="https://wa.me/' + OM.PRO.whatsapp + '?text=' + encodeURIComponent(txt) + '" target="_blank" rel="noopener">I\'ve paid: send proof on WhatsApp</a>';
      h += '<p class="small muted">WhatsApp opens with your details filled in. Attach the screenshot of your transfer before you send. ' + (OM.graceAllowed(TODAY, PD.graceLog) ? 'PRO opens for ' + OM.PRO.graceDays + ' days straight away while OMGym checks your payment (usually 1–3 days).' : 'PRO unlocks when OMGym confirms your payment (usually 1–3 days).') + '</p>';
      h += '<div><button class="linkbtn small" data-act="provoid" data-no="' + esc(open.no) + '">Cancel this invoice</button></div>';
    }
    return h + '</section>';
  }
  function renderProPlan() {
    var plan = PD.plan || {}, phases = OM.PRO_PHASES, p = P();
    var h = '<section class="card"><h3>Your phase</h3><div class="seg" role="group">' + Object.keys(phases).map(function (k) { return '<button class="chip" data-act="prophase" data-ph="' + k + '" aria-pressed="' + (plan.phase === k) + '">' + phases[k].label + '</button>'; }).join('') + '</div>';
    if (plan.phase && phases[plan.phase].rates.length > 1) {
      var lab = function (r) { return plan.phase === 'cut' ? (r * 100) + '% a week' : (r === 0.0015 ? 'Lean, ~0.15% a week' : 'Faster, ~0.25% a week'); };
      h += '<div class="formrow"><span class="f">Rate</span><div class="seg" role="group">' + phases[plan.phase].rates.map(function (r) { var cur = plan.rate || phases[plan.phase].def; return '<button class="chip" data-act="prorate" data-r="' + r + '" aria-pressed="' + (cur === r) + '">' + lab(r) + '</button>'; }).join('') + '</div></div>';
    }
    if (!plan.phase) return h + '<p class="small muted">Pick a phase to switch your calories, protein and training to PRO.</p></section>';
    if (isExample()) return h + '<p class="small muted">Set up your plan first so PRO can use your numbers.</p></section>';
    var T = targets();
    if (!T.pro) h += '<div class="flag warn">Your health answers keep your plan at maintenance, so PRO phases are paused. Talk to your doctor first.</div>';
    h += '<div class="stats"><div class="stat"><span class="label">Calories</span><span class="v num">' + T.kcal.toLocaleString() + '</span><span class="small muted">Maintenance ' + T.tdee.toLocaleString() + '</span></div><div class="stat"><span class="label">Protein</span><span class="v num">' + T.protein + ' g</span><span class="small muted">' + T.ppk + ' g per kg</span></div><div class="stat"><span class="label">Planned change</span><span class="v num">' + (T.plannedWeeklyKg > 0 ? '+' : '') + wt(T.plannedWeeklyKg, 2) + '/wk</span><span class="small muted">' + (T.floorApplied ? 'Held at the safe minimum' : T.goalType === 'lose' && T.plannedWeeklyKg > -T.proRate * p.weightKg + 0.01 ? 'Capped at 25% below maintenance' : 'On target') + '</span></div><div class="stat"><span class="label">Carbs · Fat</span><span class="v num">' + T.carbs + ' · ' + T.fat + ' g</span></div></div>';
    var mon = OM.addDays(TODAY, -((OM.weekday(TODAY) + 6) % 7));
    var vol = OM.weeklyVolume(mon, p, startDate(), T.caution, plan);
    h += '<h3 style="margin-top:6px">Hard sets this week</h3><p class="small muted">About 10 or more sets per muscle a week builds muscle; on a cut, keeping volume up protects it.</p><div class="vol">' + vol.map(function (v) { var pc = Math.min(100, v.sets / 20 * 100); return '<div class="volrow"><span class="small">' + v.muscle + '</span><div class="bar' + (v.sets < 10 ? ' over' : '') + '"><i style="width:' + pc + '%"></i></div><span class="small num">' + v.sets + '</span></div>'; }).join('') + '</div>';
    if (vol.some(function (v) { return v.sets < 10; })) h += '<p class="small muted">Under 10 sets (orange): add a training day or extra sets for those muscles when you have time.</p>';
    return h + '</section>';
  }
  function startProInvoice() {
    var nm = (document.getElementById('pro-name') || {}).value, yrs = document.getElementById('pro-years');
    var st = proStatusNow();
    if (!st.active || st.via === 'paid' && st.renewSoon) {
      if (!st.active) {
        if (!nm || !nm.trim()) { toast('Enter your name for the invoice'); return; }
        if (yrs && !yrs.checked) { toast('PRO is for 3+ years of training. Tick the box to confirm.'); return; }
      }
    }
    PD.name = (nm && nm.trim()) || PD.name || (S.profile && S.profile.name) || '';
    var per = OM.nextPeriod(TODAY, st.lastUntil, 1);
    var seq = PD.invoices.length + 1;
    PD.invoices.push({ no: OM.invoiceNo(PD.id, per.start, seq), id: PD.id, name: PD.name, start: per.start, until: per.until, method: OM.proPayMethods()[0], created: TODAY, status: 'unpaid' });
    proSave(); proView = null; tab = 'pro'; render();
    var el = document.getElementById('pro-start'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
  }

  /* ---------- order sheet: what to buy on Amazon for one customer order ---------- */
  var ORDER = OM.parseOrder(location.search);
  function orderTicks() { try { return JSON.parse(localStorage.getItem('omgym-orders') || '{}'); } catch (e) { return {}; } }
  function renderOrder() {
    var o = ORDER, cfg = OM.STORE, ticks = orderTicks()[o.id] || {}, sv = sellerOn();
    var h = '<section class="dayhead"><span class="label">Customer order' + (o.name ? ' · ' + esc(o.name) : '') + '</span><h1>Order <span class="nowrap">' + esc(o.id || '') + '</span></h1></section>';
    if (!o.lines.length) return h + '<div class="flag warn">This order link has no items OMGym recognises. Ask the customer to send it again from the Store.</div><div><button class="btn" data-act="closeorder">Open OMGym</button></div>';
    var t = OM.orderSummary(o.lines, cfg);
    h += '<section class="kpis"><div class="kpi"><div class="v num">US$' + t.usd.toFixed(2) + '</div><div class="u">on Amazon, before tax</div></div><div class="kpi"><div class="v num">' + t.items + '</div><div class="u">items</div></div><div class="kpi"><div class="v num">' + (Math.round(t.lb * 10) / 10) + ' lb</div><div class="u">to ship</div></div></section>';
    h += '<p class="small muted">Buy these on Amazon and ship them to your forwarder. Check each price on Amazon before you pay; the customer was quoted <strong>' + jm(t.price) + '</strong>.</p>';
    h += '<section class="card">';
    o.lines.forEach(function (ln) {
      var pk = ln.pk, a = OM.amazonLink(pk.prod, pk.variant), done = !!ticks[pk.key];
      h += '<div class="orderrow' + (done ? ' ticked' : '') + '">' + pic(pk.prod.pic, 'pic sm') + '<div class="ordinfo"><div class="nm"><strong>' + ln.qty + ' × ' + esc(pk.prod.name) + '</strong></div><div class="small">' + esc(pk.prod.size.split(' · ')[0]) + (pk.variant ? ' · ' + esc(pk.prod.vlabel) + ': <strong>' + esc(pk.variant.label) + '</strong>' : '') + '</div><div class="small muted num">About US$' + pk.prod.usd.toFixed(2) + ' each · ' + pk.prod.lb + ' lb each</div><div class="ordact"><a class="btn small" href="' + esc(a.url) + '" target="_blank" rel="noopener">' + (a.exact ? 'Open on Amazon' : 'Find on Amazon') + '</a><label class="small tick"><input type="checkbox" data-act="ordtick" data-key="' + esc(pk.key) + '"' + (done ? ' checked' : '') + '> Ordered</label></div>' + (a.exact ? '' : '<div class="small muted">Search link: pick the listing that matches the size' + (pk.variant && pk.prod.vlabel === 'Flavour' ? ' and flavour' : '') + ' above.</div>') + '</div></div>';
    });
    h += '</section>';
    if (sv) {
      h += '<section class="card"><h3>Your numbers</h3><div class="tablewrap"><table class="small"><tbody>' +
        '<tr><td>Amazon, before tax</td><td class="r">US$' + t.usd.toFixed(2) + '</td></tr>' +
        '<tr><td>Amazon with 7% Florida tax (refundable with the airway bill)</td><td class="r">US$' + t.usdTax.toFixed(2) + '</td></tr>' +
        '<tr><td>Freight, ' + (Math.round(t.lb * 10) / 10) + ' lb at J$' + cfg.freightPerLb + '</td><td class="r">' + jm(t.freight) + '</td></tr>' +
        '<tr><td>Landed cost incl. duty, GCT and fees</td><td class="r">' + jm(t.cost) + '</td></tr>' +
        '<tr><td>Customer pays</td><td class="r"><strong>' + jm(t.price) + '</strong></td></tr>' +
        '<tr><td>Your profit</td><td class="r"><strong>' + jm(t.profit) + '</strong></td></tr></tbody></table></div><p class="small muted">Worked out with today\'s prices in the app (J$' + cfg.fx + ' per US$). If Amazon\'s price has moved, your profit moves with it.</p></section>';
    }
    h += '<div><button class="btn ghost" data-act="closeorder">Open OMGym</button></div>';
    return h;
  }

  function renderProgress() {
    var p = P(), T = targets();
    var ws = weights().slice().sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    var h = exampleBanner();
    h += '<section class="dayhead"><span class="label">Progress</span><h1>Weigh-ins</h1><p class="small muted">Weigh yourself first thing in the morning, after the bathroom, 2–4 times a week. Day-to-day jumps are mostly water; the line shows your 7-day average.</p></section>';
    h += '<section class="card"><div class="formgrid"><div class="formrow"><label class="f" for="w-date">Date</label><input id="w-date" type="date" value="' + TODAY + '" max="' + TODAY + '"></div><div class="formrow"><label class="f" for="w-kg">Weight (' + wUnit() + ')</label><input id="w-kg" type="number" inputmode="decimal" step="0.1" min="20" placeholder="' + wtv(p.weightKg) + '"></div><div class="formrow full"><label class="f" for="w-waist">Waist (' + (imperial() ? 'in' : 'cm') + ', optional)</label><input id="w-waist" type="number" inputmode="decimal" step="0.1"></div></div><div><button class="btn" data-act="logw">Save weigh-in</button></div></section>';
    h += '<section class="card chart"><div class="cardhead"><h3>Trend</h3><span class="small muted">' + ws.length + ' entries</span></div>' + chartSvg(ws, T) + '</section>';
    var tr = OM.trend(ws, TODAY);
    var cur = ws.length ? ws[ws.length - 1].kg : p.weightKg;
    var first = ws.length ? ws[0].kg : p.weightKg;
    h += '<section class="card"><div class="stats">';
    h += '<div class="stat"><span class="label">Start</span><span class="v num">' + wt(first) + '</span></div>';
    h += '<div class="stat"><span class="label">Latest</span><span class="v num">' + wt(cur) + '</span></div>';
    h += '<div class="stat"><span class="label">Change</span><span class="v num">' + (cur - first > 0 ? '+' : '') + wt(cur - first) + '</span></div>';
    h += '<div class="stat"><span class="label">To goal</span><span class="v num">' + wt(Math.abs(T.goalKg - cur)) + '</span></div>';
    h += '<div class="stat"><span class="label">Trend (3 wk)</span><span class="v num">' + (tr ? (tr.perWeek > 0 ? '+' : '') + wt(tr.perWeek, 2) + '/wk' : '—') + '</span></div>';
    h += '<div class="stat"><span class="label">Plan</span><span class="v num">' + (T.plannedWeeklyKg > 0 ? '+' : '') + wt(T.plannedWeeklyKg, 2) + '/wk</span></div>';
    h += '</div>';
    if (!tr) h += '<p class="small muted">The plan checks your trend once you have 4 or more weigh-ins spread over at least 10 days.</p>';
    h += '</section>';
    var sug = OM.suggestAdjust(T, tr, cur);
    var recentAdj = S.adjDate && OM.dayNum(TODAY) - OM.dayNum(S.adjDate) < (T.pro ? 7 : 14);
    if (sug && !recentAdj) h += '<section class="card hero"><h3>Adjust your calories?</h3><p>' + esc(sug.why) + '</p><div class="confirm"><button class="btn" data-act="applyadj" data-d="' + sug.delta + '">' + (sug.delta > 0 ? 'Add ' : 'Remove ') + Math.abs(sug.delta) + ' kcal a day</button><span class="small muted">Now ' + T.kcal + ' kcal</span></div></section>';
    else if (recentAdj) h += '<p class="small muted">Calories were adjusted on ' + esc(niceDate(S.adjDate, { day: 'numeric', month: 'short' })) + '. ' + (T.pro ? 'PRO checks in again a week after that.' : 'Give it two weeks before the next change.') + '</p>';
    // sessions
    var wk = 0, planned = (p.days || []).length, doneN = 0;
    for (var i = 0; i < 7; i++) { var d = OM.addDays(TODAY, -i); if (S.days[d] && S.days[d].done && OM.sessionFor(d, p, startDate())) doneN++; }
    h += '<section class="card"><div class="cardhead"><h3>Workouts, last 7 days</h3><span class="num" style="font-family:var(--display);font-weight:800;font-size:1.4rem">' + doneN + ' / ' + planned + '</span></div><p class="small muted">Sessions you marked finished on your training days.</p></section>';
    if (ws.length) {
      h += '<section class="card"><h3>Recent weigh-ins</h3><div class="loglist">';
      ws.slice(-8).reverse().forEach(function (w) { h += '<div class="logrow"><span>' + esc(niceDate(w.d, { weekday: 'short', day: 'numeric', month: 'short' })) + (w.waistCm ? ' <span class="small muted">· waist ' + len(w.waistCm) + '</span>' : '') + '</span><span class="num"><strong>' + wt(w.kg) + '</strong></span>' + (isExample() ? '<span></span>' : '<button class="linkbtn small" data-act="delw" data-d="' + w.d + '" aria-label="Delete entry">Delete</button>') + '</div>'; });
      h += '</div></section>';
    }
    return h;
  }

  function renderMe() {
    var p = P(), T = targets(), pt = prices();
    var h = exampleBanner() + flagsHtml(T);
    h += '<section class="dayhead"><span class="label">' + (p.name && !isExample() ? esc(p.name) + '\'s plan' : 'The plan') + '</span><h1>' + ({ lose: 'Lose', gain: 'Gain', maintain: 'Hold' }[T.goalType]) + ' to ' + wt(T.goalKg) + '</h1>';
    if (T.weeksToGoal) h += '<p class="muted">About ' + Math.round(T.weeksToGoal) + ' weeks at ' + wt(Math.abs(T.plannedWeeklyKg), 2) + ' a week, so around <strong>' + esc(niceDate(OM.addDays(TODAY, Math.round(T.weeksToGoal * 7)), { month: 'long', year: 'numeric' })) + '</strong> if the scale follows the plan.</p>';
    h += '<div><button class="btn ghost small" data-act="setup">Edit my details</button></div></section>';
    h += '<section class="card"><h3>Your body today</h3><div class="stats">';
    h += '<div class="stat"><span class="label">Weight</span><span class="v num">' + wt(p.weightKg) + '</span><span class="small muted">Height ' + len(p.heightCm) + '</span></div>';
    h += '<div class="stat"><span class="label">BMI</span><span class="v num">' + T.bmi.toFixed(1) + '</span><span class="small muted">' + esc(T.bmiCat) + '</span></div>';
    h += '<div class="stat"><span class="label">Waist ÷ height</span><span class="v num">' + (T.whtr ? T.whtr.toFixed(2) : '—') + '</span><span class="small muted">' + esc(T.whtrCat || 'Add your waist') + '</span></div>';
    h += '<div class="stat"><span class="label">Body fat (Navy)</span><span class="v num">' + (T.bf != null ? T.bf.toFixed(1) + '%' : '—') + '</span><span class="small muted">' + esc(T.bfCat || (p.sex === 'female' ? 'Needs neck, waist and hips' : 'Needs neck and waist')) + '</span></div>';
    h += '</div><p class="small muted">BMI ignores muscle, so waist-to-height (keep it under 0.5) and the tape-measure body-fat estimate give a fuller picture. The Navy method is usually within a few percent of a DEXA scan.</p></section>';
    h += '<section class="card"><h3>How your calories are worked out</h3><div class="tablewrap"><table><tbody>';
    h += '<tr><td>Resting burn (Mifflin-St Jeor)</td><td class="r">' + T.bmr + ' kcal</td></tr>';
    h += '<tr><td>Daily life (×' + T.neat + ')</td><td class="r">+' + Math.round(T.bmr * (T.neat - 1)) + ' kcal</td></tr>';
    h += '<tr><td>Training (' + T.sessKcal + ' kcal × ' + (p.days || []).length + ' sessions ÷ 7)</td><td class="r">+' + T.exDaily + ' kcal</td></tr>';
    h += '<tr><td><strong>Maintenance</strong></td><td class="r"><strong>' + T.tdee + ' kcal</strong></td></tr>';
    h += '<tr><td>' + (T.goalType === 'lose' ? 'Deficit' : T.goalType === 'gain' ? 'Surplus' : 'Change') + (S.kcalAdj ? ' (includes your ' + (S.kcalAdj > 0 ? '+' : '') + S.kcalAdj + ' kcal adjustment)' : '') + '</td><td class="r">' + (T.kcal - T.tdee > 0 ? '+' : '') + (T.kcal - T.tdee) + ' kcal</td></tr>';
    h += '<tr><td><strong>Daily target</strong></td><td class="r"><strong>' + T.kcal + ' kcal</strong></td></tr></tbody></table></div>';
    h += '<div class="stats"><div class="stat"><span class="label">Protein</span><span class="v num">' + T.protein + ' g</span><span class="small muted">' + T.ppk + ' g per kg' + (T.refW < p.weightKg - 0.5 ? ' of an adjusted ' + wt(T.refW, 0) : '') + '</span></div><div class="stat"><span class="label">Carbs · Fat</span><span class="v num">' + T.carbs + ' · ' + T.fat + ' g</span><span class="small muted">Fat about 27% of calories</span></div></div>';
    if (S.kcalAdj && !isExample()) h += '<div><button class="linkbtn" data-act="clearadj">Remove the ' + (S.kcalAdj > 0 ? '+' : '') + S.kcalAdj + ' kcal adjustment</button></div>';
    h += '<p class="small muted">Every formula is an estimate, often off by around 10% for a single person. Your weigh-ins over 2–3 weeks are the real test; the Progress tab suggests changes when the trend drifts from the plan.</p></section>';
    var dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    h += '<section class="card"><h3>Training setup</h3><p>' + (p.days || []).slice().sort().map(function (d) { return dn[d]; }).join(', ') + ' · ' + ({ weights: 'Weights', mix: 'Weights + cardio', cardio: 'Cardio circuits' }[p.style]) + ' · ' + ({ gym: 'Full gym', dumbbells: 'Dumbbells at home', bodyweight: 'Bodyweight only' }[p.equipment]) + ' · ' + esc(p.experience) + (p.injuries && p.injuries.length ? ' · protecting ' + esc(p.injuries.join(', ')) : '') + '</p><p class="small muted">Each 6-week cycle runs 2 weeks of building, 3 weeks of pushing, then a lighter deload week. Exercises change each cycle. Every session is 45 minutes: 6 warm-up, the main work, 5 cool-down.</p></section>';
    h += '<section class="card"><h3>Food setup</h3><p>' + esc(pt.meta.label) + ' prices (' + esc(pt.meta.symbol) + ') · ' + esc(budgetLabel(p)) + ' budget · ' + esc({ jm: 'Jamaican', us: 'American', mix: 'Jamaican and American' }[OM.cuisineOf(p)]) + ' dishes · ' + ({ none: 'Eats everything', pescatarian: 'Pescatarian', vegetarian: 'Vegetarian', vegan: 'Vegan' }[p.diet]) + (p.allergies && p.allergies.length ? ' · avoids ' + esc(p.allergies.join(', ')) : '') + (p.likes && p.likes.length ? ' · buys ' + esc(p.likes.map(function (id) { return LIKE_LABEL[id] || id; }).join(', ')) : '') + (p.foodCap > 0 ? ' · ' + money(p.foodCap, pt) + ' a week' : '') + '</p><div><button class="btn ghost small" data-act="setupfood">Change food settings</button></div></section>';
    h += '<section class="card"><h3>What\'s new</h3>' + OM.CHANGES.slice(0, 5).map(function (c) { return '<div><span class="label">' + esc(niceDate(c.d, { day: 'numeric', month: 'short' })) + '</span> <strong>' + esc(c.t) + '</strong><ul class="lines small">' + c.b.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'; }).join('') + '</section>';
    h += '<section class="card"><h3>Where the numbers come from</h3><ul class="sources">' +
      '<li><a href="https://pubmed.ncbi.nlm.nih.gov/15883556/" target="_blank" rel="noopener">Frankenfield et al., 2005</a>: Mifflin-St Jeor was the most reliable resting-calorie equation.</li>' +
      '<li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/" target="_blank" rel="noopener">ISSN protein position stand, 2017</a>: 1.4–2.0 g/kg for active people, more during a diet.</li>' +
      '<li><a href="https://www.sciencedaily.com/releases/2026/03/260319074552.htm" target="_blank" rel="noopener">ACSM resistance-training position stand, 2026</a>: train every major muscle 2+ days a week; consistency beats complexity.</li>' +
      '<li><a href="https://lida.sport-iat.de/ta/Record/4020931?lng=en" target="_blank" rel="noopener">Garthe et al., 2011</a>: losing about 0.7% of body weight a week kept more muscle than faster loss.</li>' +
      '<li><a href="https://primarycarenotebook.com/en-GB/pages/obesity/waist-to-height-ratio-whr" target="_blank" rel="noopener">NICE NG246</a>: waist-to-height ratio bands.</li>' +
      '<li><a href="https://southlake.ca/wp-content/uploads/2025/02/PARQPlus2025-Form-fillable.pdf" target="_blank" rel="noopener">PAR-Q+ 2025</a>: the seven health screening questions.</li>' +
      '<li><a href="https://loshusansupermarket.com/" target="_blank" rel="noopener">Loshusan Supermarket</a>, <a href="https://www.cac.gov.jm/portal/index.php" target="_blank" rel="noopener">Consumer Affairs Commission</a> survey (includes Hi-Lo), <a href="https://lastbitefood.com/food-prices/" target="_blank" rel="noopener">Jamaica food price tracker</a>, <a href="https://www.jamaicaobserver.com/2026/10/16/market-bag-farmers-hopeful-rains-will-cool-prices/" target="_blank" rel="noopener">Observer Market Bag</a> and <a href="https://basketreport.com/prices/" target="_blank" rel="noopener">BLS average prices</a> for food costs.</li></ul>' +
      '<p class="small muted">OMGym gives general fitness guidance, not medical advice.</p></section>';
    if (!isExample()) {
      h += '<section class="card"><h3>Your data</h3><p class="small muted">' + (store.kind === 'db' ? 'Saved privately to your Claude account, so it follows you to any device where you open this page.' : 'Saved in this browser.') + '</p>';
      h += dataCard();
      h += confirmReset ? '<div class="confirm"><span>Delete your profile, weigh-ins and logs?</span><button class="btn warn small" data-act="reset2">Delete everything</button><button class="linkbtn" data-act="reset0">Keep</button></div>' : '<div class="datarow"><button class="btn ghost small" data-act="datacopy"' + (S.profile ? '' : ' disabled') + '>Copy my data</button><button class="btn ghost small" data-act="datapaste">Paste my data</button><button class="btn ghost small" data-act="reset1">Start over</button></div>';
      h += '</section>';
    } else {
      h += '<section class="card" id="datanew"><h3>Already use OMGym?</h3>' + dataCard() + (dataMode ? '' : '<div class="datarow"><button class="btn ghost small" data-act="datapaste">Paste my data</button></div>') + '</section>';
    }
    return h;
  }

  function render() {
    var v = $('#view');
    if (ORDER) { v.innerHTML = renderOrder(); document.querySelectorAll('nav.tabs button').forEach(function (b) { b.removeAttribute('aria-current'); }); return; }
    var fn = { today: renderToday, food: renderFood, shop: renderShop, store: renderStore, progress: renderProgress, me: renderMe, pro: renderPro }[tab];
    v.innerHTML = fn();
    document.querySelectorAll('nav.tabs button').forEach(function (b) { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    var badge = document.getElementById('bagcount'), n = OM.STORE.paused ? 0 : cartCount(); if (badge) { badge.textContent = n; badge.hidden = !n; }
    updateNewsDot();
    var pb = document.getElementById('probtn'); if (pb) { pb.classList.toggle('on', proActive()); pb.setAttribute('aria-current', tab === 'pro' ? 'page' : 'false'); }
  }
  function go(t) { if (ORDER) closeOrder(); tab = t; render(); window.scrollTo(0, 0); }
  function closeOrder() { ORDER = null; try { history.replaceState(null, '', location.pathname); } catch (e) { } }

  /* ---------- setup sheet ---------- */
  var draft = null, step = 0, stepErr = '';
  var STEPS = ['About you', 'Measurements', 'Your goal', 'Health check', 'Food'];
  var PARQ = [
    'A doctor has said you have a heart condition or high blood pressure.',
    'You get chest pain at rest, during daily activities, or when you are active.',
    'You have lost your balance from dizziness, or passed out, in the last 12 months.',
    'You have been diagnosed with another long-term medical condition.',
    'You take prescribed medicine for a long-term condition.',
    'You have (or had in the last 12 months) a bone, joint or muscle problem that more activity could make worse.',
    'A doctor has said you should only exercise under medical supervision.'
  ];
  function openSetup() {
    draft = JSON.parse(JSON.stringify(S.profile || { units: 'metric', sex: '', days: [1, 3, 5], style: 'mix', equipment: 'gym', experience: 'beginner', activity: 'desk', pace: 'standard', injuries: [], parq: [false, false, false, false, false, false, false], pregnant: false, region: 'JM', diet: 'none', allergies: [], currencySymbol: '$', regionName: '' }));
    step = 0; stepErr = ''; renderSheet(); $('#sheet').hidden = false; document.body.style.overflow = 'hidden';
  }
  function closeSetup() { $('#sheet').hidden = true; document.body.style.overflow = ''; }
  function seg(name, opts, val) { return '<div class="seg" role="group">' + opts.map(function (o) { return '<button type="button" class="chip" data-act="seg" data-k="' + name + '" data-v="' + o[0] + '" aria-pressed="' + (String(val) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
  function multi(name, opts, arr) { return '<div class="seg" role="group">' + opts.map(function (o) { return '<button type="button" class="chip" data-act="multi" data-k="' + name + '" data-v="' + o[0] + '" aria-pressed="' + ((arr || []).indexOf(o[0]) >= 0) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
  function numIn(id, label, val, hint, step_) { return '<div class="formrow"><label class="f" for="' + id + '">' + label + '</label><input id="' + id + '" data-k="' + id + '" type="number" inputmode="decimal" step="' + (step_ || 'any') + '" value="' + (val == null || val === '' || isNaN(val) ? '' : val) + '">' + (hint ? '<span class="f-hint">' + hint + '</span>' : '') + '</div>'; }
  function cv(cm) { return cm == null ? '' : (draft.units === 'imperial' ? Math.round(cm / 2.54 * 10) / 10 : Math.round(cm * 10) / 10); }
  function kv(kg) { return kg == null ? '' : (draft.units === 'imperial' ? Math.round(kg * 2.20462 * 10) / 10 : Math.round(kg * 10) / 10); }
  function renderSheet() {
    var d = draft, imp = d.units === 'imperial', lu = imp ? 'in' : 'cm', wu = imp ? 'lb' : 'kg';
    var h = '<div class="wrap"><div class="cardhead"><div><span class="label">Step ' + (step + 1) + ' of 5</span><h2>' + STEPS[step] + '</h2></div><button class="btn ghost small" data-act="closesetup">Close</button></div><div class="steps">' + STEPS.map(function (_, i) { return '<i class="' + (i <= step ? 'on' : '') + '"></i>'; }).join('') + '</div>';
    if (step === 0) {
      h += '<div class="formrow"><label class="f" for="name">First name (optional)</label><input id="name" data-k="name" type="text" value="' + esc(d.name || '') + '" autocomplete="given-name"></div>';
      h += '<div class="formrow"><span class="f">Units</span>' + seg('units', [['metric', 'kg · cm'], ['imperial', 'lb · inches']], d.units) + '</div>';
      h += '<div class="formrow"><span class="f">Sex used in the calorie and body-fat formulas</span>' + seg('sex', [['female', 'Female'], ['male', 'Male']], d.sex) + '</div>';
      h += '<div class="formgrid">' + numIn('age', 'Age', d.age, '', '1');
      if (imp) { var ti = d.heightCm ? d.heightCm / 2.54 : null; h += '<div class="formrow"><span class="f">Height</span><div class="formgrid"><input id="hft" data-k="hft" type="number" inputmode="numeric" aria-label="Feet" placeholder="ft" value="' + (ti ? Math.floor(ti / 12) : '') + '"><input id="hin" data-k="hin" type="number" inputmode="decimal" aria-label="Inches" placeholder="in" value="' + (ti ? Math.round((ti % 12) * 10) / 10 : '') + '"></div></div>'; }
      else h += numIn('heightCm', 'Height (cm)', d.heightCm ? Math.round(d.heightCm) : '', '', '1');
      h += numIn('weightKg', 'Current weight (' + wu + ')', kv(d.weightKg), 'Morning weight, before breakfast', '0.1') + '</div>';
    } else if (step === 1) {
      h += '<p class="muted">A soft tape measure is all you need. Stand relaxed, breathe out normally, keep the tape level and snug without pressing in. These give your body-fat estimate and waist-to-height ratio.</p><div class="formgrid">';
      h += numIn('neckCm', 'Neck (' + lu + ')', cv(d.neckCm), 'Just below the Adam\'s apple');
      h += numIn('waistCm', 'Waist (' + lu + ')', cv(d.waistCm), d.sex === 'male' ? 'Level with your belly button' : 'At the narrowest point');
      if (d.sex !== 'male') h += numIn('hipCm', 'Hips (' + lu + ')', cv(d.hipCm), 'Around the widest part of your bottom');
      h += '</div><p class="small muted">You can skip this step and add measurements later, but the plan is more accurate with them.</p>';
    } else if (step === 2) {
      h += '<div class="formgrid">' + numIn('goalKg', 'Goal weight (' + wu + ')', kv(d.goalKg), '', '0.1') + '</div>';
      if (d.goalKg && d.weightKg && d.goalKg < d.weightKg - 1) h += '<div class="formrow"><span class="f">Pace</span>' + seg('pace', [['steady', 'Steady · 0.5%/wk'], ['standard', 'Standard · 0.75%/wk'], ['faster', 'Faster · 1%/wk']], d.pace) + '<span class="f-hint">Percent of body weight per week. Slower keeps more muscle and is easier to stick with.</span></div>';
      h += '<div class="formrow"><span class="f">Outside of workouts, your day is mostly…</span>' + seg('activity', [['desk', 'Sitting'], ['light', 'Some walking'], ['onfeet', 'On my feet'], ['manual', 'Heavy physical work']], d.activity) + '</div>';
      h += '<div class="formrow"><span class="f">Training experience</span>' + seg('experience', [['beginner', 'New or returning'], ['intermediate', '1–3 years'], ['advanced', '3+ years']], d.experience) + '</div>';
      h += '<div class="formrow"><span class="f">Training days</span>' + multi('days', [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']], d.days) + '<span class="f-hint">2–4 days suits most people. Every session is 45 minutes.</span></div>';
      h += '<div class="formrow"><span class="f">Session style</span>' + seg('style', [['weights', 'Mostly weights'], ['mix', 'Weights + cardio'], ['cardio', 'Cardio circuits']], d.style) + '</div>';
      h += '<div class="formrow"><span class="f">Equipment</span>' + seg('equipment', [['gym', 'Full gym'], ['dumbbells', 'Dumbbells at home'], ['bodyweight', 'Bodyweight only']], d.equipment) + '</div>';
    } else if (step === 3) {
      h += '<p class="muted">From the PAR-Q+ screening questionnaire. A "yes" doesn\'t stop you training; it means check with your doctor first, and the plan keeps intensity moderate.</p><div>';
      PARQ.forEach(function (q, i) { h += '<div class="yn"><span>' + esc(q) + '</span>' + seg('parq' + i, [['no', 'No'], ['yes', 'Yes']], d.parq[i] ? 'yes' : 'no') + '</div>'; });
      if (d.sex === 'female') h += '<div class="yn"><span>Pregnant or breastfeeding</span>' + seg('pregnant', [['no', 'No'], ['yes', 'Yes']], d.pregnant ? 'yes' : 'no') + '</div>';
      h += '</div><div class="formrow"><span class="f">Any of these that hurt or have been injured?</span>' + multi('injuries', [['knees', 'Knees'], ['back', 'Lower back'], ['shoulders', 'Shoulders']], d.injuries) + '<span class="f-hint">Exercises that load these areas are swapped for kinder versions.</span></div>';
    } else if (step === 4) {
      h += '<div class="formrow"><span class="f">Where do you shop?</span>' + seg('region', [['JM', 'Jamaica (J$)'], ['US', 'United States ($)'], ['OTHER', 'Somewhere else']], d.region) + '</div>';
      if (d.region === 'OTHER') h += '<div class="formgrid"><div class="formrow"><label class="f" for="regionName">Country or city</label><input id="regionName" data-k="regionName" type="text" value="' + esc(d.regionName || '') + '"></div><div class="formrow"><label class="f" for="currencySymbol">Currency symbol</label><input id="currencySymbol" data-k="currencySymbol" type="text" maxlength="4" value="' + esc(d.currencySymbol || '$') + '"></div></div><p class="small muted">You will enter local prices on the Shop tab. Until then, US prices stand in.</p>';
      h += '<div class="formrow"><span class="f">Dishes</span>' + seg('cuisine', [['auto', 'Follow my region'], ['jm', 'Jamaican'], ['us', 'American'], ['mix', 'Both']], d.cuisine || 'auto') + '<span class="f-hint">Jamaican dishes in Jamaica and American dishes in the US, unless you pick.</span></div>';
      var est = null;
      try { if (d.weightKg && d.heightCm && d.age && d.sex && d.goalKg) { var dt = OM.calcTargets(d, S.profile ? S.kcalAdj : 0, proPlan()); est = OM.weekCostByTier(TODAY, d, dt, OM.priceTable(d, S.prices[d.region] || {}), {}); } } catch (e) { est = null; }
      var dpt = OM.priceTable(d, S.prices[d.region] || {});
      h += '<div class="formrow"><span class="f">Food budget</span>' + seg('budget', [1, 2, 3].map(function (t) { return [t, OM.BUDGETS[t].label + (est ? ' · ' + money(Math.round(est[t]), dpt) : '')]; }), OM.budgetTier(d)) + '<span class="f-hint">' + esc(OM.BUDGETS[OM.budgetTier(d)].note) + (est ? ' Amounts are about a week of food at your calorie target.' : '') + '</span></div>';
      h += '<div class="formrow"><span class="f">Foods I buy (optional)</span>' + multi('likes', OM.LIKEABLE.map(function (id) { return [id, LIKE_LABEL[id] || id]; }), d.likes) + '<span class="f-hint">The plan builds meals around these whatever your budget, about two days in three. Diet and allergy settings still come first.</span></div>';
      h += '<div class="formgrid">' + numIn('foodCap', 'Weekly food budget (' + esc(dpt.meta.symbol) + ', optional)', d.foodCap || '', 'We flag weeks that go over', '1') + '</div>';
      h += '<div class="formrow"><span class="f">How do you eat?</span>' + seg('diet', [['none', 'Everything'], ['pescatarian', 'Fish, no meat'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan']], d.diet) + '</div>';
      h += '<div class="formrow"><span class="f">Allergies or foods to avoid</span>' + multi('allergies', [['egg', 'Eggs'], ['fish', 'Fish'], ['shellfish', 'Shellfish'], ['peanut', 'Peanuts'], ['dairy', 'Dairy'], ['gluten', 'Gluten'], ['soy', 'Soy']], d.allergies) + '</div>';
    }
    if (stepErr) h += '<p class="err" role="alert">' + esc(stepErr) + '</p>';
    h += '<div class="sheetfoot"><button class="btn ghost" data-act="back"' + (step === 0 ? ' disabled' : '') + '>Back</button><button class="btn" data-act="next">' + (step === 4 ? 'Build my plan' : 'Next') + '</button></div></div>';
    $('#sheet').innerHTML = h;
  }
  function readSheet() {
    var imp = draft.units === 'imperial';
    var num = function (id) { var el = document.getElementById(id); if (!el) return undefined; var v = parseFloat(el.value); return isNaN(v) ? null : v; };
    var txt = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : undefined; };
    if (step === 0) {
      draft.name = txt('name'); var a = num('age'); if (a !== undefined) draft.age = a;
      if (imp) { var ft = num('hft'), inch = num('hin'); if (ft != null) draft.heightCm = (ft * 12 + (inch || 0)) * 2.54; }
      else { var hc = num('heightCm'); if (hc !== undefined) draft.heightCm = hc; }
      var w = num('weightKg'); if (w !== undefined) draft.weightKg = w == null ? null : (imp ? w / 2.20462 : w);
    } else if (step === 1) {
      ['neckCm', 'waistCm', 'hipCm'].forEach(function (k) { var v = num(k); if (v !== undefined) draft[k] = v == null ? null : (imp ? v * 2.54 : v); });
    } else if (step === 2) {
      var g = num('goalKg'); if (g !== undefined) draft.goalKg = g == null ? null : (imp ? g / 2.20462 : g);
    } else if (step === 4) {
      var rn = txt('regionName'); if (rn !== undefined) draft.regionName = rn;
      var cs = txt('currencySymbol'); if (cs !== undefined) draft.currencySymbol = cs || '$';
      var fc = num('foodCap'); if (fc !== undefined) draft.foodCap = fc && fc > 0 ? fc : null;
    }
  }
  function validate() {
    var d = draft;
    if (step === 0) {
      if (!d.sex) return 'Choose the sex used in the formulas.';
      if (!d.age || d.age < 13 || d.age > 100) return 'Enter an age between 13 and 100.';
      if (!d.heightCm || d.heightCm < 120 || d.heightCm > 230) return 'Enter a height between 120 and 230 cm (3 ft 11 in to 7 ft 6 in).';
      if (!d.weightKg || d.weightKg < 35 || d.weightKg > 300) return 'Enter a weight between 35 and 300 kg (77 to 660 lb).';
    }
    if (step === 1) {
      if (d.neckCm && d.waistCm && d.waistCm <= d.neckCm) return 'Waist should be bigger than neck. Check the numbers.';
      if (d.waistCm && (d.waistCm < 45 || d.waistCm > 200)) return 'That waist measurement looks off. Check the units.';
    }
    if (step === 2) {
      if (!d.goalKg || d.goalKg < 35 || d.goalKg > 300) return 'Enter a goal weight.';
      if (!d.days || !d.days.length) return 'Pick at least one training day.';
    }
    return '';
  }
  function finishSetup() {
    var d = draft;
    d.days = d.days.map(Number).sort();
    d.weightKg = Math.round(d.weightKg * 10) / 10; d.goalKg = Math.round(d.goalKg * 10) / 10;
    var first = !S.profile;
    var oldW = S.profile && S.profile.weightKg;
    S.profile = d;
    if (first) { S.startDate = TODAY; S.weights = [{ d: TODAY, kg: d.weightKg, waistCm: d.waistCm || undefined }]; }
    else if (oldW !== d.weightKg) { addWeight(TODAY, d.weightKg, null); }
    closeSetup(); save(); go('today'); toast(first ? 'Your plan is ready' : 'Plan updated');
  }
  function addWeight(d, kg, waist) {
    S.weights = S.weights.filter(function (w) { return w.d !== d; });
    var e = { d: d, kg: Math.round(kg * 10) / 10 }; if (waist) e.waistCm = Math.round(waist * 10) / 10;
    S.weights.push(e); S.weights.sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    var latest = S.weights[S.weights.length - 1];
    S.profile.weightKg = latest.kg;
    if (latest.waistCm) S.profile.waistCm = latest.waistCm;
  }

  /* ---------- rest timer ---------- */
  var restEnd = 0, restTick = null;
  function startRest(sec) {
    restEnd = Date.now() + sec * 1000; clearInterval(restTick);
    $('#rest').hidden = false; updateRest(); restTick = setInterval(updateRest, 250);
  }
  function stopRest() { clearInterval(restTick); restTick = null; $('#rest').hidden = true; $('#rest').classList.remove('go'); }
  function updateRest() {
    var left = Math.ceil((restEnd - Date.now()) / 1000), el = $('#rest-t');
    if (left <= 0) {
      el.textContent = 'Go: next set'; $('#rest').classList.add('go'); clearInterval(restTick);
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { }
      var end = restEnd; setTimeout(function () { if (restEnd === end) stopRest(); }, 4000);
      return;
    }
    $('#rest').classList.remove('go');
    el.textContent = 'Rest ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act],[data-tab]'); if (!t) return;
    var a = t.dataset.act;
    if (!a && t.dataset.tab) { go(t.dataset.tab); return; }
    switch (a) {
      case 'tab': go(t.dataset.tab); break;
      case 'setup': openSetup(); break;
      case 'setupfood': if (needSetup()) break; openSetup(); step = 4; renderSheet(); break;
      case 'quick':
        var qp = S.profile || EXAMPLE, qk = t.dataset.k;
        if (qk === 'budget') qp.budget = +t.dataset.v; else if (qk === 'region') qp.region = t.dataset.v;
        editPrice = null; if (S.profile) save(); render();
        toast(qk === 'budget' ? OM.BUDGETS[OM.budgetTier(qp)].label + ' budget: meals and list updated' : 'Prices for ' + prices().meta.label + (OM.cuisineOf(qp) === 'us' ? ', American dishes' : OM.cuisineOf(qp) === 'jm' ? ', Jamaican dishes' : ''));
        break;
      case 'closesetup': closeSetup(); break;
      case 'news': openNews(); break;
      case 'closenews': closeNews(); break;
      case 'seg': readSheet();
        var k = t.dataset.k, v = t.dataset.v;
        if (k.indexOf('parq') === 0) draft.parq[+k.slice(4)] = v === 'yes';
        else if (k === 'pregnant') draft.pregnant = v === 'yes';
        else if (k === 'budget') draft.budget = +v;
        else draft[k] = v;
        renderSheet(); break;
      case 'multi': readSheet();
        var mk = t.dataset.k, mv = mk === 'days' ? Number(t.dataset.v) : t.dataset.v;
        var arr = draft[mk] = (draft[mk] || []).slice(); var ix = arr.indexOf(mv);
        if (ix >= 0) arr.splice(ix, 1); else arr.push(mv);
        renderSheet(); break;
      case 'next': readSheet(); stepErr = validate(); if (stepErr) { renderSheet(); break; } if (step === 4) finishSetup(); else { step++; renderSheet(); $('#sheet').scrollTop = 0; } break;
      case 'back': readSheet(); stepErr = ''; step = Math.max(0, step - 1); renderSheet(); break;
      case 'set': if (needSetup()) break;
        if (!canLog(workDay())) { toast('You can log this on the day'); break; }
        var dd = day(workDay()), n = +t.dataset.n, ex = t.dataset.ex;
        var ticking = (dd.sets[ex] || 0) < n;
        dd.sets[ex] = ticking ? n : n - 1; save(); render();
        if (ticking && workDay() === TODAY) startRest(+t.dataset.rest || 60); break;
      case 'skiprest': stopRest(); break;
      case 'cartadd': if (OM.STORE.paused) { toast('The Store is paused for now.'); break; } S.cart = S.cart || {}; var ak = t.dataset.key || OM.cartKey(t.dataset.id); S.cart[ak] = Math.min(50, (S.cart[ak] || 0) + 1); orderCopied = false; save(); render(); if (tab !== 'store') toast('Added to your bag. Open Store to order.'); break;
      case 'cartdec': var dk = t.dataset.key || t.dataset.id; S.cart[dk] = Math.max(0, (S.cart[dk] || 0) - 1); if (!S.cart[dk]) delete S.cart[dk]; orderCopied = false; save(); render(); break;
      case 'pronew': startProInvoice(); break;
      case 'promethod': var oi = PD.invoices.filter(function (i) { return !unlockFor(i.no) && i.status !== 'void'; }).slice(-1)[0]; if (oi) { oi.method = t.dataset.m; proSave(); render(); } break;
      case 'proproof':
        var pi = PD.invoices.filter(function (i) { return i.no === t.dataset.no; })[0];
        if (pi) { pi.status = 'sent'; if (!proStatusNow().active && OM.graceAllowed(TODAY, PD.graceLog)) { PD.grace = { start: TODAY, no: pi.no }; PD.graceLog.push(TODAY); } proSave(); setTimeout(render, 300); }
        break;
      case 'provoid': PD.invoices = PD.invoices.filter(function (i) { return i.no !== t.dataset.no; }); proSave(); render(); break;
      case 'showinv': proView = proView === t.dataset.no ? null : t.dataset.no; render(); var iv = document.getElementById('invoice'); if (iv && proView && iv.scrollIntoView) iv.scrollIntoView({ block: 'start' }); break;
      case 'printinv': try { window.print(); } catch (e) { } break;
      case 'copylynk': try { navigator.clipboard.writeText(OM.PRO.lynk).then(function () { toast('Lynk username copied'); }, function () { toast('Press and hold to copy'); }); } catch (e) { toast('Press and hold to copy'); } break;
      case 'copybank':
        var B = OM.PRO.bank, btxt = 'Name: ' + B.holder + '\nBank: ' + B.bank + '\nAccount type: ' + B.type + '\nAccount number: ' + B.number + '\nCurrency: ' + B.currency + '\nReference: ' + t.dataset.no + '\nAmount: J$' + money2(OM.proJmd(OM.PRO.priceUsd, OM.PRO.boj.rate));
        try { navigator.clipboard.writeText(btxt).then(function () { toast('Bank details copied'); }, function () { toast('Press and hold the details to copy'); }); } catch (e) { toast('Press and hold the details to copy'); }
        break;
      case 'propaste':
        var raw = (document.getElementById('pro-paste') || {}).value || '', qi = raw.indexOf('?');
        acceptLink(qi >= 0 ? raw.slice(qi) : raw).then(function (r) { proLinkError = r.ok ? '' : r.msg; proNotice = r.ok ? r : null; if (r.ok) proView = r.f.inv; render(); if (r.ok) toast('PRO unlocked'); });
        break;
      case 'copyprolink': try { navigator.clipboard.writeText(location.href.split('#')[0]).then(function () { toast('Link copied'); }, function () { toast('Copy the link from the address bar'); }); } catch (e) { toast('Copy the link from the address bar'); } break;
      case 'prophase': PD.plan = { phase: t.dataset.ph, rate: OM.PRO_PHASES[t.dataset.ph].def }; proSave(); render(); toast('PRO ' + OM.PRO_PHASES[t.dataset.ph].label + ' is on'); break;
      case 'prorate': PD.plan.rate = Number(t.dataset.r); proSave(); render(); break;
      case 'emptybag': S.cart = {}; orderCopied = false; save(); render(); break;
      case 'gostore': storeCat = 'all'; go('store'); var el = document.getElementById('var-' + t.dataset.id); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } break;
      case 'closeorder': closeOrder(); go('store'); break;
      case 'storecat': storeCat = t.dataset.c; render(); break;
      case 'sellerview': setSeller(!sellerOn()); save(); render(); break;
      case 'nudgehide': S.nudgeHide = S.nudgeHide || {}; S.nudgeHide[t.dataset.key] = true; save(); render(); break;
      case 'copyorder':
        var ta = document.getElementById('order-text');
        var done = function () { orderCopied = true; toast('Order copied'); var b = t; b.textContent = 'Copied'; };
        try { navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); toast('Press and hold to copy'); }); } catch (e) { ta.select(); toast('Press and hold to copy'); }
        break;
      case 'done': if (needSetup()) break; if (!canLog(workDay())) { toast('You can log this on the day'); break; } day(workDay()).done = true; trim(); save(); render(); toast(workDay() === TODAY ? 'Workout logged. Nice work.' : 'Logged for ' + niceDate(workDay(), { weekday: 'long', day: 'numeric', month: 'short' })); break;
      case 'undone': day(workDay()).done = false; save(); render(); break;
      case 'habit': if (needSetup()) break; if (!canLog(workDay())) { toast('You can log this on the day'); break; } var hd = day(workDay()); hd.habits[t.dataset.h] = !hd.habits[t.dataset.h]; save(); render(); break;
      case 'wday': var wd0 = t.dataset.d; if (wd0 < TODAY && !canLog(wd0)) break; workDate = wd0; render(); break;
      case 'wweek': var wn = OM.addDays(workDate, +t.dataset.n); if (wn > TODAY) wn = TODAY; if (wn < TODAY && !canLog(wn)) wn = OM.addDays(TODAY, -LOG_BACK); workDate = wn; render(); break;
      case 'fd': foodDate = OM.addDays(foodDate, +t.dataset.n); render(); break;
      case 'swap': if (needSetup()) break; var sw = S.swaps[foodDate] = S.swaps[foodDate] || {}; sw[t.dataset.slot] = (sw[t.dataset.slot] || 0) + 1; save(); render(); break;
      case 'tick': if (needSetup()) { t.checked = false; break; } var tk = S.shopTicks[shopStart()] = S.shopTicks[shopStart()] || {}; tk[t.dataset.id] = t.checked; save(); render(); break;
      case 'editprice': if (needSetup()) break; editPrice = t.dataset.id; render(); var inp = document.getElementById('price-' + editPrice); if (inp) inp.focus(); break;
      case 'cancelprice': editPrice = null; render(); break;
      case 'saveprice':
        var pid = t.dataset.id, pv = parseFloat(document.getElementById('price-' + pid).value);
        if (!(pv >= 0)) { toast('Enter a price of 0 or more'); break; }
        var reg = P().region; S.prices[reg] = S.prices[reg] || {}; var stEl = document.getElementById('store-' + pid); S.prices[reg][pid] = { pr: pv, store: stEl ? stEl.value : '', date: niceDate(TODAY, { day: 'numeric', month: 'short', year: 'numeric' }) };
        editPrice = null; save(); render(); toast('Price saved'); break;
      case 'resetprice': var rg = P().region; if (S.prices[rg]) delete S.prices[rg][t.dataset.id]; editPrice = null; save(); render(); break;
      case 'logw': if (needSetup()) break;
        var dv = $('#w-date').value || TODAY, kgv = parseFloat($('#w-kg').value), wv = parseFloat($('#w-waist').value);
        if (!(kgv > 0)) { toast('Enter your weight'); break; }
        var kg = imperial() ? kgv / 2.20462 : kgv; var wc = wv > 0 ? (imperial() ? wv * 2.54 : wv) : null;
        if (kg < 30 || kg > 320) { toast('That weight looks off. Check the units.'); break; }
        addWeight(dv > TODAY ? TODAY : dv, kg, wc); save(); render(); toast('Weigh-in saved'); break;
      case 'delw': S.weights = S.weights.filter(function (w) { return w.d !== t.dataset.d; }); if (S.weights.length) S.profile.weightKg = S.weights[S.weights.length - 1].kg; save(); render(); break;
      case 'applyadj': if (needSetup()) break; S.kcalAdj = Math.max(-600, Math.min(600, (S.kcalAdj || 0) + Number(t.dataset.d))); S.adjDate = TODAY; save(); render(); toast('Calories updated'); break;
      case 'clearadj': S.kcalAdj = 0; S.adjDate = null; save(); render(); break;
      case 'datacopy':
        if (!S.profile) break; dataMode = 'copy'; dataCheck = null; render();
        try { navigator.clipboard.writeText(OM.exportCode(S)).then(function () { toast('Data copied. Paste it in the other version.'); }, function () { var ta = $('#datacode'); if (ta) ta.select(); toast('Press and hold the code to copy'); }); } catch (e) { toast('Press and hold the code to copy'); }
        break;
      case 'datapaste': dataMode = 'paste'; dataCheck = null; render(); var din = $('#datain'); if (din) din.focus(); break;
      case 'datacheck': var dv0 = ($('#datain') || {}).value; dataCheck = OM.parseDataCode(dv0); render(); if (!dataCheck.ok) { var d2 = $('#datain'); if (d2) d2.value = dv0 || ''; } break;
      case 'dataclose': dataMode = null; dataCheck = null; render(); break;
      case 'dataapply':
        if (!dataCheck || !dataCheck.ok) break;
        dataUndo = S.profile ? JSON.parse(JSON.stringify(S)) : freshState();
        try { localStorage.setItem(UNDOKEY, JSON.stringify(dataUndo)); } catch (e) { }
        adopt(dataCheck.data); dataMode = null; dataCheck = null; save(); render(); toast('Your data is here');
        break;
      case 'dataundo':
        if (!dataUndo) break;
        if (dataUndo.profile) { adopt(dataUndo); save(); } else { S = freshState(); try { localStorage.removeItem(LSKEY); } catch (e) { } if (store.kind === 'db') store.ref.delete().catch(function () { }); }
        dataUndo = null; try { localStorage.removeItem(UNDOKEY); } catch (e) { } render(); toast('Back to how it was');
        break;
      case 'reset1': confirmReset = true; render(); break;
      case 'reset0': confirmReset = false; render(); break;
      case 'reset2':
        confirmReset = false; S = freshState();
        try { localStorage.removeItem(LSKEY); } catch (e) { }
        if (store.kind === 'db') store.ref.delete().catch(function () { });
        go('today'); toast('Everything deleted'); break;
    }
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id === 'order-name') {
      S.orderName = t.value; save();
      var ord = OM.orderText(S.cart || {}, OM.STORE, S.orderName, TODAY), a = document.getElementById('wa-link'), ta = document.getElementById('order-text');
      if (a) a.href = 'https://wa.me/' + OM.STORE.whatsapp + '?text=' + encodeURIComponent(ord.text);
      if (ta) ta.value = ord.text;
    }
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.dataset && t.dataset.act === 'pickvar') { pickVar[t.dataset.id] = t.value; render(); var el = document.getElementById('var-' + t.dataset.id); if (el) el.focus(); return; }
    if (t.dataset && t.dataset.act === 'ordtick' && ORDER) { var all = orderTicks(), mine = all[ORDER.id] = all[ORDER.id] || {}; mine[t.dataset.key] = t.checked; try { localStorage.setItem('omgym-orders', JSON.stringify(all)); } catch (e) { } render(); return; }
    if (t.dataset && t.dataset.act === 'load') {
      if (needSetup()) { t.value = ''; return; }
      var LD = workDay(); if (!canLog(LD)) { t.value = ''; toast('You can log this on the day'); return; }
      var dd = day(LD); dd.loads = dd.loads || {};
      var v = t.value.trim();
      dd.loads[t.dataset.ex] = v;
      if (v) {
        var cur = S.loads[t.dataset.ex], val = v + (/[a-z]/i.test(v) ? '' : ' ' + wUnit());
        var curD = cur && typeof cur === 'object' ? cur.d : null;
        // a weight logged for an earlier day never replaces a newer "Last" weight
        if (!curD || LD >= curD) {
          var prev = cur && typeof cur === 'object' ? (curD === LD ? cur.prev : { v: cur.v, d: cur.d }) : null;
          S.loads[t.dataset.ex] = { v: val, d: LD, prev: prev || null };
        }
      }
      save();
    }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { refreshToday(); if (restTick) updateRest(); } });
  window.addEventListener('focus', refreshToday);
  setInterval(refreshToday, 60000);
  if ('serviceWorker' in navigator && /github\.io$/.test(location.hostname)) { try { navigator.serviceWorker.register('sw.js').catch(function () { }); } catch (e) { } }
  document.addEventListener('keydown', function (ev) { if (ev.key !== 'Escape') return; if (!$('#news').hidden) closeNews(); else if (!$('#sheet').hidden) closeSetup(); });

  var h0 = (location.hash || '').slice(1);
  if (VALID_TABS.indexOf(h0) >= 0) tab = h0;
  initStore();
  var proFromUrl = OM.parseProLink(location.search);
  verifyStored().then(function () {
    if (!proFromUrl) { render(); return; }
    return acceptLink(location.search).then(function (r) {
      proNotice = r; tab = 'pro'; if (r.ok) proView = r.f.inv;
      if (!r.other) { try { history.replaceState(null, '', location.pathname); } catch (e) { } }
      render();
    });
  });
})();
