import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Marks @Claude runs whose sandbox died without reporting back as failed.
crons.interval(
  "reap stale improvements",
  { minutes: 10 },
  internal.improvements.reapStale,
);

// Emails members who opted in and haven't posted in #check-ins today, at 6pm PT (PST).
crons.daily(
  "check-in reminders",
  { hourUTC: 2, minuteUTC: 0 },
  internal.reminders.sendCheckInReminders,
);

export default crons;
