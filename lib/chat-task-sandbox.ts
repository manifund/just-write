// The firewall in front of a chat task's sandbox (app/api/improve/route.ts; also used by
// scripts/improve-try.ts --chat). The sandbox may reach: the model API, only its messages
// endpoint, with our key added by the firewall (the sandbox only has a placeholder); this
// site's Convex backend, where every public function checks who's calling and none fetch
// other sites for anonymous callers; and the hosts bun and its packages install from.
import type { NetworkPolicy } from "@vercel/sandbox";

export const KEY_PLACEHOLDER = "added-by-the-sandbox-firewall";

export function chatTaskPolicy(openRouterKey: string, convexHost: string): NetworkPolicy {
  return {
    allow: {
      "openrouter.ai": [
        {
          match: { method: ["POST"], path: { startsWith: "/api/v1/messages" } },
          transform: [{ headers: { authorization: `Bearer ${openRouterKey}` } }],
        },
        { response: { statusCode: 403 } },
      ],
      [convexHost]: [],
      "registry.npmjs.org": [],
      "bun.sh": [],
      "github.com": [],
      "*.githubusercontent.com": [],
    },
  };
}
