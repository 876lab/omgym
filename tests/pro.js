// PRO end to end: invoice, proof, early access, signed unlock, receipt, pasted links, and the owner's PRO Desk.
// Uses a throwaway test key: a copy of the app is made with the test public key swapped in.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const OUT = path.resolve(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(__dirname, '..');
const OM = require(path.join(ROOT, 'src/core.js'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
(async () => {
  const sb = globalThis.crypto.subtle;
  const kp = await sb.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await sb.exportKey('jwk', kp.privateKey), pub = await sb.exportKey('jwk', kp.publicKey);
  const pubStr = JSON.stringify({ kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y });
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/publicKey: \{[^}]*\},/, 'publicKey: ' + pubStr + ',');
  ok(html.includes(pub.x), 'test copy uses the test key');
  const testPage = path.join(OUT, 'index-pro.html'); fs.writeFileSync(testPage, html);
  // Serve the copy over http://127.0.0.1: file:// pages can get fresh, empty storage after a navigation,
  // which made this test flaky. A real origin keeps localStorage like the live site does.
  const server = require('http').createServer((req, res) => {
    const f = path.join(OUT, decodeURIComponent(req.url.split(/[?#]/)[0]).replace(/^\/+/, '') || 'index-pro.html');
    if (!f.startsWith(OUT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/index-pro.html';
  const errors = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // today is always a training day, so the Today check below works on any day of the week
  const profile = { name: 'Kim', units: 'metric', sex: 'male', age: 34, heightCm: 178, weightKg: 88, goalKg: 82, neckCm: 40, waistCm: 96, activity: 'light', experience: 'advanced', days: [1, 2, 4, 5].includes(new Date().getDay()) ? [1, 2, 4, 5] : [1, 2, 4, new Date().getDay()], style: 'weights', equipment: 'gym', pace: 'standard', injuries: [], parq: [false, false, false, false, false, false, false], pregnant: false, region: 'JM', diet: 'none', allergies: [] };
  await ctx.addInitScript(p => { if (!localStorage.getItem('omgym-state-v1')) localStorage.setItem('omgym-state-v1', JSON.stringify({ v: 1, profile: p, startDate: '2026-10-19', weights: [{ d: '2026-10-19', kg: 88 }], days: {}, loads: {}, swaps: {}, prices: {}, shopTicks: {}, cart: {} })); }, profile);
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + '#pro');
  await page.waitForSelector('text=What you get');
  ok(await page.isVisible('#probtn') && !(await page.getAttribute('#probtn', 'class')).includes('on'), 'PRO button in header, locked');
  const proId = (await page.locator('text=Your PRO ID on this phone').innerText()).match(/([A-Z2-9]{6})/)[1];
  ok(/^[A-Z2-9]{6}$/.test(proId), 'phone has a PRO ID ' + proId);
  // invoice needs the 3+ years box
  await page.fill('#pro-name', 'Kim Brown');
  await page.click('[data-act=pronew]');
  ok(!(await page.isVisible('#invoice')), 'invoice needs the 3+ years confirmation');
  await page.check('#pro-years'); await page.click('[data-act=pronew]');
  const invTxt = await page.locator('#invoice').innerText();
  ok(/90605 000606999/.test(invTxt) && /CARGILL BROWN/.test(invTxt) && /Scotiabank/.test(invTxt) && new RegExp('J\\$' + (Math.round(10 * OM.PRO.boj.rate * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('.', '\\.')).test(invTxt) && /US\$10\.00/.test(invTxt), 'invoice: Scotiabank details, J$ at BOJ rate, US$10');
  ok(!/GCT|tax/i.test(invTxt.replace(/Terms[\s\S]*/, '')), 'no tax lines on the invoice');
  ok(/Cargill\.brown@gmail\.com/.test(invTxt), 'PayPal address on the invoice');
  const invNo = invTxt.match(/PRO-\d{4}-[A-Z2-9]{6}-\d+/)[0];
  ok(invNo.includes(proId), 'invoice number includes the PRO ID');
  // proof on WhatsApp starts early access
  const href = await page.getAttribute('#pro-proof', 'href');
  const proofMsg = decodeURIComponent(href.split('?text=')[1]);
  ok(href.startsWith('https://wa.me/16582184432?text=') && proofMsg.includes('Ref: OMPRO.' + proId) && proofMsg.includes('Kim Brown'), 'proof message to the owner on WhatsApp');
  const [popup] = await Promise.all([ctx.waitForEvent('page').catch(() => null), page.click('#pro-proof')]);
  if (popup) await popup.close();
  await page.waitForTimeout(400);
  ok(/PRO is open while OMGym checks your payment/i.test(await page.locator('#view').innerText()), 'early access opens straight away');
  ok((await page.getAttribute('#probtn', 'class')).includes('on'), 'PRO button lit');
  await page.click('[data-act=prophase][data-ph=cut]');
  ok(/Hard sets this week/i.test(await page.locator('#view').innerText()), 'PRO plan shows weekly sets');
  const kcalPro = await page.locator('.stat .v').first().innerText();
  await page.click('nav [data-tab=today]');
  ok(/PRO Cut/i.test(await page.locator('#view').innerText()), 'Today shows PRO Cut');
  await page.click('nav [data-tab=food]'); let topSeen = false;
  for (let i = 0; i < 4 && !topSeen; i++) { topSeen = /PRO top-up/.test(await page.locator('#view').innerText()); if (!topSeen) await page.click('[data-act=fd][data-n="1"]'); }
  ok(topSeen, 'PRO meals include a protein top-up');
  await page.click('nav [data-tab=today]');
  // owner signs the unlock (what the PRO Desk does) and the customer opens the link
  const parsed = OM.parseProof(proofMsg);
  const f = { id: parsed.id, s: OM.compactDate(parsed.start), u: OM.compactDate(parsed.until), inv: parsed.no, n: parsed.name, m: 'bns', amt: '10.00', cur: 'USD', pd: OM.compactDate(parsed.start) };
  const link = OM.proLink(f, await OM.proSign(f, priv));
  await page.goto(url + '?' + link.split('?')[1]);
  await page.waitForSelector('text=PRO is unlocked until');
  const v1 = await page.locator('#view').innerText();
  ok(/PRO is active/i.test(v1) && /Receipt/i.test(v1) && /Total paid/i.test(v1) && /Paid by Scotiabank transfer/i.test(v1), 'unlock link: PRO active and receipt shown');
  ok(!(await page.evaluate(() => location.search)), 'link removed from the address bar after unlocking');
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'PRO screen fits a phone');
  await page.screenshot({ path: OUT + '/shot-pro.png', fullPage: true });
  await page.reload(); await page.waitForTimeout(300);
  await page.click('#probtn');
  ok(/PRO is active/i.test(await page.locator('#view').innerText()), 'PRO stays unlocked after reload (signature re-checked)');
  // tampered link
  await page.goto(url + '?' + link.split('?')[1].replace(/u=\d+/, 'u=20301123'));
  await page.waitForTimeout(400);
  ok(/changed or is damaged/i.test(await page.locator('#view').innerText()), 'edited link rejected');
  // stored unlock edited in storage is ignored
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('omgym-pro')); d.unlocks.forEach(u => u.u = '20301231'); localStorage.setItem('omgym-pro', JSON.stringify(d)); });
  await page.goto(url + '#pro'); await page.waitForTimeout(400);
  ok(!/PRO is active until/.test(await page.locator('#view').innerText()) || /PRO is open/.test(await page.locator('#view').innerText()) === false, 'editing storage does not extend PRO');
  // Home Screen app: a different phone ID, link pasted
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p2 = await ctx2.newPage();
  await p2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p2.goto(url + '?' + link.split('?')[1]); await p2.waitForTimeout(400);
  const v2 = await p2.locator('#view').innerText();
  ok(/This link is for PRO ID/i.test(v2) && /paste this link/i.test(v2), 'link opened in the wrong app explains what to do');
  await p2.goto(url + '#pro'); await p2.waitForTimeout(300);
  await p2.fill('#pro-paste', link); await p2.click('[data-act=propaste]'); await p2.waitForTimeout(300);
  ok(/This link is for PRO ID/i.test(await p2.locator('#view').innerText()), 'pasting another phone\'s link is refused');
  const id2 = (await p2.locator('text=Your PRO ID on this phone').innerText()).match(/([A-Z2-9]{6})/)[1];
  const f2 = { ...f, id: id2 }, link2 = OM.proLink(f2, await OM.proSign(f2, priv));
  await p2.fill('#pro-paste', link2); await p2.click('[data-act=propaste]'); await p2.waitForTimeout(400);
  ok(/PRO is active/i.test(await p2.locator('#view').innerText()), 'pasted link for this phone unlocks PRO');
  await ctx2.close();
  // the owner's PRO Desk with a stand-in for Claude's private storage
  const deskHtml = fs.readFileSync(path.join(ROOT, 'dist/pro-desk.html'), 'utf8').replace(/publicKey: \{[^}]*\},/, 'publicKey: ' + pubStr + ',');
  const deskFile = path.join(OUT, 'pro-desk-test.html'); fs.writeFileSync(deskFile, deskHtml);
  const dctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await dctx.addInitScript(k => {
    const store = { 'keys/signing': { jwk: k } }, subs = [];
    const snap = (id, d) => ({ id, exists: !!d, data: () => d });
    const col = path => ({
      doc: id => ({ set: d => { store[path + '/' + id] = d; subs.forEach(s => s()); return Promise.resolve(); } }),
      onSnapshot: next => { const run = () => next({ docs: Object.keys(store).filter(k => k.startsWith(path + '/')).map(k => snap(k, store[k])) }); subs.push(run); run(); return () => {}; }
    });
    window.claude = { use: name => Promise.resolve(name === 'db' ? { doc: p => ({ get: () => Promise.resolve(snap(p, store[p])) }), collection: col } : null) };
    window.__store = store;
  }, priv);
  const desk = await dctx.newPage(); desk.on('pageerror', e => errors.push('desk: ' + e.message));
  await desk.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await desk.goto('file://' + deskFile); await desk.waitForSelector('text=Confirm a payment');
  ok(/Signing key ready/.test(await desk.innerText('#keystate')), 'desk loads the private key');
  await desk.fill('#paste', proofMsg); await desk.click('[data-act=read]');
  ok((await desk.inputValue('#f-id')) === proId && (await desk.inputValue('#f-name')) === 'Kim Brown', 'desk reads the customer message');
  ok(await desk.isDisabled('[data-act=sign]'), 'cannot sign before ticking that the money is there');
  await desk.check('#f-check'); await desk.click('[data-act=sign]'); await desk.waitForSelector('#msgout');
  const out = await desk.innerText('#msgout');
  const dlink = out.split('\n').pop();
  ok(/payment is confirmed/i.test(out) && /Receipt PRO-/i.test(out) && dlink.startsWith('https://876lab.github.io/omgym/?pro=1&'), 'desk writes the unlock message');
  ok(await OM.proVerify(OM.parseProLink(dlink.split('?')[1]), pub), 'desk link verifies');
  ok(/Kim Brown/.test(await desk.locator('.entry').first().innerText()) && (await desk.evaluate(() => Object.keys(window.__store).filter(k => k.startsWith('log/')).length)) === 1, 'payment saved to the log');
  ok(!(await desk.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'desk fits a phone');
  await desk.screenshot({ path: OUT + '/shot-desk.png', fullPage: true });
  // without the key (anyone but the owner)
  const nctx = await browser.newContext(); await nctx.addInitScript(() => { window.claude = { use: () => Promise.resolve({ doc: () => ({ get: () => Promise.resolve({ exists: false, data: () => undefined }) }), collection: () => ({ onSnapshot: () => () => {} }) }) }; });
  const np = await nctx.newPage(); await np.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); await np.goto('file://' + deskFile); await np.waitForTimeout(300);
  ok(/Only the owner can use the PRO Desk/i.test(await np.locator('#desk').innerText()), 'desk is locked without the key');
  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  console.log(`PRO PASS ${pass} FAIL ${fail}`); if (fail) process.exitCode = 1;
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
