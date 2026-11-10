import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Marks @Claude runs whose sandbox died without reporting back as failed.
crons.interval(
  "reap stale improvements",
  { minutes: 10 },
  internal.improvements.reapStale,
);

// Merges main into open @Claude PRs that GitHub can update cleanly (convex/prSync.ts). Our
// own merges do this right away; this catches merges done on GitHub.
crons.interval("sync open PRs", { minutes: 30 }, internal.prSync.sweep);

// Emails the 24h reminders for calendar sessions.
crons.interval(
  "session reminders",
  { minutes: 15 },
  internal.events.claimReminders,
);

// Emails members who opted in and haven't posted in #check-ins today, at 10am and
// again at 6pm PT (PST).
crons.daily(
  "morning check-in reminders",
  { hourUTC: 18, minuteUTC: 0 },
  internal.reminders.sendCheckInReminders,
);
crons.daily(
  "check-in reminders",
  { hourUTC: 2, minuteUTC: 0 },
  internal.reminders.sendCheckInReminders,
);

export default crons;
