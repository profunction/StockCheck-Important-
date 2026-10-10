#!/usr/bin/env python3
"""Build products/<slug>/index.html for each SuXin app.

The header, mobile drawer and footer are copied from index.html (with links
rewritten for the deeper folder), so edit those there and re-run:

    python3 scripts/build_products.py
"""
import hashlib
import html
import os
import re

# The pages live in web/ (served at the site root); this script is site/www/.
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "web")
SITE = "https://stockcheck-fb58e.web.app"
UP = "../../"

ARROW = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">'
         '<path d="M5 12h13M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"></path></svg>')


def mock(url, title, status, kpis=None, head=None, rows=None, foot=None):
    """One browser-window mock: KPI tiles + table + footer row."""
    st_cls, st_txt = status
    out = ['<div class="mock">',
           f'<div class="mock-bar"><span class="dots"><i></i><i></i><i></i></span><span class="url">{url}</span></div>',
           '<div class="mock-body">',
           f'<div class="mock-row"><span class="mock-h">{title}</span><span class="st {st_cls}">{st_txt}</span></div>']
    if kpis:
        out.append('<div class="kpis">' + ''.join(
            f'<div class="kpi{" gold" if i == 0 else ""}"><b>{v}</b><span>{k}</span></div>'
            for i, (v, k) in enumerate(kpis)) + '</div>')
    if head:
        th = ''.join(f'<th{" class=\"text-right\"" if i == len(head) - 1 else ""}>{h}</th>' for i, h in enumerate(head))
        tr = ''.join('<tr>' + ''.join(
            f'<td{" class=\"text-right\"" if i == len(r) - 1 else ""}>{c}</td>' for i, c in enumerate(r)) + '</tr>'
            for r in rows)
        out.append(f'<table class="tbl"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>')
    if foot:
        out.append(f'<div class="mock-row border-t border-(--line) pt-[0.6rem]"><span class="mono dim">{foot[0]}</span>'
                   f'<span class="badge">{foot[1]}</span></div>')
    out.append('</div></div>')
    return ''.join(out)


def bin_(t):
    return f' <span class="bin">{t}</span>'


