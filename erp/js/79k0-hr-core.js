/* ============================================================
   ORBIT HUMAN RESOURCES CORE — rules only (no screens, no storage) · UAE private sector (Federal Decree-Law 33 of 2021)
   · employees (linked to ORBIT's Employees_tbl by file no.), salary components and history, documents with expiry
   · leave: annual (2 days a month in the first year, usable after 6 months; 30 days a year after), sick (15 full · 30 half ·
     45 unpaid per service year, none paid in probation), maternity (45 full · 15 half), parental, bereavement, study, unpaid
   · payroll: proration for joiners / leavers, absence and unpaid leave, overtime (basic ÷ 30 ÷ 8 per hour × 1.25 normal,
     × 1.5 night / rest day / public holiday — all settings), loans & advances, pension for UAE nationals (rates are settings),
     monthly accrual of end-of-service gratuity and leave salary, journal entry, WPS salary information file (SIF)
   · end-of-service gratuity (Article 51): 21 days' basic per year for the first 5 years, 30 days after, pro-rata for part
     years, nothing under 1 year, capped at two years' wage; final settlement
   Works in the browser (window.HR) and in Node (require).
   ============================================================ */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.HR = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const r2 = n => { const v = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100; return n < 0 ? -v : v; };
  const num = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
  const J = (s, d) => { try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : d; } catch (e) { return d; } };
  const day = v => String(v || '').slice(0, 10);
  const D = s => new Date(s + 'T00:00:00Z'), iso = d => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 864e5) + 1;   /* inclusive */
  const per = s => String(s || '').slice(0, 7);
  const monthStart = p => p + '-01', dim = p => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }, monthEnd = p => p + '-' + String(dim(p)).padStart(2, '0');
  const addM = (p, n) => { const [y, m] = p.split('-').map(Number), t = y * 12 + m - 1 + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
  const overlap = (a1, a2, b1, b2) => { const s = a1 > b1 ? a1 : b1, e = a2 < b2 ? a2 : b2; return s <= e ? daysBetween(s, e) : 0; };
  /* complete months of service from join to date */
  const monthsOf = (join, date) => { if (!join || !date || date < join) return 0; const [y1, m1, d1] = join.split('-').map(Number), [y2, m2, d2] = date.split('-').map(Number); let m = (y2 - y1) * 12 + (m2 - m1); if (d2 + 1 < d1 && !(d2 === dim(per(date)) )) m--; return Math.max(0, m); };

  /* ---------- settings, accounts ---------- */
  const DEFAULTS = { basis: '30', hours: 8, otNormal: 1.25, otNight: 1.5, otRest: 1.5, otHoliday: 1.5, annual: 30, fotAs: 'rest', penEe: 5, penEr: 12.5, accrueGrat: true, accrueLeave: true, leaveBasis: 'basic', scr: 'last', employerId: '', routing: '', run: 'PAY', loan: 'LN', empSource: 'orbit', capWage: 'gross' };
  const A = (code, name, type, parent) => ({ code, name, type, parent, sub: '', group: false });
  const COA_ADD = [A('2145', 'Pension contributions payable', 'liability', '2100'), A('2146', 'Leave salary provision', 'liability', '2100'), A('6105', 'Overtime', 'expense', '6000'), A('6120', 'Leave salary', 'expense', '6000'), A('6130', 'Pension contributions (employer)', 'expense', '6000')];
  const MAP = { salaries: ['Salaries & allowances', '6100'], overtime: ['Overtime', '6105'], payable: ['Salaries payable', '2140'], advances: ['Employee loans & advances', '1170'], pension_pay: ['Pension payable', '2145'], pension_exp: ['Pension (employer)', '6130'], grat_exp: ['End of service benefits expense', '6110'], grat_prov: ['End of service provision', '2510'], leave_exp: ['Leave salary expense', '6120'], leave_prov: ['Leave salary provision', '2146'], deduct: ['Other deductions (recoveries)', '6100'] };
  const defaultMap = accounts => { const m = {}, have = new Set((accounts || []).map(a => a.code).concat(COA_ADD.map(a => a.code))); Object.entries(MAP).forEach(([k, [, c]]) => { if (have.has(c)) m[k] = c; }); return m; };

  /* ---------- leave types ---------- */
  const LEAVE = {
    annual: { name: 'Annual leave', tiers: [[9999, 1]] }, sick: { name: 'Sick leave', tiers: [[15, 1], [30, 0.5], [45, 0]], perYear: true },
    maternity: { name: 'Maternity leave', tiers: [[45, 1], [15, 0.5]] }, parental: { name: 'Parental leave', tiers: [[5, 1], [9999, 0]], perYear: true },
    bereavement: { name: 'Bereavement leave', tiers: [[5, 1], [9999, 0]] }, study: { name: 'Study leave', tiers: [[10, 1], [9999, 0]], perYear: true }, unpaid: { name: 'Unpaid leave', tiers: [[9999, 0]] },
  };
  const DOCS = { passport: 'Passport', visa: 'Residence visa', emirates_id: 'Emirates ID', labour_card: 'Labour card / work permit', insurance: 'Health insurance', licence: 'Driving licence', contract: 'Labour contract', other: 'Other' };

  /* ---------- lists ---------- */
  const T = n => ({ name: n, text: {} }), Ml = n => ({ name: n, text: { allowMultipleLines: true, textType: 'plain' } }), N = n => ({ name: n, number: {} });
  const LISTS = {
    HR_Settings: ['Company', 'EmpSource', 'EmployerId', 'Routing', 'ScrPosition', 'Basis', 'FotAs', 'LeaveBasis', 'RunPrefix', 'LoanPrefix', 'AccrueGrat', 'AccrueLeave', 'CapWage'].map(T).concat(['Hours', 'OtNormal', 'OtNight', 'OtRest', 'OtHoliday', 'Annual', 'PenEe', 'PenEr'].map(N)).concat([Ml('AccMap')]),
    HR_Employees: ['FileNo', 'NameAr', 'Department', 'Position', 'Grade', 'CostCenter', 'Location', 'Nationality', 'Gender', 'BirthDate', 'JoinDate', 'ProbationEnd', 'ContractEnd', 'Status', 'LeaveDate', 'LeaveReason', 'PayMethod', 'LabourCardNo', 'Routing', 'IBAN', 'Pension', 'OtEligible', 'Email', 'Phone', 'Manager', 'OrbitId', 'OpenDate', 'Notes'].map(T)
      .concat(['Basic', 'Housing', 'Transport', 'OtherAllow', 'OpenLeaveDays', 'OpenEOSB', 'OpenLeaveProv'].map(N)).concat([Ml('History')]),
    HR_SalaryChanges: ['EmpId', 'FileNo', 'EffDate', 'Reason', 'ChangedBy'].map(T).concat(['Basic', 'Housing', 'Transport', 'OtherAllow'].map(N)),
    HR_Documents: ['EmpId', 'FileNo', 'DocType', 'DocNo', 'IssueDate', 'ExpiryDate', 'Notes'].map(T),
    HR_Leaves: ['EmpId', 'FileNo', 'LeaveType', 'FromDate', 'ToDate', 'Status', 'Reason', 'ApprovedBy', 'ApprovedAt'].map(T).concat([N('Days'), Ml('History')]),
    HR_LeaveAdj: ['EmpId', 'FileNo', 'LeaveType', 'AdjDate', 'Reason'].map(T).concat([N('Days')]),
    HR_Loans: ['LoanNo', 'EmpId', 'FileNo', 'LoanType', 'LoanDate', 'StartPeriod', 'Status', 'PaidFrom', 'JournalNo', 'Notes'].map(T).concat(['Amount', 'Installment'].map(N)),
    HR_PayRuns: ['RunNo', 'Period', 'Status', 'PayDate', 'JournalNo', 'PayJournal', 'PaidFrom', 'PostedBy', 'PostedAt', 'SifName'].map(T).concat(['Gross', 'Deductions', 'Net', 'Headcount'].map(N)).concat([Ml('History')]),
    HR_Payslips: ['RunId', 'EmpId', 'FileNo', 'Period', 'CostCenter', 'PayMethod', 'Notes'].map(T).concat(['PaidDays', 'Fixed', 'Earned', 'AbsentDays', 'UnpaidDays', 'AbsDed', 'OtN', 'OtNight', 'OtRest', 'OtHol', 'OtAmount', 'Bonus', 'OtherAdd', 'Deduct', 'LoanDed', 'PenEe', 'PenEr', 'Gross', 'Net', 'GratAccr', 'LeaveAccr', 'WpsFixed', 'WpsVar']).map(x => typeof x === 'string' ? N(x) : x).concat([Ml('Detail')]),
    HR_Settlements: ['EmpId', 'FileNo', 'SetDate', 'Reason', 'Status', 'JournalNo'].map(T).concat(['Gratuity', 'LeaveDays', 'LeavePay', 'LoanRecovered', 'OtherAdd', 'OtherDed', 'Net'].map(N)).concat([Ml('Detail')]),
  };

  /* ---------- row mapping ---------- */
  const settingsFromRow = r => { r = r || {}; const n = (k, d) => r[k] === '' || r[k] == null ? d : num(r[k]); return { id: r.id ? Number(r.id) : null, company: r.company || '', empSource: r.empsource || DEFAULTS.empSource, employerId: String(r.employerid || ''), routing: String(r.routing || ''), scr: r.scrposition || DEFAULTS.scr, basis: r.basis || DEFAULTS.basis, fotAs: r.fotas || DEFAULTS.fotAs, leaveBasis: r.leavebasis || DEFAULTS.leaveBasis, run: r.runprefix || DEFAULTS.run, loan: r.loanprefix || DEFAULTS.loan,
    accrueGrat: String(r.accruegrat) !== '0', accrueLeave: String(r.accrueleave) !== '0', capWage: r.capwage || DEFAULTS.capWage, hours: n('hours', DEFAULTS.hours), otNormal: n('otnormal', DEFAULTS.otNormal), otNight: n('otnight', DEFAULTS.otNight), otRest: n('otrest', DEFAULTS.otRest), otHoliday: n('otholiday', DEFAULTS.otHoliday), annual: n('annual', DEFAULTS.annual), penEe: n('penee', DEFAULTS.penEe), penEr: n('pener', DEFAULTS.penEr), map: J(r.accmap, {}) }; };
  const empFromRow = r => ({ id: Number(r.id), fileNo: String(r.fileno || ''), name: r.title || '', nameAr: r.namear || '', dept: r.department || '', position: r.position || '', grade: r.grade || '', cc: r.costcenter || '', location: r.location || '', nationality: r.nationality || '', gender: r.gender || '', birth: day(r.birthdate), join: day(r.joindate), probationEnd: day(r.probationend), contractEnd: day(r.contractend),
    status: r.status || 'active', leaveDate: day(r.leavedate), leaveReason: r.leavereason || '', payMethod: r.paymethod || 'wps', labourCard: String(r.labourcardno || ''), routing: String(r.routing || ''), iban: String(r.iban || '').replace(/\s/g, ''), pension: r.pension || 'none', otEligible: String(r.oteligible) !== '0', email: r.email || '', phone: r.phone || '', manager: r.manager || '', orbitId: String(r.orbitid || ''), openDate: day(r.opendate), notes: r.notes || '',
    basic: num(r.basic), housing: num(r.housing), transport: num(r.transport), other: num(r.otherallow), openLeave: num(r.openleavedays), openEosb: num(r.openeosb), openLeaveProv: num(r.openleaveprov), history: J(r.history, []) });
  const empToFields = e => ({ Title: e.name, FileNo: String(e.fileNo), NameAr: e.nameAr || '', Department: e.dept || '', Position: e.position || '', Grade: String(e.grade || ''), CostCenter: e.cc || '', Location: e.location || '', Nationality: e.nationality || '', Gender: e.gender || '', BirthDate: e.birth || '', JoinDate: e.join || '', ProbationEnd: e.probationEnd || '', ContractEnd: e.contractEnd || '', Status: e.status || 'active', LeaveDate: e.leaveDate || '', LeaveReason: e.leaveReason || '',
    PayMethod: e.payMethod || 'wps', LabourCardNo: e.labourCard || '', Routing: e.routing || '', IBAN: String(e.iban || '').replace(/\s/g, '').toUpperCase(), Pension: e.pension || 'none', OtEligible: e.otEligible === false ? '0' : '1', Email: e.email || '', Phone: e.phone || '', Manager: e.manager || '', OrbitId: String(e.orbitId || ''), OpenDate: e.openDate || '', Notes: e.notes || '',
    Basic: r2(num(e.basic)), Housing: r2(num(e.housing)), Transport: r2(num(e.transport)), OtherAllow: r2(num(e.other)), OpenLeaveDays: num(e.openLeave), OpenEOSB: r2(num(e.openEosb)), OpenLeaveProv: r2(num(e.openLeaveProv)) });
  const docFromRow = r => ({ id: Number(r.id), emp: String(r.empid || ''), fileNo: String(r.fileno || ''), type: r.doctype || 'other', no: r.docno || '', issue: day(r.issuedate), expiry: day(r.expirydate), notes: r.notes || '' });
  const leaveFromRow = r => ({ id: Number(r.id), emp: String(r.empid || ''), fileNo: String(r.fileno || ''), type: LEAVE[r.leavetype] ? r.leavetype : 'annual', from: day(r.fromdate), to: day(r.todate), days: num(r.days), status: r.status || 'requested', reason: r.reason || '', approvedBy: r.approvedby || '', history: J(r.history, []) });
  const adjFromRow = r => ({ id: Number(r.id), emp: String(r.empid || ''), type: r.leavetype || 'annual', date: day(r.adjdate), days: num(r.days), reason: r.reason || '' });
  const loanFromRow = r => ({ id: Number(r.id), no: r.loanno || '', emp: String(r.empid || ''), fileNo: String(r.fileno || ''), type: r.loantype || 'advance', date: day(r.loandate), start: r.startperiod || '', status: r.status || 'active', paidFrom: String(r.paidfrom || ''), journal: r.journalno || '', notes: r.notes || '', amount: num(r.amount), inst: num(r.installment) });
  const runFromRow = r => ({ id: Number(r.id), no: r.runno || '', period: r.period || '', status: r.status || 'draft', payDate: day(r.paydate), journal: r.journalno || '', payJournal: r.payjournal || '', paidFrom: String(r.paidfrom || ''), sif: r.sifname || '', gross: num(r.gross), ded: num(r.deductions), net: num(r.net), count: num(r.headcount), history: J(r.history, []) });
  const SLIP_N = ['PaidDays', 'Fixed', 'Earned', 'AbsentDays', 'UnpaidDays', 'AbsDed', 'OtN', 'OtNight', 'OtRest', 'OtHol', 'OtAmount', 'Bonus', 'OtherAdd', 'Deduct', 'LoanDed', 'PenEe', 'PenEr', 'Gross', 'Net', 'GratAccr', 'LeaveAccr', 'WpsFixed', 'WpsVar'];
  const slipKey = k => k.charAt(0).toLowerCase() + k.slice(1);
  const slipFromRow = r => { const o = { id: Number(r.id), run: String(r.runid || ''), emp: String(r.empid || ''), fileNo: String(r.fileno || ''), period: r.period || '', cc: r.costcenter || '', payMethod: r.paymethod || 'wps', notes: r.notes || '', detail: J(r.detail, {}) }; SLIP_N.forEach(k => { o[slipKey(k)] = num(r[k.toLowerCase()]); }); return o; };
  const slipToFields = (s, runId) => { const f = { Title: s.fileNo + ' ' + s.period, RunId: String(runId), EmpId: String(s.emp), FileNo: s.fileNo, Period: s.period, CostCenter: s.cc || '', PayMethod: s.payMethod || 'wps', Notes: s.notes || '', Detail: JSON.stringify(s.detail || {}) }; SLIP_N.forEach(k => { f[k] = r2(num(s[slipKey(k)])); }); return f; };
  const setFromRow = r => ({ id: Number(r.id), emp: String(r.empid || ''), fileNo: String(r.fileno || ''), date: day(r.setdate), reason: r.reason || '', status: r.status || 'draft', journal: r.journalno || '', gratuity: num(r.gratuity), leaveDays: num(r.leavedays), leavePay: num(r.leavepay), loan: num(r.loanrecovered), otherAdd: num(r.otheradd), otherDed: num(r.otherded), net: num(r.net), detail: J(r.detail, {}) });

  /* ---------- salary, documents ---------- */
  const fixedOf = e => r2(num(e.basic) + num(e.housing) + num(e.transport) + num(e.other));
  /* salary in force on a date (salary history rows with EffDate ≤ date override the employee card) */
  function salaryOn(e, changes, date) { const c = (changes || []).filter(x => String(x.empid || x.emp) === String(e.id) && day(x.effdate || x.eff) <= date).sort((a, b) => day(b.effdate || b.eff).localeCompare(day(a.effdate || a.eff)))[0];
    return c ? Object.assign({}, e, { basic: num(c.basic), housing: num(c.housing), transport: num(c.transport), other: num(c.otherallow != null ? c.otherallow : c.other) }) : e; }
  function expiring(docs, emps, asOf, within) { const E = new Map((emps || []).filter(e => e.status !== 'left').map(e => [String(e.id), e])), lim = addDays(asOf, within == null ? 60 : within);
    return (docs || []).filter(d => d.expiry && d.expiry <= lim && E.has(d.emp)).map(d => ({ ...d, name: E.get(d.emp).name, fileNo: E.get(d.emp).fileNo, daysLeft: daysBetween(asOf, d.expiry) - 1, expired: d.expiry < asOf })).sort((a, b) => a.expiry.localeCompare(b.expiry)); }

  /* ---------- leave ---------- */
  const leaveDays = (from, to) => from && to && to >= from ? daysBetween(from, to) : 0;   /* calendar days */
  /* annual leave earned to a date: 2 days a month in the first year, then annual/12 a month; usable after 6 months */
  function annualEarned(e, date, set) { const m = monthsOf(e.join, date), a = num((set || DEFAULTS).annual) || 30; return r2(2 * Math.min(m, 12) + (a / 12) * Math.max(0, m - 12)); }
  function balance(e, leaves, adjs, date, set) {
    const base = e.openDate && e.openDate <= date ? num(e.openLeave) : 0, earnedAll = annualEarned(e, date, set), earnedAtOpen = e.openDate ? annualEarned(e, e.openDate, set) : 0, earned = e.openDate ? r2(base + earnedAll - earnedAtOpen) : earnedAll;
    const mine = (leaves || []).filter(l => l.emp === String(e.id) && l.type === 'annual' && l.status === 'approved'), taken = r2(mine.filter(l => l.from <= date && (!e.openDate || l.from > e.openDate)).reduce((s, l) => s + Math.min(l.days || leaveDays(l.from, l.to), leaveDays(l.from, l.to < date ? l.to : date)), 0));
    const booked = r2(mine.filter(l => l.from > date).reduce((s, l) => s + (l.days || leaveDays(l.from, l.to)), 0)), adj = r2((adjs || []).filter(a => a.emp === String(e.id) && a.type === 'annual' && a.date <= date).reduce((s, a) => s + a.days, 0));
    return { earned, taken, adj, booked, balance: r2(earned - taken + adj), usable: monthsOf(e.join, date) >= 6 };
  }
  /* pay factor of each day of a leave: sick leave counts the days already used in the same service year (from the join anniversary) */
  function leavePayDays(e, l, leaves) {
    const t = LEAVE[l.type] || LEAVE.unpaid, days = leaveDays(l.from, l.to), out = [];
    if (l.type === 'sick' && e.probationEnd && l.from <= e.probationEnd) { for (let i = 0; i < days; i++) out.push({ date: addDays(l.from, i), f: 0 }); return out; }   /* no paid sick leave in probation */
    let used = 0;
    if (t.perYear || l.type === 'sick') { const yrs = Math.floor(monthsOf(e.join, l.from) / 12), ys = e.join ? addDays(e.join.slice(0, 4) * 1 + yrs + e.join.slice(4), 0) : l.from.slice(0, 4) + '-01-01';
      used = (leaves || []).filter(x => x.id !== l.id && x.emp === l.emp && x.type === l.type && x.status === 'approved' && x.from >= ys && x.from < l.from).reduce((s, x) => s + leaveDays(x.from, x.to), 0); }
    for (let i = 0; i < days; i++) { let n = used + i, f = 0; for (const [len, fac] of t.tiers) { if (n < len) { f = fac; break; } n -= len; } out.push({ date: addDays(l.from, i), f }); }
    return out;
  }
  function checkLeave(l, e, leaves, adjs, set) {
    const E = []; if (!l.from || !l.to) E.push('Choose the dates'); else if (l.to < l.from) E.push('The end date is before the start date');
    if (e && e.join && l.from && l.from < e.join) E.push('The leave starts before the join date');
    (leaves || []).filter(x => x.id !== l.id && x.emp === String(e.id) && ['approved', 'requested'].includes(x.status) && overlap(x.from, x.to, l.from, l.to)).forEach(x => E.push('Overlaps ' + LEAVE[x.type].name.toLowerCase() + ' ' + x.from + ' – ' + x.to));
    if (l.type === 'annual' && e && l.from) { const b = balance(e, leaves.filter(x => x.id !== l.id), adjs, l.to, set); if (!b.usable) E.push('Annual leave can be taken after 6 months of service'); else if (leaveDays(l.from, l.to) > b.balance - b.booked + 0.001) E.push('Only ' + r2(b.balance - b.booked) + ' annual leave days available'); }
    return E;
  }

  /* ---------- gratuity ---------- */
  function gratuity(e, date, unpaidDays) {
    if (!e.join || !date || date < e.join) return { years: 0, days: 0, amount: 0 };
    const served = daysBetween(e.join, date) - num(unpaidDays), years = served / 365, dailyB = num(e.basic) / 30;
    if (years < 1) return { years: r2(years), days: 0, amount: 0, note: 'Less than one year of service' };
    const days = 21 * Math.min(years, 5) + 30 * Math.max(0, years - 5), amt = dailyB * days, cap = 24 * (num(e.basic) + num(e.housing) + num(e.transport) + num(e.other));
    return { years: r2(years), days: r2(days), amount: r2(Math.min(amt, cap)), capped: amt > cap };
  }

  /* ---------- attendance (ORBIT Attendance_Data_tbl) → monthly inputs by file no. ---------- */
  function fromAttendance(rows, period, set) {
    const out = new Map(), s = set || DEFAULTS;
    (rows || []).forEach(r => { if (per(day(r.attdate)) !== period) return; const k = String(r.empno || '').trim(); if (!k) return; const o = out.get(k) || { otN: 0, otRest: 0, otHol: 0, otNight: 0, absent: 0, days: 0 };
      const fot = num(r.totalfot); o.otN += num(r.totalnot) + (s.fotAs === 'normal' ? fot : 0); o.otRest += num(r.totalrot) + (s.fotAs === 'rest' ? fot : 0); o.otHol += num(r.totalhot); o.days++;
      if (num(r.reqhours) > 0 && !num(r.workhours) && !String(r.intime || '').trim() && !/leave|off|holiday|sick/i.test(String(r.remarks || '') + ' ' + String(r.empstatus || ''))) o.absent++;
      out.set(k, o); });
    out.forEach(o => { o.otN = r2(o.otN); o.otRest = r2(o.otRest); o.otHol = r2(o.otHol); });
    return out;
  }

  /* ---------- payroll ---------- */
  function loanBalance(loan, slips) { const paid = (slips || []).reduce((s, x) => s + num(((x.detail || {}).loans || {})[loan.id] || 0), 0); return r2(loan.amount - paid); }
  /* one payslip. inp = { otN, otNight, otRest, otHol, absent, bonus, otherAdd, deduct, notes }  · ctx = { leaves, loans, postedSlips, changes, set } */
  function payslip(e0, period, inp, ctx) {
    const s = ctx.set || DEFAULTS, ms = monthStart(period), me = monthEnd(period), dm = dim(period), x = inp || {};
    if (!e0.join || e0.join > me || (e0.leaveDate && e0.leaveDate < ms)) return null;
    const e = salaryOn(e0, ctx.changes, me), from = e.join > ms ? e.join : ms, to = e.leaveDate && e.leaveDate < me ? e.leaveDate : me, worked = daysBetween(from, to), frac = worked / dm;
    const fixed = fixedOf(e), comp = { basic: r2(num(e.basic) * frac), housing: r2(num(e.housing) * frac), transport: r2(num(e.transport) * frac), other: r2(num(e.other) * frac) }, earned = r2(comp.basic + comp.housing + comp.transport + comp.other);
    const daily = fixed / (s.basis === '30' ? 30 : dm);
    /* unpaid days from leave inside the paid days */
    let lu = 0; const lv = []; (ctx.leaves || []).filter(l => l.emp === String(e.id) && l.status === 'approved' && overlap(l.from, l.to, from, to)).forEach(l => { const pd = leavePayDays(e, l, ctx.leaves).filter(d => d.date >= from && d.date <= to); const u = pd.reduce((t, d) => t + (1 - d.f), 0); lu += u; lv.push({ type: l.type, days: pd.length, unpaid: r2(u) }); });
    const absent = num(x.absent), unpaid = r2(Math.min(worked, absent + lu)), absDed = r2(Math.min(earned, daily * unpaid));
    const hourly = num(e.basic) / 30 / (num(s.hours) || 8), ot = e.otEligible === false ? 0 : r2(hourly * (num(x.otN) * s.otNormal + num(x.otNight) * s.otNight + num(x.otRest) * s.otRest + num(x.otHol) * s.otHoliday));
    const loans = {}; let loanDed = 0; (ctx.loans || []).filter(l => l.emp === String(e.id) && l.status === 'active' && l.start && l.start <= period).forEach(l => { const bal = loanBalance(l, ctx.postedSlips), d = r2(Math.min(l.inst || bal, bal)); if (d > 0) { loans[l.id] = d; loanDed = r2(loanDed + d); } });
    const penBase = earned, penEe = e.pension === 'gpssa' ? r2(penBase * s.penEe / 100) : 0, penEr = e.pension === 'gpssa' ? r2(penBase * s.penEr / 100) : 0;
    const bonus = r2(num(x.bonus)), otherAdd = r2(num(x.otherAdd)), deduct = r2(num(x.deduct)), gross = r2(earned - absDed + ot + bonus + otherAdd), net = r2(gross - deduct - loanDed - penEe);
    const variable = r2(ot + bonus + otherAdd), wpsVar = net > 0 ? Math.min(variable, net) : 0, wpsFixed = net > 0 ? r2(net - wpsVar) : 0;
    /* accruals: liability at month end − what was accrued before (opening + earlier posted payslips) */
    const prior = (k, open) => r2(num(open) + (ctx.postedSlips || []).filter(p => p.emp === String(e.id) && p.period < period).reduce((t, p) => t + num(p[k]), 0));
    const endD = to, unpaidTotal = (ctx.unpaidDaysToDate || 0);
    const gr = s.accrueGrat && e.pension !== 'gpssa' ? gratuity(e, endD, unpaidTotal) : { amount: 0 }, gratAccr = s.accrueGrat && e.pension !== 'gpssa' ? r2(gr.amount - prior('gratAccr', e.openEosb)) : 0;
    const bal = balance(e, ctx.leaves, ctx.adjs, endD, s), lrate = (s.leaveBasis === 'gross' ? fixed : num(e.basic)) / 30, leaveAccr = s.accrueLeave ? r2(Math.max(0, bal.balance) * lrate - prior('leaveAccr', e.openLeaveProv)) : 0;
    return { emp: String(e.id), fileNo: e.fileNo, name: e.name, period, cc: e.cc || '', payMethod: e.payMethod || 'wps', paidDays: worked, fixed, earned, absentDays: absent, unpaidDays: unpaid, absDed, otN: num(x.otN), otNight: num(x.otNight), otRest: num(x.otRest), otHol: num(x.otHol), otAmount: ot, bonus, otherAdd, deduct, loanDed, penEe, penEr, gross, net, gratAccr, leaveAccr, wpsFixed, wpsVar, notes: x.notes || '',
      detail: { comp, daily: r2(daily), hourly: r2(hourly), leave: lv, loans, gratuity: gr.amount || 0, leaveBal: bal.balance, src: x.src || '' }, errors: net < 0 ? ['Net pay is negative'] : [] };
  }
  /* payroll run → journal entry (by cost centre for expenses) */
  function journal(slips, period, map) {
    const g = new Map(), add = (a, cc, v) => { if (!a || !v) return; const k = a + '|' + (cc || ''); g.set(k, r2((g.get(k) || 0) + v)); };   /* + debit, − credit */
    slips.forEach(s => { const cc = s.cc || '';
      add(map.salaries, cc, s.earned - s.absDed + s.bonus + s.otherAdd); add(map.overtime || map.salaries, cc, s.otAmount);
      add(map.payable, '', -s.net); add(map.advances, '', -s.loanDed); add(map.deduct, cc, -s.deduct);
      add(map.pension_exp, cc, s.penEr); add(map.pension_pay, '', -(s.penEe + s.penEr));
      add(map.grat_exp, cc, s.gratAccr); add(map.grat_prov, '', -s.gratAccr); add(map.leave_exp, cc, s.leaveAccr); add(map.leave_prov, '', -s.leaveAccr); });
    const lines = []; g.forEach((v, k) => { const [account, cc] = k.split('|'); if (Math.abs(v) >= 0.005) lines.push({ account, debit: v > 0 ? r2(v) : 0, credit: v < 0 ? r2(-v) : 0, costCenter: cc || '', description: 'Payroll ' + period }); });
    const end = monthEnd(period); return { date: end, memo: 'Payroll ' + period, source: 'payroll', lines };
  }
  const totals = slips => ({ gross: r2(slips.reduce((t, s) => t + s.gross, 0)), ded: r2(slips.reduce((t, s) => t + s.deduct + s.loanDed + s.penEe, 0)), net: r2(slips.reduce((t, s) => t + s.net, 0)), count: slips.length });

  /* ---------- WPS salary information file ---------- */
  const pad = (n, l) => String(n).padStart(l, '0');
  function sif(slips, emps, set, period, now, ref) {
    const E = new Map((emps || []).map(e => [String(e.id), e])), errs = [], s = set || DEFAULTS, d = now || new Date();
    const ymd = d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2), hm = pad(d.getHours(), 2) + pad(d.getMinutes(), 2), sec = pad(d.getSeconds(), 2);   /* local time, same in the file name and the SCR */
    if (!/^\d{13}$/.test(s.employerId || '')) errs.push('HR Settings: the employer ID (MOHRE establishment, 13 digits) is missing or wrong');
    if (!/^\d{9}$/.test(s.routing || '')) errs.push('HR Settings: the employer bank routing code (9 digits) is missing or wrong');
    const ps = monthStart(period), pe = monthEnd(period), rows = [];
    slips.filter(x => x.payMethod === 'wps' && x.net > 0).forEach(x => { const e = E.get(x.emp) || {}, n = (e.name || x.fileNo) + ': ';
      if (!/^\d{14}$/.test(e.labourCard || '')) errs.push(n + 'labour card / employee MOHRE ID must be 14 digits'); if (!/^\d{9}$/.test(e.routing || '')) errs.push(n + 'bank routing code must be 9 digits'); if (!/^AE\d{21}$/.test(e.iban || '')) errs.push(n + 'IBAN must be AE + 21 digits');
      rows.push(['EDR', e.labourCard, e.routing, e.iban, ps, pe, dim(period), r2(x.wpsFixed).toFixed(2), r2(x.wpsVar).toFixed(2), Math.round(x.unpaidDays)].join(',')); });
    const total = r2(slips.filter(x => x.payMethod === 'wps' && x.net > 0).reduce((t, x) => t + x.wpsFixed + x.wpsVar, 0));
    const scr = ['SCR', s.employerId, s.routing, ymd, hm, period.slice(5, 7) + period.slice(0, 4), rows.length, total.toFixed(2), 'AED', ref || 'NONE'].join(',');
    const name = s.employerId + ymd.slice(2).replace(/-/g, '') + hm + sec + '.sif';
    return { ok: !errs.length && rows.length > 0, errors: rows.length ? errs : errs.concat(['No WPS employees with net pay in this run']), name, text: (s.scr === 'first' ? [scr].concat(rows) : rows.concat([scr])).join('\r\n') + '\r\n', count: rows.length, total };
  }

  /* ---------- final settlement ---------- */
  function settlement(e, date, ctx, extra) {
    const x = extra || {}, s = ctx.set || DEFAULTS, map = ctx.map || {}, g = e.pension === 'gpssa' ? { amount: 0, years: 0, note: 'UAE national — pension instead of gratuity' } : gratuity(e, date, x.unpaidDays || 0);
    const bal = balance(e, ctx.leaves, ctx.adjs, date, s), lrate = (s.leaveBasis === 'gross' ? fixedOf(e) : num(e.basic)) / 30, leaveDays_ = Math.max(0, bal.balance), leavePay = r2(leaveDays_ * lrate);
    const loan = r2((ctx.loans || []).filter(l => l.emp === String(e.id) && l.status === 'active').reduce((t, l) => t + loanBalance(l, ctx.postedSlips), 0));
    const otherAdd = r2(num(x.otherAdd)), otherDed = r2(num(x.otherDed)), net = r2(g.amount + leavePay + otherAdd - loan - otherDed);
    const prov = k => r2((ctx.postedSlips || []).filter(p => p.emp === String(e.id)).reduce((t, p) => t + num(p[k]), 0));
    const gp = r2(num(e.openEosb) + prov('gratAccr')), lp = r2(num(e.openLeaveProv) + prov('leaveAccr')), L = [], label = 'Final settlement ' + e.fileNo + ' — ' + e.name;
    const use = (provAcc, expAcc, amount, held) => { if (held) L.push({ account: provAcc, debit: r2(held), credit: 0, description: label }); const diff = r2(amount - held); if (diff) L.push({ account: expAcc, debit: diff > 0 ? diff : 0, credit: diff < 0 ? -diff : 0, costCenter: e.cc || '', description: label }); };
    use(map.grat_prov, map.grat_exp, g.amount, gp); use(map.leave_prov, map.leave_exp, leavePay, lp);
    if (otherAdd) L.push({ account: map.salaries, debit: otherAdd, credit: 0, costCenter: e.cc || '', description: label }); if (loan) L.push({ account: map.advances, debit: 0, credit: loan, description: label }); if (otherDed) L.push({ account: map.deduct, debit: 0, credit: otherDed, description: label });
    L.push({ account: map.payable, debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0, description: label });
    return { gratuity: g, leaveDays: r2(leaveDays_), leavePay, loan, otherAdd, otherDed, net, entry: { date, memo: label, source: 'settlement', ref: 'HRFS:' + e.id, lines: L.filter(l => l.debit || l.credit) } };
  }
  function checkEmp(e, emps) {
    const E = []; if (!String(e.fileNo || '').trim()) E.push('File no. is required'); if (!String(e.name || '').trim()) E.push('Name is required'); if (!/^\d{4}-\d\d-\d\d$/.test(e.join || '')) E.push('Join date is required');
    if ((emps || []).some(x => x.fileNo === String(e.fileNo).trim() && x.id !== e.id)) E.push('File no. ' + e.fileNo + ' is already used');
    if (num(e.basic) < 0 || num(e.housing) < 0 || num(e.transport) < 0 || num(e.other) < 0) E.push('Salary amounts cannot be negative');
    if (e.payMethod === 'wps') { if (e.labourCard && !/^\d{14}$/.test(e.labourCard)) E.push('Labour card / MOHRE person ID must be 14 digits'); if (e.iban && !/^AE\d{21}$/.test(String(e.iban).replace(/\s/g, '').toUpperCase())) E.push('IBAN must be AE + 21 digits'); if (e.routing && !/^\d{9}$/.test(e.routing)) E.push('Bank routing code must be 9 digits'); }
    if (e.leaveDate && e.join && e.leaveDate < e.join) E.push('Leaving date is before the join date');
    return E;
  }
  /* ORBIT Employees_tbl row → HR employee */
  const orbitEmp = r => ({ fileNo: String(r.filenr || '').trim(), name: String(r.employeename || r.title || '').trim(), position: r.jobrole || '', grade: String(r.rolegrade || r.grade || ''), join: day(r.dateofjoin), birth: day(r.dateofbirth), nationality: r.nationality || '', location: r.whslocation || r.region || '', dept: r.section || r.businessunitname || '', manager: r.linemanager || '', orbitId: String(r.id), status: /resign|terminat|left|absconded|inactive/i.test(String(r.employmentstatus || '')) ? 'left' : 'active', pension: /emirat|^uae$/i.test(String(r.nationality || '').trim()) ? 'gpssa' : 'none' });

  return { r2, num, J, per, addM, monthStart, monthEnd, dim, addDays, daysBetween, monthsOf, DEFAULTS, COA_ADD, MAP, defaultMap, LEAVE, DOCS, LISTS, LIST_NAMES: Object.keys(LISTS),
    settingsFromRow, empFromRow, empToFields, docFromRow, leaveFromRow, adjFromRow, loanFromRow, runFromRow, slipFromRow, slipToFields, setFromRow,
    fixedOf, salaryOn, expiring, leaveDays, annualEarned, balance, leavePayDays, checkLeave, gratuity, fromAttendance, loanBalance, payslip, journal, totals, sif, settlement, checkEmp, orbitEmp, version: '1.0.0' };
});
