# Personal versions of the site (draft)

Written Nov 6 in response to Vlad in #site: "a plugin system so I can ask for frontend-only changes for any part of the website in a way that would apply only to me by default, so I can iterate on my experience faster without waiting for admin approval."

Update, Nov 6: Vlad picked the opt-in flags version, which is now built. See "What was built" at the end.

## Goal

- A member asks @Claude for a change and it applies only to them, within a couple of minutes, with no admin in the loop.
- It can change anything you see: layout, copy, styles, new client-side views built from data the member can already read.
- It can't change data rules, other members' experience, payments, auth, or anything on the server.
- A change someone likes can be proposed for everyone, which goes through the normal review.

## Options considered

**A. Code injected into the live site.** Store each member's CSS and JS in Convex and inject it on justwrite.club when they're signed in. It applies instantly, with no build. But the JS runs on the real origin with the member's real session, and React re-renders undo most DOM patches, so plugins would be fragile and hard to make safe. If plugins were ever shared, one bad one would run as everyone who turned it on. Rejected for JS. A CSS-only version is safe enough and is listed below as an optional extra.

**B. Extension points (slots) with sandboxed iframes.** A real plugin API: the site exposes named slots and a message-passing data API. It's the safest, but it only reaches the parts we expose, it's weeks of work, and November is four weeks long. Rejected.

**C. A personal copy of the site per member (recommended).** Each member who wants one gets a git branch, `personal/<handle>`, that follows `main` plus their own changes. Vercel builds it at a stable URL. @Claude commits to that branch without review, because the code only ever runs for that member, on its own host, against the same live backend with the member's own permissions. This reuses almost everything @Claude already does (sandbox, agent, typecheck, lint, push, preview URL) and reaches any part of the frontend.

## How C works

### Asking

- A new setting in /settings: **"My @Claude requests: For everyone / Just for me."** Default is "For everyone", so nothing changes for other members. Vlad would pick "Just for me".
- Any single request can override the setting by saying "just for me" or "for everyone". The agent doesn't decide this; `improvements.startFromMessage` does, from the setting and a simple phrase match, and stores `target: "main" | "personal"` on the `improvements` row.
- The card shows "Just for you" and, when the build is ready, an **Open your version** button. Follow-ups in the thread keep the same target.

### Building

- The runner checks out `personal/<handle>` (creating it from `main` the first time), rebases it on `main`, lets the agent work, and runs typecheck and lint as today.
- Before pushing, the runner (not the agent) checks the diff from `main` against an **allowlist of paths**. Anything outside it fails the run with a plain message ("That needs a change for everyone; ask without 'just for me'"). Allowed:
  - `components/**`
  - `app/**` page and component files, except `app/api/**`, any `route.ts`, any file with `"use server"`, `app/(site)/commit/**`, and the root layouts' auth and provider wiring
  - `app/globals.css`
  - `public/**` except `sw.js` and `manifest`
  - Not `convex/**`, `lib/**`, `scripts/**`, `package.json`, `bun.lock`, config files, or middleware/proxy.
- No new dependencies. No classifier call and no admin review: the push is the deploy.

### Hosting

- Personal branches build in a **separate Vercel project** (`just-write-personal`) whose only env vars are `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`. Server code on a personal branch then has no secrets to leak, whatever it does. (The main project's Preview env must not be used, since it may hold keys like `GITHUB_TOKEN`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`, or Stripe test keys.)
- Each branch gets the project's stable branch URL. Later, `<handle>.justwrite.club` could be assigned per branch, but the vercel.app URL is fine to start.
- The main project's `next.config.ts` (which personal branches can't edit) sends a Content-Security-Policy that limits `connect-src`, `img-src`, `font-src`, and `form-action` to our own origins and Convex. CSP from a header can only be tightened by the page, not loosened, so personal code can't send data elsewhere.

### Signing in

This is the part that has to be right.

- A personal host accepts **one way** to sign in: a one-time token, like today's preview links, made by `personalAccess.create` for the signed-in member and **bound to that member's own personal host**. The endpoint refuses the token unless the request's host is the one it was made for, and signs in only that member. So nobody can send you a link to *their* personal version and get your session there.
- Google and email sign-in are refused on `personal/*` hosts (in `trustedOrigins` / the oAuthProxy check in `convex/auth.ts`).
- The session is a normal, writable one: you use your version for real (chat, essays, RSVPs). It can only do what you could already do yourself, because every Convex function still checks the member and their permissions.
- Cookies on the personal host are separate from justwrite.club's.

### Using it