PRODUCTS = [
    dict(
        slug="pos", tag="POS", name="SuXin POS",
        tagline="Counter checkout for shops, supermarkets and restaurants.",
        body="Pick the checkout that fits the shop: F&amp;B with tables and kitchen slips, a supermarket scan lane, "
             "or retail with photos and categories. All three sell from the same items, stock, receipts and reports, "
             "and the till keeps working when the internet doesn't.",
        who="Cashiers, shop managers and owners of restaurants, kopitiam, mini-markets and retail shops",
        screens=[
            ("Register", mock("SuXin POS", 'Till 1 · <span class="code">Ipoh Shop</span>', ("ok", "Shift open"),
                              [("RM 47.43", "Total"), ("3", "Items"), ("0", "Open tickets")],
                              ["Item", "Qty", "Price", "Amount"],
                              [["Malt Drink 1kg", "1", "15.90", "<b>15.90</b>"],
                               ["Ground Coffee 500g", "1", "12.90", "<b>12.90</b>"],
                               ["Rice 5kg", "1", "16.90", "<b>16.90</b>"],
                               ['<span class="sk">SST 6%</span>', "", "", "1.73"]],
                              ("Subtotal 45.70 · scan or type a barcode", "Charge RM 47.43"))),
            ("Checkout modes", mock("SuXin POS", "Checkout mode", ("info", "Supermarket"),
                                    None, ["Mode", "Built for", "Highlights"],
                                    [["<b>F&amp;B</b>", "Restaurants, cafés, kopitiam", "Tables, add-ons, kitchen slips"],
                                     ["<b>Supermarket</b>", "Mini-markets, grocers", "Always-on scan, 3× qty, weighing"],
                                     ["<b>Retail</b>", "Clothing, hardware, phones", "Photos, members, NFC"]],
                                    ("Same items, stock and reports in every mode", "Save"))),
            ("Shift close", mock("SuXin POS", 'Shift · <span class="code">Till 1</span>', ("warn", "Counting"),
                                 [("RM 1,273.16", "Sales"), ("35", "Receipts"), ("1", "Voided")],
                                 ["Payment", "Expected", "Counted"],
                                 [["Cash", "RM 642.30", "<b>RM 642.30</b>"],
                                  ["Card", "RM 418.56", "<b>RM 418.56</b>"],
                                  ["E-wallet", "RM 212.30", "<b>RM 212.30</b>"]],
                                 ("Cash drawer counted at open and close", "Close shift"))),
        ],
        features=[
            ("Three checkout modes", ["F&amp;B: tables, open tickets, add-ons (sweetness, extra egg)",
                                      "Kitchen slips, dine-in / takeaway / delivery, service charge",
                                      "Supermarket: big scan box, type 3* then scan for 3 pieces",
                                      "Retail: tap item photos, categories, barcodes and NFC"]),
            ("At the counter", ["Discounts, members and points", "Hold and recall bills",
                                "Weighed items and quick keys for bread or vegetables",
                                "Keeps selling offline; uploads when the internet is back"]),
            ("Back office", ["Sales by item, category, staff, payment method, add-on",
                             "Shift records with cash-drawer count",
                             "Tax and service charge, receipts, branches",
                             "QR table ordering, LHDN e-invoice, API access tokens"]),
        ],
        desks=[("Cashiers", "A fast till that guides them with a built-in ▶ tutorial on every screen."),
               ("Shop managers", "Shifts, cash counts, discounts and staff, branch by branch."),
               ("Owners", "Every sale lands in SuXin Every Data and SuXin Books without re-typing."),
               ("Kitchen", "Orders print straight to the kitchen with their add-ons.")],
    ),
    dict(
        slug="barcode-scan", tag="SCAN", name="SuXin Barcode Scan",
        tagline="Scan to count stock, on a phone or a computer.",
        body="Walk the shelves with a phone camera or a barcode scanner and count as you go. Counts are saved per "
             "branch or warehouse, and any differences show up in SuXin WMS so you can see what the count found.",
        who="Shop staff and storekeepers doing stock-takes, in shops or in the warehouse",
        screens=[
            ("Count", mock("SuXin Barcode Scan", 'Stock-take · <span class="code">Ipoh Shop</span>', ("info", "Counting"),
                           [("9", "Items counted"), ("2", "Differences"), ("0", "Not found")],
                           ["Barcode", "Item", "System", "Counted"],
                           [['<span class="sk">2909000000028</span>', "Rice 5kg", "20", "<b>20</b>"],
                            ['<span class="sk">2909000000059</span>', "Bread", "15", "<b>13</b>"],
                            ['<span class="sk">2909000000042</span>', "Eggs (10)", "39", "<b>40</b>"]],
                           ("Phone camera or scanner", "Finish count"))),
            ("Differences in WMS", mock("SuXin WMS", "What the count found", ("warn", "2 differences"),
                                        None, ["Item", "Expected", "Counted", "Diff."],
                                        [["Bread", "15", "13", '<span class="st warn">−2</span>'],
                                         ["Eggs (10)", "39", "40", '<span class="st ok">+1</span>'],
                                         ["Rice 5kg", "20", "20", '<span class="st">0</span>']],
                                        ("Adjust stock or recount", "Review"))),
        ],
        features=[
            ("Scan anywhere", ["Phone camera or a USB / Bluetooth scanner", "Works on Android and in the browser",
                               "Search by name when a label is missing"]),
            ("Count per location", ["Head office, warehouse and each shop counted separately",
                                    "See which items have never been counted",
                                    "Recount just the items that differ"]),
            ("Connected", ["Differences land in SuXin WMS", "Same items and barcodes as the POS",
                           "Same email and password as every SuXin app"]),
        ],
        desks=[("Shop staff", "Count the shelves between customers with the phone in their pocket."),
               ("Storekeepers", "Count the warehouse zone by zone without stopping work."),
               ("Managers", "See the differences and decide: adjust or recount."),
               ("Owners", "Trust the stock number on Every Data.")],
    ),
    dict(
        slug="wms", tag="WMS", name="SuXin WMS",
        tagline="Goods in, goods out, across every branch.",
        body="Receive purchase orders, move stock between the warehouse and the shops, and adjust for damaged, expired "
             "or found goods. SuXin WMS knows what's where, what it cost and what to reorder, for one branch or all of them.",
        who="Storekeepers, purchasers and owners running a warehouse or more than one branch",
        screens=[
            ("Home", mock("SuXin WMS", 'Kedai Maju Sdn Bhd · <span class="code">Central Warehouse</span>', ("info", "1 PO to receive"),
                          [("RM 2,129.00", "Stock value (cost)"), ("2", "Low stock"), ("0", "Out of stock")],
                          ["Reorder suggestion", "On hand", "Reorder at", "Buy"],
                          [["Rice 5kg", "20", "20", "<b>+80</b>"],
                           ["Bread", "15", "15", "<b>+25</b>"]],
                          ("PO-261003-0915-MJ · Syarikat Borong Maju", "Create PO"))),
            ("Stock", mock("SuXin WMS", "Stock", ("ok", "9 items"),
                           None, ["Item", "On hand", "In transit", "Value"],
                           [["Malt Drink 1kg", "49", "24", "612.50"],
                            ["Rice 5kg" + ' <span class="st warn">Low</span>', "20", "—", "290.00"],
                            ["Instant Noodles (5)", "60", "30", "252.00"],
                            ["Ground Coffee 500g", "22", "—", "215.60"]],
                           ("Filter: low · out · in transit · expiring · never counted", "Refresh"))),
            ("Purchase order", mock("SuXin WMS", 'PO <span class="code">PO-261003-0915-MJ</span>', ("info", "Ordered"),
                                    [("Syarikat Borong Maju", "Supplier"), ("Central Warehouse", "Deliver to"), ("2", "Lines")],
                                    ["Item", "Qty", "Received"],
                                    [["Rice 5kg", "80", "0"], ["Bread", "25", "0"]],
                                    ("Receive against the PO when it arrives", "Receive"))),
        ],
        features=[
            ("Stock in and out", ["Receiving against purchase orders", "Transfers between locations, with stock in transit",
                                  "Adjustments: damaged, expired, found", "Reservations and returns to supplier"]),
            ("Buying", ["Purchase orders with approval", "Reorder suggestions turned into a PO",
                        "Pinduoduo buying", "Landed-cost calculator and supplier list"]),
            ("Control", ["Head office, warehouse and shops in one list", "Count differences from SuXin Barcode Scan",
                         "Month-end stock", "Activity log of every movement"]),
        ],
        desks=[("Storekeepers", "Receive, transfer and adjust from a phone or a computer."),
               ("Purchasers", "Reorder suggestions and purchase orders in one place."),
               ("Branch managers", "See what's on the way to their shop."),
               ("Owners", "Stock value at cost and low stock, across every branch.")],
    ),
    dict(
        slug="every-data", tag="DATA", name="SuXin Every Data",
        tagline="Today's business, in one place.",
        body="The owner's view of every till, every branch and the warehouse. Sales, receipts, stock and pending "
             "orders on one screen, and it only shows the apps your plan includes.",
        who="Owners and managers who want the day's numbers without going to the shop",
        screens=[
            ("Today", mock("SuXin Every Data", 'Today · <span class="code">Kedai Maju Sdn Bhd</span>', ("ok", "Live"),
                           [("RM 1,273.16", "Sales today"), ("35", "Receipts"), ("RM 36.38", "Avg per sale")],
                           ["Time", "Receipt", "Cashier", "Amount"],
                           [['<span class="sk">02:59</span>', '<span class="sk">261010-025937-DX</span>', "Siti", "<b>38.25</b>"],
                            ['<span class="sk">02:59</span>', '<span class="sk">261010-025937-3U</span>', "Ah Hock", "<b>3.82</b>"],
                            ['<span class="sk">02:59</span>', '<span class="sk">261010-025937-7W</span>', "Siti", "<b>62.37</b>"]],
                           ("1 voided today", "Sales report"))),
            ("Stock & warehouse", mock("SuXin Every Data", "Stock and warehouse", ("info", "From SuXin WMS"),
                                       [("9", "Items in stock"), ("0", "Low stock"), ("0", "Out of stock")],
                                       ["Warehouse", "Count"],
                                       [["Purchase orders to receive", "<b>1</b>"], ["Transfers in transit", "0"],
                                        ["Purchase orders to approve", "0"]],
                                       ("What you see follows your plan", "Open WMS"))),
        ],
        features=[
            ("Sales", ["Today's sales, receipts, average per sale", "Voided receipts",
                       "Latest receipts with the cashier's name", "Reports by item, category, staff, payment"]),
            ("Stock", ["Items in stock and stock value", "Low-stock and out-of-stock counts",
                       "Straight from SuXin POS and SuXin WMS"]),
            ("Warehouse", ["Purchase orders waiting to be received", "Transfers in transit",
                           "Purchase orders waiting for approval"]),
        ],
        desks=[("Owners", "One screen for the whole business, from anywhere."),
               ("Area managers", "Compare branches without phoning each shop."),
               ("Accountants", "Daily sales that match what's in SuXin Books."),
               ("Partners", "A shared view of how the business is doing.")],
    ),
    dict(
        slug="books", tag="BOOKS", name="SuXin Books",
        tagline="E-invoices and accounts, for the owner or the accountant.",
        body="Issue invoices and credit notes, export MyInvois e-invoice files, record money in and out, and get the "
             "P&amp;L, balance sheet, receivables and SST report. Simple enough for the owner, proper double-entry "
             "underneath for the accountant.",
        who="Owners doing their own books, and the accountants they hand them to",
        screens=[
            ("Overview", mock("SuXin Books", 'Overview · <span class="code">2026-10</span>', ("ok", "Up to date"),
                              [("RM 479.00", "Sales this month"), ("RM 379.00", "Profit this month"), ("RM 330.00", "Customers owe us")],
                              ["Quick action", "What it's for"],
                              [["<b>New invoice</b>", "Bill a customer"], ["<b>Receive money</b>", "A customer paid"],
                               ["<b>Supplier bill</b>", "A supplier billed us"], ["<b>Expense</b>", "Rent, utilities, fuel…"]],
                              ("Cash and bank RM 94.90", "Reports"))),
            ("Invoice", mock("SuXin Books", 'Invoice <span class="code">INV-2026-00001</span>', ("ok", "Issued"),
                             [("RM 194.90", "Total"), ("RM 15.90", "Tax"), ("30 d", "Due 2026-11-09")],
                             ["Item", "Qty", "Price", "Disc."],
                             [["Milo 1kg" + bin_("4000 Sales"), "10", "15.90", "10%"],
                              ["Delivery" + bin_("4000 Sales"), "1", "20.00", "—"]],
                             ("MyInvois e-invoice · JSON ready", "Download JSON"))),
            ("Profit & loss", mock("SuXin Books", 'P&amp;L · <span class="code">2026-10-01 – 10</span>', ("ok", "PDF · CSV"),
                                   None, ["Account", "Amount"],
                                   [["4000 Sales", "479.00"], ["Gross profit", "<b>479.00</b>"],
                                    ["6200 Utilities", "(100.00)"], ["<b>Net profit</b>", "<b>379.00</b>"]],
                                   ("Balance sheet · trial balance · ledger · SST", "Print"))),
        ],
        features=[
            ("Sales and e-invoice", ["Invoices, credit notes and debit notes",
                                     "MyInvois e-invoice JSON, then record the LHDN UUID",
                                     "Company TIN, registration, SST and MSIC on every invoice"]),
            ("Money in and out", ["Receive money against invoices", "Pay supplier bills",
                                  "Expenses: rent, utilities, fuel", "Customers and suppliers with balances"]),
            ("Reports and control", ["P&amp;L, balance sheet, trial balance, ledger", "Who owes us (aging) and who we owe",
                                     "SST report, PDF or CSV", "Journal, chart of accounts, period lock"]),
        ],
        desks=[("Owners", "Invoice, get paid and see profit without learning accounting."),
               ("Accountants", "Double-entry journal, chart of accounts, period lock."),
               ("Admin staff", "Record bills, expenses and payments as they come in."),
               ("Customers", "Proper invoices and e-invoices, every time.")],
    ),
]


