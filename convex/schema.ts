import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// interested → signed (agreed to terms, sent to Stripe) → committed (deposit paid)
export const status = v.union(
  v.literal("interested"),
  v.literal("signed"),
  v.literal("committed"),
);

export default defineSchema({
  // Everyone who expressed interest, signed, or committed. Keyed by lowercase email,
  // which is also how a signed-in Better Auth user finds their row.
  members: defineTable({
    name: v.string(),
    email: v.string(),
    link: v.optional(v.string()),
    status,
    // Profile (editable in the portal)
    handle: v.optional(v.string()), // URL slug for /members/[handle]
    bio: v.optional(v.string()),
    image: v.optional(v.string()),
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
  })
    .index("by_email", ["email"])
    .index("by_handle", ["handle"])
    .index("by_status", ["status"])
    .index("by_legacyId", ["legacyId"]),

  // Published essays registered toward the 4-essay commitment.
  essays: defineTable({
    memberId: v.id("members"),
    url: v.string(),
    title: v.string(),
    wordCount: v.optional(v.number()),
    submittedAt: v.number(),
    review: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
    ),
  })
    .index("by_member", ["memberId"])
    .index("by_url", ["url"]),

  // Essay ideas. Shared ideas show on the ideas board; private ones only to their author.
  ideas: defineTable({
    memberId: v.id("members"),
    title: v.string(),
    notes: v.optional(v.string()),
    shared: v.boolean(),
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
    editedAt: v.optional(v.number()),
  })
    .index("by_channel_parent", ["channelId", "parentId"])
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

  // LLM-picked "similar writers", cached per member.
  similar: defineTable({
    memberId: v.id("members"),
    picks: v.array(v.object({ memberId: v.id("members"), reason: v.string() })),
    inputHash: v.string(),
    computedAt: v.number(),
  }).index("by_member", ["memberId"]),
});
