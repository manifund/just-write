import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins/magic-link";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { sendEmail } from "./lib/email";

export const authComponent = createClient<DataModel>(components.betterAuth);

// One Convex deployment serves both local dev and justwrite.club, so auth links and
// redirects use whichever of these the request came from.
const ORIGINS = ["http://localhost:3000", "https://justwrite.club"];

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
      allowedHosts: ORIGINS.map((o) => new URL(o).host),
      fallback: process.env.SITE_URL,
      protocol: "auto",
    },
    trustedOrigins: ORIGINS,
    database: authComponent.adapter(ctx),
    account: {
      // Signing in with Google and with a magic link to the same address is one account.
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    socialProviders: google,
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
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
      convex({ authConfig }),
    ],
  } satisfies BetterAuthOptions);
};