def grab(h, start, end):
    i = h.index(start)
    return h[i:h.index(end, i) + len(end)]


def relink(fragment, active_slug=None):
    """Rewrite homepage-relative links for products/<slug>/ pages."""
    fragment = re.sub(r'(href|src)="(assets/|products/)', lambda m: f'{m.group(1)}="{UP}{m.group(2)}', fragment)
    fragment = re.sub(r'href="#(?!main)', f'href="{UP}#', fragment)
    if active_slug:
        fragment = fragment.replace(f'href="{UP}products/{active_slug}/"',
                                    f'href="{UP}products/{active_slug}/" aria-current="page"')
    return fragment


def page(p, num, home):
    header = relink(grab(home, '<header class="nav">', '</header>'), p["slug"])
    drawer = relink(grab(home, '<div class="drawer" id="drawer">', '</a>\n</div>'), p["slug"])
    footer = relink(grab(home, '<footer class="foot">', '</footer>'))
    whatsapp = grab(home, '<a class="wa-float"', '</a>')

    others = ''.join(f'<a class="chip" href="{UP}products/{o["slug"]}/"><i class="dot"></i>{o["tag"]} · {o["name"]}</a>'
                     for o in PRODUCTS if o is not p)
    subnav = ''.join(f'<a href="{UP}products/{o["slug"]}/"{" aria-current=\"page\"" if o is p else ""}>{o["tag"]}</a>'
                     for o in PRODUCTS)
    slides = ''.join(f'<div class="car-slide"{"" if i == 0 else " inert"}>{m}<div class="car-cap">{cap}</div></div>'
                     for i, (cap, m) in enumerate(p["screens"]))
    dots = ''.join(f'<button type="button" aria-label="Show {html.escape(cap)}" aria-current="{str(i == 0).lower()}"'
                   f'{" class=\"on\"" if i == 0 else ""}></button>' for i, (cap, _) in enumerate(p["screens"]))
    feats = ''.join(f'<div class="fbox rv{" d" + str(i) if i else ""}"><h4>{t}</h4><ul>' + ''.join(f'<li>{x}</li>' for x in items)
                    + '</ul></div>' for i, (t, items) in enumerate(p["features"]))
    desks = ''.join(f'<div class="fbox rv{" d" + str(i) if i else ""}"><h4>{t}</h4>'
                    f'<p class="text-(length:--fs-sm) text-(color:--tx-2)">{d}</p></div>' for i, (t, d) in enumerate(p["desks"]))
    plain = re.sub(r'<[^>]+>|&amp;', lambda m: '&' if m.group(0) == '&amp;' else '', p["tagline"])

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{p["name"]} — {html.escape(plain)} | SuXin</title>
<meta name="description" content="{html.escape(plain)}"/>
<meta name="theme-color" content="#0B1B2B"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="SuXin"/>
<meta property="og:title" content="{p["name"]}"/>
<meta property="og:description" content="{html.escape(plain)}"/>
<meta property="og:image" content="{SITE}/assets/img/og-image.png"/>
<meta property="og:url" content="{SITE}/products/{p["slug"]}/"/>
<link rel="canonical" href="{SITE}/products/{p["slug"]}/"/>
<link rel="icon" type="image/svg+xml" href="{UP}assets/brand/suxin-mark.svg"/>
<link rel="apple-touch-icon" href="{UP}assets/brand/icon-192.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&amp;family=Inter:wght@400;500;600;700&amp;family=IBM+Plex+Mono:wght@400;500;600&amp;family=Noto+Sans+SC:wght@400;500;700&amp;display=swap"/>
<link rel="stylesheet" href="{UP}assets/site.css"/>
<link rel="stylesheet" href="{UP}assets/suxin.css"/>
<script src="{UP}assets/theme.js"></script>
</head>
<body>
<!-- Generated by site/www/build_products.py; edit there, not here. -->
<div class="site">
<a href="#main" class="skip">Skip to content</a>

