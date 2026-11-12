I'd like to design a weekly physical magazine for the Just Write essays. Some thoughts:

- I'd like it to be beautiful, an artifact that I and every Just Writer is proud to see.
- I imagine this should be designed on web first, with an interface that lets me & others quickly preview the layout
- Medium term, I'd probably want to create beautiful art (via midjourney?) for each piece, and/or let each author also include their own art to go along with the pieces.
- I'm not familiar with which printers we can use, so please do some research and come back with recs. Ideally it's one that is reasonably API-forward, but willing to compromise on this
- I'd probably want to send out 100-ish copies; to every Just Write member, as well as make them available for sale.
- I'd like them to go out fast (ideally, time from we send file => physical copy received is <3 days). Even faster would be better for initial prototyping.
- All things equal, cheaper is better, but I'm willing to pay a relatively high per-unit price in service of quality and speed (eg $20-30 per issue would not seem crazy.)

Start by doing some research into printing capabilities, what is possible here, what file formats we should expect to send over, and write in your findings into this doc.

Inspirations:

- offprint, https://getoffprint.com/, a service that collects a series of links from different users and sends them a personalized magazine each month
- Asterisk Magazine (https://asteriskmag.com/) and other high-quality magazines
- Midjourney magazine (https://mag.midjourney.com/)

Digital magazine inspirations:

- Helena's https://zineathon.com/
- (todo consider others)

Next steps:

- scrape all the submitted articles
- build out the pipeline to generate PDF layout of the articles
- design out the physical pdf (and digital collated) form
- make art -- at least for cover, but also maybe


TODOs:
- allow saving new presets & loading
  - current changes: literata? 9.5pt for computer, spaced paragraphs, no justify, color on, qr all
- softlaunch /zine
- fix data
  - confirm author names and piece printings?
  - auto check pdf with claude code
- check that type is black (?) per https://practicaltypography.com/color.html
- QR code redesign?
- nonsymmetric margins (internal border)
- cover vs print split on pdf export
- support tracking not just leading?
- fix lowercase drop caps
- "Issue 1" above every new essay title seems bad, replace or cut
- overall: feedback pdf into claude to analyze


Bigger design questions:
- what is the role of a zine?
  - forcing function to write good essays, polish them, edit them
  - yearbook-like? also it's just cool.
  - limits of physical vs digital incarnations. (interesting coming from digital world)
  - 4 zines, one per week? or 2? or 1 big one? => 4 is cooler. everything printed.
  - or: shard out a few zines by topic? like Asterisk?
- personalized vs unified essays? should users get to choose whose essays they put into their personal copy? should each author just get a book of their own essays?
  - printing pushes towards standardization.
  - compare to malleable software
- One more sorting option: might want to group essays by subject area, and represent that in ToC
  - also rethink toc a bit more
- definitely should let users update their own essays before publishing
- related: logistics of shipping
- how to handle multiple essays for one author in a single week? (mb fine b/c those are short)
- where to put the generated art? (maybe cut for issue 1)


## Findings (Nov 10, 2026)

Full report: [reports/Weekly magazine printing options.md](../reports/Weekly%20magazine%20printing%20options.md). Prices were read from public calculators on Nov 10 and are before tax. "Delivered" includes the cheapest shipping.

- **Format:** at 80–150 pages the binding is perfect bound (glued spine). Stapled binding stops at 48–96 pages depending on the printer. At ~100 copies this is digital printing; offset needs 250–500+ copies.
- **No one printer does everything.** Services that mail each copy through an API take 4+ business days to print. Rush printers can deliver in 1–2 days, but they ship one box and have no API.
- **Mailed copies:** RPI Print's API (the company behind Blurb and MagCloud) is the best fit found. It is self-serve, takes one order per member, and costs about $21–26 delivered. It ships to the US and Canada only and has a default limit of 50 orders a day.
- **Proofs in 1–3 days:** only rush printers can do this. Printivity showed next-day delivery for one copy at $52.60 before rush and shipping fees.
- **A box to one address** is much cheaper, at $6–14 per copy before shipping.
- **Files:** two PDFs per issue. The interior is single pages at trim size plus 0.125 in bleed, with fonts embedded, images at 300 ppi, and no crop marks. The cover is one piece (back, spine, front), and its spine width depends on page count and paper. sRGB is accepted, so a PDF rendered from the web layout with headless Chrome works.
- **Not yet known:** RPI's print quality and real turnaround (needs a paid test order, about $50), Printivity's rush fee, and whether a local shop can bind one copy the same day.

| Route                                      | Spec priced                       | Per copy, 100 pp / 150 pp                     | File to door                              | Ordering                        |
| ------------------------------------------ | --------------------------------- | --------------------------------------------- | ----------------------------------------- | ------------------------------- |
| RPI Print API, mailed to each member       | 8.5×11, 100 lb coated             | $21 / $26 delivered                           | 6–10 days (estimate)                      | API, sandbox                    |
| RPI Print API, mailed to each member       | 6×9, 70 lb uncoated               | $17 / $19 delivered                           | 6–10 days (estimate)                      | API, sandbox                    |
| Lulu API, mailed to each member            | 6×9, premium color, 80 lb coated  | $22 / $29 delivered                           | 11–14 business days                       | API, sandbox                    |
| MagCloud "Ship to Group"                   | 8.25×10.75, 80 lb                 | about $24 / $31 delivered                     | about 13 days                             | web, no API                     |
| DocuCopies, prints and mails to a CSV list | 6×9, 80 lb gloss                  | about $23–28 / $29–34 delivered               | 6–13 days (estimate)                      | web form + CSV                  |
| Printivity, box to one address             | 6×9, 80 lb matte, laminated cover | $11 / $14, plus shipping and any rush fee     | next-day delivery offered                 | web                             |
| 48 Hour Books, box to one address          | 5.5×8.5, standard paper           | not quoted / $17, plus shipping               | 2 business days to print, ships from Ohio | web                             |
| Mixam, box to one address                  | 6×9, 80 lb satin, laminated cover | $6 / $7, plus $1–2 freight (8.5×11: $7 / $10) | about 10 days                             | web; API needs account approval |

Mailing copies by hand from a box adds about $4–5 each at 6×9 (First-Class large envelope, up to 13 oz) or $7–9 and up at 8.5×11 (parcel rates), plus envelopes and packing time.

(to resume: claude --resume 2030b164-9ac5-4606-b0f9-13ee6595cd16)

## Pipeline (Nov 12, 2026)

- `bun scripts/zine-cache.ts --week 1` saves the essays that fill that week's slot into `content/zine/week-1.json`, with their images in `public/zine/week-1/`. It reads the essays and members tables with `bunx convex data`, so it needs your Convex login. Pages are read with Readability; Google Docs, LessWrong, and Substack have their own paths. Week 1: 62 of 68 read. The 6 that failed (2 EA Forum posts behind a bot check, 2 Notion pages, 2 personal sites) are listed in /zine.
- `lib/zine/document.ts` turns an issue plus design settings (`lib/zine/tweaks.ts`) into one HTML document, and Paged.js (`public/zine/vendor/`) lays it out into pages: cover, contents with page numbers, essays, colophon.
- `/zine` (members, portal sidebar) shows that document in an iframe with the design controls beside it. Settings are saved in the browser. Print uses the browser's print dialog.
- `bun scripts/zine-pdf.ts --week 1 --tweaks '<json>'` prints the same document to `out/zine/week-1.pdf` with headless Chrome: single pages at trim size plus 0.125 in bleed, fonts embedded, no crop marks. /zine's "Copy PDF command" gives the `--tweaks` for what's on screen.
- Art: `content/zine/art.json` maps an essay id (or `cover`) to `{file, web?, alt?, credit?}`; /zine uses `web` and the PDF uses `file`.
- Length: the full week 1 is ~121k words, 470 pages at 6×9 or ~215 at 8.5×11 in two columns. The Length setting cuts each essay to about 2–4 pages and ends it with a QR code to the original post.
- Still to do: the cover as a separate wraparound file with a spine (printers want it apart from the interior), padding to a multiple of 4 pages, and checking that images are 300 ppi at their printed size.
