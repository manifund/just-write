import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { CHECK_IN_SLUG } from "./lib/channels";
import { sendEmail } from "./lib/email";
import { DEADLINES } from "./lib/program";

const DAY_MS = 24 * 60 * 60 * 1000;
const PT_OFFSET_MS = 8 * 60 * 60 * 1000; // PST (UTC−8), which covers all of November after the 1st

// Opted-in committed members who haven't posted a top-level check-in since midnight Pacific.
export const due = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    if (now > DEADLINES[DEADLINES.length - 1]) return [];
    const startOfDay =
      Math.floor((now - PT_OFFSET_MS) / DAY_MS) * DAY_MS + PT_OFFSET_MS;
    const channel = await ctx.db
      .query("channels")
      .withIndex("by_slug", (q) => q.eq("slug", CHECK_IN_SLUG))
      .unique();
    if (!channel) return [];
    const posted = new Set(
      (
        await ctx.db
          .query("messages")
          .withIndex("by_channel_parent", (q) =>
            q
              .eq("channelId", channel._id)
              .eq("parentId", undefined)
              .gt("_creationTime", startOfDay),
          )
          .collect()
      ).map((m) => m.authorId),
    );
    const members = await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "committed"))
      .collect();
    return members
      .filter((m) => m.checkInReminders && !m.bot && !posted.has(m._id))
      .map((m) => ({ name: m.name, email: m.email }));
  },
});

// Runs daily (see crons.ts) and emails everyone in `due`.
export const sendCheckInReminders = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const site = process.env.SITE_URL ?? "https://justwrite.club";
    const channelUrl = `${site}/chat/${CHECK_IN_SLUG}`;
    const settingsUrl = `${site}/settings`;
    const people: { name: string; email: string }[] = await ctx.runQuery(internal.reminders.due, {});
    for (const p of people) {
      const first = p.name.split(" ")[0] || p.name;
      try {
        await sendEmail({
          to: p.email,
          subject: "Post today’s check-in",
          text: `Hi ${first},\n\nYou haven’t posted in #check-ins today. Share about 100 words of what you’re writing:\n\n${channelUrl}\n\nTo stop these emails, turn off reminders in your settings: ${settingsUrl}`,
          html: `<div style="font-family:Georgia,serif;color:#38213f;max-width:520px;margin:0 auto;padding:32px 24px;background:#f9eeec">
  <p style="font-size:22px;font-weight:600;margin:0 0 24px">Just <span style="color:#bf5548">Write</span></p>
  <p style="font-size:16px;line-height:1.55;color:#644f6b">Hi ${escapeHtml(first)}, you haven’t posted in #check-ins today. Share about 100 words of what you’re writing.</p>
  <p style="margin:28px 0"><a href="${channelUrl}" style="background:#38213f;color:#f9eeec;padding:14px 24px;text-decoration:none;font-size:17px">Open #check-ins</a></p>
  <p style="font-size:14px;line-height:1.55;color:#644f6b">To stop these emails, turn off reminders in your <a href="${settingsUrl}" style="color:#644f6b">settings</a>.</p>
</div>`,
        });
      } catch (err) {
        console.error(`Check-in reminder to ${p.email} failed`, err);
      }
    }
    return people.length;
  },
});

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
