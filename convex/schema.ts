import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Which chat messages send a member a push notification (convex/push.ts).
export const notifyLevel = v.union(v.literal("mentions"), v.literal("all"));

// interested → signed (agreed to terms, sent to Stripe) → committed (deposit paid)
export const status = v.union(
  v.literal("interested"),
  v.literal("signed"),
  v.literal("committed"),
);

export const improvementStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("answered"),
  v.literal("pr"),
  v.literal("merged"),
  v.literal("closed"),
  v.literal("failed"),
  v.literal("superseded"),
);

export default defineSchema({
  // Everyone who expressed interest, signed, or committed. Keyed by lowercase email,
  // which is also how a signed-in Better Auth user finds their row.
  members: defineTable({
    name: v.string(),
    email: v.string(),
    // A second sign-in address for the same person (admins only, set with members.setAltEmail).
    altEmail: v.optional(v.string()),
    link: v.optional(v.string()),
    status,
    // Profile (editable in the portal)
    handle: v.optional(v.string()), // URL slug for /members/[handle]
    bio: v.optional(v.string()),
    image: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")), // set when the image was uploaded here, not from Google
    notify: v.optional(notifyLevel), // unset means "mentions"
    // Commitment
    signedName: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    committedAt: v.optional(v.number()),
    stripeSessionId: v.optional(v.string()),
    stripePaymentIntent: v.optional(v.string()),
    amountPaidCents: v.optional(v.number()),
    termsEmailedAt: v.optional(v.number()),
    // Row id from the old Neon `interest` table, for Stripe sessions created before the move.
    legacyId: v.optional(v.number()),
    legacyCreatedAt: v.optional(v.number()),
    // The @Claude bot's row. Hidden from directories; can't sign in.
    bot: v.optional(v.boolean()),
    // Calendar: addresses the shared Google calendar has been shared with (convex/gcal.ts),
    // and the secret token in their personal iCal feed URL.
    calendarSharedWith: v.optional(v.array(v.string())),
    icsToken: v.optional(v.string()),
    // Opted in (on /settings) to a daily email when they haven't posted in #check-ins yet.
    checkInReminders: v.optional(v.boolean()),
  })
    .index("by_email", ["email"])
    .index("by_altEmail", ["altEmail"])
    .index("by_handle", ["handle"])
    .index("by_status", ["status"])
    .index("by_legacyId", ["legacyId"])
    .index("by_icsToken", ["icsToken"]),

  // Published essays registered toward the 4-essay commitment.
  essays: defineTable({
    memberId: v.id("members"),
    url: v.string(),
    title: v.string(),
    wordCount: v.optional(v.number()),
    submittedAt: v.number(),
    // The week (1–4) the writer put this essay toward, e.g. two short posts that
    // together make one week's essay. Unset means the earliest open week.
    week: v.optional(v.number()),
    review: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
    ),
  })
    .index("by_member", ["memberId"])
    .index("by_url", ["url"]),

  // Essay ideas. Every member can see them on the ideas board.
  ideas: defineTable({
    memberId: v.id("members"),
    title: v.string(),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_member", ["memberId"]),

  // "I'd read this" on someone's idea.
  ideaVotes: defineTable({
    ideaId: v.id("ideas"),
    memberId: v.id("members"),
  })
    .index("by_idea", ["ideaId"])
    .index("by_idea_member", ["ideaId", "memberId"]),

  // Chat
  channels: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    order: v.number(),
  }).index("by_slug", ["slug"]),

  messages: defineTable({
    channelId: v.id("channels"),
    authorId: v.id("members"),
    body: v.string(), // Tiptap JSON document
    text: v.string(), // plain-text version, for previews
    parentId: v.optional(v.id("messages")), // set on thread replies
    replyCount: v.optional(v.number()),
    lastReplyAt: v.optional(v.number()),
    replierIds: v.optional(v.array(v.id("members"))), // last few repliers, for thread avatars
    essayId: v.optional(v.id("essays")), // set on "published an essay" posts
    kind: v.optional(v.literal("joined")), // system posts, e.g. the #general welcome
    eventId: v.optional(v.id("events")), // set on #meetups event announcements
    editedAt: v.optional(v.number()),
    improvementId: v.optional(v.id("improvements")), // Claude's live status card for a run
  })
    .index("by_channel_parent", ["channelId", "parentId"])
    .index("by_channel_parent_author", ["channelId", "parentId", "authorId"])
    .index("by_parent", ["parentId"]),

  reactions: defineTable({
    messageId: v.id("messages"),
    memberId: v.id("members"),
    emoji: v.string(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_member_emoji", ["messageId", "memberId", "emoji"]),

  typing: defineTable({
    channelId: v.id("channels"),
    parentId: v.optional(v.id("messages")),
    memberId: v.id("members"),
    expiresAt: v.number(),
  })
    .index("by_channel", ["channelId"])
    .index("by_member_channel", ["memberId", "channelId"]),

  reads: defineTable({
    memberId: v.id("members"),
    channelId: v.id("channels"),
    lastReadAt: v.number(),
  }).index("by_member_channel", ["memberId", "channelId"]),

  // The /activity page (convex/activity.ts): one row per member a message involves, written
  // when the message is posted (convex/lib/activity.ts). `at` is when it happened; Claude's
  // status card gets its row when the run finishes, not when the empty card is posted.
  activity: defineTable({
    memberId: v.id("members"),
    messageId: v.id("messages"),
    kind: v.union(v.literal("mention"), v.literal("reply")),
    at: v.number(),
    readAt: v.optional(v.number()), // unset until they open it or mark all read
  })
    .index("by_member", ["memberId", "at"])
    .index("by_member_unread", ["memberId", "readAt"])
    .index("by_message", ["messageId"]),

  // @Claude site improvements: one row per run. Claude's reply in the thread renders from here.
  improvements: defineTable({
    number: v.number(), // 1, 2, 3…; the branch is claude/<number> unless it continues an earlier run
    requesterId: v.id("members"),
    channelId: v.id("channels"),
    threadId: v.id("messages"), // top-level message of the thread the run lives in
    requestMessageId: v.id("messages"),
    replyMessageId: v.optional(v.id("messages")),
    request: v.string(), // plain text of the asking message
    status: improvementStatus,
    steps: v.array(
      v.object({
        label: v.string(),
        state: v.union(
          v.literal("active"),
          v.literal("done"),
          v.literal("failed"),
        ),
      }),
    ),
    branch: v.string(),
    previousId: v.optional(v.id("improvements")), // the earlier run whose PR this continues
    waitingOn: v.optional(v.id("improvements")), // a follow-up sent while this earlier run was still going; starts when it ends
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    files: v.optional(v.array(v.string())),
    checksPassed: v.optional(v.boolean()),
    touchesConvex: v.optional(v.boolean()),
    verdict: v.optional(v.string()), // the merge decision and why, e.g. "review: touches schema"
    prNumber: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    revertPrUrl: v.optional(v.string()),
    sandboxId: v.optional(v.string()), // sandbox name; kept (snapshotted) for 24h for follow-ups
    sessionId: v.optional(v.string()), // Agent SDK session, resumed by a follow-up in the same sandbox
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id("members")), // admin who merged or closed it
    // Chat tasks (convex/chatTasks.ts): runs that read the club's data and may draft a
    // post for the member to send. Unset means a code run. Set when the run is created.
    kind: v.optional(v.literal("chat")),
    runToken: v.optional(v.string()), // the sandbox's credential, good for this run only
    draft: v.optional(
      v.object({
        channelId: v.id("channels"),
        markdown: v.string(), // what Claude wrote, for follow-ups ("make it shorter")
        body: v.string(), // Tiptap JSON, for the card and the composer
      }),
    ),
  })
    .index("by_number", ["number"])
    .index("by_thread", ["threadId"])
    .index("by_requester", ["requesterId"]),

  // Calendar events (/calendar). Times are UTC ms; the UI shows them in Pacific time.
  events: defineTable({
    title: v.string(),
    slug: v.optional(v.string()), // URL: /calendar/<slug>. Set once; renaming keeps it.
    description: v.optional(v.string()),
    location: v.optional(v.string()), // members only; unset means "TBD"
    link: v.optional(v.string()), // video call link for virtual sessions; members only
    start: v.number(),
    end: v.number(),
    ownerId: v.id("members"),
    cohostIds: v.array(v.id("members")),
    // "deadline" events are reminders for the Monday essay deadlines: no RSVPs, admins edit them.
    kind: v.optional(v.literal("deadline")),
    canceledAt: v.optional(v.number()),
    remindedAt: v.optional(v.number()), // the 24h reminder email went out
    announcementId: v.optional(v.id("messages")), // the #meetups post; changes are replies to it
    createdBy: v.id("members"),
  })
    .index("by_start", ["start"])
    .index("by_slug", ["slug"]),

  rsvps: defineTable({
    eventId: v.id("events"),
    memberId: v.id("members"),
    response: v.union(v.literal("yes"), v.literal("maybe"), v.literal("no")),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_member", ["eventId", "memberId"]),

  // One-time links that sign someone into a preview deployment read-only (convex/previewAccess.ts).
  previewTokens: defineTable({
    token: v.string(),
    userId: v.string(), // Better Auth user id
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_expires", ["expiresAt"]),

  // Browsers and installed apps that get push notifications (see convex/push.ts).
  pushSubscriptions: defineTable({
    memberId: v.id("members"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  })
    .index("by_endpoint", ["endpoint"])
    .index("by_member", ["memberId"]),

  // LLM-picked "similar writers", cached per member.
  similar: defineTable({
    memberId: v.id("members"),
    picks: v.array(v.object({ memberId: v.id("members"), reason: v.string() })),
    inputHash: v.string(),
    computedAt: v.number(),
  }).index("by_member", ["memberId"]),
});
