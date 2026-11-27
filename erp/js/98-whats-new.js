/* ============================================================
   WHAT'S NEW — announces the new options / updates to every user, only for the areas that user can see
   at sign-in: a friendly message → "take me on the tour" (step by step, opens each updated area) → summary;
   or "remind me next login" / "don't show this again" (remembered per user and per update version).
   To announce a new update, add one entry to WN below (b = build number, v = view id of the area, t = title, d = text, pts = what to try, sel = element to point at).
   ============================================================ */
(function () {
  const Q = s => document.querySelector(s), esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const WN = [
    { b: 475, v: 'demandplan', area: 'Planning Dept. › Demand Plan vs Execution', ic: '📥', t: 'Demand Plan vs Execution — new page',
      d: 'Import the daily demand plans (Milco / GSD, Water, UHT Excel files and the PET requirements e-mail) and compare them with the trips that were really executed and with the picking done. See the trip compliance, pallet accuracy and picking accuracy per plan, per trip and per SKU.',
      pts: ['Drop the plan files (or an .eml e-mail) — nothing is imported twice', 'One page per plan type plus a comprehensive page, one row per trip with its source', 'Raw numbers table: planned / done / missing for trips, pallets, SKU lines and items', 'Double-click a row for the breakdown with the SKUs of each trip'], sel: '#dmpHost' },
    { b: 489, v: 'wh3d', area: 'Warehouse › 3D Warehouse View', ic: '🧊', t: 'Floor plan in 3D — set once by the administrator',
      d: 'The warehouse drawing can now lie under the racks in 3D. The administrator sets its size and position once and every user sees it the same way.',
      pts: ['Open a store and the floor plan appears under its racks', 'Same view for everyone at the location — nothing to set up'], sel: '#w3Cv' },
    { b: 492, v: 'wh3d', area: 'Warehouse › 3D Warehouse View', ic: '🧊', t: 'View a whole Region › WHs_ID in one 3D scene',
      d: 'A new "Region › WHs_ID" list shows all the stores (rack blocks) of one warehouse group together — e.g. the whole MAQ Lacnor — with its own map and totals. The single-store view is unchanged.',
      pts: ['Pick a Region › WHs_ID to see every store of the group side by side', 'Totals and KPIs add up the whole group', 'Choose "no grouping" to go back to one store'], sel: '#w3Grp' },
    { b: 491, v: 'whov', area: 'Warehouse › Warehouses Overview (3D)', ic: '🏢', t: 'One combined card per Region › WHs_ID',
      d: 'Choose a Region › WHs_ID to get one extra, full-width card that shows all of its stores together in 3D, above the single-store cards.',
      pts: ['Pick the group in the new "Region › WHs_ID" list', 'Drag to turn and zoom the combined view'], sel: '#woGrp' },
    { b: 508, v: 'demandplan', area: 'Demand Plan vs Execution', ic: '💾', t: 'Saving many plans to SharePoint no longer stops',
      d: 'When SharePoint throttles the save (429) the page now waits and continues with only the rows that failed, saves plan by plan and keeps the ones already saved. With the optional column Lines_JSON in Demand_Plan_tbl, one row per day and destination is saved instead of one row per SKU — about 50 times fewer rows.',
      pts: ['Add the column Lines_JSON (Multiple lines of text, plain text) to Demand_Plan_tbl', 'Press Save all to SharePoint — it shows which plan it is on', 'If it stops, press Save all again: it continues'], sel: '#dmpHost' },
    { b: 507, v: 'demandplan', area: 'Demand Plan vs Execution', ic: '🥛', t: 'Milco weekly production order e-mails now import',
      d: 'The Milco weekly demand e-mails ("MILCO-GSD & LAC WKLY PROD ORDER" Excel attached, dates in the header row, one block per emirate) are now read. Subtotal rows are skipped. Pallets come from the sheet, from earlier plans, or from the new "Pieces per pallet (if unknown)" box.',
      pts: ['Drop the .eml e-mails in Import & plans', 'If a message says some lines have no pallet size, type the pieces per pallet', 'Check the dates and save'], sel: '#dmpHost' },
    { b: 504, v: 'demandplan', area: 'Demand Plan vs Execution', ic: '📤', t: 'Update the plan from an Excel sheet',
      d: 'The Excel attached to the e-mail (and the new "Plan sheet" button) now contains the whole plan in an editable sheet, with empty rows for the days that have no plan. Edit it, fill the blank days and drop it back in Import & plans — the plan is updated.',
      pts: ['Press "📤 Plan sheet" or e-mail the report', 'Edit the "Plan update" sheet and fill the blank days', 'Drop the file in "Import & plans" and save'], sel: '[data-dm="plx"]' },
    { b: 502, v: 'demandplan', area: 'Demand Plan vs Execution', ic: '🚚', t: 'Upload the executed trips — with your own column mapping',
      d: 'Upload the Excel / CSV of the trips that were really executed, choose which column is the date, destination, trailer, pallets… and the compliance report compares them with the plan (Trip compliance, Pallet accuracy, by day and destination). Your mapping is remembered.',
      pts: ['Open "Import & plans"', 'Press "Choose executed-trips file", map the columns (including JDE Ref) and save', 'Pick the source the report should use: uploaded file, system trips or both — the JDE Ref shows in the trip table and the breakdown'], sel: '[data-dm="exPick"]' },
    { b: 500, v: 'otr', adm: 1, area: 'OT Approved vs Recovered', ic: '⚖', t: 'OT Balance Statement with Off / WE / Absent days (administrators)',
      d: 'A second balance page counts every Off, WE or Absent day without punches (from the Attendance sheet) as 8 h recovered, set against the oldest open OT.',
      pts: ['Open "OT Balance Statement · Off/WE/Absent"', 'Double-click a figure in the "of which Off/WE/Absent h" column to see the days counted'], sel: '[data-t="balx"]' },
    { b: 500, v: 'otr', area: 'OT Approved vs Recovered', ic: '✉', t: 'E-mail the OT Balance Statement of all locations in one click',
      d: 'A new button on the OT Balance Statement page e-mails every location its statement — one e-mail per location, styled like the page, with its own Excel file.',
      pts: ['Open the "OT Balance Statement" tab', 'Press "Email all locations"'], sel: '[data-t="bal"]' },
    { b: 495, v: 'otr', area: 'OT Approved vs Recovered', ic: '⚖', t: 'OT Balance Statement for your location',
      d: 'A new tab shows, per location, the OT earned, the hours recovered as days off, what is claimed but not verified and the outstanding hours not yet recovered — with ageing. Administrators see every warehouse, other users see their own location only.',
      pts: ['Open the "OT Balance Statement" tab', 'Double-click a row for the monthly statement, ageing, in-charges and staff', 'Double-click a figure to see the staff lines behind it'], sel: '[data-t="bal"]' },
    { b: 494, v: 'otapp', area: 'OT Approvals', ic: '✅', t: 'OT Balance Statement before you decide',
      d: 'Every request now shows the OT balance of its location — outstanding hours not yet recovered, ageing, the staff on the request who still have a balance, and what the balance becomes if you approve. Each block can be hidden or shown.',
      pts: ['Open a request and read the balance before approving', 'Use Hide / Show on any block'], sel: '[data-k="bal"]' }
  ];
  const BUILD = () => { try { return +APP_BUILD || 0; } catch (e) { return 0; } };
  const serial = b => { try { return APP_START + '.' + String(Math.max(1, b - 472)).padStart(2, '0'); } catch (e) { return String(b); } };
  const uKey = () => { const u = typeof currentUser !== 'undefined' && currentUser; return u ? 'orbit_wn_' + String(u.username || u.id || 'user').toLowerCase() : ''; };
  const seenGet = () => { try { return +(JSON.parse(localStorage.getItem(uKey()) || '{}').seen || 0); } catch (e) { return 0; } };
  const seenSet = b => { try { localStorage.setItem(uKey(), JSON.stringify({ seen: b, at: new Date().toISOString() })); } catch (e) {} };
  /* an area is "visible" when its menu item exists and is not locked / hidden for this user */
  const vis = v => { const el = Q('.nav-item[data-view="' + v + '"]'); if (!el || el.classList.contains('locked') || el.style.display === 'none' || el.hidden || el.closest('[hidden]')) return false; try { if (typeof acLevel === 'function' && acLevel(v) === 'none') return false; } catch (e) {} return getComputedStyle(el).display !== 'none'; };
  const mine = (all) => WN.filter(x => x.b <= BUILD() && (!x.adm || (typeof isAdmin === 'function' && isAdmin())) && vis(x.v) && (all || x.b > seenGet())).sort((a, b) => a.b - b.b);
  let T = null;   // tour state
  const css = document.createElement('style'); css.textContent = `
#wnOv{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}
#wnBox{background:var(--card,#fff);color:var(--text,#0f172a);border-radius:16px;width:min(620px,100%);max-height:92vh;overflow:auto;box-shadow:0 24px 70px rgba(0,0,0,.45)}
#wnBox .wn-h{padding:18px 22px;background:linear-gradient(120deg,#0f2a5e,#1e40af 60%,#2563eb);color:#fff;border-radius:16px 16px 0 0}#wnBox .wn-h b{font-size:19px;display:block}#wnBox .wn-h span{font-size:12px;opacity:.9}
#wnBox .wn-b{padding:16px 22px;font-size:14px;line-height:1.5}#wnBox .wn-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}#wnBox .wn-chip{background:#eef4ff;color:#1e3a8a;border-radius:999px;padding:3px 11px;font-size:12px;font-weight:600}
#wnBox .wn-f{padding:12px 22px 18px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}#wnBox .wn-f .sp{flex:1}
#wnBox button{border-radius:9px;padding:9px 16px;font:inherit;font-weight:600;cursor:pointer;border:1px solid #c5cfe0;background:#fff;color:#1f3b73;width:auto;margin:0}#wnBox button.wn-go{background:#1e40af;color:#fff;border-color:#1e40af}#wnBox button.wn-lk{border:0;background:none;color:#64748b;font-weight:500;text-decoration:underline;padding:6px}
#wnBox ul{margin:6px 0 0 18px;padding:0}#wnBox li{margin:3px 0}
#wnBox .wn-it{border:1px solid #e2e8f0;border-radius:12px;padding:10px 14px;margin:8px 0;display:flex;gap:12px;align-items:flex-start}#wnBox .wn-it .ic{font-size:22px}#wnBox .wn-it small{display:block;color:#64748b}
#wnTour{position:fixed;right:18px;bottom:18px;z-index:2147483001;width:min(400px,calc(100vw - 28px));background:var(--card,#fff);color:var(--text,#0f172a);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.45);border:1px solid #cbd5e1;overflow:hidden;font-size:13.5px}
#wnTour .wn-th{background:linear-gradient(120deg,#0f2a5e,#2563eb);color:#fff;padding:10px 14px;display:flex;justify-content:space-between;gap:8px;align-items:center}#wnTour .wn-tb{padding:12px 14px;line-height:1.5;max-height:46vh;overflow:auto}#wnTour .wn-tf{padding:10px 14px;display:flex;gap:8px;border-top:1px solid #e2e8f0;align-items:center}#wnTour .wn-tf .sp{flex:1}
#wnTour button{border-radius:8px;padding:7px 13px;font:inherit;font-weight:600;cursor:pointer;border:1px solid #c5cfe0;background:#fff;color:#1f3b73;width:auto;margin:0}#wnTour button.wn-go{background:#1e40af;color:#fff;border-color:#1e40af}#wnTour ul{margin:6px 0 0 18px;padding:0}
#wnRing{position:fixed;z-index:2147483000;pointer-events:none;border:3px solid #f59e0b;border-radius:10px;box-shadow:0 0 0 6px rgba(245,158,11,.25),0 0 0 9999px rgba(15,23,42,.18);transition:all .25s}
#wnBtn{margin:6px 12px 2px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);color:inherit;border-radius:9px;padding:5px 10px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;width:calc(100% - 24px)}`;
  document.head.appendChild(css);
  const close = () => { const o = Q('#wnOv'); if (o) o.remove(); };
  const endTour = () => { T = null; const t = Q('#wnTour'); if (t) t.remove(); const r = Q('#wnRing'); if (r) r.remove(); };
  const who = () => { const u = typeof currentUser !== 'undefined' && currentUser; return (u && (u.displayName || u.username)) || ''; };
  const areas = L => [...new Set(L.map(x => x.area))];

  /* 1) the announcement */
  function announce(list, manual) {
    close(); endTour(); const L = list || mine(false); if (!L.length) { if (manual) { const o = document.createElement('div'); o.id = 'wnOv'; o.dataset.nohc = '1'; o.innerHTML = '<div id="wnBox"><div class="wn-h"><b>✨ What\'s new in ORBIT</b><span>Update ' + esc(serial(BUILD())) + '</span></div><div class="wn-b">There is nothing new for the areas you can see — you are up to date.</div><div class="wn-f"><span class="sp"></span><button class="wn-go" data-wn="close">Close</button></div></div>'; document.body.appendChild(o); o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-wn="close"]')) close(); }); } return; }
    const top = Math.max(...L.map(x => x.b)), o = document.createElement('div'); o.id = 'wnOv'; o.dataset.nohc = '1';
    o.innerHTML = `<div id="wnBox" role="dialog" aria-modal="true"><div class="wn-h"><b>✨ New updates in ORBIT</b><span>Update ${esc(serial(top))} · ${L.length} new item${L.length > 1 ? 's' : ''} in the areas you can see</span></div>
      <div class="wn-b"><p style="margin:0 0 8px">Hello${who() ? ' <b>' + esc(who()) + '</b>' : ''},</p>
      <p style="margin:0 0 8px">New options and updates have been added to the system in the areas you work with. It will be a <b>great advantage</b> for you to know about them — they <b>empower your visibility on the operations data</b>.</p>
      <div class="wn-chips">${areas(L).map(a => `<span class="wn-chip">${esc(a)}</span>`).join('')}</div>
      <p style="margin:0">Would you like a short tour of what is new?</p></div>
      <div class="wn-f"><button class="wn-go" data-wn="tour">▶ Yes, take me on the tour</button><button data-wn="later">⏰ Remind me next login</button><span class="sp"></span><button class="wn-lk" data-wn="never">Don't show this again</button></div></div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => { const b = e.target.closest('[data-wn]'); if (!b) return; const a = b.dataset.wn;
      if (a === 'tour') { close(); startTour(L); } else if (a === 'later') { close(); } else if (a === 'never') { seenSet(top); close(); } }); }

  /* 2) the tour: opens each updated area, points at the new option, then a summary */
  function startTour(L) { T = { L, i: 0, top: Math.max(...L.map(x => x.b)) }; step(); }
  function ring(sel) { let r = Q('#wnRing'); const el = sel && Q(sel); if (!el || !el.getClientRects().length) { if (r) r.remove(); return false; } if (!r) { r = document.createElement('div'); r.id = 'wnRing'; document.body.appendChild(r); } try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} const g = () => { const b = el.getBoundingClientRect(); r.style.left = (b.left - 4) + 'px'; r.style.top = (b.top - 4) + 'px'; r.style.width = (b.width + 8) + 'px'; r.style.height = (b.height + 8) + 'px'; }; g(); setTimeout(g, 450); return true; }
  function step() {
    if (!T) return; const L = T.L; if (T.i >= L.length) return summary(); const x = L[T.i], nav = Q('.nav-item[data-view="' + x.v + '"]');
    if (nav) { try { nav.click(); } catch (e) {} try { nav.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
    let t = Q('#wnTour'); if (!t) { t = document.createElement('div'); t.id = 'wnTour'; t.dataset.nohc = '1'; document.body.appendChild(t); t.addEventListener('click', e => { const b = e.target.closest('[data-wt]'); if (!b || !T) return; const a = b.dataset.wt; if (a === 'next') { T.i++; step(); } else if (a === 'back') { T.i = Math.max(0, T.i - 1); step(); } else if (a === 'skip') { endTour(); } else if (a === 'done') { seenSet(T.top); endTour(); } else if (a === 'open') { const n = Q('.nav-item[data-view="' + b.dataset.v + '"]'); if (n) n.click(); } else if (a === 'redo') { T.i = 0; step(); } }); }
    t.innerHTML = `<div class="wn-th"><b>${x.ic} ${esc(x.t)}</b><span style="font-size:12px;opacity:.9">${T.i + 1} / ${L.length}</span></div><div class="wn-tb"><div style="font-size:11.5px;color:#64748b;margin-bottom:4px">${esc(x.area)}</div>${esc(x.d)}<ul>${(x.pts || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
      <div class="wn-tf"><button data-wt="skip">Skip tour</button><span class="sp"></span>${T.i ? '<button data-wt="back">‹ Back</button>' : ''}<button class="wn-go" data-wt="next">${T.i + 1 === L.length ? 'Finish ›' : 'Next ›'}</button></div>`;
    const r0 = Q('#wnRing'); if (r0) r0.remove(); let n = 0; const tr = setInterval(() => { if (!T || L[T.i] !== x) return clearInterval(tr); if (ring(x.sel) || ++n > 14) clearInterval(tr); }, 350); }
  function summary() {
    const r = Q('#wnRing'); if (r) r.remove(); const L = T.L, t = Q('#wnTour'); if (!t) return;
    t.innerHTML = `<div class="wn-th"><b>✅ Summary of the updates</b><span style="font-size:12px;opacity:.9">Update ${esc(serial(T.top))}</span></div><div class="wn-tb">${L.map(x => `<div style="margin:0 0 9px"><b>${x.ic} ${esc(x.t)}</b><div style="font-size:12px;color:#64748b">${esc(x.area)}</div><div style="font-size:12.5px">${esc((x.pts || [])[0] || '')}</div><a href="#" data-wt="open" data-v="${esc(x.v)}" style="font-size:12px">Open this area ›</a></div>`).join('')}<div style="font-size:12px;color:#64748b">You can open this list again at any time with <b>✨ What's new</b> at the bottom of the menu.</div></div>
      <div class="wn-tf"><button data-wt="redo">↺ Tour again</button><span class="sp"></span><button class="wn-go" data-wt="done">Done</button></div>`; }

  /* 3) when: after sign-in (only the areas this user can see, only what he has not seen for this update version) */
  function check() { try { if (typeof currentUser === 'undefined' || !currentUser) return; addBtn(); const L = mine(false); if (L.length) announce(L); } catch (e) {} }
  function addBtn() { const f = Q('.sidebar-footer'); if (!f || Q('#wnBtn')) return; const b = document.createElement('button'); b.id = 'wnBtn'; b.type = 'button'; b.textContent = '✨ What\'s new'; b.title = 'The latest updates in the areas you can see'; b.addEventListener('click', () => announce(mine(true).slice(-12), true)); f.insertBefore(b, f.firstChild); }
  const prev = typeof onLoginComplete === 'function' ? onLoginComplete : null; if (prev) onLoginComplete = function () { const r = prev.apply(this, arguments); setTimeout(check, 2800); return r; };
  window.whatsNew = { WN, mine, announce, startTour, check, seen: seenGet, vis };
})();
