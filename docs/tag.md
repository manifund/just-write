I'd like you to design a feature for the Just Write codebase similar to @claude tag, or what Patrick Collison describes as "improvements"/liquid UI. Specifically, members should be able to describe new feature requests or bugfixes for this site with @claude, and in response some claude instance should go off and implement it.

I imagine that smaller changes should just be merged in automatically, and larger changes can exist as a new PR that claude posts as a reply, which I (Austin) can approve just be clicking a button in the app. (Relevantly, this set of users is pretty high trust, and also not much about the codebase is particularly private/sensitive, so I'm not that concerned about designing against adverserial inputs)

Think about what it would take to be able to implement this kind of feature well, and ask me any questions you have before starting.

Some references that might be helpful. Don't worry about matching the existing specs, instead, take these as inspiration, but focus on an amazing overall user experience.
- https://claude.com/docs/claude-tag/overview
- https://x.com/patrickc/status/2116636967517798672, replicated as:

 I'm now building an "improvements" feature into all of my personal vibecoded applications: a freeform text input that's hooked up to an agent that yolo implements whatever is submitted.

It's an interesting experience -- the activation energy barrier to sanding any rough edge or implementing any new feature becomes extremely low. Someone else who uses one of the applications I created has already implemented 150 improvements over the course of a few days. This pattern feels like a new kind of tool -- liquid software? -- and every application that doesn't have this feature now has a slightly rigid and anachronistic flavor. Why can't I just tell it how I want it to be different?

Now, it's not obvious to me how this pattern can or should scale. Does it become unmaintainable after a while? (Maybe model intelligence improvement outstrips my feature appetite such that it's fine?) How does collaborative software work in this model? Can software designed this way be secure and reliable?

Whatever the larger questions about broader deployment, it definitely works great in a personal context. It reminds me a little of the visions of Lisp/Lisp machines, Smalltalk, and HyperCard -- systems that the user can take control of and modify. Those visions never quite worked, though: the vast majority of software today is not end-user modifiable in any useful way. So, while this "liquid" affordance is a very small touch, the way it changes one's relation to the software feels a bit transgressive and empowering in a Lickliderian and Engelbartian way.

## Fable 5.1 proposal

Decisions so far: runner is Vercel Sandbox + Claude Agent SDK on Opus 5.5 (`anthropic/claude-opus-5-5` via OpenRouter); the only entry point is an `@Claude` mention in chat; merge policy is a code flag; model calls go through OpenRouter. The run should feel fast and interactive: members watch Claude spin up and follow along in the thread.

### Flow

1. **Ask.** A member mentions `@Claude` in a channel message or thread reply. Claude is a special roster entry (a `members` row flagged `bot: true`, hidden from directories and progress). The request, the thread so far, the channel, and the requester become the brief.
2. **Queue.** `chat.send` detects the Claude mention and inserts an `improvements` row (`queued`), then schedules a Convex action that POSTs to a Next.js route (`/api/improve`, guarded by `CONVEX_SERVER_SECRET`).
3. **Run.** The route starts a Vercel Sandbox: clone `manifund/just-write`, `bun install`, run the Agent SDK with CLAUDE.md as context and a system prompt describing the site, the ask, and the rules below. The agent edits, runs `bun check` (typecheck) and `bun lint`, commits to a branch `improve/<id>`, and pushes with a GitHub token. Claude's first reply lands within seconds ("On it. Starting a sandbox…") and then updates in place as a live checklist: sandbox ready, reading code, editing `file.tsx`, typecheck passed, pushed, preview building. Each step streams to Convex via a server mutation; the agent's own short status lines (not raw tool output) are what members see.
4. **Merge policy.** A code constant `MERGE_POLICY: "automerge" | "classify" | "review"`, default `"review"`. `review`: always open a PR. `automerge`: merge whenever checks pass. `classify`: a second cheap model call grades the diff `auto` or `review` against a rubric (small, no data loss risk, no changes to schema, auth, Stripe, terms, email, env, or deps). The classifier is implemented but only runs under `classify`; anything uncertain is `review`.
5. **Reply.** When done, the checklist message becomes the result: one-paragraph summary, the Vercel preview URL, and the outcome. Merged → "live in a couple of minutes." PR → admins see **Merge** and **Close** buttons on the message. Merge is a server action calling GitHub's merge API with the stored token.
6. **Follow up.** Replying in the thread with another `@Claude` reuses the branch and PR, and resumes the agent with the thread as context.
7. **Record.** A `#site` channel (seeded with the others) gets a line for every merge, with the requester and a link to the thread. `/improvements` is a top-level page, not auth-gated, listing every run with requester, status, PR, and preview; for now it appears in the sidebar only for admins.

### Pieces to build

- Schema: `members.bot`, `improvements` table (requester, message, branch, PR number, preview URL, status, classifier verdict, log), `messages.improvementId`.
- Convex: mention trigger in `chat.send`, `server.updateImprovement`, bot-author guards so no one can post as Claude.
- Next.js: `/api/improve` (sandbox orchestration), merge/close server actions, `/improvements` page (public, sidebar link admin-only).
- UI: bot avatar and badge in `message.tsx`, live checklist that updates in place, Merge/Close buttons for admins, preview link for everyone.
- Chat: add `#site` to `chat:seedChannels`.
- CI: a GitHub Action that runs `bunx convex deploy` on push to main, so merged changes touching `convex/` actually go live. Until that exists, any `convex/` change is `review` regardless of policy.
- Auth on previews: add `*.vercel.app` to trusted origins so magic-link sign-in works on preview deployments. Google sign-in stays justwrite.club only.

### Env and secrets

Vercel: `GITHUB_TOKEN` (repo write, PR merge), `OPENROUTER_API_KEY` (already present in Convex; add to Vercel), `VERCEL_TOKEN` if we need to look up preview URLs rather than derive them from the branch name.

### Open questions

- OpenRouter with the Agent SDK: the SDK speaks the Anthropic Messages API, so this needs OpenRouter's Anthropic-compatible endpoint via `ANTHROPIC_BASE_URL`. Verify first; fall back to an Anthropic key if tool use is flaky there.
- Sandbox duration: a run may take 5–15 minutes. Confirm Vercel Sandbox limits on the Manifund plan, and whether to drive it from a Vercel Workflow for durability.
- Rate limits: start with a few runs per member per day and a global daily cap.
- Rollback: a **Revert** button on merged changes (opens a revert PR) is cheap and worth including in v1.
