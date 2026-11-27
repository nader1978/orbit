/* ============================================================
   ORBIT FINANCE — accounting core screens (ORBIT mobile suite API · same screens on the phone and in the web app pages)
   Finance home · Journal entries · Chart of accounts · Suppliers · Purchase bills · Receipts & payments · Reports · Finance settings
   Sales come from E-Invoicing: every invoice the ASP accepts is posted to the ledger (AR / sales / output VAT) by "Post e-invoices".
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, F = window.FIN, S = window.FINSTORE, E = window.EINV; if (!K || !F || !S || !E) return;
  const { A, reg, D, get, drop, H, esc, num, today, addD, dmy, str, iso, me, toast, V, render, cur } = K;
  const ST = { je: null, bill: null, pay: null, acct: null, gl: null };
  const n2 = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (n, c) => (c || 'AED') + ' ' + n2(n);
  const go = k => A().go(k);
  const errs = (list, t) => list && list.length ? `<div class="mb-hint mb-bad ei-errs"><b>${esc(t || 'Please check')}</b>${list.map(e => `<div>${esc(e.message || e)}</div>`).join('')}</div>` : '';
  const COL = { draft: '#64748b', posted: '#15803d', reversed: '#b45309', cancelled: '#dc2626' };
  const pill = s => `<span class="mb-pill ei-st" style="--c:${COL[s] || '#64748b'}">${esc(s.charAt(0).toUpperCase() + s.slice(1))}</span>`;
  const setTitle = t => setTimeout(() => { const el = document.querySelector('#mbTitle'); if (el) el.textContent = t; }, 0);

  const css = document.createElement('style'); css.textContent = `
#mob .fin-t{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}#mob .fin-tw{overflow-x:auto;margin:0 -4px}
#mob .fin-t th{text-align:left;font-size:11.5px;color:var(--mut);font-weight:700;padding:7px 6px;border-bottom:1px solid var(--line);white-space:nowrap}
#mob .fin-t td{padding:7px 6px;border-bottom:1px solid var(--line);color:var(--tx);vertical-align:top}#mob .fin-t td.n,#mob .fin-t th.n{text-align:right;white-space:nowrap}
#mob .fin-t tr.tot td{font-weight:800;color:var(--hd);border-top:2px solid var(--line);border-bottom:0}#mob .fin-t tr.sub td{font-weight:700;color:var(--hd);background:var(--seg)}
#mob .fin-t tr.tap{cursor:pointer}#mob .fin-t tr.tap:hover td{background:var(--soft)}#mob .fin-t .neg{color:#dc2626}
#mob .fin-jl{display:grid;grid-template-columns:minmax(0,2.2fr) minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) 34px;gap:6px;align-items:center;margin-bottom:6px}
#mob .fin-jl select,#mob .fin-jl input{padding:10px 10px!important;font-size:14px!important;min-height:0!important;height:auto!important;width:100%;background:var(--inp)!important;color:var(--tx)!important;border:1.5px solid var(--inpb)!important;border-radius:12px!important;box-sizing:border-box}#mob .fin-jl select option{color:#0f172a}
#mob .fin-jh{display:grid;grid-template-columns:minmax(0,2.2fr) minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) 34px;gap:6px;font-size:11.5px;color:var(--mut);font-weight:700;margin:0 0 4px}
@media (max-width:560px){#mob .fin-jh{display:none}#mob .fin-jl{grid-template-columns:1fr 1fr 40px;padding:10px;border:1px solid var(--cardb);border-radius:14px;margin-bottom:10px}#mob .fin-jl .w2{grid-column:span 3}}
#mob .fin-diff{display:flex;justify-content:space-between;padding:8px 2px;font-weight:700}#mob .fin-diff.bad{color:#dc2626}#mob .fin-diff.ok{color:#16a34a}
#mob .fin-row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}#mob .fin-row .mb-f{flex:1;min-width:140px}
`; document.head.appendChild(css);

  /* ---------- data bundle (accounts, entries, lines, parties, documents) ---------- */
  async function bundle(force, want) {
    const w = want || {}, set = await S.settings(force), out = { set };
    const jobs = [];
    const add = (k, p) => jobs.push(p.then(v => { out[k] = v; }));
    add('accts', S.accounts(force).catch(e => { if (/not found/i.test(e.message)) out.missing = true; return []; }));
    if (w.entries || w.lines) add('entries', S.entries(force).catch(() => []));
    if (w.lines) add('lines', S.lines(force).catch(() => []));
    if (w.parties) { add('sups', S.list('Fin_Suppliers', force).catch(() => [])); add('cust', get('EInv_Customers', null, force).catch(() => [])); }
    if (w.bills) add('bills', S.list('Fin_Bills', force).then(r => r.map(billFromRow)).catch(() => []));
    if (w.bills && window.INVSTORE) { add('items', INVSTORE.items(force).catch(() => [])); add('invSet', INVSTORE.settings(force).catch(() => null)); add('whs', INVSTORE.whs(force).catch(() => [])); }   /* stock items on bill lines */
    if (w.pays) add('pays', S.list('Fin_Payments', force).then(r => r.map(payFromRow)).catch(() => []));
    if (w.docs) add('docs', get('EInv_Documents', null, force).then(r => r.map(E.docFromRow)).catch(() => []));
    await Promise.all(jobs); out.map = Object.assign(F.defaultMap(out.accts && out.accts.length ? out.accts : F.COA), set.map || {});
    return out;
  }
  function loader(key, want) {
    return function (v, force) { const d = D[key] = D[key] || {}; d.busy = 1; d.err = ''; if (cur() === key) render();
      bundle(force, want).then(b => { Object.assign(d, b); }).catch(e => { d.err = e.message; }).finally(() => { d.busy = 0; d.at = Date.now(); if (cur() === key) render(); }); };
  }
  const refresh = key => X0(key)(V(), true);
  const LOADERS = {}; const X0 = key => LOADERS[key];
  /* opening a page from the menu shows its list; links inside Finance (goTo) open a given record */
  const RESET = { x_finjv: () => { ST.je = null; }, x_finbill: () => { ST.bill = null; }, x_finpay: () => { ST.pay = null; ST.payPre = null; } };
  const goTo = k => { ST.deep = k; go(k); };
  function screen(key, want, def) { LOADERS[key] = loader(key, want); def.load = (v, f) => { if (!f) { if (ST.deep !== key && RESET[key]) RESET[key](); ST.deep = null; } LOADERS[key](v, f); }; reg(key, def); }
  const busy = d => d.busy ? `<div class="mx-ld"><i></i><i></i><i></i> Loading…</div>` : d.err ? `<div class="mb-hint mb-bad" style="margin:0 4px 10px">⚠ ${esc(d.err)}</div>` : '';
  const needSetup = d => d.missing ? H.card('', `<div class="mb-hint mb-bad">The finance lists are not set up yet.</div>${H.btn('⚙️ Finance Settings → Set up', 'toSet')}`) : '';
  const toSet = () => go('x_finset');
  const acctOpts = (accts, filter) => (accts || []).filter(a => !a.group && a.active && (!filter || filter(a))).map(a => [a.code, a.code + ' · ' + a.name]);
  const acctName = (accts, code) => { const a = (accts || []).find(x => x.code === String(code)); return a ? a.code + ' · ' + a.name : String(code || ''); };
  function table(cols, rows, foot, tap) {
    return `<div class="fin-tw"><table class="fin-t"><thead><tr>${cols.map(c => `<th class="${c.n ? 'n' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="${r._cls || ''}${tap && r._tap != null ? ' tap' : ''}" ${tap && r._tap != null ? `data-x="${tap}" data-i="${esc(r._tap)}"` : ''}>${cols.map(c => { const v = r[c.k]; return `<td class="${c.n ? 'n' : ''}${c.n && Number(v) < 0 ? ' neg' : ''}">${c.n ? (v === '' || v == null ? '' : n2(v)) : (c.raw ? (v || '') : esc(v == null ? '' : v))}</td>`; }).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--mut);padding:18px">Nothing to show</td></tr>`}${foot ? `<tr class="tot">${cols.map(c => `<td class="${c.n ? 'n' : ''}">${c.n ? (foot[c.k] == null ? '' : n2(foot[c.k])) : esc(foot[c.k] || '')}</td>`).join('')}</tr>` : ''}</tbody></table></div>`;
  }
  function csv(name, cols, rows) {
    const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const text = '﻿' + [cols.map(c => q(c.t)).join(',')].concat(rows.map(r => cols.map(c => q(c.n ? (r[c.k] === '' || r[c.k] == null ? '' : Number(r[c.k]).toFixed(2)) : (c.raw ? String(r[c.k] || '').replace(/<[^>]+>/g, '') : r[c.k]))).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function printHtml(title, inner) {
    const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print', 'warn');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Segoe UI,system-ui,sans-serif;margin:24px;color:#101828}h1{font-size:18px;margin:0 0 4px}p{color:#667085;margin:0 0 14px;font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px;border-bottom:1px solid #e4e7ec;text-align:left}td.n,th.n{text-align:right}tr.tot td{font-weight:800;border-top:2px solid #101828}tr.sub td{font-weight:700;background:#f2f4f7}.neg{color:#b42318}</style></head><body><h1>${esc(title)}</h1><p>${esc((window.brandGet && brandGet().name) || 'ORBIT ERP')} · printed ${new Date().toLocaleString()}</p>${inner}<script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }

  /* ---------- rows ---------- */
  const billFromRow = r => ({ id: Number(r.id), number: r.billno || r.title || '', supplier_id: String(r.supplierid || ''), supplier_name: r.suppliername || '', supplier_inv_no: r.supplierinvno || '', bill_date: r.billdate || '', due_date: r.duedate || '', currency: r.currency || 'AED', fx_rate: num(r.fxrate) || null, status: r.status || 'draft', journal: r.journalno || '', einv: r.einvid || '', notes: r.notes || '', subtotal: num(r.subtotal), vat_total: num(r.vattotal), total: num(r.total), lines: F.J(r.linesjson, []), history: F.J(r.history, []) });
  const payFromRow = r => ({ id: Number(r.id), number: r.payno || r.title || '', type: r.paytype || 'receipt', date: r.paydate || '', party_type: r.partytype || '', party_id: String(r.partyid || ''), party_name: r.partyname || '', account: String(r.accountcode || ''), method: r.method || '', reference: r.reference || '', status: r.status || 'draft', journal: r.journalno || '', notes: r.notes || '', amount: num(r.amount), alloc: F.J(r.allocjson, []), history: F.J(r.history, []) });
  const hist = (h, text) => JSON.stringify((h || []).concat([{ at: iso(), by: me(), text }]).slice(-40));
  const fxOf = d => d.currency && d.currency !== 'AED' ? num(d.fx_rate) || 1 : 1;

  /* ---------- open items (for ageing and allocation) ---------- */
  function salesOpen(b) {
    const docs = (b.docs || []).filter(x => x.direction === 'out' && ['validated', 'delivered', 'reported'].includes(x.status));
    return docs.map(x => { const t = E.totals(x.lines), sg = x.doc_type === 'credit_note' ? -1 : 1; return { key: 'einv:' + x.id, id: x.id, kind: x.doc_type, number: x.number, party: (x.buyer && x.buyer.name) || x.customer_name, partyId: String(x.customer_id || ''), date: x.issue_date, due: x.due_date || x.issue_date, total: F.r2(sg * t.total * fxOf(x)), emirate: x.buyer && x.buyer.emirate, groups: t.breakdown, fx: fxOf(x), credit: sg < 0, journal: x.journal_no }; });
  }
  function billsOpen(b) { return (b.bills || []).filter(x => x.status === 'posted').map(x => ({ key: 'bill:' + x.id, id: x.id, number: x.number, party: x.supplier_name, partyId: x.supplier_id, date: x.bill_date, due: x.due_date || x.bill_date, total: F.r2(x.total * fxOf(x)), ref: x.supplier_inv_no })); }
  function allocs(b, type) { const P = (b.pays || []).filter(p => p.status === 'posted' && p.type === type); return { list: P.flatMap(p => p.alloc.map(a => ({ docKey: a.key, amount: num(a.amount) }))), unapplied: P.map(p => ({ partyId: p.party_id, party: p.party_name, amount: F.r2(p.amount - p.alloc.reduce((s, a) => s + num(a.amount), 0)) })) }; }
  function openBalances(b, type, partyId) {
    const docs = type === 'receipt' ? salesOpen(b) : billsOpen(b), al = allocs(b, type), paid = new Map(); al.list.forEach(a => paid.set(a.docKey, F.r2((paid.get(a.docKey) || 0) + a.amount)));
    return docs.filter(d => !partyId || d.partyId === String(partyId)).map(d => Object.assign(d, { balance: F.r2(d.total - (paid.get(d.key) || 0)) })).filter(d => Math.abs(d.balance) >= 0.005).sort((x, y) => String(x.due).localeCompare(String(y.due)));
  }

  /* ---------- e-invoices → ledger ---------- */
  async function postEinvoices(b, onStep) {
    const ents = await S.entries(true), done = new Map(ents.filter(e => e.status !== 'draft').map(e => [e.ref, e.no]));
    const todo = (b.docs || []).filter(x => x.direction === 'out' && ['validated', 'delivered', 'reported'].includes(x.status) && !x.journal_no);
    let n = 0;
    for (const x of todo) {
      onStep && onStep(x.number);
      const ref = 'EINV:' + (x.uuid || x.id); let no = done.get(ref);
      if (!no) { const e = F.fromSalesDoc(x, E.totals(x.lines), b.map), chk = F.checkEntry(e, b.accts, b.set); if (!chk.ok) throw new Error(x.number + ': ' + chk.errors.join(' · ')); no = (await S.post(Object.assign(e, { lines: chk.lines }))).no; }
      await A().upd('EInv_Documents', x.id, { JournalNo: no }); n++;
      if (window.INV_UI) { try { await INV_UI.salesCost(Object.assign({}, x, { journal_no: no })); } catch (e) { (postEinvoices.warn = postEinvoices.warn || []).push(x.number + ': ' + e.message); } }   /* cost of goods sold for stock items */
    }
    drop('EInv_Documents'); return n;
  }

  /* ================= Finance home ================= */
  screen('x_findash', { lines: true, docs: true, bills: true, pays: true, parties: true }, {
    view(v, d) {
      const L = d.lines || [], acc = d.accts || [], y0 = F.fyStart(today(), d.set && d.set.fiscalStart), m0 = today().slice(0, 7) + '-01';
      const bal = codes => F.r2(L.filter(l => codes.includes(l.account)).reduce((s, l) => s + l.debit - l.credit, 0));
      const sub = s => acc.filter(a => a.sub === s).map(a => a.code), m = d.map || {};
      const cash = bal(sub('bank').concat(sub('cash'))), ar = bal([m.ar]), ap = -bal([m.ap]), vat = -bal([m.vat_out]) - bal([m.vat_in]);
      const pYear = F.pnl(L, acc, y0, today()).netProfit, pMonth = F.pnl(L, acc, m0, today()).netProfit;
      const waiting = (d.docs || []).filter(x => x.direction === 'out' && ['validated', 'delivered', 'reported'].includes(x.status) && !x.journal_no).length;
      const drafts = (d.entries || []).filter(e => e.status === 'draft').length + (d.bills || []).filter(x => x.status === 'draft').length + (d.pays || []).filter(x => x.status === 'draft').length;
      return H.head('💼', 'Finance', 'Accounts · AED · ' + (d.set && d.set.mode === 'server' ? 'database server' : 'SharePoint'), '#0f766e') + busy(d) + needSetup(d)
        + H.kpis([['Cash & bank', n2(cash), 'g'], ['Receivables', n2(ar)], ['Payables', n2(ap), 'o'], ['VAT due', n2(vat), vat > 0 ? 'o' : 'g'], ['Profit this month', n2(pMonth), pMonth < 0 ? 'r' : 'g'], ['Profit this year', n2(pYear), pYear < 0 ? 'r' : 'g']])
        + (waiting ? H.card('', `<span class="mb-hint">${waiting} accepted e-invoice${waiting > 1 ? 's are' : ' is'} not in the ledger yet.</span>${H.btn(v.posting ? '⏳ ' + esc(v.posting) : '⇢ Post e-invoices to the ledger', 'postEinv')}`) : '')
        + (drafts ? H.card('', `<span class="mb-hint">${drafts} draft${drafts > 1 ? 's' : ''} waiting to be posted (entries, bills, receipts / payments).</span>`) : '')
        + H.card('Quick actions', `<div class="mx-acts">${H.sbtn('＋ Journal entry', 'newJe', '', 'p')}${H.sbtn('＋ Purchase bill', 'newBill')}${H.sbtn('＋ Receipt', 'newRcp')}${H.sbtn('＋ Payment', 'newPay')}${H.sbtn('📊 Reports', 'toRep')}</div>`)
        + H.card('Latest entries', table([{ k: 'no', t: 'Entry' }, { k: 'date', t: 'Date' }, { k: 'memo', t: 'Memo' }, { k: 'total', t: 'Amount', n: 1 }, { k: 'st', t: 'Status', raw: 1 }], (d.entries || []).slice(0, 8).map(e => ({ no: e.no || '(draft)', date: dmy(e.date), memo: e.memo, total: e.total || e.lines.reduce((s, l) => s + num(l.debit), 0), st: pill(e.status), _tap: e.id })), null, 'openJe'));
    },
    act: { toSet, toRep() { go('x_finrep'); }, newJe() { ST.je = 'new'; goTo('x_finjv'); }, newBill() { ST.bill = 'new'; goTo('x_finbill'); }, newRcp() { ST.pay = 'receipt'; goTo('x_finpay'); }, newPay() { ST.pay = 'payment'; goTo('x_finpay'); },
      openJe(t) { ST.je = +t.dataset.i; goTo('x_finjv'); },
      async postEinv(t, v, d) { if (v.posting) return; v.posting = 'Starting…'; render(); try { postEinvoices.warn = []; const n = await postEinvoices(d, x => { v.posting = x; render(); }); toast('✅ ' + n + ' e-invoice(s) posted to the ledger', 'success'); if (postEinvoices.warn.length) toast('Cost of sales not posted for ' + postEinvoices.warn.join(' · ') + ' — see Inventory', 'warn'); } catch (e) { toast(e.message, 'error'); } v.posting = ''; refresh('x_findash'); } } });

  /* ================= Journal entries ================= */
  const blankJl = () => ({ account: '', description: '', debit: '', credit: '', costCenter: '' });
  screen('x_finjv', { entries: true }, {
    view(v, d) {
      const accts = d.accts || [], ents = d.entries || [];
      if (ST.je === 'new' || (ST.je && v.edit)) {
        if (!v.lines) { const src = ST.je !== 'new' ? ents.find(e => e.id === ST.je) : null; Object.assign(v, src ? { date: src.date, memo: src.memo, lines: src.lines.map(l => Object.assign(blankJl(), l, { debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '' })) } : { date: today(), memo: '', lines: [blankJl(), blankJl()] }); }
        const dr = F.r2(v.lines.reduce((s, l) => s + num(l.debit), 0)), cr = F.r2(v.lines.reduce((s, l) => s + num(l.credit), 0)), diff = F.r2(dr - cr), opts = acctOpts(accts);
        setTitle(ST.je === 'new' ? 'New journal entry' : 'Edit journal entry');
        return H.head('📒', 'Journal entry', 'Debits must equal credits', '#0f766e') + busy(d) + errs(v.errs, 'Cannot post')
          + H.card('', `<div class="fin-row">${H.f('Date', H.date('date'))}${H.f('Memo', H.inp('memo', { ph: 'What is this entry for?' }))}</div>`)
          + H.card('Lines', `<div class="fin-jh"><span>Account</span><span>Description</span><span style="text-align:right">Debit</span><span style="text-align:right">Credit</span><span></span></div>`
            + v.lines.map((l, i) => `<div class="fin-jl"><select class="w2" data-ln="lines:${i}:account" data-r="1"><option value="">— account —</option>${opts.map(([c, t]) => `<option value="${c}"${String(l.account) === c ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select><input data-ln="lines:${i}:description" value="${esc(l.description)}" placeholder="Description" class="w2"><input data-ln="lines:${i}:debit" data-r="1" value="${esc(l.debit)}" inputmode="decimal" placeholder="Debit" style="text-align:right"><input data-ln="lines:${i}:credit" data-r="1" value="${esc(l.credit)}" inputmode="decimal" placeholder="Credit" style="text-align:right"><button type="button" class="mx-sb r" data-x="delL" data-i="${i}" ${v.lines.length > 2 ? '' : 'disabled'}>✕</button></div>`).join('')
            + `<div class="fin-diff ${diff ? 'bad' : 'ok'}"><span>Debit ${n2(dr)} · Credit ${n2(cr)}</span><span>${diff ? 'Difference ' + n2(diff) : '✓ Balanced'}</span></div>${H.sbtn('＋ Add line', 'addL', 'style="width:100%"')}`)
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Save draft', 'saveJe', 's')}${H.btn('✓ Post', 'postJe')}</div>`);
      }
      if (ST.je) {
        const e = ents.find(x => x.id === ST.je); if (!e) return busy(d) + (d.busy ? '' : H.card('', H.empty('Entry not found.')));
        setTitle('Entry ' + (e.no || '(draft)'));
        return H.head('📒', (e.no || 'Draft') + ' · ' + money(e.total || e.lines.reduce((s, l) => s + num(l.debit), 0)), dmy(e.date) + ' · ' + esc(e.source) + (e.reversalOf ? ' · reverses ' + esc(e.reversalOf) : '') + (e.reversedBy ? ' · reversed by ' + esc(e.reversedBy) : ''), COL[e.status])
          + H.card(esc(e.memo || 'Lines') + ' · ' + pill(e.status), table([{ k: 'acc', t: 'Account' }, { k: 'description', t: 'Description' }, { k: 'party', t: 'Party' }, { k: 'debit', t: 'Debit', n: 1 }, { k: 'credit', t: 'Credit', n: 1 }],
            e.lines.map(l => ({ acc: acctName(accts, l.account), description: l.description, party: l.partyName || '', debit: num(l.debit) || '', credit: num(l.credit) || '' })), { acc: 'Total', debit: F.r2(e.lines.reduce((s, l) => s + num(l.debit), 0)), credit: F.r2(e.lines.reduce((s, l) => s + num(l.credit), 0)) }))
          + H.card('History', (e.history || []).slice().reverse().map(h => `<div class="ei-kv"><span>${esc(dmy(h.at))} ${esc(String(h.at).slice(11, 16))}</span><b>${esc(h.text)}${h.by ? ' · ' + esc(h.by) : ''}</b></div>`).join('') || H.empty('—'))
          + H.bar(e.status === 'draft' ? `<div class="mb-row">${H.btn('✏️ Edit', 'editJe', 's')}${H.btn('🗑 Delete', 'delJe', 's')}${H.btn('✓ Post', 'postSaved')}</div>` : e.status === 'posted' && e.source !== 'reversal' ? `<div class="mb-row">${H.btn('← All entries', 'back0', 's')}${H.btn('↺ Reverse', 'reverse', 's')}</div>` : H.btn('← All entries', 'back0', 's'));
      }
      const q = String(v.q || '').toLowerCase(), tab = v.tab || 'all';
      const rows = ents.filter(e => (tab === 'all' || e.status === tab || (tab === 'manual' && e.source === 'manual')) && (!q || (e.no + ' ' + e.memo).toLowerCase().includes(q)));
      setTitle('Journal entries');
      return H.head('📒', 'Journal entries', 'Every posting in the ledger', '#0f766e') + busy(d) + needSetup(d) + H.search('q', 'Search number or memo')
        + H.tabs('tab', [['all', 'All', ents.length], ['draft', 'Drafts'], ['posted', 'Posted'], ['manual', 'Manual'], ['reversed', 'Reversed']], 'all')
        + H.card('', table([{ k: 'no', t: 'Entry' }, { k: 'date', t: 'Date' }, { k: 'memo', t: 'Memo' }, { k: 'src', t: 'Source' }, { k: 'total', t: 'Amount', n: 1 }, { k: 'st', t: '', raw: 1 }], rows.slice(0, 300).map(e => ({ no: e.no || '(draft)', date: dmy(e.date), memo: e.memo, src: e.source, total: e.total || e.lines.reduce((s, l) => s + num(l.debit), 0), st: pill(e.status), _tap: e.id })), null, 'open'))
        + H.bar(H.btn('＋ New journal entry', 'new'));
    },
    act: {
      toSet, new(t, v) { ST.je = 'new'; Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; }); render(); }, open(t, v) { ST.je = +t.dataset.i; v.edit = 0; v.lines = null; render(); },
      back0(t, v) { ST.je = null; v.edit = 0; v.lines = null; render(); }, cancel(t, v) { if (ST.je === 'new') ST.je = null; v.edit = 0; v.lines = null; v.errs = null; render(); },
      editJe(t, v) { v.edit = 1; v.lines = null; render(); }, addL(t, v) { v.lines.push(blankJl()); render(); }, delL(t, v) { v.lines.splice(+t.dataset.i, 1); render(); },
      async saveJe(t, v, d) { const f = { Title: 'Draft', EntryDate: v.date, Memo: str(v.memo), Source: 'manual', Status: 'draft', LinesJson: JSON.stringify(v.lines.filter(l => l.account || num(l.debit) || num(l.credit))) };
        try { if (ST.je === 'new') { f.History = hist([], 'Draft created'); ST.je = (await S.add('Fin_Journal', f)).id; } else await S.upd('Fin_Journal', ST.je, f); toast('✅ Draft saved', 'success'); v.edit = 0; v.lines = null; S.drop('Fin_Journal'); refresh('x_finjv'); } catch (e) { toast('Not saved: ' + e.message, 'error'); } },
      async postJe(t, v, d) { const e = { date: v.date, memo: str(v.memo), source: 'manual', lines: v.lines.map(l => ({ account: l.account, description: str(l.description), debit: num(l.debit), credit: num(l.credit), costCenter: str(l.costCenter) })) };
        const chk = F.checkEntry(e, d.accts, d.set); if (!chk.ok) { v.errs = chk.errors; render(); return; }
        if (!confirm('Post this entry?\n\nPosted entries cannot be edited — only reversed.')) return;
        try { const r = await S.post(Object.assign(e, { lines: chk.lines }), ST.je === 'new' ? null : ST.je); toast('✅ ' + r.no + ' posted', 'success'); ST.je = r.id; v.edit = 0; v.lines = null; v.errs = null; refresh('x_finjv'); } catch (er) { toast(er.message, 'error'); } },
      async postSaved(t, v, d) { const e0 = (d.entries || []).find(x => x.id === ST.je); const e = { date: e0.date, memo: e0.memo, source: 'manual', lines: e0.lines, history: e0.history };
        const chk = F.checkEntry(e, d.accts, d.set); if (!chk.ok) { toast(chk.errors[0], 'error'); return; }
        if (!confirm('Post this entry?\n\nPosted entries cannot be edited — only reversed.')) return;
        try { const r = await S.post(Object.assign(e, { lines: chk.lines }), ST.je); toast('✅ ' + r.no + ' posted', 'success'); refresh('x_finjv'); } catch (er) { toast(er.message, 'error'); } },
      async delJe(t, v) { if (!confirm('Delete this draft entry?')) return; try { await S.del('Fin_Journal', ST.je); ST.je = null; toast('Draft deleted', 'success'); refresh('x_finjv'); } catch (e) { toast(e.message, 'error'); } },
      async reverse(t, v, d) { const e0 = (d.entries || []).find(x => x.id === ST.je); const date = today() < e0.date ? e0.date : today();
        if (d.set && d.set.lock && date <= d.set.lock) return toast('The period is locked up to ' + d.set.lock, 'error');
        if (!confirm('Reverse ' + e0.no + '?\n\nA new entry with the opposite amounts is posted on ' + dmy(date) + '.')) return;
        try { const r = await S.post(F.reversalOf(e0, date)); await S.upd('Fin_Journal', e0.id, { Status: 'reversed', ReversedBy: r.no, History: hist(e0.history, 'Reversed by ' + r.no) }); toast('↺ Reversed by ' + r.no, 'success'); refresh('x_finjv'); } catch (er) { toast(er.message, 'error'); } } } });

  /* ================= Chart of accounts ================= */
  screen('x_fincoa', { lines: true }, {
    view(v, d) {
      const accts = d.accts || [], b = F.balances(d.lines || [], '', today()), q = String(v.q || '').toLowerCase();
      if (v.form) return H.head('🗂', v.id ? 'Edit account' : 'New account', '', '#0f766e') + errs(v.errs) + H.card('', `<div class="fin-row">${H.f('Code *', H.inp('code', { mode: 'numeric' }))}${H.f('Name *', H.inp('name'))}</div>${H.f('Name (Arabic)', H.inp('name_ar'))}<div class="fin-row">${H.f('Type', H.sel('type', Object.entries(F.TYPES), { ph: false }))}${H.f('Under (group)', H.sel('parent', accts.filter(a => a.group).map(a => [a.code, a.code + ' · ' + a.name])))}</div><div class="fin-row">${H.f('Kind', H.sel('sub', [['', '—'], ['bank', 'Bank'], ['cash', 'Cash'], ['receivable', 'Receivable'], ['payable', 'Payable'], ['vat_in', 'Input VAT'], ['vat_out', 'Output VAT'], ['inventory', 'Inventory'], ['fixed_asset', 'Fixed asset'], ['acc_dep', 'Accumulated depreciation']], { ph: false }))}${H.f('Group account (holds other accounts)', H.seg('grp', [['0', 'No'], ['1', 'Yes']], '0'))}</div>${H.f('Active', H.seg('act', [['1', 'Active'], ['0', 'Inactive']], '1'))}`) + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Save', 'save')}</div>`);
      const rows = accts.filter(a => !q || (a.code + ' ' + a.name).toLowerCase().includes(q)).map(a => { const x = b.get(a.code) || { debit: 0, credit: 0 }, bal = a.group ? '' : F.r2(x.debit - x.credit); return { code: a.code, name: (a.parent ? '   ' : '') + a.name + (a.active ? '' : ' (inactive)'), type: F.TYPES[a.type], bal, _cls: a.group ? 'sub' : '', _tap: a.id }; });
      return H.head('🗂', 'Chart of accounts', accts.length + ' accounts · balances to today (debit +, credit −)', '#0f766e') + busy(d) + needSetup(d) + H.search('q', 'Search code or name') + H.card('', table([{ k: 'code', t: 'Code' }, { k: 'name', t: 'Account' }, { k: 'type', t: 'Type' }, { k: 'bal', t: 'Balance', n: 1 }], rows, null, 'edit')) + H.bar(`<div class="mb-row">${H.btn('＋ New account', 'add')}${H.btn('📄 Ledger of an account', 'toGl', 's')}</div>`);
    },
    act: {
      toSet, toGl() { go('x_finrep'); },
      add(t, v) { Object.assign(v, { form: 1, id: null, code: '', name: '', name_ar: '', type: 'expense', parent: '6000', sub: '', grp: '0', act: '1', errs: null }); render(); },
      edit(t, v, d) { const a = (d.accts || []).find(x => String(x.id) === t.dataset.i); if (!a) return; Object.assign(v, { form: 1, id: a.id, code: a.code, name: a.name, name_ar: a.name_ar, type: a.type, parent: a.parent, sub: a.sub, grp: a.group ? '1' : '0', act: a.active ? '1' : '0', errs: null }); render(); },
      cancel(t, v) { v.form = 0; render(); },
      async save(t, v, d) { const e = []; if (!/^\d{3,10}$/.test(str(v.code))) e.push('Code: 3–10 digits'); if (!str(v.name)) e.push('Name is required'); if ((d.accts || []).some(a => a.code === str(v.code) && a.id !== v.id)) e.push('Code ' + v.code + ' is already used');
        const used = v.id && (d.lines || []).some(l => l.account === ((d.accts || []).find(a => a.id === v.id) || {}).code); if (used && v.grp === '1') e.push('This account has postings — it cannot become a group');
        if (used && (d.accts || []).find(a => a.id === v.id).code !== str(v.code)) e.push('This account has postings — its code cannot change');
        if (e.length) { v.errs = e; render(); return; }
        const f = F.acctToFields({ code: str(v.code), name: str(v.name), name_ar: str(v.name_ar), type: v.type, parent: v.parent || '', sub: v.sub || '', group: v.grp === '1', active: v.act !== '0' });
        try { if (v.id) await S.upd('Fin_Accounts', v.id, f); else await S.add('Fin_Accounts', f); toast('✅ Account saved', 'success'); v.form = 0; refresh('x_fincoa'); } catch (er) { toast(er.message, 'error'); } } } });

  /* ================= Suppliers ================= */
  screen('x_finsup', { parties: true }, {
    view(v, d) {
      const rows = (d.sups || []).slice().sort((a, b) => str(a.title).localeCompare(str(b.title))), q = String(v.q || '').toLowerCase();
      if (v.form) return H.head('🏭', v.id ? 'Edit supplier' : 'New supplier', '', '#7c3aed') + errs(v.errs) + H.card('', H.f('Name *', H.inp('name')) + `<div class="fin-row">${H.f('TRN', H.inp('trn', { mode: 'numeric' }))}${H.f('Peppol ID (TIN)', H.inp('endpoint_id', { mode: 'numeric' }))}</div><div class="fin-row">${H.f('City', H.inp('city'))}${H.f('Emirate', H.sel('emirate', Object.entries(E.C.EMIRATES)))}</div><div class="fin-row">${H.f('Email', H.inp('email', { type: 'email' }))}${H.f('Payment terms (days)', H.num('terms'))}</div>${H.f('Default expense account', H.sel('dacc', acctOpts(d.accts, a => a.type === 'expense' || a.type === 'asset')))}`) + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Save', 'save')}</div>`);
      return H.head('🏭', 'Suppliers', 'Who you buy from', '#7c3aed') + busy(d) + needSetup(d) + H.search('q', 'Search')
        + H.card('', rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q)).map(r => H.li({ x: 'edit', i: r.id, ic: '🏭', c: '#7c3aed', t: str(r.title), s: 'TRN ' + (str(r.trn) || '—') + ' · ' + (num(r.paymentterms) || 0) + ' days', s2: [str(r.city), E.C.EMIRATES[str(r.emirate)]].filter(Boolean).join(', ') })).join('') || H.empty('No suppliers yet.'))
        + H.bar(H.btn('＋ New supplier', 'add'));
    },
    act: {
      toSet, add(t, v) { Object.assign(v, { form: 1, id: null, name: '', trn: '', endpoint_id: '', city: '', emirate: '', email: '', terms: '30', dacc: '', errs: null }); render(); },
      edit(t, v, d) { const r = (d.sups || []).find(x => String(x.id) === t.dataset.i); Object.assign(v, { form: 1, id: r.id, name: str(r.title), trn: str(r.trn), endpoint_id: str(r.endpointid), city: str(r.city), emirate: str(r.emirate), email: str(r.email), terms: String(num(r.paymentterms) || ''), dacc: str(r.defaultaccount), errs: null }); render(); },
      cancel(t, v) { v.form = 0; render(); },
      async save(t, v) { const e = []; if (!str(v.name)) e.push('Name is required'); if (str(v.trn) && !E.TRN_RE.test(str(v.trn))) e.push('TRN must be 15 digits, start with 1 and end with 03'); if (e.length) { v.errs = e; render(); return; }
        const f = { Title: str(v.name), TRN: str(v.trn), EndpointId: str(v.endpoint_id), City: str(v.city), Emirate: v.emirate || '', Country: 'AE', Email: str(v.email), PaymentTerms: num(v.terms), DefaultAccount: v.dacc || '' };
        try { if (v.id) await S.upd('Fin_Suppliers', v.id, f); else await S.add('Fin_Suppliers', f); toast('✅ Supplier saved', 'success'); v.form = 0; refresh('x_finsup'); } catch (er) { toast(er.message, 'error'); } } } });

  /* ================= Purchase bills ================= */
  const blankBl = acc => ({ account: acc || '', description: '', quantity: '1', unit_price: '', vat_category: 'S' });
  screen('x_finbill', { bills: true, parties: true, docs: true }, {
    view(v, d) {
      const bills = (d.bills || []).sort((a, b) => b.id - a.id), sups = d.sups || [], accts = d.accts || [];
      if (ST.bill === 'new' || (ST.bill && v.edit)) {
        if (!v.lines) { const src = ST.bill !== 'new' ? bills.find(x => x.id === ST.bill) : null; Object.assign(v, src ? { sup: src.supplier_id, inv: src.supplier_inv_no, date: src.bill_date, due: src.due_date, cur: src.currency, fx: src.fx_rate || '', notes: src.notes, einv: src.einv, lines: src.lines.map(l => Object.assign(blankBl(), l, { quantity: String(l.quantity), unit_price: String(l.unit_price) })) } : Object.assign({ date: today(), due: addD(today(), 30), cur: 'AED', lines: [blankBl(d.map && d.map.purchases)] }, v.pre || {})); }
        const t = F.billTotals({ lines: v.lines }), opts = acctOpts(accts, a => a.type === 'expense' || a.type === 'asset');
        setTitle(ST.bill === 'new' ? 'New purchase bill' : 'Edit purchase bill');
        return H.head('🧾', 'Purchase bill', 'A supplier invoice you have to pay', '#7c3aed') + errs(v.errs)
          + H.card('', H.f('Supplier', H.sel('sup', sups.map(s => [String(s.id), str(s.title)]))) + (sups.length ? '' : `<span class="mb-hint">Add the supplier first in Suppliers.</span>`) + `<div class="fin-row">${H.f('Supplier invoice no.', H.inp('inv'))}${H.f('Bill date', H.date('date'))}${H.f('Due date', H.date('due'))}</div><div class="fin-row">${H.f('Currency', H.sel('cur', ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'INR'], { ph: false }))}${v.cur !== 'AED' ? H.f('Rate → AED', H.num('fx')) : ''}</div>`)
          + H.card('Lines', v.lines.map((l, i) => `<div class="ei-ln"><div class="ei-lnh"><span>Line ${i + 1}</span>${v.lines.length > 1 ? `<button type="button" class="mx-sb r" data-x="delL" data-i="${i}">✕</button>` : ''}</div>${window.INV_UI ? INV_UI.billLine(l, i, d) : ''}<div class="mb-f"><select data-ln="lines:${i}:account" data-r="1"><option value="">— account —</option>${opts.map(([c, x]) => `<option value="${c}"${String(l.account) === c ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div><div class="mb-f"><input data-ln="lines:${i}:description" value="${esc(l.description)}" placeholder="Description"></div><div class="mb-row"><div class="mb-f"><label>Qty</label><input data-ln="lines:${i}:quantity" data-r="1" value="${esc(l.quantity)}" inputmode="decimal"></div><div class="mb-f"><label>Unit price</label><input data-ln="lines:${i}:unit_price" data-r="1" value="${esc(l.unit_price)}" inputmode="decimal"></div><div class="mb-f"><label>VAT</label><select data-ln="lines:${i}:vat_category" data-r="1">${[['S', '5%'], ['Z', '0%'], ['E', 'Exempt'], ['O', 'Out of scope']].map(([k, x]) => `<option value="${k}"${l.vat_category === k ? ' selected' : ''}>${x}</option>`).join('')}</select></div></div><div class="ei-tot"><span>Net</span><b>${money(t.lines[i].net, v.cur)}</b></div></div>`).join('') + H.sbtn('＋ Add line', 'addL', 'style="width:100%"'))
          + H.card('Totals', `<div class="ei-tot"><span>Subtotal</span><span>${money(t.subtotal, v.cur)}</span></div><div class="ei-tot"><span>Input VAT</span><span>${money(t.vat_total, v.cur)}</span></div><div class="ei-tot g"><span>Total</span><span>${money(t.total, v.cur)}</span></div>`)
          + H.card('Notes', H.txt('notes')) + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Save draft', 'saveB', 's')}${H.btn('✓ Post', 'postB')}</div>`);
      }
      if (ST.bill) {
        const b = bills.find(x => x.id === ST.bill); if (!b) return busy(d);
        setTitle('Bill ' + (b.number || '(draft)')); const t = F.billTotals({ lines: b.lines }), paid = F.r2((d.pays || []).filter(p => p.status === 'posted').flatMap(p => p.alloc).filter(a => a.key === 'bill:' + b.id).reduce((s, a) => s + num(a.amount), 0));
        return H.head('🧾', (b.number || 'Draft') + ' · ' + money(b.total, b.currency), esc(b.supplier_name) + ' · ' + dmy(b.bill_date) + (b.supplier_inv_no ? ' · inv. ' + esc(b.supplier_inv_no) : ''), COL[b.status])
          + H.card('Status · ' + pill(b.status), `<div class="ei-kv"><span>Journal</span><b>${esc(b.journal || '—')}</b></div><div class="ei-kv"><span>Due</span><b>${dmy(b.due_date)}</b></div><div class="ei-kv"><span>Paid</span><b>${money(paid)}</b></div><div class="ei-kv"><span>Open</span><b>${money(F.r2(b.total * fxOf(b) - paid))}</b></div>`)
          + H.card('Lines', table([{ k: 'acc', t: 'Account' }, { k: 'd', t: 'Description' }, { k: 'net', t: 'Net', n: 1 }, { k: 'vat', t: 'VAT', n: 1 }], t.lines.map(l => ({ acc: acctName(accts, l.account), d: (l.item ? '📦 ' + l.item + ' × ' + l.quantity + ' · ' : '') + l.description, net: l.net, vat: l.vat })), { acc: 'Total', net: t.subtotal, vat: t.vat_total }))
          + H.bar(b.status === 'draft' ? `<div class="mb-row">${H.btn('✏️ Edit', 'editB', 's')}${H.btn('🗑 Delete', 'delB', 's')}${H.btn('✓ Post', 'postSavedB')}</div>` : `<div class="mb-row">${H.btn('← All bills', 'back0', 's')}${b.status === 'posted' ? H.btn('💸 Pay this bill', 'payB') : ''}</div>`);
      }
      const recv = (d.docs || []).filter(x => x.direction === 'in' && !bills.some(b => b.einv === String(x.id)));
      const tab = v.tab || 'all', rows = bills.filter(b => tab === 'all' || b.status === tab);
      setTitle('Purchase bills');
      return H.head('🧾', 'Purchase bills', 'Supplier invoices → payables and input VAT', '#7c3aed') + busy(d) + needSetup(d)
        + (recv.length ? H.card('Received e-invoices to record', recv.slice(0, 10).map(x => H.li({ x: 'fromEinv', i: x.id, ic: '📥', c: '#0e7490', t: (x.number || '—') + ' · ' + (x.customer_name || 'Supplier'), s: dmy(x.issue_date) + ' · ' + money(x.total, x.currency), v: '<b>Record ›</b>' })).join('')) : '')
        + H.tabs('tab', [['all', 'All', bills.length], ['draft', 'Drafts'], ['posted', 'Posted']], 'all')
        + H.card('', table([{ k: 'no', t: 'Bill' }, { k: 'sup', t: 'Supplier' }, { k: 'date', t: 'Date' }, { k: 'due', t: 'Due' }, { k: 'total', t: 'Total', n: 1 }, { k: 'st', t: '', raw: 1 }], rows.map(b => ({ no: b.number || '(draft)', sup: b.supplier_name, date: dmy(b.bill_date), due: dmy(b.due_date), total: b.total, st: pill(b.status), _tap: b.id })), null, 'open'))
        + H.bar(H.btn('＋ New bill', 'new'));
    },
    act: {
      toSet, new(t, v) { ST.bill = 'new'; Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; }); render(); }, open(t, v) { ST.bill = +t.dataset.i; v.edit = 0; v.lines = null; render(); },
      back0(t, v) { ST.bill = null; v.edit = 0; v.lines = null; render(); }, cancel(t, v) { if (ST.bill === 'new') ST.bill = null; v.edit = 0; v.lines = null; v.errs = null; v.pre = null; render(); },
      editB(t, v) { v.edit = 1; v.lines = null; render(); }, addL(t, v, d) { v.lines.push(blankBl(d.map && d.map.purchases)); render(); }, delL(t, v) { v.lines.splice(+t.dataset.i, 1); render(); },
      payB(t, v, d) { const b = (d.bills || []).find(x => x.id === ST.bill); ST.pay = 'payment'; ST.payPre = { party: b.supplier_id }; goTo('x_finpay'); },
      async fromEinv(t, v, d) {   /* received PINT AE invoice → draft bill; supplier matched by TRN or created */
        const x = (d.docs || []).find(y => String(y.id) === t.dataset.i); if (!x) return; const s = x.seller || {};
        let sup = (d.sups || []).find(r => s.trn && str(r.trn) === s.trn) || (d.sups || []).find(r => str(r.title).toLowerCase() === String(s.name || '').toLowerCase());
        try { if (!sup) { const r = await S.add('Fin_Suppliers', { Title: s.name || 'Supplier', TRN: s.trn || '', EndpointId: s.tin || s.endpoint_id || '', City: s.city || '', Emirate: s.emirate || '', Country: 'AE', PaymentTerms: 30 }); sup = { id: r.id, defaultaccount: '' }; toast('Supplier ' + (s.name || '') + ' added', 'info'); }
          ST.bill = 'new'; Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; });
          v.pre = { sup: String(sup.id), inv: x.number, date: x.issue_date || today(), due: x.due_date || addD(x.issue_date || today(), 30), cur: x.currency || 'AED', einv: String(x.id), lines: x.lines.map(l => ({ account: str(sup.defaultaccount) || d.map.purchases, description: l.description, quantity: String(l.quantity || 1), unit_price: String(l.unit_price || 0), vat_category: l.vat_category || 'S' })) };
          refresh('x_finbill'); } catch (e) { toast(e.message, 'error'); } },
      async saveB(t, v, d) { try { await saveBill(v, d, false); } catch (e) { toast(e.message, 'error'); } },
      async postB(t, v, d) { try { await saveBill(v, d, true); } catch (e) { toast(e.message, 'error'); } },
      async postSavedB(t, v, d) { const b = (d.bills || []).find(x => x.id === ST.bill); try { await postBill(b, d); refresh('x_finbill'); } catch (e) { toast(e.message, 'error'); } },
      async delB(t, v) { if (!confirm('Delete this draft bill?')) return; try { await S.del('Fin_Bills', ST.bill); ST.bill = null; toast('Draft deleted', 'success'); refresh('x_finbill'); } catch (e) { toast(e.message, 'error'); } } } });
  async function saveBill(v, d, andPost) {
    const sup = (d.sups || []).find(s => String(s.id) === String(v.sup)); const e = [];
    if (!sup) e.push('Choose the supplier'); if (!v.lines.some(l => num(l.unit_price))) e.push('Add at least one line with a price'); if (v.lines.some(l => num(l.unit_price) && !l.account)) e.push('Every line needs an account');
    if (v.cur !== 'AED' && !(num(v.fx) > 0)) e.push('Enter the exchange rate to AED');
    if (e.length) { v.errs = e; render(); return; }
    const lines = v.lines.filter(l => num(l.unit_price)).map(l => Object.assign({ account: l.account, description: str(l.description), quantity: num(l.quantity) || 1, unit_price: num(l.unit_price), vat_category: l.vat_category || 'S' }, l.item ? { item: l.item, wh: l.wh || '' } : {})), t = F.billTotals({ lines });
    const f = { Title: 'Draft', SupplierId: String(sup.id), SupplierName: str(sup.title), SupplierInvNo: str(v.inv), BillDate: v.date, DueDate: v.due, Currency: v.cur || 'AED', FxRate: v.cur !== 'AED' ? num(v.fx) : null, Status: 'draft', EinvId: v.einv || '', Notes: str(v.notes), Subtotal: t.subtotal, VatTotal: t.vat_total, Total: t.total, LinesJson: JSON.stringify(lines) };
    if (andPost && !confirm('Post this bill to the ledger?\n\nPayables and input VAT are booked; a posted bill cannot be edited.')) return;
    let id = ST.bill;
    if (id === 'new') { f.History = hist([], 'Draft created'); id = (await S.add('Fin_Bills', f)).id; ST.bill = id; } else await S.upd('Fin_Bills', id, f);
    if (andPost) { await postBill(Object.assign(billFromRow({ id, billno: '', suppliername: f.SupplierName, supplierid: f.SupplierId, supplierinvno: f.SupplierInvNo, billdate: f.BillDate, duedate: f.DueDate, currency: f.Currency, fxrate: f.FxRate, linesjson: f.LinesJson, total: f.Total }), {}), d); }
    else toast('✅ Draft saved', 'success');
    v.edit = 0; v.lines = null; v.errs = null; v.pre = null; S.drop('Fin_Bills'); refresh('x_finbill');
  }
  async function postBill(b, d) {
    if (d.set && d.set.lock && b.bill_date <= d.set.lock) throw new Error('The period is locked up to ' + d.set.lock);
    const no = b.number || await S.next('bill', d.set.bill), e = F.fromBill(Object.assign({}, b, { number: no }), d.map), chk = F.checkEntry(e, d.accts, d.set);
    if (!chk.ok) throw new Error(chk.errors.join(' · '));
    const r = await S.post(Object.assign(e, { lines: chk.lines }));
    await S.upd('Fin_Bills', b.id, { Title: no, BillNo: no, Status: 'posted', JournalNo: r.no, History: hist(b.history, 'Posted · ' + r.no) });
    toast('✅ ' + no + ' posted (' + r.no + ')', 'success');
    if (window.INV_UI && b.lines.some(l => l.item)) { try { const g = await INV_UI.billReceipt(Object.assign({}, b, { number: no }), d); if (g) toast('📦 Stock received · ' + g.no, 'success'); } catch (e) { toast('Bill posted, but the stock receipt was not saved: ' + e.message + ' — Inventory → Stock transactions → "Receive stock of posted bills"', 'warn'); } }
  }

  /* ================= Receipts & payments ================= */
  screen('x_finpay', { pays: true, parties: true, docs: true, bills: true }, {
    view(v, d) {
      const pays = (d.pays || []).sort((a, b) => b.id - a.id), accts = d.accts || [];
      if (ST.pay === 'receipt' || ST.pay === 'payment') {
        const rc = ST.pay === 'receipt', parties = rc ? (d.cust || []) : (d.sups || []);
        if (!v.init) { v.init = 1; Object.assign(v, { date: today(), acc: (d.map && d.map.bank) || '', method: 'Bank transfer', party: (ST.payPre && ST.payPre.party) || '' }); ST.payPre = null; }
        const open = v.party ? openBalances(d, ST.pay, v.party) : [];
        if (!v.alloc || v.allocFor !== v.party) { v.alloc = open.map(o => ({ key: o.key, number: o.number, due: o.due, balance: o.balance, amount: '' })); v.allocFor = v.party; }
        const totAlloc = F.r2(v.alloc.reduce((s, a) => s + num(a.amount), 0)), amt = num(v.amount);
        setTitle(rc ? 'New receipt' : 'New payment');
        return H.head(rc ? '💰' : '💸', rc ? 'Receipt from a customer' : 'Payment to a supplier', rc ? 'Money in — reduces receivables' : 'Money out — reduces payables', rc ? '#15803d' : '#b45309') + errs(v.errs)
          + H.card('', H.f(rc ? 'Customer' : 'Supplier', H.sel('party', parties.map(p => [String(p.id), str(p.title)]))) + `<div class="fin-row">${H.f('Date', H.date('date'))}${H.f('Amount (AED)', H.num('amount', { r: 1 }))}</div><div class="fin-row">${H.f(rc ? 'Into account' : 'From account', H.sel('acc', acctOpts(accts, a => a.sub === 'bank' || a.sub === 'cash'), { ph: false }))}${H.f('Method', H.sel('method', ['Bank transfer', 'Cheque', 'Cash', 'Card'], { ph: false }))}</div>${H.f('Reference', H.inp('ref', { ph: 'Cheque / transfer no.' }))}`)
          + (v.party ? H.card('Apply to open ' + (rc ? 'invoices' : 'bills'), (v.alloc.length ? v.alloc.map((a, i) => `<div class="fin-row" style="align-items:center;margin-bottom:6px"><div style="flex:2;min-width:150px"><b>${esc(a.number)}</b><br><small style="color:var(--mut)">due ${dmy(a.due)} · open ${n2(a.balance)}</small></div><div class="mb-f" style="flex:1"><input data-ln="alloc:${i}:amount" data-r="1" value="${esc(a.amount)}" inputmode="decimal" placeholder="0.00" style="text-align:right"></div></div>`).join('') + `<div class="fin-diff ${amt && Math.abs(totAlloc - amt) > 0.005 ? 'bad' : 'ok'}"><span>Applied ${n2(totAlloc)}</span><span>${amt ? (totAlloc > amt ? 'More than the amount' : totAlloc < amt ? 'On account ' + n2(amt - totAlloc) : '✓ Fully applied') : ''}</span></div>${H.sbtn('Apply oldest first', 'auto', 'style="width:100%"')}` : H.empty('Nothing open — the amount is kept on account.'))) : '')
          + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('✓ Post', 'postP')}</div>`);
      }
      if (ST.pay) {
        const p = pays.find(x => x.id === ST.pay); if (!p) return busy(d); setTitle((p.type === 'receipt' ? 'Receipt ' : 'Payment ') + p.number);
        return H.head(p.type === 'receipt' ? '💰' : '💸', p.number + ' · ' + money(p.amount), esc(p.party_name) + ' · ' + dmy(p.date) + ' · ' + esc(p.method), COL[p.status])
          + H.card('Details · ' + pill(p.status), `<div class="ei-kv"><span>Account</span><b>${esc(acctName(accts, p.account))}</b></div><div class="ei-kv"><span>Reference</span><b>${esc(p.reference || '—')}</b></div><div class="ei-kv"><span>Journal</span><b>${esc(p.journal || '—')}</b></div>`)
          + H.card('Applied to', table([{ k: 'number', t: 'Document' }, { k: 'amount', t: 'Amount', n: 1 }], p.alloc.map(a => ({ number: a.number, amount: num(a.amount) })), { number: 'On account', amount: F.r2(p.amount - p.alloc.reduce((s, a) => s + num(a.amount), 0)) }))
          + H.bar(H.btn('← All receipts & payments', 'back0', 's'));
      }
      const tab = v.tab || 'all', rows = pays.filter(p => tab === 'all' || p.type === tab);
      setTitle('Receipts & payments');
      return H.head('💱', 'Receipts & payments', 'Money in from customers, money out to suppliers', '#15803d') + busy(d) + needSetup(d)
        + H.tabs('tab', [['all', 'All', pays.length], ['receipt', 'Receipts'], ['payment', 'Payments']], 'all')
        + H.card('', table([{ k: 'no', t: 'No.' }, { k: 'type', t: 'Type' }, { k: 'party', t: 'Party' }, { k: 'date', t: 'Date' }, { k: 'amount', t: 'Amount', n: 1 }], rows.map(p => ({ no: p.number, type: p.type === 'receipt' ? 'Receipt' : 'Payment', party: p.party_name, date: dmy(p.date), amount: p.amount, _tap: p.id })), null, 'open'))
        + H.bar(`<div class="mb-row">${H.btn('＋ Receipt', 'newR')}${H.btn('＋ Payment', 'newP', 's')}</div>`);
    },
    act: {
      toSet, newR(t, v) { ST.pay = 'receipt'; Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; }); render(); }, newP(t, v) { ST.pay = 'payment'; Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; }); render(); },
      open(t) { ST.pay = +t.dataset.i; render(); }, back0() { ST.pay = null; render(); }, cancel(t, v) { ST.pay = null; Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; }); render(); },
      auto(t, v) { let left = num(v.amount); v.alloc.forEach(a => { const x = Math.max(0, Math.min(left, a.balance)); a.amount = x ? String(F.r2(x)) : ''; left = F.r2(left - x); }); render(); },
      async postP(t, v, d) {
        const rc = ST.pay === 'receipt', parties = rc ? (d.cust || []) : (d.sups || []), party = parties.find(p => String(p.id) === String(v.party)), amt = F.r2(num(v.amount)), al = (v.alloc || []).filter(a => num(a.amount));
        const e = []; if (!party) e.push('Choose the ' + (rc ? 'customer' : 'supplier')); if (!(amt > 0)) e.push('Enter the amount'); if (!v.acc) e.push('Choose the bank or cash account');
        if (F.r2(al.reduce((s, a) => s + num(a.amount), 0)) > amt + 0.005) e.push('Applied amounts are more than the payment'); if (al.some(a => num(a.amount) > a.balance + 0.005)) e.push('An applied amount is more than the open balance');
        if (d.set && d.set.lock && v.date <= d.set.lock) e.push('The period is locked up to ' + d.set.lock);
        if (e.length) { v.errs = e; render(); return; }
        if (!confirm('Post this ' + (rc ? 'receipt' : 'payment') + ' of ' + money(amt) + '?')) return;
        try {
          const no = await S.next(rc ? 'receipt' : 'payment', rc ? d.set.rcp : d.set.pay);
          const f = { Title: no, PayNo: no, PayType: ST.pay, PayDate: v.date, PartyType: rc ? 'customer' : 'supplier', PartyId: String(party.id), PartyName: str(party.title), AccountCode: v.acc, Method: v.method || '', Reference: str(v.ref), Amount: amt, Status: 'draft', AllocJson: JSON.stringify(al.map(a => ({ key: a.key, number: a.number, amount: F.r2(num(a.amount)) }))), History: hist([], 'Created') };
          const id = (await S.add('Fin_Payments', f)).id, en = F.fromPayment({ id, number: no, type: ST.pay, date: v.date, party_id: party.id, party_name: str(party.title), account: v.acc, amount: amt, reference: str(v.ref) }, d.map);
          const chk = F.checkEntry(en, d.accts, d.set); if (!chk.ok) throw new Error(chk.errors.join(' · '));
          const r = await S.post(Object.assign(en, { lines: chk.lines }));
          await S.upd('Fin_Payments', id, { Status: 'posted', JournalNo: r.no, History: hist([{ at: iso(), by: me(), text: 'Created' }], 'Posted · ' + r.no) });
          toast('✅ ' + no + ' posted', 'success'); ST.pay = id; Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; }); S.drop('Fin_Payments'); refresh('x_finpay');
        } catch (er) { toast(er.message, 'error'); } } } });

  /* ================= Reports ================= */
  screen('x_finrep', { lines: true, docs: true, bills: true, pays: true, parties: true }, {
    view(v, d) {
      const tab = v.tab || 'tb', accts = d.accts || [], L = d.lines || [], fs = d.set && d.set.fiscalStart;
      if (!v.from) { v.from = F.fyStart(today(), fs); v.to = today(); }
      const head = H.head('📊', 'Reports', 'From the posted ledger · AED', '#0f766e') + busy(d) + needSetup(d)
        + H.tabs('tab', [['tb', 'Trial balance'], ['pl', 'Profit & loss'], ['bs', 'Balance sheet'], ['gl', 'Ledger'], ['ar', 'Receivables'], ['ap', 'Payables'], ['vat', 'VAT 201']], 'tb');
      const range = ['bs', 'ar', 'ap'].includes(tab) ? H.card('', `<div class="fin-row">${H.f('As of', `<input type="date" data-v="to" data-r="1" value="${esc(v.to)}">`)}</div>`) : H.card('', `<div class="fin-row">${H.f('From', `<input type="date" data-v="from" data-r="1" value="${esc(v.from)}">`)}${H.f('To', `<input type="date" data-v="to" data-r="1" value="${esc(v.to)}">`)}${tab === 'gl' ? H.f('Account', H.sel('acc', acctOpts(accts))) : ''}</div>`);
      let cols, rows, foot, title, extra = '';
      if (tab === 'tb') { const tb = F.trialBalance(L, accts, v.from, v.to, fs); title = 'Trial balance ' + dmy(v.from) + ' – ' + dmy(v.to);
        cols = [{ k: 'code', t: 'Code' }, { k: 'name', t: 'Account' }, { k: 'open', t: 'Opening', n: 1 }, { k: 'debit', t: 'Debit', n: 1 }, { k: 'credit', t: 'Credit', n: 1 }, { k: 'close', t: 'Closing', n: 1 }];
        rows = tb.rows.map(r => Object.assign({ _tap: r.code }, r)); foot = { name: tb.balanced ? 'Total — balanced ✓' : 'Total — NOT balanced', debit: tb.totals.debit, credit: tb.totals.credit }; }
      else if (tab === 'pl') { const p = F.pnl(L, accts, v.from, v.to); title = 'Profit & loss ' + dmy(v.from) + ' – ' + dmy(v.to); cols = [{ k: 'code', t: 'Code' }, { k: 'name', t: 'Account' }, { k: 'amount', t: 'AED', n: 1 }];
        rows = [{ name: 'Income', _cls: 'sub' }].concat(p.income).concat([{ name: 'Total income', amount: p.totalIncome, _cls: 'sub' }, { name: 'Expenses', _cls: 'sub' }]).concat(p.expense).concat([{ name: 'Total expenses', amount: p.totalExpense, _cls: 'sub' }, { name: 'Gross profit', amount: p.grossProfit, _cls: 'sub' }]).map(r => Object.assign({ _tap: r.code || null }, r)); foot = { name: 'Net profit', amount: p.netProfit }; }
      else if (tab === 'bs') { const b = F.balanceSheet(L, accts, v.to, fs); title = 'Balance sheet as of ' + dmy(v.to); cols = [{ k: 'code', t: 'Code' }, { k: 'name', t: 'Account' }, { k: 'amount', t: 'AED', n: 1 }];
        rows = [{ name: 'Assets', _cls: 'sub' }].concat(b.assets).concat([{ name: 'Total assets', amount: b.totalAssets, _cls: 'sub' }, { name: 'Liabilities', _cls: 'sub' }]).concat(b.liabilities).concat([{ name: 'Total liabilities', amount: b.totalLiabilities, _cls: 'sub' }, { name: 'Equity', _cls: 'sub' }]).concat(b.equity).map(r => Object.assign({ _tap: r.code || null }, r));
        foot = { name: b.balanced ? 'Liabilities + equity — balanced ✓' : 'Liabilities + equity — NOT balanced', amount: F.r2(b.totalLiabilities + b.totalEquity) }; }
      else if (tab === 'gl') { const acc = v.acc || ST.gl || ''; v.acc = acc; const g = acc ? F.ledger(L, acc, v.from, v.to) : { rows: [], open: 0, close: 0 }; title = 'Ledger ' + acctName(accts, acc) + ' ' + dmy(v.from) + ' – ' + dmy(v.to);
        cols = [{ k: 'date', t: 'Date' }, { k: 'entryNo', t: 'Entry' }, { k: 'description', t: 'Description' }, { k: 'debit', t: 'Debit', n: 1 }, { k: 'credit', t: 'Credit', n: 1 }, { k: 'balance', t: 'Balance', n: 1 }];
        rows = [{ description: 'Opening balance', balance: g.open, _cls: 'sub' }].concat(g.rows.map(r => Object.assign({}, r, { date: dmy(r.date), debit: r.debit || '', credit: r.credit || '' }))); foot = { description: 'Closing balance', balance: g.close }; if (!acc) extra = '<span class="mb-hint">Choose an account above.</span>'; }
      else if (tab === 'ar' || tab === 'ap') { const ty = tab === 'ar' ? 'receipt' : 'payment', docs = tab === 'ar' ? salesOpen(d) : billsOpen(d), al = allocs(d, ty), ag = F.ageing(docs.filter(x => x.date <= v.to), al.list, v.to, al.unapplied);
        title = (tab === 'ar' ? 'Receivables' : 'Payables') + ' ageing as of ' + dmy(v.to); cols = [{ k: 'party', t: tab === 'ar' ? 'Customer' : 'Supplier' }, { k: 'current', t: 'Not due', n: 1 }, { k: 'd30', t: '1–30', n: 1 }, { k: 'd60', t: '31–60', n: 1 }, { k: 'd90', t: '61–90', n: 1 }, { k: 'd90p', t: '90+', n: 1 }, { k: 'unapplied', t: 'On account', n: 1 }, { k: 'total', t: 'Total', n: 1 }];
        rows = ag.rows; foot = Object.assign({ party: 'Total' }, ag.totals);
        extra = ag.open.length ? H.card('Open documents', table([{ k: 'number', t: 'Document' }, { k: 'party', t: 'Party' }, { k: 'due', t: 'Due' }, { k: 'days', t: 'Days late' }, { k: 'balance', t: 'Open', n: 1 }], ag.open.map(o => Object.assign({}, o, { due: dmy(o.due), days: o.days > 0 ? o.days : '—' })))) : ''; }
      else { const vr = F.vat201(salesOpen(d).map(s => Object.assign({}, s, { date: s.date })), (d.bills || []).filter(b => b.status === 'posted').map(b => ({ date: b.bill_date, fx: fxOf(b), lines: F.billTotals({ lines: b.lines }).lines })), v.from, v.to);
        title = 'VAT 201 working ' + dmy(v.from) + ' – ' + dmy(v.to); cols = [{ k: 'box', t: 'Box' }, { k: 'name', t: 'Description' }, { k: 'amount', t: 'Amount', n: 1 }, { k: 'vat', t: 'VAT', n: 1 }];
        rows = Object.entries(vr.box1).map(([em, x]) => ({ box: '1', name: 'Standard rated supplies — ' + (E.C.EMIRATES[em] || em), amount: x.amount, vat: x.vat })).concat([{ box: '4', name: 'Zero rated supplies', amount: vr.box4, vat: '' }, { box: '5', name: 'Exempt supplies', amount: vr.box5, vat: '' }, { box: '8', name: 'Total output', amount: F.r2(Object.values(vr.box1).reduce((s, x) => s + x.amount, 0) + vr.box4 + vr.box5), vat: vr.box1Vat, _cls: 'sub' }, { box: '9', name: 'Standard rated expenses', amount: vr.box9, vat: vr.box9Vat }]);
        foot = { name: vr.payable >= 0 ? 'Net VAT payable (box 14)' : 'Net VAT refundable (box 14)', vat: vr.payable };
        extra = '<span class="mb-hint">Working paper from accepted e-invoices (by customer emirate) and posted bills. Check the emirate split and adjustments before filing on EmaraTax.</span>'; }
      v._rep = { title, cols, rows: rows.map(r => Object.assign({}, r)), foot };
      return head + range + H.card(esc(title), table(cols, rows, foot, tab === 'tb' || tab === 'pl' || tab === 'bs' ? 'gl' : null) + extra) + H.bar(`<div class="mb-row">${H.btn('⬇ CSV', 'csv', 's')}${H.btn('🖨 Print', 'print', 's')}</div>`);
    },
    act: {
      toSet,
      gl(t, v) { if (!t.dataset.i || t.dataset.i === 'null') return; v.acc = t.dataset.i; v.tab = 'gl'; render(); },
      csv(t, v) { const r = v._rep; if (r) csv(r.title.replace(/[^\w\- ]+/g, ''), r.cols, r.rows.concat(r.foot ? [r.foot] : [])); },
      print(t, v) { const r = v._rep; if (!r) return; const tmp = document.createElement('div'); tmp.innerHTML = table(r.cols, r.rows, r.foot); printHtml(r.title, tmp.innerHTML); } } });

  /* ================= Finance settings ================= */
  async function setupLists(defs, onStep) {
    const site = (typeof getGlobalSiteUrl === 'function' && getGlobalSiteUrl()) || ''; if (!site) throw new Error('The SharePoint site address is not set.');
    let tok; if (typeof ms_init === 'function') { const app = await ms_init(), acct = app.getAllAccounts()[0], req = { scopes: ['https://graph.microsoft.com/Sites.Manage.All'] }; try { tok = (await app.acquireTokenSilent(Object.assign({ account: acct }, req))).accessToken; } catch (e) { tok = (await app.acquireTokenPopup(Object.assign({ account: acct }, req))).accessToken; } } else tok = (await A().L('EInv_Company')).token;
    const u = new URL(site), hdr = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, G = 'https://graph.microsoft.com/v1.0/sites/';
    const sr = await fetch(G + u.hostname + (u.pathname.replace(/\/+$/, '') ? ':' + u.pathname.replace(/\/+$/, '') : ''), { headers: hdr }); if (!sr.ok) throw new Error('Site not found (HTTP ' + sr.status + ')');
    const siteId = (await sr.json()).id, out = [];
    for (const [name, cols] of Object.entries(defs)) {
      onStep && onStep(name);
      const lr = await fetch(G + siteId + "/lists?$filter=displayName eq '" + name + "'", { headers: hdr }), found = lr.ok ? ((await lr.json()).value || [])[0] : null;
      if (!found) { const c = await fetch(G + siteId + '/lists', { method: 'POST', headers: hdr, body: JSON.stringify({ displayName: name, columns: cols, list: { template: 'genericList' } }) }); if (!c.ok) { let m = ''; try { m = (await c.json()).error.message; } catch (e) {} throw new Error(name + ': HTTP ' + c.status + ' ' + m); } out.push(name + ' created'); continue; }
      const cr = await fetch(G + siteId + '/lists/' + found.id + '/columns', { headers: hdr }), have = new Set(((cr.ok ? (await cr.json()).value : []) || []).map(c => c.name)); let n = 0;
      for (const col of cols) if (!have.has(col.name)) { const a = await fetch(G + siteId + '/lists/' + found.id + '/columns', { method: 'POST', headers: hdr, body: JSON.stringify(col) }); if (a.ok) n++; }
      out.push(name + (n ? ' — ' + n + ' column(s) added' : ' — OK'));
    }
    return out;
  }
  screen('x_finset', { lines: true }, {
    view(v, d) {
      const tab = v.tab || 'gen', s = d.set || F.settingsFromRow(null), accts = d.accts || [];
      if (!v.__f && !d.busy && d.set) { v.__f = 1; Object.assign(v, { fs: s.fiscalStart, lock: s.lock, jv: s.jv, bill: s.bill, rcp: s.rcp, pay: s.pay, mode: s.mode, server: s.server }); Object.keys(F.MAP_KEYS).forEach(k => { v['m_' + k] = (d.map || {})[k] || ''; }); }
      const head = H.head('⚙️', 'Finance settings', 'Accounts used for postings · lock date · data', '#475569') + busy(d) + H.tabs('tab', [['gen', 'General'], ['map', 'Posting accounts'], ['data', 'Data'], ['setup', 'Set up']], 'gen');
      if (tab === 'setup') return head + H.card('1 · SharePoint lists', `<span class="mb-hint">Creates the finance lists and the e-invoicing lists in your SharePoint site, or adds missing columns. Never deletes data. Needs a site owner.</span>${Object.keys(E.LISTS).concat(F.LIST_NAMES).map(n => `<div class="ei-kv"><span class="ei-mono">${n}</span><b>${(F.LISTS[n] || E.LISTS[n]).length} columns</b></div>`).join('')}${H.btn(v.busy ? '⏳ ' + esc(v.busy) : '🛠 Set up lists', 'setup')}`)
          + H.card('2 · Chart of accounts', accts.length ? `<span class="mb-hint">${accts.length} accounts are in place.</span>` : `<span class="mb-hint">Load the starter UAE chart of accounts (${F.COA.length} accounts: bank, receivables, VAT input/output, sales, expenses …). You can change it afterwards.</span>${H.btn(v.seeding ? '⏳ ' + esc(v.seeding) : '📥 Load the starter chart of accounts', 'seed')}`)
          + (v.out ? H.card('Result', v.out.map(x => `<div class="ei-kv"><b>${esc(x)}</b></div>`).join('')) : '');
      if (tab === 'map') return head + H.card('Accounts the app posts to', Object.entries(F.MAP_KEYS).map(([k, [label]]) => H.f(label, H.sel('m_' + k, acctOpts(accts)))).join('')) + H.bar(H.btn('💾 Save', 'save'));
      if (tab === 'data') return head + H.card('Where the ledger is kept', H.seg('mode', [['sp', '📋 SharePoint lists'], ['server', '🗄 ERP server database']], 'sp')
          + (v.mode === 'server' ? H.f('ERP server address', H.inp('server', { ph: 'https://erp.yourcompany.ae' }), 'The ORBIT ERP server (same server as the ASP gateway). It keeps the ledger in a database and posts each entry in one transaction.') + `<div class="mx-acts">${H.sbtn('🔌 Test server', 'ping')}${H.sbtn(v.copying ? '⏳ ' + esc(v.copying) : '⇢ Copy SharePoint finance data to the server', 'copy')}</div>` : '<span class="mb-hint">Everything is stored in the Fin_* SharePoint lists, like the rest of ORBIT.</span>')
          + `<span class="mb-hint">Finance settings and the e-invoicing lists always stay in SharePoint.</span>`) + (v.out ? H.card('Result', v.out.map(x => `<div class="ei-kv"><b>${esc(x)}</b></div>`).join('')) : '') + H.bar(H.btn('💾 Save', 'save'));
      return head + needSetup(d) + H.card('', `<div class="fin-row">${H.f('Financial year starts (MM-DD)', H.inp('fs', { ph: '01-01' }))}${H.f('Lock date (no postings on or before)', `<input type="date" data-v="lock" value="${esc(v.lock || '')}">`)}</div><div class="fin-row">${H.f('Journal prefix', H.inp('jv'))}${H.f('Bill prefix', H.inp('bill'))}${H.f('Receipt prefix', H.inp('rcp'))}${H.f('Payment prefix', H.inp('pay'))}</div><span class="mb-hint">Base currency: AED.</span>`) + H.bar(H.btn('💾 Save', 'save'));
    },
    act: {
      async save(t, v, d) {
        if (v.fs && !/^\d\d-\d\d$/.test(v.fs)) return toast('Financial year start must look like 01-01', 'warn');
        const map = {}; Object.keys(F.MAP_KEYS).forEach(k => { if (v['m_' + k]) map[k] = v['m_' + k]; });
        const f = { Title: 'Finance', BaseCurrency: 'AED', FiscalStart: v.fs || '01-01', LockDate: v.lock || '', JvPrefix: str(v.jv) || 'JV', BillPrefix: str(v.bill) || 'BILL', RcpPrefix: str(v.rcp) || 'RCP', PayPrefix: str(v.pay) || 'PAY', DataMode: v.mode || 'sp', ServerUrl: str(v.server).replace(/\/+$/, ''), AccMap: JSON.stringify(map) };
        try { const row = d.set && d.set.row; if (row) await A().upd('Fin_Settings', row.id, f); else await A().add('Fin_Settings', f); drop('Fin_Settings'); toast('✅ Finance settings saved', 'success'); v.__f = 0; refresh('x_finset'); } catch (e) { toast('Not saved: ' + e.message, 'error'); } },
      async setup(t, v) { if (v.busy) return; v.busy = 'Starting…'; v.out = null; render();
        try { v.out = await setupLists(Object.assign({}, E.LISTS, F.LISTS), n => { v.busy = n + '…'; render(); }); drop(...F.LIST_NAMES, ...Object.keys(E.LISTS)); toast('✅ Finance lists are ready', 'success'); } catch (e) { v.out = ['✘ ' + e.message]; toast(e.message, 'error'); }
        v.busy = ''; refresh('x_finset'); },
      async seed(t, v, d) { if (v.seeding) return; let k = 0; try { for (const a of F.COA) { v.seeding = a.code + ' ' + a.name; if (++k % 4 === 0) render(); await S.add('Fin_Accounts', F.acctToFields(a)); } S.drop('Fin_Accounts'); toast('✅ ' + F.COA.length + ' accounts loaded', 'success'); } catch (e) { toast(e.message, 'error'); } v.seeding = ''; refresh('x_finset'); },
      async ping(t, v) { try { S.set.server = str(v.server).replace(/\/+$/, ''); const h = await S.ping(); if (!h.ok) throw new Error('no answer'); toast('✅ ' + (h.service || 'server') + ' ' + (h.version || '') + (h.erp ? ' — finance database ready' : ' — finance database NOT available on this server'), h.erp ? 'success' : 'warn'); } catch (e) { toast('Server: ' + e.message, 'error'); } },
      async copy(t, v) { if (v.copying) return; if (!confirm('Copy all finance data (accounts, entries, bills, payments, suppliers) from SharePoint to the server?\n\nDo this once, before switching to the server.')) return;
        v.copying = 'Starting…'; render(); const keep = S.set.mode; try { S.set.server = str(v.server).replace(/\/+$/, ''); S.set.mode = 'sp'; v.out = await S.copyToServer(n => { v.copying = n; render(); }); toast('✅ Copied — now choose ERP server and Save', 'success'); } catch (e) { v.out = ['✘ ' + e.message]; toast(e.message, 'error'); } S.set.mode = keep; v.copying = ''; render(); } } });

  window.FIN_UI = { postEinvoices, bundle, salesOpen, billsOpen, openBalances, table, csv, printHtml, n2, money, acctOpts, acctName, setupLists, version: '1' };
})();
