/* ============================================================
   ORBIT INVENTORY & MANUFACTURING — screens (ORBIT mobile suite API · same screens on the phone and in the web app pages)
   Inventory home · Items · Stock transactions · Stock reports · Bills of materials · Production orders · Inventory settings
   Links: purchase bill lines with a stock item receive stock · accepted e-invoices take stock out (cost of goods sold) ·
          ORBIT's own item and movement lists come in through Inventory Settings → ORBIT link.
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, F = window.FIN, I = window.INV, S = window.FINSTORE, IS = window.INVSTORE, E = window.EINV, FU = window.FIN_UI;
  if (!K || !F || !I || !S || !IS || !E || !FU) return;
  const { A, reg, D, get, drop, H, esc, num, today, addD, dmy, str, toast, V, render, cur } = K;
  const { table, csv, printHtml, n2, money, acctOpts, acctName } = FU;
  const ST = { item: null, doc: null, bom: null, mo: null, deep: null };
  const fq = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
  const go = k => A().go(k);
  const errs = (list, t) => list && list.length ? `<div class="mb-hint mb-bad ei-errs"><b>${esc(t || 'Please check')}</b>${list.map(e => `<div>${esc(e.message || e)}</div>`).join('')}</div>` : '';
  const setTitle = t => setTimeout(() => { const el = document.querySelector('#mbTitle'); if (el) el.textContent = t; }, 0);
  const COL = { draft: '#64748b', posted: '#15803d', planned: '#64748b', released: '#b45309', completed: '#15803d', cancelled: '#dc2626' };
  const pill = s => `<span class="mb-pill ei-st" style="--c:${COL[s] || '#64748b'}">${esc(String(s).charAt(0).toUpperCase() + String(s).slice(1))}</span>`;
  const TYPE_IC = { receipt: '📥', issue: '📤', transfer: '🔁', count: '🧮', sale: '🛒', sale_return: '↩️', prod_issue: '⚙️', prod_output: '🏭', orbit: '🔗', opening: '🏁' };
  const clear = v => Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; });

  const css = document.createElement('style'); css.textContent = `
#mob .inv-ln{border:1px solid var(--cardb);border-radius:14px;padding:10px;margin-bottom:10px}
#mob .inv-ln select,#mob .inv-ln input{width:100%;box-sizing:border-box}
#mob .inv-g{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:8px;margin-top:6px}
#mob .inv-g label{display:block;font-size:11.5px;color:var(--mut);font-weight:700;margin-bottom:3px}
#mob .inv-sys{font-size:12px;color:var(--mut);margin-top:4px}#mob .inv-short{color:#dc2626;font-weight:700}#mob .inv-ok{color:#16a34a;font-weight:700}
@media (max-width:560px){#mob .inv-g{grid-template-columns:1fr 1fr}}
`; document.head.appendChild(css);

  /* ---------- data bundle ---------- */
  async function bundle(force, w) {
    w = w || {}; const finSet = await S.settings(force), out = { finSet }, jobs = [];   /* finance settings first: they say where the lists are (SharePoint or server) */
    const add = (k, p) => jobs.push(p.then(x => { out[k] = x; }));
    add('set', IS.settings(force));
    add('accts', S.accounts(force).catch(() => []));
    add('items', IS.items(force).catch(e => { if (/not found/i.test(e.message)) out.missing = true; return []; }));
    add('whs', IS.whs(force).catch(() => []));
    if (w.moves) add('moves', IS.moves(force).catch(() => []));
    if (w.docs) add('docs', IS.docs(force).catch(() => []));
    if (w.boms) add('boms', IS.boms(force).catch(() => []));
    if (w.mos) add('mos', IS.mos(force).catch(() => []));
    if (w.lines) add('lines', S.lines(force).catch(() => []));
    if (w.sups) add('sups', S.list('Fin_Suppliers', force).catch(() => []));
    if (w.bills) add('bills', S.list('Fin_Bills', force).catch(() => []));
    if (w.einv) add('edocs', get('EInv_Documents', null, force).then(r => r.map(E.docFromRow)).catch(() => []));
    await Promise.all(jobs);
    out.map = Object.assign(F.defaultMap(out.accts.length ? out.accts : F.COA), I.defaultMap(out.accts), finSet.map || {}, (out.set && out.set.map) || {});
    out.P = I.position(out.moves || []);
    out.ctx = { items: out.items, accts: out.accts, finSet, map: out.map };
    return out;
  }
  const LOADERS = {};
  function loader(key, want) {
    return function (v, force) { const d = D[key] = D[key] || {}; d.busy = 1; d.err = ''; if (cur() === key) render();
      bundle(force, want).then(b => { Object.assign(d, b); }).catch(e => { d.err = e.message; }).finally(() => { d.busy = 0; d.at = Date.now(); if (cur() === key) render(); }); };
  }
  const refresh = key => LOADERS[key](V(), true);
  const RESET = { x_invitems: () => { ST.item = null; }, x_invmove: () => { ST.doc = null; }, x_mfgbom: () => { ST.bom = null; }, x_mfgmo: () => { ST.mo = null; } };
  const goTo = k => { ST.deep = k; go(k); };
  function screen(key, want, def) { LOADERS[key] = loader(key, want); def.load = (v, f) => { if (!f) { if (ST.deep !== key && RESET[key]) RESET[key](); ST.deep = null; } LOADERS[key](v, f); }; reg(key, def); }
  const busy = d => d.busy ? `<div class="mx-ld"><i></i><i></i><i></i> Loading…</div>` : d.err ? `<div class="mb-hint mb-bad" style="margin:0 4px 10px">⚠ ${esc(d.err)}</div>` : '';
  const needSetup = d => d.missing ? H.card('', `<div class="mb-hint mb-bad">The inventory lists are not set up yet.</div>${H.btn('⚙️ Inventory Settings → Set up', 'toSet')}`) : '';
  const toSet = () => go('x_invset');
  const stocked = d => (d.items || []).filter(i => i.active && I.STOCKED(i.kind));
  const itemOpts = (d, f) => stocked(d).filter(i => !f || f(i)).map(i => [i.code, i.code + ' · ' + i.name]);
  const whOpts = d => { const w = (d.whs || []).filter(x => x.active).map(x => [x.code, x.code + ' · ' + x.name]); return w.length ? w : [[(d.set && d.set.wh) || 'MAIN', (d.set && d.set.wh) || 'MAIN']]; };
  const itemOf = (d, c) => (d.items || []).find(i => i.code === c);
  const nameOf = (d, c) => { const i = itemOf(d, c); return i ? i.code + ' · ' + i.name : c; };
  const qtyAt = (d, code, wh) => { const p = d.P && d.P.get(code); return p ? (wh ? p.wh[wh] || 0 : p.qty) : 0; };
  const lnSel = (a, i, k, opts, val, ph) => `<select data-ln="${a}:${i}:${k}" data-r="1"><option value="">${esc(ph || '— choose —')}</option>${opts.map(([c, t]) => `<option value="${esc(c)}"${String(val) === String(c) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const lnInp = (a, i, k, val, ph, r) => `<input data-ln="${a}:${i}:${k}"${r ? ' data-r="1"' : ''} value="${esc(val == null ? '' : val)}" inputmode="decimal" placeholder="${esc(ph || '')}" style="text-align:right">`;

  /* ---------- links from finance and e-invoicing ---------- */
  async function ctxNow() { const b = await bundle(true, { docs: true }); return b; }
  /* purchase bill line: stock item + warehouse; the line's account becomes the item's stock account */
  function billLine(l, i, d) {
    const its = (d.items || []).filter(x => x.active && I.STOCKED(x.kind)); if (!its.length) return '';
    const set = d.invSet || IS.set, map = Object.assign(I.defaultMap(d.accts), (set && set.map) || {});
    if (l.item && l._it !== l.item) { const it = its.find(x => x.code === l.item); if (it) { l.account = I.invAcc(it, map) || l.account; if (!str(l.description)) l.description = it.name; if (!l.wh) l.wh = set.wh; } l._it = l.item; }
    const whs = (d.whs || []).filter(w => w.active).map(w => [w.code, w.code + ' · ' + w.name]);
    return `<div class="mb-row"><div class="mb-f" style="flex:2">${lnSel('lines', i, 'item', its.map(x => [x.code, '📦 ' + x.code + ' · ' + x.name]), l.item, '— not a stock item —')}</div>${l.item ? `<div class="mb-f">${lnSel('lines', i, 'wh', whs.length ? whs : [[set.wh, set.wh]], l.wh, 'Warehouse')}</div>` : ''}</div>`;
  }
  async function billReceipt(bill, d0) {
    const b = await ctxNow(); if ((b.docs || []).some(x => x.srcRef === 'BILL:' + bill.id && x.status === 'posted')) return null;
    const fx = bill.currency && bill.currency !== 'AED' ? num(bill.fx_rate) || 1 : 1;
    const lines = bill.lines.filter(l => l.item).map(l => { const q = num(l.quantity) || 1; return { code: l.item, wh: l.wh || b.set.wh, qty: q, unit_cost: I.r4(num(l.unit_price) * fx) }; });
    if (!lines.length) return null;
    return IS.post({ type: 'receipt', viaBill: true, date: bill.bill_date, ref: bill.number, party: bill.supplier_name, account: 'BILL', srcRef: 'BILL:' + bill.id, memo: 'Received on bill ' + bill.number, lines }, b.ctx);
  }
  /* accepted sales e-invoice → stock out at average cost (credit note → back in) */
  async function salesCost(x, b0) {
    const b = b0 || await ctxNow(), ref = 'EINV:' + (x.uuid || x.id); if ((b.docs || []).some(y => y.srcRef === ref && y.status === 'posted')) return null;
    const ls = I.salesLines(x, b.items); if (!ls.length) return null; const cn = x.doc_type === 'credit_note';
    return IS.post({ type: cn ? 'sale_return' : 'sale', date: x.issue_date, ref: x.number, party: (x.buyer && x.buyer.name) || x.customer_name || '', srcRef: ref, memo: (cn ? 'Return on ' : 'Cost of sales for ') + x.number, lines: ls.map(l => Object.assign({ wh: b.set.wh }, l)) }, b.ctx);
  }
  const posted = (d, ref) => (d.docs || []).some(y => y.srcRef === ref && y.status === 'posted');
  const waitingCos = d => (d.edocs || []).filter(x => x.direction === 'out' && x.journal_no && !posted(d, 'EINV:' + (x.uuid || x.id)) && I.salesLines(x, d.items).length);
  const waitingBills = d => (d.bills || []).filter(r => r.status === 'posted' && !posted(d, 'BILL:' + r.id) && F.J(r.linesjson, []).some(l => l.item));

  /* ================= Inventory home ================= */
  screen('x_invdash', { moves: true, docs: true, mos: true, einv: true, bills: true, lines: true }, {
    view(v, d) {
      const oh = I.onHand(d.P || new Map(), d.items || []), by = k => I.r2(oh.filter(r => r.kind === k).reduce((s, r) => s + r.value, 0)), tot = I.r2(oh.reduce((s, r) => s + r.value, 0));
      const low = oh.filter(r => r.low), open = (d.mos || []).filter(m => ['planned', 'released'].includes(m.status)), wip = I.r2((d.mos || []).filter(m => m.status === 'released').reduce((s, m) => s + m.issueValue, 0));
      const cos = waitingCos(d), wb = waitingBills(d);
      return H.head('📦', 'Inventory', 'Stock value at moving average cost · AED', '#0369a1') + busy(d) + needSetup(d)
        + H.kpis([['Stock value', n2(tot), 'g'], ['Finished goods', n2(by('finished'))], ['Raw & packaging', n2(by('raw'))], ['Trading goods', n2(by('goods'))], ['Work in progress', n2(wip), wip ? 'o' : ''], ['Low stock items', String(low.length), low.length ? 'r' : 'g']])
        + (cos.length || wb.length ? H.card('Waiting for stock', (cos.length ? `<span class="mb-hint">${cos.length} posted sales e-invoice(s) have stock items without cost of sales.</span>${H.sbtn(v.w1 ? '⏳ ' + esc(v.w1) : '⇢ Post cost of sales', 'doCos', 'style="width:100%"')}` : '') + (wb.length ? `<span class="mb-hint">${wb.length} posted purchase bill(s) have stock lines not received.</span>${H.sbtn(v.w2 ? '⏳ ' + esc(v.w2) : '⇢ Receive stock of posted bills', 'doBills', 'style="width:100%"')}` : '')) : '')
        + H.card('Quick actions', `<div class="mx-acts">${H.sbtn('📥 Receive', 'nRcv', '', 'p')}${H.sbtn('📤 Issue', 'nIss')}${H.sbtn('🔁 Transfer', 'nTrf')}${H.sbtn('🧮 Stock count', 'nCnt')}${H.sbtn('🏭 Production order', 'nMo')}${H.sbtn('📊 Reports', 'toRep')}</div>`)
        + (open.length ? H.card('Open production orders', open.slice(0, 6).map(m => H.li({ x: 'openMo', i: m.id, ic: '🏭', c: '#b45309', t: m.no + ' · ' + nameOf(d, m.product), s: fq(m.planQty) + ' planned · ' + dmy(m.planDate), p: [m.status === 'released' ? 'o' : '', m.status] })).join('')) : '')
        + (low.length ? H.card('Low stock (at or below reorder level)', table([{ k: 'code', t: 'Item' }, { k: 'name', t: 'Name' }, { k: 'q', t: 'On hand', raw: 1 }, { k: 'r', t: 'Reorder at', raw: 1 }], low.slice(0, 15).map(r => ({ code: r.code, name: r.name, q: fq(r.qty) + ' ' + esc(r.uom), r: fq(r.reorder) })))) : '')
        + H.card('Latest stock documents', table([{ k: 'no', t: 'Document' }, { k: 'date', t: 'Date' }, { k: 'type', t: 'Type' }, { k: 'value', t: 'Value', n: 1 }], (d.docs || []).filter(x => x.status === 'posted').slice(0, 8).map(x => ({ no: x.no, date: dmy(x.date), type: (TYPE_IC[x.type] || '') + ' ' + (I.DOC_TYPES[x.type] || x.type), value: x.value, _tap: x.id })), null, 'openDoc'));
    },
    act: { toSet, toRep() { go('x_invrep'); },
      nRcv() { ST.doc = 'new:receipt'; goTo('x_invmove'); }, nIss() { ST.doc = 'new:issue'; goTo('x_invmove'); }, nTrf() { ST.doc = 'new:transfer'; goTo('x_invmove'); }, nCnt() { ST.doc = 'new:count'; goTo('x_invmove'); },
      nMo() { ST.mo = 'new'; goTo('x_mfgmo'); }, openMo(t) { ST.mo = +t.dataset.i; goTo('x_mfgmo'); }, openDoc(t) { ST.doc = +t.dataset.i; goTo('x_invmove'); },
      async doCos(t, v, d) { if (v.w1) return; let n = 0, bad = []; for (const x of waitingCos(d)) { v.w1 = x.number; render(); try { const b = await ctxNow(); if (await salesCost(x, b)) n++; } catch (e) { bad.push(x.number + ': ' + e.message); } } v.w1 = ''; toast(n + ' cost of sales posted' + (bad.length ? ' · not posted: ' + bad.join(' · ') : ''), bad.length ? 'warn' : 'success'); refresh('x_invdash'); },
      async doBills(t, v, d) { if (v.w2) return; let n = 0, bad = []; for (const r of waitingBills(d)) { v.w2 = r.billno || r.title; render(); try { const bill = { id: r.id, number: r.billno || r.title, bill_date: String(r.billdate || '').slice(0, 10), supplier_name: r.suppliername, currency: r.currency || 'AED', fx_rate: num(r.fxrate), lines: F.J(r.linesjson, []) }; if (await billReceipt(bill)) n++; } catch (e) { bad.push((r.billno || '') + ': ' + e.message); } } v.w2 = ''; toast(n + ' bill(s) received into stock' + (bad.length ? ' · ' + bad.join(' · ') : ''), bad.length ? 'warn' : 'success'); refresh('x_invdash'); } } });

  /* ================= Items ================= */
  const blankItem = d => ({ form: 1, id: null, code: '', name: '', name_ar: '', kind: 'goods', category: '', uom: 'pcs', std: '', price: '', vat: 'S', reorder: '', barcode: '', act: '1', inva: '', cogsa: '', errs: null });
  screen('x_invitems', { moves: true }, {
    view(v, d) {
      const its = d.items || [], accts = d.accts || [];
      if (v.form) return H.head('📦', v.id ? 'Edit item' : 'New item', '', '#0369a1') + errs(v.errs)
        + H.card('', `<div class="fin-row">${H.f('Code *', H.inp('code'))}${H.f('Name *', H.inp('name'))}</div>${H.f('Name (Arabic)', H.inp('name_ar'))}${H.f('Kind', H.seg('kind', Object.entries(I.KINDS), 'goods'))}<div class="fin-row">${H.f('Category', H.inp('category'))}${H.f('Unit', H.inp('uom', { ph: 'pcs · kg · ctn' }))}${H.f('Barcode', H.inp('barcode'))}</div>`)
        + H.card('Cost & price', `<div class="fin-row">${H.f('Standard cost (AED)', H.num('std'), 'Used for opening stock, ORBIT receipts and when there is no stock yet')}${H.f('Sales price (AED)', H.num('price'))}${H.f('Sales VAT', H.sel('vat', [['S', '5%'], ['Z', '0%'], ['E', 'Exempt']], { ph: false }))}${H.f('Reorder level', H.num('reorder'))}</div>`)
        + H.card('Accounts (leave empty for the defaults)', `<div class="fin-row">${H.f('Stock account', H.sel('inva', acctOpts(accts, a => a.type === 'asset'), { ph: 'Default for the kind' }))}${H.f('Cost of sales account', H.sel('cogsa', acctOpts(accts, a => a.type === 'expense'), { ph: 'Default' }))}</div>${H.f('Status', H.seg('act', [['1', 'Active'], ['0', 'Inactive']], '1'))}`)
        + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Save', 'save')}</div>`);
      if (ST.item) {
        const it = its.find(x => x.id === ST.item); if (!it) return busy(d); setTitle(it.code);
        const p = (d.P && d.P.get(it.code)) || { qty: 0, value: 0, wh: {} }, card = I.stockCard(d.moves || [], it.code, addD(today(), -90), '');
        return H.head('📦', it.code + ' · ' + it.name, I.KINDS[it.kind] + (it.category ? ' · ' + esc(it.category) : '') + (it.source !== 'erp' ? ' · linked to ORBIT' : ''), '#0369a1')
          + H.kpis([['On hand', fq(p.qty) + ' ' + esc(it.uom)], ['Value', n2(p.value), 'g'], ['Average cost', n2(I.avgOf(p, it))], ['Standard cost', n2(it.std)]])
          + H.card('By warehouse', table([{ k: 'wh', t: 'Warehouse' }, { k: 'q', t: 'Quantity', raw: 1 }], Object.entries(p.wh).filter(([, q]) => q).map(([wh, q]) => ({ wh, q: fq(q) }))))
          + H.card('Stock card · last 90 days', table([{ k: 'date', t: 'Date' }, { k: 'no', t: 'Document' }, { k: 'wh', t: 'Wh' }, { k: 'q', t: 'Qty', raw: 1 }, { k: 'value', t: 'Value', n: 1 }, { k: 'b', t: 'Balance', raw: 1 }], card.rows.slice().reverse().slice(0, 40).map(m => ({ date: dmy(m.date), no: m.no, wh: m.wh, q: (m.qty > 0 ? '+' : '') + fq(m.qty), value: m.value, b: fq(m.balQty) }))))
          + H.bar(`<div class="mb-row">${H.btn('← All items', 'back0', 's')}${H.btn('✏️ Edit', 'edit', 's')}${it.kind !== 'raw' ? H.btn('🧾 Make e-invoice product', 'toProd', 's') : ''}</div>`);
      }
      const q = String(v.q || '').toLowerCase(), tab = v.tab || 'all', oh = new Map(I.onHand(d.P || new Map(), its).map(r => [r.code, r]));
      const rows = its.filter(i => (tab === 'all' || i.kind === tab) && (!q || (i.code + ' ' + i.name + ' ' + i.category + ' ' + i.barcode).toLowerCase().includes(q)));
      setTitle('Items');
      return H.head('📦', 'Items', its.length + ' items · quantity and value at average cost', '#0369a1') + busy(d) + needSetup(d) + H.search('q', 'Search code, name, category, barcode')
        + H.tabs('tab', [['all', 'All', its.length], ['finished', 'Finished'], ['raw', 'Raw & pack'], ['goods', 'Trading'], ['service', 'Services']], 'all')
        + H.card('', table([{ k: 'code', t: 'Code' }, { k: 'name', t: 'Item' }, { k: 'q', t: 'On hand', raw: 1 }, { k: 'value', t: 'Value', n: 1 }], rows.slice(0, 400).map(i => { const r = oh.get(i.code); return { code: i.code, name: i.name + (i.active ? '' : ' (inactive)'), q: r ? `<span class="${r.low ? 'inv-short' : ''}">${fq(r.qty)}</span> ${esc(i.uom)}` : '—', value: r ? r.value : '', _tap: i.id }; }), null, 'open'))
        + H.bar(`<div class="mb-row">${H.btn('＋ New item', 'add')}${H.btn('🔗 Link ORBIT items', 'toLink', 's')}</div>`);
    },
    act: { toSet, toLink(t, v) { go('x_invset'); setTimeout(() => { V().tab = 'orbit'; render(); }, 50); },
      add(t, v, d) { Object.assign(v, blankItem(d)); render(); }, open(t, v) { ST.item = +t.dataset.i; render(); }, back0() { ST.item = null; render(); }, cancel(t, v) { v.form = 0; render(); },
      edit(t, v, d) { const i = (d.items || []).find(x => x.id === ST.item); Object.assign(v, { form: 1, id: i.id, code: i.code, name: i.name, name_ar: i.name_ar, kind: i.kind, category: i.category, uom: i.uom, std: String(i.std || ''), price: String(i.price || ''), vat: i.vat, reorder: String(i.reorder || ''), barcode: i.barcode, act: i.active ? '1' : '0', inva: i.invAccount, cogsa: i.cogsAccount, errs: null, _src: i.source, _sid: i.srcId }); render(); },
      async save(t, v, d) {
        const e = [], code = str(v.code); if (!code) e.push('Code is required'); if (!str(v.name)) e.push('Name is required'); if (/[|,]/.test(code)) e.push('Code cannot contain , or |');
        const old = (d.items || []).find(x => x.id === v.id); if ((d.items || []).some(x => x.code.toLowerCase() === code.toLowerCase() && x.id !== v.id)) e.push('Code ' + code + ' is already used');
        if (old && old.code !== code && (d.moves || []).some(m => m.code === old.code)) e.push('This item has stock movements — its code cannot change');
        if (old && old.kind !== v.kind && v.kind === 'service' && qtyAt(d, old.code)) e.push('This item has stock — it cannot become a service');
        if (num(v.std) < 0 || num(v.price) < 0) e.push('Cost and price cannot be negative');
        if (e.length) { v.errs = e; render(); return; }
        const f = I.itemToFields({ code, name: str(v.name), name_ar: str(v.name_ar), kind: v.kind || 'goods', category: str(v.category), uom: str(v.uom) || 'pcs', std: num(v.std), price: num(v.price), vat: v.vat || 'S', reorder: num(v.reorder), barcode: str(v.barcode), active: v.act !== '0', invAccount: v.inva || '', cogsAccount: v.cogsa || '', source: v._src || 'erp', srcId: v._sid || '' });
        try { if (v.id) await S.upd('Inv_Items', v.id, f); else await S.add('Inv_Items', f); toast('✅ Item saved', 'success'); v.form = 0; refresh('x_invitems'); } catch (er) { toast(er.message, 'error'); } },
      async toProd(t, v, d) {   /* the item as an e-invoicing product, so sales of it take it out of stock */
        const i = (d.items || []).find(x => x.id === ST.item); let rows = []; try { rows = await get('EInv_Products', null, true); } catch (e) { return toast('Set up the e-invoicing lists first', 'warn'); }
        if (rows.some(r => str(r.itemcode) === i.code)) return toast('There is already an e-invoice product for ' + i.code, 'info');
        if (!confirm('Create the e-invoice product "' + i.name + '" at ' + money(i.price) + '?\n\nAdd its HS code in E-Invoice Products afterwards.')) return;
        try { await A().add('EInv_Products', { Title: i.name, NameAr: i.name_ar, Kind: 'G', ClassCode: '', UnitCode: 'H87', Price: i.price, VatCategory: i.vat || 'S', ItemCode: i.code }); drop('EInv_Products'); toast('✅ Product created — add its HS code in E-Invoice Products', 'success'); } catch (e) { toast(e.message, 'error'); } } } });

  /* ================= Stock transactions ================= */
  const NEWT = { receipt: ['📥', 'Receive stock', 'Goods in — from a supplier, production or any other source', '#047857'], issue: ['📤', 'Issue stock', 'Goods out — used, damaged, samples, write-off', '#c2410c'], transfer: ['🔁', 'Transfer', 'Move stock between warehouses (no ledger effect)', '#1d4ed8'], count: ['🧮', 'Stock count', 'Counted quantities → adjustments for the difference', '#7c3aed'] };
  const blankLn = (d, type) => ({ code: '', wh: (d.set && d.set.wh) || 'MAIN', to: '', qty: '', unit_cost: '', counted: '' });
  function docFromV(v) {
    const lines = (v.lines || []).filter(l => l.code).map(l => v.type === 'receipt' ? { code: l.code, wh: l.wh, qty: num(l.qty), unit_cost: num(l.unit_cost) } : v.type === 'transfer' ? { code: l.code, wh: l.wh, to: l.to, qty: num(l.qty) } : v.type === 'count' ? { code: l.code, wh: l.wh, counted: l.counted === '' ? '' : num(l.counted) } : { code: l.code, wh: l.wh, qty: num(l.qty) });
    return { type: v.type, date: v.date, ref: str(v.ref), party: str(v.party), memo: str(v.memo), account: v.type === 'transfer' ? '' : (v.acc || ''), lines };
  }
  screen('x_invmove', { moves: true, docs: true, sups: true }, {
    view(v, d) {
      const docs = d.docs || [], accts = d.accts || [];
      if (typeof ST.doc === 'string' && ST.doc.startsWith('new')) {
        if (!v.type) { const t0 = ST.doc.split(':')[1] || 'receipt'; Object.assign(v, { type: t0, date: today(), lines: [blankLn(d, t0)] }); }
        if (v.accFor !== v.type) { v.acc = v.type === 'receipt' ? d.map.grni : ['issue', 'count'].includes(v.type) ? d.map.inv_adjust : ''; v.accFor = v.type; }
        const T = NEWT[v.type], doc = docFromV(v), pre = doc.lines.length ? I.buildMoves(doc, d.items, d.P, d.set) : null, je = pre && pre.ok ? I.journalFor(Object.assign({}, doc, { no: '(new)' }), pre.moves, d.items, d.map) : null;
        const wo = whOpts(d), io = itemOpts(d);
        setTitle(T[1]);
        const ln = v.lines.map((l, i) => { const it = itemOf(d, l.code), sys = l.code ? qtyAt(d, l.code, l.wh) : null;
          return `<div class="inv-ln"><div class="ei-lnh"><span>Line ${i + 1}</span>${v.lines.length > 1 ? `<button type="button" class="mx-sb r" data-x="delL" data-i="${i}">✕</button>` : ''}</div>${lnSel('lines', i, 'code', io, l.code, '— item —')}
            <div class="inv-g"><div><label>${v.type === 'transfer' ? 'From' : 'Warehouse'}</label>${lnSel('lines', i, 'wh', wo, l.wh, '—')}</div>
            ${v.type === 'transfer' ? `<div><label>To</label>${lnSel('lines', i, 'to', wo.filter(w => w[0] !== l.wh), l.to, '—')}</div>` : ''}
            ${v.type === 'count' ? `<div><label>Counted${it ? ' (' + esc(it.uom) + ')' : ''}</label>${lnInp('lines', i, 'counted', l.counted, '0', 1)}</div>` : `<div><label>Quantity${it ? ' (' + esc(it.uom) + ')' : ''}</label>${lnInp('lines', i, 'qty', l.qty, '0', 1)}</div>`}
            ${v.type === 'receipt' ? `<div><label>Unit cost (AED)</label>${lnInp('lines', i, 'unit_cost', l.unit_cost, it ? n2(it.std || I.avgOf(d.P.get(it.code), it)) : '0.00', 1)}</div>` : ''}</div>
            ${it ? `<div class="inv-sys">In ${esc(l.wh)}: <b>${fq(sys)}</b> ${esc(it.uom)} · average ${n2(I.avgOf(d.P.get(it.code), it))}${v.type === 'count' && l.counted !== '' ? ` · difference <b class="${num(l.counted) - sys < 0 ? 'inv-short' : 'inv-ok'}">${fq(num(l.counted) - sys)}</b>` : ''}</div>` : ''}</div>`; }).join('');
        const accSel = v.type === 'receipt' ? H.f('Credit account (against stock)', H.sel('acc', acctOpts(accts), { ph: false }), 'Goods received not invoiced when the supplier bill comes later · use a stock item on the bill instead to receive and bill in one step')
          : v.type === 'issue' ? H.f('Charge to account', H.sel('acc', acctOpts(accts, a => a.type === 'expense' || a.type === 'asset'), { ph: false })) : v.type === 'count' ? H.f('Differences to account', H.sel('acc', acctOpts(accts, a => a.type === 'expense'), { ph: false })) : '';
        return H.head(T[0], T[1], T[2], T[3]) + busy(d) + errs(v.errs, 'Cannot post')
          + H.card('', H.seg('type', [['receipt', '📥 Receive'], ['issue', '📤 Issue'], ['transfer', '🔁 Transfer'], ['count', '🧮 Count']], 'receipt') + `<div class="fin-row">${H.f('Date', H.date('date'))}${H.f('Reference', H.inp('ref', { ph: v.type === 'receipt' ? 'Delivery note / GRN' : 'Reference' }))}${v.type === 'receipt' ? H.f('Supplier', H.inp('party', { list: 'invSup' })) + `<datalist id="invSup">${(d.sups || []).map(s => `<option value="${esc(str(s.title))}">`).join('')}</datalist>` : ''}</div>${accSel}${H.f('Memo', H.inp('memo'))}`)
          + H.card('Lines', ln + `<div class="mx-acts">${H.sbtn('＋ Add line', 'addL')}${v.type === 'count' ? H.sbtn('📋 Load all items of ' + esc(v.lines[0] ? v.lines[0].wh : ''), 'loadAll') : ''}</div>`)
          + (pre ? H.card('Preview', (pre.ok ? `<div class="ei-kv"><span>Stock value in</span><b>${money(pre.value)}</b></div><div class="ei-kv"><span>Stock value out</span><b>${money(-I.r2(pre.moves.filter(m => m.qty < 0).reduce((s, m) => s + m.value, 0)))}</b></div>` + (je ? table([{ k: 'a', t: 'Ledger account' }, { k: 'debit', t: 'Debit', n: 1 }, { k: 'credit', t: 'Credit', n: 1 }], je.lines.map(l => ({ a: acctName(accts, l.account), debit: l.debit || '', credit: l.credit || '' }))) : '<span class="mb-hint">No ledger entry (stock only).</span>') : errs(pre.errors))) : '')
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('✓ Post', 'post')}</div>`);
      }
      if (ST.doc) {
        const x = docs.find(y => y.id === ST.doc); if (!x) return busy(d) + (d.busy ? '' : H.card('', H.empty('Document not found.'))); setTitle(x.no || 'Stock document');
        const mv = (d.moves || []).filter(m => m.docId === String(x.id));
        return H.head(TYPE_IC[x.type] || '📦', (x.no || 'Draft') + ' · ' + (I.DOC_TYPES[x.type] || x.type), dmy(x.date) + (x.ref ? ' · ' + esc(x.ref) : '') + (x.party ? ' · ' + esc(x.party) : ''), COL[x.status])
          + H.card('Status · ' + pill(x.status), `<div class="ei-kv"><span>Journal entry</span><b>${esc(x.journal || (x.account === 'BILL' ? 'on the purchase bill' : '—'))}</b></div>${x.memo ? `<div class="ei-kv"><span>Memo</span><b>${esc(x.memo)}</b></div>` : ''}${x.srcRef ? `<div class="ei-kv"><span>From</span><b>${esc(x.srcRef)}</b></div>` : ''}`)
          + H.card('Stock moves', table([{ k: 'it', t: 'Item' }, { k: 'wh', t: 'Wh' }, { k: 'q', t: 'Qty', raw: 1 }, { k: 'unit', t: 'Unit cost', n: 1 }, { k: 'value', t: 'Value', n: 1 }], mv.map(m => ({ it: nameOf(d, m.code), wh: m.wh, q: (m.qty > 0 ? '+' : '') + fq(m.qty), unit: m.unit, value: m.value })), { it: 'Net', value: I.r2(mv.reduce((s, m) => s + m.value, 0)) }))
          + H.bar(`<div class="mb-row">${H.btn('← All documents', 'back0', 's')}${x.journal ? H.btn('📒 Journal entry', 'toJe', 's') : ''}</div>`);
      }
      const tab = v.tab || 'all', G = { prod: ['prod_issue', 'prod_output'], sales: ['sale', 'sale_return'], other: ['orbit', 'opening'] };
      const rows = docs.filter(x => tab === 'all' || x.type === tab || (G[tab] || []).includes(x.type));
      setTitle('Stock transactions');
      return H.head('🔁', 'Stock transactions', 'Receipts, issues, transfers, counts — and the ones made by sales, bills and production', '#1d4ed8') + busy(d) + needSetup(d)
        + H.tabs('tab', [['all', 'All', docs.length], ['receipt', 'In'], ['issue', 'Out'], ['transfer', 'Transfers'], ['count', 'Counts'], ['prod', 'Production'], ['sales', 'Sales'], ['other', 'ORBIT / opening']], 'all')
        + H.card('', table([{ k: 'no', t: 'Document' }, { k: 'date', t: 'Date' }, { k: 'type', t: 'Type' }, { k: 'ref', t: 'Reference' }, { k: 'value', t: 'Value', n: 1 }, { k: 'st', t: '', raw: 1 }], rows.slice(0, 300).map(x => ({ no: x.no || '(draft)', date: dmy(x.date), type: (TYPE_IC[x.type] || '') + ' ' + (I.DOC_TYPES[x.type] || x.type), ref: x.ref, value: x.value, st: x.status === 'posted' ? '' : pill(x.status), _tap: x.id })), null, 'open'))
        + H.bar(`<div class="mb-row">${H.btn('📥 Receive', 'nR')}${H.btn('📤 Issue', 'nI', 's')}${H.btn('🔁 Transfer', 'nT', 's')}${H.btn('🧮 Count', 'nC', 's')}</div>`);
    },
    act: { toSet,
      nR(t, v) { ST.doc = 'new:receipt'; clear(v); render(); }, nI(t, v) { ST.doc = 'new:issue'; clear(v); render(); }, nT(t, v) { ST.doc = 'new:transfer'; clear(v); render(); }, nC(t, v) { ST.doc = 'new:count'; clear(v); render(); },
      open(t, v) { ST.doc = +t.dataset.i; render(); }, back0(t, v) { ST.doc = null; clear(v); render(); }, cancel(t, v) { ST.doc = null; clear(v); render(); },
      toJe(t, v, d) { const x = (d.docs || []).find(y => y.id === ST.doc); go('x_finjv'); setTimeout(() => { V().q = x.journal; render(); }, 600); },
      addL(t, v, d) { const last = v.lines[v.lines.length - 1]; v.lines.push(Object.assign(blankLn(d, v.type), last ? { wh: last.wh, to: last.to } : {})); render(); }, delL(t, v) { v.lines.splice(+t.dataset.i, 1); render(); },
      loadAll(t, v, d) { const wh = (v.lines[0] && v.lines[0].wh) || d.set.wh, have = new Set(v.lines.filter(l => l.code).map(l => l.code));
        let pick = stocked(d).filter(i => !have.has(i.code) && qtyAt(d, i.code, wh)); if (!pick.length && !have.size) pick = stocked(d);   /* empty warehouse: all items */
        const add = pick.map(i => ({ code: i.code, wh, counted: '' })); v.lines = v.lines.filter(l => l.code).concat(add); toast(add.length + ' item(s) added — enter the counted quantities', 'info'); render(); },
      async post(t, v, d) {
        const doc = docFromV(v); if (doc.type === 'count') doc.lines = doc.lines.filter(l => l.counted !== '');
        if (doc.type === 'receipt' && doc.lines.some(l => !l.unit_cost)) { const z = doc.lines.filter(l => !l.unit_cost); z.forEach(l => { const it = itemOf(d, l.code); l.unit_cost = it ? (it.std || I.r4(I.avgOf(d.P.get(it.code), it))) : 0; }); }
        const chk = I.buildMoves(doc, d.items, d.P, d.set); if (!chk.ok) { v.errs = chk.errors; render(); return; }
        if (doc.type === 'count' && !chk.moves.length) return toast('No differences — nothing to adjust', 'info');
        if (!confirm('Post this ' + NEWT[doc.type][1].toLowerCase() + '?\n\nPosted stock documents cannot be edited.')) return;
        try { const r = await IS.post(doc, d.ctx); toast('✅ ' + r.no + ' posted' + (r.journal ? ' · ' + r.journal : '') + (r.mirror && r.mirror.err ? ' · ORBIT write-back failed: ' + r.mirror.err : ''), r.mirror && r.mirror.err ? 'warn' : 'success'); ST.doc = r.id; clear(v); refresh('x_invmove'); } catch (e) { v.errs = [e.message]; render(); } } } });

  /* ================= Stock reports ================= */
  screen('x_invrep', { moves: true, lines: true }, {
    view(v, d) {
      const tab = v.tab || 'oh', its = d.items || [], P = d.P || new Map(), asOf = v.asOf || today();
      const head = H.head('📊', 'Stock reports', 'Average cost · AED', '#0369a1') + busy(d) + needSetup(d) + H.tabs('tab', [['oh', 'On hand'], ['val', 'Valuation'], ['card', 'Stock card'], ['mv', 'Movements'], ['re', 'Reorder'], ['rec', 'Stock vs ledger']], 'oh');
      const out = (title, cols, rows, foot) => { v._rep = { title, cols, rows, foot }; return H.card('', table(cols, rows, foot)) + H.bar(`<div class="mb-row">${H.btn('⬇ CSV', 'csv', 's')}${H.btn('🖨 Print', 'print', 's')}</div>`); };
      if (tab === 'oh') { const Pa = I.position(d.moves || [], asOf), rows = I.onHand(Pa, its, v.wh || '').filter(r => r.qty && (!v.kind || r.kind === v.kind));
        return head + H.card('', `<div class="fin-row">${H.f('As of', H.date('asOf'))}${H.f('Warehouse', H.sel('wh', whOpts(d), { ph: 'All warehouses' }))}${H.f('Kind', H.sel('kind', Object.entries(I.KINDS).filter(([k]) => k !== 'service'), { ph: 'All kinds' }))}</div>`)
          + out('Stock on hand ' + dmy(asOf) + (v.wh ? ' · ' + v.wh : ''), [{ k: 'code', t: 'Code' }, { k: 'name', t: 'Item' }, { k: 'uom', t: 'Unit' }, { k: 'qty', t: 'Quantity', n: 1 }, { k: 'avg', t: 'Avg cost', n: 1 }, { k: 'value', t: 'Value', n: 1 }], rows, { code: 'Total', value: I.r2(rows.reduce((s, r) => s + r.value, 0)) }); }
      if (tab === 'val') { const Pa = I.position(d.moves || [], asOf), rows = I.onHand(Pa, its), G = new Map();
        rows.forEach(r => { const it = itemOf(d, r.code), a = I.invAcc(it, d.map), k = I.KINDS[r.kind] + '|' + a, g = G.get(k) || { kind: I.KINDS[r.kind], acc: acctName(d.accts, a), items: 0, value: 0 }; if (r.qty) g.items++; g.value = I.r2(g.value + r.value); G.set(k, g); });
        const R = [...G.values()].filter(g => g.value || g.items); return head + H.card('', H.f('As of', H.date('asOf'))) + out('Stock valuation ' + dmy(asOf), [{ k: 'kind', t: 'Kind' }, { k: 'acc', t: 'Stock account' }, { k: 'items', t: 'Items in stock' }, { k: 'value', t: 'Value', n: 1 }], R, { kind: 'Total', value: I.r2(R.reduce((s, g) => s + g.value, 0)) }); }
      if (tab === 'card') { const code = v.item || '', c = code ? I.stockCard(d.moves || [], code, v.from || addD(today(), -30), v.to || today(), v.wh || '') : null;
        return head + H.card('', H.f('Item', H.sel('item', itemOpts(d))) + `<div class="fin-row">${H.f('From', H.date('from', { val: v.from || addD(today(), -30) }))}${H.f('To', H.date('to'))}${H.f('Warehouse', H.sel('wh', whOpts(d), { ph: 'All' }))}</div>`)
          + (c ? out('Stock card ' + nameOf(d, code), [{ k: 'date', t: 'Date' }, { k: 'no', t: 'Document' }, { k: 'type', t: 'Type' }, { k: 'wh', t: 'Wh' }, { k: 'qty', t: 'Qty', n: 1 }, { k: 'unit', t: 'Unit cost', n: 1 }, { k: 'value', t: 'Value', n: 1 }, { k: 'balQty', t: 'Bal. qty', n: 1 }, { k: 'balValue', t: 'Bal. value', n: 1 }],
            [{ date: '', no: 'Opening', type: '', wh: '', qty: '', unit: '', value: '', balQty: c.open.qty, balValue: c.open.value, _cls: 'sub' }].concat(c.rows.map(m => Object.assign({}, m, { date: dmy(m.date), type: I.DOC_TYPES[m.type] || m.type }))), { date: 'Closing', balQty: c.close.qty, balValue: c.close.value }) : H.card('', H.empty('Choose an item.'))); }
      if (tab === 'mv') { const from = v.from || today().slice(0, 7) + '-01', rows = I.movementSummary(d.moves || [], its, from, v.to || today());
        return head + H.card('', `<div class="fin-row">${H.f('From', H.date('from', { val: from }))}${H.f('To', H.date('to'))}</div>`)
          + out('Stock movements ' + dmy(from) + ' – ' + dmy(v.to || today()), [{ k: 'code', t: 'Code' }, { k: 'name', t: 'Item' }, { k: 'openQty', t: 'Open qty', n: 1 }, { k: 'inQty', t: 'In', n: 1 }, { k: 'outQty', t: 'Out', n: 1 }, { k: 'closeQty', t: 'Close qty', n: 1 }, { k: 'openValue', t: 'Open value', n: 1 }, { k: 'inValue', t: 'In value', n: 1 }, { k: 'outValue', t: 'Out value', n: 1 }, { k: 'closeValue', t: 'Close value', n: 1 }], rows,
            { code: 'Total', openValue: I.r2(rows.reduce((s, r) => s + r.openValue, 0)), inValue: I.r2(rows.reduce((s, r) => s + r.inValue, 0)), outValue: I.r2(rows.reduce((s, r) => s + r.outValue, 0)), closeValue: I.r2(rows.reduce((s, r) => s + r.closeValue, 0)) }); }
      if (tab === 're') { const rows = I.onHand(P, its).filter(r => r.reorder > 0).map(r => Object.assign(r, { short: I.r3(Math.max(0, r.reorder - r.qty)) })).sort((a, b) => b.short - a.short);
        return head + out('Reorder list', [{ k: 'code', t: 'Code' }, { k: 'name', t: 'Item' }, { k: 'uom', t: 'Unit' }, { k: 'qty', t: 'On hand', n: 1 }, { k: 'reorder', t: 'Reorder level', n: 1 }, { k: 'short', t: 'Below by', n: 1 }], rows.map(r => Object.assign({}, r, { _cls: r.low ? 'sub' : '' }))); }
      const rec = I.reconcile(I.position(d.moves || [], asOf), its, d.lines || [], d.map, asOf);
      return head + H.card('', H.f('As of', H.date('asOf')) + `<span class="mb-hint">${rec.ok ? '✓ Stock value and the ledger agree.' : 'Differences usually come from manual journal entries on stock accounts or bills that debited a stock account without a stock item.'}</span>`)
        + out('Stock vs ledger ' + dmy(asOf), [{ k: 'a', t: 'Stock account' }, { k: 'stock', t: 'Stock value', n: 1 }, { k: 'gl', t: 'Ledger balance', n: 1 }, { k: 'diff', t: 'Difference', n: 1 }], rec.rows.map(r => Object.assign({}, r, { a: acctName(d.accts, r.account) })).concat([{ a: 'Work in progress (ledger)', stock: '', gl: rec.wip, diff: '', _cls: 'sub' }]));
    },
    act: { toSet, csv(t, v) { const r = v._rep; if (r) csv(r.title.replace(/\W+/g, '_'), r.cols, r.rows); }, print(t, v) { const r = v._rep; if (r) printHtml(r.title, table(r.cols, r.rows, r.foot)); } } });

  /* ================= Bills of materials ================= */
  screen('x_mfgbom', { moves: true, boms: true, mos: true }, {
    view(v, d) {
      const boms = d.boms || [], fin = itemOpts(d, i => i.kind === 'finished');
      if (ST.bom) {
        if (!v.init) { v.init = 1; const b = ST.bom !== 'new' ? boms.find(x => x.id === ST.bom) : null; Object.assign(v, b ? { product: b.product, version: b.version, name: b.name, output: String(b.output), labour: String(b.labour || ''), overhead: String(b.overhead || ''), act: b.active ? '1' : '0', notes: b.notes, comps: b.comps.map(c => ({ code: c.code, qty: String(c.qty), scrap: c.scrap ? String(c.scrap) : '' })) } : { version: '1', output: '1', act: '1', comps: [{ code: '', qty: '', scrap: '' }] }); }
        const bom = { product: v.product, output: num(v.output), labour: num(v.labour), overhead: num(v.overhead), comps: v.comps.filter(c => c.code).map(c => ({ code: c.code, qty: num(c.qty), scrap: num(c.scrap) })) }, c = I.bomCost(bom, d.items, d.P), uom = (itemOf(d, v.product) || {}).uom || 'unit';
        setTitle(ST.bom === 'new' ? 'New bill of materials' : 'Bill of materials');
        return H.head('🧩', 'Bill of materials', 'What goes into one batch of the product', '#7c3aed') + busy(d) + errs(v.errs)
          + H.card('', H.f('Product (finished good)', H.sel('product', fin)) + (fin.length ? '' : '<span class="mb-hint">Make an item with kind "Finished goods" first.</span>') + `<div class="fin-row">${H.f('Version', H.inp('version'))}${H.f('Batch makes (' + esc(uom) + ')', H.num('output', { r: 1 }))}${H.f('Status', H.seg('act', [['1', 'Active'], ['0', 'Inactive']], '1'))}</div>`)
          + H.card('Components per batch', v.comps.map((x, i) => { const it = itemOf(d, x.code); return `<div class="inv-ln"><div class="ei-lnh"><span>Component ${i + 1}</span>${v.comps.length > 1 ? `<button type="button" class="mx-sb r" data-x="delC" data-i="${i}">✕</button>` : ''}</div>${lnSel('comps', i, 'code', itemOpts(d, y => y.code !== v.product), x.code, '— item —')}<div class="inv-g"><div><label>Quantity${it ? ' (' + esc(it.uom) + ')' : ''}</label>${lnInp('comps', i, 'qty', x.qty, '0', 1)}</div><div><label>Scrap %</label>${lnInp('comps', i, 'scrap', x.scrap, '0', 1)}</div></div></div>`; }).join('') + H.sbtn('＋ Add component', 'addC', 'style="width:100%"'))
          + H.card('Conversion cost per batch', `<div class="fin-row">${H.f('Labour (AED)', H.num('labour', { r: 1 }))}${H.f('Overhead (AED)', H.num('overhead', { r: 1 }))}</div><span class="mb-hint">Charged to the product when an order is completed and credited to Production cost clearing.</span>`)
          + H.card('Cost of one ' + esc(uom) + ' (today\'s average costs)', table([{ k: 'name', t: 'Component' }, { k: 'per', t: 'Qty / unit', n: 1 }, { k: 'unit', t: 'Unit cost', n: 1 }, { k: 'cost', t: 'Cost', n: 1 }], c.rows.map(r => ({ name: r.code + ' · ' + r.name, per: r.per, unit: r.unit, cost: r.cost })).concat([{ name: 'Labour & overhead', per: '', unit: '', cost: c.conversion, _cls: 'sub' }]), { name: 'Total per ' + uom, cost: c.unit }))
          + H.card('Notes', H.txt('notes')) + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${ST.bom !== 'new' ? H.btn('🗑 Delete', 'del', 's') : ''}${H.btn('💾 Save', 'save')}</div>`);
      }
      setTitle('Bills of materials');
      return H.head('🧩', 'Bills of materials', 'Recipes: components, scrap and conversion cost per batch', '#7c3aed') + busy(d) + needSetup(d)
        + H.card('', table([{ k: 'p', t: 'Product' }, { k: 'version', t: 'Ver.' }, { k: 'out', t: 'Batch', raw: 1 }, { k: 'n', t: 'Components' }, { k: 'unit', t: 'Cost / unit', n: 1 }, { k: 'st', t: '', raw: 1 }], boms.map(b => ({ p: nameOf(d, b.product), version: b.version, out: fq(b.output) + ' ' + esc((itemOf(d, b.product) || {}).uom || ''), n: String(b.comps.length), unit: I.bomCost(b, d.items, d.P).unit, st: b.active ? '' : pill('inactive'), _tap: b.id })), null, 'open'))
        + H.bar(H.btn('＋ New bill of materials', 'add'));
    },
    act: { toSet, add(t, v) { ST.bom = 'new'; clear(v); render(); }, open(t, v) { ST.bom = +t.dataset.i; clear(v); render(); }, cancel(t, v) { ST.bom = null; clear(v); render(); },
      addC(t, v) { v.comps.push({ code: '', qty: '', scrap: '' }); render(); }, delC(t, v) { v.comps.splice(+t.dataset.i, 1); render(); },
      async save(t, v, d) { const b = { id: ST.bom === 'new' ? null : ST.bom, product: v.product, version: str(v.version) || '1', name: 'BOM ' + v.product + ' v' + (str(v.version) || '1'), output: num(v.output), labour: num(v.labour), overhead: num(v.overhead), active: v.act !== '0', notes: str(v.notes), comps: v.comps.filter(c => c.code || num(c.qty)).map(c => ({ code: c.code, qty: num(c.qty), scrap: num(c.scrap) })) };
        const e = I.checkBom(b, d.items, d.boms); if (num(v.labour) < 0 || num(v.overhead) < 0) e.push('Costs cannot be negative'); if (e.length) { v.errs = e; render(); return; }
        try { if (b.id) await S.upd('Inv_BOM', b.id, I.bomToFields(b)); else await S.add('Inv_BOM', I.bomToFields(b)); toast('✅ Bill of materials saved', 'success'); ST.bom = null; clear(v); refresh('x_mfgbom'); } catch (er) { toast(er.message, 'error'); } },
      async del(t, v, d) { if ((d.mos || []).some(m => m.bom === String(ST.bom))) return toast('Production orders use this bill of materials — set it to Inactive instead', 'warn'); if (!confirm('Delete this bill of materials?')) return;
        try { await S.del('Inv_BOM', ST.bom); ST.bom = null; clear(v); toast('Deleted', 'success'); refresh('x_mfgbom'); } catch (e) { toast(e.message, 'error'); } } } });

  /* ================= Production orders ================= */
  const issuedValue = (d, docNo) => { const x = (d.docs || []).find(y => y.no === docNo && y.status === 'posted'); return x ? -I.r2((d.moves || []).filter(m => m.docId === String(x.id)).reduce((s, m) => s + m.value, 0)) : null; };
  screen('x_mfgmo', { moves: true, docs: true, boms: true, mos: true }, {
    view(v, d) {
      const mos = d.mos || [], boms = d.boms || [];
      if (ST.mo === 'new') {
        if (!v.init) Object.assign(v, { init: 1, date: today(), qty: '', matWh: d.set.rmWh, outWh: d.set.fgWh });
        const opts = boms.filter(b => b.active).map(b => [String(b.id), nameOf(d, b.product) + ' · v' + b.version + ' (batch ' + fq(b.output) + ')']), bom = boms.find(b => String(b.id) === String(v.bom));
        const req = bom && num(v.qty) > 0 ? I.requirements(bom, num(v.qty)) : [];
        setTitle('New production order');
        return H.head('🏭', 'New production order', 'Make a quantity of a product from its bill of materials', '#b45309') + busy(d) + errs(v.errs)
          + H.card('', H.f('Product · bill of materials', H.sel('bom', opts)) + (opts.length ? '' : '<span class="mb-hint">Create a bill of materials first.</span>') + `<div class="fin-row">${H.f('Quantity to make' + (bom ? ' (' + esc((itemOf(d, bom.product) || {}).uom || '') + ')' : ''), H.num('qty', { r: 1 }))}${H.f('Planned date', H.date('date'))}</div><div class="fin-row">${H.f('Materials from', H.sel('matWh', whOpts(d), { ph: false }))}${H.f('Finished goods to', H.sel('outWh', whOpts(d), { ph: false }))}</div>`)
          + (req.length ? H.card('Materials needed', reqTable(d, req, v.matWh)) : '')
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Create order', 'create')}</div>`);
      }
      if (ST.mo) {
        const m = mos.find(x => x.id === ST.mo); if (!m) return busy(d); setTitle(m.no);
        const bom = boms.find(b => String(b.id) === m.bom), req = m.comps.length ? m.comps : bom ? I.requirements(bom, m.planQty) : [], uom = (itemOf(d, m.product) || {}).uom || '';
        const conv = bom ? I.conversionFor(bom, num(v.done) || m.planQty) : 0;
        if (m.status === 'released' && v.done == null) v.done = String(m.planQty);
        return H.head('🏭', m.no + ' · ' + nameOf(d, m.product), fq(m.planQty) + ' ' + esc(uom) + ' planned · ' + dmy(m.planDate) + (bom ? ' · BOM v' + esc(bom.version) : ''), COL[m.status]) + busy(d) + errs(v.errs)
          + H.card('Status · ' + pill(m.status), `<div class="ei-kv"><span>Materials from → to</span><b>${esc(m.matWh)} → ${esc(m.outWh)}</b></div><div class="ei-kv"><span>Materials issued</span><b>${m.issueDoc ? esc(m.issueDoc) + ' · ' + money(m.issueValue) : '—'}</b></div>${m.status === 'completed' ? `<div class="ei-kv"><span>Produced</span><b>${fq(m.doneQty)} ${esc(uom)} · ${esc(m.outputDoc)}</b></div><div class="ei-kv"><span>Cost</span><b>${money(m.outputValue)} (${n2(m.doneQty ? m.outputValue / m.doneQty : 0)} per ${esc(uom)})</b></div>` : ''}`)
          + H.card(m.status === 'planned' ? 'Materials needed' : 'Materials issued', reqTable(d, req, m.matWh, m.status !== 'planned'))
          + (m.status === 'planned' ? H.card('Release', `<div class="fin-row">${H.f('Issue date', H.date('rdate'))}</div><span class="mb-hint">Takes the materials out of ${esc(m.matWh)} at average cost into work in progress.</span>`) : '')
          + (m.status === 'released' ? H.card('Complete', `<div class="fin-row">${H.f('Quantity produced (' + esc(uom) + ')', H.num('done', { r: 1 }))}${H.f('Completion date', H.date('cdate'))}</div><div class="ei-kv"><span>Work in progress</span><b>${money(m.issueValue)}</b></div><div class="ei-kv"><span>Labour & overhead</span><b>${money(conv)}</b></div><div class="ei-kv g"><span>Finished goods value</span><b>${money(I.r2(m.issueValue + conv))} · ${n2(num(v.done) ? (m.issueValue + conv) / num(v.done) : 0)} per ${esc(uom)}</b></div>`) : '')
          + H.card('History', (m.history || []).slice().reverse().map(h => `<div class="ei-kv"><span>${esc(dmy(h.at))} ${esc(String(h.at).slice(11, 16))}</span><b>${esc(h.text)}${h.by ? ' · ' + esc(h.by) : ''}</b></div>`).join('') || H.empty('—'))
          + H.bar(m.status === 'planned' ? `<div class="mb-row">${H.btn('✕ Cancel order', 'cancelMo', 's')}${H.btn('⚙️ Release & issue materials', 'release')}</div>` : m.status === 'released' ? `<div class="mb-row">${H.btn('← All orders', 'back0', 's')}${H.btn('✓ Complete', 'complete')}</div>` : H.btn('← All orders', 'back0', 's'));
      }
      const tab = v.tab || 'open', rows = mos.filter(m => tab === 'all' || (tab === 'open' ? ['planned', 'released'].includes(m.status) : m.status === tab));
      setTitle('Production orders');
      return H.head('🏭', 'Production orders', 'Plan → release (materials to work in progress) → complete (finished goods)', '#b45309') + busy(d) + needSetup(d)
        + H.tabs('tab', [['open', 'Open'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All', mos.length]], 'open')
        + H.card('', table([{ k: 'no', t: 'Order' }, { k: 'p', t: 'Product' }, { k: 'q', t: 'Qty', raw: 1 }, { k: 'date', t: 'Planned' }, { k: 'value', t: 'Cost', n: 1 }, { k: 'st', t: '', raw: 1 }], rows.map(m => ({ no: m.no, p: nameOf(d, m.product), q: fq(m.status === 'completed' ? m.doneQty : m.planQty), date: dmy(m.planDate), value: m.outputValue || m.issueValue || '', st: pill(m.status), _tap: m.id })), null, 'open'))
        + H.bar(H.btn('＋ New production order', 'add'));
    },
    act: { toSet, add(t, v) { ST.mo = 'new'; clear(v); render(); }, open(t, v) { ST.mo = +t.dataset.i; clear(v); render(); }, back0(t, v) { ST.mo = null; clear(v); render(); }, cancel(t, v) { ST.mo = null; clear(v); render(); },
      async create(t, v, d) { const bom = (d.boms || []).find(b => String(b.id) === String(v.bom)), e = []; if (!bom) e.push('Choose the bill of materials'); if (!(num(v.qty) > 0)) e.push('Quantity must be more than zero'); if (e.length) { v.errs = e; render(); return; }
        try { const no = await S.next('mo', d.set.mo); const r = await S.add('Inv_ProdOrders', { Title: no, OrderNo: no, ProductCode: bom.product, BomId: String(bom.id), Status: 'planned', PlanDate: v.date, PlanQty: num(v.qty), MatWh: v.matWh, OutWh: v.outWh, History: IS.hist([], 'Planned') });
          toast('✅ ' + no + ' created', 'success'); ST.mo = r.id; clear(v); refresh('x_mfgmo'); } catch (er) { toast(er.message, 'error'); } },
      async cancelMo(t, v, d) { const m = (d.mos || []).find(x => x.id === ST.mo); if (!confirm('Cancel ' + m.no + '?')) return; try { await S.upd('Inv_ProdOrders', m.id, { Status: 'cancelled', History: IS.hist(m.history, 'Cancelled') }); refresh('x_mfgmo'); } catch (e) { toast(e.message, 'error'); } },
      async release(t, v, d) {
        const m = (d.mos || []).find(x => x.id === ST.mo), bom = (d.boms || []).find(b => String(b.id) === m.bom); if (!bom) return toast('The bill of materials of this order is missing', 'error');
        const req = I.requirements(bom, m.planQty), no = m.no + '-I', date = v.rdate || today();
        if (!confirm('Release ' + m.no + ' and issue ' + req.length + ' material(s) from ' + m.matWh + '?')) return;
        try { let val = issuedValue(d, no), docNo = no;   /* already issued by an earlier attempt → only finish the order */
          if (val == null) { const r = await IS.post({ type: 'prod_issue', no, date, ref: m.no, memo: 'Materials for ' + m.no + ' · ' + nameOf(d, m.product), lines: req.map(x => ({ code: x.code, wh: m.matWh, qty: x.qty })) }, d.ctx); val = -I.r2(r.moves.reduce((s, x) => s + x.value, 0)); docNo = r.no; }
          await S.upd('Inv_ProdOrders', m.id, { Status: 'released', IssueDoc: docNo, IssueValue: val, Components: JSON.stringify(req), History: IS.hist(m.history, 'Released · materials ' + docNo + ' · ' + n2(val)) });
          toast('⚙️ ' + m.no + ' released · materials ' + n2(val), 'success'); v.errs = null; refresh('x_mfgmo'); } catch (e) { v.errs = [e.message]; render(); } },
      async complete(t, v, d) {
        const m = (d.mos || []).find(x => x.id === ST.mo), bom = (d.boms || []).find(b => String(b.id) === m.bom), qty = num(v.done), date = v.cdate || today();
        if (!(qty > 0)) return toast('Enter the quantity produced', 'warn'); const conv = bom ? I.conversionFor(bom, qty) : 0, value = I.r2(m.issueValue + conv), no = m.no + '-O';
        if (!confirm('Complete ' + m.no + ': ' + fq(qty) + ' into ' + m.outWh + ' at ' + money(value) + '?')) return;
        try { let docNo = no; if (issuedValue(d, no) == null) docNo = (await IS.post({ type: 'prod_output', no, date, ref: m.no, memo: 'Output of ' + m.no, lines: [{ code: m.product, wh: m.outWh, qty, value }] }, d.ctx, { wip: m.issueValue, conversion: conv })).no;
          await S.upd('Inv_ProdOrders', m.id, { Status: 'completed', DoneQty: qty, DoneDate: date, OutputDoc: docNo, OutputValue: value, Conversion: conv, History: IS.hist(m.history, 'Completed · ' + fq(qty) + ' · ' + docNo) });
          toast('✅ ' + m.no + ' completed', 'success'); v.errs = null; refresh('x_mfgmo'); } catch (e) { v.errs = [e.message]; render(); } } } });
  function reqTable(d, req, wh, done) {
    return table([{ k: 'it', t: 'Material' }, { k: 'q', t: 'Needed', raw: 1 }, { k: 'h', t: done ? 'Now in ' + wh : 'In ' + wh, raw: 1 }], req.map(x => { const it = itemOf(d, x.code) || {}, h = qtyAt(d, x.code, wh); return { it: nameOf(d, x.code), q: fq(x.qty) + ' ' + esc(it.uom || ''), h: done ? fq(h) : `<span class="${h + 0.0005 < x.qty ? 'inv-short' : 'inv-ok'}">${fq(h)}${h + 0.0005 < x.qty ? ' · short ' + fq(x.qty - h) : ' ✓'}</span>` }; }));
  }

  /* ================= Inventory settings ================= */
  screen('x_invset', { moves: true }, {
    view(v, d) {
      const tab = v.tab || 'gen', s = d.set || I.settingsFromRow(null), accts = d.accts || [];
      if (!v.__f && !d.busy && d.set) { v.__f = 1; Object.assign(v, { rcv: s.rcv, iss: s.iss, trf: s.trf, cnt: s.cnt, mo: s.mo, wh: s.wh, fgWh: s.fgWh, rmWh: s.rmWh, neg: s.allowNeg ? '1' : '0', mir: s.mirror ? '1' : '0', odate: today() }); Object.keys(I.MAP_KEYS).forEach(k => { v['m_' + k] = (d.map || {})[k] || ''; }); }
      const head = H.head('⚙️', 'Inventory settings', 'Warehouses · posting accounts · ORBIT link', '#475569') + busy(d) + H.tabs('tab', [['gen', 'General'], ['map', 'Accounts'], ['wh', 'Warehouses'], ['orbit', 'ORBIT link'], ['setup', 'Set up']], 'gen');
      const missAcc = I.COA_ADD.filter(a => !accts.some(x => x.code === a.code));
      if (tab === 'setup') return head + H.card('1 · Lists', `<span class="mb-hint">Creates the inventory & manufacturing lists (and the finance and e-invoicing lists if missing) in your SharePoint site, or adds missing columns. Never deletes data.</span>${I.LIST_NAMES.map(n => `<div class="ei-kv"><span class="ei-mono">${n}</span><b>${I.LISTS[n].length} columns</b></div>`).join('')}${H.btn(v.busy ? '⏳ ' + esc(v.busy) : '🛠 Set up lists', 'setup')}`)
          + H.card('2 · Stock accounts in the chart', missAcc.length ? `<span class="mb-hint">Adds ${missAcc.length} account(s): ${missAcc.map(a => a.code + ' ' + esc(a.name)).join(', ')}.</span>${H.btn(v.acc ? '⏳ ' + esc(v.acc) : '📥 Add stock accounts', 'addAcc')}` : '<span class="mb-hint">✓ All stock accounts are in the chart.</span>')
          + H.card('3 · Warehouses', `<span class="mb-hint">Creates the default, finished goods and raw & packaging warehouses from General if they do not exist.</span>${H.btn('🏬 Create default warehouses', 'mkWh', 's')}`)
          + (v.out ? H.card('Result', v.out.map(x => `<div class="ei-kv"><b>${esc(x)}</b></div>`).join('')) : '');
      if (tab === 'map') return head + H.card('Accounts stock postings use', Object.entries(I.MAP_KEYS).map(([k, [label]]) => H.f(label, H.sel('m_' + k, acctOpts(accts)))).join('')) + H.bar(H.btn('💾 Save', 'save'));
      if (tab === 'wh') { const W = d.whs || [];
        return head + (v.wf ? H.card(v.wid ? 'Edit warehouse' : 'New warehouse', `<div class="fin-row">${H.f('Code *', H.inp('wcode'))}${H.f('Name *', H.inp('wname'))}</div>${H.f('Type', H.sel('wkind', [['store', 'Store'], ['production', 'Production'], ['van', 'Van / vehicle'], ['shop', 'Shop / outlet'], ['transit', 'In transit']], { ph: false }))}${H.f('Status', H.seg('wact', [['1', 'Active'], ['0', 'Inactive']], '1'))}<div class="mb-row">${H.btn('Cancel', 'wcancel', 's')}${H.btn('💾 Save', 'wsave')}</div>`) : '')
          + H.card('', W.map(w => H.li({ x: 'wedit', i: w.id, ic: w.kind === 'van' ? '🚚' : w.kind === 'shop' ? '🏪' : w.kind === 'production' ? '🏭' : '🏬', c: '#0369a1', t: w.code + ' · ' + w.name, s: w.kind + (w.active ? '' : ' · inactive'), v: fq(stocked(d).reduce((s2, i) => s2 + qtyAt(Object.assign({}, d), i.code, w.code), 0)) })).join('') || H.empty('No warehouses yet.')) + H.bar(H.btn('＋ New warehouse', 'wadd')); }
      if (tab === 'orbit') { const mk = s.mark;
        return head + H.card('How the link works', `<span class="mb-hint">ORBIT keeps quantities in its own lists. The ERP adds cost: 1) link the items, 2) enter standard costs (Items), 3) take the opening stock from ORBIT's balances, 4) sync ORBIT's later movements whenever you like. ORBIT's lists are only read${s.mirror ? ' — and, with write-back on, ERP postings are added to them with reference "ERP-…"' : ''}.</span>`)
          + H.card('1 · Items', `<span class="mb-hint">Finished goods from ${I.ORBIT.FG_ITEMS}, raw & packaging from ${I.ORBIT.RM_ITEMS}. Items already in the ERP are kept.</span>${H.btn(v.lk ? '⏳ ' + esc(v.lk) : '🔗 Link ORBIT items', 'link', 's')}`)
          + H.card('2 · Opening stock', mk ? `<span class="mb-hint">✓ Taken on ${esc(dmy(mk.at))}. Movements after it come in by Sync.</span>` : `<span class="mb-hint">Quantities from ORBIT now, valued at each item's standard cost, against Opening balance equity.</span>${H.f('Opening date', H.date('odate'))}${H.btn(v.op ? '⏳ ' + esc(v.op) : '🏁 Take opening stock from ORBIT', 'opening', 's')}`)
          + H.card('3 · Sync movements', `<span class="mb-hint">${I.ORBIT.FG_MOVES} → ${esc(s.fgWh)} · ${I.ORBIT.RM_MOVES} → ${esc(s.rmWh)} · one stock document per day.</span>${v.pend != null ? `<div class="ei-kv"><span>Waiting</span><b>${v.pend} movement(s)${v.unk ? ' · ' + v.unk + ' of items not linked' : ''}</b></div>` : ''}<div class="mx-acts">${H.sbtn('🔎 Check', 'check')}${H.sbtn(v.sy ? '⏳ ' + esc(v.sy) : '⇢ Sync now', 'sync', '', 'p')}</div>`)
          + H.card('Log', (s.log || []).slice().reverse().map(h => `<div class="ei-kv"><span>${esc(dmy(h.at))}</span><b>${esc(h.text)}</b></div>`).join('') || H.empty('Nothing yet.'));
      }
      return head + needSetup(d) + H.card('Numbering', `<div class="fin-row">${H.f('Receipt', H.inp('rcv'))}${H.f('Issue', H.inp('iss'))}${H.f('Transfer', H.inp('trf'))}${H.f('Count', H.inp('cnt'))}${H.f('Production order', H.inp('mo'))}</div>`)
        + H.card('Warehouses', `<div class="fin-row">${H.f('Default / sales', H.inp('wh'))}${H.f('Finished goods', H.inp('fgWh'))}${H.f('Raw & packaging', H.inp('rmWh'))}</div><span class="mb-hint">Sales e-invoices take stock from the default warehouse.</span>`)
        + H.card('Rules', H.f('Negative stock', H.seg('neg', [['0', 'Not allowed'], ['1', 'Allowed']], '0')) + H.f('Write ERP stock postings back to ORBIT\'s lists', H.seg('mir', [['0', 'Off'], ['1', 'On']], '0'), 'For items linked from ORBIT: adds the movement to Main_Inventory_Movements_tbl / RMPM_Movements_tbl and updates the balance, so ORBIT\'s warehouse pages show it.'))
        + H.bar(H.btn('💾 Save', 'save'));
    },
    act: {
      async save(t, v, d) { const map = {}; Object.keys(I.MAP_KEYS).forEach(k => { if (v['m_' + k]) map[k] = v['m_' + k]; });
        try { await IS.saveSettings({ RcvPrefix: str(v.rcv) || 'GRN', IssPrefix: str(v.iss) || 'ISS', TrfPrefix: str(v.trf) || 'TRF', CntPrefix: str(v.cnt) || 'CNT', MoPrefix: str(v.mo) || 'MO', DefaultWh: str(v.wh) || 'MAIN', FgWh: str(v.fgWh) || str(v.wh) || 'MAIN', RmWh: str(v.rmWh) || str(v.wh) || 'MAIN', AllowNegative: v.neg === '1' ? '1' : '0', Mirror: v.mir === '1' ? '1' : '0', AccMap: JSON.stringify(map) }); toast('✅ Inventory settings saved', 'success'); v.__f = 0; refresh('x_invset'); } catch (e) { toast('Not saved: ' + e.message, 'error'); } },
      async setup(t, v) { if (v.busy) return; v.busy = 'Starting…'; v.out = null; render();
        try { v.out = await FU.setupLists(Object.assign({}, E.LISTS, F.LISTS, I.LISTS), n => { v.busy = n + '…'; render(); }); drop(...I.LIST_NAMES, ...F.LIST_NAMES, ...Object.keys(E.LISTS)); toast('✅ Inventory lists are ready', 'success'); } catch (e) { v.out = ['✘ ' + e.message]; toast(e.message, 'error'); }
        v.busy = ''; refresh('x_invset'); },
      async addAcc(t, v, d) { if (v.acc) return; try { for (const a of I.COA_ADD.filter(a => !(d.accts || []).some(x => x.code === a.code))) { v.acc = a.code; render(); await S.add('Fin_Accounts', F.acctToFields(a)); } S.drop('Fin_Accounts'); toast('✅ Stock accounts added', 'success'); } catch (e) { toast(e.message, 'error'); } v.acc = ''; refresh('x_invset'); },
      async mkWh(t, v) { try { const n = await IS.ensureWarehouses(); toast(n ? '✅ ' + n + ' warehouse(s) created' : 'The warehouses are already there', 'success'); refresh('x_invset'); } catch (e) { toast(e.message, 'error'); } },
      wadd(t, v) { Object.assign(v, { wf: 1, wid: null, wcode: '', wname: '', wkind: 'store', wact: '1' }); render(); }, wcancel(t, v) { v.wf = 0; render(); },
      wedit(t, v, d) { const w = (d.whs || []).find(x => String(x.id) === t.dataset.i); Object.assign(v, { wf: 1, wid: w.id, wcode: w.code, wname: w.name, wkind: w.kind, wact: w.active ? '1' : '0' }); render(); },
      async wsave(t, v, d) { const c = str(v.wcode); if (!c || !str(v.wname)) return toast('Code and name are required', 'warn'); if ((d.whs || []).some(w => w.code === c && w.id !== v.wid)) return toast('Code ' + c + ' is already used', 'warn');
        const old = (d.whs || []).find(w => w.id === v.wid); if (old && old.code !== c && stocked(d).some(i => qtyAt(d, i.code, old.code))) return toast('This warehouse has stock — its code cannot change', 'warn');
        const f = { Title: str(v.wname), Code: c, WhKind: v.wkind || 'store', Active: v.wact === '0' ? '0' : '1' }; try { if (v.wid) await S.upd('Inv_Warehouses', v.wid, f); else await S.add('Inv_Warehouses', f); v.wf = 0; toast('✅ Warehouse saved', 'success'); refresh('x_invset'); } catch (e) { toast(e.message, 'error'); } },
      async link(t, v) { if (v.lk) return; v.lk = 'Reading…'; render(); try { const r = await IS.linkItems(n => { v.lk = n; render(); }); toast('🔗 ' + r.added + ' item(s) added (ORBIT has ' + r.fg + ' finished goods, ' + r.rm + ' raw & packaging)' + (r.missing.length ? ' · not found: ' + r.missing.join(', ') : ''), r.missing.length ? 'warn' : 'success'); } catch (e) { toast(e.message, 'error'); } v.lk = ''; refresh('x_invset'); },
      async opening(t, v, d) { if (v.op) return; if (!confirm('Take the opening stock from ORBIT now?\n\nQuantities are valued at each item\'s standard cost. This is done once.')) return; v.op = 'Reading…'; render();
        try { const r = await IS.openingFromOrbit(d.ctx, v.odate || today()); toast('🏁 Opening stock: ' + r.lines + ' item(s)' + (r.doc ? ' · ' + r.doc.no : '') + (r.skip.noCost ? ' · ' + r.skip.noCost + ' without standard cost (value 0)' : '') + (r.skip.unknown ? ' · ' + r.skip.unknown + ' not linked' : '') + (r.skip.negative ? ' · ' + r.skip.negative + ' negative skipped' : ''), r.skip.noCost || r.skip.unknown ? 'warn' : 'success'); } catch (e) { toast(e.message, 'error'); } v.op = ''; refresh('x_invset'); },
      async check(t, v) { try { const p = await IS.pendingOrbit(); if (p.noMark) return toast('Take the opening stock first', 'warn'); v.pend = p.lines.length; v.unk = p.skipped.unknown; render(); } catch (e) { toast(e.message, 'error'); } },
      async sync(t, v, d) { if (v.sy) return; v.sy = 'Reading…'; render(); try { const r = await IS.syncOrbit(d.ctx, n => { v.sy = n; render(); }); v.pend = 0; toast(r.count ? '🔗 ' + r.count + ' movement(s) → ' + r.docs.join(', ') : 'Nothing new in ORBIT', 'success'); } catch (e) { toast(e.message, 'error'); } v.sy = ''; refresh('x_invset'); } } });

  window.INV_UI = { billLine, billReceipt, salesCost, bundle, version: '1' };
})();
