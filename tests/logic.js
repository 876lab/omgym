const OM = require(process.argv[2]);
let pass = 0, fail = 0; const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ` (got ${a}, want ${b}±${tol})`); }

// 1. Mifflin-St Jeor
const base = { sex: 'male', age: 30, heightCm: 180, weightKg: 80, goalKg: 72, activity: 'desk', style: 'weights', days: [1, 3, 5], experience: 'beginner', equipment: 'gym', pace: 'standard', injuries: [], parq: [], diet: 'none', allergies: [], region: 'JM' };
let T = OM.calcTargets(base);
near(T.bmr, 1780, 0, 'Mifflin male 80kg/180cm/30y');
T = OM.calcTargets({ ...base, sex: 'female' });
near(T.bmr, 1614, 0, 'Mifflin female 80kg/180cm/30y');

// 2. Navy body fat vs published worked examples
const in2cm = x => x * 2.54;
near(OM.navyBodyFat({ sex: 'male', heightCm: in2cm(72), neckCm: in2cm(16), waistCm: in2cm(36) }), 19, 1, 'Navy male LiveStrong example ~19%');
near(OM.navyBodyFat({ sex: 'male', heightCm: 182.88, neckCm: 38.6, waistCm: 102.1 }), 26.8, 0.6, 'Navy male Omni example 26.8%');
near(OM.navyBodyFat({ sex: 'female', heightCm: in2cm(64), neckCm: in2cm(12), waistCm: in2cm(28), hipCm: in2cm(42) }), 34, 2, 'Navy female LiveStrong example ~34%');

// 3. Calorie logic & guardrails
T = OM.calcTargets(base);
ok(T.goalType === 'lose', 'goal type lose');
ok(T.kcal < T.tdee && T.kcal >= 1500, 'loss calories below TDEE and above male floor');
near(T.plannedWeeklyKg, -Math.min(80*0.0075, T.tdee*0.25*7/7700), 0.02, 'standard pace 0.75%/wk, capped at 25% of TDEE');
ok(T.protein >= 150 && T.protein <= 170, 'protein 2.0 g/kg for loss: ' + T.protein);
near(T.protein * 4 + T.fat * 9 + T.carbs * 4, T.kcal, 8, 'macros add up to calories');
const small = OM.calcTargets({ ...base, sex: 'female', age: 45, heightCm: 152, weightKg: 58, goalKg: 50, pace: 'faster', days: [] });
ok(small.kcal >= 1200, 'female floor: kcal >= 1200 (' + small.kcal + ')');
ok(small.floorApplied, 'floor flag shown');
const minor = OM.calcTargets({ ...base, age: 16 });
ok(minor.goalType === 'maintain' && Math.abs(minor.kcal - minor.tdee) < 10, 'under-18 held at maintenance');
const preg = OM.calcTargets({ ...base, sex: 'female', pregnant: true });
ok(preg.goalType === 'maintain', 'pregnancy held at maintenance');
const lowGoal = OM.calcTargets({ ...base, goalKg: 50 });
near(lowGoal.goalKg, 18.5 * 1.8 * 1.8, 0.01, 'goal capped at BMI 18.5');
ok(lowGoal.flags.some(f => /healthy BMI/.test(f.text)), 'low goal warning');
const gain = OM.calcTargets({ ...base, goalKg: 88 });
ok(gain.goalType === 'gain' && gain.kcal > gain.tdee && gain.kcal - gain.tdee <= 460, 'gain surplus 150-450');
const big = OM.calcTargets({ ...base, weightKg: 140, goalKg: 95, pace: 'faster' });
ok(big.tdee - big.kcal <= 1000.5 && big.tdee - big.kcal <= big.tdee * 0.25 + 5, 'deficit capped at 1000 & 25% TDEE');
ok(big.protein < 200, 'protein uses adjusted weight when BMI>=30: ' + big.protein);
ok(OM.calcTargets({ ...base, parq: [false, true] }).caution === true, 'PAR-Q yes -> caution');
ok(OM.calcTargets(base, -150).kcal === OM.calcTargets(base).kcal - 150, 'kcal adjustment applied');

