# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

IMPORTANT: when vibecoding, avoid writing slop-sounding copy. Use neutral, simple language in copy instead.

@AGENTS.md

## What this is

Site and member portal for [justwrite.club](https://justwrite.club), a November 2026 online writing club run by Austin through Manifund. Writers express interest, sign in, sign terms, and pay a $1,000 deposit (refunded if they publish 4 essays); committed writers get the member portal. Next.js 16 App Router + Tailwind v4, Convex (data, realtime, auth via Better Auth), Stripe, Resend, OpenRouter. Deployed on Vercel (manifund team, `just-write` project); pushes to `main` deploy to production. `MUSINGS.md` has (old) program notes; `just-write-handoff/` has the approved landing design.

## Commands

```bash
bun install
vercel env pull .env.local   # Stripe keys etc. (bun auto-loads .env.local); then `bun convex` to restore CONVEX_DEPLOYMENT
bun convex                   # pushes convex/ to the dev deployment and watches; tails Convex logs
bun dev                      # localhost:3000
bun check                    # Bun's built-in typechecker (same errors as tsc; includes convex/)
bun lint                     # eslint on app lib components convex scripts (bare `bunx eslint` also scans .next and reports bogus errors)
bunx convex run chat:seedChannels  # create/update the default chat channels (once per deployment)
```

Use `bun` and `bunx` for everything, never `npm` or `npx`. There are no tests.

## Architecture

**Data lives in Convex** (`convex/schema.ts`). `members` (keyed by lowercase `email`) replaces the old Neon `interest` table; its `status` moves `interested → signed → committed`. Other tables: `essays`, `ideas`/`ideaVotes`, chat (`channels`, `messages`, `reactions`, `typing`, `reads`), and `similar` (cached LLM matches). Schema changes deploy with the Convex functions; no migrations needed for new optional fields. `scripts/import-neon.ts` is the one-time copy from Neon.

**Auth:** Better Auth runs inside Convex (`convex/auth.ts`, Google + email magic link); `app/api/auth/[...all]` proxies to it so cookies stay on our domain. A signed-in user is matched to their `members` row by email (`convex/lib/viewer.ts#getViewer`), or by the row's optional `altEmail` (a second sign-in address, set with `bunx convex run members:setAltEmail`). Committed members, readers (below), and `ADMIN_EMAILS` can use the portal; every Convex function checks this itself (`requireMember`, `requireAdmin`), so the client-side gate in `components/portal/frame.tsx` is only UX. Next.js server code calls Convex as the user with `fetchAuthMutation` (`lib/auth-server.ts`), or calls `convex/server.ts` functions with the shared `CONVEX_SERVER_SECRET`.

**Readers ("Just Readers")** are people at Manifund who take part without writing:

- A member row with `status: "reader"`, outside the `interested → signed → committed` path.
- Anyone who signs in with a verified `@manifund.org` address (`READER_DOMAIN` in `convex/lib/viewer.ts`) becomes one the first time they open the portal: `getViewer` sets `joinsAsReader`, and `members.syncProfile` creates or updates the row and posts "joined as a Just Reader" in `#general`.
- Committed writers and admins with that domain stay as they are.
- Readers pass `requireMember`, so chat (with the same #check-ins gate), idea votes and comments, the calendar, and @Claude work for them.
- `requireWriter` refuses them: registering essays, posting ideas, similar writers.
- They have no profile page and aren't in `/members`, the landing page lists, the progress board, or check-in reminders, since those all read `status: "committed"`.
- `members.roster` and the shared Google calendar include them (`portalMembers`); chat shows "Just Reader" next to their name.
- A reader who pays the deposit becomes committed like anyone else (`server.markCommitted`).

**Flow:**

1. `/` — `app/(site)/actions.ts#submitInterest` calls `members.expressInterest`. The public "Interested" list (`app/(site)/interested.tsx`) is a `"use cache"` function tagged `interest`; anything that changes who appears there must invalidate that tag (`updateTag` in server actions, `revalidateTag(..., { expire: 0 })` in route handlers).
2. `/commit` — requires sign-in. `app/(site)/commit/actions.ts#startCommitment` records the signature on the viewer's row (`members.signTerms`, status `signed`) and redirects to Stripe Checkout with the Convex member id as `client_reference_id`.
3. `app/api/stripe/webhook/route.ts` — on `checkout.session.completed` / `async_payment_succeeded`, `markCommitted` (`lib/stripe.ts` → `server.markCommitted`) flips the row to `committed` (numeric references are pre-Convex Neon ids, matched via `legacyId`), then `sendSignedTerms` (`lib/email.ts`) emails the signed terms. Both are idempotent, and failures return 500 so Stripe retries. `/commit/thanks` only displays Stripe's session status; the webhook is the source of truth.
4. Portal (`app/(portal)/`, client-rendered behind `PortalFrame`):
   - Its layout is a second root layout that turns the session cookie into a Convex token server-side and hands it to `PortalProviders` in `app/providers.tsx`, so the browser connects already signed in.
   - Member-only pages are in `app/(portal)/(private)/`; `/members` and `/calendar` are public but sit in the same root layout so sidebar navigation stays client-side.
   - The landing page, `/sign-in`, `/commit`, and `/tweaks` live under `app/(site)/` with a static root layout and Better Auth's own provider; crossing between the two groups is a full page load.
   - Pages: `/home` (deadline countdown, essay slots, registering essays, similar writers, everyone's progress), `/chat/[slug]` (channels with threads, reactions, typing, presence, unread dots), `/ideas`, `/settings` (profile), `/admin` (admins only; essay review), `/improvements` (every @Claude run).
5. `/members` and `/members/[handle]` — public, server-rendered from Convex then live (`app/(portal)/members`); members see them inside the portal shell.

**Essay deadlines** are in `convex/lib/program.ts` (Mondays 9pm PT, Nov 9–30). `fillSlots` assigns registered essays to the earliest open slot they beat; admins can mark essays rejected so they don't count. Registering an essay posts it to `#published`.

**Calendar** (`/calendar`, public; `app/(portal)/calendar`, `convex/events.ts`):

- Each session has its own URL, `/calendar/<slug>` (the calendar with that session's panel open; slugs are set at creation and survive renames).
- Sessions have an owner plus co-hosts (committed members), who can edit, cancel, or hand them off; admins can edit anything.
- Any member can propose a session, and it goes live right away and is announced in `#meetups` (changes are posted as replies).
- Addresses and call links are only returned to members.
- Times are stored as UTC and always shown and entered in Pacific time (`convex/lib/time.ts`).
- `kind: "deadline"` events mark the Monday deadlines (no RSVPs).
- RSVPs (yes/maybe/no) are public; the `claimReminders` cron emails yes/maybe RSVPs and hosts about 24h before.
- Google Calendar: `convex/gcal.ts` mirrors every event into one shared Google calendar through a service account (Convex env `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_CALENDAR_ID`; no-ops while unset).
- It shares that calendar with each member's emails when they commit (`gcal:shareAll` backfills).
- Other apps use a per-member iCal feed served at `<convex site>/calendar.ics?token=` (`convex/http.ts`).
- Seed with `bunx convex run events:seed '{"hostEmail": "..."}'`.

**Chat messages** are Tiptap JSON. `convex/lib/richtext.ts#cleanBody` whitelists node and mark types on the server; `components/portal/rich-text.tsx` renders them to React (no raw HTML). The composer is `components/portal/composer.tsx` (Enter sends, @mentions). Switching channels and opening threads change the URL through `lib/chat-url.ts` (the browser's own History methods, read back with `useChatUrl`), never `history.pushState` or the router: Next.js turns pushState into a cache-only restore that can hang for good.

**Link cards** (`convex/linkPreviews.ts`, `components/portal/link-preview.tsx`):

- Outside links in a chat message (up to 3) get a card with the page's Open Graph title, description, and image, saved once per URL in `linkPreviews`.
- The client asks for missing cards with `linkPreviews.request`, which only fetches URLs found in that message (or its essay), and never local or private hosts (`convex/lib/linkMeta.ts#previewableUrl`).
- Cards are refreshed after 7 days; pages that couldn't be read are retried after a day.
- Essay posts in #published, and links to registered essays, show the essay card: cover image, Claude's one-sentence summary, its themes (linking to `/themes`), and length.
- The summaries come from the same `themesAction.compute` call as the themes (`themes.summaries`), so a new essay gets one when themes next update.

**Installed app and push:**

- `app/manifest.ts` makes the site installable. It opens on `/home`, its icons are in `public/icons` (rendered from `app/icon.svg`), and links shared to it prefill the essay form.
- `public/sw.js` only handles push; it caches nothing.
- Members turn notifications on per device in `/settings` (`lib/push.ts`).
- Everything that posts a chat message goes through `convex/lib/messages.ts#postMessage`, which schedules `pushAction.notify`.
- `push.recipients` picks who gets one: people mentioned and people in the thread, plus every top-level post for members who chose "All new messages".
- The author and anyone with that channel open (presence) are skipped, and #check-ins text stays behind its gate, as in the app.
- On iPhone, push only works after adding the site to the Home Screen.

**Activity** (`/activity`, `convex/activity.ts`): mentions of the viewer and replies in threads they're in.

- Items are `activity` rows (one per member a message involves) written when the message is posted: `convex/lib/messages.ts#postMessage` calls `convex/lib/activity.ts#recordActivity`, which uses the same `involvement` sets as push notifications.
- Deleting a message drops its rows (`forgetActivity`).
- Claude's status card is posted empty, so it becomes an item when its run ends (`improvements.endRun`, which every final status goes through).
- Reading an item sets `readAt`.
- The sidebar subscribes only to `activity.unreadCount`, and the full `feed` is subscribed on the page itself.
- Keep it that way: anything the whole portal subscribes to re-runs for every member on every change to what it read, so it should read a few rows of that member's own, never scan messages.

**Similar writers:** `convex/similarAction.ts` asks Claude (via OpenRouter) to pick 3 matches from bios, essay titles, and shared ideas; results are cached in `similar` and recomputed when the inputs' hash changes or after 24h.

**Themes** (`/themes`, members only; `convex/themes.ts`, `convex/themesAction.ts`):

- A word cloud and Claude's themes across every essay that isn't rejected, linked from "Everyone's progress" on `/home`.
- It's also in the portal sidebar, after Ideas.
- Opening the page asks for an update (`themes.request`) when the set of essays changed, at most once an hour for everyone.
- `themesAction.compute` reads each essay's page once into `essayTexts` (`convex/lib/essayText.ts#essayText`; public Google Docs through their text export) and retries pages with no readable text after 12h.
- The cloud (`buildCloud`) leaves out common words, needs a word to be used by two writers, and adds the square root of each essay's count so one long essay can't take over.
- Themes come from one OpenRouter call over the essays' text (300k characters in all, split evenly), saved in the single `themes` row; a failed call keeps the old themes.

**@Claude improvements:** mentioning `@Claude` in chat asks an agent to change this site.

- How to edit these @Claude sections: one fact per line. Add new facts as new bullets, and change a line only when the behavior it describes changes.
- Merge or close @Claude PRs soon after they're ready; open PRs collect conflicts as main moves.
- Do repo-wide changes (formatting, renames) while few @Claude PRs are open.

How a run goes:

- Claude is a `members` row with `bot: true` (`CLAUDE_EMAIL`, created by `chat:seedChannels`), in the roster but hidden from directories.
- `chat.send` → `improvements.startFromMessage` records an `improvements` row and posts Claude's reply in the thread.
- That reply is a message with `improvementId`, rendered by `components/portal/improvement.tsx` as a live checklist, then the result.
- `startFromMessage` schedules `improvements.kick`, which POSTs to `IMPROVE_URL` (`app/api/improve/route.ts`).
- The route claims the run and starts a Vercel Sandbox with the repo cloned at `/vercel/just-write`, then launches `scripts/improve-runner.ts` detached.
- The runner runs the Claude Agent SDK (Opus via OpenRouter's Anthropic endpoint).
- A code run's brief also lists other threads' open PRs and latest merges (title, branch, files, who asked where; `server.ts#otherWork`, limits in `convex/lib/improve.ts`), so the agent knows what else is changing.
- The runner typechecks and lints (giving the agent two tries to fix failures), and reports its steps to `convex/runner.ts`.
- The agent returns a structured result: `title`, a 1–2 sentence `chat` reply for the card, and `details` for the PR body.
- Then the runner sends its list of changed files back to the route.
- `lib/improve-finish.ts` reads those files out of the sandbox, commits them to `claude/<n>` through GitHub's API, and opens a PR.
- It merges the PR if `MERGE_POLICY` allows, judged on GitHub's diff of the branch, not on what the sandbox says.
- Changes to `SENSITIVE_PATHS` always wait for an admin.
- `convex/schema.ts` (`ADDITIVE_ONLY_PATHS`) only merges on its own when its diff adds lines and removes none.
- `CLAUDE.md` goes to the merge review like other files, which asks what the change tells agents to do; a new `@` import in it always waits, since the review wouldn't see the imported file.
- Everything else is read by `MERGE_REVIEW_MODEL` (Opus) with the request, the diff, and every changed server file in full, against a fixed checklist (`lib/improve-finish.ts#CHECKLIST`); any yes means review.
- The review's answers are posted as a comment on the PR.
- At most `BACKEND_AUTOMERGES_PER_DAY` changes under `convex/` merge without an admin in 24 hours (`server.ts#backendAutoMerges`).
- Settings (merge policy, models, rate limits, paths that always need review) are in `convex/lib/improve.ts`.
- `server.reportImprovement`'s `patch` validator is built from the `improvements` table in `convex/schema.ts` (minus fields set at creation or owned elsewhere), so a new field only needs the schema.
- Merges are announced in `#site`; `/improvements` lists every run.
- Smoke-test the sandbox side with `bun scripts/improve-try.ts "<request>"` (dry run: nothing is pushed or reported).

Secrets and the sandbox:

- The sandbox never gets `GITHUB_TOKEN` or `CONVEX_SERVER_SECRET`, since members steer the agent in it. Keep secrets out of the sandbox.
- It gets only the OpenRouter key and a random per-run key (Convex keeps its hash in `runTokenHash`).
- The per-run key works for that run's card while it's going and is retired when it finishes.
- The route runs the runner from the deployed commit (copied to `/tmp/improve-runner`), not the clone's copy.
- `RUNNER_FILES` in the route lists what gets copied: `scripts/improve-runner.ts` (the entry), `scripts/improve-runner/`, and `convex/lib/improve.ts`. Runner modules import each other with relative paths, and only dependency-free files.
- Runner modules: `context.ts` (brief, env), `report.ts` (steps, log, heartbeat to Convex), `shell.ts`, `prompt.ts` (rules, prompt, result), `agent.ts` (SDK session, follow-ups, Stop, images), `git.ts` (`mergeMain`, changed files), `checks.ts`.

Hangs and timeouts:

- Vercel's Sandbox API can hang without answering, so every Sandbox call in the route and `lib/improve-finish.ts` has a time limit (`lib/time-limit.ts#withTimeLimit`).
- Each request gives up at 250s (`maxDuration` is 300), marking the run failed ("The sandbox stopped responding.") instead of being killed silently.
- Start retries only happen if they fit.
- A saved sandbox that hung is deleted and replaced on the next try.
- As a backstop, the `reapStale` cron (every 10 min) fails runs still queued or running 47 minutes after they started (`convex/lib/improve.ts#staleAfterMs`: the sandbox's 40 plus the finish request).
- `reapStale` also releases follow-ups waiting on a run that already ended.

Admin actions:

- Admins get Merge/Close/Revert on the card (`app/(portal)/(private)/improvements/actions.ts`, via `lib/github.ts`).
- If an admin's Merge fails because the PR conflicts with main, `server.fixConflicts` starts a follow-up in the PR's thread on its own (its card then has the Merge button).
- If another code run in that thread is going, the fix waits for it; `server.takeFollowUps` never hands a run tied to another PR's branch to the running agent.

Keeping open PRs current:

- `lib/improve-sync.ts#syncOpenPrs` merges main into every open `claude/*` PR that's behind, with GitHub's update-branch (a real merge commit).
- It runs after each of our merges (`lib/improve-finish.ts`, the admin Merge button, via `after()`), and every 30 minutes from the `sync open PRs` cron (`convex/prSync.ts#sweep` → `IMPROVE_URL` + `/sync`, `app/api/improve/sync/route.ts`), for merges done on GitHub.
- It skips a PR while any code run in its thread is queued or running (`prSync.prState`), since `finishRun` refuses to push to a branch that moved.
- A PR whose update fails because it conflicts gets `conflictsWithMain` on its card ("conflicts with newer changes"); the next clean check clears it.
- It doesn't start runs on its own: an admin's Merge on that card starts `server.fixConflicts` as usual.

Follow-ups:

- A reply with `@Claude` in the same thread may continue one of the thread's open PRs.
- Before the sandbox starts, the route asks `lib/improve-target.ts#pickTarget`: `!new` or `!pr 40` (or "new PR", "#40") in the request wins, then a quick classifier call over the thread, falling back to the previous run's PR.
- `server.continuePr` moves the run onto the picked PR's branch.
- If the thread's previous run failed after its sandbox started (out of steps, timed out), a reply picks that run up instead, unless it names a PR or asks for a new one.
- Picking up a failed run keeps its branch, so its saved sandbox comes back with the uncommitted edits, and the agent session resumes (the runner saves the session id as soon as the agent starts).
- If the sandbox comes back fresh, it starts over on the branch.
- A run that continues a PR first merges the latest main into its branch (`mergeMain` in the runner, uncommitted).
- Conflicts from that merge are left for the agent to resolve, and the checks fail while conflict markers remain.
- The runner reports main's commit as `merged`, and `lib/improve-finish.ts` (after checking it's on main) pushes a real merge commit with it as the second parent, so GitHub sees the PR as up to date.
- When the agent runs out of steps with files changed, the runner still checks and pushes them.
- That PR opens marked "(unfinished)" and never merges on its own; the title loses the mark once a follow-up finishes.
- A follow-up sent while a run is still going waits (`waitingOn`).
- While the agent is working, the runner polls `server.claimFollowUps` and passes those to it at priority `next` (read after its current tool call).
- `server.takeFollowUps` doesn't hand over a follow-up that asks for `!new` or `!pr` of another PR; it waits and picks its PR when the run ends.
- Follow-ups that arrive after the agent has finished start as their own run when that run ends (`improvements.releaseWaiting`).

Replies without @Claude:

- Replies that don't mention @Claude can reach it too (`convex/untagged.ts#handleUntaggedReply`, called by `chat.send`; never in #check-ins).
- While a code run in the thread is going, they're queued on it (`untaggedReplies`, capped), and `server.takeFollowUps` hands them over with the tagged ones.
- The runner tells the agent those replies may be members talking to each other.
- Replies the agent never took (sent after it finished, or after Stop) are checked like later replies when the run ends (`untagged.ts#checkLeftovers`, from `releaseWaiting`), unless a follow-up is about to start.
- If the member who asked edits their request message while the code run is going, `chat.edit` queues the new text the same way (`untagged.ts#noteEditedRequest`, marked `edited`), and the agent reads it as a follow-up note.
- Editing a request that's still queued just updates it.
- After that, for a day after Claude's last run in the thread, `untagged.check` asks `CLASSIFIER_MODEL` whether the reply is a request for Claude.
- `untagged.check` runs at most `UNTAGGED_CHECKS_PER_DAY` times per thread, counted in `claudeThreads.checks`.
- If it is a request, `untagged.pickUp` calls `startFromMessage` with `untagged`, which stays silent if limits stop it.
- Such a run is marked (`untagged`, shown on the card), and the agent is told to stay out of it if it was really a conversation.
- `@Claude !mute` / `!unmute` (a command, `convex/lib/improve.ts#readRequest`) turns this off or on per thread (`claudeThreads.muted`).

Commands:

- `convex/lib/improve.ts#readRequest` is the one parser for the `!` words members put at the start of a message, after the mention (`@Claude !chat !effort high who has published twice?`).
- A `!` word later in the message is just text, so "add a !mute command" is still a request.
- The older phrases ("chat task", "new PR", "continue #40", "effort: high", "in parallel") still work anywhere in the message; a `!` word wins over them.
- A message that starts with `!mute`, `!unmute`, `!status`, or `!help` is only that command; `startFromMessage` replies right away and starts no run.
- A leading `!` word it can't read (`!stauts`, `!pr` without a number) gets a reply pointing at `!help`, and no run.
- The rest steer a request: `!chat`, `!code`, `!new`, `!pr 40`, `!effort high`, `!parallel`, `!restart`.
- `!status` replies with the thread's latest run, its status, and its current step.
- `!help` replies with lists from `HELP` in `convex/lib/improve.ts`, which the `/improvements` page also shows; add new words there.

Stopping a run:

- The member who asked and admins see a Stop button on a running card (`improvements.stop`).
- A queued run or a chat task ends right away.
- A code run's runner sees the stop on its next `runner.followUps` poll, aborts the agent, and goes down the out-of-steps path.
- That means edits pushed as an "(unfinished)" PR, or a failed run if nothing changed; either way it's resumable with "@Claude continue".
- `improvements.forceStop` ends the run after 90s if the runner doesn't.

Restarting a run:

- `@Claude !restart` (`readRequest`'s `restart`, optionally followed by more directions) starts the thread's latest code run over with a fresh agent session instead of resuming.
- If that run is still going, it's stopped first, the same way as Stop (`improvements.ts#requestStop`), and the restart waits for it to wrap up.
- The new run has `restart: {run, request}` and `previousId`; it redoes the original request, carried through chains of restarts.
- `server.claimImprovement` puts it on the earlier run's PR if that PR is still open, and never resumes a session; the route skips its target choice.
- It's never handed to the running agent as a follow-up (`server.takeFollowUps`).

Effort:

- Writing `!effort high` or `effort: high` (low/medium/high/xhigh/max) in a request sets the agent's effort for that run (`readRequest`'s `effort`).
- The resolved effort is saved on the run (`effort`).
- A follow-up that continues a run (`server.continuePr`) keeps that run's effort unless it sets its own.
- Any other run that doesn't set one (a reply to a chat answer, a new PR in the same thread) keeps the effort of the thread's latest earlier run that had one (`server.ts#threadEffort`).
- A follow-up handed to a running agent that sets an effort switches it live: `server.takeFollowUps` passes the `effort` and saves it on the run, and the runner calls the SDK's `applyFlagSettings` (`agent.ts#switchEffort`); later sessions in that run keep it.

Parallel requests:

- A code request that asks for it (`!parallel`, or "in parallel"/"separate PRs" anywhere; `readRequest`'s `parallel`) is split by a quick model call (`lib/improve-split.ts`) before the target is picked.
- It splits into up to `MAX_PARALLEL` parts, each counted toward the daily limits.
- `server.splitRun` keeps part 1 on the run and gives each other part its own run in the same thread (`split: {from, part, of}`, own card, branch, and sandbox), started right away.
- Parts always start new PRs, and the agent's request lists the other parts so it leaves them alone.
- A follow-up sent while parts are going isn't handed to any of them mid-run; it waits until all have ended, then picks its PR as usual.
- When a part ends while others are still going, `releaseWaiting` moves that follow-up onto a sibling that's still going.

Access:

- Runs are member-only: `improvements.list` and `improvements.card` call `requireMember` (read-only previews allowed).
- The `/improvements` page is in `(private)`, since requests and errors can quote anything said in chat.

Images:

- Images posted in the thread reach the agent: `server.claimImprovement` puts their URLs on the brief.
- The brief gets the newest `BRIEF_IMAGES_MAX`, never from text a brief hides, such as other members' check-ins.
- The runner downloads them and attaches them to its first message (`BRIEF_IMAGE_BYTES` each; skipped ones are listed for the agent).

**@Claude activity and logs:**

- Between checklist steps the runner sends a heartbeat (`runner.activity`, at most every ~12s), stored as the run's `activity`.
- The heartbeat holds the main agent's open tool call and the subagents and background commands it's waiting on, from the SDK's `task_*` events and subagent messages.
- `activity` is cleared when the agent session ends and when the sandbox finishes.
- The card shows the activity while the run is `running`.
- The runner also batches a detailed log (assistant text, tool calls and results, subagent starts and finishes, its own shell commands, errors) to `runner.log` every few seconds.
- Secrets in the log are replaced by `redact`. That's a guard against accidents, not a boundary: the agent holds the OpenRouter key and members steer it.
- Logs are in `improvementLogs`, with per-event and per-run caps in `convex/lib/improveLogs.ts`.
- Checklist steps and the final status are added to the log on the Convex side, so the route's push and PR steps show up too.
- Members open a run's log from the card ("Log", `/improvements/<id>/log`), live while it runs and linked to the previous and next run in the thread.
- Access is `improvements.ts#canReadLog`: members, like `/improvements`, since the coding agent has no live site data and the only member content in a log is the thread it was asked in.
- In #check-ins the log stays hidden while the thread's first post is still a preview for that member.
- Chat tasks read the club's data, so their logs are admin-only.

**@Claude chat tasks** (`convex/chatTasks.ts`):

- A request that starts with `!chat` (or says "chat task", or follows only chat tasks in its thread without `!code`/`!new`/`!pr 40`/"new PR"/"continue #40") reads the club's data instead of changing code, to answer a question or post one message.
- `kind: "chat"` is set when the run is created (`convex/lib/improve.ts#isChatTask`; `CHAT_TASKS_ENABLED` turns it off), or right after it's claimed (below).
- A code run whose request says neither kind and isn't a restart, split part, or fixConflicts run (`server.ts#kindUnsaid`) gets `askKind` on its brief.
- For those, the route asks `lib/improve-kind.ts#pickKind` (a quick `CLASSIFIER_MODEL` call over the thread) before anything else; it answers code when unsure or when it fails.
- If it reads the request as a chat task, `server.becomeChatTask` switches the run before its sandbox starts, logs the reason, releases code follow-ups waiting on it, and returns a chat-task brief.
- Runs only ever switch from code to chat, never back, since chat-task briefs and logs hold members-only data.
- An unmarked request sent while a code run in its thread is going is still handed to that agent as a follow-up; the agent tells them to ask again with `!chat`.
- Chat tasks and code runs never wait for or take follow-ups from each other.
- The route reads `chatTasks.snapshot`/`messages` with the server secret and the run's key (only before its sandbox exists), then starts a throwaway sandbox.
- In that sandbox, bun, the Agent SDK (into `/tmp/agent`), and the runner go in first (`lib/chat-task-sandbox.ts#SETUP`), then the firewall, then the data at `/tmp/club` and the run key.
- The firewall only lets through the model API on its messages path, the Convex host, and GET/HEAD to any other site.
- The firewall adds the OpenRouter key; the sandbox has a placeholder.
- GET/HEAD to other sites gives the agent WebSearch and WebFetch; a confused agent could leak members-only data in a URL, which admins accepted.
- The runner reports steps through `runner.report` and its result through `chatTasks.finish` (it can't reach `/api/improve`).
- Convex stops the sandbox when the run ends (the route's `stop` request).
- The data is what any member sees, never emails, payments, or settings, and never #check-ins text (only who, when, and length).
- Thread briefs for both kinds also reduce check-ins to that, and code-run briefs leave out chat tasks' results, since PRs are public.
- If the agent returns a post, `finish` posts it as Claude (`messages.postedFrom`, shown with "Posted for <name>", deletable by that member).
- Posts go in one of `CHAT_POST_CHANNELS` (never #check-ins), within `CHAT_POSTS_PER_MEMBER`/`CHAT_POSTS_PER_DAY`.
- Otherwise the post stays on the card as a draft with "Use this draft", which adds it to the viewer's own message box (`composer.tsx#addToComposer`).
- Posts are a Markdown subset converted by `convex/lib/markdown.ts` and cleaned by `cleanBody`.
- Smoke-test with `bun scripts/improve-try.ts --chat "<request>"` (made-up data, same firewall, dry run).

**Terms text lives in `lib/terms.ts`** as plain data (strings, or runs with links). Both the `/commit` page and the email render from it, so edit terms there, not in JSX.

**Styling:** design tokens (colors `ink`, `cream`, `brass*`; fonts `font-display`, `font-body`) are defined in `app/globals.css`. `/tweaks` is a design playground for fonts and palettes; `app/(site)/tweaks/options.ts` `DEFAULTS` mirrors what the live site uses. The email in `lib/email.ts` hardcodes the same hex colors inline.

**Env vars (Vercel / `.env.local`):** `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `CONVEX_SERVER_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (live Stripe keys are Production-only on Vercel), `RESEND_API_KEY`, `GITHUB_TOKEN` (repo contents + pull requests write, for @Claude), `OPENROUTER_API_KEY` (passed into the @Claude sandbox), optional `RESEND_FROM` (defaults to `austin@manifund.org`, verified in Manifund's Resend account). Stripe is Manifund's live account; deposits are donations to Manifund. `DATABASE_URL` (Neon) is only used by `scripts/import-neon.ts`.

**Env vars (Convex deployment, `bunx convex env set`):**

- `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_SERVER_SECRET` (same value as in Vercel), `ADMIN_EMAILS` (comma-separated).
- `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Google Cloud project `just-write-513304`; copies kept in gitignored `.env`).
- `RESEND_API_KEY` (magic links; without it links are logged instead of sent), `OPENROUTER_API_KEY`.
- `IMPROVE_URL` (e.g. `https://justwrite.club/api/improve`; while unset, Claude replies that it isn't switched on).
- All are set on the dev deployment (`brilliant-starling-517`), which sends real email.
- `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are the key pair that identifies this site to browsers' push services. Generate them once with `bunx web-push generate-vapid-keys` (free, no account).
- Until both VAPID keys are set, push is off and `/settings` says so.
- Keep the same VAPID keys: subscriptions are tied to the public key, so changing them stops notifications for everyone until each person turns them off and on again.

**One Convex deployment:**

- There is no production Convex deployment; justwrite.club and localhost both use the dev deployment (`brilliant-starling-517`).
- So `bun convex` pushes go live immediately, and test data is visible to real members; don't seed fake members or post test messages there.
- Auth takes its base URL from the request host: `ORIGINS` in `convex/auth.ts` (localhost:3000, justwrite.club) plus this project's `just-write-*-manifund.vercel.app` previews.
- `trustedOrigins` allows those previews per request because the Convex proxy only trusts exact hosts.
- Google sign-in on a preview detours through justwrite.club (Better Auth's `oAuthProxy`), since Google's redirect URIs are fixed.
- Add a host to `ORIGINS` (and to the Google OAuth redirect URIs) to serve auth anywhere else.

**Read-only previews:**

- The Preview button on an @Claude card goes to `app/(portal)/(private)/improvements/[id]/preview`, which makes a one-time token (`convex/previewAccess.ts`) and redirects to the preview's `/api/auth/preview-access`.
- That endpoint (in `convex/auth.ts`) signs the member in as themselves with a session marked read-only; its JWT carries `readonly: true`.
- `requireMember`/`requireAdmin` refuse read-only sessions in mutations (`allowReadonly` exempts presence and read markers), so previews of unreviewed code can't change live data.
- Vercel has `NEXT_PUBLIC_CONVEX_URL`/`NEXT_PUBLIC_CONVEX_SITE_URL` (all environments) and `CONVEX_SERVER_SECRET` (Production, Development) pointing at it.
- Production builds on Vercel push `convex/` before building the site (`buildCommand` in `vercel.json`, authenticated by the `CONVEX_DEPLOY_KEY` env var, Production only), so merging to `main` deploys the backend too.
- Preview builds don't push `convex/`.
