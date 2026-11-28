/* ============================================================
   ORBIT SALES & MARKETING — Website traffic (Distributions → Sales & Marketing → Website traffic)
   The Orbit website sends anonymous visit data (no cookies, no IP address, no names) to a collector:
   • the ORBIT ERP server  →  POST <server>/v1/site/hit/<tenant>   (stored in the Web_Visits table), or
   • a Power Automate flow (HTTP request → create item in the SharePoint list Web_Visits).
   This page reads Web_Visits: visits, visitors, time on site, sources, devices, languages, countries,
   sections reached, button clicks (login, demo, contact, language), busiest days and hours.
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, Q = window.SAL, S = window.FINSTORE, FU = window.FIN_UI;
  if (!K || !Q || !S || !FU) return;
  const { reg, esc, num, today, toast, render, cur, H, dmy } = K;
  const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
  const SEC = { home: 'Top of page', services: 'Services', solutions: 'Digital solutions', products: 'Our products', finance: 'Finance', tax: 'Tax', 'orbit-erp': 'ORBIT ERP', approach: 'How we work', contact: 'Contact' };
  const CLK = { login: '🔐 ERP login', demo: '🎬 Demo request', contact: '✉️ Contact form sent', book: '📅 Book consultation', lang: '🌐 Language switch', phone: '📞 Phone', email: '📧 E-mail link', product: '🧩 Product opened' };

  async function load(force) {
    const o = {};
    try { o.rows = (await S.list('Web_Visits', force)).map(r => ({ id: Number(r.id), kind: r.kind, vid: r.visitid, uid: r.visitorid, page: r.page || '/', ref: r.referrer || '', src: r.source || '', med: r.medium || '', cmp: r.campaign || '', lang: r.lang || '', dev: r.device || '', br: r.browser || '', os: r.os || '', ctry: r.country || '', tz: r.tz || '', at: r.at || r.created || '', nw: r.newvisitor === '1', dur: num(r.duration), sc: num(r.scroll), secs: J(r.sections, []), clk: J(r.clicks, []) })); }
    catch (e) { o.rows = []; if (/not found/i.test(e.message)) o.missing = true; else o.err = e.message; }
    return o;
  }
  /* one record per visit: the "view" row plus what the "end" row adds */
  function visits(rows, from) {
    const by = new Map();
    rows.forEach(r => { if (!r.vid) return; const v = by.get(r.vid) || { vid: r.vid, dur: 0, sc: 0, secs: new Set(), clk: [] };
      if (r.kind === 'view') Object.assign(v, { uid: r.uid, at: r.at, page: r.page, ref: r.ref, src: r.src, med: r.med, cmp: r.cmp, lang: r.lang, dev: r.dev, br: r.br, os: r.os, ctry: r.ctry, tz: r.tz, nw: r.nw, view: true });
      else { v.dur = Math.max(v.dur, r.dur); v.sc = Math.max(v.sc, r.sc); r.secs.forEach(s => v.secs.add(s)); v.clk = v.clk.concat(r.clk); v.lang = v.lang || r.lang; }
      by.set(r.vid, v); });
    return [...by.values()].filter(v => v.view && String(v.at).slice(0, 10) >= from);
  }
  const srcOf = v => { if (v.src) return v.src + (v.med ? ' / ' + v.med : ''); if (!v.ref) return 'Direct'; try { const h = new URL(v.ref).hostname.replace(/^www\./, ''); if (/google\./.test(h)) return 'Google'; if (/bing\./.test(h)) return 'Bing'; if (/facebook|fb\./.test(h)) return 'Facebook'; if (/instagram/.test(h)) return 'Instagram'; if (/linkedin|lnkd/.test(h)) return 'LinkedIn'; if (/t\.co$|twitter|x\.com/.test(h)) return 'X (Twitter)'; if (/whatsapp|wa\.me/.test(h)) return 'WhatsApp'; return h; } catch (e) { return 'Other'; } };
  const count = (arr, key) => { const m = new Map(); arr.forEach(v => { const k = key(v) || 'Unknown'; m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
  const mmss = s => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const barList = (rows, total, color, label) => rows.length ? `<div class="ws-bars">${rows.slice(0, 10).map(([k, n]) => `<div class="ws-b"><span title="${esc(k)}">${esc(label ? label(k) : k)}</span><i style="--w:${total ? Math.max(2, n * 100 / total) : 0}%;--c:${color}"></i><b>${n.toLocaleString()} · ${pct(n, total)}%</b></div>`).join('')}</div>` : '<span class="mb-hint">No data yet.</span>';

  const css = document.createElement('style');
  css.textContent = `.ws-bars{display:grid;gap:8px}.ws-b{display:grid;grid-template-columns:minmax(0,150px) minmax(0,1fr) 110px;gap:10px;align-items:center;font-size:13.5px}
.ws-b span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ws-b i{display:block;height:12px;border-radius:7px;background:var(--gray-100,#eef2f7);position:relative;overflow:hidden}
.ws-b i::after{content:"";position:absolute;inset:0;width:var(--w);background:var(--c);border-radius:7px}.ws-b b{text-align:end;font-weight:600;white-space:nowrap}
.ws-days{display:flex;align-items:flex-end;gap:3px;height:170px;padding-top:8px}.ws-days div{flex:1;min-width:3px;background:linear-gradient(180deg,#6d5df6,#14b8a6);border-radius:4px 4px 0 0;position:relative}
.ws-days div:hover::after{content:attr(data-t);position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:#0b1230;color:#fff;font-size:12px;padding:3px 7px;border-radius:6px;white-space:nowrap}
.ws-axis{display:flex;justify-content:space-between;font-size:12px;color:var(--gray-600,#64748b);margin-top:4px}
.ws-hours{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:3px}.ws-hours div{height:34px;border-radius:5px;background:#6d5df6}
.ws-code{font:12.5px ui-monospace,Consolas,monospace;background:var(--gray-100,#eef2f7);padding:10px;border-radius:9px;word-break:break-all;user-select:all}
@media(max-width:620px){.ws-b{grid-template-columns:90px minmax(0,1fr) 90px}}`;
  document.head.appendChild(css);

  reg('x_webstats', {
    load(v, f) { const d = K.D.x_webstats = K.D.x_webstats || {}; d.busy = 1; if (cur() === 'x_webstats') render(); load(f).then(o => Object.assign(d, o)).finally(() => { d.busy = 0; if (cur() === 'x_webstats') render(); }); },
    view(v, d) {
      const days = num(v.days) || 30, from = K.addD(today(), -(days - 1)), all = d.rows || [], V = visits(all, from), n = V.length;
      const users = new Set(V.map(x => x.uid)).size, newU = V.filter(x => x.nw).length, ended = V.filter(x => x.dur > 0), avg = ended.length ? ended.reduce((s, x) => s + x.dur, 0) / ended.length : 0;
      const bounce = V.filter(x => x.dur < 10 && !x.clk.length && x.secs.size <= 1).length, conv = V.filter(x => x.clk.some(c => /^(demo|contact|book|login)/.test(c))).length;
      /* previous period, for the change */
      const prevFrom = K.addD(from, -days), PV = visits(all, prevFrom).filter(x => String(x.at).slice(0, 10) < from), ch = (a, b) => b ? (a >= b ? '▲ ' : '▼ ') + Math.abs(Math.round((a - b) * 100 / b)) + '%' : '';
      const dayMap = new Map(); for (let i = 0; i < days; i++) dayMap.set(K.addD(from, i), 0); V.forEach(x => { const k = String(x.at).slice(0, 10); if (dayMap.has(k)) dayMap.set(k, dayMap.get(k) + 1); });
      const dmax = Math.max(1, ...dayMap.values()), hours = Array(24).fill(0); V.forEach(x => { const h = new Date(x.at).getHours(); if (h >= 0) hours[h]++; }); const hmax = Math.max(1, ...hours);
      const secRows = Object.keys(SEC).map(k => [k, V.filter(x => x.secs.has(k)).length]).filter(r => r[1]).sort((a, b) => b[1] - a[1]);
      const clkRows = count(V.flatMap(x => x.clk.map(c => ({ c: String(c) }))), x => x.c);
      const setupCard = H.card('Connect the website', (() => { const set = S.set || {}, srv = String(set.server || '').replace(/\/+$/, ''); let tid = ''; try { const t = getGlobalAccessToken(); tid = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).tid || ''; } catch (e) {}
        return `<span class="mb-hint">The website sends visit data to a collector address, set in the website's <b>index.html</b> (<code>const ANALYTICS_URL = '…'</code>). Use one of these:</span>
          <p style="margin:10px 0 4px"><b>1 · ORBIT ERP server</b> ${srv ? '' : '<span class="mb-hint">(not connected — Finance settings → database server)</span>'}</p><div class="ws-code">${esc((srv || 'https://your-orbit-server') + '/v1/site/hit/' + (tid || 'your-tenant-id'))}</div>
          <p style="margin:12px 0 4px"><b>2 · Power Automate</b> (SharePoint only, needs a Premium licence)</p><span class="mb-hint">New flow → trigger "When an HTTP request is received" → action "Create item" in the SharePoint list <b>Web_Visits</b>, mapping each field from <code>json(triggerBody())</code>: k→Kind, vid→VisitId, uid→VisitorId, page→Page, ref→Referrer, src→Source, med→Medium, cmp→Campaign, lang→Lang, dev→Device, br→Browser, os→OS, ctry→Country, tz→Tz, scr→Screen, nw→NewVisitor, dur→Duration, sc→Scroll, secs→Sections, clk→Clicks, utcNow()→At. Paste the flow's address into the website.</span>
          <div class="mx-acts" style="margin-top:10px">${H.sbtn(v.busy ? '⏳ ' + esc(v.busy) : '🛠 Create the Web_Visits list', 'setup')}${H.sbtn('🧹 Delete visits older than 1 year', 'purge', '', 'r')}</div>
          <span class="mb-hint">Privacy: no cookies, no IP addresses, no names — only a random visitor number kept in the visitor's own browser, the page, language, device type, time zone country, and which sections and buttons were used.</span>`; })());
      return H.head('📊', 'Website traffic', 'Visitors of the Orbit website — sources, devices, languages, sections and clicks', '#0e7490')
        + (d.busy ? '<div class="mx-ld"><i></i><i></i><i></i> Loading…</div>' : '') + (d.err ? `<div class="mb-hint mb-bad">⚠ ${esc(d.err)}</div>` : '')
        + H.tabs('days', [['7', 'Last 7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '12 months']], '30')
        + H.kpis([[PV.length ? 'Visits (vs previous period)' : 'Visits', n.toLocaleString() + (PV.length ? ' · ' + ch(n, PV.length) : ''), 'g'], ['Visitors', users.toLocaleString()], ['New visitors', pct(newU, n) + '%'], ['Avg. time on site', mmss(avg)], ['Bounce rate', pct(bounce, n) + '%', pct(bounce, n) > 60 ? 'o' : ''], ['Leads (demo, contact, login)', conv + ' · ' + pct(conv, n) + '%', conv ? 'g' : '']])
        + (n ? H.card('Visits per day', `<div class="ws-days">${[...dayMap.entries()].map(([k, c]) => `<div style="height:${Math.max(2, c * 100 / dmax)}%" data-t="${dmy(k)} · ${c}"></div>`).join('')}</div><div class="ws-axis"><span>${dmy(from)}</span><span>${dmy(today())}</span></div>`)
          + H.card('Where visitors come from', barList(count(V, srcOf), n, '#6d5df6'))
          + H.card('Countries', barList(count(V, x => x.ctry), n, '#0e7490'))
          + H.card('Devices', barList(count(V, x => x.dev), n, '#14b8a6')) + H.card('Language', barList(count(V, x => x.lang === 'ar' ? 'Arabic' : x.lang === 'en' ? 'English' : x.lang), n, '#be185d'))
          + H.card('Sections reached', barList(secRows, n, '#4f46e5', k => SEC[k] || k)) + H.card('Buttons and actions', barList(clkRows, n, '#b45309', k => { const [a, b] = String(k).split(':'); return (CLK[a] || a) + (b ? ' · ' + b : ''); }))
          + H.card('Busiest hours', `<div class="ws-hours">${hours.map((c, h) => `<div title="${h}:00 · ${c} visits" style="opacity:${.12 + .88 * c / hmax}"></div>`).join('')}</div><div class="ws-axis"><span>00:00</span><span>12:00</span><span>23:00</span></div>`)
          + H.card('Browsers & systems', barList(count(V, x => (x.br || '?') + ' · ' + (x.os || '?')), n, '#64748b'))
          + H.card('Latest visits', FU.table([{ k: 't', t: 'When' }, { k: 's', t: 'Source' }, { k: 'c', t: 'Country' }, { k: 'd', t: 'Device' }, { k: 'l', t: 'Lang' }, { k: 'u', t: 'Time' }, { k: 'x', t: 'Did' }], V.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 25).map(x => ({ t: String(x.at).slice(0, 16).replace('T', ' '), s: srcOf(x), c: x.ctry, d: x.dev, l: x.lang, u: x.dur ? mmss(x.dur) : '—', x: x.clk.map(c => (CLK[c.split(':')[0]] || c).replace(/^\S+\s/, '')).join(', ') || [...x.secs].map(s => SEC[s] || s).slice(-1).join('') }))))
          : H.card('', `<div class="mb-hint">${d.missing ? 'The Web_Visits list does not exist yet — create it below, then connect the website.' : 'No visits in this period yet. Once the website is connected, visits appear here within a minute.'}</div>`))
        + setupCard;
    },
    act: {
      async setup(t, v) { if (v.busy) return; v.busy = 'Starting…'; render(); try { await FU.setupLists({ Web_Visits: Q.LISTS.Web_Visits }, n => { v.busy = n; render(); }); K.drop('Web_Visits'); toast('✅ Web_Visits list is ready', 'success'); } catch (e) { toast(e.message, 'error'); } v.busy = ''; K.A().go('x_webstats'); },
      async purge(t, v, d) { const old = (d.rows || []).filter(r => String(r.at).slice(0, 10) < K.addD(today(), -365)); if (!old.length) return toast('Nothing older than one year', 'info'); if (!confirm('Delete ' + old.length + ' visit row(s) older than one year?')) return;
        try { for (const r of old) await S.del('Web_Visits', r.id); S.drop('Web_Visits'); toast('🧹 Deleted ' + old.length, 'success'); K.A().go('x_webstats'); } catch (e) { toast(e.message, 'error'); } }
    }
  });
})();
