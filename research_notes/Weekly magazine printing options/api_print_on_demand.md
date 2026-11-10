# API-capable print-on-demand providers for a weekly ~100-copy magazine (80-150 pp, full color, mailed to individual US addresses)

Notes on method: prices marked "calculator, 2026-11-10" were read directly from each provider's public pricing calculator on 2026-11-10 (quantity 1 unless stated, US destination, generic state/ZIP). "Computed" prices apply a provider's published formula or add its published shipping rate and are labelled as inferences. All prices USD, excluding sales tax.

## 1. Which providers have a public, self-serve print API suitable for magazines or softcover books?

### Takeaway
Three options are self-serve today and fit the job: Lulu Print API (instant keys, sandbox, has a "Magazine" product), RPI Print's Self-Service API (the Blurb/MagCloud parent; softcover books only, US/Canada only, sandbox by default), and Mixam (public API plus print-on-demand "PrintLink", but the account must be approved first). MagCloud is still running (now under RPI Print) and has a no-code "Ship to Group" feature that does the same job without an API. Peecho, Cloudprinter, Bookvault, Gelato and Prodigi have APIs but are a worse fit (price, UK/EU focus, photo-book-only catalogs, or unclear US specs); Printful/Printify, Newspaper Club and PrintNinja do not fit.

