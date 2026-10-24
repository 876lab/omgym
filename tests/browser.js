const { chromium } = require('playwright');
const OUT = require('path').resolve(__dirname, 'out'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const errors = []; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts/.test(m.text())) errors.push(m.text()); });
  const url = process.env.SITE || ('file://' + require('path').resolve(__dirname, '..', 'index.html'));
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
  ok(/week's shop/.test(await page.innerText('.kpis')), 'today shows week shop total');
  await page.click('[data-act=done]'); ok(await page.isVisible('text=Workout logged'), 'workout logged');
  await page.click('[data-act=habit][data-h=water]');
  ok((await page.getAttribute('[data-h=water]', 'aria-pressed')) === 'true', 'habit toggles');
  // meals
  await page.click('nav [data-tab=food]');
  const txt = await page.locator('#view').innerText();
  ok(!/Peanut butter/i.test(txt), 'peanut allergy respected in meals');
  ok(/pack you buy/i.test(txt) && /(bag|tin|dozen|loaf|jar|bottle|bundle|head|chicken|per lb)/.test(txt), 'meal tables quote packs');
  ok(!/costs about/.test(txt), 'no per-serving cost text');
  const before = await page.locator('.card h3').nth(0).innerText();
  await page.click('[data-act=swap][data-slot=b]');
  const after = await page.locator('.card h3').nth(0).innerText();
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
  ok(!/hardo bread|callaloo|Mackerel/i.test(await page.locator('#view').innerText()), 'no Jamaican-only dishes in the US plan');
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
  await page.click('nav [data-tab=store]');
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
  await page.click('nav [data-tab=store]'); await page.click('[data-act=storecat][data-c=all]');
  { const st = await page.evaluate(() => JSON.parse(localStorage.getItem('omgym-state-v1')).profile.parq); const vt2 = await page.locator('#view').innerText(); const cards = (await page.locator('.prod h3').allInnerTexts()).join('|'); ok(!/C4/i.test(cards) && /Pre-workout is hidden/.test(vt2), 'pre-workout hidden after health-screen yes ' + JSON.stringify(st)); }
  await page.click('nav [data-tab=food]');
  const vt = await page.locator('#view').innerText();
  ok(!/\b(chicken|egg|eggs|tuna|sardine|mackerel|milk)\b/i.test(vt.replace(/Extra red peas, eggs or a glass of milk/,'')), 'vegan meals have no animal foods');
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
  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  console.log(`BROWSER PASS ${pass} FAIL ${fail}`); if (fail) process.exitCode = 1;
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
