/* ============================================================
   ORBIT BUDGETS & FIXED ASSETS — data layer
   Lists Bud_* and FA_* sit next to the ledger: SharePoint by default, the ERP server when Finance Settings → Data says
   "server" (FA_Settings always stays in SharePoint).
   Safe posting without transactions:
   · depreciation run: the run (with its lines) is saved as a draft, its journal entry is posted (ref FA:<run id> —
     found again on a retry, never doubled), then the run is marked posted. Accumulated depreciation is counted only
     from posted runs, so a half-finished run never changes an asset.
   · disposal: journal entry first (ref FADISP:<asset id>), then the asset is marked disposed.
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, F = window.FIN, B = window.BFA, S = window.FINSTORE; if (!K || !F || !B || !S) return;
  const { A, get, drop, iso, me } = K, FA = B.FA, BUD = B.BUD;
  let SET = FA.faSettingsFromRow(null);
  const hist = (h, text) => JSON.stringify((h || []).concat([{ at: iso(), by: me(), text }]).slice(-40));

  async function settings(force) { let rows; try { rows = await get('FA_Settings', null, force); } catch (e) { if (!/not found/i.test(e.message)) throw e; rows = []; } SET = FA.faSettingsFromRow(rows[0]); SET.row = rows[0] || null; return SET; }
  async function saveSettings(f) { const row = SET.row || (await settings(true)).row; if (row) await A().upd('FA_Settings', row.id, f); else await A().add('FA_Settings', Object.assign({ Title: 'Fixed assets' }, f)); drop('FA_Settings'); return settings(true); }
  const cats = async f => (await S.list('FA_Categories', f)).map(FA.catFromRow).sort((a, b) => a.name.localeCompare(b.name));
  const assets = async f => (await S.list('FA_Assets', f)).map(FA.assetFromRow).sort((a, b) => a.no.localeCompare(b.no));
  const runs = async f => (await S.list('FA_DepRuns', f)).map(FA.runFromRow).sort((a, b) => b.period.localeCompare(a.period) || b.id - a.id);
  const budgets = async f => (await S.list('Bud_Budgets', f)).map(BUD.budFromRow).sort((a, b) => b.fy.localeCompare(a.fy) || b.id - a.id);
  const blines = async (f, id) => (await S.list('Bud_Lines', f)).map(BUD.blineFromRow).filter(l => !id || l.budget === String(id));
  const findJe = async ref => (await S.entries(true)).find(e => e.ref === ref && e.status !== 'draft');
  const lockOk = (ctx, date) => { if (ctx.finSet && ctx.finSet.lock && date <= ctx.finSet.lock) throw new Error('The period is locked up to ' + ctx.finSet.lock); };
  const checked = (e, ctx) => { const c = F.checkEntry(e, ctx.accts, ctx.finSet); if (!c.ok) throw new Error(c.errors.join(' · ')); return Object.assign(e, { lines: c.lines }); };

  /* ---------- assets ---------- */
  async function saveAsset(a, ctx, post) {   /* post = credit account for an acquisition entry (hand-entered asset), or '' */
    await settings(true); const cat = ctx.cats.find(c => c.name === a.cat);
    if (!a.id) { a.no = a.no || await S.next('fa', SET.asset); const r = await S.add('FA_Assets', Object.assign(FA.assetToFields(a), { Status: 'active', History: hist([], 'Registered') })); a.id = r.id; }
    else await S.upd('FA_Assets', a.id, FA.assetToFields(a));
    if (post && !a.acqJournal) { const e = FA.acquisition(a, cat, post, ctx.map); lockOk(ctx, e.date); const done = await findJe(e.ref); const no = done ? done.no : (await S.post(checked(e, ctx))).no; await S.upd('FA_Assets', a.id, { AcqJournal: no, History: hist(a.history, 'Acquisition posted · ' + no) }); a.acqJournal = no; }
    S.drop('FA_Assets'); return a;
  }
  async function dispose(a, date, proceeds, recv, ctx) {
    await settings(true); const rs = await runs(true), cat = ctx.cats.find(c => c.name === a.cat), d = FA.disposal(a, cat, rs, date, proceeds, recv, ctx.map, SET.first);
    if (!d.ok) throw new Error(d.errors.join(' · ')); lockOk(ctx, date);
    const done = await findJe(d.entry.ref), no = done ? done.no : (await S.post(checked(d.entry, ctx))).no;
    await S.upd('FA_Assets', a.id, { Status: 'disposed', DispDate: date, DispPeriod: d.catchTo || '', DispProceeds: B.num(proceeds), DispDep: d.catchUp, DispGain: d.gain, DispAccount: recv || '', DispJournal: no, History: hist(a.history, 'Disposed · ' + no + (d.gain ? ' · ' + (d.gain > 0 ? 'gain ' : 'loss ') + Math.abs(d.gain).toFixed(2) : '')) });
    S.drop('FA_Assets'); return Object.assign(d, { journal: no });
  }
  /* ---------- depreciation runs ---------- */
  async function postRun(period, ctx) {
    await settings(true); const [as, rs] = await Promise.all([assets(true), runs(true)]), r = FA.run(as, ctx.cats, rs, period, ctx.map, SET.first);
    if (!r.ok) throw new Error(r.errors.join(' · ')); if (!r.total) throw new Error('Nothing to depreciate up to ' + period);
    lockOk(ctx, r.entry.date); checked(r.entry, ctx);
    let run = rs.find(x => x.period === period && x.status === 'draft'), no;
    if (run) { no = run.no; await S.upd('FA_DepRuns', run.id, { LinesJson: JSON.stringify(r.lines), Total: r.total }); }
    else { no = await S.next('dep', SET.run); run = { id: (await S.add('FA_DepRuns', { Title: no, RunNo: no, Period: period, RunDate: r.entry.date, Status: 'draft', Total: r.total, LinesJson: JSON.stringify(r.lines), History: hist([], 'Calculated') })).id, history: [] }; }
    r.entry.ref = 'FA:' + run.id;
    const done = await findJe(r.entry.ref), jno = done ? done.no : (await S.post(r.entry)).no;
    await S.upd('FA_DepRuns', run.id, { Status: 'posted', JournalNo: jno, PostedBy: me(), PostedAt: iso(), History: hist(run.history, 'Posted · ' + jno) });
    S.drop('FA_DepRuns'); return { no, journal: jno, total: r.total, assets: r.lines.length };
  }
  async function reverseRun(run, ctx) {
    const rs = (await runs(true)).filter(x => x.status === 'posted'); if (!rs.length || rs[0].id !== run.id) throw new Error('Only the latest posted run can be reversed');
    const as = await assets(true); if (as.some(a => a.status === 'disposed' && a.dispPeriod && a.dispPeriod >= run.period)) throw new Error('An asset was disposed after this run — it cannot be reversed');
    const e0 = (await S.entries(true)).find(e => e.no === run.journal); if (!e0) throw new Error('Journal entry ' + run.journal + ' not found');
    const date = e0.date; lockOk(ctx, date);   /* reversed in the same month it was charged */
    let rno = e0.reversedBy; if (!rno) { const r = await S.post(F.reversalOf(e0, date)); rno = r.no; await S.upd('Fin_Journal', e0.id, { Status: 'reversed', ReversedBy: rno }); }
    await S.upd('FA_DepRuns', run.id, { Status: 'reversed', ReversedBy: rno, History: hist(run.history, 'Reversed · ' + rno) }); S.drop('FA_DepRuns', 'Fin_Journal'); return rno;
  }
  /* ---------- budgets ---------- */
  async function saveBudget(b, lines) {
    const head = { Title: b.name, FyStart: b.fy, Version: String(b.version || '1'), Status: b.status || 'draft', Notes: b.notes || '' };
    let id = b.id; if (id) await S.upd('Bud_Budgets', id, head); else id = (await S.add('Bud_Budgets', Object.assign(head, { History: hist([], 'Created') }))).id;
    const old = await blines(true, id), keep = new Map(old.map(l => [l.account + '|' + l.cc, l])), seen = new Set();
    for (const l of lines) { const k = l.account + '|' + (l.cc || ''), o = keep.get(k), f = BUD.blineToFields(l, id); seen.add(k);
      if (!o) await S.add('Bud_Lines', f); else if (o.m.some((x, i) => B.r2(x) !== B.r2(l.m[i] || 0)) || (o.notes || '') !== (l.notes || '')) await S.upd('Bud_Lines', o.id, f); }
    for (const o of old) if (!seen.has(o.account + '|' + o.cc)) await S.del('Bud_Lines', o.id);
    S.drop('Bud_Budgets', 'Bud_Lines'); return id;
  }
  async function setBudgetStatus(b, status) { await S.upd('Bud_Budgets', b.id, Object.assign({ Status: status, History: hist(b.history, status === 'approved' ? 'Approved' : status === 'draft' ? 'Reopened' : 'Closed') }, status === 'approved' ? { ApprovedBy: me(), ApprovedAt: iso() } : {})); S.drop('Bud_Budgets'); }
  /* ORBIT's own project lists (read only) */
  const tryGet = async n => { try { return await get(n, null, true); } catch (e) { if (/not found|404/i.test(e.message)) return null; throw e; } };
  async function orbitProjects() { const [p, c] = await Promise.all([tryGet('Project_Reg_tbl'), tryGet('Project_Costs_tbl')]); return { prj: p, costs: c || [] }; }

  window.BFASTORE = { get set() { return SET; }, settings, saveSettings, cats, assets, runs, budgets, blines, saveAsset, dispose, postRun, reverseRun, saveBudget, setBudgetStatus, orbitProjects, hist };
})();
