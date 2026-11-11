import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins/magic-link";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { sendEmail } from "./lib/email";

export const authComponent = createClient<DataModel>(components.betterAuth);

// One Convex deployment serves local dev, justwrite.club, and Vercel previews (e.g.
// @Claude's PR branches), so auth links and redirects use whichever host the request came from.
const PRODUCTION = "https://justwrite.club";
const ORIGINS = ["http://localhost:3000", PRODUCTION];
const PREVIEW_HOST = /^just-write-[a-z0-9-]+-manifund\.vercel\.app$/;
const isPreview = (origin: string) => {
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && PREVIEW_HOST.test(u.host);
  } catch {
    return false;
  }
};

// The Convex auth proxy only trusts hosts listed exactly (not wildcards), so add the
// preview host a request came from (sent by our Next.js proxy) when it matches.
function trustedOrigins(request?: Request) {
  const host = request?.headers.get("x-better-auth-forwarded-host");
  const origin = host ? `https://${host}` : null;
  return origin && isPreview(origin) ? [...ORIGINS, origin] : ORIGINS;
}

// Google's redirect URIs are fixed (justwrite.club and localhost), so Google sign-in on a
// preview goes through justwrite.club and comes back. The plugin decides whether to do that
// from the "current URL", which inside Convex would be the .convex.site URL; set it from the
// host the request came from instead. Only previews use the detour.
function previewGoogleSignIn() {
  const opts: { productionURL: string; currentURL?: string } = {
    productionURL: PRODUCTION,
  };
  const proxy = oAuthProxy(opts);
  const setCurrentURL = {
    matcher: () => true,
    handler: createAuthMiddleware(async (ctx) => {
      const origin = new URL(ctx.context.baseURL).origin;
      opts.currentURL = isPreview(origin) ? origin : PRODUCTION;
    }),
  };
  return {
    ...proxy,
    hooks: { ...proxy.hooks, before: [setCurrentURL, ...proxy.hooks.before] },
  };
}

// Sessions made by a read-only preview link are marked with this user agent, and their
// tokens carry `readonly: true`, which convex/lib/viewer.ts checks.
const READONLY_AGENT = "just-write-readonly-preview";

// GET /api/auth/preview-access?token=…: trades a one-time token from convex/previewAccess.ts
// for a read-only session on whichever host this is, then opens the portal.
function previewAccess(ctx: GenericCtx<DataModel>) {
  return {
    id: "preview-access",
    endpoints: {
      previewAccess: createAuthEndpoint(
        "/preview-access",
        { method: "GET" },
        async (c) => {
          const url = c.request ? new URL(c.request.url) : null;
          const token = url?.searchParams.get("token") ?? "";
          const userId =
            token && "runMutation" in ctx
              ? await ctx.runMutation(internal.previewAccess.consume, { token })
              : null;
          const user = userId
            ? await c.context.internalAdapter.findUserById(userId)
            : null;
          if (!user) throw c.redirect("/sign-in?next=/home");
          const session = await c.context.internalAdapter.createSession(
            user.id,
            true, // a browser-session cookie; the session itself lasts a day
            { userAgent: READONLY_AGENT },
          );
          await setSessionCookie(c, { session, user }, true);
          throw c.redirect("/home");
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account" as const,
          },
        }
      : undefined;

  return betterAuth({
    baseURL: {
      allowedHosts: [
        ...ORIGINS.map((o) => o.replace(/^https?:\/\//, "")),
        "just-write-*-manifund.vercel.app",
      ],
      fallback: process.env.SITE_URL,
      protocol: "auto",
    },
    trustedOrigins,
    database: authComponent.adapter(ctx),
    account: {
      // Signing in with Google and with a magic link to the same address is one account.
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    socialProviders: google,
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        // Store magic-link tokens hashed, so a Google sign-in's OAuth state (stored in the
        // same verification table) can't be used as a magic link. Keep global
        // `verification.storeIdentifier` unset. Workaround for GHSA-965c-763c-88jm until
        // we're on better-auth >= 1.7.7.
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          await sendEmail({
            to: email,
            subject: "Your Just Write sign-in link",
            text: `Click to sign in to Just Write:\n\n${url}\n\nThis link expires in 15 minutes. If you didn’t ask for it, you can ignore this email.`,
            html: `<div style="font-family:Georgia,serif;color:#38213f;max-width:520px;margin:0 auto;padding:32px 24px;background:#f9eeec">
  <p style="font-size:22px;font-weight:600;margin:0 0 24px">Just <span style="color:#bf5548">Write</span></p>
  <p style="font-size:16px;line-height:1.55;color:#644f6b">Click below to sign in. This link expires in 15 minutes.</p>
  <p style="margin:28px 0"><a href="${url}" style="background:#38213f;color:#f9eeec;padding:14px 24px;text-decoration:none;font-size:17px">Sign in to Just Write</a></p>
  <p style="font-size:14px;line-height:1.55;color:#644f6b">If you didn’t ask for this, you can ignore it.</p>
</div>`,
          });
        },
      }),
      previewGoogleSignIn(),
      previewAccess(ctx),
      convex({
        authConfig,
        jwt: {
          // The plugin's default claims, plus whether this is a read-only preview session.
          definePayload: ({ user, session }) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, image, ...claims } = user;
            return session.userAgent === READONLY_AGENT
              ? { ...claims, readonly: true }
              : claims;
          },
        },
      }),
    ],
  } satisfies BetterAuthOptions);
};
