Hm, so my friend Venki espouses this view that the right way to structure online sandboxes for code development is not the per-PR container, but rather a devbox. I'm interested in exploring this, what would it take to build this into the @claude implementation as the default option? Do some research and come up with a plan.

Context:

Leila: https://x.com/leilavclark/status/2115874967128871278

I am shocked at how few engineers are using cloud agents, even at the most AI-native startups.

Why is that?

Venki: https://x.com/__venki__/status/2115901504205004979

My personal sense is:
Cloud Agents ("ephemeral", per-PR cloud container) < Local dev < Cloud Agents ("devbox", long-lived, laptop-isomorphic)

Unfortunately - many services err towards selling you the former (Cursor, Claude, Codex, Conductor).

For the "devbox" style Cloud Agents - I'd recommend Claude remote-control or Paseo. I use the latter. (Cursor-over-SSH or Codex-over-SSH work too ofc)

Why is ephemeral so much worse than devbox?

There's just a lot of types of debugging, deployment, testing workflows that are SWE, but not exactly "writing a PR" that go much worse w/ ephemerality. OTOH - for devbox-style, the answer is always "just mimic what your laptop does". Some examples:

- I want to do `terraform plan` and `terraform apply` with my agent. This means I need to give my agent AWS perms.
- How do I do this with a ephemeral cloud agent? Err... I mint long-lived access keys for it - which my infra team doesn't support. Maybe I could copy my personal creds over? What do I do when I have multiple AWS accounts?
- How do I do it locally? Easy, `aws sso login`. How do I do it on a devbox? Easy, `aws sso login`. Much like my laptop, I might log into multiple AWS accounts.

- I want to iterate on an app that has a DB. How does this work?
- Ephemeral: Maybe re-seed the DB each time? Maybe use a novel DB provider w/ forking - but no I need a real DB like Aurora Serverless. I'd rather do PG, so I guess I build some sort of seeding.
- Devbox: It's just like using a laptop - long-lived DB, gets interesting state over time.
  [Related: a lot of the `npm run dev` local-dev stuff is very nice, doing quick preview deploys instead of exposing localhost is bad - it's just never as fast as just HMR. Devbox + tunnel for localhost + agent docs on how to use the tunnel is really sweet]

A few others I won't detail:

- I want my agent to read my datadog logs to help me debug an issue, how does that work?
- I want my agent to set up a new Cloudflare subdomain / worker
- I want my agent to be able to hit internal services on my Tailnet
- I want an agent-only journal & task-list that is on a separate cadence from my repo (ie: often failed PRs that do not merge still want to write to the journal, and this would make too much PR/commit noise)
- I want to build & smoke-test & deploy docker containers, and ephemeral agents run into dind issues.
- I want my agent to help me zip up some files, inspect them for a while + put them somewhere else. (likely AWS access bottlenecked?)

In general, the core problem ephemeral cloud agents run into is SWE involves a lot of tangential poking through platforms + long-lived access. You want a permissions model that mirrors a laptop (ie: all developer-relevant perms), not a Github CI runner (ie: only app-deployment relevant perms).
[A secondary problem is: local state is more nice than it is harmful. It can be harmful for reproducibility, but far more often it's nice for journals, dev DBs, static files]
[Another problem is: there's also security concerns about using 3P sandboxes, your infra team might drag their feet, and long-lived boxes are super trivial to self-host - just make an EC2 VM]

If you have a phenomenal devprod team, one answer is: "they've provisioned a lot of short-lived workload identities, that you can assign to ephemeral containers".

But also ugh - different engineers on different teams have different access - and might not even want all their ephemeral boxes to have complete access? How do you let people configure this smoothly?
With devboxes it's easy - folks often just have N devboxes, with different configurations.
