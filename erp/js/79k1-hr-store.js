/* ============================================================
   ORBIT HUMAN RESOURCES — data layer
   HR_* lists sit next to the ledger: SharePoint by default, the ERP server when Finance Settings → Data says "server"
   (HR_Settings always stays in SharePoint). ORBIT's Employees_tbl and Attendance_Data_tbl are read only.
   Payroll: draft run + one payslip row per employee → approved (inputs locked) → posted (journal entry, ref HRPAY:<run>)
   → paid (payment entry, ref HRPAYM:<run>). Each journal entry is found again by its reference on a retry, never doubled.
   Loans, accruals and gratuity provisions count payslips of posted / paid runs only.
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, F = window.FIN, H = window.HR, S = window.FINSTORE; if (!K || !F || !H || !S) return;
  const { A, get, drop, iso, me, today } = K;
  let SET = H.settingsFromRow(null);
  const hist = (h, text) => JSON.stringify((h || []).concat([{ at: iso(), by: me(), text }]).slice(-40));
  async function settings(force) { let rows; try { rows = await get('HR_Settings', null, force); } catch (e) { if (!/not found/i.test(e.message)) throw e; rows = []; } SET = H.settingsFromRow(rows[0]); SET.row = rows[0] || null; return SET; }
  async function saveSettings(f) { const row = SET.row || (await settings(true)).row; if (row) await A().upd('HR_Settings', row.id, f); else await A().add('HR_Settings', Object.assign({ Title: 'HR' }, f)); drop('HR_Settings'); return settings(true); }
  const L = (n, map, f) => S.list(n, f).then(r => r.map(map));
  const emps = f => L('HR_Employees', H.empFromRow, f).then(r => r.sort((a, b) => a.fileNo.localeCompare(b.fileNo, undefined, { numeric: true })));
  const changes = f => S.list('HR_SalaryChanges', f);
  const docs = f => L('HR_Documents', H.docFromRow, f);
  const leaves = f => L('HR_Leaves', H.leaveFromRow, f).then(r => r.sort((a, b) => b.from.localeCompare(a.from)));
  const adjs = f => L('HR_LeaveAdj', H.adjFromRow, f);
  const loans = f => L('HR_Loans', H.loanFromRow, f).then(r => r.sort((a, b) => b.id - a.id));
  const runs = f => L('HR_PayRuns', H.runFromRow, f).then(r => r.sort((a, b) => b.period.localeCompare(a.period) || b.id - a.id));
  const slips = f => L('HR_Payslips', H.slipFromRow, f);
  const sets = f => L('HR_Settlements', H.setFromRow, f);
  const findJe = async ref => (await S.entries(true)).find(e => e.ref === ref && e.status !== 'draft');
  const lockOk = (ctx, date) => { if (ctx.finSet && ctx.finSet.lock && date <= ctx.finSet.lock) throw new Error('The period is locked up to ' + ctx.finSet.lock); };
  const postOnce = async (e, ctx) => { lockOk(ctx, e.date); const done = await findJe(e.ref); if (done) return done.no; const c = F.checkEntry(e, ctx.accts, ctx.finSet); if (!c.ok) throw new Error(c.errors.join(' · ')); return (await S.post(Object.assign(e, { lines: c.lines }))).no; };
  const postedSlips = (rs, ss, exceptRun) => { const ok = new Set(rs.filter(r => ['posted', 'paid'].includes(r.status) && r.id !== exceptRun).map(r => String(r.id))); return ss.filter(s => ok.has(s.run)); };

  /* ---------- employees ---------- */
  async function saveEmp(e, reason) {
    const f = H.empToFields(e);
    if (!e.id) { const r = await S.add('HR_Employees', Object.assign(f, { History: hist([], 'Added') })); e.id = r.id; await S.add('HR_SalaryChanges', { Title: e.fileNo, EmpId: String(e.id), FileNo: e.fileNo, EffDate: e.join, Reason: 'Starting salary', ChangedBy: me(), Basic: f.Basic, Housing: f.Housing, Transport: f.Transport, OtherAllow: f.OtherAllow }); }
    else { const old = (await emps(true)).find(x => x.id === e.id); await S.upd('HR_Employees', e.id, f);
      if (old && H.fixedOf(old) !== H.fixedOf(e) || old && (old.basic !== H.num(e.basic))) await S.add('HR_SalaryChanges', { Title: e.fileNo, EmpId: String(e.id), FileNo: e.fileNo, EffDate: e.effDate || today(), Reason: reason || 'Salary change', ChangedBy: me(), Basic: f.Basic, Housing: f.Housing, Transport: f.Transport, OtherAllow: f.OtherAllow }); }
    S.drop('HR_Employees', 'HR_SalaryChanges'); return e;
  }
  /* ORBIT Employees_tbl → HR employees (new ones added; name, role, grade, status, location kept in step; salary and HR details are never overwritten) */
  async function linkOrbit(onStep) {
    let rows; try { rows = await get('Employees_tbl', null, true); } catch (e) { if (/not found|404/i.test(e.message)) throw new Error('ORBIT\'s staff list Employees_tbl was not found on this site'); throw e; }
    const have = new Map((await emps(true)).map(e => [e.fileNo, e])), out = { added: 0, updated: 0, skipped: 0, total: rows.length };
    for (const r of rows) { const o = H.orbitEmp(r); if (!o.fileNo || !o.name) { out.skipped++; continue; } const ex = have.get(o.fileNo);
      if (!ex) { await S.add('HR_Employees', Object.assign(H.empToFields(Object.assign({ payMethod: 'wps', otEligible: true }, o)), { History: hist([], 'Linked from ORBIT') })); out.added++; }
      else { const ch = {}; [['name', 'Title'], ['position', 'Position'], ['grade', 'Grade'], ['location', 'Location'], ['dept', 'Department'], ['manager', 'Manager'], ['orbitId', 'OrbitId']].forEach(([k, c]) => { if (o[k] && String(o[k]) !== String(ex[k])) ch[c] = String(o[k]); });
        if (!ex.join && o.join) ch.JoinDate = o.join; if (o.status === 'left' && ex.status !== 'left') ch.Status = 'left'; if (Object.keys(ch).length) { await S.upd('HR_Employees', ex.id, ch); out.updated++; } }
      if ((out.added + out.updated) % 10 === 0) onStep && onStep(out.added + out.updated + ' / ' + rows.length); }
    S.drop('HR_Employees'); return out;
  }
  /* ---------- leave ---------- */
  async function saveLeave(l, e) { const f = { Title: e.fileNo + ' ' + l.type, EmpId: String(e.id), FileNo: e.fileNo, LeaveType: l.type, FromDate: l.from, ToDate: l.to, Days: H.leaveDays(l.from, l.to), Status: l.status || 'requested', Reason: l.reason || '' };
    if (f.Status === 'approved') Object.assign(f, { ApprovedBy: me(), ApprovedAt: iso() });
    if (l.id) await S.upd('HR_Leaves', l.id, f); else await S.add('HR_Leaves', Object.assign(f, { History: hist([], f.Status === 'approved' ? 'Entered as approved' : 'Requested') })); S.drop('HR_Leaves'); }
  async function setLeave(l, status) { await S.upd('HR_Leaves', l.id, Object.assign({ Status: status, History: hist(l.history, status.charAt(0).toUpperCase() + status.slice(1)) }, status === 'approved' ? { ApprovedBy: me(), ApprovedAt: iso() } : {})); S.drop('HR_Leaves'); }
  /* ---------- loans ---------- */
  async function saveLoan(l, e, ctx) {
    await settings(true); const no = await S.next('loan', SET.loan), r = await S.add('HR_Loans', { Title: no, LoanNo: no, EmpId: String(e.id), FileNo: e.fileNo, LoanType: l.type, LoanDate: l.date, StartPeriod: l.start, Status: 'active', PaidFrom: l.paidFrom || '', Notes: l.notes || '', Amount: H.r2(H.num(l.amount)), Installment: H.r2(H.num(l.inst)) });
    if (l.paidFrom) { const jno = await postOnce({ date: l.date, memo: (l.type === 'loan' ? 'Loan ' : 'Salary advance ') + no + ' — ' + e.name, source: 'hr_loan', ref: 'HRLN:' + r.id, lines: [{ account: ctx.map.advances, debit: H.r2(H.num(l.amount)), credit: 0, partyType: 'employee', partyName: e.name, description: no + ' — ' + e.name }, { account: l.paidFrom, debit: 0, credit: H.r2(H.num(l.amount)), description: no + ' — ' + e.name }] }, ctx); await S.upd('HR_Loans', r.id, { JournalNo: jno }); }
    S.drop('HR_Loans'); return no;
  }
  /* ---------- payroll ---------- */
  async function ctxData(force) { const [es, ch, lv, ad, ln, rs, ss] = await Promise.all([emps(force), changes(force), leaves(force), adjs(force), loans(force), runs(force), slips(force)]); return { es, ch, lv, ad, ln, rs, ss }; }
  function compute(e, period, inp, X, runId) { return H.payslip(e, period, inp, { set: SET, leaves: X.lv, adjs: X.ad, loans: X.ln, postedSlips: postedSlips(X.rs, X.ss, runId), changes: X.ch }); }
  const inputsOf = s => ({ otN: s.otN, otNight: s.otNight, otRest: s.otRest, otHol: s.otHol, absent: s.absentDays, bonus: s.bonus, otherAdd: s.otherAdd, deduct: s.deduct, notes: s.notes, src: (s.detail || {}).src });
  async function createRun(period, useAtt, onStep) {
    await settings(true); const X = await ctxData(true); if (X.rs.some(r => r.period === period && r.status !== 'cancelled')) throw new Error('There is already a payroll run for ' + period);
    let att = new Map(); if (useAtt) { try { att = H.fromAttendance(await get('Attendance_Data_tbl', null, true), period, SET); } catch (e) { if (!/not found|404/i.test(e.message)) throw e; } }
    const list = X.es.filter(e => e.status !== 'left' || (e.leaveDate && e.leaveDate >= H.monthStart(period))).map(e => { const a = att.get(e.fileNo); return compute(e, period, a ? { otN: a.otN, otRest: a.otRest, otHol: a.otHol, absent: a.absent, src: 'attendance ' + a.days + ' day(s)' } : {}, X, null); }).filter(Boolean);
    if (!list.length) throw new Error('No employees in service in ' + period + ' (check join dates)');
    const no = await S.next('payrun', SET.run), t = H.totals(list), run = await S.add('HR_PayRuns', { Title: no, RunNo: no, Period: period, Status: 'draft', Gross: t.gross, Deductions: t.ded, Net: t.net, Headcount: t.count, History: hist([], 'Created' + (useAtt ? ' · attendance: ' + att.size + ' employee(s)' : '')) });
    let k = 0; for (const s of list) { await S.add('HR_Payslips', H.slipToFields(s, run.id)); if (++k % 10 === 0) onStep && onStep(k + ' / ' + list.length); }
    S.drop('HR_PayRuns', 'HR_Payslips'); return { id: run.id, no, count: list.length, att: att.size };
  }
  async function totalsUpdate(run) { const ss = (await slips(true)).filter(s => s.run === String(run.id)), t = H.totals(ss); await S.upd('HR_PayRuns', run.id, { Gross: t.gross, Deductions: t.ded, Net: t.net, Headcount: t.count }); S.drop('HR_PayRuns'); return t; }
  async function updateSlip(run, slip, inp) { if (run.status !== 'draft') throw new Error('Only a draft run can be changed'); await settings(true); const X = await ctxData(true), e = X.es.find(x => String(x.id) === slip.emp); const s = compute(e, run.period, inp, X, run.id); await S.upd('HR_Payslips', slip.id, H.slipToFields(s, run.id)); S.drop('HR_Payslips'); return totalsUpdate(run); }
  async function recalc(run, onStep) { if (run.status !== 'draft') throw new Error('Only a draft run can be recalculated'); await settings(true); const X = await ctxData(true), mine = X.ss.filter(s => s.run === String(run.id)); let k = 0;
    for (const sl of mine) { const e = X.es.find(x => String(x.id) === sl.emp); if (!e) continue; const s = compute(e, run.period, inputsOf(sl), X, run.id); if (s) await S.upd('HR_Payslips', sl.id, H.slipToFields(s, run.id)); if (++k % 10 === 0) onStep && onStep(k + ' / ' + mine.length); }
    S.drop('HR_Payslips'); return totalsUpdate(run); }
  async function setRun(run, status, extra) { await S.upd('HR_PayRuns', run.id, Object.assign({ Status: status, History: hist(run.history, status.charAt(0).toUpperCase() + status.slice(1)) }, extra || {})); S.drop('HR_PayRuns'); }
  async function postRun(run, ctx) {
    if (run.status !== 'approved') throw new Error('Approve the run first'); await settings(true); const ss = (await slips(true)).filter(s => s.run === String(run.id));
    if (ss.some(s => s.net < 0)) throw new Error('Some payslips have negative net pay');
    const e = H.journal(ss, run.period, ctx.map); e.ref = 'HRPAY:' + run.id; const jno = await postOnce(e, ctx);
    await setRun(run, 'posted', { JournalNo: jno, PostedBy: me(), PostedAt: iso() });
    /* loans fully repaid are closed */
    const all = await slips(true), rs = await runs(true), ps = postedSlips(rs, all); for (const l of (await loans(true)).filter(x => x.status === 'active')) if (H.loanBalance(l, ps) <= 0.004) await S.upd('HR_Loans', l.id, { Status: 'closed' });
    S.drop('HR_Loans'); return jno;
  }
  async function payRun(run, paidFrom, date, ctx) { if (run.status !== 'posted') throw new Error('Post the run first'); const jno = await postOnce({ date, memo: 'Salaries paid ' + run.period, source: 'payroll_payment', ref: 'HRPAYM:' + run.id, lines: [{ account: ctx.map.payable, debit: run.net, credit: 0, description: 'Salaries ' + run.period }, { account: paidFrom, debit: 0, credit: run.net, description: 'Salaries ' + run.period }] }, ctx);
    await setRun(run, 'paid', { PayJournal: jno, PaidFrom: paidFrom, PayDate: date }); return jno; }
  async function deleteRun(run) { if (run.status !== 'draft') throw new Error('Only a draft run can be deleted'); for (const s of (await slips(true)).filter(x => x.run === String(run.id))) await S.del('HR_Payslips', s.id); await S.del('HR_PayRuns', run.id); S.drop('HR_PayRuns', 'HR_Payslips'); }
  /* ---------- final settlement ---------- */
  async function settle(e, date, reason, extra, ctx) {
    await settings(true); const X = await ctxData(true), st = H.settlement(Object.assign({}, e, { leaveDate: date }), date, { set: SET, map: ctx.map, leaves: X.lv, adjs: X.ad, loans: X.ln, postedSlips: postedSlips(X.rs, X.ss) }, extra);
    const jno = await postOnce(st.entry, ctx);
    await S.add('HR_Settlements', { Title: e.fileNo, EmpId: String(e.id), FileNo: e.fileNo, SetDate: date, Reason: reason || '', Status: 'posted', JournalNo: jno, Gratuity: st.gratuity.amount, LeaveDays: st.leaveDays, LeavePay: st.leavePay, LoanRecovered: st.loan, OtherAdd: st.otherAdd, OtherDed: st.otherDed, Net: st.net, Detail: JSON.stringify({ years: st.gratuity.years, days: st.gratuity.days, note: st.gratuity.note || '' }) });
    await S.upd('HR_Employees', e.id, { Status: 'left', LeaveDate: date, LeaveReason: reason || '', History: hist(e.history, 'Final settlement · ' + jno) });
    for (const l of X.lv.filter(l => l.emp === String(e.id) && ['approved', 'requested'].includes(l.status) && l.from > date)) await S.upd('HR_Leaves', l.id, { Status: 'cancelled', History: hist(l.history, 'Cancelled — employee left on ' + date) });
    for (const l of X.ln.filter(l => l.emp === String(e.id) && l.status === 'active')) await S.upd('HR_Loans', l.id, { Status: 'closed', Notes: (l.notes ? l.notes + ' · ' : '') + 'recovered in final settlement' });
    S.drop('HR_Employees', 'HR_Settlements', 'HR_Loans', 'HR_Leaves'); return Object.assign(st, { journal: jno });
  }

  window.HRSTORE = { get set() { return SET; }, settings, saveSettings, emps, changes, docs, leaves, adjs, loans, runs, slips, sets, saveEmp, linkOrbit, saveLeave, setLeave, saveLoan, ctxData, createRun, updateSlip, recalc, setRun, postRun, payRun, deleteRun, settle, postedSlips, hist };
})();
