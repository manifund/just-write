# File formats, prepress requirements, and HTML/CSS-to-print-PDF tooling for a short-run magazine

Research date: 2026-11-10. Notes on method and reliability:

- "Fetched" means I read the page itself. "Search snippet" means the provider's own page returned HTTP 403 to my fetcher (Peecho, Mixam, Blurb support, Midjourney docs all did), so the text comes from a search engine's quote of that official page. Treat snippet-sourced numbers as likely right but re-check them on the page before ordering.
- The Lulu Book Creation Guide was downloaded and text-extracted locally (its embedded cover template is dated 2025-12-11, so it is a current edition).
- Anything marked "training knowledge" is from my own background knowledge, not confirmed by a source in this session.

## 1. File specs: what Lulu, Blurb, Peecho, Mixam and US short-run digital printers require

### Takeaway

Every provider wants a PDF of single pages (not spreads) at trim size plus 0.125 in (3 mm) bleed, fonts embedded, images at 300 ppi, and usually no crop marks; the cover is normally a separate one-piece spread (back + spine + front) whose spine width comes from the printer's calculator. Colour rules split two ways: the print-on-demand services (Lulu, Peecho, Blurb) accept or prefer sRGB and convert on their side, while Mixam and US short-run printers ask for CMYK (GRACoL) but will auto-convert RGB on upload, so an RGB PDF from a browser is usable at most of them, with some colour-shift risk.

### Cited Findings

**Lulu (fetched: API help page and Book Creation Guide)**

