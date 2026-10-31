# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Site for [justwrite.club](https://justwrite.club), a November 2026 online writing club run by Austin through Manifund. Writers express interest, then sign terms and pay a $1,000 deposit (refunded if they publish 4 essays). Next.js 16 App Router + Tailwind v4, Neon Postgres, Stripe, Resend. Deployed on Vercel (manifund team, `just-write` project); pushes to `main` deploy to production. `MUSINGS.md` has program notes; `just-write-handoff/` has the approved design.

## Commands

```bash
bun install
vercel env pull .env.local   # DATABASE_URL etc. (bun auto-loads .env.local)
bun db:migrate               # idempotent schema migration (scripts/migrate.ts)
bun dev                      # localhost:3000
bunx tsc --noEmit            # typecheck
bunx eslint app lib scripts  # lint (plain `bun run lint` also scans .next and reports thousands of bogus errors)
```

Use `bun` and `bunx` for everything, never `npm` or `npx`. There are no tests.

## Architecture

**One table, `interest`**, keyed by unique `email`, with a `status` that moves `interested → signed → committed`. Schema changes go in `scripts/migrate.ts` as `ADD COLUMN IF NOT EXISTS` statements, and must be run against the production DB (`bun db:migrate`) before deploying code that uses them. `lib/db.ts` holds the lazy `sql()` client and the `Status`/`Submission` types.

**Flow:**
1. `/` — `app/actions.ts#submitInterest` upserts an interested row. The public "Interested" list (`app/interested.tsx`) is a `"use cache"` function tagged `interest`; anything that changes who appears there must invalidate that tag (`updateTag` in server actions, `revalidateTag(..., { expire: 0 })` in route handlers).
2. `/commit` — `app/commit/actions.ts#startCommitment` records the typed signature (status `signed`) and redirects to Stripe Checkout, passing the row id as `client_reference_id`.
3. `app/api/stripe/webhook/route.ts` — on `checkout.session.completed` / `async_payment_succeeded`, `markCommitted` (`lib/stripe.ts`) flips the row to `committed`, then `sendSignedTerms` (`lib/email.ts`) emails the signed terms via Resend. Both are idempotent (email is claimed via `terms_emailed_at`), and failures return 500 so Stripe retries. `/commit/thanks` only displays Stripe's session status; the webhook is the source of truth.
4. `/admin` — lists all rows. Not access-controlled.

**Terms text lives in `lib/terms.ts`** as plain data (strings, or runs with links). Both the `/commit` page and the email render from it, so edit terms there, not in JSX.

**Styling:** design tokens (colors `ink`, `cream`, `brass*`; fonts `font-display`, `font-body`) are defined in `app/globals.css`. `/tweaks` is a design playground for fonts and palettes; `app/tweaks/options.ts` `DEFAULTS` mirrors what the live site uses. The email in `lib/email.ts` hardcodes the same hex colors inline.

**Env vars:** `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (live Stripe keys are Production-only on Vercel), `RESEND_API_KEY`, optional `RESEND_FROM` (defaults to `austin@manifund.org`, verified in Manifund's Resend account). Stripe is Manifund's live account; deposits are donations to Manifund.