// 4. Workouts: every combination
const eqs = ['gym', 'dumbbells', 'bodyweight'], styles = ['weights', 'mix', 'cardio'], exps = ['beginner', 'intermediate', 'advanced'];
const injSets = [[], ['knees'], ['back'], ['shoulders'], ['knees', 'back', 'shoulders']];
const LET = { knees: 'k', back: 'b', shoulders: 's' };
let wcount = 0, minM = 99, maxM = 0;
const dayPatterns = { 1: [3], 2: [2, 5], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
for (const n of Object.keys(dayPatterns)) for (const eq of eqs) for (const st of styles) for (const xp of exps) for (const inj of injSets) {
  const p = { ...base, days: dayPatterns[n], equipment: eq, style: st, experience: xp, injuries: inj };
  for (let i = 0; i < 14 * 3; i += 1) {
    const d = OM.addDays('2026-10-19', i * 3); // spread over ~18 weeks, all phases
    const w = OM.buildWorkout(d, p, '2026-10-19', false);
    wcount++;
    if (w.rest) { ok(w.minutes === 45, 'rest day 45'); continue; }
    minM = Math.min(minM, w.minutes); maxM = Math.max(maxM, w.minutes);
    ok(w.minutes >= 38 && w.minutes <= 47, `duration ${w.minutes} for ${n}d ${eq} ${st} ${xp} ${inj} ${w.key}`);
    const items = w.blocks.flatMap(b => b.items || []);
    ok(items.length >= 2, `has exercises ${n}d ${eq} ${st} ${w.key}`);
    const ids = items.map(it => it.ex.id);
    ok(new Set(ids).size === ids.length, 'no duplicate exercise in a session');
    for (const it of items) {
      ok(it.ex.eq.includes({ gym: 'g', dumbbells: 'd', bodyweight: 'b' }[eq]), `equipment respected ${it.ex.id} for ${eq}`);
      for (const j of inj) ok(!it.ex.avoid.includes(LET[j]), `injury respected ${it.ex.id} for ${j}`);
      ok(it.sets >= 1 && it.sets <= 5, 'sets in range');
    }
  }
}
const caut = OM.buildWorkout('2026-10-19', { ...base, style: 'mix' }, '2026-10-19', true);
ok(caut.blocks.some(b => b.cond && /conversation/.test(b.lines[0])), 'caution swaps intervals for steady cardio');
// progression phases
ok(OM.buildWorkout('2026-10-19', base, '2026-10-19').phase.name === 'Build', 'week1 build');
ok(OM.buildWorkout(OM.addDays('2026-10-19', 21), base, '2026-10-19').phase.name === 'Push', 'week4 push');
ok(OM.buildWorkout(OM.addDays('2026-10-19', 35), base, '2026-10-19').phase.deload, 'week6 deload');
// exercises rotate after a 6-week cycle
const a1 = OM.buildWorkout('2026-10-19', base, '2026-10-19').blocks[1].items.map(i => i.ex.id).join();
const a2 = OM.buildWorkout(OM.addDays('2026-10-19', 42), base, '2026-10-19').blocks[1].items.map(i => i.ex.id).join();
ok(a1 !== a2, 'exercise selection rotates each 6-week cycle');

// 5. Meals: diets x allergies x regions
const diets = ['none', 'pescatarian', 'vegetarian', 'vegan'];
const allergySets = [[], ['egg'], ['fish'], ['shellfish'], ['peanut'], ['dairy'], ['gluten'], ['egg', 'gluten'], ['fish', 'shellfish']];
let kErrMain = [], kErrVegan = []; let mealDays = 0, kErr = [], pRatio = [], costs = { JM: [], US: [] };
for (const region of ['JM', 'US', 'OTHER']) for (const diet of diets) for (const al of allergySets) {
  for (const prof of [base, { ...base, sex: 'female', weightKg: 65, heightCm: 160, goalKg: 60 }, { ...base, weightKg: 110, goalKg: 90 }, { ...base, goalKg: 88 }]) {
    const p = { ...prof, region, diet, allergies: al };
    const T2 = OM.calcTargets(p);
    const pt = OM.priceTable(p, {});
    for (let i = 0; i < 7; i++) {
      const plan = OM.planDay(OM.addDays('2026-10-22', i), p, T2, pt, {});
      mealDays++;
      const ex = OM.excludedTags(p);
      for (const m of plan.meals) {
        ok(!m.empty, `slot ${m.slot.key} has options for ${diet} ${al}`);
        if (m.empty) continue;
        for (const it of m.items) {
          ok((OM.ING[it.id].tags || []).every(t => !ex.includes(t)), `diet/allergy respected: ${it.id} in ${diet}/${al}`);
          ok(isFinite(it.g) && it.g > 0 && isFinite(it.cost) && it.cost > 0, `valid amount/cost ${it.id}`);
        }
      }
      const ids = plan.meals.map(m => m.tpl && m.tpl.id); plan.meals.forEach(m => m.name && ok(!/\{p\}/.test(m.name), 'name filled'));
      ok(ids[1] !== ids[2], 'lunch differs from dinner');
      kErr.push((plan.tot.k - T2.kcal) / T2.kcal); if (diet !== 'vegan') kErrMain.push(Math.abs(plan.tot.k - T2.kcal) / T2.kcal); else kErrVegan.push(Math.abs(plan.tot.k - T2.kcal) / T2.kcal);
      pRatio.push(plan.tot.p / T2.protein);
      if (region !== 'OTHER' && diet === 'none' && !al.length && prof === base) costs[region].push(plan.tot.cost);
    }
  }
}
const absK = kErr.map(Math.abs).sort((a, b) => a - b);
const pct = (arr, q) => arr[Math.floor(arr.length * q)];
console.log(`Meal-days generated: ${mealDays}`);
console.log(`Calorie error vs target  median ${(pct(absK, .5) * 100).toFixed(1)}%  90th pct ${(pct(absK, .9) * 100).toFixed(1)}%  max ${(absK[absK.length - 1] * 100).toFixed(1)}%`);
const pr = pRatio.slice().sort((a, b) => a - b);
console.log(`Protein hit vs target   10th pct ${(pct(pr, .1) * 100).toFixed(0)}%  median ${(pct(pr, .5) * 100).toFixed(0)}%`);
kErrMain.sort((a,b)=>a-b); kErrVegan.sort((a,b)=>a-b);
console.log(`  non-vegan days: median ${(pct(kErrMain,.5)*100).toFixed(1)}%  90th ${(pct(kErrMain,.9)*100).toFixed(1)}%   vegan days: median ${(pct(kErrVegan,.5)*100).toFixed(1)}%  90th ${(pct(kErrVegan,.9)*100).toFixed(1)}%`);
ok(pct(kErrMain, .9) < 0.12, '90% of non-vegan days within 12% of calorie target');

// omnivore protein specifically
const omniP = []; for (let i = 0; i < 28; i++) { const T3 = OM.calcTargets(base); const pl = OM.planDay(OM.addDays('2026-10-22', i), base, T3, OM.priceTable(base, {}), {}); omniP.push(pl.tot.p / T3.protein); }
omniP.sort((a, b) => a - b); console.log(`Omnivore protein hit     10th pct ${(pct(omniP, .1) * 100).toFixed(0)}%  median ${(pct(omniP, .5) * 100).toFixed(0)}%`);
ok(pct(omniP, .5) * 2.0 >= 1.6, 'omnivore median protein >= 1.6 g/kg (muscle-gain plateau, Morton 2018)');

const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`Avg daily food cost (80 kg man, losing): Jamaica J$${avg(costs.JM).toFixed(0)}  USA $${avg(costs.US).toFixed(2)}`);

