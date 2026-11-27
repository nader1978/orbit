/* ============================================================
   ORBIT BUDGETS & FIXED ASSETS — screens (ORBIT mobile suite API · same screens on the phone and in the web app pages)
   Budgets · Budget vs actual · Fixed assets · Depreciation · Asset reports · Asset settings
   Links: budget actuals come from the ledger (by account and cost centre); ORBIT project budgets (Project_Reg_tbl) become
          cost-centre budget lines and are compared with the ledger and ORBIT's project cost records (Project_Costs_tbl);
          posted purchase bill lines on fixed asset accounts can be registered as assets in one tap.
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, F = window.FIN, B = window.BFA, S = window.FINSTORE, BS = window.BFASTORE, FU = window.FIN_UI;
  if (!K || !F || !B || !S || !BS || !FU) return;
  const { A, reg, D, drop, H, esc, num, today, addD, dmy, str, toast, V, render, cur } = K;
  const { table, csv, printHtml, n2, money, acctOpts, acctName } = FU, BUD = B.BUD, FA = B.FA;
  const ST = { bud: null, asset: null, deep: null };
  const go = k => A().go(k), goTo = k => { ST.deep = k; go(k); };
  const errs = (list, t) => list && list.length ? `<div class="mb-hint mb-bad ei-errs"><b>${esc(t || 'Please check')}</b>${list.map(e => `<div>${esc(e.message || e)}</div>`).join('')}</div>` : '';
  const setTitle = t => setTimeout(() => { const el = document.querySelector('#mbTitle'); if (el) el.textContent = t; }, 0);
  const COL = { draft: '#64748b', approved: '#15803d', closed: '#475569', active: '#15803d', disposed: '#dc2626', posted: '#15803d', reversed: '#b45309' };
  const pill = s => `<span class="mb-pill ei-st" style="--c:${COL[s] || '#64748b'}">${esc(String(s).charAt(0).toUpperCase() + String(s).slice(1))}</span>`;
  const clear = v => Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; });
  const MN = p => { const [y, m] = p.split('-'); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1] + ' ' + y.slice(2); };
  const pctTxt = x => x == null ? '—' : (Math.round(x * 10) / 10) + '%';
  const css = document.createElement('style'); css.textContent = `
#mob .bfa-m{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}#mob .bfa-m label{display:block;font-size:11.5px;color:var(--mut);font-weight:700;margin-bottom:3px}#mob .bfa-m input{width:100%;box-sizing:border-box;text-align:right}
#mob .bfa-fav{color:#16a34a;font-weight:700}#mob .bfa-adv{color:#dc2626;font-weight:700}
#mob .bfa-bar{height:8px;border-radius:6px;background:var(--cardb);overflow:hidden;min-width:70px}#mob .bfa-bar i{display:block;height:100%}
@media (max-width:560px){#mob .bfa-m{grid-template-columns:repeat(3,minmax(0,1fr))}}`; document.head.appendChild(css);

  /* ---------- data ---------- */
  async function bundle(force, w) {
    w = w || {}; const finSet = await S.settings(force), out = { finSet }, jobs = [], add = (k, p) => jobs.push(p.then(x => { out[k] = x; }));
    add('set', BS.settings(force)); add('accts', S.accounts(force).catch(() => []));
    if (w.lines) add('lines', S.lines(force).catch(() => []));
    if (w.bud) { add('budgets', BS.budgets(force).catch(e => { if (/not found/i.test(e.message)) out.missing = true; return []; })); add('blines', BS.blines(force).catch(() => [])); }
    if (w.fa) { add('cats', BS.cats(force).catch(e => { if (/not found/i.test(e.message)) out.missing = true; return []; })); add('assets', BS.assets(force).catch(() => [])); add('runs', BS.runs(force).catch(() => [])); }
    if (w.bills) add('bills', S.list('Fin_Bills', force).catch(() => []));
    if (w.prj) add('orbit', BS.orbitProjects().catch(() => ({ prj: null, costs: [] })));
    await Promise.all(jobs);
    out.map = Object.assign(FA.faMap(out.accts), out.set && out.set.gain ? { fa_gain: out.set.gain } : {}, F.defaultMap(out.accts.length ? out.accts : F.COA), finSet.map || {});
    out.ctx = { accts: out.accts, finSet, map: out.map, cats: out.cats || [] };
    return out;
  }
  const LOADERS = {};
  function loader(key, want) { return function (v, force) { const d = D[key] = D[key] || {}; d.busy = 1; d.err = ''; if (cur() === key) render(); bundle(force, want).then(b => Object.assign(d, b)).catch(e => { d.err = e.message; }).finally(() => { d.busy = 0; if (cur() === key) render(); }); }; }
  const refresh = key => LOADERS[key](V(), true);
  const RESET = { x_budlist: () => { ST.bud = null; }, x_fareg: () => { ST.asset = null; } };
  function screen(key, want, def) { LOADERS[key] = loader(key, want); def.load = (v, f) => { if (!f) { if (ST.deep !== key && RESET[key]) RESET[key](); ST.deep = null; } LOADERS[key](v, f); }; reg(key, def); }
  const busy = d => d.busy ? `<div class="mx-ld"><i></i><i></i><i></i> Loading…</div>` : d.err ? `<div class="mb-hint mb-bad" style="margin:0 4px 10px">⚠ ${esc(d.err)}</div>` : '';
  const needSetup = d => d.missing ? H.card('', `<div class="mb-hint mb-bad">The budget and fixed asset lists are not set up yet.</div>${H.btn('⚙️ Asset Settings → Set up', 'toSet')}`) : '';
  const toSet = () => { go('x_faset'); setTimeout(() => { V().tab = 'setup'; render(); }, 60); };
  const fyOf = d => F.fyStart(today(), (d.finSet || {}).fiscalStart);
  const ccList = d => { const s = new Set(); (d.lines || []).forEach(l => l.costCenter && s.add(l.costCenter)); (d.blines || []).forEach(l => l.cc && s.add(l.cc)); ((d.orbit || {}).prj || []).forEach(p => p.projectcode && s.add(String(p.projectcode))); return [...s].sort(); };

  /* ================= Budgets ================= */
  const lineNew = () => ({ account: '', cc: '', m: Array(12).fill(0), notes: '' });
  /* month inputs are bound as L:<line>:m0 … m11 (the suite binds one level deep); syncM folds them back into l.m */
  const syncM = l => { if (!l) return l; l.m = l.m.map((x, k) => l['m' + k] != null ? B.r2(num(l['m' + k])) : B.r2(num(x))); for (let k = 0; k < 12; k++) delete l['m' + k]; return l; };
  const sumType = (d, lines, t) => B.r2(lines.filter(l => { const a = (d.accts || []).find(x => x.code === l.account); return a && a.type === t; }).reduce((s, l) => s + BUD.total(l.m), 0));
  screen('x_budlist', { bud: true, lines: true, prj: true }, {
    view(v, d) {
      const accts = d.accts || [], buds = d.budgets || [];
      if (ST.bud) {
        if (!v.init) { v.init = 1; const b = ST.bud === 'new' ? null : buds.find(x => x.id === ST.bud);
          Object.assign(v, b ? { name: b.name, fy: b.fy, version: b.version, notes: b.notes, status: b.status, L: (d.blines || []).filter(l => l.budget === String(b.id)).map(l => ({ account: l.account, cc: l.cc, m: l.m.slice(), notes: l.notes })).sort((x, y) => (x.account + x.cc).localeCompare(y.account + y.cc)) } : { name: 'Budget ' + fyOf(d).slice(0, 4), fy: fyOf(d), version: '1', status: 'draft', L: [] }); }
        const ro = v.status !== 'draft', ms = B.months(v.fy || fyOf(d)), L = v.L;
        setTitle(v.name || 'Budget');
        if (v.ed != null) { const l = syncM(L[v.ed] || (L[v.ed] = lineNew())), a = accts.find(x => x.code === l.account);
          return H.head('🎯', 'Budget line', esc(v.name) + ' · ' + MN(ms[0]) + ' – ' + MN(ms[11]), '#0f766e') + errs(v.errs)
            + H.card('', H.f('Account', `<select data-ln="L:${v.ed}:account" data-r="1"${ro ? ' disabled' : ''}><option value="">— account —</option>${acctOpts(accts).map(([c, t]) => `<option value="${esc(c)}"${c === l.account ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`) + H.f('Cost centre / project (optional)', `<input data-ln="L:${v.ed}:cc" value="${esc(l.cc)}" list="budCc"${ro ? ' disabled' : ''}><datalist id="budCc">${ccList(d).map(c => `<option value="${esc(c)}">`).join('')}</datalist>`))
            + (ro ? '' : H.card('Fill', `<div class="fin-row">${H.f('Amount for the year', H.num('annual'))}${H.f('Spread', H.sel('how', [['even', 'Evenly over 12 months'], ['last', 'Like last year\'s months']], { ph: false }))}</div>${H.sbtn('⇣ Fill the months', 'fill', 'style="width:100%"')}`))
            + H.card('Months · total ' + money(BUD.total(l.m.map(num))) + (a ? ' · ' + (a.type === 'income' ? 'income' : a.type === 'expense' ? 'expense' : a.type) : ''), `<div class="bfa-m">${ms.map((p, i) => `<div><label>${MN(p)}</label><input data-ln="L:${v.ed}:m${i}" data-r="1" value=""${esc(l.m[i] === 0 ? '' : l.m[i])}" inputmode="decimal" placeholder="0"${ro ? ' disabled' : ''}></div>`).join('')}</div>`)
            + H.bar(`<div class="mb-row">${H.btn('← Lines', 'edBack', 's')}${ro ? '' : H.btn('🗑 Remove line', 'edDel', 's')}</div>`);
        }
        const inc = sumType(d, L, 'income'), exp = sumType(d, L, 'expense');
        return H.head('🎯', esc(v.name || 'Budget'), 'Financial year ' + MN(ms[0]) + ' – ' + MN(ms[11]) + ' · version ' + esc(v.version), '#0f766e') + busy(d) + errs(v.errs)
          + H.kpis([['Income', n2(inc), 'g'], ['Expenses', n2(exp)], ['Profit', n2(inc - exp), inc - exp < 0 ? 'r' : 'g'], ['Lines', String(L.length)]])
          + H.card('Status · ' + pill(v.status), ro ? '<span class="mb-hint">Approved budgets are locked. Reopen to change, or copy as a new version.</span>' : `<div class="fin-row">${H.f('Name', H.inp('name'))}${H.f('Financial year starts', H.date('fy'))}${H.f('Version', H.inp('version'))}</div>${H.f('Notes', H.inp('notes'))}`)
          + (ro ? '' : H.card('Quick fill', `<div class="fin-row">${H.f('Last year\'s actuals ±%', H.num('pct', { ph: '0' }))}${H.f('By cost centre', H.seg('bycc', [['0', 'No'], ['1', 'Yes']], '0'))}</div><div class="mx-acts">${H.sbtn('📈 Fill from last year', 'fromLast')}${H.sbtn('🏗 Add ORBIT project budgets', 'fromPrj')}${H.sbtn('⬆ Import CSV', 'imp')}</div>${v.showPrj ? H.f('Project costs go to account', H.sel('prjAcc', acctOpts(accts, a => a.type === 'expense'), { ph: false })) + H.sbtn('✓ Add ' + (((d.orbit || {}).prj) || []).filter(p => num(p.budget)).length + ' project budget(s)', 'addPrj', 'style="width:100%"') : ''}`))
          + H.card('Lines', table([{ k: 'a', t: 'Account' }, { k: 'cc', t: 'Cost centre' }, { k: 'q1', t: 'Q1', n: 1 }, { k: 'q2', t: 'Q2', n: 1 }, { k: 'q3', t: 'Q3', n: 1 }, { k: 'q4', t: 'Q4', n: 1 }, { k: 'y', t: 'Year', n: 1 }],
              L.map((l, i) => { const q = k => B.r2(l.m.slice(k * 3, k * 3 + 3).reduce((s, x) => s + num(x), 0)); return { a: acctName(accts, l.account), cc: l.cc, q1: q(0), q2: q(1), q3: q(2), q4: q(3), y: BUD.total(l.m.map(num)), _tap: i }; }), null, 'edOpen') + (ro ? '' : H.sbtn('＋ Add line', 'addL', 'style="width:100%"')))
          + H.bar(`<div class="mb-row">${H.btn('← Budgets', 'back0', 's')}${H.btn('⬇ CSV', 'exp', 's')}${ro ? (v.status === 'approved' ? H.btn('↺ Reopen', 'reopen', 's') + H.btn('⧉ Copy as new version', 'copyV') : '') : (ST.bud !== 'new' ? H.btn('✓ Approve', 'approve', 's') : '') + H.btn('💾 Save', 'save')}</div>`);
      }
      setTitle('Budgets');
      return H.head('🎯', 'Budgets', 'By account and cost centre, month by month', '#0f766e') + busy(d) + needSetup(d)
        + H.card('', table([{ k: 'name', t: 'Budget' }, { k: 'fy', t: 'Year from' }, { k: 'version', t: 'Ver.' }, { k: 'inc', t: 'Income', n: 1 }, { k: 'exp', t: 'Expenses', n: 1 }, { k: 'p', t: 'Profit', n: 1 }, { k: 'st', t: '', raw: 1 }],
            buds.map(b => { const L = (d.blines || []).filter(l => l.budget === String(b.id)), i = sumType(d, L, 'income'), e = sumType(d, L, 'expense'); return { name: b.name, fy: dmy(b.fy), version: b.version, inc: i, exp: e, p: B.r2(i - e), st: pill(b.status), _tap: b.id }; }), null, 'open'))
        + H.bar(`<div class="mb-row">${H.btn('＋ New budget', 'add')}${H.btn('📊 Budget vs actual', 'toRep', 's')}</div>`);
    },
    act: { toSet, toRep() { go('x_budrep'); },
      add(t, v) { ST.bud = 'new'; clear(v); render(); }, open(t, v) { ST.bud = +t.dataset.i; clear(v); render(); }, back0(t, v) { ST.bud = null; clear(v); render(); },
      addL(t, v) { v.L.push(lineNew()); v.ed = v.L.length - 1; render(); }, edOpen(t, v) { v.ed = +t.dataset.i; v.annual = ''; render(); },
      edBack(t, v) { const l = syncM(v.L[v.ed]); if (l && !l.account && !BUD.total(l.m)) v.L.splice(v.ed, 1); v.ed = null; v.errs = null; render(); }, edDel(t, v) { v.L.splice(v.ed, 1); v.ed = null; render(); },
      fill(t, v, d) { const l = syncM(v.L[v.ed]); if (!num(v.annual)) return toast('Enter the amount for the year', 'warn'); let prof = null;
        if (v.how === 'last') { const act = BUD.actuals(d.lines, d.accts, B.addM(B.per(v.fy), -12) + v.fy.slice(7), { byCc: !!l.cc }), m = act.get(l.account + '|' + (l.cc || '')); if (!m || !m.some(x => x)) toast('No actuals last year for this line — spread evenly', 'info'); else prof = m; }
        l.m = BUD.spread(num(v.annual), prof); render(); },
      fromLast(t, v, d) { const pr = BUD.fromActuals(d.lines, d.accts, v.fy, num(v.pct), v.bycc === '1'); if (!pr.length) return toast('No income or expense in the previous financial year', 'info');
        const have = new Set(v.L.map(l => l.account + '|' + l.cc)); let n = 0; pr.forEach(p => { if (!have.has(p.account + '|' + p.cc)) { v.L.push(Object.assign({ notes: 'From last year' + (num(v.pct) ? ' ' + (num(v.pct) > 0 ? '+' : '') + num(v.pct) + '%' : '') }, p)); n++; } }); toast(n + ' line(s) added', 'success'); render(); },
      fromPrj(t, v, d) { const p = (d.orbit || {}).prj; if (!p) return toast('ORBIT\'s project list (Project_Reg_tbl) was not found', 'warn'); v.showPrj = 1; if (!v.prjAcc) v.prjAcc = (d.accts.find(a => a.code === '6900') || d.accts.find(a => a.type === 'expense' && !a.group) || {}).code; render(); },
      addPrj(t, v, d) { const ms = B.months(v.fy), end = ms[11], have = new Set(v.L.map(l => l.account + '|' + l.cc)); let n = 0;
        (d.orbit.prj || []).filter(p => num(p.budget) && p.projectcode).forEach(p => { const cc = String(p.projectcode), k = v.prjAcc + '|' + cc; if (have.has(k)) return;
          const s = B.per(p.startdate) || ms[0], e = B.per(p.enddate) || end, prof = ms.map(x => x >= s && x <= e ? 1 : 0), inFy = prof.some(x => x);
          const span = Math.max(1, B.diffM(s, e) + 1), share = inFy ? num(p.budget) * prof.filter(x => x).length / span : 0; if (!share) return;
          v.L.push({ account: v.prjAcc, cc, m: BUD.spread(B.r2(share), prof), notes: 'ORBIT project ' + cc + ' · ' + (p.projectname || '') }); n++; });
        v.showPrj = 0; toast(n + ' project budget line(s) added (the part of each project inside this year)', 'success'); render(); },
      exp(t, v, d) { v.L.forEach(syncM); csv((v.name || 'budget').replace(/\W+/g, '_'), [{ k: 'account', t: 'Account' }, { k: 'name', t: 'Name' }, { k: 'cc', t: 'CostCenter' }].concat(B.MK.map((k, i) => ({ k, t: k, n: 1 }))).concat([{ k: 'tot', t: 'Total', n: 1 }]),
        v.L.map(l => { const r = { account: l.account, name: (d.accts.find(a => a.code === l.account) || {}).name || '', cc: l.cc, tot: BUD.total(l.m.map(num)) }; B.MK.forEach((k, i) => { r[k] = num(l.m[i]); }); return r; })); },
      imp(t, v, d) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv'; inp.onchange = async () => { const f = inp.files[0]; if (!f) return; const txt = await f.text(), rows = txt.split(/\r?\n/).filter(x => x.trim()).map(r => r.split(/[,;\t]/).map(x => x.replace(/^"|"$/g, '').trim()));
          const h = rows.shift().map(x => x.toLowerCase()), ia = h.indexOf('account'), ic = h.findIndex(x => /cost ?cent/.test(x)), im = B.MK.map(k => h.indexOf(k.toLowerCase())), iy = h.findIndex(x => /total|annual|year/.test(x)); if (ia < 0) return toast('The file needs an "Account" column', 'error');
          let n = 0; rows.forEach(r => { const acc = r[ia]; if (!acc) return; const cc = ic >= 0 ? r[ic] || '' : '', m = im.every(i => i < 0) ? BUD.spread(num(r[iy])) : im.map(i => i < 0 ? 0 : B.r2(num(r[i]))), ex = v.L.find(l => l.account === acc && l.cc === cc); if (ex) ex.m = m; else v.L.push({ account: acc, cc, m, notes: 'Imported' }); n++; });
          toast(n + ' line(s) imported — check and save', 'success'); render(); }; inp.click(); },
      async save(t, v, d) { v.L.forEach(syncM); v.L = v.L.filter(l => l.account || BUD.total(l.m.map(num))).map(l => Object.assign(l, { m: l.m.map(x => B.r2(num(x))) }));
        const e = BUD.checkBudget(v.L, d.accts); if (!str(v.name)) e.push('Name is required'); if (!/^\d{4}-\d\d-\d\d$/.test(v.fy || '')) e.push('Financial year start is required');
        if ((d.budgets || []).some(b => b.id !== ST.bud && b.fy === v.fy && b.name === str(v.name) && b.version === str(v.version))) e.push('This budget name and version already exist for the year');
        if (e.length) { v.errs = e; render(); return; } v.errs = null;
        try { const id = await BS.saveBudget({ id: ST.bud === 'new' ? null : ST.bud, name: str(v.name), fy: v.fy, version: str(v.version) || '1', notes: str(v.notes), status: 'draft' }, v.L); toast('✅ Budget saved', 'success'); ST.bud = id; clear(v); refresh('x_budlist'); } catch (er) { toast(er.message, 'error'); } },
      async approve(t, v, d) { if (!confirm('Approve this budget?\n\nIt is locked once approved (save your changes first).')) return; const b = d.budgets.find(x => x.id === ST.bud); try { await BS.setBudgetStatus(b, 'approved'); clear(v); refresh('x_budlist'); } catch (e) { toast(e.message, 'error'); } },
      async reopen(t, v, d) { const b = d.budgets.find(x => x.id === ST.bud); if (!confirm('Reopen ' + b.name + ' for changes?')) return; try { await BS.setBudgetStatus(b, 'draft'); clear(v); refresh('x_budlist'); } catch (e) { toast(e.message, 'error'); } },
      async copyV(t, v, d) { const b = d.budgets.find(x => x.id === ST.bud), nv = String(Math.max(...d.budgets.filter(x => x.name === b.name && x.fy === b.fy).map(x => num(x.version))) + 1);
        if (!confirm('Copy ' + b.name + ' as version ' + nv + '?')) return; try { const id = await BS.saveBudget({ name: b.name, fy: b.fy, version: nv, notes: 'Copy of version ' + b.version, status: 'draft' }, v.L); ST.bud = id; clear(v); toast('⧉ Version ' + nv + ' created', 'success'); refresh('x_budlist'); } catch (e) { toast(e.message, 'error'); } } } });

  /* ================= Budget vs actual ================= */
  screen('x_budrep', { bud: true, lines: true, prj: true }, {
    view(v, d) {
      const buds = d.budgets || [], tab = v.tab || 'ba';
      if (!v.bid && buds.length) v.bid = String((buds.find(b => b.status === 'approved') || buds[0]).id);
      const b = buds.find(x => String(x.id) === String(v.bid)), head = H.head('📊', 'Budget vs actual', 'Ledger actuals against the budget · favourable is green', '#0f766e') + busy(d) + needSetup(d) + H.tabs('tab', [['ba', 'Budget vs actual'], ['mon', 'By month'], ['prj', 'ORBIT projects']], 'ba');
      const out = (title, cols, rows, foot) => { v._rep = { title, cols, rows, foot }; return H.card('', table(cols, rows, foot)) + H.bar(`<div class="mb-row">${H.btn('⬇ CSV', 'csv', 's')}${H.btn('🖨 Print', 'print', 's')}</div>`); };
      if (tab === 'prj') { const o = d.orbit || {};
        if (!o.prj) return head + H.card('', H.empty('ORBIT\'s project list (Project_Reg_tbl) was not found on this site.'));
        const rows = BUD.projects(o.prj, o.costs, d.lines, d.accts);
        return head + H.card('', '<span class="mb-hint">Budget from ORBIT\'s project register. "ORBIT cost" is what was recorded in the project module; "Ledger" is expense posted with the project code as cost centre. A gap means costs recorded in one place only.</span>')
          + out('Project budgets', [{ k: 'code', t: 'Project' }, { k: 'name', t: 'Name' }, { k: 'budget', t: 'Budget', n: 1 }, { k: 'orbitCost', t: 'ORBIT cost', n: 1 }, { k: 'ledger', t: 'Ledger', n: 1 }, { k: 'gap', t: 'Gap', n: 1 }, { k: 'left', t: 'Left', n: 1 }, { k: 'u', t: 'Used', raw: 1 }],
            rows.map(r => Object.assign({}, r, { u: r.used == null ? '—' : `<div class="bfa-bar"><i style="width:${Math.min(100, r.used)}%;background:${r.used > 100 ? '#dc2626' : r.used > 85 ? '#f59e0b' : '#16a34a'}"></i></div><small>${pctTxt(r.used)}</small>` })),
            { code: 'Total', budget: B.r2(rows.reduce((s, r) => s + r.budget, 0)), orbitCost: B.r2(rows.reduce((s, r) => s + r.orbitCost, 0)), ledger: B.r2(rows.reduce((s, r) => s + r.ledger, 0)) }); }
      if (!b) return head + H.card('', H.empty('Make a budget first.') + H.btn('🎯 Budgets', 'toBud'));
      const ms = B.months(b.fy), upTo = v.upTo && ms.includes(v.upTo) ? v.upTo : (v.upTo = ms.includes(B.per(today())) ? B.per(today()) : ms[11]), bl = (d.blines || []).filter(l => l.budget === String(b.id));
      const filt = H.card('', `<div class="fin-row">${H.f('Budget', H.sel('bid', buds.map(x => [String(x.id), x.name + ' · v' + x.version + ' (' + x.status + ')']), { ph: false }))}${H.f('Up to', H.sel('upTo', ms.map(p => [p, MN(p)]), { ph: false }))}</div><div class="fin-row">${H.f('Cost centre', H.sel('cc', ccList(d).map(c => [c, c]), { ph: 'All' }))}${tab === 'ba' ? H.f('Show by', H.sel('grp', [['account', 'Account'], ['parent', 'Account group'], ['type', 'Income / expense']], { ph: false })) : ''}</div>`);
      const c = BUD.compare(bl, d.lines, d.accts, b.fy, upTo, v.cc || '', v.grp || 'account'), vc = (x, t) => `<span class="${x >= 0 ? 'bfa-fav' : 'bfa-adv'}">${n2(x)}</span>`;
      if (tab === 'mon') { const pick = v.macc || '', rows = c.rows.filter(r => !pick || r.key === pick), M = ms.map((p, i) => { const bb = rows.reduce((s, r) => s + (r.type === 'income' ? 1 : -1) * r.m[i], 0), aa = rows.reduce((s, r) => s + (r.type === 'income' ? 1 : -1) * r.am[i], 0); return { p: MN(p), b: B.r2(bb), a: i < c.upTo ? B.r2(aa) : '', v: i < c.upTo ? B.r2(aa - bb) : '' }; });
        return head + filt + H.card('', H.f('Line', H.sel('macc', c.rows.map(r => [String(r.key), r.name]), { ph: 'Profit (income − expenses)' })))
          + out('By month · ' + (pick ? (c.rows.find(r => r.key === pick) || {}).name : 'profit'), [{ k: 'p', t: 'Month' }, { k: 'b', t: 'Budget', n: 1 }, { k: 'a', t: 'Actual', n: 1 }, { k: 'v', t: 'Variance', n: 1 }], M); }
      return head + filt
        + H.kpis([['Income YTD', n2(c.income.actYtd), c.income.actYtd >= c.income.budYtd ? 'g' : 'r'], ['Income budget YTD', n2(c.income.budYtd)], ['Expenses YTD', n2(c.expense.actYtd), c.expense.actYtd <= c.expense.budYtd ? 'g' : 'r'], ['Expense budget YTD', n2(c.expense.budYtd)], ['Profit YTD', n2(c.profit.actYtd), c.profit.varYtd >= 0 ? 'g' : 'r'], ['Profit budget YTD', n2(c.profit.budYtd)], ['Profit forecast for the year', n2(c.profit.forecast)], ['Year budget profit', n2(c.profit.budYear)]])
        + out(b.name + ' · ' + MN(ms[0]) + ' – ' + MN(upTo) + (v.cc ? ' · ' + v.cc : ''), [{ k: 'name', t: 'Line' }, { k: 'budMonth', t: MN(upTo) + ' budget', n: 1 }, { k: 'actMonth', t: 'Actual', n: 1 }, { k: 'budYtd', t: 'YTD budget', n: 1 }, { k: 'actYtd', t: 'YTD actual', n: 1 }, { k: 'vv', t: 'Variance', raw: 1 }, { k: 'vp', t: '%' }, { k: 'budYear', t: 'Year budget', n: 1 }, { k: 'forecast', t: 'Forecast', n: 1 }],
          c.rows.map(r => Object.assign({}, r, { vv: vc(r.varYtd), vp: pctTxt(r.varPct), _cls: r.budYear ? '' : 'sub' })), { name: 'Profit', budYtd: c.profit.budYtd, actYtd: c.profit.actYtd, vv: vc(c.profit.varYtd), budYear: c.profit.budYear, forecast: c.profit.forecast });
    },
    act: { toSet, toBud() { go('x_budlist'); }, csv(t, v) { const r = v._rep; if (r) csv(r.title.replace(/\W+/g, '_'), r.cols, r.rows.map(x => Object.assign({}, x, { vv: x.varYtd, u: x.used }))); }, print(t, v) { const r = v._rep; if (r) printHtml(r.title, table(r.cols, r.rows, r.foot)); } } });

  /* ================= Fixed assets ================= */
  const blankAsset = (d, pre) => Object.assign({ form: 1, id: null, name: '', cat: '', acq: today(), inService: '', cost: '', residual: '', method: 'sl', life: '', rate: '', cc: '', location: '', supplier: '', serial: '', notes: '', openAcc: '', openPeriod: '', src: '', srcRef: '', post: 'no', credit: '', errs: null }, pre || {});
  const hasRuns = (d, a) => (d.runs || []).some(r => r.status === 'posted' && (r.lines || []).some(l => String(l.asset) === String(a.id)));
  const fromBills = d => { const done = new Set((d.assets || []).map(a => a.srcRef)), fx = new Set((d.accts || []).filter(a => a.sub === 'fixed_asset').map(a => a.code)), out = [];
    (d.bills || []).filter(r => r.status === 'posted').forEach(r => { const ls = F.J(r.linesjson, []), t = F.billTotals({ lines: ls }), rate = r.currency && r.currency !== 'AED' ? num(r.fxrate) || 1 : 1;
      ls.forEach((l, i) => { if (!fx.has(String(l.account))) return; const ref = 'BILL:' + r.id + ':' + i; if (done.has(ref)) return; out.push({ ref, bill: r.billno || r.title, date: String(r.billdate || '').slice(0, 10), supplier: r.suppliername || '', name: l.description || 'Asset', account: String(l.account), cost: B.r2(t.lines[i].net * rate), journal: r.journalno || '' }); }); });
    return out; };
  screen('x_fareg', { fa: true, bills: true }, {
    view(v, d) {
      const as = d.assets || [], cats = d.cats || [], accts = d.accts || [], rule = (d.set || {}).first;
      if (v.form) { const c = cats.find(x => x.name === v.cat), locked = v.id && hasRuns(d, v);
        if (c && v._cat !== v.cat) { v._cat = v.cat; if (!v.id || !locked) { v.method = c.method; v.life = String(c.life || ''); v.rate = String(c.rate || ''); if (!v.residual && c.residualPct && num(v.cost)) v.residual = String(B.r2(num(v.cost) * c.residualPct / 100)); } }
        const L = locked ? ' disabled' : '', prev = c && num(v.cost) > 0 ? FA.charges({ id: 0, acq: v.acq, inService: v.inService || v.acq, method: v.method, cost: num(v.cost), residual: num(v.residual), life: num(v.life), rate: num(v.rate), openAcc: num(v.openAcc), openPeriod: v.openPeriod }, [], B.addM(FA.startPeriod({ acq: v.acq, inService: v.inService || v.acq }, rule), 11), rule) : [];
        return H.head('🏢', v.id ? 'Edit asset' : 'New fixed asset', v.src ? 'From bill ' + esc(v.src) : '', '#4338ca') + errs(v.errs) + (locked ? '<div class="mb-hint" style="margin:0 4px 10px">Depreciation has been posted for this asset — cost and depreciation settings are locked.</div>' : '')
          + H.card('', `${H.f('Name *', H.inp('name'))}<div class="fin-row">${H.f('Category *', H.sel('cat', cats.filter(x => x.active).map(x => [x.name, x.name]), { r: 1 }))}${H.f('Serial / plate no.', H.inp('serial'))}</div><div class="fin-row">${H.f('Acquired', H.date('acq'))}${H.f('In service from', H.date('inService'), 'If different')}</div><div class="fin-row">${H.f('Location', H.inp('location'))}${H.f('Cost centre', H.inp('cc'))}${H.f('Supplier', H.inp('supplier'))}</div>`)
          + H.card('Depreciation', `<div class="fin-row">${H.f('Cost (AED) *', `<input data-v="cost" data-r="1" inputmode="decimal" value="${esc(v.cost)}"${L}>`)}${H.f('Residual value', `<input data-v="residual" data-r="1" inputmode="decimal" value="${esc(v.residual)}"${L}>`)}</div>${H.f('Method', H.seg('method', Object.entries(FA.METHODS), 'sl'))}<div class="fin-row">${v.method === 'db' ? H.f('Rate % per year', `<input data-v="rate" data-r="1" inputmode="decimal" value="${esc(v.rate)}"${L}>`) : H.f('Useful life (months)', `<input data-v="life" data-r="1" inputmode="numeric" value="${esc(v.life)}"${L}>`)}</div>
              <details${num(v.openAcc) ? ' open' : ''}><summary class="mb-hint">Asset from an old system — depreciation already charged</summary><div class="fin-row">${H.f('Accumulated depreciation so far', `<input data-v="openAcc" data-r="1" inputmode="decimal" value="${esc(v.openAcc)}"${L}>`)}${H.f('Charged up to month', `<input data-v="openPeriod" data-r="1" type="month" value="${esc(v.openPeriod)}"${L}>`)}</div></details>`)
          + (prev.length ? H.card('First 12 months', table([{ k: 'p', t: 'Month' }, { k: 'amount', t: 'Depreciation', n: 1 }], prev.slice(0, 12).map(x => ({ p: MN(x.period), amount: x.amount })))) : '')
          + (!v.id && !v.src ? H.card('Ledger', H.f('Acquisition', H.seg('post', [['no', 'Already in the ledger'], ['yes', 'Post it now']], 'no'), '"Already in the ledger": bought on a purchase bill or in the opening balances') + (v.post === 'yes' ? H.f('Paid from / owed to', H.sel('credit', acctOpts(accts, a => ['asset', 'liability', 'equity'].includes(a.type) && a.sub !== 'fixed_asset'), { ph: false })) : '')) : '')
          + H.card('Notes', H.txt('notes')) + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Save', 'save')}</div>`);
      }
      if (ST.asset) {
        const a = as.find(x => x.id === ST.asset); if (!a) return busy(d); setTitle(a.no);
        const rs = d.runs || [], acc = FA.accumulated(a, rs), lp = FA.lastPeriod(a, rs), nextC = a.status === 'active' ? FA.charges(a, rs, B.addM(lp || FA.startPeriod(a, rule), 12), rule).slice(0, 12) : [], cat = cats.find(c => c.name === a.cat) || {};
        const past = []; rs.filter(r => r.status === 'posted').forEach(r => (r.lines || []).filter(l => String(l.asset) === String(a.id)).forEach(l => past.push({ p: l.months > 1 ? MN(l.from) + ' – ' + MN(l.to) : MN(l.to), run: r.no, amount: l.amount })));
        const dp = v.dd ? FA.disposal(a, cat, rs, v.dd, num(v.dp), v.dacc, d.map, rule) : null;
        return H.head('🏢', a.no + ' · ' + esc(a.name), esc(a.cat) + ' · ' + FA.METHODS[a.method] + (a.method === 'sl' ? ' · ' + a.life + ' months' : ' · ' + a.rate + '%') + (a.serial ? ' · ' + esc(a.serial) : ''), COL[a.status])
          + H.kpis([['Cost', n2(a.cost)], ['Accumulated depreciation', n2(acc)], ['Net book value', n2(a.cost - acc), 'g'], ['Depreciated to', lp ? MN(lp) : '—']])
          + H.card('Status · ' + pill(a.status), `<div class="ei-kv"><span>Acquired · in service</span><b>${dmy(a.acq)} · ${dmy(a.inService)}</b></div>${a.location ? `<div class="ei-kv"><span>Location</span><b>${esc(a.location)}</b></div>` : ''}${a.cc ? `<div class="ei-kv"><span>Cost centre</span><b>${esc(a.cc)}</b></div>` : ''}${a.supplier ? `<div class="ei-kv"><span>Supplier</span><b>${esc(a.supplier)}</b></div>` : ''}${a.openAcc ? `<div class="ei-kv"><span>Brought in</span><b>${n2(a.openAcc)} to ${MN(a.openPeriod)}</b></div>` : ''}${a.acqJournal ? `<div class="ei-kv"><span>Acquisition entry</span><b>${esc(a.acqJournal)}</b></div>` : ''}${a.status === 'disposed' ? `<div class="ei-kv"><span>Disposed</span><b>${dmy(a.dispDate)} · proceeds ${n2(a.proceeds)} · ${a.gain >= 0 ? 'gain' : 'loss'} ${n2(Math.abs(a.gain))} · ${esc(a.dispJournal)}</b></div>` : ''}`)
          + (past.length ? H.card('Depreciation posted', table([{ k: 'p', t: 'Months' }, { k: 'run', t: 'Run' }, { k: 'amount', t: 'Amount', n: 1 }], past)) : '')
          + (nextC.length ? H.card('Next 12 months', table([{ k: 'p', t: 'Month' }, { k: 'amount', t: 'Depreciation', n: 1 }], nextC.map(x => ({ p: MN(x.period), amount: x.amount })))) : '')
          + (a.status === 'active' && v.disp ? H.card('Dispose (sell or scrap)', `<div class="fin-row">${H.f('Date', H.date('dd', { r: 1 }))}${H.f('Proceeds (AED, 0 if scrapped)', H.num('dp', { r: 1 }))}</div>${num(v.dp) ? H.f('Received in', H.sel('dacc', acctOpts(accts, x => ['bank', 'cash', 'receivable'].includes(x.sub)), { r: 1 })) : ''}`
              + (dp ? (dp.ok ? `<div class="ei-kv"><span>Depreciation to disposal</span><b>${n2(dp.catchUp)}</b></div><div class="ei-kv"><span>Net book value</span><b>${n2(dp.nbv)}</b></div><div class="ei-kv g"><span>${dp.gain >= 0 ? 'Gain' : 'Loss'}</span><b>${n2(Math.abs(dp.gain))}</b></div>` + table([{ k: 'a', t: 'Account' }, { k: 'debit', t: 'Debit', n: 1 }, { k: 'credit', t: 'Credit', n: 1 }], dp.entry.lines.map(l => ({ a: acctName(accts, l.account), debit: l.debit || '', credit: l.credit || '' }))) : errs(dp.errors)) : '') + H.btn('✓ Post disposal', 'doDisp')) : '')
          + H.bar(`<div class="mb-row">${H.btn('← Assets', 'back0', 's')}${a.status === 'active' ? H.btn('✏️ Edit', 'edit', 's') + (v.disp ? '' : H.btn('🏷 Dispose', 'disp', 's')) : ''}</div>`);
      }
      const tab = v.tab || 'active', q = String(v.q || '').toLowerCase(), rs = d.runs || [], rows = as.filter(a => (tab === 'all' || a.status === tab) && (!q || (a.no + ' ' + a.name + ' ' + a.cat + ' ' + a.serial + ' ' + a.location).toLowerCase().includes(q)));
      const act = as.filter(a => a.status === 'active'), tc = B.r2(act.reduce((s, a) => s + a.cost, 0)), ta = B.r2(act.reduce((s, a) => s + FA.accumulated(a, rs), 0)), wb = fromBills(d);
      setTitle('Fixed assets');
      return H.head('🏢', 'Fixed assets', act.length + ' in use · cost, depreciation, book value', '#4338ca') + busy(d) + needSetup(d)
        + H.kpis([['Cost', n2(tc)], ['Accumulated depreciation', n2(ta)], ['Net book value', n2(tc - ta), 'g'], ['Assets', String(act.length)]])
        + (wb.length ? H.card('From purchase bills · not registered yet', wb.slice(0, 10).map((x, i) => H.li({ x: 'fromBill', i, ic: '🧾', c: '#4338ca', t: x.name + ' · ' + money(x.cost), s: x.bill + ' · ' + dmy(x.date) + ' · ' + acctName(accts, x.account), v: '＋' })).join('')) : '')
        + H.search('q', 'Search number, name, category, serial, location') + H.tabs('tab', [['active', 'In use'], ['disposed', 'Disposed'], ['all', 'All', as.length]], 'active')
        + H.card('', table([{ k: 'no', t: 'No.' }, { k: 'name', t: 'Asset' }, { k: 'cat', t: 'Category' }, { k: 'acq', t: 'Acquired' }, { k: 'cost', t: 'Cost', n: 1 }, { k: 'nbv', t: 'Book value', n: 1 }], rows.map(a => ({ no: a.no, name: a.name, cat: a.cat, acq: dmy(a.acq), cost: a.cost, nbv: a.status === 'disposed' ? 0 : B.r2(a.cost - FA.accumulated(a, rs)), _tap: a.id })), null, 'open'))
        + H.bar(`<div class="mb-row">${H.btn('＋ New asset', 'add')}${H.btn('📉 Depreciation', 'toDep', 's')}</div>`);
    },
    act: { toSet, toDep() { go('x_fadep'); },
      add(t, v, d) { if (!(d.cats || []).length) return toSet(); Object.assign(v, blankAsset(d)); render(); }, open(t, v) { ST.asset = +t.dataset.i; clear(v); render(); }, back0(t, v) { ST.asset = null; clear(v); render(); }, cancel(t, v) { v.form = 0; render(); },
      fromBill(t, v, d) { const x = fromBills(d)[+t.dataset.i], c = (d.cats || []).find(k => k.assetAcc === x.account); Object.assign(v, blankAsset(d, { name: x.name, cat: c ? c.name : '', acq: x.date, cost: String(x.cost), supplier: x.supplier, src: x.bill, srcRef: x.ref, acqJournal: x.journal })); render(); },
      edit(t, v, d) { const a = d.assets.find(x => x.id === ST.asset); Object.assign(v, blankAsset(d, { id: a.id, no: a.no, name: a.name, cat: a.cat, _cat: a.cat, acq: a.acq, inService: a.inService === a.acq ? '' : a.inService, cost: String(a.cost), residual: String(a.residual || ''), method: a.method, life: String(a.life || ''), rate: String(a.rate || ''), cc: a.cc, location: a.location, supplier: a.supplier, serial: a.serial, notes: a.notes, openAcc: String(a.openAcc || ''), openPeriod: a.openPeriod, srcRef: a.srcRef, acqJournal: a.acqJournal, history: a.history, status: a.status })); render(); },
      disp(t, v) { v.disp = 1; v.dd = today(); v.dp = ''; render(); },
      async save(t, v, d) {
        const a = { id: v.id, no: v.no || '', name: str(v.name), cat: v.cat, acq: v.acq, inService: v.inService || v.acq, cost: num(v.cost), residual: num(v.residual), method: v.method || 'sl', life: num(v.life), rate: num(v.rate), cc: str(v.cc), location: str(v.location), supplier: str(v.supplier), serial: str(v.serial), notes: str(v.notes), openAcc: num(v.openAcc), openPeriod: num(v.openAcc) ? v.openPeriod : '', srcRef: v.srcRef || '', acqJournal: v.acqJournal || '', history: v.history || [] };
        const e = FA.checkAsset(a, d.cats, d.assets); if (v.post === 'yes' && !v.credit) e.push('Choose the account the asset was paid from'); if (e.length) { v.errs = e; render(); return; }
        if (!v.id && v.post === 'yes' && !confirm('Register and post the acquisition (' + money(a.cost) + ')?')) return;
        try { const r = await BS.saveAsset(a, d.ctx, !v.id && v.post === 'yes' ? v.credit : ''); if (v.srcRef && !v.id) await S.upd('FA_Assets', r.id, { AcqJournal: v.acqJournal || '' }); toast('✅ ' + r.no + ' saved' + (r.acqJournal && v.post === 'yes' ? ' · ' + r.acqJournal : ''), 'success'); clear(v); ST.asset = r.id; refresh('x_fareg'); } catch (er) { v.errs = [er.message]; render(); } },
      async doDisp(t, v, d) { const a = d.assets.find(x => x.id === ST.asset), dp = FA.disposal(a, d.cats.find(c => c.name === a.cat), d.runs, v.dd, num(v.dp), v.dacc, d.map, (d.set || {}).first); if (!dp.ok) return toast(dp.errors.join(' · '), 'error');
        if (!confirm('Dispose of ' + a.no + ' on ' + dmy(v.dd) + '?\n\n' + (dp.gain >= 0 ? 'Gain ' : 'Loss ') + n2(Math.abs(dp.gain)) + '. This cannot be undone here (reverse the journal entry if needed).')) return;
        try { const r = await BS.dispose(a, v.dd, num(v.dp), v.dacc, d.ctx); toast('🏷 ' + a.no + ' disposed · ' + r.journal, 'success'); clear(v); refresh('x_fareg'); } catch (e) { toast(e.message, 'error'); } } } });

  /* ================= Depreciation ================= */
  screen('x_fadep', { fa: true }, {
    view(v, d) {
      const rs = d.runs || [], last = rs.filter(r => r.status === 'posted').map(r => r.period).sort().pop(), prevMonth = B.per(addD(today().slice(0, 8) + '01', -1));
      if (!v.period) v.period = last ? (B.addM(last, 1) <= B.per(today()) ? B.addM(last, 1) : B.per(today())) : prevMonth;
      const r = d.cats ? FA.run(d.assets || [], d.cats, rs, v.period, d.map, (d.set || {}).first) : null;
      setTitle('Depreciation');
      return H.head('📉', 'Depreciation', 'One run per month · assets catch up on months they missed', '#4338ca') + busy(d) + needSetup(d)
        + H.card('New run', `<div class="fin-row">${H.f('Up to month', `<input type="month" data-v="period" data-r="1" value="${esc(v.period)}">`)}</div><span class="mb-hint">${last ? 'Last posted run: ' + MN(last) + '.' : 'No run posted yet.'} The entry is dated the last day of the month.</span>`)
        + (r ? (r.ok ? H.card('Preview · ' + money(r.total) + ' · ' + r.lines.length + ' asset(s)', table([{ k: 'no', t: 'Asset' }, { k: 'name', t: 'Name' }, { k: 'm', t: 'Months' }, { k: 'amount', t: 'Amount', n: 1 }], r.lines.map(l => ({ no: l.no, name: l.name, m: l.months > 1 ? MN(l.from) + ' – ' + MN(l.to) + ' (' + l.months + ')' : MN(l.to), amount: l.amount })), { no: 'Total', amount: r.total })
            + (r.entry ? table([{ k: 'a', t: 'Ledger account' }, { k: 'cc', t: 'Cost centre' }, { k: 'debit', t: 'Debit', n: 1 }, { k: 'credit', t: 'Credit', n: 1 }], r.entry.lines.map(l => ({ a: acctName(d.accts, l.account), cc: l.costCenter, debit: l.debit || '', credit: l.credit || '' }))) + H.btn(v.busy ? '⏳ Posting…' : '✓ Post depreciation for ' + MN(v.period), 'post') : '<span class="mb-hint">Nothing to depreciate.</span>')) : H.card('', errs(r.errors))) : '')
        + H.card('Runs', table([{ k: 'no', t: 'Run' }, { k: 'p', t: 'Month' }, { k: 'j', t: 'Journal' }, { k: 'total', t: 'Amount', n: 1 }, { k: 'st', t: '', raw: 1 }], rs.map(x => ({ no: x.no, p: MN(x.period), j: x.journal + (x.reversedBy ? ' ↺ ' + x.reversedBy : ''), total: x.total, st: pill(x.status) }))) + (rs.some(x => x.status === 'posted') ? H.sbtn('↺ Reverse the latest run', 'rev', 'style="width:100%"') : ''));
    },
    act: { toSet,
      async post(t, v, d) { if (v.busy) return; if (!confirm('Post depreciation up to ' + MN(v.period) + '?')) return; v.busy = 1; render();
        try { const r = await BS.postRun(v.period, d.ctx); toast('📉 ' + r.no + ' · ' + money(r.total) + ' · ' + r.journal, 'success'); v.period = ''; } catch (e) { toast(e.message, 'error'); } v.busy = 0; refresh('x_fadep'); },
      async rev(t, v, d) { const run = (d.runs || []).filter(x => x.status === 'posted').sort((a, b) => b.period.localeCompare(a.period))[0]; if (!confirm('Reverse ' + run.no + ' (' + MN(run.period) + ', ' + money(run.total) + ')?')) return;
        try { const r = await BS.reverseRun(run, d.ctx); toast('↺ Reversed by ' + r, 'success'); v.period = ''; refresh('x_fadep'); } catch (e) { toast(e.message, 'error'); } } } });

  /* ================= Asset reports ================= */
  screen('x_farep', { fa: true, lines: true }, {
    view(v, d) {
      const tab = v.tab || 'reg', as = d.assets || [], rs = d.runs || [], rule = (d.set || {}).first, asOf = v.asOf || today();
      const head = H.head('📋', 'Asset reports', 'Register · movement · forecast · ledger check', '#4338ca') + busy(d) + needSetup(d) + H.tabs('tab', [['reg', 'Register'], ['mov', 'Movement'], ['fc', 'Forecast'], ['rec', 'Assets vs ledger']], 'reg');
      const out = (title, cols, rows, foot) => { v._rep = { title, cols, rows, foot }; return H.card('', table(cols, rows, foot)) + H.bar(`<div class="mb-row">${H.btn('⬇ CSV', 'csv', 's')}${H.btn('🖨 Print', 'print', 's')}</div>`); };
      if (tab === 'mov') { const from = v.from || F.fyStart(today(), (d.finSet || {}).fiscalStart), to = v.to || today(), rows = FA.movement(as, rs, from, to), T = k => B.r2(rows.reduce((s, r) => s + r[k], 0));
        return head + H.card('', `<div class="fin-row">${H.f('From', H.date('from', { val: from }))}${H.f('To', H.date('to'))}</div>`)
          + out('Fixed assets movement ' + dmy(from) + ' – ' + dmy(to), [{ k: 'cat', t: 'Category' }, { k: 'openCost', t: 'Cost at start', n: 1 }, { k: 'additions', t: 'Additions', n: 1 }, { k: 'disposals', t: 'Disposals', n: 1 }, { k: 'closeCost', t: 'Cost at end', n: 1 }, { k: 'openAcc', t: 'Acc. dep. at start', n: 1 }, { k: 'broughtIn', t: 'Brought in', n: 1 }, { k: 'charge', t: 'Charge', n: 1 }, { k: 'dispAcc', t: 'On disposals', n: 1 }, { k: 'closeAcc', t: 'Acc. dep. at end', n: 1 }, { k: 'nbv', t: 'Book value', n: 1 }],
            rows, { cat: 'Total', openCost: T('openCost'), additions: T('additions'), disposals: T('disposals'), closeCost: T('closeCost'), openAcc: T('openAcc'), broughtIn: T('broughtIn'), charge: T('charge'), dispAcc: T('dispAcc'), closeAcc: T('closeAcc'), nbv: T('nbv') }); }
      if (tab === 'fc') { const last = rs.filter(r => r.status === 'posted').map(r => r.period).sort().pop(), from = last ? B.addM(last, 1) : B.per(today()), f = FA.forecast(as, rs, from, 12, rule);
        return head + H.card('', `<span class="mb-hint">From ${MN(from)}, if no assets are added or disposed.</span>`) + out('Depreciation forecast', [{ k: 'cat', t: 'Category' }].concat(f.periods.map((p, i) => ({ k: 'm' + i, t: MN(p), n: 1 }))).concat([{ k: 'total', t: 'Total', n: 1 }]),
          f.rows.map(r => { const o = { cat: r.cat, total: r.total }; r.m.forEach((x, i) => { o['m' + i] = x; }); return o; }), Object.assign({ cat: 'Total', total: B.r2(f.rows.reduce((s, r) => s + r.total, 0)) }, ...f.periods.map((p, i) => ({ ['m' + i]: B.r2(f.rows.reduce((s, r) => s + r.m[i], 0)) })))); }
      if (tab === 'rec') { const r = FA.reconcile(as, rs, d.cats || [], d.lines || [], d.map, asOf);
        return head + H.card('', H.f('As of', H.date('asOf')) + `<span class="mb-hint">${r.ok ? '✓ The asset register and the ledger agree.' : 'Differences: assets bought on a bill but not registered, depreciation posted by hand, or registered assets marked "already in the ledger" that were not.'}</span>`)
          + out('Assets vs ledger ' + dmy(asOf), [{ k: 'kind', t: '' }, { k: 'a', t: 'Account' }, { k: 'register', t: 'Register', n: 1 }, { k: 'gl', t: 'Ledger', n: 1 }, { k: 'diff', t: 'Difference', n: 1 }], r.rows.map(x => Object.assign({}, x, { a: acctName(d.accts, x.account) }))); }
      const rows = FA.register(as, rs, asOf).filter(r => !v.cat || r.cat === v.cat), T = k => B.r2(rows.reduce((s, r) => s + r[k], 0));
      return head + H.card('', `<div class="fin-row">${H.f('As of', H.date('asOf'))}${H.f('Category', H.sel('cat', (d.cats || []).map(c => [c.name, c.name]), { ph: 'All' }))}</div>`)
        + out('Fixed asset register ' + dmy(asOf), [{ k: 'no', t: 'No.' }, { k: 'name', t: 'Asset' }, { k: 'cat', t: 'Category' }, { k: 'acq', t: 'Acquired' }, { k: 'cc', t: 'Cost centre' }, { k: 'cost', t: 'Cost', n: 1 }, { k: 'acc', t: 'Acc. depreciation', n: 1 }, { k: 'nbv', t: 'Book value', n: 1 }],
          rows.map(r => Object.assign({}, r, { acq: dmy(r.acq) })), { no: 'Total', cost: T('cost'), acc: T('acc'), nbv: T('nbv') });
    },
    act: { toSet, csv(t, v) { const r = v._rep; if (r) csv(r.title.replace(/\W+/g, '_'), r.cols, r.rows); }, print(t, v) { const r = v._rep; if (r) printHtml(r.title, table(r.cols, r.rows, r.foot)); } } });

  /* ================= Asset settings ================= */
  screen('x_faset', { fa: true }, {
    view(v, d) {
      const tab = v.tab || 'gen', s = d.set || FA.faSettingsFromRow(null), accts = d.accts || [], cats = d.cats || [];
      if (!v.__f && !d.busy && d.set) { v.__f = 1; Object.assign(v, { ap: s.asset, rp: s.run, first: s.first, gain: s.gain || d.map.fa_gain || '' }); }
      const head = H.head('⚙️', 'Asset settings', 'Budgets & fixed assets: categories, accounts, set up', '#475569') + busy(d) + H.tabs('tab', [['gen', 'General'], ['cat', 'Categories'], ['setup', 'Set up']], 'gen');
      const missAcc = B.FA.COA_ADD.filter(a => !accts.some(x => x.code === a.code));
      if (tab === 'setup') return head + H.card('1 · Lists', `<span class="mb-hint">Creates the budget and fixed asset lists (and the finance lists if missing) or adds missing columns. Never deletes data.</span>${Object.keys(B.LISTS).map(n => `<div class="ei-kv"><span class="ei-mono">${n}</span><b>${B.LISTS[n].length} columns</b></div>`).join('')}${H.btn(v.busy ? '⏳ ' + esc(v.busy) : '🛠 Set up lists', 'setup')}`)
        + H.card('2 · Accounts', missAcc.length ? `<span class="mb-hint">Adds ${missAcc.map(a => a.code + ' ' + esc(a.name)).join(', ')}.</span>${H.btn('📥 Add accounts', 'addAcc', 's')}` : '<span class="mb-hint">✓ The accounts are in the chart.</span>')
        + H.card('3 · Categories', cats.length ? `<span class="mb-hint">✓ ${cats.length} categories.</span>` : `<span class="mb-hint">Adds ${FA.defaultCats(accts).map(c => esc(c.name) + ' (' + c.life / 12 + ' years)').join(', ')} — change them in Categories.</span>${H.btn('📥 Add standard categories', 'seedCats', 's')}`)
        + (v.out ? H.card('Result', v.out.map(x => `<div class="ei-kv"><b>${esc(x)}</b></div>`).join('')) : '');
      if (tab === 'cat') {
        if (v.cf) return head + H.card(v.cid ? 'Edit category' : 'New category', `${H.f('Name *', H.inp('cname'))}<div class="fin-row">${H.f('Asset account', H.sel('ca', acctOpts(accts, a => a.sub === 'fixed_asset'), { ph: false }))}${H.f('Accumulated depreciation', H.sel('cd', acctOpts(accts, a => a.type === 'asset'), { ph: false }))}${H.f('Depreciation expense', H.sel('ce', acctOpts(accts, a => a.type === 'expense'), { ph: false }))}</div>${H.f('Method', H.seg('cm', Object.entries(FA.METHODS), 'sl'))}<div class="fin-row">${v.cm === 'db' ? H.f('Rate % per year', H.num('crate')) : H.f('Useful life (months)', H.num('clife'))}${H.f('Residual value % of cost', H.num('cres'))}</div>${H.f('Status', H.seg('cact', [['1', 'Active'], ['0', 'Inactive']], '1'))}<div class="mb-row">${H.btn('Cancel', 'ccancel', 's')}${H.btn('💾 Save', 'csave')}</div>`);
        return head + H.card('', table([{ k: 'name', t: 'Category' }, { k: 'a', t: 'Asset account' }, { k: 'm', t: 'Method' }, { k: 'n', t: 'Assets' }], cats.map(c => ({ name: c.name + (c.active ? '' : ' (inactive)'), a: acctName(accts, c.assetAcc), m: c.method === 'db' ? c.rate + '% declining' : (c.life / 12) + ' years straight line', n: String((d.assets || []).filter(a => a.cat === c.name).length), _tap: c.id })), null, 'cedit')) + H.bar(H.btn('＋ New category', 'cadd'));
      }
      return head + needSetup(d) + H.card('Numbering', `<div class="fin-row">${H.f('Asset numbers', H.inp('ap'))}${H.f('Depreciation runs', H.inp('rp'))}</div>`)
        + H.card('Rules', H.f('First month of depreciation', H.sel('first', [['mid', 'In service by the 15th → that month, else the next'], ['full', 'Always the month it goes into service'], ['next', 'Always the month after']], { ph: false })) + H.f('Gain / loss on disposal account', H.sel('gain', acctOpts(accts, a => ['income', 'expense'].includes(a.type)), { ph: false })))
        + H.bar(H.btn('💾 Save', 'save'));
    },
    act: {
      async save(t, v) { try { await BS.saveSettings({ AssetPrefix: str(v.ap) || 'FA', RunPrefix: str(v.rp) || 'DEP', FirstMonth: v.first || 'mid', GainAccount: v.gain || '' }); toast('✅ Saved', 'success'); v.__f = 0; refresh('x_faset'); } catch (e) { toast(e.message, 'error'); } },
      async setup(t, v) { if (v.busy) return; v.busy = 'Starting…'; v.out = null; render(); try { v.out = await FU.setupLists(Object.assign({}, F.LISTS, B.LISTS), n => { v.busy = n + '…'; render(); }); drop(...Object.keys(B.LISTS), ...F.LIST_NAMES); toast('✅ Lists are ready', 'success'); } catch (e) { v.out = ['✘ ' + e.message]; toast(e.message, 'error'); } v.busy = ''; refresh('x_faset'); },
      async addAcc(t, v, d) { try { for (const a of B.FA.COA_ADD.filter(a => !d.accts.some(x => x.code === a.code))) await S.add('Fin_Accounts', F.acctToFields(a)); S.drop('Fin_Accounts'); toast('✅ Accounts added', 'success'); refresh('x_faset'); } catch (e) { toast(e.message, 'error'); } },
      async seedCats(t, v, d) { try { const have = new Set((d.cats || []).map(c => c.name)); for (const c of FA.defaultCats(d.accts)) if (!have.has(c.name)) await S.add('FA_Categories', FA.catToFields(c)); S.drop('FA_Categories'); toast('✅ Categories added', 'success'); refresh('x_faset'); } catch (e) { toast(e.message, 'error'); } },
      cadd(t, v, d) { Object.assign(v, { cf: 1, cid: null, cname: '', ca: '', cd: d.map.fa_accdep, ce: d.map.fa_dep, cm: 'sl', clife: '60', crate: '', cres: '', cact: '1' }); render(); }, ccancel(t, v) { v.cf = 0; render(); },
      cedit(t, v, d) { const c = d.cats.find(x => x.id === +t.dataset.i); Object.assign(v, { cf: 1, cid: c.id, _old: c.name, cname: c.name, ca: c.assetAcc, cd: c.accDepAcc, ce: c.depAcc, cm: c.method, clife: String(c.life || ''), crate: String(c.rate || ''), cres: String(c.residualPct || ''), cact: c.active ? '1' : '0' }); render(); },
      async csave(t, v, d) { const name = str(v.cname); if (!name || !v.ca) return toast('Name and asset account are required', 'warn'); if (d.cats.some(c => c.name === name && c.id !== v.cid)) return toast('This category already exists', 'warn');
        if (v.cid && v._old !== name && d.assets.some(a => a.cat === v._old)) return toast('Assets use this category — its name cannot change', 'warn');
        const f = FA.catToFields({ name, assetAcc: v.ca, accDepAcc: v.cd, depAcc: v.ce, method: v.cm, life: num(v.clife), rate: num(v.crate), residualPct: num(v.cres), active: v.cact !== '0' });
        try { if (v.cid) await S.upd('FA_Categories', v.cid, f); else await S.add('FA_Categories', f); v.cf = 0; toast('✅ Category saved', 'success'); refresh('x_faset'); } catch (e) { toast(e.message, 'error'); } } } });

  window.BFA_UI = { bundle, version: '1' };
})();
