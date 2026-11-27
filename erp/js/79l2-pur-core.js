/* ============================================================
   ORBIT PROCUREMENT CORE — rules only (no screens, no storage)
   purchase request → (RFQ to several suppliers → quotations → comparison → award) → purchase order → approval →
   sent → goods receipt (stock items into stock at the PO price, against goods received not invoiced) →
   supplier invoice: 3-way match (ordered · received · invoiced, quantity and price tolerance) → purchase bill
   Works in the browser (window.PUR) and in Node (require).
   ============================================================ */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.PUR = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const r2 = n => { const v = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100; return n < 0 ? -v : v; };
  const r3 = n => Math.round(n * 1000) / 1000;
  const num = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
  const J = (s, d) => { try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : d; } catch (e) { return d; } };
  const day = v => String(v || '').slice(0, 10);
  const VAT = { S: 5, Z: 0, E: 0, O: 0 };
  const T = n => ({ name: n, text: {} }), M = n => ({ name: n, text: { allowMultipleLines: true, textType: 'plain' } }), N = n => ({ name: n, number: {} });
  const LISTS = {
    Pur_Settings: ['PrPrefix', 'RfqPrefix', 'PoPrefix', 'GrnPrefix', 'DefaultWh'].map(T).concat(['QtyTolPct', 'PriceTolPct'].map(N)).concat([M('PoTerms')]),
    Pur_Requests: ['ReqNo', 'ReqDate', 'NeedBy', 'Department', 'CostCenter', 'Requester', 'Purpose', 'Status', 'PoNos'].map(T).concat([N('Total'), M('LinesJson'), M('History')]),
    Pur_RFQs: ['RfqNo', 'RfqDate', 'DueDate', 'ReqId', 'ReqNo', 'Department', 'Status', 'AwardedTo', 'PoNo'].map(T).concat([M('Suppliers'), M('LinesJson'), M('Notes'), M('History')]),
    Pur_Quotes: ['RfqId', 'SupplierId', 'SupplierName', 'QuoteRef', 'QuoteDate', 'ValidTo', 'PayTerms', 'Status'].map(T).concat(['DeliveryDays', 'Net', 'Vat', 'Total'].map(N)).concat([M('LinesJson'), M('Notes')]),
    Pur_Orders: ['PoNo', 'PoDate', 'SupplierId', 'SupplierName', 'SupplierTrn', 'ReqId', 'ReqNo', 'RfqNo', 'Department', 'CostCenter', 'DeliveryDate', 'DeliverTo', 'PayTerms', 'Status', 'Requester', 'BillNos'].map(T).concat(['Net', 'Vat', 'Total'].map(N)).concat([M('LinesJson'), M('Terms'), M('History'), M('PendingInv')]),
    Pur_Receipts: ['GrnNo', 'PoId', 'PoNo', 'GrnDate', 'Wh', 'StockDoc', 'DeliveryNote', 'ReceivedBy'].map(T).concat([N('Value'), M('LinesJson'), M('Notes')]),
  };
  const settingsFromRow = r => { r = r || {}; return { id: r.id ? Number(r.id) : null, pr: r.prprefix || 'PR', rfq: r.rfqprefix || 'RFQ', po: r.poprefix || 'PO', grn: r.grnprefix || 'GRN', wh: r.defaultwh || 'MAIN', qtyTol: r.qtytolpct === '' || r.qtytolpct == null ? 0 : num(r.qtytolpct), priceTol: r.pricetolpct === '' || r.pricetolpct == null ? 2 : num(r.pricetolpct), terms: r.poterms || 'Delivery to the address above. Please quote the PO number on the delivery note and the tax invoice. Prices include all charges unless stated. Payment as per the terms above after receipt of goods and a valid tax invoice.' }; };
  const reqFromRow = r => ({ id: Number(r.id), no: r.reqno || '', date: day(r.reqdate), needBy: day(r.needby), dept: r.department || '', cc: r.costcenter || '', requester: String(r.requester || '').toLowerCase(), purpose: r.purpose || '', status: r.status || 'draft', poNos: r.ponos || '', total: num(r.total), lines: J(r.linesjson, []), history: J(r.history, []) });
  const rfqFromRow = r => ({ id: Number(r.id), no: r.rfqno || '', date: day(r.rfqdate), due: day(r.duedate), reqId: String(r.reqid || ''), reqNo: r.reqno || '', dept: r.department || '', status: r.status || 'open', awardedTo: r.awardedto || '', poNo: r.pono || '', suppliers: J(r.suppliers, []), lines: J(r.linesjson, []), notes: r.notes || '', history: J(r.history, []) });
  const quoteFromRow = r => ({ id: Number(r.id), rfq: String(r.rfqid || ''), supplierId: String(r.supplierid || ''), supplier: r.suppliername || '', ref: r.quoteref || '', date: day(r.quotedate), validTo: day(r.validto), payTerms: r.payterms || '', status: r.status || 'received', days: num(r.deliverydays), net: num(r.net), vat: num(r.vat), total: num(r.total), lines: J(r.linesjson, []), notes: r.notes || '' });
  const poFromRow = r => ({ id: Number(r.id), no: r.pono || '', date: day(r.podate), supplierId: String(r.supplierid || ''), supplier: r.suppliername || '', trn: r.suppliertrn || '', reqId: String(r.reqid || ''), reqNo: r.reqno || '', rfqNo: r.rfqno || '', dept: r.department || '', cc: r.costcenter || '', delivery: day(r.deliverydate), deliverTo: r.deliverto || '', payTerms: r.payterms || '', status: r.status || 'draft', requester: String(r.requester || '').toLowerCase(), billNos: r.billnos || '', net: num(r.net), vat: num(r.vat), total: num(r.total), lines: J(r.linesjson, []), terms: r.terms || '', history: J(r.history, []), pendingInv: J(r.pendinginv, null) });
  const grnFromRow = r => ({ id: Number(r.id), no: r.grnno || '', po: String(r.poid || ''), poNo: r.pono || '', date: day(r.grndate), wh: r.wh || '', stockDoc: r.stockdoc || '', dn: r.deliverynote || '', by: r.receivedby || '', value: num(r.value), lines: J(r.linesjson, []), notes: r.notes || '' });

  /* ---------- amounts ---------- */
  function totals(lines, priceKey) { const k = priceKey || 'price'; let net = 0, vat = 0; const out = (lines || []).map(l => { const n = r2(num(l.qty) * num(l[k])), v = r2(n * (VAT[l.vat || 'S'] || 0) / 100); net += n; vat += v; return Object.assign({}, l, { net: n, vatAmt: v }); }); return { lines: out, net: r2(net), vat: r2(vat), total: r2(net + vat) }; }
  function checkLines(lines, needPrice) { const E = []; if (!(lines || []).length) E.push('Add at least one line'); (lines || []).forEach((l, i) => { if (!String(l.description || l.code || '').trim()) E.push('Line ' + (i + 1) + ': description is required'); if (!(num(l.qty) > 0)) E.push('Line ' + (i + 1) + ': quantity must be more than zero'); if (needPrice && num(l.price) < 0) E.push('Line ' + (i + 1) + ': price cannot be negative'); }); return E; }

  /* ---------- quotation comparison ---------- */
  function compare(rfq, quotes) {
    const qs = (quotes || []).filter(q => q.rfq === String(rfq.id) && q.status !== 'withdrawn');
    const rows = rfq.lines.map((l, i) => { const prices = qs.map(q => { const ql = (q.lines || [])[i] || {}; return ql.price === '' || ql.price == null ? null : num(ql.price); }); const valid = prices.filter(p => p != null && p > 0), best = valid.length ? Math.min(...valid) : null; return { i, description: l.description, code: l.code || '', qty: num(l.qty), uom: l.uom || '', prices, best }; });
    const tot = qs.map(q => { const t = totals(rfq.lines.map((l, i) => Object.assign({}, l, { price: num(((q.lines || [])[i] || {}).price), vat: l.vat || 'S' }))); const missing = rfq.lines.filter((l, i) => { const p = ((q.lines || [])[i] || {}).price; return p === '' || p == null; }).length; return { id: q.id, supplier: q.supplier, net: t.net, total: t.total, days: q.days, payTerms: q.payTerms, missing, validTo: q.validTo }; });
    const complete = tot.filter(t => !t.missing), cheapest = complete.length ? complete.reduce((a, b) => b.net < a.net ? b : a) : null;
    return { quotes: qs, rows, totals: tot, cheapest: cheapest ? cheapest.id : null };
  }

  /* ---------- receiving and the 3-way match ---------- */
  const open = l => r3(num(l.qty) - num(l.received));
  function poStatus(po) {
    if (['draft', 'pending', 'rejected', 'cancelled', 'closed'].includes(po.status)) return po.status;
    const rec = po.lines.every(l => num(l.received) >= num(l.qty) - 0.0005), any = po.lines.some(l => num(l.received) > 0), billed = po.lines.every(l => num(l.billed) >= num(l.received) - 0.0005 && num(l.received) > 0);
    return rec && billed ? 'billed' : rec ? 'received' : any ? 'partial' : (po.status === 'sent' ? 'sent' : 'approved');
  }
  function checkReceipt(po, qtys, set) {
    const E = [], tol = num((set || {}).qtyTol) / 100; let any = false;
    po.lines.forEach((l, i) => { const q = num(qtys[i]); if (!q) return; any = true; if (q < 0) E.push('Line ' + (i + 1) + ': quantity cannot be negative'); const max = r3(num(l.qty) * (1 + tol) - num(l.received)); if (q > max + 0.0005) E.push('Line ' + (i + 1) + ': only ' + Math.max(0, max) + ' ' + (l.uom || '') + ' still to receive'); });
    if (!any) E.push('Enter the quantity received on at least one line'); if (!['approved', 'sent', 'partial'].includes(po.status)) E.push('The purchase order is ' + po.status + ' — it must be approved first'); return E;
  }
  /* bill lines: invoiced quantity and price per PO line vs received and ordered (3-way) */
  function match(po, inv, set) {
    const tq = num((set || {}).qtyTol) / 100, tp = num((set || {}).priceTol) / 100, rows = [];
    po.lines.forEach((l, i) => { const x = inv[i] || {}, q = num(x.qty), p = x.price === '' || x.price == null ? num(l.price) : num(x.price); if (!q) return;
      const canBill = r3(num(l.received) - num(l.billed)), qOk = q <= canBill * (1 + tq) + 0.0005, pOk = Math.abs(p - num(l.price)) <= num(l.price) * tp + 0.0005;
      rows.push({ i, description: l.description, code: l.code || '', ordered: num(l.qty), received: num(l.received), billedBefore: num(l.billed), qty: q, poPrice: num(l.price), price: p, qOk, pOk, value: r2(q * p), poValue: r2(q * num(l.price)), variance: r2(q * (p - num(l.price))), vat: l.vat || 'S' }); });
    return { rows, ok: rows.length > 0 && rows.every(r => r.qOk && r.pOk), variance: r2(rows.reduce((s, r) => s + r.variance, 0)), total: totals(rows.map(r => ({ qty: r.qty, price: r.price, vat: r.vat }))) };
  }
  /* purchase bill lines from a match: stock items (received into stock against GRNI) → GRNI at the PO price + price variance;
     services / non-stock → the PO line's account at the invoiced price */
  function billLines(m, po, map) {
    const out = [];
    m.rows.forEach(r => { const l = po.lines[r.i];
      if (l.code && l.stock) { out.push({ account: map.grni, description: (l.code + ' ' + l.description).trim() + ' · ' + po.no, quantity: r.qty, unit_price: r.poPrice, vat_category: r.vat });
        if (r.variance) out.push({ account: map.ppv || map.inv_adjust, description: 'Price variance · ' + l.description + ' · ' + po.no, quantity: 1, unit_price: r.variance, vat_category: r.vat }); }
      else out.push({ account: l.account || map.purchases, description: l.description + ' · ' + po.no, quantity: r.qty, unit_price: r.price, vat_category: r.vat }); });
    return out;
  }
  return { r2, num, J, VAT, LISTS, LIST_NAMES: Object.keys(LISTS), settingsFromRow, reqFromRow, rfqFromRow, quoteFromRow, poFromRow, grnFromRow, totals, checkLines, compare, open, poStatus, checkReceipt, match, billLines, version: '1.0.0' };
});