// swaps change the meal
const pt0 = OM.priceTable(base, {}), T0 = OM.calcTargets(base);
const p0 = OM.planDay('2026-10-22', base, T0, pt0, {});
const p1 = OM.planDay('2026-10-22', base, T0, pt0, { '2026-10-22': { l: 1 } });
ok(p0.meals[1].tpl.id !== p1.meals[1].tpl.id, 'swap changes lunch');
// custom prices flow through
const ptC = OM.priceTable(base, { rice: { pr: 360 } });
ok(ptC.items.rice.pr === 360 && ptC.items.rice.conf === 'yours', 'custom price applied');

// 6. Shopping list
const sl = OM.shoppingList('2026-10-22', 7, base, T0, pt0, {});
ok(sl.rows.length > 8, 'shopping rows');
ok(sl.total >= sl.eatenCost * 0.98, 'shopping total covers food eaten (rounded up to pack sizes)');
console.log(`7-day shop (Jamaica): J$${sl.total.toFixed(0)} to buy, J$${sl.eatenCost.toFixed(0)} of it eaten this week`);
sl.rows.forEach(r => { ok(r.qty > 0 && isFinite(r.cost), 'row valid ' + r.id); if (!r.price.weighed) ok(Number.isInteger(r.qty), 'whole packs for ' + r.id); else ok(r.qty * 2 === Math.round(r.qty * 2), 'half-pound steps for ' + r.id); });
// every price is a pack with a store and a date
for (const reg of ['JM', 'US']) for (const [id, it] of Object.entries(OM.PRICES[reg].items)) ok(it.u && it.g > 0 && it.pr > 0 && it.store && it.date && !/serving/i.test(it.u), `pack price ${reg} ${id}`);
ok(Object.keys(OM.PRICES.JM.items).length === Object.keys(OM.ING).length, 'every ingredient has a Jamaica price');
// plates keep a real portion of starch in main meals
{ const T1 = OM.calcTargets(base), pt1 = OM.priceTable(base, {});
  for (let i = 0; i < 30; i++) for (const m of OM.planDay(OM.addDays('2026-10-22', i), base, T1, pt1, {}).meals) {
    if (m.slot.key === 'l' || m.slot.key === 'd') { const c = m.items.find(x => x.role === 'carb'); ok(OM.ING[c.id].k * c.g / 100 >= 0.2 * m.kT, 'starch portion on ' + m.name); }
  } }