- On justwrite.club, a member with a personal version sees a small "Open your version" link in the sidebar. We don't redirect automatically, so the main site is always there if a change breaks something.
- **Reset** in /settings deletes the branch, and **Pause** stops linking to it.
- Every merge to `main` triggers a rebase of each personal branch (a small job after the merge announcement). If the rebase conflicts, the branch is paused and the member is told in #site, with an offer to have Claude redo their changes on the new `main`.

### Sharing

- **Propose for everyone** on a card, or "@Claude make this for everyone", opens a normal `claude/<n>` PR from the personal branch's changes, with the usual policy and review.
- There is no way to run someone else's personal code with your session. Sharing always goes through `main`.

## Limits

- Each change takes a Vercel build (about 1–2 minutes), not instant.
- Push notifications and the installed app are per origin. On the personal host they'd need to be turned on again, and the app installed from there. Simplest: leave push on justwrite.club and say so.
- Personal versions can't change what the backend returns. A change that needs new data (a new query or field) has to go to `main`.
- Rate limits are the same as today (`MEMBER_DAILY_LIMIT`).

## Optional: personal CSS

A smaller first step that works on the live site instantly: a `personalCss` string per member, written by Claude, injected in a `<style>` tag only for that member, with no JS. CSS can't run code. The CSP above (`img-src`, `font-src`) blocks the one known way to leak data through CSS (`url()` with attribute selectors). This covers "make it denser / bigger text / hide this", not new features.

## Work involved

1. `improvements.target`, a member setting, and phrase matching in `startFromMessage`.
2. Runner: personal branch checkout and rebase, the path allowlist check, skip PR and merge for personal runs.
3. New Vercel project for `personal/*` branches, env with public URLs only.
4. `personalAccess` tokens bound to a host, the sign-in endpoint, and refusing other sign-ins on personal hosts.
5. CSP header in `next.config.ts`.
6. Card button, sidebar link, Reset/Pause in /settings, rebase after merges.

Steps 3–5 touch auth and config, so they need admin review and someone to set up the Vercel project by hand.

## Review notes (product)

A reviewer agent read this draft and pushed back on scope:

- **Probably too late to matter.** Steps 3–5 need admin review and manual Vercel setup, so this would land mid-November with about two weeks of club left.
- **Cheaper alternative: opt-in changes on `main`.** A "just for me" change merges to `main` behind a per-member flag (for example an `optIns` list on `members` and a `useOptIn("...")` hook). It auto-merges when it only touches frontend files and everything is behind a flag that's off by default. That keeps one URL, push, the installed app, and shared links. Other members can turn the flag on in /settings. The tradeoff is that it relies on the path check and classifier, not host isolation.
- **Two URLs break daily use.** Chat links, emails, push taps, and the installed app all open justwrite.club.
- **Do personal CSS first.** It's instant and covers most "denser / bigger / hide this" requests. Check that the CSP doesn't break avatars, fonts, Stripe, or Convex websockets.
- **Ask on the card, not with a saved setting.** Show "Just you / Everyone" buttons before starting, and use a phrase match only to preselect one.
- The allowlist leaves out `lib/**` (for example `theme.ts`), so many requests would fail. Say which file blocked the run.
- Rebase conflicts would happen often. Send pause notices to the member, not to #site. Make clear whether personal runs count toward `MEMBER_DAILY_LIMIT`.

Suggested order: personal CSS, then opt-in flags on `main`. Build per-member branches only if those fall short.

## Review notes (feasibility)

A second reviewer agent checked the draft against the code. Its main points:

- **The main project would also build `personal/*` with its Preview secrets.** Both projects watch the same repo. Set Ignored Build Step in each project's dashboard: main skips `personal/*`, and the new project builds only `personal/*`. Turn off Deployment Protection on the new project.
- **The new project's hosts already pass auth checks.** `just-write-personal-git-…-manifund.vercel.app` matches the current `just-write-*-manifund.vercel.app` pattern. Add a separate personal-host check and block normal sign-in endpoints there with a `before` hook. Don't remove those hosts from `trustedOrigins`, because that would break sign-out and get-session.
- **The token must take no URL or id.** `personalAccess.create` should work out the host from the viewer's own handle. Binding the token to a host relies on the token belonging to the person who made it, since forwarded-host headers can be spoofed.
- **The CSP is defense in depth, not a guarantee.** It doesn't cover server components or top-level navigation. `connect-src` needs the Convex `https`/`wss` and `.convex.site` URLs. `img-src` needs Convex storage, Google avatars, `data:`, and `blob:`. Without a `script-src` rule, no nonces are needed.
- **The runner needs a new checkout path.** Fetch `main` and the personal branch, unshallow the depth-50 clone, and push with `--force-with-lease` after a rebase. Better still, merge `main` in instead of rebasing, then typecheck before pushing. Personal branches are public on GitHub.
- **Add a per-branch lock in `claimImprovement`.** Today the only guard is per thread, so two threads could share one sandbox checkout.
- **Tighten the allowlist.** Check it against the merge-base with `main`. Name exact files: `app/(portal)/layout.tsx`, `app/providers.tsx`, `app/(site)/layout.tsx`, `app/manifest.ts`, `proxy.ts`.

