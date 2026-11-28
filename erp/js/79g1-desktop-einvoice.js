/* ============================================================
   ORBIT — module pages in the web app (E-Invoicing, Finance & Accounts, Inventory & Manufacturing, Budgets & Fixed Assets, Human Resources, Procurement, Approvals)
   Each page shows the module's phone screens inside the web app page at desktop width (same data, same rules).
   They show the same screens as ORBIT Mobile (js/79g-mobile-einvoice.js) inside the page, at desktop width:
   same SharePoint lists, same numbering, same ASP connection — an invoice made on the phone is here, and the other way round.
   Not loaded on the mobile page (mobile.html runs the phone app itself).
   ============================================================ */
(function () {
  'use strict';
  if (window.ORBIT_MOBILE || !window.MOBA || !window.MOBX || !window.EINV) return;
  const Q = s => document.querySelector(s);
  const VIEWS = {
    'einv-new': ['x_einew', 'New Invoice', 'Create a UAE tax invoice or credit note (PINT AE) and send it to your Accredited Service Provider', 'E-Invoicing'],
    'einv-list': ['x_eilist', 'Invoices', 'Drafts, invoices with the ASP and invoices reported to the FTA · open one to see its status, XML and history', 'E-Invoicing'],
    'einv-inbox': ['x_eiinbox', 'Received Invoices', 'Invoices your suppliers sent you over Peppol', 'E-Invoicing'],
    'einv-cust': ['x_eicust', 'E-Invoice Customers', 'Buyers with their TRN and Peppol ID', 'E-Invoicing'],
    'einv-prod': ['x_eiprod', 'E-Invoice Products & Services', 'Saved items with HS / SAC code and VAT category', 'E-Invoicing'],
    'einv-vat': ['x_eivat', 'VAT Summary', 'Output VAT on accepted sales vs input VAT on received invoices, by month', 'E-Invoicing'],
    'einv-set': ['x_eiset', 'E-Invoice Settings', 'Company profile (the seller), ASP connection and the SharePoint lists', 'E-Invoicing'],
    'fin-home': ['x_findash', 'Finance', 'Cash, receivables, payables, VAT due and profit at a glance', 'Finance & Accounts'],
    'fin-jv': ['x_finjv', 'Journal Entries', 'Manual entries, posted entries and reversals', 'Finance & Accounts'],
    'fin-bill': ['x_finbill', 'Purchase Bills', 'Supplier invoices → payables and input VAT', 'Finance & Accounts'],
    'fin-pay': ['x_finpay', 'Receipts & Payments', 'Money in from customers, money out to suppliers', 'Finance & Accounts'],
    'fin-rep': ['x_finrep', 'Financial Reports', 'Trial balance, profit & loss, balance sheet, ledger, ageing, VAT 201', 'Finance & Accounts'],
    'fin-coa': ['x_fincoa', 'Chart of Accounts', 'Accounts and balances', 'Finance & Accounts'],
    'fin-sup': ['x_finsup', 'Suppliers', 'Who you buy from', 'Finance & Accounts'],
    'fin-rec': ['x_finrec', 'Bank Reconciliation', 'Import the bank statement, match it with the ledger, explain the difference', 'Finance & Accounts'],
    'fin-set': ['x_finset', 'Finance Settings', 'Posting accounts, lock date, numbering, where the ledger is kept', 'Finance & Accounts'],
    'inv-home': ['x_invdash', 'Inventory', 'Stock value, low stock, open production orders, items waiting for cost', 'Inventory & Manufacturing'],
    'inv-items': ['x_invitems', 'Items', 'Trading goods, raw & packaging, finished goods — quantity, cost and value', 'Inventory & Manufacturing'],
    'inv-move': ['x_invmove', 'Stock Transactions', 'Receipts, issues, transfers and stock counts', 'Inventory & Manufacturing'],
    'inv-rep': ['x_invrep', 'Stock Reports', 'On hand, valuation, stock card, movements, reorder, stock vs ledger', 'Inventory & Manufacturing'],
    'mfg-bom': ['x_mfgbom', 'Bills of Materials', 'Components, scrap and conversion cost per batch', 'Inventory & Manufacturing'],
    'mfg-mo': ['x_mfgmo', 'Production Orders', 'Plan, release materials, complete into finished goods', 'Inventory & Manufacturing'],
    'inv-set': ['x_invset', 'Inventory Settings', 'Warehouses, posting accounts, ORBIT link', 'Inventory & Manufacturing'],
    'bud-list': ['x_budlist', 'Budgets', 'By account and cost centre, month by month', 'Budgets & Fixed Assets'],
    'bud-rep': ['x_budrep', 'Budget vs Actual', 'Ledger actuals against the budget, ORBIT project budgets', 'Budgets & Fixed Assets'],
    'fa-reg': ['x_fareg', 'Fixed Assets', 'Asset register, disposal, assets from purchase bills', 'Budgets & Fixed Assets'],
    'fa-dep': ['x_fadep', 'Depreciation', 'Monthly depreciation runs', 'Budgets & Fixed Assets'],
    'fa-rep': ['x_farep', 'Asset Reports', 'Register, movement, forecast, assets vs ledger', 'Budgets & Fixed Assets'],
    'fa-set': ['x_faset', 'Asset Settings', 'Categories, accounts, set up', 'Budgets & Fixed Assets'],
    'hr-home': ['x_hrdash', 'HR', 'Headcount, leave requests, expiring documents, payroll status', 'Human Resources'],
    'hr-emps': ['x_hremps', 'Employees', 'Linked to ORBIT staff list · salary, bank, documents', 'Human Resources'],
    'hr-leave': ['x_hrleave', 'Leave', 'Requests, approval, balances, adjustments', 'Human Resources'],
    'hr-pay': ['x_hrpay', 'Payroll', 'Monthly runs, WPS file, posting', 'Human Resources'],
    'hr-loans': ['x_hrloans', 'Loans & Advances', 'Repaid through payroll', 'Human Resources'],
    'hr-docs': ['x_hrdocs', 'HR Documents', 'Passport, visa, Emirates ID, labour card expiry', 'Human Resources'],
    'hr-eos': ['x_hreos', 'End of Service', 'Gratuity liability and final settlements', 'Human Resources'],
    'hr-set': ['x_hrset', 'HR Settings', 'WPS, overtime, leave, pension, accounts', 'Human Resources'],
    'pur-home': ['x_purdash', 'Procurement', 'Requests, orders to receive and bill, approvals waiting', 'Procurement'],
    'pur-req': ['x_purreq', 'Purchase Requests', 'Ask for items or services · approval by department and amount', 'Procurement'],
    'pur-rfq': ['x_purrfq', 'RFQs & Quotations', 'Ask suppliers for prices, compare, award', 'Procurement'],
    'pur-po': ['x_purpo', 'Purchase Orders', 'Approve, send, receive, 3-way match', 'Procurement'],
    'pur-set': ['x_purset', 'Procurement Settings', 'Numbering, tolerances, PO terms', 'Procurement'],
    'sal-home': ['x_saldash', 'Sales', 'Sales this month vs target, pipeline, orders to deliver and invoice', 'Sales & Marketing'],
    'sal-crm': ['x_salcrm', 'Leads & Opportunities', 'Pipeline by stage, activities, follow-ups', 'Sales & Marketing'],
    'sal-qt': ['x_salqt', 'Quotations', 'Price lists, discounts with approval, accept → order', 'Sales & Marketing'],
    'sal-so': ['x_salso', 'Sales Orders', 'Credit & stock check, delivery notes, e-invoice', 'Sales & Marketing'],
    'sal-cust': ['x_salcust', 'Customer Accounts & Price Lists', 'Credit limits, payment days, price lists, tags', 'Sales & Marketing'],
    'sal-mkt': ['x_salmkt', 'Campaigns & Segments', 'Campaign cost and results, customer groups', 'Sales & Marketing'],
    'sal-mail': ['x_salmail', 'Bulk Email', 'Marketing e-mails to lists from Excel, AI layout, attachments', 'Sales & Marketing'],
    'sal-web': ['x_webstats', 'Website Traffic', 'Visitors of the Orbit website: sources, devices, sections, clicks', 'Sales & Marketing'],
    'sal-tgt': ['x_saltgt', 'Targets & Commissions', 'Monthly targets per salesperson, commission and bonus', 'Sales & Marketing'],
    'about': ['x_about', 'About ORBIT', 'What ORBIT does, its modules and this installation', 'Settings'],
    'sal-set': ['x_salset', 'Sales Settings', 'Numbering, discount limit, credit and stock rules', 'Sales & Marketing'],
    'apr-inbox': ['x_aprinbox', 'My Approvals', 'Documents waiting for your decision', 'Approvals'],
    'apr-set': ['x_aprset', 'Approval Setup', 'Rules by document, department and amount; departments; roles', 'Approvals'],
  };
  Object.entries(VIEWS).forEach(([v, x]) => { try { VIEW_META[v] = { title: x[1], sub: x[2] }; } catch (e) {} });

  /* desktop layout: the module screens are built for the phone (one narrow column, a coloured header card, buttons across the
     bottom). In the web app they get a page layout: full width, a plain page heading, the action buttons as a toolbar at the
     top right, cards side by side in columns, tables and line editors across the whole width, lines on one row. */
  const css = document.createElement('style'); css.textContent = `
.view > #mob.ei-dock{display:block!important;position:relative!important;padding-top:4px;inset:auto!important;z-index:1!important;height:auto!important;min-height:0;overflow:visible!important;border:0;border-radius:0;box-shadow:none;background:transparent!important;--z:1!important}
#mob.ei-dock .mb-top{position:absolute!important;top:6px;right:0;z-index:6;display:flex;align-items:center;justify-content:flex-end;padding:0!important;margin:0!important;background:transparent!important;border:0!important;box-shadow:none!important;width:auto!important}
#mob.ei-dock .mb-bar{display:flex;align-items:center;gap:10px;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important;width:auto}
#mob.ei-dock .mb-bar h1{display:none}#mob.ei-dock .mb-hi{display:none!important}
#mob.ei-dock .mb-bar .mb-ib{width:auto!important;height:34px!important;padding:0 14px!important;border-radius:10px!important;font-size:13px!important;font-weight:700;border:1px solid var(--line)!important;background:var(--card)!important;color:var(--tx)!important;box-shadow:none!important}
#mob.ei-dock .mb-bar .mb-ib[data-m="back"]::after{content:" Back"}#mob.ei-dock .mb-bar .mb-ib[data-m="refresh"]::after{content:" Refresh"}
#mob.ei-dock .mb-body{position:relative;max-width:none!important;margin:0!important;padding:0 0 40px!important;display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:16px;align-items:start;font-size:14px}
#mob.ei-dock .mb-body>*{grid-column:1/-1;margin:0!important;min-width:0}
#mob.ei-dock .mb-body>.mb-card{grid-column:auto;padding:18px 20px!important;border-radius:14px!important;border:1px solid var(--line)!important;box-shadow:0 1px 2px rgba(16,24,40,.05)!important}
#mob.ei-dock .mb-body>.mb-card:has(table,.fin-t,.fin-tw,.ei-ln,.inv-ln,.fin-jl,.hr-g,.bfa-m,.mx-acts,.mx-li,.ei-errs){grid-column:1/-1}
#mob.ei-dock .mb-body>.mb-card h3{font-size:15px!important;margin:0 0 12px!important}
/* page heading instead of the coloured phone card */
#mob.ei-dock .mx-head{order:-3;padding-right:230px!important;min-height:46px;background:transparent!important;box-shadow:none!important;color:var(--hd,var(--tx))!important;padding:2px 0 4px!important;border-radius:0!important;margin:0!important;border-bottom:1px solid var(--line);padding-bottom:12px!important}
#mob.ei-dock .mx-head>span{width:42px;height:42px;border-radius:12px;font-size:22px;background:color-mix(in srgb,var(--a) 14%,transparent)!important}
#mob.ei-dock .mx-head b{font-size:21px!important;color:var(--hd,var(--tx))}#mob.ei-dock .mx-head small{font-size:13px!important;color:var(--mut)!important;opacity:1!important}
/* action buttons: toolbar at the top right */
#mob.ei-dock .mx-bar{order:-2;position:static!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;display:flex;justify-content:flex-end}
#mob.ei-dock .mx-bar .mb-row{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;width:auto}
#mob.ei-dock .mx-bar .mb-btn,#mob.ei-dock .mx-bar>.mb-btn,#mob.ei-dock .mx-bar button{flex:0 0 auto!important;width:auto!important;min-width:0;height:38px!important;min-height:0!important;padding:0 16px!important;font-size:13.5px!important;border-radius:10px!important;line-height:1!important}
#mob.ei-dock .mb-body>.mb-btn{grid-column:1/-1;justify-self:end;width:auto!important}
#mob.ei-dock .mb-btn,#mob.ei-dock .mx-sb{border-radius:10px!important}
#mob.ei-dock .mb-card>.mb-btn,#mob.ei-dock .mb-card .mx-sb[style*="width:100%"]{width:auto!important;padding:9px 18px!important;display:inline-flex}
/* tabs as a page tab strip, KPIs in a row */
#mob.ei-dock .mx-tabs{order:-1;flex-wrap:wrap;gap:4px;border-bottom:1px solid var(--line);padding:0 0 0!important;overflow:visible}
#mob.ei-dock .mx-tabs button{border:0!important;border-radius:8px 8px 0 0!important;background:transparent!important;color:var(--mut)!important;padding:9px 14px!important;border-bottom:2px solid transparent!important;font-size:13.5px}
#mob.ei-dock .mx-tabs button.on{background:transparent!important;color:var(--acc)!important;border-bottom-color:var(--acc)!important}
#mob.ei-dock .mx-kpis{order:-1;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))!important;gap:12px}
#mob.ei-dock .mx-kpis .mb-k{padding:14px 16px!important;border-radius:12px!important}#mob.ei-dock .mx-kpis .mb-k b{font-size:21px}
/* forms: fields side by side */
#mob.ei-dock .fin-row{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
#mob.ei-dock .mb-f input,#mob.ei-dock .mb-f select,#mob.ei-dock .mb-f textarea,#mob.ei-dock .mb-row input{border-radius:9px!important;padding:9px 12px!important;font-size:14px!important}
#mob.ei-dock .mb-f>label{font-size:12.5px}
/* tables */
#mob.ei-dock .fin-t{font-size:13.5px}#mob.ei-dock .fin-t th{font-size:12px;padding:9px 10px;background:var(--seg)}#mob.ei-dock .fin-t td{padding:8px 10px}
/* line editors (invoice / bill / stock / BOM lines): one row per line */
#mob.ei-dock .ei-ln,#mob.ei-dock .inv-ln{display:grid;grid-template-columns:minmax(240px,2fr) minmax(0,4fr);gap:6px 12px;align-items:end;padding:10px 12px!important;border-radius:10px!important}
#mob.ei-dock .ei-ln>.ei-lnh,#mob.ei-dock .inv-ln>.ei-lnh{grid-column:1/-1;margin:0}
#mob.ei-dock .ei-ln>.mb-row,#mob.ei-dock .ei-ln>.mb-f{grid-column:auto;margin:0}
#mob.ei-dock .inv-ln>.inv-g{margin:0;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}#mob.ei-dock .inv-ln>.inv-sys{grid-column:1/-1}
#mob.ei-dock .hr-g,#mob.ei-dock .bfa-m{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))!important}
#mob.ei-dock .mx-acts{display:flex;flex-wrap:wrap;gap:8px}#mob.ei-dock .mx-acts .mx-sb{flex:0 0 auto}
#mob.ei-dock .mx-ld,#mob.ei-dock .mx-search{grid-column:1/-1}
#mob.ei-dock .mx-search{max-width:520px}
@media (max-width:980px){#mob.ei-dock .mb-body{grid-template-columns:1fr}}
@media (max-width:760px){#mob.ei-dock .mb-top{position:static!important;justify-content:flex-start;margin:0 0 10px!important}#mob.ei-dock .mx-head{padding-right:0!important}#mob.ei-dock .ei-ln,#mob.ei-dock .inv-ln{grid-template-columns:1fr}}
`; document.head.appendChild(css);

  function dock() {
    let m = Q('#mob'); if (m) return m;
    m = document.createElement('div'); m.id = 'mob'; m.className = 'ei-dock'; m.dataset.nohc = '1';
    m.innerHTML = `<div class="mb-top"><div class="mb-bar"><button class="mb-ib" data-m="back" aria-label="Back">‹</button><h1 id="mbTitle">E-Invoicing</h1><button class="mb-ib" data-m="refresh" aria-label="Refresh" title="Reload from SharePoint">↻</button></div><div class="mb-hi" id="mbHi"></div></div><div class="mb-body" id="mbBody"></div>`;
    m.addEventListener('click', e => {
      if (MOBX.click(e)) return;
      const t = e.target.closest('[data-m],[data-go]'); if (!t) return;
      if (t.dataset.go) { const r = Q('#msReloginBtn'); if (r) r.click(); return; }                       /* "Connect" → ORBIT's Microsoft re-login */
      if (t.dataset.m === 'refresh') { MOBX.refresh(MOBA.S.page); return; }
      if (t.dataset.m === 'back') { const p = MOBA.S.stack.pop(); MOBA.go(p ? p.p : home, 'back'); }
    });
    m.addEventListener('input', e => MOBX.input(e));
    m.addEventListener('change', e => MOBX.change(e));
    return m;
  }
  let home = 'x_eilist';
  const theme = () => { const m = Q('#mob.ei-dock'); if (m) m.classList.toggle('light', !document.body.classList.contains('dark')); };
  new MutationObserver(theme).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  function open(view) {
    const x = VIEWS[view], host = document.getElementById('view-' + view); if (!x || !host) return;
    const m = dock(); if (m.parentNode !== host) host.appendChild(m); theme();
    home = x[0]; MOBA.S.stack = []; MOBA.S.v = {}; MOBA.S.page = '';                                          /* fresh screen each time the page is opened */
    MOBA.go(x[0], 'tab');
  }
  /* ORBIT opens the view itself (js/03); this only puts the e-invoicing screen into it */
  document.addEventListener('click', e => { const n = e.target.closest('.nav-item[data-view]'); if (n && !VIEWS[n.dataset.view]) return; if (n && !n.classList.contains('locked')) setTimeout(() => open(n.dataset.view), 0); });

  /* a saved side-panel layout (Settings / central layout) does not know the new pages yet: keep them together in their own group "E-Invoicing" instead of "Other" */
  if (typeof navReconcile === 'function') {
    const base = navReconcile;
    navReconcile = function (l) {   /* pages a saved layout does not know yet → their own group (E-Invoicing, Finance & Accounts) instead of "Other" */
      const out = base(l), ids = Object.keys(VIEWS), placed = v => out.groups.some(g => g.name !== 'Other' && (g.items.includes(v) || (g.subs || []).some(s => s.items.includes(v))));
      const oth = out.groups.find(g => g.name === 'Other'); if (!oth) return out;
      [...new Set(ids.map(v => VIEWS[v][3]))].forEach(gname => {
        const mine = oth.items.filter(v => ids.includes(v) && VIEWS[v][3] === gname && !placed(v)); if (!mine.length) return;
        oth.items = oth.items.filter(v => !mine.includes(v));
        let grp = out.groups.find(g => g.name === gname);
        if (grp) grp.items.push(...mine); else { grp = { id: 'g_' + gname.replace(/\W+/g, ''), name: gname, items: mine, subs: [], collapsed: false }; const at = out.groups.findIndex(g => /config|setting/i.test(g.name)); out.groups.splice(at >= 0 ? at : out.groups.length, 0, grp); }
      });
      if (!oth.items.length && !(oth.subs || []).length) out.groups.splice(out.groups.indexOf(oth), 1);
      return out;
    };
    try { navApply(true); } catch (e) {}
  }
  window.EINV_DESK = { open, VIEWS };
})();
