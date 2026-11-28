/* ============================================================
   ORBIT ONLINE SHOP CORE — rules only (no screens, no storage)
   The same file runs in ORBIT (window.SHOP), in the shop website (window.SHOP) and in Node (require),
   so the shop and ORBIT always work out prices, VAT, delivery and totals the same way.
   • Catalogue: what ORBIT publishes for the website (products, categories, prices incl. VAT, availability,
     delivery & payment options, hashed coupon codes) — no costs, no stock values, no customer data.
   • Quote: cart → order lines (prices excl. VAT for the books) + delivery / COD charges → net, VAT, total.
   • Order check: what a customer sent is checked again against the prices they were shown (catalogue version)
     and today's stock; the customer's own totals are never trusted.
   • Order life: awaiting payment / review → confirmed → picking → packed → released to distribution
     → out for delivery → delivered (or failed → released again, returned, cancelled).
   ============================================================ */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.SHOP = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const r2 = n => { const v = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100; return n < 0 ? -v : v; };
  const r3 = n => Math.round(n * 1000) / 1000, r4 = n => Math.round(n * 10000) / 10000;
  const num = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
  const J = (s, d) => { try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : d; } catch (e) { return d; } };
  const lc = v => String(v || '').trim().toLowerCase();
  const VAT = { S: 5, Z: 0, E: 0, O: 0 };
  const T = n => ({ name: n, text: {} }), M = n => ({ name: n, text: { allowMultipleLines: true, textType: 'plain' } }), N = n => ({ name: n, number: {} });

  /* ---------- SharePoint lists ---------- */
  const LISTS = {
    Shop_Settings: ['ShopName', 'ShopNameAr', 'ShopKey', 'ApiUrl', 'SiteUrl', 'Currency', 'OrderPrefix', 'Wh', 'Salesperson', 'PayMethods', 'CardProvider', 'AccCard', 'AccBank', 'AccCash', 'Phone', 'Whatsapp', 'Email', 'Color', 'Logo', 'AutoConfirm', 'HoldUnpaid', 'StockShow', 'EmailCustomer', 'LiveLocation', 'LastPublish', 'Slots', 'Connection'].map(T)
      .concat(['DeliveryFee', 'FreeOver', 'MinOrder', 'CodFee', 'CodMax', 'LowStock', 'UnpaidDays', 'LeadDays'].map(N)).concat(['BankDetails', 'EmirateFees', 'Policies', 'PriceHistory', 'Hero', 'Setup'].map(M)),
    Shop_Categories: ['Code', 'NameAr', 'Parent', 'Icon', 'Active'].map(T).concat([N('Sort')]),
    Shop_Products: ['ItemCode', 'Published', 'Slug', 'NameAr', 'Category', 'Brand', 'Tags', 'Badge', 'Featured', 'Backorder'].map(T).concat(['Price', 'WasPrice', 'MinQty', 'MaxQty', 'Sort', 'Weight'].map(N)).concat(['DescEn', 'DescAr', 'Images', 'Specs'].map(M)),
    Shop_Coupons: ['Code', 'Kind', 'ValidFrom', 'ValidTo', 'Active'].map(T).concat(['Value', 'MinOrder', 'MaxUses', 'Used'].map(N)),
    /* filled by the Power Automate flow: one row per message from the website (order, transfer proof, cancel request, card payment done) */
    Shop_Inbox: ['Kind', 'Ref', 'Processed', 'Error', 'ProcessedAt'].map(T).concat([M('Payload')]),
    Shop_Orders: ['OrderNo', 'TrackId', 'Status', 'PlacedAt', 'Lang', 'CustomerId', 'CustomerName', 'Phone', 'Email', 'Emirate', 'Area', 'PayMethod', 'PayStatus', 'PayRef', 'Coupon', 'SoId', 'SoNo', 'DnNo', 'InvId', 'RcpNo', 'Driver', 'Vehicle', 'DeliveryDate', 'Slot', 'CatVer', 'Proof', 'Refund'].map(T)
      .concat(['Net', 'Vat', 'Total', 'Paid', 'CodCollected', 'Parcels', 'Attempts'].map(N)).concat(['Address', 'LinesJson', 'Timeline', 'Notes', 'Checks', 'LastLoc'].map(M)),
  };

  /* ---------- order life ---------- */
  const STATUS = {
    awaiting_payment: { en: 'Awaiting payment', ar: 'بانتظار الدفع', c: '#b45309', step: 0 },
    review: { en: 'Being reviewed', ar: 'قيد المراجعة', c: '#c2410c', step: 0 },
    confirmed: { en: 'Confirmed', ar: 'تم التأكيد', c: '#1d4ed8', step: 1 },
    picking: { en: 'Being prepared', ar: 'قيد التجهيز', c: '#7c3aed', step: 2 },
    packed: { en: 'Packed', ar: 'تم التغليف', c: '#7c3aed', step: 2 },
    released: { en: 'Ready for delivery', ar: 'جاهز للتوصيل', c: '#0891b2', step: 3 },
    out_for_delivery: { en: 'Out for delivery', ar: 'في الطريق إليك', c: '#0f766e', step: 4 },
    delivered: { en: 'Delivered', ar: 'تم التسليم', c: '#15803d', step: 5 },
    failed: { en: 'Delivery attempt failed', ar: 'تعذّر التسليم', c: '#dc2626', step: 3 },
    returned: { en: 'Returned', ar: 'مُرتجع', c: '#475569', step: 5 },
    cancelled: { en: 'Cancelled', ar: 'ملغى', c: '#64748b', step: 5 },
  };
  const STEPS = [{ en: 'Order placed', ar: 'تم الطلب' }, { en: 'Confirmed', ar: 'تم التأكيد' }, { en: 'Prepared', ar: 'تم التجهيز' }, { en: 'Ready', ar: 'جاهز' }, { en: 'On the way', ar: 'في الطريق' }, { en: 'Delivered', ar: 'تم التسليم' }];
  const NEXT = {
    awaiting_payment: ['confirmed', 'cancelled'], review: ['confirmed', 'cancelled'], confirmed: ['picking', 'cancelled'], picking: ['packed', 'confirmed', 'cancelled'],
    packed: ['released', 'picking', 'cancelled'], released: ['out_for_delivery', 'cancelled'], out_for_delivery: ['delivered', 'failed'], failed: ['released', 'out_for_delivery', 'returned', 'cancelled'],
    delivered: ['returned'], returned: [], cancelled: [] };
  const canGo = (from, to) => (NEXT[from] || []).includes(to);
  const CANCELLABLE_BY_CUSTOMER = ['awaiting_payment', 'review', 'confirmed'];
  const PAY = { cod: { en: 'Cash on delivery', ar: 'الدفع عند الاستلام' }, bank: { en: 'Bank transfer', ar: 'تحويل بنكي' }, card: { en: 'Card (online)', ar: 'بطاقة (أونلاين)' } };
  const PAY_STATUS = { due: 'To collect on delivery', awaiting: 'Waiting for the transfer', proof: 'Proof received — to check', pending: 'Card payment not finished', paid: 'Paid', mismatch: 'Paid amount differs', refund: 'Refund due', refunded: 'Refunded', collected: 'Collected by driver' };
  const EMIRATES = { AUH: ['Abu Dhabi', 'أبوظبي'], DXB: ['Dubai', 'دبي'], SHJ: ['Sharjah', 'الشارقة'], AJM: ['Ajman', 'عجمان'], UAQ: ['Umm Al Quwain', 'أم القيوين'], RAK: ['Ras Al Khaimah', 'رأس الخيمة'], FUJ: ['Fujairah', 'الفجيرة'] };

  /* ---------- helpers ---------- */
  const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  /* UAE numbers: 05x / 5x / 9715x / +9715x → 9715xxxxxxxx; other countries keep their digits */
  function phone(p) {
    let d = String(p || '').replace(/[^\d+]/g, ''); if (d.startsWith('+')) d = d.slice(1); if (d.startsWith('00')) d = d.slice(2);
    if (/^0?5\d{8}$/.test(d)) d = '971' + d.replace(/^0/, ''); else if (/^0\d{8}$/.test(d)) d = '971' + d.slice(1);
    return d;
  }
  const phoneOk = p => /^\d{8,15}$/.test(phone(p)) && (!phone(p).startsWith('971') || /^971(5\d{8}|[2-9]\d{7})$/.test(phone(p)));
  const emailOk = e => !e || /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']{2,}$/.test(String(e).trim());
  /* SHA-256 → hex (browser: crypto.subtle · Node: crypto) */
  async function sha256(s) {
    const g = typeof globalThis !== 'undefined' ? globalThis : {};
    if (g.crypto && g.crypto.subtle && typeof TextEncoder !== 'undefined') { const b = await g.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
    if (typeof require === 'function') { try { return require('crypto').createHash('sha256').update(s, 'utf8').digest('hex'); } catch (e) {} }
    return sha256js(s);
  }
  /* plain JavaScript SHA-256 for pages opened without https (crypto.subtle is missing there) */
  function sha256js(s) {
    const K = [], H = [], fr = x => ((x - Math.floor(x)) * 2 ** 32) | 0, isP = n => { for (let f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; }; let n = 2, k = 0;
    while (k < 64) { if (isP(n)) { if (k < 8) H[k] = fr(Math.pow(n, 1 / 2)); K[k++] = fr(Math.pow(n, 1 / 3)); } n++; }
    const b = unescape(encodeURIComponent(s)), w = [], l = b.length * 8; for (let i = 0; i < b.length; i++) w[i >> 2] |= b.charCodeAt(i) << ((3 - i % 4) * 8);
    w[l >> 5] |= 0x80 << (24 - l % 32); w[((l + 64 >> 9) << 4) + 15] = l; const ro = (x, y) => (x >>> y) | (x << (32 - y));
    for (let j = 0; j < w.length; j += 16) { const W = []; for (let t = 0; t < 16; t++) W[t] = w[j + t] | 0; let [a, bb, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) { if (i >= 16) { const x = W[i - 15], y = W[i - 2]; W[i] = (W[i - 16] + (ro(x, 7) ^ ro(x, 18) ^ (x >>> 3)) + W[i - 7] + (ro(y, 17) ^ ro(y, 19) ^ (y >>> 10))) | 0; }
        const t1 = (h + (ro(e, 6) ^ ro(e, 11) ^ ro(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + (W[i] | 0)) | 0, t2 = ((ro(a, 2) ^ ro(a, 13) ^ ro(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0; }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0; }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  /* the tracking file name: only someone with the order number AND the phone number can open it */
  const trackId = (orderNo, ph) => sha256(String(orderNo).trim().toUpperCase() + '|' + phone(ph).slice(-9)).then(h => h.slice(0, 32));
  const couponHash = (code, salt) => sha256(String(salt || '') + '|' + String(code || '').trim().toUpperCase()).then(h => h.slice(0, 24));
  /* order number made by the website: PREFIX-XXXX-XXXX (no 0/O/1/I) */
  function newOrderNo(prefix, rnd) {
    const A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ', R = rnd || (n => { const a = new Uint8Array(n); (globalThis.crypto || require('crypto').webcrypto).getRandomValues(a); return a; });
    const b = R(8), s = [...b].map(x => A[x % A.length]).join(''); return (prefix || 'W') + '-' + s.slice(0, 4) + '-' + s.slice(4);
  }
  const exVat = (incl, cat) => r4(num(incl) / (1 + (VAT[cat || 'S'] || 0) / 100));

  /* ---------- availability (the website never sees exact stock unless the shop says so) ---------- */
  function availability(p, free, set) {
    if (!p.stock) return { st: 'in' };
    const low = num(set.lowStock) || 5, q = Math.max(0, Math.floor(num(free)));
    if (q <= 0) return p.backorder ? { st: 'pre' } : { st: 'out', q: 0 };
    const o = { st: q <= low ? 'low' : 'in' }; if (set.stockShow === 'qty' || (set.stockShow !== 'never' && o.st === 'low')) o.q = q; return o;
  }

  /* ---------- catalogue for the website ----------
     products: Shop_Products rows mapped (prodFromRow) · items: inventory items (code → {name, vat, kind, uom, active})
     free: Map code → quantity free to sell (on hand − held by open orders) · coupons: hashed with the shop key */
  async function buildCatalog(o) {
    const set = o.set, I = new Map((o.items || []).map(i => [i.code, i])), ver = o.ver || new Date().toISOString();
    const cats = (o.cats || []).filter(c => c.active).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map(c => ({ c: c.code, en: c.name, ar: c.nameAr || '', p: c.parent || '', i: c.icon || '' }));
    const items = [];
    (o.products || []).filter(p => p.published).forEach(p => { const it = I.get(p.code); if (!it || it.active === false) return;
      const stock = it.kind !== 'service', av = availability({ stock, backorder: p.backorder }, o.free ? o.free.get(p.code) : 0, set);
      const x = { c: p.code, s: p.slug || slug(p.name || it.name) || p.code, en: p.name || it.name, ar: p.nameAr || it.name_ar || '', cat: p.category, b: p.brand || '', p: r2(p.price), u: it.uom || '', v: it.vat || 'S', st: av.st, img: p.images.map(m => m.f || m.url).filter(Boolean) };
      if (av.q != null) x.q = av.q; if (num(p.wasPrice) > num(p.price)) x.w = r2(p.wasPrice); if (p.minQty > 1) x.min = p.minQty; if (p.maxQty > 0) x.max = p.maxQty;
      if (p.featured) x.f = 1; if (p.badge) x.bd = p.badge; if (p.tags.length) x.t = p.tags; if (p.descEn) x.de = p.descEn; if (p.descAr) x.da = p.descAr; if (p.specs.length) x.sp = p.specs; x.o = p.sort || 0;
      items.push(x); });
    items.sort((a, b) => (b.f || 0) - (a.f || 0) || a.o - b.o || a.en.localeCompare(b.en)); items.forEach(x => { delete x.o; });
    const live = set.connection === 'flow' && !!set.apiUrl, pays = (set.payMethods || []).filter(k => PAY[k] && (live || k !== 'card'));
    const coupons = []; for (const c of (o.coupons || []).filter(c => c.active)) coupons.push({ h: await couponHash(c.code, set.shopKey), k: c.kind, v: c.value, m: c.minOrder || 0, f: c.from || '', t: c.to || '' });
    return { v: 1, ver, at: ver, shop: { mode: live ? 'live' : 'whatsapp', name: set.shopName, ar: set.shopNameAr, key: set.shopKey, cur: set.currency || 'AED', vatIncl: true, prefix: set.orderPrefix || 'W', phone: set.phone, wa: set.whatsapp, email: set.email, color: set.color, logo: set.logo, hero: set.hero || {}, policies: set.policies || {},
        pay: pays, card: set.cardProvider || '', bank: pays.includes('bank') ? set.bankDetails : '', codFee: num(set.codFee), codMax: num(set.codMax),
        del: { fee: num(set.deliveryFee), free: num(set.freeOver), min: num(set.minOrder), em: set.emirateFees || {}, slots: set.slots || [], lead: num(set.leadDays) || 1 } },
      cats, items, coupons };
  }

  /* ---------- the money: cart → lines (excl. VAT for the books) + charges ----------
     cart: [{ c: code, q: qty }] · cat: the catalogue the customer saw · opt: { emirate, pay, coupon: {k, v, m} | null } */
  function quote(cart, cat, opt) {
    const I = new Map((cat.items || []).map(i => [i.c, i])), E = [], o = opt || {}, sh = cat.shop || {}, d = sh.del || {}, lines = [];
    (cart || []).forEach(x => { const it = I.get(x.c), q = r3(num(x.q)); if (!it) { E.push({ code: x.c, e: 'gone' }); return; } if (!(q > 0)) return;
      if (it.min && q < it.min) E.push({ code: x.c, e: 'min', n: it.min }); if (it.max && q > it.max) E.push({ code: x.c, e: 'max', n: it.max });
      if (it.st === 'out') E.push({ code: x.c, e: 'out' }); else if (it.q != null && it.st !== 'pre' && q > it.q) E.push({ code: x.c, e: 'qty', n: it.q });
      lines.push({ code: it.c, description: it.en, descAr: it.ar, qty: q, uom: it.u, incl: it.p, disc: 0, vat: it.v || 'S', stock: true }); });
    const goods = r2(lines.reduce((s, l) => s + r2(l.qty * l.incl), 0));
    /* coupon: percent / amount off the goods, or free delivery */
    let off = 0, freeShip = false, cErr = '';
    if (o.coupon) { const c = o.coupon; if (c.m && goods < c.m) cErr = 'min'; else if (c.k === 'pct') off = r2(goods * Math.min(100, num(c.v)) / 100); else if (c.k === 'amt') off = Math.min(goods, r2(num(c.v))); else if (c.k === 'ship') freeShip = true; }
    /* coupon money is spread over the item lines (the last line takes the rounding) */
    if (off > 0 && goods > 0) { let left = off; lines.forEach((l, i) => { const g = r2(l.qty * l.incl), x = i === lines.length - 1 ? left : r2(off * g / goods); l.off = x; left = r2(left - x); }); }
    const em = o.emirate && d.em && d.em[o.emirate] != null && d.em[o.emirate] !== '' ? num(d.em[o.emirate]) : num(d.fee);
    const afterOff = r2(goods - off), ship = freeShip || (d.free && afterOff >= d.free) || !lines.length ? 0 : r2(em), cod = o.pay === 'cod' && lines.length ? r2(sh.codFee || 0) : 0;
    const charges = []; if (ship) charges.push({ code: '', description: 'Delivery charge', descAr: 'رسوم التوصيل', qty: 1, uom: '', incl: ship, disc: 0, vat: 'S', stock: false, charge: 'delivery' });
    if (cod) charges.push({ code: '', description: 'Cash on delivery fee', descAr: 'رسوم الدفع عند الاستلام', qty: 1, uom: '', incl: cod, disc: 0, vat: 'S', stock: false, charge: 'cod' });
    /* VAT is worked out on the total of each VAT rate (as on the UAE e-invoice: taxable amount × rate), so the
       e-invoice made later gives exactly this total. Each line's net is its share; the unit price (excl. VAT)
       is kept precise enough that qty × price gives that net again. */
    const all = lines.concat(charges); let net = 0, vat = 0; const G = new Map();
    all.forEach(l => { l.amount = r2(r2(l.qty * l.incl) - num(l.off)); const g = G.get(l.vat) || []; g.push(l); G.set(l.vat, g); });
    G.forEach((g, cat) => { const pct = VAT[cat] || 0, tax = x => r2(x * pct / 100), pay = r2(g.reduce((x, l) => x + l.amount, 0)); let n = r2(pay * 100 / (100 + pct));
      for (const t of [n, r2(n - 0.01), r2(n + 0.01)]) if (r2(t + tax(t)) === pay) { n = t; break; }
      let left = n; g.forEach((l, i) => { const x = i === g.length - 1 ? left : r2(pay ? n * l.amount / pay : 0); left = r2(left - x); l.net = x; l.vatAmt = tax(x); l.price = Math.round(x / l.qty * 1e6) / 1e6; l.disc = 0; });
      net += n; vat += tax(n); });
    net = r2(net); vat = r2(vat); const total = r2(net + vat);
    if (d.min && lines.length && goods < d.min) E.push({ e: 'minOrder', n: d.min });
    if (o.pay === 'cod' && sh.codMax && total > sh.codMax) E.push({ e: 'codMax', n: sh.codMax });
    if (o.pay && (sh.pay || []).length && !(sh.pay || []).includes(o.pay)) E.push({ e: 'pay' });
    return { lines: all, goods, off, freeShip, ship, cod, net, vat, total, errors: E, couponError: cErr };
  }

  /* ---------- an order from the website, checked again in ORBIT ----------
     msg: what the website sent · cat: the catalogue (as published, version msg.ver if still kept, else today's)
     free: Map code → free stock now · coupons: Shop_Coupons rows (to find the code and count uses) */
  async function checkOrder(msg, cat, free, coupons, set) {
    const E = [], W = [], m = msg || {}, c = m.customer || {}, a = m.address || {};
    if (!/^[A-Z0-9]{1,6}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(m.no || ''))) E.push('Order number is not valid');
    if (!String(c.name || '').trim()) E.push('Customer name is missing'); if (!phoneOk(c.phone)) E.push('Phone number is not valid'); if (!emailOk(c.email)) E.push('E-mail is not valid');
    if (!EMIRATES[a.emirate]) E.push('Emirate is missing'); if (!String(a.area || '').trim() || !String(a.line || '').trim()) E.push('Address is missing');
    if (!PAY[m.pay]) E.push('Payment method is missing');
    let cp = null, cRow = null;
    if (m.coupon) { const h = await couponHash(m.coupon, set.shopKey), today = String(m.at || new Date().toISOString()).slice(0, 10);
      cRow = (coupons || []).find(x => x.active && lc(x.code) === lc(m.coupon)) || null;
      if (!cRow) W.push('Coupon ' + m.coupon + ' is not valid — not applied'); else if ((cRow.from && today < cRow.from) || (cRow.to && today > cRow.to)) { W.push('Coupon ' + m.coupon + ' is out of date — not applied'); cRow = null; }
      else if (cRow.maxUses && cRow.used >= cRow.maxUses) { W.push('Coupon ' + m.coupon + ' is used up — not applied'); cRow = null; }
      if (cRow) cp = { k: cRow.kind, v: cRow.value, m: cRow.minOrder, h }; }
    const q = quote(m.cart, cat, { emirate: a.emirate, pay: m.pay, coupon: cp });
    q.errors.forEach(x => { if (x.e === 'gone') E.push('Item ' + x.code + ' is no longer sold'); else if (x.e === 'min') E.push(x.code + ': at least ' + x.n); else if (x.e === 'max') E.push(x.code + ': at most ' + x.n); else if (x.e === 'minOrder') E.push('Below the minimum order of ' + x.n); else if (x.e === 'codMax') E.push('Cash on delivery is allowed up to ' + x.n); else if (x.e === 'pay') E.push('This payment method is not offered'); });
    if (q.couponError) W.push('Coupon minimum order not reached — not applied');
    if (!q.lines.some(l => l.stock)) E.push('The order has no items');
    /* stock now (not as the website showed it) */
    const short = []; const need = new Map(); q.lines.filter(l => l.code).forEach(l => need.set(l.code, r3((need.get(l.code) || 0) + l.qty)));
    const I = new Map((cat.items || []).map(i => [i.c, i]));
    need.forEach((n, code) => { const it = I.get(code) || {}; if (it.st === 'pre') return; const f = num(free && free.get ? free.get(code) : 0); if (free && f < n - 0.0005) short.push({ code, need: n, free: Math.max(0, f) }); });
    if (Math.abs(num(m.total) - q.total) > 0.009) W.push('The website showed ' + r2(num(m.total)).toFixed(2) + ', ORBIT works out ' + q.total.toFixed(2) + ' — ORBIT\'s total is used');
    return { ok: !E.length, errors: E, warnings: W, quote: q, short, coupon: cRow };
  }

  /* ---------- what the customer sees on the tracking page (no address, no costs) ---------- */
  function trackDoc(o, set) {
    const S2 = STATUS[o.status] || STATUS.confirmed;
    const d = { no: o.no, status: o.status, en: S2.en, ar: S2.ar, step: S2.step, placed: o.placedAt, total: o.total, cur: (set && set.currency) || 'AED', pay: o.payMethod, payStatus: o.payStatus,
      items: (o.lines || []).filter(l => l.code).map(l => ({ c: l.code, en: l.description, ar: l.descAr || '', q: l.qty })), area: o.area, emirate: o.emirate,
      date: o.deliveryDate || '', slot: o.slot || '', timeline: (o.timeline || []).filter(t => !t.internal).map(t => ({ at: t.at, s: t.s, en: t.en, ar: t.ar || '' })), at: new Date().toISOString() };
    if (o.status === 'out_for_delivery') { d.driver = String(o.driver || '').split(/[\s@.]/)[0]; if (o.lastLoc && o.lastLoc.lat) d.loc = o.lastLoc; }
    if (o.payMethod === 'bank' && ['awaiting', 'proof'].includes(o.payStatus)) d.bank = (set && set.bankDetails) || '';
    if (o.payMethod === 'card' && o.payStatus === 'pending') d.payAgain = 1;
    d.canCancel = CANCELLABLE_BY_CUSTOMER.includes(o.status) ? 1 : 0;
    return d;
  }
  /* timeline entry */
  const tl = (status, en, ar, extra) => Object.assign({ at: new Date().toISOString(), s: status, en, ar: ar || '' }, extra || {});
  const TL = {
    placed: ['Order received', 'تم استلام الطلب'], confirmed: ['Order confirmed', 'تم تأكيد الطلب'], awaiting_payment: ['Waiting for your payment', 'بانتظار الدفع'], review: ['We are checking your order', 'نراجع طلبك'],
    paid: ['Payment received', 'تم استلام الدفعة'], picking: ['Your order is being prepared', 'يتم تجهيز طلبك'], packed: ['Packed', 'تم تغليف الطلب'], released: ['Handed to our delivery team', 'تم تسليم الطلب لفريق التوصيل'],
    out_for_delivery: ['Out for delivery', 'الطلب في الطريق إليك'], delivered: ['Delivered — thank you!', 'تم التسليم — شكراً لك!'], failed: ['We could not deliver today', 'تعذّر التوصيل اليوم'],
    returned: ['Returned', 'تم إرجاع الطلب'], cancelled: ['Order cancelled', 'تم إلغاء الطلب'], proof: ['Transfer proof received', 'تم استلام إثبات التحويل'] };
  const tlOf = (k, extra) => tl(k, TL[k][0], TL[k][1], extra);

  /* ---------- rows ↔ objects ---------- */
  const yes = v => v === true || v === '1' || v === 'yes' || v === 'true';
  const csv = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
  const setFromRow = r => { r = r || {}; return { id: r.id ? Number(r.id) : null, shopName: r.shopname || r.title || '', shopNameAr: r.shopnamear || '', shopKey: r.shopkey || '', apiUrl: r.apiurl || '', siteUrl: r.siteurl || '', currency: r.currency || 'AED', orderPrefix: r.orderprefix || 'W', wh: r.wh || '', salesperson: lc(r.salesperson),
    payMethods: r.paymethods == null || r.paymethods === '' ? ['cod'] : csv(r.paymethods), cardProvider: r.cardprovider || '', accCard: String(r.acccard || ''), accBank: String(r.accbank || ''), accCash: String(r.acccash || ''), phone: r.phone || '', whatsapp: r.whatsapp || '', email: r.email || '', color: r.color || '#6d3fd9', logo: r.logo || '',
    autoConfirm: r.autoconfirm == null || r.autoconfirm === '' ? true : yes(r.autoconfirm), holdUnpaid: r.holdunpaid == null || r.holdunpaid === '' ? true : yes(r.holdunpaid), stockShow: r.stockshow || 'low', emailCustomer: r.emailcustomer == null || r.emailcustomer === '' ? true : yes(r.emailcustomer), liveLocation: yes(r.livelocation), lastPublish: r.lastpublish || '', slots: csv(r.slots),
    deliveryFee: num(r.deliveryfee), freeOver: num(r.freeover), minOrder: num(r.minorder), codFee: num(r.codfee), codMax: num(r.codmax), lowStock: r.lowstock === '' || r.lowstock == null ? 5 : num(r.lowstock), unpaidDays: r.unpaiddays === '' || r.unpaiddays == null ? 3 : num(r.unpaiddays), leadDays: r.leaddays === '' || r.leaddays == null ? 1 : num(r.leaddays),
    bankDetails: r.bankdetails || '', emirateFees: J(r.emiratefees, {}), policies: J(r.policies, {}), priceHistory: J(r.pricehistory, []), hero: J(r.hero, {}), connection: r.connection === 'flow' ? 'flow' : 'none', setup: J(r.setup, {}) }; };
  const setToFields = s => ({ Title: s.shopName, ShopName: s.shopName, ShopNameAr: s.shopNameAr || '', ShopKey: s.shopKey, ApiUrl: s.apiUrl || '', SiteUrl: s.siteUrl || '', Currency: s.currency || 'AED', OrderPrefix: s.orderPrefix || 'W', Wh: s.wh || '', Salesperson: s.salesperson || '', PayMethods: (s.payMethods || []).join(','), CardProvider: s.cardProvider || '',
    AccCard: s.accCard || '', AccBank: s.accBank || '', AccCash: s.accCash || '', Phone: s.phone || '', Whatsapp: s.whatsapp || '', Email: s.email || '', Color: s.color || '', Logo: s.logo || '', AutoConfirm: s.autoConfirm ? '1' : '0', HoldUnpaid: s.holdUnpaid ? '1' : '0', StockShow: s.stockShow || 'low', EmailCustomer: s.emailCustomer ? '1' : '0', LiveLocation: s.liveLocation ? '1' : '0', Slots: (s.slots || []).join(','),
    DeliveryFee: num(s.deliveryFee), FreeOver: num(s.freeOver), MinOrder: num(s.minOrder), CodFee: num(s.codFee), CodMax: num(s.codMax), LowStock: num(s.lowStock), UnpaidDays: num(s.unpaidDays), LeadDays: num(s.leadDays), BankDetails: s.bankDetails || '', EmirateFees: JSON.stringify(s.emirateFees || {}), Policies: JSON.stringify(s.policies || {}), Hero: JSON.stringify(s.hero || {}), Connection: s.connection === 'flow' ? 'flow' : 'none', Setup: JSON.stringify(s.setup || {}) });
  const catFromRow = r => ({ id: Number(r.id), code: String(r.code || slug(r.title)), name: r.title || '', nameAr: r.namear || '', parent: r.parent || '', icon: r.icon || '', active: r.active !== '0', sort: num(r.sort) });
  const prodFromRow = r => ({ id: Number(r.id), code: String(r.itemcode || ''), name: r.title || '', published: yes(r.published), slug: r.slug || '', nameAr: r.namear || '', category: r.category || '', brand: r.brand || '', tags: csv(r.tags), badge: r.badge || '', featured: yes(r.featured), backorder: yes(r.backorder),
    price: num(r.price), wasPrice: num(r.wasprice), minQty: num(r.minqty), maxQty: num(r.maxqty), sort: num(r.sort), weight: num(r.weight), descEn: r.descen || '', descAr: r.descar || '', images: J(r.images, []), specs: J(r.specs, []) });
  const prodToFields = p => ({ Title: p.name, ItemCode: p.code, Published: p.published ? '1' : '0', Slug: p.slug || slug(p.name) || p.code, NameAr: p.nameAr || '', Category: p.category || '', Brand: p.brand || '', Tags: (p.tags || []).join(', '), Badge: p.badge || '', Featured: p.featured ? '1' : '0', Backorder: p.backorder ? '1' : '0',
    Price: r2(num(p.price)), WasPrice: r2(num(p.wasPrice)), MinQty: num(p.minQty), MaxQty: num(p.maxQty), Sort: num(p.sort), Weight: num(p.weight), DescEn: p.descEn || '', DescAr: p.descAr || '', Images: JSON.stringify(p.images || []), Specs: JSON.stringify(p.specs || []) });
  const cpnFromRow = r => ({ id: Number(r.id), code: String(r.code || r.title || '').toUpperCase(), kind: r.kind || 'pct', from: String(r.validfrom || '').slice(0, 10), to: String(r.validto || '').slice(0, 10), active: r.active !== '0', value: num(r.value), minOrder: num(r.minorder), maxUses: num(r.maxuses), used: num(r.used) });
  const ordFromRow = r => ({ id: Number(r.id), no: r.orderno || r.title || '', trackId: r.trackid || '', status: r.status || 'review', placedAt: r.placedat || '', lang: r.lang || 'en', customerId: String(r.customerid || ''), customer: r.customername || '', phone: r.phone || '', email: r.email || '', emirate: r.emirate || '', area: r.area || '',
    payMethod: r.paymethod || 'cod', payStatus: r.paystatus || '', payRef: r.payref || '', coupon: r.coupon || '', soId: String(r.soid || ''), soNo: r.sono || '', dnNo: r.dnno || '', invId: String(r.invid || ''), rcpNo: r.rcpno || '', driver: r.driver || '', vehicle: r.vehicle || '', deliveryDate: String(r.deliverydate || '').slice(0, 10), slot: r.slot || '', catVer: r.catver || '', proof: r.proof || '', refund: r.refund || '',
    net: num(r.net), vat: num(r.vat), total: num(r.total), paid: num(r.paid), codCollected: num(r.codcollected), parcels: num(r.parcels), attempts: num(r.attempts), address: J(r.address, {}), lines: J(r.linesjson, []), timeline: J(r.timeline, []), notes: r.notes || '', checks: J(r.checks, {}), lastLoc: J(r.lastloc, null) });
  const inboxFromRow = r => ({ id: Number(r.id), kind: r.kind || '', ref: r.ref || r.title || '', processed: yes(r.processed), error: r.error || '', at: r.created || '', payload: J(r.payload, null) });

  /* keep the prices of the last few catalogues, so an order is priced as the customer saw it */
  function keepPrices(history, ver, items, keep) {
    const h = (history || []).filter(x => x.ver !== ver).slice(-(keep || 6) + 1); h.push({ ver, p: Object.fromEntries((items || []).map(i => [i.c, i.p])) }); return h;
  }
  /* the catalogue as the customer saw it: today's, with the prices of version ver (if kept) */
  function catalogAt(cat, history, ver) {
    const h = (history || []).find(x => x.ver === ver); if (!h || !ver || ver === cat.ver) return cat;
    return Object.assign({}, cat, { items: cat.items.map(i => h.p[i.c] != null ? Object.assign({}, i, { p: h.p[i.c] }) : i) });
  }

  /* ---------- orders without the flow: the website turns the order into a code the customer sends
     by WhatsApp or e-mail; staff paste the message into ORBIT and it is taken like any website order ---------- */
  const b64u = s => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'); };
  const SHORT = [['a', 'a'], ['no', 'n'], ['ver', 'v'], ['at', 't'], ['lang', 'l'], ['pay', 'p'], ['coupon', 'k'], ['date', 'd'], ['slot', 's'], ['notes', 'o'], ['total', 'x']];
  function orderCode(m) {
    const o = {}; SHORT.forEach(([k, s2]) => { if (m[k] != null && m[k] !== '') o[s2] = m[k]; });
    o.c = [m.customer.name, m.customer.phone, m.customer.email || '']; const ad = m.address || {}; o.w = [ad.emirate, ad.area, ad.line, ad.landmark || '', ad.lat || '', ad.lng || ''];
    o.i = (m.cart || []).map(x => [x.c, x.q]); return 'ORBIT1:' + b64u(JSON.stringify(o));
  }
  function parseOrderCode(text) {
    const mm = /ORBIT1:([A-Za-z0-9_-]{20,})/.exec(String(text || '')); if (!mm) return null; let o; try { o = JSON.parse(unb64u(mm[1])); } catch (e) { return null; }
    const m = { a: 'order' }; SHORT.forEach(([k, s2]) => { if (o[s2] != null) m[k] = o[s2]; }); m.a = 'order';
    const c = o.c || [], w = o.w || []; m.customer = { name: c[0] || '', phone: c[1] || '', email: c[2] || '' }; m.address = { emirate: w[0] || '', area: w[1] || '', line: w[2] || '', landmark: w[3] || '', lat: w[4] || '', lng: w[5] || '' };
    m.cart = (o.i || []).map(x => ({ c: String(x[0]), q: num(x[1]) })); m.via = 'paste'; return m;
  }

  /* ---------- reports ---------- */
  function summary(orders, from, to) {
    const live = (orders || []).filter(o => o.status !== 'cancelled' && (!from || String(o.placedAt).slice(0, 10) >= from) && (!to || String(o.placedAt).slice(0, 10) <= to));
    const by = k => { const m = {}; live.forEach(o => { const x = o[k] || '—'; m[x] = m[x] || { n: 0, v: 0 }; m[x].n++; m[x].v = r2(m[x].v + o.total); }); return m; };
    const prods = {}; live.forEach(o => (o.lines || []).filter(l => l.code).forEach(l => { const p = prods[l.code] = prods[l.code] || { name: l.description, q: 0, v: 0 }; p.q = r3(p.q + l.qty); p.v = r2(p.v + num(l.net) + num(l.vatAmt)); }));
    const sales = r2(live.reduce((s, o) => s + o.total, 0));
    return { orders: live.length, sales, aov: live.length ? r2(sales / live.length) : 0, byPay: by('payMethod'), byEmirate: by('emirate'), byStatus: by('status'), products: Object.entries(prods).map(([code, p]) => Object.assign({ code }, p)).sort((a, b) => b.v - a.v) };
  }

  return { r2, r3, r4, num, J, lc, VAT, LISTS, LIST_NAMES: Object.keys(LISTS), STATUS, STEPS, NEXT, canGo, CANCELLABLE_BY_CUSTOMER, PAY, PAY_STATUS, EMIRATES, TL,
    slug, phone, phoneOk, emailOk, sha256, sha256js, trackId, couponHash, newOrderNo, exVat, availability, buildCatalog, quote, checkOrder, trackDoc, tl, tlOf, keepPrices, catalogAt, summary, orderCode, parseOrderCode,
    setFromRow, setToFields, catFromRow, prodFromRow, prodToFields, cpnFromRow, ordFromRow, inboxFromRow, version: '1.0.0' };
});
