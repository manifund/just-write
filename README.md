# Just Write

Site and member portal for [justwrite.club](https://justwrite.club), a 4-week online writing club. Next.js (App Router) + Tailwind CSS on Vercel, with Convex for data, auth (Better Auth), and realtime chat.

- `just-write-handoff/` — approved landing page design (`reference.html` + screenshots)
- `MUSINGS.md` — program notes and open questions

## Develop

```bash
bun install
vercel link            # manifund team, just-write project
vercel env pull .env.local
bun convex             # in one terminal: pushes convex/ to the dev deployment and watches
bun dev                # in another: localhost:3000
```

`vercel env pull` overwrites `.env.local`, and the Convex values aren't in Vercel yet. After pulling, run `bun convex` (it restores `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL`) and re-add `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_SITE_URL`, and `CONVEX_SERVER_SECRET` (must match the value on the Convex deployment).

Convex dev deployment: `brilliant-starling-517` (team `austin-chen`, project `just-write`). Its secrets live in Convex, not in `.env*`; manage them with `bunx convex env list` / `bunx convex env set`. It sends real sign-in emails through Resend, so test with real inboxes.

Google sign-in uses the OAuth client in Google Cloud project `just-write-513304`, with redirect URIs `http://localhost:3000/api/auth/callback/google` and `https://justwrite.club/api/auth/callback/google`. Its ID and secret are kept in the gitignored `.env` for reference.

Pushes to `main` deploy to production. Production isn't on Convex yet: the portal currently runs only against the dev deployment.
