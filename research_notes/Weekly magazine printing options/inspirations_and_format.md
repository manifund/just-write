# Inspirations and format: how Offprint, Asterisk, and Midjourney Magazine are made, and what specs matter at ~100 copies

Research date: 2026-11-10. Notes on method: pages were read through a fetch tool that summarizes page content, so "not stated" means the fetched page text did not include it. Items marked "(search snippet only)" came from a search-result summary and could not be confirmed on the page itself. X/Twitter posts could not be opened directly (HTTP 402), so founder posts are quoted only via third-party pages.

## 1. Offprint (getoffprint.com)

### Takeaway
Offprint is a one-person product (Daniel Belfort, launched 19 Aug 2026) that prints a personalized, full-color, perfect-bound 8.5×11 magazine of at least 96 pages on coated stock with a gloss cover, for $39/month shipping included, arriving about 10 business days after the reader approves it. The printer, print API, and typesetting pipeline are not disclosed anywhere I could find.

### Cited Findings
- Product: a monthly printed magazine of things the subscriber saved. "Text us anything read-worthy," approve the magazine with one reply, "Once a month, a magazine of your own saves lands in your mailbox." Accepts open-web articles, subscriber-only pieces the user already has access to, X posts, PDFs, and the user's photos (turned into collage pages). — [getoffprint.com](https://getoffprint.com/)
- Specs stated on the site: trim 8.5×11 in; at least 96 pages (short months are padded with ruled notes pages); "thick edition" up to 320 pages; coated stock; gloss cover with the subscriber's name printed on it; full color throughout. — [getoffprint.com](https://getoffprint.com/)
- Binding: the homepage does not state it, but the Lenny Rachitsky "Creator Edition" page describes the product as 108 pages, 8.5 by 11 inches, perfect-bound, "your name on the cover." — [getoffprint.com/lenny](https://getoffprint.com/lenny)
- Price: $29 for the first magazine (during a 48-hour launch window, $39 after), then $39/month or $390/year; shipping included; +$9 past 96 pages, +$19 past 192 pages. — [getoffprint.com](https://getoffprint.com/); [Offprint terms](https://getoffprint.com/terms)
- Earlier price reports differ: a LinkedIn profile/newsletter described approving the issue on the first of each month and receiving it "about a week later for $19, including shipping" (search snippet only; likely an earlier launch price). — [LinkedIn profile](https://www.linkedin.com/in/danielbelfort/); contradicted by current pricing on [getoffprint.com](https://getoffprint.com/)
- Timing: delivery "10 business days" after approval. No cutoff date is published on the homepage. — [getoffprint.com](https://getoffprint.com/)
- Shipping countries: US, Canada, UK, EU, Norway, Switzerland, Turkey, Serbia, Australia, New Zealand, India, Singapore, Japan, UAE, South Africa, Mexico, Brazil, Argentina. — [getoffprint.com](https://getoffprint.com/)
- Quality control: "The final formatting is checked before every magazine prints." — [getoffprint.com](https://getoffprint.com/)
- Who runs it: "Made with <3 by Daniel Belfort"; terms say "Offprint is operated by Daniel Belfort." He is a software engineer (founder of Blok, founding engineer at Stack AI). His personal site says nothing about how Offprint is built. — [getoffprint.com/terms](https://getoffprint.com/terms); [danielbelfort.com](https://danielbelfort.com)
- Printer: the terms refer only to "our printer" and "printing and shipping providers," unnamed. — [getoffprint.com/terms](https://getoffprint.com/terms)
- Launch: posted on X on 19 Aug 2026 ("Introducing Offprint™ The physical magazine made from everything you 'save for later' but never actually go back to read. Find online, read offline. Print media is back!"), about 3.7M views. Common questions in replies: a real photo of the printed magazine, bulk import of bookmarks, shared accounts. The founder said text replies ran minutes late under load and he added a second phone line. — [doomers.ai launch tracker](https://doomers.ai/launches/daniel-belfort); [launch post](https://x.com/danielbelfort/status/2090134913366319115)
- Copyright stance: "Each magazine is a single private copy, printed once, mailed only to the reader who requested it." Users may send "only content that you have lawful access to and that you have the rights or permissions needed." Takedown requests are honored (stored copies removed, future printing blocked). — [getoffprint.com/terms](https://getoffprint.com/terms)
- Creator Editions: a writer curates posts from their own newsletter and Offprint prints them as a magazine. Lenny's edition is $29 one-time, 108 pages, eight posts plus a welcome note, with a page-numbered table of contents; "Lenny makes no money from the sale of this magazine." Launched early November 2026. — [getoffprint.com/lenny](https://getoffprint.com/lenny)
- Reported scale: "15,000+ articles" sent to Offprint, plus a Sublime integration (search snippet only, attributed to a November 2026 post by Belfort). — [x.com/danielbelfort](https://x.com/danielbelfort)

### Inferences
- Each copy is unique (name on cover, different contents), so this must be one-off digital print-on-demand through a printer or print API that accepts a per-order PDF. The long country list, uniform 8.5×11 format, and 10-business-day delivery are consistent with a distributed print-on-demand network that prints near the recipient, but which one is not confirmed.
- The spec (8.5×11, coated text, gloss cover, perfect bound, full color) matches the standard "magazine" product offered by mainstream print-on-demand vendors. It is the cheapest good-looking option, not a custom spec.
- Pricing structure is informative: page count is priced in 96-page steps, which suggests the per-page print cost is the main variable cost.
- 96-page minimum with ruled filler pages suggests a minimum page count for a sturdy perfect-bound spine and for the product to feel like a magazine.
- "Formatting is checked before every magazine prints" implies automated layout with a human (or founder) review step. Web-to-print conversion is evidently not fully hands-off even here.

### Gaps
- Printer or print API: not named on the site, in the terms, or in any press I found. Founder X replies might name it, but X could not be read.
- Typesetting tools (for example HTML-to-PDF vs InDesign scripting vs Typst/LaTeX): no public write-up found. No Hacker News or Product Hunt thread with technical details surfaced.
- Paper weights, cover weight, cover lamination type: not stated.
- No independent reviews of print quality found; only the site's own testimonial links.

## 2. Asterisk Magazine

### Takeaway
Asterisk is a professionally designed, offset-printed quarterly: designed by Sarah Gephart of MGMT. design, printed by Hemlock (Vancouver-area offset printer) on Neenah Classic Crest (a premium uncoated sheet), with 6–8 commissioned illustrators per issue. Print issues are $19 each and $80/year in the US. Trim size, page count, binding, and print run are not published.

### Cited Findings
- Masthead: Editor in Chief Clara Collier; Managing Editor Angela Chen; Publisher Nadia Asparouhova; Design: Sarah Gephart / MGMT; Web: Daniel G. Siegel. Published by Obelus, Inc., a 501(c)(3), funded by "donors, subscriptions, and a grant from Coefficient Giving." — [asteriskmag.com/about](https://asteriskmag.com/about)
- Frequency and retail: "Four issues per year, delivered to your door"; also "sold at bookstores and newsstands across the United States." — [asteriskmag.com/about](https://asteriskmag.com/about)
- Prices (current store): print subscription 1 year US $80; international $100; single print issues $19.00 (Issues 01–16); PDF issues $10.00. — [store.asteriskmag.com](https://store.asteriskmag.com/)
- An older listing showed the annual print subscription at $50 (search snippet only; price has since risen). — [store product page](https://store.asteriskmag.com/products/asterisk-subscription-annual)
- Production credits from the AIGA 365 entry: design firm MGMT. design; creative director/designer Sarah Gephart; printer Hemlock; typefaces Atlas Grotesk, Noe Text, Noe Standard; paper "Neenah Classic Crest Avon Brilliant White"; "we work with 6-8 illustrators each issue"; production budget band $30,001–$100,000; development budget more than $50,000; client relationship: retainer. — [AIGA 365 gallery entry](https://aiga-365-design-competition.secure-platform.com/a/gallery/rounds/343/details/68138)
- Design intent: "to enrich the reading experience by bringing a sense of levity and energy to the publication." Influences: 1970s science fiction, 1980s nuclear disarmament publications, William Hogarth illustrations, 18th-century book design. — [AIGA 365 gallery entry](https://aiga-365-design-competition.secure-platform.com/a/gallery/rounds/343/details/68138); [MGMT project page](https://www.mgmtdesign.com/work/asterisk-magazine)
- Recurring device: "Each issue gets a new asterisk and the symbols are used throughout the magazine as end marks." The website's signature color also changes each quarter. — [MGMT project page](https://www.mgmtdesign.com/work/asterisk-magazine)
- Reception: a New Yorker writer called it "A handsomely designed print magazine" (search snippet only, via Asterisk's LinkedIn). Two early reader reviews on the EA Forum were lukewarm on the magazine elements: Issue 1 reviewer disliked "the illustrations, the large text blurbs"; Issue 2 reviewer wanted more visuals and better flow between pieces. — [Asterisk LinkedIn](https://www.linkedin.com/company/asterisk-mag); [EA Forum review of #1](https://forum.effectivealtruism.org/posts/v9eLbvM8vjyNQ27QH/book-review-asterisk-1); [EA Forum review of #2](https://forum.effectivealtruism.org/posts/jeAGKZtnHS2wc8GkD/book-review-asterisk-2-1)
- Hemlock (the printer) describes its perfect-binding practice: EVA glue "can become brittle over time" and "may not bond as effectively to coated papers or heavier stocks"; PUR is more flexible; covers are hinge-scored so they bend without cracking; double hinge scoring gives a lay-flat perfect binding. — [Hemlock blog, Mar 2026](https://www.hemlock.com/blog/2026/03/12/perfect-binding-production-decisions-that-shape-a-book/)

### Inferences
- Asterisk's look comes mostly from design decisions that do not depend on offset printing: a premium uncoated white sheet, a small consistent type system (one grotesk, one serif family), commissioned illustration per piece, one changing accent color and a new cover mark per issue, and end marks that repeat the mark.
- Classic Crest is an uncoated text-and-cover paper line, so the interior is almost certainly uncoated. That choice favors reading and illustration over photo saturation.
- A $19 cover price with offset printing and bookstore distribution implies a run in the thousands; this is not a model for a 100-copy weekly, but the design system is transferable.
- The retainer relationship and budget bands show the quality is bought with sustained professional design time, not only print specs.

### Gaps
- Trim size, page count, binding type, cover stock and finish, spot-color use: not published on the site, store, MGMT page, or AIGA entry. A physical copy's colophon is the reliable source.
- Print run and fulfillment provider: not found. (The store is Shopify-style with a recurring-subscription portal, but the mailer is not named.)
- The AIGA entry is from the 2023 competition; paper and printer may have changed since.
- The EA Forum launch post could not be read (HTTP 429).

## 3. Midjourney Magazine

### Takeaway
Midjourney Magazine is a 116-page, 8.5×11 monthly art magazine sold at $4/month, a price that almost certainly does not cover cost. Paper, binding, and printer are not published; a Lithuanian printer (KOPA, Kaunas) shows a "Midjourney" magazine job in its portfolio, which is suggestive but not confirmed as the official run.

### Cited Findings
- Official specs: page count "116"; size "8.5” x 11”"; subscription "$4 / mo"; back issues "$8 + Shipping" (issues 1–42 shown, all marked sold out); "Limit of 4 magazines per customer." — [mag.midjourney.com/midjourneymag](https://mag.midjourney.com/midjourneymag)
- Contents: "Each issue features artwork curated from that month's 10,000 most highly rated images, plus interviews with Midjourney community members." — [mag.midjourney.com/midjourneymag](https://mag.midjourney.com/midjourneymag)
- Shipping cadence: "The magazines are shipped once a month, towards the end of each month." A first issue ships the month after subscribing (an April payment ships near the end of May). Delivery takes roughly one to six-plus weeks depending on location. — [mag.midjourney.com/support](https://mag.midjourney.com/support)
- Lost copies: if an issue has not arrived within 6 weeks of shipping, the subscriber contacts billing; undelivered magazines are not re-shipped, and a credit or refund is offered instead. — [mag.midjourney.com/support](https://mag.midjourney.com/support)
- Also sells "Midjourney Year One," a hardbound coffee-table book (currently out of stock); the book ships with tracking, 5–7 days in the US. — [mag.midjourney.com](https://mag.midjourney.com/); [support](https://mag.midjourney.com/support)
- Possible printer: KOPA, a printing house in Kaunas, Lithuania, has a portfolio entry titled "Midjourney" with gallery images named "Midjourney-magazine-…jpg". The fetched page shows no specs. A search summary of the same page listed "250 gsm coated Maxima Gloss" cover, 130 gsm of the same paper inside, "sewn softcover" with matt offset varnish on the cover (search snippet only; not reproduced when the page was fetched). — [druckerei-kopa.de/midjourney](https://druckerei-kopa.de/midjourney)
- Launch history: announced March 2023 at $4/month; early subscribers complained of no receipt or confirmation email, no delivery date, no stated international shipping terms, and no clear way to unsubscribe. — [web-mind.io](https://web-mind.io/artificial-intelligence/the-first-printed-magazine-completely-created-by-ai-made-subscribers-angry/); [PetaPixel](https://petapixel.com/2023/03/16/ai-image-generator-midjourney-launches-a-magazine/)
- Critical reception: Wired's review was headlined "Midjourney Magazine Is Here—and It's Soulless," describing large images of uneven quality grouped by theme and captioned with prompt and creator (search snippet only). Gizmodo questioned why anyone would pay for print copies of images freely available online. — [Wired mirror](https://wirednews.pages.dev/story/midjourney-magazine-review); [Gizmodo](https://gizmodo.com/ai-midjourney-free-ai-art-launches-magazine-1850229973)
- Resale: individual issues are listed on eBay as collectibles. — [eBay listing](https://www.ebay.de/itm/357180856771)

### Inferences
- $4/month including shipping for 116 full-color letter-size pages is below plausible unit cost at any quantity; it is a marketing product subsidized by the company. Its price is not a benchmark for the club.
- If the KOPA specs are right, the recipe is: offset printing in a large run, 130 gsm gloss-coated text (about 88 lb text), 250 gsm gloss-coated cover (about 92 lb cover), thread-sewn softcover, matt varnish. Thread-sewn binding and heavy coated paper are what make an image-led magazine open flat and feel substantial. This is an offset-run spec and would be costly at 100 copies.
- The useful editorial lesson from the criticism: a magazine of AI images with only prompt captions reads as "soulless"; in an essay magazine the art supports writing by named people, which avoids that problem, but generic-looking AI art is a known risk to perceived quality.

### Gaps
- Paper, binding, and printer are not stated on any official Midjourney page. The KOPA link is circumstantial.
- No subscriber threads about print quality surfaced in search (Reddit was not reachable through search results).
- The magazine page showed inconsistent issue information (an "Issue 28" delivery note alongside back issues numbered to 42), so the current issue number and whether new subscriptions are still fulfilled monthly are unclear. Check the live page.
- The Medium review of issue 1 could not be read (HTTP 403).

## 4. Comparable references (Works in Progress, Offscreen, Kernel, and others)

### Takeaway
The well-regarded tech-adjacent journals are all offset-printed by established book and magazine printers with a hired design studio; published specs are thin, but the pattern is a restrained type system, good paper chosen for readability, and commissioned art. Named printers found: Hemlock (Asterisk), Park|Graphius (Works in Progress). No colophon data was found for Logic, Palladium, Delayed Gratification, or The Browser.

### Cited Findings
- Works in Progress (published by Stripe) launched print in 2025: $100/year US, £75/year UK, six full-color issues a year sent bimonthly, first issue shipping November 2025; later extended to Canada, Australia, and the EU. — [WiP announcement, 17 Sep 2025](https://www.worksinprogress.news/p/works-in-progress-is-now-in-print); [WiP expansion post](https://www.worksinprogress.news/p/you-can-now-subscribe-to-works-in)
- WiP process: the team "trialled nearly a dozen typefaces" and "reviewed seventy different magazines"; paper was chosen for "the right balance between being floppy and readable on the one hand and opaque and durable on the other"; uses "marginalia and other decorative elements." — [WiP announcement](https://www.worksinprogress.news/p/works-in-progress-is-now-in-print)
- WiP printer and paper: Park|Graphius (UK). "A Magno Gloss cover gives the publication a quality feel," with an aqueous coat for durability; "The text pages are printed on Magno Satin stock for a smooth finish." — [Park|Graphius case study](https://parkgraphius.co.uk/case-studies/works-in-progress-business-magazine-printing/)
- WiP design: studio And–Now. Body text in GT Alpina, headlines in Lock Serif; a custom page grid ("WiP Canon") based on the Van de Graaf canon; ornaments drawn from a single grid; small playful details in margins, compared to a gargoyle on a cathedral. — [And–Now project page](https://and-now.co.uk/work/works-in-progress-print)
- Offscreen (indie tech magazine; post dated 19 Jan 2017, so numbers are old): first issue ran 3,000 copies and took over a year to sell; indies commonly start at 1,000–2,000; offset is generally too costly below about 500 copies, where digital or on-demand is the alternative; plan page counts in 8- or 16-page steps (96 is cheaper than 92 or 100) for offset; perfect binding is the default; 100% recycled uncoated paper; printed in Berlin. — [Offscreen, "Indie Magonomics"](https://www.offscreenmag.com/blog/indie-magonomics)
- Offscreen on weight and postage: a 510 g magazine fell into the next postage tier and roughly doubled postage versus 480 g. On finishes: be cautious with special finishes, which can make a magazine feel like a novelty item. Ask printers for paper samples. — [Offscreen, "Indie Magonomics"](https://www.offscreenmag.com/blog/indie-magonomics)
- Kernel (Reboot): first issue announced 27 Sep 2021 with 14 pieces, made by "a team of over 20 volunteers over the last six months"; creative director Saffron Huang; cover art by Olivia Tai; volunteers made art for each piece; upfront costs covered by grants (0xPARC, Emergent Ventures, SPARC, Stanford HAI); bundled with a $30–$40/year subscription. Issue 2 was 164 pages (search snippet only). Later single-issue pricing: $10 students, $20 professionals (search snippet only). — [Reboot, Kernel launch](https://joinreboot.org/p/kernel-launch); [Reboot, Kernel 2](https://joinreboot.org/p/kernel2-preview)
- Short-run price reference (UK digital printer Ex Why Zed): 100 softcover copies with 300 gsm silk cover and 130 gsm silk inside advertised from £114 (a small-format, low-page-count offer, not an 80–150 page magazine); an example A4 photography magazine used 80 pages of 115 gsm gloss with a gloss-laminated 200 gsm cover; stapled jobs delivered in 3 days, perfect bound in 5 days. — [Ex Why Zed paper guide](https://exwhyzed.com/magazine-printing-paper/)
- A UK trade magazine's December cover used soft-touch lamination, silver foil, white foil, and spot gloss on a digital run of only about 100 copies (search snippet only), showing these embellishments exist at this quantity. — [Digital Printer magazine](https://www.digitalprintermag.co.uk/?p=26102)

### Inferences
- None of these comparables prints 100 copies weekly. Their transferable lessons are editorial and typographic: one or two typefaces used consistently, generous margins with small ornaments, a recurring issue device (Asterisk's changing asterisk, WiP's marginalia), commissioned art per piece, and paper picked by handling real samples.
- Two paper philosophies are visible: Asterisk uses premium uncoated (book-like, best for reading), Works in Progress uses satin/silk coated text with a gloss cover (better for full-color art). For essays with a full-page artwork each, a silk or matte coated text is the common compromise.
- Kernel is the closest organizational analogue (community volunteers designing and illustrating each piece, grant-funded), and it took about six months per issue. A weekly cadence means a fixed template and automated layout rather than bespoke design per piece.

### Gaps
- Trim size, page count, binding, paper weights, and print runs for Works in Progress: not in the announcement, printer case study, or studio page.
- Logic, Palladium, Delayed Gratification, The Browser's print experiments, Stripe Press, Dense Discovery: no colophon or printer information surfaced in the searches run. Not researched further for lack of sources, not because they lack print editions.
- No first-hand accounts found from indie magazines printed digitally in runs of 100–500 naming their printer and unit cost.

## 5. Format guidance for an 80–150 page, ~100-copy digital run

### Takeaway
At 80–150 pages the practical binding is perfect binding, preferably with PUR glue; saddle stitch tops out around 64–80 pages and sewn bindings are rare and costly at 100 copies. Perceived quality at this scale comes mainly from paper choice (70–80 lb or heavier text, matte/silk or good uncoated), a laminated cover one grade heavier than the text, a press with good solids (HP Indigo-class rather than inkjet), and layouts that tolerate 1/16–1/8 inch trim and color drift.

### Cited Findings

Binding
- Saddle stitch is standard for magazines under roughly 64 to 80 pages; perfect binding is recommended for 80+ pages. Saddle-stitch page counts must be multiples of 4. — [Publishing Xpress paper guide](https://www.publishingxpress.com/blog/how-to-choose-paper-stock-for-magazine-printing/); [Publishing Xpress literary magazine guide](https://www.publishingxpress.com/blog/how-to-plan-a-literary-magazine-issue-for-print/)
- Other printers put the ranges at saddle stitch 8–64 pages and perfect binding 28–300+ pages. — [4over4 binding guide](https://www.4over4.com/guide/complete-guide-to-binding-types-for-books-and-booklets)
- Interior stock above 80 lb text in a saddle-stitched book can crack at the spine. — [Publishing Xpress paper guide](https://www.publishingxpress.com/blog/how-to-choose-paper-stock-for-magazine-printing/)
- Digital runs are viable from 25–50 units; offset perfect binding typically becomes cost-efficient above about 500 copies (search snippet only). — [4over4 binding guide](https://www.4over4.com/guide/complete-guide-to-binding-types-for-books-and-booklets)
- PUR vs standard hot-melt (EVA): "inks, coatings or digital print toners in the spine area can compromise the strength of typical hotmelt perfect binding"; PUR resists this and bonds across paper weights and finishes. Short-run PUR binders handle spines from about 2 mm to 50 mm (0.07–1.96 in). — [Morgana DigiBook spec sheet](https://www.mybinding.com/media/manuals/Morgana-DigiBook-200-Spec-Sheet.pdf)
- EVA "can become brittle over time" and "may not bond as effectively to coated papers or heavier stocks"; hinge scoring on the cover prevents cracking; double hinge scoring gives a flatter-opening perfect binding. — [Hemlock blog](https://www.hemlock.com/blog/2026/03/12/perfect-binding-production-decisions-that-shape-a-book/)
- Grain should run parallel to the spine; paper should acclimatize at least 12 hours; PUR holds coated and synthetic stocks. — [PrintWeek India, short-run digital book best practices](https://www.printweek.in/features/best-practices-for-short-run-book-printing-in-digital-60976)
- Smyth (section) sewing "is rare for short-run printing"; one vendor lists a 500-book minimum; it opens flatter than PUR ("PUR will never open as flat as a section sewn book") (search snippets only). — [OnPress binding options](https://www.onpressbookprinting.com/resources/book-binding-options); [PrintPlanet thread](https://printplanet.com/threads/sewn-binding-for-a-short-run-digital-printed-book.293646/post-313723)
- Mixam says PUR becomes available only above a certain page count or paper density, and offers a layflat option as an alternative to perfect binding (search snippet only; the page returned HTTP 403). — [Mixam binding support](https://mixam.com/support/binding)

Trim size
- Digest (5.5×8.5 in) suits text-heavy quarterlies; full size (8.5×11 in) suits issues with larger art or photography. Common US magazine trims are 8.5×11 and 8.375×10.875. Most literary issues run 32–96 pages, with quarterlies clustering at 48–64. — [Publishing Xpress literary magazine guide](https://www.publishingxpress.com/blog/how-to-plan-a-literary-magazine-issue-for-print/)
- Both Offprint and Midjourney Magazine use 8.5×11. — [getoffprint.com](https://getoffprint.com/); [mag.midjourney.com/midjourneymag](https://mag.midjourney.com/midjourneymag)

Paper
- Text weights: 50 lb uncoated has noticeable show-through; 60 lb uncoated suits text-heavy literary magazines; 70 lb gloss is mid-range with better opacity; 80 lb gloss is "the industry standard for consumer magazines in 2026"; 100 lb gloss gives a premium feel for art magazines but adds cost and bulk. — [Publishing Xpress paper guide](https://www.publishingxpress.com/blog/how-to-choose-paper-stock-for-magazine-printing/)
- Finish: gloss makes colors pop but glares; matte or silk is easier to read under direct light and feels more premium; uncoated is softer and warmer and suits literary titles, but coated stock is needed for sharp, saturated photography. — [Publishing Xpress paper guide](https://www.publishingxpress.com/blog/how-to-choose-paper-stock-for-magazine-printing/)
- Metric ranges: "Most magazine interiors use paper between 115 and 170 GSM"; "covers typically range from 218 to 270 GSM." — [Ex Why Zed paper guide](https://exwhyzed.com/magazine-printing-paper/)
- Covers: 100 lb gloss cover is the standard recommendation; 100 lb matte/silk cover for a premium editorial look; 12–14 pt C2S board for rigid covers; the cover should be at least one grade heavier than the interior. Keep total ink coverage below 300% to limit show-through on light stock. — [Publishing Xpress paper guide](https://www.publishingxpress.com/blog/how-to-choose-paper-stock-for-magazine-printing/)
- Perfect-bound interiors typically use 70–80 lb text; thicker editions can use 80–100 lb. — [Publishing Xpress paper guide](https://www.publishingxpress.com/blog/how-to-choose-paper-stock-for-magazine-printing/)

Cover finishes
- Aqueous coating adds scratch resistance at small per-unit cost; lamination is the premium choice for durability or a tactile effect; soft-touch matte lamination is recommended for premium pieces. — [Publishing Xpress paper guide](https://www.publishingxpress.com/blog/how-to-choose-paper-stock-for-magazine-printing/); [Walsworth, digital finishing](https://www.walsworth.com/blog/digital-finishing-innovations)
- Digital foil needs no metal die, so it works for short runs; it is applied by printing toner over soft-touch lamination, with foil bonding only to toner areas. Spot UV reads best over a matte or soft-touch base. Scodix-type presses do raised spot varnish and die-less foil (search snippets only). — [Aura Print, digital foil](https://aura-print.com/usa/what-is-metallic-foil-printing); [Paperlust finishes guide](https://printshop.paperlust.co/blog?p=3565)
- Heavy ink coverage at the spine crease makes lamination adhesion problems more likely (search snippet only). — [IngramSpark file problems](https://help.ingramspark.com/hc/en-us/articles/6443532453901-File-Problems-that-Cause-Printing-Problems-of-a-Book)

Press type
- HP Indigo (liquid electro-ink; the source groups it with toner) vs production inkjet, per a book printer that runs both: Indigo has "higher print quality than inkjet"; "The Electro ink sits on top of the paper, and can often give you brighter colours with increased contrast"; inkjet "ink is water-based, and ink absorbs into the fibres, which tends to lower the brightness and contrast"; for black-only text "there will be minimal differences"; Indigo costs more and suits runs of about 1,000 or fewer. — [Friesens, inkjet vs toner](https://www.friesens.com/blog/digital-inkjet-vs-toner-whats-the-difference/)
- Vendors claim Indigo gives smoother tones and sharper images than dry-toner machines (vendor claims, search snippet only). — [Johnsons, HP Indigo](https://johnsonscards.co.uk/digital-for-short-runs/)

Print-on-demand quality problems and workarounds
- Stated trim tolerances: IngramSpark 1/16 in (about 2 mm); Amazon KDP 1/8 in (3.2 mm); Lulu 1/8 in (3.2 mm). — [AuthorImprints, Mar 2024](https://www.authorimprints.com/pod-print-quality-problem-examples/)
- Color can differ from the file and from copy to copy within one order (one order of ten books arrived in three different cover colors). Lightning Source allows ±0.1 color density variation (search snippet only). — [AuthorImprints](https://www.authorimprints.com/pod-print-quality-problem-examples/); [Lightning Source variations guide](https://help.lightningsource.com/hc/en-us/articles/5293923433229-Guide-for-Acceptable-Variations-in-Production)
- Most common complaint: cover elements misaligned, such as an off-center spine; cover color bleeding onto a contrasting spine. — [AuthorImprints](https://www.authorimprints.com/pod-print-quality-problem-examples/)
- Cover curl: reported as more common on gloss by one source and worse on matte by a forum author; humidity is the usual cause. — [AuthorImprints](https://www.authorimprints.com/pod-print-quality-problem-examples/); contradicted by [SFF Chronicles thread](https://sffchronicles.com/threads/586664)
- Workarounds: keep content well inside minimum margins (IngramSpark asks at least 0.25 in from trim on covers and 0.5 in on interior pages, search snippet only); avoid borders near edges; use a spine color that matches the front or back cover; avoid large solid-color interior pages if they print inconsistently; order a printed proof first; order spare copies. — [AuthorImprints](https://www.authorimprints.com/pod-print-quality-problem-examples/); [IngramSpark variances](https://help.ingramspark.com/hc/en-us/articles/6443509108365-Print-and-Binding-Variances-That-are-Allowed-in-the-Manufacturing-of-a-Book)

Turnaround
- Offprint: 10 business days from approval to mailbox for one-off copies. — [getoffprint.com](https://getoffprint.com/)
- UK short-run digital printer: perfect-bound jobs delivered in 5 days. A US printer quotes 6–8 weeks from final files to delivery for a quarterly's full cycle. — [Ex Why Zed](https://exwhyzed.com/magazine-printing-paper/); [Publishing Xpress literary guide](https://www.publishingxpress.com/blog/how-to-plan-a-literary-magazine-issue-for-print/)

### Inferences
- Recommended baseline for 80–150 pages at 100 copies: perfect bound with PUR glue; 80 lb (about 115–120 gsm) matte or silk coated text if art is full color on most spreads, or 70 lb premium uncoated if text dominates and art is line or limited-color; 100 lb cover or 12 pt board with matte or soft-touch lamination; printed on an HP Indigo-class press. This is an inference assembled from the sources above, not a single source's recommendation.
- Trim: 8.5×11 is the cheapest and most available, and is what Offprint and Midjourney use, but it reads as a commodity magazine. A smaller journal trim (for example 6×9 or 7×10) reads as more book-like and gives a thicker spine for the same word count, but it is not covered by the sources above and should be checked against each printer's standard sizes.
- At 80 pages on 80 lb text the spine is only a few millimeters, so spine text needs to be small or omitted; trim variance of 1/16–1/8 in is large relative to that spine. A wraparound cover image or a spine in the same color as the covers hides the drift.
- Soft-touch lamination and digital foil are available at 100 copies from some printers, but Offscreen's caution applies: one restrained finish (matte or soft-touch lamination) does more for perceived quality than several effects.
- Sewn (Smyth) binding is not realistic for a weekly at 100 copies; PUR with a hinge-scored cover is the nearest feasible substitute. Lay-flat is not needed for essay reading; avoid placing art across the gutter instead.
- For AI-generated art on digital presses: large flat color fields and smooth gradients are where digital banding and copy-to-copy color drift show; textured, painterly, or grainy images hide it. Converting to the printer's CMYK profile and proofing one copy before each run is the practical control. (General print-production reasoning; the searches found no independent testing of banding by press type.)
- A weekly cadence with 5–10 business days of print and ship time means issues will arrive one to two weeks after the essays are published. Offprint's 10-business-day figure is a realistic reference for per-recipient mailing.

### Gaps
- No independent, measured comparison of HP Indigo vs dry toner vs inkjet for banding and solid uniformity; only printer and vendor statements.
- Exact minimum page counts for PUR at specific online printers (Mixam and similar) were not retrievable.
- No sourced guidance on 6×9 or 7×10 trims for essay journals; no sourced numbers for gutter margins or minimum spine width for spine text.
- Minimum quantities and prices for soft-touch, spot UV, and foil on magazine covers at 100 copies: only business-card minimums and one anecdotal 100-copy magazine cover were found.
- Unit costs for an 80–150 page, 100-copy job were not gathered here (assumed to be covered by other researchers).

## 6. Rights and practical notes (reprinting web essays, AI art in a sold magazine)

### Takeaway
Paid Midjourney plans allow commercial use of generated images, but the images are public by default, Midjourney keeps a broad license to them, and purely AI-generated images are generally not copyrightable in the US. For essays, the clean route is written permission from each member; Offprint's "single private copy" position does not cover a magazine distributed to many people.

### Cited Findings
- Midjourney terms as quoted by a legal explainer (last updated February 2026): "You own all Assets You create with the Services to the fullest extent possible under current law." Paid subscribers on Basic, Standard, Pro, and Mega can sell their images commercially. — [Terms.law Midjourney guide](https://terms.law/ai-output-rights/midjourney/)
- Revenue rule: a company (or its employee) with more than $1,000,000 USD a year in revenue must be on a Pro or Mega plan to own its assets. Sources differ on whether this gates ownership or all commercial use. — [Terms.law Midjourney guide](https://terms.law/ai-output-rights/midjourney/); [ConductAtlas ToS tracker](https://conductatlas.com/platform/midjourney/midjourney-terms-of-service/revenue-based-asset-ownership-threshold/)
- Non-paying users get only a Creative Commons Noncommercial 4.0 Attribution license; Midjourney owns those images. — [Terms.law Midjourney guide](https://terms.law/ai-output-rights/midjourney/)
- Users grant Midjourney a "perpetual, worldwide, non-exclusive, sublicensable no-charge, royalty-free, irrevocable copyright license" to prompts and outputs. Images are public by default; Stealth Mode is limited to Pro and Mega. — [Terms.law Midjourney guide](https://terms.law/ai-output-rights/midjourney/)
- US copyright: in the 2023 *Zarya of the Dawn* decision the Copyright Office said "Midjourney users lack sufficient control over generated images to be treated as the 'author' for copyright purposes." Human-authored arrangement, text, and modifications can still be protected. Contract terms bind Midjourney users only, so stopping third parties from copying AI images is hard. — [Terms.law Midjourney guide](https://terms.law/ai-output-rights/midjourney/)
- Offprint's content position, for contrast: users may send "only content that you have lawful access to and that you have the rights or permissions needed"; "Each magazine is a single private copy, printed once, mailed only to the reader who requested it"; takedown requests are honored. — [Offprint terms](https://getoffprint.com/terms)
- Offprint's Creator Edition model has the writer select their own posts, and the Lenny edition includes guest-authored posts with bylines and states the curator makes no money from sales. — [getoffprint.com/lenny](https://getoffprint.com/lenny)
- Kernel compensated contributors from subscription revenue and treated that as the main reason for charging. — [Reboot, Kernel launch](https://joinreboot.org/p/kernel-launch)

### Inferences
- For a club magazine distributed to about 100 people (and possibly sold), each writer should give explicit permission for a non-exclusive print reprint of the essay or excerpt, with the writer keeping copyright. This is ordinary publishing practice and simple to collect with a checkbox; it is my inference, not a quoted legal source.
- Essays first published on a platform (Substack, personal site) normally remain the author's to license, but pieces first published in another outlet may be under that outlet's terms; ask writers to confirm they hold reprint rights.
- Midjourney images made on any paid plan can be printed in a sold magazine if the organization is under the $1M revenue threshold; if the publishing entity is a larger organization, confirm whether a Pro or Mega plan is required. Since the images are not copyrightable on their own, others could reuse them; this matters little for a club magazine.
- Label AI-generated art as such in the colophon and offer writers the option to supply or approve their piece's art; given the "soulless" reaction to Midjourney's own magazine and the goal that every writer is proud of the artifact, writer approval of the art is a quality control as much as a rights issue.
- Avoid prompts that name living artists or reproduce recognizable characters or logos; those raise separate rights issues regardless of Midjourney's terms.

### Gaps
- Midjourney's official Terms of Service page returned HTTP 403, so the quotes above come from a secondary legal site (updated February 2026) and a terms-tracking site. Verify against the live terms before selling copies.
- No research was done on other image generators' terms, on non-US copyright rules for AI images, or on sales tax and shipping compliance for selling a magazine.
- Nothing here is legal advice; no source specific to anthology or club-magazine reprint permissions was consulted.