- Interior: "All content for the interior of your book should be in a single PDF"; "Your PDF should be single-page layout"; "Images should be 300 ppi resolution"; "All fonts should be embedded or converted to outlines"; "Flatten all transparent layers and vector objects"; "Include the bleed dimensions of 0.125 in"; "Allow a 0.50 in Safety Margin for all content"; "Allow a minimum 0.20 in Gutter margin"; "Do NOT include trim or bleed marks in your PDF"; no password protection. Odd pages print on the right. — [Lulu API help: PDF creation settings](https://help.api.lulu.com/en/support/solutions/articles/64000254609-pdf-creation-settings)
- Cover: "a one piece PDF that includes the back cover, spine, and front cover"; images "300 PPI resolution minimum, not exceeding 600 PPI"; 0.125 in bleed; minimum 0.25 in safety margin (the Book Creation Guide says 0.5 in). — [Lulu API help](https://help.api.lulu.com/en/support/solutions/articles/64000254609-pdf-creation-settings); [Lulu Book Creation Guide PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)
- Colour: "Our printers prefer files created using sRGB color space and can convert this to rich CMYK." "If your file was created in CMYK, we recommend keeping this color space when exporting." The guide adds: "advances in printing workflows have eliminated the need to convert from RGB to CMYK. For most projects, either color space will print without issue," and tells new projects to "set up your document as an RGB file." Printer profiles: RGB = sRGB IEC61966-2.1, CMYK = Coated GRACoL 2006. — [Lulu API help](https://help.api.lulu.com/en/support/solutions/articles/64000254609-pdf-creation-settings); [Lulu Book Creation Guide PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)
- Ink: "Solid blacks will print solid at 100% with no other colors added"; "TAC (total area coverage) should never exceed 270%"; avoid tints under 20%; greyscale images should be in a greyscale colour space with gamma 2.2–2.4. — [Lulu Book Creation Guide PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)
- No PDF/X standard, PDF version, or file size limit is stated on the Lulu API settings page. — [Lulu API help](https://help.api.lulu.com/en/support/solutions/articles/64000254609-pdf-creation-settings)
- Bleed handling: files with no edge-to-edge content can be supplied at trim size and Lulu adds the 0.125 in bleed itself; full-bleed files must be trim + 0.25 in each dimension (6 x 9 in -> 6.25 x 9.25 in; 7 x 10 -> 7.25 x 10.25; 8.5 x 11 -> 8.75 x 11.25). — [Lulu Book Creation Guide PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)
- Paperback spine width: "(# of Interior Pages / 444) + 0.06 in" (mm: pages / 17.48 + 1.524). Paperbacks need at least 32 interior pages. "Coil Bound and Saddle Stitch books do not require spine calculations." No spine text if the book is 80 pages or fewer; keep 0.125 in between spine text and spine edge; trimming tolerance is 0.125 in. — [Lulu Book Creation Guide PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)
- Gutter table (add to the inside margin only): under 60 pages 0 in (0.5 in total inside margin); 61–150 pages +0.125 in (0.625 in total); 151–400 pages +0.5 in (1 in total). Saddle stitch and coil need no gutter. — [Lulu Book Creation Guide PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)
- Magazines and comic books can print on the inside front and back cover; that "requires a two-page cover file." — [Lulu Book Creation Guide PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)
- A magazine spine formula of (page count / 460) + 0.06 in appears in third-party copies of the guide; it is not in the current official guide I extracted, so it is unconfirmed. — [search result over Lulu guide copies, e.g. Scribd](https://www.scribd.com/document/615961952/lulu-book-creation-guide)
- Lulu "scan[s] and analyze[s]" uploads and makes "slight adjustments," and says its system "will detect and repair many" problems such as low resolution, transparency and unembedded fonts. — [Lulu Book Creation Guide PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf)

**Peecho (search snippets of the official support articles; product page fetched)**

- "Save your print file as one PDF document containing both the cover and content as single pages"; double-page spreads are not accepted. — [Peecho: Magazines file set up guideline](https://support.peecho.com/hc/en-us/articles/19746186078876-Magazines-File-set-up-guideline)
- Do not add bleed or cut marks; Peecho's system generates them. Keep a minimum 10 mm margin on all sides of cover and content pages. — [Peecho: Magazines file set up guideline](https://support.peecho.com/hc/en-us/articles/19746186078876-Magazines-File-set-up-guideline)
- 300 dpi; colour profile RGB; export "with a PDF / X-4 Profile (coated FOGRA 39)"; fonts embedded; transparencies flattened. — [Peecho: Magazines file set up guideline](https://support.peecho.com/hc/en-us/articles/19746186078876-Magazines-File-set-up-guideline)
- Magazines are perfect bound only, 20–500 pages (one snippet says 18–500), even page count; 115 gsm silk-coated interior, 250 gsm laminated cover, HP Indigo presses; size follows the PDF's aspect ratio (must be between 0.34 and 1.54, read from the first page). — [Peecho magazines product page](https://www.peecho.com/products/magazines); [Peecho: Magazines file set up guideline](https://support.peecho.com/hc/en-us/articles/19746186078876-Magazines-File-set-up-guideline)
- Spine is blank/white by default. A printed spine is only available with a Merchant account (not "Upload & Order"); the dashboard computes spine size and states the exact PDF dimensions to upload. — [Peecho: How do I add the spine](https://support.peecho.com/hc/en-us/articles/360010630800-How-do-I-add-the-spine)

**Mixam (search snippets of official support pages)**

- Bleed 0.125 in on most products (UK: 3 mm); hardcover covers 0.8 in (20 mm). Quick reference: 0.25 in quiet area and 0.5 in binding area for perfect bound (PUR) books. "Every file you upload ... must include a 0.125" bleed, a 0.25" quiet area and a 0.5" gutter margin." — [Mixam Print File Setup Guide](https://mixam.com/support/filesetup); [Mixam FAQs](https://mixam.com/frequently-asked-questions)
- Colour: recommends CMYK from the start, preferred profile GRACoL2006_Coated1v2. "If you cannot alter your files, our system automatically converts the colors in your files to the closest CMYK values on upload." "RGB files may produce unexpected results when printed." — [Mixam Print File Setup Guide](https://mixam.com/support/filesetup)
- Checklist: export PDF/X-4, CMYK, bleed, embedded fonts, final page size, no template guides, no crop marks. — [Mixam Print File Setup Checklist](https://mixam.com/support/checklist)
- Inside pages may be uploaded "as a multi-page PDF, single pages, or double-page spreads," in reading order, including blank pages. — [Mixam: How to prepare and upload print files](https://mixam.com/support/file-upload-guide)
- Perfect-bound cover: one PDF spread at 300 dpi with back cover, spine and front cover; spine dimensions are shown in the cart / Artwork tab; add 0.125 in bleed to the top and bottom of the spine; a spine with no file is left blank. — [Mixam perfect bound books](https://mixam.com/perfectbooklets)
- Page count: the multiple-of-4 rule applies to perfect-bound, hardcover and saddle-stitched bindings (blank pages are added to reach it); perfect binding needs a minimum page count or paper thickness (no number given). — [Mixam UK: page count](https://mixam.co.uk/support/pagecount)

**Blurb (product pages fetched; support article via search snippet; some guides date from c. 2010)**

- Magazine format: 8.5 x 11 in only, perfect bound, from $7.00 for one 20-page copy, volume discounts at 10+ copies. — [Blurb magazines](https://www.blurb.com/magazines)
- PDF to Book rules: even page count; cover is a separate single-page document made after the page count is final; "100% black ink for text"; no spot or registration colour; no registration or trim marks; rasterise complex vectors; an optional Blurb ICC profile for advanced users; magazine minimum 20 pages. — [Blurb PDF to Book](https://www.blurb.com/pdf-to-book)
- The PDF must match the "Final, exported PDF" measurements from Blurb's spec calculator for the chosen size, paper and cover; take bleed from that tool rather than computing it. Upload limits: 2 GB for pages, 90 MB for the cover. Magazines 24–240 pages (conflicts with the 20-page minimum on the PDF to Book page). — [Blurb: PDF to Book specifications and checklist](https://support.blurb.com/hc/en-us/articles/207792946-PDF-to-Book-specifications-and-checklist)
- Blurb's (older, c. 2010) guides require PDF/X-3:2002, and state the PDF version must be 1.3 to pass preflight. — [Blurb: A Few Things to Know (2010)](https://blurb.com/downloads/pdf_to_book/FewThingsToKnow.pdf)
- Blurb's Affinity Publisher guide says the most common error is the inner bleed for pages, which must be 0 (bleed on three outer edges only). — [Blurb: Affinity Publisher PDF files](https://support.blurb.com/hc/en-us/articles/360044955872-Affinity-Publisher-PDF-files)
- Lightroom's built-in Blurb export uses 300 ppi and the sRGB profile. — [Adobe: Use Blurb and profiles](https://helpx.adobe.com/lightroom-classic/kb/using-blurb-profiles-lightroom.html)

**PrintingCenterUSA (fetched)**

- "We prefer PDF over all other file formats." "We require that any multi-page PDF files be sent as single page images, not spreads." Page 1 is the front cover, the last page the back cover. "We ask for NO crop marks to be saved on your PDF." — [PrintingCenterUSA file preparation](https://www.printingcenterusa.com/help/file-preparation)
- Bleed 1/8 in (PDF 0.25 in larger than trim in each dimension); safe area at least 1/8 in inside trim; 300 dpi optimal, 180 dpi and up "generally print acceptably." — [PrintingCenterUSA file preparation](https://www.printingcenterusa.com/help/file-preparation)
- "Any file that is printed on a printing press must be converted to CMYK"; profile GRACoL2013_CRPC6.icc; no Pantone/spot. Rich black build 60C/50M/40Y/100K for large areas only, not body text (it is stripped from text under 14 pt where possible). Fonts to outlines; transparencies flattened; never use the Registration swatch. Lines of 0.25 pt or less and text under 8 pt may not print clearly. — [PrintingCenterUSA file preparation](https://www.printingcenterusa.com/help/file-preparation)
- Non-CMYK files are converted from RGB automatically. Perfect bound: minimum 28 pages, up to 2 in thick, ordered in 2-page increments; spine from their spine calculator, designable only above 1/8 in; crossovers discouraged because of the gutter. — [PrintingCenterUSA paperback book printing](https://printingcenterusa.com/printing/paperback-book-printing); [PrintingCenterUSA perfect binding](https://www.printingcenterusa.com/perfect-binding)

**Smartpress (fetched setup page; template pages via search snippet)**

- PDF preferred, 1-up (un-imposed), both sides in one PDF, page 1/4 in wider and taller than trim with artwork centred, and (unlike the others) "Place crop marks on all four corners." — [Smartpress: How to set up your file](https://smartpress.com/support/file-preparation/how-to-setup-your-file)
- Perfect bound booklets need two files (cover with front, back and spine; interior); 0.125 in bleed; interior page count divisible by two; spine width listed on the product page; one 8 x 8 template specifies a 0.375 in safe margin on the spine side and 0.25 in elsewhere. — [Smartpress perfect bound interior template](https://smartpress.com/support/directmail_perfectboundbooklet_interior_8x8-2); [Smartpress cover template](https://smartpress.com/support/directmail_perfectboundbooklet_cover_8x8-2)

**Printivity (search snippets of its guides)**

- "0.5 inches for your gutter margin is the best recommendation for most books"; 1/8 in bleed; a perfect-bound cover spread is two page widths plus the spine; work in CMYK for colour. — [Printivity: gutter margins](https://www.printivity.com/insights/how-to-design-for-gutter-margins); [Printivity: designing perfect bound books](https://www.printivity.com/insights/designing-perfect-bound-books)

**General**

- Other printers treat multiples of 4 as a saddle-stitch rule and require only an even count (multiple of 2) for perfect binding. — [Jukebox Print: how to calculate the number of pages](https://intercom.help/jukeboxprint/en/articles/3190071-how-to-calculate-the-number-of-pages)
- PDF/X-1a and X-3 forbid transparency; PDF/X-4 allows it. X-1a allows only grey, CMYK and spot colours; X-3 and X-4 allow device-independent (ICC-tagged) colour with an output intent. X-1a:2001 and X-3:2002 are PDF 1.3; X-4 is PDF 1.6. — [Prince: PDF output profiles](https://www.princexml.com/doc/prince-output/); [Prince: colour management](https://www.princexml.com/doc/graphics/)

### Inferences

- Summary of who accepts what (derived from the findings above):

| Provider          | PDF standard asked for             | Colour                                          | Interior                         | Cover                                       | Marks             |
| ----------------- | ---------------------------------- | ----------------------------------------------- | -------------------------------- | ------------------------------------------- | ----------------- |
| Lulu              | none stated (job options supplied) | sRGB preferred; CMYK kept if already CMYK       | single pages, bleed on all sides | separate one-piece spread                   | none              |
| Peecho            | PDF/X-4 (FOGRA39) recommended      | RGB                                             | single pages, no bleed           | same PDF as content                         | none              |
| Mixam             | PDF/X-4                            | CMYK (GRACoL 2006) preferred; auto-converts RGB | pages or spreads                 | separate spread with spine                  | none              |
| Blurb             | PDF/X-3:2002 (older docs)          | sRGB or CMYK                                    | single pages, outer bleed only   | separate file                               | none              |
| PrintingCenterUSA | plain PDF                          | CMYK (GRACoL 2013); auto-converts RGB           | single pages                     | cover pages in the same PDF, spine separate | none              |
| Smartpress        | plain PDF                          | not confirmed                                   | single pages, 1-up               | separate file                               | crop marks wanted |

- A browser-generated sRGB PDF is directly usable at Lulu and Peecho, which state a preference for RGB. For Mixam and US short-run printers it will be accepted and converted, but colour is less predictable; converting to CMYK yourself with the printer's named profile gives more control.
- Bleed conventions differ in ways that affect the layout code: Lulu wants bleed on all four sides of every page (6.25 x 9.25 in for 6 x 9), Blurb wants none on the inside edge, and Peecho wants none at all. The page-size and bleed settings should be per-printer export options, not hard-coded.
- For a 100–150 page perfect-bound issue, an inside margin of about 0.625–0.75 in covers Lulu's table (0.625 in total at 61–150 pages) and the 0.5 in gutter that Mixam and Printivity ask for. Images crossing the gutter are discouraged.
- Using Lulu's formula, paperback spine widths are about 0.24 in at 80 pages, 0.29 in at 100, 0.33 in at 120 and 0.40 in at 150. Lulu advises no spine text at 80 pages or fewer, so issues near the low end should have a plain spine. Spine width is paper-dependent and differs by printer, so the cover has to be regenerated after the page count and printer are fixed.
- Page count should be rounded to a multiple of 4 to keep saddle stitch and Mixam open as options; a perfect-bound-only plan needs only an even count at most printers.
- Body text should be 100% K only (Lulu, Blurb, and PrintingCenterUSA all say so in different words), with rich black limited to large solid areas and total ink kept under roughly 270%. A browser emits black text as RGB 0,0,0, so whether it prints as K-only depends on the printer's RGB conversion or on a conversion step that maps neutral RGB to K.
- Lulu and Blurb ask for transparency to be flattened, but Lulu says it repairs many such issues automatically; PDF/X-4 (Peecho, Mixam) permits live transparency. Flattening is mainly a concern when a printer demands PDF/X-1a or X-3.

### Gaps

- Mixam's, Peecho's, Blurb's support pages and the Midjourney docs blocked automated fetching (HTTP 403); their figures above come from search-engine quotes and were not read in full context.
- No published spine formula was found for Mixam, Blurb, Peecho, Smartpress, Printivity or PrintingCenterUSA; each gives the spine through a calculator or the order page, and it depends on the paper chosen.
- Lulu's magazine-specific spine formula, saddle-stitch page limits, and maximum file size were not confirmed from an official current source.
- Blurb's current colour requirements are unclear: the PDF/X-3:2002 and PDF 1.3 requirements come from 2010-era guides, and the minimum magazine page count is given as both 20 and 24.
- Total ink coverage limits were found only for Lulu (270%). Smartpress's colour-space and rich-black rules are on pages I did not reach.
- No source was found for a hard requirement on transparency flattening at Mixam, or for whether Peecho's "no bleed" rule means it scales the page up to create bleed.

## 2. Image resolution: pixels needed, Midjourney output, upscalers

### Takeaway

A full-bleed page at 300 ppi needs roughly 1875 x 2775 px (6 x 9), 2175 x 3075 px (7 x 10) or 2625 x 3375 px (8.5 x 11); Midjourney's standard 2x-upscaled or V8.1 HD output is about 2048 px on the long-ish side, which is roughly 210–270 ppi on a full page, so it is close but short of 300 ppi and needs one more upscale for full-page and cover art.

### Cited Findings

- Printers' resolution rules: Lulu 300 ppi ideal, 150 ppi the "minimum resolution for simple graphics intended for print," and not above 600 ppi; PrintingCenterUSA 300 dpi optimal, 180 dpi and up "generally print acceptably." — [Lulu Book Creation Guide PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf); [PrintingCenterUSA file preparation](https://www.printingcenterusa.com/help/file-preparation)
- Midjourney's upscalers page (search snippet): images start at 1024 x 1024 px at the default aspect ratio, and the Subtle and Creative upscalers bring them to 2048 x 2048 px. Other ratios in its table: 4:3 goes from 1232 x 928 to 2464 x 1856; 16:9 from 1456 x 816 to 2912 x 1632. — [Midjourney docs: Upscalers](https://docs.midjourney.com/docs/upscalers)
- The same page says V8.1 "can generate 2k resolution images using --hd"; the models page says V8.1 offers HD "2K images, without upscaling," with a maximum aspect ratio of 14:1 (4:1 for HD), and that --hd with --q 4 costs 16x more GPU time. — [Midjourney docs: Upscalers](https://docs.midjourney.com/docs/upscalers); [Midjourney docs: Models](https://docs.midjourney.com/docs/models)
- Midjourney's Image Size & Resolution article recommends third-party tools when more pixels are needed for printing. — [Midjourney: Image Size & Resolution](https://docs.midjourney.com/hc/en-us/articles/33329374594957-Image-Size-Resolution)
- Third-party guides say the built-in upscale in V6/V7 is limited to 2x and that a 4x option exists only on V5.2. Unofficial. — [Aiarty Midjourney upscale guide](https://www.aiarty.com/ai-upscale-image/midjourney-upscale.htm)
- Upscaler roundups (low-reliability review sites, several with affiliate incentives) broadly agree: Topaz Gigapixel is the usual pick for photos and print and runs locally; Magnific is favoured for AI-generated art because it adds texture, but generative upscalers "can invent detail that was never in the original"; Real-ESRGAN (for example through the free Upscayl desktop app) is the free local option. — [Chase Jarvis: best AI image upscaler](https://chasejarvis.com/blog/best-ai-image-upscaler/); [LetsEnhance: best upscalers for large prints](https://letsenhance.io/blog/all/best-upscalers-large-prints)

### Inferences

- Pixel targets at 300 ppi with 0.125 in bleed on all sides (my arithmetic):

| Use                                         | Size with bleed  | Pixels at 300 ppi |
| ------------------------------------------- | ---------------- | ----------------- |
| 6 x 9 page                                  | 6.25 x 9.25 in   | 1875 x 2775       |
| 7 x 10 page                                 | 7.25 x 10.25 in  | 2175 x 3075       |
| 8.5 x 11 page                               | 8.75 x 11.25 in  | 2625 x 3375       |
| 8.5 x 11 double-page spread                 | 17.25 x 11.25 in | 5175 x 3375       |
| 6 x 9 cover wrap, 120 pages (0.33 in spine) | 12.58 x 9.25 in  | about 3775 x 2775 |
| 8.5 x 11 cover wrap, 120 pages              | 17.58 x 11.25 in | about 5275 x 3375 |

- A 3:4 Midjourney image at 2x (1856 x 2464 px, by symmetry with the documented 4:3 size) covers a 6.25 x 9.25 in page at about 266 ppi and an 8.75 x 11.25 in page at about 212 ppi. A 16:9 image at 2912 px wide covers an 8.5 x 11 spread at about 169 ppi. All clear the 150–180 ppi floors printers quote, but not 300 ppi.
- A further 1.5–2x pass in a dedicated upscaler brings any of these to 300 ppi. Half-page or smaller art (under about 6.8 in on the long side) is already at 300 ppi from a 2048 px image.
- Images pulled from the essays themselves are the bigger risk: web-optimised images are often 1000–1500 px wide, which is 300 ppi only up to about 3.5–5 in.

### Gaps

- Exact V8.1 HD pixel dimensions per aspect ratio are not stated in the official snippets ("2K" only). Which version is the current default (V8.1 or a later one) is disputed between unofficial sources.
- I found no rigorous, independent comparison of upscalers for print; the roundups cited are marketing-adjacent.
- Whether Midjourney's current web editor offers an upscale beyond 2x was not confirmed.

## 3. HTML/CSS-to-print-PDF tooling, status as of 2026

### Takeaway

No browser-based route produces CMYK or PDF/X on its own: headless Chromium (alone or with Paged.js or Vivliostyle) gives a good RGB PDF and the best live preview, while Prince (and DocRaptor, which hosts it) and now WeasyPrint give real CMYK/PDF/X output and better print typography but no native in-browser preview. For a React/Next.js site the practical choice is between (a) Chromium-based rendering with a preview in the same app and an RGB PDF, optionally post-processed, and (b) the same HTML sent to Prince/DocRaptor or WeasyPrint for the final file.

### Cited Findings

**Chromium's native paged media**

- Chrome 131 (blog post dated 2024-10-30) added @page margin boxes: all 16 boxes, the `content` property, and the `page` and `pages` counters. Before that Chrome and Firefox supported @page only for size and margins. — [Chrome for Developers: print margins](https://developer.chrome.com/blog/print-margins)
- The same post lists as not yet supported, each with an open Chromium bug: `string-set`/`string()` (running headers), `target-counter` (page-number cross-references), and footnotes via `float: footnote`. — [Chrome for Developers: print margins](https://developer.chrome.com/blog/print-margins)
- A search result describes a public Chromium design doc dated July 2026 proposing `target-counter()`; I could not open the document, and found no evidence that string-set, target-counter or footnotes have shipped. — [Chromium design doc (unverified)](https://docs.google.com/document/d/18X4eoP951v-_sltAv4eVAumS9jqSW9I0StA57FfnyoA)
- Firefox still has an open bug for @page margin boxes. — [Mozilla bug 856371](https://bugzilla.mozilla.org/show_bug.cgi?id=856371)
- Chrome offers no way to specify a colour space or print profile when emitting a PDF; Skia has colourspace transforms but Chromium does not connect them to CSS (developer comment, March 2024). — [Hacker News thread](https://news.ycombinator.com/item?id=39670470)
- Browser line breaking is greedy, which the Hypermedia Systems authors cite as producing weaker typesetting than TeX-style algorithms. — [Building the new Hypermedia Systems](https://deniz.aksimsek.tr/2024/new-hypermedia-systems)

**Paged.js**

- A polyfill that paginates in the browser; supports `size`, margins, `:left`/`:right`/`:first`/`:blank`/`nth()`, `bleed` (e.g. `bleed: 6mm`) and `marks: crop cross`. One page size per document. — [Paged.js docs: web design for print](https://pagedjs.org/en/documentation/5-web-design-for-print/)
- Its preview shows facing pages in the browser "the same way you would see those in the classic book design applications." — [Paged.js W3C workshop position paper](https://lists.w3.org/Archives/Public/public-css-print/2020JanMar/att-0019/position-paper-w3C-workshop.html)
- Maintenance: latest stable on npm is 0.4.3 (published 2023-07-06); latest beta is 0.5.0-beta.2 (2024-10-04); nothing newer in the registry. The GitHub repository shows no releases. — [npm registry: pagedjs](https://registry.npmjs.org/pagedjs); [GitHub: pagedjs releases](https://github.com/pagedjs/pagedjs/releases)
- A May 17, 2025 post announced a new maintainer group (Julien Taquet, Gijs de Heij; Fred Chasen has less time), a move to GitHub, a one-year NGI Zero grant for a structural update, a joint "Pushing forward for CSS Print" project with WeasyPrint, and a breaking 2.0. Coko no longer funds it. — [Paged.js: a new chapter](https://pagedjs.org/posts/en/a-new-chapter-in-paged.js-life/); [NLnet: Paged.js](https://nlnet.nl/project/PagedJS/)
- Reported problems in book production (asciidoctor-web-pdf + Paged.js): "slow, buggy, and machine-dependent"; page numbers resetting to 0; the back half printing blank unless scrolled first; bad breaks in asides and code blocks; very large PDFs. — [Building the new Hypermedia Systems](https://deniz.aksimsek.tr/2024/new-hypermedia-systems)
- Colour is whatever the browser emits; Paged.js "will pass it through without messing with it." — [Hacker News thread](https://news.ycombinator.com/item?id=39670470)

**Vivliostyle**

- Products: Viewer (typesets HTML in the browser), CLI (latest major v10, dated 2025-12-21, added a `create` command), Pub (alpha), Core. Received an NLnet grant in July 2025. — [vivliostyle.org](https://vivliostyle.org/)
- CLI: `build` outputs PDF/EPUB; `preview` runs a preview server; `-m, --crop-marks`; `--bleed` (default 3 mm); `--crop-offset` (default 13 mm + bleed); `-p, --press-ready` for PDF/X-1a; Vite config integration; selectable browser (Chrome or Firefox). — [Vivliostyle CLI README](https://github.com/vivliostyle/vivliostyle-cli)
- PDF/X-1a comes from `--preflight press-ready`, which requires Docker (a local variant exists; Docker is recommended). — [Vivliostyle CLI: special output settings](https://docs.vivliostyle.org/en/cli/special-output-settings/)
- Newer built-in post-processing: `pdfPostprocess.cmyk` swaps RGB values for CMYK after the browser writes the PDF, supports `device-cmyk()` in CSS, an RGB-to-CMYK map for SVG, fallback conversion via a built-in or ICC-based converter, and image replacement; `pdfPostprocess.pdfx` labels the file as X-4 or X-1a:2003 with an output intent but "does not convert content." Stated limits: gradients are not converted; rasterised or filtered elements may be skipped; mixing `rgb()` and `device-cmyk()` blacks can collapse both to K100; the docs say to verify with the print provider's preflight and suggest Ghostscript's `ink_cov` device. The CMYK feature does not integrate with the press-ready path. — [Vivliostyle CLI: special output settings](https://docs.vivliostyle.org/en/cli/special-output-settings/)

**Prince**

- Current version is Prince 17. — [Prince documentation](https://www.princexml.com/doc/)
- Pricing: Desktop $495; Server $3,800 one-time per server ($1,900 academic); commercial site licences from about $2,000 per year by quote; "Prince for Books" is under development with no listed price. — [Prince purchase page](https://www.princexml.com/purchase/)
- A free Non-commercial License exists and may be used on a server. It puts a logo in the upper right corner of the first page that may not be removed, and requires a link to princexml.com. Documents must be free of charge and not generate other income (subscription fees count as income); printed books may be distributed free or at the cost of printing. — [Prince license FAQ](https://www.princexml.com/purchase/license_faq/)
- Output profiles: PDF/X-1a:2001/2003, X-3:2002/2003, X-4, X-4p, PDF/A-1/2/3, PDF/UA-1, selected with `--pdf-profile`; `--pdf-output-intent` sets the ICC output intent. — [Prince: PDF output](https://www.princexml.com/doc/prince-output/)
- Colour: `device-cmyk()` passes through; RGB-to-CMYK conversion via `--convert-colors` to the output intent (automatic for PDF/X-1a); `use-true-black` (the default) makes RGB greys K-only, so black text lands on the K plate; `use-rich-black` is the alternative; untagged RGB images are treated as sRGB; overprint and spot colours are supported. — [Prince: colour management](https://www.princexml.com/doc/graphics/)
- Trim and bleed are set with the CSS `prince-trim` and `prince-bleed` properties (Prince forum, via search snippet). — [Prince forum](https://www.princexml.com/forum/topic/2192?post=9659)

**DocRaptor**

- Hosted API that runs Prince ("the only HTML to PDF API that uses the Prince PDF generator"); lists "convert to CMYK," printer's marks, PDF profiles and full-bleed PDFs; unlimited watermarked test documents and a public test key; one price per document regardless of size. — [DocRaptor](https://docraptor.com/)

**WeasyPrint**

- Version 70.0 documentation: @page with `:left`/`:right`/`:first`/`:blank`/`:nth()`, margin boxes, named pages, `string-set`, running elements, `target-counter()`, footnotes (`float: footnote`), bookmarks; `size`, `bleed` and `marks`; multi-column with `column-span` (constrained-height columns unsupported; column pagination "not seriously tested"); hyphenation via Pyphen (`hyphens: auto` plus `lang`), `hyphenate-limit-chars`. — [WeasyPrint 70 API reference](https://doc.courtbouillon.org/weasyprint/stable/api_reference.html)
- PDF variants now include PDF/X (x-1a, x-3, x-4, x-5g) alongside PDF/A and PDF/UA, with `--output-intent`, `device-cmyk()` and the `@color-profile` at-rule. Flexbox and grid work "for simple use cases." The docs warn that variant output is not guaranteed valid. — [WeasyPrint 70 API reference](https://doc.courtbouillon.org/weasyprint/stable/api_reference.html)
- CMYK is recent: the August 2024 post for version 63 said CMYK was not yet supported. — [CourtBouillon: more colors in WeasyPrint](https://www.courtbouillon.org/blog/00052-more-colors-in-weasyprint/)
- April 2026 issue (WeasyPrint 68.1): a print manufacturer's preflight rejected an all-CMYK PDF/X-4 file ("Your file contains images in RGB") because WeasyPrint writes the transparency group colour space as DeviceRGB on every page. Closed as a duplicate with a draft fix on a branch; the reporter's workaround is patching `/Group /CS` with pikepdf. — [WeasyPrint issue #2723](https://github.com/Kozea/WeasyPrint/issues/2723)

**Typst**

- Documented version 0.15.1. PDF export supports PDF 1.4–2.0, all PDF/A variants and PDF/UA-1; PDF/X is not mentioned. — [Typst docs: PDF](https://typst.app/docs/reference/pdf/)
- Has native `cmyk()` colours ("useful if you want to target a specific printer"); CMYK is not supported with PDF/A output; nothing documented on ICC profiles. — [Typst docs: color](https://typst.app/docs/reference/visualize/color/)
- Its PDF backend (krilla) lists PDF/A and PDF/UA-1 export modes and notes PDF/X is not supported. — [krilla](https://github.com/LaurenzV/krilla)
- Crop, bleed and registration marks come from a third-party package (Markly), not the core. — [Typst Universe: markly](https://typst.app/universe/package/markly)
- HTML export is experimental, behind a feature flag: "Do not use this feature for production use cases." The docs describe HTML only as an output. — [Typst docs: HTML](https://typst.app/docs/reference/html/)
- Hypermedia Systems moved to Typst for better line breaking and scripting; content was converted with Pandoc (DocBook to Typst) and needed manual cleanup; their web edition is produced by converting Typst to HTML with Pandoc. — [Building the new Hypermedia Systems](https://deniz.aksimsek.tr/2024/new-hypermedia-systems)

**react-pdf (@react-pdf/renderer)**

- Has built-in hyphenation (Liang algorithm, en-US by default, other languages or a custom callback can be registered). — [react-pdf docs: hyphenation](https://react-pdf.org/docs/v4/advanced/hyphenation)
- One production comparison recommends it over Puppeteer on Vercel because it needs no browser binary. — [dev.to: Puppeteer vs @react-pdf/renderer](https://dev.to/iurii_rogulia/pdf-generation-on-the-server-puppeteer-vs-react-pdfrenderer-a-production-comparison-44cg)

**InDesign / Affinity**

- InDesign Server is sold as an annual term licence; Adobe's buying guide lists prices of $13,500, $5,000 and $2,100 (search snippets associate these with Limited, Development and Trial licences respectively; mapping not verified). — [Adobe InDesign Server buying guide](https://www.adobe.com/products/indesignserver/buying-guide.html)
- Affinity (now one app from Canva) is free, with all layout tools and export options included; reviews list Data Merge among its layout tools. — [Creative Bloq: Affinity by Canva review](https://www.creativebloq.com/design/design-software/affinity-by-canva-review-free-is-the-magic-number); [Printweek](https://printweek.mydigitalpublication.co.uk/articles/canva-s-free-affinity-app-shakes-up-design-market)
- A PrintPlanet forum user reported testing PDF/X-4 export from the free Affinity with everything "exported and embedded as expected" (one anecdote). — [PrintPlanet thread](https://printplanet.com/threads/affinity-update-its-now-freemium-and-more.295274/page-2)
- An HN commenter's view: InDesign's defaults beat the CSS-typeset sample "1000 times" with about five minutes of work. — [Hacker News: Laying Out a Print Book with CSS](https://news.ycombinator.com/item?id=35242299)

**Running headless Chromium on Vercel or elsewhere**

- Vercel Functions (docs updated 2026-08-24): 250 MB uncompressed bundle limit (a "large functions" beta allows up to 5 GB on Node.js, Bun and Python); memory 2 GB on Hobby, up to 4 GB / 2 vCPU on Pro; duration 300 s default, 800 s maximum on Pro, 1800 s in beta; request and response bodies capped at 4.5 MB except streamed responses. The docs name "Puppeteer with its bundled Chromium" as a common cause of oversized functions. — [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- Vercel's guide (updated 2025-11-10) recommends `puppeteer-core` with `@sparticuz/chromium-min` because the standard `puppeteer` package exceeds 250 MB. — [Vercel guide: Puppeteer with Next.js](https://vercel.com/guides/deploying-puppeteer-with-nextjs-on-vercel)
- `@sparticuz/chromium`: a headless_shell build for serverless; the `-min` variant downloads the binary from a URL to /tmp on cold start; needs at least 512 MB and recommends 1600 MB or more; ships only Open Sans, so custom fonts must be supplied as files or web fonts; Linux x64 only in the npm package; must be marked external to the bundler. — [Sparticuz/chromium README](https://github.com/Sparticuz/chromium)
- Community reports describe the Next.js setup (`serverExternalPackages`, output file tracing) as fragile, with failures still reported. — [Vercel community thread](https://community.vercel.com/t/sparticuz-chromium-min-working-with-vercel-for-pdf/7877)

### Inferences

- Comparison (my synthesis; cells marked * rest partly on training knowledge rather than a source above):

| Tool                   | Typography                                                                                   | Bleed / marks                                                     | CMYK / PDF/X                                         | Runs on Vercel function                                    | Live browser preview                                            |
| ---------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| Chromium alone         | greedy line breaks; no footnotes or running headers; margin boxes and page numbers since 131 | none native*; make the page trim + bleed and set boxes afterwards | no                                                   | yes, with chromium-min; tight on size and cold start       | print preview only; no spread view without custom code          |
| Chromium + Paged.js    | same engine; polyfills footnotes, running headers*                                           | `bleed`, `marks`                                                  | no                                                   | yes (same as Chromium)                                     | yes, facing pages in the page itself                            |
| Vivliostyle (Chromium) | same engine; own layout for page floats, footnotes*                                          | `--crop-marks`, `--bleed`                                         | post-process CMYK and X-4 labelling; X-1a via Docker | CLI is better suited to a sandbox or CI job                | yes, Viewer and `preview` server                                |
| Prince / DocRaptor     | best of the HTML engines*; footnotes, running headers, K-only black                          | `prince-bleed`, `prince-trim`, marks                              | yes, native conversion and PDF/X-1a/3/4              | DocRaptor: just an HTTP call; Prince binary: sandbox or CI | no; PDF only, so preview is the PDF or an approximate HTML view |
| WeasyPrint             | good paged-media coverage; weaker columns, flex, grid                                        | `bleed`, `marks`                                                  | yes since about v64–68, still with rough edges       | Python; sandbox or CI rather than a Node function          | no; PDF only                                                    |
| Typst                  | strong (optimising line breaks)                                                              | via package                                                       | CMYK colours; no PDF/X                               | single binary, easy in a sandbox                           | its own web app/preview, not HTML                               |
| react-pdf              | basic; own layout engine, not CSS                                                            | manual*                                                           | no*                                                  | yes, pure JS                                               | yes, via its PDF viewer component*                              |
| InDesign / Affinity    | best; manual                                                                                 | full                                                              | full                                                 | no (desktop; InDesign Server is five figures a year)       | no web preview                                                  |

- "Designed on web first, with a quick preview" points to a Chromium-based engine, because the preview and the PDF then come from the same layout engine. Paged.js gives a spread preview inside a React page most directly, but its last stable release is from 2023 and a breaking 2.0 is pending, so it should be pinned and tested, or avoided for long-lived code. Vivliostyle is the most actively released open-source option and now covers CMYK and PDF/X labelling.
- If Prince, DocRaptor or WeasyPrint makes the final PDF, the browser preview is only an approximation (different engine, different line breaks and page breaks), so the reliable preview is the generated PDF shown in a PDF viewer with a two-page mode. Generation of a 100–150 page issue then needs to be fast enough to feel like a preview.
- Since native Chromium still lacks footnotes and running headers, essays with footnotes need either a polyfill (Paged.js, Vivliostyle), conversion to endnotes per essay, or a non-browser engine.
- A 150-page full-colour PDF with 300 ppi images will be tens to hundreds of MB, above Vercel's 4.5 MB response limit, so a function would have to stream it or write it to blob storage. Combined with the 250 MB bundle limit and font handling, a sandbox or CI job is a more comfortable place to render than a request-scoped function. Preview rendering can stay in the visitor's own browser at no server cost.
- Prince's non-commercial licence may fit a club that distributes at print cost, but the first-page logo and the "no other income" condition (membership fees or deposits could count) make it uncertain; the vendor's FAQ suggests asking. DocRaptor avoids the licence question for a per-document fee.
- react-pdf does not render HTML/CSS, so it would mean a second layout codebase unrelated to the Tailwind design; it fits simple documents better than a magazine.

### Gaps

- print-css.rocks did not resolve (DNS failure) during this session, so its feature comparison tables could not be consulted.
- I found no source confirming whether Chromium supports the @page `bleed` and `marks` descriptors; to my knowledge it does not (training knowledge).
- Current status of the Paged.js 2.0 rewrite beyond the May 2025 announcement is unknown.
- DocRaptor's plan prices were not retrievable (the pricing URL I tried returned 404).
- I could not confirm from react-pdf's own docs or issue tracker whether it supports CMYK, bleed boxes or PDF/X.
- Vivliostyle's supported-CSS-features page returned 404, so its footnote, page-float and running-header support is from training knowledge.
- Widow/orphan control, column balancing and drop-cap (`initial-letter`) support per engine were not confirmed from sources this session.
- Adobe's InDesign Server tier-to-price mapping and current Affinity version details were not verified from official pages.

## 4. RGB to CMYK and PDF/X conversion after the fact, and automated preflight

### Takeaway

Conversion is optional for Lulu and Peecho (which prefer RGB) and merely advisable for Mixam and US printers (which auto-convert), so the simplest path is to upload the RGB PDF and judge a proof copy. If conversion is wanted, Ghostscript can do RGB-to-CMYK and PDF/X-1/X-3 but has known trouble with transparency, and no open-source tool validates PDF/X the way veraPDF validates PDF/A, so automated checks have to be assembled from separate tools or bought (callas, Acrobat).

### Cited Findings

- Whether conversion is needed: Lulu prefers sRGB and says conversion is no longer needed; Peecho asks for RGB; Mixam and PrintingCenterUSA convert RGB automatically on upload. — [Lulu Book Creation Guide PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf); [Peecho magazines guideline](https://support.peecho.com/hc/en-us/articles/19746186078876-Magazines-File-set-up-guideline); [Mixam Print File Setup Guide](https://mixam.com/support/filesetup); [PrintingCenterUSA paperback book printing](https://printingcenterusa.com/printing/paperback-book-printing)
- Ghostscript's documented PDF/X command: `gs -dPDFX=3 -dBATCH -dNOPAUSE -sColorConversionStrategy=CMYK -sDEVICE=pdfwrite -sOutputFile=out-x3.pdf PDFX_def.ps input.ps`. `-dPDFX` forces PDF 1.3 compatibility; colour must be converted to Gray or CMYK ("RGB is not allowed"); `PDFX_def.ps` must be edited to name the output condition and point to an ICC profile, which Ghostscript does not ship. — [Ghostscript: VectorDevices](https://ghostscript.readthedocs.io/en/latest/VectorDevices.html)
- The same page says `-dPDFX` "should be 1, 3 or 4" but also warns that only PDF/X-1 and PDF/X-3 creation is supported; the documentation contradicts itself on X-4. — [Ghostscript: VectorDevices](https://ghostscript.readthedocs.io/en/latest/VectorDevices.html)
- Box controls: TrimBox defaults to the MediaBox and can be inset with `PDFXTrimBoxToMediaBoxOffset [left right top bottom]`; BleedBox defaults to the MediaBox (`PDFXSetBleedBoxToMediaBox`) or is set with `PDFXBleedBoxToTrimBoxOffset`. — [Ghostscript: VectorDevices](https://ghostscript.readthedocs.io/en/latest/VectorDevices.html)
- Known problems: conversion of RGB PDFs containing transparent images has failed (users add `-dHaveTransparency=false`); community reports (2014–2021) disagree on which flags are needed alongside `-dPDFX`, and one notes a misspelled option silently does nothing. — [Ghostscript bug 693169](https://bugs.ghostscript.com/show_bug.cgi?id=693169); [Ghostscript bug 700930](https://bugs.ghostscript.com/show_bug.cgi?id=700930)
- "Correcting colors in existing PDFs often leaves them muted or washed out," and Adobe tools are "nearly the only" ones producing print-standard PDFs, according to one print-software developer. — [Hacker News thread](https://news.ycombinator.com/item?id=39670470)
- Vivliostyle's `pdfPostprocess` and Prince's `--convert-colors` are engine-side alternatives to Ghostscript; Vivliostyle's docs say its checks do not validate the whole PDF and recommend the print provider's preflight. — [Vivliostyle CLI: special output settings](https://docs.vivliostyle.org/en/cli/special-output-settings/); [Prince: colour management](https://www.princexml.com/doc/graphics/)
- veraPDF validates PDF/A and PDF/UA only (all parts and levels), with a batch CLI, JSON/HTML reports and a Docker image; it does not check PDF/X. — [veraPDF](https://verapdf.org/); [veraPDF CLI docs](https://docs.verapdf.org/cli/)
- Individual checks from open tools: Ghostscript's `inkcov` device reports per-page CMYK coverage (`gs -o - -sDEVICE=inkcov file.pdf`); Poppler's `pdffonts` lists fonts and whether each is embedded; `pdfimages -list` lists embedded images, from which resolution can be read. — [slhck: counting color pages in a PDF](https://slhck.info/software/2026/03/12/counting-color-pages-pdf.html); [pdffonts man page](https://dyn.manpages.debian.org/trixie/poppler-utils/pdffonts.1)
- Commercial command-line preflight exists from callas (pdfInspektor / pdfToolbox CLI). — [CreativePro: callas pdfInspektor4 CLI](https://creativepro.com/?p=121723)
- Lulu supplies Acrobat/InDesign job options files for interior and cover exports. — [Lulu API help: PDF creation settings](https://help.api.lulu.com/en/support/solutions/articles/64000254609-pdf-creation-settings)
- The printers' own upload checks act as preflight: Lulu analyses and repairs files and offers a print-ready download to review; a real print manufacturer's validator caught the WeasyPrint RGB-group problem. — [Lulu Book Creation Guide PDF](https://assets.lulu.com/media/guides/en/lulu-book-creation-guide.pdf); [WeasyPrint issue #2723](https://github.com/Kozea/WeasyPrint/issues/2723)

### Inferences

- For the print-on-demand providers, converting to CMYK yourself is not required and can make results worse if done with the wrong profile; Lulu explicitly says not to change colour space after the fact. The first issue should go up as sRGB and be judged from a single proof copy.
- A scripted "good enough" preflight for a browser-made PDF can check: page count parity or multiple of 4; every page's MediaBox equals trim + bleed; all fonts embedded (`pdffonts`); effective image ppi at placed size of at least about 200–300 (`pdfimages -list`); and, after any CMYK conversion, maximum ink coverage. None of this proves PDF/X conformance.
- A browser PDF has no TrimBox or BleedBox. Printers that take "page size = trim + 0.25 in" (Lulu, PrintingCenterUSA, Mixam) do not need them, but PDF/X requires a TrimBox, so any PDF/X route needs the boxes set (Ghostscript parameters above, or a PDF library).
- `inkcov` reports average coverage per page, not the peak total area coverage that a 270% limit refers to, so it is a rough indicator only (training knowledge).
- Ghostscript's transparency limits matter for web layouts, which often use opacity, shadows and blend modes; PDF/X-4 output (which keeps transparency) from Prince, WeasyPrint or Vivliostyle avoids that step.

### Gaps

- No sources were found this session for `pdfcpu validate` or `qpdf --check` in a preflight role; to my knowledge both check PDF syntax and structure, not print suitability (training knowledge).
- Acrobat Pro preflight profiles and callas pdfToolbox pricing were not researched.
- I found no tested, current (2025–2026) Ghostscript recipe for RGB to PDF/X-4 with GRACoL; the community recipes found date from 2014–2021.
- Whether Ghostscript maps RGB 0,0,0 text to K-only during conversion (rather than four-colour black) was not confirmed; a search result title suggests it is a known difficulty ("convert pdf to cmyk but ignore black").

## 5. Real-world examples of books and magazines typeset from HTML/CSS or Typst

### Takeaway

There are many books and few magazines: documented cases show HTML/CSS pipelines work for print-on-demand but people hit browser-engine typography limits, Paged.js instability, and colour surprises, and several moved to WeasyPrint, Prince or Typst. The one service found that does this as a product (Offprint) publishes no technical details.

### Cited Findings

- Offprint (getoffprint.com), announced in August 2026: users text links (Substacks, news, blogs, X posts, PDFs, photos); it builds a monthly 8.5 x 11 in full-colour magazine on coated stock with a gloss cover, minimum 96 pages (padded with ruled notes pages), up to 320; $29 for the first issue, then $39 per month or $390 per year including shipping; arrives about 10 business days after approval; "subscriber-only pieces you already have access to" can be included. It names no printer or technology. — [Offprint](https://getoffprint.com/); [launch post on X](https://x.com/danielbelfort/status/2090134913366319115)
- substackprint.com turns a Substack (or several) into a printable newspaper or zine in the browser. Zine Machine crawls a site or feed daily and offers printed magazine subscriptions for newsletter publishers. — [How to turn your favorite Substack into a printable newspaper](https://rawandferal.substack.com/substack-print); [Ghost forum: Zine Machine](https://forum.ghost.org/t/offer-printed-magazine-subscriptions-to-your-followers/45251)
- Hypermedia Systems: first edition used AsciiDoc to HTML to Paged.js to PDF, printed through Amazon KDP, which "had trouble printing the PDF consistently"; the new edition is typeset in Typst and the publisher is moving to Lulu. Problems listed under Paged.js in section 3. — [Building the new Hypermedia Systems](https://deniz.aksimsek.tr/2024/new-hypermedia-systems)
- "Laying Out a Print Book with CSS" (Ian McDowell, 2023): a novel laid out in CSS, rendered with WeasyPrint because other tools lacked paged-media features, and self-published through Amazon. In the HN thread (349 points): justification without hyphenation left bad gaps; widows and orphans were forgotten in print; commenters noted no baseline grid in CSS, weak hyphenation versus TeX, no CMYK in browsers, and one called Prince "still a bit better" than WeasyPrint. Another commenter printed via Lulu and hired a designer for cover bleed and margins. — [Hacker News: Laying Out a Print Book with CSS](https://news.ycombinator.com/item?id=35242299); [original article](https://iangmcdowell.com/blog/posts/laying-out-a-book-with-css/)
- Baldur Bjarnason ("The problem with print is software," 2024; search summary only, page blocked): used Prince for trade publishers, found Paged.js "too unreliable and unstable to use," and reports a print-on-demand proof where illustrations meant to be colour "came out as muddy greyscale." — [Baldur Bjarnason](https://baldurbjarnason.com/2024/the-problem-with-print-is-software)
- Onedoc (YC W24), a React-to-PDF product built on Paged.js, said it does no colour correction and was unsure the browser supports print colour profiles. — [Hacker News thread](https://news.ycombinator.com/item?id=39670470)
- A manufacturer's preflight rejected a WeasyPrint PDF/X-4 file in April 2026 over an RGB transparency group. — [WeasyPrint issue #2723](https://github.com/Kozea/WeasyPrint/issues/2723)
- Earliest precedent: Håkon Wium Lie and Bert Bos printed a full book from HTML and CSS with Prince (A List Apart, 2005). — [A List Apart: Printing a Book with CSS: Boom!](https://alistapart.com/article/boom/)
- Typst in production print: a Typst forum thread asking whether anyone uses it for a full book or journal print workflow drew little first-hand experience, pointing instead to a tracking issue on printer problems (typst/typst #2963). — [Typst forum](https://forum.typst.app/t/can-typst-be-used-as-a-typesetting-engine-for-a-professional-book-or-journal-production-workflow/6121)

### Inferences

- The recurring failure points are consistent across write-ups: (1) colour (RGB-only output, surprises on proofs), (2) pagination bugs and slowness when a JS polyfill paginates long documents, (3) justified text quality without good hyphenation, and (4) cover and bleed setup, which several authors handed to a designer or separate tool.
- For a weekly cadence, a proof copy per issue is not practical, so the template (fonts, colours, image treatment) should be proofed once on the chosen printer and then held fixed.
- Offprint shows that an automated links-to-magazine pipeline at about 96 pages, 8.5 x 11, full colour, shipped in about 10 business days is commercially running; its pricing ($39 per issue retail, single copies) gives a rough ceiling for per-copy economics, not a guide to 100-copy runs.
- Laying out each article to start on any page (not forcing right-hand starts) keeps page count and cost down.

### Gaps

- I found no detailed engineering write-up of a recurring magazine (as opposed to a book) produced from HTML/CSS and professionally printed.
- Offprint's stack, printer and paywall handling are undisclosed.
- Baldur Bjarnason's post could not be fetched directly; details are from a search summary.
- A search summary mentioned a novelist's HTML-to-PDF write-up in which starting 80 chapters on right-hand pages would have added about 40 pages and about 15% to print cost; I could not identify which page it came from, so it is unsourced.
- No write-up was found of a Typst-typeset book or magazine going through a commercial printer with CMYK or PDF/X requirements.
- Japanese self-published technical books made with Vivliostyle are, to my knowledge, a large body of real-world print use, but I did not find or verify sources for that this session.

## 6. Pulling essay content from Substack, LessWrong and personal blogs

### Takeaway

Substack and LessWrong both expose post HTML through public but unofficial or lightly documented endpoints, which is cleaner than scraping; paywalled Substack posts return no body without the author's session, and web-sized images are the main quality problem for print.

### Cited Findings

- Substack has an undocumented listing endpoint, `https://<publication>.substack.com/api/v1/posts?offset=0&limit=50`, paginated by offset, needing no auth for public publications. — [Apify actor docs: Substack publication scraper](https://apify.com/bovi/substack-publication.md)
- Free posts include full HTML in `body_html`; posts with audience `only_paid` return metadata with a null or empty body without authentication. One scraper notes `body_html` is empty in archive listings unless requested and always populated when fetching a single post. — [Apify actor docs: Substack post scraper](https://apify.com/romy/substack-post-scraper.md); [Apify actor docs: Substack publication scraper](https://apify.com/bovi/substack-publication.md)
- Open-source wrappers combine the unofficial API with RSS as a fallback. — [GitHub: SubstackAPI](https://github.com/Noah-Bjorner/SubstackAPI)
- Images: the `<img src>` in post HTML is a resized `substackcdn.com/image/fetch/...` URL (size set by `w_` parameters); the wrapping `<a class="image-link">` points at the full-size original on `substack-post-media.s3.amazonaws.com`. Read images from the same body HTML rather than a second request, which can disagree on count or order. — [Post-newsletter conversion guide](https://mcpservers.org/zh-TW/agent-skills/posthog/post-newsletter); [Chronicles of the Substack API](https://jimmyburns.substack.com/p/chronicles-of-the-substack-api-a)
- LessWrong and the EA Forum expose GraphQL at `https://www.lesswrong.com/graphql` (explorer at `/graphiql`); a post is fetched with `post(input: {selector: {_id: "..."}}) { result { _id title slug } }`. — [GraphQL tutorial for LessWrong and EA Forum](https://www.lesswrong.com/posts/LJiGhpq8w4Badr5KJ/graphql-tutorial-for-lesswrong-and-effective-altruism-forum)
- A published schema crate lists `htmlBody` as a post field; a commenter says `markdown` and `ckEditorMarkup` fields give raw content. — [lesspub-schema (docs.rs)](https://docs.rs/lesspub-schema/1.0.0/src/lesspub_schema/lib.rs.html); [GreaterWrong comment](https://www.greaterwrong.com/posts/jvewFE9hvQfrxeiBc/open-thread-summer-2024/comment/NsACuuBFSr3bJjnda)
- LessWrong also lists a REST-style `/api/post/[id]` route returning Markdown or JSON, with `?compact=1` omitting heavy media, math and tables. — [LessWrong API page](https://lesswrong.com/api)
- Offprint accepts "subscriber-only pieces you already have access to," which implies the reader supplies access. — [Offprint](https://getoffprint.com/)

### Inferences

- Because the writers are club members, the simplest fix for paywalled or hard-to-parse posts is to ask the author to paste the text or share a draft link; the registered essay URL is enough for the common free-post case.
- Each essay needs a normalisation pass into a small set of blocks the print layout supports (headings, paragraphs, block quotes, lists, images with captions, footnotes, code, pull quotes), with a per-essay preview so the author or editor can fix breakage. The chat already stores sanitised structured rich text, which suggests a similar whitelist approach for essay bodies.
- Usual problems to plan for (training knowledge, consistent with the sources above): embedded tweets, YouTube and polls arrive as iframes or script placeholders and need a static fallback (quote text or screenshot plus URL); Substack and LessWrong footnotes are anchor links at the end of the post and must be re-anchored as page footnotes or per-essay endnotes; links need a print treatment (drop, footnote the URL, or QR code); LaTeX math on LessWrong arrives as MathJax markup; images may be too small for print and may have unclear reuse rights.
- For personal blogs with no API, Mozilla's Readability library (the Firefox reader-mode extractor) or the site's full-text RSS feed is the usual route, with manual correction (training knowledge; not researched this session).
- Fetching an author's own posts with their consent for a club publication is low-risk, but the Substack endpoints are undocumented and can change, so the importer should fail visibly and allow a manual paste.

### Gaps

- No official Substack documentation exists for these endpoints; all Substack details are from third-party scrapers and community posts.
- I did not find a confirmed example GraphQL query using `htmlBody` or `contents { html }`; the exact field should be checked in GraphiQL.
- Whether Substack RSS feeds carry full text for free posts, and what they contain for paid posts, was not confirmed.
- Notion page export, Readability usage and personal-blog extraction were not researched with sources this session.
- The exact HTML structure of Substack footnotes and embedded tweets was not confirmed.
- Rate limits and terms-of-service positions for automated fetching from Substack and LessWrong were not researched.
