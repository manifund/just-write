# What to take from Claude Tag

Written Nov 10 for Vlad in #site, following run #141. Claude Tag is Anthropic's Claude for Slack (public beta). This compares it with our @Claude and proposes what to build, in order. It complements the proposals in `tag-v2.md` (eyes, memory, PM thinking, trust tiers, "just for me", an editor persona), which still stand.

Sources: the Claude Tag docs at claude.com/docs/claude-tag: overview, how it works, getting started, memory, routines, commands, when Claude responds, good habits. Our side is from the code as of `b14d5e6`.

## How the two compare

|                   | Claude Tag                                                                                                               | Our @Claude                                                                                                                  |
| :---------------- | :----------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| Start             | `@Claude` in a message; it reacts with an emoji within seconds                                                           | `@Claude` in a message; the card is posted right away                                                                        |
| Unit of work      | One session per thread, kept for the life of the thread; the sandbox is released when idle and rebuilt on the next reply | One run per mention; a reply in the thread continues the thread's PR and can resume a failed run's saved sandbox and session |
| Progress          | A checklist edited in place, plus a working indicator at the bottom of the thread                                        | A live checklist card (`components/portal/improvement.tsx`)                                                                  |
| Stop              | **Stop** button on the working indicator; Claude keeps the session and posts who stopped it; `@Claude` picks it up again | None. A run goes until it finishes, runs out of steps, or times out (`reapStale`)                                            |
| Follow-ups        | Any reply in a thread Claude is in reaches it, from anyone, with no mention                                              | Only replies that mention `@Claude`. Mid-run ones are passed in (`runner.followUps`); later ones start a new run             |
| Edits             | An edit reaches Claude as a before/after note, never starts a task                                                       | An edit doesn't reach Claude                                                                                                 |
| Attachments       | Reads images (up to ~3.75 MB) and PDFs; up to 5 files a message                                                          | Text only; screenshots don't reach the agent                                                                                 |
| Memory            | Notes per channel plus workspace notes; "remember for this channel: …", "what do you remember?", anyone can correct      | None beyond the repo and the thread brief                                                                                    |
| Scheduled work    | Routines: "every weekday at 9am Pacific, …", channel watches, following a PR; at most hourly; `!scheduled` lists them    | None                                                                                                                         |
| Commands          | `!help`, `!status`, `!restart`, `!mute`/`!unmute`, `!fast`, `!fork`, `!scheduled`, `!configure`, `!feedback`             | `effort: high`, "new PR", "#40", "chat task"                                                                                 |
| Ambient replies   | By default may answer untagged messages it judges it can help with, or offer privately                                   | Never                                                                                                                        |
| Posting elsewhere | Can post in another public channel with "Sent by Claude in #x on behalf of @y"                                           | Chat tasks post in `CHAT_POST_CHANNELS` with "Posted for <name>"                                                             |
| Who can steer     | Anyone who can message Claude there                                                                                      | Anyone who mentions @Claude; Merge/Close/Revert are admin-only                                                               |

The main gaps are Stop, replies without re-tagging, memory, images, and routines. We're ahead in a few places: PR merge policy and the admin buttons, read-only previews, `/improvements`, and effort per run. Those come from our use case (members changing the site itself), which Claude Tag doesn't have.

## Proposals, best first

### 1. A Stop button on the card

**Claude Tag:** Stop is on the working indicator. Claude stops, keeps the session, and posts a line naming who stopped it. Mentioning it again picks the work back up.

**Why:** members currently can't call off a run that misread the request. It keeps using steps and the daily limit, and a code run can still merge.

**Design:**

- A **Stop** button on the card while the run is going, for any member who can post in the thread. Read-only preview sessions can't use it (mutations already refuse them).
- `improvements.stop` records `stoppedBy` and `stopRequestedAt` on the row. For a chat task it ends the run and stops the sandbox right away, the same way `endRun` does now.
- For a code run, the runner already polls `runner.followUps` every few seconds; that response gains a `stop` flag. On it, the runner interrupts the Agent SDK query and goes down the existing out-of-steps path: if files changed, it checks and pushes them as an "(unfinished)" PR that never merges on its own; if nothing changed, the run ends with no PR.
- The card's final state reads "Stopped by <name>". The saved sandbox and session id stay, so a later `@Claude` reply resumes the run through the existing "pick up a failed run" path.
- If the runner doesn't stop within about a minute (stuck tool call), Convex marks the run stopped anyway and asks the route to stop the sandbox.

**Open question:** should stopping a code run push its partial edits, or discard them? Pushing keeps work and matches the out-of-steps behavior; discarding is closer to what "stop" suggests. I'd push, since the PR is marked unfinished and needs a person to merge it.

**Size:** small to medium. Touches `convex/improvements.ts`, `convex/runner.ts`, `convex/schema.ts`, `scripts/improve-runner.ts`, `app/api/improve/route.ts` and the card. All but the card are in `SENSITIVE_PATHS`, so it needs admin review.

### 2. Thread replies reach Claude without re-tagging

**Claude Tag:** once Claude is in a thread, every reply reaches it, from anyone. A mention is how you guarantee a reply, not a requirement. `!mute` (or a thumbs-down) quiets a thread.

**Why:** people forget the tag mid-thread ("also make it blue") and the instruction is lost. Members also talk to each other in these threads, though ("looks good!", "it works!"), so starting a code run on every reply would be noisy and costly.

