/* ============================================================
   ORBIT FINANCE — data layer
   Two places the ledger can live, chosen in Finance Settings (Data):
   · "sp"     — SharePoint lists Fin_* (default, like the rest of ORBIT)
   · "server" — the ORBIT ERP server's database (same table and column names, posting in one database transaction)
   Settings lists (Fin_Settings, Inv_Settings) and the e-invoicing lists always stay in SharePoint.
   SharePoint posting is made safe without transactions: the lines are written first with a fresh PostId, the entry
   header is marked posted with that PostId last; reports only count lines whose PostId matches a posted header.
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, F = window.FIN; if (!K || !F) return;
  const { A, get, drop, iso, me, nz } = K;
  const uuid = () => (window.EINV && EINV.uuid) ? EINV.uuid() : String(Date.now()) + Math.random().toString(16).slice(2);
  let SET = F.settingsFromRow(null);

  async function settings(force) {
    let rows; try { rows = await get('Fin_Settings', null, force); } catch (e) { if (!/not found/i.test(e.message)) throw e; rows = []; }
    SET = F.settingsFromRow(rows[0]); SET.row = rows[0] || null; return SET;
  }

  /* ---------- SharePoint ---------- */
  const G = 'https://graph.microsoft.com/v1.0/sites/';
  const sp = {
    list: (n, force) => get(n, null, force),
    async add(n, f) { const r = await A().add(n, f); drop(n); return { id: Number(r && r.id) }; },
    async upd(n, id, f) { await A().upd(n, id, f); drop(n); },
    async del(n, id) { const l = await A().L(n); const r = await fetch(G + l.siteId + '/lists/' + l.listId + '/items/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + l.token } }); if (!r.ok && r.status !== 204) throw new Error('Delete: HTTP ' + r.status); drop(n); },
    next: (type, prefix) => window.EINV_UI.nextNumber(type, prefix),
    async post(e, headerId) {
      const no = e.no || await sp.next('journal', SET.jv), postId = uuid(), total = F.r2(e.lines.reduce((s, l) => s + F.num(l.debit), 0));
      const head = { Title: no, EntryNo: no, EntryDate: e.date, Memo: e.memo || '', Source: e.source || 'manual', SourceRef: e.ref || '', ReversalOf: e.reversalOf || '', Total: total, LinesJson: JSON.stringify(e.lines) };
      if (!headerId) headerId = (await sp.add('Fin_Journal', Object.assign({ Status: 'draft', History: JSON.stringify([{ at: iso(), by: me(), text: 'Created' }]) }, head))).id;
      else await sp.upd('Fin_Journal', headerId, head);
      for (const l of e.lines) await A().add('Fin_JournalLines', { Title: no, EntryId: String(headerId), PostId: postId, EntryDate: e.date, AccountCode: String(l.account), Debit: F.num(l.debit), Credit: F.num(l.credit), Description: l.description || '', PartyType: l.partyType || '', PartyId: String(l.partyId || ''), PartyName: l.partyName || '', CostCenter: l.costCenter || '', Source: e.source || 'manual', DocRef: l.docRef || '' });
      drop('Fin_JournalLines');
      await sp.upd('Fin_Journal', headerId, { Status: 'posted', PostId: postId, PostedBy: me(), PostedAt: iso(), History: JSON.stringify((e.history || []).concat([{ at: iso(), by: me(), text: 'Posted' }]).slice(-40)) });
      return { id: headerId, no };
    },
  };

  /* ---------- ORBIT ERP server ---------- */
  async function call(method, path, body) {
    const url = String(SET.server || '').replace(/\/+$/, ''); if (!url) throw new Error('Enter the ERP server address in Finance Settings → Data.');
    const tok = (await A().L('Fin_Settings')).token;
    const r = await fetch(url + path, { method, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {} if (!r.ok) throw new Error((j && j.error) || ('ERP server HTTP ' + r.status)); return j;
  }
  const rowK = it => { const f = it.fields || {}, o = { id: Number(it.id) }; Object.keys(f).forEach(k => { o[nz(k)] = f[k]; }); o.id = Number(it.id); return o; };
  const cache = {};
  const srv = {
    async list(n, force) { const c = cache[n]; if (c && !force && Date.now() - c.at < 60000) return c.rows; const rows = (await call('GET', '/v1/erp/' + n)).map(rowK); cache[n] = { at: Date.now(), rows }; return rows; },
    async add(n, f) { delete cache[n]; return call('POST', '/v1/erp/' + n, { fields: f }); },
    async upd(n, id, f) { delete cache[n]; return call('PATCH', '/v1/erp/' + n + '/' + id, { fields: f }); },
    async del(n, id) { delete cache[n]; return call('DELETE', '/v1/erp/' + n + '/' + id); },
    next: (type, prefix) => call('POST', '/v1/erp/next', { type, prefix }).then(r => r.number),
    async post(e, headerId) { delete cache.Fin_Journal; delete cache.Fin_JournalLines; return call('POST', '/v1/erp/journal/post', { headerId: headerId || null, entry: e, prefix: SET.jv, by: me() }); },
  };
  const be = n => (!/_Settings$/.test(n) && SET.mode === 'server' && SET.server) ? srv : sp;   /* settings lists always stay in SharePoint */

  const S = {
    get set() { return SET; }, settings, call, be: n => be(n) === srv ? 'server' : 'sp',
    list: (n, force) => be(n).list(n, force), add: (n, f) => be(n).add(n, f), upd: (n, id, f) => be(n).upd(n, id, f), del: (n, id) => be(n).del(n, id),
    next: (type, prefix) => be('Fin_Journal').next(type, prefix),
    post: (e, headerId) => be('Fin_Journal').post(e, headerId),
    drop(...names) { names.forEach(n => { delete cache[n]; drop(n); }); },
    async accounts(force) { return (await S.list('Fin_Accounts', force)).map(F.acctFromRow).sort((a, b) => a.code.localeCompare(b.code)); },
    async entries(force) { return (await S.list('Fin_Journal', force)).map(F.entryFromRow).sort((a, b) => (b.date + b.no).localeCompare(a.date + a.no)); },
    /* posted lines only (PostId must match a posted / reversed header) */
    async lines(force) {
      const [heads, rows] = await Promise.all([S.list('Fin_Journal', force), S.list('Fin_JournalLines', force)]);
      const ok = new Map(); heads.map(F.entryFromRow).forEach(h => { if ((h.status === 'posted' || h.status === 'reversed') && h.postId) ok.set(h.postId, h); });
      return rows.map(F.lineFromRow).filter(l => ok.has(l.postId)).map(l => Object.assign(l, { entryNo: ok.get(l.postId).no, memo: ok.get(l.postId).memo }));
    },
    async ping() { const url = String(SET.server || '').replace(/\/+$/, ''); const h = await (await fetch(url + '/v1/health')).json(); return h; },
    async copyToServer(onStep) {   /* one-time move of the Fin_* lists from SharePoint to the server */
      const out = [];
      const defs = Object.assign({}, F.LISTS, window.REC ? window.REC.LISTS : {}, window.INV ? window.INV.LISTS : {}, window.BFA ? window.BFA.LISTS : {}, window.HR ? window.HR.LISTS : {}, window.APR ? window.APR.LISTS : {}, window.PUR ? window.PUR.LISTS : {}, window.SAL ? window.SAL.LISTS : {});   /* finance + inventory, manufacturing, budgets & assets, when loaded */
      for (const n of Object.keys(defs).filter(x => !/_Settings$/.test(x))) {
        onStep && onStep(n); let rows; try { rows = await sp.list(n, true); } catch (e) { if (/not found/i.test(e.message)) { out.push(n + ': not set up — skipped'); continue; } throw e; }
        const l = await A().L(n), keep = new Set(l.raw.map(c => c.name));
        let k = 0; for (const r of rows) { const f = {}; (defs[n].map(c => c.name).concat(['Title'])).forEach(c => { const v = r[nz(c)]; if (v != null && keep.has(c)) f[c] = v; }); await call('POST', '/v1/erp/' + n, { fields: f, legacyId: r.id }); k++; }
        out.push(n + ': ' + k + ' row(s) copied');
      }
      return out;
    },
  };
  window.FINSTORE = S;
})();
