/* ============================================================
   ORBIT PROCUREMENT — storage + screens
   Procurement home · Purchase requests · RFQs & quotations · Purchase orders (approve, send, receive, 3-way match → bill) · Procurement settings
   Uses: the approval engine (APRSTORE) for requests, orders and invoices outside the match tolerance; inventory (INVSTORE)
   to receive stock items against goods received not invoiced; finance (Fin_Bills) for the supplier bill.
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, F = window.FIN, P = window.PUR, S = window.FINSTORE, FU = window.FIN_UI, AP = window.APR;
  if (!K || !F || !P || !S || !FU || !AP || !window.APRSTORE) return;
  const { reg, D, esc, num, today, dmy, str, toast, V, render, cur, H, iso, me, get } = K, { table, n2, money, acctOpts, acctName, printHtml } = FU, AS = window.APRSTORE;
  const ST = { req: null, rfq: null, po: null, deep: null };
  const go = k => K.A().go(k), goTo = k => { ST.deep = k; go(k); };
  const hist = (h, text) => JSON.stringify((h || []).concat([{ at: iso(), by: me(), text }]).slice(-40));
  const errs = (list, t) => list && list.length ? `<div class="mb-hint mb-bad ei-errs"><b>${esc(t || 'Please check')}</b>${list.map(e => `<div>${esc(e)}</div>`).join('')}</div>` : '';
  const clear = v => Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; });
  const COL = { draft: '#64748b', submitted: '#b45309', pending: '#b45309', approved: '#15803d', rejected: '#dc2626', ordered: '#1d4ed8', rfq: '#7c3aed', sent: '#1d4ed8', partial: '#b45309', received: '#0f766e', billed: '#15803d', closed: '#475569', cancelled: '#64748b', open: '#b45309', awarded: '#15803d' };
  const pill = s => `<span class="mb-pill ei-st" style="--c:${COL[s] || '#64748b'}">${esc(String(s).charAt(0).toUpperCase() + String(s).slice(1))}</span>`;
  const fq = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });

  /* ---------- data ---------- */
  let SET = P.settingsFromRow(null);
  async function settings(force) { let rows = []; try { rows = await get('Pur_Settings', null, force); } catch (e) { if (!/not found/i.test(e.message)) throw e; } SET = P.settingsFromRow(rows[0]); SET.row = rows[0] || null; return SET; }
  const L = (n, f, map) => S.list(n, f).then(r => r.map(map));
  async function bundle(force) {
    const finSet = await S.settings(force), o = { finSet }, j = [], add = (k, p) => j.push(p.then(x => { o[k] = x; }));
    add('set', settings(force)); add('accts', S.accounts(force).catch(() => [])); add('sups', S.list('Fin_Suppliers', force).catch(() => []));
    add('reqs', L('Pur_Requests', force, P.reqFromRow).catch(e => { if (/not found/i.test(e.message)) o.missing = true; return []; }));
    add('rfqs', L('Pur_RFQs', force, P.rfqFromRow).catch(() => [])); add('quotes', L('Pur_Quotes', force, P.quoteFromRow).catch(() => [])); add('pos', L('Pur_Orders', force, P.poFromRow).catch(() => [])); add('grns', L('Pur_Receipts', force, P.grnFromRow).catch(() => []));
    add('apr', AS.reqs(force).catch(() => [])); add('depts', AS.depts(force).catch(() => []));
    if (window.INVSTORE) { add('items', INVSTORE.items(force).catch(() => [])); add('whs', INVSTORE.whs(force).catch(() => [])); add('invSet', INVSTORE.settings(force).catch(() => null)); }
    await Promise.all(j);
    o.map = Object.assign({}, F.defaultMap(o.accts.length ? o.accts : F.COA), window.INV ? INV.defaultMap(o.accts) : {}, finSet.map || {}, (o.invSet && o.invSet.map) || {}); if (!o.map.grni) o.map.grni = '2160';
    o.items = o.items || []; o.whs = o.whs || []; return o;
  }
  const loaders = {}; function screen(key, def) { loaders[key] = (v, f) => { const d = D[key] = D[key] || {}; d.busy = 1; if (cur() === key) render(); bundle(f).then(b => Object.assign(d, b)).catch(e => { d.err = e.message; }).finally(() => { d.busy = 0; if (cur() === key) render(); }); };
    const RESET = { x_purreq: () => { ST.req = null; }, x_purrfq: () => { ST.rfq = null; }, x_purpo: () => { ST.po = null; } };
    def.load = (v, f) => { if (!f) { if (ST.deep !== key && RESET[key]) RESET[key](); ST.deep = null; } loaders[key](v, f); }; reg(key, def); }
  const refresh = k => loaders[k](V(), true);
  const busy = d => d.busy ? `<div class="mx-ld"><i></i><i></i><i></i> Loading…</div>` : d.err ? `<div class="mb-hint mb-bad">⚠ ${esc(d.err)}</div>` : '';
  const needSetup = d => d.missing ? H.card('', `<div class="mb-hint mb-bad">The procurement lists are not set up yet.</div>${H.btn('⚙️ Procurement Settings → Set up', 'toSet')}`) : '';
  const toSet = () => go('x_purset');
  const supOpts = d => (d.sups || []).map(s => [String(s.id), s.title + (s.trn ? ' · ' + s.trn : '')]);
  const supOf = (d, id) => (d.sups || []).find(s => String(s.id) === String(id)) || {};
  const deptOpts = d => (d.depts || []).map(x => [x.name, x.name]);
  const itemOpts = d => (d.items || []).filter(i => i.active).map(i => [i.code, i.code + ' · ' + i.name]);
  const aprOf = (d, list, id) => AP.forDoc(d.apr, list, id);
  const lnIn = (a, i, k, val, ph, r, mode) => `<input data-ln="${a}:${i}:${k}"${r ? ' data-r="1"' : ''} value="${esc(val == null ? '' : val)}" ${mode ? `inputmode="${mode}" style="text-align:right"` : ''} placeholder="${esc(ph || '')}">`;
  const lnSel = (a, i, k, opts, val, ph) => `<select data-ln="${a}:${i}:${k}" data-r="1"><option value="">${esc(ph || '—')}</option>${opts.map(([c, t]) => `<option value="${esc(c)}"${String(val) === String(c) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  /* one line editor for requests and orders: optional stock item, description, qty, unit, price, VAT, account */
  function linesEd(a, lines, d, withVat) {
    return lines.map((l, i) => { const it = l.code ? (d.items || []).find(x => x.code === l.code) : null; if (it && l._c !== l.code) { l._c = l.code; if (!str(l.description)) l.description = it.name; if (!l.uom) l.uom = it.uom; if (!num(l.price) && it.std) l.price = String(it.std); }
      return `<div class="inv-ln"><div class="ei-lnh"><span>Line ${i + 1}</span>${lines.length > 1 ? `<button type="button" class="mx-sb r" data-x="delL" data-a="${a}" data-i="${i}">✕</button>` : ''}</div>${(d.items || []).length ? lnSel(a, i, 'code', itemOpts(d), l.code, '— not a stock item —') : `<input data-ln="${a}:${i}:description" value="${esc(l.description || '')}" placeholder="Description">`}
        <div class="inv-g">${(d.items || []).length ? `<div><label>Description</label>${lnIn(a, i, 'description', l.description)}</div>` : ''}<div><label>Quantity</label>${lnIn(a, i, 'qty', l.qty, '0', 1, 'decimal')}</div><div><label>Unit</label>${lnIn(a, i, 'uom', l.uom, 'pcs')}</div><div><label>${withVat ? 'Unit price' : 'Estimated price'}</label>${lnIn(a, i, 'price', l.price, '0.00', 1, 'decimal')}</div>
        ${withVat ? `<div><label>VAT</label>${lnSel(a, i, 'vat', [['S', '5%'], ['Z', '0%'], ['E', 'Exempt']], l.vat || 'S', '5%')}</div>` : ''}${it && it.kind !== 'service' ? '' : `<div><label>Expense account</label>${lnSel(a, i, 'account', acctOpts(d.accts, x => ['expense', 'asset'].includes(x.type)), l.account, '— account —')}</div>`}</div></div>`; }).join('') + H.sbtn('＋ Add line', 'addL', `data-a="${a}"`);
  }
  const cleanLines = (lines, d) => lines.filter(l => l.code || str(l.description) || num(l.qty)).map(l => { const it = l.code ? (d.items || []).find(x => x.code === l.code) : null; return { code: l.code || '', description: str(l.description) || (it ? it.name : ''), qty: num(l.qty), uom: str(l.uom) || (it ? it.uom : ''), price: num(l.price), vat: l.vat || 'S', account: it && it.kind !== 'service' ? '' : (l.account || ''), stock: !!(it && it.kind !== 'service') }; });
  const totTxt = t => `<div class="ei-kv"><span>Net</span><b>${money(t.net)}</b></div><div class="ei-kv"><span>VAT</span><b>${money(t.vat)}</b></div><div class="ei-kv g"><span>Total</span><b>${money(t.total)}</b></div>`;
  async function company() { try { const r = (await get('EInv_Company', null))[0] || {}; return { name: r.title || r.name || '', trn: r.trn || '', addr: [r.addressline, r.city, r.emirate].filter(Boolean).join(', '), email: r.email || '' }; } catch (e) { return { name: '', trn: '', addr: '' }; } }

  /* ---------- approval outcomes ---------- */
  const decided = async (list, r, map) => { const st = map[r.status]; if (!st) return; const row = (await S.list(list, true)).find(x => String(x.id) === String(r.docId)); if (!row) return; await S.upd(list, Number(r.docId), { Status: st, History: hist(F.J(row.history, []), 'Approval: ' + r.status) }); S.drop(list); };
  APR_HANDLERS.Pur_Requests = r => decided('Pur_Requests', r, { approved: 'approved', rejected: 'rejected', withdrawn: 'draft' });
  APR_HANDLERS.Pur_Orders = r => decided('Pur_Orders', r, { approved: 'approved', rejected: 'rejected', withdrawn: 'draft' });
  APR_HANDLERS.Pur_Match = async () => {};   /* the order screen reads the approval itself */
  APR_OPEN.Pur_Requests = id => { ST.req = Number(id); goTo('x_purreq'); }; APR_OPEN.Pur_Orders = id => { ST.po = Number(id); goTo('x_purpo'); }; APR_OPEN.Pur_Match = id => { ST.po = Number(id); goTo('x_purpo'); };

  /* ================= Procurement home ================= */
  screen('x_purdash', {
    view(v, d) {
      const reqs = d.reqs || [], pos = d.pos || [], mine = AP.queue(d.apr, me()), pendR = reqs.filter(r => r.status === 'submitted'), appR = reqs.filter(r => r.status === 'approved'), pendP = pos.filter(p => p.status === 'pending');
      const toRec = pos.filter(p => ['approved', 'sent', 'partial'].includes(p.status)), toBill = pos.filter(p => ['received', 'partial'].includes(p.status) && p.lines.some(l => num(l.received) > num(l.billed))), openVal = n2(toRec.reduce((s, p) => s + p.total, 0));
      return H.head('🛒', 'Procurement', 'Requests → quotations → orders → receipts → bills', '#c2410c') + busy(d) + needSetup(d)
        + H.kpis([['Waiting for my approval', String(mine.length), mine.length ? 'o' : 'g'], ['Requests in approval', String(pendR.length)], ['Approved, not ordered', String(appR.length), appR.length ? 'o' : ''], ['Orders in approval', String(pendP.length)], ['Orders to receive', String(toRec.length) + ' · ' + openVal], ['Received, not billed', String(toBill.length), toBill.length ? 'o' : '']])
        + (mine.length ? H.card('Waiting for your approval', mine.slice(0, 8).map(r => H.li({ x: 'toApr', ic: '✅', c: '#15803d', t: (AP.DOC_TYPES[r.type] || r.type) + ' ' + r.docNo + ' · ' + money(r.amount), s: r.summary, v: '›' })).join('')) : '')
        + (appR.length ? H.card('Approved requests to order', table([{ k: 'no', t: 'Request' }, { k: 'dept', t: 'Department' }, { k: 'purpose', t: 'Purpose' }, { k: 'total', t: 'Estimate', n: 1 }], appR.map(r => ({ no: r.no, dept: r.dept, purpose: r.purpose, total: r.total, _tap: r.id })), null, 'openReq')) : '')
        + (toRec.length ? H.card('Orders to receive', table([{ k: 'no', t: 'Order' }, { k: 'supplier', t: 'Supplier' }, { k: 'delivery', t: 'Delivery' }, { k: 'total', t: 'Total', n: 1 }, { k: 'st', t: '', raw: 1 }], toRec.map(p => ({ no: p.no, supplier: p.supplier, delivery: dmy(p.delivery), total: p.total, st: pill(p.status), _tap: p.id })), null, 'openPo')) : '')
        + H.card('Quick actions', `<div class="mx-acts">${H.sbtn('📝 New purchase request', 'nReq', '', 'p')}${H.sbtn('📨 New RFQ', 'nRfq')}${H.sbtn('🧾 New purchase order', 'nPo')}${H.sbtn('✅ My approvals', 'toApr')}</div>`);
    },
    act: { toSet, toApr() { go('x_aprinbox'); }, nReq() { ST.req = 'new'; goTo('x_purreq'); }, nRfq() { ST.rfq = 'new'; goTo('x_purrfq'); }, nPo() { ST.po = 'new'; goTo('x_purpo'); }, openReq(t) { ST.req = +t.dataset.i; goTo('x_purreq'); }, openPo(t) { ST.po = +t.dataset.i; goTo('x_purpo'); } } });

  /* ================= Purchase requests ================= */
  const newLine = () => ({ code: '', description: '', qty: '', uom: '', price: '', vat: 'S', account: '' });
  screen('x_purreq', {
    view(v, d) {
      const reqs = d.reqs || [];
      if (ST.req === 'new' || v.form) {
        if (!v.init) { v.init = 1; const r = ST.req !== 'new' ? reqs.find(x => x.id === ST.req) : null; Object.assign(v, r ? { form: 1, id: r.id, date: r.date, needBy: r.needBy, dept: r.dept, cc: r.cc, purpose: r.purpose, L: r.lines.map(l => Object.assign({}, l)) } : { form: 1, id: null, date: today(), needBy: '', dept: (d.depts[0] || {}).name || '', cc: '', purpose: '', L: [newLine()] }); }
        const t = P.totals(cleanLines(v.L, d));
        return H.head('📝', v.id ? 'Edit purchase request' : 'New purchase request', 'What is needed, why, and roughly what it costs', '#c2410c') + errs(v.errs)
          + H.card('', `<div class="fin-row">${H.f('Date', H.date('date'))}${H.f('Needed by', H.date('needBy', { val: v.needBy || '' }))}</div><div class="fin-row">${H.f('Department', d.depts.length ? H.sel('dept', deptOpts(d), { ph: false }) : H.inp('dept'))}${H.f('Cost centre / project', H.inp('cc'))}</div>${H.f('Purpose', H.inp('purpose', { ph: 'Why it is needed' }))}`)
          + H.card('Items & services', linesEd('L', v.L, d, false)) + H.card('Estimate', `<div class="ei-kv g"><span>Estimated net</span><b>${money(t.net)}</b></div><span class="mb-hint">The approval chain is chosen by department and this amount.</span>`)
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Save draft', 'save', 's')}${H.btn('➤ Submit for approval', 'submit')}</div>`);
      }
      if (ST.req) { const r = reqs.find(x => x.id === ST.req); if (!r) return busy(d); const ap = aprOf(d, 'Pur_Requests', r.id), mine = r.requester === AP.lc(me());
        return H.head('📝', r.no + ' · ' + esc(r.purpose || 'Purchase request'), esc(r.dept) + ' · ' + dmy(r.date) + (r.needBy ? ' · needed by ' + dmy(r.needBy) : '') + ' · by ' + esc(AS.userName(r.requester)), COL[r.status]) + busy(d)
          + H.card('Status · ' + pill(r.status), (window.APR_PANEL ? APR_PANEL(ap) : '') + (r.poNos ? `<div class="ei-kv"><span>Orders</span><b>${esc(r.poNos)}</b></div>` : ''))
          + H.card('Items & services', table([{ k: 'description', t: 'Description' }, { k: 'code', t: 'Item' }, { k: 'q', t: 'Qty' }, { k: 'price', t: 'Est. price', n: 1 }, { k: 'net', t: 'Est. net', n: 1 }], P.totals(r.lines).lines.map(l => ({ description: l.description, code: l.code, q: fq(l.qty) + ' ' + (l.uom || ''), price: l.price, net: l.net })), { description: 'Total', net: r.total }))
          + H.bar(`<div class="mb-row">${H.btn('← Requests', 'back0', 's')}${['draft', 'rejected'].includes(r.status) && mine ? H.btn('✏️ Edit', 'edit', 's') + H.btn('➤ Submit for approval', 'submitX') : ''}${r.status === 'approved' ? H.btn('📨 Request quotations', 'toRfq', 's') + H.btn('🧾 Create purchase order', 'toPo') : ''}${['draft', 'approved', 'rejected'].includes(r.status) ? H.btn('✕ Cancel request', 'cancelR', 's') : ''}</div>`); }
      const tab = v.tab || 'open', u = AP.lc(me()), rows = reqs.filter(r => tab === 'mine' ? r.requester === u : tab === 'open' ? ['draft', 'submitted', 'approved', 'rejected'].includes(r.status) : tab === 'all' ? true : r.status === tab).sort((a, b) => b.id - a.id);
      return H.head('📝', 'Purchase requests', 'Ask for items or services — approval by department and amount', '#c2410c') + busy(d) + needSetup(d)
        + H.tabs('tab', [['open', 'Open'], ['mine', 'Mine'], ['submitted', 'In approval'], ['approved', 'Approved'], ['ordered', 'Ordered'], ['all', 'All', reqs.length]], 'open')
        + H.card('', table([{ k: 'no', t: 'Request' }, { k: 'date', t: 'Date' }, { k: 'dept', t: 'Department' }, { k: 'purpose', t: 'Purpose' }, { k: 'by', t: 'By' }, { k: 'total', t: 'Estimate', n: 1 }, { k: 'st', t: '', raw: 1 }], rows.map(r => ({ no: r.no || '(draft)', date: dmy(r.date), dept: r.dept, purpose: r.purpose, by: AS.userName(r.requester), total: r.total, st: pill(r.status), _tap: r.id })), null, 'open'))
        + H.bar(H.btn('＋ New purchase request', 'add'));
    },
    act: { toSet, add(t, v) { ST.req = 'new'; clear(v); render(); }, open(t, v) { ST.req = +t.dataset.i; clear(v); render(); }, back0(t, v) { ST.req = null; clear(v); render(); }, cancel(t, v) { if (ST.req === 'new') ST.req = null; clear(v); render(); },
      edit(t, v) { clear(v); v.form = 1; render(); },
      addL(t, v) { v[t.dataset.a].push(newLine()); render(); }, delL(t, v) { v[t.dataset.a].splice(+t.dataset.i, 1); render(); },
      save(t, v, d) { return saveReq(v, d, false); }, submit(t, v, d) { return saveReq(v, d, true); },
      async submitX(t, v, d) { const r = d.reqs.find(x => x.id === ST.req); try { await submitReq(r); refresh('x_purreq'); } catch (e) { toast(e.message, 'error'); } },
      async cancelR(t, v, d) { const r = d.reqs.find(x => x.id === ST.req); if (!confirm('Cancel ' + (r.no || 'this request') + '?')) return; await S.upd('Pur_Requests', r.id, { Status: 'cancelled', History: hist(r.history, 'Cancelled') }); S.drop('Pur_Requests'); refresh('x_purreq'); },
      toRfq(t, v, d) { ST.rfq = 'new'; window.PUR_FROM = { req: d.reqs.find(x => x.id === ST.req) }; goTo('x_purrfq'); }, toPo(t, v, d) { ST.po = 'new'; window.PUR_FROM = { req: d.reqs.find(x => x.id === ST.req) }; goTo('x_purpo'); } } });
  async function saveReq(v, d, andSubmit) {
    const lines = cleanLines(v.L, d), E = P.checkLines(lines); if (!str(v.dept)) E.push('Department is required'); if (!str(v.purpose)) E.push('Purpose is required'); if (E.length) { v.errs = E; render(); return; }
    const t = P.totals(lines), f = { ReqDate: v.date, NeedBy: v.needBy || '', Department: str(v.dept), CostCenter: str(v.cc), Purpose: str(v.purpose), Total: t.net, LinesJson: JSON.stringify(lines) };
    try { let id = v.id, r; if (id) await S.upd('Pur_Requests', id, f); else { await settings(true); const no = await S.next('pr', SET.pr); id = (await S.add('Pur_Requests', Object.assign(f, { Title: no, ReqNo: no, Requester: AP.lc(me()), Status: 'draft', History: hist([], 'Created') }))).id; }
      S.drop('Pur_Requests'); r = P.reqFromRow((await S.list('Pur_Requests', true)).find(x => Number(x.id) === Number(id)));
      if (andSubmit) await submitReq(r); else toast('✅ Saved as draft', 'success'); ST.req = Number(id); clear(v); refresh('x_purreq'); } catch (e) { v.errs = [e.message]; render(); }
  }
  async function submitReq(r) { await S.upd('Pur_Requests', r.id, { Status: 'submitted', History: hist(r.history, 'Submitted for approval') }); S.drop('Pur_Requests');
    const a = await AS.submit({ type: 'pr', list: 'Pur_Requests', docId: r.id, docNo: r.no, dept: r.dept, amount: r.total, summary: r.purpose + ' · ' + r.lines.length + ' line(s)' });
    toast(a.status === 'approved' ? '✓ No approval needed — request approved' : '➤ Sent for approval to ' + AP.waitingFor(a).map(AS.userName).join(' or '), 'success'); }

  /* ================= RFQs & quotations ================= */
  screen('x_purrfq', {
    view(v, d) {
      const rfqs = d.rfqs || [];
      if (ST.rfq === 'new') { if (!v.init) { const fr = window.PUR_FROM || {}; window.PUR_FROM = null; Object.assign(v, { init: 1, date: today(), due: '', reqId: fr.req ? fr.req.id : '', reqNo: fr.req ? fr.req.no : '', dept: fr.req ? fr.req.dept : '', L: fr.req ? fr.req.lines.map(l => Object.assign({}, l)) : [newLine()], sup: {} }); }
        return H.head('📨', 'New request for quotation', v.reqNo ? 'From ' + esc(v.reqNo) : 'Ask several suppliers for their prices', '#7c3aed') + errs(v.errs)
          + H.card('', `<div class="fin-row">${H.f('Date', H.date('date'))}${H.f('Quotes due by', H.date('due', { val: v.due || '' }))}</div>`)
          + H.card('Suppliers to ask', (d.sups || []).map(s => `<button type="button" class="mx-sb${v.sup[s.id] ? ' p' : ''}" data-x="tSup" data-i="${s.id}">${v.sup[s.id] ? '☑' : '☐'} ${esc(s.title)}</button>`).join(' ') || '<span class="mb-hint">Add suppliers in Finance → Suppliers first.</span>')
          + H.card('Items & services', linesEd('L', v.L, d, false)) + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Create RFQ', 'save')}</div>`); }
      if (ST.rfq) { const r = rfqs.find(x => x.id === ST.rfq); if (!r) return busy(d); const c = P.compare(r, d.quotes), sups = r.suppliers.map(id => supOf(d, id)), q = v.qs ? c.quotes.find(x => x.supplierId === String(v.qs)) : null;
        if (v.qs) { const s = supOf(d, v.qs); if (!v.qinit) { v.qinit = 1; Object.assign(v, { qref: q ? q.ref : '', qdate: q ? q.date : today(), qvalid: q ? q.validTo : '', qdays: q ? String(q.days) : '', qterms: q ? q.payTerms : '', QP: r.lines.map((l, i) => ({ price: q && q.lines[i] ? q.lines[i].price : '' })) }); }
          const t = P.totals(r.lines.map((l, i) => ({ qty: l.qty, price: num(v.QP[i].price), vat: l.vat || 'S' })));
          return H.head('💬', 'Quotation · ' + esc(s.title), r.no, '#7c3aed') + H.card('', `<div class="fin-row">${H.f('Supplier quote ref.', H.inp('qref'))}${H.f('Quote date', H.date('qdate'))}${H.f('Valid until', H.date('qvalid', { val: v.qvalid || '' }))}</div><div class="fin-row">${H.f('Delivery (days)', H.num('qdays'))}${H.f('Payment terms', H.inp('qterms', { ph: '30 days' }))}</div>`)
            + H.card('Prices (leave empty if not quoted)', r.lines.map((l, i) => `<div class="ei-kv"><span>${esc(l.description)} · ${fq(l.qty)} ${esc(l.uom || '')}</span><b style="width:160px">${lnIn('QP', i, 'price', v.QP[i].price, 'unit price', 1, 'decimal')}</b></div>`).join('') + totTxt(t))
            + H.bar(`<div class="mb-row">${H.btn('Cancel', 'qX', 's')}${H.btn('💾 Save quotation', 'qSave')}</div>`); }
        const best = c.cheapest;
        return H.head('📨', r.no + (r.reqNo ? ' · ' + esc(r.reqNo) : ''), dmy(r.date) + (r.due ? ' · quotes due ' + dmy(r.due) : '') + ' · ' + sups.length + ' supplier(s)', COL[r.status]) + busy(d)
          + H.card('Suppliers', sups.map(s => { const qq = c.quotes.find(x => x.supplierId === String(s.id)); return `<div class="ei-kv"><span>${esc(s.title)}${qq ? ' · quote ' + esc(qq.ref || '') + ' · ' + money(qq.total) : ' · no quote yet'}</span><b>${r.status === 'open' ? H.sbtn(qq ? '✏️ Edit quote' : '＋ Enter quote', 'qOpen', `data-i="${s.id}"`) : ''} ${H.sbtn('🖨 RFQ', 'prRfq', `data-i="${s.id}"`)}</b></div>`; }).join(''))
          + (c.quotes.length ? H.card('Comparison', `<div class="fin-tw"><table class="fin-t"><thead><tr><th>Item</th><th class="n">Qty</th>${c.quotes.map(qq => `<th class="n">${esc(qq.supplier)}</th>`).join('')}</tr></thead><tbody>${c.rows.map(rw => `<tr><td>${esc(rw.description)}</td><td class="n">${fq(rw.qty)} ${esc(rw.uom)}</td>${rw.prices.map(p => `<td class="n"${p != null && p === rw.best ? ' style="color:#16a34a;font-weight:800"' : ''}>${p == null ? '—' : n2(p)}</td>`).join('')}</tr>`).join('')}
              <tr class="tot"><td>Net total</td><td></td>${c.totals.map(x => `<td class="n"${x.id === best ? ' style="color:#16a34a"' : ''}>${n2(x.net)}${x.missing ? ' <small>(' + x.missing + ' missing)</small>' : ''}</td>`).join('')}</tr><tr><td>Delivery</td><td></td>${c.totals.map(x => `<td class="n">${x.days ? x.days + ' days' : '—'}</td>`).join('')}</tr><tr><td>Payment</td><td></td>${c.totals.map(x => `<td class="n">${esc(x.payTerms || '—')}</td>`).join('')}</tr>
              ${r.status === 'open' ? `<tr><td></td><td></td>${c.totals.map(x => `<td class="n">${H.sbtn(x.id === best ? '🏆 Award' : 'Award', 'award', `data-i="${x.id}"`, x.id === best ? 'p' : '')}</td>`).join('')}</tr>` : ''}</tbody></table></div>${best ? '<span class="mb-hint">Green = lowest price; 🏆 = lowest total among complete quotes.</span>' : ''}`) : '')
          + H.bar(`<div class="mb-row">${H.btn('← RFQs', 'back0', 's')}${r.status === 'open' ? H.btn('✕ Cancel RFQ', 'cancelQ', 's') : ''}${r.poNo ? H.btn('🧾 ' + esc(r.poNo), 'toPoNo', 's') : ''}</div>`); }
      return H.head('📨', 'RFQs & quotations', 'Ask suppliers for prices, compare, award', '#7c3aed') + busy(d) + needSetup(d)
        + H.card('', table([{ k: 'no', t: 'RFQ' }, { k: 'date', t: 'Date' }, { k: 'req', t: 'Request' }, { k: 'n', t: 'Suppliers' }, { k: 'q', t: 'Quotes' }, { k: 'aw', t: 'Awarded to' }, { k: 'st', t: '', raw: 1 }], rfqs.slice().sort((a, b) => b.id - a.id).map(r => ({ no: r.no, date: dmy(r.date), req: r.reqNo, n: String(r.suppliers.length), q: String((d.quotes || []).filter(q => q.rfq === String(r.id)).length), aw: r.awardedTo, st: pill(r.status), _tap: r.id })), null, 'open'))
        + H.bar(H.btn('＋ New RFQ', 'add'));
    },
    act: { toSet, add(t, v) { ST.rfq = 'new'; clear(v); render(); }, open(t, v) { ST.rfq = +t.dataset.i; clear(v); render(); }, back0(t, v) { ST.rfq = null; clear(v); render(); }, cancel(t, v) { ST.rfq = null; clear(v); render(); },
      addL(t, v) { v[t.dataset.a].push(newLine()); render(); }, delL(t, v) { v[t.dataset.a].splice(+t.dataset.i, 1); render(); }, tSup(t, v) { v.sup[t.dataset.i] = !v.sup[t.dataset.i]; render(); },
      async save(t, v, d) { const lines = cleanLines(v.L, d), E = P.checkLines(lines), sup = Object.keys(v.sup).filter(k => v.sup[k]); if (sup.length < 1) E.push('Tick at least one supplier'); if (E.length) { v.errs = E; render(); return; }
        try { await settings(true); const no = await S.next('rfq', SET.rfq), r = await S.add('Pur_RFQs', { Title: no, RfqNo: no, RfqDate: v.date, DueDate: v.due || '', ReqId: String(v.reqId || ''), ReqNo: v.reqNo || '', Department: v.dept || '', Status: 'open', Suppliers: JSON.stringify(sup), LinesJson: JSON.stringify(lines), History: hist([], 'Created') });
          if (v.reqId) { const rq = d.reqs.find(x => x.id === Number(v.reqId)); if (rq) await S.upd('Pur_Requests', rq.id, { Status: 'rfq', History: hist(rq.history, 'RFQ ' + no) }); }
          S.drop('Pur_RFQs', 'Pur_Requests'); toast('📨 ' + no + ' created — print it for each supplier, then enter their quotes', 'success'); ST.rfq = r.id; clear(v); refresh('x_purrfq'); } catch (e) { v.errs = [e.message]; render(); } },
      qOpen(t, v) { v.qs = t.dataset.i; v.qinit = 0; render(); }, qX(t, v) { v.qs = null; render(); },
      async qSave(t, v, d) { const r = d.rfqs.find(x => x.id === ST.rfq), s = supOf(d, v.qs), lines = r.lines.map((l, i) => ({ price: v.QP[i].price === '' ? '' : num(v.QP[i].price) })), tt = P.totals(r.lines.map((l, i) => ({ qty: l.qty, price: num(lines[i].price), vat: l.vat || 'S' }))), ex = (d.quotes || []).find(q => q.rfq === String(r.id) && q.supplierId === String(s.id));
        if (!lines.some(l => l.price !== '')) return toast('Enter at least one price', 'warn');
        const f = { Title: r.no + ' · ' + s.title, RfqId: String(r.id), SupplierId: String(s.id), SupplierName: s.title, QuoteRef: str(v.qref), QuoteDate: v.qdate || today(), ValidTo: v.qvalid || '', PayTerms: str(v.qterms), Status: 'received', DeliveryDays: num(v.qdays), Net: tt.net, Vat: tt.vat, Total: tt.total, LinesJson: JSON.stringify(lines) };
        try { if (ex) await S.upd('Pur_Quotes', ex.id, f); else await S.add('Pur_Quotes', f); S.drop('Pur_Quotes'); v.qs = null; toast('💬 Quotation saved', 'success'); refresh('x_purrfq'); } catch (e) { toast(e.message, 'error'); } },
      async award(t, v, d) { const r = d.rfqs.find(x => x.id === ST.rfq), q = d.quotes.find(x => x.id === +t.dataset.i); if (!confirm('Award ' + r.no + ' to ' + q.supplier + ' and prepare the purchase order?')) return;
        try { for (const o of d.quotes.filter(x => x.rfq === String(r.id))) await S.upd('Pur_Quotes', o.id, { Status: o.id === q.id ? 'awarded' : 'lost' }); await S.upd('Pur_RFQs', r.id, { Status: 'awarded', AwardedTo: q.supplier, History: hist(r.history, 'Awarded to ' + q.supplier) }); S.drop('Pur_Quotes', 'Pur_RFQs');
          window.PUR_FROM = { rfq: r, quote: q, req: d.reqs.find(x => String(x.id) === r.reqId) }; ST.po = 'new'; goTo('x_purpo'); } catch (e) { toast(e.message, 'error'); } },
      async cancelQ(t, v, d) { const r = d.rfqs.find(x => x.id === ST.rfq); if (!confirm('Cancel ' + r.no + '?')) return; await S.upd('Pur_RFQs', r.id, { Status: 'cancelled', History: hist(r.history, 'Cancelled') }); S.drop('Pur_RFQs'); refresh('x_purrfq'); },
      toPoNo(t, v, d) { const r = d.rfqs.find(x => x.id === ST.rfq), p = d.pos.find(x => x.no === r.poNo); if (p) { ST.po = p.id; goTo('x_purpo'); } },
      async prRfq(t, v, d) { const r = d.rfqs.find(x => x.id === ST.rfq), s = supOf(d, t.dataset.i), c = await company();
        printHtml('RFQ ' + r.no, `<h2>Request for quotation ${esc(r.no)}</h2><p><b>${esc(c.name)}</b>${c.trn ? '<br>TRN ' + esc(c.trn) : ''}${c.addr ? '<br>' + esc(c.addr) : ''}</p><p>To: <b>${esc(s.title)}</b>${s.email ? ' · ' + esc(s.email) : ''}<br>Date: ${dmy(r.date)}${r.due ? '<br>Please send your quotation by <b>' + dmy(r.due) + '</b>' : ''}</p><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>#</th><th style="text-align:left">Description</th><th>Qty</th><th>Unit</th><th>Unit price (AED, excl. VAT)</th></tr>${r.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td style="text-align:right">${fq(l.qty)}</td><td>${esc(l.uom || '')}</td><td></td></tr>`).join('')}</table><p>Please state delivery time, payment terms and validity.</p>`); } } });

  /* ================= Purchase orders ================= */
  screen('x_purpo', {
    view(v, d) {
      const pos = d.pos || [];
      if (ST.po === 'new' || v.form) {
        if (!v.init) { v.init = 1; const ex = ST.po !== 'new' ? pos.find(x => x.id === ST.po) : null, fr = window.PUR_FROM || {}; window.PUR_FROM = null;
          if (ex) Object.assign(v, { form: 1, id: ex.id, sup: ex.supplierId, date: ex.date, delivery: ex.delivery, wh: ex.deliverTo, dept: ex.dept, cc: ex.cc, pay: ex.payTerms, terms: ex.terms, reqId: ex.reqId, reqNo: ex.reqNo, rfqNo: ex.rfqNo, L: ex.lines.map(l => Object.assign({}, l)) });
          else { const rq = fr.req, q = fr.quote, base = fr.rfq ? fr.rfq.lines : rq ? rq.lines : [newLine()];
            Object.assign(v, { form: 1, id: null, sup: q ? q.supplierId : '', date: today(), delivery: q && q.days ? K.addD(today(), q.days) : '', wh: SET.wh, dept: rq ? rq.dept : (fr.rfq ? fr.rfq.dept : ''), cc: rq ? rq.cc : '', pay: q ? q.payTerms : '', terms: SET.terms, reqId: rq ? String(rq.id) : '', reqNo: rq ? rq.no : '', rfqNo: fr.rfq ? fr.rfq.no : '', L: base.map((l, i) => Object.assign({}, l, q ? { price: (q.lines[i] || {}).price === '' ? '' : String((q.lines[i] || {}).price) } : {})).filter((l, i) => !q || (q.lines[i] || {}).price !== '') }); } }
        const t = P.totals(cleanLines(v.L, d)), wo = (d.whs || []).filter(w => w.active).map(w => [w.code, w.code + ' · ' + w.name]);
        return H.head('🧾', v.id ? 'Edit purchase order' : 'New purchase order', [v.reqNo, v.rfqNo].filter(Boolean).join(' · '), '#1d4ed8') + errs(v.errs)
          + H.card('', `${H.f('Supplier', H.sel('sup', supOpts(d), { ph: '— supplier —' }))}<div class="fin-row">${H.f('Order date', H.date('date'))}${H.f('Delivery date', H.date('delivery', { val: v.delivery || '' }))}${H.f('Deliver to', wo.length ? H.sel('wh', wo, { ph: false }) : H.inp('wh'))}</div><div class="fin-row">${H.f('Department', d.depts.length ? H.sel('dept', deptOpts(d), { ph: '—' }) : H.inp('dept'))}${H.f('Cost centre', H.inp('cc'))}${H.f('Payment terms', H.inp('pay', { ph: '30 days after delivery' }))}</div>`)
          + H.card('Lines', linesEd('L', v.L, d, true)) + H.card('Totals', totTxt(t)) + H.card('Terms printed on the order', H.txt('terms'))
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Save draft', 'save', 's')}${H.btn('➤ Submit for approval', 'submit')}</div>`);
      }
      if (ST.po) { const p = pos.find(x => x.id === ST.po); if (!p) return busy(d); const ap = aprOf(d, 'Pur_Orders', p.id), grns = (d.grns || []).filter(g => g.po === String(p.id)), mine = p.requester === AP.lc(me());
        const canRec = ['approved', 'sent', 'partial'].includes(p.status), canBill = p.lines.some(l => num(l.received) > num(l.billed) + 0.0005), mAp = aprOf(d, 'Pur_Match', p.id);
        let extra = '';
        if (v.rec) { if (!v.R) v.R = p.lines.map(l => ({ qty: String(Math.max(0, P.open(l))) })); const wo = (d.whs || []).filter(w => w.active).map(w => [w.code, w.code + ' · ' + w.name]);
          extra = H.card('Receive goods', `<div class="fin-row">${H.f('Date', H.date('rdate'))}${H.f('Warehouse', wo.length ? H.sel('rwh', wo, { ph: false }) : H.inp('rwh'))}${H.f('Delivery note no.', H.inp('rdn'))}</div>` + p.lines.map((l, i) => `<div class="ei-kv"><span>${esc(l.description)} · ordered ${fq(l.qty)} · received ${fq(l.received)}${l.stock ? ' · 📦 stock' : ''}</span><b style="width:150px">${lnIn('R', i, 'qty', v.R[i].qty, '0', 0, 'decimal')}</b></div>`).join('') + errs(v.rerr) + `<div class="mx-acts">${H.sbtn('✓ Post goods receipt', 'doRec', '', 'p')}${H.sbtn('Cancel', 'recX')}</div>`); }
        if (v.inv) { if (!v.I) v.I = (p.pendingInv && p.pendingInv.lines) || p.lines.map(l => ({ qty: String(Math.max(0, H_r3(num(l.received) - num(l.billed)))), price: String(l.price) })); const m = P.match(p, v.I, SET);
          const apOk = mAp && mAp.status === 'approved' && p.pendingInv && JSON.stringify(p.pendingInv.lines) === JSON.stringify(v.I);
          extra = H.card('Supplier invoice · 3-way match', `<div class="fin-row">${H.f('Supplier invoice no.', H.inp('ino'))}${H.f('Invoice date', H.date('idate'))}</div>`
            + `<div class="fin-tw"><table class="fin-t"><thead><tr><th>Item</th><th class="n">Ordered</th><th class="n">Received</th><th class="n">Billed before</th><th class="n">Invoiced qty</th><th class="n">PO price</th><th class="n">Invoice price</th><th>Match</th></tr></thead><tbody>${p.lines.map((l, i) => { const r = m.rows.find(x => x.i === i); return `<tr><td>${esc(l.description)}</td><td class="n">${fq(l.qty)}</td><td class="n">${fq(l.received)}</td><td class="n">${fq(l.billed)}</td><td class="n" style="width:120px">${lnIn('I', i, 'qty', v.I[i].qty, '0', 1, 'decimal')}</td><td class="n">${n2(l.price)}</td><td class="n" style="width:120px">${lnIn('I', i, 'price', v.I[i].price, '', 1, 'decimal')}</td><td>${!r ? '' : r.qOk && r.pOk ? '<b style="color:#16a34a">✓</b>' : '<b style="color:#dc2626">' + (!r.qOk ? 'qty > received ' : '') + (!r.pOk ? 'price ±' + SET.priceTol + '%' : '') + '</b>'}</td></tr>`; }).join('')}</tbody></table></div>`
            + totTxt(m.total) + (m.variance ? `<div class="ei-kv"><span>Price variance vs PO</span><b>${n2(m.variance)}</b></div>` : '')
            + (m.ok || apOk ? `<div class="mx-acts">${H.sbtn('🧾 Create purchase bill', 'mkBill', '', 'p')}${H.sbtn('Cancel', 'invX')}</div>` : `<div class="mb-hint mb-bad">Outside the 3-way match tolerance.${mAp && mAp.status === 'pending' ? ' Waiting for approval: ' + esc(AP.waitingFor(mAp).map(AS.userName).join(' or ')) : mAp && mAp.status === 'rejected' ? ' The variance was rejected.' : ''}</div><div class="mx-acts">${mAp && mAp.status === 'pending' ? '' : H.sbtn('➤ Send variance for approval', 'varApr', '', 'p')}${H.sbtn('Cancel', 'invX')}</div>`)); }
        return H.head('🧾', p.no + ' · ' + esc(p.supplier), dmy(p.date) + (p.delivery ? ' · delivery ' + dmy(p.delivery) : '') + (p.reqNo ? ' · ' + esc(p.reqNo) : '') + (p.rfqNo ? ' · ' + esc(p.rfqNo) : ''), COL[p.status]) + busy(d)
          + H.kpis([['Total', n2(p.total)], ['Received', n2(P.totals(p.lines.map(l => ({ qty: l.received, price: l.price, vat: l.vat }))).net) + ' net'], ['Billed', n2(P.totals(p.lines.map(l => ({ qty: l.billed, price: l.price, vat: l.vat }))).net) + ' net'], ['Status', p.status]])
          + extra
          + H.card('Status · ' + pill(p.status), (window.APR_PANEL ? APR_PANEL(ap) : '') + (p.billNos ? `<div class="ei-kv"><span>Purchase bills</span><b>${esc(p.billNos)}</b></div>` : '') + grns.map(g => `<div class="ei-kv"><span>Receipt ${esc(g.no)} · ${dmy(g.date)} · ${esc(g.wh)}${g.dn ? ' · DN ' + esc(g.dn) : ''}</span><b>${g.stockDoc ? '📦 ' + esc(g.stockDoc) : ''}</b></div>`).join(''))
          + H.card('Lines', table([{ k: 'description', t: 'Description' }, { k: 'code', t: 'Item' }, { k: 'q', t: 'Ordered' }, { k: 'r', t: 'Received' }, { k: 'b', t: 'Billed' }, { k: 'price', t: 'Price', n: 1 }, { k: 'net', t: 'Net', n: 1 }], P.totals(p.lines).lines.map(l => ({ description: l.description, code: l.code, q: fq(l.qty) + ' ' + (l.uom || ''), r: fq(l.received), b: fq(l.billed), price: l.price, net: l.net })), { description: 'Total incl. VAT', net: p.total }))
          + H.bar(`<div class="mb-row">${H.btn('← Orders', 'back0', 's')}${['draft', 'rejected'].includes(p.status) && mine ? H.btn('✏️ Edit', 'edit', 's') + H.btn('➤ Submit for approval', 'submitX') : ''}${['approved', 'sent', 'partial', 'received', 'billed', 'closed'].includes(p.status) ? H.btn('🖨 Print', 'print', 's') : ''}${p.status === 'approved' ? H.btn('✉ Mark sent', 'sent', 's') : ''}${canRec && !v.rec ? H.btn('📦 Receive goods', 'rec') : ''}${canBill && !v.inv ? H.btn('🧾 Supplier invoice', 'inv') : ''}${['partial', 'received'].includes(p.status) ? H.btn('Close order', 'close', 's') : ''}${['draft', 'approved', 'rejected', 'sent'].includes(p.status) && !p.lines.some(l => num(l.received)) ? H.btn('✕ Cancel', 'cancelP', 's') : ''}</div>`); }
      const tab = v.tab || 'open', rows = pos.filter(p => tab === 'all' ? true : tab === 'open' ? !['closed', 'cancelled', 'billed'].includes(p.status) : tab === 'appr' ? ['draft', 'pending', 'rejected'].includes(p.status) : tab === 'rec' ? ['approved', 'sent', 'partial'].includes(p.status) : tab === 'bill' ? p.lines.some(l => num(l.received) > num(l.billed)) : ['billed', 'closed', 'cancelled'].includes(p.status)).sort((a, b) => b.id - a.id);
      return H.head('🧾', 'Purchase orders', 'Approve, send, receive and match against the supplier invoice', '#1d4ed8') + busy(d) + needSetup(d)
        + H.tabs('tab', [['open', 'Open'], ['appr', 'Draft / in approval'], ['rec', 'To receive'], ['bill', 'To bill'], ['done', 'Done'], ['all', 'All', pos.length]], 'open')
        + H.card('', table([{ k: 'no', t: 'Order' }, { k: 'date', t: 'Date' }, { k: 'supplier', t: 'Supplier' }, { k: 'dept', t: 'Department' }, { k: 'total', t: 'Total', n: 1 }, { k: 'st', t: '', raw: 1 }], rows.map(p => ({ no: p.no || '(draft)', date: dmy(p.date), supplier: p.supplier, dept: p.dept, total: p.total, st: pill(p.status), _tap: p.id })), null, 'open'))
        + H.bar(H.btn('＋ New purchase order', 'add'));
    },
    act: { toSet, add(t, v) { ST.po = 'new'; clear(v); render(); }, open(t, v) { ST.po = +t.dataset.i; clear(v); render(); }, back0(t, v) { ST.po = null; clear(v); render(); }, cancel(t, v) { if (ST.po === 'new') ST.po = null; clear(v); render(); },
      edit(t, v) { clear(v); v.form = 1; render(); }, addL(t, v) { v[t.dataset.a].push(newLine()); render(); }, delL(t, v) { v[t.dataset.a].splice(+t.dataset.i, 1); render(); },
      save(t, v, d) { return savePo(v, d, false); }, submit(t, v, d) { return savePo(v, d, true); },
      async submitX(t, v, d) { try { await submitPo(d.pos.find(x => x.id === ST.po)); refresh('x_purpo'); } catch (e) { toast(e.message, 'error'); } },
      async sent(t, v, d) { const p = d.pos.find(x => x.id === ST.po); await S.upd('Pur_Orders', p.id, { Status: 'sent', History: hist(p.history, 'Sent to supplier') }); S.drop('Pur_Orders'); refresh('x_purpo'); },
      async print(t, v, d) { const p = d.pos.find(x => x.id === ST.po), c = await company(), s = supOf(d, p.supplierId), tt = P.totals(p.lines);
        printHtml('Purchase order ' + p.no, `<h2 style="margin:0">PURCHASE ORDER ${esc(p.no)}</h2><table style="width:100%;margin:10px 0"><tr><td><b>${esc(c.name)}</b>${c.trn ? '<br>TRN ' + esc(c.trn) : ''}${c.addr ? '<br>' + esc(c.addr) : ''}</td><td style="text-align:right">Date ${dmy(p.date)}${p.delivery ? '<br>Delivery by <b>' + dmy(p.delivery) + '</b>' : ''}<br>Deliver to ${esc(p.deliverTo)}</td></tr></table><p>Supplier: <b>${esc(p.supplier)}</b>${s.trn ? ' · TRN ' + esc(s.trn) : ''}${s.addressline ? '<br>' + esc(s.addressline) : ''}</p>
          <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>#</th><th style="text-align:left">Description</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>VAT</th><th>Net</th></tr>${tt.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}${l.code ? ' (' + esc(l.code) + ')' : ''}</td><td style="text-align:right">${fq(l.qty)}</td><td>${esc(l.uom || '')}</td><td style="text-align:right">${n2(l.price)}</td><td>${P.VAT[l.vat || 'S']}%</td><td style="text-align:right">${n2(l.net)}</td></tr>`).join('')}
          <tr><td colspan="6" style="text-align:right">Net</td><td style="text-align:right">${n2(tt.net)}</td></tr><tr><td colspan="6" style="text-align:right">VAT</td><td style="text-align:right">${n2(tt.vat)}</td></tr><tr><td colspan="6" style="text-align:right"><b>Total AED</b></td><td style="text-align:right"><b>${n2(tt.total)}</b></td></tr></table><p>Payment terms: ${esc(p.payTerms || '—')}</p><p style="white-space:pre-wrap">${esc(p.terms)}</p>`); },
      rec(t, v, d) { const p = d.pos.find(x => x.id === ST.po); v.rec = 1; v.inv = 0; v.R = null; v.rdate = today(); v.rwh = p.deliverTo || SET.wh; v.rerr = null; render(); }, recX(t, v) { v.rec = 0; render(); },
      async doRec(t, v, d) { const p = d.pos.find(x => x.id === ST.po), q = {}; v.R.forEach((x, i) => { q[i] = num(x.qty); }); const E = P.checkReceipt(p, q, SET); if (E.length) { v.rerr = E; render(); return; }
        if (!confirm('Post the goods receipt for ' + p.no + '?')) return; const wh = v.rwh || p.deliverTo || SET.wh;
        try { await settings(true); const no = await S.next('grn', SET.grn), stockLines = p.lines.map((l, i) => ({ l, q: q[i] })).filter(x => x.q && x.l.stock && x.l.code);
          let sd = null; if (stockLines.length && window.INVSTORE) { const b = await INV_UI.bundle(true, { docs: true }); sd = await INVSTORE.post({ type: 'receipt', date: v.rdate || today(), ref: p.no + ' / ' + no, party: p.supplier, account: d.map.grni, srcRef: 'GRN:' + no, memo: 'Goods receipt ' + no + ' for ' + p.no, lines: stockLines.map(x => ({ code: x.l.code, wh, qty: x.q, unit_cost: num(x.l.price) })) }, b.ctx); }
          const lines = p.lines.map((l, i) => Object.assign({}, l, { received: H_r3(num(l.received) + num(q[i])) })), np = Object.assign({}, p, { lines, status: 'sent' }), val = P.r2(p.lines.reduce((s2, l, i) => s2 + num(q[i]) * num(l.price), 0));
          await S.add('Pur_Receipts', { Title: no, GrnNo: no, PoId: String(p.id), PoNo: p.no, GrnDate: v.rdate || today(), Wh: wh, StockDoc: sd ? sd.no : '', DeliveryNote: str(v.rdn), ReceivedBy: me(), Value: val, LinesJson: JSON.stringify(p.lines.map((l, i) => ({ i, qty: num(q[i]) })).filter(x => x.qty)) });
          await S.upd('Pur_Orders', p.id, { LinesJson: JSON.stringify(lines), Status: P.poStatus(np), History: hist(p.history, 'Received ' + no + (sd ? ' · stock ' + sd.no : '')) }); S.drop('Pur_Orders', 'Pur_Receipts');
          toast('📦 ' + no + ' posted' + (sd ? ' · stock ' + sd.no : ''), 'success'); v.rec = 0; refresh('x_purpo'); } catch (e) { v.rerr = [e.message]; render(); } },
      inv(t, v, d) { const p = d.pos.find(x => x.id === ST.po); v.inv = 1; v.rec = 0; v.I = null; v.idate = today(); v.ino = (p.pendingInv && p.pendingInv.no) || ''; render(); }, invX(t, v) { v.inv = 0; render(); },
      async varApr(t, v, d) { const p = d.pos.find(x => x.id === ST.po), m = P.match(p, v.I, SET); if (!str(v.ino)) return toast('Enter the supplier invoice number', 'warn');
        try { await S.upd('Pur_Orders', p.id, { PendingInv: JSON.stringify({ no: str(v.ino), date: v.idate, lines: v.I }) }); S.drop('Pur_Orders');
          const a = await AS.submit({ type: 'bill_var', list: 'Pur_Match', docId: p.id, docNo: p.no + ' / ' + str(v.ino), dept: p.dept, amount: Math.abs(m.variance) || m.total.total, summary: p.supplier + ' invoice ' + str(v.ino) + ' · variance ' + n2(m.variance) });
          toast(a.status === 'approved' ? '✓ Approved — create the bill' : '➤ Sent for approval', 'success'); refresh('x_purpo'); } catch (e) { toast(e.message, 'error'); } },
      async mkBill(t, v, d) { const p = d.pos.find(x => x.id === ST.po), m = P.match(p, v.I, SET); if (!str(v.ino)) return toast('Enter the supplier invoice number', 'warn');
        const s = supOf(d, p.supplierId), lines = P.billLines(m, p, d.map), tt = F.billTotals({ lines }), due = K.addD(v.idate || today(), num(s.paymentterms) || 30);
        if (!confirm('Create a draft purchase bill for invoice ' + str(v.ino) + ' (' + money(tt.total) + ')?\n\nYou post it in Finance → Purchase Bills.')) return;
        try { const b = await S.add('Fin_Bills', { Title: str(v.ino), BillNo: '', SupplierId: String(p.supplierId), SupplierName: p.supplier, SupplierInvNo: str(v.ino), BillDate: v.idate || today(), DueDate: due, Currency: 'AED', Status: 'draft', Notes: 'From ' + p.no, Subtotal: tt.subtotal, VatTotal: tt.vat_total, Total: tt.total, LinesJson: JSON.stringify(lines), History: hist([], 'Created from ' + p.no + ' (3-way match)') });
          const nl = p.lines.map((l, i) => { const r = m.rows.find(x => x.i === i); return Object.assign({}, l, { billed: H_r3(num(l.billed) + (r ? r.qty : 0)) }); }), np = Object.assign({}, p, { lines: nl });
          await S.upd('Pur_Orders', p.id, { LinesJson: JSON.stringify(nl), Status: P.poStatus(np), BillNos: [p.billNos, str(v.ino)].filter(Boolean).join(', '), PendingInv: '', History: hist(p.history, 'Supplier invoice ' + str(v.ino) + ' → draft bill') }); S.drop('Pur_Orders', 'Fin_Bills');
          toast('🧾 Draft bill created — post it in Finance → Purchase Bills', 'success'); v.inv = 0; refresh('x_purpo'); } catch (e) { toast(e.message, 'error'); } },
      async close(t, v, d) { const p = d.pos.find(x => x.id === ST.po); if (!confirm('Close ' + p.no + '? Nothing more will be received on it.')) return; await S.upd('Pur_Orders', p.id, { Status: 'closed', History: hist(p.history, 'Closed') }); S.drop('Pur_Orders'); refresh('x_purpo'); },
      async cancelP(t, v, d) { const p = d.pos.find(x => x.id === ST.po); if (!confirm('Cancel ' + p.no + '?')) return; await S.upd('Pur_Orders', p.id, { Status: 'cancelled', History: hist(p.history, 'Cancelled') }); S.drop('Pur_Orders'); refresh('x_purpo'); } } });
  const H_r3 = n => Math.round(n * 1000) / 1000;
  async function savePo(v, d, andSubmit) {
    const lines = cleanLines(v.L, d).map((l, i) => Object.assign(l, { received: num((v.L[i] || {}).received), billed: num((v.L[i] || {}).billed) })), E = P.checkLines(lines, true); if (!v.sup) E.push('Choose the supplier'); lines.forEach((l, i) => { if (!l.stock && !l.account) E.push('Line ' + (i + 1) + ': choose the expense account (or a stock item)'); }); if (E.length) { v.errs = E; render(); return; }
    const s = supOf(d, v.sup), t = P.totals(lines), f = { SupplierId: String(v.sup), SupplierName: s.title, SupplierTrn: s.trn || '', PoDate: v.date, DeliveryDate: v.delivery || '', DeliverTo: str(v.wh), Department: str(v.dept), CostCenter: str(v.cc), PayTerms: str(v.pay), Terms: v.terms || '', ReqId: String(v.reqId || ''), ReqNo: v.reqNo || '', RfqNo: v.rfqNo || '', Net: t.net, Vat: t.vat, Total: t.total, LinesJson: JSON.stringify(lines) };
    try { let id = v.id, no; if (id) await S.upd('Pur_Orders', id, f); else { await settings(true); no = await S.next('po', SET.po); id = (await S.add('Pur_Orders', Object.assign(f, { Title: no, PoNo: no, Status: 'draft', Requester: AP.lc(me()), History: hist([], 'Created') }))).id;
        if (v.reqId) { const rq = d.reqs.find(x => x.id === Number(v.reqId)); if (rq) await S.upd('Pur_Requests', rq.id, { Status: 'ordered', PoNos: [rq.poNos, no].filter(Boolean).join(', '), History: hist(rq.history, 'Ordered · ' + no) }); }
        if (v.rfqNo) { const rf = d.rfqs.find(x => x.no === v.rfqNo); if (rf) await S.upd('Pur_RFQs', rf.id, { PoNo: no }); } }
      S.drop('Pur_Orders', 'Pur_Requests', 'Pur_RFQs'); if (andSubmit) await submitPo(P.poFromRow(Object.assign({ id }, (await S.list('Pur_Orders', true)).find(x => Number(x.id) === Number(id)))));
      else toast('✅ Saved as draft', 'success'); ST.po = Number(id); clear(v); refresh('x_purpo'); } catch (e) { v.errs = [e.message]; render(); }
  }
  async function submitPo(p) { await S.upd('Pur_Orders', p.id, { Status: 'pending', History: hist(p.history, 'Submitted for approval') }); S.drop('Pur_Orders');
    const a = await AS.submit({ type: 'po', list: 'Pur_Orders', docId: p.id, docNo: p.no, dept: p.dept, amount: p.total, summary: p.supplier + ' · ' + p.lines.length + ' line(s)' });
    toast(a.status === 'approved' ? '✓ No approval needed — order approved' : '➤ Sent for approval to ' + AP.waitingFor(a).map(AS.userName).join(' or '), 'success'); }

  /* ================= Procurement settings ================= */
  screen('x_purset', {
    view(v, d) { const s = d.set || SET; if (!v.__f && !d.busy && d.set) Object.assign(v, { __f: 1, pr: s.pr, rfq: s.rfq, po: s.po, grn: s.grn, wh: s.wh, qt: String(s.qtyTol), pt: String(s.priceTol), terms: s.terms });
      return H.head('⚙️', 'Procurement settings', 'Numbering, tolerances, PO terms, set up', '#475569') + busy(d)
        + H.card('Set up', `<span class="mb-hint">Creates the procurement and approval lists (and finance lists if missing). Stock items are received through Inventory, so set up Inventory too if you buy stock.</span>${H.btn(v.busy ? '⏳ ' + esc(v.busy) : '🛠 Set up lists', 'setup')}<div style="height:8px"></div>${H.btn('⚙️ Approval setup (rules, departments, roles)', 'toAprSet', 's')}`)
        + H.card('Numbering', `<div class="fin-row">${H.f('Requests', H.inp('pr'))}${H.f('RFQs', H.inp('rfq'))}${H.f('Orders', H.inp('po'))}${H.f('Receipts', H.inp('grn'))}</div>`)
        + H.card('3-way match tolerance', `<div class="fin-row">${H.f('Quantity over received (%)', H.num('qt'))}${H.f('Price difference vs PO (%)', H.num('pt'))}</div><span class="mb-hint">Supplier invoices outside these limits need approval ("Bill outside 3-way match" rule).</span>`)
        + H.card('Orders', H.f('Default delivery warehouse', H.inp('wh')) + H.f('Terms printed on purchase orders', H.txt('terms')))
        + H.bar(H.btn('💾 Save', 'save')); },
    act: { toAprSet() { go('x_aprset'); },
      async setup(t, v) { if (v.busy) return; v.busy = 'Starting…'; render(); try { await FU.setupLists(Object.assign({}, F.LISTS, P.LISTS, AP.LISTS), n => { v.busy = n; render(); }); K.drop(...P.LIST_NAMES, ...AP.LIST_NAMES); toast('✅ Procurement lists are ready', 'success'); } catch (e) { toast(e.message, 'error'); } v.busy = ''; refresh('x_purset'); },
      async save(t, v) { const f = { PrPrefix: str(v.pr) || 'PR', RfqPrefix: str(v.rfq) || 'RFQ', PoPrefix: str(v.po) || 'PO', GrnPrefix: str(v.grn) || 'GRN', DefaultWh: str(v.wh) || 'MAIN', QtyTolPct: num(v.qt), PriceTolPct: num(v.pt), PoTerms: v.terms || '' };
        try { await settings(true); if (SET.row) await K.A().upd('Pur_Settings', SET.row.id, f); else await K.A().add('Pur_Settings', Object.assign({ Title: 'Procurement' }, f)); K.drop('Pur_Settings'); toast('✅ Saved', 'success'); v.__f = 0; refresh('x_purset'); } catch (e) { toast(e.message, 'error'); } } } });

  window.PUR_UI = { bundle, version: '1' };
})();
