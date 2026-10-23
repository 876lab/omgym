(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var TODAY = OM.ymd(new Date());
  var db = null, key = null, log = [], form = null, result = null, error = '', reissue = null, ready = false;
  function nice(d) { return d ? OM.niceDay(d) : ''; }
  function jmdFmt(v) { return 'J$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function blankForm(p) {
    p = p || {};
    var start = p.start || TODAY;
    return { name: p.name || '', id: p.id || '', no: p.no || '', start: start, months: 1, method: p.method || 'bns', jmd: OM.proJmd(OM.PRO.priceUsd, OM.PRO.boj.rate).toFixed(2), usd: OM.PRO.priceUsd.toFixed(2), paid: TODAY, checked: false, parsed: !!p.id };
  }
  function render() {
    var h = '';
    if (!ready) { $('#desk').innerHTML = '<section class="card"><p class="muted">Loading…</p></section>'; return; }
    if (!db) { $('#desk').innerHTML = '<section class="card"><div class="flag bad">This page needs its private storage, which only opens in Claude for the owner. Open it from your Claude account.</div></section>'; return; }
    if (!key) { $('#desk').innerHTML = '<section class="card"><div class="flag bad">The signing key isn\'t here. Only the owner can use the PRO Desk. If you are the owner, ask Claude to set the key up again.</div></section>'; return; }
    // totals
    var month = TODAY.slice(0, 7), thisMonth = log.filter(function (e) { return (e.paid || '').slice(0, 7) === month && !e.reissueOf; });
    var usd = thisMonth.reduce(function (a, e) { return a + Number(e.usd || 0); }, 0), jmd = thisMonth.reduce(function (a, e) { return a + Number(e.jmd || 0); }, 0);
    var live = log.filter(function (e) { return !e.reissueOf && e.until >= TODAY; });
    h += '<section class="kpis"><div class="kpi"><div class="v num">' + live.length + '</div><div class="small muted">active PRO members</div></div><div class="kpi"><div class="v num">US$' + usd.toFixed(2) + '</div><div class="small muted">confirmed this month</div></div><div class="kpi"><div class="v num">' + 'J$' + Math.round(jmd).toLocaleString('en-US') + '</div><div class="small muted">J$ received this month</div></div></section>';
    // confirm a payment
    h += '<section class="card"><h3>Confirm a payment</h3><label class="f"><span>Paste the customer\'s WhatsApp message</span><textarea id="paste" placeholder="OMGym PRO payment&#10;Name: …&#10;Ref: OMPRO.…"></textarea></label><div class="row"><button class="btn" data-act="read">Read message</button><button class="btn ghost" data-act="manual">Type it in instead</button></div>';
    if (error) h += '<div class="flag warn">' + esc(error) + '</div>';
    if (form) {
      var f = form, until = OM.addMonths(f.start, f.months);
      h += '<div class="grid2"><label class="f"><span>Name</span><input type="text" id="f-name" value="' + esc(f.name) + '"></label><label class="f"><span>PRO ID (6 letters/numbers)</span><input type="text" id="f-id" value="' + esc(f.id) + '" maxlength="6" autocapitalize="characters"></label>';
      h += '<label class="f"><span>Invoice</span><input type="text" id="f-no" value="' + esc(f.no) + '"></label><label class="f"><span>PRO starts</span><input type="date" id="f-start" value="' + esc(f.start) + '"></label>';
      h += '<label class="f"><span>Months paid</span><select id="f-months">' + [1, 2, 3, 6, 12].map(function (m) { return '<option value="' + m + '"' + (m === f.months ? ' selected' : '') + '>' + m + ' (US$' + (m * OM.PRO.priceUsd) + ')</option>'; }).join('') + '</select></label><label class="f"><span>Paid by</span><select id="f-method">' + Object.keys(OM.PRO_METHODS).map(function (m) { return '<option value="' + m + '"' + (m === f.method ? ' selected' : '') + '>' + OM.PRO_METHODS[m] + '</option>'; }).join('') + '</select></label>';
      if (f.method === 'bns') h += '<label class="f"><span>J$ received</span><input type="number" step="0.01" id="f-jmd" value="' + esc(f.jmd) + '"><span class="small muted">Expected ' + jmdFmt(OM.proJmd(OM.PRO.priceUsd * f.months, OM.PRO.boj.rate)) + ' at J$' + OM.PRO.boj.rate + ' (' + nice(OM.PRO.boj.date) + '). The rate on their payment day may differ slightly.</span></label>';
      h += '<label class="f"><span>Payment date</span><input type="date" id="f-paid" value="' + esc(f.paid) + '"></label></div>';
      h += '<p class="small">PRO runs <strong>' + nice(f.start) + '</strong> to <strong>' + nice(until) + '</strong>.</p>';
      h += '<label class="tick small"><input type="checkbox" id="f-check"' + (f.checked ? ' checked' : '') + '> I checked my ' + (f.method === 'pp' ? 'PayPal' : f.method === 'cash' ? 'cash' : 'Scotiabank account') + ' and the money is there.</label>';
      h += '<div class="row"><button class="btn" data-act="sign"' + (f.checked ? '' : ' disabled') + '>Make unlock link</button><button class="btn ghost" data-act="clear">Clear</button></div>';
    }
    if (result) h += resultHtml(result);
    h += '</section>';
    // reissue
    if (reissue) {
      h += '<section class="card"><h3>Send to a new phone</h3><p class="small">' + esc(reissue.name) + ', ' + esc(reissue.no) + ', until ' + nice(reissue.until) + '. Ask the customer for the PRO ID shown at the bottom of their PRO screen.</p><label class="f"><span>New PRO ID</span><input type="text" id="r-id" maxlength="6" autocapitalize="characters"></label><div class="row"><button class="btn" data-act="doreissue">Make new link</button><button class="btn ghost" data-act="noreissue">Cancel</button></div></section>';
    }
    // ending soon
    var soon = live.filter(function (e) { return OM.dayNum(e.until) - OM.dayNum(TODAY) <= 7; });
    if (soon.length) h += '<section class="card"><h3>Ending this week</h3>' + soon.map(function (e) { return '<div class="entry"><span><strong>' + esc(e.name) + '</strong> <span class="small muted">' + esc(e.id) + '</span><br><span class="small">Ends ' + nice(e.until) + '</span></span><button class="btn ghost" data-act="remind" data-no="' + esc(e.no) + '">Copy reminder</button></div>'; }).join('') + '</section>';
    // log
    h += '<section class="card"><h3>Payments</h3>' + (log.length ? log.map(function (e) {
      var st = e.until < TODAY ? '<span class="pill">Ended</span>' : OM.dayNum(e.until) - OM.dayNum(TODAY) <= 7 ? '<span class="pill soon">Ends soon</span>' : '<span class="pill live">Active</span>';
      return '<div class="entry"><span><strong>' + esc(e.name || '—') + '</strong> <span class="small muted num">' + esc(e.id) + '</span>' + (e.reissueOf ? ' <span class="pill">New phone</span>' : '') + '<br><span class="small num">' + esc(e.no) + ' · ' + nice(e.start) + ' to ' + nice(e.until) + '</span><br><span class="small muted">' + esc(OM.PRO_METHODS[e.method] || e.method) + ' · US$' + esc(e.usd) + (e.jmd ? ' · ' + jmdFmt(e.jmd) : '') + ' · paid ' + nice(e.paid) + '</span></span><span class="row" style="flex-direction:column;align-items:flex-end">' + st + '<button class="btn ghost" data-act="again" data-key="' + esc(e.key) + '">Copy link</button>' + (e.reissueOf ? '' : '<button class="btn ghost" data-act="reissue" data-key="' + esc(e.key) + '">New phone</button>') + '</span></div>';
    }).join('') : '<p class="small muted">No payments confirmed yet. They will appear here, saved privately to your account.</p>') + '</section>';
    h += '<p class="small muted">Only you can open this page and its records. The signing key never leaves your private storage. Delete payment screenshots from WhatsApp once a payment is confirmed.</p>';
    $('#desk').innerHTML = h;
  }
  function unlockMessage(e) {
    return 'Hi ' + (e.name || 'there') + ', your OMGym PRO payment is confirmed. Thank you!\nReceipt ' + e.no + ': US$' + e.usd + ' paid by ' + (OM.PRO_METHODS[e.method] || e.method) + ', confirmed ' + nice(e.paid) + '.\nPRO is active until ' + nice(e.until) + '.\n\nTo unlock: open OMGym from your Home Screen, tap PRO, and paste this link under "Already paid?". If you use OMGym in your browser, just tap it.\n' + e.link;
  }
  function resultHtml(e) {
    var msg = unlockMessage(e);
    return '<div class="flag ok">Unlock link made for ' + esc(e.name) + ' (PRO ID ' + esc(e.id) + '), until ' + nice(e.until) + '. Saved to your payments.</div><div class="out" id="msgout">' + esc(msg) + '</div><div class="row"><button class="btn" data-act="copymsg">Copy message</button><a class="btn ghost" href="https://wa.me/?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener">Open in WhatsApp</a></div>';
  }
  function copy(text, okMsg) {
    try { navigator.clipboard.writeText(text).then(function () { flash(okMsg); }, function () { flash('Select the text and copy it'); }); } catch (e) { flash('Select the text and copy it'); }
  }
  function flash(t) { var k = $('#keystate'); if (k) { k.textContent = t; setTimeout(function () { k.textContent = key ? 'Signing key ready' : ''; }, 2500); } }
  function readForm() {
    if (!form) return;
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : undefined; };
    form.name = (g('f-name') || '').trim(); form.id = (g('f-id') || '').trim().toUpperCase(); form.no = (g('f-no') || '').trim();
    form.start = g('f-start') || form.start; form.months = Number(g('f-months') || form.months); form.method = g('f-method') || form.method;
    if (g('f-jmd') !== undefined) form.jmd = g('f-jmd'); form.paid = g('f-paid') || form.paid;
    var c = document.getElementById('f-check'); form.checked = !!(c && c.checked);
  }
  function sign(fields) {
    return OM.proSign(fields, key).then(function (sig) { return OM.proLink(fields, sig); });
  }
  function makeEntry(f, link, extra) {
    var e = { key: f.inv + (extra && extra.reissueOf ? '~' + f.id : ''), name: f.n, id: f.id, no: f.inv, start: OM.expandDate(f.s), until: OM.expandDate(f.u), method: f.m, usd: f.amt, paid: OM.expandDate(f.pd), link: link, created: new Date().toISOString() };
    return Object.assign(e, extra || {});
  }
  function saveEntry(e) {
    var docId = e.key.replace(/[^A-Za-z0-9_\-.~:@+]/g, '-');
    return db.collection('log').doc(docId).set(e).catch(function (er) { error = 'Saved the link but could not save it to your payments (' + (er && er.code || 'error') + '). Copy the message now.'; render(); });
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act]'); if (!t) return;
    var a = t.dataset.act;
    if (a === 'read') {
      var p = OM.parseProof(($('#paste') || {}).value || '');
      error = p ? '' : 'I couldn\'t find the "Ref: OMPRO…" line. Paste the whole message, or type the details in.';
      form = p ? blankForm(p) : form; if (p) form.parsed = true; result = null; render();
    } else if (a === 'manual') { form = blankForm(); error = ''; result = null; render(); }
    else if (a === 'clear') { form = null; result = null; error = ''; render(); }
    else if (a === 'sign') {
      readForm();
      if (!/^[A-Z2-9]{6}$/.test(form.id)) { error = 'The PRO ID must be 6 letters or numbers (no 0, 1, I or O).'; render(); return; }
      if (!form.no) form.no = OM.invoiceNo(form.id, form.start, 1);
      if (!form.checked) { error = 'Tick the box once you have checked the money is there.'; render(); return; }
      var until = OM.addMonths(form.start, form.months);
      var f = { id: form.id, s: OM.compactDate(form.start), u: OM.compactDate(until), inv: form.no, n: form.name, m: form.method, amt: (OM.PRO.priceUsd * form.months).toFixed(2), cur: 'USD', pd: OM.compactDate(form.paid) };
      t.disabled = true;
      sign(f).then(function (link) {
        var e = makeEntry(f, link, { jmd: form.method === 'bns' ? Number(form.jmd || 0) : 0 });
        result = e; form = null; error = ''; saveEntry(e); render();
      }).catch(function () { error = 'Signing failed. Reload the page and try again.'; render(); });
    } else if (a === 'copymsg') { copy(unlockMessage(result), 'Message copied'); }
    else if (a === 'again') { var e1 = log.filter(function (x) { return x.key === t.dataset.key; })[0]; if (e1) copy(unlockMessage(e1), 'Message copied'); }
    else if (a === 'remind') { var e2 = log.filter(function (x) { return x.no === t.dataset.no; })[0]; if (e2) copy('Hi ' + (e2.name || 'there') + ', your OMGym PRO ends on ' + nice(e2.until) + '. To keep it, open OMGym, tap PRO, then Renew PRO, and send your payment proof here. Thanks!', 'Reminder copied'); }
    else if (a === 'reissue') { reissue = log.filter(function (x) { return x.key === t.dataset.key; })[0] || null; render(); }
    else if (a === 'noreissue') { reissue = null; render(); }
    else if (a === 'doreissue') {
      var nid = (($('#r-id') || {}).value || '').trim().toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(nid)) { flash('Enter the 6-character PRO ID'); return; }
      var r = reissue, f2 = { id: nid, s: OM.compactDate(r.start), u: OM.compactDate(r.until), inv: r.no, n: r.name, m: r.method, amt: r.usd, cur: 'USD', pd: OM.compactDate(r.paid) };
      sign(f2).then(function (link) { var e = makeEntry(f2, link, { reissueOf: r.id, jmd: 0 }); result = e; reissue = null; saveEntry(e); render(); window.scrollTo(0, 0); });
    }
  });
  document.addEventListener('change', function (ev) { if (form && ev.target.id && ev.target.id.indexOf('f-') === 0) { readForm(); render(); } });
  render();
  var c = window.claude;
  (c && c.use ? c.use('db') : Promise.resolve(null)).then(function (d) {
    db = d; ready = true;
    if (!db) { render(); return; }
    return db.doc('keys/signing').get().then(function (snap) {
      key = snap.exists ? (snap.data() || {}).jwk : null;
      $('#keystate').textContent = key ? 'Signing key ready' : 'No signing key';
      render();
      db.collection('log').onSnapshot(function (qs) {
        log = qs.docs.map(function (d) { return d.data(); }).sort(function (a, b) { return (b.created || '').localeCompare(a.created || ''); });
        render();
      }, function () { });
    });
  }).catch(function () { ready = true; render(); });
})();
