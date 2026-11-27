/* ============================================================
   ORBIT HUMAN RESOURCES — screens (ORBIT mobile suite API · same screens on the phone and in the web app pages)
   HR home · Employees · Leave · Payroll · Loans & advances · Documents · End of service · HR settings
   Links: employees from ORBIT's Employees_tbl (by file no.), overtime and absence from ORBIT's Attendance_Data_tbl,
          payroll, loans and settlements post to the ledger, WPS salary information file for the bank.
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, F = window.FIN, H = window.HR, S = window.FINSTORE, HS = window.HRSTORE, FU = window.FIN_UI;
  if (!K || !F || !H || !S || !HS || !FU) return;
  const { A, reg, D, drop, esc, num, today, addD, dmy, str, toast, V, render, cur } = K, HH = K.H;
  const { table, csv, printHtml, n2, money, acctOpts, acctName } = FU;
  const ST = { emp: null, run: null, slip: null, deep: null };
  const go = k => A().go(k), goTo = k => { ST.deep = k; go(k); };
  const errs = (list, t) => list && list.length ? `<div class="mb-hint mb-bad ei-errs"><b>${esc(t || 'Please check')}</b>${list.map(e => `<div>${esc(e.message || e)}</div>`).join('')}</div>` : '';
  const setTitle = t => setTimeout(() => { const el = document.querySelector('#mbTitle'); if (el) el.textContent = t; }, 0);
  const COL = { active: '#15803d', left: '#64748b', requested: '#b45309', approved: '#15803d', rejected: '#dc2626', cancelled: '#64748b', draft: '#64748b', posted: '#1d4ed8', paid: '#15803d', closed: '#64748b' };
  const pill = s => `<span class="mb-pill ei-st" style="--c:${COL[s] || '#64748b'}">${esc(String(s).charAt(0).toUpperCase() + String(s).slice(1))}</span>`;
  const clear = v => Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; });
  const MN = p => { const [y, m] = p.split('-'); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1] + ' ' + y; };
  const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  const css = document.createElement('style'); css.textContent = `#mob .hr-g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}#mob .hr-g label{display:block;font-size:11.5px;color:var(--mut);font-weight:700;margin-bottom:3px}#mob .hr-g input{width:100%;box-sizing:border-box;text-align:right}#mob .hr-red{color:#dc2626;font-weight:700}#mob .hr-amb{color:#b45309;font-weight:700}@media (max-width:560px){#mob .hr-g{grid-template-columns:repeat(2,minmax(0,1fr))}}`; document.head.appendChild(css);

  /* ---------- data ---------- */
  async function bundle(force, w) {
    w = w || {}; const finSet = await S.settings(force), out = { finSet }, jobs = [], add = (k, p) => jobs.push(p.then(x => { out[k] = x; }));
    add('set', HS.settings(force)); add('accts', S.accounts(force).catch(() => []));
    add('emps', HS.emps(force).catch(e => { if (/not found/i.test(e.message)) out.missing = true; return []; }));
    if (w.lv) { add('leaves', HS.leaves(force).catch(() => [])); add('adjs', HS.adjs(force).catch(() => [])); }
    if (w.docs) add('docs', HS.docs(force).catch(() => []));
    if (w.pay) { add('runs', HS.runs(force).catch(() => [])); add('slips', HS.slips(force).catch(() => [])); }
    if (w.loans) add('loans', HS.loans(force).catch(() => []));
    if (w.ch) add('changes', HS.changes(force).catch(() => []));
    if (w.sets) add('sets', HS.sets(force).catch(() => []));
    await Promise.all(jobs);
    out.map = Object.assign(H.defaultMap(out.accts), (out.set && out.set.map) || {}); out.ctx = { accts: out.accts, finSet, map: out.map };
    out.ps = out.runs ? HS.postedSlips(out.runs, out.slips || []) : [];
    return out;
  }
  const LOADERS = {};
  function loader(key, want) { return function (v, force) { const d = D[key] = D[key] || {}; d.busy = 1; d.err = ''; if (cur() === key) render(); bundle(force, want).then(b => Object.assign(d, b)).catch(e => { d.err = e.message; }).finally(() => { d.busy = 0; if (cur() === key) render(); }); }; }
  const refresh = key => LOADERS[key](V(), true);
  const RESET = { x_hremps: () => { ST.emp = null; }, x_hrpay: () => { ST.run = null; ST.slip = null; } };
  function screen(key, want, def) { LOADERS[key] = loader(key, want); def.load = (v, f) => { if (!f) { if (ST.deep !== key && RESET[key]) RESET[key](); ST.deep = null; } LOADERS[key](v, f); }; reg(key, def); }
  const busy = d => d.busy ? `<div class="mx-ld"><i></i><i></i><i></i> Loading…</div>` : d.err ? `<div class="mb-hint mb-bad" style="margin:0 4px 10px">⚠ ${esc(d.err)}</div>` : '';
  const needSetup = d => d.missing ? HH.card('', `<div class="mb-hint mb-bad">The HR lists are not set up yet.</div>${HH.btn('⚙️ HR Settings → Set up', 'toSet')}`) : '';
  const toSet = () => { go('x_hrset'); setTimeout(() => { V().tab = 'setup'; render(); }, 60); };
  const active = d => (d.emps || []).filter(e => e.status !== 'left');
  const empOpts = d => active(d).map(e => [String(e.id), e.fileNo + ' · ' + e.name]);
  const empOf = (d, id) => (d.emps || []).find(e => String(e.id) === String(id));
  const PAY = { wps: 'WPS (bank / exchange)', cash: 'Cash', cheque: 'Cheque' };

  /* ================= HR home ================= */
  screen('x_hrdash', { lv: true, docs: true, pay: true, loans: true }, {
    view(v, d) {
      const es = active(d), t = today(), p = t.slice(0, 7), joiners = es.filter(e => e.join && e.join.slice(0, 7) === p), leavers = (d.emps || []).filter(e => e.leaveDate && e.leaveDate.slice(0, 7) === p);
      const onLeave = (d.leaves || []).filter(l => l.status === 'approved' && l.from <= t && l.to >= t), pend = (d.leaves || []).filter(l => l.status === 'requested'), exp = H.expiring(d.docs, d.emps, t, 60);
      const run = (d.runs || []).find(r => r.period === p && r.status !== 'cancelled'), payroll = H.r2(es.reduce((s, e) => s + H.fixedOf(e), 0)), grat = H.r2(es.filter(e => e.pension !== 'gpssa').reduce((s, e) => s + H.gratuity(e, t).amount, 0));
      const noSal = es.filter(e => !e.basic).length, noBank = es.filter(e => e.payMethod === 'wps' && (!e.iban || !e.labourCard || !e.routing)).length;
      return HH.head('👥', 'Human resources', es.length + ' employees in service', '#be185d') + busy(d) + needSetup(d)
        + HH.kpis([['Headcount', String(es.length)], ['Monthly payroll (fixed)', n2(payroll)], ['Joiners / leavers this month', joiners.length + ' / ' + leavers.length], ['On leave today', String(onLeave.length)], ['Gratuity due if all left today', n2(grat)], ['Payroll ' + MN(p), run ? run.status : 'not started', run ? (run.status === 'paid' ? 'g' : 'o') : 'r']])
        + (noSal || noBank ? HH.card('To complete', (noSal ? `<div class="ei-kv"><span>Employees without a salary</span><b class="hr-red">${noSal}</b></div>` : '') + (noBank ? `<div class="ei-kv"><span>WPS employees missing IBAN, routing code or labour card no.</span><b class="hr-amb">${noBank}</b></div>` : '') + HH.btn('👥 Employees', 'toEmp', 's')) : '')
        + (pend.length ? HH.card('Leave requests waiting · ' + pend.length, pend.slice(0, 6).map(l => { const e = empOf(d, l.emp) || {}; return HH.li({ x: 'toLeave', ic: '🌴', c: '#b45309', t: (e.name || l.fileNo) + ' · ' + H.LEAVE[l.type].name, s: dmy(l.from) + ' – ' + dmy(l.to) + ' · ' + H.leaveDays(l.from, l.to) + ' day(s)', v: '›' }); }).join('')) : '')
        + (exp.length ? HH.card('Documents expiring in 60 days · ' + exp.length, table([{ k: 'n', t: 'Employee' }, { k: 'ty', t: 'Document' }, { k: 'e', t: 'Expires' }, { k: 'l', t: '', raw: 1 }], exp.slice(0, 12).map(x => ({ n: x.fileNo + ' · ' + x.name, ty: H.DOCS[x.type] || x.type, e: dmy(x.expiry), l: x.expired ? '<b class="hr-red">expired</b>' : `<span class="${x.daysLeft <= 30 ? 'hr-red' : 'hr-amb'}">${x.daysLeft} days</span>` }))) + HH.btn('📄 Documents', 'toDocs', 's')) : '')
        + HH.card('Quick actions', `<div class="mx-acts">${HH.sbtn('➕ Employee', 'nEmp', '', 'p')}${HH.sbtn('🌴 Leave request', 'toLeave')}${HH.sbtn('💰 Payroll', 'toPay')}${HH.sbtn('🤝 Loan / advance', 'toLoan')}${HH.sbtn('🏁 End of service', 'toEos')}</div>`);
    },
    act: { toSet, toEmp() { go('x_hremps'); }, nEmp() { ST.emp = 'new'; goTo('x_hremps'); }, toLeave() { go('x_hrleave'); }, toPay() { go('x_hrpay'); }, toLoan() { go('x_hrloans'); }, toDocs() { go('x_hrdocs'); }, toEos() { go('x_hreos'); } } });

  /* ================= Employees ================= */
  const EF = ['fileNo', 'name', 'nameAr', 'dept', 'position', 'grade', 'cc', 'location', 'nationality', 'gender', 'birth', 'join', 'probationEnd', 'contractEnd', 'payMethod', 'labourCard', 'routing', 'iban', 'pension', 'email', 'phone', 'manager', 'notes', 'basic', 'housing', 'transport', 'other', 'openDate', 'openLeave', 'openEosb', 'openLeaveProv'];
  screen('x_hremps', { lv: true, docs: true, pay: true, loans: true, ch: true }, {
    view(v, d) {
      const es = d.emps || [], s = d.set || H.settingsFromRow(null);
      if (ST.emp === 'new' && !v.form) { Object.assign(v, { form: 1, id: null, payMethod: 'wps', pension: 'none', ot: '1', join: today(), effDate: today() }); }
      if (v.form) { const fix = H.r2(num(v.basic) + num(v.housing) + num(v.transport) + num(v.other));
        return HH.head('👤', v.id ? 'Edit employee' : 'New employee', v.orbitId ? 'Linked to ORBIT (file no. ' + esc(v.fileNo) + ')' : '', '#be185d') + errs(v.errs)
          + HH.card('', `<div class="fin-row">${HH.f('File no. *', HH.inp('fileNo'))}${HH.f('Name *', HH.inp('name'))}</div><div class="fin-row">${HH.f('Name (Arabic)', HH.inp('nameAr'))}${HH.f('Nationality', HH.inp('nationality'))}${HH.f('Gender', HH.sel('gender', [['M', 'Male'], ['F', 'Female']], { r: false }))}</div><div class="fin-row">${HH.f('Department', HH.inp('dept'))}${HH.f('Position', HH.inp('position'))}${HH.f('Grade', HH.inp('grade'))}</div><div class="fin-row">${HH.f('Cost centre', HH.inp('cc'))}${HH.f('Location', HH.inp('location'))}${HH.f('Line manager', HH.inp('manager'))}</div>`)
          + HH.card('Contract', `<div class="fin-row">${HH.f('Join date *', HH.date('join'))}${HH.f('Probation ends', HH.date('probationEnd', { val: v.probationEnd || '' }))}${HH.f('Contract ends', HH.date('contractEnd', { val: v.contractEnd || '' }))}</div><div class="fin-row">${HH.f('Date of birth', HH.date('birth', { val: v.birth || '' }))}${HH.f('Email', HH.inp('email'))}${HH.f('Phone', HH.inp('phone'))}</div>`)
          + HH.card('Monthly salary (AED) · total ' + money(fix), `<div class="hr-g"><div><label>Basic</label>${HH.num('basic', { r: 1 })}</div><div><label>Housing</label>${HH.num('housing', { r: 1 })}</div><div><label>Transport</label>${HH.num('transport', { r: 1 })}</div><div><label>Other allowances</label>${HH.num('other', { r: 1 })}</div></div>${v.id ? `<div class="fin-row">${HH.f('Change effective from', HH.date('effDate'))}${HH.f('Reason for a change', HH.inp('reason', { ph: 'Increment, promotion…' }))}</div>` : ''}${HH.f('Overtime', HH.seg('ot', [['1', 'Paid overtime'], ['0', 'No overtime']], '1'))}${HH.f('Pension (UAE / GCC nationals)', HH.seg('pension', [['none', 'No — gratuity'], ['gpssa', 'Yes — pension instead of gratuity']], 'none'))}`)
          + HH.card('Payment', HH.f('Paid by', HH.seg('payMethod', Object.entries(PAY), 'wps')) + (v.payMethod === 'wps' ? `<div class="fin-row">${HH.f('Labour card / MOHRE person ID (14 digits)', HH.inp('labourCard', { mode: 'numeric' }))}${HH.f('Bank routing code (9 digits)', HH.inp('routing', { mode: 'numeric' }))}</div>${HH.f('IBAN (AE + 21 digits)', HH.inp('iban'))}` : ''))
          + HH.card('Brought in from an old system (optional)', `<div class="fin-row">${HH.f('As of', HH.date('openDate', { val: v.openDate || '' }))}${HH.f('Annual leave balance (days)', HH.num('openLeave'))}</div><div class="fin-row">${HH.f('Gratuity provision already booked', HH.num('openEosb'))}${HH.f('Leave salary provision already booked', HH.num('openLeaveProv'))}</div>`)
          + HH.card('Notes', HH.txt('notes')) + HH.bar(`<div class="mb-row">${HH.btn('Cancel', 'cancel', 's')}${HH.btn('💾 Save', 'save')}</div>`);
      }
      if (ST.emp && ST.emp !== 'new') {
        const e = es.find(x => x.id === ST.emp); if (!e) return busy(d); setTitle(e.fileNo);
        const tab = v.etab || 'info', t = today(), bal = H.balance(e, d.leaves, d.adjs, t, s), g = H.gratuity(e, t);
        const head = HH.head('👤', e.fileNo + ' · ' + esc(e.name), esc(e.position || '') + (e.dept ? ' · ' + esc(e.dept) : '') + ' · joined ' + dmy(e.join), COL[e.status])
          + HH.kpis([['Monthly salary', n2(H.fixedOf(e))], ['Annual leave balance', H.r2(bal.balance) + ' days'], [e.pension === 'gpssa' ? 'Pension member' : 'Gratuity to date', e.pension === 'gpssa' ? '—' : n2(g.amount)], ['Service', H.r2(H.monthsOf(e.join, e.leaveDate || t) / 12) + ' years']])
          + HH.tabs('etab', [['info', 'Details'], ['sal', 'Salary'], ['doc', 'Documents'], ['lv', 'Leave'], ['pay', 'Payslips'], ['loan', 'Loans']], 'info');
        const bar = HH.bar(`<div class="mb-row">${HH.btn('← Employees', 'back0', 's')}${e.status !== 'left' ? HH.btn('✏️ Edit', 'edit') : ''}</div>`);
        if (tab === 'sal') return head + HH.card('Salary history', table([{ k: 'date', t: 'From' }, { k: 'basic', t: 'Basic', n: 1 }, { k: 'housing', t: 'Housing', n: 1 }, { k: 'transport', t: 'Transport', n: 1 }, { k: 'other', t: 'Other', n: 1 }, { k: 'tot', t: 'Total', n: 1 }, { k: 'r', t: 'Reason' }],
            (d.changes || []).filter(c => String(c.empid) === String(e.id)).sort((a, b) => String(b.effdate).localeCompare(String(a.effdate))).map(c => ({ date: dmy(String(c.effdate).slice(0, 10)), basic: num(c.basic), housing: num(c.housing), transport: num(c.transport), other: num(c.otherallow), tot: H.r2(num(c.basic) + num(c.housing) + num(c.transport) + num(c.otherallow)), r: c.reason || '' })))) + bar;
        if (tab === 'doc') { const ds = (d.docs || []).filter(x => x.emp === String(e.id));
          return head + HH.card('Documents', table([{ k: 'ty', t: 'Document' }, { k: 'no', t: 'Number' }, { k: 'e', t: 'Expires' }], ds.map(x => ({ ty: H.DOCS[x.type] || x.type, no: x.no, e: x.expiry ? dmy(x.expiry) + (x.expiry < t ? ' · expired' : '') : '' }))) + `<div class="fin-row">${HH.f('Type', HH.sel('dt', Object.entries(H.DOCS), { ph: false }))}${HH.f('Number', HH.inp('dn'))}</div><div class="fin-row">${HH.f('Issued', HH.date('di', { val: v.di || '' }))}${HH.f('Expires', HH.date('de', { val: v.de || '' }))}</div>${HH.sbtn('＋ Add document', 'addDoc', 'style="width:100%"')}`) + bar; }
        if (tab === 'lv') return head + HH.card('Annual leave', `<div class="ei-kv"><span>Earned to date</span><b>${bal.earned}</b></div><div class="ei-kv"><span>Taken</span><b>${bal.taken}</b></div><div class="ei-kv"><span>Adjustments</span><b>${bal.adj}</b></div><div class="ei-kv"><span>Booked (future)</span><b>${bal.booked}</b></div><div class="ei-kv g"><span>Balance</span><b>${bal.balance} days</b></div>`)
          + HH.card('Leave history', table([{ k: 'ty', t: 'Type' }, { k: 'f', t: 'From' }, { k: 'to', t: 'To' }, { k: 'n', t: 'Days' }, { k: 'st', t: '', raw: 1 }], (d.leaves || []).filter(l => l.emp === String(e.id)).map(l => ({ ty: H.LEAVE[l.type].name, f: dmy(l.from), to: dmy(l.to), n: String(H.leaveDays(l.from, l.to)), st: pill(l.status) })))) + bar;
        if (tab === 'pay') { const rs = new Map((d.runs || []).map(r => [String(r.id), r])), ps = (d.slips || []).filter(x => x.emp === String(e.id) && rs.has(x.run)).sort((a, b) => b.period.localeCompare(a.period));
          return head + HH.card('Payslips', table([{ k: 'p', t: 'Month' }, { k: 'gross', t: 'Gross', n: 1 }, { k: 'net', t: 'Net', n: 1 }, { k: 'st', t: '', raw: 1 }], ps.map(x => ({ p: MN(x.period), gross: x.gross, net: x.net, st: pill(rs.get(x.run).status), _tap: x.id })), null, 'printSlip')) + bar; }
        if (tab === 'loan') return head + HH.card('Loans & advances', table([{ k: 'no', t: 'No.' }, { k: 'ty', t: 'Type' }, { k: 'amount', t: 'Amount', n: 1 }, { k: 'bal', t: 'Balance', n: 1 }, { k: 'st', t: '', raw: 1 }], (d.loans || []).filter(l => l.emp === String(e.id)).map(l => ({ no: l.no, ty: l.type, amount: l.amount, bal: H.loanBalance(l, d.ps), st: pill(l.status) })))) + bar;
        const kv = (k, x) => x ? `<div class="ei-kv"><span>${k}</span><b>${esc(x)}</b></div>` : '';
        return head + HH.card('Status · ' + pill(e.status), kv('Nationality', e.nationality) + kv('Grade', e.grade) + kv('Cost centre', e.cc) + kv('Location', e.location) + kv('Line manager', e.manager) + kv('Probation ends', e.probationEnd && dmy(e.probationEnd)) + kv('Contract ends', e.contractEnd && dmy(e.contractEnd)) + kv('Left', e.leaveDate && dmy(e.leaveDate) + (e.leaveReason ? ' · ' + e.leaveReason : '')) + kv('Paid by', PAY[e.payMethod]) + kv('IBAN', e.iban) + kv('Labour card no.', e.labourCard) + kv('Pension', e.pension === 'gpssa' ? 'Yes (no gratuity)' : '') + kv('Email', e.email) + kv('Phone', e.phone)) + bar;
      }
      const q = String(v.q || '').toLowerCase(), tab = v.tab || 'active', rows = es.filter(e => (tab === 'all' || (tab === 'left' ? e.status === 'left' : e.status !== 'left')) && (!q || (e.fileNo + ' ' + e.name + ' ' + e.position + ' ' + e.dept + ' ' + e.location).toLowerCase().includes(q)));
      setTitle('Employees');
      return HH.head('👥', 'Employees', active(d).length + ' in service · linked to ORBIT by file no.', '#be185d') + busy(d) + needSetup(d) + HH.search('q', 'Search file no., name, position, department')
        + HH.tabs('tab', [['active', 'In service'], ['left', 'Left'], ['all', 'All', es.length]], 'active')
        + HH.card('', table([{ k: 'fileNo', t: 'File no.' }, { k: 'name', t: 'Name' }, { k: 'position', t: 'Position' }, { k: 'dept', t: 'Department' }, { k: 'sal', t: 'Salary', n: 1 }], rows.slice(0, 500).map(e => ({ fileNo: e.fileNo, name: e.name, position: e.position, dept: e.dept, sal: H.fixedOf(e) || '', _tap: e.id })), null, 'open'))
        + HH.bar(`<div class="mb-row">${HH.btn('＋ New employee', 'add')}${s.empSource === 'orbit' ? HH.btn(v.lk ? '⏳ ' + esc(v.lk) : '🔗 Update from ORBIT', 'link', 's') : ''}</div>`);
    },
    act: { toSet,
      add(t, v) { ST.emp = 'new'; clear(v); render(); }, open(t, v) { ST.emp = +t.dataset.i; clear(v); render(); }, back0(t, v) { ST.emp = null; clear(v); render(); }, cancel(t, v) { if (ST.emp === 'new') ST.emp = null; v.form = 0; render(); },
      edit(t, v, d) { const e = d.emps.find(x => x.id === ST.emp), o = { form: 1, id: e.id, orbitId: e.orbitId, status: e.status, leaveDate: e.leaveDate, leaveReason: e.leaveReason, history: e.history, ot: e.otEligible ? '1' : '0', effDate: today() }; EF.forEach(k => { o[k] = e[k] == null ? '' : (typeof e[k] === 'number' ? (e[k] ? String(e[k]) : '') : e[k]); }); Object.assign(v, o); render(); },
      async save(t, v, d) { const e = { id: v.id }; EF.forEach(k => { e[k] = typeof v[k] === 'string' ? v[k].trim() : v[k]; }); Object.assign(e, { otEligible: v.ot !== '0', status: v.status || 'active', leaveDate: v.leaveDate || '', leaveReason: v.leaveReason || '', orbitId: v.orbitId || '', history: v.history || [], effDate: v.effDate, iban: String(v.iban || '').replace(/\s/g, '').toUpperCase() });
        const er = H.checkEmp(e, d.emps); if (!num(e.basic)) er.push('Basic salary is required'); if (er.length) { v.errs = er; render(); return; }
        try { const r = await HS.saveEmp(e, str(v.reason)); toast('✅ ' + e.name + ' saved', 'success'); clear(v); ST.emp = r.id; refresh('x_hremps'); } catch (x) { v.errs = [x.message]; render(); } },
      async link(t, v) { if (v.lk) return; v.lk = 'Reading ORBIT…'; render(); try { const r = await HS.linkOrbit(n => { v.lk = n; render(); }); toast('🔗 ORBIT: ' + r.added + ' added, ' + r.updated + ' updated (of ' + r.total + ')', 'success'); } catch (e) { toast(e.message, 'error'); } v.lk = ''; refresh('x_hremps'); },
      async addDoc(t, v, d) { const e = d.emps.find(x => x.id === ST.emp); if (!str(v.dn) && !v.de) return toast('Enter the number or the expiry date', 'warn');
        try { await S.add('HR_Documents', { Title: e.fileNo + ' ' + (v.dt || 'passport'), EmpId: String(e.id), FileNo: e.fileNo, DocType: v.dt || 'passport', DocNo: str(v.dn), IssueDate: v.di || '', ExpiryDate: v.de || '' }); S.drop('HR_Documents'); v.dn = ''; v.de = ''; v.di = ''; toast('✅ Document added', 'success'); refresh('x_hremps'); } catch (x) { toast(x.message, 'error'); } },
      printSlip(t, v, d) { const sl = d.slips.find(x => x.id === +t.dataset.i); printSlips([sl], d); } } });

  /* ================= Leave ================= */
  screen('x_hrleave', { lv: true }, {
    view(v, d) {
      const tab = v.tab || 'req', ls = d.leaves || [], t = today(), s = d.set;
      if (v.form) { const e = empOf(d, v.emp), b = e ? H.balance(e, ls, d.adjs, v.to || t, s) : null, n = H.leaveDays(v.from, v.to), chk = e && v.from && v.to ? H.checkLeave({ id: null, type: v.type, from: v.from, to: v.to }, e, ls, d.adjs, s) : [];
        const pay = e && v.from && v.to && v.to >= v.from ? H.leavePayDays(e, { id: null, emp: String(e.id), type: v.type, from: v.from, to: v.to }, ls) : [], full = pay.filter(x => x.f === 1).length, half = pay.filter(x => x.f === 0.5).length, unp = pay.filter(x => x.f === 0).length;
        return HH.head('🌴', 'Leave request', '', '#b45309') + errs(v.errs)
          + HH.card('', HH.f('Employee', HH.sel('emp', empOpts(d))) + HH.f('Type', HH.sel('type', Object.entries(H.LEAVE).map(([k, x]) => [k, x.name]), { ph: false })) + `<div class="fin-row">${HH.f('From', HH.date('from', { r: 1 }))}${HH.f('To', HH.date('to', { r: 1 }))}</div>${HH.f('Reason', HH.inp('reason'))}`)
          + (e ? HH.card(n + ' calendar day(s)', (v.type === 'annual' && b ? `<div class="ei-kv"><span>Annual leave balance</span><b>${b.balance} days${b.booked ? ' (' + b.booked + ' booked)' : ''}</b></div>` : '') + (pay.length ? `<div class="ei-kv"><span>Pay</span><b>${full} full${half ? ' · ' + half + ' half' : ''}${unp ? ' · ' + unp + ' unpaid' : ''}</b></div>` : '') + errs(chk, 'Cannot request')) : '')
          + HH.bar(`<div class="mb-row">${HH.btn('Cancel', 'cancel', 's')}${HH.btn('💾 Save request', 'save', 's')}${HH.btn('✓ Save & approve', 'saveApp')}</div>`);
      }
      if (tab === 'bal') { const rows = active(d).map(e => { const b = H.balance(e, ls, d.adjs, t, s); return { fileNo: e.fileNo, name: e.name, earned: b.earned, taken: b.taken, adj: b.adj, booked: b.booked, balance: b.balance, value: H.r2(Math.max(0, b.balance) * (s.leaveBasis === 'gross' ? H.fixedOf(e) : e.basic) / 30) }; });
        v._rep = rows; return HH.head('🌴', 'Leave', 'Annual leave balances today', '#b45309') + busy(d) + HH.tabs('tab', [['req', 'Requests'], ['bal', 'Balances'], ['adj', 'Adjustments']], 'req')
          + HH.card('', table([{ k: 'fileNo', t: 'File no.' }, { k: 'name', t: 'Name' }, { k: 'earned', t: 'Earned', n: 1 }, { k: 'taken', t: 'Taken', n: 1 }, { k: 'adj', t: 'Adj.', n: 1 }, { k: 'booked', t: 'Booked', n: 1 }, { k: 'balance', t: 'Balance', n: 1 }, { k: 'value', t: 'Value (AED)', n: 1 }], rows, { fileNo: 'Total', value: H.r2(rows.reduce((a, r) => a + r.value, 0)) })) + HH.bar(HH.btn('⬇ CSV', 'csvBal', 's')); }
      if (tab === 'adj') return HH.head('🌴', 'Leave', 'Opening balances, encashment, corrections', '#b45309') + busy(d) + HH.tabs('tab', [['req', 'Requests'], ['bal', 'Balances'], ['adj', 'Adjustments']], 'req')
        + HH.card('New adjustment', HH.f('Employee', HH.sel('aemp', empOpts(d), { r: false })) + `<div class="fin-row">${HH.f('Date', HH.date('adate'))}${HH.f('Days (+ add / − remove)', HH.num('adays'))}</div>${HH.f('Reason', HH.inp('areason', { ph: 'Opening balance, encashed, correction…' }))}${HH.sbtn('＋ Add adjustment', 'addAdj', 'style="width:100%"')}`)
        + HH.card('Adjustments', table([{ k: 'n', t: 'Employee' }, { k: 'date', t: 'Date' }, { k: 'days', t: 'Days', n: 1 }, { k: 'reason', t: 'Reason' }], (d.adjs || []).slice().reverse().map(a => ({ n: (empOf(d, a.emp) || {}).name || a.emp, date: dmy(a.date), days: a.days, reason: a.reason }))));
      const st = v.st || 'requested', rows = ls.filter(l => st === 'all' || l.status === st);
      setTitle('Leave');
      return HH.head('🌴', 'Leave', 'Requests, approval, balances', '#b45309') + busy(d) + needSetup(d) + HH.tabs('tab', [['req', 'Requests'], ['bal', 'Balances'], ['adj', 'Adjustments']], 'req')
        + HH.tabs('st', [['requested', 'Waiting', ls.filter(l => l.status === 'requested').length], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']], 'requested')
        + HH.card('', rows.slice(0, 200).map(l => { const e = empOf(d, l.emp) || {}; return `<div class="ei-ln"><div class="ei-lnh"><span>${esc((e.fileNo || '') + ' · ' + (e.name || ''))} · ${esc(H.LEAVE[l.type].name)}</span>${pill(l.status)}</div><div class="ei-kv"><span>${dmy(l.from)} – ${dmy(l.to)}</span><b>${H.leaveDays(l.from, l.to)} day(s)</b></div>${l.reason ? `<div class="mb-hint">${esc(l.reason)}</div>` : ''}${l.status === 'requested' ? `<div class="mx-acts">${HH.sbtn('✓ Approve', 'app', `data-i="${l.id}"`, 'p')}${HH.sbtn('✕ Reject', 'rej', `data-i="${l.id}"`)}</div>` : l.status === 'approved' && l.from > today() ? HH.sbtn('Cancel leave', 'can', `data-i="${l.id}"`) : ''}</div>`; }).join('') || HH.empty('Nothing here.'))
        + HH.bar(HH.btn('＋ New leave request', 'add'));
    },
    act: { toSet,
      add(t, v) { Object.assign(v, { form: 1, type: 'annual', from: today(), to: today(), emp: '', reason: '', errs: null }); render(); }, cancel(t, v) { v.form = 0; render(); },
      save(t, v, d) { return saveL(v, d, 'requested'); }, saveApp(t, v, d) { return saveL(v, d, 'approved'); },
      async app(t, v, d) { const l = d.leaves.find(x => x.id === +t.dataset.i), e = empOf(d, l.emp), er = H.checkLeave(l, e, d.leaves, d.adjs, d.set); if (er.length && !confirm(er.join('\n') + '\n\nApprove anyway?')) return; try { await HS.setLeave(l, 'approved'); toast('✓ Approved', 'success'); refresh('x_hrleave'); } catch (e2) { toast(e2.message, 'error'); } },
      async rej(t, v, d) { const l = d.leaves.find(x => x.id === +t.dataset.i); if (!confirm('Reject this leave request?')) return; try { await HS.setLeave(l, 'rejected'); refresh('x_hrleave'); } catch (e) { toast(e.message, 'error'); } },
      async can(t, v, d) { const l = d.leaves.find(x => x.id === +t.dataset.i); if (!confirm('Cancel this approved leave?')) return; try { await HS.setLeave(l, 'cancelled'); refresh('x_hrleave'); } catch (e) { toast(e.message, 'error'); } },
      csvBal(t, v) { csv('leave_balances', [{ k: 'fileNo', t: 'File no.' }, { k: 'name', t: 'Name' }, { k: 'earned', t: 'Earned' }, { k: 'taken', t: 'Taken' }, { k: 'adj', t: 'Adjustments' }, { k: 'booked', t: 'Booked' }, { k: 'balance', t: 'Balance' }, { k: 'value', t: 'Value' }], v._rep || []); },
      async addAdj(t, v, d) { const e = empOf(d, v.aemp); if (!e || !num(v.adays)) return toast('Choose the employee and the days', 'warn'); try { await S.add('HR_LeaveAdj', { Title: e.fileNo, EmpId: String(e.id), FileNo: e.fileNo, LeaveType: 'annual', AdjDate: v.adate || today(), Days: num(v.adays), Reason: str(v.areason) }); S.drop('HR_LeaveAdj'); v.adays = ''; v.areason = ''; toast('✅ Adjustment added', 'success'); refresh('x_hrleave'); } catch (x) { toast(x.message, 'error'); } } } });
  async function saveL(v, d, status) { const e = empOf(d, v.emp); if (!e) { v.errs = ['Choose the employee']; render(); return; } const er = H.checkLeave({ id: null, type: v.type, from: v.from, to: v.to }, e, d.leaves, d.adjs, d.set); if (er.length) { v.errs = er; render(); return; }
    try { await HS.saveLeave({ type: v.type, from: v.from, to: v.to, reason: str(v.reason), status }, e);
      toast(status === 'approved' ? '✓ Leave approved' : '✅ Request saved', 'success'); clear(v); refresh('x_hrleave'); } catch (x) { v.errs = [x.message]; render(); } }

  /* ================= Payroll ================= */
  function printSlips(list, d) {
    const co = (d.set && d.set.company) || '', body = list.map(s => { const e = empOf(d, s.emp) || {}, c = (s.detail || {}).comp || {}, row = (k, x) => x ? `<tr><td>${k}</td><td style="text-align:right">${n2(x)}</td></tr>` : '';
      return `<div style="page-break-after:always;font-family:Inter,Arial,sans-serif;max-width:640px"><h2 style="margin:0 0 4px">Payslip · ${MN(s.period)}</h2><div style="color:#555;margin-bottom:10px">${esc(co)}</div><table style="width:100%;border-collapse:collapse;margin-bottom:10px"><tr><td><b>${esc(e.name || '')}</b><br>File no. ${esc(s.fileNo)} · ${esc(e.position || '')}</td><td style="text-align:right">Paid days ${s.paidDays}<br>${esc(PAY[s.payMethod] || '')}</td></tr></table>
        <table style="width:100%;border-collapse:collapse" border="1" cellpadding="6"><tr style="background:#f1f5f9"><th style="text-align:left">Earnings</th><th style="text-align:right">AED</th></tr>${row('Basic', c.basic)}${row('Housing', c.housing)}${row('Transport', c.transport)}${row('Other allowances', c.other)}${row('Overtime (' + H.r2(s.otN + s.otNight + s.otRest + s.otHol) + ' h)', s.otAmount)}${row('Bonus', s.bonus)}${row('Other additions', s.otherAdd)}${s.absDed ? `<tr><td>Absence / unpaid leave (${s.unpaidDays} day(s))</td><td style="text-align:right">−${n2(s.absDed)}</td></tr>` : ''}<tr><td><b>Gross</b></td><td style="text-align:right"><b>${n2(s.gross)}</b></td></tr>
        <tr style="background:#f1f5f9"><th style="text-align:left">Deductions</th><th></th></tr>${row('Loan / advance', s.loanDed)}${row('Pension (employee)', s.penEe)}${row('Other deductions', s.deduct)}<tr><td><b>Net pay</b></td><td style="text-align:right"><b>${n2(s.net)}</b></td></tr></table>${s.notes ? `<p>${esc(s.notes)}</p>` : ''}</div>`; }).join('');
    printHtml('Payslips', body);
  }
  screen('x_hrpay', { pay: true, loans: true }, {
    view(v, d) {
      const rs = d.runs || [], accts = d.accts || [];
      if (ST.run === 'new') { if (!v.init) Object.assign(v, { init: 1, period: today().slice(0, 7), att: '1' });
        return HH.head('💰', 'New payroll run', '', '#047857') + busy(d) + errs(v.errs) + HH.card('', HH.f('Month', `<input type="month" data-v="period" value="${esc(v.period)}">`) + HH.f('Overtime & absence', HH.seg('att', [['1', 'From ORBIT attendance'], ['0', 'Enter by hand']], '1'), 'Taken from Attendance_Data_tbl by file no. — you can change any payslip before approving'))
          + HH.card('', `<span class="mb-hint">Everyone in service in the month gets a payslip: joiners and leavers are paid for their days, approved unpaid / half-paid leave is deducted, loan instalments are taken, and gratuity and leave salary are accrued.</span>`) + HH.bar(`<div class="mb-row">${HH.btn('Cancel', 'back0', 's')}${HH.btn(v.busy ? '⏳ ' + esc(v.busy) : '⚙️ Calculate payroll', 'create')}</div>`); }
      if (ST.run) {
        const r = rs.find(x => x.id === ST.run); if (!r) return busy(d); setTitle(r.no);
        const ss = (d.slips || []).filter(x => x.run === String(r.id)).sort((a, b) => a.fileNo.localeCompare(b.fileNo, undefined, { numeric: true })), draft = r.status === 'draft';
        if (ST.slip) { const s = ss.find(x => x.id === ST.slip); if (!s) { ST.slip = null; return busy(d); } const e = empOf(d, s.emp) || {};
          if (!v.si) Object.assign(v, { si: 1, otN: s.otN || '', otNight: s.otNight || '', otRest: s.otRest || '', otHol: s.otHol || '', absent: s.absentDays || '', bonus: s.bonus || '', otherAdd: s.otherAdd || '', deduct: s.deduct || '', notes: s.notes || '' });
          const kv = (k, x, neg) => x ? `<div class="ei-kv"><span>${k}</span><b>${neg ? '−' : ''}${n2(x)}</b></div>` : '', c = (s.detail || {}).comp || {};
          return HH.head('🧾', esc(e.name || s.fileNo), 'Payslip ' + MN(r.period) + ' · ' + s.paidDays + ' paid day(s)' + ((s.detail || {}).src ? ' · ' + esc(s.detail.src) : ''), '#047857')
            + (draft ? HH.card('Inputs', `<div class="hr-g"><div><label>Normal OT h</label>${HH.num('otN')}</div><div><label>Night OT h</label>${HH.num('otNight')}</div><div><label>Rest-day OT h</label>${HH.num('otRest')}</div><div><label>Holiday OT h</label>${HH.num('otHol')}</div><div><label>Absent days</label>${HH.num('absent')}</div><div><label>Bonus</label>${HH.num('bonus')}</div><div><label>Other additions</label>${HH.num('otherAdd')}</div><div><label>Deductions</label>${HH.num('deduct')}</div></div>${HH.f('Note on payslip', HH.inp('notes'))}${HH.sbtn('↻ Recalculate this payslip', 'saveSlip', 'style="width:100%"', 'p')}`) : '')
            + HH.card('Payslip', kv('Basic', c.basic) + kv('Housing', c.housing) + kv('Transport', c.transport) + kv('Other allowances', c.other) + kv('Overtime', s.otAmount) + kv('Bonus', s.bonus) + kv('Other additions', s.otherAdd) + kv('Absence / unpaid leave (' + s.unpaidDays + ' d)', s.absDed, 1) + `<div class="ei-kv g"><span>Gross</span><b>${n2(s.gross)}</b></div>` + kv('Loan / advance', s.loanDed, 1) + kv('Pension (employee)', s.penEe, 1) + kv('Other deductions', s.deduct, 1) + `<div class="ei-kv g"><span>Net pay</span><b>${n2(s.net)}</b></div>` + kv('Employer pension', s.penEr) + kv('Gratuity accrued', s.gratAccr) + kv('Leave salary accrued', s.leaveAccr) + ((s.detail || {}).leave || []).map(l => `<div class="mb-hint">${esc(H.LEAVE[l.type].name)}: ${l.days} day(s) in the month, ${l.unpaid} unpaid</div>`).join(''))
            + HH.bar(`<div class="mb-row">${HH.btn('← Run', 'slipBack', 's')}${HH.btn('🖨 Payslip', 'print1', 's')}</div>`); }
        return HH.head('💰', r.no + ' · ' + MN(r.period), r.count + ' employees', COL[r.status]) + busy(d) + errs(v.errs)
          + HH.kpis([['Gross', n2(r.gross)], ['Deductions', n2(r.ded)], ['Net pay', n2(r.net), 'g'], ['Status', r.status]])
          + HH.card('Status · ' + pill(r.status), (r.journal ? `<div class="ei-kv"><span>Journal entry</span><b>${esc(r.journal)}</b></div>` : '') + (r.payJournal ? `<div class="ei-kv"><span>Paid</span><b>${dmy(r.payDate)} · ${esc(r.payJournal)}</b></div>` : '') + (r.sif ? `<div class="ei-kv"><span>Last WPS file</span><b>${esc(r.sif)}</b></div>` : '')
              + (r.status === 'posted' ? `<div class="fin-row">${HH.f('Paid from', HH.sel('paidFrom', acctOpts(accts, a => ['bank', 'cash'].includes(a.sub)), { ph: false }))}${HH.f('Date', HH.date('payDate'))}</div>` : ''))
          + HH.card('Payslips', table([{ k: 'fileNo', t: 'File no.' }, { k: 'n', t: 'Name' }, { k: 'paidDays', t: 'Days' }, { k: 'earned', t: 'Salary', n: 1 }, { k: 'otAmount', t: 'OT', n: 1 }, { k: 'absDed', t: 'Absence', n: 1 }, { k: 'ded', t: 'Deductions', n: 1 }, { k: 'net', t: 'Net', n: 1 }],
              ss.map(s => ({ fileNo: s.fileNo, n: (empOf(d, s.emp) || {}).name || '', paidDays: String(s.paidDays), earned: s.earned, otAmount: s.otAmount, absDed: s.absDed, ded: H.r2(s.deduct + s.loanDed + s.penEe), net: s.net, _tap: s.id, _cls: s.net < 0 ? 'sub' : '' })), { fileNo: 'Total', net: r.net }, 'openSlip'))
          + HH.bar(`<div class="mb-row">${HH.btn('← Runs', 'back0', 's')}${HH.btn('🖨 Payslips', 'printAll', 's')}${HH.btn('⬇ CSV', 'csvRun', 's')}${draft ? HH.btn('🗑', 'delRun', 's') + HH.btn(v.busy ? '⏳ ' + esc(v.busy) : '↻ Recalculate', 'recalc', 's') + HH.btn('✓ Approve', 'approve') : r.status === 'approved' ? HH.btn('↺ Back to draft', 'toDraft', 's') + HH.btn('📒 Post to ledger', 'post') : r.status === 'posted' ? HH.btn('🏦 WPS file', 'sif', 's') + HH.btn('✓ Mark paid', 'pay') : HH.btn('🏦 WPS file', 'sif', 's')}</div>`);
      }
      setTitle('Payroll');
      return HH.head('💰', 'Payroll', 'Monthly runs · WPS file · posting', '#047857') + busy(d) + needSetup(d)
        + HH.card('', table([{ k: 'no', t: 'Run' }, { k: 'p', t: 'Month' }, { k: 'count', t: 'People' }, { k: 'gross', t: 'Gross', n: 1 }, { k: 'net', t: 'Net', n: 1 }, { k: 'st', t: '', raw: 1 }], rs.map(r => ({ no: r.no, p: MN(r.period), count: String(r.count), gross: r.gross, net: r.net, st: pill(r.status), _tap: r.id })), null, 'open'))
        + HH.bar(HH.btn('＋ New payroll run', 'add'));
    },
    act: { toSet,
      add(t, v) { ST.run = 'new'; clear(v); render(); }, open(t, v) { ST.run = +t.dataset.i; ST.slip = null; clear(v); render(); }, back0(t, v) { ST.run = null; ST.slip = null; clear(v); render(); },
      openSlip(t, v) { ST.slip = +t.dataset.i; v.si = 0; render(); }, slipBack(t, v) { ST.slip = null; v.si = 0; render(); },
      async create(t, v) { if (v.busy) return; v.busy = 'Calculating…'; v.errs = null; render(); try { const r = await HS.createRun(v.period, v.att === '1', n => { v.busy = n; render(); }); toast('💰 ' + r.no + ' · ' + r.count + ' payslip(s)' + (v.att === '1' ? ' · attendance for ' + r.att : ''), 'success'); ST.run = r.id; clear(v); } catch (e) { v.errs = [e.message]; } v.busy = ''; refresh('x_hrpay'); },
      async saveSlip(t, v, d) { const r = d.runs.find(x => x.id === ST.run), s = d.slips.find(x => x.id === ST.slip); try { await HS.updateSlip(r, s, { otN: num(v.otN), otNight: num(v.otNight), otRest: num(v.otRest), otHol: num(v.otHol), absent: num(v.absent), bonus: num(v.bonus), otherAdd: num(v.otherAdd), deduct: num(v.deduct), notes: str(v.notes), src: ((s.detail || {}).src ? s.detail.src + ' · ' : '') + 'edited' }); toast('↻ Payslip recalculated', 'success'); v.si = 0; refresh('x_hrpay'); } catch (e) { toast(e.message, 'error'); } },
      async recalc(t, v, d) { if (v.busy) return; v.busy = 'Recalculating…'; render(); try { await HS.recalc(d.runs.find(x => x.id === ST.run), n => { v.busy = n; render(); }); toast('↻ Recalculated', 'success'); } catch (e) { toast(e.message, 'error'); } v.busy = ''; refresh('x_hrpay'); },
      async approve(t, v, d) { const r = d.runs.find(x => x.id === ST.run); if ((d.slips || []).some(s => s.run === String(r.id) && s.net < 0)) return toast('Some payslips have negative net pay — fix them first', 'error'); if (!confirm('Approve ' + r.no + '? Payslips are locked once approved.')) return; await HS.setRun(r, 'approved'); refresh('x_hrpay'); },
      async toDraft(t, v, d) { await HS.setRun(d.runs.find(x => x.id === ST.run), 'draft'); refresh('x_hrpay'); },
      async delRun(t, v, d) { const r = d.runs.find(x => x.id === ST.run); if (!confirm('Delete draft ' + r.no + '?')) return; try { await HS.deleteRun(r); ST.run = null; clear(v); refresh('x_hrpay'); } catch (e) { toast(e.message, 'error'); } },
      async post(t, v, d) { const r = d.runs.find(x => x.id === ST.run); if (!confirm('Post ' + r.no + ' to the ledger (net ' + money(r.net) + ')?')) return; try { const j = await HS.postRun(r, d.ctx); toast('📒 Posted · ' + j, 'success'); } catch (e) { v.errs = [e.message]; } refresh('x_hrpay'); },
      async pay(t, v, d) { const r = d.runs.find(x => x.id === ST.run), from = v.paidFrom || (d.accts.find(a => a.sub === 'bank') || {}).code; if (!confirm('Record salaries of ' + money(r.net) + ' paid from ' + acctName(d.accts, from) + '?')) return; try { const j = await HS.payRun(r, from, v.payDate || today(), d.ctx); toast('✓ Paid · ' + j, 'success'); } catch (e) { v.errs = [e.message]; } refresh('x_hrpay'); },
      async sif(t, v, d) { const r = d.runs.find(x => x.id === ST.run), ss = d.slips.filter(x => x.run === String(r.id)), w = H.sif(ss, d.emps, d.set, r.period, new Date(), r.no.replace(/[^A-Za-z0-9]/g, '').slice(0, 35));
        if (!w.ok) { v.errs = w.errors; render(); return; } download(w.name, w.text); try { await S.upd('HR_PayRuns', r.id, { SifName: w.name }); S.drop('HR_PayRuns'); } catch (e) {} toast('🏦 ' + w.name + ' · ' + w.count + ' employee(s) · ' + money(w.total), 'success'); const cash = ss.filter(x => x.payMethod !== 'wps' && x.net > 0).length; if (cash) toast(cash + ' employee(s) paid by cash / cheque are not in the file', 'info'); refresh('x_hrpay'); },
      printAll(t, v, d) { printSlips(d.slips.filter(x => x.run === String(ST.run)), d); }, print1(t, v, d) { printSlips([d.slips.find(x => x.id === ST.slip)], d); },
      csvRun(t, v, d) { const r = d.runs.find(x => x.id === ST.run); csv('payroll_' + r.period, [{ k: 'fileNo', t: 'File no.' }, { k: 'n', t: 'Name' }, { k: 'paidDays', t: 'Paid days' }, { k: 'earned', t: 'Salary' }, { k: 'otAmount', t: 'Overtime' }, { k: 'bonus', t: 'Bonus' }, { k: 'otherAdd', t: 'Other additions' }, { k: 'absDed', t: 'Absence' }, { k: 'gross', t: 'Gross' }, { k: 'loanDed', t: 'Loan' }, { k: 'penEe', t: 'Pension' }, { k: 'deduct', t: 'Deductions' }, { k: 'net', t: 'Net' }, { k: 'gratAccr', t: 'Gratuity accrued' }, { k: 'leaveAccr', t: 'Leave accrued' }], d.slips.filter(x => x.run === String(r.id)).map(s => Object.assign({ n: (empOf(d, s.emp) || {}).name || '' }, s))); } } });

  /* ================= Loans & advances ================= */
  screen('x_hrloans', { loans: true, pay: true }, {
    view(v, d) {
      const ls = d.loans || [], accts = d.accts || [];
      if (v.form) return HH.head('🤝', 'New loan / advance', '', '#7c3aed') + errs(v.errs) + HH.card('', HH.f('Employee', HH.sel('emp', empOpts(d), { r: false })) + HH.f('Type', HH.seg('type', [['advance', 'Salary advance'], ['loan', 'Loan']], 'advance')) + `<div class="fin-row">${HH.f('Amount (AED)', HH.num('amount', { r: 1 }))}${HH.f('Monthly instalment', HH.num('inst', { r: 1 }))}</div><div class="fin-row">${HH.f('Date', HH.date('date'))}${HH.f('First deduction month', `<input type="month" data-v="start" value="${esc(v.start)}">`)}</div>${HH.f('Paid from', HH.sel('paidFrom', acctOpts(accts, a => ['bank', 'cash'].includes(a.sub)), { ph: 'Not paid yet / outside the ledger' }))}${HH.f('Notes', HH.inp('notes'))}` + (num(v.amount) && num(v.inst) ? `<span class="mb-hint">${Math.ceil(num(v.amount) / num(v.inst))} instalment(s).</span>` : '')) + HH.bar(`<div class="mb-row">${HH.btn('Cancel', 'cancel', 's')}${HH.btn('💾 Save', 'save')}</div>`);
      const rows = ls.map(l => ({ no: l.no, n: (empOf(d, l.emp) || {}).name || l.fileNo, ty: l.type === 'loan' ? 'Loan' : 'Advance', date: dmy(l.date), amount: l.amount, inst: l.inst, bal: H.loanBalance(l, d.ps), st: pill(l.status) }));
      setTitle('Loans & advances');
      return HH.head('🤝', 'Loans & advances', 'Repaid through payroll', '#7c3aed') + busy(d) + needSetup(d) + HH.kpis([['Outstanding', n2(rows.filter((r, i) => ls[i].status === 'active').reduce((a, r) => a + r.bal, 0))], ['Active', String(ls.filter(l => l.status === 'active').length)]])
        + HH.card('', table([{ k: 'no', t: 'No.' }, { k: 'n', t: 'Employee' }, { k: 'ty', t: 'Type' }, { k: 'date', t: 'Date' }, { k: 'amount', t: 'Amount', n: 1 }, { k: 'inst', t: 'Instalment', n: 1 }, { k: 'bal', t: 'Balance', n: 1 }, { k: 'st', t: '', raw: 1 }], rows)) + HH.bar(HH.btn('＋ New loan / advance', 'add'));
    },
    act: { toSet, add(t, v) { Object.assign(v, { form: 1, type: 'advance', date: today(), start: H.addM(today().slice(0, 7), 1), amount: '', inst: '' }); render(); }, cancel(t, v) { v.form = 0; render(); },
      async save(t, v, d) { const e = empOf(d, v.emp), er = []; if (!e) er.push('Choose the employee'); if (!(num(v.amount) > 0)) er.push('Amount is required'); if (!(num(v.inst) > 0)) er.push('Instalment is required'); if (num(v.inst) > num(v.amount)) er.push('Instalment is more than the amount'); if (!/^\d{4}-\d\d$/.test(v.start || '')) er.push('Choose the first deduction month'); if (er.length) { v.errs = er; render(); return; }
        try { const no = await HS.saveLoan({ type: v.type, amount: num(v.amount), inst: num(v.inst), date: v.date, start: v.start, paidFrom: v.paidFrom || '', notes: str(v.notes) }, e, d.ctx); toast('✅ ' + no + ' saved', 'success'); clear(v); refresh('x_hrloans'); } catch (x) { v.errs = [x.message]; render(); } } } });

  /* ================= Documents ================= */
  screen('x_hrdocs', { docs: true }, {
    view(v, d) { const within = num(v.within || 60), t = today(), all = (d.docs || []).map(x => { const e = empOf(d, x.emp) || {}; return Object.assign({}, x, { name: e.name, fileNo: e.fileNo, st: e.status }); }).filter(x => x.st !== 'left'), exp = H.expiring(d.docs, d.emps, t, within);
      const rows = (v.tab || 'exp') === 'exp' ? exp : all; v._rep = rows;
      setTitle('Documents');
      return HH.head('📄', 'Documents', 'Passports, visas, Emirates ID, labour cards — expiry alerts', '#0369a1') + busy(d) + needSetup(d) + HH.tabs('tab', [['exp', 'Expiring', exp.length], ['all', 'All', all.length]], 'exp')
        + ((v.tab || 'exp') === 'exp' ? HH.card('', HH.f('Expiring within (days)', HH.sel('within', [['30', '30'], ['60', '60'], ['90', '90'], ['180', '180']], { ph: false }))) : '')
        + HH.card('', table([{ k: 'n', t: 'Employee' }, { k: 'ty', t: 'Document' }, { k: 'no', t: 'Number' }, { k: 'e', t: 'Expires' }, { k: 'l', t: '', raw: 1 }], rows.map(x => ({ n: x.fileNo + ' · ' + x.name, ty: H.DOCS[x.type] || x.type, no: x.no, e: x.expiry ? dmy(x.expiry) : '', l: !x.expiry ? '' : x.expiry < t ? '<b class="hr-red">expired</b>' : `<span class="${H.daysBetween(t, x.expiry) <= 31 ? 'hr-red' : 'hr-amb'}">${H.daysBetween(t, x.expiry) - 1} days</span>` }))))
        + HH.bar(HH.btn('⬇ CSV', 'csv', 's')); },
    act: { toSet, csv(t, v) { csv('documents', [{ k: 'fileNo', t: 'File no.' }, { k: 'name', t: 'Name' }, { k: 'type', t: 'Type' }, { k: 'no', t: 'Number' }, { k: 'issue', t: 'Issued' }, { k: 'expiry', t: 'Expires' }], v._rep || []); } } });

  /* ================= End of service ================= */
  screen('x_hreos', { lv: true, pay: true, loans: true, sets: true }, {
    view(v, d) { const t = today(), s = d.set;
      if (v.emp) { const e = empOf(d, v.emp); if (!e) return busy(d); const date = v.date || t, st = H.settlement(Object.assign({}, e, { leaveDate: date }), date, { set: s, map: d.map, leaves: d.leaves, adjs: d.adjs, loans: d.loans, postedSlips: d.ps }, { otherAdd: num(v.oa), otherDed: num(v.od) });
        return HH.head('🏁', 'Final settlement · ' + esc(e.name), e.fileNo + ' · joined ' + dmy(e.join), '#475569') + errs(v.errs)
          + HH.card('', `<div class="fin-row">${HH.f('Last working day', HH.date('date', { r: 1 }))}${HH.f('Reason', HH.sel('reason', [['Resignation', 'Resignation'], ['Termination', 'Termination'], ['End of contract', 'End of contract'], ['Retirement', 'Retirement'], ['Death', 'Death']], { ph: false, r: false }))}</div><div class="fin-row">${HH.f('Other amounts due (AED)', HH.num('oa', { r: 1 }))}${HH.f('Other amounts to recover', HH.num('od', { r: 1 }))}</div><span class="mb-hint">Salary for the last month is paid by that month's payroll run (set the leaving date, then run payroll). Article 51: 21 days' basic a year for the first five years, 30 days after, pro-rata, nothing under one year, capped at two years' wage.</span>`)
          + HH.card('Settlement', `<div class="ei-kv"><span>Service</span><b>${st.gratuity.years} years${st.gratuity.note ? ' · ' + esc(st.gratuity.note) : ''}</b></div><div class="ei-kv"><span>Gratuity (${st.gratuity.days || 0} days of basic${st.gratuity.capped ? ', capped' : ''})</span><b>${n2(st.gratuity.amount)}</b></div><div class="ei-kv"><span>Unused annual leave (${st.leaveDays} days)</span><b>${n2(st.leavePay)}</b></div>${st.otherAdd ? `<div class="ei-kv"><span>Other amounts due</span><b>${n2(st.otherAdd)}</b></div>` : ''}${st.loan ? `<div class="ei-kv"><span>Loan / advance recovered</span><b>−${n2(st.loan)}</b></div>` : ''}${st.otherDed ? `<div class="ei-kv"><span>Other recoveries</span><b>−${n2(st.otherDed)}</b></div>` : ''}<div class="ei-kv g"><span>Net settlement</span><b>${n2(st.net)}</b></div>`
            + table([{ k: 'a', t: 'Account' }, { k: 'debit', t: 'Debit', n: 1 }, { k: 'credit', t: 'Credit', n: 1 }], st.entry.lines.map(l => ({ a: acctName(d.accts, l.account), debit: l.debit || '', credit: l.credit || '' }))))
          + HH.bar(`<div class="mb-row">${HH.btn('← Back', 'back0', 's')}${HH.btn('📒 Post final settlement', 'settle')}</div>`); }
      const rows = active(d).map(e => { const g = e.pension === 'gpssa' ? { amount: 0, years: H.r2(H.monthsOf(e.join, t) / 12) } : H.gratuity(e, t), held = H.r2(num(e.openEosb) + (d.ps || []).filter(p => p.emp === String(e.id)).reduce((a, p) => a + p.gratAccr, 0)); return { id: e.id, fileNo: e.fileNo, name: e.name, join: dmy(e.join), years: g.years, amount: g.amount, held, diff: H.r2(g.amount - held), pen: e.pension === 'gpssa' ? 'pension' : '' }; });
      v._rep = rows; setTitle('End of service');
      return HH.head('🏁', 'End of service', 'Gratuity liability today and final settlements', '#475569') + busy(d) + needSetup(d)
        + HH.kpis([['Gratuity if all left today', n2(rows.reduce((a, r) => a + r.amount, 0))], ['Provision in the ledger', n2(rows.reduce((a, r) => a + r.held, 0))], ['Settlements posted', String((d.sets || []).length)]])
        + HH.card('Employees · tap to settle', table([{ k: 'fileNo', t: 'File no.' }, { k: 'name', t: 'Name' }, { k: 'join', t: 'Joined' }, { k: 'years', t: 'Years', n: 1 }, { k: 'amount', t: 'Gratuity', n: 1 }, { k: 'held', t: 'Provision', n: 1 }, { k: 'pen', t: '' }], rows.map(r => Object.assign({ _tap: r.id }, r)), null, 'pick'))
        + ((d.sets || []).length ? HH.card('Settlements', table([{ k: 'fileNo', t: 'File no.' }, { k: 'date', t: 'Date' }, { k: 'reason', t: 'Reason' }, { k: 'gratuity', t: 'Gratuity', n: 1 }, { k: 'net', t: 'Net', n: 1 }, { k: 'journal', t: 'Journal' }], d.sets.map(x => Object.assign({}, x, { date: dmy(x.date) })))) : '')
        + HH.bar(HH.btn('⬇ CSV', 'csv', 's')); },
    act: { toSet, pick(t, v) { v.emp = t.dataset.i; v.date = today(); v.reason = 'Resignation'; render(); }, back0(t, v) { clear(v); render(); },
      csv(t, v) { csv('gratuity_liability', [{ k: 'fileNo', t: 'File no.' }, { k: 'name', t: 'Name' }, { k: 'join', t: 'Joined' }, { k: 'years', t: 'Years' }, { k: 'amount', t: 'Gratuity' }, { k: 'held', t: 'Provision' }, { k: 'diff', t: 'Difference' }], v._rep || []); },
      async settle(t, v, d) { const e = empOf(d, v.emp); if (!confirm('Post the final settlement for ' + e.name + ' (last day ' + dmy(v.date) + ')?\n\nThe employee is marked as left.')) return;
        try { const r = await HS.settle(e, v.date || today(), v.reason || 'Resignation', { otherAdd: num(v.oa), otherDed: num(v.od) }, d.ctx); toast('🏁 Settlement posted · ' + r.journal + ' · net ' + money(r.net), 'success'); clear(v); refresh('x_hreos'); } catch (x) { v.errs = [x.message]; render(); } } } });

  /* ================= HR settings ================= */
  const SF = [['company', 'Company'], ['employerId', 'EmployerId'], ['routing', 'Routing'], ['scr', 'ScrPosition'], ['basis', 'Basis'], ['fotAs', 'FotAs'], ['leaveBasis', 'LeaveBasis'], ['run', 'RunPrefix'], ['loan', 'LoanPrefix'], ['empSource', 'EmpSource']], SN = [['hours', 'Hours'], ['otNormal', 'OtNormal'], ['otNight', 'OtNight'], ['otRest', 'OtRest'], ['otHoliday', 'OtHoliday'], ['annual', 'Annual'], ['penEe', 'PenEe'], ['penEr', 'PenEr']];
  screen('x_hrset', {}, {
    view(v, d) {
      const tab = v.tab || 'gen', s = d.set || H.settingsFromRow(null), accts = d.accts || [];
      if (!v.__f && !d.busy && d.set) { v.__f = 1; SF.concat(SN).forEach(([k]) => { v[k] = String(s[k]); }); v.ag = s.accrueGrat ? '1' : '0'; v.al = s.accrueLeave ? '1' : '0'; Object.keys(H.MAP).forEach(k => { v['m_' + k] = d.map[k] || ''; }); }
      const head = HH.head('⚙️', 'HR settings', 'WPS, overtime, leave, pension, accounts', '#475569') + busy(d) + HH.tabs('tab', [['gen', 'General'], ['map', 'Accounts'], ['setup', 'Set up']], 'gen');
      const miss = H.COA_ADD.filter(a => !accts.some(x => x.code === a.code));
      if (tab === 'setup') return head + HH.card('1 · Lists', `<span class="mb-hint">Creates the HR lists (and the finance lists if missing) or adds missing columns. Never deletes data.</span>${H.LIST_NAMES.map(n => `<div class="ei-kv"><span class="ei-mono">${n}</span><b>${H.LISTS[n].length} columns</b></div>`).join('')}${HH.btn(v.busy ? '⏳ ' + esc(v.busy) : '🛠 Set up lists', 'setup')}`)
        + HH.card('2 · Accounts', miss.length ? `<span class="mb-hint">Adds ${miss.map(a => a.code + ' ' + esc(a.name)).join(', ')}.</span>${HH.btn('📥 Add accounts', 'addAcc', 's')}` : '<span class="mb-hint">✓ The payroll accounts are in the chart.</span>')
        + HH.card('3 · Employees from ORBIT', `<span class="mb-hint">Adds every employee of ORBIT's Employees_tbl (file no., name, job role, grade, join date, nationality, status). Then enter salaries and bank details in Employees.</span>${HH.btn(v.lk ? '⏳ ' + esc(v.lk) : '🔗 Link ORBIT employees', 'link', 's')}`)
        + (v.out ? HH.card('Result', v.out.map(x => `<div class="ei-kv"><b>${esc(x)}</b></div>`).join('')) : '');
      if (tab === 'map') return head + HH.card('Payroll postings', Object.entries(H.MAP).map(([k, [label]]) => HH.f(label, HH.sel('m_' + k, acctOpts(accts)))).join('')) + HH.bar(HH.btn('💾 Save', 'save'));
      return head + needSetup(d) + HH.card('Company', HH.f('Name on payslips', HH.inp('company'))) + HH.card('WPS salary file', `<div class="fin-row">${HH.f('Employer ID (MOHRE establishment, 13 digits)', HH.inp('employerId', { mode: 'numeric' }))}${HH.f('Employer bank routing code (9 digits)', HH.inp('routing', { mode: 'numeric' }))}</div>${HH.f('Control record (SCR)', HH.seg('scr', [['last', 'Last line'], ['first', 'First line']], 'last'), 'Check your bank\'s WPS guide — most put it last')}`)
        + HH.card('Overtime (× hourly basic, basic ÷ 30 ÷ hours)', `<div class="hr-g"><div><label>Hours per day</label>${HH.num('hours')}</div><div><label>Normal</label>${HH.num('otNormal')}</div><div><label>Night (10 pm–4 am)</label>${HH.num('otNight')}</div><div><label>Rest day</label>${HH.num('otRest')}</div><div><label>Public holiday</label>${HH.num('otHoliday')}</div></div>${HH.f('ORBIT "FOT" hours count as', HH.seg('fotAs', [['rest', 'Rest-day OT'], ['normal', 'Normal OT'], ['none', 'Ignore']], 'rest'))}`)
        + HH.card('Pay & leave', HH.f('Daily rate for absence', HH.seg('basis', [['30', 'Monthly ÷ 30'], ['cal', 'Monthly ÷ days in month']], '30')) + `<div class="fin-row">${HH.f('Annual leave days a year (after year 1)', HH.num('annual'))}${HH.f('Leave salary based on', HH.seg('leaveBasis', [['basic', 'Basic'], ['gross', 'Full salary']], 'basic'))}</div>`)
        + HH.card('Pension (employees marked "pension")', `<div class="fin-row">${HH.f('Employee %', HH.num('penEe'))}${HH.f('Employer %', HH.num('penEr'))}</div><span class="mb-hint">Set the rates that apply to your emirate and the employee's nationality (GPSSA / Abu Dhabi Pension Fund / GCC schemes).</span>`)
        + HH.card('Accruals each payroll', HH.f('Gratuity provision', HH.seg('ag', [['1', 'Accrue monthly'], ['0', 'No']], '1')) + HH.f('Leave salary provision', HH.seg('al', [['1', 'Accrue monthly'], ['0', 'No']], '1')))
        + HH.card('Numbering & source', `<div class="fin-row">${HH.f('Payroll runs', HH.inp('run'))}${HH.f('Loans', HH.inp('loan'))}</div>${HH.f('Employees come from', HH.seg('empSource', [['orbit', 'ORBIT Employees_tbl'], ['erp', 'HR only']], 'orbit'))}`)
        + HH.bar(HH.btn('💾 Save', 'save'));
    },
    act: {
      async save(t, v) { const f = {}; SF.forEach(([k, c]) => { f[c] = str(v[k]); }); SN.forEach(([k, c]) => { f[c] = num(v[k]); }); f.AccrueGrat = v.ag === '0' ? '0' : '1'; f.AccrueLeave = v.al === '0' ? '0' : '1'; const map = {}; Object.keys(H.MAP).forEach(k => { if (v['m_' + k]) map[k] = v['m_' + k]; }); f.AccMap = JSON.stringify(map);
        if (f.EmployerId && !/^\d{13}$/.test(f.EmployerId)) return toast('The employer ID must be 13 digits', 'warn'); if (f.Routing && !/^\d{9}$/.test(f.Routing)) return toast('The routing code must be 9 digits', 'warn');
        try { await HS.saveSettings(f); toast('✅ HR settings saved', 'success'); v.__f = 0; refresh('x_hrset'); } catch (e) { toast(e.message, 'error'); } },
      async setup(t, v) { if (v.busy) return; v.busy = 'Starting…'; v.out = null; render(); try { v.out = await FU.setupLists(Object.assign({}, F.LISTS, H.LISTS), n => { v.busy = n + '…'; render(); }); drop(...H.LIST_NAMES, ...F.LIST_NAMES); toast('✅ HR lists are ready', 'success'); } catch (e) { v.out = ['✘ ' + e.message]; toast(e.message, 'error'); } v.busy = ''; refresh('x_hrset'); },
      async addAcc(t, v, d) { try { for (const a of H.COA_ADD.filter(a => !d.accts.some(x => x.code === a.code))) await S.add('Fin_Accounts', F.acctToFields(a)); S.drop('Fin_Accounts'); toast('✅ Accounts added', 'success'); v.__f = 0; refresh('x_hrset'); } catch (e) { toast(e.message, 'error'); } },
      async link(t, v) { if (v.lk) return; v.lk = 'Reading ORBIT…'; render(); try { const r = await HS.linkOrbit(n => { v.lk = n; render(); }); v.out = ['ORBIT Employees_tbl: ' + r.total + ' row(s)', r.added + ' added', r.updated + ' updated', r.skipped ? r.skipped + ' skipped (no file no. or name)' : '']; toast('🔗 ' + r.added + ' employee(s) added', 'success'); } catch (e) { toast(e.message, 'error'); } v.lk = ''; refresh('x_hrset'); } } });

  window.HR_UI = { bundle, version: '1' };
})();
