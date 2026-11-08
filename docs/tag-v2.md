The @Claude feature has been quite popular! It's a very cool instantiation of "malleable software",
inspiring a lot of Just Writers, as well as myself~

I'd like you to reflect a bit about how to make it better now, please.
I have some sense that it's not currently that integrated, perhaps; or doesn't
understand perfectly what people are asking for -- or it makes narrow changes that aren't
holistically integrated into the entire app.

I also don't yet trust it for truly complicated work -- to wit, I'm currently drafting this short spec and intending for Fable 5.1 to think through it, via regular Claude Code.

Look through how how the interactions have gone in #site, and also what people have been
explicitly saying about the feature. (And, if you need to build some kind of MCP or API for it to be easier
to read the conversations, go ahead and build that too). Venki's thoughts (and associated X posts) are
especially worth thinking about.

Also read https://www.anthropic.com/research/components-of-agent-memory, and use your discretion to search and think more about what to do.

Overall, consider what a thoughtful and forward-looking PM might recommend. Then add your findings and write in a few proposals into a short ~1-page section in @docs/tag-v2.md. Thanks as always!

## Fable 5.1: findings and proposals (Nov 7)

Sources: a Convex export of every #site thread and all 99 runs (Nov 1–7), a skim of #check-ins and the other channels, Venki's Nov 6 post, Claude Tag's docs, and Anthropic's "Components of agent memory".

### What the first week says

- **It works, and people like it.** 99 runs from 11 members in 7 days: 62 merged, 18 questions answered, 3 PRs waiting. A typical auto-merged run goes from mention to live in about a minute. Members confirm fixes in-thread ("preview seems good", "it works! good job claude") and merge announcements collect hearts. Vlad made the most requests and built queueing, mid-run follow-ups, effort levels and PR targeting through @Claude itself.
- **Claude is working blind.** Eight run summaries say some version of "I couldn't reproduce this", "nobody has tried it in a browser" or "I can't see your screenshot". Six requests had screenshots attached; none reached the agent, since the brief carries only text. It also can't open a linked message or the live site. The cost is second tries: Enter-on-mobile, scrollbars and OneNote paste each took two runs, and the "links stop working" bug took three runs, two workarounds and a key detail from Vlad before the root cause.
- **Changes are local, not integrated.** Every run reads the repo cold and patches what it was asked. Activity (#55, #56) left an unused table and subscription costs that typecheck can't see; Austin cleaned up by hand two days later (`67c5a8f`) and had to write the rule into CLAUDE.md. Read states took four runs and a doc (#56, #57, #59, #60, #88) to converge on what Austin wanted. The #check-ins gate was pulled in opposite directions by two members (#66, #90), each merged as asked, with no one holding the product model. Nothing a run learns survives except what lands in code.
- **The reviewer is a black box, and admins are the queue.** "Why does this need admin review?" was asked four times; Claude says it can't see the reason, though it's stored on the row. The classifier's reasons are often guesses ("may not be installed", "the index isn't in the diff"), and it held a one-file resize while auto-merging a nine-file dark mode. A security fix (#34) has waited three days; Vlad had to poke Austin, then became an admin. Three "Couldn't start a sandbox" failures in one evening spawned duplicate PRs Claude couldn't close, and questions count against the daily limit.
- **Members want it closer to the point.** Vlad: so far "small UX improvements, interesting but not transformative"; he wants a coaching channel where humans and AIs help with a piece you're stuck on. Venki: user-promptable software fits a community tool with under 0.2 FTE of eng+PM, but the schema "wants to change with basically every request" and is the footgun, and each accepted request chips at the shared ontology that makes software legible to everyone. Seven runs changed `schema.ts` in a week. Austin doesn't yet trust @Claude for ambitious work and reaches for Claude Code's finer controls.

### Proposals

1. **Give Claude eyes, and show its work.** Pass attached images into the brief. Run `bun dev` plus a headless browser in the sandbox, signed in as the requester through a read-only preview session, so the agent can reproduce bugs and check its own change on the pages it touched. Attach a before/after screenshot to the card and mark the result "checked in a browser" or "not tested". Give it a read-only Convex query for a linked thread or message. This is the biggest lever on the two-try pattern.
2. **A layered memory, kept honest by a nightly pass.** Follow the Anthropic shape: transcripts (keep each run's Agent SDK session and diff), notes the agent writes while working ("Austin prefers X", "this component is shared by Y and Z"), a small wiki in `docs/claude/` (product decisions, feature map, sharp edges, what members asked for and why), and a CLAUDE.md that stays short and links down. Tell the agent what the memory is for rather than what to save. Then a scheduled "dreaming" run each night reads the day's threads, runs, reverts and manual commits, corrects stale notes, flags requests that contradict a decision or each other (the gate), and opens one cleanup PR for leftovers like unused tables. Anyone can ask `@Claude what do you remember?` and correct it, as Claude Tag allows.
3. **Think like a PM before coding, when it matters.** Classify each request as fix, tweak or feature. For features and anything touching shared behavior (gates, notifications, read states, limits), reply with a three-line plan and the one question that would change the design, then start; mid-run follow-ups already let people redirect. When a fix touches a shared component, check every use of it (the avatar ring and scrollbar fixes needed a second ask). When a request conflicts with a stored decision or another member's recent change, say so and propose the reconciliation instead of picking a side.
4. **Legible trust tiers instead of one opaque classifier.** Client-only UI merges on checks. Anything under `convex/` gets a review by a stronger model against a fixed checklist (member and auth checks, what every member subscribes to, index use, schema additions with a removal plan), and the checklist result appears on the card and in the PR. Schema and sensitive paths still wait for an admin, who now gets a push or email, a "waiting N hours" nudge, and one-tap Merge from the card. Let Claude close PRs it has superseded, and stop counting questions toward the limit.
5. **"Just for me" first, then graduate.** Merge Vlad's opt-in design (#70) and make it the default for shared-behavior changes that aren't clear bugs: ship behind a per-member switch in Settings, show how many members turned it on, and let the nightly pass or an admin promote popular ones to everyone. This answers Venki's ontology worry (experiments stay detached from the shared core) and the two-way tug on #check-ins.
6. **A second persona for the writing itself.** @Claude changes the site; nothing yet helps with the essays. Pilot an editor persona in #check-ins: on request, feedback on a draft or idea in-thread, grounded in the member's bio, essay slots and past check-ins, with the exchange visible so others learn from it, as Vlad suggested. Small, separate, and a first step toward the longer list (idea polling, livestreamed drafting, richer profiles).

Order: 1 and 4 first, since they remove most of the friction visible in #site; then 2, because 3 and 5 lean on it; 6 as a parallel experiment.
