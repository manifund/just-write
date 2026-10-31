# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

IMPORTANT: when vibecoding, avoid writing slop-sounding copy. Use neutral, simple language in copy instead.

@AGENTS.md

## What this is

Site and member portal for [justwrite.club](https://justwrite.club), a November 2026 online writing club run by Austin through Manifund. Writers express interest, sign in, sign terms, and pay a $1,000 deposit (refunded if they publish 4 essays); committed writers get the member portal. Next.js 16 App Router + Tailwind v4, Convex (data, realtime, auth via Better Auth), Stripe, Resend, OpenRouter. Deployed on Vercel (manifund team, `just-write` project); pushes to `main` deploy to production. `MUSINGS.md` has program notes; `just-write-handoff/` has the approved landing design.

## Commands

```bash
bun install
vercel env pull .env.local   # Stripe keys etc. (bun auto-loads .env.local); overwrites the Convex values, see README
bun convex                   # pushes convex/ to the dev deployment and watches; tails Convex logs
bun dev                      # localhost:3000
bunx tsc --noEmit            # typecheck (includes convex/)
bunx eslint app lib components convex scripts  # lint (plain `bun run lint` also scans .next and reports bogus errors)
bunx convex run chat:seedChannels  # create/update the default chat channels (once per deployment)
```

Use `bun` and `bunx` for everything, never `npm` or `npx`. There are no tests.

## Architecture

**Data lives in Convex** (`convex/schema.ts`). `members` (keyed by lowercase `email`) replaces the old Neon `interest` table; its `status` moves `interested → signed → committed`. Other tables: `essays`, `ideas`/`ideaVotes`, chat (`channels`, `messages`, `reactions`, `typing`, `reads`), and `similar` (cached LLM matches). Schema changes deploy with the Convex functions; no migrations needed for new optional fields. `scripts/import-neon.ts` is the one-time copy from Neon.

**Auth:** Better Auth runs inside Convex (`convex/auth.ts`, Google + email magic link); `app/api/auth/[...all]` proxies to it so cookies stay on our domain. A signed-in user is matched to their `members` row by email (`convex/lib/viewer.ts#getViewer`). Committed members and `ADMIN_EMAILS` can use the portal; every Convex function checks this itself (`requireMember`, `requireAdmin`), so the client-side gate in `components/portal/frame.tsx` is only UX. Next.js server code calls Convex as the user with `fetchAuthMutation` (`lib/auth-server.ts`), or calls `convex/server.ts` functions with the shared `CONVEX_SERVER_SECRET`.

**Flow:**

1. `/` — `app/actions.ts#submitInterest` calls `members.expressInterest`. The public "Interested" list (`app/interested.tsx`) is a `"use cache"` function tagged `interest`; anything that changes who appears there must invalidate that tag (`updateTag` in server actions, `revalidateTag(..., { expire: 0 })` in route handlers).
2. `/commit` — requires sign-in. `app/commit/actions.ts#startCommitment` records the signature on the viewer's row (`members.signTerms`, status `signed`) and redirects to Stripe Checkout with the Convex member id as `client_reference_id`.
3. `app/api/stripe/webhook/route.ts` — on `checkout.session.completed` / `async_payment_succeeded`, `markCommitted` (`lib/stripe.ts` → `server.markCommitted`) flips the row to `committed` (numeric references are pre-Convex Neon ids, matched via `legacyId`), then `sendSignedTerms` (`lib/email.ts`) emails the signed terms. Both are idempotent, and failures return 500 so Stripe retries. `/commit/thanks` only displays Stripe's session status; the webhook is the source of truth.
4. Portal (`app/(portal)/`, client-rendered behind `PortalFrame`): `/home` (deadline countdown, essay slots, registering essays, similar writers, everyone's progress), `/chat/[slug]` (channels with threads, reactions, typing, presence, unread dots), `/ideas`, `/settings` (profile), `/admin` (admins only; essay review).
5. `/members` and `/members/[handle]` — public, server-rendered from Convex then live; members see them inside the portal shell.

**Essay deadlines** are in `convex/lib/program.ts` (Mondays 9pm PT, Nov 9–30). `fillSlots` assigns registered essays to the earliest open slot they beat; admins can mark essays rejected so they don't count. Registering an essay posts it to `#published`.

**Chat messages** are Tiptap JSON. `convex/lib/richtext.ts#cleanBody` whitelists node and mark types on the server; `components/portal/rich-text.tsx` renders them to React (no raw HTML). The composer is `components/portal/composer.tsx` (Enter sends, @mentions).

**Similar writers:** `convex/similarAction.ts` asks Claude (via OpenRouter) to pick 3 matches from bios, essay titles, and shared ideas; results are cached in `similar` and recomputed when the inputs' hash changes or after 24h.

**Terms text lives in `lib/terms.ts`** as plain data (strings, or runs with links). Both the `/commit` page and the email render from it, so edit terms there, not in JSX.

**Styling:** design tokens (colors `ink`, `cream`, `brass*`; fonts `font-display`, `font-body`) are defined in `app/globals.css`. `/tweaks` is a design playground for fonts and palettes; `app/tweaks/options.ts` `DEFAULTS` mirrors what the live site uses. The email in `lib/email.ts` hardcodes the same hex colors inline.

**Env vars (Vercel / `.env.local`):** `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `CONVEX_SERVER_SECRET`, `CONVEX_DEPLOY_KEY` (Vercel builds only), `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (live Stripe keys are Production-only on Vercel), `RESEND_API_KEY`, optional `RESEND_FROM` (defaults to `austin@manifund.org`, verified in Manifund's Resend account). Stripe is Manifund's live account; deposits are donations to Manifund. `DATABASE_URL` (Neon) is only used by `scripts/import-neon.ts`.

**Env vars (Convex deployment, `bunx convex env set`):** `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_SERVER_SECRET` (same value as in Vercel), `ADMIN_EMAILS` (comma-separated), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Google Cloud project `just-write-513304`; copies kept in gitignored `.env`), `RESEND_API_KEY` (magic links; without it links are logged instead of sent), `OPENROUTER_API_KEY`. All are set on the dev deployment (`brilliant-starling-517`), which sends real email.

**Deployment status:** only a Convex dev deployment exists so far. Before the portal can go live, production needs a Convex deployment (or a decision to serve from dev), the Convex env vars above set there with `SITE_URL=https://justwrite.club`, `CONVEX_DEPLOY_KEY` + `NEXT_PUBLIC_CONVEX_*` + `CONVEX_SERVER_SECRET` in Vercel, the Vercel build command `bunx convex deploy --cmd 'bun run build'`, `chat:seedChannels`, and `bun import:neon` against it.
