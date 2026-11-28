/* ============================================================
   ORBIT SHOP GATEWAY — the free replacement for the Power Automate Premium flow
   A Cloudflare Worker (free plan: 100,000 requests a day) that stands between the anonymous shop website and
   your SharePoint. It signs in to Microsoft 365 as an app (client credentials) and:
     GET  ?a=img&f=<name>        → a product photo from SharePoint  Documents/OrbitShop/img/
     POST {a:'catalog'}          → OrbitShop/catalog.json
     POST {a:'track', id}        → OrbitShop/track/<id>.json (404 if not there yet)
     POST {a:'order'|'cancel'|'paid', no, …} → a new row in the Shop_Inbox list (ORBIT takes it from there)
     POST {a:'proof', no, phone, type, data} → the file into OrbitShop/proofs/ + a Shop_Inbox row
     POST {a:'pay', no, amount, …}  → card payment page (Stripe / Network International / Telr) → {url, ref}
     POST {a:'paycheck', ref}       → {paid, amount, state}
     POST {k:'view'|'end', …}       → a row in the Web_Visits list (visitor statistics of the shop and the Orbit website)
   Same messages as the Power Automate flow, so ORBIT and the website work with either.
   Settings (Cloudflare → Worker → Settings → Variables and Secrets):
     TENANT_ID, CLIENT_ID, CLIENT_SECRET (secret), SITE_URL (https://<tenant>.sharepoint.com/sites/<site>)
     optional: ALLOWED_ORIGIN (your shop address, e.g. https://orbit.alnajjar.in), LIBRARY_PATH (default "OrbitShop")
     card (optional): CARD_PROVIDER = stripe | ngenius | telr
       stripe:  STRIPE_SECRET (secret)
       ngenius: NGENIUS_API_KEY (secret), NGENIUS_OUTLET, NGENIUS_HOST (api-gateway.sandbox.ngenius-payments.com for tests)
       telr:    TELR_STORE, TELR_KEY (secret), TELR_TEST = 1 for tests
   ============================================================ */
const VERSION = '1.0.0';
let TOKEN = null, SITE = null, LISTS = {};
const HITS = new Map();   /* simple per-address limit inside one Worker instance */