### Cited Findings
- **Lulu**: "You have to create an account to start using the Lulu Print API. Your account will automatically receive a client-key and a client-secret." Separate sandbox at `api.sandbox.lulu.com`; sandbox print jobs "will never be forwarded to a real production" — [Lulu Print API docs](https://api.lulu.com/docs/) ([OpenAPI spec](https://api.lulu.com/api-docs/openapi-specs/openapi_public.yml))
- Lulu's API pricing calculator lists product types Print Book, Photo Book, Comic Book, Magazine, Yearbook, Calendar (calculator, 2026-11-10) — [Lulu API Pricing Calculator](https://developers.lulu.com/price-calculator)
- Lulu charges no fee for using the Print API; charges are only for print jobs (manufacturing, shipping, sales tax) — [Lulu API getting started guide](https://assets.lulu.com/media/guides/en/lulu-api-getting-started-guide.pdf)
- **Blurb / RPI Print**: Blurb's print API page is live and mostly self-serve ("Get started" links to a self-service page; "No setup fees. No minimum orders. You only pay for printing and shipping"; free sandbox). It names photo books and trade books, not magazines. Orders ship in unbranded packaging to the US and Canada — [Blurb Print API](https://www.blurb.com/print-api-software)
- The API is branded RPI Print Self-Service API; docs at docs.api.rpiprint.com. Account creation is through a dashboard with no approval step mentioned; new accounts start in Sandbox mode; production orders need a credit card on file — [RPI Getting Started](https://docs.api.rpiprint.com/documentation/getting-started)
- RPI's public catalog (generated 2026-10-14) contains only glue-bound books; "no magazine products, and no product has a saddle-stitched binding" — [RPI product catalog](https://products.api.rpiprint.com/catalog/v1/products.md)
- Blurb launched its print API on 2018-05-15 (older source) — [Blurb press release](https://www.blurb.co.uk/press-releases/2018-05-15)
- **MagCloud is not shut down.** The site is live with a promotion "15% off everything" code 15NOV2026 ending 2026-11-13, footer "© 2026 RPI Print, Inc.", and a working price calculator and checkout shipping estimates — [MagCloud home](https://www.magcloud.com/), [MagCloud pricing calculator](https://www.magcloud.com/formats/pricingcalculator)
- MagCloud became part of Blurb in 2014 under a licence from HP (older source) — [Blurb press release 2014](https://blurb.co.uk/press-releases/2014-05-05)
- MagCloud "Ship to Group": mail the same publication to multiple recipients in one order; create an address group in the MagCloud address book, set quantity per recipient, pick the group at checkout; "all recipients in a group order must receive the same publications in the same quantities"; one transaction covers shipping for each recipient; group orders count toward the bulk discount — [MagCloud FAQ: group orders](https://www.magcloud.com/help/faq/item/1032)
- **Mixam** now sells print on demand: "Use a shareable PrintLink, connect Shopify, or integrate via Mixam's Print API"; "We automatically print, pack, and ship every order directly to your customer"; "No revenue share or service fees"; products include magazines, zines, booklets — [Mixam Print on Demand](https://mixam.com/print-on-demand)
- Mixam Public API: "you must have a Mixam account to access the API. Once your account is approved, you will need a JSON Web Token" — [Mixam Public API docs](https://mixam.com/documentation/api/public)
- A March 2025 maker's guide says Mixam PrintLink "does not allow for integrations to feed into it" and has no bulk upload with different shipping addresses in one order (older; predates the current POD/API page wording) — [Near Future Laboratory production resources](https://nearfuturelaboratory.com/production/production-resources)
- A third-party integration page describes Mixam's Public API as OpenAPI v3, approval-gated, JWT-authed, labelled beta — [Polotno: Mixam integration](https://polotno.com/sdk/product/integrations/mixam)
- **Peecho**: Print API is "free to use", no minimum order quantities, 30+ countries of partner printers; the page offers "Get early access" / "Contact us" rather than describing instant self-serve keys — [Peecho Print API](https://www.peecho.com/print-api)
- **Cloudprinter**: RESTful JSON print API with real-time product and shipping quotes; magazines offered perfect bound and saddle stitched; "Create free account" sign-up — [Cloudprinter magazines](https://www.cloudprinter.com/products/magazine-print-online-worldwide)
- **Bookvault**: UK printer ("Shipped Worldwide from the UK" on the home page) with an API and Shopify/Wix/WooCommerce/Payhip/Kickstarter integrations; title setup fee £19.95 on the free plan; home page showed "an outage of some services" on 2026-11-10 — [Bookvault](https://bookvault.app/)
- Bookvault title setup fee is "£19.95 or $24.95 per title" on the free plan (free on the £89.95/month Pro plan) — [Bookvault pricing](https://bookvault.app/cost-to-print-your-book/)
- **Gelato**: API terms list "brochures, booklets ... catalogues" among products, but product pages found are photo books only (softcover/hardcover, 30-200 pages) — [Gelato API terms](https://www.gelato.com/au/legal/api-terms), [Gelato photo books](https://www.gelato.com/products/travel-photo-books)
- **Prodigi**: API with sandbox and live keys; book products are photo books (base price includes the first 24 pages; `pageCount` required above that); no magazine or perfect-bound softcover product described — [Prodigi print API FAQ](http://www.prodigi.com/faq/print-api/)
- **Printful / Printify**: listings describe journals and notebooks, not magazines or softcover books with custom interiors (secondary source) — [OJ Digital Solutions: POD journals](https://ojdigitalsolutions.com/print-on-demand-journals/)
- **Newspaper Club**: products are four newsprint formats (Broadsheet 2-40 pp, Tabloid 4-64, Midi 16-64, Mini 16-64); no perfect-bound product and no API mentioned; "From our press to your door in 2-8 working days" — [Newspaper Club](https://www.newspaperclub.com/)
- Newspaper Club ships all products from the UK (older source, Product Hunt thread) — [Product Hunt: Newspaper Club](https://www.producthunt.com/products/newspaper-club)
- **PrintNinja**: offset; perfect-bound production 2-3 weeks, optional physical proof adds 1-2 weeks, standard international delivery 6-8 weeks; minimum 250 units for perfect bound — [PrintNinja turnaround times](https://printninja.com/turnaround-times/)

### Inferences
- Ranked by fit for "start within 1-2 weeks, API-driven, US single-copy mailing": (1) RPI Print Self-Service API, (2) Lulu Print API, (3) Mixam POD/API if the account is approved quickly; MagCloud Ship to Group is the best no-API fallback.
- Newspaper Club (max 64 pages, newsprint, UK), PrintNinja (offset, weeks, 250 minimum), Printful/Printify (no magazine product) can be ruled out.
- Gelato and Prodigi can only do this as a "photo book", which is the wrong product (30-200 page photo paper books priced for photo gifts).

### Gaps
- Mixam: how long API account approval takes, and whether the API's order endpoint supports print-on-demand single copies to arbitrary addresses at POD prices (the OpenAPI schema lists "PrintLink", "Mailing Lists" and a `PRINT_ON_DEMAND` quote type, but I did not read those endpoint definitions).
- Peecho: whether API credentials are issued instantly on sign-up; the API reference page did not render for me.
- Whether MagCloud still has any API: I found no mention of one on the current site.
- Printful/Printify: I did not check their catalogs directly; the "no magazines" conclusion rests on secondary listings.
- Gelato API docs returned HTTP 403, so I could not confirm whether a brochure/booklet product is orderable by API in the US.

## 2. Bindings, page counts, paper stocks, trim sizes, color tiers, and print quality reputation

### Takeaway
At 80-150 pages every provider means perfect binding (saddle stitch tops out at 48-100 pages). The main quality split is Lulu "Standard" vs "Premium" color (premium costs about 2.5-3x), RPI's 100 lb coated "Premium" papers vs 70 lb uncoated, MagCloud's 80 lb text on HP Indigo, and Mixam's choice of 70/80/100 lb coated or uncoated stock with PUR binding. Review evidence is thin and mostly anecdotal: Lulu premium and Blurb premium are rated well, Lulu standard color poorly, MagCloud "flimsy" by one 2026 zine maker, Mixam mostly positive with some complaints on uncoated paper.

### Cited Findings
- **Lulu Magazine product** (calculator, 2026-11-10): sizes A4 and US Letter only; binding Perfect Bound or Saddle Stitch; interior Premium Black & White or Premium Color only; paper 70# White Coated only; cover Glossy or Matte; page count 4-800 overall, perfect bound 32-800; saddle stitch showed "Option not available" at 100 pages; SKU `0850X1100.FC.PRE.PB.070CW460.MIX` — [Lulu API Pricing Calculator](https://developers.lulu.com/price-calculator)
- **Lulu Print Book product** (calculator, 2026-11-10): bindings Perfect Bound, Coil Bound, Saddle Stitch, Case Wrap, Linen Wrap; interior Premium B&W, Standard B&W, Premium Color, Standard Color; paper 60# Cream uncoated, 60# White uncoated, 80# White coated; perfect bound 32-800 pages; many trim sizes including US Trade 6x9 and US Letter — [Lulu API Pricing Calculator](https://developers.lulu.com/price-calculator)
- Lulu product codes are built from trim, color (BW/FC), quality (STD/PRE), binding, paper, finish, e.g. `0600X0900.FC.STD.PB.080CW444.GXX`; the old 27-character non-dotted format stops being supported 2027-02-01 — [Lulu Print API docs](https://api.lulu.com/docs/)
- **RPI Print (Blurb) Self-Service API**: softcover, hardcover ImageWrap, hardcover dust jacket; matte or gloss cover; papers White Uncoated 70 lb, Premium Gloss 100 lb, Premium Dull 100 lb, Premium Eggshell 100 lb; 27 trim sizes from 5x5 to 12.5x10.625 in, including 5.5x8.5, 6x9, 7x10, 8x10, 8.5x11 — [RPI Self-Service API](https://www.rpiprint.com/products-services/print-apis/self-service)
- RPI softcover page ranges (catalog generated 2026-10-14): 100 lb gloss 20-550 pages, 100 lb dull 20-502, 100 lb eggshell 20-346, 70 lb uncoated full bleed 24-564, 70 lb uncoated no bleed 24-672; step 2; all "Glue Bound (Standard)"; covers 10PT gloss or matte. 6x9 softcover is offered only on 70 lb uncoated; 8x10 and 8.5x11 softcover are offered on all four papers — [RPI product catalog](https://products.api.rpiprint.com/catalog/v1/products.md)
- **Blurb magazine** (web product, not confirmed in the API): one premium option, 8.5x11 in, perfect bound, semi-gloss cover, "Prices start at $7.00 for one copy of a 20-page magazine", volume discounts at 10+ copies — [Blurb magazine](https://www.blurb.com/magazine)
- **MagCloud** bound formats: Digest 5.25x8.25, Small Square 8x8, Magazine 8.25x10.75 (portrait or landscape), Large Square 12x12, Tabloid 11x14 and 17x11; saddle stitch and perfect binding on digest/8x8/magazine; wire-o only on the larger formats — [MagCloud pricing calculator](https://www.magcloud.com/formats/pricingcalculator)
- MagCloud page limits: saddle stitch 8-100 pages (multiple of 4); perfect binding 24-384 pages (even); wire-o 8-90 — [MagCloud FAQ: page counts](https://www.magcloud.com/help/faq/item/1004)
- MagCloud paper: perfect binding uses 80# text interior and 80# cover; saddle stitch uses 100# text (8-16 pp), 80# text (20-60 pp), 60# text (64-100 pp); covers are UV coated; FSC-certified — [MagCloud FAQ: paper](https://www.magcloud.com/help/faq/item/1002)
- MagCloud prints "on demand in full color, with a full bleed" on HP Indigo digital presses — [MagCloud FAQ: printing](https://www.magcloud.com/help/faq/item/1124)
- **Mixam magazines** (calculator, 2026-11-10): sizes include Digest 5.5x8.5 and Letter 8.5x11 plus custom sizes; color or grayscale; coated (satin, gloss) or uncoated; 70 lb, 80 lb, 100 lb text; binding Staple (8-96 pages at Letter), Perfect (PUR) (16-800 pages), Wire-O, Spiral; optional separate cover (+4 pages). Quotes named the press: "Printed on an Indigo 7600" / "Indigo 12000" for short page counts and "Printed on a Canon iX" for 100-152 pages, all labelled "Standard Quality Digital Printing" — [Mixam magazines](https://mixam.com/magazines)
- Mixam API catalogue lists binding types STAPLED, PUR, CASE, WIRO, LOOP, SMYTH_SEWN, COIL; laminations matt, gloss, soft-touch, spot UV; silk/gloss/uncoated/recycled stocks from 80 to 450 gsm — [Mixam Public API docs](https://mixam.com/documentation/api/public)
- **Peecho magazines**: perfect binding only; 20-500 pages; 115 gsm silk-coated interior; 250 gsm laminated softcover, matte or glossy; sized to the file's aspect ratio (A4, A5, US Letter etc.); HP Indigo — [Peecho magazines](https://www.peecho.com/products/magazines)
- **Cloudprinter magazines**: perfect bound and saddle stitched; sizes 105x148 mm to 216x279 mm; gloss, matte or soft-touch finishes; page ranges and paper weights not stated on the product page — [Cloudprinter magazines](https://www.cloudprinter.com/products/magazine-print-online-worldwide)
- **Bookvault**: bindings include paperback, hardback, wiro, spiral, saddle stitched (UK "from" prices: paperback £1.17, saddle stitched £0.49) — [Bookvault](https://bookvault.app/)
- **Gelato**: softcover photo books in 5.5x5.5, 8x8 and 8x11 in — [Gelato blog](https://www.gelato.com/au/blog/how-many-photos-in-a-photo-book)
- Quality, Lulu: in a 2016 side-by-side test, Lulu's standard color print was "one of the worst I saw" while the premium print was "one of the best prints I received" (old source, single tester) — [Visualizing Architecture: Battle of POD printers 2016](https://visualizingarchitecture.com/battle-of-p-o-d-printers-2016/)
- Quality, Blurb: the same 2016 test found Blurb's economy magazine had "the worst colors out of all of the books tested" while its premium magazine and trade book were among the best (old source; Blurb's site now lists only a premium magazine) — [Visualizing Architecture: Battle of POD printers 2016](https://visualizingarchitecture.com/battle-of-p-o-d-printers-2016/)
- Quality, MagCloud vs Blurb: an April 2026 zine maker's post says switching from MagCloud to Blurb gave heavier, better paper with reproduction at least as good, and that MagCloud magazines felt flimsy by comparison (one person's experience) — [boats16 blog, "Zine vs Zine"](https://boats16.blogspot.com/2026/04/zine-vs-zine.html)
- Quality, MagCloud: a photography forum user reported a first run that was fine and a second that was washed out (anecdote on consistency) — [PentaxForums thread](https://www.pentaxforums.com/forums/32-digital-processing-software-printing/462884-magazine-format-printing-post5856304.html)
- Quality, Blurb: Trustpilot includes 2026 complaints of flat, low-contrast images alongside generally positive ratings — [Trustpilot: Blurb](https://nl-be.trustpilot.com/review/blurb.co.uk)
- Quality, Mixam: Mixam's site shows a Trustpilot score of 4.4 from 5,955 reviews; recent reviews shown praise print quality and speed, with one 3-star report of a production error on brochures — [Mixam Print on Demand](https://mixam.com/print-on-demand)
- Quality, Mixam: Trustpilot reviewers praise color reproduction and quality control; negatives include a 1-star "very poor print result" for zines on uncoated paper and blurry text under soft-touch lamination — [Trustpilot: Mixam](https://ca.trustpilot.com/review/mixam.com?page=3)
- Mixam says print experts manually check files before printing — [Mixam Print on Demand](https://mixam.com/print-on-demand)
- Quality, Peecho: Trustpilot reviewers flag high cost for single-copy orders — [Trustpilot: Peecho](https://www.trustpilot.com/review/peecho.com?page=5)

### Inferences
- A 6x9 "journal" size is cheapest everywhere but on RPI it is only available on 70 lb uncoated paper; a coated-paper magazine look on RPI means 8x10 or 8.5x11.
- Lulu's "Magazine" product is effectively the premium-color US Letter book on a 70# coated sheet; Lulu's cheaper route is the Print Book product in Standard Color on 80# coated, which is the tier with the weakest quality reputation.
- Mixam offers the widest paper and finish control and is the only one here quoting specific presses; at 100+ pages its quotes moved from HP Indigo to a Canon inkjet press, which may look different from its short-run Indigo samples.
- MagCloud and the RPI API are the same company and probably the same plants, but the products differ (MagCloud: 80 lb text magazine; RPI API: 100 lb coated book).

### Gaps
- No recent (2025-2026) independent side-by-side comparison of these services for magazines was found; Reddit threads did not surface in search. The best comparative test found is from 2016.
- Lulu standard vs premium color: I did not find Lulu's current description of the press/process difference.
- Blurb magazine page limits and paper weight were not stated on the product page; whether the Blurb "magazine" SKU can be ordered through the RPI API is unconfirmed (the public catalog suggests not).
- Bookvault US facility: which bindings and color tiers are available there. A search snippet suggested saddle stitch double-sided printing is UK only, but I could not open the page.
- Cloudprinter page ranges and paper weights for magazines.

## 3. Production time, shipping speed, and fastest "file submitted to copy in hand"

### Takeaway
No provider found can put a proof in hand in 1-3 days. Realistic best cases are about 4 business days (Mixam with next-day air; MagCloud with FedEx overnight; RPI Rush) and about 6-9 business days on standard shipping from RPI or Mixam; Lulu is slowest (its own estimates are 5-8 business days on Express and 11-14 on Mail). For a weekly issue, standard-shipping delivery windows of 1-3 weeks mean issues will overlap in transit.

### Cited Findings
- **Lulu** delivery estimates including production, 1 copy to a US address (calculator, 2026-11-10): Mail 11-14 business days; Ground Business / Ground Home 9-12; Priority Mail 9-12; Expedited 6-9; Express 5-8; all listed as trackable — [Lulu API Pricing Calculator](https://developers.lulu.com/price-calculator)
- Lulu: "For orders under 100 units, we expect 3-5 days in production before shipment"; higher quantities may take an extra day — [Lulu API help center](https://help.api.lulu.com/en/support/solutions/folders/64000234922)
- Lulu: "We generally estimate 3-5 business days from the time of ordering to print, bind, and package a paperback order"; production time increases late in the year — [Lulu getting started guide](https://assets.lulu.com/media/guides/en/lulu-getting-started-guide.pdf)
- Lulu API has a mandatory `production_delay` of 60 to 2,880 minutes before a paid job goes to production — [Lulu Print API docs](https://api.lulu.com/docs/)
- Lulu `MAIL` level: "Slowest ship method. Depending on the destination, tracking might not be available" — [Lulu Print API docs](https://api.lulu.com/docs/)
- **RPI Print API**: production is 4 business days for Standard and Expedited and 3 business days for Rush, counted from the day the printer receives the order (Pacific time); not guaranteed — [RPI shipping docs](https://docs.api.rpiprint.com/documentation/shipping), [RPI orders docs](https://docs.api.rpiprint.com/documentation/orders.md)
- RPI transit to the contiguous US: Standard 2-5 days, Expedited 2 days, Rush 1 day (calendar days from ship date) — [RPI shipping rates](https://open.api.rpiprint.com/shipping/rates)
- RPI charges cards once a day at 02:00 UTC (or immediately via "Pay Now" in the dashboard), then holds the order 2 hours before sending to the printer — [RPI orders docs](https://docs.api.rpiprint.com/documentation/orders.md)
- RPI marketing page says "Printing and binding take up to 4-5 business days" — [RPI Self-Service API](https://www.rpiprint.com/products-services/print-apis/self-service)
- **MagCloud**, order priced on Tue 2026-11-10 for 1 magazine to the US: Standard estimated delivery 23 Nov 2026; FedEx Express Saver 18 Nov; FedEx Standard Overnight 16 Nov; all include tracking — [MagCloud pricing calculator](https://www.magcloud.com/formats/pricingcalculator)
- **Mixam**, quoted Tue 2026-11-10: 100 or 1 copies of a 100-152 page perfect-bound Letter magazine show "Estimated Shipping: Fri, Nov 13th". Delivery to a Chicago ZIP for 1 copy: UPS Next Day Air Saver Mon Nov 16; UPS Ground or FedEx Ground Tue Nov 17; UPS 3 Day Select or FedEx Express Saver Wed Nov 18 — [Mixam magazines](https://mixam.com/magazines)
- Mixam, 32-page perfect-bound job of 100 copies offered three speeds: ship Wed Nov 18 ($539.00), Mon Nov 16 ($645.50), Fri Nov 13 ($688.00) — [Mixam magazines](https://mixam.com/magazines)
- **Peecho magazines**: production 4-6 working days; shipping 2-3 working days — [Peecho magazines](https://www.peecho.com/products/magazines)
- **Bookvault US**: paperback/perfect bound 3-5 working days in production via US print partners; delivery by USPS or UPS; express/priority production only from the UK printer — [Bookvault help: US print times](https://help.bookvault.app/how-long-does-it-take-to-print-my-book-bookvault-us)
- **PrintNinja**: 2-3 weeks production for perfect bound plus shipping; not viable for weekly — [PrintNinja turnaround times](https://printninja.com/turnaround-times/)
- **Newspaper Club**: 2-8 working days press to door worldwide — [Newspaper Club](https://www.newspaperclub.com/)

### Inferences
- Fastest realistic file-to-hand for one proof copy in the US: Mixam about 4 business days (3 production + next-day air, about $50 shipping); MagCloud about 4 business days with overnight (about $32 shipping); RPI Rush about 4-5 business days (3 production + 1 day, $35.99 shipping) plus up to a day waiting for the daily payment run unless "Pay Now" is used; Lulu Express 5-8 business days ($35.74 shipping).
- Standard-shipping file-to-mailbox: RPI roughly 6-10 calendar days (4 business days + 2-5 days); Mixam roughly 5 business days by ground; MagCloud about 13 calendar days; Lulu Mail 11-14 business days (2-3 weeks).
- For a weekly cadence, RPI or Mixam can land an issue about a week after the file is final; Lulu Mail and MagCloud Standard land it 2-3 weeks later.
- Mid-November to December is peak season; Lulu explicitly warns production times lengthen late in the year, so first orders placed in the next 1-2 weeks may run slower than these estimates.

### Gaps
- MagCloud does not publish a production-time figure I could find; the dates above are from one calculator session.
- Mixam's ship dates are for its standard (bulk) ordering flow; production time for PrintLink/POD single-copy orders was not found.
- Cloudprinter, Gelato and Prodigi US production times for multi-page products were not found.
- Transit times to international addresses were not checked for any provider.

## 4. How each API works, minimums, and whether 100 single-copy orders are practical

### Takeaway
Lulu and RPI have the cleanest fit: one authenticated POST per recipient with cover and interior PDF URLs, a shipping address, a shipping level, and a webhook for status and tracking; both have sandboxes and no minimums. RPI has a default limit of 50 orders per rolling 24 hours (extra orders queue), so 100 single-copy orders needs a limit increase from support or two days; Lulu adds a $0.75 fulfillment fee per order. Mixam's API is order-based with artwork validation callbacks but needs account approval; MagCloud does the same job with no API through Ship to Group.

### Cited Findings
- **Lulu auth**: OpenID Connect / OAuth2 client-credentials; POST the client key and secret to the token endpoint to get a JWT bearer token — [Lulu Print API docs](https://api.lulu.com/docs/)
- **Lulu order**: POST `/print-jobs/` with `line_items` (each with a `pod_package_id`, page count, and publicly reachable cover and interior PDF URLs), one `shipping_address` (phone number required), `contact_email`, `shipping_level` (MAIL, PRIORITY_MAIL, GROUND, EXPEDITED, EXPRESS), optional `external_id` and `production_delay` — [Lulu Print API docs](https://api.lulu.com/docs/)
- Lulu endpoints: `/print-job-cost-calculations/`, `/shipping-options/`, `/validate-interior/`, `/validate-cover/`, `/cover-dimensions/`, `/print-jobs/{id}/status/`, `/print-jobs/{id}/costs/`, `/webhooks/` — [Lulu OpenAPI spec](https://api.lulu.com/api-docs/openapi-specs/openapi_public.yml)
- Lulu statuses: CREATED, UNPAID, PAYMENT_IN_PROGRESS, PRODUCTION_DELAYED, PRODUCTION_READY, IN_PRODUCTION, SHIPPED, DELIVERED (delivered only for USPS, FedEx, UPS), plus REJECTED and CANCELED; jobs can be cancelled only while unpaid — [Lulu Print API docs](https://api.lulu.com/docs/)
- Lulu tracking: shipped line items carry `tracking_id`, `tracking_urls`, `carrier_name`. Webhook topic `PRINT_JOB_STATUS_CHANGED`, signed with HMAC-SHA256 in the `Lulu-HMAC-SHA256` header, retried 5 times, with a test-submission endpoint — [Lulu Print API docs](https://api.lulu.com/docs/)
- Lulu fulfillment fee: the calculator shows "Fulfillment Fee 0.75 USD" on an order of 1 copy and the same 0.75 USD on an order of 100 copies; bulk discount levels are 100-499 copies 5%, 500-999 10%, 1000+ 15% (calculator, 2026-11-10) — [Lulu API Pricing Calculator](https://developers.lulu.com/price-calculator)
- Lulu offers account-level enterprise pricing through sales — [Lulu API Pricing Calculator](https://developers.lulu.com/price-calculator)
- **RPI auth and order**: HTTP Basic `Authorization` header from the dashboard's API Keys table; the key selects sandbox or production. POST `https://open.api.rpiprint.com/orders/create` with `currency`, `shippingClassification` (standard / expedited / rush), `webhookUrl`, one `destination` (name, address, phone, email), and `orderItems` each with `sku`, `quantity`, `retailPrice`, and `product.coverUrl` + `product.gutsUrl` — [RPI create order request](https://docs.api.rpiprint.com/documentation/first-request)
- RPI: a Standard manufacturing SKU can be ordered directly without setting up a product first — [RPI Getting Started](https://docs.api.rpiprint.com/documentation/getting-started)
- RPI limits: "by default, 50 orders per rolling 24 hours"; orders above that are accepted and placed in `QUEUED`; default queue ceiling 350, beyond which orders are `REJECTED`; support can adjust limits (printapicustomersupport@rpiprint.com) — [RPI orders docs](https://docs.api.rpiprint.com/documentation/orders.md)
- RPI order creation is not idempotent; a duplicate `customerOrderId` returns HTTP 400; cancel with `DELETE /orders/{customerOrderId}`, guaranteed only before or during the 2-hour hold after payment — [RPI orders docs](https://docs.api.rpiprint.com/documentation/orders.md)
- RPI tracking: `OrderShipped` webhook; `shipmentTracking` with `trackingNumber` and `trackingUrl` in webhooks and `GET /orders/{customerOrderId}` — [RPI orders docs](https://docs.api.rpiprint.com/documentation/orders.md)
- RPI other endpoints: `POST /orders/pricing/estimate`, `POST /orders/shipping/estimate`; unauthenticated template generator for cover and pages PDFs per SKU and page count; preflight checks on files — [RPI products docs](https://docs.api.rpiprint.com/documentation/products), [RPI docs index](https://docs.api.rpiprint.com/llms.txt)
- RPI destinations: generic accounts can ship only to the US (including territories) and Canada; other countries are refused; no military AA/AE/AP addresses; Canada ships DAP with duties paid by the recipient — [RPI shipping docs](https://docs.api.rpiprint.com/documentation/shipping)
- RPI fees and payment: no setup or usage fees; Visa/MasterCard/Amex, USD only; no free samples; support hours Mon-Fri 8-5 Pacific — [RPI support FAQ](https://docs.api.rpiprint.com/support-main.md)
- RPI shipping is priced per unit in quantity bands within one order (first item $6.99, items 2-5 $2.50 each, 6-10 $2.00, 11-20 $1.50, 21+ $1.00 on Standard), so the low bands only apply to multi-copy orders to one address — [RPI shipping rates](https://open.api.rpiprint.com/shipping/rates)
- **Mixam API**: get a JWT with a Basic-auth GET to `/api/user/token`, then Bearer auth; `GET /api/public/products`, `/api/public/catalogue`, offers, cart; `POST /api/public/orders` with items and artwork, `offerId` optional ("the system will automatically choose the best price option"); artwork is validated asynchronously and errors put the order on hold; a `statusCallbackUrl` receives status webhooks including dispatch; `GET /api/public/orders/{orderId}/status`; use the shop-specific host (`https://mixam.com` for the US). The OpenAPI schema also has PrintLink, PrintLink Series and Mailing Lists sections and quote types QUOTE, PUBLICATION, PRINT_ON_DEMAND — [Mixam Public API docs](https://mixam.com/documentation/api/public)
- **MagCloud**: no API found; Ship to Group sends one publication to an address group in one order with one payment — [MagCloud FAQ: group orders](https://www.magcloud.com/help/faq/item/1032)
- **Cloudprinter CloudCore API**: `apikey` in the JSON body; `POST /orders/add` with one delivery address, items with a `product` reference, `count`, files (`cover`, `book`) by URL with `md5sum`, a `total_pages` option, and `shipping_level` or a `quote` hash; `POST /orders/quote` returns product price and shipping quotes valid 48 hours; order info returns tracking — [Cloudprinter CloudCore API](https://docs.cloudprinter.com/client/cloudprinter-core-api-v1-0)
- **Prodigi**: `sandbox_` and `live_` keys; assets by upload or URL; per-order callbacks; draft orders — [Prodigi print API FAQ](http://www.prodigi.com/faq/print-api/)
- **Peecho**: files can be sent before or after creating the order; order status and shipping info available per order — [Peecho Print API](https://www.peecho.com/print-api)

### Inferences
- With Lulu, 100 single-copy print jobs is the normal use of the API. The penalty versus one bulk order is $0.75 x 100 = $75 in fulfillment fees, per-order shipping (from $5.69 each instead of about $0.83 each in a 100-copy ground shipment), and probably no 5% bulk discount, since each order's quantity is 1.
- With RPI, 100 single-copy orders each pay the $6.99 first-item rate; the default 50-orders-per-day limit should be raised before the first issue (or send two days' worth). Members sharing an address could be combined into one order at $2.50 for the second copy.
- RPI cannot serve members outside the US and Canada on a self-service account; those few copies would need Lulu (global network) or MagCloud (ships worldwide).
- Both Lulu and RPI fetch PDFs from URLs, so the same hosted cover and interior files can be reused across all 100 orders.
- MagCloud Ship to Group is practical for 100 recipients only if addresses can be entered once and reused each week; the FAQ describes building the group from existing address-book entries and does not mention CSV import.

### Gaps
- Lulu: how API print jobs are paid (card on file, per job or batched) was not confirmed from the docs I read.
- Lulu: whether the 5% bulk discount can apply across many single-copy jobs. The calculator ties it to copies in an order.
- Mixam: whether the API has a sandbox (none mentioned in the docs I read), and POD order semantics.
- MagCloud: maximum group size and whether addresses can be bulk-imported.
- Bookvault: API auth and order format (help page not retrieved).

## 5. Pricing: per-copy print cost at this spec, shipping to a US address, bulk discounts

### Takeaway
Delivered single-copy cost for a ~100-page and ~150-page full-color perfect-bound issue: RPI Print API about $21 and $26 (8.5x11 on 100 lb coated) or $17 and $19 (6x9 uncoated, no bleed); Lulu standard color about $13-15 and $16-18, Lulu premium 6x9 about $22 and $29, Lulu premium Letter/"Magazine" about $30 and $41; MagCloud about $24 and $31+ at 100+ copies; Peecho about $30 and $39; Mixam about $33+ as individually shipped singles but about $8-11 per copy as a 100-copy bulk order to one address. Within a $20-30 budget with quality first, RPI's coated-paper book and Lulu premium 6x9 fit; Lulu premium Letter and Peecho do not at 150 pages.

### Cited Findings
- **Lulu Magazine**, US Letter, perfect bound, premium color, 70# coated, matte (calculator, 2026-11-10): 100 pages $23.95; 150 pages $34.69. With Mail shipping $5.69 and fulfillment fee $0.75 the calculator's subtotal was $30.39 (100 pp) and $41.13 (150 pp). Bulk price per copy at 100-499: $22.75 (100 pp), $32.96 (150 pp) — [Lulu API Pricing Calculator](https://developers.lulu.com/price-calculator)
- **Lulu Print Book**, US Letter, perfect bound, 80# white coated, matte (calculator, 2026-11-10): Standard Color 100 pp $8.51, 150 pp $11.69; Premium Color 100 pp $23.64, 150 pp $34.38 — [Lulu API Pricing Calculator](https://developers.lulu.com/price-calculator)
- **Lulu Print Book**, US Trade 6x9, perfect bound, 80# white coated, matte (calculator, 2026-11-10): Standard Color 100 pp $7.04, 150 pp $9.57; Premium Color 100 pp $15.88, 150 pp $22.83 — [Lulu API Pricing Calculator](https://developers.lulu.com/price-calculator)
- **Lulu shipping**, 1 copy to Illinois or California, "starting at" (calculator, 2026-11-10): Mail $5.69; Ground Business $13.74; Ground Home $13.74; Priority Mail $14.74; Expedited $20.74; Express $35.74. For 100 copies of a 6x9 100-page book to one California address: Ground $83.49, Expedited $215.74, Express $293.49 (no Mail option); book total $704.00 less 5% bulk discount $35.20 — [Lulu API Pricing Calculator](https://developers.lulu.com/price-calculator)
- **RPI Print API** softcover prices (catalog generated 2026-10-14), unit price = base + per-page x (pages - minimum): 8.5x11 full bleed, 100 lb gloss or dull, full color: $7.00 base (20 pages) + $0.09/page; 8.5x11 100 lb eggshell: $9.20 + $0.17/page; 8.5x11 full bleed 70 lb uncoated color: $7.60 (24 pages) + $0.08/page; 8x10 100 lb gloss or dull: $7.20 + $0.09/page; 6x9 full bleed 70 lb uncoated color: $8.40 (24 pages) + $0.08/page; 6x9 no bleed 70 lb uncoated color: $7.40 + $0.04/page; 5.5x8.5 no bleed 70 lb uncoated color: $6.50 + $0.04/page — [RPI product catalog](https://products.api.rpiprint.com/catalog/v1/products.md), [RPI products docs](https://docs.api.rpiprint.com/documentation/products)
- **RPI shipping**, contiguous US, per unit by quantity band: Standard $6.99 first item, $2.50 items 2-5, $2.00 items 6-10, $1.50 items 11-20, $1.00 items 21+; Expedited $30.99 first item; Rush $35.99 first item. Canada Standard $17.99 first item — [RPI shipping rates](https://open.api.rpiprint.com/shipping/rates)
- **MagCloud** (calculator, 2026-11-10): Magazine 8.25x10.75 and Small Square 8x8 $0.20 per page; Digest 5.25x8.25 $0.17 per page; perfect binding +$1.00 per copy; saddle stitch free. Volume discounts: 10-49 copies 15%, 50-99 20%, 100+ 25%. Shipping 1 copy of a 60-page magazine to the US: Standard $8.14, FedEx Express Saver $22.46, FedEx Standard Overnight $31.66 — [MagCloud pricing calculator](https://www.magcloud.com/formats/pricingcalculator)
- MagCloud promotion: 15% off with code 15NOV2026 through 2026-11-13 — [MagCloud home](https://www.magcloud.com/)
- **Mixam** standard ordering, Letter 8.5x11, color, 80 lb coated satin, perfect (PUR), with 4-page cover (calculator, 2026-11-10): 100 pages x 100 copies $728.00; 152 pages x 100 copies $972.00; 152 pages x 1 copy $16.50. Delivery of 1 copy to ZIP 60601: UPS 3 Day Select $16.88, UPS Ground $17.37, FedEx Ground $17.50, FedEx Express Saver $23.50, UPS Next Day Air Saver $50.34. Delivery of 100 copies (152 pp): FedEx Ground $102.75, UPS Ground $130.92, FedEx Express Saver $277.75 — [Mixam magazines](https://mixam.com/magazines)
- Mixam POD claims "No setup costs, no inventory, and no hidden fees" and no revenue share — [Mixam Print on Demand](https://mixam.com/print-on-demand)
- **Peecho** matte magazine, A4, 115 gsm silk, 1 copy to Illinois (calculator, 2026-11-10): 100 pages $22.39 + shipping from $7.45 = $29.84; 150 pages $31.90 + $7.45 = $39.35. 100 copies of 150 pages: $3,190.01 less $319.00 quantity discount, shipping from $22.39, total $2,893.39 — [Peecho magazines](https://www.peecho.com/products/magazines)
- **Blurb** web magazine starts at $7.00 for one 20-page copy; volume discounts from 10 copies — [Blurb magazine](https://www.blurb.com/magazine)
- **Bookvault** charges a title setup fee ($24.95 per title on the free plan); bulk discounts 3-10% (3-15% on Pro) — [Bookvault pricing](https://bookvault.app/cost-to-print-your-book/)
- **Gelato** softcover photo book starting price cited as $11.85 (paid-review site, unverified) — [BestReviews: Gelato](https://bestreviews.net/gelato-reviews/)

### Inferences
Computed delivered cost per copy, one single-copy order per recipient, cheapest tracked/standard shipping, before tax:

| Provider and spec | 100 pp print | 150 pp print | Per-order shipping + fees | 100 pp delivered | 150 pp delivered |
|---|---|---|---|---|---|
| RPI API, 8.5x11, 100 lb gloss/dull, full bleed | $14.20 | $18.70 | $6.99 | $21.19 | $25.69 |
| RPI API, 8x10, 100 lb gloss/dull | $14.40 | $18.90 | $6.99 | $21.39 | $25.89 |
| RPI API, 6x9, 70 lb uncoated, full bleed | $14.48 | $18.48 | $6.99 | $21.47 | $25.47 |
| RPI API, 6x9, 70 lb uncoated, no bleed | $10.44 | $12.44 | $6.99 | $17.43 | $19.43 |
| Lulu Print Book, 6x9, Standard Color, 80# coated | $7.04 | $9.57 | $5.69 + $0.75 | $13.48 | $16.01 |
| Lulu Print Book, Letter, Standard Color, 80# coated | $8.51 | $11.69 | $5.69 + $0.75 | $14.95 | $18.13 |
| Lulu Print Book, 6x9, Premium Color, 80# coated | $15.88 | $22.83 | $5.69 + $0.75 | $22.32 | $29.27 |
| Lulu Print Book, Letter, Premium Color, 80# coated | $23.64 | $34.38 | $5.69 + $0.75 | $30.08 | $40.82 |
| Lulu Magazine, Letter, Premium Color, 70# coated | $23.95 | $34.69 | $5.69 + $0.75 | $30.39 | $41.13 |
| MagCloud Magazine 8.25x10.75, perfect bound, 1 copy list price | $21.00 | $31.00 | about $8.14+ | about $29 | about $39 |
| MagCloud Magazine, 100+ copy discount (25%) | $15.75 | $23.25 | about $8.14+ | about $24 | about $31 |
| MagCloud Digest 5.25x8.25, 100+ copy discount | $13.50 | $19.88 | not priced | n/a | n/a |
| Peecho A4 matte magazine | $22.39 | $31.90 | from $7.45 | $29.84 | $39.35 |
| Mixam Letter, 80 lb satin, single copy shipped by courier | not priced | $16.50 (152 pp) | $16.88-17.50 | n/a | about $33-34 |

- RPI arithmetic: 8.5x11 gloss 100 pp = 7.00 + 0.09 x 80; 150 pp = 7.00 + 0.09 x 130. 6x9 no bleed 100 pp = 7.40 + 0.04 x 76; 150 pp = 7.40 + 0.04 x 126.
- MagCloud arithmetic: pages x $0.20 + $1.00 binding (150 pp: $31.00), then 25% off at 100+ copies. The $8.14 shipping figure was for a 60-page copy, so a 100-150 page copy will likely cost somewhat more; MagCloud's discount applying to the binding surcharge is assumed.
- Lulu Mail shipping stayed $5.69 for a 100-page and a 150-page Letter magazine in the calculator, so weight did not move the single-copy Mail rate in this range.
- Bulk alternative (print 100 to one address, mail yourself): Mixam Letter 80 lb satin 100 pp is $7.28/copy and 152 pp is $9.72/copy before freight; with FedEx Ground ($102.75 for the 152-page job) about $10.75/copy landed, before envelopes and postage. Lulu 6x9 standard 100 pp in bulk is about $6.69 + $0.83 shipping per copy. This is the cheapest route but needs manual re-mailing.
- 100 copies per issue via RPI at 8.5x11 coated: about $2,120 (100 pp) to $2,570 (150 pp) per issue delivered. Via Lulu premium 6x9: about $2,230 to $2,930. Via Lulu Magazine: about $3,040 to $4,110.
- On a $20-30 budget with quality prioritized: RPI 100 lb coated (8x10 or 8.5x11) is the only coated-paper Letter-size option under $30 at 150 pages; Lulu premium fits only at 6x9 (and just under $30 at 150 pages); Lulu standard color fits easily but is the tier with the weakest quality evidence.

### Gaps
- Mixam PrintLink/POD per-copy price and its shipping rates for single copies were not obtained; the single-copy figure above is from the standard order calculator and its courier shipping.
- MagCloud shipping for a 100-150 page copy and per-recipient shipping under Ship to Group were not priced.
- Bookvault US print prices: the quote tool would not load (site showed an outage notice on 2026-11-10).
- Cloudprinter, Gelato and Prodigi US prices for a 100-150 page product were not obtained (account or API needed).
- International shipping rates were not priced for any provider.
- Sales tax is excluded everywhere; Lulu and RPI both add applicable sales tax.
- Blurb's per-page magazine price beyond the $7.00 / 20-page starting point.

## 6. Can any of them also run a storefront or sell copies to the public with fulfillment?

### Takeaway
Yes, most can. Lulu (Lulu Direct for Shopify/WooCommerce/Wix, buy button, Lulu Bookstore), Blurb (Blurb Bookstore), MagCloud (its own shop, print and digital), Mixam (PrintLink shareable links and a Shopify app), Peecho (Button, Shop, Checkout) and Bookvault (Shopify/Wix/WooCommerce/Payhip/Kickstarter, Bookvault Shop) all offer public selling with automatic fulfillment. RPI's self-service API has no storefront of its own.

### Cited Findings
- **Lulu Direct**: connects a store to Lulu's print network; the seller collects payment and pays Lulu the production cost (print, fulfillment fee, shipping, sales tax); "Keep 100% of Your Profit" — [Lulu: Sell on your site](https://www.lulu.com/sell/sell-on-your-site)
- Lulu publishes integration guides for Shopify, WooCommerce and Wix, and a Direct Buy Button — [Lulu Direct Shopify guide](https://assets.lulu.com/media/guides/en/lulu-direct-shopify-integration-guide.pdf), [Lulu buy button](https://www.lulu.com/sell/sell-on-your-site/buy-button)
- Lulu Direct Shopify app is free to install; its reviews include complaints that production time is longer than the stated 3-5 days, that international shipping is untracked, and one unverified claim of app print costs about 20% above the Lulu bookstore price plus $1.50 per book; ratings around 2.7-3.2 stars across listings — [Shopify App Store: Lulu Direct](https://apps.shopify.com/lulu-direct)
- **Blurb**: magazines can be listed for sale in the Blurb Bookstore — [Blurb magazine](https://www.blurb.com/magazine)
- **MagCloud**: site has Sell and Shop sections; publishers are paid by PayPal; digital and print distribution — [MagCloud home](https://www.magcloud.com/), [MagCloud help](https://www.magcloud.com/help)
- **Mixam**: "Every product comes with a shareable PrintLink. Post it on social media, send it by email, or embed it anywhere"; Shopify integration to add POD products to a Shopify store; sellers get customer emails; you set the retail price and keep the margin — [Mixam Print on Demand](https://mixam.com/print-on-demand), [Shopify App Store: Mixam](https://apps.shopify.com/mixam)
- **Peecho**: Button (print button for a website), Shop (branded print shop), Checkout (no-code checkout page), plus a marketplace module where the platform earns a percentage of sales — [Peecho Print API](https://www.peecho.com/print-api)
- **Bookvault**: direct-sales integrations with Shopify, Wix, WooCommerce, Payhip and Kickstarter; Bookvault Shop storefront with automated fulfilment; retail distribution to Amazon and Gardners — [Bookvault](https://bookvault.app/)
- **Cloudprinter**: integrations for Shopify, WooCommerce, Amazon and eBay — [Cloudprinter magazines](https://www.cloudprinter.com/products/magazine-print-online-worldwide)
- **RPI Print API**: orders ship in unbranded packaging with no RPI or Blurb logos (white label); no storefront described — [Blurb Print API](https://www.blurb.com/print-api-software)

### Inferences
- If public sales matter later, Lulu gives the most direct path from the same API account and files (Lulu Direct + Shopify), and Mixam gives the lowest-friction option without a website (PrintLink).
- Since this site already takes payments through Stripe, a custom checkout that calls the Lulu or RPI API per paid order would work without any of the storefront products.

### Gaps
- Fees on Lulu Direct beyond print, shipping and the fulfillment fee were not confirmed from an official current fee schedule.
- MagCloud's seller revenue terms (markup, payout thresholds) were not read.
- Whether Blurb Bookstore listings can use the same files and SKUs as RPI API orders.