It also found a bug in the current code: `SENSITIVE_PATHS` in `convex/lib/improve.ts` has `^app\/commit\/`, but the commit page is at `app/(site)/commit/`. That rule matches nothing, so changes to the commit page can auto-merge today.

## Review notes (security)

A third reviewer agent looked for holes. Most serious first:

1. **Anyone in a thread can continue someone else's run.** `startFromMessage` continues the most recent run in a thread that has an open PR, without checking who's asking. So if follow-ups kept the personal target, another member's "@Claude …" would land in your branch. Only the owner should be able to continue a personal run. Anyone else starts a new run aimed at `main`.
2. **Prompt injection from thread messages.** Other members' messages go into the agent's prompt. Injected code could leak data through Convex itself, for example by writing a token into a bio, so the CSP doesn't help. For personal runs, leave out other people's messages.
3. **Server code can read the session cookie.** Pages, layouts, `opengraph-image`, `sitemap`, `route.js`/`.tsx`, and inline `'use server'` functions all run on Vercel. They can read the httpOnly session cookie and `fetch` it anywhere, and CSP doesn't apply to them. Personal branches should only be able to change files that start with `"use client"`, plus CSS. Every other file should be identical to `main`, checked by hash. Better: build by laying those client files over `main`.
4. **Personal hosts already match `PREVIEW_HOST`.** Google sign-in and preview access would work there unchanged. Anchor that regex to `claude/<n>` previews and keep personal hosts in their own exact list.
5. **Each project builds the other's branches.** Add an ignore step filtered by branch prefix, and move secrets out of the main project's Preview env.
6. **Never build the redirect from request headers.** Redirect only to a personal URL stored on the server for that member.
7. **Sandbox secrets (true today).** The agent runs as the same user as the runner. It could read the runner's environment (`GITHUB_TOKEN`, `CONVEX_SERVER_SECRET`), or plant a git hook or lint config that runs during push or `bun lint`. With no review on personal runs, a single injection could push to `main`. Push from outside the sandbox, disable hooks, and protect `main`.
8. **Today's read-only previews still let unreviewed code read everything the visitor can.** With no CSP, it can send that data anywhere. Better Auth's own write endpoints don't check the read-only flag either.
9. **CSP details.** Use exact Convex hosts, not `*.convex.cloud`. Add `script-src`, `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'`, `frame-src 'none'`, and `worker-src 'none'`.
10. **Service workers outlive Reset.** Block workers, send `Clear-Site-Data` on Reset, and never put personal hosts under `justwrite.club`, where they could set cookies on the parent domain.

## Where this leaves it

All three reviews agree the full design is a lot of security-sensitive work for the time left. Items 1, 4, 7 and 8 above, and the `SENSITIVE_PATHS` bug, apply to today's @Claude setup and are worth fixing on their own. For Vlad's request, the safest quick win is personal CSS. Next would be opt-in flags on `main`, which go through the existing merge checks.

## What was built

The opt-in flags version:

- `lib/opt-ins.ts` lists opt-ins (`key`, `label`, `for` handle, `by` name). Client code checks one with `useOptIn(key)` from `components/portal/opt-ins.ts`.
- An opt-in is on for the member it was made for and off for everyone else. Anyone can switch any opt-in on or off in /settings under "Just for me". Choices are stored in `members.optIns` (key → on/off). An unset key falls back to the default.
- When a request says "just for me", the runner tells the agent to build it as an opt-in, using the requester's handle. It must keep the site unchanged with the opt-in off and stick to client components and CSS.
- The classifier may auto-merge such changes, even larger ones, when the site is unchanged with the opt-in off and no server code is touched. Everything else follows the normal policy and `SENSITIVE_PATHS`.

Not done: personal CSS, the security fixes listed above, and cleaning up old opt-ins after November. The code still runs on the main site, so it relies on the classifier, not isolation.
