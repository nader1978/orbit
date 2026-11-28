/* ============================================================
   ORBIT SALES & MARKETING — Bulk e-mail (Distributions → Sales & Marketing → Bulk email)
   • Recipient lists from Excel / CSV files (any columns; the e-mail column is found by its heading),
     cleaned (invalid, duplicate and unsubscribed addresses removed), optionally split into lists of N.
   • Compose: subject, HTML body with a live preview, ready-made layouts, or "Design with AI" (Google Gemini,
     the key an administrator set for ORBIT's AI), personal fields like {name}, attachments, unsubscribe line.
   • Send: one e-mail per person (personal) or BCC groups, at a safe speed, with progress, pause / stop / resume,
     a log of failures, and a test e-mail to yourself first. Sent through the user's Microsoft 365 mailbox
     (or the Power Automate flow), as set in Settings → Send email directly.
   Lists: Sal_MailLists (parts of 250 people), Sal_MailRuns, Sal_Unsubscribed.
   ============================================================ */
(function () {
  'use strict';
  const K = window.MOBXK, Q = window.SAL, S = window.FINSTORE, FU = window.FIN_UI;
  if (!K || !Q || !S || !FU) return;
  const { reg, esc, num, today, str, toast, V, render, cur, H, iso, me, dmy } = K;
  const PART = 250, RX = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']{2,}$/;
  const lc = s => String(s || '').trim().toLowerCase();
  const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
  const RUN = { on: false, pause: false, stop: false };
  let ATT = [];   /* attachments are kept only while this page is open: { fileName, contentType, dataB64, size } */

  /* ---------- data ---------- */
  async function load(force) {
    const o = { missing: false };
    try { const rows = await S.list('Sal_MailLists', force); const by = new Map();
      rows.forEach(r => { const k = r.listname || r.title; if (!by.has(k)) by.set(k, { name: k, parts: [], cols: J(r.columns, []), source: r.source || '', count: 0, created: String(r.created || '').slice(0, 10) }); const L = by.get(k); L.parts.push({ id: Number(r.id), part: num(r.part), rows: num(r.rowcount) }); L.count += num(r.rowcount); });
      o.lists = [...by.values()].sort((a, b) => a.name.localeCompare(b.name)); } catch (e) { if (/not found/i.test(e.message)) o.missing = true; o.lists = []; }
    o.runs = await S.list('Sal_MailRuns', force).then(r => r.map(x => ({ id: Number(x.id), subject: x.title || '', status: x.status || 'draft', lists: x.lists || '', mode: x.mode || 'single', campaign: x.campaign || '', started: x.startedat || '', finished: x.finishedat || '', by: x.by || '', atts: x.attachments || '', total: num(x.total), sent: num(x.sent), failed: num(x.failed), pos: num(x.pos), html: x.bodyhtml || '', log: J(x.log, []) })).sort((a, b) => b.id - a.id)).catch(() => []);
    o.unsub = await S.list('Sal_Unsubscribed', force).then(r => r.map(x => ({ id: Number(x.id), email: lc(x.email || x.title), reason: x.reason || '', on: x.ondate || '' }))).catch(() => []);
    o.camps = await S.list('Sal_Campaigns', force).then(r => r.map(x => x.title).filter(Boolean)).catch(() => []);
    return o;
  }
  async function people(list) {   /* all rows of a saved list */
    const rows = (await S.list('Sal_MailLists', false)).filter(r => (r.listname || r.title) === list.name).sort((a, b) => num(a.part) - num(b.part));
    return rows.flatMap(r => J(r.data, []));
  }

  /* ---------- Excel / CSV reading ---------- */
  function readFile(file) {
    return new Promise((ok, bad) => { if (!window.XLSX) return bad(new Error('The Excel reader is not loaded — check the internet connection and reload.'));
      const fr = new FileReader(); fr.onerror = () => bad(new Error('Could not read ' + file.name));
      fr.onload = () => { try { const wb = XLSX.read(new Uint8Array(fr.result), { type: 'array' }); const out = [];
          wb.SheetNames.forEach(sn => { const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '', raw: false }); if (rows.length) out.push({ sheet: sn, rows }); }); ok(out); } catch (e) { bad(new Error(file.name + ': ' + e.message)); } };
      fr.readAsArrayBuffer(file); });
  }
  const pickCol = (cols, words) => cols.find(c => words.some(w => lc(c) === w)) || cols.find(c => words.some(w => lc(c).includes(w))) || '';
  /* rows → { email, name, …other columns }, cleaned */
  function clean(rows, emailCol, nameCol, unsub) {
    const seen = new Set(), U = new Set(unsub), out = [], st = { read: rows.length, bad: 0, dup: 0, unsub: 0 };
    rows.forEach(r => { String(r[emailCol] || '').split(/[;,\s]+/).filter(Boolean).forEach(e0 => { const e = lc(e0).replace(/^mailto:/, '');
      if (!RX.test(e)) { st.bad++; return; } if (seen.has(e)) { st.dup++; return; } if (U.has(e)) { st.unsub++; return; } seen.add(e);
      const p = { email: e, name: str(r[nameCol] || '') }; Object.keys(r).forEach(k => { if (k !== emailCol && k !== nameCol && str(r[k])) p[k] = str(r[k]); }); out.push(p); }); });
    st.ok = out.length; return { people: out, st };
  }
  async function saveList(name, ppl, cols, source) {
    for (let i = 0, p = 1; i < ppl.length; i += PART, p++) { const part = ppl.slice(i, i + PART); await S.add('Sal_MailLists', { Title: name, ListName: name, Part: p, RowCount: part.length, Columns: JSON.stringify(cols), Source: source, Data: JSON.stringify(part) }); }
    S.drop('Sal_MailLists');
  }

  /* ---------- message ---------- */
  const fill = (tpl, p) => String(tpl || '').replace(/\{\s*([^{}]{1,40}?)\s*\}/g, (m, k) => { const key = Object.keys(p).find(x => lc(x) === lc(k)); if (key == null) return lc(k) === 'name' ? (p.name || '') : m; return esc(p[key] || ''); }).replace(/\{\s*name\s*\|\s*([^{}]{1,30})\}/gi, (m, d) => esc(p.name || d));
  const unsubLine = (v, me_) => `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb;font:12px/1.5 Arial,sans-serif;color:#6b7280;text-align:center">${esc(v.unsubTxt || 'You receive this e-mail because you are in contact with us. To stop receiving these e-mails, reply with the word UNSUBSCRIBE.')}${me_ ? '' : ''}</div>`;
  const finalHtml = (v, p) => { let h = fill(v.html || '', p); if (v.unsub !== 'no') h = /<\/body>/i.test(h) ? h.replace(/<\/body>/i, unsubLine(v) + '</body>') : h + unsubLine(v); return h; };
  const subj = (v, p) => fill(v.subject || '', p).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  const LAYOUTS = {
    offer: { t: 'Offer / promotion', h: `<div style="background:#f3f4f8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden" cellpadding="0" cellspacing="0"><tr><td style="background:#4f46e5;padding:28px 32px;color:#ffffff"><div style="font-size:13px;letter-spacing:1px;opacity:.85">SPECIAL OFFER</div><div style="font-size:28px;font-weight:bold;margin-top:6px">Up to 20% off this month</div></td></tr><tr><td style="padding:28px 32px;color:#1f2937;font-size:16px;line-height:1.6">Dear {name|valued customer},<br><br>Write two or three short lines about the offer: what it is, who it is for and until when.<br><br><a href="https://example.com" style="display:inline-block;background:#14b8a6;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">See the offer</a></td></tr><tr><td style="padding:18px 32px;background:#f9fafb;color:#6b7280;font-size:13px">Your company name · phone · website</td></tr></table></div>` },
    news: { t: 'Newsletter', h: `<div style="background:#f3f4f8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px" cellpadding="0" cellspacing="0"><tr><td style="padding:26px 32px;border-bottom:4px solid #4f46e5"><div style="font-size:22px;font-weight:bold;color:#111827">Company news · Month</div></td></tr><tr><td style="padding:24px 32px;color:#1f2937;font-size:16px;line-height:1.6">Hello {name|there},<br><br><b style="font-size:18px">First story</b><br>Two or three lines.<br><br><b style="font-size:18px">Second story</b><br>Two or three lines.<br><br><b style="font-size:18px">Coming up</b><br>Dates, events or products.</td></tr><tr><td style="padding:18px 32px;background:#f9fafb;color:#6b7280;font-size:13px">Your company name · phone · website</td></tr></table></div>` },
    plain: { t: 'Simple letter', h: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:600px">Dear {name|Sir / Madam},<br><br>Your message here.<br><br>Kind regards,<br><b>Your name</b><br>Company · phone</div>` },
    ar: { t: 'Arabic offer (RTL)', h: `<div dir="rtl" style="background:#f3f4f8;padding:24px 12px;font-family:Tahoma,Arial,sans-serif"><table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden" cellpadding="0" cellspacing="0"><tr><td style="background:#4f46e5;padding:28px 32px;color:#ffffff;text-align:right"><div style="font-size:28px;font-weight:bold">عرض خاص هذا الشهر</div></td></tr><tr><td style="padding:28px 32px;color:#1f2937;font-size:16px;line-height:1.8;text-align:right">عزيزي {name|العميل الكريم}،<br><br>اكتب سطرين أو ثلاثة عن العرض: ما هو، ولمن، وحتى متى.<br><br><a href="https://example.com" style="display:inline-block;background:#14b8a6;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">اطّلع على العرض</a></td></tr><tr><td style="padding:18px 32px;background:#f9fafb;color:#6b7280;font-size:13px;text-align:right">اسم شركتك · الهاتف · الموقع</td></tr></table></div>` }
  };

  /* ---------- AI design (Google Gemini, the key set by the administrator for ORBIT's AI) ---------- */
  async function aiDesign(v, cols) {
    const L = window.LIM, cfg = L && L.aiCfg ? L.aiCfg() : { key: '' };
    if (!cfg.key) throw new Error(L && L.isAdm && L.isAdm() ? 'AI is not switched on — set the Google Gemini key in the AI settings (📷 photos → 🤖 AI settings) first.' : 'AI is not switched on yet — please ask an administrator to set it up.');
    let co = ''; try { co = (document.querySelector('[data-brand="name"]') || {}).textContent || ''; } catch (e) {}
    const prompt = `You design marketing e-mails. Write ONE complete HTML e-mail body (no <html>, <head> or markdown fences).
Rules: table-based layout, max width 600px, centred, inline CSS only, web-safe fonts, works in Outlook and Gmail, mobile friendly, clear heading, short paragraphs, one clear call-to-action button (use the link the user gives, else https://example.com), a footer with company name and contact placeholders. No images unless the user gives an image URL. No JavaScript, no forms, no external CSS.
Personal fields: use {name|<fallback>} where the reader's name goes${cols.length ? ' and you may use these fields from the recipient list: ' + cols.map(c => '{' + c + '}').join(', ') : ''}.
Language: ${v.aiLang === 'ar' ? 'Arabic, right-to-left (dir="rtl" on the outer element, text-align:right)' : v.aiLang === 'both' ? 'English first, then the same message in Arabic in a right-to-left block' : 'English'}. Tone: ${v.aiTone || 'professional and friendly'}.
Brand colours: ${v.aiColors || 'indigo #4f46e5 with teal #14b8a6 accents'}. Company: ${str(v.aiCompany) || co.trim() || 'the sender\'s company'}.
What the e-mail is about: ${str(v.aiBrief)}
Also, on the very first line, write the subject line as: SUBJECT: <subject>`;
    const out = await L.aiCall(cfg, [{ text: prompt }], false);
    let s = String(out).replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim(), subject = '';
    const m = s.match(/^SUBJECT:\s*(.+)$/im); if (m) { subject = m[1].trim(); s = s.replace(m[0], '').trim(); }
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
    return { html: s, subject };
  }

  /* ---------- sending ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function send1(to, v, p, bcc) {
    return mailSend_send({ to, bcc: bcc || '', subject: subj(v, p), html: finalHtml(v, p), attachments: ATT, noSave: v.keepCopy !== 'yes' });
  }
  async function runSend(d, v, recips, runId, startAt) {
    RUN.on = true; RUN.pause = false; RUN.stop = false; const log = []; let sent = 0, failed = 0, i = startAt || 0;
    const mode = v.mode || 'single', group = Math.max(1, Math.min(50, num(v.group) || 30)), wait = Math.max(1, num(v.delay) || 2.5) * 1000, self = (typeof currentUser !== 'undefined' && currentUser && currentUser.email) || '';
    const save = async (status, fin) => { try { await S.upd('Sal_MailRuns', runId, Object.assign({ Status: status, Sent: sent + (startAt ? (d.resumeSent || 0) : 0), Failed: failed + (startAt ? (d.resumeFailed || 0) : 0), Pos: i, Log: JSON.stringify(log.slice(-300)) }, fin ? { FinishedAt: iso() } : {})); } catch (e) {} };
    const prog = () => { const el = document.querySelector('#smProg'); if (el) el.innerHTML = progHtml(i, recips.length, sent, failed, RUN.pause); };
    try {
      while (i < recips.length) {
        if (RUN.stop) { await save('stopped', true); break; }
        if (RUN.pause) { prog(); await sleep(500); continue; }
        const batch = mode === 'bcc' ? recips.slice(i, i + group) : [recips[i]];
        try { if (mode === 'bcc') await send1(self || batch[0].email, v, { name: '' }, batch.map(x => x.email).join(';')); else await send1(batch[0].email, v, batch[0]); sent += batch.length; }
        catch (e) { failed += batch.length; log.push({ at: iso(), to: batch.map(x => x.email).join(', '), error: String(e.message || e).slice(0, 200) });
          if (/HTTP 429|throttl|quota|limit/i.test(e.message)) { log.push({ at: iso(), to: '', error: 'Mailbox sending limit reached — paused for 60 s' }); i += batch.length; prog(); await sleep(60000); continue; }
          if (/HTTP 401|HTTP 403|sign-in|not set up|not configured/i.test(e.message)) { i += batch.length; await save('stopped', true); throw e; } }
        i += batch.length; prog(); if (i % 10 === 0 || i >= recips.length) await save('sending');
        if (i < recips.length) await sleep(wait);
      }
      if (!RUN.stop) await save('sent', true);
    } finally { RUN.on = false; S.drop('Sal_MailRuns'); }
    return { sent, failed, log };
  }
  const progHtml = (i, n, sent, failed, paused) => `<div class="sm-bar"><i style="width:${n ? Math.round(i * 100 / n) : 0}%"></i></div><div class="ei-kv"><span>${paused ? '⏸ Paused' : '📤 Sending'} · ${i} of ${n}</span><b>✅ ${sent} sent${failed ? ' · ⚠ ' + failed + ' failed' : ''}</b></div>`;

  const css = document.createElement('style');
  css.textContent = `.sm-prev{width:100%;height:520px;border:1px solid var(--border,#e2e8f0);border-radius:12px;background:#fff}
#smHtml{width:100%;min-height:260px;font:12.5px/1.45 ui-monospace,Consolas,monospace;border-radius:10px;border:1px solid var(--border,#e2e8f0);padding:10px}
.sm-bar{height:12px;border-radius:8px;background:var(--gray-100,#eef2f7);overflow:hidden;margin:6px 0}.sm-bar i{display:block;height:100%;background:linear-gradient(90deg,#4f46e5,#14b8a6);transition:width .4s}
.sm-att{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.sm-att span{padding:6px 10px;border-radius:999px;background:var(--gray-100,#eef2f7);font-size:12.5px}
.sm-lists label{display:flex!important;justify-content:flex-start;align-items:center;gap:10px;text-align:start;padding:8px 10px;border:1px solid var(--border,#e2e8f0);border-radius:10px;margin:6px 0;cursor:pointer;font-weight:500}
.sm-lists input[type=checkbox]{width:18px!important;height:18px;min-height:0!important;flex:none;margin:0;padding:0}
.sm-tok{display:flex;flex-wrap:wrap;gap:6px}.sm-tok button{font:12.5px ui-monospace,Consolas,monospace;padding:4px 8px;border-radius:7px;border:1px solid var(--border,#e2e8f0);background:var(--card,#fff);cursor:pointer}`;
  document.head.appendChild(css);

  /* live preview + html editing without re-rendering the page */
  document.addEventListener('input', e => { if (e.target && e.target.id === 'smHtml') { const v = V(); v.html = e.target.value; prev(v); } });
  document.addEventListener('change', async e => { const t = e.target; if (!t || !t.id) return;
    if (t.id === 'smFiles') { const v = V(), d = K.D.x_salmail || {}; v.imp = { files: [], sheets: [] }; v.err = null;
      try { for (const f of t.files) { const sh = await readFile(f); sh.forEach(s => v.imp.sheets.push(Object.assign({ file: f.name }, s))); v.imp.files.push(f.name); }
        const cols = [...new Set(v.imp.sheets.flatMap(s => Object.keys(s.rows[0] || {})))]; v.imp.cols = cols; v.ecol = pickCol(cols, ['email', 'e-mail', 'mail', 'بريد', 'البريد الإلكتروني']); v.ncol = pickCol(cols, ['name', 'full name', 'contact', 'customer', 'الاسم', 'اسم']);
        v.lname = v.lname || v.imp.files[0].replace(/\.[^.]+$/, ''); } catch (x) { v.err = x.message; } render(); }
    if (t.id === 'smAtt') { const v = V(); for (const f of t.files) { if (f.size > 3e6) { toast(f.name + ' is larger than 3 MB', 'warn'); continue; } const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(f); }); ATT.push({ fileName: f.name, contentType: f.type || 'application/octet-stream', dataB64: b64, size: f.size }); } t.value = ''; render(); } });
  function prev(v) { const f = document.querySelector('#smPrev'); if (!f) return; const p = Object.assign({ email: 'name@example.com', name: 'Ahmed' }, (v.sample || {})); f.srcdoc = '<!doctype html><meta charset="utf-8"><body style="margin:0;padding:12px">' + finalHtml(v, p) + '</body>'; }

  reg('x_salmail', {
    load(v, f) { const d = K.D.x_salmail = K.D.x_salmail || {}; d.busy = 1; if (cur() === 'x_salmail') render(); load(f).then(o => Object.assign(d, o)).catch(e => { d.err = e.message; }).finally(() => { d.busy = 0; if (cur() === 'x_salmail') { render(); setTimeout(() => prev(V()), 50); } }); },
    view(v, d) {
      const tab = v.tab || 'compose', lists = d.lists || [];
      if (v.html == null) v.html = LAYOUTS.offer.h; if (v.subject == null) v.subject = ''; if (!v.chosen) v.chosen = [];
      const totSel = lists.filter(l => v.chosen.includes(l.name)).reduce((s, l) => s + l.count, 0), totAtt = ATT.reduce((s, a) => s + a.size, 0);
      const head = H.head('📧', 'Bulk email', 'Marketing and announcement e-mails to lists from Excel · AI layout · attachments', '#be185d')
        + (d.busy ? '<div class="mx-ld"><i></i><i></i><i></i> Loading…</div>' : '') + (d.err ? `<div class="mb-hint mb-bad">⚠ ${esc(d.err)}</div>` : '')
        + (d.missing ? H.card('', `<div class="mb-hint mb-bad">The bulk e-mail lists are not set up yet.</div>${H.btn(v.busy ? '⏳ ' + esc(v.busy) : '🛠 Set up lists', 'setup')}`) : '')
        + H.tabs('tab', [['compose', '✍️ Compose & send'], ['lists', '👥 Recipient lists', lists.length], ['runs', '📤 Sent', (d.runs || []).length], ['unsub', '🚫 Unsubscribed', (d.unsub || []).length]], 'compose');
      if (tab === 'lists') {
        const imp = v.imp;
        return head + H.card('Import from Excel or CSV', `<span class="mb-hint">One or more .xlsx / .xls / .csv files; every sheet is read. The first row must hold the column names. Invalid, duplicate and unsubscribed addresses are removed.</span><input id="smFiles" type="file" accept=".xlsx,.xls,.csv" multiple style="margin:10px 0">`
            + (v.err ? `<div class="mb-hint mb-bad">⚠ ${esc(v.err)}</div>` : '')
            + (imp && imp.cols ? (() => { const all = imp.sheets.flatMap(s => s.rows), c = v.ecol ? clean(all, v.ecol, v.ncol, (d.unsub || []).map(x => x.email)) : null;
              return `<div class="mb-hint">${imp.files.length} file(s) · ${imp.sheets.length} sheet(s) · ${all.length} row(s)</div><div class="fin-row">${H.f('E-mail column', H.sel('ecol', imp.cols, { ph: '— choose —' }))}${H.f('Name column', H.sel('ncol', imp.cols, { ph: '— none —' }))}</div>`
                + (c ? `<div class="ei-kv g"><span>Ready to save</span><b>${c.st.ok} people</b></div><div class="ei-kv"><span>Removed</span><b>${c.st.bad} invalid · ${c.st.dup} duplicate · ${c.st.unsub} unsubscribed</b></div>` : '')
                + `<div class="fin-row">${H.f('List name', H.inp('lname'))}${H.f('Split into lists of (0 = one list)', H.num('split', { ph: '0' }))}</div>${H.btn('💾 Save list', 'saveImp')}`; })() : ''))
          + H.card('Saved lists', lists.length ? FU.table([{ k: 'n', t: 'List' }, { k: 'c', t: 'People', n: 1 }, { k: 'f', t: 'Fields' }, { k: 's', t: 'From file' }], lists.map(l => ({ n: l.name, c: l.count, f: (l.cols || []).slice(0, 6).join(', '), s: l.source, _tap: l.name })), { n: 'Total', c: lists.reduce((s, l) => s + l.count, 0) }, 'openList') : '<span class="mb-hint">No lists yet — import an Excel file above.</span>')
          + (v.openL ? H.card('List · ' + esc(v.openL), `<div class="mx-acts">${H.sbtn('⬇ Download (CSV)', 'dlList')}${H.sbtn('🗑 Delete list', 'delList', '', 'r')}${H.sbtn('Close', 'closeL')}</div>`) : '');
      }
      if (tab === 'runs') return head + H.card('Sending history', (d.runs || []).length ? FU.table([{ k: 's', t: 'Subject' }, { k: 'l', t: 'Lists' }, { k: 'd', t: 'Started' }, { k: 't', t: 'People', n: 1 }, { k: 'ok', t: 'Sent', n: 1 }, { k: 'f', t: 'Failed', n: 1 }, { k: 'st', t: 'Status' }], d.runs.map(r => ({ s: r.subject, l: r.lists, d: dmy(String(r.started).slice(0, 10)), t: r.total, ok: r.sent, f: r.failed, st: r.status, _tap: r.id })), null, 'openRun') : '<span class="mb-hint">Nothing sent yet.</span>')
        + (v.runId ? (() => { const r = d.runs.find(x => x.id === v.runId); if (!r) return ''; return H.card('Run · ' + esc(r.subject), `<div class="ei-kv"><span>By</span><b>${esc(r.by)}</b></div><div class="ei-kv"><span>Mode</span><b>${r.mode === 'bcc' ? 'BCC groups' : 'one e-mail per person'}</b></div><div class="ei-kv"><span>Attachments</span><b>${esc(r.atts || '—')}</b></div>`
            + (r.log.length ? FU.table([{ k: 'a', t: 'Time' }, { k: 'to', t: 'To' }, { k: 'e', t: 'Problem' }], r.log.map(x => ({ a: String(x.at).slice(11, 19), to: x.to, e: x.error })), null) : '<span class="mb-hint">No failures.</span>')
            + `<div class="mx-acts">${H.sbtn('↺ Use this e-mail again', 'reuse')}${['stopped', 'sending'].includes(r.status) && r.pos < r.total ? H.sbtn('▶ Resume from ' + (r.pos + 1), 'resume', '', 'p') : ''}</div>`); })() : '');
      if (tab === 'unsub') return head + H.card('People who asked not to be e-mailed', `<span class="mb-hint">They are left out of every list and every send. When someone replies "UNSUBSCRIBE", add the address here.</span><div class="fin-row">${H.f('E-mail', H.inp('uEmail', { type: 'email' }))}${H.f('Reason', H.inp('uReason', { ph: 'replied UNSUBSCRIBE' }))}</div>${H.sbtn('＋ Add', 'addUnsub', '', 'p')}`
        + ((d.unsub || []).length ? FU.table([{ k: 'e', t: 'E-mail' }, { k: 'r', t: 'Reason' }, { k: 'd', t: 'Date' }, { k: 'x', t: '', raw: 1 }], d.unsub.map(u => ({ e: u.email, r: u.reason, d: dmy(u.on), x: `<button type="button" class="mx-sb r" data-x="delUnsub" data-i="${u.id}">✕</button>` }))) : ''));
      /* compose */
      const cols = [...new Set(lists.filter(l => v.chosen.includes(l.name)).flatMap(l => l.cols || []))].filter(c => c !== v.ecol);
      const mode = v.mode || 'single', per = mode === 'bcc' ? Math.max(1, Math.min(50, num(v.group) || 30)) : 1, msgs = Math.ceil(totSel / per), mins = Math.ceil(msgs * Math.max(1, num(v.delay) || 2.5) / 60);
      return head
        + H.card('1 · Who receives it', lists.length ? `<div class="sm-lists">${lists.map(l => `<label><input type="checkbox" data-x="pick" data-n="${esc(l.name)}"${v.chosen.includes(l.name) ? ' checked' : ''}> ${esc(l.name)} <span class="mb-hint" style="margin:0">· ${l.count} people</span></label>`).join('')}</div><div class="ei-kv g"><span>Selected</span><b>${totSel} people (duplicates across lists are sent once)</b></div>` : `<span class="mb-hint">No recipient lists yet.</span> ${H.sbtn('👥 Import from Excel', 'toLists', '', 'p')}`)
        + H.card('2 · Design the e-mail', `${H.f('Subject', H.inp('subject', { ph: 'e.g. {name|Dear customer}, our new offer is here' }))}
          <div class="mx-acts" style="margin:6px 0 10px">${Object.entries(LAYOUTS).map(([k, x]) => H.sbtn('🧩 ' + x.t, 'layout', `data-k="${k}"`)).join('')}${H.sbtn(v.aiOpen ? '✕ Close AI' : '🤖 Design with AI', 'aiToggle', '', 'p')}</div>`
          + (v.aiOpen ? `<div class="card" style="padding:14px;margin:8px 0;border:1px dashed #a78bfa">${H.f('Describe the e-mail (offer, audience, button link, dates…)', H.txt('aiBrief', 'e.g. Ramadan offer: 15% off all dairy products for supermarkets until 30 March. Button "Order now" → https://…'))}<div class="fin-row">${H.f('Language', H.sel('aiLang', [['en', 'English'], ['ar', 'Arabic'], ['both', 'English + Arabic']], { ph: false }))}${H.f('Tone', H.sel('aiTone', ['professional and friendly', 'formal', 'energetic sales', 'warm and personal', 'short and direct'], { ph: false }))}</div><div class="fin-row">${H.f('Colours', H.inp('aiColors', { ph: 'e.g. green #15803d and gold' }))}${H.f('Company name', H.inp('aiCompany'))}</div>${H.btn(v.aiBusy ? '⏳ Designing…' : '✨ Create the layout', 'aiGo')}<span class="mb-hint">The text you write here is sent to Google Gemini to design the layout; recipient lists are not sent.</span></div>` : '')
          + `<div class="mb-hint" style="margin:4px 0">Personal fields — click to copy:</div><div class="sm-tok">${['{name|valued customer}', '{email}'].concat(cols.map(c => '{' + c + '}')).map(t => `<button type="button" data-x="tok" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          <div class="fin-row" style="align-items:start;margin-top:10px"><div style="flex:1;min-width:280px">${'<label style="font-weight:600;font-size:13px">HTML (edit freely)</label>'}<textarea id="smHtml" spellcheck="false">${esc(v.html)}</textarea></div><div style="flex:1;min-width:280px"><label style="font-weight:600;font-size:13px">Preview</label><iframe id="smPrev" class="sm-prev" sandbox="" title="E-mail preview"></iframe></div></div>
          <div class="fin-row">${H.f('Unsubscribe line at the bottom', H.sel('unsub', [['yes', 'Yes (recommended)'], ['no', 'No']], { ph: false }))}${H.f('Unsubscribe text', H.inp('unsubTxt', { ph: 'You receive this e-mail because… reply UNSUBSCRIBE to stop.' }))}</div>`)
        + H.card('3 · Attachments', `<input id="smAtt" type="file" multiple><div class="sm-att">${ATT.map((a, i) => `<span>📎 ${esc(a.fileName)} · ${Math.round(a.size / 1024)} KB <button type="button" class="mx-sb r" data-x="rmAtt" data-i="${i}">✕</button></span>`).join('')}</div><span class="mb-hint">${ATT.length ? 'Total ' + Math.round(totAtt / 1024) + ' KB of about 3 MB. ' : ''}Attachments are sent with every e-mail. For large files (catalogues, videos) put a link in the e-mail instead.</span>`)
        + H.card('4 · Send', `<div class="fin-row">${H.f('How', H.sel('mode', [['single', 'One e-mail per person (personal, recommended)'], ['bcc', 'BCC groups (faster, not personal)']], { ph: false }))}${mode === 'bcc' ? H.f('People per e-mail (max 50)', H.num('group', { ph: '30' })) : ''}${H.f('Seconds between e-mails', H.num('delay', { ph: '2.5' }))}</div>
          <div class="fin-row">${H.f('Marketing campaign (optional)', H.sel('camp', d.camps || [], { ph: '—' }))}${H.f('Keep a copy in Sent Items', H.sel('keepCopy', [['no', 'No'], ['yes', 'Yes']], { ph: false }))}</div>
          <div class="ei-kv"><span>Will send</span><b>${msgs} e-mail(s) · about ${mins} minute(s)</b></div>
          <span class="mb-hint">Sent from your Microsoft 365 mailbox (Settings → Send email directly). Keep this page open while sending; you can pause or stop. Microsoft 365 allows about 30 e-mails a minute and 10,000 recipients a day per mailbox. Only e-mail people who agreed to hear from you.</span>
          <div id="smProg">${RUN.on ? '' : ''}</div>
          <div class="mx-acts">${H.sbtn('🧪 Send a test to me', 'test')}${RUN.on ? H.sbtn(RUN.pause ? '▶ Continue' : '⏸ Pause', 'pause') + H.sbtn('⏹ Stop', 'stop', '', 'r') : H.sbtn('📤 Send to ' + totSel + ' people', 'send', '', 'p')}</div>`);
    },
    act: {
      async setup(t, v) { if (v.busy) return; v.busy = 'Starting…'; render(); try { const L = {}; ['Sal_MailLists', 'Sal_MailRuns', 'Sal_Unsubscribed', 'Sal_Campaigns'].forEach(n => { L[n] = Q.LISTS[n]; }); await FU.setupLists(L, n => { v.busy = n; render(); }); K.drop('Sal_MailLists', 'Sal_MailRuns', 'Sal_Unsubscribed'); toast('✅ Bulk e-mail lists are ready', 'success'); } catch (e) { toast(e.message, 'error'); } v.busy = ''; K.A().reload ? K.A().reload() : K.A().go('x_salmail'); },
      toLists(t, v) { v.tab = 'lists'; render(); },
      pick(t, v) { const n = t.dataset.n; v.chosen = v.chosen.includes(n) ? v.chosen.filter(x => x !== n) : v.chosen.concat([n]); render(); setTimeout(() => prev(v), 30); },
      layout(t, v) { if (v.html && v.html !== LAYOUTS.offer.h && !confirm('Replace the current e-mail with the "' + LAYOUTS[t.dataset.k].t + '" layout?')) return; v.html = LAYOUTS[t.dataset.k].h; render(); setTimeout(() => prev(v), 30); },
      aiToggle(t, v) { v.aiOpen = !v.aiOpen; render(); setTimeout(() => prev(v), 30); },
      async aiGo(t, v, d) { if (!str(v.aiBrief)) return toast('Describe the e-mail first', 'warn'); if (v.aiBusy) return; v.aiBusy = 1; render(); setTimeout(() => prev(v), 30);
        try { const cols = [...new Set((d.lists || []).filter(l => v.chosen.includes(l.name)).flatMap(l => l.cols || []))]; const r = await aiDesign(v, cols); v.html = r.html; if (r.subject && !str(v.subject)) v.subject = r.subject; toast('✨ Layout ready — check it and edit anything', 'success'); }
        catch (e) { toast(e.message, 'error'); } v.aiBusy = 0; render(); setTimeout(() => prev(v), 30); },
      async tok(t) { try { await navigator.clipboard.writeText(t.dataset.t); toast('Copied ' + t.dataset.t + ' — paste it into the subject or HTML', 'success'); } catch (e) { toast(t.dataset.t, 'info'); } },
      rmAtt(t) { ATT.splice(+t.dataset.i, 1); render(); setTimeout(() => prev(V()), 30); },
      async saveImp(t, v, d) { const imp = v.imp; if (!imp || !v.ecol) return toast('Choose the e-mail column', 'warn'); const name = str(v.lname); if (!name) return toast('Give the list a name', 'warn');
        if ((d.lists || []).some(l => l.name === name || l.name.startsWith(name + ' (')) && !confirm('A list called "' + name + '" exists. Add these people as a new list with the same name?')) return;
        const c = clean(imp.sheets.flatMap(s => s.rows), v.ecol, v.ncol, (d.unsub || []).map(x => x.email)); if (!c.people.length) return toast('No valid e-mail addresses found', 'warn');
        const cols = ['name', 'email'].concat(imp.cols.filter(x => x !== v.ecol && x !== v.ncol)), split = Math.max(0, num(v.split)), groups = [];
        if (split > 0) for (let i = 0, k = 1; i < c.people.length; i += split, k++) groups.push([name + ' (' + k + ')', c.people.slice(i, i + split)]); else groups.push([name, c.people]);
        try { for (const [n, p] of groups) await saveList(n, p, cols, imp.files.join(', ')); toast('👥 Saved ' + c.people.length + ' people in ' + groups.length + ' list(s)', 'success'); v.imp = null; v.lname = ''; K.A().go('x_salmail'); V().tab = 'lists'; } catch (e) { toast(e.message, 'error'); } },
      openList(t, v) { v.openL = t.dataset.i; render(); }, closeL(t, v) { v.openL = null; render(); },
      async dlList(t, v, d) { const l = d.lists.find(x => x.name === v.openL), ppl = await people(l), cols = [...new Set(ppl.flatMap(p => Object.keys(p)))]; FU.csv(l.name, cols.map(c => ({ k: c, t: c })), ppl); },
      async delList(t, v, d) { const l = d.lists.find(x => x.name === v.openL); if (!confirm('Delete the list "' + l.name + '" (' + l.count + ' people)?')) return; try { for (const p of l.parts) await S.del('Sal_MailLists', p.id); S.drop('Sal_MailLists'); v.openL = null; v.chosen = (v.chosen || []).filter(x => x !== l.name); toast('🗑 Deleted', 'success'); K.A().go('x_salmail'); V().tab = 'lists'; } catch (e) { toast(e.message, 'error'); } },
      openRun(t, v) { v.runId = +t.dataset.i; render(); },
      reuse(t, v, d) { const r = d.runs.find(x => x.id === v.runId); v.html = r.html; v.subject = r.subject; v.chosen = r.lists.split(' · ').filter(n => (d.lists || []).some(l => l.name === n)); v.tab = 'compose'; render(); setTimeout(() => prev(v), 30); },
      async addUnsub(t, v, d) { const e = lc(v.uEmail); if (!RX.test(e)) return toast('Enter a valid e-mail', 'warn'); if ((d.unsub || []).some(u => u.email === e)) return toast('Already in the list', 'info'); try { await S.add('Sal_Unsubscribed', { Title: e, Email: e, Reason: str(v.uReason) || 'asked to stop', OnDate: today() }); S.drop('Sal_Unsubscribed'); v.uEmail = ''; v.uReason = ''; K.A().go('x_salmail'); V().tab = 'unsub'; } catch (x) { toast(x.message, 'error'); } },
      async delUnsub(t) { if (!confirm('Allow e-mails to this address again?')) return; await S.del('Sal_Unsubscribed', +t.dataset.i); S.drop('Sal_Unsubscribed'); K.A().go('x_salmail'); V().tab = 'unsub'; },
      async test(t, v) { const self = (typeof currentUser !== 'undefined' && currentUser && currentUser.email) || prompt('Send the test to which e-mail address?'); if (!self || !str(v.subject)) return toast(!str(v.subject) ? 'Write the subject first' : 'No address', 'warn');
        try { const r = await send1(self, v, { email: self, name: (currentUser && currentUser.displayName) || 'Test' }); toast('🧪 Test ' + r, 'success'); } catch (e) { toast(e.message, 'error'); } },
      pause(t) { RUN.pause = !RUN.pause; render(); }, stop(t) { if (confirm('Stop sending? You can resume later from the Sent tab.')) RUN.stop = true; },
      async send(t, v, d) { return startRun(v, d, null); },
      async resume(t, v, d) { const r = d.runs.find(x => x.id === v.runId); if (r.atts && !ATT.length && !confirm('This e-mail had attachments (' + r.atts + '). Attachments are not kept — add them again on the Compose tab first, or continue without them?')) return;
        v.html = r.html; v.subject = r.subject; v.chosen = r.lists.split(' · '); v.mode = r.mode; v.tab = 'compose'; d.resumeSent = r.sent; d.resumeFailed = r.failed; render(); return startRun(v, d, r); }
    }
  });
  async function startRun(v, d, old) {
    if (RUN.on) return; if (!str(v.subject)) return toast('Write the subject first', 'warn'); if (!str(v.html)) return toast('The e-mail is empty', 'warn');
    if (typeof mailSend_cfg === 'function' && mailSend_cfg().method === 'draft') return toast('Bulk e-mail needs direct sending — Settings → Send email directly → Microsoft 365 or Power Automate.', 'error');
    const chosen = (d.lists || []).filter(l => (v.chosen || []).includes(l.name)); if (!chosen.length) return toast('Choose at least one recipient list', 'warn');
    const U = new Set((d.unsub || []).map(x => x.email)), seen = new Set(), recips = [];
    for (const l of chosen) (await people(l)).forEach(p => { const e = lc(p.email); if (RX.test(e) && !seen.has(e) && !U.has(e)) { seen.add(e); recips.push(p); } });
    if (!recips.length) return toast('No one to send to', 'warn');
    const totAtt = ATT.reduce((s, a) => s + a.size, 0); if (totAtt > 3e6) return toast('Attachments are over 3 MB in total — remove some or use a link.', 'error');
    if (!old && !confirm('Send "' + subj(v, { name: '' }) + '" to ' + recips.length + ' people' + (ATT.length ? ' with ' + ATT.length + ' attachment(s)' : '') + '?\n\nKeep ORBIT open until it finishes.')) return;
    let runId = old ? old.id : null;
    try { if (!runId) runId = (await S.add('Sal_MailRuns', { Title: str(v.subject).slice(0, 250), Status: 'sending', Lists: chosen.map(l => l.name).join(' · '), Mode: v.mode || 'single', Campaign: v.camp || '', StartedAt: iso(), By: me(), Attachments: ATT.map(a => a.fileName).join(', '), Total: recips.length, Sent: 0, Failed: 0, Pos: 0, BodyHtml: v.html, Log: '[]' })).id;
      else await S.upd('Sal_MailRuns', runId, { Status: 'sending' });
      render(); const r = await runSend(d, v, recips, runId, old ? old.pos : 0);
      toast((RUN.stop ? '⏹ Stopped · ' : '✅ Finished · ') + r.sent + ' sent' + (r.failed ? ' · ' + r.failed + ' failed (see Sent tab)' : ''), r.failed ? 'warn' : 'success');
    } catch (e) { toast(e.message, 'error'); }
    K.A().go('x_salmail');
  }
})();