// custom price with store
const ptS = OM.priceTable(base, { egg: { pr: 1100, store: 'Hi-Lo', date: '23 Oct 2026' } });
ok(ptS.items.egg.store === 'Hi-Lo' && /Hi-Lo/.test(ptS.items.egg.src), 'store recorded on your price');
ok(OM.CHANGES.length >= 1 && OM.CHANGES[0].d >= OM.CHANGES[OM.CHANGES.length - 1].d, 'changes log newest first');

// 7. Trend / adaptive
const ws = []; for (let i = 0; i < 21; i += 2) ws.push({ d: OM.addDays('2026-10-01', i), kg: 80 - i * 0.02 });
const tr = OM.trend(ws, '2026-10-21');
near(tr.perWeek, -0.14, 0.01, 'trend slope');
const sug = OM.suggestAdjust(T0, tr, 80);
ok(sug && sug.delta === -150, 'slow loss suggests -150');
const fast = []; for (let i = 0; i < 21; i += 2) fast.push({ d: OM.addDays('2026-10-01', i), kg: 80 - i * 0.2 });
ok(OM.suggestAdjust(T0, OM.trend(fast, '2026-10-21'), 80).delta === 150, 'too-fast loss suggests +150');
ok(OM.trend(ws.slice(0, 3), '2026-10-21') === null, 'not enough data -> no trend');

