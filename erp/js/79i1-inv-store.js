/* ============================================================
   ORBIT INVENTORY — data layer
   Stored next to the ledger: SharePoint lists Inv_* by default, or the ERP server database when Finance Settings → Data
   says "server" (same rule as the finance lists; Inv_Settings always stays in SharePoint).
   Posting a stock document (SharePoint, no transactions):
     1 the document header is saved as a draft   2 its journal entry is posted (ref INV:<doc id> — found again on a retry, never doubled)
     3 the stock moves are written with a fresh PostId   4 the header is marked posted with that PostId last.
   Stock reports only count moves whose PostId matches a posted document, so a half-saved posting never shows.
   On the ERP server the same posting happens in one database transaction (/v1/erp/inv/post).
   ORBIT link: reads ORBIT's own item and movement lists (never changes them, except the optional write-back).
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, F = window.FIN, I = window.INV, S = window.FINSTORE; if (!K || !F || !I || !S) return;
  const { A, get, drop, iso, me, today, str } = K;
  const uuid = () => (window.EINV && EINV.uuid) ? EINV.uuid() : String(Date.now()) + Math.random().toString(16).slice(2);
  let SET = I.settingsFromRow(null);
  const PREFIX = { receipt: 'rcv', issue: 'iss', transfer: 'trf', count: 'cnt' }, FIXED = { sale: 'COS', sale_return: 'SRN', orbit: 'SYNC', opening: 'OPEN' };

  async function settings(force) {
    let rows; try { rows = await get('Inv_Settings', null, force); } catch (e) { if (!/not found/i.test(e.message)) throw e; rows = []; }
    SET = I.settingsFromRow(rows[0]); SET.row = rows[0] || null; return SET;
  }
  async function saveSettings(fields) { const row = SET.row || (await settings(true)).row; if (row) await A().upd('Inv_Settings', row.id, fields); else await A().add('Inv_Settings', Object.assign({ Title: 'Inventory' }, fields)); drop('Inv_Settings'); return settings(true); }

  const items = async f => (await S.list('Inv_Items', f)).map(I.itemFromRow).sort((a, b) => a.code.localeCompare(b.code));
  const whs = async f => (await S.list('Inv_Warehouses', f)).map(I.whFromRow).sort((a, b) => a.code.localeCompare(b.code));
  const docs = async f => (await S.list('Inv_Docs', f)).map(I.docFromRow).sort((a, b) => (b.date + String(b.id).padStart(9, '0')).localeCompare(a.date + String(a.id).padStart(9, '0')));
  const boms = async f => (await S.list('Inv_BOM', f)).map(I.bomFromRow);
  const mos = async f => (await S.list('Inv_ProdOrders', f)).map(I.moFromRow).sort((a, b) => b.id - a.id);
  /* posted moves only */
  async function moves(force) {
    const [d, rows] = await Promise.all([S.list('Inv_Docs', force), S.list('Inv_Moves', force)]);
    const ok = new Set(d.map(I.docFromRow).filter(x => x.status === 'posted' && x.postId).map(x => x.postId));
    return rows.map(I.moveFromRow).filter(m => ok.has(m.postId));
  }
  const number = (type, no) => no || S.next('stk-' + type, FIXED[type] || SET[PREFIX[type]] || 'STK');
  const hist = (h, text) => JSON.stringify((h || []).concat([{ at: iso(), by: me(), text }]).slice(-40));

  /* post a stock document. ctx = { items, accts, finSet, map } (from the screen bundle); extra = production output figures */
  async function post(doc, ctx, extra) {
    await settings(true);
    const its = ctx.items || await items(true), mv = await moves(true), r = I.buildMoves(doc, its, I.position(mv), SET);
    if (!r.ok) throw new Error(r.errors.join(' · '));
    if (ctx.finSet && ctx.finSet.lock && doc.date <= ctx.finSet.lock) throw new Error('The period is locked up to ' + ctx.finSet.lock + ' — choose a later date');
    const no = await number(doc.type, doc.no), head = { Title: no, DocNo: no, DocType: doc.type, DocDate: doc.date, Ref: doc.ref || '', Party: doc.party || '', Memo: doc.memo || '', SrcRef: doc.srcRef || '', Account: doc.account || '', Value: r.value, LinesJson: JSON.stringify(doc.lines) };
    const d0 = Object.assign({}, doc, { no });
    let entry = null;
    if (S.be('Inv_Docs') === 'server') {
      entry = I.journalFor(Object.assign(d0, { key: 'new' }), r.moves, its, ctx.map, extra);
      if (entry) { const chk = F.checkEntry(entry, ctx.accts, ctx.finSet); if (!chk.ok) throw new Error(chk.errors.join(' · ')); entry.lines = chk.lines; }
      const out = await S.call('POST', '/v1/erp/inv/post', { docId: doc.id || null, fields: Object.assign({ History: hist(doc.history, 'Posted') }, head), moves: r.moves.map(m => I.moveToFields(m, { id: 0, no, date: doc.date, type: doc.type, ref: doc.ref }, '')), entry, prefix: S.set.jv, by: me() });
      S.drop('Inv_Docs', 'Inv_Moves', 'Fin_Journal', 'Fin_JournalLines');
      const res = { id: out.id, no, journal: out.journal || '', value: r.value, moves: r.moves };
      res.mirror = await mirror(Object.assign(d0, { id: out.id }), r.moves, its); return res;
    }
    let id = doc.id;
    if (!id) id = (await S.add('Inv_Docs', Object.assign({ Status: 'draft', History: hist([], 'Created') }, head))).id; else await S.upd('Inv_Docs', id, head);
    entry = I.journalFor(Object.assign(d0, { id, key: id }), r.moves, its, ctx.map, extra);
    let jno = '';
    if (entry) {
      const chk = F.checkEntry(entry, ctx.accts, ctx.finSet); if (!chk.ok) throw new Error(chk.errors.join(' · '));
      const done = (await S.entries(true)).find(e => e.ref === entry.ref && e.status !== 'draft');   /* retry after a half-finished posting */
      jno = done ? done.no : (await S.post(Object.assign(entry, { lines: chk.lines }))).no;
    }
    const postId = uuid(), dd = { id, no, date: doc.date, type: doc.type, ref: doc.ref };
    for (const m of r.moves) await A().add('Inv_Moves', I.moveToFields(m, dd, postId));
    await S.upd('Inv_Docs', id, { Status: 'posted', PostId: postId, JournalNo: jno, PostedBy: me(), PostedAt: iso(), History: hist(doc.history, 'Posted' + (jno ? ' · ' + jno : '')) });
    S.drop('Inv_Docs', 'Inv_Moves');
    const res = { id, no, journal: jno, value: r.value, moves: r.moves };
    res.mirror = await mirror(Object.assign(d0, { id }), r.moves, its); return res;
  }

  /* ---------- optional write-back: ERP stock postings also appear in ORBIT's own lists (Record_ID / Ref_Nr "ERP-…", skipped by the sync) ---------- */
  async function mirror(doc, mv, its) {
    if (!SET.mirror || ['transfer', 'orbit', 'opening'].includes(doc.type)) return null;   /* opening and sync came from ORBIT: never written back */
    const IT = new Map(its.map(i => [i.code, i])), fg = new Map(), out = { ok: 0, err: '' }, ref = 'ERP-' + doc.no, label = I.DOC_TYPES[doc.type] || doc.type;
    try {
      for (const m of mv) {
        const it = IT.get(m.code); if (!it || !/^orbit-/.test(it.source)) continue; const q = Math.abs(m.qty), inn = m.qty > 0;
        if (it.source === 'orbit-fg') {
          await K.put('Main_Inventory_Movements_tbl', { Title: it.code, Item_Code: it.code, Item_Desc: it.name, Entrd_QTY: q, Qty_UOM: 1, UOM: it.uom, ItemRcv_Qty: inn ? q : 0, ItemReleased_Qty: inn ? 0 : q, ItemChng_Qty: m.qty, Trans_Type: inn ? 2 : 1, Trans_Type_Indc: (inn ? 'Receive Stocks (+)' : 'Release Stocks (-)') + ' · ERP ' + label, Record_ID: ref, Trans_Date: doc.date, Trans_TimeStamp: iso(), WHS_ID: m.wh, User_Name: me(), ItemID: it.srcId });
          fg.set(it.srcId, (fg.get(it.srcId) || { b: 0, r: 0, s: 0 })); const a = fg.get(it.srcId); a.b += m.qty; a.r += inn ? q : 0; a.s += inn ? 0 : q;
        } else {
          await K.put('RMPM_Movements_tbl', { Title: ref, Trans_Date: doc.date, Trans_Type: 'ERP ' + label, Item_Code: it.code, Item_Name: it.name, Category: it.category, Qty_In: inn ? q : 0, Qty_Out: inn ? 0 : q, Quantity_in: inn ? q : 0, Quantity_out: inn ? 0 : q, UoM: it.uom, Location: m.wh, Location_Bin: m.wh, Prod_Order: /^prod_/.test(doc.type) ? doc.no : '', Ref_Nr: ref, Reason: doc.memo || label, Reason_remarks: doc.memo || label, User_Name: me(), Action_TimeStamp: iso() });
        }
        out.ok++;
      }
      if (fg.size) { const rows = await get('Inventory_Item_List', null, true); for (const [sid, a] of fg) { const r = rows.find(x => String(x.id) === sid); if (r) await K.patch('Inventory_Item_List', r.id, { Bal_Qty: I.num(r.balqty) + a.b, Total_Rcvd_Qty: I.num(r.totalrcvdqty) + a.r, Total_Rlsd_Qty: I.num(r.totalrlsdqty) + a.s }); } drop('Inventory_Item_List', 'Main_Inventory_Movements_tbl'); }
      drop('RMPM_Movements_tbl');
    } catch (e) { out.err = e.message; }
    return out;
  }

  /* ---------- ORBIT link ---------- */
  const tryGet = async (n, f) => { try { return await get(n, null, f); } catch (e) { if (/not found|404/i.test(e.message)) return null; throw e; } };
  async function linkItems(onStep) {
    const have = new Set((await items(true)).map(i => i.code.toLowerCase())), out = { added: 0, fg: 0, rm: 0, missing: [] };
    for (const [list, map, k] of [[I.ORBIT.FG_ITEMS, I.ORBIT.fgItem, 'fg'], [I.ORBIT.RM_ITEMS, I.ORBIT.rmItem, 'rm']]) {
      onStep && onStep(list); const rows = await tryGet(list, true); if (!rows) { out.missing.push(list); continue; }
      out[k] = rows.length;
      for (const r of rows) { const it = map(r); if (!it.code || have.has(it.code.toLowerCase())) continue; await S.add('Inv_Items', I.itemToFields(it)); have.add(it.code.toLowerCase()); out.added++; if (out.added % 10 === 0) onStep && onStep(list + ' · ' + out.added); }
    }
    S.drop('Inv_Items'); return out;
  }
  async function ensureWarehouses() {
    await settings(true); const have = new Set((await whs(true)).map(w => w.code)), want = [[SET.wh, 'Main store'], [SET.fgWh, 'Finished goods store'], [SET.rmWh, 'Raw & packaging store']]; let n = 0;
    for (const [c, name] of want) if (c && !have.has(c)) { await S.add('Inv_Warehouses', { Title: name, Code: c, WhKind: 'store', Active: '1' }); have.add(c); n++; }
    S.drop('Inv_Warehouses'); return n;
  }
  /* opening stock from ORBIT's balances, valued at each item's standard cost; later ORBIT movements (after the mark) come in by Sync */
  async function openingFromOrbit(ctx, date) {
    await settings(true); if (SET.mark) throw new Error('Opening stock from ORBIT was already taken on ' + String(SET.mark.at || '').slice(0, 10));
    const [fgI, fgM, rmM] = await Promise.all([tryGet(I.ORBIT.FG_ITEMS, true), tryGet(I.ORBIT.FG_MOVES, true), tryGet(I.ORBIT.RM_MOVES, true)]);
    const its = await items(true), known = new Map(its.map(i => [i.code, i])), qty = I.ORBIT.openingQty(fgI || [], rmM || []), lines = [], skip = { unknown: 0, negative: 0, noCost: 0 };
    qty.forEach((q, code) => { const it = known.get(code); if (!it) { skip.unknown++; return; } if (q < 0) { skip.negative++; return; } if (!q) return; if (!it.std) skip.noCost++; lines.push({ code, wh: it.kind === 'raw' ? SET.rmWh : SET.fgWh, qty: q, unit_cost: it.std }); });
    const mark = { fg: I.ORBIT.maxId(fgM), rm: I.ORBIT.maxId(rmM), at: iso() };
    let res = null; if (lines.length) res = await post({ type: 'opening', date, ref: 'ORBIT balances', memo: 'Opening stock from ORBIT', lines }, Object.assign({}, ctx, { items: its }));
    await saveSettings({ SyncMark: JSON.stringify(mark), SyncLog: JSON.stringify((SET.log || []).concat([{ at: iso(), by: me(), text: 'Opening stock: ' + lines.length + ' item(s)' + (res ? ' · ' + res.no : '') }]).slice(-30)) });
    return { lines: lines.length, skip, doc: res };
  }
  async function pendingOrbit() {
    await settings(true); if (!SET.mark) return { lines: [], skipped: { unknown: 0 }, noMark: true };
    const [fgM, rmM, its, mv] = await Promise.all([tryGet(I.ORBIT.FG_MOVES, true), tryGet(I.ORBIT.RM_MOVES, true), items(true), moves(true)]);
    const imported = new Set(mv.filter(m => m.srcList).map(m => m.srcList + '|' + m.srcId));
    return Object.assign(I.ORBIT.pending(fgM || [], rmM || [], SET.mark, imported, its, SET), { items: its });
  }
  /* one stock document per day of ORBIT movements (dates before the lock date are posted on the day after it) */
  async function syncOrbit(ctx, onStep) {
    const p = await pendingOrbit(); if (p.noMark) throw new Error('Take the opening stock from ORBIT first (Inventory Settings → ORBIT link).');
    const lock = ctx.finSet && ctx.finSet.lock, after = lock ? new Date(new Date(lock + 'T00:00:00Z').getTime() + 864e5).toISOString().slice(0, 10) : '';
    const by = new Map(); p.lines.forEach(l => { let d = l.date || today(); if (after && d < after) d = after; (by.get(d) || by.set(d, []).get(d)).push(l); });
    const done = [];
    for (const [date, lines] of [...by.entries()].sort()) { onStep && onStep(date + ' · ' + lines.length); const r = await post({ type: 'orbit', date, ref: 'ORBIT', memo: 'ORBIT stock movements of ' + date, lines }, Object.assign({}, ctx, { items: p.items })); done.push(r.no + ' (' + lines.length + ')'); }
    if (done.length || p.skipped.unknown) await saveSettings({ SyncLog: JSON.stringify((SET.log || []).concat([{ at: iso(), by: me(), text: 'Sync: ' + p.lines.length + ' movement(s) → ' + (done.join(', ') || 'nothing') + (p.skipped.unknown ? ' · ' + p.skipped.unknown + ' skipped (item not linked)' : '') }]).slice(-30)) });
    return { docs: done, count: p.lines.length, skipped: p.skipped };
  }

  window.INVSTORE = { get set() { return SET; }, settings, saveSettings, items, whs, docs, boms, mos, moves, post, number, mirror, linkItems, ensureWarehouses, openingFromOrbit, pendingOrbit, syncOrbit, hist };
})();
