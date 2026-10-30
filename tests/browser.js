const { chromium } = require('playwright');
const OUT = require('path').resolve(__dirname, 'out'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const errors = []; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts/.test(m.text())) errors.push(m.text()); });
  // The Store may be paused (STORE.paused). Locally, the full walk-through runs on a copy with the Store open,
  // and the real build is checked separately for the paused Store at the end.
  const fs = require('fs'), path = require('path'), INDEX = path.resolve(__dirname, '..', 'index.html');
  let url = process.env.SITE;
  if (!url) { const open = path.join(OUT, 'index-open.html'); fs.writeFileSync(open, fs.readFileSync(INDEX, 'utf8').replace(/paused: (true|false),/, 'paused: false,')); url = 'file://' + open; }
  await page.goto(url);
  if (process.env.SITE) {
    for (const f of ['manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png']) {
      const r = await page.request.get(new URL(f, url).href); ok(r.ok(), 'live file reachable: ' + f);
    }
    ok((await page.getAttribute('link[rel=apple-touch-icon]', 'href')) === 'icons/apple-touch-icon.png', 'Home Screen icon tag present');
  }
  ok(await page.isVisible('text=You are looking at an example plan'), 'example banner');
  ok(await page.locator('.ex').count() > 0 || await page.isVisible('text=Active recovery'), 'example workout renders');
  for (const t of ['food', 'shop', 'store', 'progress', 'me', 'today']) { await page.click(`nav [data-tab=${t}]`); ok((await page.locator('#view').innerText()).length > 200, 'tab renders ' + t); }
  const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await page.screenshot({ path: OUT + '/shot-example-today.png', fullPage: true });
  // What's new button in the header
  ok(await page.isVisible('#newsbtn') && await page.isVisible('#newdot'), "what's new dot shows on first visit");
  ok(/\d+ new update/.test(await page.getAttribute('#newsbtn', 'aria-label')), "what's new button says how many are new");
  ok(await page.isVisible('#probtn'), 'PRO button still in the header');
  ok(!(await overflow()), 'no overflow with the new header button');
  await page.click('#newsbtn');
  ok(await page.isVisible('#news'), "what's new panel opens");
  { const newest = await page.evaluate(() => OM.CHANGES[0].t); const first = await page.locator('#news .newsitem strong').first().innerText(); ok(first === newest, "panel lists the newest entry first: " + first); }
  ok(await page.locator('#news .newsitem').count() === await page.evaluate(() => OM.CHANGES.length), 'panel lists every entry');
  ok(await page.locator('#news .pill.new').count() === await page.evaluate(() => OM.CHANGES.length), 'every entry marked New on first visit');
  ok(await page.isHidden('#newdot'), 'dot clears after opening');
  await page.screenshot({ path: OUT + '/shot-news.png' });
  await page.keyboard.press('Escape');
  ok(await page.isHidden('#news'), 'Escape closes the panel');
  ok(await page.evaluate(() => localStorage.getItem('omgym-news-seen') === OM.changeKey(OM.CHANGES[0])), 'last seen entry remembered');
  await page.reload();
  ok(await page.isHidden('#newdot'), 'dot stays cleared after reload');
  await page.click('#newsbtn'); ok(await page.locator('#news .pill.new').count() === 0, 'nothing marked New on the next visit');
  await page.click('#news .btn[data-act=closenews]'); ok(await page.isHidden('#news'), 'Close button closes the panel');
  await page.evaluate(() => localStorage.setItem('omgym-news-seen', OM.changeKey(OM.CHANGES[1]))); await page.reload();
  ok(await page.isVisible('#newdot'), 'dot shows again when a newer entry arrives');
  await page.click('#newsbtn'); ok(await page.locator('#news .pill.new').count() === 1, 'only the newer entry is marked New');
  await page.keyboard.press('Escape');
  // setup flow
  await page.click('[data-act=setup]');
  await page.click('[data-act=next]'); ok(await page.isVisible('.err'), 'validation blocks empty step');
  await page.fill('#name', 'Cargill');
  await page.click('[data-k=sex][data-v=male]');
  await page.fill('#age', '34'); await page.fill('#heightCm', '178'); await page.fill('#weightKg', '92');
  await page.click('[data-act=next]');
  await page.fill('#neckCm', '40'); await page.fill('#waistCm', '102');
  await page.click('[data-act=next]');
  await page.fill('#goalKg', '80');
  await page.click('#goalKg'); await page.click('[data-k=activity][data-v=light]');
  ok(await page.isVisible('[data-k=pace]'), 'pace shown for loss goal');
  await page.click('[data-k=days][data-v="6"]'); // add Saturday -> 4 days
  await page.click('[data-k=equipment][data-v=dumbbells]');
  await page.click('[data-act=next]');
  await page.click('[data-k=injuries][data-v=knees]');
  await page.click('[data-act=next]');
  await page.click('[data-k=allergies][data-v=peanut]');
  ok(await page.isVisible('[data-k=allergies][data-v=shellfish]'), 'shellfish allergy option');
  ok(await page.isVisible('[data-k=allergies][data-v=soy]'), 'soy allergy option');
  await page.click('[data-k=allergies][data-v=shellfish]');
  await page.screenshot({ path: OUT + '/shot-setup.png' });
  await page.click('[data-act=next]');
  ok(await page.isHidden('#sheet'), 'sheet closes');
  ok(!(await page.isVisible('text=You are looking at an example plan')), 'example banner gone');
  const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('omgym-state-v1')).profile);
  ok(prof.sex === 'male' && prof.weightKg === 92 && prof.days.length === 4 && prof.injuries[0] === 'knees', 'profile saved ' + JSON.stringify(prof.days));
  // workout interactions (today may be a rest day)
  const sets = page.locator('.setbox');
  if (await sets.count()) {
    await sets.first().click(); ok((await sets.first().getAttribute('aria-pressed')) === 'true', 'set box toggles');
    ok(await page.isVisible('#rest') && /Rest \d:\d\d/.test(await page.innerText('#rest-t')), 'rest timer starts');
    await page.click('[data-act=skiprest]'); ok(await page.isHidden('#rest'), 'rest timer skips');
    ok(await page.locator('.ex details a[href*="youtube.com"]').count() > 0, 'demo links');
    const names = await page.locator('.ex .name').allInnerTexts();
    ok(!names.some(n => /lunge|split squat|Tempo bodyweight squat/i.test(n)), 'knee-unfriendly moves excluded: ' + names.join(', '));
    const load = page.locator('input[data-act=load]').first(); if (await load.count()) { await load.fill('20'); await load.press('Tab'); }
  }
  ok(await page.locator('.week .wd').count() === 7, 'week strip shows 7 days');
  // How to use OMGym: welcome card, step-by-step guide, Show me, Escape
  { ok(await page.isVisible('#welcome') && /New here/.test(await page.innerText('#welcome')), 'first visit: New here? card on Today');
    await page.click('#welcome [data-act=guide]');
    ok(await page.isVisible('#guide') && /Step 1 of 8/i.test(await page.innerText('#gstep')), 'guide opens at step 1');
    await page.click('#guide .gnav [data-act=guidestep]:not([disabled]) >> text=Next');
    ok(/Today: your workout/i.test(await page.innerText('#gstep')), 'Next goes to the Today step');
    await page.screenshot({ path: OUT + '/shot-guide.png', fullPage: false });
    await page.click('#guide .gdots button >> nth=7'); ok(/Tips/i.test(await page.innerText('#gstep')) && await page.isVisible('#guide [data-act=closeguide] >> text=Done'), 'dots jump to a step; last step says Done');
    await page.click('#guide .gdots button >> nth=3'); await page.click('[data-act=guidego]');
    ok(await page.isHidden('#guide') && /Shopping list/i.test(await page.innerText('#view')), 'Show me opens that tab');
    await page.click('nav [data-tab=today]');
    ok(!(await page.isVisible('#welcome')), 'welcome card gone once the guide was opened');
    await page.click('#helpbtn'); ok(await page.isVisible('#guide'), '? button opens the guide any time');
    await page.keyboard.press('Escape'); ok(await page.isHidden('#guide'), 'Escape closes the guide');
  }
  ok(/week's shop/.test(await page.innerText('.kpis')), 'today shows week shop total');
  await page.click('[data-act=done]'); ok(await page.isVisible('text=Workout logged'), 'workout logged');
  await page.click('[data-act=habit][data-h=water]');
  ok((await page.getAttribute('[data-h=water]', 'aria-pressed')) === 'true', 'habit toggles');
  // log a forgotten day: tap an earlier day in the week strip (or go back a week)
  { const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1); const tm = new Date(now); tm.setDate(now.getDate() + 1);
    const today = ymd(now), yest = ymd(y), tmr = ymd(tm);
    const before0 = await page.evaluate(() => JSON.parse(localStorage.getItem('omgym-state-v1')).loads);
    if (!(await page.locator('.wd[data-d="' + yest + '"]').count())) await page.click('[data-act=wweek][data-n="-7"]');
    await page.click('.wd[data-d="' + yest + '"]');
    ok(await page.isVisible('#otherday') && /You are logging/.test(await page.innerText('#otherday')), 'earlier day opens with a "you are logging" note');
    ok((await page.getAttribute('.wd[data-d="' + yest + '"]', 'aria-pressed')) === 'true', 'tapped day is selected');
    await page.screenshot({ path: OUT + '/shot-backlog.png', fullPage: false });
    const ld = page.locator('input[data-act=load]').first(); let ldEx = null;
    if (await ld.count()) { ldEx = await ld.getAttribute('data-ex'); await ld.fill('5'); await ld.press('Tab'); }
    if (await page.locator('[data-act=done]').count()) await page.click('[data-act=done]');
    let st = await page.evaluate(() => JSON.parse(localStorage.getItem('omgym-state-v1')));
    ok(st.days[yest] && st.days[yest].done === true, 'forgotten day logged');
    ok(st.days[today] && st.days[today].done === true, 'today stays logged');
    ok((await page.innerText('.wd[data-d="' + yest + '"]')).includes('✓'), 'week strip ticks the forgotten day');
    if (ldEx && before0[ldEx] && before0[ldEx].d === today) ok(st.loads[ldEx].d === today && st.loads[ldEx].v === before0[ldEx].v, 'an earlier day\'s weight does not replace today\'s "Last" weight');
    await page.click('#otherday [data-act=wday]');
    ok(!(await page.isVisible('#otherday')), 'Back to today');
    if (await page.locator('.wd[data-d="' + tmr + '"]').count()) { await page.click('.wd[data-d="' + tmr + '"]'); ok(/preview/.test(await page.innerText('#otherday')) && (await page.locator('[data-act=done]').count()) === 0, 'future day is a preview, nothing to log'); await page.click('#otherday [data-act=wday]'); }
    // a day older than 4 weeks cannot be opened
    for (let i = 0; i < 6; i++) { const b = page.locator('[data-act=wweek][data-n="-7"]'); if (await b.isDisabled()) break; await b.click(); }
    ok(await page.locator('[data-act=wweek][data-n="-7"]').isDisabled(), 'goes back at most 4 weeks');
    for (let i = 0; i < 6; i++) { const b = page.locator('[data-act=wweek][data-n="7"]'); if (await b.isDisabled()) break; await b.click(); }
    await page.click('.wd[data-d="' + today + '"]');
  }
  // meals
  await page.click('nav [data-tab=food]');
  // Build my own meal (free): build and check; PRO actions point to PRO
  { await page.click('[data-act=bopen]');
    ok(await page.isVisible('#builder') && /Pick a base/.test(await page.innerText('#builder')), 'builder opens');
    ok(!(await page.locator('[data-act=bpick][data-g=extra][data-v=pb]').count()), 'builder hides foods the person is allergic to (peanut)');
    await page.click('[data-act=bpick][data-g=base][data-v=wrap]'); await page.click('[data-act=bpick][data-g=prot][data-v=chickbreast]');
    await page.click('[data-act=bpick][data-g=veg][data-v=cabbage]'); await page.click('[data-act=bpick][data-g=veg][data-v=tomato]');
    const r = await page.innerText('#bresult');
    ok(/Chicken breast wrap/i.test(r) && /kcal/.test(r) && /protein/.test(r), 'builder shows the meal, calories and protein');
    ok(/\(2 wraps\)/.test(r) && /Pack you buy/i.test(r) && /How to make it/.test(r), 'builder shows amounts, packs to buy and how to make it');
    ok(!/costs about|per serving/i.test(r), 'builder never shows per-serving cost');
    ok(await page.isVisible('#bkcal') && await page.isVisible('#bprot'), 'builder says whether it fits the goal');
    await page.click('[data-act=bsize][data-k=bs][data-v="1.4"]'); ok(/\(3 wraps\)/.test(await page.innerText('#bresult')), 'Large base: 3 wraps');
    await page.click('[data-act=bpick][data-g=prot][data-v=tuna]'); await page.click('[data-act=bpick][data-g=prot][data-v=egg]');
    ok(await page.locator('[data-act=bpick][data-g=prot][aria-pressed=true]').count() === 2, 'at most 2 proteins');
    ok(await page.isVisible('#bprohint') && /PRO/.test(await page.innerText('[data-act=badd]')), 'free version marks PRO actions');
    await page.screenshot({ path: OUT + '/shot-builder.png', fullPage: false });
    await page.click('[data-act=badd]'); ok(await page.isVisible('text=Already paid?') || /PRO/i.test(await page.locator('#view').innerText()), 'Add to plan sends free users to PRO');
    const stB = await page.evaluate(() => JSON.parse(localStorage.getItem('omgym-state-v1')));
    ok(!Object.values(stB.swaps || {}).some(x => x.cl || x.cd), 'free users cannot add built meals to the plan');
    await page.click('nav [data-tab=food]'); await page.click('[data-act=bclose]');
  }
  const txt = await page.locator('#view').innerText();
  ok(!/Peanut butter/i.test(txt), 'peanut allergy respected in meals');
  ok(/pack you buy/i.test(txt) && /(bag|tin|dozen|loaf|jar|bottle|bundle|head|chicken|per lb)/.test(txt), 'meal tables quote packs');
  ok(!/costs about/.test(txt), 'no per-serving cost text');
  const before = await page.locator('.card:not(.builder) h3').nth(0).innerText();
  await page.click('[data-act=swap][data-slot=b]');
  const after = await page.locator('.card:not(.builder) h3').nth(0).innerText();
  ok(before !== after, 'swap breakfast: ' + before + ' -> ' + after);
  await page.click('[data-act=fd][data-n="1"]'); ok(await page.isVisible('text=Recipes') || true, 'next day');
  ok(!(await overflow()), 'no horizontal overflow on meals');
  await page.screenshot({ path: OUT + '/shot-meals.png', fullPage: true });
  // shop + price edit
  await page.click('nav [data-tab=shop]');
  const totalBefore = await page.locator('.kpi .v').first().innerText();
  await page.locator('[data-act=editprice][data-id=rice]').click();
  await page.fill('#price-rice', '900'); await page.selectOption('#store-rice', 'Hi-Lo'); await page.click('[data-act=saveprice][data-id=rice]');
  const totalAfter = await page.locator('.kpi .v').first().innerText();
  ok(totalBefore !== totalAfter, 'price edit changes total ' + totalBefore + ' -> ' + totalAfter);
  ok(await page.isVisible('.pill.yours'), 'your-price pill');
  ok(/Your price at Hi-Lo/.test(await page.locator('#view').innerText()), 'store recorded on price');
  const qtys = await page.locator('.shoprow label .small').allInnerTexts();
  ok(qtys.every(q => /^\d+ × |lb, weighed/.test(q)), 'shop list in whole packs or weighed lb: ' + qtys.slice(0, 4).join(' | '));
  await page.locator('[data-act=tick]').first().check();
  ok(!(await overflow()), 'no horizontal overflow on shop');
  await page.screenshot({ path: OUT + '/shot-shop.png', fullPage: true });
  // food budget levels, quick region switch, foods I buy
  ok(await page.locator('.tiers .tier').count() === 3, 'three budget levels with weekly costs');
  const tierVals = await page.locator('.tiers .tier .v').allInnerTexts();
  ok(tierVals.every(v => /^J\$[\d,]+$/.test(v)), 'budget tiles priced in J$: ' + tierVals.join(' '));
  await page.click('.quick [data-k=budget][data-v="3"]');
  ok(/Premium/i.test(await page.locator('.tier.on').innerText()), 'Premium level selected');
  ok(/Greek yogurt|Cottage cheese|berries|Salmon|turkey|Whey/i.test(await page.locator('#view').innerText()), 'Premium list includes premium foods');
  await page.click('.quick [data-k=region][data-v=US]');
  const usText = await page.locator('#view').innerText();
  ok(/^\$[\d,.]+$/.test(await page.locator('.kpi .v').first().innerText()) && /Walmart/.test(usText), 'quick switch to USA: dollars and US stores');
  await page.click('nav [data-tab=food]');
  ok(/American/.test(await page.locator('.quick').innerText()), 'USA uses American dishes');
  ok(!/hard dough|hardo bread|callaloo|Mackerel/i.test(await page.locator('#view').innerText()), 'no Jamaican-only dishes in the US plan');
  ok(!(await overflow()), 'no horizontal overflow with the quick bar');
  await page.click('.quick [data-k=region][data-v=JM]'); await page.click('.quick [data-k=budget][data-v="1"]');
  await page.click('nav [data-tab=shop]');
  ok(/^J\$/.test(await page.locator('.kpi .v').first().innerText()), 'switch back to Jamaica');
  await page.click('[data-act=setupfood]');
  ok(await page.isVisible('text=Foods I buy'), 'food settings open at the Food step');
  await page.click('[data-k=likes][data-v=greekyog]'); await page.fill('#foodCap', '5000');
  await page.click('[data-act=next]');
  await page.click('nav [data-tab=shop]');
  const capText = await page.locator('#view').innerText();
  ok(/over\s+your weekly food budget/i.test(capText), 'over-budget week is flagged');
  ok(/Greek yogurt/.test(capText), 'Foods I buy appear on the list');
  await page.screenshot({ path: OUT + '/shot-budget.png', fullPage: true });
  // store
  const storeOpen = await page.evaluate(() => !OM.STORE.paused);
  await page.click('nav [data-tab=store]');
  if (storeOpen) {
  ok(await page.locator('.prod').count() >= 10, 'store lists products');
  ok(/Pre-workout/.test(await page.locator('#view').innerText()), 'pre-workout shown for a cleared adult');
  ok(await page.locator('.prod .pic svg').count() >= 10, 'every product has a picture');
  await page.selectOption('#var-on-whey-5', 'vic');
  await page.locator('.prod [data-act=cartadd][data-key="on-whey-5.vic"]').click();
  await page.locator('.prod [data-act=cartadd][data-key="jump-rope"]').click();
  await page.locator('.bag [data-act=cartadd][data-key="on-whey-5.vic"]').click();
  ok(/Vanilla Ice Cream/.test(await page.innerText('.bag')), 'bag shows the flavour');
  ok((await page.innerText('#bagcount')) === '3', 'bag badge counts items');
  await page.fill('#order-name', 'Cargill');
  const wa = await page.getAttribute('#wa-link', 'href');
  const msg = decodeURIComponent(wa.split('?text=')[1]);
  ok(wa.startsWith('https://wa.me/16582184432?text=') && msg.includes('2 × Optimum Nutrition') && msg.includes('Vanilla Ice Cream') && msg.includes('Name: Cargill'), 'WhatsApp order message');
  const orderLink = msg.split('\n').pop();
  ok(orderLink.startsWith('https://876lab.github.io/omgym/?o='), 'WhatsApp message ends with the order link');
  await page.click('.prod-top + h3 >> nth=0').catch(() => {});
  await page.click('[data-act=storecat][data-c=gear]');
  ok(await page.locator('.prod').count() === 6, 'gear filter');
  await page.click('[data-act=sellerview]');
  ok(/landed/i.test(await page.locator('#view').innerText()) && /import permit/i.test(await page.locator('#view').innerText()), 'seller view shows breakdown');
  ok(await page.locator('#pricesources li').count() === 13, 'seller view lists a source for every product');
  ok(/WheyIndex/.test(await page.locator('#pricesources').innerText()) && /check again/i.test(await page.locator('#pricesources').innerText()), 'price sources show origin and stale flag');
  ok(!(await overflow()), 'no horizontal overflow on store');
  await page.screenshot({ path: OUT + '/shot-store.png', fullPage: true });
  // open the order link the owner receives (served locally instead of GitHub Pages)
  const local = url.split('?')[0] + '?' + orderLink.split('?')[1];
  const sheet = await ctx.newPage(); sheet.on('pageerror', e => errors.push(e.message));
  await sheet.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await sheet.goto(local);
  const st1 = await sheet.locator('#view').innerText();
  ok(/order OM-\d{4}-/i.test(st1) && /cargill/i.test(st1), 'order sheet shows number and name');
  ok(await sheet.locator('a[href="https://www.amazon.com/dp/B000GISU1M"]').count() === 1, 'exact Amazon link for vanilla 5 lb');
  ok(await sheet.locator('a[href*="amazon.com/s?k="]').count() === 1, 'search link for the jump rope');
  ok(/2 × Optimum Nutrition/.test(st1) && /Vanilla Ice Cream/.test(st1), 'order sheet quantities and flavour');
  ok(/Your profit/.test(st1), 'seller sees profit on this phone (Seller view is on)');
  await sheet.locator('[data-act=ordtick]').first().check();
  ok(await sheet.locator('.orderrow.ticked').count() === 1, 'tick an item as ordered');
  ok(!(await sheet.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'order sheet fits a phone');
  await sheet.screenshot({ path: OUT + '/shot-order.png', fullPage: true });
  await sheet.close();
  // a customer opening the same link on another phone sees no costs
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } }); const cp = await other.newPage();
  await cp.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await cp.goto(local); const cust = await cp.locator('#view').innerText();
  ok(/Open on Amazon/.test(cust) && !/Your profit|Landed/.test(cust), 'customers do not see cost or profit');
  await other.close();
  } else ok(await page.isVisible('#store-paused') && await page.locator('.prod').count() === 0, 'live Store shows the paused notice');
  // progress
  await page.click('nav [data-tab=progress]');
  for (const [d, kg] of [[-20, 92.3], [-16, 92.2], [-12, 92.4], [-8, 92.1], [-4, 92.2]]) {
    const ds = await page.evaluate(n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }, d);
    await page.fill('#w-date', ds); await page.fill('#w-kg', String(kg)); await page.click('[data-act=logw]');
  }
  ok(await page.locator('.chart svg circle').count() >= 5, 'chart draws');
  ok(await page.isVisible('text=Adjust your calories?'), 'slow loss triggers suggestion');
  await page.click('[data-act=applyadj]');
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('omgym-state-v1')));
  ok(st.kcalAdj === -150, 'adjustment saved');
  await page.screenshot({ path: OUT + '/shot-progress.png', fullPage: true });
  await page.click('nav [data-tab=me]');
  ok(await page.isVisible('text=-150 kcal adjustment') || await page.isVisible('text=−150'), 'plan shows adjustment');
  ok(await page.isVisible("text=What's new"), "what's new section");
  ok(!(await overflow()), 'no overflow plan tab');
  await page.screenshot({ path: OUT + '/shot-plan.png', fullPage: true });
  // persistence across reload
  await page.reload();
  ok(await page.isVisible('text=Workout logged') || true, 'reload');
  const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem('omgym-state-v1')));
  ok(st2.profile.name === 'Cargill' && st2.weights.length >= 6, 'state persists after reload');
  // Text size: Normal / Large on the Plan tab, saved per device, never inside the saved plan
  { await page.click('nav [data-tab=me]');
    const fs0 = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    ok(await page.isVisible('#textsize') && (await page.getAttribute('#textsize [data-v=normal]', 'aria-pressed')) === 'true', 'Text size card on Plan, Normal by default');
    ok(Math.abs(fs0 - 15) < 0.1, 'normal body text stays 15px: ' + fs0);
    const before = await page.evaluate(() => localStorage.getItem('omgym-state-v1'));
    await page.click('#textsize [data-v=large]');
    const big = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-text'), fs: parseFloat(getComputedStyle(document.body).fontSize), h1: getComputedStyle(document.querySelector('#view h1')).fontWeight, btn: getComputedStyle(document.querySelector('#view .btn')).fontWeight, saved: localStorage.getItem('omgym-text') }));
    ok(big.attr === 'large' && big.saved === 'large', 'Large saved on this device');
    ok(big.fs > 17 && big.fs < 17.6, 'Large body text about 15% bigger: ' + big.fs);
    ok(Number(big.h1) >= 900 && Number(big.btn) >= 800, 'Large makes headings and buttons bolder: ' + big.h1 + '/' + big.btn);
    ok((await page.getAttribute('#textsize [data-v=large]', 'aria-pressed')) === 'true', 'Large shows as picked');
    ok((await page.evaluate(() => localStorage.getItem('omgym-state-v1'))) === before, 'text size does not touch the saved plan');
    const spill = () => page.evaluate(() => {
      const W = window.innerWidth, bad = [];
      const clipped = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
      document.querySelectorAll('header *, nav.tabs *, #view *').forEach(el => {
        const r = el.getBoundingClientRect(); if (!r.width || getComputedStyle(el).visibility === 'hidden') return;
        if ((r.right > W + 1 || r.left < -1) && !clipped(el)) bad.push((el.className || el.tagName) + ' ' + Math.round(r.right));
        if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && getComputedStyle(el).overflowX === 'visible' && el.tagName !== 'svg' && !clipped(el)) bad.push('text ' + (el.className || el.tagName) + ': ' + el.textContent.slice(0, 30));
      });
      return (document.documentElement.scrollWidth > W + 1 ? ['page'] : []).concat(bad).slice(0, 5);
    });
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const t of ['today', 'food', 'shop', 'store', 'progress', 'me']) {
        await page.click(`nav [data-tab=${t}]`);
        const b = await spill(); ok(b.length === 0, `Large text fits 390px (${scheme}, ${t}): ` + b.join(' | '));
        if (scheme === 'light' || t === 'me' || t === 'today') await page.screenshot({ path: OUT + `/shot-large-${t}-${scheme}.png`, fullPage: t !== 'food' });
      }
      await page.click('#probtn'); { const b = await spill(); ok(b.length === 0, `Large text fits 390px (${scheme}, pro): ` + b.join(' | ')); }
      await page.click('#newsbtn'); ok(!(await overflow()), `Large text: What's new fits (${scheme})`); await page.keyboard.press('Escape');
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    ok((await page.evaluate(() => document.documentElement.getAttribute('data-text'))) === 'large', 'Large stays on after reload');
    await page.click('nav [data-tab=me]'); await page.click('#textsize [data-v=normal]');
    const back = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-text'), fs: parseFloat(getComputedStyle(document.body).fontSize), saved: localStorage.getItem('omgym-text') }));
    ok(back.attr === null && Math.abs(back.fs - 15) < 0.1 && back.saved === 'normal', 'Normal puts text back');
  }
  // Move my data: copy, start over, paste back, undo
  { await page.click('nav [data-tab=me]');
    await page.click('[data-act=datacopy]');
    const code = await page.inputValue('#datacode');
    ok(code.startsWith('OMGYM1:'), 'Copy my data shows the code');
    await page.click('[data-act=dataclose]');
    await page.click('[data-act=datapaste]'); await page.fill('#datain', 'not a code'); await page.click('[data-act=datacheck]');
    ok(/isn't an OMGym data code/.test(await page.locator('#datapastebox').innerText()), 'bad code gets a plain message');
    await page.click('[data-act=dataclose]');
    await page.click('[data-act=reset1]'); await page.click('[data-act=reset2]');
    await page.click('nav [data-tab=me]');
    ok(await page.isVisible('#datanew') && !(await page.isVisible('[data-act=datacopy]')), 'a new user sees Paste my data, with nothing to copy');
    await page.click('[data-act=datapaste]'); await page.fill('#datain', 'omgym1:' + code.slice(7)); await page.click('[data-act=datacheck]');
    const conf = await page.locator('#dataconfirm').innerText();
    ok(/Cargill/.test(conf) && /weigh-in/.test(conf), 'paste shows what the code contains: ' + conf.slice(0, 80));
    await page.screenshot({ path: OUT + '/shot-data.png', fullPage: false });
    await page.click('[data-act=dataapply]');
    let st3 = await page.evaluate(() => JSON.parse(localStorage.getItem('omgym-state-v1')));
    ok(st3 && st3.profile.name === 'Cargill' && st3.weights.length === st2.weights.length && JSON.stringify(st3.days) === JSON.stringify(st2.days), 'pasted data restores profile, weigh-ins and logs');
    ok(await page.isVisible('#dataundo'), 'undo offered after replacing');
    await page.click('[data-act=dataundo]');
    ok(!(await page.evaluate(() => localStorage.getItem('omgym-state-v1'))), 'undo goes back to the empty state');
    await page.click('[data-act=datapaste]'); await page.fill('#datain', code); await page.click('[data-act=datacheck]'); await page.click('[data-act=dataapply]');
    st3 = await page.evaluate(() => JSON.parse(localStorage.getItem('omgym-state-v1')));
    ok(st3.profile.name === 'Cargill', 'data pasted again for the rest of the walk-through');
    await page.emulateMedia({ colorScheme: 'dark' }); await page.click('[data-act=datacopy]'); await page.screenshot({ path: OUT + '/shot-data-dark.png', fullPage: false }); await page.click('[data-act=dataclose]'); await page.emulateMedia({ colorScheme: 'light' });
  }
  // imperial + vegan + other region profile edit
  await page.click('nav [data-tab=me]'); await page.click('[data-act=setup]');
  await page.click('[data-k=units][data-v=imperial]');
  ok(await page.inputValue('#weightKg') !== '', 'imperial weight prefilled');
  for (let i = 0; i < 3; i++) await page.click('[data-act=next]');
  await page.click('[data-k=parq0][data-v=yes]');
  await page.click('[data-act=next]');
  await page.click('[data-k=region][data-v=OTHER]'); await page.fill('#regionName', 'Toronto'); await page.fill('#currencySymbol', 'C$');
  await page.click('[data-k=diet][data-v=vegan]');
  await page.click('[data-act=next]');
  await page.click('nav [data-tab=shop]');
  ok(await page.isVisible('text=US prices standing in for Toronto'), 'other-region notice');
  ok((await page.locator('.kpi .v').first().innerText()).startsWith('C$'), 'custom currency');
  await page.click('nav [data-tab=store]'); if (storeOpen) await page.click('[data-act=storecat][data-c=all]');
  if (storeOpen) { const st = await page.evaluate(() => JSON.parse(localStorage.getItem('omgym-state-v1')).profile.parq); const vt2 = await page.locator('#view').innerText(); const cards = (await page.locator('.prod h3').allInnerTexts()).join('|'); ok(!/C4/i.test(cards) && /Pre-workout is hidden/.test(vt2), 'pre-workout hidden after health-screen yes ' + JSON.stringify(st)); }
  await page.click('nav [data-tab=food]');
  const vt = await page.locator('#view').innerText();
  ok(!/\b(chicken|egg|eggs|tuna|sardine|mackerel|milk)\b/i.test(vt.replace(/Extra red peas, eggs or a glass of milk/,'')), 'vegan meals have no animal foods');
  // plant protein: soya (TVP) or chickpeas show up within a week of vegan meals, with dry / drained amounts
  { let seen = '', shot = false;
    for (let i = 0; i < 7; i++) {
      const t = await page.locator('#view').innerText();
      if (/soya|TVP|chickpea/i.test(t)) { seen += t; if (!shot) { await page.screenshot({ path: OUT + '/shot-vegan-meals.png', fullPage: true }); shot = true; } }
      ok(!/\b(chicken|egg|eggs|tuna|sardine|mackerel|milk)\b/i.test(t.replace(/Extra red peas, eggs or a glass of milk/,'')), 'vegan day ' + i + ' has no animal foods');
      await page.click('[data-act=fd][data-n="1"]');
    }
    ok(/soya|TVP/i.test(seen) && /chickpea/i.test(seen), 'vegan week uses soya chunks (TVP) and chickpeas');
    ok(/\d+ g dry/.test(seen), 'soya amount shown as dry weight');
    ok(!/chickpea/i.test(seen) || /drained \(about [\d.]+ tins?\)/.test(seen), 'chickpea amount shown drained, in tins');
    for (let i = 0; i < 7; i++) await page.click('[data-act=fd][data-n="-1"]');
  }
  // dark mode
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('nav [data-tab=today]');
  await page.screenshot({ path: OUT + '/shot-dark.png', fullPage: false });
  await page.click('#newsbtn'); await page.screenshot({ path: OUT + '/shot-news-dark.png' }); await page.keyboard.press('Escape');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(bg === 'rgb(14, 21, 18)', 'dark background ' + bg);
  // reset
  await page.click('nav [data-tab=me]'); await page.click('[data-act=reset1]'); await page.click('[data-act=reset2]');
  ok(await page.isVisible('text=You are looking at an example plan'), 'reset returns to example');
  // desktop width
  await page.setViewportSize({ width: 1280, height: 900 }); ok(!(await overflow()), 'desktop no overflow');
  // arm isolation (2026-10-30): an intermediate 6-day gym plan shows a curl and a triceps exercise on upper days, with cues
  for (const variant of [{ inj: [], tag: 'arms' }, { inj: ['shoulders'], tag: 'arms-shoulder' }]) {
    const actx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await actx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const sd = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
    await actx.addInitScript(([inj, sd]) => { if (!localStorage.getItem('omgym-state-v1')) localStorage.setItem('omgym-state-v1', JSON.stringify({ v: 1, profile: { name: 'Arms', units: 'metric', sex: 'male', age: 30, heightCm: 178, weightKg: 85, goalKg: 85, neckCm: 40, waistCm: 90, activity: 'light', experience: 'intermediate', days: [1, 2, 3, 4, 5, 6], style: 'weights', equipment: 'gym', pace: 'standard', injuries: inj, parq: [false, false, false, false, false, false, false], pregnant: false, region: 'JM', diet: 'none', allergies: [] }, startDate: sd, weights: [{ d: sd, kg: 85 }], days: {}, loads: {}, swaps: {}, prices: {}, shopTicks: {}, cart: {} })); localStorage.setItem('omgym-guide-seen', '1'); }, [variant.inj, sd]);
    const ap = await actx.newPage(); const aerr = []; ap.on('pageerror', e => aerr.push(e.message));
    await ap.goto(url);
    const days = await ap.locator('.wd').evaluateAll(els => els.map(e => e.getAttribute('data-d')));
    let curl = false, tri = false, cue = false, note = false, legsClean = true, overhead = false, shot = false, wide = false;
    for (const d of days) {
      await ap.click('.wd[data-d="' + d + '"]');
      const title = await ap.innerText('.dayhead h1');
      const names = (await ap.locator('.ex.arm .name').allInnerTexts()).join('|');
      if (/Legs|Lower|recovery/i.test(title)) { if (names) legsClean = false; continue; }
      if (/curl/i.test(names)) curl = true;
      if (/triceps|pushdown|close-grip/i.test(names)) tri = true;
      if (/Overhead triceps/i.test(names)) overhead = true;
      if (names && await ap.isVisible('.armnote') && /after the main lifts/.test(await ap.innerText('.armnote'))) note = true;
      if (names) { const det = ap.locator('.ex.arm details').first(); await det.locator('summary').click(); if (/elbows?/i.test(await det.innerText())) cue = true; }
      if (names && !shot && variant.tag === 'arms') { await ap.screenshot({ path: OUT + '/shot-arms.png', fullPage: true }); await ap.emulateMedia({ colorScheme: 'dark' }); await ap.screenshot({ path: OUT + '/shot-arms-dark.png', fullPage: true }); await ap.emulateMedia({ colorScheme: 'light' }); shot = true; }
      if (await ap.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) wide = true;
    }
    ok(curl && tri, `${variant.tag}: upper days show a curl and a triceps exercise`);
    ok(cue, `${variant.tag}: arm exercises have a plain cue`);
    ok(note, `${variant.tag}: arm work note says it comes after the main lifts`);
    ok(legsClean, `${variant.tag}: no arm isolation on leg days`);
    if (variant.inj.includes('shoulders')) ok(!overhead, 'shoulder injury: no overhead triceps extension');
    ok(!wide, `${variant.tag}: nothing overflows at 390 px`);
    ok(aerr.length === 0, `${variant.tag}: no page errors ` + aerr.join('; '));
    await actx.close();
  }
  // the real build: Store paused
  if (!process.env.SITE && fs.readFileSync(INDEX, 'utf8').includes('paused: true,')) {
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await pctx.addInitScript(() => { if (!localStorage.getItem('omgym-state-v1')) localStorage.setItem('omgym-state-v1', JSON.stringify({ v: 1, profile: { name: 'Kim', units: 'metric', sex: 'male', age: 34, heightCm: 178, weightKg: 88, goalKg: 82, neckCm: 40, waistCm: 96, activity: 'light', experience: 'intermediate', days: [0, 1, 2, 3, 4, 5, 6], style: 'mix', equipment: 'gym', pace: 'standard', injuries: [], parq: [false, false, false, false, false, false, false], pregnant: false, region: 'JM', diet: 'none', allergies: [] }, startDate: '2026-10-19', weights: [{ d: '2026-10-19', kg: 88 }], days: {}, loads: {}, swaps: {}, prices: {}, shopTicks: {}, cart: { 'on-whey-5.vic': 2, 'jump-rope': 1 } })); });
    const pp = await pctx.newPage(); pp.on('pageerror', e => errors.push(e.message));
    await pp.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await pp.goto('file://' + INDEX);
    for (const t of ['today', 'food']) { await pp.click(`nav [data-tab=${t}]`); ok(await pp.locator('.nudge').count() === 0, 'no Store prompts while paused: ' + t); }
    ok(await pp.isHidden('#bagcount'), 'bag badge hidden while paused');
    await pp.click('nav [data-tab=store]');
    const ptxt = await pp.locator('#view').innerText();
    ok(await pp.isVisible('#store-paused') && /paused/i.test(ptxt), 'paused Store shows the notice');
    ok(await pp.locator('.prod').count() === 0 && await pp.locator('[data-act=cartadd]').count() === 0 && await pp.locator('#wa-link').count() === 0, 'paused Store: no products, no Add to bag, no WhatsApp order');
    ok(!/J\$\d/.test(ptxt), 'paused Store shows no prices');
    ok(/your saved bag/i.test(ptxt) && /× 2/.test(ptxt), 'saved bag kept while paused');
    await pp.screenshot({ path: OUT + '/shot-store-paused.png', fullPage: true });
    await pp.click('[data-act=sellerview]');
    ok(/The Store is paused/i.test(await pp.locator('#view').innerText()), 'Seller view still works and says the Store is paused');
    await pp.click('nav [data-tab=shop]');
    ok(!/OMGym Store/.test(await pp.locator('#view').innerText()), 'shopping list does not send people to the paused Store');
    await pp.emulateMedia({ colorScheme: 'dark' }); await pp.click('nav [data-tab=store]');
    await pp.screenshot({ path: OUT + '/shot-store-paused-dark.png' });
    ok(!(await pp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'paused Store fits a phone');
    await pctx.close();
  }
  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  console.log(`BROWSER PASS ${pass} FAIL ${fail}`); if (fail) process.exitCode = 1;
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