{header}

{drawer}

<main id="main">
<div class="page-in">

<section class="phead grid-bg"><span class="glow ora" style="width:400px;height:400px;top:-150px;right:-90px"></span>
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="{UP}">Home</a><span>/</span><a href="{UP}#products">Products</a><span>/</span><span aria-current="page">{p["tag"]}</span></nav>
    <div class="phead-side mt-4">
      <div>
        <span class="badge">Product {num:02d}</span>
        <h1 class="h1 mt-4">{p["name"]}</h1>
        <p class="lead mt-4">{p["tagline"]}</p>
        <p class="muted mt-4 max-w-[60ch]">{p["body"]}</p>
        <div class="hero-cta mt-[1.75rem]">
          <a class="btn btn-primary btn-lg" href="{UP}#start" data-link="signup">Try {p["name"]} free</a>
          <a class="btn btn-ghost btn-lg" href="{UP}#products">All products</a>
        </div>
      </div>
      <div class="card glass">
        <div class="mono dim">Who it's for</div>
        <p class="mt-[0.6rem] font-(family-name:--f-display) text-[1.05rem] font-semibold">{p["who"]}</p>
        <div class="chips mt-[1.1rem]">{others}</div>
      </div>
    </div>
  </div>
</section>

<div class="subnav">
  <div class="wrap subnav-in">
    <a href="{UP}#products">All products</a>{subnav}
    <a class="ml-auto" href="{UP}#start">Start free trial</a>
  </div>
