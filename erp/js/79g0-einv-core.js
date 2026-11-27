/* ============================================================
   E-INVOICING CORE — UAE PINT AE (Peppol) · shared by the ORBIT module, the separate app and the ASP gateway
   · code lists, VAT maths, the main PINT AE business rules (rule IDs shown to the user), UBL 2.1 XML builder
   · SharePoint list definitions (EInv_* lists) used by "Set up lists"
   · mock ASP (test mode): status follows the time since sending, so it works with no server
   Works in the browser (window.EINV) and in Node (require).
   Source of rules: PINT AE Billing, docs.peppol.eu/poac/ae/pint-ae — the ASP's Schematron check stays the final word.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.EINV = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- code lists ---------- */
  const C = {
    CUSTOMIZATION_ID: 'urn:peppol:pint:billing-1@ae-1',
    PROFILE_ID: 'urn:peppol:bis:billing',
    ENDPOINT_SCHEME: '0235',
    INVOICE_TYPE: { invoice: '380', credit_note: '381' },
    VAT: {
      S: { label: 'Standard rated 5%', ar: 'خاضع للنسبة الأساسية 5%', rate: 5 },
      Z: { label: 'Zero rated', ar: 'خاضع لنسبة الصفر', rate: 0 },
      E: { label: 'Exempt', ar: 'معفى', rate: null },
      O: { label: 'Not subject to VAT', ar: 'غير خاضع للضريبة', rate: null },
    },
    EMIRATES: { AUH: 'Abu Dhabi', DXB: 'Dubai', SHJ: 'Sharjah', AJM: 'Ajman', UAQ: 'Umm Al Quwain', RAK: 'Ras Al Khaimah', FUJ: 'Fujairah' },
    LEGAL_ID_TYPES: { TL: 'Commercial / trade licence', EID: 'Emirates ID', PAS: 'Passport', CD: 'Cabinet decision' },
    FLAGS: ['Free trade zone', 'Deemed supply', 'Profit margin scheme', 'Summary invoice', 'Continuous supply', 'Disclosed agent billing', 'Supply through e-commerce', 'Exports'],
    PREDEFINED: { DEEMED_SUPPLY: '9900000097', BUYER_NOT_IN_SCOPE: '9900000098', EXPORT_NOT_ON_PEPPOL: '9900000099' },
    CREDIT_TRANSFER: '30',
    STATUS: ['draft', 'submitted', 'validated', 'delivered', 'reported', 'rejected'],
    STATUS_LABEL: { draft: 'Draft', submitted: 'Sent to ASP', validated: 'Validated', delivered: 'Delivered', reported: 'Reported to FTA', rejected: 'Rejected' },
  };

  /* ---------- maths (2 decimals, half away from zero) ---------- */
  const r2 = n => { const v = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100; return n < 0 ? -v : v; };
  const rateOf = cat => (C.VAT[cat] && C.VAT[cat].rate != null) ? C.VAT[cat].rate : 0;
  function line(l) {
    const quantity = Number(l.quantity) || 0, unit_price = Number(l.unit_price) || 0, discount = r2(Number(l.discount) || 0);
    const net_amount = r2(quantity * unit_price - discount), vat_rate = rateOf(l.vat_category);
    return Object.assign({}, l, { quantity, unit_price, discount, net_amount, vat_rate, vat_amount: r2(net_amount * vat_rate / 100) });
  }
  function totals(rawLines, fxRate) {
    const lines = (rawLines || []).map(line), groups = new Map();
    lines.forEach(l => { const k = l.vat_category + '|' + l.vat_rate + '|' + (l.exemption_reason || ''); const g = groups.get(k) || { category: l.vat_category, rate: l.vat_rate, exemption_reason: l.exemption_reason || null, taxable: 0 }; g.taxable = r2(g.taxable + l.net_amount); groups.set(k, g); });
    const breakdown = [...groups.values()].map(g => Object.assign(g, { tax: r2(g.taxable * g.rate / 100) }));   /* ALIGNED-IBRP-S-09: taxable × rate */
    const subtotal = r2(lines.reduce((s, l) => s + l.net_amount, 0)), vat_total = r2(breakdown.reduce((s, g) => s + g.tax, 0)), total = r2(subtotal + vat_total);
    const out = { lines, breakdown, subtotal, vat_total, total };
    if (fxRate) out.aed = { vat_total: r2(vat_total * fxRate), total: r2(total * fxRate), breakdown: breakdown.map(g => Object.assign({}, g, { taxable: r2(g.taxable * fxRate), tax: r2(g.tax * fxRate) })) };
    return out;
  }

  /* ---------- PINT AE pre-checks ---------- */
  const TRN_RE = /^1\d{12}03$/, TIN_RE = /^1\d{9}$/, PRE = Object.values(C.PREDEFINED);
  function party(p, who, E) {
    const W = who === 'seller' ? 'Seller' : 'Buyer', ar = who === 'seller' ? 'IBR-143-AE' : 'IBR-144-AE';
    if (!p) { E.push({ rule: 'IBG', field: who, message: W + ' details are missing' }); return; }
    if (!p.name) E.push({ rule: 'IBT-027', field: who + '.name', message: W + ' registered name is required' });
    if (!p.address_line) E.push({ rule: ar, field: who + '.address_line', message: W + ' address line is required' });
    if (!p.city) E.push({ rule: ar, field: who + '.city', message: W + ' city is required' });
    if ((p.country || 'AE') === 'AE') { if (!p.emirate) E.push({ rule: ar, field: who + '.emirate', message: W + ' emirate is required' }); else if (!C.EMIRATES[p.emirate]) E.push({ rule: 'IBR-128-AE', field: who + '.emirate', message: W + ' emirate code "' + p.emirate + '" is not valid' }); }
    if (p.trn && !TRN_RE.test(p.trn)) E.push({ rule: 'IBR-132-AE', field: who + '.trn', message: W + ' TRN must be 15 digits, start with 1 and end with 03' });
    if (p.legal_id) {
      if (!C.LEGAL_ID_TYPES[p.legal_id_type]) E.push({ rule: who === 'seller' ? 'IBR-181-AE' : 'IBR-180-AE', field: who + '.legal_id_type', message: W + ' legal registration type must be TL, EID, PAS or CD' });
      if (p.legal_id_type === 'TL' && !p.authority_name) E.push({ rule: who === 'seller' ? 'IBR-172-AE' : 'IBR-101-AE', field: who + '.authority_name', message: W + ' licensing authority is required for a trade licence' });
    }
  }
  function validate(doc) {
    const E = [], Wn = [], s = doc.seller, b = doc.buyer, lines = doc.lines || [], flags = doc.transaction_flags || '00000000', cn = doc.doc_type === 'credit_note';
    party(s, 'seller', E);
    if (s) {
      if (!TIN_RE.test(s.tin || '')) E.push({ rule: 'IBR-148-AE', field: 'seller.tin', message: 'Seller TIN (Peppol ID) must be 10 digits starting with 1' });
      if (!s.trn) E.push({ rule: 'IBR-134-AE', field: 'seller.trn', message: 'Seller TRN is required on a tax invoice' });
      if (!s.legal_id) E.push({ rule: 'IBR-150-AE', field: 'seller.legal_id', message: 'Seller legal registration number (e.g. trade licence) is required' });
      if (!s.iban) E.push({ rule: 'IBR-192-AE', field: 'seller.iban', message: 'Bank account (IBAN) is required for credit-transfer payment' });
    }
    party(b, 'buyer', E);
    if (b) {
      const ep = b.endpoint_id;
      if (!ep) E.push({ rule: 'IBT-049', field: 'buyer.endpoint_id', message: 'Buyer Peppol ID (TIN or predefined ID) is required' });
      else if (!TIN_RE.test(ep) && !PRE.includes(ep)) E.push({ rule: 'IBT-049', field: 'buyer.endpoint_id', message: 'Buyer Peppol ID must be a 10-digit TIN or 9900000097 / 98 / 99' });
      if (flags[1] === '1' && ep !== C.PREDEFINED.DEEMED_SUPPLY) Wn.push({ rule: 'BIS 1.5.3', message: 'Deemed supply normally uses buyer Peppol ID 9900000097' });
      if (TIN_RE.test(ep || '') && !b.legal_id && !b.trn) E.push({ rule: 'IBR-149-AE', field: 'buyer.legal_id', message: 'Buyer legal registration number is required' });
    }
    if (!doc.number) E.push({ rule: 'IBT-001', field: 'number', message: 'Document number is required' });
    if (!doc.uuid) E.push({ rule: 'IBR-193-AE', field: 'uuid', message: 'Unique identifier (UUID) is required' });
    if (!doc.issue_date) E.push({ rule: 'IBT-002', field: 'issue_date', message: 'Issue date is required' });
    if (!/^[01]{8}$/.test(flags)) E.push({ rule: 'IBR-154-AE', field: 'transaction_flags', message: 'Transaction type must be 8 digits of 0/1' });
    if (doc.currency && doc.currency !== 'AED') {
      if (!(Number(doc.fx_rate) > 0)) E.push({ rule: 'IBR-159-AE', field: 'fx_rate', message: 'Exchange rate to AED is required for non-AED invoices' });
      else if (!/^\d+(\.\d{1,6})?$/.test(String(doc.fx_rate))) E.push({ rule: 'IBR-002-AE', field: 'fx_rate', message: 'Exchange rate can have at most 6 decimals' });
    }
    if (cn) {
      if (!doc.credit_reason) E.push({ rule: 'IBR-158-AE', field: 'credit_reason', message: 'Credit note reason code is required' });
      if (doc.credit_reason !== 'VD' && !doc.preceding_number) E.push({ rule: 'IBR-055-AE', field: 'preceding_number', message: 'Credit note must reference the original invoice' });
    }
    if (!lines.length) E.push({ rule: 'IBG-25', field: 'lines', message: 'At least one line is required' });
    lines.forEach((l, i) => {
      const n = i + 1;
      if (!String(l.description || '').trim()) E.push({ rule: 'IBR-125-AE', field: 'lines.' + n, message: 'Line ' + n + ': description is required' });
      if (!(Number(l.quantity) > 0)) E.push({ rule: 'IBT-129', field: 'lines.' + n, message: 'Line ' + n + ': quantity must be more than 0' });
      if (!(Number(l.unit_price) >= 0)) E.push({ rule: 'IBT-146', field: 'lines.' + n, message: 'Line ' + n + ': unit price cannot be negative' });
      if (!C.VAT[l.vat_category]) E.push({ rule: 'IBR-139-AE', field: 'lines.' + n, message: 'Line ' + n + ': VAT category must be S, Z, E or O' });
      if (l.vat_category === 'E' && !l.exemption_reason) E.push({ rule: 'IBR-167-AE', field: 'lines.' + n, message: 'Line ' + n + ': exempt lines need an exemption reason code' });
      if (l.kind !== 'S' && !/^\d{4,}$/.test(l.class_code || '')) E.push({ rule: 'IBR-184-AE', field: 'lines.' + n, message: 'Line ' + n + ': goods need an HS code (digits)' });
      if (l.kind === 'S' && !/^\d{4,}$/.test(l.class_code || '')) E.push({ rule: 'IBR-185-AE', field: 'lines.' + n, message: 'Line ' + n + ': services need a SAC code (digits)' });
    });
    if (!cn && lines.length && lines.every(l => l.vat_category === 'E' || l.vat_category === 'O')) E.push({ rule: 'IBR-151-AE', field: 'lines', message: 'A tax invoice cannot have only exempt / not-subject lines' });
    if (!cn && totals(lines).total > 0 && !doc.due_date) E.push({ rule: 'IBR-127-AE', field: 'due_date', message: 'Payment due date is required when an amount is due' });
    return { ok: !E.length, errors: E, warnings: Wn };
  }

  /* ---------- UBL 2.1 XML (PINT AE) ---------- */
  const x = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const a2 = n => Number(n).toFixed(2);
  const tg = (n, v, at) => (v == null || v === '') ? '' : '<' + n + (at || '') + '>' + x(v) + '</' + n + '>';
  function xParty(p, seller) {
    const la = p.legal_id_type ? ' schemeAgencyID="' + x(p.legal_id_type) + '"' + (p.authority_name ? ' schemeAgencyName="' + x(p.authority_name) + '"' : '') : '';
    return ['<cac:Party>',
      '  <cbc:EndpointID schemeID="' + C.ENDPOINT_SCHEME + '">' + x(seller ? p.tin : p.endpoint_id) + '</cbc:EndpointID>',
      '  <cac:PostalAddress>', '    ' + tg('cbc:StreetName', p.address_line), '    ' + tg('cbc:CityName', p.city), '    ' + tg('cbc:CountrySubentity', p.emirate),
      '    <cac:Country><cbc:IdentificationCode>' + x(p.country || 'AE') + '</cbc:IdentificationCode></cac:Country>', '  </cac:PostalAddress>',
      p.trn ? '  <cac:PartyTaxScheme><cbc:CompanyID>' + x(p.trn) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>' : '',
      '  <cac:PartyLegalEntity>', '    <cbc:RegistrationName>' + x(p.name) + '</cbc:RegistrationName>', p.legal_id ? '    <cbc:CompanyID' + la + '>' + x(p.legal_id) + '</cbc:CompanyID>' : '', '  </cac:PartyLegalEntity>',
      '</cac:Party>'].join('\n');
  }
  function xCat(cat, rate, exr, el) {
    const hasRate = C.VAT[cat] && C.VAT[cat].rate !== null;   /* E and O carry no rate */
    return '<' + el + '><cbc:ID>' + x(cat) + '</cbc:ID>' + (hasRate ? '<cbc:Percent>' + a2(rate) + '</cbc:Percent>' : '') + (cat === 'E' && exr ? '<cbc:TaxExemptionReasonCode>' + x(exr) + '</cbc:TaxExemptionReasonCode>' : '') + '<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></' + el + '>';
  }
  function xTax(bd, tax, cur) {
    return '<cac:TaxTotal>\n  <cbc:TaxAmount currencyID="' + cur + '">' + a2(tax) + '</cbc:TaxAmount>\n' + bd.map(g =>
      '  <cac:TaxSubtotal>\n    <cbc:TaxableAmount currencyID="' + cur + '">' + a2(g.taxable) + '</cbc:TaxableAmount>\n    <cbc:TaxAmount currencyID="' + cur + '">' + a2(g.tax) + '</cbc:TaxAmount>\n    ' + xCat(g.category, g.rate, g.exemption_reason, 'cac:TaxCategory') + '\n  </cac:TaxSubtotal>').join('\n') + '\n</cac:TaxTotal>';
  }
  function buildXml(doc) {
    const cn = doc.doc_type === 'credit_note', root = cn ? 'CreditNote' : 'Invoice', LE = cn ? 'cac:CreditNoteLine' : 'cac:InvoiceLine', QE = cn ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
    const cur = doc.currency || 'AED', fx = cur !== 'AED', t = totals(doc.lines, fx ? Number(doc.fx_rate) : null), s = doc.seller, u = l => x(l.unit_code || 'H87');
    const L = t.lines.map((l, i) => [
      '<' + LE + '>', '  <cbc:ID>' + (i + 1) + '</cbc:ID>', '  <' + QE + ' unitCode="' + u(l) + '">' + Number(l.quantity) + '</' + QE + '>',
      '  <cbc:LineExtensionAmount currencyID="' + cur + '">' + a2(l.net_amount) + '</cbc:LineExtensionAmount>',
      l.discount > 0 ? '  <cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode><cbc:Amount currencyID="' + cur + '">' + a2(l.discount) + '</cbc:Amount></cac:AllowanceCharge>' : '',
      (l.vat_category === 'E' || l.vat_category === 'O') ? '' : '  <cac:TaxTotal><cbc:TaxAmount currencyID="' + cur + '">' + a2(l.vat_amount) + '</cbc:TaxAmount></cac:TaxTotal>',
      '  <cac:Item>', '    <cbc:Description>' + x(l.description) + '</cbc:Description>', '    <cbc:Name>' + x(String(l.description || '').slice(0, 200)) + '</cbc:Name>',
      l.class_code ? '    <cac:CommodityClassification><cbc:ItemClassificationCode listID="' + (l.kind === 'S' ? 'SAC' : 'HS') + '">' + x(l.class_code) + '</cbc:ItemClassificationCode></cac:CommodityClassification>' : '',
      '    ' + xCat(l.vat_category, l.vat_rate, l.exemption_reason, 'cac:ClassifiedTaxCategory'), '  </cac:Item>',
      '  <cac:Price><cbc:PriceAmount currencyID="' + cur + '">' + a2(l.unit_price) + '</cbc:PriceAmount><cbc:BaseQuantity unitCode="' + u(l) + '">1</cbc:BaseQuantity></cac:Price>',
      '  <cac:ItemPriceExtension><cbc:Amount currencyID="' + cur + '">' + a2(l.net_amount + l.vat_amount) + '</cbc:Amount></cac:ItemPriceExtension>',
      '</' + LE + '>'].join('\n')).join('\n');
    const out = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<' + root + ' xmlns="urn:oasis:names:specification:ubl:schema:xsd:' + root + '-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
      '<cbc:CustomizationID>' + C.CUSTOMIZATION_ID + '</cbc:CustomizationID>', '<cbc:ProfileID>' + C.PROFILE_ID + '</cbc:ProfileID>',
      '<cbc:ProfileExecutionID>' + x(doc.transaction_flags || '00000000') + '</cbc:ProfileExecutionID>',
      '<cbc:ID>' + x(doc.number) + '</cbc:ID>', '<cbc:UUID>' + x(doc.uuid) + '</cbc:UUID>', '<cbc:IssueDate>' + x(doc.issue_date) + '</cbc:IssueDate>',
      cn ? '' : tg('cbc:DueDate', doc.due_date),
      cn ? '<cbc:CreditNoteTypeCode>' + C.INVOICE_TYPE.credit_note + '</cbc:CreditNoteTypeCode>' : '<cbc:InvoiceTypeCode>' + C.INVOICE_TYPE.invoice + '</cbc:InvoiceTypeCode>',
      tg('cbc:Note', doc.notes), '<cbc:DocumentCurrencyCode>' + cur + '</cbc:DocumentCurrencyCode>', fx ? '<cbc:TaxCurrencyCode>AED</cbc:TaxCurrencyCode>' : '',
      cn && doc.credit_reason ? '<cac:DiscrepancyResponse><cbc:ResponseCode>' + x(doc.credit_reason) + '</cbc:ResponseCode></cac:DiscrepancyResponse>' : '',
      doc.preceding_number ? '<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>' + x(doc.preceding_number) + '</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>' : '',
      '<cac:AccountingSupplierParty>', xParty(s, true), '</cac:AccountingSupplierParty>',
      '<cac:AccountingCustomerParty>', xParty(doc.buyer, false), '</cac:AccountingCustomerParty>',
      !cn && s.iban ? '<cac:PaymentMeans><cbc:PaymentMeansCode>' + C.CREDIT_TRANSFER + '</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>' + x(s.iban) + '</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>' : '',
      fx ? '<cac:TaxExchangeRate><cbc:SourceCurrencyCode>' + cur + '</cbc:SourceCurrencyCode><cbc:TargetCurrencyCode>AED</cbc:TargetCurrencyCode><cbc:CalculationRate>' + x(doc.fx_rate) + '</cbc:CalculationRate></cac:TaxExchangeRate>' : '',
      xTax(t.breakdown, t.vat_total, cur), fx ? xTax(t.aed.breakdown, t.aed.vat_total, 'AED') : '',
      '<cac:LegalMonetaryTotal>', '  <cbc:LineExtensionAmount currencyID="' + cur + '">' + a2(t.subtotal) + '</cbc:LineExtensionAmount>',
      '  <cbc:TaxExclusiveAmount currencyID="' + cur + '">' + a2(t.subtotal) + '</cbc:TaxExclusiveAmount>',
      '  <cbc:TaxInclusiveAmount currencyID="' + cur + '">' + a2(t.total) + '</cbc:TaxInclusiveAmount>',
      '  <cbc:PayableAmount currencyID="' + cur + '">' + a2(t.total) + '</cbc:PayableAmount>', '</cac:LegalMonetaryTotal>',
      L, '</' + root + '>'];
    return out.join('\n').split('\n').filter(l => l.trim() !== '').join('\n') + '\n';
  }

  /* ---------- mock ASP (test mode, no server): status follows the time since sending ---------- */
  function mockStatus(submittedAt, notes, now) {
    if (String(notes || '').includes('FORCE_REJECT')) return { status: 'rejected', message: 'Mock ASP: rejection requested for testing' };
    const s = ((now || Date.now()) - new Date(submittedAt).getTime()) / 1000;
    if (s < 2) return { status: 'submitted', message: 'Accepted by the mock ASP' };
    if (s < 4) return { status: 'validated', message: 'PINT AE validation passed' };
    if (s < 6) return { status: 'delivered', message: 'Delivered to the buyer ASP over Peppol (AS4)' };
    return { status: 'reported', message: 'Tax data reported to the FTA — acknowledgement received' };
  }
  const STEP = { draft: 0, submitted: 1, validated: 2, delivered: 3, reported: 4, rejected: 9 };

  /* ---------- SharePoint lists (created by "Set up lists"; names have no spaces so internal name = display name) ---------- */
  const T = n => ({ name: n, text: {} }), M = n => ({ name: n, text: { allowMultipleLines: true, textType: 'plain' } }), N = n => ({ name: n, number: {} });
  const PARTY = ['NameAr', 'TRN', 'LegalId', 'LegalIdType', 'AuthorityName', 'AddressLine', 'City', 'Emirate', 'Country', 'Email'].map(T);
  const LISTS = {
    EInv_Company: PARTY.concat(['TIN', 'Phone', 'IBAN', 'InvoicePrefix', 'CreditPrefix', 'AspMode', 'GatewayUrl'].map(T)),
    EInv_Customers: PARTY.concat([T('EndpointId')]),
    EInv_Products: ['NameAr', 'Kind', 'ClassCode', 'UnitCode', 'VatCategory', 'ExemptionReason', 'ItemCode'].map(T).concat([N('Price')]),
    EInv_Documents: ['Direction', 'DocType', 'DocNumber', 'DocUUID', 'IssueDate', 'DueDate', 'Currency', 'CustomerId', 'CustomerName', 'Flags', 'PrecedingNumber', 'CreditReason', 'Status', 'AspRef', 'SubmittedBy', 'SubmittedAt', 'JournalNo'].map(T)
      .concat(['FxRate', 'Subtotal', 'VatTotal', 'Total'].map(N)).concat(['Seller', 'Buyer', 'LinesJson', 'Notes', 'Xml', 'Errors', 'History'].map(M)),
    EInv_Counters: [N('NextNo')],
  };
  const XML_MAX = 60000;   /* multi-line text limit guard — bigger XML is rebuilt from the frozen data (same result) */

  /* ---------- mapping SharePoint rows (keys lower-cased, ORBIT style) <-> core objects ---------- */
  const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
  const partyFromRow = r => ({ name: r.title || '', name_ar: r.namear || '', trn: r.trn || '', tin: r.tin || '', legal_id: r.legalid || '', legal_id_type: r.legalidtype || 'TL', authority_name: r.authorityname || '', address_line: r.addressline || '', city: r.city || '', emirate: r.emirate || '', country: r.country || 'AE', email: r.email || '', endpoint_id: r.endpointid || '', iban: r.iban || '' });
  const partyToFields = (p, kind) => {
    const f = { Title: p.name, NameAr: p.name_ar, TRN: p.trn, LegalId: p.legal_id, LegalIdType: p.legal_id_type, AuthorityName: p.authority_name, AddressLine: p.address_line, City: p.city, Emirate: p.emirate, Country: p.country || 'AE', Email: p.email };
    if (kind === 'customer') f.EndpointId = p.endpoint_id; else { f.TIN = p.tin; f.IBAN = p.iban; f.Phone = p.phone; }
    return f;
  };
  function docFromRow(r) {
    return { id: Number(r.id), direction: r.direction || 'out', doc_type: r.doctype || 'invoice', number: r.docnumber || '', uuid: r.docuuid || '', issue_date: r.issuedate || '', due_date: r.duedate || '',
      currency: r.currency || 'AED', fx_rate: r.fxrate || null, customer_id: r.customerid || '', customer_name: r.customername || '', transaction_flags: r.flags || '00000000',
      preceding_number: r.precedingnumber || '', credit_reason: r.creditreason || '', notes: r.notes || '', status: r.status || 'draft', asp_ref: r.aspref || '',
      subtotal: Number(r.subtotal) || 0, vat_total: Number(r.vattotal) || 0, total: Number(r.total) || 0, seller: J(r.seller, null), buyer: J(r.buyer, null), lines: J(r.linesjson, []),
      xml: r.xml || '', journal_no: r.journalno || '', errors: J(r.errors, []), history: J(r.history, []), submitted_at: r.submittedat || '', submitted_by: r.submittedby || '' };
  }
  function docToFields(d) {
    const t = totals(d.lines);
    return { Title: d.number || 'Draft', Direction: d.direction || 'out', DocType: d.doc_type, DocNumber: d.number || '', DocUUID: d.uuid || '', IssueDate: d.issue_date, DueDate: d.due_date || '',
      Currency: d.currency || 'AED', FxRate: d.fx_rate ? Number(d.fx_rate) : null, CustomerId: String(d.customer_id || ''), CustomerName: d.customer_name || (d.buyer && d.buyer.name) || '',
      Flags: d.transaction_flags || '00000000', PrecedingNumber: d.preceding_number || '', CreditReason: d.credit_reason || '', Notes: d.notes || '', Status: d.status || 'draft',
      Subtotal: t.subtotal, VatTotal: t.vat_total, Total: t.total, LinesJson: JSON.stringify(t.lines.map(l => ({ description: l.description, kind: l.kind, class_code: l.class_code, unit_code: l.unit_code, quantity: l.quantity, unit_price: l.unit_price, discount: l.discount, vat_category: l.vat_category, exemption_reason: l.exemption_reason || null, item_code: l.item_code || undefined }))) };
  }
  const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  return { C, r2, line, totals, validate, buildXml, mockStatus, STEP, LISTS, XML_MAX, partyFromRow, partyToFields, docFromRow, docToFields, uuid, TRN_RE, TIN_RE, version: '1.0.0' };
});
