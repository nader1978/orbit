# ORBIT ERP — E-Invoicing module

**Build 511:** E-Invoicing is now in the web app's side panel too — group **E-Invoicing** with 7 pages (New Invoice, Invoices, Received Invoices, E-Invoice Customers, E-Invoice Products, VAT Summary, E-Invoice Settings). They show the same screens as the phone at desktop width, on the same SharePoint lists. New file `js/79g1-desktop-einvoice.js`; side-panel entries and pages in `index.html` / `mobile.html`. If the side-panel layout was arranged centrally, the new pages appear as their own group "E-Invoicing" just above Configuration — move it with Settings → Arrange like any group. Pages have no fixed permission: hide them for users who should not see them in Users & Roles (page access).
App icons: the e-invoice symbol only (no client logo).

## Where to see it
- **Web app**: side panel → E-Invoicing.
- **Phone** (mobile.html): Home → Sections → **E-Invoicing**. If the phone app is hosted on its own site, upload the same build there too.
- **Qayd app**: it reads and writes the same EInv_* lists. Sign in to Qayd with the same SharePoint site address; on Qayd's sign-in screen open Advanced and enter ORBIT's Tenant ID and Client ID, and add Qayd's address as an extra SPA redirect URI in ORBIT's app registration (Entra ID → App registrations → ORBIT → Authentication). Invoices made in ORBIT then show in Qayd and the other way round — same numbers, same counter.


New section in ORBIT Mobile: **E-Invoicing** (UAE PINT AE invoices through your Accredited Service Provider).
It opens on phones automatically and on a PC through "📱 Mobile".

## Files changed in this build
| File | Change |
|---|---|
| `js/79g0-einv-core.js` | **new** — PINT AE rules, VAT maths, XML builder, list definitions |
| `js/79g-mobile-einvoice.js` | **new** — the 7 e-invoicing screens (uses the mobile suite API, js/79) |
| `js/79g1-desktop-einvoice.js` | **new (511)** — the same screens as pages in the web app side panel |
| `js/71-mobile-app.js` | one new group "E-Invoicing" in the mobile menu |
| `js/60-update-check.js` | APP_BUILD 509 |
| `index.html`, `mobile.html` | 2 new script tags, versions 509 |
| `version.json` | build 509 |

Upload **all files** of ORBIT_Version_509_split.zip, then press Ctrl+F5 (same as every build).

## Screens
New Invoice · Invoices · Received Invoices · Customers · Products & Services · VAT Summary · E-Invoice Settings.
Every save uses ORBIT's normal "Save to SharePoint?" confirmation and progress window.

## First-time setup (administrator, once)
1. **Permission for "Set up lists"** — in the ORBIT app registration (Entra ID → App registrations → ORBIT → API permissions) add the delegated Microsoft Graph permission **Sites.Manage.All** and grant admin consent. It is only used by the "Set up lists" button. If you prefer not to add it, create the lists by hand (table below).
2. In ORBIT Mobile open **E-Invoicing → E-Invoice Settings → Lists → Set up lists**. It creates the 5 lists in the ORBIT SharePoint site, or adds missing columns. It never deletes anything.
3. **Company** tab: fill in the company (TRN, TIN = Peppol ID, trade licence, address, emirate, IBAN). This is the seller on every invoice.
4. Add **Customers** (TRN + Peppol ID) and **Products & Services** (HS code for goods, SAC code for services).
5. Send a test invoice in **Test mode**. When your ASP is ready, set **ASP → ASP gateway** with the gateway address.

## SharePoint lists (if you create them by hand)
All names without spaces. Number columns: plain number. "Multiple lines" columns: plain text.

| List | Columns (type) |
|---|---|
| EInv_Company | Title (single line, built in), NameAr (single line), TRN (single line), LegalId (single line), LegalIdType (single line), AuthorityName (single line), AddressLine (single line), City (single line), Emirate (single line), Country (single line), Email (single line), TIN (single line), Phone (single line), IBAN (single line), InvoicePrefix (single line), CreditPrefix (single line), AspMode (single line), GatewayUrl (single line) |
| EInv_Customers | Title (single line, built in), NameAr (single line), TRN (single line), LegalId (single line), LegalIdType (single line), AuthorityName (single line), AddressLine (single line), City (single line), Emirate (single line), Country (single line), Email (single line), EndpointId (single line) |
| EInv_Products | Title (single line, built in), NameAr (single line), Kind (single line), ClassCode (single line), UnitCode (single line), VatCategory (single line), ExemptionReason (single line), Price (number) |
| EInv_Documents | Title (single line, built in), Direction (single line), DocType (single line), DocNumber (single line), DocUUID (single line), IssueDate (single line), DueDate (single line), Currency (single line), CustomerId (single line), CustomerName (single line), Flags (single line), PrecedingNumber (single line), CreditReason (single line), Status (single line), AspRef (single line), SubmittedBy (single line), SubmittedAt (single line), FxRate (number), Subtotal (number), VatTotal (number), Total (number), Seller (multiple lines, plain), Buyer (multiple lines, plain), LinesJson (multiple lines, plain), Notes (multiple lines, plain), Xml (multiple lines, plain), Errors (multiple lines, plain), History (multiple lines, plain) |
| EInv_Counters | Title (single line, built in), NextNo (number) |

## Test mode vs ASP gateway
- **Test mode**: a pretend ASP inside the app — the invoice goes Sent → Validated → Delivered → Reported in about 10 seconds. Nothing reaches the FTA. Numbers ARE taken from the real counter, so use a test SharePoint site or reset EInv_Counters before going live.
- **ASP gateway**: the small server (separate package `einv-asp-gateway`) that holds the ASP's API key and receives the ASP's status updates. The app sends it the signed-in user's Microsoft token; the gateway checks it with Microsoft.

## Notes
- Invoice numbers: INV-YYYY-00001 and CN-YYYY-00001 (prefixes in Company settings), one counter row per type and year, protected with an eTag so two phones never get the same number.
- Once sent, an invoice is frozen (number, UUID, seller/buyer and the exact XML are stored). Changes after that need a credit note.
- Not in this build yet: reverse charge (VAT category AE), self-billing, PDF copy of the invoice, Arabic screens.