</div>

<section class="sec-tight pt-0">
  <div class="wrap">
    <div class="sec-head rv"><span class="eyebrow">Inside the product</span><h2 class="h2 text-[1.75rem]">Screens from {p["name"]}</h2></div>
    <div class="carousel" role="region" aria-label="{p["name"]} screens" tabindex="0">
      <div class="car-viewport"><div class="car-track">{slides}</div></div>
      <div class="car-nav">
        <div class="car-dots">{dots}</div>
        <div class="flex gap-2"><button type="button" class="btn btn-ghost btn-sm car-prev" aria-label="Previous screen">← Prev</button><button type="button" class="btn btn-ghost btn-sm car-next" aria-label="Next screen">Next →</button></div>
      </div>
    </div>
  </div>
</section>

<section class="sec-tight">
  <div class="wrap">
    <div class="sec-head rv"><span class="eyebrow">Feature breakdown</span><h2 class="h2 text-[1.75rem]">What's in the box</h2></div>
    <div class="grid g3">{feats}</div>
  </div>
</section>

<section class="sec-tight">
  <div class="wrap">
    <div class="sec-head rv"><span class="eyebrow">Who uses it</span><h2 class="h2 text-[1.75rem]">Four people, one system</h2></div>
    <div class="grid g4">{desks}</div>
  </div>
