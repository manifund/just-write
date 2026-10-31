# Just Write

Site and member portal for [justwrite.club](https://justwrite.club), a 4-week online writing club. Next.js (App Router) + Tailwind CSS on Vercel, with Convex for data, auth (Better Auth), and realtime chat.

- `just-write-handoff/` — approved landing page design (`reference.html` + screenshots)
- `MUSINGS.md` — program notes and open questions

## Develop

```bash
bun install
vercel link            # manifund team, just-write project
vercel env pull .env.local
bun convex             # in one terminal: pushes convex/ to your dev deployment and watches
bun dev                # in another: localhost:3000
```

Without `RESEND_API_KEY` on the Convex dev deployment, sign-in links are printed in the `bun convex` logs instead of emailed.

Pushes to `main` deploy to production.
