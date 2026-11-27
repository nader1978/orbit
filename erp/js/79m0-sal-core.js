/* ============================================================
   ORBIT SALES & MARKETING CORE — rules only (no screens, no storage)
   CRM: leads → opportunities (stages, value, probability) → won / lost
   Selling: price lists → quotation (discount limit → approval) → sales order (credit limit + stock check → approval)
            → delivery notes (partial) → e-invoice draft (delivered, not yet invoiced) → E-Invoicing / Finance
   Marketing: customer segments (rules) and campaigns (cost, leads, won value)
   Targets & commissions per salesperson and month
   Works in the browser (window.SAL) and in Node (require).
   ============================================================ */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.SAL = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const r2 = n => { const v = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100; return n < 0 ? -v : v; };
  const r3 = n => Math.round(n * 1000) / 1000;
  const num = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
  const J = (s, d) => { try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : d; } catch (e) { return d; } };
  const day = v => String(v || '').slice(0, 10);
  const lc = v => String(v || '').trim().toLowerCase();
  const VAT = { S: 5, Z: 0, E: 0, O: 0 };
  const T = n => ({ name: n, text: {} }), M = n => ({ name: n, text: { allowMultipleLines: true, textType: 'plain' } }), N = n => ({ name: n, number: {} });
  const LISTS = {
    Sal_Settings: ['QtPrefix', 'SoPrefix', 'DnPrefix', 'LeadPrefix', 'DefaultWh', 'StockCheck', 'CreditCheck'].map(T).concat(['MaxDiscPct', 'QuoteDays'].map(N)).concat([M('QuoteTerms')]),
    Sal_Accounts: ['CustomerId', 'CustomerName', 'PriceList', 'Salesperson', 'Tags', 'Phone', 'Blocked'].map(T).concat(['CreditLimit', 'PayDays'].map(N)).concat([M('Notes')]),
    Sal_PriceLists: ['ValidFrom', 'ValidTo', 'Currency', 'IsDefault', 'Active'].map(T).concat([M('ItemsJson'), M('Notes')]),
    Sal_Leads: ['LeadNo', 'Company', 'Contact', 'Phone', 'Email', 'Emirate', 'Source', 'Campaign', 'Owner', 'Stage', 'CloseDate', 'CustomerId', 'QtNo', 'LostReason'].map(T).concat(['Value', 'Probability'].map(N)).concat([M('Notes'), M('Activities')]),
    Sal_Quotes: ['QtNo', 'QtDate', 'ValidTo', 'CustomerId', 'CustomerName', 'LeadId', 'Salesperson', 'PriceList', 'Status', 'SoNo', 'LostReason'].map(T).concat(['Net', 'Vat', 'Total', 'MaxDisc'].map(N)).concat([M('LinesJson'), M('Terms'), M('History')]),
    Sal_Orders: ['SoNo', 'SoDate', 'CustomerId', 'CustomerName', 'QtNo', 'CustRef', 'Salesperson', 'DeliveryDate', 'Wh', 'Status', 'InvNos'].map(T).concat(['Net', 'Vat', 'Total', 'MaxDisc'].map(N)).concat([M('LinesJson'), M('Checks'), M('Invoices'), M('History')]),
    Sal_Deliveries: ['DnNo', 'SoId', 'SoNo', 'DnDate', 'Wh', 'CustomerName', 'Driver', 'Vehicle', 'ReceivedBy'].map(T).concat([N('Value'), M('LinesJson'), M('Notes')]),
    Sal_Campaigns: ['Channel', 'Segment', 'StartDate', 'EndDate', 'Status', 'Owner'].map(T).concat(['Budget', 'Cost'].map(N)).concat([M('Goal'), M('Notes')]),
    Sal_Segments: [M('RulesJson'), M('Notes')],
    Sal_Targets: ['Salesperson', 'Period'].map(T).concat(['Target', 'CommPct', 'BonusPct'].map(N)),
  };
  const STAGES = [['new', 'New', 10], ['contacted', 'Contacted', 20], ['qualified', 'Qualified', 40], ['proposal', 'Proposal sent', 60], ['negotiation', 'Negotiation', 80], ['won', 'Won', 100], ['lost', 'Lost', 0]];
  const STAGE = Object.fromEntries(STAGES.map(s => [s[0], s]));
  const SOURCES = ['Website', 'Referral', 'Walk-in', 'Phone', 'Exhibition', 'Social media', 'Campaign', 'Existing customer', 'Other'];
  const CHANNELS = ['Email', 'SMS', 'WhatsApp', 'Social media', 'Exhibition', 'Print', 'Field visit', 'Promotion', 'Other'];

  const settingsFromRow = r => { r = r || {}; const n = (v, d) => v === '' || v == null ? d : num(v); return { id: r.id ? Number(r.id) : null, qt: r.qtprefix || 'QT', so: r.soprefix || 'SO', dn: r.dnprefix || 'DN', lead: r.leadprefix || 'LD', wh: r.defaultwh || 'MAIN', stockCheck: r.stockcheck || 'warn', creditCheck: r.creditcheck || 'approve', maxDisc: n(r.maxdiscpct, 10), quoteDays: n(r.quotedays, 30), terms: r.quoteterms || 'Prices in AED, excluding VAT unless shown. Delivery to the customer address within the agreed time. Payment as per the agreed terms against our tax invoice.' }; };
  const acctFromRow = r => ({ id: Number(r.id), customerId: String(r.customerid || ''), customer: r.customername || r.title || '', priceList: r.pricelist || '', salesperson: lc(r.salesperson), tags: String(r.tags || '').split(',').map(s => s.trim()).filter(Boolean), phone: r.phone || '', blocked: r.blocked === '1' || r.blocked === 'yes', creditLimit: num(r.creditlimit), payDays: r.paydays === '' || r.paydays == null ? 30 : num(r.paydays), notes: r.notes || '' });
  const plFromRow = r => ({ id: Number(r.id), name: r.title || '', from: day(r.validfrom), to: day(r.validto), currency: r.currency || 'AED', isDefault: r.isdefault === '1' || r.isdefault === 'yes', active: r.active !== '0' && r.active !== 'no', items: J(r.itemsjson, []), notes: r.notes || '' });
  const leadFromRow = r => ({ id: Number(r.id), no: r.leadno || '', title: r.title || '', company: r.company || '', contact: r.contact || '', phone: r.phone || '', email: r.email || '', emirate: r.emirate || '', source: r.source || '', campaign: r.campaign || '', owner: lc(r.owner), stage: r.stage || 'new', close: day(r.closedate), customerId: String(r.customerid || ''), qtNo: r.qtno || '', lostReason: r.lostreason || '', value: num(r.value), prob: r.probability === '' || r.probability == null ? (STAGE[r.stage || 'new'] || [0, 0, 10])[2] : num(r.probability), notes: r.notes || '', acts: J(r.activities, []) });
  const qtFromRow = r => ({ id: Number(r.id), no: r.qtno || '', date: day(r.qtdate), validTo: day(r.validto), customerId: String(r.customerid || ''), customer: r.customername || '', leadId: String(r.leadid || ''), salesperson: lc(r.salesperson), priceList: r.pricelist || '', status: r.status || 'draft', soNo: r.sono || '', lostReason: r.lostreason || '', net: num(r.net), vat: num(r.vat), total: num(r.total), maxDisc: num(r.maxdisc), lines: J(r.linesjson, []), terms: r.terms || '', history: J(r.history, []) });
  const soFromRow = r => ({ id: Number(r.id), no: r.sono || '', date: day(r.sodate), customerId: String(r.customerid || ''), customer: r.customername || '', qtNo: r.qtno || '', custRef: r.custref || '', salesperson: lc(r.salesperson), delivery: day(r.deliverydate), wh: r.wh || '', status: r.status || 'draft', invNos: r.invnos || '', net: num(r.net), vat: num(r.vat), total: num(r.total), maxDisc: num(r.maxdisc), lines: J(r.linesjson, []), checks: J(r.checks, null), invoices: J(r.invoices, []), history: J(r.history, []) });
  const dnFromRow = r => ({ id: Number(r.id), no: r.dnno || '', so: String(r.soid || ''), soNo: r.sono || '', date: day(r.dndate), wh: r.wh || '', customer: r.customername || '', driver: r.driver || '', vehicle: r.vehicle || '', receivedBy: r.receivedby || '', value: num(r.value), lines: J(r.linesjson, []), notes: r.notes || '' });
  const campFromRow = r => ({ id: Number(r.id), name: r.title || '', channel: r.channel || '', segment: r.segment || '', start: day(r.startdate), end: day(r.enddate), status: r.status || 'planned', owner: lc(r.owner), budget: num(r.budget), cost: num(r.cost), goal: r.goal || '', notes: r.notes || '' });
  const segFromRow = r => ({ id: Number(r.id), name: r.title || '', rules: J(r.rulesjson, {}), notes: r.notes || '' });
  const tgtFromRow = r => ({ id: Number(r.id), salesperson: lc(r.salesperson), period: String(r.period || '').slice(0, 7), target: num(r.target), commPct: num(r.commpct), bonusPct: num(r.bonuspct) });

  /* ---------- prices ---------- */
  /* the customer's price list (active, in date) → else the default list → else the item's own price. Tiers: highest "from qty" not above the quantity */
  function pickList(lists, name, date) {
    const ok = l => l.active && (!l.from || !date || l.from <= date) && (!l.to || !date || l.to >= date);
    return (name && (lists || []).find(l => l.name === name && ok(l))) || (lists || []).find(l => l.isDefault && ok(l)) || null;
  }
  function priceFor(code, qty, lists, listName, date, fallback) {
    const pl = pickList(lists, listName, date), q = num(qty) || 1;
    if (pl && code) { const tiers = pl.items.filter(x => lc(x.code) === lc(code) && num(x.minQty || 0) <= q).sort((a, b) => num(b.minQty || 0) - num(a.minQty || 0)); if (tiers.length) return { price: num(tiers[0].price), list: pl.name, minDisc: num(tiers[0].maxDisc) }; }
    return { price: num(fallback), list: '', minDisc: 0 };
  }

  /* ---------- amounts: line = qty × price − discount % ---------- */
  function lineNet(l) { const gross = r2(num(l.qty) * num(l.price)), disc = r2(gross * num(l.disc) / 100); return { gross, disc, net: r2(gross - disc) }; }
  function totals(lines, qtyKey) {
    let gross = 0, disc = 0, net = 0, vat = 0;
    const out = (lines || []).map(l => { const x = Object.assign({}, l, qtyKey ? { qty: num(l[qtyKey]) } : {}), a = lineNet(x), v = r2(a.net * (VAT[l.vat || 'S'] || 0) / 100); gross += a.gross; disc += a.disc; net += a.net; vat += v; return Object.assign(x, a, { vatAmt: v }); });
    return { lines: out, gross: r2(gross), disc: r2(disc), net: r2(net), vat: r2(vat), total: r2(net + vat) };
  }
  const maxDisc = lines => (lines || []).reduce((m, l) => Math.max(m, num(l.disc)), 0);
  function checkLines(lines) {
    const E = []; if (!(lines || []).length) E.push('Add at least one line');
    (lines || []).forEach((l, i) => { if (!String(l.description || l.code || '').trim()) E.push('Line ' + (i + 1) + ': description is required'); if (!(num(l.qty) > 0)) E.push('Line ' + (i + 1) + ': quantity must be more than zero'); if (num(l.price) < 0) E.push('Line ' + (i + 1) + ': price cannot be negative'); if (num(l.disc) < 0 || num(l.disc) > 100) E.push('Line ' + (i + 1) + ': discount must be 0–100 %'); });
    return E;
  }
  /* discount above the limit → approval "Sales discount above limit" */
  const needsDiscApproval = (lines, set) => maxDisc(lines) > num((set || {}).maxDisc) + 1e-9;

  /* ---------- stock: on hand − reserved by other open orders. Stock leaves the books when the e-invoice is posted
     (cost of sales), so an order holds its quantity until it is invoiced (delivered-not-invoiced is still "on hand" in the books). ---------- */
  const OPEN_SO = ['pending', 'approved', 'partial'];
  function reserved(orders, exceptId) {
    const m = new Map(); (orders || []).filter(o => OPEN_SO.includes(o.status) && o.id !== exceptId).forEach(o => o.lines.forEach(l => { if (!l.code || !l.stock) return; const q = r3(num(l.qty) - num(l.invoiced)); if (q > 0) m.set(l.code, r3((m.get(l.code) || 0) + q)); })); return m;
  }
  /* onHand: Map code → qty. Lines of the same item are added up. */
  function stockCheck(lines, onHand, res) {
    const need = new Map(); (lines || []).forEach(l => { if (l.code && l.stock) need.set(l.code, r3((need.get(l.code) || 0) + num(l.qty) - num(l.invoiced))); });
    const rows = [...need.entries()].map(([code, q]) => { const oh = num(onHand.get ? onHand.get(code) : onHand[code]), rs = num(res && res.get ? res.get(code) : 0), avail = r3(oh - rs); return { code, need: q, onHand: oh, reserved: rs, available: avail, short: r3(Math.max(0, q - avail)) }; });
    return { rows, ok: rows.every(r => r.short <= 0) };
  }

  /* ---------- credit: invoiced − received + open orders (not yet invoiced) ---------- */
  const LIVE = ['submitted', 'validated', 'delivered', 'reported'];
  function exposure(customerId, edocs, receipts, orders, exceptSo) {
    const id = String(customerId); let inv = 0, paid = 0, open = 0;
    (edocs || []).filter(x => x.direction === 'out' && LIVE.includes(x.status) && String(x.customer_id) === id).forEach(x => { inv += (x.doc_type === 'credit_note' ? -1 : 1) * num(x.total) * (num(x.fx_rate) || 1); });
    (receipts || []).filter(p => p.status === 'posted' && String(p.partyId) === id).forEach(p => { paid += num(p.amount); });
    (orders || []).filter(o => OPEN_SO.includes(o.status) && o.customerId === id && o.id !== exceptSo).forEach(o => { open += openValue(o); });
    return { invoiced: r2(inv), received: r2(paid), ar: r2(inv - paid), openOrders: r2(open), total: r2(inv - paid + open) };
  }
  /* value incl. VAT of what is ordered but not yet invoiced */
  const openValue = o => totals(o.lines.map(l => Object.assign({}, l, { qty: r3(num(l.qty) - num(l.invoiced)) })).filter(l => l.qty > 0)).total;
  function creditCheck(acct, so, exp) {
    if (!acct || !(acct.creditLimit > 0)) return { ok: true, limit: 0, after: r2(exp.total + so.total), over: 0, noLimit: true, blocked: !!(acct && acct.blocked) };
    const after = r2(exp.total + so.total), over = r2(after - acct.creditLimit); return { ok: over <= 0 && !acct.blocked, limit: acct.creditLimit, after, over: Math.max(0, over), blocked: acct.blocked };
  }

  /* ---------- order life ---------- */
  function soStatus(so) {
    if (['draft', 'pending', 'rejected', 'cancelled', 'closed'].includes(so.status)) return so.status;
    const all = so.lines.every(l => num(l.delivered) >= num(l.qty) - 0.0005), any = so.lines.some(l => num(l.delivered) > 0), inv = so.lines.every(l => num(l.invoiced) >= num(l.qty) - 0.0005);
    return all && inv ? 'invoiced' : all ? 'delivered' : any ? 'partial' : 'approved';
  }
  function checkDelivery(so, qtys, avail) {
    const E = []; let any = false;
    so.lines.forEach((l, i) => { const q = num(qtys[i]); if (!q) return; any = true; if (q < 0) E.push('Line ' + (i + 1) + ': quantity cannot be negative'); const left = r3(num(l.qty) - num(l.delivered)); if (q > left + 0.0005) E.push('Line ' + (i + 1) + ': only ' + left + ' ' + (l.uom || '') + ' left to deliver');
      if (avail && l.code && l.stock && avail.has(l.code) && q > avail.get(l.code) + 0.0005) E.push('Line ' + (i + 1) + ': only ' + avail.get(l.code) + ' ' + (l.uom || '') + ' of ' + l.code + ' in stock'); });
    if (!any) E.push('Enter the quantity delivered on at least one line'); if (!['approved', 'partial'].includes(so.status)) E.push('The order is ' + so.status + ' — it must be approved first'); return E;
  }
  /* e-invoice draft for what is delivered and not yet invoiced (services: ordered and not invoiced) */
  function toInvoice(so, products, payDays, today) {
    const P = new Map((products || []).map(p => [lc(p.item_code || p.itemcode || ''), p]).filter(x => x[0]));
    const rows = so.lines.map((l, i) => ({ i, l, q: r3((l.stock ? num(l.delivered) : num(l.qty)) - num(l.invoiced)) })).filter(x => x.q > 0);
    const lines = rows.map(({ l, q }) => { const p = P.get(lc(l.code)) || {}, gross = r2(q * num(l.price)); return { description: l.description, item_code: l.code || '', kind: p.kind || (l.stock ? 'G' : 'S'), class_code: p.classcode || p.class_code || '', unit_code: p.unitcode || p.unit_code || 'H87', quantity: q, unit_price: num(l.price), discount: r2(gross * num(l.disc) / 100), vat_category: l.vat || 'S', exemption_reason: '' }; });
    const issue = today || new Date().toISOString().slice(0, 10), due = new Date(new Date(issue).getTime() + (num(payDays) || 0) * 864e5).toISOString().slice(0, 10);
    return { rows: rows.map(x => ({ i: x.i, qty: x.q })), doc: { direction: 'out', doc_type: 'invoice', issue_date: issue, due_date: due, currency: 'AED', customer_id: so.customerId, customer_name: so.customer, status: 'draft', transaction_flags: '00000000', notes: 'Sales order ' + so.no + (so.custRef ? ' · your ref. ' + so.custRef : ''), lines } };
  }

  /* ---------- CRM ---------- */
  function pipeline(leads) {
    const open = (leads || []).filter(l => !['won', 'lost'].includes(l.stage));
    const by = STAGES.map(([k, t]) => { const ls = (leads || []).filter(l => l.stage === k); return { stage: k, title: t, count: ls.length, value: r2(ls.reduce((s, l) => s + l.value, 0)), weighted: r2(ls.reduce((s, l) => s + l.value * l.prob / 100, 0)) }; });
    const won = (leads || []).filter(l => l.stage === 'won').length, lost = (leads || []).filter(l => l.stage === 'lost').length;
    return { by, openValue: r2(open.reduce((s, l) => s + l.value, 0)), weighted: r2(open.reduce((s, l) => s + l.value * l.prob / 100, 0)), winRate: won + lost ? Math.round(won * 100 / (won + lost)) : 0, open: open.length };
  }
  const probOf = stage => (STAGE[stage] || [0, 0, 0])[2];

  /* ---------- sales per customer / salesperson (from e-invoices, net of VAT; credit notes negative) ---------- */
  function salesRows(edocs, accts, orders) {
    const A = new Map((accts || []).map(a => [a.customerId, a])), byInv = new Map(); (orders || []).forEach(o => (o.invoices || []).forEach(x => byInv.set(String(x.id), o.salesperson)));
    return (edocs || []).filter(x => x.direction === 'out' && LIVE.includes(x.status)).map(x => { const sg = x.doc_type === 'credit_note' ? -1 : 1, fx = num(x.fx_rate) || 1, net = r2(sg * num(x.subtotal) * fx), a = A.get(String(x.customer_id)) || {};
      return { id: x.id, number: x.number, date: day(x.issue_date), period: day(x.issue_date).slice(0, 7), customerId: String(x.customer_id || ''), customer: x.customer_name || (x.buyer && x.buyer.name) || '', emirate: (x.buyer && x.buyer.emirate) || '', salesperson: byInv.get(String(x.id)) || a.salesperson || '', net }; });
  }

  /* ---------- segments: rules {emirates:[], tags:[], salesperson, minSales, sinceDays, priceList} ---------- */
  function segMembers(seg, customers, accts, sales, today) {
    const r = seg.rules || {}, A = new Map((accts || []).map(a => [a.customerId, a])), since = r.sinceDays ? new Date(new Date(today || Date.now()).getTime() - num(r.sinceDays) * 864e5).toISOString().slice(0, 10) : '';
    const tot = new Map(); (sales || []).filter(s => !since || s.date >= since).forEach(s => tot.set(s.customerId, r2((tot.get(s.customerId) || 0) + s.net)));
    return (customers || []).filter(c => { const a = A.get(String(c.id)) || { tags: [] }, em = lc(c.emirate);
      if ((r.emirates || []).length && !r.emirates.map(lc).includes(em)) return false;
      if ((r.tags || []).length && !r.tags.some(t => a.tags.map(lc).includes(lc(t)))) return false;
      if (r.salesperson && lc(r.salesperson) !== a.salesperson) return false;
      if (r.priceList && r.priceList !== a.priceList) return false;
      if (num(r.minSales) > 0 && (tot.get(String(c.id)) || 0) < num(r.minSales)) return false;
      if (r.noSales && (tot.get(String(c.id)) || 0) > 0) return false;
      return true; }).map(c => Object.assign({}, c, { sales: tot.get(String(c.id)) || 0 }));
  }
  function campaignStats(camp, leads) {
    const ls = (leads || []).filter(l => l.campaign === camp.name), won = ls.filter(l => l.stage === 'won'), wonValue = r2(won.reduce((s, l) => s + l.value, 0));
    return { leads: ls.length, won: won.length, wonValue, pipeline: r2(ls.filter(l => !['won', 'lost'].includes(l.stage)).reduce((s, l) => s + l.value, 0)), costPerLead: ls.length ? r2(camp.cost / ls.length) : 0, roi: camp.cost ? Math.round((wonValue - camp.cost) * 100 / camp.cost) : null };
  }

  /* ---------- targets & commission: commission % of actual + bonus % of the part above target ---------- */
  function commissions(targets, sales, period) {
    const P = (targets || []).filter(t => !period || t.period === period), act = new Map();
    (sales || []).filter(s => !period || s.period === period).forEach(s => { const k = s.salesperson + '|' + s.period; act.set(k, r2((act.get(k) || 0) + s.net)); });
    const rows = P.map(t => { const a = act.get(t.salesperson + '|' + t.period) || 0, pct = t.target ? Math.round(a * 1000 / t.target) / 10 : 0, above = Math.max(0, r2(a - t.target)), comm = r2(Math.max(0, a) * t.commPct / 100), bonus = t.target && a >= t.target ? r2(above * t.bonusPct / 100) : 0;
      return { salesperson: t.salesperson, period: t.period, target: t.target, actual: a, pct, gap: r2(t.target - a), commission: comm, bonus, payout: r2(comm + bonus) }; });
    /* sales of people without a target still show (no commission) */
    [...act.entries()].forEach(([k, a]) => { const [sp, pd] = k.split('|'); if (!rows.some(r => r.salesperson === sp && r.period === pd)) rows.push({ salesperson: sp, period: pd, target: 0, actual: a, pct: 0, gap: 0, commission: 0, bonus: 0, payout: 0, noTarget: true }); });
    return rows.sort((a, b) => (a.period + a.salesperson).localeCompare(b.period + b.salesperson));
  }

  return { r2, r3, num, J, lc, VAT, LISTS, LIST_NAMES: Object.keys(LISTS), STAGES, STAGE, SOURCES, CHANNELS, OPEN_SO,
    settingsFromRow, acctFromRow, plFromRow, leadFromRow, qtFromRow, soFromRow, dnFromRow, campFromRow, segFromRow, tgtFromRow,
    pickList, priceFor, lineNet, totals, maxDisc, checkLines, needsDiscApproval, reserved, stockCheck, exposure, openValue, creditCheck, soStatus, checkDelivery, toInvoice,
    pipeline, probOf, salesRows, segMembers, campaignStats, commissions, version: '1.0.0' };
});
