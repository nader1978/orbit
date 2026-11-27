/* ============================================================
   ORBIT FINANCE — Bank reconciliation (screen + storage)
   Lists Fin_BankStatements and Fin_BankLines sit next to the ledger (SharePoint, or the ERP server in "server" mode).
   Import a statement (CSV from the bank) → automatic matching with the ledger lines of that bank account → match the rest
   by hand, or post an entry for items only on the bank (charges, interest, direct debits) → reconciliation statement →
   Reconciled (locked).
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, F = window.FIN, R = window.REC, S = window.FINSTORE, FU = window.FIN_UI;
  if (!K || !F || !R || !S || !FU) return;
  const { reg, D, esc, num, today, dmy, str, toast, V, render, cur, H, iso, me } = K;
  const { table, printHtml, n2, money, acctOpts, acctName } = FU;
  const ST = { st: null };
  const errs = (list, t) => list && list.length ? `<div class="mb-hint mb-bad ei-errs"><b>${esc(t || 'Please check')}</b>${list.map(e => `<div>${esc(e)}</div>`).join('')}</div>` : '';
  const clear = v => Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; });
  const hist = (h, text) => JSON.stringify((h || []).concat([{ at: iso(), by: me(), text }]).slice(-40));
  const pill = s => `<span class="mb-pill ei-st" style="--c:${s === 'reconciled' ? '#15803d' : '#b45309'}">${s === 'reconciled' ? 'Reconciled' : 'Open'}</span>`;
  const tick = (on, x, i) => `<button type="button" class="mx-sb${on ? ' p' : ''}" data-x="${x}" data-i="${esc(i)}" style="min-width:34px;padding:4px 8px">${on ? '☑' : '☐'}</button>`;
  const css = document.createElement('style'); css.textContent = `#mob .rec-in{color:#16a34a;font-weight:700}#mob .rec-out{color:#dc2626;font-weight:700}#mob .rec-ok{color:#16a34a;font-weight:800}#mob .rec-bad{color:#dc2626;font-weight:800}`; document.head.appendChild(css);
  const amt = a => `<span class="${a >= 0 ? 'rec-in' : 'rec-out'}">${n2(a)}</span>`;

  async function bundle(force) {
    const finSet = await S.settings(force), out = { finSet }; let missing = false;
    const [accts, lines, stmts, bl] = await Promise.all([S.accounts(force).catch(() => []), S.lines(force).catch(() => []), S.list('Fin_BankStatements', force).then(r => r.map(R.stmtFromRow)).catch(e => { if (/not found/i.test(e.message)) missing = true; return []; }), S.list('Fin_BankLines', force).then(r => r.map(R.lineFromRow)).catch(() => [])]);
    return Object.assign(out, { accts, lines, stmts: stmts.sort((a, b) => b.to.localeCompare(a.to) || b.id - a.id), bl, missing, banks: accts.filter(a => ['bank', 'cash'].includes(a.sub) && !a.group).sort((a, b) => (a.sub === 'bank' ? 0 : 1) - (b.sub === 'bank' ? 0 : 1) || a.code.localeCompare(b.code)) });   /* bank accounts first */
  }
  function load(v, force) { const d = D.x_finrec = D.x_finrec || {}; d.busy = 1; d.err = ''; if (cur() === 'x_finrec') render(); bundle(force).then(b => Object.assign(d, b)).catch(e => { d.err = e.message; }).finally(() => { d.busy = 0; if (cur() === 'x_finrec') render(); }); }
  const refresh = () => load(V(), true);

  reg('x_finrec', {
    load(v, f) { if (!f) ST.st = null; load(v, f); },
    view(v, d) {
      const busy = d.busy ? `<div class="mx-ld"><i></i><i></i><i></i> Loading…</div>` : d.err ? `<div class="mb-hint mb-bad">⚠ ${esc(d.err)}</div>` : '';
      if (d.missing) return H.head('🏦', 'Bank reconciliation', '', '#0f766e') + busy + H.card('', `<div class="mb-hint mb-bad">The bank reconciliation lists are not set up yet.</div>${H.btn(v.busy ? '⏳ ' + esc(v.busy) : '🛠 Set up lists', 'setup')}`);
      const banks = d.banks || [];
      /* ---------- new statement ---------- */
      if (ST.st === 'new') {
        const p = v.text ? R.parseStatement(v.text, v.order || 'dmy') : null, bal = p ? R.balancesOf(p.rows) : null;
        if (p && p.rows.length && !v._auto) { v._auto = 1; const ds = p.rows.map(r => r.date).sort(); v.from = ds[0]; v.to = ds[ds.length - 1]; if (bal) { v.opening = String(bal.opening); v.closing = String(bal.closing); } else { const prev = (d.stmts || []).find(s => s.account === v.acc); v.opening = prev ? String(prev.closing) : ''; v.closing = v.opening ? String(R.r2(num(v.opening) + p.rows.reduce((s, r) => s + r.amount, 0))) : ''; } }
        const prev = (d.stmts || []).filter(s => s.account === v.acc).sort((a, b) => b.to.localeCompare(a.to))[0], tot = p ? R.r2(p.rows.reduce((s, r) => s + r.amount, 0)) : 0, chk = p && v.opening !== '' && v.closing !== '' ? R.r2(num(v.opening) + tot - num(v.closing)) : null;
        return H.head('🏦', 'Import bank statement', 'CSV file from your online banking', '#0f766e') + errs(v.errs)
          + H.card('', H.f('Bank account', H.sel('acc', banks.map(a => [a.code, a.code + ' · ' + a.name]), { ph: false })) + `<div class="mx-acts">${H.sbtn('📂 Choose CSV file', 'file', '', 'p')}${v.file ? `<span class="mb-hint">${esc(v.file)}</span>` : ''}</div>` + H.f('…or paste the statement', H.txt('text', 'Date, Description, Reference, Debit, Credit, Balance')) + H.f('Dates in the file', H.seg('order', [['dmy', 'Day / month / year'], ['mdy', 'Month / day / year']], 'dmy')))
          + (p ? H.card('Read from the file · ' + p.rows.length + ' transaction(s)', `<span class="mb-hint">Columns: ${esc(Object.entries(p.columns).map(([k, c]) => k + ' = "' + c + '"').join(' · ') || '—')}</span>` + errs(p.errors, 'Notes')
              + `<div class="fin-row">${H.f('Statement no.', H.inp('no', { ph: 'e.g. Nov 2026' }))}${H.f('From', H.date('from'))}${H.f('To', H.date('to'))}</div><div class="fin-row">${H.f('Opening balance', H.num('opening', { r: 1 }))}${H.f('Closing balance', H.num('closing', { r: 1 }))}</div>`
              + (prev && v.opening !== '' && Math.abs(num(v.opening) - prev.closing) > 0.004 ? `<div class="mb-hint mb-bad">The previous statement (${esc(prev.no)}) closed at ${n2(prev.closing)} — this one opens at ${n2(num(v.opening))}.</div>` : '')
              + (chk != null ? `<div class="ei-kv"><span>Opening + transactions − closing</span><b class="${Math.abs(chk) < 0.005 ? 'rec-ok' : 'rec-bad'}">${Math.abs(chk) < 0.005 ? '✓ 0.00' : n2(chk)}</b></div>` : '')
              + table([{ k: 'date', t: 'Date' }, { k: 'desc', t: 'Description' }, { k: 'ref', t: 'Reference' }, { k: 'a', t: 'Amount', raw: 1 }], p.rows.slice(0, 200).map(r => ({ date: dmy(r.date), desc: r.desc, ref: r.ref, a: amt(r.amount) })))) : '')
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn(v.busy ? '⏳ ' + esc(v.busy) : '💾 Save statement', 'save')}</div>`);
      }
      /* ---------- one statement ---------- */
      if (ST.st) {
        const st = (d.stmts || []).find(x => x.id === ST.st); if (!st) return busy;
        const sl = (d.bl || []).filter(b => b.stmt === String(st.id)).sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq), clr = R.cleared(d.bl, d.stmts), locked = st.status === 'reconciled';
        const led = (d.lines || []).filter(l => l.account === st.account), L = new Map(led.map(l => [String(l.id), l]));
        const unc = led.filter(l => !clr.has(String(l.id)) && l.date <= (v.upto || st.to)).sort((a, b) => a.date.localeCompare(b.date));
        const s = R.summary(st, sl, d.bl, d.lines, d.stmts), sb = v.sb || {}, sl2 = v.sl || {};
        const tab = v.tab || 'bank';
        const ce = v.ce ? sl.find(b => String(b.id) === String(v.ce)) : null;
        return H.head('🏦', esc(st.no) + ' · ' + esc(acctName(d.accts, st.account)), dmy(st.from) + ' – ' + dmy(st.to) + ' · ' + sl.length + ' bank line(s)', '#0f766e') + busy + errs(v.errs)
          + H.kpis([['Bank closing balance', n2(st.closing)], ['Ledger balance on ' + dmy(st.to), n2(s.ledger)], ['Matched', s.matched + ' / ' + sl.length, s.open ? 'o' : 'g'], ['Difference', n2(s.diff), Math.abs(s.diff) < 0.005 ? 'g' : 'r'], ['Status', st.status === 'reconciled' ? 'Reconciled' : 'Open', locked ? 'g' : 'o']])
          + (s.statementOk ? '' : `<div class="mb-hint mb-bad">The statement does not add up: opening ${n2(st.opening)} + lines = ${n2(s.lineTotal)}, but the closing balance is ${n2(st.closing)}.</div>`)
          + H.tabs('tab', [['bank', 'Bank lines', s.open + ' open'], ['led', 'Ledger items not on the bank', unc.length], ['rep', 'Reconciliation statement']], 'bank')
          + (ce ? H.card('Post an entry for this bank line', `<div class="ei-kv"><span>${dmy(ce.date)} · ${esc(ce.desc)}</span><b>${amt(ce.amount)}</b></div><div class="fin-row">${H.f(ce.amount < 0 ? 'Charge to account' : 'Income / credit account', H.sel('ceAcc', acctOpts(d.accts, a => a.code !== st.account), { ph: false }))}${H.f('Description', H.inp('ceDesc'))}</div><div class="mx-acts">${H.sbtn('✓ Post & match', 'postCe', '', 'p')}${H.sbtn('Cancel', 'ceX')}</div>`) : '')
          + (tab === 'bank' ? H.card('Bank statement lines', table([{ k: 't', t: '', raw: 1 }, { k: 'date', t: 'Date' }, { k: 'desc', t: 'Description' }, { k: 'ref', t: 'Ref' }, { k: 'a', t: 'Amount', raw: 1 }, { k: 'm', t: 'Matched to', raw: 1 }],
              sl.map(b => ({ t: b.matched.length || locked ? (b.matched.length ? '✓' : '') : tick(sb[b.id], 'tb', b.id), date: dmy(b.date), desc: b.desc, ref: b.ref, a: amt(b.amount),
                m: b.matched.length ? esc(b.matched.map(id => (L.get(id) || {}).entryNo || id).join(', ')) + (locked ? '' : ` <button type="button" class="mx-sb" data-x="unm" data-i="${b.id}">Unmatch</button>`) : (locked ? '' : `<button type="button" class="mx-sb" data-x="ce" data-i="${b.id}">＋ Entry</button>`) }))))
            : tab === 'led' ? H.card('Ledger lines on ' + esc(acctName(d.accts, st.account)) + ' not matched yet', `<div class="fin-row">${H.f('Show up to', H.date('upto', { val: v.upto || st.to }))}</div>` + table([{ k: 't', t: '', raw: 1 }, { k: 'date', t: 'Date' }, { k: 'no', t: 'Entry' }, { k: 'desc', t: 'Description' }, { k: 'a', t: 'Amount', raw: 1 }],
              unc.map(l => ({ t: locked ? '' : tick(sl2[l.id], 'tl', l.id), date: dmy(l.date), no: l.entryNo, desc: [l.description, l.partyName, l.docRef].filter(Boolean).join(' · '), a: amt(R.ledAmt(l)) })))
              + (!locked && unc.some(l => l.date < st.from) ? `<span class="mb-hint">Items dated before ${dmy(st.from)} that were cleared before you started reconciling (opening balances) can be marked as cleared.</span>${H.sbtn('Mark items before ' + dmy(st.from) + ' as cleared', 'pre')}` : ''))
            : H.card('Reconciliation statement on ' + dmy(st.to), recTable(st, s, d)))
          + H.bar(`<div class="mb-row">${H.btn('← Statements', 'back0', 's')}${H.btn('🖨 Print', 'print', 's')}${locked ? H.btn('↺ Reopen', 'reopen', 's') : H.btn('⚡ Auto-match', 'auto', 's') + H.btn('🔗 Match ticked', 'match', 's') + H.btn('✓ Reconciled', 'finish')}</div>`);
      }
      /* ---------- list ---------- */
      const acc = v.acc0 || '', rows = (d.stmts || []).filter(s => !acc || s.account === acc);
      return H.head('🏦', 'Bank reconciliation', 'Import the bank statement, match it with the ledger, explain the difference', '#0f766e') + busy
        + H.card('', H.f('Bank account', H.sel('acc0', banks.map(a => [a.code, a.code + ' · ' + a.name]), { ph: 'All accounts' })) + table([{ k: 'no', t: 'Statement' }, { k: 'a', t: 'Account' }, { k: 'p', t: 'Period' }, { k: 'closing', t: 'Closing', n: 1 }, { k: 'st', t: '', raw: 1 }], rows.map(s => ({ no: s.no, a: acctName(d.accts, s.account), p: dmy(s.from) + ' – ' + dmy(s.to), closing: s.closing, st: pill(s.status), _tap: s.id })), null, 'open'))
        + H.bar(H.btn('＋ Import statement', 'add'));
    },
    act: {
      async setup(t, v) { if (v.busy) return; v.busy = 'Starting…'; render(); try { await FU.setupLists(Object.assign({}, F.LISTS, R.LISTS), n => { v.busy = n; render(); }); K.drop('Fin_BankStatements', 'Fin_BankLines'); toast('✅ Lists are ready', 'success'); } catch (e) { toast(e.message, 'error'); } v.busy = ''; refresh(); },
      add(t, v, d) { ST.st = 'new'; clear(v); v.acc = (d.banks[0] || {}).code || ''; v.order = 'dmy'; render(); }, cancel(t, v) { ST.st = null; clear(v); render(); }, back0(t, v) { ST.st = null; clear(v); render(); },
      open(t, v) { ST.st = +t.dataset.i; clear(v); render(); },
      file(t, v) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.txt,text/csv'; inp.onchange = async () => { const f = inp.files[0]; if (!f) return; v.text = await f.text(); v.file = f.name; v._auto = 0; render(); }; inp.click(); },
      async save(t, v, d) { if (v.busy) return; const p = R.parseStatement(v.text || '', v.order), E = [];
        if (!v.acc) E.push('Choose the bank account'); if (!p.rows.length) E.push('No transactions read from the file'); if (!v.from || !v.to) E.push('From and To dates are required'); if (v.opening === '' || v.closing === '') E.push('Opening and closing balances are required');
        if ((d.stmts || []).some(s => s.account === v.acc && s.from <= v.to && s.to >= v.from)) E.push('Another statement of this account covers these dates');
        if (E.length) { v.errs = E; render(); return; } v.busy = 'Saving…'; v.errs = null; render();
        try { const no = str(v.no) || (v.from.slice(0, 7) + ' ' + v.acc), h = await S.add('Fin_BankStatements', { Title: no, Account: v.acc, StatementNo: no, FromDate: v.from, ToDate: v.to, Status: 'open', FileName: v.file || '', OpeningBal: num(v.opening), ClosingBal: num(v.closing), History: hist([], 'Imported · ' + p.rows.length + ' line(s)') });
          let k = 0; for (const r of p.rows) { await S.add('Fin_BankLines', { Title: no, StatementId: String(h.id), Account: v.acc, LineDate: r.date, Description: r.desc, Ref: r.ref, Status: 'open', Amount: r.amount, Balance: r.balance == null ? '' : r.balance, Seq: r.seq, Matched: '[]' }); if (++k % 10 === 0) { v.busy = k + ' / ' + p.rows.length; render(); } }
          S.drop('Fin_BankStatements', 'Fin_BankLines'); ST.st = h.id; clear(v); toast('🏦 ' + p.rows.length + ' bank line(s) imported — press Auto-match', 'success'); refresh(); } catch (e) { v.busy = ''; v.errs = [e.message]; render(); } },
      tb(t, v) { v.sb = v.sb || {}; v.sb[t.dataset.i] = !v.sb[t.dataset.i]; render(); }, tl(t, v) { v.sl = v.sl || {}; v.sl[t.dataset.i] = !v.sl[t.dataset.i]; render(); },
      async auto(t, v, d) { const st = d.stmts.find(x => x.id === ST.st), clr = R.cleared(d.bl, d.stmts), bank = d.bl.filter(b => b.stmt === String(st.id) && !b.matched.length), led = d.lines.filter(l => l.account === st.account && !clr.has(String(l.id)));
        const m = R.autoMatch(bank, led, 5); if (!m.length) return toast('No automatic matches — tick a bank line and ledger line(s) to match by hand', 'info');
        try { for (const x of m) await S.upd('Fin_BankLines', x.bank, { Matched: JSON.stringify(x.ledger), Status: 'matched' }); S.drop('Fin_BankLines'); toast('⚡ ' + m.length + ' line(s) matched', 'success'); refresh(); } catch (e) { toast(e.message, 'error'); } },
      async match(t, v, d) { const bs = d.bl.filter(b => (v.sb || {})[b.id]), ls = d.lines.filter(l => (v.sl || {})[l.id]), c = R.checkMatch(bs, ls); if (!c.ok) { v.errs = c.errors; render(); return; }
        try { if (bs.length === 1) await S.upd('Fin_BankLines', bs[0].id, { Matched: JSON.stringify(ls.map(l => String(l.id))), Status: 'matched' }); else for (const b of bs) await S.upd('Fin_BankLines', b.id, { Matched: JSON.stringify([String(ls[0].id)]), Status: 'matched' });
          S.drop('Fin_BankLines'); v.sb = {}; v.sl = {}; v.errs = null; toast('🔗 Matched', 'success'); refresh(); } catch (e) { toast(e.message, 'error'); } },
      async unm(t, v) { try { await S.upd('Fin_BankLines', +t.dataset.i, { Matched: '[]', Status: 'open' }); S.drop('Fin_BankLines'); refresh(); } catch (e) { toast(e.message, 'error'); } },
      ce(t, v, d) { const b = d.bl.find(x => x.id === +t.dataset.i); v.ce = b.id; v.ceDesc = b.desc; v.ceAcc = b.amount < 0 ? ((d.accts.find(a => a.code === '6800') || d.accts.find(a => a.type === 'expense' && !a.group) || {}).code) : ((d.accts.find(a => a.type === 'income' && !a.group) || {}).code); render(); },
      ceX(t, v) { v.ce = null; render(); },
      async postCe(t, v, d) { const st = d.stmts.find(x => x.id === ST.st), b = d.bl.find(x => x.id === v.ce), a = Math.abs(b.amount), desc = str(v.ceDesc) || b.desc;
        const e = { date: b.date, memo: 'Bank: ' + desc, source: 'bank', ref: 'BANK:' + b.id, lines: b.amount < 0 ? [{ account: v.ceAcc, debit: a, credit: 0, description: desc }, { account: st.account, debit: 0, credit: a, description: desc }] : [{ account: st.account, debit: a, credit: 0, description: desc }, { account: v.ceAcc, debit: 0, credit: a, description: desc }] };
        const c = F.checkEntry(e, d.accts, d.finSet); if (!c.ok) { v.errs = c.errors; render(); return; }
        try { const r = await S.post(Object.assign(e, { lines: c.lines })), ln = (await S.lines(true)).find(l => l.entryNo === r.no && l.account === st.account);
          await S.upd('Fin_BankLines', b.id, { Matched: JSON.stringify(ln ? [String(ln.id)] : []), Status: ln ? 'matched' : 'open', JournalNo: r.no }); S.drop('Fin_BankLines'); v.ce = null; toast('✓ ' + r.no + ' posted and matched', 'success'); refresh(); } catch (er) { toast(er.message, 'error'); } },
      async pre(t, v, d) { const st = d.stmts.find(x => x.id === ST.st), clr = R.cleared(d.bl, d.stmts), ids = d.lines.filter(l => l.account === st.account && l.date < st.from && !clr.has(String(l.id))).map(l => String(l.id));
        if (!confirm(ids.length + ' ledger line(s) dated before ' + dmy(st.from) + ' will be treated as already cleared by the bank. Continue?')) return;
        try { await S.upd('Fin_BankStatements', st.id, { Cleared: JSON.stringify(st.cleared.concat(ids)), History: hist(st.history, ids.length + ' earlier item(s) marked cleared') }); S.drop('Fin_BankStatements'); refresh(); } catch (e) { toast(e.message, 'error'); } },
      async finish(t, v, d) { const st = d.stmts.find(x => x.id === ST.st), s = R.summary(st, d.bl.filter(b => b.stmt === String(st.id)), d.bl, d.lines, d.stmts);
        if (s.open) { v.errs = [s.open + ' bank line(s) are not matched — match them or post an entry (＋ Entry)']; render(); return; } if (Math.abs(s.diff) >= 0.005) { v.errs = ['The reconciliation has a difference of ' + n2(s.diff)]; render(); return; }
        try { await S.upd('Fin_BankStatements', st.id, { Status: 'reconciled', ReconciledBy: me(), ReconciledAt: iso(), History: hist(st.history, 'Reconciled') }); S.drop('Fin_BankStatements'); toast('✓ Statement reconciled', 'success'); v.errs = null; refresh(); } catch (e) { toast(e.message, 'error'); } },
      async reopen(t, v, d) { const st = d.stmts.find(x => x.id === ST.st); if (!confirm('Reopen ' + st.no + '?')) return; try { await S.upd('Fin_BankStatements', st.id, { Status: 'open', History: hist(st.history, 'Reopened') }); S.drop('Fin_BankStatements'); refresh(); } catch (e) { toast(e.message, 'error'); } },
      print(t, v, d) { const st = d.stmts.find(x => x.id === ST.st), s = R.summary(st, d.bl.filter(b => b.stmt === String(st.id)), d.bl, d.lines, d.stmts); printHtml('Bank reconciliation ' + st.no, '<h3>' + esc(acctName(d.accts, st.account)) + ' · ' + dmy(st.from) + ' – ' + dmy(st.to) + '</h3>' + recTable(st, s, d)); },
    },
  });
  function recTable(st, s, d) {
    const row = (t, a, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${t}</td><td class="n">${a === '' ? '' : n2(a)}</td></tr>`, items = (list, f) => list.map(f).join('');
    return `<div class="fin-tw"><table class="fin-t"><tbody>${row('<b>Balance per bank statement</b>', st.closing, 'sub')}
      ${row('Add: deposits in transit (in the ledger, not yet on the bank)', s.transitTotal)}${items(s.transit, l => row('&nbsp;&nbsp;' + dmy(l.date) + ' · ' + esc(l.entryNo) + ' · ' + esc(l.description), R.ledAmt(l)))}
      ${row('Less: unpresented payments (in the ledger, not yet on the bank)', s.unpresTotal)}${items(s.unpresented, l => row('&nbsp;&nbsp;' + dmy(l.date) + ' · ' + esc(l.entryNo) + ' · ' + esc(l.description), R.ledAmt(l)))}
      ${row('<b>Adjusted bank balance</b>', s.adjBank, 'tot')}
      ${row('<b>Balance per ledger</b>', s.ledger, 'sub')}${row('Items on the bank not yet in the ledger', s.unrecTotal)}${items(s.unrecorded, b => row('&nbsp;&nbsp;' + dmy(b.date) + ' · ' + esc(b.desc), b.amount))}
      ${row('<b>Adjusted ledger balance</b>', s.adjLedger, 'tot')}${row('<b>Difference</b>', s.diff, 'tot')}</tbody></table></div>`
      + `<div class="mb-hint">${s.done ? '<span class="rec-ok">✓ Reconciled — the adjusted balances agree and every bank line is matched.</span>' : s.open ? s.open + ' bank line(s) still to match or post.' : 'The adjusted balances do not agree yet.'}</div>`;
  }
  window.REC_UI = { version: '1' };
})();
