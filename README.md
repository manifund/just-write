# Just Write

Landing page for [justwrite.club](https://justwrite.club), a 4-week online writing club. Next.js (App Router) + Tailwind CSS, deployed on Vercel. Interest-form submissions are stored in Neon Postgres (via Vercel Marketplace) and listed at `/admin`.

- `just-write-handoff/` — approved design (`reference.html` + screenshots)
- `MUSINGS.md` — program notes and open questions

## Develop

```bash
pnpm install
vercel link          # manifund team, just-write project
vercel env pull .env.local
pnpm db:migrate      # creates the `interest` table (safe to re-run)
pnpm dev
```

Pushes to `main` deploy to production.

> `/admin` is not access-controlled yet. Anyone with the URL can see submissions.
