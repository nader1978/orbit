# ORBIT ERP — client edition, build 530

This is ORBIT prepared for clients other than NFPC, with E-Invoicing and the new **Finance & Accounts** module (phase 1: accounting core).

## What is different from the NFPC ORBIT
| | |
|---|---|
| Users | No user list is shipped (`js/00-users-data.js` is empty). Add users in **Users & Roles**. |
| Built-in administrator | User **admin**, temporary password **Orbit@2026** — ORBIT asks for a new password at the first sign-in. |
| Logo and name | Neutral by default (ORBIT · ERP · Finance · Operations). Set the client's name, logo and colours in **Settings → Branding** and publish them for everyone. |
| Microsoft sign-in | No tenant, app or site is filled in. Enter the client's in Connection settings. |
| Mobile app | Opens `mobile.html` on the same site. |
| Operations pages | The warehouse, fleet, roster and similar pages are still included. Hide the ones a client does not use with Settings → Arrange, or per user in Users & Roles. |

## First set-up for a client
1. Upload all files to the client's web host over https, then sign in as **admin** and change the password.
2. Fill in Connection settings (tenant, client ID, SharePoint site). The client's Entra app needs `Sites.ReadWrite.All`, plus `Sites.Manage.All` for the set-up buttons.
3. **Finance Settings → Set up → Set up lists**. This creates the Fin_* and EInv_* lists. Then **Load the starter chart of accounts** (50 UAE accounts).
4. **E-Invoice Settings → Company**: the seller details (TRN, TIN, trade licence, address, IBAN).
5. **Finance Settings → General**: financial-year start, lock date and number prefixes. **Posting accounts** come pre-filled from the chart.
6. **Inventory Settings → Set up**: **Set up lists** (Inv_* lists), **Add stock accounts** (7 accounts: raw materials, work in progress, finished goods, goods received not invoiced, opening balance equity, stock adjustments, production cost clearing), **Create default warehouses**.
8. **Asset Settings → Set up**: **Set up lists** (Bud_* and FA_* lists), **Add accounts** (1505 Land & buildings, 4950 Gain / loss on disposal), **Add standard categories**.
9. **HR Settings → Set up**: **Set up lists** (HR_* lists), **Add accounts** (2145 Pension payable, 2146 Leave salary provision, 6105 Overtime, 6120 Leave salary, 6130 Employer pension), **Link ORBIT employees**. Then **General**: company name, MOHRE employer ID (13 digits) and the bank routing code (9 digits) for the WPS file.
7. Clients that already use ORBIT's warehouse pages: **Inventory Settings → ORBIT link** (see below). Others: add items in **Items** and receive the opening stock with a stock receipt.

## Finance & Accounts (phase 1)
Pages in the side panel group **Finance & Accounts**, also in ORBIT Mobile:
- **Finance**: cash and bank, receivables, payables, VAT due, profit for the month and year, quick actions.
- **Journal Entries**: manual entries with a live debit/credit check. Draft → Post → Reverse. A posted entry is never edited.
- **Purchase Bills**: supplier invoices booked to payables and input VAT. **Received e-invoices** become bills in one tap, and the supplier is matched by TRN.
- **Receipts & Payments**: money in and out, applied to open invoices or bills ("apply oldest first"). Any amount not applied stays on account.
- **Financial Reports**: trial balance, profit & loss, balance sheet, account ledger, receivables and payables ageing, and a VAT 201 working. Each report exports to CSV and prints.
- **Chart of Accounts**, **Suppliers**, **Finance Settings**.

Sales come from E-Invoicing. Every invoice the ASP accepts is posted with **Finance → Post e-invoices to the ledger**: Dr receivables, Cr sales (goods / services) and Cr output VAT. Credit notes post the reverse. The journal number is saved on the e-invoice.

Built-in rules:
- Every entry must balance.
- Group and inactive accounts can't be posted to.
- No postings on or before the **lock date**.
- Income and expense accounts restart each financial year, and the balance sheet shows profit to date.

## Where the ledger is kept (Finance Settings → Data)
- **SharePoint lists** (default). Without transactions, SharePoint is made safe like this: lines are written first with a unique PostId, the entry is marked posted last, and reports only count lines whose PostId matches a posted entry. A half-finished posting never shows up in a report.
- **ERP server database**. The same server as the ASP gateway (`orbit-erp-server`) keeps the Fin_*, Inv_*, Bud_*, FA_* and HR_* tables in a database and posts each entry in **one transaction**. Use **Copy SharePoint finance data to the server** once, then switch. For PostgreSQL or SQL Server, schemas are in `sql/` in the server package.

