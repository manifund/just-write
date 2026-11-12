# Article illustrations

One black-and-white image per essay, in a single house style, used in the printed zine and on the site (essay cards, `/members/[handle]`).

First batch: Austin's week 1 essays plus 6 other week 1 essays picked at random (seeded, so the pick can be repeated).

## House style (proposal)

**Linocut / woodcut print.** Black ink on off-white paper, bold carved lines, no gray wash, lots of empty paper around one central subject.

Why this one:

- It prints cleanly on uncoated stock at 6×9 and survives cheap digital printing. Photographic grays and soft charcoal tend to go muddy.
- It reads as one hand across very different essays (AI policy, memoir, fiction).
- It stays legible at thumbnail size on the site.
- It doesn't look like default AI art, which leans glossy and photoreal.

Alternatives if this feels wrong: (a) ink-and-brush sumi-e, softer and more open; (b) 19th-century steel engraving, finer and more formal; (c) high-contrast silver gelatin photograph, more editorial but harder to keep consistent.

Each image depicts one concrete object or scene that stands for the essay's idea. No people's faces up close, no text or lettering, no literal screenshots of the topic (no robots for AI essays).

## Model and settings

Images come from Google's Nano Banana through OpenRouter (Austin's pick on Nov 11, since Midjourney has no official API). `generate.ts` uses the newest `google/*` image model OpenRouter lists unless `--model` says otherwise, at 3:2 and 2K.

The style text is in `scripts/art/style.ts#STYLE`. After the first image Austin likes, set `content/zine/art-style.json` to `{"ref": "public/zine/art/<id>.png"}`. Every later image is sent with that print as a style reference, so the batch matches.

`3:2` gives a landscape that fits a 6×9 page width with room for the title, and crops to 16:9 or 1:1 for the site.

## Pipeline

All three scripts need `OPENROUTER_API_KEY` (in `.env.local` from `vercel env pull`) and run from the repo root.

1. **Subjects.** `bun scripts/art/prompts.ts` reads `content/zine/week-1.json` (from `scripts/zine-cache.ts`), picks Austin's essays plus 6 others (`--seed` makes the pick repeatable), and asks Claude for one visual subject and alt text per essay. Writes `content/zine/art-prompts.json`. Edit any subject by hand.
2. **Generate.** `bun scripts/art/generate.ts` renders each subject into `art-inbox/<id>.png`, with alternates in `art-inbox/alts/`. Swap in an alternate by hand if it's better. `--only <id> --force` redoes one.
3. **Import.** `bun scripts/art/import.ts` converts to pure grayscale, crops to 3:2, warns under 1800 px wide (6 in at 300 ppi), writes `public/zine/art/<id>.png` plus a 1200 px `.webp` for the site, and updates `content/zine/art.json` (`file`, `web`, `prompt`, `alt`, `credit`).
4. **Use.** `/zine` and the site read `content/zine/art.json`. Art an author supplies gets an entry with `credit` set to them and `prompt: null`. A `cover` key works the same way.

`art-inbox/` is gitignored; only the imported images and the JSON files are committed.
