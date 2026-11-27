/* ============================================================
   ORBIT E-INVOICING — UAE PINT AE invoices on the phone (build 509)
   Plugs into the ORBIT mobile suite (window.MOBXK from js/79-mobile-suite.js); the separate e-invoicing app
   provides the same MOBXK API, so this one file runs in both.
   · data: SharePoint lists EInv_Company, EInv_Customers, EInv_Products, EInv_Documents, EInv_Counters ("Set up lists" creates them)
   · invoices go to the Accredited Service Provider (ASP) — test mode (mock ASP, no server) or through the ASP gateway
   · numbering: one counter row per type and year, updated with an eTag so two phones never get the same number
   · rules, maths and XML come from js/79g0-einv-core.js (window.EINV)
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, E = window.EINV; if (!K || !E) return;
  const { A, reg, D, need, get, drop, H, esc, num, today, addD, dmy, str, fmtN, iso, me, toast, V, render, cur, sheet } = K;
  const C = E.C, L_CO = 'EInv_Company', L_CU = 'EInv_Customers', L_PR = 'EInv_Products', L_DOC = 'EInv_Documents', L_CNT = 'EInv_Counters';
  const ST = { doc: null, edit: null, cn: null, poll: null };          /* which document the hidden screens show (go() clears the screen state) */
  const n2 = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (n, c) => (c || 'AED') + ' ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const COL = { draft: '#64748b', submitted: '#2563eb', validated: '#b45309', delivered: '#0e7490', reported: '#15803d', rejected: '#dc2626' };
  const pill = s => `<span class="mb-pill ei-st" style="--c:${COL[s] || '#64748b'}">${esc(C.STATUS_LABEL[s] || s)}</span>`;
  const setTitle = t => { const el = document.querySelector('#mbTitle'); if (el) el.textContent = t; };
  const go = k => A().go(k);
  const errList = (errs, title) => errs && errs.length ? `<div class="mb-hint mb-bad ei-errs"><b>${esc(title || 'Fix these before sending')}</b>${errs.map(e => `<div><code>${esc(e.rule)}</code> ${esc(e.message)}</div>`).join('')}</div>` : '';

  /* ---------- styles (use the shell's theme variables, so every ORBIT layout and the dark/light switch apply) ---------- */
  const css = document.createElement('style'); css.textContent = `
#mob .ei-st{background:color-mix(in srgb,var(--c) 16%,transparent)!important;color:var(--c)!important;border:0}
#mob .ei-track{display:grid;grid-template-columns:repeat(4,1fr);margin:4px 0 2px}#mob .ei-step{position:relative;padding-top:20px;font-size:11.5px;color:var(--mut);line-height:1.25}
#mob .ei-step:before{content:'';position:absolute;top:6px;left:0;right:0;height:3px;background:var(--line2,var(--line));border-radius:3px}#mob .ei-step:after{content:'';position:absolute;top:1px;left:0;width:13px;height:13px;border-radius:50%;background:var(--card);border:2px solid var(--inpb)}
#mob .ei-step b{display:block;color:var(--hd);font-size:12px}#mob .ei-step.ok:before{background:#16a34a}#mob .ei-step.ok:after{background:#16a34a;border-color:#16a34a}#mob .ei-step.now:after{border-color:var(--acc);box-shadow:0 0 0 4px var(--soft)}#mob .ei-step.bad:after{background:#dc2626;border-color:#dc2626}
#mob .ei-tot{display:flex;justify-content:space-between;padding:6px 2px;font-size:14px;color:var(--tx)}#mob .ei-tot.g{border-top:1px solid var(--line);margin-top:4px;padding-top:10px;font-size:17px;font-weight:800;color:var(--hd)}#mob .ei-tot span:last-child{font-variant-numeric:tabular-nums}
#mob .ei-ln{border:1px solid var(--cardb);border-radius:16px;padding:12px;margin-bottom:10px;background:var(--card2,var(--card))}#mob .ei-ln .mb-row{gap:8px}#mob .ei-lnh{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-weight:700;color:var(--hd);font-size:13px}
#mob .ei-errs{display:block;padding:12px;border-radius:14px;margin:0 0 12px;line-height:1.45}#mob .ei-errs div{margin-top:5px}#mob .ei-errs code{font-size:11px;background:rgba(0,0,0,.12);padding:1px 6px;border-radius:6px;margin-right:4px}
#mob .ei-ok{display:block;padding:12px;border-radius:14px;margin:0 0 12px;background:var(--oks,rgba(22,163,74,.12));color:var(--okc,#15803d);font-weight:600}
#mob pre.ei-xml{background:#0b1220;color:#cfe3da;border-radius:14px;padding:12px;font-size:11px;line-height:1.4;max-height:55vh;overflow:auto;white-space:pre;direction:ltr;text-align:left;-webkit-user-select:text;user-select:text}
#mob .ei-kv{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13.5px}#mob .ei-kv:last-child{border:0}#mob .ei-kv span{color:var(--mut)}#mob .ei-kv b{color:var(--hd);text-align:right;min-width:0;overflow-wrap:anywhere}
#mob .ei-mono{font-family:ui-monospace,Consolas,monospace;font-size:12px}
#mob .ei-flags{display:grid;grid-template-columns:1fr 1fr;gap:6px}#mob .ei-flags button{text-align:left;font-size:12.5px;border:1.5px solid var(--inpb)!important;background:var(--card)!important;color:var(--mut)!important;border-radius:11px!important;padding:8px 10px!important}#mob .ei-flags button.on{border-color:var(--acc)!important;color:var(--acc)!important;background:var(--soft)!important;font-weight:700}
`; document.head.appendChild(css);

  /* ---------- SharePoint helpers ---------- */
  const lists = { co: [L_CO], cu: [L_CU], pr: [L_PR], doc: [L_DOC] };
  const company = d => E.partyFromRow(((d && d.co) || [])[0] || {});
  const coRow = d => ((d && d.co) || [])[0] || null;
  const mode = d => { const r = coRow(d) || {}; return (r.aspmode === 'gateway' && r.gatewayurl) ? 'gateway' : 'mock'; };
  const gwUrl = d => String((coRow(d) || {}).gatewayurl || '').replace(/\/+$/, '');
  const docs = d => ((d && d.doc) || []).map(E.docFromRow).sort((a, b) => b.id - a.id);
  async function fresh(key, f) { return need(key, lists, f); }
  async function addRow(list, f) { const r = await A().add(list, f); drop(list); return r; }
  async function updRow(list, id, f) { const r = await A().upd(list, id, f); drop(list); return r; }
  function hist(doc, text) { const h = (doc.history || []).concat([{ at: iso(), by: me(), text }]); doc.history = h; return JSON.stringify(h.slice(-60)); }
  async function token() { const l = await A().L(L_DOC); return l.token; }
  async function gw(d, method, path, body) {
    const url = gwUrl(d); if (!url) throw new Error('Enter the ASP gateway address in E-invoice settings.');
    const r = await fetch(url + path, { method, headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {} if (!r.ok) throw new Error((j && j.error) || ('Gateway HTTP ' + r.status)); return j; }

  /* next number for a type and year — one row per key in EInv_Counters, updated with If-Match (eTag) so two phones cannot take the same number */
  async function nextNumber(type, prefix) {
    const year = new Date().getFullYear(), key = type + '-' + year, l = await A().L(L_CNT), G = 'https://graph.microsoft.com/v1.0/sites/' + l.siteId + '/lists/' + l.listId + '/items';
    const H0 = { Authorization: 'Bearer ' + l.token, 'Content-Type': 'application/json' };
    const rows = async () => { const r = await fetch(G + '?$expand=fields&$top=999', { headers: H0 }); if (!r.ok) throw new Error('Counter list: HTTP ' + r.status); return ((await r.json()).value || []).filter(x => (x.fields || {}).Title === key).sort((a, b) => a.id - b.id); };
    for (let i = 0; i < 6; i++) {
      const R = await rows();
      if (!R.length) { const c = await fetch(G, { method: 'POST', headers: H0, body: JSON.stringify({ fields: { Title: key, NextNo: 1 } }) }); if (!c.ok) throw new Error('Counter list: HTTP ' + c.status); continue; }
      const it = R[0], n = num(it.fields.NextNo) || 1;
      const p = await fetch(G + '/' + it.id + '/fields', { method: 'PATCH', headers: Object.assign({ 'If-Match': it['@odata.etag'] || '*' }, H0), body: JSON.stringify({ NextNo: n + 1 }) });
      if (p.ok) { R.slice(1).forEach(dup => fetch(G + '/' + dup.id, { method: 'DELETE', headers: H0 }).catch(() => {})); return prefix + '-' + year + '-' + String(n).padStart(5, '0'); }
      if (p.status !== 412 && p.status !== 409) throw new Error('Counter list: HTTP ' + p.status);
      await new Promise(r => setTimeout(r, 200 + Math.random() * 400));
    }
    throw new Error('Could not get an invoice number — try again.');
  }

  /* ---------- document model (seller/buyer live while draft, frozen after sending) ---------- */
  function model(doc, d) {
    const frozen = !['draft', 'rejected'].includes(doc.status) && doc.seller;
    const cu = ((d.cu || []).find(c => String(c.id) === String(doc.customer_id))) || null;
    return Object.assign({}, doc, { seller: frozen ? doc.seller : company(d), buyer: frozen ? doc.buyer : (cu ? E.partyFromRow(cu) : doc.buyer), number: doc.number || 'PENDING', uuid: doc.uuid || E.uuid() });
  }
  const xmlOf = (doc, d) => doc.xml || E.buildXml(model(doc, d));

  async function refreshStatus(doc, d, quiet) {
    if (!doc.asp_ref || ['reported', 'rejected', 'draft'].includes(doc.status) || doc.direction === 'in') return false;
    let s;
    const local = String(doc.asp_ref).startsWith('TEST-');
    try { s = local ? E.mockStatus(doc.submitted_at, doc.notes) : await gw(d, 'GET', '/v1/status/' + encodeURIComponent(doc.asp_ref) + '?poll=1'); }
    catch (e) { if (!quiet) toast(e.message, 'warn'); return false; }
    if (local && s.status !== 'rejected' && (E.STEP[s.status] || 0) > (E.STEP[doc.status] || 0) + 1) { const nx = C.STATUS.find(k => E.STEP[k] === (E.STEP[doc.status] || 0) + 1); s = { status: nx, message: { validated: 'PINT AE validation passed', delivered: 'Delivered to the buyer ASP over Peppol (AS4)' }[nx] || '' }; }   /* show every step */
    if (!s || !s.status || s.status === doc.status || (E.STEP[s.status] || 0) < (E.STEP[doc.status] || 0)) return false;
    const f = { Status: s.status, History: hist(doc, (C.STATUS_LABEL[s.status] || s.status) + (s.message ? ' — ' + s.message : '')) };
    if (s.status === 'rejected') f.Errors = JSON.stringify([{ rule: 'ASP', message: s.message || 'Rejected by the ASP' }]);
    await updRow(L_DOC, doc.id, f); doc.status = s.status; return true;
  }

  async function submit(doc, d) {
    const co = coRow(d); if (!co) throw new Error('Fill in the company profile first (E-invoice settings).');
    const m = model(doc, d), chk = E.validate(m);
    if (!chk.ok) return { errors: chk.errors };
    if (doc.doc_type === 'credit_note') { const orig = docs(d).find(x => x.direction === 'out' && x.doc_type === 'invoice' && x.number === doc.preceding_number); if (orig && E.totals(doc.lines).total > orig.total + 0.001) return { errors: [{ rule: 'CN', message: 'Credit note total is higher than the original invoice (' + money(orig.total, orig.currency) + ')' }] }; }
    m.number = doc.number || await nextNumber(doc.doc_type, doc.doc_type === 'credit_note' ? (co.creditprefix || 'CN') : (co.invoiceprefix || 'INV'));
    m.uuid = doc.uuid || E.uuid();
    const xml = E.buildXml(m), at = iso();
    /* freeze first: number, UUID, parties and XML are stored before anything leaves the phone */
    await updRow(L_DOC, doc.id, { Title: m.number, DocNumber: m.number, DocUUID: m.uuid, Seller: JSON.stringify(m.seller), Buyer: JSON.stringify(m.buyer), CustomerName: m.buyer.name,
      Xml: xml.length <= E.XML_MAX ? xml : '', Status: 'submitted', SubmittedAt: at, SubmittedBy: me(), Errors: '', History: hist(doc, m.number + ' sent to the ASP (' + (mode(d) === 'gateway' ? 'gateway' : 'test mode') + ')') });
    let ref;
    try { ref = mode(d) === 'gateway' ? (await gw(d, 'POST', '/v1/submit', { xml, number: m.number, uuid: m.uuid })).aspRef : 'TEST-' + m.uuid.slice(0, 8).toUpperCase(); }
    catch (e) { await updRow(L_DOC, doc.id, { Status: 'rejected', Errors: JSON.stringify([{ rule: 'ASP', message: e.message }]), History: hist(doc, 'Not accepted: ' + e.message) }); throw e; }
    await updRow(L_DOC, doc.id, { AspRef: ref });
    return { number: m.number, ref };
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'application/xml' }), file = (typeof File === 'function') ? new File([blob], name, { type: type || 'application/xml' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && /Mobi|Android|iPhone/i.test(navigator.userAgent)) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  /* ---------- parse a received PINT AE / UBL invoice ---------- */
  const NS = { cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2', cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2' };
  function parseUbl(xml) {
    const dom = new DOMParser().parseFromString(xml, 'application/xml'); if (dom.getElementsByTagName('parsererror').length) throw new Error('The received file is not valid XML');
    const root = dom.documentElement, kids = (el, ns, n) => [...el.childNodes].filter(c => c.nodeType === 1 && c.namespaceURI === NS[ns] && c.localName === n);
    const one = (el, path) => { let cur = [el]; for (const p of path.split('/')) { const [ns, n] = p.split(':'); cur = cur.flatMap(c => kids(c, ns, n)); if (!cur.length) return ''; } return cur[0].textContent.trim(); };
    const pty = tag => { const p = kids(root, 'cac', tag)[0]; const pp = p && kids(p, 'cac', 'Party')[0]; if (!pp) return {}; return { name: one(pp, 'cac:PartyLegalEntity/cbc:RegistrationName'), trn: one(pp, 'cac:PartyTaxScheme/cbc:CompanyID'), tin: one(pp, 'cbc:EndpointID'), endpoint_id: one(pp, 'cbc:EndpointID'), city: one(pp, 'cac:PostalAddress/cbc:CityName'), emirate: one(pp, 'cac:PostalAddress/cbc:CountrySubentity'), address_line: one(pp, 'cac:PostalAddress/cbc:StreetName') }; };
    const cn = root.localName === 'CreditNote', LN = cn ? 'CreditNoteLine' : 'InvoiceLine', QN = cn ? 'CreditedQuantity' : 'InvoicedQuantity';
    const lines = kids(root, 'cac', LN).map(l => { const it = kids(l, 'cac', 'Item')[0]; const ctc = it && kids(it, 'cac', 'ClassifiedTaxCategory')[0];
      return { description: it ? (one(it, 'cbc:Description') || one(it, 'cbc:Name')) : '', quantity: num(one(l, 'cbc:' + QN)), unit_price: num(one(l, 'cac:Price/cbc:PriceAmount')), vat_category: ctc ? one(ctc, 'cbc:ID') : 'S', class_code: it ? one(it, 'cac:CommodityClassification/cbc:ItemClassificationCode') : '', kind: 'G' }; });
    return { doc_type: cn ? 'credit_note' : 'invoice', number: one(root, 'cbc:ID'), uuid: one(root, 'cbc:UUID'), issue_date: one(root, 'cbc:IssueDate'), due_date: one(root, 'cbc:DueDate'),
      currency: one(root, 'cbc:DocumentCurrencyCode') || 'AED', seller: pty('AccountingSupplierParty'), buyer: pty('AccountingCustomerParty'), lines,
      total: num(one(root, 'cac:LegalMonetaryTotal/cbc:PayableAmount')), vat_total: num(one(root, 'cac:TaxTotal/cbc:TaxAmount')), subtotal: num(one(root, 'cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount')) };
  }
  async function importReceived(xml, ref) {
    const p = parseUbl(xml);
    const f = { Title: p.number, Direction: 'in', DocType: p.doc_type, DocNumber: p.number, DocUUID: p.uuid, IssueDate: p.issue_date, DueDate: p.due_date, Currency: p.currency,
      CustomerName: p.seller.name, Seller: JSON.stringify(p.seller), Buyer: JSON.stringify(p.buyer), LinesJson: JSON.stringify(p.lines), Subtotal: p.subtotal, VatTotal: p.vat_total, Total: p.total,
      Status: 'delivered', AspRef: ref || '', Xml: xml.length <= E.XML_MAX ? xml : '', History: JSON.stringify([{ at: iso(), by: me(), text: 'Received from the supplier through the ASP' }]) };
    return addRow(L_DOC, f);
  }

  /* ---------- the shared form for a party (company or customer) ---------- */
  const emirOpts = Object.entries(C.EMIRATES), legalOpts = Object.entries(C.LEGAL_ID_TYPES).map(([k, t]) => [k, k + ' — ' + t]);
  function partyForm(kind) {
    return H.f('Registered name *', H.inp('name')) + H.f('Name (Arabic)', H.inp('name_ar'))
      + `<div class="mb-row">${H.f('TRN (15 digits)', H.inp('trn', { mode: 'numeric', ph: '100XXXXXXXXX003' }))}${kind === 'customer' ? H.f('Peppol ID (TIN, 10 digits)', H.inp('endpoint_id', { mode: 'numeric', ph: '1XXXXXXXXX' })) : H.f('TIN — your Peppol ID', H.inp('tin', { mode: 'numeric', ph: '1XXXXXXXXX' }))}</div>`
      + (kind === 'customer' ? `<span class="mb-hint">No Peppol ID? Use 9900000098 (buyer not in scope), 9900000099 (export) or 9900000097 (deemed supply).</span>` : '')
      + `<div class="mb-row">${H.f('Legal registration no.', H.inp('legal_id', { ph: 'Trade licence no.' }))}${H.f('Type', H.sel('legal_id_type', legalOpts, { ph: false }))}</div>`
      + H.f('Licensing authority', H.inp('authority_name', { ph: 'e.g. Dubai Economy and Tourism' }))
      + H.f('Address line *', H.inp('address_line')) + `<div class="mb-row">${H.f('City *', H.inp('city'))}${H.f('Emirate *', H.sel('emirate', emirOpts))}</div>`
      + `<div class="mb-row">${H.f('Country', H.inp('country', { ph: 'AE' }))}${H.f('Email', H.inp('email', { type: 'email' }))}</div>`;
  }
  const fill = (v, p) => Object.assign(v, { name: p.name, name_ar: p.name_ar, trn: p.trn, tin: p.tin, endpoint_id: p.endpoint_id, legal_id: p.legal_id, legal_id_type: p.legal_id_type || 'TL', authority_name: p.authority_name, address_line: p.address_line, city: p.city, emirate: p.emirate, country: p.country || 'AE', email: p.email, iban: p.iban });
  const fromV = v => ({ name: str(v.name), name_ar: str(v.name_ar), trn: str(v.trn), tin: str(v.tin), endpoint_id: str(v.endpoint_id), legal_id: str(v.legal_id), legal_id_type: v.legal_id_type || 'TL', authority_name: str(v.authority_name), address_line: str(v.address_line), city: str(v.city), emirate: v.emirate || '', country: str(v.country) || 'AE', email: str(v.email), iban: str(v.iban).replace(/\s+/g, ''), phone: str(v.phone) });
  const setupHint = d => d && d.err && /not found/i.test(d.err) ? H.card('', `<div class="mb-hint mb-bad">The e-invoicing lists are not in SharePoint yet.</div>${H.btn('⚙️ Open E-invoice settings → Set up lists', 'toSet')}`) : '';
  const toSet = () => go('x_eiset');

  /* ================= Invoices list ================= */
  async function catchUp(key, d) {   /* invoices still with the ASP: ask for their status (a few at a time), then reload once */
    const open = docs(d).filter(x => x.direction === 'out' && x.asp_ref && ['submitted', 'validated', 'delivered'].includes(x.status)).slice(0, 10); let changed = 0;
    for (const x of open) for (let i = 0; i < 4; i++) { if (!(await refreshStatus(x, d, true))) break; changed++; }
    if (changed && cur() === key) fresh(key, true);
  }
  reg('x_eilist', { lists, load(v, f) { if (!v.tab) v.tab = 'all'; fresh('x_eilist', f).then(d => catchUp('x_eilist', d)); },
    view(v, d) {
      const all = docs(d).filter(x => x.direction === 'out'), q = String(v.q || '').toLowerCase(), t = v.tab;
      const rows = all.filter(x => (t === 'all' || (t === 'draft' ? ['draft', 'rejected'].includes(x.status) : t === 'cn' ? x.doc_type === 'credit_note' : t === 'sent' ? ['submitted', 'validated', 'delivered'].includes(x.status) : x.status === t)) && (!q || (x.number + ' ' + x.customer_name).toLowerCase().includes(q)));
      const n = s => all.filter(x => x.status === s).length;
      return H.head('🧾', 'Invoices', 'Tax invoices & credit notes · PINT AE', '#1d4ed8') + H.load(d) + setupHint(d)
        + H.kpis([['Drafts', n('draft') + n('rejected'), 'o'], ['With ASP', n('submitted') + n('validated') + n('delivered')], ['At FTA', n('reported'), 'g']])
        + H.search('q', 'Search number or customer') + H.tabs('tab', [['all', 'All', all.length], ['draft', 'To send'], ['sent', 'With ASP'], ['reported', 'Reported'], ['cn', 'Credit notes']], 'all')
        + (rows.length ? H.card('', rows.map(x => H.li({ x: 'open', i: x.id, ic: x.doc_type === 'credit_note' ? '↺' : '🧾', c: COL[x.status], t: x.number || 'Draft', s: (x.customer_name || '—'), s2: dmy(x.issue_date) + (x.doc_type === 'credit_note' ? ' · credit note' : ''), v: `<b>${money(x.total, x.currency)}</b><br>${pill(x.status)}` })).join('')) : H.card('', H.empty(all.length ? 'Nothing matches.' : 'No invoices yet.')))
        + H.bar(H.btn('＋ New invoice', 'new'));
    },
    act: { open(t) { ST.doc = +t.dataset.i; go('x_eidoc'); }, new() { ST.edit = null; ST.cn = null; go('x_einew'); }, toSet } });

  /* ================= New / edit invoice or credit note ================= */
  const blankLine = () => ({ description: '', kind: 'G', class_code: '', unit_code: 'H87', quantity: '1', unit_price: '', discount: '', vat_category: 'S', exemption_reason: '' });
  reg('x_einew', { lists,
    load(v, f) {
      fresh('x_einew', f).then(d => {
        if (v.__init) return; v.__init = 1;
        const src = ST.edit ? docs(d).find(x => x.id === ST.edit) : ST.cn ? docs(d).find(x => x.id === ST.cn) : null;
        if (src && ST.edit) Object.assign(v, { type: src.doc_type, cust: String(src.customer_id || ''), issue: src.issue_date, due: src.due_date, cur: src.currency, fx: src.fx_rate || '', notes: src.notes, reason: src.credit_reason, prev: src.preceding_number, flags: src.transaction_flags, lines: src.lines.map(l => Object.assign(blankLine(), l)) });
        else if (src && ST.cn) Object.assign(v, { type: 'credit_note', cust: String(src.customer_id || ''), issue: today(), cur: src.currency, fx: src.fx_rate || '', notes: 'Credit note for ' + src.number, prev: src.number, reason: '', flags: '00000000', lines: src.lines.map(l => Object.assign(blankLine(), l)) });
        else Object.assign(v, { type: 'invoice', issue: today(), due: addD(today(), 30), cur: 'AED', flags: '00000000', lines: [blankLine()] });
        if (!v.cust && (d.cu || []).length === 1) v.cust = String(d.cu[0].id);   /* one customer → already chosen */
        render(); });
    },
    view(v, d) {
      if (!v.lines) return H.head('🧾', 'New invoice', '', '#1d4ed8') + H.load(d) + setupHint(d);
      const cn = v.type === 'credit_note', cus = d.cu || [], prods = d.pr || [], t = E.totals(v.lines), cu = v.cur || 'AED';
      setTimeout(() => setTitle(ST.edit ? (cn ? 'Edit credit note' : 'Edit invoice') : cn ? 'New credit note' : 'New invoice'), 0);
      if (!coRow(d) && !d.busy) return H.head('🏢', 'Company profile needed', 'Your company is the seller on every invoice', '#b45309') + H.card('', H.btn('⚙️ Fill in the company profile', 'toSet'));
      if (!cus.length && !d.busy) return H.head('👥', 'Add a customer first', 'The buyer on the invoice', '#b45309') + H.card('', H.btn('＋ Add a customer', 'toCust'));
      return H.head(cn ? '↺' : '🧾', cn ? 'Credit note' : 'Tax invoice', cn ? 'Against invoice ' + esc(v.prev || '') : 'Type 380 · number is given when you send', cn ? '#7c3aed' : '#1d4ed8') + errList(v.errs)
        + H.card('Customer & dates', H.f('Customer', H.sel('cust', cus.map(c => [String(c.id), str(c.title)]))) + `<div class="mb-row">${H.f('Issue date', H.date('issue'))}${cn ? H.f('Reason code', H.inp('reason', { ph: 'e.g. VD' })) : H.f('Due date', H.date('due'))}</div>`
          + `<div class="mb-row">${H.f('Currency', H.sel('cur', ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'INR'], { ph: false }))}${cu !== 'AED' ? H.f('Rate → AED', H.num('fx', { ph: '3.6725' })) : ''}</div>`
          + (v.showFlags ? `<div class="mb-f"><label>Transaction type (special cases)</label><div class="ei-flags">${C.FLAGS.map((f, i) => `<button type="button" data-x="flag" data-i="${i}" class="${(v.flags || '')[i] === '1' ? 'on' : ''}">${esc(f)}</button>`).join('')}</div></div>` : H.sbtn('Special transaction type…', 'showFlags')))
        + H.card('Lines · ' + v.lines.length, v.lines.map((l, i) => `<div class="ei-ln"><div class="ei-lnh"><span>Line ${i + 1}</span>${v.lines.length > 1 ? `<button type="button" class="mx-sb r" data-x="delLine" data-i="${i}">✕</button>` : ''}</div>
            ${prods.length ? `<div class="mb-f"><select data-i="${i}" class="ei-pick"><option value="">— pick a saved item —</option>${prods.map(p => `<option value="${p.id}">${esc(str(p.title))} · ${money(p.price)}</option>`).join('')}</select></div>` : ''}
            <div class="mb-f"><input data-ln="lines:${i}:description" value="${esc(l.description)}" placeholder="Description *"></div>
            <div class="mb-row"><div class="mb-f"><select data-ln="lines:${i}:kind" data-r="1"><option value="G"${l.kind !== 'S' ? ' selected' : ''}>Goods · HS</option><option value="S"${l.kind === 'S' ? ' selected' : ''}>Service · SAC</option></select></div><div class="mb-f"><input data-ln="lines:${i}:class_code" value="${esc(l.class_code)}" inputmode="numeric" placeholder="${l.kind === 'S' ? 'SAC code' : 'HS code'}"></div></div>
            <div class="mb-row"><div class="mb-f"><label>Qty</label><input data-ln="lines:${i}:quantity" data-r="1" value="${esc(l.quantity)}" inputmode="decimal"></div><div class="mb-f"><label>Unit price</label><input data-ln="lines:${i}:unit_price" data-r="1" value="${esc(l.unit_price)}" inputmode="decimal"></div><div class="mb-f"><label>Discount</label><input data-ln="lines:${i}:discount" data-r="1" value="${esc(l.discount)}" inputmode="decimal"></div></div>
            <div class="mb-row"><div class="mb-f"><select data-ln="lines:${i}:vat_category" data-r="1">${Object.entries(C.VAT).map(([k, x]) => `<option value="${k}"${l.vat_category === k ? ' selected' : ''}>${k} · ${esc(x.label)}</option>`).join('')}</select></div>${l.vat_category === 'E' ? `<div class="mb-f"><input data-ln="lines:${i}:exemption_reason" value="${esc(l.exemption_reason)}" placeholder="Exemption reason code"></div>` : ''}</div>
            <div class="ei-tot"><span>Net</span><b>${money(t.lines[i].net_amount, cu)}</b></div></div>`).join('') + H.sbtn('＋ Add line', 'addLine', 'style="width:100%"'))
        + H.card('Totals', `<div class="ei-tot"><span>Subtotal</span><span>${money(t.subtotal, cu)}</span></div>${t.breakdown.map(g => `<div class="ei-tot"><span>VAT ${g.category}${g.rate ? ' ' + g.rate + '%' : ''}</span><span>${money(g.tax, cu)}</span></div>`).join('')}<div class="ei-tot g"><span>Total</span><span>${money(t.total, cu)}</span></div>${cu !== 'AED' && num(v.fx) ? `<div class="ei-tot"><span>≈ AED</span><span>${money(t.total * num(v.fx))}</span></div>` : ''}`)
        + H.card('Notes', H.txt('notes', 'Shown on the invoice'))
        + H.bar(`<div class="mb-row">${H.btn('💾 Save draft', 'save', 's')}${H.btn('Save & check ›', 'saveCheck')}</div>`);
    },
    after(v) { document.querySelectorAll('#mob .ei-pick').forEach(s => { s.onchange = () => { const d = D.x_einew || {}, p = (d.pr || []).find(x => String(x.id) === s.value), l = v.lines[+s.dataset.i]; if (!p || !l) return;
      Object.assign(l, { description: str(p.title), kind: str(p.kind) || 'G', class_code: str(p.classcode), unit_code: str(p.unitcode) || 'H87', unit_price: String(num(p.price)), vat_category: str(p.vatcategory) || 'S', exemption_reason: str(p.exemptionreason), item_code: str(p.itemcode) }); render(); }; }); },
    act: {
      toSet, toCust() { go('x_eicust'); },
      showFlags(t, v) { v.showFlags = 1; render(); },
      flag(t, v) { const a = (v.flags || '00000000').split(''); a[+t.dataset.i] = a[+t.dataset.i] === '1' ? '0' : '1'; v.flags = a.join(''); render(); },
      addLine(t, v) { v.lines.push(blankLine()); render(); }, delLine(t, v) { v.lines.splice(+t.dataset.i, 1); render(); },
      async save(t, v, d) { await saveDoc(v, d, false); }, async saveCheck(t, v, d) { await saveDoc(v, d, true); } } });

  async function saveDoc(v, d, thenOpen) {
    if (!v.cust) return toast('Choose the customer.', 'warn');
    const cu = (d.cu || []).find(c => String(c.id) === String(v.cust));
    const doc = { doc_type: v.type, customer_id: v.cust, customer_name: cu ? str(cu.title) : '', issue_date: v.issue || today(), due_date: v.type === 'credit_note' ? '' : v.due, currency: v.cur || 'AED', fx_rate: v.cur !== 'AED' ? v.fx : null,
      transaction_flags: v.flags || '00000000', preceding_number: v.prev || '', credit_reason: str(v.reason), notes: v.notes || '', status: 'draft', lines: v.lines.filter(l => str(l.description) || num(l.unit_price)) };
    if (!doc.lines.length) return toast('Add at least one line.', 'warn');
    const f = E.docToFields(doc);
    try {
      let id = ST.edit;
      if (id) { const old = docs(d).find(x => x.id === id); f.History = hist(old || {}, 'Draft edited'); delete f.Title; delete f.DocNumber; if (old && old.number) { f.Title = old.number; f.DocNumber = old.number; } await updRow(L_DOC, id, f); }
      else { f.History = JSON.stringify([{ at: iso(), by: me(), text: 'Draft created' }]); const r = await addRow(L_DOC, f); id = r && +r.id; }
      toast('✅ Draft saved to SharePoint', 'success'); drop(L_DOC);
      ST.doc = id; ST.edit = null; ST.cn = null; ST.check = thenOpen; go('x_eidoc');
    } catch (e) { toast('Not saved: ' + e.message, 'error'); }
  }

  /* ================= Invoice detail ================= */
  reg('x_eidoc', { lists,
    load(v, f) { fresh('x_eidoc', f).then(d => { const doc = docs(d).find(x => x.id === ST.doc); if (doc && ST.check && ['draft', 'rejected'].includes(doc.status)) { ST.check = 0; v.chk = E.validate(model(doc, d)); render(); } }); },
    view(v, d) {
      const doc = docs(d).find(x => x.id === ST.doc);
      if (!doc) return H.load(d) + (d.busy ? '' : H.card('', H.empty('This document is not in the list any more.')));
      const m = doc.direction === 'out' ? model(doc, d) : doc, t = E.totals(doc.lines), cu = doc.currency, editable = doc.direction === 'out' && ['draft', 'rejected'].includes(doc.status), cn = doc.doc_type === 'credit_note';
      setTimeout(() => setTitle((cn ? 'Credit note ' : 'Invoice ') + (doc.number || '(draft)')), 0);
      const pos = E.STEP[doc.status] || 0, steps = [['Your ASP', 'Corner 2'], ['PINT AE check', 'Corner 2'], ["Buyer's ASP", 'Corner 3 → 4'], ['FTA', 'Corner 5']];
      const track = `<div class="ei-track">${steps.map((s, i) => { const c = doc.status === 'rejected' ? (i === 0 ? 'ok' : i === 1 ? 'bad' : '') : pos >= i + 1 ? 'ok' : (pos > 0 && pos === i) ? 'now' : ''; return `<div class="ei-step ${c}"><b>${s[0]}</b>${s[1]}</div>`; }).join('')}</div>`;
      const party = (p, title) => p ? `<div class="ei-kv"><span>${title}</span><b>${esc(p.name || '—')}</b></div><div class="ei-kv"><span>TRN</span><b class="ei-mono">${esc(p.trn || '—')}</b></div><div class="ei-kv"><span>Peppol ID</span><b class="ei-mono">0235:${esc(p.tin || p.endpoint_id || '—')}</b></div>` : '';
      const chk = v.chk;
      return H.head(cn ? '↺' : '🧾', (doc.number || 'Draft') + ' · ' + money(doc.total, cu), (doc.direction === 'in' ? 'Received from ' + esc(doc.customer_name) : esc(doc.customer_name || '')) + ' · ' + dmy(doc.issue_date), COL[doc.status] || '#1d4ed8')
        + (doc.status === 'rejected' ? errList(doc.errors, 'Rejected — fix and send again') : '') + (chk ? (chk.ok ? `<div class="ei-ok">✓ Ready to send — all PINT AE pre-checks passed.${chk.warnings.map(w => '<br>⚠ ' + esc(w.message)).join('')}</div>` : errList(chk.errors)) : '')
        + (doc.direction === 'out' ? H.card('Status · ' + pill(doc.status), track + (doc.asp_ref ? `<div class="ei-kv"><span>ASP reference</span><b class="ei-mono">${esc(doc.asp_ref)}</b></div>` : '') + (doc.uuid ? `<div class="ei-kv"><span>UUID</span><b class="ei-mono">${esc(doc.uuid)}</b></div>` : '<span class="mb-hint">The number and UUID are given when you send.</span>')) : '')
        + H.card('Parties', party(m.seller, 'From') + party(m.buyer, 'To'))
        + H.card('Lines', doc.lines.map((l, i) => `<div class="mx-line"><b>${i + 1}. ${esc(l.description)}</b><span>${money(t.lines[i].net_amount, cu)}</span><small>${fmtN(l.quantity, 3)} × ${money(l.unit_price, cu)}${num(l.discount) ? ' − ' + money(l.discount, cu) : ''} · VAT ${esc(l.vat_category)}${l.class_code ? ' · ' + (l.kind === 'S' ? 'SAC ' : 'HS ') + esc(l.class_code) : ''}</small></div>`).join('')
          + `<div class="ei-tot"><span>Subtotal</span><span>${money(t.subtotal, cu)}</span></div>${t.breakdown.map(g => `<div class="ei-tot"><span>VAT ${g.category}${g.rate ? ' ' + g.rate + '%' : ''} on ${money(g.taxable, cu)}</span><span>${money(g.tax, cu)}</span></div>`).join('')}<div class="ei-tot g"><span>Total</span><span>${money(doc.direction === 'in' ? doc.total : t.total, cu)}</span></div>`)
        + (doc.preceding_number || doc.notes ? H.card('', (doc.preceding_number ? `<div class="ei-kv"><span>Original invoice</span><b class="ei-mono">${esc(doc.preceding_number)}</b></div>` : '') + (doc.credit_reason ? `<div class="ei-kv"><span>Reason</span><b>${esc(doc.credit_reason)}</b></div>` : '') + (doc.notes ? `<div class="ei-kv"><span>Notes</span><b>${esc(doc.notes)}</b></div>` : '')) : '')
        + H.card('History', (doc.history || []).slice().reverse().map(h => `<div class="ei-kv"><span>${esc(dmy(h.at))} ${esc(String(h.at).slice(11, 16))}</span><b>${esc(h.text)}${h.by ? ' · ' + esc(h.by) : ''}</b></div>`).join('') || H.empty('—'))
        + (v.showXml ? H.card('PINT AE XML', `<pre class="ei-xml">${esc(xmlOf(doc, d))}</pre>`) : '')
        + H.bar(editable
          ? `<div class="mb-row">${H.btn('✏️ Edit', 'edit', 's')}${H.btn('✓ Check', 'check', 's')}${H.btn('📤 Send', 'send')}</div><div class="mx-acts">${H.sbtn(v.showXml ? 'Hide XML' : 'Show XML', 'xml')}${H.sbtn('⬇ XML', 'dl')}${!doc.number ? H.sbtn('🗑 Delete draft', 'del', '', 'r') : ''}</div>`
          : `<div class="mx-acts">${doc.direction === 'out' && !['reported', 'rejected'].includes(doc.status) ? H.sbtn('↻ Refresh status', 'refresh', '', 'p') : ''}${doc.direction === 'out' && !cn && doc.number ? H.sbtn('↺ Credit note', 'cn') : ''}${H.sbtn(v.showXml ? 'Hide XML' : 'Show XML', 'xml')}${H.sbtn('⬇ XML', 'dl')}</div>`);
    },
    after(v, d) {   /* live status while the ASP is working */
      clearInterval(ST.poll); const doc = docs(d).find(x => x.id === ST.doc);
      if (doc && doc.direction === 'out' && ['submitted', 'validated', 'delivered'].includes(doc.status)) ST.poll = setInterval(async () => { if (cur() !== 'x_eidoc') return clearInterval(ST.poll); const dd = D.x_eidoc || {}, x = docs(dd).find(y => y.id === ST.doc); if (x && await refreshStatus(x, dd, true)) { clearInterval(ST.poll); fresh('x_eidoc', true); } }, 2500);
    },
    act: {
      edit() { ST.edit = ST.doc; ST.cn = null; go('x_einew'); },
      check(t, v, d) { const doc = docs(d).find(x => x.id === ST.doc); v.chk = E.validate(model(doc, d)); render(); if (!v.chk.ok) toast('Fix the problems shown at the top.', 'warn'); },
      async send(t, v, d) {
        const doc = docs(d).find(x => x.id === ST.doc); const chk = E.validate(model(doc, d)); v.chk = chk; if (!chk.ok) { render(); return toast('Fix the problems shown at the top.', 'warn'); }
        if (!confirm('Send ' + (doc.doc_type === 'credit_note' ? 'this credit note' : 'this invoice') + ' to your ASP?\n\nIt gets its final number and can no longer be edited.' + (mode(d) === 'mock' ? '\n\n(Test mode — nothing reaches the FTA.)' : ''))) return;
        t.disabled = true; t.textContent = '⏳ Sending…';
        try { const r = await submit(doc, d); if (r.errors) { v.chk = { ok: false, errors: r.errors, warnings: [] }; render(); return; } v.chk = null; toast('📤 ' + r.number + ' sent to the ASP', 'success'); fresh('x_eidoc', true); }
        catch (e) { toast('Not sent: ' + e.message, 'error'); fresh('x_eidoc', true); }
      },
      async refresh(t, v, d) { const doc = docs(d).find(x => x.id === ST.doc); if (await refreshStatus(doc, d)) fresh('x_eidoc', true); else toast('No change yet — ' + (C.STATUS_LABEL[doc.status] || doc.status), 'info'); },
      cn() { ST.cn = ST.doc; ST.edit = null; go('x_einew'); },
      xml(t, v) { v.showXml = !v.showXml; render(); },
      dl(t, v, d) { const doc = docs(d).find(x => x.id === ST.doc); download((doc.number || 'draft-' + doc.id) + '.xml', xmlOf(doc, d)); },
      async del(t, v, d) { const doc = docs(d).find(x => x.id === ST.doc); if (!confirm('Delete this draft?')) return; try { const l = await A().L(L_DOC); const r = await fetch('https://graph.microsoft.com/v1.0/sites/' + l.siteId + '/lists/' + l.listId + '/items/' + doc.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + l.token } }); if (!r.ok && r.status !== 204) throw new Error('HTTP ' + r.status); drop(L_DOC); toast('Draft deleted', 'success'); go('x_eilist'); } catch (e) { toast(e.message, 'error'); } } } });

  /* ================= Received invoices (inbox) ================= */
  reg('x_eiinbox', { lists, load(v, f) { fresh('x_eiinbox', f); },
    view(v, d) {
      const rows = docs(d).filter(x => x.direction === 'in');
      return H.head('📥', 'Received', 'Invoices your suppliers sent you over Peppol', '#0e7490') + H.load(d) + setupHint(d)
        + H.card('', mode(d) === 'gateway' ? `<span class="mb-hint">New invoices wait at the ASP gateway until you fetch them.</span>${H.btn('⇣ Fetch new invoices', 'fetch')}` : `<span class="mb-hint">Test mode: create a sample supplier invoice to see how receiving works.</span>${H.btn('＋ Simulate a supplier invoice', 'sim', 's')}`)
        + (rows.length ? H.card('', rows.map(x => H.li({ x: 'open', i: x.id, ic: '📥', c: '#0e7490', t: x.number || '—', s: x.customer_name || 'Supplier', s2: dmy(x.issue_date) + ' · VAT ' + money(x.vat_total, x.currency), v: `<b>${money(x.total, x.currency)}</b>` })).join('')) : H.card('', H.empty('Nothing received yet.')));
    },
    act: {
      open(t) { ST.doc = +t.dataset.i; go('x_eidoc'); },
      async fetch(t, v, d) { try { const items = await gw(d, 'GET', '/v1/inbox'); let n = 0; for (const it of items) { await importReceived(it.xml, it.asp_ref); await gw(d, 'POST', '/v1/inbox/' + it.id + '/ack'); n++; } toast(n ? '📥 ' + n + ' invoice(s) received' : 'Nothing new', n ? 'success' : 'info'); fresh('x_eiinbox', true); } catch (e) { toast(e.message, 'error'); } },
      async sim(t, v, d) { const co = company(d); if (!co.name) return toast('Fill in the company profile first.', 'warn');
        const sup = { name: 'Gulf Stationery LLC', trn: '100987654300003', tin: '1009876543', legal_id: 'TL-55102', legal_id_type: 'TL', authority_name: 'Dubai Economy and Tourism', address_line: 'Al Quoz 3', city: 'Dubai', emirate: 'DXB', iban: 'AE460260001015333439101' };
        const xml = E.buildXml({ doc_type: 'invoice', number: 'GS-' + (10000 + Math.floor(Math.random() * 89999)), uuid: E.uuid(), issue_date: today(), due_date: addD(today(), 30), seller: sup, buyer: Object.assign({}, co, { endpoint_id: co.tin }),
          lines: [{ description: 'A4 copy paper (box)', kind: 'G', class_code: '48025690', quantity: 10, unit_price: 95, vat_category: 'S' }, { description: 'Printer toner', kind: 'G', class_code: '84439990', quantity: 2, unit_price: 310, vat_category: 'S' }] });
        try { await importReceived(xml, 'MOCK-IN-' + Date.now()); toast('📥 Supplier invoice received (test)', 'success'); fresh('x_eiinbox', true); } catch (e) { toast(e.message, 'error'); } } } });

  /* ================= Customers & items (one generic master-data screen) ================= */
  function master(key, list, cfg) {
    reg(key, { lists, load(v, f) { fresh(key, f); },
      view(v, d) {
        const rows = (d[cfg.k] || []).slice().sort((a, b) => str(a.title).localeCompare(str(b.title))), q = String(v.q || '').toLowerCase();
        if (v.form) return H.head(cfg.ic, (v.id ? 'Edit ' : 'New ') + cfg.one, '', cfg.c) + errList(v.errs, 'Please check') + H.card('', cfg.form(v)) + H.bar(`<div class="mb-row">${H.btn('Cancel', 'cancel', 's')}${H.btn('💾 Save', 'save')}</div>`);
        return H.head(cfg.ic, cfg.title, cfg.sub, cfg.c) + H.load(d) + setupHint(d) + H.search('q', 'Search')
          + (rows.length ? H.card('', rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q)).map(r => H.li(Object.assign({ x: 'edit', i: r.id, ic: cfg.ic, c: cfg.c }, cfg.li(r)))).join('')) : H.card('', H.empty('Nothing yet.')))
          + H.bar(H.btn('＋ ' + cfg.add, 'add'));
      },
      act: {
        toSet,
        add(t, v) { Object.keys(v).forEach(k => { if (k !== '__l') delete v[k]; }); Object.assign(v, cfg.blank()); v.form = 1; render(); },
        edit(t, v, d) { const r = (d[cfg.k] || []).find(x => String(x.id) === t.dataset.i); if (!r) return; cfg.fill(v, r); v.id = r.id; v.form = 1; render(); },
        cancel(t, v) { v.form = 0; v.errs = null; render(); },
        async save(t, v) { const errs = cfg.check(v); if (errs.length) { v.errs = errs; render(); return; } try { const f = cfg.fields(v); if (v.id) await updRow(list, v.id, f); else await addRow(list, f); toast('✅ Saved to SharePoint', 'success'); v.form = 0; v.errs = null; fresh(key, true); } catch (e) { toast('Not saved: ' + e.message, 'error'); } } } });
  }
  master('x_eicust', L_CU, { k: 'cu', ic: '👥', c: '#7c3aed', title: 'Customers', sub: 'Buyers with their TRN and Peppol ID', one: 'customer', add: 'New customer',
    li: r => ({ t: str(r.title), s: 'TRN ' + (str(r.trn) || '—') + ' · Peppol ' + (str(r.endpointid) || '—'), s2: [str(r.city), C.EMIRATES[str(r.emirate)]].filter(Boolean).join(', ') }),
    blank: () => ({ legal_id_type: 'TL', country: 'AE' }), fill: (v, r) => fill(v, E.partyFromRow(r)), form: () => partyForm('customer'),
    check: v => { const p = fromV(v), e = []; if (!p.name) e.push({ rule: 'IBT-044', message: 'Name is required' }); if (p.trn && !E.TRN_RE.test(p.trn)) e.push({ rule: 'IBR-132-AE', message: 'TRN must be 15 digits, start with 1 and end with 03' }); if (p.endpoint_id && !E.TIN_RE.test(p.endpoint_id) && !Object.values(C.PREDEFINED).includes(p.endpoint_id)) e.push({ rule: 'IBT-049', message: 'Peppol ID must be a 10-digit TIN or 9900000097/98/99' }); return e; },
    fields: v => E.partyToFields(fromV(v), 'customer') });
  master('x_eiprod', L_PR, { k: 'pr', ic: '📦', c: '#0369a1', title: 'Products & services', sub: 'Saved items with HS / SAC code and VAT', one: 'item', add: 'New item',
    li: r => ({ t: str(r.title), s: (str(r.kind) === 'S' ? 'Service · SAC ' : 'Goods · HS ') + (str(r.classcode) || '—') + ' · VAT ' + (str(r.vatcategory) || 'S'), v: `<b>${money(r.price)}</b>` }),
    blank: () => ({ kind: 'G', vat: 'S', unit: 'H87' }), fill: (v, r) => Object.assign(v, { name: str(r.title), name_ar: str(r.namear), kind: str(r.kind) || 'G', code: str(r.classcode), unit: str(r.unitcode) || 'H87', price: String(num(r.price)), vat: str(r.vatcategory) || 'S', exr: str(r.exemptionreason), item: str(r.itemcode) }),
    form: v => H.f('Name *', H.inp('name')) + H.f('Name (Arabic)', H.inp('name_ar')) + H.f('Type', H.seg('kind', [['G', 'Goods · HS code'], ['S', 'Service · SAC code']], 'G'))
      + `<div class="mb-row">${H.f(v.kind === 'S' ? 'SAC code' : 'HS code', H.inp('code', { mode: 'numeric' }))}${H.f('Unit', H.inp('unit', { ph: 'H87 piece · HUR hour' }))}</div>`
      + `<div class="mb-row">${H.f('Unit price (AED)', H.num('price'))}${H.f('VAT', H.sel('vat', Object.entries(C.VAT).map(([k, x]) => [k, k + ' · ' + x.label]), { ph: false }))}</div>` + (v.vat === 'E' ? H.f('Exemption reason code', H.inp('exr')) : '') + (v.kind !== 'S' && window.INV ? H.f('Stock item code (inventory)', H.inp('item', { ph: 'optional — sales of this product take it out of stock' })) : ''),
    check: v => { const e = []; if (!str(v.name)) e.push({ rule: 'IBT-153', message: 'Name is required' }); if (!/^\d{4,}$/.test(str(v.code))) e.push({ rule: v.kind === 'S' ? 'IBR-185-AE' : 'IBR-184-AE', message: (v.kind === 'S' ? 'SAC' : 'HS') + ' code is required (digits)' }); return e; },
    fields: v => ({ Title: str(v.name), NameAr: str(v.name_ar), Kind: v.kind || 'G', ClassCode: str(v.code), UnitCode: str(v.unit) || 'H87', Price: num(v.price), VatCategory: v.vat || 'S', ExemptionReason: v.vat === 'E' ? str(v.exr) : '', ItemCode: v.kind !== 'S' ? str(v.item) : '' }) });

  /* ================= VAT summary ================= */
  reg('x_eivat', { lists, load(v, f) { if (!v.m) v.m = today().slice(0, 7); fresh('x_eivat', f); },
    view(v, d) {
      const all = docs(d).filter(x => String(x.issue_date).slice(0, 7) === v.m), aed = x => num(x.fx_rate) || 1, sign = x => x.doc_type === 'credit_note' ? -1 : 1;
      const out = all.filter(x => x.direction === 'out' && ['validated', 'delivered', 'reported'].includes(x.status)), inn = all.filter(x => x.direction === 'in');
      const net = out.reduce((s, x) => s + sign(x) * x.subtotal * aed(x), 0), ov = out.reduce((s, x) => s + sign(x) * x.vat_total * aed(x), 0), iv = inn.reduce((s, x) => s + sign(x) * x.vat_total * aed(x), 0);
      const pend = docs(d).filter(x => x.direction === 'out' && ['submitted'].includes(x.status)).length;
      return H.head('📊', 'VAT summary', 'Accepted sales and received purchases for the month', '#15803d') + H.load(d) + setupHint(d)
        + H.card('', H.f('Month', `<input type="month" data-v="m" data-r="1" value="${esc(v.m)}">`))
        + H.kpis([['Sales excl. VAT', n2(net)], ['Output VAT', n2(ov), 'o'], ['Input VAT', n2(iv), 'g'], [ov - iv >= 0 ? 'Net VAT payable' : 'Net VAT refundable', n2(Math.abs(ov - iv)), ov - iv >= 0 ? 'o' : 'g']])
        + H.card('', `<div class="ei-kv"><span>Invoices & credit notes counted</span><b>${out.length}</b></div><div class="ei-kv"><span>Received invoices</span><b>${inn.length}</b></div>${pend ? `<div class="ei-kv"><span>Still waiting for the ASP</span><b>${pend}</b></div>` : ''}<span class="mb-hint">Amounts in AED. Only invoices the ASP has validated count as sales. This is a working summary — your VAT return is filed on EmaraTax.</span>`);
    }, act: { toSet } });

  /* ================= E-invoice settings: company, ASP connection, lists ================= */
  async function manageToken() {   /* creating lists needs Sites.Manage.All (asked once) */
    if (typeof ms_init !== 'function') return token();
    const app = await ms_init(), acct = app.getAllAccounts()[0], req = { scopes: ['https://graph.microsoft.com/Sites.Manage.All'] };
    try { return (await app.acquireTokenSilent(Object.assign({ account: acct }, req))).accessToken; } catch (e) { return (await app.acquireTokenPopup(Object.assign({ account: acct }, req))).accessToken; }
  }
  async function setupLists(onStep) {
    const site = (typeof getGlobalSiteUrl === 'function' && getGlobalSiteUrl()) || ''; if (!site) throw new Error('The SharePoint site address is not set (Connection settings).');
    const tok = await manageToken(), u = new URL(site), hdr = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
    const sr = await fetch('https://graph.microsoft.com/v1.0/sites/' + u.hostname + (u.pathname.replace(/\/+$/, '') ? ':' + u.pathname.replace(/\/+$/, '') : ''), { headers: hdr }); if (!sr.ok) throw new Error('Site not found (HTTP ' + sr.status + ')');
    const siteId = (await sr.json()).id, out = [];
    for (const [name, cols] of Object.entries(E.LISTS)) {
      onStep && onStep(name);
      const lr = await fetch('https://graph.microsoft.com/v1.0/sites/' + siteId + "/lists?$filter=displayName eq '" + name + "'", { headers: hdr }), found = lr.ok ? ((await lr.json()).value || [])[0] : null;
      if (!found) { const c = await fetch('https://graph.microsoft.com/v1.0/sites/' + siteId + '/lists', { method: 'POST', headers: hdr, body: JSON.stringify({ displayName: name, columns: cols, list: { template: 'genericList' } }) }); if (!c.ok) { let m = ''; try { m = (await c.json()).error.message; } catch (e) {} throw new Error(name + ': HTTP ' + c.status + ' ' + m + (c.status === 403 ? ' — you need to be a site owner, or ask IT to create the lists (see the setup guide).' : '')); } out.push(name + ' created'); continue; }
      const cr = await fetch('https://graph.microsoft.com/v1.0/sites/' + siteId + '/lists/' + found.id + '/columns', { headers: hdr }), have = new Set(((cr.ok ? (await cr.json()).value : []) || []).map(c => c.name));
      let added = 0; for (const col of cols) if (!have.has(col.name)) { const a = await fetch('https://graph.microsoft.com/v1.0/sites/' + siteId + '/lists/' + found.id + '/columns', { method: 'POST', headers: hdr, body: JSON.stringify(col) }); if (a.ok) added++; }
      out.push(name + (added ? ' — ' + added + ' column(s) added' : ' — OK'));
    }
    return out;
  }
  reg('x_eiset', { lists, load(v, f) { fresh('x_eiset', f).then(d => { if (v.__f) return; v.__f = 1; const r = coRow(d); if (r) { fill(v, E.partyFromRow(r)); Object.assign(v, { phone: str(r.phone), ip: str(r.invoiceprefix) || 'INV', cp: str(r.creditprefix) || 'CN', am: str(r.aspmode) || 'mock', gu: str(r.gatewayurl) }); } else Object.assign(v, { legal_id_type: 'TL', country: 'AE', ip: 'INV', cp: 'CN', am: 'mock' }); v.tab = v.tab || (r ? 'co' : 'lists'); render(); }); },
    view(v, d) {
      const tab = v.tab || 'co';
      const head = H.head('⚙️', 'E-invoice settings', 'Company profile · ASP connection · SharePoint lists', '#475569') + H.tabs('tab', [['co', 'Company'], ['asp', 'ASP'], ['lists', 'Lists']], 'co');
      if (tab === 'lists') return head + H.card('SharePoint lists', `<span class="mb-hint">Everything is stored in your SharePoint site in these lists. “Set up lists” creates any that are missing and adds missing columns — it never deletes data. You need to be a site owner (Microsoft asks once for “Manage sites”).</span>${Object.keys(E.LISTS).map(n => `<div class="ei-kv"><span class="ei-mono">${n}</span><b>${E.LISTS[n].length} column${E.LISTS[n].length > 1 ? "s" : ""}</b></div>`).join('')}`)
        + (v.setupOut ? H.card('Result', v.setupOut.map(x => `<div class="ei-kv"><b>${esc(x)}</b></div>`).join('')) : '') + H.bar(H.btn(v.busySetup ? '⏳ ' + esc(v.busySetup) : '🛠 Set up lists', 'setup'));
      if (tab === 'asp') return head + H.card('How invoices reach the FTA', `<span class="mb-hint">In the UAE you never send invoices straight to the FTA. Each invoice goes to your Accredited Service Provider (ASP), which checks it, delivers it to the buyer over Peppol and reports the tax data to the FTA.</span>` + H.f('Connection', H.seg('am', [['mock', '🧪 Test mode'], ['gateway', '🔌 ASP gateway']], 'mock'))
          + (v.am === 'gateway' ? H.f('ASP gateway address', H.inp('gu', { ph: 'https://einv-gateway.yourcompany.ae' }), 'The small server that holds your ASP key. Ask your administrator.') : '<span class="mb-hint">Test mode runs the full flow on this device with a pretend ASP. Nothing reaches the FTA.</span>'))
        + (v.am === 'gateway' ? H.card('Gateway', (v.gwInfo ? `<div class="ei-kv"><span>Provider</span><b>${esc(v.gwInfo.provider)}</b></div><div class="ei-kv"><span>Webhook for your ASP</span><b class="ei-mono">${esc(str(v.gu).replace(/\/+$/, '') + v.gwInfo.webhookPath)}</b></div><div class="ei-kv"><span>You can change it</span><b>${v.gwInfo.isAdmin ? 'Yes' : 'No — ask ' + esc((v.gwInfo.admins || []).join(', '))}</b></div>` : '<span class="mb-hint">Save, then tap “Test gateway”.</span>')
          + (v.gwInfo && v.gwInfo.isAdmin ? H.f('ASP provider', H.seg('gp', [['mock', 'Mock'], ['http', 'REST API']], v.gwInfo.provider)) + H.f('ASP API base URL', H.inp('gb', { ph: 'https://api.your-asp.ae/v1' })) + `<div class="mb-row">${H.f('API key', H.inp('gk', { ph: v.gwInfo.hasKey ? '•••• saved — leave blank to keep' : '' }))}${H.f('Webhook secret', H.inp('gs', { ph: 'leave blank to keep' }))}</div>` + H.sbtn('Save ASP details on the gateway', 'gwSave', 'style="width:100%"', 'p') : '')) : '')
        + H.bar(`<div class="mb-row">${v.am === 'gateway' ? H.btn('🔌 Test gateway', 'gwTest', 's') : ''}${H.btn('💾 Save', 'saveCo')}</div>`);
      return head + H.load(d) + setupHint(d) + H.card('Your company — the seller', partyForm('company') + H.f('Phone', H.inp('phone', { type: 'tel' })) + H.f('IBAN (credit transfer)', H.inp('iban', { ph: 'AE07 0331 2345 6789 0123 456' }))
          + `<div class="mb-row">${H.f('Invoice prefix', H.inp('ip'))}${H.f('Credit note prefix', H.inp('cp'))}</div>`) + errList(v.errs, 'Please check') + H.bar(H.btn('💾 Save company profile', 'saveCo'));
    },
    act: {
      async saveCo(t, v, d) {
        const p = fromV(v), e = []; if (!p.name) e.push({ rule: 'IBT-027', message: 'Company name is required' }); if (p.trn && !E.TRN_RE.test(p.trn)) e.push({ rule: 'IBR-132-AE', message: 'TRN must be 15 digits, start with 1 and end with 03' }); if (p.tin && !E.TIN_RE.test(p.tin)) e.push({ rule: 'IBR-148-AE', message: 'TIN must be 10 digits starting with 1' });
        if (e.length && (v.tab || 'co') === 'co') { v.errs = e; render(); return; }
        const f = Object.assign(E.partyToFields(p, 'company'), { InvoicePrefix: str(v.ip) || 'INV', CreditPrefix: str(v.cp) || 'CN', AspMode: v.am || 'mock', GatewayUrl: str(v.gu).replace(/\/+$/, '') });
        if (!p.name) delete f.Title;
        try { const r = coRow(d); if (r) await updRow(L_CO, r.id, f); else await addRow(L_CO, f); v.errs = null; toast('✅ Settings saved to SharePoint', 'success'); fresh('x_eiset', true); } catch (er) { toast('Not saved: ' + er.message, 'error'); }
      },
      async gwTest(t, v) { const u = str(v.gu).replace(/\/+$/, ''); if (!u) return toast('Enter the gateway address.', 'warn');
        try { const h = await (await fetch(u + '/v1/health')).json(); if (!h.ok) throw new Error('No answer'); const r = await fetch(u + '/v1/config', { headers: { Authorization: 'Bearer ' + (await token()) } }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); v.gwInfo = j; v.gp = j.provider; v.gb = j.baseUrl; toast('✅ Gateway connected', 'success'); render(); } catch (e) { toast('Gateway: ' + e.message, 'error'); } },
      async gwSave(t, v) { const u = str(v.gu).replace(/\/+$/, ''); try { const r = await fetch(u + '/v1/config', { method: 'PUT', headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: v.gp || 'mock', config: { baseUrl: str(v.gb), apiKey: str(v.gk), webhookSecret: str(v.gs) } }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); v.gk = ''; v.gs = ''; toast('✅ ASP details saved on the gateway', 'success'); } catch (e) { toast(e.message, 'error'); } },
      async setup(t, v) { if (v.busySetup) return; v.busySetup = 'Starting…'; v.setupOut = null; render();
        try { v.setupOut = await setupLists(n => { v.busySetup = n + '…'; render(); }); toast('✅ SharePoint lists are ready', 'success'); drop(L_CO, L_CU, L_PR, L_DOC); } catch (e) { v.setupOut = ['✘ ' + e.message]; toast(e.message, 'error'); }
        v.busySetup = ''; render(); } } });

  window.EINV_UI = { ST, parseUbl, nextNumber, setupLists, model, refreshStatus, version: '509' };
})();
