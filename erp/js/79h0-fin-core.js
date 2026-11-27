/* ============================================================
   ORBIT FINANCE CORE — accounting rules and reports (no screens, no storage)
   · UAE chart of accounts (starter), list definitions, double-entry checks, lock date
   · posting rules: e-invoice → sales entry, credit note, purchase bill, receipt, payment, reversal
   · reports from posted lines: trial balance, ledger, P&L, balance sheet, AR / AP ageing, VAT 201 working
   Works in the browser (window.FIN) and in Node (require) — the same rules run in SharePoint mode and on the ERP server.
   ============================================================ */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.FIN = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const r2 = n => { const v = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100; return n < 0 ? -v : v; };
  const num = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
  const J = (s, d) => { try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : d; } catch (e) { return d; } };
  const TYPES = { asset: 'Asset', liability: 'Liability', equity: 'Equity', income: 'Income', expense: 'Expense' };
  const DEBIT_NATURE = { asset: true, expense: true, liability: false, equity: false, income: false };

  /* ---------- starter chart of accounts (UAE, AED) ---------- */
  const A = (code, name, type, parent, sub, group) => ({ code, name, type, parent: parent || '', sub: sub || '', group: !!group });
  const COA = [
    A('1000', 'Assets', 'asset', '', '', 1), A('1100', 'Current assets', 'asset', '1000', '', 1),
    A('1110', 'Cash on hand', 'asset', '1100', 'cash'), A('1120', 'Bank — current account', 'asset', '1100', 'bank'), A('1130', 'Accounts receivable', 'asset', '1100', 'receivable'),
    A('1140', 'VAT recoverable (input VAT)', 'asset', '1100', 'vat_in'), A('1150', 'Inventory', 'asset', '1100', 'inventory'), A('1160', 'Prepayments', 'asset', '1100'), A('1170', 'Employee advances', 'asset', '1100'),
    A('1500', 'Non-current assets', 'asset', '1000', '', 1), A('1510', 'Furniture & fixtures', 'asset', '1500', 'fixed_asset'), A('1520', 'Vehicles', 'asset', '1500', 'fixed_asset'),
    A('1530', 'Machinery & equipment', 'asset', '1500', 'fixed_asset'), A('1540', 'IT equipment', 'asset', '1500', 'fixed_asset'), A('1590', 'Accumulated depreciation', 'asset', '1500', 'acc_dep'),
    A('2000', 'Liabilities', 'liability', '', '', 1), A('2100', 'Current liabilities', 'liability', '2000', '', 1),
    A('2110', 'Accounts payable', 'liability', '2100', 'payable'), A('2120', 'VAT payable (output VAT)', 'liability', '2100', 'vat_out'), A('2130', 'Accrued expenses', 'liability', '2100'),
    A('2140', 'Salaries payable', 'liability', '2100'), A('2150', 'Customer advances', 'liability', '2100'),
    A('2500', 'Non-current liabilities', 'liability', '2000', '', 1), A('2510', 'End of service benefits provision', 'liability', '2500'), A('2520', 'Long-term loans', 'liability', '2500'),
    A('3000', 'Equity', 'equity', '', '', 1), A('3100', 'Share capital', 'equity', '3000'), A('3200', 'Retained earnings', 'equity', '3000', 'retained'), A('3300', "Owner's current account", 'equity', '3000'),
    A('4000', 'Income', 'income', '', '', 1), A('4100', 'Sales — goods', 'income', '4000', 'sales_goods'), A('4200', 'Sales — services', 'income', '4000', 'sales_services'),
    A('4300', 'Sales returns & discounts', 'income', '4000'), A('4900', 'Other income', 'income', '4000'),
    A('5000', 'Cost of sales', 'expense', '', '', 1), A('5100', 'Cost of goods sold', 'expense', '5000', 'cogs'), A('5200', 'Purchases', 'expense', '5000', 'purchases'),
    A('6000', 'Operating expenses', 'expense', '', '', 1), A('6100', 'Salaries & wages', 'expense', '6000'), A('6110', 'End of service benefits', 'expense', '6000'), A('6200', 'Rent', 'expense', '6000'),
    A('6300', 'Utilities', 'expense', '6000'), A('6400', 'Telephone & internet', 'expense', '6000'), A('6500', 'Fuel & transport', 'expense', '6000'), A('6600', 'Repairs & maintenance', 'expense', '6000'),
    A('6700', 'Depreciation', 'expense', '6000'), A('6800', 'Bank charges', 'expense', '6000'), A('6850', 'Professional fees', 'expense', '6000'), A('6900', 'General & administrative', 'expense', '6000'),
    A('6950', 'Rounding differences', 'expense', '6000', 'rounding'),
  ];
  const MAP_KEYS = { ar: ['Accounts receivable', 'receivable'], ap: ['Accounts payable', 'payable'], vat_out: ['Output VAT', 'vat_out'], vat_in: ['Input VAT', 'vat_in'],
    sales_goods: ['Sales of goods', 'sales_goods'], sales_services: ['Sales of services', 'sales_services'], purchases: ['Default purchase / expense', 'purchases'],
    bank: ['Default bank', 'bank'], cash: ['Cash', 'cash'], retained: ['Retained earnings', 'retained'], rounding: ['Rounding', 'rounding'] };
  function defaultMap(accounts) { const m = {}; Object.entries(MAP_KEYS).forEach(([k, [, sub]]) => { const a = (accounts || COA).find(x => x.sub === sub && !x.group); if (a) m[k] = a.code; }); return m; }

  /* ---------- lists (SharePoint now; the ERP server creates the same tables) ---------- */
  const T = n => ({ name: n, text: {} }), M = n => ({ name: n, text: { allowMultipleLines: true, textType: 'plain' } }), N = n => ({ name: n, number: {} });
  const PARTY = ['NameAr', 'TRN', 'LegalId', 'LegalIdType', 'AuthorityName', 'AddressLine', 'City', 'Emirate', 'Country', 'Email'].map(T);
  const LISTS = {
    Fin_Settings: ['BaseCurrency', 'FiscalStart', 'LockDate', 'JvPrefix', 'BillPrefix', 'RcpPrefix', 'PayPrefix', 'DataMode', 'ServerUrl'].map(T).concat([M('AccMap')]),
    Fin_Accounts: ['Code', 'NameAr', 'AccType', 'SubType', 'ParentCode', 'IsGroup', 'Active', 'Description'].map(T),
    Fin_Journal: ['EntryNo', 'EntryDate', 'Memo', 'Source', 'SourceRef', 'Status', 'PostId', 'ReversalOf', 'ReversedBy', 'PostedBy', 'PostedAt'].map(T).concat([N('Total'), M('LinesJson'), M('History')]),
    Fin_JournalLines: ['EntryId', 'PostId', 'EntryDate', 'AccountCode', 'Description', 'PartyType', 'PartyId', 'PartyName', 'CostCenter', 'Source', 'DocRef'].map(T).concat([N('Debit'), N('Credit')]),
    Fin_Suppliers: PARTY.concat(['EndpointId', 'DefaultAccount'].map(T)).concat([N('PaymentTerms')]),
    Fin_Bills: ['BillNo', 'SupplierId', 'SupplierName', 'SupplierInvNo', 'BillDate', 'DueDate', 'Currency', 'Status', 'JournalNo', 'EinvId', 'Notes'].map(T).concat(['FxRate', 'Subtotal', 'VatTotal', 'Total'].map(N)).concat([M('LinesJson'), M('History')]),
    Fin_Payments: ['PayNo', 'PayType', 'PayDate', 'PartyType', 'PartyId', 'PartyName', 'AccountCode', 'Method', 'Reference', 'Status', 'JournalNo', 'Notes'].map(T).concat([N('Amount'), M('AllocJson'), M('History')]),
  };
  const LIST_NAMES = Object.keys(LISTS);

  /* ---------- row mapping (ORBIT keys are lower-case, no spaces) ---------- */
  const acctFromRow = r => ({ id: Number(r.id), code: String(r.code || ''), name: r.title || '', name_ar: r.namear || '', type: r.acctype || 'expense', sub: r.subtype || '', parent: r.parentcode || '', group: String(r.isgroup) === '1', active: String(r.active) !== '0', description: r.description || '' });
  const acctToFields = a => ({ Title: a.name, Code: String(a.code), NameAr: a.name_ar || '', AccType: a.type, SubType: a.sub || '', ParentCode: a.parent || '', IsGroup: a.group ? '1' : '0', Active: a.active === false ? '0' : '1', Description: a.description || '' });
  const settingsFromRow = r => { r = r || {}; return { id: r.id ? Number(r.id) : null, base: r.basecurrency || 'AED', fiscalStart: r.fiscalstart || '01-01', lock: r.lockdate || '', map: J(r.accmap, {}), jv: r.jvprefix || 'JV', bill: r.billprefix || 'BILL', rcp: r.rcpprefix || 'RCP', pay: r.payprefix || 'PAY', mode: r.datamode === 'server' ? 'server' : 'sp', server: r.serverurl || '' }; };
  const entryFromRow = r => ({ id: Number(r.id), no: r.entryno || '', date: r.entrydate || '', memo: r.memo || '', source: r.source || 'manual', ref: r.sourceref || '', status: r.status || 'draft', postId: r.postid || '', reversalOf: r.reversalof || '', reversedBy: r.reversedby || '', total: num(r.total), lines: J(r.linesjson, []), history: J(r.history, []), postedBy: r.postedby || '', postedAt: r.postedat || '' });
  const lineFromRow = r => ({ id: Number(r.id), entryId: String(r.entryid || ''), entryNo: r.title || '', postId: r.postid || '', date: r.entrydate || '', account: String(r.accountcode || ''), debit: num(r.debit), credit: num(r.credit), description: r.description || '', partyType: r.partytype || '', partyId: String(r.partyid || ''), partyName: r.partyname || '', costCenter: r.costcenter || '', source: r.source || '', docRef: r.docref || '' });

  /* ---------- checks ---------- */
  function checkEntry(e, accounts, settings) {
    const E = [], acc = new Map((accounts || []).map(a => [String(a.code), a])), lines = (e.lines || []).filter(l => num(l.debit) || num(l.credit));
    if (!e.date || !/^\d{4}-\d\d-\d\d$/.test(e.date)) E.push('Entry date is required');
    if (settings && settings.lock && e.date && e.date <= settings.lock) E.push('The period is locked up to ' + settings.lock + ' — choose a later date or ask the accountant to move the lock date');
    if (lines.length < 2) E.push('An entry needs at least two lines');
    lines.forEach((l, i) => {
      const a = acc.get(String(l.account)), n = 'Line ' + (i + 1) + ': ';
      if (!a) E.push(n + 'account ' + (l.account || '(none)') + ' is not in the chart of accounts'); else { if (a.group) E.push(n + a.code + ' is a group account — post to an account under it'); if (!a.active) E.push(n + a.code + ' is inactive'); }
      if (num(l.debit) < 0 || num(l.credit) < 0) E.push(n + 'amounts cannot be negative');
      if (num(l.debit) && num(l.credit)) E.push(n + 'use either debit or credit, not both');
    });
    const d = r2(lines.reduce((s, l) => s + num(l.debit), 0)), c = r2(lines.reduce((s, l) => s + num(l.credit), 0));
    if (lines.length && d !== c) E.push('Debits (' + d.toFixed(2) + ') and credits (' + c.toFixed(2) + ') must be equal — difference ' + r2(d - c).toFixed(2));
    if (lines.length && !d) E.push('The entry has no amount');
    return { ok: !E.length, errors: E, debit: d, credit: c, lines };
  }

  /* ---------- posting rules ---------- */
  const L = (account, debit, credit, description, party) => Object.assign({ account: String(account), debit: r2(debit || 0), credit: r2(credit || 0), description: description || '' }, party || {});
  function balanceLines(lines, map, memo) {   /* tiny AED conversion differences go to the rounding account */
    const d = r2(lines.reduce((s, l) => s + l.debit, 0)), c = r2(lines.reduce((s, l) => s + l.credit, 0)), diff = r2(d - c);
    if (diff && Math.abs(diff) <= 0.05 && map.rounding) lines.push(L(map.rounding, diff < 0 ? -diff : 0, diff > 0 ? diff : 0, 'Rounding — ' + memo));
    return lines.filter(l => l.debit || l.credit);
  }
  /* e-invoice (EINV doc, direction out) → sales entry; credit note → the mirror. totals come from EINV.totals */
  function fromSalesDoc(doc, t, map) {
    const fx = doc.currency && doc.currency !== 'AED' ? num(doc.fx_rate) || 1 : 1, cn = doc.doc_type === 'credit_note', party = { partyType: 'customer', partyId: String(doc.customer_id || ''), partyName: (doc.buyer && doc.buyer.name) || doc.customer_name || '' };
    const goods = r2(t.lines.filter(l => l.kind !== 'S').reduce((s, l) => s + l.net_amount, 0) * fx), serv = r2(t.lines.filter(l => l.kind === 'S').reduce((s, l) => s + l.net_amount, 0) * fx), vat = r2(t.vat_total * fx);
    const total = r2(goods + serv + vat), memo = (cn ? 'Credit note ' : 'Sales invoice ') + doc.number + (party.partyName ? ' — ' + party.partyName : '');
    const lines = cn
      ? [L(map.sales_goods, goods, 0, memo), L(map.sales_services, serv, 0, memo), L(map.vat_out, vat, 0, 'Output VAT — ' + doc.number), L(map.ar, 0, total, memo, party)]
      : [L(map.ar, total, 0, memo, party), L(map.sales_goods, 0, goods, memo), L(map.sales_services, 0, serv, memo), L(map.vat_out, 0, vat, 'Output VAT — ' + doc.number)];
    return { date: doc.issue_date, memo, source: cn ? 'credit_note' : 'sales', ref: 'EINV:' + (doc.uuid || doc.id), lines: lines.filter(l => l.debit || l.credit).map(l => Object.assign(l, { docRef: doc.number })) };
  }
  /* purchase bill → Dr expense/stock per line, Dr input VAT, Cr AP */
  function billTotals(bill) {
    const lines = (bill.lines || []).map(l => { const net = r2(num(l.quantity || 1) * num(l.unit_price)), rate = l.vat_category === 'S' ? 5 : 0; return Object.assign({}, l, { net, vat: r2(net * rate / 100) }); });
    const subtotal = r2(lines.reduce((s, l) => s + l.net, 0)), vat = r2(lines.reduce((s, l) => s + l.vat, 0));
    return { lines, subtotal, vat_total: vat, total: r2(subtotal + vat) };
  }
  function fromBill(bill, map) {
    const fx = bill.currency && bill.currency !== 'AED' ? num(bill.fx_rate) || 1 : 1, t = billTotals(bill), party = { partyType: 'supplier', partyId: String(bill.supplier_id || ''), partyName: bill.supplier_name || '' };
    const memo = 'Bill ' + bill.number + (bill.supplier_inv_no ? ' (supplier inv. ' + bill.supplier_inv_no + ')' : '') + ' — ' + party.partyName;
    const lines = t.lines.map(l => L(l.account || map.purchases, r2(l.net * fx), 0, (l.description || memo))), vat = r2(t.vat_total * fx);
    if (vat) lines.push(L(map.vat_in, vat, 0, 'Input VAT — ' + bill.number));
    lines.push(L(map.ap, 0, r2(lines.reduce((s, l) => s + l.debit, 0)), memo, party));
    return { date: bill.bill_date, memo, source: 'bill', ref: 'BILL:' + bill.id, lines: balanceLines(lines, map, bill.number).map(l => Object.assign(l, { docRef: bill.number })) };
  }
  /* receipt from a customer / payment to a supplier */
  function fromPayment(p, map) {
    const amt = r2(num(p.amount)), rc = p.type === 'receipt', party = { partyType: rc ? 'customer' : 'supplier', partyId: String(p.party_id || ''), partyName: p.party_name || '' };
    const memo = (rc ? 'Receipt ' : 'Payment ') + p.number + ' — ' + party.partyName + (p.reference ? ' · ' + p.reference : '');
    const lines = rc ? [L(p.account, amt, 0, memo), L(map.ar, 0, amt, memo, party)] : [L(map.ap, amt, 0, memo, party), L(p.account, 0, amt, memo)];
    return { date: p.date, memo, source: rc ? 'receipt' : 'payment', ref: (rc ? 'RCP:' : 'PAY:') + p.id, lines: lines.map(l => Object.assign(l, { docRef: p.number })) };
  }
  function reversalOf(e, date) {
    return { date, memo: 'Reversal of ' + e.no + (e.memo ? ' — ' + e.memo : ''), source: 'reversal', ref: 'REV:' + e.no, reversalOf: e.no,
      lines: e.lines.map(l => Object.assign({}, l, { debit: num(l.credit), credit: num(l.debit), description: 'Reversal — ' + (l.description || '') })) };
  }

  /* ---------- reports (input: posted lines + accounts) ---------- */
  const fyStart = (date, fs) => { const [m, d] = (fs || '01-01').split('-'), y = Number(date.slice(0, 4)), s = y + '-' + m + '-' + d; return s <= date ? s : (y - 1) + '-' + m + '-' + d; };
  function balances(lines, from, to) { const m = new Map(); lines.forEach(l => { if ((from && l.date < from) || (to && l.date > to)) return; const b = m.get(l.account) || { debit: 0, credit: 0 }; b.debit += num(l.debit); b.credit += num(l.credit); m.set(l.account, b); }); m.forEach(b => { b.debit = r2(b.debit); b.credit = r2(b.credit); }); return m; }
  const signed = (a, b) => DEBIT_NATURE[a.type] ? r2(b.debit - b.credit) : r2(b.credit - b.debit);
  function trialBalance(lines, accounts, from, to, fs) {
    const fy = fyStart(from || to, fs), pre = balances(lines, '', from ? prev(from) : ''), per = balances(lines, from, to), rows = [];
    accounts.filter(a => !a.group).forEach(a => {
      let o = pre.get(a.code) || { debit: 0, credit: 0 };
      if (['income', 'expense'].includes(a.type)) o = balances(lines.filter(l => l.account === a.code), fy, from ? prev(from) : '').get(a.code) || { debit: 0, credit: 0 };   /* P&L accounts start each financial year at zero */
      const p = per.get(a.code) || { debit: 0, credit: 0 }, open = r2(o.debit - o.credit), close = r2(open + p.debit - p.credit);
      if (open || p.debit || p.credit) rows.push({ code: a.code, name: a.name, type: a.type, open, debit: p.debit, credit: p.credit, close });
    });
    rows.sort((x, y) => x.code.localeCompare(y.code));
    const tot = rows.reduce((s, r) => ({ debit: r2(s.debit + r.debit), credit: r2(s.credit + r.credit), dr: r2(s.dr + (r.close > 0 ? r.close : 0)), cr: r2(s.cr + (r.close < 0 ? -r.close : 0)) }), { debit: 0, credit: 0, dr: 0, cr: 0 });
    return { rows, totals: tot, balanced: tot.debit === tot.credit };
  }
  const prev = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
  function ledger(lines, account, from, to) {
    const own = lines.filter(l => l.account === String(account)).sort((a, b) => (a.date + a.entryNo).localeCompare(b.date + b.entryNo));
    let bal = r2(own.filter(l => from && l.date < from).reduce((s, l) => s + l.debit - l.credit, 0)); const open = bal;
    const rows = own.filter(l => (!from || l.date >= from) && (!to || l.date <= to)).map(l => { bal = r2(bal + l.debit - l.credit); return Object.assign({}, l, { balance: bal }); });
    return { open, rows, close: bal };
  }
  function pnl(lines, accounts, from, to) {
    const b = balances(lines, from, to), sec = t => accounts.filter(a => a.type === t && !a.group).map(a => ({ code: a.code, name: a.name, parent: a.parent, amount: signed(a, b.get(a.code) || { debit: 0, credit: 0 }) })).filter(x => x.amount);
    const income = sec('income'), expense = sec('expense'), ti = r2(income.reduce((s, x) => s + x.amount, 0)), te = r2(expense.reduce((s, x) => s + x.amount, 0));
    const cos = r2(expense.filter(x => x.parent === '5000').reduce((s, x) => s + x.amount, 0));
    return { income, expense, totalIncome: ti, totalExpense: te, grossProfit: r2(ti - cos), netProfit: r2(ti - te) };
  }
  function balanceSheet(lines, accounts, asOf, fs) {
    const fy = fyStart(asOf, fs), b = balances(lines, '', asOf), sec = t => accounts.filter(a => a.type === t && !a.group).map(a => ({ code: a.code, name: a.name, parent: a.parent, amount: signed(a, b.get(a.code) || { debit: 0, credit: 0 }) })).filter(x => x.amount);
    const cur = pnl(lines, accounts, fy, asOf).netProfit, earlier = pnl(lines, accounts, '', prev(fy)).netProfit;
    const assets = sec('asset'), liabilities = sec('liability'), equity = sec('equity');
    if (earlier) equity.push({ code: '', name: 'Profit of earlier years (not yet closed)', amount: earlier });
    if (cur) equity.push({ code: '', name: 'Profit for the year to date', amount: cur });
    const ta = r2(assets.reduce((s, x) => s + x.amount, 0)), tl = r2(liabilities.reduce((s, x) => s + x.amount, 0)), te = r2(equity.reduce((s, x) => s + x.amount, 0));
    return { assets, liabilities, equity, totalAssets: ta, totalLiabilities: tl, totalEquity: te, balanced: r2(ta - tl - te) === 0 };
  }
  /* ageing: docs = [{id, kind, number, party, partyId, date, due, total}], allocations = [{docKey, amount}], unapplied = [{partyId, party, amount}] */
  function ageing(docs, allocs, asOf, unapplied) {
    const paid = new Map(); (allocs || []).forEach(a => paid.set(a.docKey, r2((paid.get(a.docKey) || 0) + num(a.amount))));
    const B = ['current', 'd30', 'd60', 'd90', 'd90p'], parties = new Map(), open = [];
    docs.forEach(d => {
      const bal = r2(d.total - (paid.get(d.key) || 0)); if (Math.abs(bal) < 0.005) return;
      const days = Math.floor((new Date(asOf) - new Date(d.due || d.date)) / 864e5), bk = days <= 0 ? 'current' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'd90p';
      open.push(Object.assign({}, d, { balance: bal, days, bucket: bk }));
      const p = parties.get(d.partyId) || { party: d.party, partyId: d.partyId, current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, unapplied: 0, total: 0 }; p[bk] = r2(p[bk] + bal); p.total = r2(p.total + bal); parties.set(d.partyId, p);
    });
    (unapplied || []).forEach(u => { if (!u.amount) return; const p = parties.get(u.partyId) || { party: u.party, partyId: u.partyId, current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, unapplied: 0, total: 0 }; p.unapplied = r2(p.unapplied - u.amount); p.total = r2(p.total - u.amount); parties.set(u.partyId, p); });
    const rows = [...parties.values()].filter(p => Math.abs(p.total) >= 0.005).sort((a, b) => b.total - a.total);
    const totals = rows.reduce((s, p) => { B.concat(['unapplied', 'total']).forEach(k => s[k] = r2((s[k] || 0) + p[k])); return s; }, {});
    return { rows, totals, open: open.sort((a, b) => b.days - a.days) };
  }
  /* VAT 201 working: sales by VAT category (and by customer emirate for standard-rated), purchases with input VAT */
  function vat201(sales, bills, from, to) {
    const inP = d => d.date >= from && d.date <= to, box1 = {}, out = { box1, box4: 0, box5: 0, box1Vat: 0, box9: 0, box9Vat: 0 };
    sales.filter(inP).forEach(s => { const sg = s.credit ? -1 : 1; s.groups.forEach(g => { const amt = r2(g.taxable * s.fx * sg), vat = r2(g.tax * s.fx * sg);
      if (g.category === 'S') { const em = s.emirate || 'Other'; box1[em] = box1[em] || { amount: 0, vat: 0 }; box1[em].amount = r2(box1[em].amount + amt); box1[em].vat = r2(box1[em].vat + vat); out.box1Vat = r2(out.box1Vat + vat); }
      else if (g.category === 'Z') out.box4 = r2(out.box4 + amt); else if (g.category === 'E') out.box5 = r2(out.box5 + amt); }); });
    bills.filter(inP).forEach(b => { b.lines.forEach(l => { if (l.vat) { out.box9 = r2(out.box9 + l.net * b.fx); out.box9Vat = r2(out.box9Vat + l.vat * b.fx); } }); });
    out.payable = r2(out.box1Vat - out.box9Vat); return out;
  }

  return { r2, num, J, TYPES, DEBIT_NATURE, COA, MAP_KEYS, defaultMap, LISTS, LIST_NAMES, acctFromRow, acctToFields, settingsFromRow, entryFromRow, lineFromRow,
    checkEntry, fromSalesDoc, billTotals, fromBill, fromPayment, reversalOf, balances, trialBalance, ledger, pnl, balanceSheet, ageing, vat201, fyStart, prev, version: '1.0.0' };
});