export default {
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
    const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cors, extra) });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const url = new URL(request.url), ip = request.headers.get('cf-connecting-ip') || 'x';
      if (!limit(ip, request.method === 'GET' ? 300 : 40)) return json({ error: 'Too many requests — try again in a minute' }, 429);
      const need = ['TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET', 'SITE_URL'].filter(k => !env[k]);
      if (request.method === 'GET') {
        const a = url.searchParams.get('a');
        if (!a) return json({ ok: !need.length, service: 'orbit-shop-gateway', version: VERSION, missing: need, card: env.CARD_PROVIDER || '' });
        if (a === 'img') { const f = url.searchParams.get('f') || ''; if (!/^[A-Za-z0-9._-]{1,120}$/.test(f)) return json({ error: 'bad name' }, 400);
          const r = await file(env, 'img/' + f); if (!r) return json({ error: 'not found' }, 404);
          return new Response(r.body, { headers: Object.assign({ 'Content-Type': /\.png$/i.test(f) ? 'image/png' : /\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.svg$/i.test(f) ? 'image/svg+xml' : 'image/webp', 'Cache-Control': 'public, max-age=604800' }, cors) }); }
        return json({ error: 'unknown' }, 400);
      }
      if (request.method !== 'POST') return json({ error: 'method' }, 405);
      if (need.length) return json({ error: 'Gateway not configured: ' + need.join(', ') }, 503);
      const raw = await request.text(); if (raw.length > 6e6) return json({ error: 'too large' }, 413);
      let b; try { b = JSON.parse(raw); } catch (e) { return json({ error: 'bad json' }, 400); }
      const a = String(b.a || (b.k ? 'hit' : '')), no = String(b.no || '');
      const noOk = /^[A-Z0-9]{1,6}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(no);
      switch (a) {
        case 'catalog': { const r = await file(env, 'catalog.json'); if (!r) return json({ error: 'The shop is not published yet' }, 404); return new Response(r.body, { headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' }, cors) }); }
        case 'track': { const id = String(b.id || ''); if (!/^[0-9a-f]{32}$/.test(id)) return json({ error: 'bad id' }, 400); const r = await file(env, 'track/' + id + '.json'); if (!r) return json({ error: 'not found' }, 404); return new Response(r.body, { headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cors) }); }
        case 'order': case 'cancel': case 'paid': {
          if (!noOk) return json({ error: 'bad order number' }, 400);
          if (a === 'order' && (!b.customer || !Array.isArray(b.cart) || !b.cart.length || b.cart.length > 200)) return json({ error: 'bad order' }, 400);
          const payload = JSON.stringify(b); if (payload.length > 60000) return json({ error: 'order too large' }, 413);
          await inbox(env, { Title: no, Kind: a, Ref: no, Payload: payload }); return json({ ok: true });
        }
        case 'proof': {
          if (!noOk) return json({ error: 'bad order number' }, 400); const type = String(b.type || ''), data = String(b.data || '');
          if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(type) || !data || data.length > 5.6e6) return json({ error: 'The proof must be a picture or PDF up to 4 MB' }, 400);
          const name = no + '-' + new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '.' + (type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg');
          await put(env, 'proofs/' + name, b64bytes(data), type);
          await inbox(env, { Title: no, Kind: 'proof', Ref: no, Payload: JSON.stringify({ a: 'proof', no, phone: String(b.phone || ''), file: name, type }) }); return json({ ok: true });
        }
        case 'pay': { if (!noOk) return json({ error: 'bad order number' }, 400); const amt = Number(b.amount); if (!(amt > 0 && amt < 1e6)) return json({ error: 'bad amount' }, 400); return json(await cardPay(env, b, amt)); }
        case 'hit': {
          if (!['view', 'end'].includes(b.k)) return json({ error: 'bad hit' }, 400);
          const t = (v, n) => String(v == null ? '' : v).slice(0, n || 120), arr = (v, n) => JSON.stringify((Array.isArray(v) ? v : []).slice(0, n || 40).map(x => t(x, 60)));
          const ctry = request.headers.get('cf-ipcountry') || (request.cf && request.cf.country) || '', f = { Title: t(b.k + ' ' + (b.page || '/'), 200), Site: t(b.site || 'website', 20), Kind: b.k, VisitId: t(b.vid, 40), VisitorId: t(b.uid, 40), Page: t(b.page, 200), At: new Date().toISOString(), Lang: t(b.lang, 5) };
          if (b.k === 'view') Object.assign(f, { Referrer: t(b.ref, 300), Source: t(b.src, 60), Medium: t(b.med, 60), Campaign: t(b.cmp, 80), Device: t(b.dev, 20), Browser: t(b.br, 20), OS: t(b.os, 20), Country: t(COUNTRY[ctry] || b.ctry || ctry, 40), Tz: t(b.tz, 50), Screen: t(b.scr, 20), NewVisitor: b.nw ? '1' : '' });
          else Object.assign(f, { Duration: Math.min(86400, Math.max(0, Number(b.dur) || 0)), Scroll: Math.min(100, Math.max(0, Number(b.sc) || 0)), Sections: arr(b.secs, 60), Clicks: arr(b.clk, 60) });
          await addRow(env, 'Web_Visits', f); return new Response(null, { status: 204, headers: cors });
        }
        case 'paycheck': { if (!b.ref) return json({ paid: false, state: 'no reference' }); return json(await cardCheck(env, String(b.ref))); }
        default: return json({ error: 'unknown message' }, 400);
      }
    } catch (e) { return json({ error: String(e && e.message || e).slice(0, 300) }, 500); }
  }
};

