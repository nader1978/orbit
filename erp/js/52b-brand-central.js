/* ---------- built-in logos (none: the ORBIT mark is used) + colour theme, and the administrator's "default for all users" (SharePoint App_Config_tbl, rows Branding / BrandingLogo / BrandingLogoDark) ---------- */
const NFPC_LOGO = "";
const NFPC_LOGO_DARK = "";
const NFPC_FAV = "";
/* built-in look = the NFPC logos (wide) + the NFPC favicon; the administrator's / user's own branding still overrides it */
try { Object.assign(BRAND_DEFAULT, { tag: 'ERP · Finance · Operations' }); } catch (e) {}
/* one-time clean-up (build 524): logo pictures saved earlier in this browser (e.g. the NFPC logo) are removed; the ORBIT logo shows unless a client logo is added again in Settings → Branding */
try { if (!localStorage.getItem(LS_BASE + '_brand_v524')) { const K = LS_BASE + '_brand'; let c = {}; try { c = JSON.parse(localStorage.getItem(K) || '{}') || {}; } catch (e) {} delete c.img; delete c.imgDark; c.wide = false; localStorage.setItem(K, JSON.stringify(c)); localStorage.removeItem(LS_BASE + '_brand_cen'); localStorage.setItem(LS_BASE + '_brand_v524', '1'); } } catch (e) {}   /* client logo and name: Settings → Branding */
(function () {
  const Q = s => document.querySelector(s), CEN = LS_BASE + '_brand_cen', IT = { j: 'ERP_Branding', a: 'ERP_BrandingLogo', b: 'ERP_BrandingLogoDark' };   /* own rows: the ERP edition never picks up another site's published logo */
  const say = (t, bad) => { const m = Q('#brPubMsg'); if (m) { m.textContent = t; m.style.color = bad ? '#c0392b' : '#1e8449'; } };
  const cenGet = () => { try { return JSON.parse(localStorage.getItem(CEN) || '{}') || {}; } catch (e) { return {}; } };
  function refresh() { try { brandApply(); } catch (e) {} try { accentRefresh(); } catch (e) {} try { brandFill(); } catch (e) {} }
  async function upsert(c, its, title, val) { const ex = its.find(x => String((x.fields || {}).Title || '').trim() === title); if (ex) await updateItem(c.siteId, c.listId, ex.id, spCoerceFields(c.listId, { Config_Value: val }), c.token); else await createItem(c.siteId, c.listId, { Title: title, Config_Value: val }, c.token); }
  async function publish() {
    if (!isAdmin()) return say('Only administrators can publish.', 1); const d = brandDraft && brandDraft(); if (!d) return;
    const accent = (() => { try { return localStorage.getItem(LS_BASE + '_accent') || 'blue'; } catch (e) { return 'blue'; } })(), force = !!Q('#brForce').checked;
    const cfg = { v: 1, name: d.name || '', tag: d.tag || '', logo: d.logo || '', wide: !!d.wide, co: d.co || {}, sb: d.sb || {}, rad: d.rad == null ? '' : d.rad, accent, force, login: (Q('#brLogin') && Q('#brLogin').value) || 'theme', hasImg: !!d.img, hasImgDark: !!d.imgDark, by: getCurrentUserValue(), at: new Date().toISOString() };
    try { say('Publishing…'); const c = await tpCtx(); if (!c) throw new Error('sign in / Site URL is not ready'); const its = await fetchAllItems(c.siteId, c.listId, c.token);
      await upsert(c, its, IT.a, d.img || ''); await upsert(c, its, IT.b, d.imgDark || ''); await upsert(c, its, IT.j, JSON.stringify(cfg));
      const store = Object.assign({}, cfg, { img: d.img || '', imgDark: d.imgDark || '' }); try { localStorage.setItem(CEN, JSON.stringify(store)); } catch (e) {}
      refresh(); say('✔ Published — every user gets it at their next sign-in (within 10 minutes if already signed in).'); try { addActivity('settings', 'Branding published for all users'); } catch (e) {} }
    catch (e) { say('Could not publish: ' + e.message, 1); } }
  async function unpublish() { if (!isAdmin()) return; if (!confirm('Remove the published default? Every user goes back to their own / the built-in look.')) return;
    try { const c = await tpCtx(); const its = await fetchAllItems(c.siteId, c.listId, c.token); for (const t of [IT.j, IT.a, IT.b]) { const ex = its.find(x => String((x.fields || {}).Title || '').trim() === t); if (ex) await updateItem(c.siteId, c.listId, ex.id, spCoerceFields(c.listId, { Config_Value: '' }), c.token); } try { localStorage.removeItem(CEN); } catch (e) {} refresh(); say('✔ Published default removed.'); } catch (e) { say('Could not remove: ' + e.message, 1); } }
  async function pull(silent) {
    try { const c = await tpCtx(); if (!c) return false; const its = await fetchAllItems(c.siteId, c.listId, c.token), val = t => { const it = its.find(x => String((x.fields || {}).Title || '').trim() === t); return it ? String((it.fields || {}).Config_Value || '') : ''; };
      const j = val(IT.j); if (!j) { if (localStorage.getItem(CEN)) { localStorage.removeItem(CEN); refresh(); } return false; } const cfg = JSON.parse(j); cfg.img = cfg.hasImg ? val(IT.a) : ''; cfg.imgDark = cfg.hasImgDark ? val(IT.b) : '';
      const old = localStorage.getItem(CEN) || '', nw = JSON.stringify(cfg); if (old !== nw) { localStorage.setItem(CEN, nw); refresh(); } return true; }
    catch (e) { return false; } }
  function preset() { const d = brandDraft && brandDraft(); if (!d) return; d.img = NFPC_LOGO; d.imgDark = NFPC_LOGO_DARK; d.wide = true; d.tag = d.tag || 'ERP · Finance · Operations'; if (Q('#brWide')) Q('#brWide').checked = true; try { localStorage.setItem(LS_BASE + '_accent', 'nfpc'); } catch (e) {} try { accentRefresh(); } catch (e) {} document.body.classList.add('brand-wide'); try { brandPrev(); } catch (e) {} say('Purple theme loaded — press Save (this browser) or Publish (all users).'); }
  window.brandPull = pull;
  function wire() { const b = Q('#brPublish'); if (!b || b.dataset.w) return; b.dataset.w = 1; const ls = Q('#brLogin'); if (ls) { ls.value = (window.loginBgGet && loginBgGet()) || 'theme'; ls.onchange = () => { try { localStorage.setItem(LS_BASE + '_loginbg', ls.value); } catch (e) {} const z = cenGet(); if (z.login) { z.login = ls.value; try { localStorage.setItem(CEN, JSON.stringify(z)); } catch (e) {} } try { accentRefresh(); } catch (e) {} }; } b.onclick = publish; Q('#brUnpub').onclick = unpublish; Q('#brNfpc').onclick = preset; Q('#brForce').checked = !!cenGet().force; }
  document.addEventListener('click', () => setTimeout(wire, 200)); setTimeout(wire, 1200);
  try { brandApply(); } catch (e) {}
  const prev = onLoginComplete; onLoginComplete = function () { const r = prev.apply(this, arguments); setTimeout(() => { pull(true); }, 700); return r; }; setInterval(() => { if (currentUser) pull(true); }, 10 * 60 * 1000);
  /* the built-in NFPC look is also the starting point for a brand-new installation: nothing forced, nothing published */
})();
