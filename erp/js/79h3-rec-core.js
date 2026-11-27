/* ============================================================
   ORBIT BANK RECONCILIATION CORE — rules only (no screens, no storage)
   · bank statement import from CSV (most UAE banks: Date · Description · Reference · Debit / Credit or Amount · Balance),
     dates dd/mm/yyyy, yyyy-mm-dd, dd-MMM-yyyy, amounts with commas, (brackets) or DR / CR
   · matching bank lines to ledger lines on the bank account: automatic (same amount, date within N days, reference words
     score), manual one-to-many / many-to-one when the totals agree
   · reconciliation statement: bank closing balance + items in the ledger not yet on the bank
     (deposits in transit, unpresented payments) = ledger balance + items on the bank not yet in the ledger
   Works in the browser (window.REC) and in Node (require).
   ============================================================ */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.REC = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const r2 = n => { const v = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100; return n < 0 ? -v : v; };
  const J = (s, d) => { try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : d; } catch (e) { return d; } };
  const day = v => String(v || '').slice(0, 10);
  const T = n => ({ name: n, text: {} }), M = n => ({ name: n, text: { allowMultipleLines: true, textType: 'plain' } }), N = n => ({ name: n, number: {} });
  const LISTS = {
    Fin_BankStatements: ['Account', 'StatementNo', 'FromDate', 'ToDate', 'Status', 'FileName', 'ReconciledBy', 'ReconciledAt'].map(T).concat(['OpeningBal', 'ClosingBal'].map(N)).concat([M('Notes'), M('History'), M('Cleared')]),
    Fin_BankLines: ['StatementId', 'Account', 'LineDate', 'Description', 'Ref', 'Status', 'JournalNo'].map(T).concat(['Amount', 'Balance', 'Seq'].map(N)).concat([M('Matched')]),
  };
  const stmtFromRow = r => ({ id: Number(r.id), account: String(r.account || ''), no: r.statementno || r.title || '', from: day(r.fromdate), to: day(r.todate), status: r.status || 'open', file: r.filename || '', opening: Number(r.openingbal) || 0, closing: Number(r.closingbal) || 0, notes: r.notes || '', by: r.reconciledby || '', at: r.reconciledat || '', history: J(r.history, []), cleared: J(r.cleared, []).map(String) });
  const lineFromRow = r => ({ id: Number(r.id), stmt: String(r.statementid || ''), account: String(r.account || ''), date: day(r.linedate), desc: r.description || '', ref: r.ref || '', status: r.status || 'open', journal: r.journalno || '', amount: Number(r.amount) || 0, balance: r.balance === '' || r.balance == null ? null : Number(r.balance), seq: Number(r.seq) || 0, matched: J(r.matched, []).map(String) });

  /* ---------- CSV import ---------- */
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function parseDate(s, order) {
    s = String(s || '').trim().replace(/\s+\d{1,2}:\d\d(:\d\d)?\s*(am|pm)?$/i, ''); let m;
    if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s))) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    if ((m = /^(\d{1,2})[-/. ]([A-Za-z]{3})[A-Za-z]*[-/. ,]+(\d{2,4})$/.exec(s))) { const mo = MON[m[2].toLowerCase()]; if (!mo) return ''; const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + String(mo).padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
    if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; const [d, mo] = order === 'mdy' ? [m[2], m[1]] : [m[1], m[2]]; if (Number(mo) > 12 || Number(d) > 31) return ''; return y + '-' + mo.padStart(2, '0') + '-' + d.padStart(2, '0'); }
    return '';
  }
  function parseAmt(s) {
    let t = String(s == null ? '' : s).trim(); if (!t) return null; let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); } if (/\bDR\b|-\s*$/i.test(t)) neg = true; if (/^-/.test(t)) neg = true;
    t = t.replace(/AED|DR|CR|[,\s+-]/gi, ''); if (!t || isNaN(Number(t))) return null; const v = Number(t); return neg ? -v : v;
  }
  function splitCsv(text) {
    const first = String(text).split(/\r?\n/).find(l => l.trim()) || '', d = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
    const rows = []; let row = [], cur = '', q = false; const s = String(text);
    for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === d) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c; }
    if (cur || row.length) { row.push(cur); rows.push(row); } return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x));
  }
  const COLS = { date: /^(transaction |txn |posting |value |book(ing)? )?date$|^date$/i, desc: /desc|narrat|detail|particular|remark|transaction$|^memo/i, ref: /ref|cheque|chq|document/i, debit: /debit|withdraw|money out|paid out|^dr$|outflow/i, credit: /credit|deposit|money in|paid in|^cr$|inflow/i, amount: /^amount|^amt|transaction amount/i, balance: /balance/i };
  function parseStatement(text, order) {
    const rows = splitCsv(text), out = [], errs = []; let hi = rows.findIndex(r => r.some(c => COLS.date.test(c)) && (r.some(c => COLS.amount.test(c)) || r.some(c => COLS.debit.test(c)) || r.some(c => COLS.credit.test(c))));
    if (hi < 0) return { rows: [], errors: ['No header row found — the file needs a Date column and Amount (or Debit / Credit) columns'], columns: {} };
    const h = rows[hi], col = {}; Object.entries(COLS).forEach(([k, re]) => { const i = h.findIndex((c, j) => re.test(c) && !Object.values(col).includes(j) && !(k === 'desc' && COLS.date.test(c))); if (i >= 0) col[k] = i; });
    if (col.debit != null && col.credit === col.debit) delete col.credit;
    rows.slice(hi + 1).forEach((r, k) => { const date = parseDate(r[col.date], order); if (!date) { if (r.filter(x => x).length > 1 && k < rows.length) errs.push('Row ' + (hi + k + 2) + ': date "' + (r[col.date] || '') + '" not recognised — skipped'); return; }
      let amt = null; if (col.amount != null) amt = parseAmt(r[col.amount]); if (amt == null && (col.debit != null || col.credit != null)) { const dr = col.debit != null ? parseAmt(r[col.debit]) : null, cr = col.credit != null ? parseAmt(r[col.credit]) : null; amt = (cr ? Math.abs(cr) : 0) - (dr ? Math.abs(dr) : 0); }
      if (amt == null || !amt) return; out.push({ date, desc: col.desc != null ? r[col.desc] : '', ref: col.ref != null ? r[col.ref] : '', amount: r2(amt), balance: col.balance != null ? parseAmt(r[col.balance]) : null, seq: out.length + 1 }); });
    if (!out.length && !errs.length) errs.push('No transactions found under the header row');
    return { rows: out, errors: errs.slice(0, 12), columns: Object.fromEntries(Object.entries(col).map(([k, i]) => [k, h[i]])) };
  }
  /* opening / closing from the running balance column, when there is one */
  function balancesOf(rows) { const b = rows.filter(r => r.balance != null); if (!b.length) return null; const f = b[0], l = b[b.length - 1]; const asc = rows.length < 2 || rows[0].date <= rows[rows.length - 1].date; return asc ? { opening: r2(f.balance - f.amount), closing: r2(l.balance) } : { opening: r2(l.balance - l.amount), closing: r2(f.balance) }; }

  /* ---------- ledger side ---------- */
  const ledAmt = l => r2((Number(l.debit) || 0) - (Number(l.credit) || 0));   /* money into the bank = + */
  /* ledger lines already accounted for: matched to a bank line, or marked cleared on a statement (items before the first statement) */
  const cleared = (blines, stmts) => { const s = new Set(); (blines || []).forEach(b => b.matched.forEach(id => s.add(String(id)))); (stmts || []).forEach(t => (t.cleared || []).forEach(id => s.add(String(id)))); return s; };
  const words = s => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 || /\d{3,}/.test(w)));
  /* automatic matching: same amount (to the fils), date within `days`, best reference / description overlap, nearest date; one-to-one */
  function autoMatch(bank, ledger, days) {
    const lim = days == null ? 5 : days, cand = [];
    bank.forEach(b => { const bw = words(b.desc + ' ' + b.ref); ledger.forEach(l => { const a = ledAmt(l); if (Math.abs(a - b.amount) > 0.004) return; const dd = Math.abs((new Date(b.date) - new Date(l.date)) / 864e5); if (dd > lim) return;
      const lw = words(l.description + ' ' + l.docRef + ' ' + l.entryNo + ' ' + l.partyName); let ov = 0; lw.forEach(w => { if (bw.has(w)) ov++; }); cand.push({ b: b.id, l: String(l.id), score: ov * 10 - dd }); }); });
    cand.sort((x, y) => y.score - x.score); const ub = new Set(), ul = new Set(), out = [];
    cand.forEach(c => { if (ub.has(c.b) || ul.has(c.l)) return; ub.add(c.b); ul.add(c.l); out.push({ bank: c.b, ledger: [c.l] }); });
    return out;
  }
  function checkMatch(bankSel, ledSel) { const bs = r2(bankSel.reduce((s, b) => s + b.amount, 0)), ls = r2(ledSel.reduce((s, l) => s + ledAmt(l), 0)); const E = []; if (!bankSel.length) E.push('Tick at least one bank line'); if (!ledSel.length) E.push('Tick at least one ledger line'); if (bankSel.length > 1 && ledSel.length > 1) E.push('Match one bank line to several ledger lines, or several bank lines to one ledger line'); if (bs !== ls) E.push('Totals differ: bank ' + bs.toFixed(2) + ' vs ledger ' + ls.toFixed(2)); return { ok: !E.length, errors: E, bank: bs, ledger: ls }; }

  /* ---------- reconciliation statement ---------- */
  function summary(stmt, slines, allBankLines, ledgerLines, allStmts) {
    const clr = cleared(allBankLines, allStmts || [stmt]), own = ledgerLines.filter(l => l.account === stmt.account), upto = own.filter(l => l.date <= stmt.to);
    const ledger = r2(upto.reduce((s, l) => s + ledAmt(l), 0)), unc = upto.filter(l => !clr.has(String(l.id)));
    const transit = unc.filter(l => ledAmt(l) > 0), unpres = unc.filter(l => ledAmt(l) < 0), unrec = slines.filter(b => !b.matched.length);
    const sumL = a => r2(a.reduce((s, l) => s + ledAmt(l), 0)), sumB = a => r2(a.reduce((s, b) => s + b.amount, 0));
    const adjBank = r2(stmt.closing + sumL(transit) + sumL(unpres)), adjLedger = r2(ledger + sumB(unrec)), lineTotal = r2(stmt.opening + sumB(slines));
    return { closing: stmt.closing, ledger, transit, unpresented: unpres, unrecorded: unrec, transitTotal: sumL(transit), unpresTotal: sumL(unpres), unrecTotal: sumB(unrec), adjBank, adjLedger, diff: r2(adjBank - adjLedger), statementOk: Math.abs(lineTotal - stmt.closing) < 0.005, lineTotal, matched: slines.filter(b => b.matched.length).length, open: unrec.length, done: Math.abs(adjBank - adjLedger) < 0.005 && !unrec.length };
  }
  return { r2, LISTS, LIST_NAMES: Object.keys(LISTS), stmtFromRow, lineFromRow, parseDate, parseAmt, splitCsv, parseStatement, balancesOf, ledAmt, cleared, autoMatch, checkMatch, summary, version: '1.0.0' };
});