## Finance lists
| List | Columns (type) |
|---|---|
| Fin_Settings | Title, BaseCurrency (single line), FiscalStart (single line), LockDate (single line), JvPrefix (single line), BillPrefix (single line), RcpPrefix (single line), PayPrefix (single line), DataMode (single line), ServerUrl (single line), AccMap (multiple lines) |
| Fin_Accounts | Title, Code (single line), NameAr (single line), AccType (single line), SubType (single line), ParentCode (single line), IsGroup (single line), Active (single line), Description (single line) |
| Fin_Journal | Title, EntryNo (single line), EntryDate (single line), Memo (single line), Source (single line), SourceRef (single line), Status (single line), PostId (single line), ReversalOf (single line), ReversedBy (single line), PostedBy (single line), PostedAt (single line), Total (number), LinesJson (multiple lines), History (multiple lines) |
| Fin_JournalLines | Title, EntryId (single line), PostId (single line), EntryDate (single line), AccountCode (single line), Description (single line), PartyType (single line), PartyId (single line), PartyName (single line), CostCenter (single line), Source (single line), DocRef (single line), Debit (number), Credit (number) |
| Fin_Suppliers | Title, NameAr (single line), TRN (single line), LegalId (single line), LegalIdType (single line), AuthorityName (single line), AddressLine (single line), City (single line), Emirate (single line), Country (single line), Email (single line), EndpointId (single line), DefaultAccount (single line), PaymentTerms (number) |
| Fin_Bills | Title, BillNo (single line), SupplierId (single line), SupplierName (single line), SupplierInvNo (single line), BillDate (single line), DueDate (single line), Currency (single line), Status (single line), JournalNo (single line), EinvId (single line), Notes (single line), FxRate (number), Subtotal (number), VatTotal (number), Total (number), LinesJson (multiple lines), History (multiple lines) |
| Fin_Payments | Title, PayNo (single line), PayType (single line), PayDate (single line), PartyType (single line), PartyId (single line), PartyName (single line), AccountCode (single line), Method (single line), Reference (single line), Status (single line), JournalNo (single line), Notes (single line), Amount (number), AllocJson (multiple lines), History (multiple lines) |

## Bank reconciliation (Finance)
Finance & Accounts → **Bank Reconciliation** (first time: **Set up lists**, which adds Fin_BankStatements and Fin_BankLines).
1. **Import statement**: choose the bank account and a CSV from online banking (or paste it). Columns are found by name — Date / Transaction date / Value date, Description / Narration / Details, Reference / Cheque no., Debit + Credit or Amount, Balance. Dates dd/mm/yyyy (or mm/dd/yyyy, switch), yyyy-mm-dd, 04-Nov-2026; amounts with commas, (brackets), DR / CR. Opening and closing balances come from the Balance column (or the previous statement); the screen shows whether opening + lines = closing.
2. **Auto-match**: same amount to the fils, dates within 5 days, best reference / description overlap; one bank line to one ledger line.
3. **By hand**: tick one bank line and several ledger lines (or the other way round) when the totals agree → **Match ticked**. **Unmatch** undoes it.
4. **＋ Entry** on a bank line that is not in the ledger (bank charges, interest, direct debits): choose the account → the entry is posted to the ledger and matched.
5. Ledger items dated before the first statement (e.g. the opening balance) → **Mark items before … as cleared**.
6. **Reconciliation statement**: balance per bank + deposits in transit − unpresented payments = balance per ledger + items on the bank not yet in the ledger. **Reconciled** locks the statement once every bank line is matched and the difference is zero (**Reopen** to change). Print for the file.

