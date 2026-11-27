/* ============================================================
   ORBIT APPROVALS CORE — one approval engine for every module (rules only, no screens, no storage)
   · rules by document type + department + amount band → an ordered chain of steps
   · a step's approver: the requester's line manager, the department head, anyone in a role (Finance, GM, …) or a named user
   · nobody approves their own document: a step whose only approver is the requester is skipped (noted in the log);
     the same person is asked once even when they appear in two steps
   · approve → next step (or approved), reject → rejected (back to the requester), withdraw by the requester
   Document types used: pr (purchase request), po (purchase order), bill_var (bill outside the 3-way match tolerance),
   sq_disc (sales quotation / order discount above the limit), so_credit (sales order over the customer's credit limit).
   Works in the browser (window.APR) and in Node (require).
   ============================================================ */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.APR = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const J = (s, d) => { try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : d; } catch (e) { return d; } };
  const num = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
  const lc = s => String(s || '').trim().toLowerCase();
  const DOC_TYPES = { pr: 'Purchase request', po: 'Purchase order', bill_var: 'Bill outside 3-way match', sq_disc: 'Sales discount above limit', so_credit: 'Sales order over credit limit' };
  const STEP_KINDS = { manager: 'Line manager of the requester', head: 'Head of the department', role: 'Anyone in a role', user: 'A named person' };
  const T = n => ({ name: n, text: {} }), M = n => ({ name: n, text: { allowMultipleLines: true, textType: 'plain' } }), N = n => ({ name: n, number: {} });
  const LISTS = {
    Apr_Rules: ['DocType', 'Department', 'Active'].map(T).concat(['MinAmount', 'MaxAmount', 'Priority'].map(N)).concat([M('Steps')]),
    Apr_Departments: ['Head', 'Members', 'CostCenter'].map(T),
    Apr_Roles: ['Users'].map(T),
    Apr_Requests: ['DocType', 'DocList', 'DocId', 'DocNo', 'Department', 'Requester', 'Status', 'Summary', 'DecidedAt'].map(T).concat(['Amount', 'Step'].map(N)).concat([M('Chain'), M('Log')]),
  };
  const ruleFromRow = r => ({ id: Number(r.id), name: r.title || '', type: r.doctype || 'pr', dept: r.department || '*', active: String(r.active) !== '0', min: num(r.minamount), max: r.maxamount === '' || r.maxamount == null || num(r.maxamount) === 0 ? Infinity : num(r.maxamount), priority: num(r.priority), steps: J(r.steps, []) });
  const ruleToFields = x => ({ Title: x.name || (DOC_TYPES[x.type] + ' · ' + (x.dept || '*')), DocType: x.type, Department: x.dept || '*', Active: x.active === false ? '0' : '1', MinAmount: num(x.min), MaxAmount: x.max === Infinity || !x.max ? 0 : num(x.max), Priority: num(x.priority), Steps: JSON.stringify((x.steps || []).filter(s => s.kind)) });
  const deptFromRow = r => ({ id: Number(r.id), name: r.title || '', head: lc(r.head), members: String(r.members || '').split(/[;,\s]+/).map(lc).filter(Boolean), cc: r.costcenter || '' });
  const roleFromRow = r => ({ id: Number(r.id), name: r.title || '', users: String(r.users || '').split(/[;,\s]+/).map(lc).filter(Boolean) });
  const reqFromRow = r => ({ id: Number(r.id), type: r.doctype || '', list: r.doclist || '', docId: String(r.docid || ''), docNo: r.docno || '', dept: r.department || '', requester: lc(r.requester), status: r.status || 'pending', summary: r.summary || '', decidedAt: r.decidedat || '', amount: num(r.amount), step: num(r.step), chain: J(r.chain, []), log: J(r.log, []) });

  /* the rule for a document: matching type, department (exact before "*"), amount within [min, max]; then priority */
  function pickRule(rules, type, dept, amount) {
    const ok = (rules || []).filter(r => r.active && r.type === type && (r.dept === '*' || lc(r.dept) === lc(dept)) && amount >= r.min && amount <= r.max);
    ok.sort((a, b) => (a.dept === '*' ? 1 : 0) - (b.dept === '*' ? 1 : 0) || b.priority - a.priority || b.min - a.min); return ok[0] || null;
  }
  /* steps → people. ctx = { depts, roles, managerOf(user) → user } */
  function resolve(rule, dept, requester, ctx) {
    const me = lc(requester), D = (ctx.depts || []).find(d => lc(d.name) === lc(dept)), chain = [], asked = new Set(), notes = [];
    (rule ? rule.steps : []).forEach((s, i) => {
      let users = [], label = s.label || STEP_KINDS[s.kind] || s.kind;
      if (s.kind === 'manager') { const m = ctx.managerOf ? lc(ctx.managerOf(me)) : ''; users = m ? [m] : D && D.head ? [D.head] : []; if (!m) label += ' (no manager on file → department head)'; }
      else if (s.kind === 'head') users = D && D.head ? [D.head] : [];
      else if (s.kind === 'role') { const r = (ctx.roles || []).find(x => lc(x.name) === lc(s.role)); users = r ? r.users.slice() : []; label = s.label || s.role; }
      else if (s.kind === 'user') users = [lc(s.user)].filter(Boolean);
      const others = users.filter(u => u !== me);
      if (!users.length) { notes.push('Step ' + (i + 1) + ' (' + label + '): nobody is set up — skipped'); return; }
      if (!others.length) { notes.push('Step ' + (i + 1) + ' (' + label + '): only the requester — skipped'); return; }
      if (others.every(u => asked.has(u))) { notes.push('Step ' + (i + 1) + ' (' + label + '): already approved by the same person'); return; }
      others.forEach(u => asked.add(u)); chain.push({ label, users: others, min: s.kind === 'role' && num(s.min) > 1 ? Math.min(num(s.min), others.length) : 1, by: [] });
    });
    return { chain, notes };
  }
  /* start an approval: auto-approved when no rule or no steps */
  function start(o, rules, ctx) {
    const rule = pickRule(rules, o.type, o.dept, num(o.amount)), r = resolve(rule, o.dept, o.requester, ctx), now = o.now || new Date().toISOString();
    const log = [{ at: now, by: lc(o.requester), act: 'submitted', text: rule ? 'Rule: ' + (rule.name || DOC_TYPES[o.type]) : 'No approval rule for this amount / department' }].concat(r.notes.map(t => ({ at: now, by: 'system', act: 'note', text: t })));
    const auto = !r.chain.length;
    if (auto) log.push({ at: now, by: 'system', act: 'approved', text: 'No approval needed' });
    return { type: o.type, list: o.list || '', docId: String(o.docId || ''), docNo: o.docNo || '', dept: o.dept || '', requester: lc(o.requester), amount: num(o.amount), summary: o.summary || '', status: auto ? 'approved' : 'pending', step: 0, chain: r.chain, log, decidedAt: auto ? now : '' };
  }
  const canAct = (req, user) => req.status === 'pending' && req.chain[req.step] && req.chain[req.step].users.includes(lc(user)) && !req.chain[req.step].by.includes(lc(user));
  function act(req, user, action, comment, now) {
    const u = lc(user), t = now || new Date().toISOString(), out = JSON.parse(JSON.stringify(req));
    if (action === 'withdraw') { if (u !== out.requester) throw new Error('Only the requester can withdraw'); if (out.status !== 'pending') throw new Error('Only a pending request can be withdrawn'); out.status = 'withdrawn'; out.decidedAt = t; out.log.push({ at: t, by: u, act: 'withdrawn', text: comment || '' }); return out; }
    if (!canAct(out, u)) throw new Error(out.status !== 'pending' ? 'This request is already ' + out.status : 'You are not an approver of the current step');
    const s = out.chain[out.step];
    if (action === 'reject') { if (!String(comment || '').trim()) throw new Error('Say why it is rejected'); out.status = 'rejected'; out.decidedAt = t; out.log.push({ at: t, by: u, act: 'rejected', text: comment, step: out.step }); return out; }
    if (action !== 'approve') throw new Error('Unknown action');
    s.by.push(u); out.log.push({ at: t, by: u, act: 'approved', text: comment || '', step: out.step });
    if (s.by.length >= (s.min || 1)) { out.step++; if (out.step >= out.chain.length) { out.status = 'approved'; out.decidedAt = t; } }
    return out;
  }
  const waitingFor = req => req.status === 'pending' && req.chain[req.step] ? req.chain[req.step].users.filter(u => !req.chain[req.step].by.includes(u)) : [];
  const queue = (reqs, user) => (reqs || []).filter(r => canAct(r, user));
  /* the latest approval request of a document */
  const forDoc = (reqs, list, docId) => (reqs || []).filter(r => r.list === list && r.docId === String(docId)).sort((a, b) => b.id - a.id)[0] || null;
  /* a sensible starter set (all amounts AED) — edited in Approval Setup */
  const STARTER = [
    { name: 'Purchase request up to 5,000', type: 'pr', dept: '*', min: 0, max: 5000, steps: [{ kind: 'manager' }] },
    { name: 'Purchase request 5,000 – 50,000', type: 'pr', dept: '*', min: 5000.01, max: 50000, steps: [{ kind: 'head' }, { kind: 'role', role: 'Finance' }] },
    { name: 'Purchase request above 50,000', type: 'pr', dept: '*', min: 50000.01, max: Infinity, steps: [{ kind: 'head' }, { kind: 'role', role: 'Finance' }, { kind: 'role', role: 'General Manager' }] },
    { name: 'Purchase order up to 20,000', type: 'po', dept: '*', min: 0, max: 20000, steps: [{ kind: 'role', role: 'Procurement Manager' }] },
    { name: 'Purchase order above 20,000', type: 'po', dept: '*', min: 20000.01, max: Infinity, steps: [{ kind: 'role', role: 'Procurement Manager' }, { kind: 'role', role: 'General Manager' }] },
    { name: 'Bill outside 3-way match', type: 'bill_var', dept: '*', min: 0, max: Infinity, steps: [{ kind: 'role', role: 'Finance' }] },
    { name: 'Sales discount above limit', type: 'sq_disc', dept: '*', min: 0, max: Infinity, steps: [{ kind: 'role', role: 'Sales Manager' }] },
    { name: 'Sales order over credit limit', type: 'so_credit', dept: '*', min: 0, max: Infinity, steps: [{ kind: 'role', role: 'Finance' }] },
  ];
  const STARTER_ROLES = ['Finance', 'General Manager', 'Procurement Manager', 'Sales Manager'];
  return { DOC_TYPES, STEP_KINDS, LISTS, LIST_NAMES: Object.keys(LISTS), ruleFromRow, ruleToFields, deptFromRow, roleFromRow, reqFromRow, pickRule, resolve, start, canAct, act, waitingFor, queue, forDoc, STARTER, STARTER_ROLES, lc, version: '1.0.0' };
});
