/* ============================================================
   ORBIT — "About ORBIT" presentation page (Settings → About ORBIT)
   A short tour of the system for new users and client demos: what ORBIT is, the modules, the business types,
   how it runs and the version. Opens the module pages directly.
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK; if (!K) return;
  const { reg, H, esc } = K;
  const go = k => { const n = document.querySelector('.nav-item[data-view="' + k + '"]'); if (n) n.click(); else K.A().go(k); };
  const MODS = [
    ['🧮', 'Finance', 'Journals, bills, receipts, payments, bank reconciliation, trial balance and statements.', 'fin-home'],
    ['🧾', 'E-invoicing', 'UAE structured invoices and credit notes, checked and sent through your service provider.', 'einv-list'],
    ['📈', 'Sales & marketing', 'Leads, quotations, sales orders, deliveries, price lists, campaigns, targets and commissions.', 'sal-home'],
    ['🛒', 'Procurement', 'Purchase requests, quotation comparison, purchase orders, receipts and three-way match.', 'pur-home'],
    ['🏬', 'Inventory & production', 'Costed stock, warehouses, transfers, counts, bills of materials and production orders.', 'inv-home'],
    ['🤝', 'HR & payroll', 'Employees, leave, payroll with WPS file, loans, documents and end-of-service.', 'hr-home'],
    ['📊', 'Budgets & fixed assets', 'Budget versus actual, asset register and monthly depreciation.', 'bud-list'],
    ['✅', 'Approvals', 'One approval engine for every document, by amount, department and role.', 'apr-inbox']
  ];
  const FLOWS = [
    ['Order to cash', ['Lead', 'Quotation', 'Sales order', 'Delivery', 'E-invoice', 'Receipt']],
    ['Procure to pay', ['Request', 'Quotations', 'Purchase order', 'Goods receipt', '3-way match', 'Payment']],
    ['Hire to pay', ['Employee', 'Attendance & leave', 'Payroll run', 'WPS file', 'Journal']]
  ];
  const BIZ = ['Manufacturing', 'Trading & distribution', 'Construction & contracting', 'Services', 'Food & restaurant', 'Vending', 'Printing & typing centres'];
  const css = document.createElement('style');
  css.textContent = `.ab-hero{grid-column:1/-1;display:grid;grid-template-columns:120px minmax(0,1fr);gap:24px;align-items:center;padding:28px;border-radius:20px;color:#fff;background:radial-gradient(80% 120% at 100% 0%,#2a1a6b 0%,transparent 60%),#0b1230}
.ab-hero img{width:120px;height:120px;object-fit:contain;filter:drop-shadow(0 10px 24px rgba(124,58,237,.55))}
.ab-hero h2{margin:0;font-size:30px;line-height:1.15;color:#fff}.ab-hero p{margin:8px 0 0;color:#c3c8e8;font-size:15px;line-height:1.55}
.ab-mods{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.ab-mod{white-space:normal;display:flex;flex-direction:column;gap:6px;text-align:left;padding:16px;border-radius:14px;border:1px solid var(--border,#e2e8f0);background:var(--card,#fff);cursor:pointer;font:inherit;color:inherit}
.ab-mod:hover{border-color:#6d5df6;box-shadow:0 6px 18px -10px rgba(91,79,240,.6)}.ab-mod b{font-size:15px}.ab-mod span{font-size:13px;color:var(--gray-600,#64748b);line-height:1.45}
.ab-flow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 12px}.ab-flow i{font-style:normal;padding:6px 12px;border-radius:999px;background:var(--gray-100,#f1f5f9);border:1px solid var(--border,#e2e8f0);font-size:13px;font-weight:600}
.ab-flow i.k{background:#5b4ff0;border-color:#5b4ff0;color:#fff}.ab-flow em{font-style:normal;color:#8a8fb5}
.ab-chips{display:flex;flex-wrap:wrap;gap:8px}.ab-chips span{padding:6px 12px;border-radius:999px;border:1px solid var(--border,#e2e8f0);font-size:13px}
@media(max-width:620px){.ab-hero{grid-template-columns:1fr;text-align:center}.ab-hero img{margin:0 auto}}`;
  document.head.appendChild(css);

  reg('x_about', {
    view() {
      const ver = (typeof APP_SERIAL !== 'undefined' ? APP_SERIAL : '') + (typeof APP_BUILD !== 'undefined' ? ' · build ' + APP_BUILD : '');
      let biz = ''; try { biz = (NAV_BIZ.find(b => b[0] === navBiz()) || [0, ''])[1]; } catch (e) {}
      return H.head('🪐', 'ORBIT ERP', 'Modules, how the work flows, and this installation', '#5b4ff0') + `<div class="ab-hero"><img src="icons/orbit-mark.svg" alt="ORBIT logo"><div><h2>ORBIT ERP — one system for the whole business</h2><p>Finance, sales, purchasing, stock, production, people and UAE e-invoicing on the same records — in the browser on PC and phone, on your SharePoint or a database server.</p></div></div>`
        + H.card('Modules · tap one to open it', `<div class="ab-mods">${MODS.map(([ic, t, d, v]) => `<div class="ab-mod" role="button" tabindex="0" data-x="open" data-v="${v}"><b>${ic} ${esc(t)}</b><span>${esc(d)}</span></div>`).join('')}</div>`)
        + H.card('How the work flows', FLOWS.map(([t, s]) => `<b>${esc(t)}</b><div class="ab-flow">${s.map((x, i) => `<i class="${i === s.length - 2 ? 'k' : ''}">${esc(x)}</i>${i < s.length - 1 ? '<em>→</em>' : ''}`).join('')}</div>`).join(''))
        + H.card('Controls', `<div class="ei-kv"><span>Approvals</span><b>by document, department and amount; line manager, head, role or named person</b></div><div class="ei-kv"><span>History</span><b>who created, changed, approved and posted every document</b></div><div class="ei-kv"><span>Safe posting</span><b>a retried save never posts an entry twice</b></div><div class="ei-kv"><span>Access</span><b>users and roles decide which pages each person opens</b></div>`)
        + H.card('Fits your kind of business', `<div class="ab-chips">${BIZ.map(b => `<span>${esc(b)}</span>`).join('')}</div><p class="mb-hint" style="margin-top:10px">This system is set to: <b>${esc(biz || 'All modules')}</b> — change it in Settings → Business type.</p>`)
        + H.card('About this installation', `<div class="ei-kv"><span>Version</span><b>${esc(ver)}</b></div><div class="ei-kv"><span>Provided by</span><b>Orbit Consulting · Financing, Taxation &amp; IT Consulting</b></div>`);
    },
    act: { open(t) { go(t.dataset.v); } }
  });
})();