## Side menu: departments and business type
The side panel is grouped into departments (folders, collapsed at start; the one holding the open page opens by itself): Integration · RM & PM · Production · Demand & Planning · Warehouse · Distributions · Finance · Fleet · Human Capital · Admin · Settings, plus **NFPC Operations** (all pages built for NFPC: FEFO allocation, Oasis Prism, planning, F&D, logistics, racks, forklifts, RMPM, attendance & roster, FOC, management reports).
**Settings → Business type** shows only what the business needs (pages stay installed; switch back any time; an administrator's choice is saved for everyone):
| Business type | Hidden |
|---|---|
| All modules (default) | nothing — includes NFPC Operations |
| All modules except NFPC Operations | NFPC Operations |
| Manufacturing | NFPC Operations |
| Construction / contracting | Manufacturing (BOM, production orders), NFPC Operations |
| Trading / distribution | Manufacturing, Workshop, NFPC Operations |
| Services | Manufacturing, Workshop, Inventory, Fleet, NFPC Operations |
| Food & restaurant | Workshop, NFPC Operations |
| Vending | Manufacturing, NFPC Operations |
| Printing & typing centre | Workshop, Fleet, NFPC Operations |
| NFPC | nothing |
An administrator can still rename / reorder in Settings → Side panel layout; a saved layout takes priority over the default, the business type filter still applies.

## Sales & Marketing (Distributions)
- **Leads & opportunities**: company, contact, emirate, source, campaign, owner, stage (new → contacted → qualified → proposal → negotiation → won / lost), value, probability, expected close; activities with next follow-up ("Follow-ups due" list); **Make customer** creates the E-Invoicing customer and the sales account; **Quotation** starts a quote.
- **Customer accounts & price lists**: per customer credit limit, payment days, price list, salesperson, tags, on hold. Price lists with dates, default list and quantity tiers ("from qty"). Prices on quotes/orders come from the customer's list → default list → the item's sales price.
- **Quotations**: lines with discount %; above the discount limit (Sales settings, default 10 %) → approval "Sales discount above limit" (Sales Manager); print, mark sent, **Accepted → order**, lost (with reason). The lead moves to Proposal, and to Won when the order is made.
- **Sales orders**: on **Confirm order**: credit check (receivable = sent e-invoices − receipts, + other open orders, + this order vs the credit limit) → over the limit: approval "Sales order over credit limit" (Finance) or not allowed (setting); stock check (on hand − held by other open orders; warn or block); discount check (already approved on the quote = no second approval). **Deliver** (partial deliveries, delivery note to print with signature lines) → **Create e-invoice**: a draft in E-Invoicing for what is delivered and not yet invoiced (services: ordered), with item codes, discounts and the customer's payment days. Stock leaves the books when the e-invoice is posted (cost of sales), as before.
- **Campaigns & segments**: segments by emirate, tags, salesperson, price list, sales in the last N days (or no sales = inactive); member list to CSV. Campaigns: channel, segment, dates, budget, cost → leads, won value, cost per lead, return on cost.
- **Targets & commissions**: monthly target per salesperson, commission % of net sales, bonus % of the part above target. Sales = sent e-invoices net of VAT (credit notes deducted), credited to the order's salesperson, else the customer's.
- **Bulk Email** (new in 527): import recipient lists from Excel or CSV (every sheet; the e-mail and name columns are found automatically; invalid, duplicate and unsubscribed addresses are removed; split a big file into lists of N). Compose with ready layouts (offer, newsletter, simple letter, Arabic RTL) or **Design with AI** (Gemini key in AI settings): language, tone, colours and company → subject + HTML. Personal fields `{name|fallback}` and any Excel column, live preview, attachments up to 3 MB, an unsubscribe line. Send one e-mail per person or in BCC groups, with a delay between e-mails, pause / stop / resume, a test to yourself, and a log of every failure. Sent from the signed-in mailbox (Microsoft Graph); bulk copies are not saved in Sent Items.
- **Website Traffic** (new in 527): visits, visitors, new visitors, time on site, bounce rate, leads (demo, contact, login clicks), visits per day, sources (Google, social, newsletters, UTM campaigns), countries, devices, browsers, language, sections reached, buttons pressed and busiest hours — for 7 days to 12 months. The Orbit website sends anonymous data (no cookies, no IP address) to a collector: the ORBIT server route `POST <server>/v1/site/hit/<tenant id>`, or a Power Automate flow ("When an HTTP request is received" → create item in Web_Visits). Put the collector address in the website's `ANALYTICS_URL`.
- Lists: Sal_Settings, Sal_Accounts, Sal_PriceLists, Sal_Leads, Sal_Quotes, Sal_Orders, Sal_Deliveries, Sal_Campaigns, Sal_Segments, Sal_Targets, Sal_MailLists, Sal_MailRuns, Sal_Unsubscribed, Web_Visits.

## Online Shop (new in 528)
A shop website (EN/AR, phones first) connected to Sales, Inventory, Warehouse, Distribution and Finance — SharePoint only, through one Power Automate flow. Full set-up: **SHOP-SETUP.md**; the website is the `shop/` folder of this repository (…/erp/shop/).
- **Connected without Premium** (build 530): `shop-gateway/orbit-shop-gateway.js` is a free Cloudflare Worker that does the Power Automate flow's job (orders, proofs, cancel requests → Shop_Inbox; tracking, photos, card payments). Switch to "Connected" in ORBIT and the next publish tells the website its address — orders then go straight into SharePoint. The live shop has no demo products ("opening soon" until ORBIT publishes).
- **Offers & visitors** (build 530): Online Shop → 📣 Offers & ads — advertising bar messages (EN/AR, they take turns at the top of every page), offer banners on the home page (coupon code to copy, countdown to the end date, button to a category / product / deals), Deals section (products with a was-price, biggest discount first). The shop sends anonymous visits to Web_Visits through the gateway; **Website traffic** has an Online shop tab with the path visit → product → cart → checkout → order, most viewed and most added products.
- **Before the connection service** (build 529): Online Shop → 🔌 Website connection. ORBIT pushes the catalogue, photos and tracking files straight into `shop/data/` on GitHub (fine-grained token kept only in that browser); customers send orders by WhatsApp / e-mail with a code that staff paste into ORBIT (📋 Order from WhatsApp / e-mail); cash on delivery and bank transfer. The same tab keeps the set-up model for later (checklist, details, connection test, printable set-up sheet, switch to "Connected").
- **Distributions → Online Shop**: products for the web (names EN/AR, price incl. VAT, was-price, photos resized to WebP, description with AI, details, min/max, featured, badge, pre-order), categories, coupons (% / amount / free delivery; the site only gets scrambled codes), delivery fees per emirate, free-delivery threshold, minimum order, COD fee and limit, time slots, policies; **Publish** writes `OrbitShop/catalog.json` (stock shown as in stock / only N left / out of stock). Orders are picked up from `Shop_Inbox` every minute while a shop page is open: re-priced with the prices the customer saw, checked against stock, customer created (E-Invoicing customer + sales account tagged web), **sales order** made (holds the stock), payment checked, customer e-mailed (EN/AR) at each step, tracking file written.
- **Warehouse → Online orders**: pick list (combined for many orders), picking with barcode / item-code check, packed (parcels), label, **release to distribution** → delivery note; paid orders get their e-invoice draft.
- **Distributions → Web deliveries**: select orders → driver, vehicle, day, slot → route sheet; delivered (receiver, cash collected → receipt to "cash with drivers", e-invoice draft) or not delivered (reason) → send again or returned. **My deliveries** is the driver's phone screen (call, WhatsApp, navigate, live location for the customer).
- **Finance → Web payments**: bank transfers with the customer's proof → confirm → receipt; card payments (Stripe, Network International N-Genius or Telr, keys kept in the flow) checked again with the card company; cash per driver; refunds (posted against the customer).
- Totals: VAT is worked out per VAT rate on the total, exactly as on the UAE e-invoice, so order, receipt and e-invoice agree to the fils.
- Lists: Shop_Settings, Shop_Products, Shop_Categories, Shop_Coupons, Shop_Inbox, Shop_Orders · files: OrbitShop/ (catalog.json, img/, track/, proofs/).

## Approvals (one engine for every module)
**Approvals → Approval Setup**
- **Rules**: document type (purchase request, purchase order, bill outside the 3-way match, sales discount above the limit, sales order over the credit limit) + department (or all) + amount band (AED) → steps in order. "Add standard rules" gives a starting set (e.g. purchase requests up to 5,000 → line manager; 5,000–50,000 → department head → Finance; above 50,000 → also the General Manager).
- **Step approver**: the requester's **line manager** (from HR: the employee's "Line manager"; when unknown, the department head), the **department head**, **anyone in a role** (optionally "2 of the role must approve"), or a **named person**. People are ORBIT user names.
- **Departments**: name, head, cost centre. **Roles**: Finance, General Manager, Procurement Manager, Sales Manager… and who is in them.
- Nobody approves their own document (that step is skipped and noted); the same person is not asked twice.
**Approvals → My Approvals**: what is waiting for you, your own requests, everything pending. Open one to see the chain and history, then **Approve** or **Reject** (a reason is required); the requester can **Withdraw**. When ORBIT's e-mail sender is set up, the next approvers (and the requester, at the end) get an e-mail.

