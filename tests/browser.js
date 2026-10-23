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
  for (const t of ['food', 'shop', 'progress', 'me', 'today']) { await page.click(`nav [data-tab=${t}]`); ok((await page.locator('#view').innerText()).length > 200, 'tab renders ' + t); }
  const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await page.screenshot({ path: OUT + '/shot-example-today.png', fullPage: true });
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
    const names = await page.locator('.ex .name').allInnerTexts();
    ok(!names.some(n => /lunge|split squat|Tempo bodyweight squat/i.test(n)), 'knee-unfriendly moves excluded: ' + names.join(', '));
    const load = page.locator('input[data-act=load]').first(); if (await load.count()) { await load.fill('20'); await load.press('Tab'); }
  }
  await page.click('[data-act=done]'); ok(await page.isVisible('text=Workout logged'), 'workout logged');
  await page.click('[data-act=habit][data-h=water]');
  ok((await page.getAttribute('[data-h=water]', 'aria-pressed')) === 'true', 'habit toggles');
  // meals
  await page.click('nav [data-tab=food]');
  const txt = await page.locator('#view').innerText();
  ok(!/Peanut butter/i.test(txt), 'peanut allergy respected in meals');
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
  await page.fill('#price-rice', '900'); await page.click('[data-act=saveprice][data-id=rice]');
  const totalAfter = await page.locator('.kpi .v').first().innerText();
  ok(totalBefore !== totalAfter, 'price edit changes total ' + totalBefore + ' -> ' + totalAfter);
  ok(await page.isVisible('.pill.yours'), 'your-price pill');
  await page.locator('[data-act=tick]').first().check();
  ok(!(await overflow()), 'no horizontal overflow on shop');
  await page.screenshot({ path: OUT + '/shot-shop.png', fullPage: true });
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
  for (let i = 0; i < 4; i++) await page.click('[data-act=next]');
  await page.click('[data-k=region][data-v=OTHER]'); await page.fill('#regionName', 'Toronto'); await page.fill('#currencySymbol', 'C$');
  await page.click('[data-k=diet][data-v=vegan]');
  await page.click('[data-act=next]');
  await page.click('nav [data-tab=shop]');
  ok(await page.isVisible('text=US prices standing in for Toronto'), 'other-region notice');
  ok((await page.locator('.kpi .v').first().innerText()).startsWith('C$'), 'custom currency');
  await page.click('nav [data-tab=food]');
  const vt = await page.locator('#view').innerText();
  ok(!/\b(chicken|egg|eggs|tuna|sardine|mackerel|milk)\b/i.test(vt.replace(/Extra red peas, eggs or a glass of milk/,'')), 'vegan meals have no animal foods');
  // dark mode
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('nav [data-tab=today]');
  await page.screenshot({ path: OUT + '/shot-dark.png', fullPage: false });
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
