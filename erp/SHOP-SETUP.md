# ORBIT Online Shop — set-up guide (SharePoint only, no server)

The shop website is a static site (any host: GitHub Pages, the Orbit site, Azure Static Web Apps).
It never talks to SharePoint directly. It sends everything to one **Power Automate flow**, and ORBIT does the rest.

```
 customer ──► shop website ──► Power Automate flow ──► SharePoint
                 ▲                    │   (Shop_Inbox list, OrbitShop folder)
                 │                    ▼
                 └── catalogue, photos, tracking ◄── ORBIT (staff, signed in)
```

| Who | Does what |
|---|---|
| **ORBIT → Distributions → Online Shop** | products for the web, prices incl. VAT, photos, categories, coupons, settings; **publishes** `OrbitShop/catalog.json` and photos; takes new orders every minute (sales order, stock check, customer, payment), e-mails the customer |
| **ORBIT → Warehouse → Online orders** | pick list → picking (barcode check) → packed → **release to distribution** (delivery note; paid orders get their e-invoice draft) |
| **ORBIT → Distributions → Web deliveries** | assign driver, vehicle, day, time slot → route sheet → on the way → delivered (cash collected) / not delivered; drivers use **📱 My deliveries** on their phone and can share their location |
| **ORBIT → Finance → Web payments** | bank transfers (view the customer's proof, confirm → receipt), card payments, cash per driver, refunds |
| **The flow** | gives the website the catalogue, photos and tracking files; writes each order / proof / cancel request into the `Shop_Inbox` list; talks to the card company |

New orders are picked up while **any** ORBIT user has one of the four shop pages open (every minute). Keep ORBIT open on one PC in the shop or warehouse during working hours, or orders wait in `Shop_Inbox` until someone opens a shop page.

## 0 · Before you have the Premium licence (works today)

**Why a flow at all?** Your data lives in SharePoint, and SharePoint only answers people signed in with your company's Microsoft accounts. Website customers are anonymous. Something has to sit in between that is signed in to SharePoint *and* accepts requests from the public internet — that is the flow's **"When an HTTP request is received"** trigger, which is a Premium feature. It gives the website the products and photos, saves orders into `Shop_Inbox`, serves the tracking pages, receives transfer proofs, and holds the card company's secret keys.

Until then the shop runs **not connected** (ORBIT → Online Shop → 🔌 Website connection):

| Part | Without the flow |
|---|---|
| Products, prices, photos, stock, order tracking | **Automatic through GitHub**: the shop website is inside the ORBIT repository (`erp/shop/` → `https://orbit.alnajjar.in/erp/shop/`). In **Website connection → Website on GitHub** enter the owner, repository and a fine-grained token (this repository only, *Contents: Read and write*). ORBIT then commits `erp/shop/data/` itself — catalogue, photos and tracking files — after each publish, after orders change and every 5 minutes (one commit; GitHub Pages updates about a minute later). The token stays only in that browser. Without a token: **📦 Download website files** and upload the `data/` folder by hand. |
| Orders | Checkout ends with **"Send my order on WhatsApp"** (or e-mail). The message carries a code (`ORBIT1:…`). Staff paste it in **Online Shop → 📋 Order from WhatsApp / e-mail** — from there it is exactly the same: sales order, stock, warehouse, delivery, finance, e-invoice. |
| Payment | Cash on delivery and bank transfer (proof by WhatsApp; Finance confirms in Web payments). Card payment is hidden until connected. |
| Customer updates | The website's tracking page (order number + phone), fed through GitHub; the **💬 WhatsApp customer** button on each order; ORBIT's e-mails. |

The same tab holds the **set-up model for later**: a checklist (some steps tick themselves), the details to fill in (licence owner, environment, flow name, flow address, website host, card merchant ID — never the secret keys), **🔌 Test the connection**, **🖨 Print the set-up sheet**, and **Switch to "Connected"** (allowed only after the test passes).

**No-Premium alternative:** the ORBIT server (Node, in your package) can do the flow's job on a small hosting plan — ask when you want that route.

---

## 1 · ORBIT (10 minutes)

1. Inventory: the items exist, with stock in the warehouse you ship from.
2. Finance: the chart of accounts is set up (receipts are posted to it).
3. **Distributions → Online Shop → Settings → 🛠 Set up the shop lists.** This creates
   `Shop_Settings, Shop_Products, Shop_Categories, Shop_Coupons, Shop_Inbox, Shop_Orders`.
4. Fill in the settings (shop name EN/AR, order prefix, delivery fees, payment methods, bank details, the accounts for card / bank / cash) → **Save**.
5. **Categories** → add them → Save.
6. **Products → ＋ Add all items (hidden)**, then open each product: name EN/AR, category, price incl. VAT, photos, description (🤖 Write with AI), **Show on the website = Yes** → **Save & publish**.

ORBIT writes the public files into the site's **Documents** library, folder **OrbitShop**:

```
OrbitShop/catalog.json        products, prices, availability, delivery & payment options (no costs, no customers)
OrbitShop/img/…               product photos (1000 px) and t-… small versions (420 px)
OrbitShop/track/<id>.json     one per order: status and timeline only (no address); <id> = hash of order no. + phone
OrbitShop/proofs/…            bank-transfer proofs (never served to the website)
```

## 2 · The flow (Power Automate, Premium licence for the HTTP trigger)

Create an **Instant cloud flow → "When an HTTP request is received"**.
* *Who can trigger the flow*: **Anyone**. Method: leave empty (GET for pictures, POST for the rest).
* Save once to get the **HTTP URL**. Put it in **ORBIT → Online Shop → Settings → Flow address** and in the website's **config.js** (`api: '…'`).

Every **Response** action below has these headers:
`Access-Control-Allow-Origin: *` and `Content-Type: application/json` (pictures: `image/webp`).

### 2.1 Read the request

1. **Compose `Q`** = `coalesce(triggerOutputs()?['queries']?['a'], '')` (pictures are asked with `?a=img&f=name`).
2. **Condition** `outputs('Q')` is equal to `img` →
   * **Yes**: Condition `f` must be safe: `and(not(contains(triggerOutputs()?['queries']?['f'], '/')), not(contains(triggerOutputs()?['queries']?['f'], '..')))`
     → SharePoint **Get file content using path**: `/Shared Documents/OrbitShop/img/@{triggerOutputs()?['queries']?['f']}`
     → **Response** 200, headers `Content-Type: image/webp`, `Cache-Control: public, max-age=604800`, body = file content. (Run-after *failed* → Response 404.)
   * **No**: continue with 2.2.

### 2.2 Messages (POST, the body is JSON sent as text)

3. **Compose `B`** =
   `if(startsWith(string(triggerBody()), '{"$content'), json(base64ToString(json(string(triggerBody()))?['$content'])), json(string(triggerBody())))`
4. **Switch** on `outputs('B')?['a']`:

| Case | Actions |
|---|---|
| `catalog` | Get file content using path `/Shared Documents/OrbitShop/catalog.json` → Response 200, header `Cache-Control: public, max-age=120`, body = file content |
| `track` | Condition: `length(outputs('B')?['id'])` = 32 → Get file content using path `/Shared Documents/OrbitShop/track/@{outputs('B')?['id']}.json` → Response 200. Run-after *failed* / condition false → Response **404** |
| `order`, `cancel`, `paid` | SharePoint **Create item** in `Shop_Inbox`: Title = `outputs('B')?['no']`, Kind = `outputs('B')?['a']`, Ref = `outputs('B')?['no']`, Payload = `string(outputs('B'))` → Response 200 `{"ok":true}` |
| `proof` | SharePoint **Create file** in `/Shared Documents/OrbitShop/proofs`, name `@{outputs('B')?['no']}-@{utcNow('yyyyMMddHHmmss')}.@{if(contains(outputs('B')?['type'],'pdf'),'pdf','jpg')}`, content `base64ToBinary(outputs('B')?['data'])` → Create item in `Shop_Inbox`: Kind = `proof`, Ref = no, Payload = `{"a":"proof","no":"…","phone":"…","file":"<file name above>","type":"…"}` (no picture data in the list) → Response 200 |
| `pay` | see 2.3 — returns `{"url": "<payment page>", "ref": "<payment id>"}` |
| `paycheck` | see 2.3 — returns `{"paid": true/false, "amount": 123.45, "state": "…"}` |
| Default | Response 400 |

Tip: keep **Settings → Run only users / concurrency** default, and turn on **Settings → Secure inputs/outputs** for the `pay` and `paycheck` actions so card keys never show in the run history.

### 2.3 Card payments (keys stay in the flow, never in the website)

The website sends `pay` with `no, amount, currency, email, name, ok, cancel` (return addresses).
ORBIT checks the amount again with `paycheck` before anything is prepared — a wrong amount is flagged "Paid amount differs".

**Stripe** (Checkout Sessions)
* `pay`: HTTP POST `https://api.stripe.com/v1/checkout/sessions`, header `Authorization: Bearer sk_live_…`, `Content-Type: application/x-www-form-urlencoded`, body:
  `mode=payment&success_url=@{encodeUriComponent(outputs('B')?['ok'])}&cancel_url=@{encodeUriComponent(outputs('B')?['cancel'])}&client_reference_id=@{outputs('B')?['no']}&customer_email=@{encodeUriComponent(outputs('B')?['email'])}&line_items[0][quantity]=1&line_items[0][price_data][currency]=aed&line_items[0][price_data][unit_amount]=@{int(mul(float(outputs('B')?['amount']),100))}&line_items[0][price_data][product_data][name]=Order @{outputs('B')?['no']}`
  → Response `{"url": "@{body('HTTP')?['url']}", "ref": "@{body('HTTP')?['id']}"}`
* `paycheck`: HTTP GET `https://api.stripe.com/v1/checkout/sessions/@{outputs('B')?['ref']}` (same key) → Response
  `{"paid": @{equals(body('HTTP')?['payment_status'],'paid')}, "amount": @{div(float(body('HTTP')?['amount_total']),100)}, "state": "@{body('HTTP')?['payment_status']}"}`

**Network International (N-Genius)** — sandbox host `api-gateway.sandbox.ngenius-payments.com`, live `api-gateway.ngenius-payments.com` (confirm with your account manager)
* token: HTTP POST `https://<host>/identity/auth/access-token`, headers `Authorization: Basic <your API key>`, `Content-Type: application/vnd.ni-identity.v1+json` → `access_token`
* `pay`: HTTP POST `https://<host>/transactions/outlets/<outlet ref>/orders`, headers `Authorization: Bearer <token>`, `Content-Type` and `Accept`: `application/vnd.ni-payment.v2+json`, body
  `{"action":"PURCHASE","amount":{"currencyCode":"AED","value":@{int(mul(float(outputs('B')?['amount']),100))}},"merchantOrderReference":"@{outputs('B')?['no']}","emailAddress":"@{outputs('B')?['email']}","merchantAttributes":{"redirectUrl":"@{outputs('B')?['ok']}","cancelUrl":"@{outputs('B')?['cancel']}"}}`
  → Response `{"url": "@{body('HTTP')?['_links']?['payment']?['href']}", "ref": "@{body('HTTP')?['reference']}"}`
* `paycheck`: (token) HTTP GET `https://<host>/transactions/outlets/<outlet ref>/orders/@{outputs('B')?['ref']}` → paid when `_embedded.payment[0].state` is `PURCHASED` or `CAPTURED`; amount = `amount.value / 100`.

**Telr** (Hosted Payment Page)
* `pay`: HTTP POST `https://secure.telr.com/gateway/order.json`, JSON body
  `{"method":"create","store":<store id>,"authkey":"<auth key>","framed":0,"order":{"cartid":"@{outputs('B')?['no']}","test":"0","amount":"@{outputs('B')?['amount']}","currency":"AED","description":"Order @{outputs('B')?['no']}"},"return":{"authorised":"@{outputs('B')?['ok']}","declined":"@{outputs('B')?['cancel']}","cancelled":"@{outputs('B')?['cancel']}"},"customer":{"email":"@{outputs('B')?['email']}"}}`
  → Response `{"url": "@{body('HTTP')?['order']?['url']}", "ref": "@{body('HTTP')?['order']?['ref']}"}`
* `paycheck`: same address, body `{"method":"check","store":<store id>,"authkey":"<auth key>","order":{"ref":"@{outputs('B')?['ref']}"}}` → paid when `order.status.code` is `3`; amount = `order.amount`.
  Telr also offers a newer REST API — use whichever your Telr account is enabled for; only the two flow cases change.

Test with the card company's **test mode** first (test keys / `"test":"1"`), then switch to live keys.

## 3 · The website

The shop is the `shop/` folder of ORBIT (`erp/shop/` in the repository — nothing extra to upload). For another client, copy that folder to their host. Set `api` in **config.js** to the flow URL.
With `api` empty the shop runs not connected (section 0) from the `data/` folder; with no `data/` folder it shows the **demo/** products and keeps orders in the browser.

Check: **ORBIT → Online Shop → Settings → 🔌 Test the connection** should say *Connected … N products*.

## 4 · Good to know

* **Prices** on the website include VAT. ORBIT re-prices every order with the prices the customer saw (the last 8 catalogues are kept), so later price changes do not affect placed orders; totals match the e-invoice to the fils.
* **Stock**: the website shows *in stock / only N left / out of stock*, refreshed at every publish (after each order batch and every 15 minutes while Online Shop is open). Orders are checked again against real stock; short ones wait in *To review*.
* **Unpaid** bank / card orders are cancelled after the days set in Settings (their stock is released).
* **Customers** become E-Invoicing customers (found again by phone or e-mail) with a sales account tagged *web*.
* **E-invoice drafts**: prepaid orders at release, cash-on-delivery orders when delivered. Send them in E-Invoicing as usual.
* **Accounts**: customers can save their details and see their orders on their device; on another device they track an order with its number + phone number.
* **Spam**: anyone can post to the flow; ORBIT rejects invalid orders (they show under *Messages that could not be read*). Use the flow's trigger conditions or a short concurrency limit if needed.