## Procurement
- **Purchase requests**: department, cost centre, purpose, lines (stock item or a description with an expense account, estimated price) → **Submit for approval** (rule by department and amount). Approved → **Request quotations** or **Create purchase order**.
- **RFQs & quotations**: tick the suppliers, print an RFQ for each, enter each supplier's quote (prices per line, delivery days, payment terms, validity) → **comparison** (lowest price per line in green, 🏆 lowest complete total) → **Award** → the purchase order is prepared with the quoted prices.
- **Purchase orders**: supplier, delivery date, warehouse, payment terms, lines with VAT, terms printed on the order → **Submit for approval** → **Print** / **Mark sent** → **Receive goods** (partial receipts allowed; stock items go into stock at the PO price against 2160 Goods received not invoiced; services just record what arrived) → **Supplier invoice · 3-way match**: ordered vs received vs invoiced, quantity and price tolerance (settings, default 0 % / 2 %) → within tolerance: **Create purchase bill**; outside: **Send variance for approval** (rule "Bill outside 3-way match") then create the bill. The bill (draft, posted in Finance → Purchase Bills) debits 2160 for stock at the PO price, the price variance to 5300, services to their account — so goods received not invoiced clears to zero.
- **Close order** ends an order that will not be fully delivered; **Cancel** before anything is received.

## Inventory & Manufacturing (phase 2)
Seven pages, in the desktop menu and in the mobile app:
- **Inventory**: stock value by kind, work in progress, low stock, open production orders; posts any missing cost of sales or bill receipts.
- **Items**: trading goods, raw & packaging, finished goods and services (no stock). Standard cost, sales price, reorder level, optional own stock / cost-of-sales account. Stock by warehouse and a 90-day stock card. "Make e-invoice product" links the item to e-invoicing.
- **Stock transactions**: receive (against goods received not invoiced, or any account), issue (charged to an account), transfer between warehouses (no ledger effect), stock count (counted vs system → adjustment). A live preview shows the value and the journal lines before posting.
- **Stock reports**: on hand at any date (by warehouse / kind), valuation by stock account, stock card, movement summary (opening, in, out, closing), reorder list, **stock vs ledger** reconciliation. CSV and print.
- **Bills of materials**: components with scrap %, labour and overhead per batch, live cost roll-up at today's average costs.
- **Production orders**: plan → **release** (materials out of the materials warehouse into work in progress) → **complete** (finished goods in at materials + labour & overhead; work in progress back to zero). Shortages are shown before release.
- **Inventory settings**: numbering, default / finished goods / raw warehouses, negative stock rule, write-back to ORBIT, posting accounts, warehouses, ORBIT link.

