/* ============================================================
   ORBIT ONLINE SHOP — screens (uses SHOP_UI from 79m5)
   x_shop     Distributions → Online Shop: orders · products · categories · coupons · report · settings
   x_shopwh   Warehouse → Online orders: pick → pack → release to distribution
   x_shopdel  Distributions → Web deliveries: assign driver → out for delivery → delivered / failed · driver screen
   x_shoppay  Finance → Web payments: bank transfers · card · cash from drivers · refunds
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, P = window.SHOP, U = window.SHOP_UI, FU = window.FIN_UI, Q = window.SAL;
  if (!K || !P || !U || !FU) return;
  const { esc, num, today, str, toast, V, render, H, iso, me, dmy } = K, { table, n2, money, printHtml } = FU;
  const { pill, payPill, emName, fq, tm, errs, warns, clear, users, uname, busy, needSetup, refresh, screen } = U.h;
  const lc = P.lc, r2 = P.r2;
  const go = k => K.A().go(k);
  const EMS = Object.entries(P.EMIRATES).map(([k, v]) => [k, v[0]]);
  const orderOf = (d, id) => (d.orders || []).find(o => o.id === Number(id));
  const goods = o => (o.lines || []).filter(l => l.code);
  const css = document.createElement('style'); css.textContent = `
#mob .sh-tl{border-inline-start:3px solid var(--border,#e2e8f0);margin:6px 0 4px 6px;padding-inline-start:12px}#mob .sh-tl div{position:relative;padding:5px 0;font-size:13px}#mob .sh-tl div::before{content:"";position:absolute;inset-inline-start:-18px;top:10px;width:9px;height:9px;border-radius:50%;background:var(--c,#6d3fd9)}#mob .sh-tl small{color:#64748b;margin-inline-start:6px}#mob .sh-tl .in{opacity:.7;font-style:italic}
#mob .sh-ims{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}#mob .sh-ims span{position:relative;width:84px;height:84px;border-radius:10px;overflow:hidden;border:1px solid var(--border,#e2e8f0);background:#f8fafc}#mob .sh-ims img{width:100%;height:100%;object-fit:cover}#mob .sh-ims b{position:absolute;inset:auto 0 0 0;display:flex;justify-content:space-between;background:rgba(0,0,0,.55)}#mob .sh-ims b button{background:none;border:0;color:#fff;cursor:pointer;padding:3px 6px;font-size:12px}
#mob .sh-pk{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border,#eef2f7)}#mob .sh-pk.ok b{color:#15803d}#mob .sh-pk input{width:90px}
#mob .sh-drv{border:1px solid var(--border,#e2e8f0);border-radius:14px;padding:14px;margin:10px 0;background:var(--card,#fff)}#mob .sh-drv h4{margin:0 0 4px;font-size:16px}#mob .sh-drv .a{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}#mob .sh-drv .a a{flex:1;min-width:90px;text-align:center;padding:10px;border-radius:10px;background:#eef2ff;color:#3730a3;text-decoration:none;font-weight:700}
#mob .sh-sel label{display:flex!important;justify-content:flex-start;gap:10px;align-items:center;padding:9px 10px;border:1px solid var(--border,#e2e8f0);border-radius:10px;margin:6px 0;cursor:pointer;text-align:start;font-weight:500}#mob .sh-sel input[type=checkbox]{width:18px!important;height:18px;min-height:0!important;flex:none;margin:0;padding:0}
#mob .sh-bars div{display:grid;grid-template-columns:150px 1fr 90px;gap:10px;align-items:center;font-size:13px;margin:5px 0}#mob .sh-bars i{display:block;height:10px;border-radius:6px;background:var(--c,#6d3fd9)}
#mob .sh-run{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px;color:#475569;margin:0 4px 10px}`;
  document.head.appendChild(css);

  /* ---------- shared bits ---------- */
  const runLine = () => { const R = U.RUN(), PB = U.PUB(); return `<div class="sh-run"><span>${R.busy ? '⏳ Checking the website…' : '🔄 Orders are checked every minute while this page is open' + (R.at ? ' · last ' + tm(new Date(R.at).toISOString()) : '')}</span>${R.msg ? `<b>${esc(R.msg)}</b>` : ''}${PB.err ? `<span style="color:#dc2626">⚠ publish: ${esc(PB.err)}</span>` : ''}${H.sbtn('↻ Check now', 'chk')}</div>`; };
  const timeline = o => `<div class="sh-tl">${(o.timeline || []).slice().reverse().map(t => `<div class="${t.internal ? 'in' : ''}" style="--c:${(P.STATUS[t.s] || {}).c || '#6d3fd9'}">${esc(t.en)}${t.note ? ' — ' + esc(t.note) : ''}<small>${tm(t.at)}${t.by ? ' · ' + esc(uname(t.by)) : ''}${t.internal ? ' · staff only' : ''}</small></div>`).join('')}</div>`;
  const addr = o => { const a = o.address || {}, q = a.lat ? a.lat + ',' + a.lng : [a.line, a.building, a.area, emName(a.emirate), 'UAE'].filter(Boolean).join(', ');
    return { text: [a.line, a.building, a.landmark, a.area, emName(a.emirate)].filter(Boolean).join(', '), map: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) }; };
  const linesTbl = o => table([{ k: 'd', t: 'Item' }, { k: 'c', t: 'Code' }, { k: 'q', t: 'Qty' }, { k: 'a', t: 'Amount (incl. VAT)', n: 1 }], (o.lines || []).map(l => ({ d: l.description, c: l.code || '', q: l.code ? fq(l.qty) + ' ' + (l.uom || '') : '', a: l.amount != null ? l.amount : r2(num(l.net) + num(l.vatAmt)) })), { d: 'Total incl. VAT ' + n2(o.vat) + ' VAT', a: o.total });
  function orderDetail(o, extra) {
    const a = addr(o), ch = o.checks || {};
    return H.head('🛒', o.no + ' · ' + esc(o.customer), tm(o.placedAt) + ' · ' + esc(o.area) + ', ' + esc(emName(o.emirate)) + (o.soNo ? ' · ' + esc(o.soNo) : '') + (o.dnNo ? ' · ' + esc(o.dnNo) : ''), (P.STATUS[o.status] || {}).c)
      + H.kpis([['Total', n2(o.total)], ['Items', String(goods(o).reduce((s, l) => s + num(l.qty), 0))], ['Payment', esc((P.PAY[o.payMethod] || {}).en || '')], ['Status', esc((P.STATUS[o.status] || {}).en || o.status)]])
      + (extra || '')
      + H.card('Status · ' + pill(o.status) + ' ' + payPill(o), errs(ch.errors) + warns(ch.warnings) + (ch.short && ch.short.length ? warns(ch.short.map(s => 'Stock: ' + s.code + ' free ' + fq(s.free) + ' of ' + fq(s.need))) : '') + timeline(o))
      + H.card('Customer & delivery', `<div class="ei-kv"><span>Customer</span><b>${esc(o.customer)}</b></div><div class="ei-kv"><span>Phone</span><b><a href="tel:+${esc(o.phone)}">+${esc(o.phone)}</a></b></div>${o.email ? `<div class="ei-kv"><span>E-mail</span><b>${esc(o.email)}</b></div>` : ''}
        <div class="ei-kv"><span>Address</span><b>${esc(a.text)} · <a href="${esc(a.map)}" target="_blank" rel="noopener">map ↗</a></b></div>${o.deliveryDate ? `<div class="ei-kv"><span>Delivery</span><b>${dmy(o.deliveryDate)}${o.slot ? ' · ' + esc(o.slot) : ''}</b></div>` : ''}
        ${o.driver ? `<div class="ei-kv"><span>Driver</span><b>${esc(uname(o.driver))}${o.vehicle ? ' · ' + esc(o.vehicle) : ''}</b></div>` : ''}${o.notes ? `<div class="ei-kv"><span>Customer note</span><b>${esc(o.notes)}</b></div>` : ''}
        ${o.rcpNo ? `<div class="ei-kv"><span>Receipt</span><b>${esc(o.rcpNo)}</b></div>` : ''}${o.invId ? `<div class="ei-kv"><span>E-invoice draft</span><b>#${esc(o.invId)}</b></div>` : ''}${o.coupon ? `<div class="ei-kv"><span>Coupon</span><b>${esc(o.coupon)}</b></div>` : ''}`)
      + H.card('Items', linesTbl(o));
  }
  const ordRows = list => list.map(o => ({ no: o.no, d: tm(o.placedAt), c: o.customer, a: o.area + ', ' + emName(o.emirate), t: o.total, p: payPill(o), s: pill(o.status), _tap: o.id }));
  const ordTable = (list, tap) => list.length ? table([{ k: 'no', t: 'Order' }, { k: 'd', t: 'Placed' }, { k: 'c', t: 'Customer' }, { k: 'a', t: 'Area' }, { k: 't', t: 'Total', n: 1 }, { k: 'p', t: 'Payment', raw: 1 }, { k: 's', t: '', raw: 1 }], ordRows(list), null, tap || 'open') : H.empty('Nothing here');
  const doIt = async (fn, page, okMsg) => { try { await fn(); if (okMsg) toast(okMsg, 'success'); } catch (e) { toast(e.message, 'error'); } refresh(page); };
  const printPick = (list, set) => { const sum = new Map(); list.forEach(o => goods(o).forEach(l => { const x = sum.get(l.code) || { d: l.description, u: l.uom, q: 0, o: [] }; x.q += num(l.qty); x.o.push(o.no + ' ×' + fq(l.qty)); sum.set(l.code, x); }));
    printHtml('Pick list', `<h2 style="margin:0">PICK LIST · ${esc(set.shopName || 'Online shop')}</h2><p>${dmy(today())} · ${list.length} order(s) · warehouse ${esc(set.wh || 'all')}</p>
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>✓</th><th>Item</th><th style="text-align:left">Description</th><th>Qty</th><th>Unit</th><th style="text-align:left">Orders</th></tr>${[...sum.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([c, x]) => `<tr><td>☐</td><td>${esc(c)}</td><td>${esc(x.d)}</td><td style="text-align:right"><b>${fq(x.q)}</b></td><td>${esc(x.u || '')}</td><td style="font-size:11px">${esc(x.o.join(', '))}</td></tr>`).join('')}</table>
      ${list.map(o => `<div style="page-break-inside:avoid;margin-top:18px;border-top:2px dashed #999;padding-top:8px"><b>${esc(o.no)}</b> · ${esc(o.customer)} · ${esc(o.area)}, ${esc(emName(o.emirate))} · ${esc((P.PAY[o.payMethod] || {}).en)}${o.payMethod === 'cod' ? ' · COLLECT ' + n2(o.total) : ''}<br>${goods(o).map(l => `☐ ${esc(l.code)} ${esc(l.description)} × <b>${fq(l.qty)}</b>`).join('<br>')}</div>`).join('')}`); };
  const printLabel = (o, set) => printHtml('Label ' + o.no, `<div style="border:2px solid #000;padding:16px;max-width:420px;font-size:15px"><b style="font-size:20px">${esc(set.shopName || '')}</b><hr><div style="font-size:24px;font-weight:800;letter-spacing:1px">${esc(o.no)}</div><p><b>${esc(o.customer)}</b><br>+${esc(o.phone)}<br>${esc(addr(o).text)}</p>${o.payMethod === 'cod' && o.payStatus !== 'collected' ? `<div style="font-size:20px;border:2px solid #000;padding:8px;text-align:center">COLLECT ${esc(set.currency || 'AED')} ${n2(o.total)}</div>` : '<div style="text-align:center;font-weight:700">PAID</div>'}<p>Parcels: ${o.parcels || 1} · ${dmy(o.deliveryDate || today())}${o.slot ? ' ' + esc(o.slot) : ''}</p></div>`);
  const printRoute = (list, set, drv) => printHtml('Route ' + drv, `<h2 style="margin:0">DELIVERY ROUTE · ${esc(uname(drv))}</h2><p>${dmy(list[0] && list[0].deliveryDate || today())} · ${list.length} stop(s)</p><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>#</th><th>Order</th><th style="text-align:left">Customer / address</th><th>Phone</th><th>Collect</th><th>Signature</th></tr>${list.map((o, i) => `<tr><td>${i + 1}</td><td>${esc(o.no)}</td><td>${esc(o.customer)}<br><small>${esc(addr(o).text)}</small></td><td>+${esc(o.phone)}</td><td style="text-align:right">${o.payMethod === 'cod' ? n2(o.total) : 'paid'}</td><td style="width:120px"></td></tr>`).join('')}</table><p>Cash to collect: <b>${n2(list.filter(o => o.payMethod === 'cod').reduce((s, o) => s + o.total, 0))}</b></p>`);

  /* =============== Distributions → Online Shop =============== */
  screen('x_shop', { cat: 1, stock: 1, fin: 1 }, {
    view(v, d) {
      const set = d.set || P.setFromRow(null), tab = v.tab || 'orders', os = d.orders || [];
      const head = H.head('🛍', 'Online shop', (set.shopName ? esc(set.shopName) + ' · ' : '') + 'Website orders · products · prices · coupons · publish', '#6d3fd9') + busy(d) + (d.missing ? '' : runLine())
        + H.tabs('tab', [['orders', '🛒 Orders', os.filter(o => ['review', 'awaiting_payment', 'confirmed'].includes(o.status)).length], ['products', '🏷 Products'], ['cats', '🗂 Categories'], ['coupons', '🎟 Coupons'], ['promo', '📣 Offers & ads'], ['report', '📊 Report'], ['settings', '⚙️ Settings'], ['conn', d.set && d.set.connection === 'flow' ? '🔌 Connected' : '🔌 Website connection']], 'orders');
      if (d.missing && tab !== 'settings') return head + needSetup(d);
      if (tab === 'products') return head + productsView(v, d, set);
      if (tab === 'cats') return head + catsView(v, d);
      if (tab === 'coupons') return head + couponsView(v, d);
      if (tab === 'report') return head + reportView(v, d, set);
      if (tab === 'promo') return head + promoView(v, d, set);
      if (tab === 'settings') return head + settingsView(v, d, set);
      if (tab === 'conn') return head + connView(v, d, set);
      if (v.o) { const o = orderOf(d, v.o); if (!o) return head + busy(d);
        const acts = [H.btn('← Orders', 'back', 's')];
        if (o.status === 'review') acts.push(H.btn('✓ Confirm order', 'confirm'));
        if (o.status === 'awaiting_payment' && o.payMethod === 'cod') acts.push(H.btn('✓ Confirm', 'confirm'));
        if (P.canGo(o.status, 'cancelled')) acts.push(H.btn('✕ Cancel order', 'cancel', 's'));
        acts.push(H.btn('🖨 Label', 'label', 's'), `<a class="mb-btn s" href="${esc(U.waText(o, set))}" target="_blank" rel="noopener">💬 WhatsApp customer</a>`);
        return head + orderDetail(o, o.status === 'review' && !o.soId ? H.card('', `<div class="mb-hint mb-bad">This order was not accepted automatically (see the reasons below). Fix the item / stock, then confirm, or cancel it — the customer sees "Being reviewed".</div>`) : '') + H.bar(`<div class="mb-row">${acts.join('')}</div>`); }
      const f = v.f || 'act', q = lc(v.q || ''), pick = o => f === 'act' ? ['review', 'awaiting_payment', 'confirmed', 'picking', 'packed', 'released', 'out_for_delivery', 'failed'].includes(o.status) : f === 'review' ? o.status === 'review' : f === 'pay' ? o.status === 'awaiting_payment' : f === 'done' ? ['delivered', 'returned'].includes(o.status) : f === 'x' ? o.status === 'cancelled' : true;
      const list = os.filter(pick).filter(o => !q || lc(o.no + ' ' + o.customer + ' ' + o.phone + ' ' + o.area).includes(q)), t0 = today(), mon = t0.slice(0, 7), live = os.filter(o => o.status !== 'cancelled');
      const probs = (d.inbox || []).filter(x => !x.processed && x.error && !/^claim:/.test(x.error));
      return head + H.kpis([['Orders today', String(live.filter(o => String(o.placedAt).slice(0, 10) === t0).length)], ['Sales this month', n2(live.filter(o => String(o.placedAt).slice(0, 7) === mon).reduce((s, o) => s + o.total, 0))], ['To review', String(os.filter(o => o.status === 'review').length), os.some(o => o.status === 'review') ? 'o' : ''], ['Awaiting payment', String(os.filter(o => o.status === 'awaiting_payment').length)], ['To prepare', String(os.filter(o => ['confirmed', 'picking', 'packed'].includes(o.status)).length)], ['On the way', String(os.filter(o => o.status === 'out_for_delivery').length)]])
        + (probs.length ? H.card('Messages from the website that could not be read', probs.map(x => `<div class="ei-kv"><span>#${x.id} · ${esc(x.kind)} · ${esc(x.ref)}</span><b style="color:#dc2626">${esc(x.error)} ${H.sbtn('↻ Try again', 'retry', `data-i="${x.id}"`)}</b></div>`).join('')) : '')
        + H.tabs('f', [['act', 'In progress'], ['review', 'To review'], ['pay', 'Awaiting payment'], ['done', 'Delivered'], ['x', 'Cancelled'], ['all', 'All', os.length]], 'act') + H.search('q', 'Order no., customer, phone, area')
        + (set.connection !== 'flow' && !v.paste ? H.card('', `<div class="ei-kv"><span>🔌 The website is <b>not connected</b> yet — customers send their order by WhatsApp or e-mail. Paste each message here and ORBIT takes it like a website order.</span><b>${H.sbtn(v.paste ? '✕ Close' : '📋 Order from WhatsApp / e-mail', 'pasteT', '', 'p')}</b></div>`) : '')
        + (v.paste ? pasteCard(v, d) : '')
        + H.card('', ordTable(list)) + H.bar(`<div class="mb-row">${H.btn('📋 Paste an order', 'pasteT', 's')}${H.btn('🌐 Publish to website', 'pub', 's')}${H.btn('↻ Check for orders', 'chk')}</div>`);
    },
    act: {
      toSet(t, v) { v.tab = 'settings'; render(); }, chk() { U.processInbox(true); }, pub() { U.publish('button').then(() => refresh('x_shop')); },
      open(t, v) { v.o = +t.dataset.i; render(); }, back(t, v) { v.o = null; render(); },
      async retry(t) { await K.A().upd('Shop_Inbox', +t.dataset.i, { Error: '', Processed: '0' }); K.drop('Shop_Inbox'); U.processInbox(true); },
      async confirm(t, v, d) { const o = orderOf(d, v.o);
        if (!o.soId) { if (!confirm('This order has no sales order yet (it was not accepted automatically). Check it again now with today\'s prices and stock?')) return;
          return doIt(async () => { const r = await U.retake(o); v.o = r.id; }, 'x_shop', '✓ Taken again'); }
        if (!confirm('Confirm ' + o.no + '? It goes to the warehouse to be prepared.')) return; doIt(() => U.move(o, 'confirmed', d.set), 'x_shop', '✓ Confirmed'); },
      cancel(t, v, d) { const o = orderOf(d, v.o), why = prompt('Why is ' + o.no + ' cancelled? (the customer is told it is cancelled)', 'Out of stock'); if (why == null) return; doIt(() => U.cancelOrder(o, d.set, why || 'Cancelled'), 'x_shop', 'Cancelled'); },
      label(t, v, d) { printLabel(orderOf(d, v.o), d.set); },
      /* products */
      pOpen(t, v, d) { v.p = t.dataset.i; v.pinit = 0; render(); }, pX(t, v) { v.p = null; render(); },
      pSave(t, v, d) { return saveProduct(v, d); }, async pAll(t, v, d) { return addAll(v, d); },
      imDel(t, v) { v.IM.splice(+t.dataset.i, 1); render(); }, imL(t, v) { const i = +t.dataset.i; if (i > 0) { const x = v.IM[i]; v.IM[i] = v.IM[i - 1]; v.IM[i - 1] = x; render(); } },
      spAdd(t, v) { v.SP.push({ k: '', ka: '', val: '' }); render(); }, spDel(t, v) { v.SP.splice(+t.dataset.i, 1); render(); },
      async aiDesc(t, v, d) { return aiProduct(v, d); },
      /* categories & coupons */
      cAdd(t, v) { v.C = (v.C || []).concat([{ code: '', name: '', nameAr: '', icon: '', sort: '', active: '1' }]); render(); }, cDel(t, v) { v.C[+t.dataset.i]._del = 1; render(); }, cSave(t, v, d) { return saveCats(v, d); },
      kAdd(t, v) { v.CP = (v.CP || []).concat([{ code: '', kind: 'pct', value: '', minOrder: '', from: '', to: '', maxUses: '', active: '1' }]); render(); }, kDel(t, v) { v.CP[+t.dataset.i]._del = 1; render(); }, kSave(t, v, d) { return saveCoupons(v, d); },
      /* settings */
      sSave(t, v, d) { return saveSettings(v, d); }, async setup(t, v) { return setupLists(v); }, async test(t, v, d) { return testFlow(v, d); }, newKey(t, v) { v.skey = rndKey(); render(); },
      guide() { window.open('SHOP-SETUP.md', '_blank'); },
      barAdd(t, v) { v.BAR.push({ en: '', ar: '' }); render(); }, barDel(t, v) { v.BAR.splice(+t.dataset.i, 1); render(); },
      bnAdd(t, v) { v.BN.push({ en: '', ar: '', subEn: '', subAr: '', code: '', link: '', until: '', color: '#e11d48' }); render(); }, bnDel(t, v) { v.BN.splice(+t.dataset.i, 1); render(); },
      async promoSave(t, v, d) { const bar = v.BAR.filter(x => str(x.en) || str(x.ar)).map(x => ({ en: str(x.en), ar: str(x.ar) })), bn = v.BN.filter(x => str(x.en) || str(x.ar)).map(x => ({ en: str(x.en), ar: str(x.ar), subEn: str(x.subEn), subAr: str(x.subAr), code: str(x.code).toUpperCase(), link: str(x.link), until: x.until || '', color: x.color || '#e11d48' }));
        const s2 = Object.assign({}, d.set, { hero: Object.assign({}, d.set.hero || {}, { bar, banners: bn, deals: v.deals !== '0' }) }); try { await saveSet(s2); toast('📣 Saved — publishing to the website…', 'success'); await U.publish('button'); } catch (e) { toast(e.message, 'error'); } refresh('x_shop'); },
      webstats() { go('x_webstats'); },
      pasteT(t, v) { v.paste = !v.paste; v.pasteTxt = ''; render(); },
      async pasteGo(t, v, d) { if (v.pasteBusy) return; v.pasteBusy = 1; render(); try { const o = await U.pasteOrder(v.pasteTxt); toast('🛒 ' + o.no + ' taken · ' + (P.STATUS[o.status] || {}).en, 'success'); v.paste = false; v.pasteTxt = ''; v.o = o.id; } catch (e) { toast(e.message, 'error'); } v.pasteBusy = 0; refresh('x_shop'); },
      cSaveConn(t, v, d) { return saveConn(v, d, null); }, goLive(t, v, d) { return saveConn(v, d, 'flow'); }, goOff(t, v, d) { return saveConn(v, d, 'none'); },
      stTick(t, v) { const k = t.dataset.k; v.ST = v.ST || {}; v.ST[k] = v.ST[k] ? null : { at: iso(), by: me() }; render(); },
      async testConn(t, v, d) { await testFlow(v, d); v.testOk = /^✅/.test(v.testRes || ''); if (v.testOk) await saveConn(v, d, null, true); },
      sheet(t, v, d) { printSheet(v, d); },
      async ghSave(t, v) { const c = { owner: str(v.ghOwner), repo: str(v.ghRepo).replace(/\.git$/, ''), branch: str(v.ghBranch) || 'main', path: str(v.ghPath).replace(/^\/+|\/+$/g, '') || 'erp/shop/data', token: str(v.ghToken) };
        if (!c.owner || !c.repo || !c.token) return toast('Fill in owner, repository and token', 'warn'); v.ghRes = 'Checking…'; render();
        try { const r = await U.ghTest(c); U.ghSet(c); v.ghRes = '✅ ' + r + ' — publishing to the website…'; render(); await U.publish('button'); v.ghRes = '✅ ' + r + ' — the website data is up to date'; } catch (e) { v.ghRes = '❌ ' + e.message; } render(); },
      async ghPush(t, v) { try { await U.publish('button'); v.ghRes = '✅ Pushed'; } catch (e) { v.ghRes = '❌ ' + e.message; } render(); },
      ghForget(t, v) { if (!confirm('Remove the GitHub token from this browser? ORBIT stops updating the website.')) return; U.ghSet(null); v.ghInit = 0; v.ghRes = ''; render(); },
      async files(t, v) { if (v.fBusy) return; v.fBusy = 'Publishing…'; render(); try { const r = await U.websiteFiles(n => { v.fBusy = 'Adding ' + n; render(); }); toast('📦 Downloaded: ' + r.products + ' products, ' + r.files + ' files', 'success'); } catch (e) { toast(e.message, 'error'); } v.fBusy = ''; render(); } } });
  function pasteCard(v, d) {
    const m = P.parseOrderCode(v.pasteTxt || ''), I = new Map(((d.prods || [])).map(p => [p.code, p]));
    return H.card('Order from WhatsApp / e-mail', `<span class="mb-hint">Paste the customer's whole message (it contains a code starting with ORBIT1:). Prices are taken from ORBIT, not from the message.</span><textarea id="shPaste" rows="5" style="width:100%;font:13px ui-monospace,Consolas,monospace" placeholder="ORBIT1:…">${esc(v.pasteTxt || '')}</textarea>`
      + (m ? `<div class="ei-kv"><span>Order</span><b>${esc(m.no)} · ${esc(m.customer.name)} · +${esc(P.phone(m.customer.phone))}</b></div><div class="ei-kv"><span>Deliver to</span><b>${esc([m.address.line, m.address.area, emName(m.address.emirate)].filter(Boolean).join(', '))}</b></div><div class="ei-kv"><span>Payment</span><b>${esc((P.PAY[m.pay] || {}).en || m.pay)}${m.coupon ? ' · coupon ' + esc(m.coupon) : ''}</b></div>`
        + m.cart.map(x => `<div class="ei-kv"><span>${esc(x.c)} · ${esc((I.get(x.c) || {}).name || '?')}</span><b>× ${fq(x.q)}</b></div>`).join('') + `<div class="ei-kv"><span>Total shown to the customer</span><b>${n2(m.total)}</b></div>${H.btn(v.pasteBusy ? '⏳ Taking the order…' : '✓ Take this order', 'pasteGo')}`
        : (v.pasteTxt ? '<div class="mb-hint mb-bad">No order code found in this text.</div>' : '')));
  }
  document.addEventListener('input', e => { if (e.target && e.target.id === 'shPaste') { const v = V(); v.pasteTxt = e.target.value; clearTimeout(pasteCard.t); pasteCard.t = setTimeout(() => { const a = document.activeElement, pos = a && a.id === 'shPaste' ? a.selectionStart : null; render(); if (pos != null) { const x = document.querySelector('#shPaste'); if (x) { x.focus(); x.selectionStart = x.selectionEnd = pos; } } }, 400); } });

  /* ---------- website connection: why, what works now, and the set-up model for later ---------- */
  const CSTEPS = [
    ['svc', 'Connection service chosen: the free ORBIT shop gateway (Cloudflare) — or a Power Automate Premium flow'],
    ['lists', 'Shop lists created in SharePoint', (d, s) => !d.missing],
    ['pub', 'Products published (SharePoint folder OrbitShop exists)', (d, s) => !!s.lastPublish],
    ['app', 'Gateway: Azure app registration with a client secret and the Microsoft Graph permission for the SharePoint site'],
    ['deploy', 'Gateway deployed with its settings (TENANT_ID, CLIENT_ID, CLIENT_SECRET, SITE_URL) — or the flow built'],
    ['card', 'Card company keys added to the gateway / flow', null, s => !(s.payMethods || []).includes('card')],
    ['url', 'Service address saved in ORBIT (below)', (d, s, v) => !!str(v.sapi)],
    ['test', 'Connection test passed', (d, s) => !!(s.setup || {}).testOkAt],
    ['order', 'A test order from the website arrived in ORBIT'],
    ['live', 'Switched to "Connected" (the website switches by itself at the next publish)', (d, s) => s.connection === 'flow']];
  function connView(v, d, set) {
    if (d.missing) return H.card('', '<div class="mb-hint mb-bad">Set up the shop lists first (Settings).</div>');
    const su = set.setup || {};
    if (!v.cinit) { v.cinit = 1; Object.assign(v, { sapi: set.apiUrl, cOwner: su.owner || '', cEnv: su.env || '', cFlow: su.flowName || 'orbit-shop-gateway', cHost: su.host || '', cMid: su.mid || '', cCardMode: su.cardMode || 'test', cKeys: su.keysWith || '', cNotes: su.notes || '', ST: Object.assign({}, su.steps || {}) }); }
    const live = set.connection === 'flow', st = CSTEPS.filter(x => !(x[3] && x[3](set))), done = x => (x[2] ? x[2](d, set, v) : !!(v.ST || {})[x[0]]), n = st.filter(done).length;
    return H.card(live ? '🟢 Connected — orders go straight into SharePoint' : '🟡 Not connected yet — the shop works by WhatsApp / e-mail', live
        ? `<div class="mb-hint">The website sends every order, transfer proof and cancel request straight into Shop_Inbox through the connection service, shows tracking pages and takes card payments. ORBIT picks the orders up every minute while a shop page is open.</div>${H.sbtn('Switch back to WhatsApp / e-mail orders', 'goOff')}`
        : `<div class="mb-hint" style="line-height:1.6">Until the connection service is ready:<br>• <b>Products, prices, stock, photos and order tracking</b>: ORBIT sends them straight to the website on GitHub (card below) — or ${H.sbtn(v.fBusy ? '⏳ ' + esc(v.fBusy) : '📦 Download website files', 'files')} and upload the <b>data</b> folder yourself.<br>• <b>Orders</b>: the website sends the order by WhatsApp (or e-mail) with a code; paste the message in <b>Orders → 📋 Order from WhatsApp / e-mail</b>. Everything after that is the same: sales order, stock, warehouse, delivery, finance.<br>• <b>Payments</b>: cash on delivery and bank transfer (proof by WhatsApp). Card payment needs the connection service.<br>• <b>Customer updates</b>: the tracking page on the website (sent through GitHub) and the 💬 WhatsApp customer button on each order.</div>`)
      + ghCard(v)
      + H.card('Why a connection service is needed', `<div class="mb-hint" style="line-height:1.6">Your data is in SharePoint, and SharePoint only answers people who are signed in with a Microsoft account of your company. Website customers are anonymous, so something online must stand in between that is signed in to SharePoint and still accepts requests from the public. It does five things:<br>1. gives the website the product list and photos · 2. saves each order into Shop_Inbox · 3. shows the customer their tracking page · 4. receives transfer proofs and cancel requests · 5. talks to the card company with the secret keys (they must never be in the website).<br><b>Two ways</b>: ① the <b>ORBIT shop gateway</b> — a small free Cloudflare Worker in your package (shop-gateway/orbit-shop-gateway.js), no Premium licence needed (recommended); ② a Power Automate flow with the Premium licence. Both use the same address below. Steps: SHOP-SETUP.md.</div>`)
      + H.card(`Set-up for later · ${n} of ${st.length} done`, `<div style="height:8px;border-radius:6px;background:#e2e8f0;margin:2px 0 12px"><div style="height:8px;border-radius:6px;width:${Math.round(n * 100 / st.length)}%;background:#15803d"></div></div>`
        + st.map(x => { const ok = done(x), auto = !!x[2], tk = (v.ST || {})[x[0]]; return `<div class="ei-kv"><span>${ok ? '✅' : '⬜'} ${esc(x[1])}${tk && !auto ? ` <small style="color:#64748b">· ${esc(uname(tk.by))} ${tm(tk.at)}</small>` : ''}</span><b>${auto ? '<small style="color:#64748b">automatic</small>' : H.sbtn(ok ? 'Undo' : 'Done', 'stTick', `data-k="${x[0]}"`)}</b></div>`; }).join(''))
      + H.card('Connection details', `<div class="fin-row">${H.f('Service', H.sel('cEnv', [['gateway', 'ORBIT shop gateway (Cloudflare, free)'], ['flow', 'Power Automate flow (Premium)']], { ph: '— choose —' }))}${H.f('Owner account', H.inp('cOwner', { ph: 'it@company.ae' }))}${H.f('Name', H.inp('cFlow'))}</div>
        ${H.f('Service address', H.inp('sapi', { ph: 'https://orbit-shop-gateway.<you>.workers.dev  ·  or the flow HTTP POST URL' }))}
        <div class="fin-row">${H.f('Where the website is hosted', H.inp('cHost', { ph: 'GitHub Pages · shop.company.ae' }))}${H.f('SharePoint site (files go to Documents › OrbitShop)', `<input value="${esc((typeof getGlobalSiteUrl === 'function' && getGlobalSiteUrl()) || '')}" disabled>`)}</div>
        ${(set.payMethods || []).includes('card') ? `<div class="fin-row">${H.f('Card company', `<input value="${esc({ ngenius: 'Network International (N-Genius)', stripe: 'Stripe', telr: 'Telr' }[set.cardProvider] || '— choose in Settings —')}" disabled>`)}${H.f('Merchant / store / outlet ID (not the secret key)', H.inp('cMid'))}${H.f('Mode', H.sel('cCardMode', [['test', 'Test keys'], ['live', 'Live keys']], { ph: false }))}</div>${H.f('Who keeps the secret keys (they go only into the flow)', H.inp('cKeys', { ph: 'Finance manager' }))}` : '<div class="mb-hint">Card payments are off (Settings → Payment). Turn them on if you want them with the flow.</div>'}
        ${H.f('Notes', H.txt('cNotes'))}
        <div class="mx-acts">${H.sbtn('💾 Save', 'cSaveConn', '', 'p')}${H.sbtn('🔌 Test the connection', 'testConn')}${H.sbtn('🖨 Print the set-up sheet', 'sheet')}${H.sbtn('📘 Full guide', 'guide')}</div>${v.testRes ? `<div class="mb-hint">${esc(v.testRes)}</div>` : ''}`)
      + (live ? '' : H.bar(`<div class="mb-row">${H.btn('🟢 Switch to "Connected"', 'goLive')}</div>`));
  }
  function ghCard(v) {
    const c = U.ghCfg() || {}, G = U.GH(); if (!v.ghInit) { v.ghInit = 1; Object.assign(v, { ghOwner: c.owner || '', ghRepo: c.repo || '', ghBranch: c.branch || 'main', ghPath: c.path || 'erp/shop/data', ghToken: c.token || '' }); }
    return H.card((U.ghOn() ? '🟢' : '⚪') + ' Website on GitHub — ORBIT pushes the data itself', `<div class="mb-hint" style="line-height:1.6">The shop website is in your ORBIT GitHub repository (folder <b>erp/shop</b> · <a href="shop/" target="_blank" rel="noopener">open the shop ↗</a>). With a GitHub token, ORBIT commits the catalogue, photos and tracking files into <b>${esc(v.ghPath || 'erp/shop/data')}</b> on its own: after every publish, after orders change, and every 5 minutes (one commit for all changes; GitHub Pages shows them about a minute later).<br>Token: GitHub → Settings → Developer settings → <b>Fine-grained token</b> → only this repository → <b>Contents: Read and write</b>. It is kept <b>only in this browser</b> (not in SharePoint, not on the website); use it on the PC that stays open with ORBIT.</div>
      <div class="fin-row">${H.f('GitHub owner (user or organisation)', H.inp('ghOwner', { ph: 'alnajjar' }))}${H.f('Repository', H.inp('ghRepo', { ph: 'orbit' }))}${H.f('Branch', H.inp('ghBranch'))}${H.f('Data folder in the repository', H.inp('ghPath'))}</div>
      ${H.f('Token (github_pat_…)', H.inp('ghToken', { type: 'password', ph: 'github_pat_…' }))}
      <div class="mx-acts">${H.sbtn('💾 Save on this computer & test', 'ghSave', '', 'p')}${U.ghOn() ? H.sbtn(G.busy ? '⏳ Sending…' : '⬆ Push now', 'ghPush') + H.sbtn('Forget the token', 'ghForget', '', 'r') : ''}</div>
      ${v.ghRes ? `<div class="mb-hint">${esc(v.ghRes)}</div>` : ''}${U.ghOn() ? `<div class="mb-hint">${G.at ? 'Last push ' + tm(new Date(G.at).toISOString()) + ' · ' + esc(G.last) : 'Nothing pushed yet in this session'}${G.q.size ? ' · ' + G.q.size + ' change(s) waiting' : ''}${G.err ? ' · <b style="color:#dc2626">⚠ ' + esc(G.err) + '</b>' : ''}</div>` : ''}`);
  }
  async function saveConn(v, d, mode, quiet) {
    const s = Object.assign({}, d.set), su = Object.assign({}, s.setup || {}, { owner: str(v.cOwner), env: str(v.cEnv), flowName: str(v.cFlow), host: str(v.cHost), mid: str(v.cMid), cardMode: v.cCardMode || 'test', keysWith: str(v.cKeys), notes: v.cNotes || '', steps: v.ST || {} });
    if (v.testOk) su.testOkAt = iso(); s.setup = su; s.apiUrl = str(v.sapi);
    if (s.apiUrl && !/^https:\/\//.test(s.apiUrl)) return toast('The service address must start with https://', 'warn');
    if (mode === 'flow') { if (!s.apiUrl) return toast('Save the service address first', 'warn'); if (!su.testOkAt) return toast('Run "Test the connection" first — it must pass', 'warn'); if (!confirm('Switch the shop to "Connected"?\n\nAt the next publish the website starts sending orders straight in (and shows card payment, if on).')) return; }
    if (mode === 'none' && !confirm('Switch back to WhatsApp / e-mail orders? Card payment disappears from the website after the next publish.')) return;
    if (mode) s.connection = mode;
    try { await saveSet(s); if (!quiet) toast('💾 Saved', 'success'); if (mode) await U.publish('button'); } catch (e) { toast(e.message, 'error'); } refresh('x_shop');
  }
  /* saving settings adds new columns if the list is older than this version */
  async function saveSet(s) { const f = P.setToFields(s), d = K.D.x_shop || {};
    try { if (s.row) await K.A().upd('Shop_Settings', s.row.id, f); else await K.A().add('Shop_Settings', f); }
    catch (e) { if (!/not recognized|does not exist/i.test(e.message)) throw e; await FU.setupLists({ Shop_Settings: P.LISTS.Shop_Settings }); if (s.row) await K.A().upd('Shop_Settings', s.row.id, f); else await K.A().add('Shop_Settings', f); }
    K.drop('Shop_Settings'); }
  function printSheet(v, d) {
    const s = d.set, st = CSTEPS.filter(x => !(x[3] && x[3](s))), row = (a, b) => `<tr><td style="color:#555;width:38%">${esc(a)}</td><td><b>${esc(b || '________________________')}</b></td></tr>`;
    printHtml('Online shop — connection set-up', `<h2 style="margin:0">ONLINE SHOP · CONNECTION SET-UP</h2><p>${esc(s.shopName)} · printed ${dmy(today())}</p>
      <h3>Details</h3><table cellpadding="6" style="width:100%;border-collapse:collapse">${row('Service', v.cEnv === 'flow' ? 'Power Automate flow' : 'ORBIT shop gateway (Cloudflare Worker)')}${row('Owner account', v.cOwner)}${row('Name', v.cFlow)}${row('Service address', v.sapi)}${row('SharePoint site', (typeof getGlobalSiteUrl === 'function' && getGlobalSiteUrl()) || '')}${row('Files folder', 'Documents › OrbitShop (catalog.json, img, track, proofs)')}${row('Inbox list', 'Shop_Inbox (Title, Kind, Ref, Payload)')}${row('Website host', v.cHost)}${(s.payMethods || []).includes('card') ? row('Card company', s.cardProvider) + row('Merchant / outlet ID', v.cMid) + row('Mode', v.cCardMode) + row('Keys kept by', v.cKeys) : ''}</table>
      <h3>Checklist</h3><table cellpadding="6" style="width:100%;border-collapse:collapse">${st.map(x => `<tr><td style="width:26px">☐</td><td>${esc(x[1])}</td><td style="width:140px;border-bottom:1px solid #999"></td></tr>`).join('')}</table>
      <h3>What the service answers (details: SHOP-SETUP.md)</h3><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>Case</th><th style="text-align:left">What the flow does</th></tr>
      <tr><td>img (GET ?a=img&f=…)</td><td>Get file content OrbitShop/img/<f> → Response (image/webp, cache 7 days)</td></tr><tr><td>catalog</td><td>Get file content OrbitShop/catalog.json → Response</td></tr><tr><td>track</td><td>Get file content OrbitShop/track/<id>.json → Response (404 if missing)</td></tr>
      <tr><td>order · cancel · paid</td><td>Create item in Shop_Inbox (Title = no, Kind = a, Ref = no, Payload = the message) → {"ok":true}</td></tr><tr><td>proof</td><td>Create file OrbitShop/proofs/… from the picture → Create item in Shop_Inbox → {"ok":true}</td></tr>
      ${(s.payMethods || []).includes('card') ? '<tr><td>pay</td><td>Card company: create payment page → {"url","ref"}</td></tr><tr><td>paycheck</td><td>Card company: is it paid? → {"paid","amount","state"}</td></tr>' : ''}</table>
      <h3>Gateway settings (Cloudflare → Worker → Settings → Variables and Secrets)</h3><pre style="background:#f3f4f6;padding:10px;border-radius:8px">TENANT_ID      = ________________\nCLIENT_ID      = ________________\nCLIENT_SECRET  = ________________ (secret)\nSITE_URL       = ${esc((typeof getGlobalSiteUrl === 'function' && getGlobalSiteUrl()) || '')}\nALLOWED_ORIGIN = ${esc(location.origin)}${(s.payMethods || []).includes('card') ? '\nCARD_PROVIDER  = ' + esc(s.cardProvider || '') + '  (+ its keys as secrets)' : ''}</pre><p>The website gets the service address automatically with the next publish after "Switch to Connected".</p>
      <p style="color:#555">Every Response has the header Access-Control-Allow-Origin: *. Card keys go only into the flow (Secure inputs/outputs on).</p>`);
  }

  /* ---------- products ---------- */
  function productsView(v, d, set) {
    const P0 = new Map((d.prods || []).map(p => [p.code, p])), items = (d.items || []).filter(i => i.active && i.kind !== 'raw');
    if (v.p != null) { const it = items.find(i => i.code === v.p) || {}, p = P0.get(v.p);
      if (!v.pinit) { v.pinit = 1; Object.assign(v, { ppub: p ? (p.published ? '1' : '0') : '1', pname: p ? p.name : it.name, pnameAr: p ? p.nameAr : (it.name_ar || ''), pcat: p ? p.category : '', pbrand: p ? p.brand : '', pprice: String(p ? p.price : r2(num(it.price) * (1 + (P.VAT[it.vat || 'S'] || 0) / 100))), pwas: p && p.wasPrice ? String(p.wasPrice) : '', pmin: p && p.minQty ? String(p.minQty) : '', pmax: p && p.maxQty ? String(p.maxQty) : '', psort: p && p.sort ? String(p.sort) : '', pbadge: p ? p.badge : '', pfeat: p && p.featured ? '1' : '0', pback: p && p.backorder ? '1' : '0', ptags: p ? p.tags.join(', ') : '', pdescEn: p ? p.descEn : '', pdescAr: p ? p.descAr : '', pslug: p ? p.slug : '', IM: p ? p.images.slice() : [], SP: p ? p.specs.map(s => ({ k: s[0] || '', ka: s[1] || '', val: s[2] || '' })) : [] }); }
      const free = d.free ? d.free.get(v.p) : 0, cats = (d.cats || []).filter(c => c.active).map(c => [c.code, c.name]);
      return H.card('', `<div class="ei-kv"><span>Inventory item</span><b>${esc(v.p)} · ${esc(it.name || '')} · ${esc(it.uom || '')} · VAT ${esc(it.vat || 'S')}</b></div><div class="ei-kv"><span>Free to sell now</span><b>${fq(free)}</b></div><div class="ei-kv"><span>ORBIT sales price (excl. VAT)</span><b>${n2(it.price)}</b></div>`)
        + errs(v.errs)
        + H.card('On the website', `<div class="fin-row">${H.f('Show on the website', H.sel('ppub', [['1', 'Yes — published'], ['0', 'No — hidden']], { ph: false }))}${H.f('Category', H.sel('pcat', cats, { ph: cats.length ? '— category —' : 'add categories first' }))}${H.f('Brand', H.inp('pbrand'))}</div>
          <div class="fin-row">${H.f('Name (English)', H.inp('pname'))}${H.f('الاسم (Arabic)', H.inp('pnameAr'))}</div>
          <div class="fin-row">${H.f('Price incl. VAT (' + esc(set.currency) + ')', H.num('pprice'))}${H.f('Was price (shows a sale)', H.num('pwas', { ph: 'empty = no sale' }))}${H.f('Min qty', H.num('pmin', { ph: '1' }))}${H.f('Max qty per order', H.num('pmax', { ph: 'no limit' }))}</div>
          <div class="fin-row">${H.f('Badge', H.sel('pbadge', [['New', 'New'], ['Sale', 'Sale'], ['Best seller', 'Best seller'], ['Limited', 'Limited']], { ph: '— none —' }))}${H.f('Featured on home page', H.sel('pfeat', [['1', 'Yes'], ['0', 'No']], { ph: false }))}${H.f('When out of stock', H.sel('pback', [['0', 'Show "out of stock"'], ['1', 'Take pre-orders']], { ph: false }))}${H.f('Order on page', H.num('psort', { ph: '0' }))}</div>
          ${H.f('Search words / tags (comma separated)', H.inp('ptags', { ph: 'organic, family pack, offer' }))}`)
        + H.card('Description', `<div class="mx-acts" style="margin-bottom:8px">${H.sbtn(v.aiBusy ? '⏳ Writing…' : '🤖 Write with AI (English + Arabic)', 'aiDesc', '', 'p')}</div>${H.f('English', H.txt('pdescEn', 'What it is, what is inside, who it is for, size, storage…'))}${H.f('العربية', H.txt('pdescAr', 'الوصف بالعربية'))}
          <div class="mb-hint" style="margin-top:8px">Details table (e.g. Weight · الوزن · 1 kg)</div>${v.SP.map((s, i) => `<div class="inv-g"><div><label>Detail</label><input data-a="SP" data-i="${i}" data-k="k" value="${esc(s.k)}" class="sh-in"></div><div><label>بالعربية</label><input data-a="SP" data-i="${i}" data-k="ka" value="${esc(s.ka)}" class="sh-in"></div><div><label>Value</label><input data-a="SP" data-i="${i}" data-k="val" value="${esc(s.val)}" class="sh-in"></div><div><label>&nbsp;</label><button type="button" class="mx-sb r" data-x="spDel" data-i="${i}">✕</button></div></div>`).join('')}${H.sbtn('＋ Add detail', 'spAdd')}`)
        + H.card('Photos', `<span class="mb-hint">JPG / PNG / WebP. They are resized for the web and saved in SharePoint (OrbitShop/img). The first photo is the main one.</span><div class="sh-ims">${v.IM.map((m, i) => `<span>${m.th ? `<img src="${m.th}" alt="">` : m.url ? `<img src="${esc(m.url)}" alt="">` : '🖼'}<b><button type="button" data-x="imL" data-i="${i}" title="Move first">◀</button><button type="button" data-x="imDel" data-i="${i}" title="Remove">✕</button></b></span>`).join('')}</div>
          <input id="shopImg" type="file" accept="image/*" multiple>${v.imBusy ? `<div class="mb-hint">⏳ ${esc(v.imBusy)}</div>` : ''}<div class="fin-row" style="margin-top:8px">${H.f('…or a photo address (https://…)', H.inp('purl', { ph: 'https://' }))}</div>`)
        + H.bar(`<div class="mb-row">${H.btn('← Products', 'pX', 's')}${H.btn('💾 Save & publish', 'pSave')}</div>`);
    }
    const q = lc(v.q || ''), f = v.pf || 'all';
    const rows = items.filter(i => !q || lc(i.code + ' ' + i.name + ' ' + (i.category || '')).includes(q)).map(i => ({ i, p: P0.get(i.code) })).filter(x => f === 'all' || (f === 'on' ? x.p && x.p.published : !(x.p && x.p.published)));
    return H.kpis([['On the website', String((d.prods || []).filter(p => p.published).length)], ['Items not on the website', String(items.filter(i => !(P0.get(i.code) || {}).published).length)], ['Out of stock (on the web)', String((d.prods || []).filter(p => p.published && d.free && num(d.free.get(p.code)) <= 0).length)], ['Last publish', set.lastPublish ? tm(set.lastPublish) : 'never']])
      + H.tabs('pf', [['all', 'All items'], ['on', 'On the website'], ['off', 'Not on the website']], 'all') + H.search('q', 'Search items')
      + H.card('', table([{ k: 'c', t: 'Item' }, { k: 'n', t: 'Name on the web' }, { k: 'cat', t: 'Category' }, { k: 'pr', t: 'Price incl. VAT', n: 1 }, { k: 'f', t: 'Free stock', n: 1 }, { k: 'ph', t: 'Photos' }, { k: 's', t: '', raw: 1 }], rows.map(({ i, p }) => ({ c: i.code, n: p ? p.name : i.name, cat: p ? p.category : '', pr: p ? p.price : '', f: d.free ? d.free.get(i.code) : '', ph: p ? String(p.images.length) : '', s: p && p.published ? '<span class="mb-pill ei-st" style="--c:#15803d">On the web</span>' : '<span class="mb-pill ei-st" style="--c:#94a3b8">Hidden</span>', _tap: i.code })), null, 'pOpen'))
      + H.bar(`<div class="mb-row">${H.btn('＋ Add all items (hidden)', 'pAll', 's')}${H.btn('🌐 Publish to website', 'pub')}</div>`);
  }
  document.addEventListener('input', e => { const t = e.target; if (t && t.classList && t.classList.contains('sh-in') && t.dataset.a) { const v = V(), a = v[t.dataset.a]; if (a && a[+t.dataset.i]) a[+t.dataset.i][t.dataset.k] = t.value; } });
  document.addEventListener('change', async e => { const t = e.target; if (!t || t.id !== 'shopImg' || !t.files || !t.files.length) return; const v = V();
    for (const f of t.files) { if (f.size > 15e6) { toast(f.name + ' is larger than 15 MB', 'warn'); continue; } v.imBusy = 'Saving ' + f.name + '…'; render(); try { v.IM.push(await U.photo(f, v.p)); } catch (x) { toast(x.message, 'error'); } }
    v.imBusy = ''; render(); });
  async function saveProduct(v, d) {
    const E2 = []; if (!str(v.pname)) E2.push('English name is required'); if (!(num(v.pprice) > 0)) E2.push('Price must be more than zero'); if (v.pwas && num(v.pwas) <= num(v.pprice)) E2.push('"Was price" must be higher than the price');
    if (v.pmax && num(v.pmax) < num(v.pmin || 1)) E2.push('Max qty is below min qty'); if (E2.length) { v.errs = E2; render(); return; }
    if (str(v.purl)) { if (!/^https:\/\//.test(str(v.purl))) { v.errs = ['The photo address must start with https://']; render(); return; } v.IM.push({ url: str(v.purl) }); v.purl = ''; }
    const p0 = (d.prods || []).find(p => p.code === v.p), p = { code: v.p, name: str(v.pname), nameAr: str(v.pnameAr), published: v.ppub === '1', category: v.pcat || '', brand: str(v.pbrand), price: num(v.pprice), wasPrice: num(v.pwas), minQty: num(v.pmin), maxQty: num(v.pmax), sort: num(v.psort), badge: v.pbadge || '', featured: v.pfeat === '1', backorder: v.pback === '1',
      tags: String(v.ptags || '').split(',').map(s => s.trim()).filter(Boolean), descEn: v.pdescEn || '', descAr: v.pdescAr || '', images: v.IM, specs: v.SP.filter(s => str(s.k) || str(s.val)).map(s => [str(s.k), str(s.ka), str(s.val)]), slug: v.pslug || '' };
    try { const f = P.prodToFields(p); if (p0) await K.A().upd('Shop_Products', p0.id, f); else await K.A().add('Shop_Products', f); K.drop('Shop_Products');
      toast('💾 Saved — publishing…', 'success'); v.p = null; await U.publish('button'); refresh('x_shop'); } catch (e) { v.errs = [e.message]; render(); }
  }
  async function addAll(v, d) {
    const have = new Set((d.prods || []).map(p => p.code)), add = (d.items || []).filter(i => i.active && i.kind !== 'raw' && !have.has(i.code)); if (!add.length) return toast('Every item already has a web page', 'info');
    if (!confirm('Add ' + add.length + ' item(s) to the shop as hidden pages? You then add photos, check the price and publish each one.')) return;
    try { for (const i of add) await K.A().add('Shop_Products', P.prodToFields({ code: i.code, name: i.name, nameAr: i.name_ar || '', published: false, price: r2(num(i.price) * (1 + (P.VAT[i.vat || 'S'] || 0) / 100)), images: [], specs: [], tags: [] })); K.drop('Shop_Products'); toast('✅ ' + add.length + ' added (hidden)', 'success'); } catch (e) { toast(e.message, 'error'); } refresh('x_shop');
  }
  async function aiProduct(v, d) {
    const L2 = window.LIM, cfg = L2 && L2.aiCfg ? L2.aiCfg() : { key: '' }; if (!cfg || !cfg.key) return toast('AI is not set up — an administrator adds the Gemini key in Settings → AI', 'warn');
    v.aiBusy = 1; render();
    try { const it = (d.items || []).find(i => i.code === v.p) || {}, prompt = `Write shop product content for an online store in the UAE. Product: "${str(v.pname) || it.name}". Brand: ${str(v.pbrand) || '-'}. Category: ${v.pcat || it.category || '-'}. Unit: ${it.uom || '-'}. Notes from the seller: ${str(v.pdescEn) || '-'}.
Return ONLY JSON: {"en": "2 short paragraphs, friendly, factual, no invented claims or numbers", "ar": "the same in natural Modern Standard Arabic", "nameAr": "the product name in Arabic", "tags": "6 comma separated search words"}`;
      const out = await L2.aiCall(cfg, [{ text: prompt }], false), m = String(out || '').match(/\{[\s\S]*\}/), j = m ? JSON.parse(m[0]) : null; if (!j) throw new Error('The AI answer could not be read');
      v.pdescEn = j.en || v.pdescEn; v.pdescAr = j.ar || v.pdescAr; if (!str(v.pnameAr) && j.nameAr) v.pnameAr = j.nameAr; if (!str(v.ptags) && j.tags) v.ptags = j.tags; toast('🤖 Written — check it before saving', 'success'); } catch (e) { toast(e.message, 'error'); }
    v.aiBusy = 0; render();
  }

  /* ---------- categories ---------- */
  function catsView(v, d) {
    if (!v.C) v.C = (d.cats || []).slice().sort((a, b) => a.sort - b.sort).map(c => ({ id: c.id, code: c.code, name: c.name, nameAr: c.nameAr, icon: c.icon, sort: String(c.sort || ''), active: c.active ? '1' : '0' }));
    const row = (c, i) => c._del ? '' : `<div class="inv-g" style="grid-template-columns:1fr 1.4fr 1.4fr .6fr .6fr .8fr auto"><div><label>Code</label><input class="sh-in" data-a="C" data-i="${i}" data-k="code" value="${esc(c.code)}" placeholder="dairy"></div><div><label>Name</label><input class="sh-in" data-a="C" data-i="${i}" data-k="name" value="${esc(c.name)}"></div><div><label>الاسم</label><input class="sh-in" data-a="C" data-i="${i}" data-k="nameAr" value="${esc(c.nameAr)}"></div><div><label>Icon</label><input class="sh-in" data-a="C" data-i="${i}" data-k="icon" value="${esc(c.icon)}" placeholder="🥛"></div><div><label>Order</label><input class="sh-in" data-a="C" data-i="${i}" data-k="sort" value="${esc(c.sort)}"></div><div><label>Active</label><select class="sh-in" data-a="C" data-i="${i}" data-k="active"><option value="1"${c.active === '1' ? ' selected' : ''}>Yes</option><option value="0"${c.active !== '1' ? ' selected' : ''}>No</option></select></div><div><label>&nbsp;</label><button type="button" class="mx-sb r" data-x="cDel" data-i="${i}">✕</button></div></div>`;
    return H.card('Categories on the website', `<span class="mb-hint">Shown as the shop menu and on the home page. The code is used in links (letters, numbers, dashes).</span>${v.C.map(row).join('')}${H.sbtn('＋ Add category', 'cAdd')}`) + H.bar(H.btn('💾 Save & publish', 'cSave'));
  }
  document.addEventListener('change', e => { const t = e.target; if (t && t.tagName === 'SELECT' && t.classList.contains('sh-in') && t.dataset.a) { const v = V(), a = v[t.dataset.a]; if (a && a[+t.dataset.i]) a[+t.dataset.i][t.dataset.k] = t.value; } });
  async function saveCats(v, d) {
    const live = v.C.filter(c => !c._del), codes = live.map(c => P.slug(c.code || c.name)); if (live.some(c => !str(c.name))) return toast('Every category needs a name', 'warn'); if (new Set(codes).size !== codes.length) return toast('Two categories have the same code', 'warn');
    try { for (const c of v.C) { const f = { Title: str(c.name), Code: P.slug(c.code || c.name), NameAr: str(c.nameAr), Icon: str(c.icon), Sort: num(c.sort), Active: c.active === '0' ? '0' : '1' };
        if (c._del && c.id) await K.A().upd('Shop_Categories', c.id, { Active: '0' }); else if (!c._del) { if (c.id) await K.A().upd('Shop_Categories', c.id, f); else await K.A().add('Shop_Categories', f); } }
      K.drop('Shop_Categories'); v.C = null; toast('💾 Categories saved', 'success'); await U.publish('button'); } catch (e) { toast(e.message, 'error'); } refresh('x_shop');
  }
  /* ---------- coupons ---------- */
  function couponsView(v, d) {
    if (!v.CP) v.CP = (d.cpns || []).map(c => ({ id: c.id, code: c.code, kind: c.kind, value: String(c.value || ''), minOrder: c.minOrder ? String(c.minOrder) : '', from: c.from, to: c.to, maxUses: c.maxUses ? String(c.maxUses) : '', used: c.used, active: c.active ? '1' : '0' }));
    const inp = (c, i, k, ph, ty) => `<input class="sh-in" data-a="CP" data-i="${i}" data-k="${k}" value="${esc(c[k] || '')}" placeholder="${ph || ''}"${ty ? ' type="' + ty + '"' : ''}>`;
    const row = (c, i) => c._del ? '' : `<div class="inv-g" style="grid-template-columns:1.1fr 1.1fr .7fr .8fr 1fr 1fr .7fr .7fr auto"><div><label>Code</label>${inp(c, i, 'code', 'EID10')}</div><div><label>Type</label><select class="sh-in" data-a="CP" data-i="${i}" data-k="kind">${[['pct', '% off'], ['amt', 'Amount off'], ['ship', 'Free delivery']].map(([k, t]) => `<option value="${k}"${c.kind === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div><div><label>Value</label>${inp(c, i, 'value', '10')}</div><div><label>Min order</label>${inp(c, i, 'minOrder', '0')}</div><div><label>From</label>${inp(c, i, 'from', '', 'date')}</div><div><label>To</label>${inp(c, i, 'to', '', 'date')}</div><div><label>Max uses</label>${inp(c, i, 'maxUses', '∞')}</div><div><label>Used</label><input value="${num(c.used)}" disabled></div><div><label>&nbsp;</label><button type="button" class="mx-sb r" data-x="kDel" data-i="${i}">✕</button></div></div>`;
    return H.card('Coupon codes', `<span class="mb-hint">Customers type the code at checkout. The website only receives a scrambled form of each code, so codes cannot be read from the site. ORBIT checks dates and uses again when the order arrives.</span>${v.CP.map(row).join('')}${H.sbtn('＋ Add coupon', 'kAdd')}`) + H.bar(H.btn('💾 Save & publish', 'kSave'));
  }
  async function saveCoupons(v, d) {
    const live = v.CP.filter(c => !c._del); if (live.some(c => !/^[A-Za-z0-9_-]{3,20}$/.test(str(c.code)))) return toast('Codes: 3–20 letters / numbers', 'warn'); if (live.some(c => c.kind !== 'ship' && !(num(c.value) > 0))) return toast('Enter the value of each coupon', 'warn');
    try { for (const c of v.CP) { const f = { Title: str(c.code).toUpperCase(), Code: str(c.code).toUpperCase(), Kind: c.kind, Value: num(c.value), MinOrder: num(c.minOrder), ValidFrom: c.from || '', ValidTo: c.to || '', MaxUses: num(c.maxUses), Active: c._del ? '0' : '1' };
        if (c.id) await K.A().upd('Shop_Coupons', c.id, f); else if (!c._del) await K.A().add('Shop_Coupons', Object.assign(f, { Used: 0 })); }
      K.drop('Shop_Coupons'); v.CP = null; toast('💾 Coupons saved', 'success'); await U.publish('button'); } catch (e) { toast(e.message, 'error'); } refresh('x_shop');
  }
  /* ---------- offers & advertising on the website ---------- */
  function promoView(v, d, set) {
    const h = set.hero || {}; if (!v.BAR) { v.BAR = (h.bar || []).map(x => Object.assign({}, x)); v.BN = (h.banners || []).map(x => Object.assign({}, x)); v.deals = h.deals === false ? '0' : '1'; }
    const cats = (d.cats || []).filter(c => c.active), inp = (a, i, k, ph, ty) => `<input class="sh-in" data-a="${a}" data-i="${i}" data-k="${k}" value="${esc((v[a][i] || {})[k] || '')}" placeholder="${esc(ph || '')}"${ty ? ' type="' + ty + '"' : ''}>`;
    const sale = (d.prods || []).filter(p => p.published && p.wasPrice > p.price).length, cp = (d.cpns || []).filter(c => c.active).map(c => c.code);
    return H.card('📣 Advertising bar (top of every page, the messages take turns)', `<span class="mb-hint">Short and exciting: offers, free delivery, new arrivals. Leave empty to show automatic messages (free delivery from…, cash on delivery…).</span>`
        + v.BAR.map((x, i) => `<div class="inv-g" style="grid-template-columns:1fr 1fr auto"><div><label>English</label>${inp('BAR', i, 'en', '🔥 Weekend sale — up to 30% off honey')}</div><div><label>العربية</label>${inp('BAR', i, 'ar', '🔥 عروض نهاية الأسبوع — خصم حتى 30%')}</div><div><label>&nbsp;</label><button type="button" class="mx-sb r" data-x="barDel" data-i="${i}">✕</button></div></div>`).join('') + (v.BAR.length < 6 ? H.sbtn('＋ Add message', 'barAdd') : ''))
      + H.card('🎯 Offer banners (big slides on the home page)', `<span class="mb-hint">Each banner can show a coupon code (customers tap to copy it), a countdown until the offer ends, and a button to a category or product. Coupons: Online Shop → Coupons${cp.length ? ' (active: ' + esc(cp.join(', ')) + ')' : ''}.</span>`
        + v.BN.map((x, i) => `<div class="card" style="padding:12px;margin:10px 0;border:1px solid var(--border,#e2e8f0);border-inline-start:5px solid ${esc(x.color || '#e11d48')}"><div class="inv-g" style="grid-template-columns:1fr 1fr"><div><label>Title</label>${inp('BN', i, 'en', 'Ramadan offers')}</div><div><label>العنوان</label>${inp('BN', i, 'ar', 'عروض رمضان')}</div></div>
          <div class="inv-g" style="grid-template-columns:1fr 1fr"><div><label>Line</label>${inp('BN', i, 'subEn', '20% off all dates and honey')}</div><div><label>السطر</label>${inp('BN', i, 'subAr', 'خصم 20% على التمور والعسل')}</div></div>
          <div class="inv-g" style="grid-template-columns:1fr 1.2fr 1.3fr .6fr auto"><div><label>Coupon code</label>${inp('BN', i, 'code', 'RAMADAN20')}</div><div><label>Button opens</label><select class="sh-in" data-a="BN" data-i="${i}" data-k="link"><option value="">All products</option><option value="#deals"${x.link === '#deals' ? ' selected' : ''}>🔥 Deals</option>${cats.map(c => `<option value="c:${esc(c.code)}"${x.link === 'c:' + c.code ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}${(d.prods || []).filter(p => p.published).map(p => `<option value="p:${esc(p.code)}"${x.link === 'p:' + p.code ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div><div><label>Ends (countdown)</label>${inp('BN', i, 'until', '', 'datetime-local')}</div><div><label>Colour</label>${inp('BN', i, 'color', '', 'color')}</div><div><label>&nbsp;</label><button type="button" class="mx-sb r" data-x="bnDel" data-i="${i}">✕</button></div></div></div>`).join('') + (v.BN.length < 6 ? H.sbtn('＋ Add banner', 'bnAdd') : ''))
      + H.card('🔥 Deals section', `<div class="fin-row">${H.f('Show "Deals" on the home page (products with a "was" price, biggest discount first)', H.sel('deals', [['1', 'Yes'], ['0', 'No']], { ph: false }))}</div><span class="mb-hint">${sale} product(s) on sale now — set a "Was price" on a product to put it in Deals.</span>`)
      + H.card('📊 Visitors', `<span class="mb-hint">Visits, products viewed, added to cart and orders from the shop are in <b>Website traffic</b> (once the shop is connected).</span> ${H.sbtn('Open Website traffic', 'webstats')}`)
      + H.bar(H.btn('💾 Save & publish', 'promoSave'));
  }

  /* ---------- report ---------- */
  function bars(obj, label, c) { const e = Object.entries(obj).sort((a, b) => b[1].v - a[1].v), mx = Math.max(1, ...e.map(x => x[1].v)); return e.length ? `<div class="sh-bars" style="--c:${c}">${e.map(([k, x]) => `<div><span>${esc(label(k))} · ${x.n}</span><i style="width:${Math.max(2, x.v * 100 / mx)}%"></i><b>${n2(x.v)}</b></div>`).join('')}</div>` : H.empty('No orders'); }
  function reportView(v, d, set) {
    const per = v.per || today().slice(0, 7), from = per + '-01', to = per + '-31', s = P.summary(d.orders, from, to), days = {};
    (d.orders || []).filter(o => o.status !== 'cancelled' && String(o.placedAt).slice(0, 7) === per).forEach(o => { const k = String(o.placedAt).slice(8, 10); days[k] = days[k] || { n: 0, v: 0 }; days[k].n++; days[k].v = r2(days[k].v + o.total); });
    return H.card('', `<div class="fin-row">${H.f('Month', H.inp('per', { type: 'month', val: per }))}</div>`) + H.kpis([['Orders', String(s.orders)], ['Sales incl. VAT', n2(s.sales)], ['Average order', n2(s.aov)], ['Cancelled', String((d.orders || []).filter(o => o.status === 'cancelled' && String(o.placedAt).slice(0, 7) === per).length)]])
      + H.card('Sales per day', bars(Object.fromEntries(Object.entries(days).sort()), k => per + '-' + k, '#6d3fd9')) + H.card('By payment', bars(s.byPay, k => (P.PAY[k] || { en: k }).en, '#0f766e')) + H.card('By emirate', bars(s.byEmirate, emName, '#1d4ed8'))
      + H.card('Best sellers', s.products.length ? table([{ k: 'c', t: 'Item' }, { k: 'n', t: 'Name' }, { k: 'q', t: 'Qty', n: 1 }, { k: 'v', t: 'Sales incl. VAT', n: 1 }], s.products.slice(0, 20).map(p => ({ c: p.code, n: p.name, q: p.q, v: p.v }))) : H.empty('No sales'));
  }
  /* ---------- settings ---------- */
  const rndKey = () => { const a = new Uint8Array(9); crypto.getRandomValues(a); return [...a].map(x => x.toString(36).padStart(2, '0')).join('').slice(0, 14); };
  function settingsView(v, d, set) {
    if (!v.sinit) { v.sinit = 1; const s = set, pol = s.policies || {}, hero = s.hero || {};
      Object.assign(v, { sname: s.shopName, snameAr: s.shopNameAr, skey: s.shopKey || rndKey(), sapi: s.apiUrl, ssite: s.siteUrl, sprefix: s.orderPrefix, swh: s.wh, ssp: s.salesperson, pcod: s.payMethods.includes('cod') ? '1' : '0', pbank: s.payMethods.includes('bank') ? '1' : '0', pcard: s.payMethods.includes('card') ? '1' : '0', scard: s.cardProvider,
        aCard: s.accCard, aBank: s.accBank, aCash: s.accCash, sphone: s.phone, swa: s.whatsapp, semail: s.email, scolor: s.color, slogo: s.logo, sfee: String(s.deliveryFee || ''), sfree: String(s.freeOver || ''), smin: String(s.minOrder || ''), scod: String(s.codFee || ''), scodmax: String(s.codMax || ''),
        sslots: (s.slots || []).join(', '), slead: String(s.leadDays), slow: String(s.lowStock), sshow: s.stockShow, sauto: s.autoConfirm ? '1' : '0', shold: s.holdUnpaid ? '1' : '0', sunpaid: String(s.unpaidDays), smail: s.emailCustomer ? '1' : '0', sloc: s.liveLocation ? '1' : '0', sbank: s.bankDetails,
        polRetEn: pol.returnsEn || '', polRetAr: pol.returnsAr || '', polTermsEn: pol.termsEn || '', polTermsAr: pol.termsAr || '', polDelEn: pol.deliveryEn || '', polDelAr: pol.deliveryAr || '', heroEn: hero.en || '', heroAr: hero.ar || '', heroSubEn: hero.subEn || '', heroSubAr: hero.subAr || '' });
      EMS.forEach(([k]) => { v['em_' + k] = s.emirateFees && s.emirateFees[k] != null ? String(s.emirateFees[k]) : ''; }); }
    const fin = d.fin || {}, acc = FU.acctOpts(fin.accts || [], a => /asset/i.test(a.type || '') || /^1/.test(a.code)), whs = (d.whs || []).filter(w => w.active).map(w => [w.code, w.code + ' · ' + w.name]), yn = [['1', 'Yes'], ['0', 'No']];
    return (d.missing ? H.card('First time', `<div class="mb-hint">Create the shop lists in SharePoint (Shop_Settings, Shop_Products, Shop_Categories, Shop_Coupons, Shop_Inbox, Shop_Orders), then fill in the settings.</div>${H.btn(v.busy ? '⏳ ' + esc(v.busy) : '🛠 Set up the shop lists', 'setup')}`) : '')
      + H.card('Shop', `<div class="fin-row">${H.f('Shop name', H.inp('sname'))}${H.f('اسم المتجر', H.inp('snameAr'))}${H.f('Order number prefix', H.inp('sprefix', { ph: 'W' }))}</div><div class="fin-row">${H.f('Website address (for links in e-mails)', H.inp('ssite', { ph: 'https://shop.example.ae/' }))}${H.f('Brand colour', H.inp('scolor', { type: 'color' }))}${H.f('Logo address (https://…)', H.inp('slogo'))}</div><div class="fin-row">${H.f('Shop key (scrambles coupon codes)', H.inp('skey'))}<div class="mb-f"><label>&nbsp;</label>${H.sbtn('New key', 'newKey')}</div></div>
        <div class="fin-row">${H.f('Phone', H.inp('sphone'))}${H.f('WhatsApp (971…)', H.inp('swa'))}${H.f('E-mail', H.inp('semail'))}</div><div class="fin-row">${H.f('Home page title', H.inp('heroEn', { ph: 'Fresh from our farm to your door' }))}${H.f('عنوان الصفحة الرئيسية', H.inp('heroAr'))}</div><div class="fin-row">${H.f('Home page line', H.inp('heroSubEn'))}${H.f('سطر الصفحة الرئيسية', H.inp('heroSubAr'))}</div>`)
      + H.card('Orders & stock', `<div class="fin-row">${H.f('Ship from warehouse', whs.length ? H.sel('swh', whs, { ph: '— all warehouses —' }) : H.inp('swh'))}${H.f('Salesperson on web orders', H.sel('ssp', users(), { ph: '—' }))}${H.f('Confirm orders automatically', H.sel('sauto', yn, { ph: false }))}</div>
        <div class="fin-row">${H.f('Stock on the website', H.sel('sshow', [['low', 'Show "only N left" when low'], ['qty', 'Always show the quantity'], ['never', 'Never show quantities']], { ph: false }))}${H.f('"Low" means up to', H.num('slow'))}${H.f('E-mail the customer at each step', H.sel('smail', yn, { ph: false }))}</div>`)
      + H.card('Delivery', `<div class="fin-row">${H.f('Delivery fee incl. VAT', H.num('sfee', { ph: '0' }))}${H.f('Free delivery from', H.num('sfree', { ph: 'never' }))}${H.f('Minimum order', H.num('smin', { ph: '0' }))}${H.f('Earliest delivery (days after order)', H.num('slead'))}</div>
        <div class="mb-hint">Fee per emirate (empty = the fee above)</div><div class="fin-row">${EMS.map(([k, n]) => H.f(n, H.num('em_' + k, { ph: '' }))).join('')}</div>${H.f('Time slots (comma separated)', H.inp('sslots', { ph: '9am–1pm, 1pm–5pm, 5pm–9pm' }))}${H.f('Driver location visible to the customer while on the way', H.sel('sloc', yn, { ph: false }))}`)
      + H.card('Payment', `<div class="fin-row">${H.f('Cash on delivery', H.sel('pcod', yn, { ph: false }))}${H.f('COD fee incl. VAT', H.num('scod', { ph: '0' }))}${H.f('COD up to (0 = no limit)', H.num('scodmax', { ph: '0' }))}</div>
        <div class="fin-row">${H.f('Bank transfer', H.sel('pbank', yn, { ph: false }))}${H.f('Hold unpaid orders until paid', H.sel('shold', yn, { ph: false }))}${H.f('Cancel unpaid after (days)', H.num('sunpaid'))}</div>${H.f('Bank details shown to the customer', H.txt('sbank', 'Bank, account name, IBAN, reference: your order number'))}
        <div class="fin-row">${H.f('Card payment' + (set.connection === 'flow' ? '' : ' (shows on the website once connected)'), H.sel('pcard', yn, { ph: false }))}${H.f('Card company', H.sel('scard', [['ngenius', 'Network International (N-Genius)'], ['stripe', 'Stripe'], ['telr', 'Telr']], { ph: '— choose —' }))}</div>
        <div class="mb-hint">Receipts are posted to</div><div class="fin-row">${H.f('Card payments (clearing account)', H.sel('aCard', acc, { ph: '— account —' }))}${H.f('Bank transfers (bank)', H.sel('aBank', acc, { ph: '— account —' }))}${H.f('Cash collected by drivers', H.sel('aCash', acc, { ph: '— account —' }))}</div>`)
      + H.card('Policies on the website', `<div class="fin-row">${H.f('Delivery', H.txt('polDelEn'))}${H.f('التوصيل', H.txt('polDelAr'))}</div><div class="fin-row">${H.f('Returns & refunds', H.txt('polRetEn'))}${H.f('الإرجاع والاسترداد', H.txt('polRetAr'))}</div><div class="fin-row">${H.f('Terms of sale', H.txt('polTermsEn'))}${H.f('شروط البيع', H.txt('polTermsAr'))}</div>`)
      + H.bar(`<div class="mb-row">${H.btn('💾 Save settings', 'sSave')}${d.missing ? '' : H.btn('🌐 Publish', 'pub', 's')}</div>`);
  }
  async function saveSettings(v, d) {
    if (d.missing) return toast('Set up the shop lists first', 'warn');
    const pays = ['cod', 'bank', 'card'].filter(k => v['p' + k] === '1'), E2 = []; if (!str(v.sname)) E2.push('Shop name'); if (!pays.length) E2.push('At least one payment method'); if (pays.includes('card') && !v.scard) E2.push('Card company'); if (pays.includes('bank') && !str(v.sbank)) E2.push('Bank details');
    if (!/^[A-Z0-9]{1,6}$/i.test(str(v.sprefix) || 'W')) E2.push('Order prefix: 1–6 letters'); if (E2.length) return toast('Please fill in: ' + E2.join(', '), 'warn');
    const em = {}; EMS.forEach(([k]) => { if (str(v['em_' + k]) !== '') em[k] = num(v['em_' + k]); });
    const s = Object.assign({}, d.set, { shopName: str(v.sname), shopNameAr: str(v.snameAr), shopKey: str(v.skey) || rndKey(), apiUrl: d.set.apiUrl || '', siteUrl: str(v.ssite), orderPrefix: (str(v.sprefix) || 'W').toUpperCase(), wh: v.swh || '', salesperson: v.ssp || '', payMethods: pays, cardProvider: v.scard || '', accCard: v.aCard || '', accBank: v.aBank || '', accCash: v.aCash || '',
      phone: str(v.sphone), whatsapp: P.phone(v.swa), email: str(v.semail), color: v.scolor || '#6d3fd9', logo: str(v.slogo), deliveryFee: num(v.sfee), freeOver: num(v.sfree), minOrder: num(v.smin), codFee: num(v.scod), codMax: num(v.scodmax), slots: String(v.sslots || '').split(',').map(x => x.trim()).filter(Boolean), leadDays: num(v.slead), lowStock: num(v.slow), stockShow: v.sshow,
      autoConfirm: v.sauto === '1', holdUnpaid: v.shold === '1', unpaidDays: num(v.sunpaid) || 3, emailCustomer: v.smail === '1', liveLocation: v.sloc === '1', bankDetails: v.sbank || '', emirateFees: em,
      policies: { deliveryEn: v.polDelEn, deliveryAr: v.polDelAr, returnsEn: v.polRetEn, returnsAr: v.polRetAr, termsEn: v.polTermsEn, termsAr: v.polTermsAr }, hero: Object.assign({}, d.set.hero || {}, { en: str(v.heroEn), ar: str(v.heroAr), subEn: str(v.heroSubEn), subAr: str(v.heroSubAr) }) });
    try { await saveSet(s); toast('💾 Saved — publishing…', 'success'); await U.publish('button'); } catch (e) { toast(e.message, 'error'); } refresh('x_shop');
  }
  async function setupLists(v) {
    if (v.busy) return; v.busy = 'Starting…'; render();
    try { await FU.setupLists(P.LISTS, n => { v.busy = n; render(); }); K.drop(...P.LIST_NAMES); toast('✅ Shop lists are ready — fill in the settings and save', 'success'); } catch (e) { toast(e.message, 'error'); }
    v.busy = ''; refresh('x_shop');
  }
  async function testFlow(v, d) {
    const set = Object.assign({}, d.set, { apiUrl: str(v.sapi) }); v.testRes = 'Testing…'; render();
    try { const r = await U.flow(set, { a: 'catalog' }); v.testRes = r && r.items ? '✅ Connected — the flow returns the catalogue with ' + r.items.length + ' products (published ' + tm(r.at) + ').' : r && r.text ? '⚠ The flow answered, but not with the catalogue: ' + r.text.slice(0, 120) : '✅ The flow answered.'; }
    catch (e) { v.testRes = '❌ ' + e.message + ' — check the service address and its settings.'; }
    render();
  }

  /* =============== Warehouse → Online orders =============== */
  screen('x_shopwh', {}, {
    view(v, d) {
      const set = d.set || P.setFromRow(null), os = d.orders || [], tab = v.tab || 'pick';
      const head = H.head('📦', 'Online orders · warehouse', 'Pick → pack → release to distribution', '#7c3aed') + busy(d) + needSetup(d);
      if (d.missing) return head;
      if (v.o) { const o = orderOf(d, v.o); if (!o) return head;
        let extra = '';
        if (o.status === 'picking') { if (!v.PK || v.pkFor !== o.id) { v.pkFor = o.id; v.PK = goods(o).map(() => ''); }
          extra = H.card('Pick the items', `<span class="mb-hint">Scan each item (or type the quantity). All lines must match the order before packing.</span>${goods(o).map((l, i) => `<div class="sh-pk${num(v.PK[i]) === num(l.qty) ? ' ok' : ''}"><span><b>${esc(l.code)}</b> · ${esc(l.description)}</span><span>need <b>${fq(l.qty)}</b> ${esc(l.uom || '')}</span><input class="sh-pkq" data-i="${i}" value="${esc(v.PK[i])}" inputmode="decimal" placeholder="0"></div>`).join('')}
            <div class="fin-row" style="margin-top:10px">${H.f('Scan / type a code', `<input id="shScan" placeholder="barcode or item code" autocomplete="off">`)}<div class="mb-f"><label>&nbsp;</label>${H.sbtn('📷 Camera', 'cam')}</div>${H.f('Parcels', H.num('parcels', { ph: '1' }))}</div>${v.scanMsg ? `<div class="mb-hint" style="font-weight:700;color:${v.scanMsg.ok ? '#15803d' : '#dc2626'}">${esc(v.scanMsg.t)}</div>` : ''}`); }
        const acts = [H.btn('← List', 'back', 's'), H.btn('🖨 Pick list', 'pick1', 's')];
        if (o.status === 'confirmed') acts.push(H.btn('▶ Start picking', 'start'));
        if (o.status === 'picking') acts.push(H.btn('✓ Packed', 'packed'));
        if (o.status === 'packed') acts.push(H.btn('🖨 Label', 'label', 's'), H.btn('🚚 Release to distribution', 'release'));
        return head + orderDetail(o, extra) + H.bar(`<div class="mb-row">${acts.join('')}</div>`); }
      const by = s => os.filter(o => s.includes(o.status)), list = tab === 'pick' ? by(['confirmed']) : tab === 'picking' ? by(['picking']) : tab === 'packed' ? by(['packed']) : os.filter(o => ['released', 'out_for_delivery', 'delivered'].includes(o.status) && (o.timeline || []).some(t => t.s === 'released' && String(t.at).slice(0, 10) === today()));
      return head + runLine() + H.kpis([['To pick', String(by(['confirmed']).length)], ['Picking', String(by(['picking']).length)], ['Packed', String(by(['packed']).length)], ['Released today', String(os.filter(o => (o.timeline || []).some(t => t.s === 'released' && String(t.at).slice(0, 10) === today())).length)]])
        + H.tabs('tab', [['pick', 'To pick'], ['picking', 'Picking'], ['packed', 'Packed'], ['done', 'Released today']], 'pick') + H.card('', ordTable(list))
        + (tab === 'pick' && list.length ? H.bar(`<div class="mb-row">${H.btn('🖨 Pick list for all (' + list.length + ')', 'pickAll', 's')}${H.btn('▶ Start picking all', 'startAll')}</div>`) : '');
    },
    onScan(c, v, d) { scanned(c, v, d); },
    act: {
      chk() { U.processInbox(true); }, open(t, v) { v.o = +t.dataset.i; v.PK = null; render(); }, back(t, v) { v.o = null; render(); },
      pick1(t, v, d) { printPick([orderOf(d, v.o)], d.set); }, pickAll(t, v, d) { printPick((d.orders || []).filter(o => o.status === 'confirmed'), d.set); },
      start(t, v, d) { const o = orderOf(d, v.o); printPick([o], d.set); doIt(() => U.move(o, 'picking', d.set), 'x_shopwh'); },
      startAll(t, v, d) { const list = (d.orders || []).filter(o => o.status === 'confirmed'); printPick(list, d.set); doIt(async () => { for (const o of list) await U.move(o, 'picking', d.set); }, 'x_shopwh', '▶ ' + list.length + ' order(s) in picking'); },
      cam(t, v, d) { K.bcScan('Scan the item').then(c => { if (c) { scanned(c, v, d); render(); } }); },
      packed(t, v, d) { const o = orderOf(d, v.o), g = goods(o), bad = g.filter((l, i) => Math.abs(num(v.PK[i]) - num(l.qty)) > 0.0005);
        if (bad.length) return toast('Not matching yet: ' + bad.map(l => l.code).join(', '), 'warn');
        doIt(() => U.move(o, 'packed', d.set, { parcels: Math.max(1, num(v.parcels) || 1) }), 'x_shopwh', '📦 Packed'); },
      label(t, v, d) { printLabel(orderOf(d, v.o), d.set); },
      release(t, v, d) { const o = orderOf(d, v.o); if (!confirm('Release ' + o.no + ' to distribution? A delivery note is made' + (o.payStatus === 'paid' ? ' and, as it is paid, the e-invoice draft.' : '.'))) return;
        doIt(async () => { await U.deliveryNote(o, d.set); if (o.payStatus === 'paid') await U.invoiceDraft(o); await U.move(o, 'released', d.set); }, 'x_shopwh', '🚚 Released · ' + o.no); } } });
  function scanned(c, v, d) {
    const o = orderOf(d, v.o); if (!o || o.status !== 'picking') return; const code = lc(c), items = (d.items || []), g = goods(o);
    const i = g.findIndex(l => lc(l.code) === code || items.some(it => it.code === l.code && it.barcode && lc(it.barcode) === code));
    const bad = t => { v.scanMsg = { ok: 0, t }; if (navigator.vibrate) navigator.vibrate([80, 60, 80]); };
    if (i < 0) return bad('⚠ ' + c + ' is not in this order');
    const n = num(v.PK[i]) + 1; if (n > num(g[i].qty)) return bad('⚠ ' + g[i].code + ': already ' + fq(g[i].qty) + ' picked'); v.PK[i] = String(n); v.scanMsg = { ok: 1, t: '✓ ' + g[i].code + ' ' + n + ' / ' + fq(g[i].qty) };
  }
  document.addEventListener('input', e => { const t = e.target; if (t && t.classList && t.classList.contains('sh-pkq')) { const v = V(); if (v.PK) v.PK[+t.dataset.i] = t.value; } });
  document.addEventListener('keydown', e => { const t = e.target; if (t && t.id === 'shScan' && e.key === 'Enter') { e.preventDefault(); const v = V(), d = K.D.x_shopwh || {}; scanned(t.value.trim(), v, d); t.value = ''; render(); setTimeout(() => { const x = document.querySelector('#shScan'); if (x) x.focus(); }, 30); } });

  /* =============== Distributions → Web deliveries =============== */
  let GEO = null;
  screen('x_shopdel', {}, {
    view(v, d) {
      const set = d.set || P.setFromRow(null), os = d.orders || [], tab = v.tab || 'ready', meU = lc(me());
      const head = H.head('🚚', 'Web deliveries', 'Assign drivers → on the way → delivered · live location for the customer', '#0f766e') + busy(d) + needSetup(d);
      if (d.missing) return head;
      if (tab === 'mine') return head + tabsDel(os, meU) + driverView(v, d, set, os.filter(o => o.status === 'out_for_delivery' && lc(o.driver) === meU));
      if (v.o) { const o = orderOf(d, v.o); if (!o) return head; const acts = [H.btn('← List', 'back', 's')];
        if (o.status === 'out_for_delivery') acts.push(H.btn('✓ Delivered', 'dOk'), H.btn('✕ Not delivered', 'dFail', 's'));
        if (o.status === 'failed') acts.push(H.btn('↩ Returned to stock', 'returned', 's'));
        return head + orderDetail(o, v.form ? deliverForm(v, o) : '') + H.bar(`<div class="mb-row">${acts.join('')}</div>`); }
      const ready = os.filter(o => ['released', 'failed'].includes(o.status)), out = os.filter(o => o.status === 'out_for_delivery'), done = os.filter(o => ['delivered', 'returned'].includes(o.status) && String((o.timeline || []).slice(-1)[0] && o.timeline.slice(-1)[0].at).slice(0, 10) >= K.addD(today(), -7));
      if (tab === 'ready') { if (!v.sel) v.sel = []; const dd = v.ddate || K.addD(today(), 0);
        return head + tabsDel(os, meU) + H.kpis([['To dispatch', String(ready.length)], ['On the way', String(out.length)], ['Cash to collect (on the way)', n2(out.filter(o => o.payMethod === 'cod').reduce((s, o) => s + o.total, 0))], ['Failed', String(os.filter(o => o.status === 'failed').length), os.some(o => o.status === 'failed') ? 'o' : '']])
          + H.card('Ready for delivery', ready.length ? `<div class="sh-sel">${ready.slice().sort((a, b) => (a.emirate + a.area).localeCompare(b.emirate + b.area)).map(o => `<label><input type="checkbox" data-x="sel" data-i="${o.id}"${v.sel.includes(o.id) ? ' checked' : ''}> <span><b>${esc(o.no)}</b> · ${esc(o.customer)} · ${esc(o.area)}, ${esc(emName(o.emirate))}${o.deliveryDate ? ' · wants ' + dmy(o.deliveryDate) + (o.slot ? ' ' + esc(o.slot) : '') : ''} · ${o.payMethod === 'cod' ? 'COD ' + n2(o.total) : 'paid'}${o.status === 'failed' ? ' · <b style="color:#dc2626">failed ' + o.attempts + '×</b>' : ''}</span></label>`).join('')}</div>${H.sbtn('Select all', 'selAll')} ${H.sbtn('Open…', 'open1')}` : H.empty('Nothing to dispatch'))
          + (v.sel.length ? H.card('Send ' + v.sel.length + ' order(s) out', `<div class="fin-row">${H.f('Driver', H.sel('drv', users(), { ph: '— ORBIT user —' }))}${H.f('…or driver name', H.inp('drvTxt'))}${H.f('Vehicle', H.inp('veh', { ph: 'plate / van no.' }))}</div><div class="fin-row">${H.f('Day', H.date('ddate', { val: dd }))}${H.f('Time slot', set.slots.length ? H.sel('dslot', set.slots, { ph: '—' }) : H.inp('dslot'))}</div>${H.btn('🚚 Out for delivery + route sheet', 'send')}`) : ''); }
      const list = tab === 'out' ? out : done;
      return head + tabsDel(os, meU) + H.card('', ordTable(list));
    },
    act: {
      chk() { U.processInbox(true); }, back(t, v) { v.o = null; v.form = null; render(); }, open(t, v) { v.o = +t.dataset.i; v.form = null; render(); },
      open1(t, v) { if (v.sel && v.sel.length === 1) { v.o = v.sel[0]; render(); } else toast('Tick one order to open it', 'info'); },
      sel(t, v) { const i = +t.dataset.i; v.sel = v.sel.includes(i) ? v.sel.filter(x => x !== i) : v.sel.concat([i]); render(); },
      selAll(t, v, d) { v.sel = (d.orders || []).filter(o => ['released', 'failed'].includes(o.status)).map(o => o.id); render(); },
      send(t, v, d) { const drv = v.drv || str(v.drvTxt); if (!drv) return toast('Choose the driver', 'warn'); const list = v.sel.map(i => orderOf(d, i)).filter(Boolean);
        doIt(async () => { for (const o of list) await U.move(o, 'out_for_delivery', d.set, { driver: drv, vehicle: str(v.veh), deliveryDate: v.ddate || today(), slot: v.dslot || o.slot, attempts: num(o.attempts) + 1 }); printRoute(list, d.set, drv); v.sel = []; }, 'x_shopdel', '🚚 ' + list.length + ' order(s) on the way'); },
      dOk(t, v, d) { const o = orderOf(d, v.o); v.form = 'ok'; v.recv = o.customer; v.cod = o.payMethod === 'cod' && o.payStatus !== 'collected' ? String(o.total) : ''; render(); },
      dFail(t, v) { v.form = 'fail'; v.why = 'Customer not reachable'; render(); }, fX(t, v) { v.form = null; render(); },
      fOk(t, v, d) { return delivered(orderOf(d, v.o || v.drvO), v, d, 'x_shopdel'); }, fFail(t, v, d) { return failed(orderOf(d, v.o || v.drvO), v, d, 'x_shopdel'); },
      returned(t, v, d) { const o = orderOf(d, v.o); if (!confirm(o.no + ' came back to the warehouse — cancel the order? (Stock stays in the books: it only leaves when an e-invoice is posted.)' + (o.invId ? '\n\n⚠ An e-invoice draft was made — delete it or issue a credit note in E-Invoicing.' : ''))) return;
        doIt(async () => { o.status = 'failed'; await U.move(o, 'returned', d.set); await U.cancelOrder(Object.assign(o, { status: 'cancelled' }), d.set, 'Returned after failed delivery'); }, 'x_shopdel'); },
      drvOk(t, v, d) { const o = orderOf(d, +t.dataset.i); v.drvO = o.id; v.form = 'ok'; v.recv = o.customer; v.cod = o.payMethod === 'cod' && o.payStatus !== 'collected' ? String(o.total) : ''; render(); },
      drvFail(t, v) { v.drvO = +t.dataset.i; v.form = 'fail'; v.why = 'Customer not reachable'; render(); },
      geo(t, v, d) { geoToggle(d); render(); } } });
  const tabsDel = (os, meU) => H.tabs('tab', [['ready', 'To dispatch', os.filter(o => ['released', 'failed'].includes(o.status)).length], ['out', 'On the way', os.filter(o => o.status === 'out_for_delivery').length], ['done', 'Delivered (7 days)'], ['mine', '📱 My deliveries', os.filter(o => o.status === 'out_for_delivery' && lc(o.driver) === meU).length]], 'ready');
  const deliverForm = (v, o) => v.form === 'ok' ? H.card('Delivered', `<div class="fin-row">${H.f('Received by', H.inp('recv'))}${o.payMethod === 'cod' && o.payStatus !== 'collected' ? H.f('Cash collected (' + n2(o.total) + ' due)', H.num('cod')) : ''}</div><div class="mx-acts">${H.sbtn('✓ Save — delivered', 'fOk', '', 'p')}${H.sbtn('Cancel', 'fX')}</div>`)
    : H.card('Not delivered', `${H.f('Reason', H.sel('why', ['Customer not reachable', 'Customer not at home', 'Wrong / incomplete address', 'Customer refused', 'Customer asked for another day', 'Vehicle / time problem'], { ph: false }))}${H.f('Note', H.inp('fnote'))}<div class="mx-acts">${H.sbtn('Save — not delivered', 'fFail', '', 'p')}${H.sbtn('Cancel', 'fX')}</div>`);
  async function delivered(o, v, d, page) {
    const cod = o.payMethod === 'cod' && o.payStatus !== 'collected', amt = r2(num(v.cod));
    if (cod && Math.abs(amt - o.total) > 0.009 && !confirm('Collected ' + n2(amt) + ' but ' + n2(o.total) + ' is due. Save anyway?')) return;
    doIt(async () => { const set = d.set;
      if (cod && amt > 0) { o.codCollected = amt; o.paid = amt; o.payStatus = 'collected'; if (set.accCash && o.customerId) { try { o.rcpNo = await U.receipt(o, amt, set.accCash, 'Cash (driver ' + uname(o.driver) + ')', 'COD'); } catch (e) { toast('Receipt not posted: ' + e.message, 'warn'); } } }
      try { await U.invoiceDraft(o); } catch (e) { toast('E-invoice draft not made: ' + e.message, 'warn'); }
      await U.move(o, 'delivered', set, { notes: o.notes }); o.timeline[o.timeline.length - 1].note = 'Received by ' + str(v.recv); await U.save(o, set);
      v.form = null; v.o = null; v.drvO = null; }, page, '✓ Delivered · ' + o.no);
  }
  async function failed(o, v, d, page) { doIt(async () => { await U.move(o, 'failed', d.set); o.timeline[o.timeline.length - 1].note = v.why + (str(v.fnote) ? ' · ' + str(v.fnote) : ''); await U.save(o, d.set); v.form = null; v.o = null; v.drvO = null; }, page, 'Saved'); }
  function driverView(v, d, set, mine) {
    const form = v.drvO ? orderOf(d, v.drvO) : null;
    return (set.liveLocation ? H.card('', `<div class="ei-kv"><span>📍 Show my location to my customers (updates every 2 minutes while this page is open)</span><b>${H.sbtn(GEO ? '■ Stop sharing' : '▶ Share location', 'geo', '', GEO ? 'r' : 'p')}</b></div>${GEO && GEO.last ? `<div class="mb-hint">Last sent ${tm(GEO.last)}</div>` : ''}`) : '')
      + (form && v.form ? deliverForm(v, form) : '')
      + (mine.length ? mine.map((o, i) => { const a = addr(o); return `<div class="sh-drv"><h4>${i + 1}. ${esc(o.customer)} <small>${esc(o.no)}</small></h4><div>${esc(a.text)}</div>${o.notes ? `<div class="mb-hint">📝 ${esc(o.notes)}</div>` : ''}<div style="margin-top:6px"><b>${o.payMethod === 'cod' && o.payStatus !== 'collected' ? '💵 Collect ' + esc(set.currency) + ' ' + n2(o.total) : '✅ Paid'}</b> · ${goods(o).length} item(s) · ${o.parcels || 1} parcel(s)</div>
        <div class="a"><a href="tel:+${esc(o.phone)}">📞 Call</a><a href="https://wa.me/${esc(o.phone)}" target="_blank" rel="noopener">💬 WhatsApp</a><a href="${esc(a.map)}" target="_blank" rel="noopener">🧭 Navigate</a></div><div class="mx-acts" style="margin-top:10px">${H.sbtn('✓ Delivered', 'drvOk', `data-i="${o.id}"`, 'p')}${H.sbtn('✕ Not delivered', 'drvFail', `data-i="${o.id}"`)}</div></div>`; }).join('') : H.empty('No deliveries assigned to you right now'));
  }
  function geoToggle(d) {
    if (GEO) { navigator.geolocation.clearWatch(GEO.w); clearInterval(GEO.t); GEO = null; return; }
    if (!navigator.geolocation) return toast('This device cannot share its location', 'warn');
    GEO = { pos: null, last: '' }; GEO.w = navigator.geolocation.watchPosition(p => { GEO.pos = { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }; }, e => toast('Location: ' + e.message, 'warn'), { enableHighAccuracy: true, maximumAge: 30000 });
    const send = async () => { if (!GEO || !GEO.pos) return; const dd = K.D.x_shopdel || {}, mine = (dd.orders || []).filter(o => o.status === 'out_for_delivery' && lc(o.driver) === lc(me()));
      for (const o of mine) { o.lastLoc = Object.assign({ at: iso() }, GEO.pos); try { await K.A().upd('Shop_Orders', o.id, { LastLoc: JSON.stringify(o.lastLoc) }); await U.track(o, dd.set); } catch (e) {} }
      GEO.last = iso(); if (K.cur && K.cur() === 'x_shopdel') render(); };
    setTimeout(send, 5000); GEO.t = setInterval(send, 120000);
  }

  /* =============== Finance → Web payments =============== */
  screen('x_shoppay', { fin: 1 }, {
    view(v, d) {
      const set = d.set || P.setFromRow(null), os = (d.orders || []).filter(o => o.status !== 'cancelled' || ['refund', 'refunded'].includes(o.payStatus)), tab = v.tab || 'bank';
      const head = H.head('💳', 'Web payments', 'Bank transfers · card · cash from drivers · refunds', '#0f766e') + busy(d) + needSetup(d);
      if (d.missing) return head;
      const bank = os.filter(o => o.payMethod === 'bank' && ['awaiting', 'proof'].includes(o.payStatus) && o.status !== 'cancelled'), card = os.filter(o => o.payMethod === 'card' && ['pending', 'mismatch'].includes(o.payStatus) && o.status !== 'cancelled'),
        cod = os.filter(o => o.payStatus === 'collected'), ref = (d.orders || []).filter(o => o.payStatus === 'refund');
      if (v.o) { const o = orderOf(d, v.o); if (!o) return head; const fin = d.fin || {}, acc = FU.acctOpts(fin.accts || []); if (v.acc == null) v.acc = o.payStatus === 'refund' ? (o.payMethod === 'card' ? set.accCard : set.accBank) : set.accBank;
        let extra = '';
        if (o.payMethod === 'bank' && ['awaiting', 'proof'].includes(o.payStatus)) extra = H.card('Transfer received?', `${o.proof ? `<div class="mx-acts" style="margin-bottom:8px">${H.sbtn('🧾 View the customer\'s proof', 'proof', '', 'p')}</div>${v.proofUrl ? (/\.pdf$/.test(o.proof) ? `<a href="${v.proofUrl}" target="_blank">Open PDF ↗</a>` : `<img src="${v.proofUrl}" style="max-width:100%;max-height:420px;border-radius:10px;border:1px solid #e2e8f0">`) : ''}` : '<div class="mb-hint">No proof uploaded yet.</div>'}
          <div class="fin-row">${H.f('Amount received', H.num('amt', { val: v.amt != null ? v.amt : String(o.total) }))}${H.f('Into account', H.sel('acc', acc, { ph: '—' }))}${H.f('Bank reference', H.inp('bref'))}</div>${H.btn('✓ Confirm transfer received', 'bankOk')}`);
        if (o.payMethod === 'card' && ['pending', 'mismatch'].includes(o.payStatus)) extra = H.card('Card payment', `<div class="ei-kv"><span>Payment reference</span><b>${esc(o.payRef || '—')}</b></div>${H.sbtn('↻ Ask the card company again', 'cardChk', '', 'p')}`);
        if (o.payStatus === 'refund') extra = H.card('Refund', `<div class="fin-row">${H.f('Paid from account', H.sel('acc', acc, { ph: '—' }))}${H.f('Refund reference', H.inp('rref'))}</div>${H.btn('✓ Refunded — post it', 'refundOk')}`);
        return head + orderDetail(o, extra) + H.bar(`<div class="mb-row">${H.btn('← List', 'back', 's')}</div>`); }
      const drivers = {}; cod.forEach(o => { const k = o.driver || '—'; drivers[k] = drivers[k] || { n: 0, v: 0 }; drivers[k].n++; drivers[k].v = r2(drivers[k].v + o.codCollected); });
      return head + H.kpis([['Transfers to check', String(bank.length), bank.some(o => o.payStatus === 'proof') ? 'o' : ''], ['Card to check', String(card.length)], ['Cash collected (all time)', n2(cod.reduce((s, o) => s + o.codCollected, 0))], ['Refunds due', String(ref.length), ref.length ? 'o' : '']])
        + H.tabs('tab', [['bank', 'Bank transfers', bank.length], ['card', 'Card', card.length], ['cod', 'Cash from drivers'], ['ref', 'Refunds', ref.length]], 'bank')
        + (tab === 'cod' ? H.card('Cash collected per driver', table([{ k: 'd', t: 'Driver' }, { k: 'n', t: 'Orders', n: 1 }, { k: 'v', t: 'Collected', n: 1 }], Object.entries(drivers).map(([k, x]) => ({ d: uname(k), n: x.n, v: x.v })))) + H.card('Orders', ordTable(cod.slice(0, 100)))
          : H.card('', ordTable(tab === 'bank' ? bank : tab === 'card' ? card : ref)));
    },
    act: {
      open(t, v) { v.o = +t.dataset.i; v.proofUrl = ''; v.acc = null; v.amt = null; render(); }, back(t, v) { v.o = null; render(); },
      async proof(t, v, d) { const o = orderOf(d, v.o); try { v.proofUrl = await U.fileUrl(o.proof); render(); } catch (e) { toast(e.message, 'error'); } },
      bankOk(t, v, d) { const o = orderOf(d, v.o), amt = r2(num(v.amt != null ? v.amt : o.total)), acc = v.acc || d.set.accBank; if (!acc) return toast('Choose the bank account', 'warn'); if (!(amt > 0)) return toast('Enter the amount', 'warn');
        if (Math.abs(amt - o.total) > 0.009 && !confirm('Received ' + n2(amt) + ' but the order is ' + n2(o.total) + '. Continue?')) return;
        doIt(async () => { if (!o.customerId) throw new Error('This order has no customer yet — confirm it in Online Shop first');
          o.rcpNo = await U.receipt(o, amt, acc, 'Bank transfer', str(v.bref)); o.paid = amt; o.payStatus = Math.abs(amt - o.total) > 0.009 ? 'mismatch' : 'paid';
          if (o.status === 'awaiting_payment' && o.payStatus === 'paid') await U.move(o, d.set.autoConfirm ? 'confirmed' : 'review', d.set); await U.save(o, d.set, P.tlOf('paid')); v.o = null; }, 'x_shoppay', '✓ Receipt posted'); },
      cardChk(t, v, d) { const o = orderOf(d, v.o); doIt(async () => { const r = await U.flow(d.set, { a: 'paycheck', ref: o.payRef, no: o.no }); if (!r || !r.paid) throw new Error('The card company says: not paid' + (r && r.state ? ' (' + r.state + ')' : ''));
          await K.A().add('Shop_Inbox', { Title: o.no, Kind: 'paid', Ref: o.no, Payload: JSON.stringify({ a: 'paid', no: o.no, ref: o.payRef }) }); K.drop('Shop_Inbox'); await U.processInbox(true); }, 'x_shoppay'); },
      refundOk(t, v, d) { const o = orderOf(d, v.o), acc = v.acc; if (!acc) return toast('Choose the account', 'warn'); if (!confirm('Post the refund of ' + n2(o.paid) + ' to ' + o.customer + '?')) return;
        doIt(async () => { const jv = await U.refundEntry(o, acc, str(v.rref)); o.payStatus = 'refunded'; o.refund = jv; await U.save(o, d.set, Object.assign(P.tl(o.status, 'Refunded', 'تم استرداد المبلغ'), { note: str(v.rref) })); v.o = null; }, 'x_shoppay', '✓ Refund posted'); } } });
})();
