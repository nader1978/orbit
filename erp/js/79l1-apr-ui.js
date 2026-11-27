/* ============================================================
   ORBIT APPROVALS — storage + screens: My approvals (inbox) · Approval setup (rules, departments, roles)
   Modules submit a document with APRSTORE.submit({ type, list, docId, docNo, dept, amount, summary }) and register what
   happens when it is decided: APR_HANDLERS[list] = async (req) => { … update the document's status … }.
   The next approvers are e-mailed (ORBIT's e-mail sender, when set up) — best effort, never blocks the approval.
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, P = window.APR, S = window.FINSTORE, FU = window.FIN_UI; if (!K || !P || !S || !FU) return;
  const { reg, D, esc, num, dmy, str, toast, V, render, cur, H, iso, me, today } = K, { table, n2, money } = FU;
  window.APR_HANDLERS = window.APR_HANDLERS || {};
  const OPEN = window.APR_OPEN = window.APR_OPEN || {};   /* list → (docId) => open the document's page */
  const allUsers = () => { try { return (typeof users !== 'undefined' && users && users.list) || []; } catch (e) { return []; } };   /* ORBIT's user list (js/01) */
  const userName = u => { const x = allUsers().find(y => P.lc(y.username) === P.lc(u)); return x ? (x.displayName || x.username) : u; };
  const userEmail = u => { const x = allUsers().find(y => P.lc(y.username) === P.lc(u)); return x && x.email ? x.email : (/@/.test(u) ? u : ''); };
  const userOpts = () => allUsers().filter(u => u.username).map(u => [P.lc(u.username), u.username + (u.displayName ? ' · ' + u.displayName : '')]);
  const L = (n, f, map) => S.list(n, f).then(r => r.map(map));
  const rules = f => L('Apr_Rules', f, P.ruleFromRow), depts = f => L('Apr_Departments', f, P.deptFromRow), roles = f => L('Apr_Roles', f, P.roleFromRow), reqs = f => L('Apr_Requests', f, P.reqFromRow);
  /* line manager: ORBIT user → HR employee (same e-mail or name) → their manager's name → that employee → ORBIT user */
  async function managerFn() {
    let es = []; try { if (window.HRSTORE) es = await HRSTORE.emps(); } catch (e) {}
    const us = allUsers();
    return u => { const x = us.find(y => P.lc(y.username) === P.lc(u)); if (!x) return ''; const e = es.find(z => (x.email && P.lc(z.email) === P.lc(x.email)) || P.lc(z.name) === P.lc(x.displayName || x.username)); if (!e || !e.manager) return '';
      const m = es.find(z => P.lc(z.name) === P.lc(e.manager) || z.fileNo === e.manager); const mu = m ? us.find(y => (m.email && P.lc(y.email) === P.lc(m.email)) || P.lc(y.displayName) === P.lc(m.name)) : us.find(y => P.lc(y.displayName) === P.lc(e.manager)); return mu ? mu.username : ''; };
  }
  const save = (r, f) => r.id ? S.upd('Apr_Requests', r.id, f) : S.add('Apr_Requests', f);
  const toFields = r => ({ Title: (P.DOC_TYPES[r.type] || r.type) + ' ' + r.docNo, DocType: r.type, DocList: r.list, DocId: String(r.docId), DocNo: r.docNo, Department: r.dept, Requester: r.requester, Status: r.status, Summary: r.summary, DecidedAt: r.decidedAt || '', Amount: num(r.amount), Step: r.step, Chain: JSON.stringify(r.chain), Log: JSON.stringify(r.log.slice(-60)) });
  async function notify(r) {
    try { if (typeof mailSend_send !== 'function') return; const to = r.status === 'pending' ? P.waitingFor(r).map(userEmail).filter(Boolean) : [userEmail(r.requester)].filter(Boolean); if (!to.length) return;
      const what = (P.DOC_TYPES[r.type] || r.type) + ' ' + r.docNo, subj = r.status === 'pending' ? 'Approval needed: ' + what : what + ' ' + r.status;
      await mailSend_send({ to: to.join(';'), subject: subj, html: `<p>${esc(subj)}</p><p>${esc(r.summary)}<br>Amount: ${money(r.amount)} · Department: ${esc(r.dept || '—')} · Requested by ${esc(userName(r.requester))}</p><p>Open ORBIT → Approvals → My approvals.</p>` }); } catch (e) { /* e-mail is a courtesy, never blocks */ }
  }
  /* submit a document for approval → the request (approved straight away when no rule applies) */
  async function submit(o) {
    const [rs, ds, ros, mf] = await Promise.all([rules(true), depts(true), roles(true), managerFn()]);
    const r = P.start(Object.assign({ requester: me() }, o), rs, { depts: ds, roles: ros, managerOf: mf }), row = await S.add('Apr_Requests', toFields(r)); r.id = row.id; S.drop('Apr_Requests');
    if (r.status !== 'pending' && APR_HANDLERS[r.list]) await APR_HANDLERS[r.list](r); else notify(r); return r;
  }
  async function decide(r, action, comment) {
    const fresh = (await reqs(true)).find(x => x.id === r.id) || r, out = P.act(fresh, me(), action, comment); out.id = r.id;
    await S.upd('Apr_Requests', r.id, toFields(out)); S.drop('Apr_Requests');
    if (out.status !== 'pending' && APR_HANDLERS[out.list]) await APR_HANDLERS[out.list](out); notify(out); return out;
  }
  const latest = async (list, docId, f) => P.forDoc(await reqs(f), list, docId);
  window.APRSTORE = { rules, depts, roles, reqs, submit, decide, latest, userName, userOpts, managerFn };

  /* a compact approval panel modules can show on a document */
  window.APR_PANEL = (r) => { if (!r) return ''; const w = P.waitingFor(r).map(userName);
    return `<div class="ei-kv"><span>Approval</span><b>${esc(r.status)}${r.status === 'pending' ? ' · step ' + (r.step + 1) + ' of ' + r.chain.length + ' · waiting for ' + esc(w.join(' or ')) : ''}</b></div>` + r.log.filter(l => l.act !== 'note').slice(-6).map(l => `<div class="mb-hint">${esc(dmy(String(l.at).slice(0, 10)))} ${esc(String(l.at).slice(11, 16))} · ${esc(userName(l.by))} · ${esc(l.act)}${l.text ? ' — ' + esc(l.text) : ''}</div>`).join(''); };

  /* ================= My approvals ================= */
  async function bundle(force, w) { const finSet = await S.settings(force), o = { finSet }; let missing = false; const [r, ds, ros, rs] = await Promise.all([reqs(force).catch(e => { if (/not found/i.test(e.message)) missing = true; return []; }), depts(force).catch(() => []), roles(force).catch(() => []), w && w.rules ? rules(force).catch(() => []) : []]); return Object.assign(o, { reqs: r, depts: ds, roles: ros, rules: rs, missing }); }
  const loaders = {}; function screen(key, want, def) { loaders[key] = (v, f) => { const d = D[key] = D[key] || {}; d.busy = 1; if (cur() === key) render(); bundle(f, want).then(b => Object.assign(d, b)).catch(e => { d.err = e.message; }).finally(() => { d.busy = 0; if (cur() === key) render(); }); }; def.load = loaders[key]; reg(key, def); }
  const refresh = k => loaders[k](V(), true);
  const busy = d => d.busy ? `<div class="mx-ld"><i></i><i></i><i></i> Loading…</div>` : d.err ? `<div class="mb-hint mb-bad">⚠ ${esc(d.err)}</div>` : '';
  const COL = { pending: '#b45309', approved: '#15803d', rejected: '#dc2626', withdrawn: '#64748b' };
  const pill = s => `<span class="mb-pill ei-st" style="--c:${COL[s] || '#64748b'}">${esc(s)}</span>`;
  const setupCard = (d, v) => d.missing ? H.card('', `<div class="mb-hint mb-bad">The approval lists are not set up yet.</div>${H.btn(v.busy ? '⏳ ' + esc(v.busy) : '🛠 Set up approval lists', 'setup')}`) : '';
  async function setupLists(v) { v.busy = 'Starting…'; render(); try { await FU.setupLists(Object.assign({}, P.LISTS), n => { v.busy = n; render(); }); K.drop(...P.LIST_NAMES); toast('✅ Approval lists are ready', 'success'); } catch (e) { toast(e.message, 'error'); } v.busy = ''; }

  screen('x_aprinbox', {}, {
    view(v, d) {
      const u = P.lc(me()), all = d.reqs || [], mine = P.queue(all, u), tab = v.tab || 'mine';
      if (v.open) { const r = all.find(x => x.id === v.open); if (!r) return busy(d);
        return H.head('✅', (P.DOC_TYPES[r.type] || r.type) + ' ' + esc(r.docNo), esc(r.summary), COL[r.status]) + busy(d)
          + H.kpis([['Amount', n2(r.amount)], ['Department', esc(r.dept || '—')], ['Requested by', esc(userName(r.requester))], ['Status', r.status, r.status === 'approved' ? 'g' : r.status === 'pending' ? 'o' : 'r']])
          + H.card('Approval chain', r.chain.map((s, i) => `<div class="ei-kv"><span>Step ${i + 1} · ${esc(s.label)}</span><b>${s.by.length >= (s.min || 1) ? '✓ ' + esc(s.by.map(userName).join(', ')) : i === r.step && r.status === 'pending' ? '⏳ ' + esc(s.users.map(userName).join(' or ')) : esc(s.users.map(userName).join(' or '))}</b></div>`).join('') || '<span class="mb-hint">No approval steps.</span>')
          + H.card('History', r.log.slice().reverse().map(l => `<div class="ei-kv"><span>${esc(dmy(String(l.at).slice(0, 10)))} ${esc(String(l.at).slice(11, 16))} · ${esc(l.by === 'system' ? 'System' : userName(l.by))}</span><b>${esc(l.act)}${l.text ? ' — ' + esc(l.text) : ''}</b></div>`).join(''))
          + (P.canAct(r, u) ? H.card('Your decision', H.f('Comment (required to reject)', H.inp('cm'))) : '')
          + H.bar(`<div class="mb-row">${H.btn('← Back', 'back0', 's')}${OPEN[r.list] ? H.btn('📄 Open document', 'doc', 's') : ''}${P.canAct(r, u) ? H.btn('✕ Reject', 'rej', 's') + H.btn('✓ Approve', 'app') : ''}${r.status === 'pending' && r.requester === u ? H.btn('↩ Withdraw', 'wd', 's') : ''}</div>`); }
      const rows = tab === 'mine' ? mine : tab === 'req' ? all.filter(r => r.requester === u) : tab === 'pend' ? all.filter(r => r.status === 'pending') : all;
      return H.head('✅', 'My approvals', mine.length ? mine.length + ' waiting for you' : 'Nothing waiting for you', '#15803d') + busy(d) + setupCard(d, v)
        + H.tabs('tab', [['mine', 'Waiting for me', mine.length], ['req', 'My requests'], ['pend', 'All pending'], ['all', 'All']], 'mine')
        + H.card('', table([{ k: 'ty', t: 'Document' }, { k: 'no', t: 'No.' }, { k: 's', t: 'Summary' }, { k: 'dept', t: 'Department' }, { k: 'by', t: 'Requested by' }, { k: 'amount', t: 'Amount', n: 1 }, { k: 'w', t: 'Waiting for' }, { k: 'st', t: '', raw: 1 }],
            rows.slice().sort((a, b) => b.id - a.id).slice(0, 300).map(r => ({ ty: P.DOC_TYPES[r.type] || r.type, no: r.docNo, s: r.summary, dept: r.dept, by: userName(r.requester), amount: r.amount, w: P.waitingFor(r).map(userName).join(', '), st: pill(r.status), _tap: r.id })), null, 'open'));
    },
    act: { async setup(t, v) { await setupLists(v); refresh('x_aprinbox'); }, open(t, v) { v.open = +t.dataset.i; v.cm = ''; render(); }, back0(t, v) { v.open = null; render(); },
      doc(t, v, d) { const r = d.reqs.find(x => x.id === v.open); OPEN[r.list](r.docId); },
      async app(t, v, d) { const r = d.reqs.find(x => x.id === v.open); try { const o = await decide(r, 'approve', str(v.cm)); toast(o.status === 'approved' ? '✓ Approved — ' + r.docNo + ' can go ahead' : '✓ Approved — sent to the next step', 'success'); v.open = null; refresh('x_aprinbox'); } catch (e) { toast(e.message, 'error'); } },
      async rej(t, v, d) { const r = d.reqs.find(x => x.id === v.open); try { await decide(r, 'reject', str(v.cm)); toast('Rejected — ' + r.docNo + ' goes back to ' + userName(r.requester), 'success'); v.open = null; refresh('x_aprinbox'); } catch (e) { toast(e.message, 'error'); } },
      async wd(t, v, d) { const r = d.reqs.find(x => x.id === v.open); if (!confirm('Withdraw this approval request?')) return; try { await decide(r, 'withdraw', ''); v.open = null; refresh('x_aprinbox'); } catch (e) { toast(e.message, 'error'); } } } });

  /* ================= Approval setup ================= */
  const KOPTS = Object.entries(P.STEP_KINDS);
  screen('x_aprset', { rules: true }, {
    view(v, d) {
      const tab = v.tab || 'rules', head = H.head('⚙️', 'Approval setup', 'Who approves what: rules by document, department and amount', '#475569') + busy(d) + setupCard(d, v) + H.tabs('tab', [['rules', 'Rules', (d.rules || []).length], ['dept', 'Departments', (d.depts || []).length], ['roles', 'Roles', (d.roles || []).length]], 'rules');
      const uo = userOpts(), uSel = (a, i, k, val) => `<select data-ln="${a}:${i}:${k}"><option value="">— person —</option>${uo.map(([c, t]) => `<option value="${esc(c)}"${c === P.lc(val) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
      if (tab === 'dept') { if (v.df) return head + H.card(v.did ? 'Edit department' : 'New department', `<div class="fin-row">${H.f('Department', H.inp('dname'))}${H.f('Cost centre', H.inp('dcc'))}</div>${H.f('Head of department (ORBIT user)', H.sel('dhead', uo, { ph: '— person —' }))}${H.f('Members (ORBIT user names, comma separated — optional)', H.inp('dmem'))}<div class="mb-row">${H.btn('Cancel', 'dX', 's')}${H.btn('💾 Save', 'dSave')}</div>`);
        return head + H.card('', table([{ k: 'name', t: 'Department' }, { k: 'h', t: 'Head' }, { k: 'cc', t: 'Cost centre' }], (d.depts || []).map(x => ({ name: x.name, h: userName(x.head), cc: x.cc, _tap: x.id })), null, 'dEdit')) + H.bar(H.btn('＋ Department', 'dAdd')); }
      if (tab === 'roles') { if (v.rf) return head + H.card(v.rid ? 'Edit role' : 'New role', `${H.f('Role', H.inp('rname', { ph: 'Finance, General Manager, Procurement Manager…' }))}${H.f('People in this role (ORBIT user names, comma separated)', H.inp('rusers'))}<span class="mb-hint">Known users: ${esc(uo.map(x => x[0]).slice(0, 40).join(', '))}</span><div class="mb-row">${H.btn('Cancel', 'rX', 's')}${H.btn('💾 Save', 'rSave')}</div>`);
        return head + H.card('', table([{ k: 'name', t: 'Role' }, { k: 'u', t: 'People' }], (d.roles || []).map(x => ({ name: x.name, u: x.users.map(userName).join(', '), _tap: x.id })), null, 'rEdit')) + H.bar(`<div class="mb-row">${(d.roles || []).length ? '' : H.btn('📥 Add standard roles', 'rStd', 's')}${H.btn('＋ Role', 'rAdd')}</div>`); }
      if (v.ef) { const steps = v.steps || [];
        return head + H.card(v.eid ? 'Edit rule' : 'New rule', `${H.f('Name', H.inp('ename'))}<div class="fin-row">${H.f('Document', H.sel('etype', Object.entries(P.DOC_TYPES), { ph: false }))}${H.f('Department', H.sel('edept', [['*', 'All departments']].concat((d.depts || []).map(x => [x.name, x.name])), { ph: false }))}</div><div class="fin-row">${H.f('From amount (AED)', H.num('emin'))}${H.f('Up to amount (empty = no limit)', H.num('emax'))}${H.f('Priority', H.num('epri'))}</div>${H.f('Status', H.seg('eact', [['1', 'Active'], ['0', 'Inactive']], '1'))}`)
          + H.card('Approval steps, in order', steps.map((s, i) => `<div class="inv-ln"><div class="ei-lnh"><span>Step ${i + 1}</span><button type="button" class="mx-sb r" data-x="sDel" data-i="${i}">✕</button></div><select data-ln="steps:${i}:kind" data-r="1">${KOPTS.map(([k, t]) => `<option value="${k}"${s.kind === k ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select><div class="inv-g">${s.kind === 'role' ? `<div><label>Role</label><select data-ln="steps:${i}:role"><option value="">— role —</option>${(d.roles || []).map(r => `<option${r.name === s.role ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div><div><label>Approvals needed from the role</label><input data-ln="steps:${i}:min" value="${esc(s.min || 1)}" inputmode="numeric"></div>` : s.kind === 'user' ? `<div><label>Person</label>${uSel('steps', i, 'user', s.user)}</div>` : ''}<div><label>Label (optional)</label><input data-ln="steps:${i}:label" value="${esc(s.label || '')}"></div></div></div>`).join('') + H.sbtn('＋ Add step', 'sAdd'))
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'eX', 's')}${v.eid ? H.btn('🗑 Delete', 'eDel', 's') : ''}${H.btn('💾 Save rule', 'eSave')}</div>`); }
      const rs = (d.rules || []).slice().sort((a, b) => a.type.localeCompare(b.type) || a.min - b.min);
      return head + H.card('', table([{ k: 'ty', t: 'Document' }, { k: 'dept', t: 'Department' }, { k: 'band', t: 'Amount (AED)' }, { k: 'st', t: 'Steps' }, { k: 'a', t: '' }],
          rs.map(r => ({ ty: P.DOC_TYPES[r.type] || r.type, dept: r.dept === '*' ? 'All' : r.dept, band: n2(r.min) + ' – ' + (r.max === Infinity ? 'no limit' : n2(r.max)), st: r.steps.map(s => s.kind === 'role' ? s.role : s.kind === 'user' ? userName(s.user) : P.STEP_KINDS[s.kind].replace(/ of the requester| of the department/, '')).join(' → '), a: r.active ? '' : 'inactive', _tap: r.id })), null, 'eEdit')
          + (rs.length ? '' : '<span class="mb-hint">No rules yet: every document is approved straight away. Add the standard set and adjust it.</span>'))
        + H.bar(`<div class="mb-row">${rs.length ? '' : H.btn('📥 Add standard rules', 'eStd', 's')}${H.btn('＋ Rule', 'eAdd')}</div>`);
    },
    act: { async setup(t, v) { await setupLists(v); refresh('x_aprset'); },
      dAdd(t, v) { Object.assign(v, { df: 1, did: null, dname: '', dhead: '', dmem: '', dcc: '' }); render(); }, dX(t, v) { v.df = 0; render(); },
      dEdit(t, v, d) { const x = d.depts.find(y => y.id === +t.dataset.i); Object.assign(v, { df: 1, did: x.id, dname: x.name, dhead: x.head, dmem: x.members.join(', '), dcc: x.cc }); render(); },
      async dSave(t, v, d) { if (!str(v.dname)) return toast('Department name is required', 'warn'); const f = { Title: str(v.dname), Head: P.lc(v.dhead), Members: str(v.dmem), CostCenter: str(v.dcc) }; try { if (v.did) await S.upd('Apr_Departments', v.did, f); else await S.add('Apr_Departments', f); v.df = 0; toast('✅ Saved', 'success'); refresh('x_aprset'); } catch (e) { toast(e.message, 'error'); } },
      rAdd(t, v) { Object.assign(v, { rf: 1, rid: null, rname: '', rusers: '' }); render(); }, rX(t, v) { v.rf = 0; render(); },
      rEdit(t, v, d) { const x = d.roles.find(y => y.id === +t.dataset.i); Object.assign(v, { rf: 1, rid: x.id, rname: x.name, rusers: x.users.join(', ') }); render(); },
      async rSave(t, v) { if (!str(v.rname)) return toast('Role name is required', 'warn'); const f = { Title: str(v.rname), Users: String(v.rusers || '').split(/[;,\s]+/).map(P.lc).filter(Boolean).join(', ') }; try { if (v.rid) await S.upd('Apr_Roles', v.rid, f); else await S.add('Apr_Roles', f); v.rf = 0; toast('✅ Saved', 'success'); refresh('x_aprset'); } catch (e) { toast(e.message, 'error'); } },
      async rStd(t, v) { try { for (const n of P.STARTER_ROLES) await S.add('Apr_Roles', { Title: n, Users: '' }); toast('Roles added — now put people in them', 'success'); refresh('x_aprset'); } catch (e) { toast(e.message, 'error'); } },
      async eStd(t, v) { try { for (const r of P.STARTER) await S.add('Apr_Rules', P.ruleToFields(Object.assign({ active: true, priority: 0 }, r))); toast('✅ Standard rules added', 'success'); refresh('x_aprset'); } catch (e) { toast(e.message, 'error'); } },
      eAdd(t, v) { Object.assign(v, { ef: 1, eid: null, ename: '', etype: 'pr', edept: '*', emin: '0', emax: '', epri: '0', eact: '1', steps: [{ kind: 'head' }] }); render(); }, eX(t, v) { v.ef = 0; render(); },
      eEdit(t, v, d) { const r = d.rules.find(y => y.id === +t.dataset.i); Object.assign(v, { ef: 1, eid: r.id, ename: r.name, etype: r.type, edept: r.dept, emin: String(r.min), emax: r.max === Infinity ? '' : String(r.max), epri: String(r.priority), eact: r.active ? '1' : '0', steps: JSON.parse(JSON.stringify(r.steps)) }); render(); },
      sAdd(t, v) { v.steps.push({ kind: 'role' }); render(); }, sDel(t, v) { v.steps.splice(+t.dataset.i, 1); render(); },
      async eSave(t, v) { const steps = v.steps.filter(s => s.kind); const bad = steps.find(s => (s.kind === 'role' && !s.role) || (s.kind === 'user' && !s.user)); if (bad) return toast('Every step needs its role or person', 'warn');
        if (v.emax !== '' && num(v.emax) < num(v.emin)) return toast('"Up to" is below "From"', 'warn');
        const f = P.ruleToFields({ name: str(v.ename), type: v.etype, dept: v.edept, min: num(v.emin), max: v.emax === '' ? Infinity : num(v.emax), priority: num(v.epri), active: v.eact !== '0', steps }); try { if (v.eid) await S.upd('Apr_Rules', v.eid, f); else await S.add('Apr_Rules', f); v.ef = 0; toast('✅ Rule saved', 'success'); refresh('x_aprset'); } catch (e) { toast(e.message, 'error'); } },
      async eDel(t, v) { if (!confirm('Delete this rule?')) return; try { await S.del('Apr_Rules', v.eid); v.ef = 0; refresh('x_aprset'); } catch (e) { toast(e.message, 'error'); } } } });
})();
