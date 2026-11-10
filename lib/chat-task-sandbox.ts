// The firewall in front of a chat task's sandbox (app/api/improve/route.ts; also used by
// scripts/improve-try.ts --chat). The sandbox may reach: the model API, only its messages
// endpoint, with our key added by the firewall (the sandbox only has a placeholder); this
// site's Convex backend, where every public function checks who's calling; and any other
// site, but only to read (GET/HEAD), for the agent's WebFetch. That last part means a
// confused agent could leak members-only data in a URL; admins accepted that (the data is
// what any member sees, never emails, payments, or check-in text). bun and the Agent SDK
// are installed (SETUP) before the policy goes on and before any club data is written.
import type { NetworkPolicy } from "@vercel/sandbox";

export const KEY_PLACEHOLDER = "added-by-the-sandbox-firewall";

export const AGENT_DIR = "/tmp/agent";

// Run in the repo's directory before the firewall goes on: installs bun, then just the
// Agent SDK (at the version bun.lock pins) into AGENT_DIR, where the runner loads it from.
export const SETUP = [
  "command -v bun >/dev/null || [ -x ~/.bun/bin/bun ] || curl -fsSL https://bun.sh/install | bash",
  'export PATH="$HOME/.bun/bin:$PATH"',
  `v=$(grep -o '"@anthropic-ai/claude-agent-sdk@[0-9][^"]*"' bun.lock | head -1 | sed 's/.*@//; s/"//')`,
  '{ [ -n "$v" ] || { echo "no Agent SDK version in bun.lock" >&2; exit 1; }; }',
  `mkdir -p ${AGENT_DIR} && cd ${AGENT_DIR} && echo '{"private":true}' > package.json && bun add "@anthropic-ai/claude-agent-sdk@$v"`,
].join(" && ");

export function chatTaskPolicy(
  openRouterKey: string,
  convexHost: string,
): NetworkPolicy {
  return {
    allow: {
      "openrouter.ai": [
        {
          match: { method: ["POST"], path: { startsWith: "/api/v1/messages" } },
          transform: [
            { headers: { authorization: `Bearer ${openRouterKey}` } },
          ],
        },
        { response: { statusCode: 403 } },
      ],
      [convexHost]: [],
      // The web, read-only: anything but GET/HEAD gets a 403 from the firewall.
      "*": [
        { match: { method: ["GET", "HEAD"] }, transform: [] },
        { response: { statusCode: 403 } },
      ],
    },
  };
}
