/* ============================================================
   ORBIT INVENTORY & MANUFACTURING CORE — rules only (no screens, no storage)
   · items (trading goods, raw & packaging, finished goods), warehouses, stock documents and the costed stock ledger
   · valuation: moving weighted average per item (company-wide); an issue takes the average at that moment
   · stock documents → ledger: receipt, issue, transfer, stock count, sale (cost of goods sold), sales return,
     production (materials issued to work in progress, output to finished goods), ORBIT stock sync, opening stock
   · bills of materials with cost roll-up, production order requirements
   · reports: stock on hand, valuation, stock card, movement summary, reorder list, stock vs ledger reconciliation
   · ORBIT link: reads the item and movement lists ORBIT already has (Inventory_Item_List, Main_Inventory_Movements_tbl,
     RMPM_Items_tbl, RMPM_Movements_tbl) and maps them to items and stock movements
   Works in the browser (window.INV) and in Node (require).
   ============================================================ */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.INV = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const r2 = n => { const v = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100; return n < 0 ? -v : v; };
  const r4 = n => { const v = Math.round((Math.abs(n) + Number.EPSILON) * 10000) / 10000; return n < 0 ? -v : v; };
  const r3 = n => { const v = Math.round((Math.abs(n) + Number.EPSILON) * 1000) / 1000; return n < 0 ? -v : v; };
  const num = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
  const J = (s, d) => { try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : d; } catch (e) { return d; } };
  const day = v => String(v || '').slice(0, 10);

  /* ---------- kinds, document types ---------- */
  const KINDS = { goods: 'Trading goods', raw: 'Raw & packaging', finished: 'Finished goods', service: 'Service (no stock)' };
  const STOCKED = k => k !== 'service';
  const DOC_TYPES = { receipt: 'Stock receipt', issue: 'Stock issue', transfer: 'Transfer', count: 'Stock count', sale: 'Cost of sales', sale_return: 'Sales return', prod_issue: 'Materials to production', prod_output: 'Production output', orbit: 'ORBIT stock sync', opening: 'Opening stock' };

  /* ---------- accounts this module adds to the chart (if missing) and the posting map ---------- */
  const A = (code, name, type, parent, sub) => ({ code, name, type, parent, sub, group: false });
  const COA_ADD = [
    A('1151', 'Raw materials & packaging', 'asset', '1100', 'inv_raw'), A('1152', 'Work in progress', 'asset', '1100', 'inv_wip'), A('1153', 'Finished goods', 'asset', '1100', 'inv_fg'),
    A('2160', 'Goods received not invoiced', 'liability', '2100', 'grni'), A('3900', 'Opening balance equity', 'equity', '3000', 'opening'),
    A('5300', 'Stock adjustments & write-offs', 'expense', '5000', 'inv_adjust'), A('5400', 'Production cost clearing', 'expense', '5000', 'prod_clear'),
  ];
  const MAP_KEYS = {
    inv_goods: ['Stock — trading goods', 'inventory'], inv_raw: ['Stock — raw & packaging', 'inv_raw'], inv_fg: ['Stock — finished goods', 'inv_fg'], inv_wip: ['Work in progress', 'inv_wip'],
    cogs: ['Cost of goods sold', 'cogs'], grni: ['Goods received not invoiced', 'grni'], inv_adjust: ['Stock adjustments & write-offs', 'inv_adjust'],
    prod_clear: ['Production cost clearing (labour & overhead absorbed)', 'prod_clear'], opening: ['Opening stock against', 'opening'],
    orbit_in_fg: ['ORBIT: finished goods received', 'prod_clear'], orbit_out_fg: ['ORBIT: finished goods released', 'cogs'],
    orbit_in_raw: ['ORBIT: raw & packaging received', 'grni'], orbit_out_raw: ['ORBIT: raw & packaging used', 'prod_clear'],
  };
  function defaultMap(accounts) { const m = {}, list = (accounts && accounts.length ? accounts : []).concat(COA_ADD); Object.entries(MAP_KEYS).forEach(([k, [, sub]]) => { const a = list.find(x => x.sub === sub && !x.group); if (a) m[k] = a.code; }); return m; }
  const invKey = kind => kind === 'raw' ? 'inv_raw' : kind === 'finished' ? 'inv_fg' : 'inv_goods';
  const invAcc = (it, map) => (it && it.invAccount) || map[invKey(it && it.kind)];
  const cogsAcc = (it, map) => (it && it.cogsAccount) || map.cogs;

  /* ---------- lists (SharePoint now; the ERP server creates the same tables) ---------- */
  const T = n => ({ name: n, text: {} }), M = n => ({ name: n, text: { allowMultipleLines: true, textType: 'plain' } }), N = n => ({ name: n, number: {} });
  const LISTS = {
    Inv_Settings: ['RcvPrefix', 'IssPrefix', 'TrfPrefix', 'CntPrefix', 'MoPrefix', 'DefaultWh', 'FgWh', 'RmWh', 'AllowNegative', 'Mirror', 'SyncMark'].map(T).concat([M('AccMap'), M('SyncLog')]),
    Inv_Items: ['Code', 'NameAr', 'Kind', 'Category', 'UoM', 'VatCat', 'Barcode', 'Source', 'SrcId', 'Active', 'InvAccount', 'CogsAccount'].map(T).concat(['StdCost', 'SalesPrice', 'Reorder'].map(N)),
    Inv_Warehouses: ['Code', 'WhKind', 'Active', 'Notes'].map(T),
    Inv_Docs: ['DocNo', 'DocType', 'DocDate', 'Ref', 'Party', 'Memo', 'Status', 'PostId', 'JournalNo', 'SrcRef', 'Account', 'PostedBy', 'PostedAt'].map(T).concat([N('Value'), M('LinesJson'), M('History')]),
    Inv_Moves: ['DocId', 'PostId', 'MoveDate', 'DocNo', 'DocType', 'ItemCode', 'Wh', 'Ref', 'SrcList', 'SrcId'].map(T).concat(['Qty', 'UnitCost', 'Value'].map(N)),
    Inv_BOM: ['ProductCode', 'Version', 'Active', 'Notes'].map(T).concat(['OutputQty', 'LabourCost', 'OverheadCost'].map(N)).concat([M('Components')]),
    Inv_ProdOrders: ['OrderNo', 'ProductCode', 'BomId', 'Status', 'PlanDate', 'DoneDate', 'OutWh', 'MatWh', 'IssueDoc', 'OutputDoc', 'Notes'].map(T).concat(['PlanQty', 'DoneQty', 'IssueValue', 'OutputValue', 'Conversion'].map(N)).concat([M('Components'), M('History')]),
  };
  const LIST_NAMES = Object.keys(LISTS);

  /* ---------- row mapping (ORBIT keys are lower-case, no spaces or underscores) ---------- */
  const itemFromRow = r => ({ id: Number(r.id), code: String(r.code || ''), name: r.title || '', name_ar: r.namear || '', kind: KINDS[r.kind] ? r.kind : 'goods', category: r.category || '', uom: r.uom || 'pcs', vat: r.vatcat || 'S', barcode: r.barcode || '', source: r.source || 'erp', srcId: String(r.srcid || ''), active: String(r.active) !== '0', invAccount: String(r.invaccount || ''), cogsAccount: String(r.cogsaccount || ''), std: num(r.stdcost), price: num(r.salesprice), reorder: num(r.reorder) });
  const itemToFields = i => ({ Title: i.name, Code: String(i.code), NameAr: i.name_ar || '', Kind: i.kind || 'goods', Category: i.category || '', UoM: i.uom || 'pcs', VatCat: i.vat || 'S', Barcode: i.barcode || '', Source: i.source || 'erp', SrcId: String(i.srcId || ''), Active: i.active === false ? '0' : '1', InvAccount: i.invAccount || '', CogsAccount: i.cogsAccount || '', StdCost: num(i.std), SalesPrice: num(i.price), Reorder: num(i.reorder) });
  const whFromRow = r => ({ id: Number(r.id), code: String(r.code || ''), name: r.title || String(r.code || ''), kind: r.whkind || 'store', active: String(r.active) !== '0', notes: r.notes || '' });
  const settingsFromRow = r => { r = r || {}; return { id: r.id ? Number(r.id) : null, rcv: r.rcvprefix || 'GRN', iss: r.issprefix || 'ISS', trf: r.trfprefix || 'TRF', cnt: r.cntprefix || 'CNT', mo: r.moprefix || 'MO', wh: r.defaultwh || 'MAIN', fgWh: r.fgwh || r.defaultwh || 'MAIN', rmWh: r.rmwh || r.defaultwh || 'MAIN', allowNeg: String(r.allownegative) === '1', mirror: String(r.mirror) === '1', mark: J(r.syncmark, null), map: J(r.accmap, {}), log: J(r.synclog, []) }; };
  const docFromRow = r => ({ id: Number(r.id), no: r.docno || '', type: r.doctype || 'receipt', date: day(r.docdate), ref: r.ref || '', party: r.party || '', memo: r.memo || '', status: r.status || 'draft', postId: r.postid || '', journal: r.journalno || '', srcRef: r.srcref || '', account: String(r.account || ''), value: num(r.value), lines: J(r.linesjson, []), history: J(r.history, []), postedBy: r.postedby || '', postedAt: r.postedat || '' });
  const moveFromRow = r => ({ id: Number(r.id), docId: String(r.docid || ''), postId: r.postid || '', date: day(r.movedate), no: r.docno || '', type: r.doctype || '', code: String(r.itemcode || ''), wh: r.wh || '', qty: num(r.qty), unit: num(r.unitcost), value: num(r.value), ref: r.ref || '', srcList: r.srclist || '', srcId: String(r.srcid || '') });
  const moveToFields = (m, doc, postId) => ({ Title: doc.no, DocId: String(doc.id), PostId: postId, MoveDate: doc.date, DocNo: doc.no, DocType: doc.type, ItemCode: m.code, Wh: m.wh, Qty: r3(m.qty), UnitCost: r4(m.unit), Value: r2(m.value), Ref: m.ref || doc.ref || '', SrcList: m.srcList || '', SrcId: String(m.srcId || '') });
  const bomFromRow = r => ({ id: Number(r.id), product: String(r.productcode || ''), version: r.version || '1', name: r.title || '', active: String(r.active) !== '0', notes: r.notes || '', output: num(r.outputqty) || 1, labour: num(r.labourcost), overhead: num(r.overheadcost), comps: J(r.components, []) });
  const bomToFields = b => ({ Title: b.name || ('BOM ' + b.product), ProductCode: b.product, Version: String(b.version || '1'), Active: b.active === false ? '0' : '1', Notes: b.notes || '', OutputQty: num(b.output) || 1, LabourCost: num(b.labour), OverheadCost: num(b.overhead), Components: JSON.stringify((b.comps || []).filter(c => c.code && num(c.qty)).map(c => ({ code: c.code, qty: num(c.qty), scrap: num(c.scrap) }))) });
  const moFromRow = r => ({ id: Number(r.id), no: r.orderno || '', product: String(r.productcode || ''), bom: String(r.bomid || ''), status: r.status || 'planned', planDate: day(r.plandate), doneDate: day(r.donedate), outWh: r.outwh || '', matWh: r.matwh || '', issueDoc: r.issuedoc || '', outputDoc: r.outputdoc || '', notes: r.notes || '', planQty: num(r.planqty), doneQty: num(r.doneqty), issueValue: num(r.issuevalue), outputValue: num(r.outputvalue), conversion: num(r.conversion), comps: J(r.components, []), history: J(r.history, []) });

  /* ---------- the stock position (replays the posted moves) ---------- */
  function position(moves, asOf) {
    const P = new Map(), list = (moves || []).filter(m => !asOf || m.date <= asOf).slice().sort((a, b) => (a.date + String(a.id).padStart(10, '0')).localeCompare(b.date + String(b.id).padStart(10, '0')));
    list.forEach(m => apply(P, m.code, m.wh, m.qty, m.value, m.qty > 0 ? m.unit : 0));
    return P;
  }
  function apply(P, code, wh, qty, value, inUnit) {
    const p = P.get(code) || { qty: 0, value: 0, wh: {}, last: 0 }; p.qty = r3(p.qty + qty); p.value = r2(p.value + value); p.wh[wh] = r3((p.wh[wh] || 0) + qty);
    if (Math.abs(p.qty) < 0.0005) { p.qty = 0; } if (inUnit) p.last = inUnit; P.set(code, p); return p;
  }
  const avgOf = (p, it) => p && p.qty > 0 && p.value > 0 ? p.value / p.qty : (p && p.last) || (it && it.std) || 0;
  /* cost of taking qty out: the moving average; the last unit out takes the whole remaining value (no rounding residue) */
  function costOut(P, code, qty, it) {
    const p = P.get(code); if (p && p.qty > 0 && Math.abs(qty - p.qty) < 0.0005) return { unit: r4(p.value / p.qty), value: r2(p.value) };
    const u = avgOf(p, it); return { unit: r4(u), value: r2(u * qty) };
  }
  const clone = P => { const Q = new Map(); P.forEach((p, k) => Q.set(k, { qty: p.qty, value: p.value, wh: Object.assign({}, p.wh), last: p.last })); return Q; };

  /* ---------- stock document → moves (with checks) ----------
     doc = { type, date, lines: [...] }  lines by type:
       receipt / opening       { code, wh, qty, unit_cost }
       issue / sale / prod_issue { code, wh, qty }
       sale_return             { code, wh, qty }                (back in at the current average)
       transfer                { code, wh, to, qty }
       count                   { code, wh, counted }            (system quantity comes from the position)
       prod_output             { code, wh, qty, value }         (value = materials + conversion)
       orbit                   { code, wh, qty (±), srcList, srcId, ref }   in: standard cost (else average) · out: average */
  function buildMoves(doc, items, P0, set) {
    const I = new Map((items || []).map(i => [i.code, i])), P = clone(P0 || new Map()), E = [], out = [], allowNeg = set && set.allowNeg;
    const push = (code, wh, qty, value, unit, extra) => { apply(P, code, wh, qty, value, qty > 0 ? unit : 0); out.push(Object.assign({ code, wh, qty: r3(qty), value: r2(value), unit: r4(unit) }, extra || {})); };
    const takeOut = (l, it, i, extra) => { const q = num(l.qty), c = costOut(P, l.code, q, it), have = (P.get(l.code) || { wh: {} }).wh[l.wh] || 0;
      if (!allowNeg && q > have + 0.0005) E.push('Line ' + (i + 1) + ': only ' + have + ' ' + (it.uom || '') + ' of ' + l.code + ' in ' + l.wh + ' (needs ' + q + ')');
      push(l.code, l.wh, -q, -c.value, c.unit, extra); return c; };
    if (!doc.date || !/^\d{4}-\d\d-\d\d$/.test(doc.date)) E.push('Date is required');
    (doc.lines || []).forEach((l, i) => {
      const it = I.get(l.code), n = 'Line ' + (i + 1) + ': ';
      if (!it) { E.push(n + 'item ' + (l.code || '(none)') + ' is not in the item list'); return; }
      if (!STOCKED(it.kind)) { E.push(n + it.code + ' is a service — it has no stock'); return; }
      if (!l.wh) { E.push(n + 'choose the warehouse'); return; }
      const q = num(l.qty);
      switch (doc.type) {
        case 'receipt': case 'opening': { if (!(q > 0)) { E.push(n + 'quantity must be more than zero'); break; } const u = num(l.unit_cost); if (u < 0) E.push(n + 'unit cost cannot be negative'); push(l.code, l.wh, q, r2(q * u), u); break; }
        case 'issue': case 'sale': case 'prod_issue': { if (!(q > 0)) { E.push(n + 'quantity must be more than zero'); break; } takeOut(l, it, i); break; }
        case 'sale_return': { if (!(q > 0)) { E.push(n + 'quantity must be more than zero'); break; } const u = avgOf(P.get(l.code), it); push(l.code, l.wh, q, r2(q * u), u); break; }
        case 'transfer': { if (!(q > 0)) { E.push(n + 'quantity must be more than zero'); break; } if (!l.to || l.to === l.wh) { E.push(n + 'choose a different destination warehouse'); break; } const c = takeOut(l, it, i); push(l.code, l.to, q, c.value, c.unit); break; }
        case 'count': { if (l.counted === '' || l.counted == null || num(l.counted) < 0) { E.push(n + 'enter the counted quantity'); break; } const have = (P.get(l.code) || { wh: {} }).wh[l.wh] || 0, diff = r3(num(l.counted) - have);
          if (diff > 0) { const u = avgOf(P.get(l.code), it); push(l.code, l.wh, diff, r2(diff * u), u, { system: have }); } else if (diff < 0) { const c = costOut(P, l.code, -diff, it); push(l.code, l.wh, diff, -c.value, c.unit, { system: have }); } break; }
        case 'prod_output': { if (!(q > 0)) { E.push(n + 'quantity must be more than zero'); break; } const v = r2(num(l.value)); push(l.code, l.wh, q, v, q ? v / q : 0); break; }
        case 'orbit': { if (!q) break; const ex = { srcList: l.srcList, srcId: l.srcId, ref: l.ref }; if (q > 0) { const u = it.std || avgOf(P.get(l.code), it); push(l.code, l.wh, q, r2(q * u), u, ex); } else { const c = costOut(P, l.code, -q, it); push(l.code, l.wh, q, -c.value, c.unit, ex); } break; }
        default: E.push('Unknown document type ' + doc.type);
      }
    });
    if (!out.length && !E.length && doc.type !== 'count') E.push('There is nothing to post');
    return { ok: !E.length, errors: E, moves: out, position: P, value: r2(out.reduce((s, m) => s + (m.qty > 0 ? m.value : 0), 0) || -out.reduce((s, m) => s + (m.qty < 0 ? m.value : 0), 0)) };   /* goods in, or goods out when nothing came in */
  }

  /* ---------- moves → journal entry (null when no ledger effect, e.g. a transfer) ---------- */
  function journalFor(doc, moves, items, map, extra) {
    if (doc.viaBill) return null;   /* stock bought on a purchase bill: the bill already debited the stock account */
    const I = new Map((items || []).map(i => [i.code, i])), acc = new Map(), x = extra || {};
    const add = (a, v, d) => { if (!a || !v) return; const k = a + '|' + (d || ''); acc.set(k, r2((acc.get(k) || 0) + v)); };   /* + debit, − credit */
    const label = (DOC_TYPES[doc.type] || 'Stock') + ' ' + (doc.no || '') + (doc.party ? ' — ' + doc.party : doc.ref ? ' — ' + doc.ref : '');
    moves.forEach(m => {
      const it = I.get(m.code) || {}, inv = invAcc(it, map), raw = it.kind === 'raw';
      switch (doc.type) {
        case 'receipt': add(inv, m.value); add(doc.account || map.grni, -m.value); break;
        case 'opening': add(inv, m.value); add(doc.account || map.opening, -m.value); break;
        case 'issue': add(doc.account || map.inv_adjust, -m.value); add(inv, m.value); break;
        case 'count': add(inv, m.value); add(doc.account || map.inv_adjust, -m.value); break;
        case 'sale': case 'sale_return': add(cogsAcc(it, map), -m.value); add(inv, m.value); break;
        case 'prod_issue': add(map.inv_wip, -m.value); add(inv, m.value); break;
        case 'prod_output': add(inv, m.value); break;
        case 'orbit': add(inv, m.value); add(m.qty > 0 ? map[raw ? 'orbit_in_raw' : 'orbit_in_fg'] : map[raw ? 'orbit_out_raw' : 'orbit_out_fg'], -m.value); break;
        default: break;   /* transfer: same account in and out */
      }
    });
    if (doc.type === 'prod_output') { add(map.inv_wip, -r2(num(x.wip))); add(map.prod_clear, -r2(num(x.conversion))); }
    const lines = [];
    [...acc.entries()].forEach(([k, v]) => { const a = k.split('|')[0]; if (Math.abs(v) >= 0.005) lines.push({ account: a, debit: v > 0 ? r2(v) : 0, credit: v < 0 ? r2(-v) : 0, description: label, docRef: doc.no || '' }); });
    const d = r2(lines.reduce((s, l) => s + l.debit, 0)), c = r2(lines.reduce((s, l) => s + l.credit, 0)), diff = r2(d - c);
    if (diff && Math.abs(diff) <= 0.05 && map.rounding) lines.push({ account: map.rounding, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, description: 'Rounding — ' + label, docRef: doc.no || '' });
    if (!lines.length) return null;
    return { date: doc.date, memo: label, source: 'stock', ref: 'INV:' + (doc.key || doc.id || doc.no), lines };
  }

  /* ---------- bills of materials ---------- */
  function bomCost(bom, items, P) {
    const I = new Map((items || []).map(i => [i.code, i])), out = Math.max(num(bom.output), 0.000001);
    const rows = (bom.comps || []).map(c => { const it = I.get(c.code) || {}, per = num(c.qty) * (1 + num(c.scrap) / 100) / out, unit = avgOf(P && P.get(c.code), it); return { code: c.code, name: it.name || '(unknown item)', uom: it.uom || '', qty: num(c.qty), scrap: num(c.scrap), per: r4(per), unit: r4(unit), cost: r4(per * unit), missing: !I.has(c.code) }; });
    const material = r4(rows.reduce((s, r) => s + r.cost, 0)), conversion = r4((num(bom.labour) + num(bom.overhead)) / out);
    return { rows, material, conversion, unit: r4(material + conversion) };
  }
  function requirements(bom, qty) { const out = Math.max(num(bom.output), 0.000001); return (bom.comps || []).map(c => ({ code: c.code, qty: r3(num(c.qty) * (1 + num(c.scrap) / 100) * num(qty) / out) })).filter(c => c.qty > 0); }
  const conversionFor = (bom, qty) => r2((num(bom.labour) + num(bom.overhead)) * num(qty) / Math.max(num(bom.output), 0.000001));
  function checkBom(bom, items, boms) {
    const E = [], I = new Map((items || []).map(i => [i.code, i])), p = I.get(bom.product);
    if (!p) E.push('Choose the product'); else if (p.kind !== 'finished') E.push(p.code + ' is not a finished good — change its kind in Items first');
    if (!(num(bom.output) > 0)) E.push('Output quantity must be more than zero');
    const comps = (bom.comps || []).filter(c => c.code || num(c.qty)); if (!comps.length) E.push('Add at least one component');
    comps.forEach((c, i) => { const it = I.get(c.code); if (!it) E.push('Component ' + (i + 1) + ': choose an item'); else if (!STOCKED(it.kind)) E.push('Component ' + (i + 1) + ': ' + it.code + ' is a service'); if (!(num(c.qty) > 0)) E.push('Component ' + (i + 1) + ': quantity must be more than zero'); if (c.code === bom.product) E.push('A product cannot be its own component'); });
    if ((boms || []).some(b => b.id !== bom.id && b.product === bom.product && String(b.version) === String(bom.version))) E.push('Version ' + bom.version + ' of this product already exists');
    return E;
  }

  /* ---------- reports ---------- */
  function onHand(P, items, wh) {
    return (items || []).filter(i => STOCKED(i.kind)).map(i => { const p = P.get(i.code) || { qty: 0, value: 0, wh: {} }, qty = wh ? (p.wh[wh] || 0) : p.qty, avg = avgOf(p, i);
      return { code: i.code, name: i.name, kind: i.kind, uom: i.uom, qty: r3(qty), avg: r4(avg), value: wh ? r2(qty * avg) : r2(p.value), reorder: i.reorder, low: i.reorder > 0 && qty <= i.reorder, wh: p.wh }; });
  }
  function stockCard(moves, code, from, to, wh) {
    const own = (moves || []).filter(m => m.code === code && (!wh || m.wh === wh)).sort((a, b) => (a.date + String(a.id).padStart(10, '0')).localeCompare(b.date + String(b.id).padStart(10, '0')));
    let q = 0, v = 0; own.filter(m => from && m.date < from).forEach(m => { q += m.qty; v += m.value; }); const open = { qty: r3(q), value: r2(v) };
    const rows = own.filter(m => (!from || m.date >= from) && (!to || m.date <= to)).map(m => { q = r3(q + m.qty); v = r2(v + m.value); return Object.assign({}, m, { balQty: q, balValue: v }); });
    return { open, rows, close: { qty: r3(q), value: r2(v) } };
  }
  function movementSummary(moves, items, from, to) {
    const I = new Map((items || []).map(i => [i.code, i])), S = new Map();
    (moves || []).forEach(m => { if (to && m.date > to) return; const s = S.get(m.code) || { code: m.code, name: (I.get(m.code) || {}).name || m.code, oq: 0, ov: 0, iq: 0, iv: 0, xq: 0, xv: 0 };
      if (from && m.date < from) { s.oq += m.qty; s.ov += m.value; } else if (m.qty > 0) { s.iq += m.qty; s.iv += m.value; } else { s.xq -= m.qty; s.xv -= m.value; } S.set(m.code, s); });
    return [...S.values()].map(s => ({ code: s.code, name: s.name, openQty: r3(s.oq), openValue: r2(s.ov), inQty: r3(s.iq), inValue: r2(s.iv), outQty: r3(s.xq), outValue: r2(s.xv), closeQty: r3(s.oq + s.iq - s.xq), closeValue: r2(s.ov + s.iv - s.xv) })).filter(s => s.openQty || s.inQty || s.outQty).sort((a, b) => a.code.localeCompare(b.code));
  }
  /* stock value per inventory account vs the ledger balance of that account */
  function reconcile(P, items, glLines, map, asOf) {
    const by = new Map(); (items || []).filter(i => STOCKED(i.kind)).forEach(i => { const a = invAcc(i, map), p = P.get(i.code); if (!a) return; by.set(a, r2((by.get(a) || 0) + (p ? p.value : 0))); });
    [map.inv_goods, map.inv_raw, map.inv_fg].forEach(a => { if (a && !by.has(a)) by.set(a, 0); });
    const rows = [...by.entries()].map(([a, stock]) => { const gl = r2((glLines || []).filter(l => l.account === a && (!asOf || l.date <= asOf)).reduce((s, l) => s + num(l.debit) - num(l.credit), 0)); return { account: a, stock, gl, diff: r2(gl - stock) }; });
    const wipGl = map.inv_wip ? r2((glLines || []).filter(l => l.account === map.inv_wip && (!asOf || l.date <= asOf)).reduce((s, l) => s + num(l.debit) - num(l.credit), 0)) : 0;
    return { rows, wip: wipGl, ok: rows.every(r => Math.abs(r.diff) < 0.01) };
  }

  /* ---------- sales: e-invoice lines → stock items ---------- */
  function salesLines(doc, items) {
    const I = (items || []).filter(i => STOCKED(i.kind)), byCode = new Map(I.map(i => [i.code.toLowerCase(), i])), byName = new Map(I.map(i => [String(i.name).trim().toLowerCase(), i])), out = new Map();
    (doc.lines || []).forEach(l => { if (l.kind === 'S') return; const it = (l.item_code && byCode.get(String(l.item_code).toLowerCase())) || byName.get(String(l.description || '').trim().toLowerCase()); if (!it) return; out.set(it.code, r3((out.get(it.code) || 0) + num(l.quantity))); });
    return [...out.entries()].map(([code, qty]) => ({ code, qty })).filter(x => x.qty > 0);
  }

  /* ---------- ORBIT link: existing ORBIT lists → items and movements ---------- */
  const s = v => String(v == null ? '' : v).trim();
  const ORBIT = {
    FG_ITEMS: 'Inventory_Item_List', FG_MOVES: 'Main_Inventory_Movements_tbl', RM_ITEMS: 'RMPM_Items_tbl', RM_MOVES: 'RMPM_Movements_tbl',
    fgItem: r => ({ code: s(r.itemcode || r.title), name: s(r.itemdtls || r.itemdesc || r.itemname || r.title), uom: s(r.basicuom || r.uom) || 'pcs', category: s(r.itemctgry || r.category), kind: 'finished', source: 'orbit-fg', srcId: String(r.id) }),
    rmItem: r => ({ code: s(r.itemcode || r.title), name: s(r.itemname || r.title), uom: s(r.uom) || 'pcs', category: s(r.category), kind: 'raw', source: 'orbit-rmpm', srcId: String(r.id), reorder: num(r.minstock) }),
    erpRef: v => /^ERP-/i.test(s(v)),
    /* ORBIT's own lists may name the quantity columns differently (Qty_In / Quantity_in): both are read */
    fgMove: r => ({ srcList: 'Main_Inventory_Movements_tbl', srcId: String(r.id), date: day(r.transdate), code: s(r.itemcode || r.title), qty: r3(num(r.itemrcvqty) - num(r.itemreleasedqty)), ref: s(r.recordid), erp: /^ERP-/i.test(s(r.recordid)) }),
    rmMove: r => ({ srcList: 'RMPM_Movements_tbl', srcId: String(r.id), date: day(r.transdate), code: s(r.itemcode), qty: r3(num(r.qtyin != null && r.qtyin !== '' ? r.qtyin : r.quantityin) - num(r.qtyout != null && r.qtyout !== '' ? r.qtyout : r.quantityout)), ref: s(r.refnr || r.title || r.prodorder), erp: /^ERP-/i.test(s(r.refnr)) || /^ERP-/i.test(s(r.title)), bin: /bin transfer/i.test(s(r.transtype)) }),
    /* lines of an ORBIT sync document: movements after the opening mark, not yet imported, not written by the ERP itself, net-zero bin moves skipped */
    pending(fgRows, rmRows, mark, imported, items, set) {
      const known = new Set((items || []).map(i => i.code)), done = imported || new Set(), m = mark || {}, out = [], skipped = { unknown: 0 };
      (fgRows || []).map(ORBIT.fgMove).forEach(x => { if (x.erp || !x.qty || done.has(x.srcList + '|' + x.srcId) || Number(x.srcId) <= num(m.fg)) return; if (!known.has(x.code)) { skipped.unknown++; return; } out.push(Object.assign(x, { wh: set.fgWh })); });
      (rmRows || []).map(ORBIT.rmMove).forEach(x => { if (x.erp || x.bin || !x.qty || done.has(x.srcList + '|' + x.srcId) || Number(x.srcId) <= num(m.rm)) return; if (!known.has(x.code)) { skipped.unknown++; return; } out.push(Object.assign(x, { wh: set.rmWh })); });
      return { lines: out.sort((a, b) => (a.date + a.srcId).localeCompare(b.date + b.srcId)), skipped };
    },
    /* opening quantities: finished goods from the item balance (Bal_Qty), raw & packaging summed from the RMPM ledger */
    openingQty(fgItems, rmMoves) {
      const q = new Map(); (fgItems || []).forEach(r => { const c = s(r.itemcode || r.title); if (c) q.set(c, r3((q.get(c) || 0) + num(r.balqty))); });
      (rmMoves || []).map(ORBIT.rmMove).forEach(x => { if (x.code && !x.bin) q.set(x.code, r3((q.get(x.code) || 0) + x.qty)); });
      return q;
    },
    maxId: rows => (rows || []).reduce((mx, r) => Math.max(mx, Number(r.id) || 0), 0),
  };

  return { r2, r3, r4, num, J, KINDS, STOCKED, DOC_TYPES, COA_ADD, MAP_KEYS, defaultMap, invKey, invAcc, cogsAcc, LISTS, LIST_NAMES,
    itemFromRow, itemToFields, whFromRow, settingsFromRow, docFromRow, moveFromRow, moveToFields, bomFromRow, bomToFields, moFromRow,
    position, apply, costOut, avgOf, buildMoves, journalFor, bomCost, requirements, conversionFor, checkBom, onHand, stockCard, movementSummary, reconcile, salesLines, ORBIT, version: '1.0.0' };
});