/* ---------- Microsoft Graph (app sign-in) ---------- */
async function token(env) {
  if (TOKEN && TOKEN.exp > Date.now() + 60000) return TOKEN.t;
  const r = await fetch(`https://login.microsoftonline.com/${env.TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }) });
  const j = await r.json(); if (!r.ok) throw new Error('Microsoft sign-in failed: ' + (j.error_description || j.error || r.status).toString().split('\n')[0]);
  TOKEN = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; return TOKEN.t;
}
async function g(env, path, opt) {
  const r = await fetch('https://graph.microsoft.com/v1.0' + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + await token(env) }, (opt || {}).headers) }));
  return r;
}
async function site(env) {
  if (SITE) return SITE; const u = new URL(env.SITE_URL), p = u.pathname.replace(/\/+$/, '');
  const r = await g(env, '/sites/' + u.hostname + (p ? ':' + p : '')); const j = await r.json(); if (!r.ok) throw new Error('SharePoint site not found (' + r.status + ') — check SITE_URL and the app permission');
  SITE = j.id; return SITE;
}
const folder = env => String(env.LIBRARY_PATH || 'OrbitShop').replace(/^\/+|\/+$/g, '');
const enc = p => p.split('/').map(encodeURIComponent).join('/');
async function file(env, path) { const r = await g(env, `/sites/${await site(env)}/drive/root:/${enc(folder(env) + '/' + path)}:/content`); if (r.status === 404) return null; if (!r.ok) throw new Error('SharePoint file ' + r.status); return r; }
async function put(env, path, bytes, type) { const r = await g(env, `/sites/${await site(env)}/drive/root:/${enc(folder(env) + '/' + path)}:/content`, { method: 'PUT', headers: { 'Content-Type': type }, body: bytes }); if (!r.ok) throw new Error('Saving the file failed (' + r.status + ')'); }
const inbox = (env, fields) => addRow(env, 'Shop_Inbox', fields);
async function addRow(env, list, fields) {
  const s = await site(env);
  if (!LISTS[list]) { const r = await g(env, `/sites/${s}/lists?$filter=displayName eq '${list}'&$select=id`); const j = await r.json(); if (!r.ok || !j.value || !j.value[0]) throw new Error('The ' + list + ' list was not found — set it up in ORBIT'); LISTS[list] = j.value[0].id; }
  const r = await g(env, `/sites/${s}/lists/${LISTS[list]}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) { let m = ''; try { m = (await r.json()).error.message; } catch (e) {} throw new Error('Saving to ' + list + ' failed (' + r.status + ') ' + m); }
}
const COUNTRY = { AE: 'United Arab Emirates', SA: 'Saudi Arabia', QA: 'Qatar', KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman', EG: 'Egypt', JO: 'Jordan', LB: 'Lebanon', IQ: 'Iraq', SY: 'Syria', MA: 'Morocco', TN: 'Tunisia', DZ: 'Algeria', IN: 'India', PK: 'Pakistan', BD: 'Bangladesh', PH: 'Philippines', LK: 'Sri Lanka', NP: 'Nepal', GB: 'United Kingdom', US: 'United States', FR: 'France', DE: 'Germany', TR: 'Türkiye', IR: 'Iran', SG: 'Singapore', CN: 'China', AU: 'Australia', CA: 'Canada' };
function b64bytes(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function limit(ip, per) { const now = Date.now(), h = (HITS.get(ip) || []).filter(t => now - t < 60000); h.push(now); HITS.set(ip, h); if (HITS.size > 5000) HITS.clear(); return h.length <= per; }

/* ---------- card payments (keys only here, never on the website) ---------- */
async function cardPay(env, b, amt) {
  const p = env.CARD_PROVIDER, fils = Math.round(amt * 100), cur = String(b.currency || 'AED').toUpperCase();
  const ok = String(b.ok || ''), cancel = String(b.cancel || ''); if (!/^https?:\/\//.test(ok) || !/^https?:\/\//.test(cancel)) throw new Error('bad return address');
  if (p === 'stripe') {
    const f = new URLSearchParams({ mode: 'payment', success_url: ok, cancel_url: cancel, client_reference_id: b.no, 'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': cur.toLowerCase(), 'line_items[0][price_data][unit_amount]': String(fils), 'line_items[0][price_data][product_data][name]': 'Order ' + b.no });
    if (b.email) f.set('customer_email', b.email);
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET, 'Content-Type': 'application/x-www-form-urlencoded' }, body: f }), j = await r.json();
    if (!r.ok) throw new Error('Stripe: ' + ((j.error || {}).message || r.status)); return { url: j.url, ref: j.id };
  }
  if (p === 'ngenius') {
    const host = env.NGENIUS_HOST || 'api-gateway.ngenius-payments.com', t = await ngToken(env, host);
    const r = await fetch(`https://${host}/transactions/outlets/${env.NGENIUS_OUTLET}/orders`, { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/vnd.ni-payment.v2+json', Accept: 'application/vnd.ni-payment.v2+json' },
      body: JSON.stringify({ action: 'PURCHASE', amount: { currencyCode: cur, value: fils }, merchantOrderReference: b.no, emailAddress: b.email || undefined, merchantAttributes: { redirectUrl: ok, cancelUrl: cancel } }) }), j = await r.json();
    if (!r.ok) throw new Error('N-Genius: ' + (j.message || r.status)); return { url: j._links && j._links.payment && j._links.payment.href, ref: j.reference };
  }
  if (p === 'telr') {
    const r = await fetch('https://secure.telr.com/gateway/order.json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'create', store: Number(env.TELR_STORE), authkey: env.TELR_KEY, framed: 0,
      order: { cartid: b.no + '-' + Date.now().toString(36), test: env.TELR_TEST === '1' ? '1' : '0', amount: amt.toFixed(2), currency: cur, description: 'Order ' + b.no }, return: { authorised: ok, declined: cancel, cancelled: cancel }, customer: b.email ? { email: b.email } : undefined }) }), j = await r.json();
    if (!r.ok || !j.order) throw new Error('Telr: ' + ((j.error || {}).message || r.status)); return { url: j.order.url, ref: j.order.ref };
  }
  throw new Error('Card payment is not set up (CARD_PROVIDER)');
}
async function cardCheck(env, ref) {
  const p = env.CARD_PROVIDER;
  if (p === 'stripe') { const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(ref), { headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET } }), j = await r.json(); if (!r.ok) return { paid: false, state: 'unknown' }; return { paid: j.payment_status === 'paid', amount: (j.amount_total || 0) / 100, state: j.payment_status }; }
  if (p === 'ngenius') { const host = env.NGENIUS_HOST || 'api-gateway.ngenius-payments.com', t = await ngToken(env, host), r = await fetch(`https://${host}/transactions/outlets/${env.NGENIUS_OUTLET}/orders/${encodeURIComponent(ref)}`, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.ni-payment.v2+json' } }), j = await r.json();
    const pay = ((j._embedded || {}).payment || [])[0] || {}, st = pay.state || ''; return { paid: ['PURCHASED', 'CAPTURED'].includes(st), amount: ((j.amount || {}).value || 0) / 100, state: st }; }
  if (p === 'telr') { const r = await fetch('https://secure.telr.com/gateway/order.json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'check', store: Number(env.TELR_STORE), authkey: env.TELR_KEY, order: { ref } }) }), j = await r.json();
    const o = j.order || {}, code = String(((o.status || {}).code) || ''); return { paid: code === '3', amount: Number(o.amount || 0), state: (o.status || {}).text || code }; }
  return { paid: false, state: 'card not set up' };
}
async function ngToken(env, host) {
  const r = await fetch(`https://${host}/identity/auth/access-token`, { method: 'POST', headers: { Authorization: 'Basic ' + env.NGENIUS_API_KEY, 'Content-Type': 'application/vnd.ni-identity.v1+json', Accept: 'application/vnd.ni-identity.v1+json' } }), j = await r.json();
  if (!r.ok) throw new Error('N-Genius sign-in failed'); return j.access_token;
}
