/* ============================================================
   ORBIT SALES & MARKETING — storage + screens
   Sales home · Leads & opportunities · Quotations · Sales orders (credit & stock check → approval → delivery notes → e-invoice)
   · Customer accounts & price lists · Campaigns & segments · Targets & commissions · Sales settings
   Uses: the approval engine (APRSTORE) for discounts above the limit and orders over the credit limit; E-Invoicing (EInv_Customers,
   EInv_Products, EInv_Documents) for customers and the invoice; Inventory (INVSTORE) for items, prices and stock on hand;
   Finance (Fin_Payments) for money received. Stock leaves the books when the e-invoice is posted (cost of sales), as before.
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, F = window.FIN, Q = window.SAL, S = window.FINSTORE, FU = window.FIN_UI, AP = window.APR, E = window.EINV;
  if (!K || !F || !Q || !S || !FU || !AP || !E || !window.APRSTORE) return;
  const { reg, D, esc, num, today, dmy, str, toast, V, render, cur, H, iso, me, get } = K, { table, n2, money, printHtml } = FU, AS = window.APRSTORE;
  const ST = { lead: null, qt: null, so: null, deep: null };
  const go = k => K.A().go(k), goTo = k => { ST.deep = k; go(k); };
  const hist = (h, text) => JSON.stringify((h || []).concat([{ at: iso(), by: me(), text }]).slice(-40));
  const errs = (list, t) => list && list.length ? `<div class="mb-hint mb-bad ei-errs"><b>${esc(t || 'Please check')}</b>${list.map(e => `<div>${esc(e)}</div>`).join('')}</div>` : '';
  const warns = list => list && list.length ? `<div class="mb-hint" style="color:#b45309">${list.map(e => `<div>⚠ ${esc(e)}</div>`).join('')}</div>` : '';
  const clear = v => Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; });
  const COL = { draft: '#64748b', pending: '#b45309', approved: '#15803d', rejected: '#dc2626', sent: '#1d4ed8', accepted: '#0f766e', ordered: '#15803d', lost: '#64748b', expired: '#64748b', partial: '#b45309', delivered: '#0f766e', invoiced: '#15803d', closed: '#475569', cancelled: '#64748b', planned: '#64748b', running: '#1d4ed8', done: '#15803d',
    new: '#64748b', contacted: '#1d4ed8', qualified: '#7c3aed', proposal: '#b45309', negotiation: '#c2410c', won: '#15803d' };
  const pill = s => `<span class="mb-pill ei-st" style="--c:${COL[s] || '#64748b'}">${esc(String(s).charAt(0).toUpperCase() + String(s).slice(1))}</span>`;
  const fq = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
  const r3 = Q.r3, lc = Q.lc;
  const month = () => today().slice(0, 7);
  const EMIRATES = Object.entries((E.C && E.C.EMIRATES) || { AUH: 'Abu Dhabi', DXB: 'Dubai', SHJ: 'Sharjah', AJM: 'Ajman', UAQ: 'Umm Al Quwain', RAK: 'Ras Al Khaimah', FUJ: 'Fujairah' }), emName = c => (EMIRATES.find(e => e[0] === c) || [c, c])[1];

  /* ---------- data ---------- */
  let SET = Q.settingsFromRow(null);
  async function settings(force) { let rows = []; try { rows = await get('Sal_Settings', null, force); } catch (e) { if (!/not found/i.test(e.message)) throw e; } SET = Q.settingsFromRow(rows[0]); SET.row = rows[0] || null; return SET; }
  const L = (n, f, map) => S.list(n, f).then(r => r.map(map));
  async function bundle(force) {
    await S.settings(force); const o = {}, j = [], add = (k, p) => j.push(p.then(x => { o[k] = x; }));
    add('set', settings(force));
    add('custs', get('EInv_Customers', null, force).catch(() => [])); add('prods', get('EInv_Products', null, force).catch(() => []));
    add('edocs', get('EInv_Documents', null, force).then(r => r.map(E.docFromRow)).catch(() => []));
    add('rcpts', S.list('Fin_Payments', force).then(r => r.filter(x => (x.paytype || '') === 'receipt').map(x => ({ status: x.status, partyId: String(x.partyid || ''), amount: num(x.amount), date: String(x.paydate || '').slice(0, 10) }))).catch(() => []));
    add('accts', L('Sal_Accounts', force, Q.acctFromRow).catch(e => { if (/not found/i.test(e.message)) o.missing = true; return []; }));
    add('pls', L('Sal_PriceLists', force, Q.plFromRow).catch(() => [])); add('leads', L('Sal_Leads', force, Q.leadFromRow).catch(() => []));
    add('qts', L('Sal_Quotes', force, Q.qtFromRow).catch(() => [])); add('sos', L('Sal_Orders', force, Q.soFromRow).catch(() => [])); add('dns', L('Sal_Deliveries', force, Q.dnFromRow).catch(() => []));
    add('camps', L('Sal_Campaigns', force, Q.campFromRow).catch(() => [])); add('segs', L('Sal_Segments', force, Q.segFromRow).catch(() => [])); add('tgts', L('Sal_Targets', force, Q.tgtFromRow).catch(() => []));
    add('apr', AS.reqs(force).catch(() => []));
    if (window.INVSTORE) { add('items', INVSTORE.items(force).catch(() => [])); add('moves', INVSTORE.moves(force).catch(() => [])); add('whs', INVSTORE.whs(force).catch(() => [])); }
    await Promise.all(j);
    o.items = o.items || []; o.whs = o.whs || []; o.oh = new Map(); if (window.INV && o.moves) INV.position(o.moves).forEach((p, code) => o.oh.set(code, num(p.qty)));
    o.sales = Q.salesRows(o.edocs, o.accts, o.sos); return o;
  }
  const loaders = {}; function screen(key, def) { loaders[key] = (v, f) => { const d = D[key] = D[key] || {}; d.busy = 1; if (cur() === key) render(); bundle(f).then(b => Object.assign(d, b)).catch(e => { d.err = e.message; }).finally(() => { d.busy = 0; if (cur() === key) render(); }); };
    const RESET = { x_salcrm: () => { ST.lead = null; }, x_salqt: () => { ST.qt = null; }, x_salso: () => { ST.so = null; } };
    def.load = (v, f) => { if (!f) { if (ST.deep !== key && RESET[key]) RESET[key](); ST.deep = null; } loaders[key](v, f); }; reg(key, def); }
  const refresh = k => loaders[k](V(), true);
  const busy = d => d.busy ? `<div class="mx-ld"><i></i><i></i><i></i> Loading…</div>` : d.err ? `<div class="mb-hint mb-bad">⚠ ${esc(d.err)}</div>` : '';
  const needSetup = d => d.missing ? H.card('', `<div class="mb-hint mb-bad">The sales lists are not set up yet.</div>${H.btn('⚙️ Sales Settings → Set up', 'toSet')}`) : '';
  const toSet = () => go('x_salset');
  const custOpts = d => (d.custs || []).map(c => [String(c.id), c.title + (c.emirate ? ' · ' + emName(c.emirate) : '')]).sort((a, b) => a[1].localeCompare(b[1]));
  const custOf = (d, id) => (d.custs || []).find(c => String(c.id) === String(id)) || {};
  const acctOf = (d, id) => (d.accts || []).find(a => a.customerId === String(id)) || null;
  const userOpts = () => AS.userOpts();
  const uname = u => u ? AS.userName(u) : '—';
  const itemOf = (d, code) => code ? (d.items || []).find(x => x.code === code) || null : null;
  const prodOf = (d, code) => code ? (d.prods || []).find(p => lc(p.itemcode) === lc(code)) || null : null;
  const itemOpts = d => (d.items || []).length ? (d.items || []).filter(i => i.active && i.kind !== 'raw').map(i => [i.code, i.code + ' · ' + i.name]) : (d.prods || []).filter(p => p.itemcode).map(p => [p.itemcode, p.itemcode + ' · ' + p.title]);
  const aprOf = (d, list, id) => AP.forDoc(d.apr, list, id);
  const lnIn = (a, i, k, val, ph, r, mode) => `<input data-ln="${a}:${i}:${k}"${r ? ' data-r="1"' : ''} value="${esc(val == null ? '' : val)}" ${mode ? `inputmode="${mode}" style="text-align:right"` : ''} placeholder="${esc(ph || '')}">`;
  const lnSel = (a, i, k, opts, val, ph) => `<select data-ln="${a}:${i}:${k}" data-r="1"><option value="">${esc(ph || '—')}</option>${opts.map(([c, t]) => `<option value="${esc(c)}"${String(val) === String(c) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const totTxt = t => `${t.disc ? `<div class="ei-kv"><span>Gross</span><b>${money(t.gross)}</b></div><div class="ei-kv"><span>Discount</span><b>− ${money(t.disc)}</b></div>` : ''}<div class="ei-kv"><span>Net</span><b>${money(t.net)}</b></div><div class="ei-kv"><span>VAT</span><b>${money(t.vat)}</b></div><div class="ei-kv g"><span>Total</span><b>${money(t.total)}</b></div>`;
  async function company() { try { const r = (await get('EInv_Company', null))[0] || {}; return { name: r.title || '', trn: r.trn || '', addr: [r.addressline, r.city, r.emirate].filter(Boolean).join(', '), email: r.email || '', phone: r.phone || '' }; } catch (e) { return { name: '', trn: '', addr: '' }; } }
  const custBlock = c => `<b>${esc(c.title || '')}</b>${c.trn ? '<br>TRN ' + esc(c.trn) : ''}${[c.addressline, c.city, c.emirate].filter(Boolean).length ? '<br>' + esc([c.addressline, c.city, c.emirate].filter(Boolean).join(', ')) : ''}`;

  /* ---------- line editor: item → price from the customer's price list (tiers by quantity), discount %, VAT, stock available ---------- */
  const newLine = () => ({ code: '', description: '', qty: '', uom: '', price: '', disc: '', vat: 'S' });
  function linesEd(a, lines, d, ctx) {
    const res = Q.reserved(d.sos, ctx.soId || -1);
    return lines.map((l, i) => { const it = itemOf(d, l.code), pr = prodOf(d, l.code);
      if (l.code && l._c !== l.code) { l._c = l.code; l.description = it ? it.name : pr ? pr.title : l.description; l.uom = it ? it.uom : l.uom; l.vat = it ? it.vat : pr ? (pr.vatcategory || 'S') : l.vat; l._p = null; }
      const auto = l.code ? Q.priceFor(l.code, l.qty, d.pls, ctx.list, ctx.date, it ? it.price : pr ? pr.price : 0) : null;
      if (auto && (l._p == null || String(l.price) === String(l._p))) { l.price = String(auto.price); l._p = String(auto.price); }
      const stock = it && it.kind !== 'service', avail = stock ? r3(num(d.oh.get(l.code)) - num(res.get(l.code))) : null;
      return `<div class="inv-ln"><div class="ei-lnh"><span>Line ${i + 1}${auto && auto.list ? ` · <small>price list ${esc(auto.list)}</small>` : ''}${stock ? ` · <small style="color:${avail >= num(l.qty) ? '#15803d' : '#dc2626'}">available ${fq(avail)} ${esc(it.uom)}</small>` : ''}</span>${lines.length > 1 ? `<button type="button" class="mx-sb r" data-x="delL" data-a="${a}" data-i="${i}">✕</button>` : ''}</div>${lnSel(a, i, 'code', itemOpts(d), l.code, '— not an item (service / text) —')}
        <div class="inv-g"><div><label>Description</label>${lnIn(a, i, 'description', l.description)}</div><div><label>Quantity</label>${lnIn(a, i, 'qty', l.qty, '0', 1, 'decimal')}</div><div><label>Unit</label>${lnIn(a, i, 'uom', l.uom, 'pcs')}</div><div><label>Unit price</label>${lnIn(a, i, 'price', l.price, '0.00', 1, 'decimal')}</div><div><label>Discount %</label>${lnIn(a, i, 'disc', l.disc, '0', 1, 'decimal')}</div><div><label>VAT</label>${lnSel(a, i, 'vat', [['S', '5%'], ['Z', '0%'], ['E', 'Exempt']], l.vat || 'S', '5%')}</div></div></div>`; }).join('') + H.sbtn('＋ Add line', 'addL', `data-a="${a}"`);
  }
  const cleanLines = (lines, d) => lines.filter(l => l.code || str(l.description) || num(l.qty)).map(l => { const it = itemOf(d, l.code); return { code: l.code || '', description: str(l.description), qty: num(l.qty), uom: str(l.uom), price: num(l.price), disc: num(l.disc), vat: l.vat || 'S', stock: !!(it && it.kind !== 'service'), delivered: num(l.delivered), invoiced: num(l.invoiced) }; });
  const discHint = lines => { const m = Q.maxDisc(lines); return m > SET.maxDisc ? `<div class="mb-hint" style="color:#b45309">Discount ${m}% is above the ${SET.maxDisc}% limit — it goes for approval ("Sales discount above limit").</div>` : ''; };
  const printDoc = async (title, no, date, c, extra, lines, foot) => { const co = await company(), t = Q.totals(lines);
    printHtml(title + ' ' + no, `<h2 style="margin:0">${esc(title.toUpperCase())} ${esc(no)}</h2><table style="width:100%;margin:10px 0"><tr><td><b>${esc(co.name)}</b>${co.trn ? '<br>TRN ' + esc(co.trn) : ''}${co.addr ? '<br>' + esc(co.addr) : ''}${co.phone ? '<br>' + esc(co.phone) : ''}</td><td style="text-align:right">Date ${dmy(date)}${extra || ''}</td></tr></table><p>To: ${custBlock(c)}</p>
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>#</th><th style="text-align:left">Description</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>Disc.</th><th>VAT</th><th>Net</th></tr>${t.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}${l.code ? ' (' + esc(l.code) + ')' : ''}</td><td style="text-align:right">${fq(l.qty)}</td><td>${esc(l.uom || '')}</td><td style="text-align:right">${n2(l.price)}</td><td style="text-align:right">${l.disc ? l.disc + '%' : ''}</td><td>${Q.VAT[l.vat || 'S']}%</td><td style="text-align:right">${n2(l.net)}</td></tr>`).join('')}
      <tr><td colspan="7" style="text-align:right">Net</td><td style="text-align:right">${n2(t.net)}</td></tr><tr><td colspan="7" style="text-align:right">VAT</td><td style="text-align:right">${n2(t.vat)}</td></tr><tr><td colspan="7" style="text-align:right"><b>Total AED</b></td><td style="text-align:right"><b>${n2(t.total)}</b></td></tr></table>${foot || ''}`); };

  /* ---------- approval outcomes ---------- */
  const decided = async (list, r, map) => { const st = map[r.status]; if (!st) return; const row = (await S.list(list, true)).find(x => String(x.id) === String(r.docId)); if (!row) return; await S.upd(list, Number(r.docId), { Status: st, History: hist(F.J(row.history, []), 'Approval (' + (AP.DOC_TYPES[r.type] || r.type) + '): ' + r.status) }); S.drop(list); };
  APR_HANDLERS.Sal_Quotes = r => decided('Sal_Quotes', r, { approved: 'approved', rejected: 'rejected', withdrawn: 'draft' });
  APR_HANDLERS.Sal_Orders = async r => { if (r.status !== 'approved') return decided('Sal_Orders', r, { rejected: 'rejected', withdrawn: 'draft' });
    /* approved for one reason (credit or discount): check whether the other still needs approval */
    const row = (await S.list('Sal_Orders', true)).find(x => String(x.id) === String(r.docId)); if (!row) return; const so = Q.soFromRow(row), ch = Object.assign({}, so.checks || {}); ch[r.type === 'so_credit' ? 'creditOk' : 'discOk'] = true;
    const next = ch.needDisc && !ch.discOk ? 'sq_disc' : ch.needCredit && !ch.creditOk ? 'so_credit' : '';
    await S.upd('Sal_Orders', so.id, { Status: next ? 'pending' : 'approved', Checks: JSON.stringify(ch), History: hist(so.history, 'Approval (' + (AP.DOC_TYPES[r.type] || r.type) + '): approved' + (next ? ' · next: ' + AP.DOC_TYPES[next] : '')) }); S.drop('Sal_Orders');
    if (next) await AS.submit({ type: next, list: 'Sal_Orders', docId: so.id, docNo: so.no, dept: '', amount: next === 'so_credit' ? ch.over || so.total : so.total, summary: so.customer + ' · ' + (next === 'so_credit' ? 'over credit limit by ' + n2(ch.over) : 'discount ' + so.maxDisc + '%') }); };
  APR_OPEN.Sal_Quotes = id => { ST.qt = Number(id); goTo('x_salqt'); }; APR_OPEN.Sal_Orders = id => { ST.so = Number(id); goTo('x_salso'); };

  /* ================= Sales home ================= */
  screen('x_saldash', {
    view(v, d) {
      const m = month(), sales = (d.sales || []).filter(s => s.period === m), tot = Q.r2(sales.reduce((s, x) => s + x.net, 0)), tgt = (d.tgts || []).filter(t => t.period === m).reduce((s, t) => s + t.target, 0);
      const pipe = Q.pipeline(d.leads), qOpen = (d.qts || []).filter(q => ['draft', 'pending', 'approved', 'sent'].includes(q.status)), toDel = (d.sos || []).filter(o => ['approved', 'partial'].includes(o.status)), toInv = (d.sos || []).filter(o => o.lines.some(l => r3((l.stock ? num(l.delivered) : num(l.qty)) - num(l.invoiced)) > 0) && ['approved', 'partial', 'delivered'].includes(o.status));
      const mine = AP.queue(d.apr, me()).filter(r => ['sq_disc', 'so_credit'].includes(r.type)), byCust = new Map(); sales.forEach(s => byCust.set(s.customer, Q.r2((byCust.get(s.customer) || 0) + s.net)));
      return H.head('📈', 'Sales', 'Leads → quotations → orders → deliveries → e-invoices · this month ' + m, '#15803d') + busy(d) + needSetup(d)
        + H.kpis([['Sales this month (net)', n2(tot), 'g'], ['Target', tgt ? n2(tgt) + ' · ' + Math.round(tot * 100 / tgt) + '%' : '—', tgt && tot >= tgt ? 'g' : tgt ? 'o' : ''], ['Open pipeline', n2(pipe.openValue) + ' · ' + pipe.open], ['Weighted pipeline', n2(pipe.weighted)], ['Open quotations', String(qOpen.length)], ['Orders to deliver', String(toDel.length), toDel.length ? 'o' : ''], ['To invoice', String(toInv.length), toInv.length ? 'o' : ''], ['Waiting for my approval', String(mine.length), mine.length ? 'o' : 'g']])
        + (mine.length ? H.card('Waiting for your approval', mine.slice(0, 8).map(r => H.li({ x: 'toApr', ic: '✅', c: '#15803d', t: (AP.DOC_TYPES[r.type] || r.type) + ' ' + r.docNo + ' · ' + money(r.amount), s: r.summary, v: '›' })).join('')) : '')
        + (toDel.length ? H.card('Orders to deliver', table([{ k: 'no', t: 'Order' }, { k: 'cust', t: 'Customer' }, { k: 'del', t: 'Delivery' }, { k: 'total', t: 'Total', n: 1 }, { k: 'st', t: '', raw: 1 }], toDel.map(o => ({ no: o.no, cust: o.customer, del: dmy(o.delivery), total: o.total, st: pill(o.status), _tap: o.id })), null, 'openSo')) : '')
        + (toInv.length ? H.card('Delivered, not invoiced', table([{ k: 'no', t: 'Order' }, { k: 'cust', t: 'Customer' }, { k: 'v', t: 'To invoice (incl. VAT)', n: 1 }], toInv.map(o => ({ no: o.no, cust: o.customer, v: Q.totals(o.lines.map(l => Object.assign({}, l, { qty: r3((l.stock ? num(l.delivered) : num(l.qty)) - num(l.invoiced)) })).filter(l => l.qty > 0)).total, _tap: o.id })), null, 'openSo')) : '')
        + (byCust.size ? H.card('Top customers this month', table([{ k: 'c', t: 'Customer' }, { k: 'v', t: 'Net sales', n: 1 }], [...byCust.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, x]) => ({ c, v: x })))) : '')
        + H.card('Pipeline by stage', table([{ k: 't', t: 'Stage' }, { k: 'n', t: 'Leads' }, { k: 'v', t: 'Value', n: 1 }, { k: 'w', t: 'Weighted', n: 1 }], pipe.by.map(x => ({ t: x.title, n: String(x.count), v: x.value, w: x.weighted }))) + `<span class="mb-hint">Win rate ${pipe.winRate}% (won ÷ won + lost).</span>`)
        + H.card('Quick actions', `<div class="mx-acts">${H.sbtn('🎯 New lead', 'nLead', '', 'p')}${H.sbtn('💬 New quotation', 'nQt')}${H.sbtn('🧾 New sales order', 'nSo')}${H.sbtn('🏷 Price lists', 'toPl')}${H.sbtn('🏆 Targets', 'toTgt')}${H.sbtn('✅ My approvals', 'toApr')}</div>`);
    },
    act: { toSet, toApr() { go('x_aprinbox'); }, toPl() { go('x_salcust'); V().tab = 'pl'; }, toTgt() { go('x_saltgt'); }, nLead() { ST.lead = 'new'; goTo('x_salcrm'); }, nQt() { ST.qt = 'new'; goTo('x_salqt'); }, nSo() { ST.so = 'new'; goTo('x_salso'); }, openSo(t) { ST.so = +t.dataset.i; goTo('x_salso'); } } });

  /* ================= Leads & opportunities ================= */
  screen('x_salcrm', {
    view(v, d) {
      const leads = d.leads || [];
      if (ST.lead === 'new' || v.form) {
        if (!v.init) { v.init = 1; const x = ST.lead !== 'new' ? leads.find(l => l.id === ST.lead) : null; Object.assign(v, x ? { form: 1, id: x.id, title: x.title, company: x.company, contact: x.contact, phone: x.phone, email: x.email, emirate: x.emirate, source: x.source, campaign: x.campaign, owner: x.owner, stage: x.stage, value: String(x.value), prob: String(x.prob), close: x.close, notes: x.notes } : { form: 1, id: null, title: '', company: '', contact: '', phone: '', email: '', emirate: '', source: '', campaign: '', owner: lc(me()), stage: 'new', value: '', prob: String(Q.probOf('new')), close: '', notes: '' }); }
        return H.head('🎯', v.id ? 'Edit opportunity' : 'New lead', 'Who, what they need, how much, when', '#7c3aed') + errs(v.errs)
          + H.card('', `${H.f('Opportunity', H.inp('title', { ph: 'e.g. Weekly dairy supply — 3 branches' }))}<div class="fin-row">${H.f('Company', H.inp('company'))}${H.f('Contact person', H.inp('contact'))}</div><div class="fin-row">${H.f('Phone', H.inp('phone', { mode: 'tel' }))}${H.f('Email', H.inp('email', { type: 'email' }))}${H.f('Emirate', H.sel('emirate', EMIRATES, { ph: '—' }))}</div>`)
          + H.card('Opportunity', `<div class="fin-row">${H.f('Stage', H.sel('stage', Q.STAGES.map(s => [s[0], s[1]]), { ph: false }))}${H.f('Expected value (AED)', H.num('value'))}${H.f('Probability %', H.num('prob'))}${H.f('Expected close', H.date('close', { val: v.close || '' }))}</div><div class="fin-row">${H.f('Source', H.sel('source', Q.SOURCES, { ph: '—' }))}${H.f('Campaign', H.sel('campaign', (d.camps || []).map(c => c.name), { ph: '—' }))}${H.f('Owner', H.sel('owner', userOpts(), { ph: '—' }))}</div>${H.f('Notes', H.txt('notes'))}`)
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Save', 'save')}</div>`);
      }
      if (ST.lead) { const l = leads.find(x => x.id === ST.lead); if (!l) return busy(d);
        return H.head('🎯', (l.no ? l.no + ' · ' : '') + esc(l.title || l.company), esc(l.company) + (l.contact ? ' · ' + esc(l.contact) : '') + ' · owner ' + esc(uname(l.owner)), COL[l.stage]) + busy(d)
          + H.kpis([['Stage', (Q.STAGE[l.stage] || [0, l.stage])[1]], ['Value', n2(l.value)], ['Probability', l.prob + '%'], ['Weighted', n2(l.value * l.prob / 100)], ['Expected close', l.close ? dmy(l.close) : '—']])
          + H.card('Move to stage', `<div class="mx-acts">${Q.STAGES.filter(s => s[0] !== l.stage && s[0] !== 'lost').map(s => H.sbtn(s[1], 'stage', `data-s="${s[0]}"`, s[0] === 'won' ? 'p' : '')).join('')}${l.stage !== 'lost' ? H.sbtn('✕ Lost', 'lostL', '', 'r') : ''}</div>${l.lostReason ? `<div class="ei-kv"><span>Lost because</span><b>${esc(l.lostReason)}</b></div>` : ''}`)
          + H.card('Contact', `<div class="ei-kv"><span>Phone</span><b>${esc(l.phone || '—')}</b></div><div class="ei-kv"><span>Email</span><b>${esc(l.email || '—')}</b></div><div class="ei-kv"><span>Emirate</span><b>${esc(l.emirate ? emName(l.emirate) : '—')}</b></div><div class="ei-kv"><span>Source</span><b>${esc([l.source, l.campaign].filter(Boolean).join(' · ') || '—')}</b></div>${l.customerId ? `<div class="ei-kv"><span>Customer</span><b>${esc(custOf(d, l.customerId).title || l.customerId)}</b></div>` : ''}${l.qtNo ? `<div class="ei-kv"><span>Quotation</span><b>${esc(l.qtNo)}</b></div>` : ''}${l.notes ? `<p style="white-space:pre-wrap">${esc(l.notes)}</p>` : ''}`)
          + H.card('Activities', `<div class="fin-row">${H.f('Type', H.sel('aType', ['Call', 'Meeting', 'Email', 'Visit', 'WhatsApp', 'Note'], { ph: false }))}${H.f('Date', H.date('aDate'))}${H.f('Next follow-up', H.date('aNext', { val: v.aNext || '' }))}</div>${H.f('What happened', H.inp('aText'))}${H.sbtn('＋ Log activity', 'logAct', '', 'p')}`
            + l.acts.slice().reverse().map(a => `<div class="ei-kv"><span>${dmy(a.date)} · ${esc(a.type)} · ${esc(uname(a.by))}${a.next ? ' · follow up ' + dmy(a.next) : ''}</span><b style="font-weight:500;text-align:left">${esc(a.text)}</b></div>`).join(''))
          + H.bar(`<div class="mb-row">${H.btn('← Leads', 'back0', 's')}${H.btn('✏️ Edit', 'edit', 's')}${!l.customerId ? H.btn('👤 Make customer', 'toCust', 's') : ''}${H.btn('💬 Quotation', 'toQt')}</div>`); }
      const tab = v.tab || 'open', u = lc(me()), rows = leads.filter(l => tab === 'open' ? !['won', 'lost'].includes(l.stage) : tab === 'mine' ? l.owner === u : tab === 'all' ? true : l.stage === tab).sort((a, b) => b.id - a.id);
      const follow = leads.filter(l => !['won', 'lost'].includes(l.stage)).map(l => ({ l, n: (l.acts[l.acts.length - 1] || {}).next })).filter(x => x.n && x.n <= today());
      return H.head('🎯', 'Leads & opportunities', 'Pipeline by stage, weighted by probability', '#7c3aed') + busy(d) + needSetup(d)
        + (follow.length ? H.card('Follow-ups due', follow.map(x => H.li({ x: 'open', i: x.l.id, ic: '📞', c: '#b45309', t: x.l.title || x.l.company, s: 'due ' + dmy(x.n) + ' · ' + uname(x.l.owner), v: '›' })).join('')) : '')
        + H.tabs('tab', [['open', 'Open'], ['mine', 'Mine'], ['new', 'New'], ['qualified', 'Qualified'], ['proposal', 'Proposal'], ['negotiation', 'Negotiation'], ['won', 'Won'], ['lost', 'Lost'], ['all', 'All', leads.length]], 'open')
        + H.card('', table([{ k: 'no', t: 'Lead' }, { k: 'title', t: 'Opportunity' }, { k: 'co', t: 'Company' }, { k: 'own', t: 'Owner' }, { k: 'close', t: 'Close' }, { k: 'p', t: 'Prob.' }, { k: 'value', t: 'Value', n: 1 }, { k: 'st', t: '', raw: 1 }], rows.map(l => ({ no: l.no, title: l.title, co: l.company, own: uname(l.owner), close: dmy(l.close), p: l.prob + '%', value: l.value, st: pill(l.stage), _tap: l.id })), null, 'open'))
        + H.bar(H.btn('＋ New lead', 'add'));
    },
    act: { toSet, add(t, v) { ST.lead = 'new'; clear(v); render(); }, open(t, v) { ST.lead = +t.dataset.i; clear(v); render(); }, back0(t, v) { ST.lead = null; clear(v); render(); }, cancel(t, v) { if (ST.lead === 'new') ST.lead = null; clear(v); render(); }, edit(t, v) { clear(v); v.form = 1; render(); },
      async save(t, v, d) { const E2 = []; if (!str(v.company) && !str(v.title)) E2.push('Enter the company or the opportunity'); if (E2.length) { v.errs = E2; render(); return; }
        const f = { Title: str(v.title) || str(v.company), Company: str(v.company), Contact: str(v.contact), Phone: str(v.phone), Email: str(v.email), Emirate: v.emirate || '', Source: v.source || '', Campaign: v.campaign || '', Owner: lc(v.owner), Stage: v.stage || 'new', Value: num(v.value), Probability: num(v.prob), CloseDate: v.close || '', Notes: v.notes || '' };
        try { let id = v.id; if (id) await S.upd('Sal_Leads', id, f); else { await settings(true); const no = await S.next('lead', SET.lead); id = (await S.add('Sal_Leads', Object.assign(f, { LeadNo: no, Activities: '[]' }))).id; } S.drop('Sal_Leads'); ST.lead = Number(id); clear(v); toast('✅ Saved', 'success'); refresh('x_salcrm'); } catch (e) { v.errs = [e.message]; render(); } },
      async stage(t, v, d) { const l = d.leads.find(x => x.id === ST.lead), s = t.dataset.s; await S.upd('Sal_Leads', l.id, { Stage: s, Probability: Q.probOf(s), LostReason: '' }); S.drop('Sal_Leads'); refresh('x_salcrm'); },
      async lostL(t, v, d) { const l = d.leads.find(x => x.id === ST.lead), why = prompt('Why was it lost? (price, competitor, no budget…)'); if (why == null) return; await S.upd('Sal_Leads', l.id, { Stage: 'lost', Probability: 0, LostReason: str(why) }); S.drop('Sal_Leads'); refresh('x_salcrm'); },
      async logAct(t, v, d) { const l = d.leads.find(x => x.id === ST.lead); if (!str(v.aText)) return toast('Write what happened', 'warn'); const acts = l.acts.concat([{ type: v.aType || 'Call', date: v.aDate || today(), next: v.aNext || '', text: str(v.aText), by: lc(me()) }]).slice(-60);
        await S.upd('Sal_Leads', l.id, { Activities: JSON.stringify(acts), Stage: l.stage === 'new' ? 'contacted' : l.stage, Probability: l.stage === 'new' ? Q.probOf('contacted') : l.prob }); S.drop('Sal_Leads'); v.aText = ''; v.aNext = ''; refresh('x_salcrm'); },
      async toCust(t, v, d) { const l = d.leads.find(x => x.id === ST.lead); if (!confirm('Create customer "' + (l.company || l.title) + '"? Add the TRN / Peppol ID later in E-Invoicing → Customers.')) return;
        try { const c = await K.A().add('EInv_Customers', { Title: l.company || l.title, Emirate: l.emirate || '', Email: l.email || '', Country: 'AE', City: l.emirate ? emName(l.emirate) : '' }); K.drop('EInv_Customers');
          await S.add('Sal_Accounts', { Title: l.company || l.title, CustomerId: String(c.id), CustomerName: l.company || l.title, Salesperson: l.owner, Phone: l.phone || '', PayDays: 30, CreditLimit: 0 }); await S.upd('Sal_Leads', l.id, { CustomerId: String(c.id) }); S.drop('Sal_Leads', 'Sal_Accounts'); toast('👤 Customer created', 'success'); refresh('x_salcrm'); } catch (e) { toast(e.message, 'error'); } },
      toQt(t, v, d) { const l = d.leads.find(x => x.id === ST.lead); window.SAL_FROM = { lead: l }; ST.qt = 'new'; goTo('x_salqt'); } } });

  /* ================= Quotations ================= */
  screen('x_salqt', {
    view(v, d) {
      const qts = d.qts || [];
      if (ST.qt === 'new' || v.form) {
        if (!v.init) { v.init = 1; const x = ST.qt !== 'new' ? qts.find(q => q.id === ST.qt) : null, fr = window.SAL_FROM || {}; window.SAL_FROM = null;
          Object.assign(v, x ? { form: 1, id: x.id, cust: x.customerId, date: x.date, valid: x.validTo, sp: x.salesperson, terms: x.terms, leadId: x.leadId, L: x.lines.map(l => Object.assign({}, l, { _c: l.code, _p: null, price: String(l.price), qty: String(l.qty), disc: l.disc ? String(l.disc) : '' })) }
            : { form: 1, id: null, cust: fr.lead ? fr.lead.customerId : '', date: today(), valid: K.addD(today(), SET.quoteDays), sp: fr.lead ? fr.lead.owner : lc(me()), terms: SET.terms, leadId: fr.lead ? String(fr.lead.id) : '', L: [newLine()] }); }
        const a = acctOf(d, v.cust), t = Q.totals(cleanLines(v.L, d));
        return H.head('💬', v.id ? 'Edit quotation' : 'New quotation', a && a.priceList ? 'Price list ' + esc(a.priceList) : 'Prices from the default price list / item price', '#0f766e') + errs(v.errs)
          + H.card('', `${H.f('Customer', H.sel('cust', custOpts(d), { ph: '— customer —' }))}${(d.custs || []).length ? '' : '<span class="mb-hint">Add customers in E-Invoicing → Customers (or "Make customer" on a lead).</span>'}<div class="fin-row">${H.f('Date', H.date('date'))}${H.f('Valid until', H.date('valid'))}${H.f('Salesperson', H.sel('sp', userOpts(), { ph: '—' }))}</div>`)
          + H.card('Lines', linesEd('L', v.L, d, { list: a ? a.priceList : '', date: v.date })) + H.card('Totals', totTxt(t) + discHint(t.lines)) + H.card('Terms', H.txt('terms'))
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Save', 'save')}</div>`);
      }
      if (ST.qt) { const q = qts.find(x => x.id === ST.qt); if (!q) return busy(d); const ap = aprOf(d, 'Sal_Quotes', q.id), expired = q.validTo && q.validTo < today() && ['approved', 'sent'].includes(q.status), canSend = q.status === 'approved' || (q.status === 'draft' && !Q.needsDiscApproval(q.lines, SET));
        return H.head('💬', q.no + ' · ' + esc(q.customer), dmy(q.date) + (q.validTo ? ' · valid until ' + dmy(q.validTo) : '') + ' · ' + esc(uname(q.salesperson)), COL[q.status]) + busy(d)
          + H.kpis([['Net', n2(q.net)], ['VAT', n2(q.vat)], ['Total', n2(q.total)], ['Highest discount', q.maxDisc + '%', q.maxDisc > SET.maxDisc ? 'o' : '']])
          + H.card('Status · ' + pill(expired ? 'expired' : q.status), (window.APR_PANEL && ap ? APR_PANEL(ap) : '') + (q.soNo ? `<div class="ei-kv"><span>Sales order</span><b>${esc(q.soNo)}</b></div>` : '') + (q.lostReason ? `<div class="ei-kv"><span>Lost because</span><b>${esc(q.lostReason)}</b></div>` : '') + (q.status === 'draft' && Q.needsDiscApproval(q.lines, SET) ? discHint(q.lines) : ''))
          + H.card('Lines', table([{ k: 'description', t: 'Description' }, { k: 'code', t: 'Item' }, { k: 'q', t: 'Qty' }, { k: 'price', t: 'Price', n: 1 }, { k: 'disc', t: 'Disc.' }, { k: 'net', t: 'Net', n: 1 }], Q.totals(q.lines).lines.map(l => ({ description: l.description, code: l.code, q: fq(l.qty) + ' ' + (l.uom || ''), price: l.price, disc: l.disc ? l.disc + '%' : '', net: l.net })), { description: 'Total incl. VAT', net: q.total }))
          + H.bar(`<div class="mb-row">${H.btn('← Quotations', 'back0', 's')}${['draft', 'rejected', 'approved'].includes(q.status) ? H.btn('✏️ Edit', 'edit', 's') : ''}${['draft', 'rejected'].includes(q.status) && Q.needsDiscApproval(q.lines, SET) ? H.btn('➤ Discount approval', 'submitX') : ''}${H.btn('🖨 Print', 'print', 's')}${canSend ? H.btn('✉ Mark sent', 'sent', 's') : ''}${['approved', 'sent'].includes(q.status) || (q.status === 'draft' && canSend) ? H.btn('✓ Accepted → order', 'accept') : ''}${['draft', 'approved', 'sent', 'pending'].includes(q.status) ? H.btn('✕ Lost', 'lostQ', 's') : ''}</div>`); }
      const tab = v.tab || 'open', rows = qts.filter(q => tab === 'all' ? true : tab === 'open' ? ['draft', 'pending', 'approved', 'sent', 'rejected'].includes(q.status) : q.status === tab).sort((a, b) => b.id - a.id);
      return H.head('💬', 'Quotations', 'Price lists, discounts (approval above ' + SET.maxDisc + '%), print, accept → sales order', '#0f766e') + busy(d) + needSetup(d)
        + H.tabs('tab', [['open', 'Open'], ['pending', 'In approval'], ['sent', 'Sent'], ['ordered', 'Ordered'], ['lost', 'Lost'], ['all', 'All', qts.length]], 'open')
        + H.card('', table([{ k: 'no', t: 'Quotation' }, { k: 'date', t: 'Date' }, { k: 'cust', t: 'Customer' }, { k: 'sp', t: 'Salesperson' }, { k: 'valid', t: 'Valid until' }, { k: 'total', t: 'Total', n: 1 }, { k: 'st', t: '', raw: 1 }], rows.map(q => ({ no: q.no, date: dmy(q.date), cust: q.customer, sp: uname(q.salesperson), valid: dmy(q.validTo), total: q.total, st: pill(q.validTo && q.validTo < today() && ['approved', 'sent'].includes(q.status) ? 'expired' : q.status), _tap: q.id })), null, 'open'))
        + H.bar(H.btn('＋ New quotation', 'add'));
    },
    act: { toSet, add(t, v) { ST.qt = 'new'; clear(v); render(); }, open(t, v) { ST.qt = +t.dataset.i; clear(v); render(); }, back0(t, v) { ST.qt = null; clear(v); render(); }, cancel(t, v) { if (ST.qt === 'new') ST.qt = null; clear(v); render(); }, edit(t, v) { clear(v); v.form = 1; render(); },
      addL(t, v) { v[t.dataset.a].push(newLine()); render(); }, delL(t, v) { v[t.dataset.a].splice(+t.dataset.i, 1); render(); },
      async save(t, v, d) { const lines = cleanLines(v.L, d), E2 = Q.checkLines(lines); if (!v.cust) E2.push('Choose the customer'); if (E2.length) { v.errs = E2; render(); return; }
        const c = custOf(d, v.cust), a = acctOf(d, v.cust), tt = Q.totals(lines), f = { CustomerId: String(v.cust), CustomerName: c.title, QtDate: v.date, ValidTo: v.valid || '', Salesperson: lc(v.sp), PriceList: a ? a.priceList : '', LeadId: String(v.leadId || ''), Net: tt.net, Vat: tt.vat, Total: tt.total, MaxDisc: Q.maxDisc(lines), LinesJson: JSON.stringify(lines), Terms: v.terms || '' };
        try { let id = v.id, no; const old = id ? d.qts.find(x => x.id === id) : null;
          if (id) await S.upd('Sal_Quotes', id, Object.assign(f, old && old.status === 'approved' && Q.needsDiscApproval(lines, SET) && Q.maxDisc(lines) > old.maxDisc ? { Status: 'draft', History: hist(old.history, 'Changed — discount needs approval again') } : {}));
          else { await settings(true); no = await S.next('qt', SET.qt); id = (await S.add('Sal_Quotes', Object.assign(f, { Title: no, QtNo: no, Status: 'draft', History: hist([], 'Created') }))).id;
            if (v.leadId) { const l = d.leads.find(x => x.id === Number(v.leadId)); if (l) await S.upd('Sal_Leads', l.id, { QtNo: no, Stage: ['won', 'negotiation'].includes(l.stage) ? l.stage : 'proposal', Probability: Math.max(l.prob, Q.probOf('proposal')), Value: l.value || tt.net, CustomerId: l.customerId || String(v.cust) }); S.drop('Sal_Leads'); } }
          S.drop('Sal_Quotes'); ST.qt = Number(id); clear(v); toast(Q.needsDiscApproval(lines, SET) ? '💾 Saved — the discount needs approval before it is sent' : '✅ Saved', 'success'); refresh('x_salqt'); } catch (e) { v.errs = [e.message]; render(); } },
      async submitX(t, v, d) { const q = d.qts.find(x => x.id === ST.qt); try { await S.upd('Sal_Quotes', q.id, { Status: 'pending', History: hist(q.history, 'Discount ' + q.maxDisc + '% sent for approval') }); S.drop('Sal_Quotes');
        const a = await AS.submit({ type: 'sq_disc', list: 'Sal_Quotes', docId: q.id, docNo: q.no, dept: '', amount: q.total, summary: q.customer + ' · discount up to ' + q.maxDisc + '%' }); toast(a.status === 'approved' ? '✓ Approved' : '➤ Sent for approval to ' + AP.waitingFor(a).map(AS.userName).join(' or '), 'success'); refresh('x_salqt'); } catch (e) { toast(e.message, 'error'); } },
      async sent(t, v, d) { const q = d.qts.find(x => x.id === ST.qt); await S.upd('Sal_Quotes', q.id, { Status: 'sent', History: hist(q.history, 'Sent to the customer') }); S.drop('Sal_Quotes'); refresh('x_salqt'); },
      async lostQ(t, v, d) { const q = d.qts.find(x => x.id === ST.qt), why = prompt('Why was it lost? (price, competitor, timing…)'); if (why == null) return; await S.upd('Sal_Quotes', q.id, { Status: 'lost', LostReason: str(why), History: hist(q.history, 'Lost: ' + str(why)) }); S.drop('Sal_Quotes'); refresh('x_salqt'); },
      accept(t, v, d) { const q = d.qts.find(x => x.id === ST.qt); window.SAL_FROM = { qt: q }; ST.so = 'new'; goTo('x_salso'); },
      async print(t, v, d) { const q = d.qts.find(x => x.id === ST.qt); await printDoc('Quotation', q.no, q.date, custOf(d, q.customerId), (q.validTo ? '<br>Valid until <b>' + dmy(q.validTo) + '</b>' : '') + '<br>Salesperson ' + esc(uname(q.salesperson)), q.lines, `<p style="white-space:pre-wrap">${esc(q.terms)}</p>`); } } });

  /* ================= Sales orders ================= */
  async function runChecks(so, d) {
    const a = acctOf(d, so.customerId), ex = Q.exposure(so.customerId, d.edocs, d.rcpts, d.sos, so.id), cr = Q.creditCheck(a, so, ex), st = Q.stockCheck(so.lines, d.oh, Q.reserved(d.sos, so.id));
    const q = so.qtNo ? (d.qts || []).find(x => x.no === so.qtNo) : null, discApproved = q && q.status !== 'draft' && aprOf(d, 'Sal_Quotes', q.id) && aprOf(d, 'Sal_Quotes', q.id).status === 'approved' && so.maxDisc <= q.maxDisc;
    return { exposure: ex, credit: cr, stock: st, needCredit: SET.creditCheck === 'approve' && !cr.ok, blockCredit: SET.creditCheck === 'block' && !cr.ok, needDisc: Q.needsDiscApproval(so.lines, SET) && !discApproved, discFromQuote: !!discApproved };
  }
  screen('x_salso', {
    view(v, d) {
      const sos = d.sos || [];
      if (ST.so === 'new' || v.form) {
        if (!v.init) { v.init = 1; const x = ST.so !== 'new' ? sos.find(o => o.id === ST.so) : null, fr = window.SAL_FROM || {}; window.SAL_FROM = null; const q = fr.qt, wh = SET.wh;
          const toEd = l => Object.assign({}, l, { _c: l.code, _p: null, price: String(l.price), qty: String(l.qty), disc: l.disc ? String(l.disc) : '' });
          Object.assign(v, x ? { form: 1, id: x.id, cust: x.customerId, date: x.date, delivery: x.delivery, wh: x.wh, sp: x.salesperson, ref: x.custRef, qtNo: x.qtNo, L: x.lines.map(toEd) }
            : { form: 1, id: null, cust: q ? q.customerId : '', date: today(), delivery: K.addD(today(), 1), wh, sp: q ? q.salesperson : lc(me()), ref: '', qtNo: q ? q.no : '', L: q ? q.lines.map(toEd) : [newLine()] }); }
        const a = acctOf(d, v.cust), lines = cleanLines(v.L, d), t = Q.totals(lines), ex = v.cust ? Q.exposure(v.cust, d.edocs, d.rcpts, d.sos, v.id || -1) : null, cr = ex ? Q.creditCheck(a, { total: t.total }, ex) : null, wo = (d.whs || []).filter(w => w.active).map(w => [w.code, w.code + ' · ' + w.name]);
        return H.head('🧾', v.id ? 'Edit sales order' : 'New sales order', v.qtNo ? 'From ' + esc(v.qtNo) : '', '#1d4ed8') + errs(v.errs)
          + H.card('', `${H.f('Customer', H.sel('cust', custOpts(d), { ph: '— customer —' }))}<div class="fin-row">${H.f('Order date', H.date('date'))}${H.f('Delivery date', H.date('delivery'))}${H.f('From warehouse', wo.length ? H.sel('wh', wo, { ph: false }) : H.inp('wh'))}</div><div class="fin-row">${H.f('Customer PO / ref.', H.inp('ref'))}${H.f('Salesperson', H.sel('sp', userOpts(), { ph: '—' }))}</div>`)
          + (cr ? H.card('Customer credit', `<div class="ei-kv"><span>Receivable (invoiced − received)</span><b>${money(ex.ar)}</b></div><div class="ei-kv"><span>Other open orders</span><b>${money(ex.openOrders)}</b></div><div class="ei-kv"><span>Credit limit</span><b>${cr.noLimit ? 'no limit set' : money(cr.limit)}</b></div><div class="ei-kv ${cr.ok ? 'g' : ''}"><span>After this order</span><b style="color:${cr.ok ? '#15803d' : '#dc2626'}">${money(cr.after)}${cr.over ? ' · over by ' + money(cr.over) : ''}</b></div>${cr.blocked ? '<div class="mb-hint mb-bad">This customer is on hold.</div>' : ''}`) : '')
          + H.card('Lines', linesEd('L', v.L, d, { list: a ? a.priceList : '', date: v.date, soId: v.id })) + H.card('Totals', totTxt(t) + discHint(t.lines))
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Save draft', 'save', 's')}${H.btn('➤ Confirm order', 'submit')}</div>`);
      }
      if (ST.so) { const o = sos.find(x => x.id === ST.so); if (!o) return busy(d); const ap = aprOf(d, 'Sal_Orders', o.id), dns = (d.dns || []).filter(x => x.so === String(o.id)), ch = o.checks || {};
        let extra = '';
        if (v.del) { if (!v.R) v.R = o.lines.map(l => ({ qty: String(Math.max(0, r3(num(l.qty) - num(l.delivered)))) }));
          extra = H.card('Delivery note', `<div class="fin-row">${H.f('Date', H.date('ddate'))}${H.f('Driver', H.inp('ddrv'))}${H.f('Vehicle', H.inp('dveh'))}</div>` + o.lines.map((l, i) => `<div class="ei-kv"><span>${esc(l.description)} · ordered ${fq(l.qty)} · delivered ${fq(l.delivered)}${l.stock ? ' · in stock ' + fq(d.oh.get(l.code) || 0) : ''}</span><b style="width:150px">${lnIn('R', i, 'qty', v.R[i].qty, '0', 0, 'decimal')}</b></div>`).join('') + errs(v.derr) + `<div class="mx-acts">${H.sbtn('✓ Save delivery note', 'doDel', '', 'p')}${H.sbtn('Cancel', 'delX')}</div>`); }
        const toInv = Q.toInvoice(o, [], 0, today()).rows.length;
        return H.head('🧾', o.no + ' · ' + esc(o.customer), dmy(o.date) + (o.delivery ? ' · delivery ' + dmy(o.delivery) : '') + (o.qtNo ? ' · ' + esc(o.qtNo) : '') + (o.custRef ? ' · ref. ' + esc(o.custRef) : '') + ' · ' + esc(uname(o.salesperson)), COL[o.status]) + busy(d)
          + H.kpis([['Total', n2(o.total)], ['Delivered', n2(Q.totals(o.lines, 'delivered').net) + ' net'], ['Invoiced', n2(Q.totals(o.lines, 'invoiced').net) + ' net'], ['Status', o.status]])
          + extra
          + H.card('Status · ' + pill(o.status), (window.APR_PANEL && ap ? APR_PANEL(ap) : '')
            + (ch.credit ? `<div class="ei-kv"><span>Credit check</span><b style="color:${ch.credit.ok ? '#15803d' : '#dc2626'}">${ch.credit.noLimit ? 'no limit' : money(ch.credit.after) + ' of ' + money(ch.credit.limit)}${ch.credit.over ? ' · over by ' + money(ch.credit.over) : ' ✓'}</b></div>` : '')
            + (ch.stock ? `<div class="ei-kv"><span>Stock check</span><b style="color:${ch.stock.ok ? '#15803d' : '#b45309'}">${ch.stock.ok ? 'available ✓' : ch.stock.rows.filter(r => r.short > 0).map(r => r.code + ' short ' + fq(r.short)).join(', ')}</b></div>` : '')
            + (ch.discFromQuote ? `<div class="ei-kv"><span>Discount</span><b>approved on ${esc(o.qtNo)}</b></div>` : '')
            + (o.invoices || []).map(x => `<div class="ei-kv"><span>E-invoice draft · ${dmy(x.date)}</span><b>${esc(x.no || ('#' + x.id))} · ${money(x.total)}</b></div>`).join('')
            + dns.map(x => `<div class="ei-kv"><span>Delivery ${esc(x.no)} · ${dmy(x.date)}${x.driver ? ' · ' + esc(x.driver) : ''}</span><b>${H.sbtn('🖨', 'prDn', `data-i="${x.id}"`)}</b></div>`).join(''))
          + H.card('Lines', table([{ k: 'description', t: 'Description' }, { k: 'code', t: 'Item' }, { k: 'q', t: 'Ordered' }, { k: 'dl', t: 'Delivered' }, { k: 'iv', t: 'Invoiced' }, { k: 'price', t: 'Price', n: 1 }, { k: 'disc', t: 'Disc.' }, { k: 'net', t: 'Net', n: 1 }], Q.totals(o.lines).lines.map(l => ({ description: l.description, code: l.code, q: fq(l.qty) + ' ' + (l.uom || ''), dl: l.stock ? fq(l.delivered) : '—', iv: fq(l.invoiced), price: l.price, disc: l.disc ? l.disc + '%' : '', net: l.net })), { description: 'Total incl. VAT', net: o.total }))
          + H.bar(`<div class="mb-row">${H.btn('← Orders', 'back0', 's')}${['draft', 'rejected'].includes(o.status) ? H.btn('✏️ Edit', 'edit', 's') + H.btn('➤ Confirm order', 'submitX') : ''}${H.btn('🖨 Print', 'print', 's')}${['approved', 'partial'].includes(o.status) && o.lines.some(l => l.stock && num(l.delivered) < num(l.qty)) && !v.del ? H.btn('🚚 Deliver', 'del') : ''}${toInv && ['approved', 'partial', 'delivered'].includes(o.status) ? H.btn('🧾 Create e-invoice', 'mkInv') : ''}${['partial', 'delivered'].includes(o.status) ? H.btn('Close order', 'close', 's') : ''}${['draft', 'pending', 'approved', 'rejected'].includes(o.status) && !o.lines.some(l => num(l.delivered) || num(l.invoiced)) ? H.btn('✕ Cancel', 'cancelO', 's') : ''}</div>`); }
      const tab = v.tab || 'open', rows = sos.filter(o => tab === 'all' ? true : tab === 'open' ? !['closed', 'cancelled', 'invoiced'].includes(o.status) : tab === 'appr' ? ['draft', 'pending', 'rejected'].includes(o.status) : tab === 'del' ? ['approved', 'partial'].includes(o.status) : tab === 'inv' ? Q.toInvoice(o, [], 0).rows.length > 0 && ['approved', 'partial', 'delivered'].includes(o.status) : ['invoiced', 'closed', 'cancelled'].includes(o.status)).sort((a, b) => b.id - a.id);
      return H.head('🧾', 'Sales orders', 'Credit & stock check → approval → delivery → e-invoice', '#1d4ed8') + busy(d) + needSetup(d)
        + H.tabs('tab', [['open', 'Open'], ['appr', 'Draft / in approval'], ['del', 'To deliver'], ['inv', 'To invoice'], ['done', 'Done'], ['all', 'All', sos.length]], 'open')
        + H.card('', table([{ k: 'no', t: 'Order' }, { k: 'date', t: 'Date' }, { k: 'cust', t: 'Customer' }, { k: 'del', t: 'Delivery' }, { k: 'sp', t: 'Salesperson' }, { k: 'total', t: 'Total', n: 1 }, { k: 'st', t: '', raw: 1 }], rows.map(o => ({ no: o.no || '(draft)', date: dmy(o.date), cust: o.customer, del: dmy(o.delivery), sp: uname(o.salesperson), total: o.total, st: pill(o.status), _tap: o.id })), null, 'open'))
        + H.bar(H.btn('＋ New sales order', 'add'));
    },
    act: { toSet, add(t, v) { ST.so = 'new'; clear(v); render(); }, open(t, v) { ST.so = +t.dataset.i; clear(v); render(); }, back0(t, v) { ST.so = null; clear(v); render(); }, cancel(t, v) { if (ST.so === 'new') ST.so = null; clear(v); render(); }, edit(t, v) { clear(v); v.form = 1; render(); },
      addL(t, v) { v[t.dataset.a].push(newLine()); render(); }, delL(t, v) { v[t.dataset.a].splice(+t.dataset.i, 1); render(); },
      save(t, v, d) { return saveSo(v, d, false); }, submit(t, v, d) { return saveSo(v, d, true); },
      async submitX(t, v, d) { try { await confirmSo(d.sos.find(x => x.id === ST.so), d); refresh('x_salso'); } catch (e) { toast(e.message, 'error'); } },
      async print(t, v, d) { const o = d.sos.find(x => x.id === ST.so); await printDoc('Sales order', o.no, o.date, custOf(d, o.customerId), (o.custRef ? '<br>Your ref. <b>' + esc(o.custRef) + '</b>' : '') + (o.delivery ? '<br>Delivery ' + dmy(o.delivery) : ''), o.lines); },
      del(t, v) { v.del = 1; v.R = null; v.ddate = today(); v.derr = null; render(); }, delX(t, v) { v.del = 0; render(); },
      async doDel(t, v, d) { const o = d.sos.find(x => x.id === ST.so), q = {}; v.R.forEach((x, i) => { q[i] = num(x.qty); });
        const res = Q.reserved(d.sos, o.id), av = new Map(); o.lines.forEach(l => { if (l.stock && l.code && window.INV) av.set(l.code, r3(num(d.oh.get(l.code)) - num(res.get(l.code)) - (num(l.delivered) - num(l.invoiced)))); });
        const E2 = Q.checkDelivery(o, q, SET.stockCheck === 'block' ? av : null); if (E2.length) { v.derr = E2; render(); return; }
        if (!confirm('Save the delivery note for ' + o.no + '?')) return;
        try { await settings(true); const no = await S.next('dn', SET.dn), lines = o.lines.map((l, i) => Object.assign({}, l, { delivered: r3(num(l.delivered) + num(q[i])) })), no2 = Object.assign({}, o, { lines, status: 'approved' }), val = Q.r2(o.lines.reduce((s2, l, i) => s2 + Q.lineNet(Object.assign({}, l, { qty: num(q[i]) })).net, 0));
          await S.add('Sal_Deliveries', { Title: no, DnNo: no, SoId: String(o.id), SoNo: o.no, DnDate: v.ddate || today(), Wh: o.wh, CustomerName: o.customer, Driver: str(v.ddrv), Vehicle: str(v.dveh), Value: val, LinesJson: JSON.stringify(o.lines.map((l, i) => ({ i, qty: num(q[i]) })).filter(x => x.qty)) });
          await S.upd('Sal_Orders', o.id, { LinesJson: JSON.stringify(lines), Status: Q.soStatus(no2), History: hist(o.history, 'Delivered ' + no) }); S.drop('Sal_Orders', 'Sal_Deliveries');
          toast('🚚 ' + no + ' saved — print it for the driver', 'success'); v.del = 0; refresh('x_salso'); } catch (e) { v.derr = [e.message]; render(); } },
      async prDn(t, v, d) { const o = d.sos.find(x => x.id === ST.so), dn = d.dns.find(x => x.id === +t.dataset.i), co = await company(), c = custOf(d, o.customerId);
        printHtml('Delivery note ' + dn.no, `<h2 style="margin:0">DELIVERY NOTE ${esc(dn.no)}</h2><table style="width:100%;margin:10px 0"><tr><td><b>${esc(co.name)}</b>${co.addr ? '<br>' + esc(co.addr) : ''}</td><td style="text-align:right">Date ${dmy(dn.date)}<br>Order ${esc(o.no)}${o.custRef ? '<br>Your ref. ' + esc(o.custRef) : ''}<br>From ${esc(dn.wh)}</td></tr></table><p>Deliver to: ${custBlock(c)}</p>
          <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>#</th><th style="text-align:left">Description</th><th>Item</th><th>Qty</th><th>Unit</th></tr>${dn.lines.map((x, k) => { const l = o.lines[x.i] || {}; return `<tr><td>${k + 1}</td><td>${esc(l.description)}</td><td>${esc(l.code || '')}</td><td style="text-align:right">${fq(x.qty)}</td><td>${esc(l.uom || '')}</td></tr>`; }).join('')}</table>
          <p>Driver: ${esc(dn.driver || '')} · Vehicle: ${esc(dn.vehicle || '')}</p><table style="width:100%;margin-top:40px"><tr><td>Delivered by ________________</td><td style="text-align:right">Received by (name, signature, stamp) ________________</td></tr></table>`); },
      async mkInv(t, v, d) { const o = d.sos.find(x => x.id === ST.so), a = acctOf(d, o.customerId), x = Q.toInvoice(o, d.prods, a ? a.payDays : 30, today());
        if (!x.rows.length) return toast('Nothing delivered that is not invoiced yet', 'warn'); const tt = E.totals(x.doc.lines);
        if (!confirm('Create an e-invoice draft for ' + o.customer + ' (' + money(tt.total) + ')?\n\nYou check and send it in E-Invoicing → Invoices.')) return;
        try { const f = E.docToFields(x.doc); f.History = hist([], 'Draft created from sales order ' + o.no); const r = await K.A().add('EInv_Documents', f); K.drop('EInv_Documents');
          const lines = o.lines.map((l, i) => { const rw = x.rows.find(y => y.i === i); return Object.assign({}, l, { invoiced: r3(num(l.invoiced) + (rw ? rw.qty : 0)) }); }), no2 = Object.assign({}, o, { lines, status: 'approved' });
          const inv = (o.invoices || []).concat([{ id: r.id, date: today(), total: tt.total }]);
          await S.upd('Sal_Orders', o.id, { LinesJson: JSON.stringify(lines), Status: Q.soStatus(no2), Invoices: JSON.stringify(inv), History: hist(o.history, 'E-invoice draft created (' + money(tt.total) + ')') }); S.drop('Sal_Orders');
          toast('🧾 E-invoice draft created — send it in E-Invoicing → Invoices', 'success'); refresh('x_salso'); } catch (e) { toast(e.message, 'error'); } },
      async close(t, v, d) { const o = d.sos.find(x => x.id === ST.so); if (!confirm('Close ' + o.no + '? The rest will not be delivered.')) return; await S.upd('Sal_Orders', o.id, { Status: 'closed', History: hist(o.history, 'Closed') }); S.drop('Sal_Orders'); refresh('x_salso'); },
      async cancelO(t, v, d) { const o = d.sos.find(x => x.id === ST.so); if (!confirm('Cancel ' + o.no + '?')) return; await S.upd('Sal_Orders', o.id, { Status: 'cancelled', History: hist(o.history, 'Cancelled') }); S.drop('Sal_Orders'); refresh('x_salso'); } } });
  async function saveSo(v, d, andConfirm) {
    const lines = cleanLines(v.L, d), E2 = Q.checkLines(lines); if (!v.cust) E2.push('Choose the customer'); if (E2.length) { v.errs = E2; render(); return; }
    const c = custOf(d, v.cust), tt = Q.totals(lines), f = { CustomerId: String(v.cust), CustomerName: c.title, SoDate: v.date, DeliveryDate: v.delivery || '', Wh: str(v.wh) || SET.wh, Salesperson: lc(v.sp), CustRef: str(v.ref), QtNo: v.qtNo || '', Net: tt.net, Vat: tt.vat, Total: tt.total, MaxDisc: Q.maxDisc(lines), LinesJson: JSON.stringify(lines) };
    try { let id = v.id; if (id) await S.upd('Sal_Orders', id, f); else { await settings(true); const no = await S.next('so', SET.so); id = (await S.add('Sal_Orders', Object.assign(f, { Title: no, SoNo: no, Status: 'draft', Invoices: '[]', History: hist([], 'Created' + (v.qtNo ? ' from ' + v.qtNo : '')) }))).id;
        if (v.qtNo) { const q = d.qts.find(x => x.no === v.qtNo); if (q) { await S.upd('Sal_Quotes', q.id, { Status: 'ordered', SoNo: no, History: hist(q.history, 'Accepted · ' + no) }); if (q.leadId) { await S.upd('Sal_Leads', Number(q.leadId), { Stage: 'won', Probability: 100 }); S.drop('Sal_Leads'); } } } }
      S.drop('Sal_Orders', 'Sal_Quotes'); ST.so = Number(id);
      if (andConfirm) { const b = await bundle(true); Object.assign(d, b); await confirmSo(d.sos.find(x => x.id === Number(id)), d); } else toast('✅ Saved as draft', 'success');
      clear(v); refresh('x_salso'); } catch (e) { v.errs = [e.message]; render(); }
  }
  /* confirm: credit + stock + discount checks → approved, or approval(s), or blocked */
  async function confirmSo(o, d) {
    const ch = await runChecks(o, d), keep = { credit: ch.credit, stock: ch.stock, needCredit: ch.needCredit, needDisc: ch.needDisc, discFromQuote: ch.discFromQuote, over: ch.credit.over };
    if (ch.blockCredit) throw new Error('Over the credit limit by ' + money(ch.credit.over) + (ch.credit.blocked ? ' (customer on hold)' : '') + ' — the order cannot be confirmed (Sales settings: credit check = block).');
    if (SET.stockCheck === 'block' && !ch.stock.ok) throw new Error('Not enough stock: ' + ch.stock.rows.filter(r => r.short > 0).map(r => r.code + ' short ' + r.short).join(', '));
    const first = ch.needCredit ? 'so_credit' : ch.needDisc ? 'sq_disc' : '';
    await S.upd('Sal_Orders', o.id, { Status: first ? 'pending' : 'approved', Checks: JSON.stringify(keep), History: hist(o.history, first ? 'Confirmed · needs approval: ' + AP.DOC_TYPES[first] : 'Confirmed') }); S.drop('Sal_Orders');
    if (!first) { toast('✓ Order confirmed' + (ch.stock.ok ? '' : ' · ⚠ stock short: ' + ch.stock.rows.filter(r => r.short > 0).map(r => r.code).join(', ')), ch.stock.ok ? 'success' : 'warn'); return; }
    const a = await AS.submit({ type: first, list: 'Sal_Orders', docId: o.id, docNo: o.no, dept: '', amount: first === 'so_credit' ? ch.credit.over : o.total, summary: o.customer + ' · ' + (first === 'so_credit' ? 'over credit limit by ' + n2(ch.credit.over) : 'discount ' + o.maxDisc + '%') });
    toast(a.status === 'approved' ? '✓ Approved' : '➤ Sent for approval to ' + AP.waitingFor(a).map(AS.userName).join(' or '), 'success');
  }

  /* ================= Customer accounts & price lists ================= */
  screen('x_salcust', {
    view(v, d) {
      const tab = v.tab || 'acc';
      const tabs = H.tabs('tab', [['acc', 'Customer accounts'], ['pl', 'Price lists']], 'acc');
      if (tab === 'pl') {
        if (v.pl != null) { const p = v.pl === 'new' ? null : (d.pls || []).find(x => x.id === v.pl); if (!v.pinit) { v.pinit = 1; Object.assign(v, { pname: p ? p.name : '', pfrom: p ? p.from : '', pto: p ? p.to : '', pdef: p && p.isDefault ? '1' : '', pact: !p || p.active ? '1' : '', PI: p ? p.items.map(x => ({ code: x.code, price: String(x.price), minQty: x.minQty ? String(x.minQty) : '' })) : [{ code: '', price: '', minQty: '' }] }); }
          return H.head('🏷', p ? 'Price list · ' + esc(p.name) : 'New price list', 'Prices excl. VAT · optional quantity tiers ("from qty")', '#0f766e') + errs(v.errs)
            + H.card('', `<div class="fin-row">${H.f('Name', H.inp('pname', { ph: 'e.g. Wholesale, Hypermarkets, Retail' }))}${H.f('Valid from', H.date('pfrom', { val: v.pfrom || '' }))}${H.f('Valid to', H.date('pto', { val: v.pto || '' }))}</div><div class="fin-row">${H.f('Default list', H.sel('pdef', [['1', 'Yes — for customers without a list']], { ph: 'No' }))}${H.f('Active', H.sel('pact', [['1', 'Active']], { ph: 'Inactive' }))}</div>`)
            + H.card('Prices', v.PI.map((x, i) => `<div class="inv-g"><div><label>Item</label>${lnSel('PI', i, 'code', itemOpts(d), x.code, '— item —')}</div><div><label>Price</label>${lnIn('PI', i, 'price', x.price, '0.00', 0, 'decimal')}</div><div><label>From qty</label>${lnIn('PI', i, 'minQty', x.minQty, '1', 0, 'decimal')}</div><div><label>&nbsp;</label><button type="button" class="mx-sb r" data-x="pDel" data-i="${i}">✕</button></div></div>`).join('') + `<div class="mx-acts">${H.sbtn('＋ Add price', 'pAdd')}${H.sbtn('＋ All items at their sales price', 'pAll')}</div>`)
            + H.bar(`<div class="mb-row">${H.btn('Cancel', 'pX', 's')}${H.btn('💾 Save price list', 'pSave')}</div>`); }
        return H.head('🏷', 'Price lists', 'Each customer can have its own list; the default list is used otherwise', '#0f766e') + busy(d) + needSetup(d) + tabs
          + H.card('', table([{ k: 'n', t: 'Price list' }, { k: 'v', t: 'Valid' }, { k: 'c', t: 'Prices' }, { k: 'u', t: 'Customers' }, { k: 'st', t: '', raw: 1 }], (d.pls || []).map(p => ({ n: p.name + (p.isDefault ? ' (default)' : ''), v: (p.from ? dmy(p.from) : '…') + ' – ' + (p.to ? dmy(p.to) : '…'), c: String(p.items.length), u: String((d.accts || []).filter(a => a.priceList === p.name).length), st: pill(p.active ? 'approved' : 'closed').replace('Approved', 'Active').replace('Closed', 'Inactive'), _tap: p.id })), null, 'pOpen'))
          + H.bar(H.btn('＋ New price list', 'pNew'));
      }
      if (v.cu != null) { const c = custOf(d, v.cu), a = acctOf(d, v.cu); if (!v.cinit) { v.cinit = 1; Object.assign(v, { climit: a ? String(a.creditLimit) : '0', cdays: a ? String(a.payDays) : '30', cpl: a ? a.priceList : '', csp: a ? a.salesperson : '', ctags: a ? a.tags.join(', ') : '', cphone: a ? a.phone : '', chold: a && a.blocked ? '1' : '', cnotes: a ? a.notes : '' }); }
        const ex = Q.exposure(v.cu, d.edocs, d.rcpts, d.sos, -1), sales = (d.sales || []).filter(s => s.customerId === String(v.cu)), last12 = Q.r2(sales.filter(s => s.date >= K.addD(today(), -365)).reduce((s, x) => s + x.net, 0));
        return H.head('👤', esc(c.title || 'Customer'), [c.trn ? 'TRN ' + c.trn : '', c.emirate ? emName(c.emirate) : ''].filter(Boolean).map(esc).join(' · '), '#0f766e')
          + H.kpis([['Receivable', n2(ex.ar), ex.ar > 0 ? 'o' : 'g'], ['Open orders', n2(ex.openOrders)], ['Credit used', a && a.creditLimit ? Math.round(ex.total * 100 / a.creditLimit) + '%' : '—'], ['Sales last 12 months', n2(last12)]])
          + H.card('Account', `<div class="fin-row">${H.f('Credit limit (AED, 0 = no limit)', H.num('climit'))}${H.f('Payment days', H.num('cdays'))}${H.f('Price list', H.sel('cpl', (d.pls || []).filter(p => p.active).map(p => p.name), { ph: '— default —' }))}</div><div class="fin-row">${H.f('Salesperson', H.sel('csp', userOpts(), { ph: '—' }))}${H.f('Tags (comma separated)', H.inp('ctags', { ph: 'key account, hypermarket, HoReCa' }))}${H.f('Phone', H.inp('cphone'))}</div>${H.f('On hold', H.sel('chold', [['1', 'Yes — no new orders']], { ph: 'No' }))}${H.f('Notes', H.txt('cnotes'))}`)
          + (sales.length ? H.card('Latest invoices', table([{ k: 'n', t: 'Invoice' }, { k: 'd', t: 'Date' }, { k: 'v', t: 'Net', n: 1 }], sales.slice().sort((x, y) => y.date.localeCompare(x.date)).slice(0, 10).map(s => ({ n: s.number, d: dmy(s.date), v: s.net })))) : '')
          + H.bar(`<div class="mb-row">${H.btn('← Customers', 'cX', 's')}${H.btn('💾 Save account', 'cSave')}</div>`); }
      const q = lc(v.q || ''), rows = (d.custs || []).filter(c => !q || lc(c.title + ' ' + (c.emirate || '')).includes(q)).map(c => { const a = acctOf(d, c.id), ex = Q.exposure(c.id, d.edocs, d.rcpts, d.sos, -1); return { n: c.title, em: c.emirate ? emName(c.emirate) : '', sp: a ? uname(a.salesperson) : '', pl: a ? a.priceList || 'default' : 'default', lim: a && a.creditLimit ? n2(a.creditLimit) : '—', ar: ex.ar, oo: ex.openOrders, st: a && a.blocked ? pill('rejected').replace('Rejected', 'On hold') : '', _tap: c.id }; });
      return H.head('👤', 'Customer accounts', 'Credit limit, payment days, price list, salesperson, tags', '#0f766e') + busy(d) + needSetup(d) + tabs + H.search('q', 'Search customers')
        + H.card('', table([{ k: 'n', t: 'Customer' }, { k: 'em', t: 'Emirate' }, { k: 'sp', t: 'Salesperson' }, { k: 'pl', t: 'Price list' }, { k: 'lim', t: 'Credit limit' }, { k: 'ar', t: 'Receivable', n: 1 }, { k: 'oo', t: 'Open orders', n: 1 }, { k: 'st', t: '', raw: 1 }], rows, null, 'cOpen'))
        + `<span class="mb-hint">Customers (name, TRN, address, Peppol ID) are kept in E-Invoicing → Customers; this page adds the sales details.</span>`;
    },
    act: { toSet, cOpen(t, v) { v.cu = t.dataset.i; v.cinit = 0; render(); }, cX(t, v) { v.cu = null; render(); },
      async cSave(t, v, d) { const c = custOf(d, v.cu), a = acctOf(d, v.cu), f = { Title: c.title, CustomerId: String(v.cu), CustomerName: c.title, CreditLimit: num(v.climit), PayDays: num(v.cdays), PriceList: v.cpl || '', Salesperson: lc(v.csp), Tags: str(v.ctags), Phone: str(v.cphone), Blocked: v.chold ? '1' : '', Notes: v.cnotes || '' };
        try { if (a) await S.upd('Sal_Accounts', a.id, f); else await S.add('Sal_Accounts', f); S.drop('Sal_Accounts'); toast('✅ Saved', 'success'); v.cu = null; refresh('x_salcust'); } catch (e) { toast(e.message, 'error'); } },
      pNew(t, v) { v.pl = 'new'; v.pinit = 0; v.errs = null; render(); }, pOpen(t, v) { v.pl = +t.dataset.i; v.pinit = 0; v.errs = null; render(); }, pX(t, v) { v.pl = null; render(); },
      pAdd(t, v) { v.PI.push({ code: '', price: '', minQty: '' }); render(); }, pDel(t, v) { v.PI.splice(+t.dataset.i, 1); render(); },
      pAll(t, v, d) { const have = new Set(v.PI.map(x => x.code)); (d.items || []).filter(i => i.active && i.kind !== 'raw' && !have.has(i.code)).forEach(i => v.PI.push({ code: i.code, price: String(i.price || ''), minQty: '' })); v.PI = v.PI.filter(x => x.code || x.price); render(); },
      async pSave(t, v, d) { const items = v.PI.filter(x => x.code).map(x => ({ code: x.code, price: num(x.price), minQty: num(x.minQty) })), E2 = []; if (!str(v.pname)) E2.push('Name is required'); if ((d.pls || []).some(p => p.name === str(v.pname) && p.id !== v.pl)) E2.push('A price list with this name exists'); if (E2.length) { v.errs = E2; render(); return; }
        const f = { Title: str(v.pname), ValidFrom: v.pfrom || '', ValidTo: v.pto || '', Currency: 'AED', IsDefault: v.pdef ? '1' : '', Active: v.pact ? '1' : '0', ItemsJson: JSON.stringify(items) };
        try { if (v.pdef) for (const p of (d.pls || []).filter(p => p.isDefault && p.id !== v.pl)) await S.upd('Sal_PriceLists', p.id, { IsDefault: '' });
          if (v.pl === 'new') await S.add('Sal_PriceLists', f); else await S.upd('Sal_PriceLists', v.pl, f); S.drop('Sal_PriceLists'); toast('🏷 Price list saved', 'success'); v.pl = null; refresh('x_salcust'); } catch (e) { toast(e.message, 'error'); } } } });

  /* ================= Campaigns & segments ================= */
  screen('x_salmkt', {
    view(v, d) {
      const tab = v.tab || 'camp', tabs = H.tabs('tab', [['camp', 'Campaigns'], ['seg', 'Customer segments']], 'camp');
      if (tab === 'seg') {
        if (v.sg != null) { const s = v.sg === 'new' ? null : (d.segs || []).find(x => x.id === v.sg), r = s ? s.rules : {}; if (!v.sinit) { v.sinit = 1; Object.assign(v, { sname: s ? s.name : '', sem: r.emirates || [], stags: (r.tags || []).join(', '), ssp: r.salesperson || '', spl: r.priceList || '', smin: r.minSales ? String(r.minSales) : '', sdays: r.sinceDays ? String(r.sinceDays) : '365', snone: r.noSales ? '1' : '' }); }
          const rules = segRules(v), mem = Q.segMembers({ rules }, d.custs, d.accts, d.sales, today());
          return H.head('👥', s ? 'Segment · ' + esc(s.name) : 'New segment', 'Customers that match all the rules below', '#be185d') + errs(v.errs)
            + H.card('', H.f('Name', H.inp('sname', { ph: 'e.g. Key accounts Dubai, Inactive customers' })) + H.f('Emirates', EMIRATES.map(([e, n]) => `<button type="button" class="mx-sb${v.sem.includes(e) ? ' p' : ''}" data-x="tEm" data-e="${esc(e)}">${v.sem.includes(e) ? '☑' : '☐'} ${esc(n)}</button>`).join(' '))
              + `<div class="fin-row">${H.f('Has any of these tags', H.inp('stags', { ph: 'key account, HoReCa', r: 1 }))}${H.f('Salesperson', H.sel('ssp', userOpts(), { ph: 'any' }))}${H.f('Price list', H.sel('spl', (d.pls || []).map(p => p.name), { ph: 'any' }))}</div><div class="fin-row">${H.f('Sales at least (AED, net)', H.num('smin', { r: 1 }))}${H.f('In the last (days)', H.num('sdays', { r: 1 }))}${H.f('No sales in that period', H.sel('snone', [['1', 'Yes — inactive customers']], { ph: 'No' }))}</div>`)
            + H.card('Members · ' + mem.length, table([{ k: 'n', t: 'Customer' }, { k: 'e', t: 'Emirate' }, { k: 'm', t: 'Email' }, { k: 's', t: 'Sales in period', n: 1 }], mem.map(c => ({ n: c.title, e: c.emirate ? emName(c.emirate) : '', m: c.email || '', s: c.sales }))) + `<div class="mx-acts">${H.sbtn('⬇ Contacts (CSV)', 'sCsv')}</div>`)
            + H.bar(`<div class="mb-row">${H.btn('Cancel', 'sX', 's')}${H.btn('💾 Save segment', 'sSave')}</div>`); }
        return H.head('👥', 'Customer segments', 'Groups of customers by emirate, tags, salesperson, price list and sales', '#be185d') + busy(d) + needSetup(d) + tabs
          + H.card('', table([{ k: 'n', t: 'Segment' }, { k: 'r', t: 'Rules' }, { k: 'c', t: 'Customers' }], (d.segs || []).map(s => ({ n: s.name, r: segText(s.rules), c: String(Q.segMembers(s, d.custs, d.accts, d.sales, today()).length), _tap: s.id })), null, 'sOpen'))
          + H.bar(H.btn('＋ New segment', 'sNew'));
      }
      if (v.cp != null) { const c = v.cp === 'new' ? null : (d.camps || []).find(x => x.id === v.cp); if (!v.cinit) { v.cinit = 1; Object.assign(v, { cname: c ? c.name : '', cch: c ? c.channel : '', cseg: c ? c.segment : '', cstart: c ? c.start : today(), cend: c ? c.end : '', cst: c ? c.status : 'planned', cown: c ? c.owner : lc(me()), cbud: c ? String(c.budget) : '', ccost: c ? String(c.cost) : '', cgoal: c ? c.goal : '', cnotes: c ? c.notes : '' }); }
        const st = c ? Q.campaignStats(c, d.leads) : null, seg = (d.segs || []).find(s => s.name === v.cseg);
        return H.head('📣', c ? esc(c.name) : 'New campaign', c ? dmy(c.start) + (c.end ? ' – ' + dmy(c.end) : '') : 'Plan, cost and results', '#be185d') + errs(v.errs)
          + (st ? H.kpis([['Leads', String(st.leads)], ['Won', st.won + ' · ' + n2(st.wonValue), st.won ? 'g' : ''], ['Open pipeline', n2(st.pipeline)], ['Cost per lead', st.leads ? n2(st.costPerLead) : '—'], ['Return on cost', st.roi == null ? '—' : st.roi + '%', st.roi > 0 ? 'g' : st.roi != null ? 'r' : '']]) : '')
          + H.card('', `<div class="fin-row">${H.f('Name', H.inp('cname', { ph: 'e.g. Ramadan offer 2027' }))}${H.f('Channel', H.sel('cch', Q.CHANNELS, { ph: '—' }))}${H.f('Target segment', H.sel('cseg', (d.segs || []).map(s => s.name), { ph: '—' }))}</div><div class="fin-row">${H.f('Start', H.date('cstart'))}${H.f('End', H.date('cend', { val: v.cend || '' }))}${H.f('Status', H.sel('cst', [['planned', 'Planned'], ['running', 'Running'], ['done', 'Done'], ['cancelled', 'Cancelled']], { ph: false }))}${H.f('Owner', H.sel('cown', userOpts(), { ph: '—' }))}</div><div class="fin-row">${H.f('Budget (AED)', H.num('cbud'))}${H.f('Actual cost (AED)', H.num('ccost'))}</div>${H.f('Goal / offer', H.txt('cgoal'))}${H.f('Notes', H.txt('cnotes'))}`)
          + (seg ? H.card('Audience · ' + esc(seg.name), `<span class="mb-hint">${Q.segMembers(seg, d.custs, d.accts, d.sales, today()).length} customer(s) in this segment.</span>`) : '')
          + (c ? H.card('Leads from this campaign', table([{ k: 't', t: 'Opportunity' }, { k: 'co', t: 'Company' }, { k: 'v', t: 'Value', n: 1 }, { k: 'st', t: '', raw: 1 }], (d.leads || []).filter(l => l.campaign === c.name).map(l => ({ t: l.title, co: l.company, v: l.value, st: pill(l.stage) })))) : '')
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cX', 's')}${H.btn('💾 Save campaign', 'cSave')}</div>`); }
      const rows = (d.camps || []).slice().sort((a, b) => String(b.start).localeCompare(String(a.start))).map(c => { const st = Q.campaignStats(c, d.leads); return { n: c.name, ch: c.channel, dt: dmy(c.start) + (c.end ? ' – ' + dmy(c.end) : ''), l: String(st.leads), w: st.wonValue, cost: c.cost, roi: st.roi == null ? '—' : st.roi + '%', st: pill(c.status), _tap: c.id }; });
      return H.head('📣', 'Campaigns', 'Channel, segment, cost → leads, won value, return', '#be185d') + busy(d) + needSetup(d) + tabs
        + H.card('', table([{ k: 'n', t: 'Campaign' }, { k: 'ch', t: 'Channel' }, { k: 'dt', t: 'Dates' }, { k: 'l', t: 'Leads' }, { k: 'w', t: 'Won value', n: 1 }, { k: 'cost', t: 'Cost', n: 1 }, { k: 'roi', t: 'Return' }, { k: 'st', t: '', raw: 1 }], rows, null, 'cOpen'))
        + H.bar(H.btn('＋ New campaign', 'cNew'));
    },
    act: { toSet, cNew(t, v) { v.cp = 'new'; v.cinit = 0; v.errs = null; render(); }, cOpen(t, v) { v.cp = +t.dataset.i; v.cinit = 0; v.errs = null; render(); }, cX(t, v) { v.cp = null; render(); },
      async cSave(t, v, d) { if (!str(v.cname)) { v.errs = ['Name is required']; render(); return; } const f = { Title: str(v.cname), Channel: v.cch || '', Segment: v.cseg || '', StartDate: v.cstart || '', EndDate: v.cend || '', Status: v.cst || 'planned', Owner: lc(v.cown), Budget: num(v.cbud), Cost: num(v.ccost), Goal: v.cgoal || '', Notes: v.cnotes || '' };
        try { if (v.cp === 'new') await S.add('Sal_Campaigns', f); else await S.upd('Sal_Campaigns', v.cp, f); S.drop('Sal_Campaigns'); toast('📣 Saved', 'success'); v.cp = null; refresh('x_salmkt'); } catch (e) { toast(e.message, 'error'); } },
      sNew(t, v) { v.sg = 'new'; v.sinit = 0; v.errs = null; render(); }, sOpen(t, v) { v.sg = +t.dataset.i; v.sinit = 0; v.errs = null; render(); }, sX(t, v) { v.sg = null; render(); },
      tEm(t, v) { const e = t.dataset.e; v.sem = v.sem.includes(e) ? v.sem.filter(x => x !== e) : v.sem.concat([e]); render(); },
      async sSave(t, v) { if (!str(v.sname)) { v.errs = ['Name is required']; render(); return; } const f = { Title: str(v.sname), RulesJson: JSON.stringify(segRules(v)) };
        try { if (v.sg === 'new') await S.add('Sal_Segments', f); else await S.upd('Sal_Segments', v.sg, f); S.drop('Sal_Segments'); toast('👥 Segment saved', 'success'); v.sg = null; refresh('x_salmkt'); } catch (e) { toast(e.message, 'error'); } },
      sCsv(t, v, d) { const mem = Q.segMembers({ rules: segRules(v) }, d.custs, d.accts, d.sales, today()), A = new Map((d.accts || []).map(a => [a.customerId, a]));
        FU.csv(str(v.sname) || 'segment', [{ k: 'n', t: 'Customer' }, { k: 'e', t: 'Emirate' }, { k: 'm', t: 'Email' }, { k: 'p', t: 'Phone' }, { k: 'sp', t: 'Salesperson' }, { k: 's', t: 'Sales', n: 1 }], mem.map(c => { const a = A.get(String(c.id)) || {}; return { n: c.title, e: c.emirate || '', m: c.email || '', p: a.phone || '', sp: a.salesperson || '', s: c.sales }; })); } } });
  const segRules = v => ({ emirates: v.sem || [], tags: String(v.stags || '').split(',').map(s => s.trim()).filter(Boolean), salesperson: lc(v.ssp), priceList: v.spl || '', minSales: num(v.smin), sinceDays: num(v.sdays), noSales: !!v.snone });
  const segText = r => [(r.emirates || []).length ? r.emirates.map(emName).join('/') : '', (r.tags || []).length ? 'tags ' + r.tags.join(', ') : '', r.salesperson ? 'salesperson ' + uname(r.salesperson) : '', r.priceList ? 'list ' + r.priceList : '', r.minSales ? 'sales ≥ ' + n2(r.minSales) + (r.sinceDays ? ' in ' + r.sinceDays + ' days' : '') : '', r.noSales ? 'no sales in ' + (r.sinceDays || 365) + ' days' : ''].filter(Boolean).join(' · ') || 'all customers';

  /* ================= Targets & commissions ================= */
  screen('x_saltgt', {
    view(v, d) {
      const per = v.per || month(), rows = Q.commissions(d.tgts, d.sales, per), tot = rows.reduce((s, r) => ({ t: s.t + r.target, a: s.a + r.actual, p: s.p + r.payout }), { t: 0, a: 0, p: 0 });
      if (v.ed) { if (!v.einit) { v.einit = 1; const ex = (d.tgts || []).filter(t => t.period === per); v.T = ex.length ? ex.map(t => ({ id: t.id, sp: t.salesperson, target: String(t.target), comm: String(t.commPct), bonus: String(t.bonusPct) })) : [{ sp: '', target: '', comm: '1', bonus: '0' }]; }
        return H.head('🏆', 'Targets · ' + per, 'Net sales target per salesperson · commission % of sales · bonus % of sales above target', '#b45309')
          + H.card('', v.T.map((x, i) => `<div class="inv-g"><div><label>Salesperson</label>${lnSel('T', i, 'sp', userOpts(), x.sp, '— person —')}</div><div><label>Target (AED net)</label>${lnIn('T', i, 'target', x.target, '0', 0, 'decimal')}</div><div><label>Commission %</label>${lnIn('T', i, 'comm', x.comm, '0', 0, 'decimal')}</div><div><label>Bonus % above target</label>${lnIn('T', i, 'bonus', x.bonus, '0', 0, 'decimal')}</div><div><label>&nbsp;</label><button type="button" class="mx-sb r" data-x="tDel" data-i="${i}">✕</button></div></div>`).join('') + `<div class="mx-acts">${H.sbtn('＋ Add salesperson', 'tAdd')}${H.sbtn('⧉ Copy last month', 'tCopy')}</div>`)
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'edX', 's')}${H.btn('💾 Save targets', 'tSave')}</div>`); }
      return H.head('🏆', 'Targets & commissions', 'Sales = sent e-invoices net of VAT (credit notes deducted) · by the order\'s salesperson, else the customer\'s', '#b45309') + busy(d) + needSetup(d)
        + H.card('', `<div class="fin-row">${H.f('Month', `<input type="month" data-v="per" data-r="1" value="${esc(per)}">`)}</div>`)
        + H.kpis([['Target', n2(tot.t)], ['Actual', n2(tot.a), tot.t && tot.a >= tot.t ? 'g' : ''], ['Achieved', tot.t ? Math.round(tot.a * 100 / tot.t) + '%' : '—'], ['Commission + bonus', n2(tot.p)]])
        + H.card('Per salesperson', table([{ k: 'sp', t: 'Salesperson' }, { k: 't', t: 'Target', n: 1 }, { k: 'a', t: 'Actual', n: 1 }, { k: 'p', t: 'Achieved', raw: 1 }, { k: 'g', t: 'Gap', n: 1 }, { k: 'c', t: 'Commission', n: 1 }, { k: 'b', t: 'Bonus', n: 1 }, { k: 'x', t: 'Payout', n: 1 }], rows.map(r => ({ sp: uname(r.salesperson) || '(no salesperson)', t: r.target, a: r.actual, p: r.noTarget ? 'no target' : `<b style="color:${r.pct >= 100 ? '#15803d' : r.pct >= 80 ? '#b45309' : '#dc2626'}">${r.pct}%</b>`, g: r.noTarget ? 0 : r.gap, c: r.commission, b: r.bonus, x: r.payout })), { sp: 'Total', t: tot.t, a: tot.a, x: tot.p }))
        + H.bar(`<div class="mb-row">${H.btn('⬇ CSV', 'csv', 's')}${H.btn('🎯 Set targets for ' + per, 'ed')}</div>`);
    },
    act: { toSet, ed(t, v) { v.ed = 1; v.einit = 0; render(); }, edX(t, v) { v.ed = 0; render(); }, tAdd(t, v) { v.T.push({ sp: '', target: '', comm: '1', bonus: '0' }); render(); }, tDel(t, v) { v.T.splice(+t.dataset.i, 1); render(); },
      tCopy(t, v, d) { const per = v.per || month(), p = new Date(per + '-01'); p.setMonth(p.getMonth() - 1); const prev = p.toISOString().slice(0, 7), ex = (d.tgts || []).filter(x => x.period === prev); if (!ex.length) return toast('No targets in ' + prev, 'warn'); v.T = ex.map(x => ({ sp: x.salesperson, target: String(x.target), comm: String(x.commPct), bonus: String(x.bonusPct) })); render(); },
      async tSave(t, v, d) { const per = v.per || month(), want = v.T.filter(x => x.sp), have = (d.tgts || []).filter(x => x.period === per);
        try { for (const h of have) if (!want.some(w => lc(w.sp) === h.salesperson)) await S.del('Sal_Targets', h.id);
          for (const w of want) { const h = have.find(x => x.salesperson === lc(w.sp)), f = { Title: per + ' · ' + lc(w.sp), Salesperson: lc(w.sp), Period: per, Target: num(w.target), CommPct: num(w.comm), BonusPct: num(w.bonus) }; if (h) await S.upd('Sal_Targets', h.id, f); else await S.add('Sal_Targets', f); }
          S.drop('Sal_Targets'); v.ed = 0; toast('🏆 Targets saved', 'success'); refresh('x_saltgt'); } catch (e) { toast(e.message, 'error'); } },
      csv(t, v, d) { const per = v.per || month(); FU.csv('commissions-' + per, [{ k: 'sp', t: 'Salesperson' }, { k: 'pd', t: 'Month' }, { k: 't', t: 'Target', n: 1 }, { k: 'a', t: 'Actual', n: 1 }, { k: 'p', t: 'Achieved %' }, { k: 'c', t: 'Commission', n: 1 }, { k: 'b', t: 'Bonus', n: 1 }, { k: 'x', t: 'Payout', n: 1 }], Q.commissions(d.tgts, d.sales, per).map(r => ({ sp: uname(r.salesperson), pd: r.period, t: r.target, a: r.actual, p: String(r.pct), c: r.commission, b: r.bonus, x: r.payout }))); } } });

  /* ================= Sales settings ================= */
  screen('x_salset', {
    view(v, d) { const s = d.set || SET; if (!v.__f && !d.busy && d.set) Object.assign(v, { __f: 1, qt: s.qt, so: s.so, dn: s.dn, lead: s.lead, wh: s.wh, md: String(s.maxDisc), qd: String(s.quoteDays), cc: s.creditCheck, sc: s.stockCheck, terms: s.terms });
      return H.head('⚙️', 'Sales settings', 'Numbering, discount limit, credit and stock checks, set up', '#475569') + busy(d)
        + H.card('Set up', `<span class="mb-hint">Creates the sales lists (and the approval lists if missing). Customers and invoices use E-Invoicing; set up E-Invoicing and Finance first.</span>${H.btn(v.busy ? '⏳ ' + esc(v.busy) : '🛠 Set up lists', 'setup')}<div style="height:8px"></div>${H.btn('⚙️ Approval setup (who approves discounts and credit)', 'toAprSet', 's')}`)
        + H.card('Numbering', `<div class="fin-row">${H.f('Leads', H.inp('lead'))}${H.f('Quotations', H.inp('qt'))}${H.f('Sales orders', H.inp('so'))}${H.f('Delivery notes', H.inp('dn'))}</div>`)
        + H.card('Rules', `<div class="fin-row">${H.f('Discount limit % (above → approval)', H.num('md'))}${H.f('Quotation valid (days)', H.num('qd'))}${H.f('Default warehouse', H.inp('wh'))}</div><div class="fin-row">${H.f('Over the credit limit', H.sel('cc', [['approve', 'Needs approval'], ['block', 'Not allowed'], ['off', 'No check']], { ph: false }))}${H.f('Not enough stock', H.sel('sc', [['warn', 'Warn only'], ['block', 'Not allowed']], { ph: false }))}</div>`)
        + H.card('Terms printed on quotations', H.txt('terms'))
        + H.bar(H.btn('💾 Save', 'save')); },
    act: { toAprSet() { go('x_aprset'); },
      async setup(t, v) { if (v.busy) return; v.busy = 'Starting…'; render(); try { await FU.setupLists(Object.assign({}, Q.LISTS, AP.LISTS), n => { v.busy = n; render(); }); K.drop(...Q.LIST_NAMES, ...AP.LIST_NAMES); toast('✅ Sales lists are ready', 'success'); } catch (e) { toast(e.message, 'error'); } v.busy = ''; refresh('x_salset'); },
      async save(t, v) { const f = { QtPrefix: str(v.qt) || 'QT', SoPrefix: str(v.so) || 'SO', DnPrefix: str(v.dn) || 'DN', LeadPrefix: str(v.lead) || 'LD', DefaultWh: str(v.wh) || 'MAIN', MaxDiscPct: num(v.md), QuoteDays: num(v.qd) || 30, CreditCheck: v.cc || 'approve', StockCheck: v.sc || 'warn', QuoteTerms: v.terms || '' };
        try { await settings(true); if (SET.row) await K.A().upd('Sal_Settings', SET.row.id, f); else await K.A().add('Sal_Settings', Object.assign({ Title: 'Sales' }, f)); K.drop('Sal_Settings'); toast('✅ Saved', 'success'); v.__f = 0; refresh('x_salset'); } catch (e) { toast(e.message, 'error'); } } } });

  window.SAL_UI = { bundle, version: '1' };
})();