// 8. Store pricing
{
  const cfg = OM.STORE;
  for (const pr of OM.PRODUCTS) {
    const l = OM.landed(pr);
    const goods = pr.usd * 1.07 * cfg.fx, freight = pr.lb * 600, cif = goods + freight, duty = cif * 0.2, gct = (cif + duty) * 0.15;
    const fees = cif * 0.008 + (cif > 5500 ? 100 : 0), cost = goods + freight + duty + gct + fees;
    near(l.cost, cost, 0.01, 'landed cost ' + pr.id);
    ok(l.price >= cost * 1.15 && l.price < cost * 1.15 + 50, '15% markup, rounded up to J$50: ' + pr.id);
    ok(l.price % 50 === 0, 'price rounded ' + pr.id);
    ok(pr.lb > 0 && pr.usd > 0 && pr.name && pr.size, 'product complete ' + pr.id);
  }
  ok(cfg.freightPerLb === 600 && cfg.markup === 0.15 && cfg.duty === 0.2 && cfg.gct === 0.15, 'store settings match owner + Customs');
  ok(/^1\d{10}$/.test(cfg.whatsapp), 'WhatsApp number in international form');
  const c4 = OM.PRODUCTS.find(x => x.stim);
  ok(OM.productView(c4, { age: 16 }).hidden, 'pre-workout hidden under 18');
  ok(OM.productView(c4, { age: 30, pregnant: true }).hidden, 'pre-workout hidden in pregnancy');
  ok(OM.productView(c4, { age: 30, parq: [true] }).hidden, 'pre-workout hidden after a health-screen yes');
  ok(!OM.productView(c4, { age: 30, parq: [false] }).hidden, 'pre-workout shown otherwise');
  const whey = OM.PRODUCTS.find(x => x.id === 'on-whey-5');
  ok(OM.productView(whey, { diet: 'vegan' }).conflict.includes('dairy'), 'whey flagged for vegans');
  ok(OM.productView(whey, { allergies: ['dairy'] }).conflict.includes('dairy'), 'whey flagged for dairy allergy');
  const o = OM.orderText({ 'on-whey-5': 2, 'jump-rope': 1 }, cfg, 'Kim');
  ok(o.count === 2 && o.total === OM.landed(whey).price * 2 + OM.landed(OM.PRODUCTS.find(x => x.id === 'jump-rope')).price, 'order total');
  ok(/Name: Kim/.test(o.text) && /2 × Optimum Nutrition/.test(o.text), 'order text');
  ok(OM.orderText({}, cfg).count === 0, 'empty bag');
  // price provenance: every Amazon price has a source, a valid date and a known confidence level
  for (const pr of OM.PRODUCTS) {
    ok(typeof pr.src === 'string' && pr.src.length > 10, 'price source ' + pr.id);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(pr.date) && OM.dayNum(pr.date) <= OM.dayNum('2026-10-23'), 'price date ' + pr.id);
    ok(Object.keys(OM.PRICE_CONF).includes(pr.conf), 'price confidence ' + pr.id);
  }
  ok(/^\d{4}-\d{2}-\d{2}$/.test(cfg.fxDate) && cfg.fx >= 150 && cfg.fx <= 175, 'exchange rate dated and plausible');
  const pc = (conf, date, today) => OM.priceCheck({ conf, date }, today);
  ok(!pc('amazon', '2026-10-01', '2026-10-31').stale && !pc('amazon', '2026-10-01', '2026-10-31').confirm, 'fresh Amazon price needs no check');
  ok(pc('amazon', '2026-10-01', '2026-11-01').stale, 'Amazon price over 30 days old needs a check');
  ok(pc('tracker', '2026-10-20', '2026-10-23').confirm && !pc('tracker', '2026-10-20', '2026-10-23').stale, 'tracker price fresh but still to confirm');
  ok(pc('estimate', undefined, '2026-10-23').stale && pc('mystery', '2026-10-23', '2026-10-23').label === 'Estimate', 'missing date or unknown level treated as estimate');
  // whey 5 lb reflects the Oct 2026 tracker price, and the store never sells below landed cost
  ok(whey.usd === 114.99, 'whey 5 lb at Oct 2026 Amazon tracker price');
  for (const pr of OM.PRODUCTS) ok(OM.landed(pr).profit > 0, 'positive margin ' + pr.id);
  // flavours, Amazon links, order links
  ok(OM.cartKey('on-whey-5') === 'on-whey-5.drc' && OM.cartKey('jump-rope') === 'jump-rope', 'default flavour key');
  const merged = OM.normalizeCart({ 'on-whey-5': 1, 'on-whey-5.drc': 2, 'on-whey-5.nope': 1, 'ghost': 3, 'gloves.l': 0 });
  ok(merged['on-whey-5.drc'] === 4 && Object.keys(merged).length === 1, 'old bag keys merge into one line: ' + JSON.stringify(merged));
  const a1 = OM.amazonLink(whey, OM.variantOf(whey, 'vic'));
  ok(a1.exact && a1.url === 'https://www.amazon.com/dp/B000GISU1M', 'exact Amazon link for a flavour seen on Amazon');
  const iso = OM.productById('iso100-5'), a2 = OM.amazonLink(iso, OM.variantOf(iso, 'fbr'));
  ok(!a2.exact && /amazon\.com\/s\?k=/.test(a2.url) && /Fudge%20Brownie/.test(a2.url), 'search link includes the flavour');
  const gl = OM.productById('gloves'), a3 = OM.amazonLink(gl, OM.variantOf(gl, 'l'));
  ok(!/Large/.test(a3.url), 'glove size is not put in the search text');
  for (const pr of OM.PRODUCTS) { ok(pr.pic && pr.q, 'picture and Amazon search text for ' + pr.id); (pr.variants || []).forEach(v => ok(!v.asin || /^B0[0-9A-Z]{8}$/.test(v.asin), 'ASIN format ' + v.asin)); }
  const bag = { 'on-whey-5.vic': 2, 'jump-rope': 1, 'gloves.xl': 1 };
  const ot = OM.orderText(bag, cfg, ' Kim B ', '2026-10-23');
  ok(/order OM-1023-[A-Z2-9]{4}/.test(ot.text) && ot.text.includes('Vanilla Ice Cream') && ot.text.includes('XL') && ot.text.includes(ot.url), 'order message has number, flavours, sizes and link');
  ok(ot.url.startsWith('https://876lab.github.io/omgym/?o=') && !/[*~_\s]/.test(ot.url), 'order link is WhatsApp-safe (no * ~ _ or spaces)');
  ok(OM.orderText(bag, cfg, 'Kim B', '2026-10-23').id === ot.id && OM.orderText({ 'jump-rope': 2 }, cfg, 'Kim B', '2026-10-23').id !== ot.id, 'order number is stable for the same bag and changes with it');
  const po = OM.parseOrder(ot.url.split('?')[1]);
  ok(po.id === ot.id && po.name === 'Kim B' && po.lines.length === 3 && po.lines.find(l => l.pk.key === 'on-whey-5.vic').qty === 2, 'order link opens back into the same items');
  ok(OM.parseOrder('?o=' + encodeURIComponent('ghost.x.2,on-whey-5.drc.999,jump-rope.x.-1') + '&id=X').lines.length === 1, 'unknown items and silly quantities ignored');
  ok(OM.parseOrder('?foo=1') === null, 'no order in a normal link');
  const sum = OM.orderSummary(po.lines, cfg);
  near(sum.price, ot.total, 0.01, 'order sheet total matches the quote');
  near(sum.usd, 114.99 * 2 + 9.99 + 19.99, 0.01, 'Amazon subtotal');
  console.log('Store prices: ' + OM.PRODUCTS.map(x => x.id + ' J$' + OM.landed(x).price.toLocaleString()).join(', '));
}
console.log(`Workouts generated: ${wcount}, session length ${minM}-${maxM} min`);
console.log(`\nPASS ${pass}  FAIL ${fail}`);
if (fail) { console.log([...new Set(fails)].slice(0, 30).join('\n')); process.exit(1); }