</section>

<section class="sec-tight">
  <div class="wrap">
    <div class="card card-pad-lg rv grid grid-cols-[minmax(0,1.2fr)_auto] items-center gap-[1.75rem] max-[860px]:grid-cols-1">
      <div>
        <h2 class="h2 text-[1.65rem]">Run {p["name"]} on the free trial</h2>
        <p class="muted mt-[0.7rem] max-w-[56ch]">One SuXin account opens every app in your plan. Start with {p["name"]} and add the rest when you're ready.</p>
      </div>
      <div class="band-cta"><a class="btn btn-primary btn-lg" href="{UP}#start">Start free trial {ARROW}</a></div>
    </div>
  </div>
</section>

</div>
</main>

{footer}
{whatsapp}
</div>
<script src="{UP}assets/i18n.js" defer></script>
<script src="{UP}assets/site.js" defer></script>
</body>
</html>
'''


def stamp(doc):
    """Add ?v=<content hash> to CSS/JS links. GitHub Pages lets browsers cache these
    for 10 minutes, so without it a fresh page can load a stale stylesheet or script."""
    def ver(m):
        path = os.path.join(ROOT, "assets", m.group(2))
        digest = hashlib.md5(open(path, "rb").read()).hexdigest()[:8]
        return f'{m.group(1)}{m.group(2)}?v={digest}"'
    return re.sub(r'((?:\.\./)*assets/)((?:site|suxin)\.css|(?:site|i18n)\.js)(?:\?v=[0-9a-f]+)?"', ver, doc)


def main():
    home_path = os.path.join(ROOT, "index.html")
    home = stamp(open(home_path, encoding="utf-8").read())
    with open(home_path, "w", encoding="utf-8") as f:
        f.write(home)
    print("stamped index.html")
    for num, p in enumerate(PRODUCTS, 1):
        out = os.path.join(ROOT, "products", p["slug"], "index.html")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            f.write(stamp(page(p, num, home)))
        print("wrote", os.path.relpath(out, ROOT))


if __name__ == "__main__":
    main()
