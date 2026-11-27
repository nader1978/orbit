/* ============================================================
   ORBIT BUDGETS & FIXED ASSETS CORE — rules only (no screens, no storage)
   BUD · budgets per financial year: lines by account and cost centre, 12 monthly amounts in the account's natural sign
         (income positive, expense positive); spreading, last-year actuals, budget vs actual with favourable / adverse variance;
         ORBIT project budgets (Project_Reg_tbl) as cost-centre budgets, compared with the ledger and ORBIT's project cost records.
   FA  · fixed asset register: categories, straight-line or declining-balance monthly depreciation, opening accumulated
         depreciation for assets brought in from an old system, depreciation runs (catch-up, one journal entry per run),
         disposal with gain / loss, register / movement schedule / forecast / reconciliation with the ledger.
   Works in the browser (window.BFA) and in Node (require).
   ============================================================ */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.BFA = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const r2 = n => { const v = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100; return n < 0 ? -v : v; };
  const num = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
  const J = (s, d) => { try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : d; } catch (e) { return d; } };
  const day = v => String(v || '').slice(0, 10);
  const DEBIT = { asset: true, expense: true, liability: false, equity: false, income: false };
  const T = n => ({ name: n, text: {} }), M = n => ({ name: n, text: { allowMultipleLines: true, textType: 'plain' } }), N = n => ({ name: n, number: {} });
  const MK = Array.from({ length: 12 }, (_, i) => 'M' + (i + 1));

  /* ---------- periods: 'YYYY-MM' ---------- */
  const per = d => String(d || '').slice(0, 7);
  const addM = (p, n) => { const [y, m] = p.split('-').map(Number), t = y * 12 + (m - 1) + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
  const diffM = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 * 12 + m2) - (y1 * 12 + m1); };   /* months from a to b */
  const endOf = p => { const [y, m] = p.split('-').map(Number); return p + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0'); };
  const months = fyStart => Array.from({ length: 12 }, (_, i) => addM(per(fyStart), i));

  /* =====================================================================
     BUDGETS
     ===================================================================== */
  const BUD_LISTS = {
    Bud_Budgets: ['FyStart', 'Version', 'Status', 'Notes', 'ApprovedBy', 'ApprovedAt'].map(T).concat([M('History')]),
    Bud_Lines: ['BudgetId', 'AccountCode', 'CostCenter', 'Notes'].map(T).concat(MK.map(N)).concat([N('Total')]),
  };
  const budFromRow = r => ({ id: Number(r.id), name: r.title || '', fy: day(r.fystart), version: r.version || '1', status: r.status || 'draft', notes: r.notes || '', approvedBy: r.approvedby || '', approvedAt: r.approvedat || '', history: J(r.history, []) });
  const blineFromRow = r => ({ id: Number(r.id), budget: String(r.budgetid || ''), account: String(r.accountcode || ''), cc: r.costcenter || '', notes: r.notes || '', m: MK.map(k => num(r[k.toLowerCase()])) });
  const blineToFields = (l, budgetId) => { const f = { Title: l.account + (l.cc ? ' · ' + l.cc : ''), BudgetId: String(budgetId), AccountCode: String(l.account), CostCenter: l.cc || '', Notes: l.notes || '', Total: r2(l.m.reduce((s, x) => s + num(x), 0)) }; MK.forEach((k, i) => { f[k] = r2(num(l.m[i])); }); return f; };
  const total = m => r2((m || []).reduce((s, x) => s + num(x), 0));

  /* spread an annual amount over 12 months: even, or in proportion to a profile (e.g. last year's months); the last month takes the rounding */
  function spread(amount, profile) {
    const a = num(amount), p = (profile || []).map(x => Math.abs(num(x))), ps = p.reduce((s, x) => s + x, 0), out = [];
    for (let i = 0; i < 12; i++) out.push(r2(ps ? a * (p[i] || 0) / ps : a / 12));
    out[11] = r2(out[11] + a - out.reduce((s, x) => s + x, 0)); return out;
  }
  /* actual ledger amounts per account (and cost centre) per month of a financial year, natural sign */
  function actuals(glLines, accounts, fyStart, opts) {
    const o = opts || {}, ms = months(fyStart), idx = new Map(ms.map((p, i) => [p, i])), A = new Map((accounts || []).map(a => [a.code, a])), out = new Map();
    (glLines || []).forEach(l => { const i = idx.get(per(l.date)); if (i == null) return; const a = A.get(l.account); if (!a || a.group) return; if (o.pnlOnly && !['income', 'expense'].includes(a.type)) return;
      const k = a.code + '|' + (o.byCc ? (l.costCenter || '') : ''), v = DEBIT[a.type] ? num(l.debit) - num(l.credit) : num(l.credit) - num(l.debit), row = out.get(k) || Array(12).fill(0); row[i] = r2(row[i] + v); out.set(k, row); });
    return out;
  }
  /* proposal from last year's actuals ± percent, per account (and cost centre) */
  function fromActuals(glLines, accounts, fyStart, pct, byCc) {
    const last = actuals(glLines, accounts, addM(per(fyStart), -12) + '-' + fyStart.slice(8, 10), { pnlOnly: true, byCc }), f = 1 + num(pct) / 100, out = [];
    last.forEach((m, k) => { const [account, cc] = k.split('|'); if (!m.some(x => x)) return; out.push({ account, cc: cc || '', m: m.map(x => r2(x * f)) }); });
    return out.sort((a, b) => (a.account + a.cc).localeCompare(b.account + b.cc));
  }
  function checkBudget(lines, accounts) {
    const E = [], A = new Map((accounts || []).map(a => [a.code, a])), seen = new Set();
    (lines || []).forEach((l, i) => { const a = A.get(l.account), n = 'Line ' + (i + 1) + ': '; if (!a) E.push(n + 'account ' + (l.account || '(none)') + ' is not in the chart'); else if (a.group) E.push(n + a.code + ' is a group account'); const k = l.account + '|' + (l.cc || ''); if (seen.has(k)) E.push(n + l.account + (l.cc ? ' / ' + l.cc : '') + ' appears twice'); seen.add(k); });
    return E;
  }
  /* budget vs actual. upTo = last month included ('YYYY-MM'); cc = only that cost centre ('' = all); group: 'account' | 'parent' | 'type' */
  function compare(blines, glLines, accounts, fyStart, upTo, cc, group) {
    const ms = months(fyStart), n = Math.max(0, Math.min(12, ms.indexOf(upTo) + 1)), A = new Map((accounts || []).map(a => [a.code, a]));
    const act = actuals(glLines, accounts, fyStart, { byCc: true }), rows = new Map(), keyOf = a => group === 'type' ? a.type : group === 'parent' ? (a.parent || a.code) : a.code;
    const nameOf = (a, k) => group === 'type' ? ({ income: 'Income', expense: 'Expenses', asset: 'Assets', liability: 'Liabilities', equity: 'Equity' })[k] : group === 'parent' ? ((A.get(k) || a).code + ' ' + (A.get(k) || a).name) : a.code + ' ' + a.name;
    const row = (a) => { const k = keyOf(a); if (!rows.has(k)) rows.set(k, { key: k, name: nameOf(a, k), type: a.type, budMonth: 0, actMonth: 0, budYtd: 0, actYtd: 0, budYear: 0, m: Array(12).fill(0), am: Array(12).fill(0) }); return rows.get(k); };
    (blines || []).forEach(l => { if (cc && (l.cc || '') !== cc) return; const a = A.get(l.account); if (!a) return; const r = row(a); l.m.forEach((v, i) => { r.m[i] = r2(r.m[i] + num(v)); }); });
    act.forEach((m, k) => { const [code, c] = k.split('|'); if (cc && c !== cc) return; const a = A.get(code); if (!a) return; const budgeted = (blines || []).some(l => l.account === code); if (!budgeted && !['income', 'expense'].includes(a.type)) return; const r = row(a); m.forEach((v, i) => { r.am[i] = r2(r.am[i] + v); }); });
    const out = [...rows.values()].map(r => { const i = n - 1; r.budMonth = i >= 0 ? r.m[i] : 0; r.actMonth = i >= 0 ? r.am[i] : 0; r.budYtd = r2(r.m.slice(0, n).reduce((s, x) => s + x, 0)); r.actYtd = r2(r.am.slice(0, n).reduce((s, x) => s + x, 0)); r.budYear = total(r.m);
      const fav = r.type === 'income' ? 1 : -1; r.varYtd = r2((r.actYtd - r.budYtd) * fav); r.varPct = r.budYtd ? r2(r.varYtd / Math.abs(r.budYtd) * 100) : null; r.varMonth = r2((r.actMonth - r.budMonth) * fav); r.used = r.budYear ? r2(r.actYtd / r.budYear * 100) : null; r.forecast = r2(r.actYtd + r.m.slice(n).reduce((s, x) => s + x, 0)); return r; })
      .filter(r => r.budYear || r.actYtd).sort((a, b) => String(a.key).localeCompare(String(b.key)));
    const sum = (t, k) => r2(out.filter(r => r.type === t).reduce((s, r) => s + r[k], 0)), np = k => r2(sum('income', k) - sum('expense', k));
    return { rows: out, months: ms, upTo: n, profit: { budYtd: np('budYtd'), actYtd: np('actYtd'), budYear: np('budYear'), forecast: np('forecast'), varYtd: r2(np('actYtd') - np('budYtd')) }, income: { budYtd: sum('income', 'budYtd'), actYtd: sum('income', 'actYtd') }, expense: { budYtd: sum('expense', 'budYtd'), actYtd: sum('expense', 'actYtd') } };
  }
  /* ORBIT project budgets: Project_Reg_tbl (Budget) and Project_Costs_tbl (Amount) next to the ledger by cost centre = project code */
  function projects(prjRows, costRows, glLines, accounts) {
    const A = new Map((accounts || []).map(a => [a.code, a])), led = new Map(), rec = new Map();
    (glLines || []).forEach(l => { const a = A.get(l.account); if (!a || a.type !== 'expense' || !l.costCenter) return; led.set(l.costCenter, r2((led.get(l.costCenter) || 0) + num(l.debit) - num(l.credit))); });
    (costRows || []).forEach(r => { const c = String(r.projectcode || '').trim(); if (c) rec.set(c, r2((rec.get(c) || 0) + num(r.amount))); });
    return (prjRows || []).map(p => { const c = String(p.projectcode || p.title || '').trim(), b = num(p.budget), l = led.get(c) || 0, o = rec.get(c) || 0;
      return { code: c, name: String(p.projectname || ''), status: String(p.status || ''), budget: b, orbitCost: o, ledger: l, left: r2(b - Math.max(l, o)), used: b ? r2(Math.max(l, o) / b * 100) : null, gap: r2(o - l) }; }).filter(p => p.code);
  }

  /* =====================================================================
     FIXED ASSETS
     ===================================================================== */
  const A2 = (code, name, type, parent, sub) => ({ code, name, type, parent, sub, group: false });
  const FA_COA_ADD = [A2('1505', 'Land & buildings', 'asset', '1500', 'fixed_asset'), A2('4950', 'Gain / loss on disposal of assets', 'income', '4000', 'fa_gain')];
  const CATS = [['Land & buildings', '1505', 240], ['Furniture & fixtures', '1510', 60], ['Vehicles', '1520', 60], ['Machinery & equipment', '1530', 120], ['IT equipment', '1540', 36]];
  const METHODS = { sl: 'Straight line', db: 'Declining balance' };
  const FA_LISTS = {
    FA_Settings: ['AssetPrefix', 'RunPrefix', 'FirstMonth', 'GainAccount'].map(T),
    FA_Categories: ['AssetAccount', 'AccDepAccount', 'DepAccount', 'Method', 'Active'].map(T).concat(['LifeMonths', 'RatePct', 'ResidualPct'].map(N)),
    FA_Assets: ['AssetNo', 'Category', 'AcqDate', 'InService', 'Method', 'Location', 'CostCenter', 'Supplier', 'Serial', 'SrcRef', 'OpenPeriod', 'Status', 'AcqJournal', 'DispDate', 'DispPeriod', 'DispJournal', 'DispAccount', 'Notes'].map(T)
      .concat(['Cost', 'Residual', 'LifeMonths', 'RatePct', 'OpenAccDep', 'DispProceeds', 'DispDep', 'DispGain'].map(N)).concat([M('History')]),
    FA_DepRuns: ['RunNo', 'Period', 'RunDate', 'Status', 'JournalNo', 'ReversedBy', 'PostedBy', 'PostedAt'].map(T).concat([N('Total'), M('LinesJson'), M('History')]),
  };
  const faSettingsFromRow = r => { r = r || {}; return { id: r.id ? Number(r.id) : null, asset: r.assetprefix || 'FA', run: r.runprefix || 'DEP', first: r.firstmonth || 'mid', gain: String(r.gainaccount || '') }; };
  const catFromRow = r => ({ id: Number(r.id), name: r.title || '', assetAcc: String(r.assetaccount || ''), accDepAcc: String(r.accdepaccount || ''), depAcc: String(r.depaccount || ''), method: r.method === 'db' ? 'db' : 'sl', life: num(r.lifemonths), rate: num(r.ratepct), residualPct: num(r.residualpct), active: String(r.active) !== '0' });
  const catToFields = c => ({ Title: c.name, AssetAccount: c.assetAcc, AccDepAccount: c.accDepAcc, DepAccount: c.depAcc, Method: c.method || 'sl', Active: c.active === false ? '0' : '1', LifeMonths: num(c.life), RatePct: num(c.rate), ResidualPct: num(c.residualPct) });
  const assetFromRow = r => ({ id: Number(r.id), no: r.assetno || '', name: r.title || '', cat: r.category || '', acq: day(r.acqdate), inService: day(r.inservice) || day(r.acqdate), method: r.method === 'db' ? 'db' : 'sl', location: r.location || '', cc: r.costcenter || '', supplier: r.supplier || '', serial: r.serial || '', srcRef: r.srcref || '', openPeriod: r.openperiod || '', status: r.status || 'active', acqJournal: r.acqjournal || '',
    dispDate: day(r.dispdate), dispPeriod: r.dispperiod || '', dispJournal: r.dispjournal || '', dispAccount: String(r.dispaccount || ''), notes: r.notes || '', cost: num(r.cost), residual: num(r.residual), life: num(r.lifemonths), rate: num(r.ratepct), openAcc: num(r.openaccdep), proceeds: num(r.dispproceeds), dispDep: num(r.dispdep), gain: num(r.dispgain), history: J(r.history, []) });
  const assetToFields = a => ({ Title: a.name, AssetNo: a.no, Category: a.cat, AcqDate: a.acq, InService: a.inService || a.acq, Method: a.method || 'sl', Location: a.location || '', CostCenter: a.cc || '', Supplier: a.supplier || '', Serial: a.serial || '', SrcRef: a.srcRef || '', OpenPeriod: a.openPeriod || '', Notes: a.notes || '', Cost: r2(num(a.cost)), Residual: r2(num(a.residual)), LifeMonths: num(a.life), RatePct: num(a.rate), OpenAccDep: r2(num(a.openAcc)) });
  const runFromRow = r => ({ id: Number(r.id), no: r.runno || '', period: r.period || '', date: day(r.rundate), status: r.status || 'draft', journal: r.journalno || '', reversedBy: r.reversedby || '', total: num(r.total), lines: J(r.linesjson, []), history: J(r.history, []) });

  /* first month depreciated: in-service by the 15th → that month, otherwise the next ('mid'); 'full' → always that month; 'next' → always the next */
  const startPeriod = (a, rule) => { const p = per(a.inService || a.acq), d = Number(String(a.inService || a.acq).slice(8, 10)) || 1; return rule === 'full' ? p : rule === 'next' ? addM(p, 1) : (d <= 15 ? p : addM(p, 1)); };
  const depreciable = a => r2(num(a.cost) - num(a.residual));
  /* charge for one month, given the accumulated depreciation before it and how many months have been charged (incl. the opening) */
  /* straight line: the same amount every month — what was left after the opening, over the months left — and the last month takes the rest */
  const slBase = (a, rule) => { const at = a.openPeriod ? Math.max(0, diffM(startPeriod(a, rule), a.openPeriod) + 1) : 0; return r2((depreciable(a) - num(a.openAcc)) / Math.max(1, num(a.life) - at)); };
  function monthCharge(a, acc, done, rule) {
    const left = r2(depreciable(a) - acc); if (left <= 0.004) return 0;
    if (a.method === 'db') { const c = r2((num(a.cost) - acc) * num(a.rate) / 100 / 12); return Math.min(c, left); }
    return num(a.life) - done <= 1 ? left : Math.min(slBase(a, rule), left);
  }
  /* last period already depreciated for an asset (opening, posted runs, disposal) — null when none */
  function lastPeriod(a, runs) {
    let p = a.openPeriod || null; (runs || []).filter(r => r.status === 'posted').forEach(r => (r.lines || []).forEach(l => { if (String(l.asset) === String(a.id) && (!p || l.to > p)) p = l.to; }));
    if (a.status === 'disposed' && a.dispPeriod && (!p || a.dispPeriod > p)) p = a.dispPeriod; return p;
  }
  function accumulated(a, runs, upTo) {
    let acc = num(a.openAcc); (runs || []).filter(r => r.status === 'posted').forEach(r => (r.lines || []).forEach(l => { if (String(l.asset) !== String(a.id)) return; if (!upTo || l.to <= upTo) acc += num(l.amount); else if (l.p) l.p.forEach(([pp, v]) => { if (pp <= upTo) acc += num(v); }); }));   /* l.p: the months inside a catch-up line */
    if (a.status === 'disposed' && (!upTo || a.dispPeriod <= upTo)) acc += num(a.dispDep); return r2(acc);
  }
  /* depreciation of one asset for the months after its last depreciated period up to `to` */
  function charges(a, runs, to, rule) {
    const s = startPeriod(a, rule), lp = lastPeriod(a, runs), from = lp ? addM(lp, 1) : s, list = [];
    let acc = accumulated(a, runs), done = lp ? Math.max(0, diffM(s, lp) + 1) : 0;
    for (let p = from < s ? s : from; p <= to; p = addM(p, 1)) { const c = monthCharge(a, acc, done, rule); done++; if (!c) continue; acc = r2(acc + c); list.push({ period: p, amount: c }); }
    return list;
  }
  /* depreciation run: every active asset in service, catch-up included. Returns run lines + journal entry */
  function run(assets, cats, runs, period, map, rule) {
    const C = new Map((cats || []).map(c => [c.name, c])), lines = [], E = [], last = (runs || []).filter(r => r.status === 'posted').map(r => r.period).sort().pop();
    if (!/^\d{4}-\d\d$/.test(period || '')) E.push('Choose the period');
    if (last && period <= last) E.push('Depreciation is already posted up to ' + last + ' — reverse that run first or choose a later month');
    (assets || []).filter(a => a.status === 'active').forEach(a => { const c = C.get(a.cat); if (!c) { E.push(a.no + ': category "' + a.cat + '" not found'); return; }
      const ch = charges(a, runs, period, rule); if (!ch.length) return; const amt = r2(ch.reduce((s, x) => s + x.amount, 0));
      lines.push({ asset: a.id, no: a.no, name: a.name, from: ch[0].period, to: period, months: ch.length, amount: amt, p: ch.length > 1 ? ch.map(x => [x.period, x.amount]) : undefined, dep: c.depAcc || map.fa_dep, acc: c.accDepAcc || map.fa_accdep, cc: a.cc || '' }); });
    const g = new Map(); lines.forEach(l => { const k1 = 'D|' + l.dep + '|' + l.cc, k2 = 'C|' + l.acc; g.set(k1, r2((g.get(k1) || 0) + l.amount)); g.set(k2, r2((g.get(k2) || 0) + l.amount)); });
    const jl = [...g.entries()].map(([k, v]) => { const [s, a, cc] = k.split('|'); return { account: a, debit: s === 'D' ? v : 0, credit: s === 'C' ? v : 0, costCenter: cc || '', description: 'Depreciation ' + period }; });
    const tot = r2(lines.reduce((s, l) => s + l.amount, 0));
    return { ok: !E.length, errors: E, lines, total: tot, entry: tot ? { date: endOf(period), memo: 'Depreciation ' + period, source: 'depreciation', lines: jl } : null };
  }
  /* disposal: catch-up depreciation to the disposal month (in the month only when after the 15th), then remove cost and accumulated depreciation */
  function disposal(a, cat, runs, date, proceeds, recvAcc, map, rule) {
    const E = [], p = per(date), d = Number(String(date).slice(8, 10)) || 1, to = d > 15 ? p : addM(p, -1), lp = lastPeriod(a, runs);
    if (a.status !== 'active') E.push('The asset is not active'); if (!date) E.push('Choose the disposal date'); if (date && date < a.acq) E.push('Disposal is before the acquisition date');
    if (lp && lp > p) E.push('Depreciation is already posted after this date (up to ' + lp + ') — reverse those runs first'); if (num(proceeds) < 0) E.push('Proceeds cannot be negative'); if (num(proceeds) > 0 && !recvAcc) E.push('Choose where the proceeds were received');
    const ch = E.length ? [] : charges(a, runs, to, rule), catch_ = r2(ch.reduce((s, x) => s + x.amount, 0)), accPrev = accumulated(a, runs), accAll = r2(accPrev + catch_), nbv = r2(num(a.cost) - accAll), gain = r2(num(proceeds) - nbv);
    const c = cat || {}, ga = map.fa_gain, L = [], label = 'Disposal ' + a.no + ' — ' + a.name;
    if (catch_) L.push({ account: c.depAcc || map.fa_dep, debit: catch_, credit: 0, costCenter: a.cc || '', description: 'Depreciation to disposal — ' + a.no });
    if (accPrev) L.push({ account: c.accDepAcc || map.fa_accdep, debit: accPrev, credit: 0, description: label });   /* the catch-up month(s) are charged and removed in the same entry, so only what was there before is debited */
    if (num(proceeds)) L.push({ account: recvAcc, debit: r2(num(proceeds)), credit: 0, description: label });
    L.push({ account: c.assetAcc, debit: 0, credit: r2(num(a.cost)), description: label });
    if (gain) L.push({ account: ga, debit: gain < 0 ? -gain : 0, credit: gain > 0 ? gain : 0, description: (gain > 0 ? 'Gain' : 'Loss') + ' on disposal — ' + a.no });
    if (!c.assetAcc) E.push('The category has no asset account'); if (gain && !ga) E.push('Set the gain / loss on disposal account in Asset Settings');
    return { ok: !E.length, errors: E, catchUp: catch_, catchTo: ch.length ? to : (lp || ''), accumulated: accAll, nbv, gain, entry: { date, memo: label, source: 'asset_disposal', ref: 'FADISP:' + a.id, lines: L } };
  }
  /* acquisition entry for an asset entered by hand (an asset from a purchase bill is already in the ledger) */
  function acquisition(a, cat, creditAcc, map) {
    const c = cat || {}, L = [{ account: c.assetAcc, debit: r2(num(a.cost)), credit: 0, description: 'Asset ' + a.no + ' — ' + a.name }];
    if (num(a.openAcc)) L.push({ account: c.accDepAcc || map.fa_accdep, debit: 0, credit: r2(num(a.openAcc)), description: 'Accumulated depreciation brought in — ' + a.no });
    L.push({ account: creditAcc, debit: 0, credit: r2(num(a.cost) - num(a.openAcc)), description: 'Asset ' + a.no + ' — ' + a.name });
    return { date: a.acq, memo: 'Asset ' + a.no + ' — ' + a.name, source: 'asset', ref: 'FAACQ:' + a.id, lines: L.filter(l => l.debit || l.credit) };
  }
  function checkAsset(a, cats, assets) {
    const E = [], c = (cats || []).find(x => x.name === a.cat);
    if (!a.name) E.push('Name is required'); if (!c) E.push('Choose the category'); if (!/^\d{4}-\d\d-\d\d$/.test(a.acq || '')) E.push('Acquisition date is required');
    if (a.inService && a.inService < a.acq) E.push('In service cannot be before the acquisition date');
    if (!(num(a.cost) > 0)) E.push('Cost must be more than zero'); if (num(a.residual) < 0 || num(a.residual) >= num(a.cost)) E.push('Residual value must be zero or more and less than the cost');
    if (a.method === 'sl' && !(num(a.life) > 0)) E.push('Useful life (months) is required'); if (a.method === 'db' && !(num(a.rate) > 0 && num(a.rate) < 100)) E.push('Rate % (declining balance) must be between 0 and 100');
    if (num(a.openAcc) < 0 || num(a.openAcc) > depreciable(a)) E.push('Opening accumulated depreciation must be between 0 and cost − residual');
    if (num(a.openAcc) && !/^\d{4}-\d\d$/.test(a.openPeriod || '')) E.push('Say up to which month the opening depreciation was charged');
    if ((assets || []).some(x => x.no && x.no === a.no && x.id !== a.id)) E.push('Asset number ' + a.no + ' is already used');
    return E;
  }
  /* reports */
  function register(assets, runs, asOf) {
    const p = per(asOf);
    return (assets || []).filter(a => a.acq <= asOf && !(a.status === 'disposed' && a.dispDate && a.dispDate <= asOf)).map(a => { const acc = accumulated(a, runs, p); return { id: a.id, no: a.no, name: a.name, cat: a.cat, acq: a.acq, cost: a.cost, acc, nbv: r2(a.cost - acc), cc: a.cc, location: a.location }; });
  }
  /* fixed asset note for a period: cost and accumulated depreciation, opening → additions / charge → disposals → closing */
  function movement(assets, runs, from, to) {
    const pf = addM(per(from), -1), pt = per(to), S = new Map(), row = c => S.get(c) || S.set(c, { cat: c, oc: 0, add: 0, disp: 0, oa: 0, bi: 0, chg: 0, da: 0 }).get(c);
    (assets || []).forEach(a => { const inOpen = a.acq < from && !(a.status === 'disposed' && a.dispDate < from), added = a.acq >= from && a.acq <= to, gone = a.status === 'disposed' && a.dispDate >= from && a.dispDate <= to;
      if (!inOpen && !added) return; const r = row(a.cat), ao = inOpen ? accumulated(a, runs, pf) : 0, ae = accumulated(a, runs, pt), bi = added ? num(a.openAcc) : 0;
      if (inOpen) { r.oc += a.cost; r.oa += ao; } if (added) { r.add += a.cost; r.bi += bi; } r.chg += ae - ao - bi; if (gone) { r.disp += a.cost; r.da += ae; } });
    return [...S.values()].map(r => { const cc = r2(r.oc + r.add - r.disp), ca = r2(r.oa + r.bi + r.chg - r.da); return { cat: r.cat, openCost: r2(r.oc), additions: r2(r.add), disposals: r2(r.disp), closeCost: cc, openAcc: r2(r.oa), broughtIn: r2(r.bi), charge: r2(r.chg), dispAcc: r2(r.da), closeAcc: ca, nbv: r2(cc - ca) }; }).sort((a, b) => a.cat.localeCompare(b.cat));
  }
  /* what depreciation will be, month by month, if nothing changes */
  function forecast(assets, runs, fromPeriod, n, rule) {
    const ps = Array.from({ length: n }, (_, i) => addM(fromPeriod, i)), to = ps[ps.length - 1], out = new Map();
    (assets || []).filter(a => a.status === 'active').forEach(a => { const ch = charges(a, runs, to, rule), m = out.get(a.cat) || Array(n).fill(0); ch.forEach(x => { const i = ps.indexOf(x.period); if (i >= 0) m[i] = r2(m[i] + x.amount); else if (x.period < fromPeriod) m[0] = r2(m[0] + x.amount); }); out.set(a.cat, m); });
    return { periods: ps, rows: [...out.entries()].map(([cat, m]) => ({ cat, m, total: total(m) })) };
  }
  function reconcileFa(assets, runs, cats, glLines, map, asOf) {
    const p = per(asOf), C = new Map((cats || []).map(c => [c.name, c])), by = new Map(), add = (k, v) => by.set(k, r2((by.get(k) || 0) + v));
    register(assets, runs, asOf).forEach(r => { const c = C.get(r.cat) || {}; add('A|' + c.assetAcc, r.cost); add('D|' + (c.accDepAcc || map.fa_accdep), -r.acc); });
    (cats || []).forEach(c => { if (!by.has('A|' + c.assetAcc)) by.set('A|' + c.assetAcc, 0); if (!by.has('D|' + (c.accDepAcc || map.fa_accdep))) by.set('D|' + (c.accDepAcc || map.fa_accdep), 0); });
    const rows = [...by.entries()].map(([k, reg]) => { const a = k.split('|')[1], gl = r2((glLines || []).filter(l => l.account === a && (!asOf || l.date <= asOf)).reduce((s, l) => s + num(l.debit) - num(l.credit), 0)); return { kind: k[0] === 'A' ? 'Cost' : 'Accumulated depreciation', account: a, register: reg, gl, diff: r2(gl - reg) }; });
    return { rows, ok: rows.every(r => Math.abs(r.diff) < 0.01) };
  }
  const FA_MAP = { fa_dep: ['Depreciation expense', '6700'], fa_accdep: ['Accumulated depreciation', 'acc_dep'], fa_gain: ['Gain / loss on disposal', 'fa_gain'] };
  function faMap(accounts) { const list = (accounts && accounts.length ? accounts : []).concat(FA_COA_ADD), m = {}; Object.entries(FA_MAP).forEach(([k, [, s]]) => { const a = /^\d+$/.test(s) ? list.find(x => x.code === s) : list.find(x => x.sub === s && !x.group); if (a) m[k] = a.code; }); return m; }
  const defaultCats = accounts => { const m = faMap(accounts); return CATS.map(([name, acc, life]) => ({ name, assetAcc: acc, accDepAcc: m.fa_accdep || '1590', depAcc: m.fa_dep || '6700', method: 'sl', life, rate: 0, residualPct: 0, active: true })); };

  return { r2, num, J, per, addM, diffM, endOf, months, MK,
    BUD: { LISTS: BUD_LISTS, budFromRow, blineFromRow, blineToFields, total, spread, actuals, fromActuals, checkBudget, compare, projects },
    FA: { LISTS: FA_LISTS, COA_ADD: FA_COA_ADD, METHODS, MAP: FA_MAP, faMap, defaultCats, faSettingsFromRow, catFromRow, catToFields, assetFromRow, assetToFields, runFromRow, startPeriod, monthCharge, lastPeriod, accumulated, charges, run, disposal, acquisition, checkAsset, register, movement, forecast, reconcile: reconcileFa },
    LISTS: Object.assign({}, BUD_LISTS, FA_LISTS), version: '1.0.0' };
});