**Costing**: moving weighted average per item, company-wide. Every issue takes the average at that moment; the last unit out takes the remaining value, so nothing is left over from rounding.

**What posts to the ledger**
| Stock document | Debit | Credit |
|---|---|---|
| Receipt | Stock account of the item | Goods received not invoiced (or the chosen account) |
| Purchase bill line with a stock item | Stock account (on the bill itself) | Accounts payable (on the bill) — the stock receipt adds no second entry |
| Issue / count shortage | Stock adjustments (or the chosen account) | Stock |
| Count surplus | Stock | Stock adjustments |
| Sale by e-invoice | Cost of goods sold | Stock |
| Credit note | Stock | Cost of goods sold |
| Production: release | Work in progress | Raw & packaging |
| Production: complete | Finished goods | Work in progress + Production cost clearing (labour & overhead) |
| Opening stock | Stock | Opening balance equity |
| Transfer | — | — |

**Links to the other modules**
- **Purchase bills**: each bill line can carry a stock item and warehouse; the line's account switches to the item's stock account and posting the bill also receives the stock at the bill price (foreign currency converted to AED).
- **E-invoicing**: an e-invoice product can carry a stock item code (or the line description equals the item name). When accepted invoices are posted to the ledger (Finance → Post e-invoices), the cost of goods sold is posted too, from the default warehouse.

