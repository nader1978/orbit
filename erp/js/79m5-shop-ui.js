/* ============================================================
   ORBIT ONLINE SHOP — the website's back office, in four departments
   • Distributions → Online Shop (x_shop): orders from the website, products for the web (names EN/AR, photos,
     price incl. VAT, was-price, limits, featured), categories, coupons, report, settings, publish to the website.
   • Warehouse → Online orders (x_shopwh): pick lists, picking with barcode check, packing, release to distribution
     (delivery note; prepaid orders get their e-invoice draft here).
   • Distributions → Web deliveries (x_shopdel): assign driver / vehicle / day / time slot, route sheet, out for delivery,
     delivered (COD collected) or failed; the driver's own phone screen with live location for the customer.
   • Finance → Web payments (x_shoppay): bank transfers to confirm (with the customer's proof), card payments,
     cash collected by drivers, refunds due.
   How it talks to the website (SharePoint only, no server):
     ORBIT → website: files in the SharePoint document library, folder OrbitShop/ — catalog.json, img/…, track/<id>.json
     website → ORBIT: the Power Automate flow writes each message (order, transfer proof, cancel request, card paid)
     as a row of Shop_Inbox; any ORBIT user with a shop page open picks them up (every minute).
   Uses: SAL (sales orders, delivery notes, e-invoice draft), INV (stock on hand), FIN (receipts), EINV (customers,
   e-invoice), SHOP (prices, VAT, checks — the same file the website uses).
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, P = window.SHOP, Q = window.SAL, S = window.FINSTORE, FU = window.FIN_UI, F = window.FIN, E = window.EINV;
  if (!K || !P || !Q || !S || !FU || !F || !E) return;
  const { reg, esc, num, today, str, toast, V, render, cur, H, iso, me, dmy, get } = K, { table, n2, money, printHtml } = FU;
  const A = () => K.A(), lc = P.lc, r2 = P.r2, r3 = P.r3, J = P.J;
  const FOLDER = 'OrbitShop';
  const PAGES = ['x_shop', 'x_shopwh', 'x_shopdel', 'x_shoppay'];
  const SC = s => (P.STATUS[s] || { c: '#64748b', en: s }).c;
  const pill = s => `<span class="mb-pill ei-st" style="--c:${SC(s)}">${esc((P.STATUS[s] || { en: s }).en)}</span>`;
  const payPill = o => `<span class="mb-pill ei-st" style="--c:${o.payStatus === 'paid' || o.payStatus === 'collected' ? '#15803d' : ['mismatch', 'refund'].includes(o.payStatus) ? '#dc2626' : '#b45309'}">${esc(P.PAY[o.payMethod] ? P.PAY[o.payMethod].en : o.payMethod)} · ${esc(P.PAY_STATUS[o.payStatus] || o.payStatus || '')}</span>`;
  const emName = c => (P.EMIRATES[c] || [c])[0];
  const fq = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
  const tm = s => s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const errs = list => list && list.length ? `<div class="mb-hint mb-bad ei-errs">${list.map(e => `<div>${esc(e)}</div>`).join('')}</div>` : '';
  const warns = list => list && list.length ? `<div class="mb-hint" style="color:#b45309">${list.map(e => `<div>⚠ ${esc(e)}</div>`).join('')}</div>` : '';
  const clear = v => Object.keys(v).forEach(k => { if (k !== '__l' && k !== 'tab') delete v[k]; });
  const users = () => (window.APRSTORE ? APRSTORE.userOpts() : []);
  const uname = u => u ? (window.APRSTORE ? APRSTORE.userName(u) : u) : '';

  /* ---------- SharePoint files (the public side of the shop) ---------- */
  async function sp() { if (typeof plSp !== 'function') throw new Error('SharePoint file access is not available'); return plSp(); }
  const enc = p => p.split('/').map(encodeURIComponent).join('/');
  async function putFile(path, body, type) {
    const { siteId, token } = await sp(), r = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${enc(FOLDER + '/' + path)}:/content?@microsoft.graph.conflictBehavior=replace`, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': type || 'application/json' }, body });
    if (!r.ok) { let t = ''; try { t = (await r.json()).error.message; } catch (e) {} throw new Error('Saving ' + path + ' failed (' + r.status + ')' + (t ? ': ' + t : '')); } return r.json().catch(() => ({}));
  }
  const IMGC = new Map();
  async function fileUrl(path) {   /* a SharePoint file → a blob URL to show in ORBIT (signed-in) */
    if (IMGC.has(path)) return IMGC.get(path); const { siteId, token } = await sp(), r = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${enc(FOLDER + '/' + path)}:/content`, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('Not found: ' + path); const u = URL.createObjectURL(await r.blob()); IMGC.set(path, u); return u;
  }
  const b64ToBlob = (b64, type) => { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return new Blob([a], { type }); };
  /* photo → webp in two sizes (1000 px for the page, 420 px for lists) + a tiny preview kept in the list */
  async function photo(file, code) {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error(file.name + ' is not a picture')); i.src = URL.createObjectURL(file); });
    const make = (max, q, type) => new Promise(ok => { const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); type === 'url' ? ok(c.toDataURL('image/jpeg', q)) : c.toBlob(ok, 'image/webp', q); });
    const name = P.slug(code) + '-' + Date.now().toString(36) + '.webp';
    await putFile('img/' + name, await make(1000, 0.82)); await putFile('img/t-' + name, await make(420, 0.8));
    return { f: name, th: await make(96, 0.7, 'url') };
  }

  /* ---------- the flow (website ↔ ORBIT) ---------- */
  async function flow(SET, body) {
    if (!SET.apiUrl) throw new Error('The shop connection (flow address) is not set — Online Shop → Settings');
    const r = await fetch(SET.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
    const t = await r.text(); if (!r.ok) throw new Error('Flow answered ' + r.status + (t ? ': ' + t.slice(0, 160) : '')); try { return JSON.parse(t); } catch (e) { return { text: t }; }
  }

  /* ---------- data ---------- */
  async function shopSet(force) { let rows = []; try { rows = await get('Shop_Settings', null, force); } catch (e) { if (/not found/i.test(e.message)) return { missing: true, s: P.setFromRow(null) }; throw e; } const s = P.setFromRow(rows[0]); s.row = rows[0] || null; return { s }; }
  const L = (n, map, force) => get(n, null, force).then(r => r.map(map));
  async function salSet(force) { let rows = []; try { rows = await get('Sal_Settings', null, force); } catch (e) {} return Q.settingsFromRow(rows[0]); }
  async function bundle(force, want) {
    const w = want || {}, o = {}, j = [], add = (k, p) => j.push(p.then(x => { o[k] = x; }));
    const ss = await shopSet(force); o.set = ss.s; o.missing = !!ss.missing; if (o.missing) return o;
    add('orders', L('Shop_Orders', P.ordFromRow, force).catch(() => [])); add('inbox', L('Shop_Inbox', P.inboxFromRow, force).catch(() => []));
    if (w.cat) { add('prods', L('Shop_Products', P.prodFromRow, force).catch(() => [])); add('cats', L('Shop_Categories', P.catFromRow, force).catch(() => [])); add('cpns', L('Shop_Coupons', P.cpnFromRow, force).catch(() => [])); }
    if (w.stock && window.INVSTORE) { add('items', INVSTORE.items(force).catch(() => [])); add('moves', INVSTORE.moves(force).catch(() => [])); add('whs', INVSTORE.whs(force).catch(() => [])); add('sos', S.list('Sal_Orders', force).then(r => r.map(Q.soFromRow)).catch(() => [])); }
    if (w.fin) add('fin', FU.bundle(force, {}).catch(() => null));
    await Promise.all(j);
    if (w.stock) o.free = freeStock(o, o.set);
    o.orders = (o.orders || []).sort((a, b) => String(b.placedAt).localeCompare(String(a.placedAt)));
    return o;
  }
  /* stock free to sell: on hand (shop warehouse, or all) − held by open sales orders */
  function freeStock(o, set) {
    const pos = window.INV && o.moves ? INV.position(o.moves) : new Map(), res = Q.reserved(o.sos || [], -1), m = new Map();
    (o.items || []).forEach(i => { const p = pos.get(i.code), oh = p ? (set.wh ? num(p.wh[set.wh]) : num(p.qty)) : 0; m.set(i.code, r3(oh - num(res.get(i.code)))); }); return m;
  }
  const loaders = {};
  function screen(key, want, def) {
    loaders[key] = (v, f) => { const d = K.D[key] = K.D[key] || {}; d.busy = 1; if (cur() === key) render(); bundle(f, want).then(b => Object.assign(d, b)).catch(e => { d.err = e.message; }).finally(() => { d.busy = 0; if (cur() === key) render(); }); };
    def.load = (v, f) => { loaders[key](v, f); startPoll(); }; reg(key, def);
  }
  const refresh = k => loaders[k] && loaders[k](V(), true);
  const busy = d => d.busy && !d.orders ? `<div class="mx-ld"><i></i><i></i><i></i> Loading…</div>` : d.err ? `<div class="mb-hint mb-bad">⚠ ${esc(d.err)}</div>` : '';
  const needSetup = d => d.missing ? H.card('', `<div class="mb-hint mb-bad">The online shop is not set up yet.</div>${H.btn('⚙️ Online Shop → Settings', 'toSet')}`) : '';

  /* ---------- order updates (list row + the customer's tracking file + e-mail) ---------- */
  const ordFields = o => ({ Title: o.no, OrderNo: o.no, TrackId: o.trackId, Status: o.status, PlacedAt: o.placedAt, Lang: o.lang, CustomerId: o.customerId, CustomerName: o.customer, Phone: o.phone, Email: o.email, Emirate: o.emirate, Area: o.area,
    PayMethod: o.payMethod, PayStatus: o.payStatus, PayRef: o.payRef, Coupon: o.coupon, SoId: o.soId, SoNo: o.soNo, DnNo: o.dnNo, InvId: o.invId, RcpNo: o.rcpNo, Driver: o.driver, Vehicle: o.vehicle, DeliveryDate: o.deliveryDate, Slot: o.slot, CatVer: o.catVer, Proof: o.proof, Refund: o.refund,
    Net: o.net, Vat: o.vat, Total: o.total, Paid: o.paid, CodCollected: o.codCollected, Parcels: o.parcels, Attempts: o.attempts, Address: JSON.stringify(o.address || {}), LinesJson: JSON.stringify(o.lines || []), Timeline: JSON.stringify((o.timeline || []).slice(-60)), Notes: o.notes || '', Checks: JSON.stringify(o.checks || {}), LastLoc: o.lastLoc ? JSON.stringify(o.lastLoc) : '' });
  async function track(o, set) { if (!o.trackId) return; try { const doc = JSON.stringify(P.trackDoc(o, set)); ghQueue('track/' + o.trackId + '.json', doc); await putFile('track/' + o.trackId + '.json', doc); } catch (e) { console.warn('[shop] tracking file', e.message); } }
  async function save(o, set, ev, opt) {
    opt = opt || {}; if (ev) o.timeline = (o.timeline || []).concat([Object.assign(ev, { by: me() })]);
    if (o.id) await A().upd('Shop_Orders', o.id, ordFields(o)); else o.id = Number((await A().add('Shop_Orders', ordFields(o))).id);
    K.drop('Shop_Orders'); await track(o, set); if (opt.mail) await mailCustomer(o, set, opt.mail); return o;
  }
  /* move an order along its life (checks the step is allowed) */
  async function move(o, to, set, extra) {
    if (o.status !== to && !P.canGo(o.status, to)) throw new Error(o.no + ' is ' + (P.STATUS[o.status] || {}).en + ' — it cannot go to ' + (P.STATUS[to] || {}).en);
    o.status = to; Object.assign(o, extra || {}); const k = P.TL[to] ? to : null;
    return save(o, set, k ? P.tlOf(k) : null, { mail: ['confirmed', 'out_for_delivery', 'delivered', 'cancelled', 'failed'].includes(to) ? to : '' });
  }

  /* ---------- e-mails to the customer (from the signed-in mailbox) ---------- */
  const MAILT = {
    received: ['We received your order {no}', 'استلمنا طلبك {no}', 'Thank you! We are checking your order and will confirm it shortly.', 'شكراً لك! نراجع طلبك وسنؤكده قريباً.'],
    confirmed: ['Your order {no} is confirmed', 'تم تأكيد طلبك {no}', 'Thank you for your order. We are preparing it now.', 'شكراً لطلبك. نقوم بتجهيزه الآن.'],
    awaiting_payment: ['Order {no} — waiting for your payment', 'الطلب {no} — بانتظار الدفع', 'Your order is saved. It will be prepared as soon as your payment reaches us.', 'تم حفظ طلبك وسيتم تجهيزه فور وصول الدفعة.'],
    out_for_delivery: ['Order {no} is on the way', 'طلبك {no} في الطريق', 'Our driver is on the way to you today.', 'سائقنا في الطريق إليك اليوم.'],
    delivered: ['Order {no} delivered — thank you', 'تم تسليم طلبك {no} — شكراً لك', 'Your order was delivered. We hope you enjoy it!', 'تم تسليم طلبك. نتمنى أن ينال إعجابك!'],
    failed: ['We could not deliver order {no}', 'تعذّر توصيل طلبك {no}', 'Our driver could not deliver today. We will contact you to arrange a new time.', 'لم يتمكن السائق من التوصيل اليوم وسنتواصل معك لتحديد موعد جديد.'],
    cancelled: ['Order {no} is cancelled', 'تم إلغاء الطلب {no}', 'Your order was cancelled. If you paid already, we will refund you.', 'تم إلغاء طلبك. إذا كنت قد دفعت فسنعيد لك المبلغ.'] };
  async function mailCustomer(o, set, kind) {
    if (!set.emailCustomer || !o.email || typeof mailSend_send !== 'function' || !MAILT[kind]) return;
    const ar = o.lang === 'ar', t = MAILT[kind], subj = (ar ? t[1] : t[0]).replace('{no}', o.no) + ' · ' + (ar && set.shopNameAr ? set.shopNameAr : set.shopName), link = set.siteUrl ? set.siteUrl.replace(/#.*$/, '').replace(/\/?$/, '/') + '#/track/' + encodeURIComponent(o.no) : '';
    const rows = (o.lines || []).map(l => `<tr><td style="padding:6px 0">${esc(ar && l.descAr ? l.descAr : l.description)}${l.code ? ' × ' + fq(l.qty) : ''}</td><td style="text-align:${ar ? 'left' : 'right'}">${n2(l.amount != null ? l.amount : num(l.net) + num(l.vatAmt))}</td></tr>`).join('');
    const html = `<div dir="${ar ? 'rtl' : 'ltr'}" style="font-family:Segoe UI,Tahoma,Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937"><div style="background:${esc(set.color || '#6d3fd9')};color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><b style="font-size:18px">${esc(ar && set.shopNameAr ? set.shopNameAr : set.shopName)}</b></div>
      <div style="border:1px solid #e5e7eb;border-top:0;padding:22px;border-radius:0 0 12px 12px"><h2 style="margin:0 0 8px;font-size:19px">${esc(subj.split(' · ')[0])}</h2><p>${esc(ar ? t[3] : t[2])}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:14px 0">${rows}<tr><td style="border-top:1px solid #e5e7eb;padding-top:8px"><b>${ar ? 'الإجمالي (شامل الضريبة)' : 'Total (incl. VAT)'}</b></td><td style="border-top:1px solid #e5e7eb;padding-top:8px;text-align:${ar ? 'left' : 'right'}"><b>${esc(set.currency || 'AED')} ${n2(o.total)}</b></td></tr></table>
      ${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:${esc(set.color || '#6d3fd9')};color:#fff;padding:11px 18px;border-radius:9px;text-decoration:none">${ar ? 'تتبّع طلبك' : 'Track your order'}</a></p>` : ''}<p style="color:#6b7280;font-size:12.5px">${ar ? 'رقم الطلب' : 'Order number'}: ${esc(o.no)}${set.phone ? ' · ' + esc(set.phone) : ''}</p></div></div>`;
    try { await mailSend_send({ to: o.email, subject: subj, html, noSave: true }); } catch (e) { console.warn('[shop] e-mail', e.message); }
  }

  /* ---------- customers: one E-Invoicing customer per web buyer (found again by phone or e-mail) ---------- */
  async function customerFor(m) {
    const ph = P.phone(m.customer.phone), em = lc(m.customer.email), accts = (await S.list('Sal_Accounts', true).catch(() => [])).map(Q.acctFromRow), custs = await get('EInv_Customers', null, true).catch(() => []);
    let a = accts.find(x => x.phone && P.phone(x.phone) === ph), c = a ? custs.find(x => String(x.id) === a.customerId) : null;
    if (!c && em) c = custs.find(x => lc(x.email) === em) || null;
    const ad = m.address || {}, f = { Title: str(m.customer.name), Email: em || (c && c.email) || '', AddressLine: [ad.line, ad.building].filter(Boolean).join(', ').slice(0, 250), City: str(ad.area), Emirate: ad.emirate || '', Country: 'AE' };
    if (!c) { const r = await A().add('EInv_Customers', f); c = Object.assign({ id: r.id }, { title: f.Title, email: f.Email }); K.drop('EInv_Customers'); }
    if (!a) { await S.add('Sal_Accounts', { Title: f.Title, CustomerId: String(c.id), CustomerName: f.Title, Phone: ph, Tags: 'web', PayDays: 0, CreditLimit: 0 }); S.drop('Sal_Accounts'); }
    return { id: String(c.id), name: c.title || f.Title };
  }


  /* ---------- straight to the website on GitHub (no flow needed): catalogue, photos, tracking files ----------
     The shop website lives in the same GitHub repository as ORBIT (folder shop/). ORBIT commits its data folder
     (shop/data: catalog.json, img/…, track/<id>.json) with a GitHub token kept ONLY in this browser — never in
     SharePoint or the website. Changes are collected and sent as one commit every few minutes (GitHub Pages
     rebuilds the site about a minute later). Orders still come in by WhatsApp / e-mail until the flow exists. */
  const GHK = (typeof LS_BASE !== 'undefined' ? LS_BASE : 'orbit') + '_shop_github';
  const ghCfg = () => { try { return JSON.parse(localStorage.getItem(GHK) || 'null'); } catch (e) { return null; } };
  const ghSet = c => { try { if (c) localStorage.setItem(GHK, JSON.stringify(c)); else localStorage.removeItem(GHK); } catch (e) {} };
  const ghOn = () => { const c = ghCfg(); return !!(c && c.token && c.owner && c.repo); };
  const GH = { q: new Map(), last: '', at: 0, err: '', busy: false, sentCat: '' };
  async function ghApi(c, method, url, body) {
    const r = await fetch('https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo) + url, { method, headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404 && method === 'GET') return null; const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('GitHub ' + r.status + (j.message ? ': ' + j.message : '') + (r.status === 401 || r.status === 403 ? ' — check the token (Contents: read and write on this repository)' : '')); return j;
  }
  const u8b64 = u => { let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(b); };
  async function spBytes(path) { const { siteId, token } = await sp(), r = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${enc(FOLDER + '/' + path)}:/content`, { headers: { Authorization: 'Bearer ' + token } }); if (!r.ok) throw new Error('Not found: ' + path); return new Uint8Array(await r.arrayBuffer()); }
  async function ghTest(c) { const r = await ghApi(c, 'GET', ''); if (!r) throw new Error('Repository ' + c.owner + '/' + c.repo + ' not found (or the token cannot see it)'); if (r.permissions && !r.permissions.push) throw new Error('The token can read but not write this repository'); const b = await ghApi(c, 'GET', '/branches/' + encodeURIComponent(c.branch || r.default_branch)); if (!b) throw new Error('Branch ' + c.branch + ' not found'); return r.full_name + ' · ' + (c.branch || r.default_branch); }
  /* queue: path inside the data folder → text or a function that fetches the bytes */
  function ghQueue(path, content) { if (ghOn()) GH.q.set(path, content); }
  async function ghFlush(why) {
    const c = ghCfg(); if (!ghOn() || GH.busy || !GH.q.size) return 0; GH.busy = true;
    try { const base = String(c.path || 'shop/data').replace(/^\/+|\/+$/g, ''), branch = c.branch || 'main';
      /* photos already on GitHub are not sent again */
      const imgs = [...GH.q.keys()].filter(k => k.startsWith('img/')); if (imgs.length) { const have = new Set(((await ghApi(c, 'GET', '/contents/' + base.split('/').map(encodeURIComponent).join('/') + '/img?ref=' + encodeURIComponent(branch))) || []).map(f => 'img/' + f.name)); imgs.forEach(k => { if (have.has(k)) GH.q.delete(k); }); }
      const items = [...GH.q.entries()]; if (!items.length) return 0;
      const ref = await ghApi(c, 'GET', '/git/ref/heads/' + encodeURIComponent(branch)); if (!ref) throw new Error('Branch ' + branch + ' not found');
      const head = await ghApi(c, 'GET', '/git/commits/' + ref.object.sha), tree = [];
      for (const [k, v] of items) { const bytes = typeof v === 'function' ? await v() : new TextEncoder().encode(v), blob = await ghApi(c, 'POST', '/git/blobs', { content: u8b64(bytes), encoding: 'base64' }); tree.push({ path: base + '/' + k, mode: '100644', type: 'blob', sha: blob.sha }); }
      const t = await ghApi(c, 'POST', '/git/trees', { base_tree: head.tree.sha, tree }), cm = await ghApi(c, 'POST', '/git/commits', { message: 'Online shop: ' + items.length + ' file(s) from ORBIT' + (why ? ' (' + why + ')' : '') + ' · ' + me(), tree: t.sha, parents: [ref.object.sha] });
      await ghApi(c, 'PATCH', '/git/refs/heads/' + encodeURIComponent(branch), { sha: cm.sha });
      items.forEach(([k]) => GH.q.delete(k)); GH.at = Date.now(); GH.err = ''; GH.last = items.length + ' file(s)'; return items.length;
    } catch (e) { GH.err = e.message; if (why === 'button') throw e; console.warn('[shop] GitHub', e.message); return 0; } finally { GH.busy = false; }
  }
  /* after a publish: the catalogue (only if something a customer sees changed) and any new photos */
  function ghCatalog(cat) {
    if (!ghOn()) return; const sig = JSON.stringify(Object.assign({}, cat, { ver: '', at: '' })); if (sig !== GH.sentCat) { GH.q.set('catalog.json', JSON.stringify(cat)); GH.sentCat = sig; }
    [...new Set(cat.items.flatMap(i => i.img).filter(f => f && !/^https?:/.test(f)))].forEach(f => { ['', 't-'].forEach(pf => { if (!GH.q.has('img/' + pf + f)) GH.q.set('img/' + pf + f, () => spBytes('img/' + pf + f)); }); });
  }
  setInterval(() => { if (GH.q.size && document.visibilityState !== 'hidden') ghFlush('auto'); }, 5 * 60000);

  /* ---------- the catalogue: publish to OrbitShop/catalog.json ---------- */
  let PUB = { at: 0, busy: false, err: '' };
  async function publish(why) {
    if (PUB.busy) return; PUB.busy = true;
    try { const b = await bundle(true, { cat: 1, stock: 1 }); if (b.missing) throw new Error('The shop is not set up'); const set = b.set;
      const ver = new Date().toISOString(), cat = await P.buildCatalog({ set, items: b.items, products: b.prods, cats: b.cats, free: b.free, coupons: b.cpns, ver });
      await putFile('catalog.json', JSON.stringify(cat)); ghCatalog(cat); if (why === 'button' && ghOn()) await ghFlush('publish');
      const hist = P.keepPrices(set.priceHistory, ver, cat.items, 8);
      await A().upd('Shop_Settings', set.row.id, { LastPublish: ver, PriceHistory: JSON.stringify(hist) }); K.drop('Shop_Settings');
      PUB.at = Date.now(); PUB.err = ''; PUB.count = cat.items.length; if (why === 'button') toast('🌐 Published · ' + cat.items.length + ' products on the website', 'success');
      return cat; } catch (e) { PUB.err = e.message; if (why === 'button') toast(e.message, 'error'); else console.warn('[shop] publish', e.message); } finally { PUB.busy = false; }
  }
  async function currentCatalog(set, b) { const cat = await P.buildCatalog({ set, items: b.items, products: b.prods, cats: b.cats, free: b.free, coupons: b.cpns, ver: set.lastPublish || 'now' }); return cat; }

  /* ---------- the inbox: what the website sent ---------- */
  let RUN = { busy: false, at: 0, msg: '', n: 0 };
  async function processInbox(manual) {
    if (RUN.busy) return; RUN.busy = true; let done = 0;
    try {
      const ss = await shopSet(true); if (ss.missing) return; const set = ss.s;
      const stale = x => { const m = /^claim:.*:(\d+)$/.exec(x.error || ''); return m && Date.now() - Number(m[1]) > 600000; };
      const rows = (await L('Shop_Inbox', P.inboxFromRow, true)).filter(x => !x.processed && (!x.error || stale(x))).sort((a, b) => a.id - b.id).slice(0, 15);
      let b = null; const need = async () => { if (!b) b = await bundle(true, { cat: 1, stock: 1 }); return b; };
      for (const row of rows) {
        /* claim the row (two people with ORBIT open must not both take it) */
        const tag = 'claim:' + me() + ':' + Date.now(); await A().upd('Shop_Inbox', row.id, { Error: tag });
        const again = (await get('Shop_Inbox', null, true)).find(r => Number(r.id) === row.id); if (!again || again.error !== tag) continue;
        let err = '';
        try { const m = row.payload || {}, kind = row.kind || m.a || '';
          if (kind === 'order') await takeOrder(m, set, await need());
          else if (kind === 'proof') await takeProof(m, set, await need());
          else if (kind === 'cancel') await takeCancel(m, set, await need());
          else if (kind === 'paid') await takePaid(m, set, await need());
          else err = 'Unknown message: ' + kind;
        } catch (e) { err = e.message || String(e); }
        await A().upd('Shop_Inbox', row.id, { Processed: err && !/already taken/i.test(err) ? '0' : '1', Error: err.slice(0, 250), ProcessedAt: iso() }); done++;
        if (b) b = null;   /* stock and orders changed */
      }
      if (done) K.drop('Shop_Inbox', 'Shop_Orders');
      const bb = await bundle(true, {}); await housekeeping(bb.orders, set);
      RUN.n = done; RUN.at = Date.now(); RUN.msg = done ? done + ' new message(s) from the website' : '';
      if (done) { await publish('orders'); PAGES.forEach(p => { if (cur() === p) refresh(p); }); toast('🛒 ' + RUN.msg, 'success'); }
      else if (manual) toast('No new orders from the website', 'info');
    } catch (e) { RUN.msg = '⚠ ' + e.message; if (manual) toast(e.message, 'error'); } finally { RUN.busy = false; if (PAGES.includes(cur())) render(); }
  }
  async function takeOrder(m, set, b, existing) {
    if (!existing && (b.orders || []).some(o => o.no === m.no)) throw new Error('Order ' + m.no + ' already taken');
    const cat0 = await currentCatalog(set, b), cat = P.catalogAt(cat0, set.priceHistory, m.ver);
    const ch = await P.checkOrder(m, cat, b.free, b.cpns, set);
    const o = { no: m.no, trackId: await P.trackId(m.no, m.customer && m.customer.phone), placedAt: m.at || iso(), lang: m.lang === 'ar' ? 'ar' : 'en', customer: str((m.customer || {}).name), phone: P.phone((m.customer || {}).phone), email: lc((m.customer || {}).email),
      emirate: (m.address || {}).emirate || '', area: str((m.address || {}).area), address: m.address || {}, payMethod: m.pay, payRef: (m.payRef || ''), coupon: ch.coupon ? ch.coupon.code : '', catVer: m.ver || '', deliveryDate: m.date || '', slot: m.slot || '', notes: str(m.notes),
      lines: ch.quote.lines, net: ch.quote.net, vat: ch.quote.vat, total: ch.quote.total, paid: 0, timeline: [P.tlOf('placed')], checks: { warnings: ch.warnings, errors: ch.errors, short: ch.short } };
    if (existing) { o.id = existing.id; o.timeline = (existing.timeline || []).concat([Object.assign(P.tl('review', 'Checked again by ' + me(), ''), { internal: 1 })]); if (existing.payRef) o.payRef = existing.payRef; }
    if (!ch.ok) { o.status = 'review'; o.payStatus = m.pay === 'cod' ? 'due' : m.pay === 'bank' ? 'awaiting' : 'pending'; o.timeline.push(Object.assign(P.tlOf('review'), { note: ch.errors.join(' · '), internal: 0 })); await save(o, set, null, { mail: 'received' }); return o; }
    const cu = await customerFor(m); o.customerId = cu.id;
    /* the sales order (holds the stock for this order) */
    const ss = await salSet(true), no = await S.next('so', ss.so), lines = ch.quote.lines.map(l => ({ code: l.code, description: l.description, descAr: l.descAr, qty: l.qty, uom: l.uom || '', price: l.price, disc: 0, vat: l.vat, stock: !!l.stock, delivered: 0, invoiced: 0, amount: l.amount }));
    const so = await S.add('Sal_Orders', { Title: no, SoNo: no, CustomerId: cu.id, CustomerName: o.customer, SoDate: today(), DeliveryDate: o.deliveryDate || '', Wh: set.wh || ss.wh, Salesperson: set.salesperson || '', CustRef: 'Web ' + o.no, QtNo: '', Net: o.net, Vat: o.vat, Total: o.total, MaxDisc: 0, LinesJson: JSON.stringify(lines), Status: 'approved', Invoices: '[]', Checks: JSON.stringify({ web: o.no, stock: { ok: !ch.short.length, rows: ch.short.map(s => ({ code: s.code, short: r3(s.need - s.free) })) } }), History: JSON.stringify([{ at: iso(), by: me(), text: 'From the online shop · ' + o.no }]) });
    S.drop('Sal_Orders'); o.soId = String(so.id); o.soNo = no;
    if (ch.coupon) { try { await A().upd('Shop_Coupons', ch.coupon.id, { Used: ch.coupon.used + 1 }); K.drop('Shop_Coupons'); } catch (e) {} }
    /* payment */
    if (m.pay === 'cod') o.payStatus = 'due';
    else if (m.pay === 'bank') o.payStatus = 'awaiting';
    else { o.payStatus = 'pending'; if (o.payRef) { try { const r = await flow(set, { a: 'paycheck', ref: o.payRef, no: o.no }); if (r && r.paid) await cardPaid(o, set, r, b); } catch (e) { o.timeline.push(Object.assign(P.tl('awaiting_payment', 'Card check failed: ' + e.message, ''), { internal: 1 })); } } }
    const paidOk = o.payStatus === 'paid' || o.payStatus === 'due' || !set.holdUnpaid;
    o.status = ch.short.length ? 'review' : !paidOk ? 'awaiting_payment' : set.autoConfirm ? 'confirmed' : 'review';
    o.timeline.push(P.tlOf(o.status === 'review' ? 'review' : o.status));
    if (ch.short.length) o.timeline.push(Object.assign(P.tl('review', 'Stock short: ' + ch.short.map(s => s.code + ' ' + fq(s.free) + '/' + fq(s.need)).join(', '), ''), { internal: 1 }));
    await save(o, set, null, { mail: o.status === 'confirmed' ? 'confirmed' : o.status === 'awaiting_payment' ? 'awaiting_payment' : 'received' });
    return o;
  }
  /* an order that waits in "review" without a sales order: take it again (today's prices and stock) */
  async function retake(o) {
    const ss = await shopSet(true), set = ss.s, rows = await L('Shop_Inbox', P.inboxFromRow, true), row = rows.find(x => (x.kind === 'order' || (x.payload && x.payload.a === 'order')) && x.payload && x.payload.no === o.no);
    if (!row) throw new Error('The original order message is not in Shop_Inbox'); const b = await bundle(true, { cat: 1, stock: 1 }), r = await takeOrder(row.payload, set, b, o);
    if (r.status === 'review' && !r.soId) throw new Error('Still not possible: ' + ((r.checks || {}).errors || []).join(' · ')); await publish('orders'); return r;
  }
  async function takeProof(m, set, b) {
    const o = (b.orders || []).find(x => x.no === m.no); if (!o) throw new Error('No order ' + m.no);
    if (m.phone && P.phone(m.phone).slice(-9) !== P.phone(o.phone).slice(-9)) throw new Error('Proof sent with a different phone number');
    let name = '';
    if (m.file) name = 'proofs/' + String(m.file).replace(/[\\/]/g, '');   /* the flow saved the file in OrbitShop/proofs */
    else { if (!m.data || !/^image\/|application\/pdf/.test(m.type || '')) throw new Error('The proof is not a picture or PDF');
      name = 'proofs/' + o.no + '-' + Date.now().toString(36) + '.' + (/pdf/.test(m.type) ? 'pdf' : /png/.test(m.type) ? 'png' : 'jpg'); await putFile(name, b64ToBlob(m.data, m.type), m.type); }
    o.proof = name; if (o.payStatus === 'awaiting') o.payStatus = 'proof';
    await save(o, set, P.tlOf('proof'));
  }
  async function takeCancel(m, set, b) {
    const o = (b.orders || []).find(x => x.no === m.no); if (!o) throw new Error('No order ' + m.no);
    if (P.phone(m.phone).slice(-9) !== P.phone(o.phone).slice(-9)) throw new Error('Cancel request with a different phone number');
    if (!P.CANCELLABLE_BY_CUSTOMER.includes(o.status)) { await save(o, set, Object.assign(P.tl(o.status, 'Customer asked to cancel (too late — already ' + (P.STATUS[o.status] || {}).en + ')', ''), { internal: 1 })); return; }
    await cancelOrder(o, set, 'Cancelled by the customer');
  }
  async function takePaid(m, set, b) {
    const o = (b.orders || []).find(x => x.no === m.no); if (!o) throw new Error('No order ' + m.no);
    if (m.ref) o.payRef = m.ref; if (o.payStatus === 'paid') return;
    const r = await flow(set, { a: 'paycheck', ref: o.payRef, no: o.no }); if (!r || !r.paid) { await save(o, set); return; }
    await cardPaid(o, set, r, b); if (o.status === 'awaiting_payment') { o.status = set.autoConfirm ? 'confirmed' : 'review'; await save(o, set, P.tlOf(o.status), { mail: o.status === 'confirmed' ? 'confirmed' : '' }); } else await save(o, set);
  }
  /* the card company says paid: check the amount, post the receipt */
  async function cardPaid(o, set, r, b) {
    const amt = r2(num(r.amount)); o.paid = amt;
    if (Math.abs(amt - o.total) > 0.009) { o.payStatus = 'mismatch'; o.timeline.push(Object.assign(P.tl(o.status, 'Card paid ' + n2(amt) + ' but the order is ' + n2(o.total), ''), { internal: 1 })); return; }
    o.payStatus = 'paid'; o.timeline.push(P.tlOf('paid'));
    if (o.customerId && set.accCard) { try { o.rcpNo = await receipt(o, amt, set.accCard, 'Card', r.ref || o.payRef); } catch (e) { o.timeline.push(Object.assign(P.tl(o.status, 'Receipt not posted: ' + e.message, ''), { internal: 1 })); } }
  }
  /* unpaid orders past the limit are cancelled; card payments not finished are checked again */
  async function housekeeping(orders, set) {
    const lim = Date.now() - Math.max(1, set.unpaidDays) * 864e5;
    for (const o of (orders || []).filter(x => x.status === 'awaiting_payment').slice(0, 10)) {
      if (o.payMethod === 'card' && o.payRef && set.apiUrl && set.connection === 'flow' && Date.parse(o.placedAt) > Date.now() - 864e5) { try { const r = await flow(set, { a: 'paycheck', ref: o.payRef, no: o.no }); if (r && r.paid) { await cardPaid(o, set, r); o.status = set.autoConfirm ? 'confirmed' : 'review'; await save(o, set, P.tlOf(o.status), { mail: 'confirmed' }); continue; } } catch (e) {} }
      if (Date.parse(o.placedAt) < lim && o.payStatus !== 'proof') await cancelOrder(o, set, 'Not paid within ' + set.unpaidDays + ' day(s)');
    }
  }
  async function cancelOrder(o, set, why) {
    if (o.soId) { try { await S.upd('Sal_Orders', Number(o.soId), { Status: 'cancelled', History: JSON.stringify([{ at: iso(), by: me(), text: 'Cancelled · web ' + o.no + ' · ' + why }]) }); S.drop('Sal_Orders'); } catch (e) {} }
    if (o.payStatus === 'paid') o.payStatus = 'refund';
    o.status = 'cancelled'; await save(o, set, Object.assign(P.tlOf('cancelled'), { note: why }), { mail: 'cancelled' });
  }

  /* ---------- finance ---------- */
  async function receipt(o, amount, acc, method, ref) {
    const fb = await FU.bundle(true, {}), set = fb.set, no = await S.next('receipt', set.rcp), date = today();
    const f = { Title: no, PayNo: no, PayType: 'receipt', PayDate: date, PartyType: 'customer', PartyId: String(o.customerId), PartyName: o.customer, AccountCode: acc, Method: method, Reference: ('Web ' + o.no + (ref ? ' · ' + ref : '')).slice(0, 250), Amount: r2(amount), Status: 'draft', AllocJson: '[]', History: JSON.stringify([{ at: iso(), by: me(), text: 'Online shop ' + o.no }]) };
    const id = (await S.add('Fin_Payments', f)).id, en = F.fromPayment({ id, number: no, type: 'receipt', date, party_id: o.customerId, party_name: o.customer, account: acc, amount: r2(amount), reference: 'Web ' + o.no }, fb.map);
    const chk = F.checkEntry(en, fb.accts, set); if (!chk.ok) throw new Error(chk.errors.join(' · '));
    const r = await S.post(Object.assign(en, { lines: chk.lines })); await S.upd('Fin_Payments', id, { Status: 'posted', JournalNo: r.no }); S.drop('Fin_Payments'); return no;
  }
  /* refund: the receipt the other way round (customer account debit, bank credit) */
  async function refundEntry(o, acc, ref) {
    const fb = await FU.bundle(true, {}), en = F.fromPayment({ id: 'R' + o.id, number: o.rcpNo || o.no, type: 'receipt', date: today(), party_id: o.customerId, party_name: o.customer, account: acc, amount: o.paid, reference: 'Refund web ' + o.no }, fb.map), rev = F.reversalOf(Object.assign({ no: o.rcpNo || o.no }, en), today());
    rev.memo = 'Refund · web order ' + o.no + (ref ? ' · ' + ref : ''); rev.source = 'payment'; rev.ref = 'WEBREF:' + o.no;
    const chk = F.checkEntry(rev, fb.accts, fb.set); if (!chk.ok) throw new Error(chk.errors.join(' · ')); return (await S.post(Object.assign(rev, { lines: chk.lines }))).no;
  }
  /* delivery note for the whole order (stock lines) and the e-invoice draft */
  async function soOf(o) { const r = (await S.list('Sal_Orders', true)).map(Q.soFromRow).find(x => String(x.id) === o.soId); if (!r) throw new Error('Sales order ' + o.soNo + ' not found'); return r; }
  async function deliveryNote(o, set) {
    const so = await soOf(o), ss = await salSet(true); if (!['approved', 'partial'].includes(so.status)) throw new Error('Sales order ' + so.no + ' is ' + so.status);
    const q = so.lines.map(l => l.stock ? r3(num(l.qty) - num(l.delivered)) : 0); if (!q.some(x => x > 0)) return so;
    const no = await S.next('dn', ss.dn), lines = so.lines.map((l, i) => Object.assign({}, l, { delivered: r3(num(l.delivered) + q[i]) })), val = r2(so.lines.reduce((s2, l, i) => s2 + Q.lineNet(Object.assign({}, l, { qty: q[i] })).net, 0));
    await S.add('Sal_Deliveries', { Title: no, DnNo: no, SoId: String(so.id), SoNo: so.no, DnDate: today(), Wh: so.wh, CustomerName: so.customer, Driver: o.driver || '', Vehicle: o.vehicle || '', Value: val, LinesJson: JSON.stringify(q.map((x, i) => ({ i, qty: x })).filter(x => x.qty)), Notes: 'Web order ' + o.no + ' · ' + o.area + ', ' + emName(o.emirate) });
    await S.upd('Sal_Orders', so.id, { LinesJson: JSON.stringify(lines), Status: Q.soStatus(Object.assign({}, so, { lines, status: 'approved' })) }); S.drop('Sal_Orders', 'Sal_Deliveries'); o.dnNo = no; return Object.assign(so, { lines });
  }
  async function invoiceDraft(o) {
    if (o.invId) return; const so = await soOf(o), prods = await get('EInv_Products', null).catch(() => []), x = Q.toInvoice(so, prods, 0, today()); if (!x.rows.length) return;
    x.doc.notes = 'Online order ' + o.no + ' · sales order ' + so.no; const f = E.docToFields(x.doc); f.History = JSON.stringify([{ at: iso(), by: me(), text: 'Draft from web order ' + o.no }]);
    const r = await A().add('EInv_Documents', f); K.drop('EInv_Documents');
    const lines = so.lines.map((l, i) => { const rw = x.rows.find(y => y.i === i); return Object.assign({}, l, { invoiced: r3(num(l.invoiced) + (rw ? rw.qty : 0)) }); });
    await S.upd('Sal_Orders', so.id, { LinesJson: JSON.stringify(lines), Status: Q.soStatus(Object.assign({}, so, { lines, status: 'approved' })), Invoices: JSON.stringify((so.invoices || []).concat([{ id: r.id, date: today(), total: E.totals(x.doc.lines).total }])) }); S.drop('Sal_Orders');
    o.invId = String(r.id);
  }


  /* ---------- without the flow: orders pasted from WhatsApp / e-mail, website files to download ---------- */
  async function pasteOrder(text) {
    const m = P.parseOrderCode(text); if (!m) throw new Error('No order code found — paste the whole message (it contains "ORBIT1:…")');
    const ex = (await L('Shop_Orders', P.ordFromRow, true)).find(o => o.no === m.no); if (ex) throw new Error('Order ' + m.no + ' is already in ORBIT (' + ((P.STATUS[ex.status] || {}).en || ex.status) + ')');
    await A().add('Shop_Inbox', { Title: m.no, Kind: 'order', Ref: m.no, Payload: JSON.stringify(m) }); K.drop('Shop_Inbox');
    await processInbox(false); const o = (await L('Shop_Orders', P.ordFromRow, true)).find(x => x.no === m.no); if (!o) throw new Error(RUN.msg || 'The order could not be taken'); ghFlush('new order'); return o;
  }
  /* a plain .zip (stored, no compression) — the photos are already compressed */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {   /* files: [{ name, data: Uint8Array }] */
    const enc2 = new TextEncoder(), parts = [], cen = []; let off = 0;
    const le = (n, b) => { const a = new Uint8Array(b); for (let i = 0; i < b; i++) a[i] = (n >>> (8 * i)) & 255; return a; };
    files.forEach(f => { const nm = enc2.encode(f.name), c = crc32(f.data), sz = f.data.length;
      const head = [le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x21, 2), le(c, 4), le(sz, 4), le(sz, 4), le(nm.length, 2), le(0, 2), nm];
      cen.push([le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x21, 2), le(c, 4), le(sz, 4), le(sz, 4), le(nm.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(off, 4), nm]);
      head.forEach(x => { parts.push(x); off += x.length; }); parts.push(f.data); off += sz; });
    const cs = off; let cl = 0; cen.forEach(r => r.forEach(x => { parts.push(x); cl += x.length; }));
    [le(0x06054b50, 4), le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cl, 4), le(cs, 4), le(0, 2)].forEach(x => parts.push(x));
    return new Blob(parts, { type: 'application/zip' });
  }
  async function websiteFiles(onStep) {
    const cat = await publish('files'); if (!cat) throw new Error(PUB.err || 'Publishing failed'); const files = [{ name: 'data/catalog.json', data: new TextEncoder().encode(JSON.stringify(cat)) }];
    const names = [...new Set(cat.items.flatMap(i => i.img).filter(f => f && !/^https?:/.test(f)))];
    for (const f of names) for (const n of [f, 't-' + f]) { onStep && onStep(n); try { const { siteId, token } = await sp(), r = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${enc(FOLDER + '/img/' + n)}:/content`, { headers: { Authorization: 'Bearer ' + token } }); if (r.ok) files.push({ name: 'data/img/' + n, data: new Uint8Array(await r.arrayBuffer()) }); } catch (e) {} }
    const a = document.createElement('a'); a.href = URL.createObjectURL(zip(files)); a.download = 'shop-data-' + today() + '.zip'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return { products: cat.items.length, files: files.length };
  }
  /* WhatsApp message to the customer about their order (in their language) */
  function waText(o, set) {
    const ar = o.lang === 'ar', st = P.STATUS[o.status] || {}, shop = ar && set.shopNameAr ? set.shopNameAr : set.shopName;
    const lines = [ar ? `مرحباً ${o.customer}،` : `Hello ${o.customer},`, ar ? `طلبك ${o.no} لدى ${shop}: ${st.ar || o.status}` : `Your order ${o.no} at ${shop}: ${st.en || o.status}`, (ar ? 'الإجمالي: ' : 'Total: ') + (set.currency || 'AED') + ' ' + n2(o.total)];
    if (o.payMethod === 'bank' && ['awaiting', 'proof'].includes(o.payStatus) && set.bankDetails) lines.push('', ar ? 'بيانات التحويل:' : 'Bank details:', set.bankDetails, ar ? 'يرجى إرسال صورة التحويل هنا.' : 'Please send a photo of the transfer here.');
    if (o.status === 'out_for_delivery' && o.slot) lines.push(ar ? 'وقت التوصيل: ' + o.slot : 'Delivery time: ' + o.slot);
    return 'https://wa.me/' + o.phone + '?text=' + encodeURIComponent(lines.join('\n'));
  }

  /* ---------- background: check the website every minute while a shop page is open ---------- */
  let POLL = 0, PUBT = 0;
  function startPoll() {
    if (POLL) return; const tick = () => { if (PAGES.includes(cur()) && document.visibilityState !== 'hidden') processInbox(false); };
    setTimeout(tick, 1500); POLL = setInterval(tick, 60000);
    PUBT = setInterval(() => { if (cur() === 'x_shop' && document.visibilityState !== 'hidden' && Date.now() - PUB.at > 15 * 60000) publish('timer'); }, 60000);
  }

  window.SHOP_UI = { bundle, publish, processInbox, retake, pasteOrder, websiteFiles, waText, zip, ghCfg, ghSet, ghOn, ghTest, ghFlush, GH: () => GH, move, save, track, cancelOrder, receipt, refundEntry, deliveryNote, invoiceDraft, mailCustomer, flow, putFile, fileUrl, photo, shopSet, freeStock, customerFor, PUB: () => PUB, RUN: () => RUN,
    h: { pill, payPill, emName, fq, tm, errs, warns, clear, users, uname, busy, needSetup, refresh, screen, b64ToBlob } };
})();