**Design, in two steps:**

1. **While a run is going**, every reply in its thread is passed to the agent as a follow-up, tagged or not. This is the same `runner.followUps` path as tagged mid-run replies, so it's a small change in `chat.send`: if the thread has a running improvement, queue the reply. The runner's prompt should say untagged follow-ups may be people talking to each other, which it can ignore.
2. **After a run ends**, an untagged reply goes to a cheap classifier (Haiku or Sonnet via OpenRouter, like `pickTarget`) with the last few messages: "is this asking Claude to do something?" If yes, and the reply came within a day of Claude's last message there, it starts a run as if tagged. If no, nothing happens. Classifier calls are cheap, but they should still have a per-thread cap.

- `@Claude !mute` / `!unmute` in a thread turns step 2 off for that thread (an optional `muted` field on the thread's root message or a small table).
- The card notes "picked up without a tag" so people learn the behavior and can say so if it was wrong.

**Recommendation:** build step 1 now and step 2 after seeing a week of step 1. Step 1 has no new cost and no risk of surprise runs.

**Size:** step 1 is small (`convex/chat.ts`, `convex/improvements.ts`). Step 2 is medium.

### 3. Channel notes ("remember for this channel")

**Claude Tag:** each channel has notes. Claude saves facts it learns, people say "remember for this channel: …", and anyone can ask "what do you remember?" and correct or delete entries. Its docs say to keep notes short and put longer playbooks in the repo.

**Design:**

- A `notes` table: `channelId` (or none, for club-wide), `text`, `authorId`, `createdAt`.
- `@Claude remember for this channel: …` and `@Claude forget …` are handled in `startFromMessage` without a sandbox, like the not-switched-on reply. Claude confirms in the thread.
- Both kinds of brief include the notes for the request's channel plus club-wide ones, capped at a few hundred words.
- `@Claude what do you remember?` lists them. A short list on `/improvements` lets members edit or delete entries.
- Notes about the code (patterns, sharp edges) belong in `CLAUDE.md` or `docs/`, not here, so they go through review. `tag-v2.md` proposal 2 covers that half.

**Size:** medium. A schema addition, so it needs admin review.

### 4. Images in the brief

**Claude Tag:** reads attached images and PDFs directly.

**Why:** `tag-v2.md` counted six requests with screenshots in the first week, none of which reached the agent. Bug reports with screenshots took second and third tries.

**Design:** collect image URLs from the request message and the thread, fetch them in the route, and pass them to the Agent SDK as image content blocks in the first user message. Cap the count and size, like Claude Tag (5 per message, about 4 MB each). Chat tasks could get the same for images in the messages they read.

**Size:** small to medium, mostly in the route and runner.

### 5. Routines: scheduled chat tasks

**Claude Tag:** "every weekday at 9am Pacific, …" creates a routine that runs like a typed request on a schedule. Routines run at most hourly, belong to the channel, and anyone there can list or stop them.

**For us:** the obvious ones are a recap after each Monday 9pm PT deadline (who published, who's close, using `convex/lib/program.ts`), and a weekly #site digest of what @Claude shipped.

**Design:**

- A `routines` table: channel, prompt, schedule (weekly day and time in Pacific, using `convex/lib/time.ts`), `createdBy`, `active`.
- An hourly cron finds due routines and starts a chat task with the routine's prompt, through the same path as a typed one. Posts still go through `CHAT_POST_CHANNELS` and the daily post limit.
- To start with, admins create routines. Members can ask "@Claude what routines are set up?" and any member can pause one.

**Size:** medium. A schema addition and a cron.

### 6. Small things worth copying

- **`@Claude !status` and `!help`.** The card already shows status, so `!status` matters less here. `!help` could reply with what @Claude understands (`effort:`, "new PR", "#40", "chat task", and anything above that gets built). Cheap.
- **`!restart`.** Start the thread over with a fresh agent session on the same PR, instead of resuming. Useful when a run went down the wrong path and resuming would carry that along. Cheap once Stop exists.
- **Show model and effort on the card.** Claude Tag's footer names the model. Ours stores `effort` per run; showing it ("Opus 5.5, high effort") helps people learn what `effort:` does. Cheap.
- **Edits as notes.** If someone edits their request while it's running, pass the new text in as a follow-up. Small.
- **`!fork`.** Move a side request into its own thread. Not needed yet; members can just post a new message.

## Not worth taking

- **Ambient replies and private suggestions.** Claude answering untagged messages in a writing club's chat would be noise, and our app has no "only you can see this" messages.
- **Per-channel connectors and access settings.** We have one repo and one data snapshot, and the chat task firewall already limits what a run can reach.
- **Fast mode.** Our runs are short already, and cost matters more than speed here.
- **Hosted pages.** Reports like this one fit better as a doc in the repo or a chat task reply.

## Suggested order

1. Stop button.
2. Untagged replies during a run (step 1 of proposal 2).
3. Images in the brief.
4. Channel notes.
5. Model and effort on the card, `!help`, `!restart`.
6. Routines, starting with the Monday deadline recap.
7. Untagged replies after a run (step 2), if step 1 goes well.

Each of these can be its own @Claude request in #site. Most of them touch files in `SENSITIVE_PATHS` (`convex/chat.ts`, `convex/improvements.ts`, the runner, the route, the schema), so expect them to wait for an admin.