**ORBIT link** (for clients that use ORBIT's warehouse pages)
ORBIT keeps quantities only. The ERP adds cost without changing how ORBIT works:
1. **Link ORBIT items**: finished goods from `Inventory_Item_List`, raw & packaging from `RMPM_Items_tbl`.
2. Enter **standard costs** in Items.
3. **Take opening stock from ORBIT**: finished goods from `Bal_Qty`, raw & packaging summed from `RMPM_Movements_tbl`, valued at standard cost. Done once; it records where ORBIT's movement lists stood.
4. **Sync now** (any time): new rows in `Main_Inventory_Movements_tbl` and `RMPM_Movements_tbl` become one stock document per day. Receipts come in at standard cost, releases go out at average cost. Bin-to-bin moves are skipped (they net to zero), and rows are never imported twice.
5. Optional **write-back**: ERP postings for linked items (receipts, issues, counts, sales, production) are added to ORBIT's lists with reference `ERP-…`, and `Bal_Qty` is updated, so ORBIT's warehouse pages stay right. Sync skips these rows. Opening stock and transfers are never written back.

`SKUs_Movements_Batch_tbl` / `SKUs_Received_Batch_tbl` hold the batch (FEFO) detail of the same stock ORBIT already counts in `Main_Inventory_Movements_tbl`, so they are not imported (that would count the stock twice). Accounts for ORBIT movements are set in Inventory Settings → Accounts (defaults: finished goods in → production cost clearing, out → cost of goods sold; raw in → goods received not invoiced, used → production cost clearing).

**Safe posting**: same rule as the ledger. On SharePoint the stock document is saved first, then its journal entry (found again on a retry, never doubled), then the stock moves with a PostId, then the document is marked posted. Reports count only moves of posted documents. On the ERP server, document + moves + journal entry are one transaction.

## Bank reconciliation lists
| List | Columns |
|---|---|
| Fin_BankStatements | Title, Account, StatementNo, FromDate, ToDate, Status, FileName, ReconciledBy, ReconciledAt, OpeningBal (number), ClosingBal (number), Notes, History, Cleared |
| Fin_BankLines | Title, StatementId, Account, LineDate, Description, Ref, Status, JournalNo, Amount (number), Balance (number), Seq (number), Matched |

## Inventory lists
| List | Columns (type) |
|---|---|
| Inv_Settings | Title, RcvPrefix (single line), IssPrefix (single line), TrfPrefix (single line), CntPrefix (single line), MoPrefix (single line), DefaultWh (single line), FgWh (single line), RmWh (single line), AllowNegative (single line), Mirror (single line), SyncMark (single line), AccMap (multiple lines), SyncLog (multiple lines) |
| Inv_Items | Title, Code (single line), NameAr (single line), Kind (single line), Category (single line), UoM (single line), VatCat (single line), Barcode (single line), Source (single line), SrcId (single line), Active (single line), InvAccount (single line), CogsAccount (single line), StdCost (number), SalesPrice (number), Reorder (number) |
| Inv_Warehouses | Title, Code (single line), WhKind (single line), Active (single line), Notes (single line) |
| Inv_Docs | Title, DocNo (single line), DocType (single line), DocDate (single line), Ref (single line), Party (single line), Memo (single line), Status (single line), PostId (single line), JournalNo (single line), SrcRef (single line), Account (single line), PostedBy (single line), PostedAt (single line), Value (number), LinesJson (multiple lines), History (multiple lines) |
| Inv_Moves | Title, DocId (single line), PostId (single line), MoveDate (single line), DocNo (single line), DocType (single line), ItemCode (single line), Wh (single line), Ref (single line), SrcList (single line), SrcId (single line), Qty (number), UnitCost (number), Value (number) |
| Inv_BOM | Title, ProductCode (single line), Version (single line), Active (single line), Notes (single line), OutputQty (number), LabourCost (number), OverheadCost (number), Components (multiple lines) |
| Inv_ProdOrders | Title, OrderNo (single line), ProductCode (single line), BomId (single line), Status (single line), PlanDate (single line), DoneDate (single line), OutWh (single line), MatWh (single line), IssueDoc (single line), OutputDoc (single line), Notes (single line), PlanQty (number), DoneQty (number), IssueValue (number), OutputValue (number), Conversion (number), Components (multiple lines), History (multiple lines) |

## Budgets & Fixed Assets (phase 3)
Six pages, in the desktop menu and in the mobile app.

**Budgets**
- A budget is for one financial year (Finance Settings → financial-year start), with lines by **account** and optional **cost centre / project**, 12 monthly amounts each. Income and expenses are entered as positive amounts.
- Fill a line by hand, or with an amount for the year spread **evenly** or **like last year's months**.
- **Fill from last year**: last year's income and expense actuals ± a percentage, month by month (optionally by cost centre).
- **Add ORBIT project budgets**: every project in ORBIT's `Project_Reg_tbl` with a Budget becomes a line on the chosen expense account, with the project code as cost centre, spread over the project's months that fall in the year.
- CSV export and import (columns Account, CostCenter, M1…M12 — or one Total column, spread evenly).
- **Approve** locks a budget; **Reopen** or **Copy as new version** to change it.

**Budget vs actual**: actuals come from the posted ledger. For any month: that month and year to date, budget vs actual, variance (green = favourable: more income or less expense), %, year budget and a forecast (actual to date + budget for the rest of the year). By account, account group or income / expense, for one cost centre or all. **By month** view for profit or any line. **ORBIT projects** view: project budget from ORBIT, cost recorded in ORBIT's project module (`Project_Costs_tbl`), and expense posted in the ledger with the project code as cost centre — a gap shows costs recorded in only one place.

**Fixed assets**
- Register: number, category, dates, cost, residual value, method (straight line by months, or declining balance by rate %), location, cost centre, supplier, serial. Assets from an old system take their **accumulated depreciation so far** and the month it was charged to; depreciation continues over the remaining life.
- **From purchase bills**: posted bill lines on a fixed asset account (e.g. 1520 Vehicles) are listed until registered — one tap fills the asset (cost in AED, date, supplier, category from the account). The cost is already in the ledger through the bill.
- An asset entered by hand can be "already in the ledger" (opening balances) or **posted now**: Dr asset account, Cr accumulated depreciation brought in, Cr the account paid from.
- **First month**: in service by the 15th → depreciated from that month, otherwise from the next (or always that month / always the next — Asset Settings).
- **Depreciation runs** (one per month, in order): every active asset, with **catch-up** for months it missed; one journal entry dated the month end, Dr depreciation (by cost centre) / Cr accumulated depreciation. Only the latest run can be reversed.
- **Disposal** (sale or scrap): depreciation up to the disposal month is charged in the same entry; cost and accumulated depreciation come out; proceeds to bank / cash / receivable; the difference to Gain / loss on disposal (4950).
- **Reports**: register at any date (cost, accumulated depreciation, book value), **movement** for a period (the fixed asset note: cost and depreciation, opening → additions / brought in / charge → disposals → closing), 12-month **forecast**, and **assets vs ledger**.

Safe posting: a depreciation run is saved as a draft with its lines, then its journal entry is posted (reference FA:&lt;run&gt; — found again on a retry, never doubled), then the run is marked posted. Accumulated depreciation counts only posted runs. A disposal posts its entry (reference FADISP:&lt;asset&gt;) before marking the asset disposed.

ORBIT's headcount budget (Budget_HC in the management report) counts people, not money, so it stays in the management report.

## Budget & asset lists
| List | Columns (type) |
|---|---|
| Bud_Budgets | Title, FyStart (single line), Version (single line), Status (single line), Notes (single line), ApprovedBy (single line), ApprovedAt (single line), History (multiple lines) |
| Bud_Lines | Title, BudgetId (single line), AccountCode (single line), CostCenter (single line), Notes (single line), M1 (number), M2 (number), M3 (number), M4 (number), M5 (number), M6 (number), M7 (number), M8 (number), M9 (number), M10 (number), M11 (number), M12 (number), Total (number) |
| FA_Settings | Title, AssetPrefix (single line), RunPrefix (single line), FirstMonth (single line), GainAccount (single line) |
| FA_Categories | Title, AssetAccount (single line), AccDepAccount (single line), DepAccount (single line), Method (single line), Active (single line), LifeMonths (number), RatePct (number), ResidualPct (number) |
| FA_Assets | Title, AssetNo (single line), Category (single line), AcqDate (single line), InService (single line), Method (single line), Location (single line), CostCenter (single line), Supplier (single line), Serial (single line), SrcRef (single line), OpenPeriod (single line), Status (single line), AcqJournal (single line), DispDate (single line), DispPeriod (single line), DispJournal (single line), DispAccount (single line), Notes (single line), Cost (number), Residual (number), LifeMonths (number), RatePct (number), OpenAccDep (number), DispProceeds (number), DispDep (number), DispGain (number), History (multiple lines) |
| FA_DepRuns | Title, RunNo (single line), Period (single line), RunDate (single line), Status (single line), JournalNo (single line), ReversedBy (single line), PostedBy (single line), PostedAt (single line), Total (number), LinesJson (multiple lines), History (multiple lines) |

## Human Resources (phase 4)
Eight pages, in the desktop menu and in the mobile app. UAE private sector rules (Federal Decree-Law 33 of 2021); every rate is a setting.

**Employees** — linked to ORBIT's `Employees_tbl` by **file no.** "Link / Update from ORBIT" adds new staff and keeps name, job role, grade, location, section, line manager and leaving status in step; salary, bank and HR details live in HR and are never overwritten. Each employee: contract dates (join, probation, contract end), salary (basic, housing, transport, other) with **salary history** (every change kept with its effective date — payroll uses the salary in force for the month), payment by **WPS** (labour card / MOHRE person ID 14 digits, routing code 9 digits, IBAN AE + 21 digits) or cash / cheque, overtime yes / no, **pension instead of gratuity** for UAE / GCC nationals (set automatically for "Emirati" from ORBIT), documents, leave, payslips and loans. For staff moved from an old system: opening leave balance and the gratuity / leave provisions already booked.

**Leave** — annual (2 days a month in the first year, usable after 6 months, then 30 days a year — setting), sick (15 days full pay · 30 half · 45 unpaid per service year; none paid in probation), maternity (45 full · 15 half), parental, bereavement, study, unpaid. Requests show the balance and how many days are full / half / unpaid before approval; overlaps and over-booking are refused. Balances page with the value of unused leave; adjustments for opening balances, encashment or corrections.

**Payroll** — one run per month: everyone in service gets a payslip. Joiners and leavers are paid for their days; approved unpaid and half-paid leave and absent days are deducted (monthly ÷ 30, or ÷ days in month); **overtime and absent days come from ORBIT's `Attendance_Data_tbl`** by file no. (Total_NOT → normal, Total_ROT (+ FOT, setting) → rest day, Total_HOT → public holiday; a day with required hours, no work and no punch-in is absent unless the remarks say leave / off / holiday / sick). Overtime = basic ÷ 30 ÷ 8 per hour × 1.25 normal, × 1.5 night / rest day / public holiday. Loan instalments are taken; pension (employee and employer %) for members; any payslip can be adjusted (OT hours, absence, bonus, other additions, deductions, note) and recalculated before **Approve**. Then **Post to ledger**, **WPS file**, **Mark paid**. Payslips print (one or all) and export to CSV.

**What payroll posts** (one entry dated the month end; expenses by the employee's cost centre)
| Debit | Credit |
|---|---|
| 6100 Salaries & allowances (salary earned − absence + bonus + additions) | 2140 Salaries payable (net pay) |
| 6105 Overtime | 1170 Employee loans & advances (instalments) |
| 6130 Employer pension | 2145 Pension payable (employee + employer) |
| 6110 End of service benefits (gratuity accrued this month) | 2510 End of service provision |
| 6120 Leave salary (unused leave accrued this month) | 2146 Leave salary provision |
| | Other deductions (default 6100) |
Payment: Dr 2140 / Cr bank. Each month's accrual is the liability at month end less what was accrued before, so the provisions always equal gratuity and unused leave to date.

**WPS salary information file (.sif)** — one EDR line per WPS employee (labour card no., routing code, IBAN, pay period, days, fixed part, variable part = overtime + bonus + additions, unpaid days) and the SCR control line (employer ID, routing code, date, time, MMYYYY, count, total, AED, run reference). File name = employer ID + YYMMDDHHMMSS. The SCR position (last or first line) is a setting — check your bank's WPS guide. The file is checked before download (13 / 9 / 14-digit IDs, IBAN, totals); cash and cheque employees are left out.

**Loans & advances** — amount, monthly instalment, first deduction month; paying it out posts Dr 1170 / Cr bank; payroll deducts until repaid, then the loan closes.

**Documents** — passport, residence visa, Emirates ID, labour card, health insurance, driving licence, contract; expiry list for 30 / 60 / 90 / 180 days and on HR home.

**End of service** — gratuity liability for everyone today vs the provision in the ledger. **Final settlement**: gratuity under Article 51 (21 days' basic a year for the first five years, 30 after, pro-rata, nothing under one year, capped at two years' wage; pension members get none), unused annual leave, other amounts due, loans and other recoveries. Posting uses the provisions first (the difference goes to expense), marks the employee as left, closes the loans and cancels leave booked after the last day. The last month's salary comes from that month's payroll run.

Not in this release: unpaid leave days are not taken off the service period for gratuity; multiple payroll groups or pay frequencies (one monthly run for everyone).

## HR lists
| List | Columns (type) |
|---|---|
| HR_Settings | Title, Company (single line), EmpSource (single line), EmployerId (single line), Routing (single line), ScrPosition (single line), Basis (single line), FotAs (single line), LeaveBasis (single line), RunPrefix (single line), LoanPrefix (single line), AccrueGrat (single line), AccrueLeave (single line), CapWage (single line), Hours (number), OtNormal (number), OtNight (number), OtRest (number), OtHoliday (number), Annual (number), PenEe (number), PenEr (number), AccMap (multiple lines) |
| HR_Employees | Title, FileNo (single line), NameAr (single line), Department (single line), Position (single line), Grade (single line), CostCenter (single line), Location (single line), Nationality (single line), Gender (single line), BirthDate (single line), JoinDate (single line), ProbationEnd (single line), ContractEnd (single line), Status (single line), LeaveDate (single line), LeaveReason (single line), PayMethod (single line), LabourCardNo (single line), Routing (single line), IBAN (single line), Pension (single line), OtEligible (single line), Email (single line), Phone (single line), Manager (single line), OrbitId (single line), OpenDate (single line), Notes (single line), Basic (number), Housing (number), Transport (number), OtherAllow (number), OpenLeaveDays (number), OpenEOSB (number), OpenLeaveProv (number), History (multiple lines) |
| HR_SalaryChanges | Title, EmpId (single line), FileNo (single line), EffDate (single line), Reason (single line), ChangedBy (single line), Basic (number), Housing (number), Transport (number), OtherAllow (number) |
| HR_Documents | Title, EmpId (single line), FileNo (single line), DocType (single line), DocNo (single line), IssueDate (single line), ExpiryDate (single line), Notes (single line) |
| HR_Leaves | Title, EmpId (single line), FileNo (single line), LeaveType (single line), FromDate (single line), ToDate (single line), Status (single line), Reason (single line), ApprovedBy (single line), ApprovedAt (single line), Days (number), History (multiple lines) |
| HR_LeaveAdj | Title, EmpId (single line), FileNo (single line), LeaveType (single line), AdjDate (single line), Reason (single line), Days (number) |
| HR_Loans | Title, LoanNo (single line), EmpId (single line), FileNo (single line), LoanType (single line), LoanDate (single line), StartPeriod (single line), Status (single line), PaidFrom (single line), JournalNo (single line), Notes (single line), Amount (number), Installment (number) |
| HR_PayRuns | Title, RunNo (single line), Period (single line), Status (single line), PayDate (single line), JournalNo (single line), PayJournal (single line), PaidFrom (single line), PostedBy (single line), PostedAt (single line), SifName (single line), Gross (number), Deductions (number), Net (number), Headcount (number), History (multiple lines) |
| HR_Payslips | Title, RunId (single line), EmpId (single line), FileNo (single line), Period (single line), CostCenter (single line), PayMethod (single line), Notes (single line), PaidDays (number), Fixed (number), Earned (number), AbsentDays (number), UnpaidDays (number), AbsDed (number), OtN (number), OtNight (number), OtRest (number), OtHol (number), OtAmount (number), Bonus (number), OtherAdd (number), Deduct (number), LoanDed (number), PenEe (number), PenEr (number), Gross (number), Net (number), GratAccr (number), LeaveAccr (number), WpsFixed (number), WpsVar (number), Detail (multiple lines) |
| HR_Settlements | Title, EmpId (single line), FileNo (single line), SetDate (single line), Reason (single line), Status (single line), JournalNo (single line), Gratuity (number), LeaveDays (number), LeavePay (number), LoanRecovered (number), OtherAdd (number), OtherDed (number), Net (number), Detail (multiple lines) |

## Next phase (not in this build)
**Point of sale**: shop counter (barcode, receipt printer, cash drawer, shifts), van / field sales (works offline, van stock) and restaurant / café (tables, kitchen orders, modifiers). Sales post to the ledger and stock.
