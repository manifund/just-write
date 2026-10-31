"use node";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

const MODEL = "anthropic/claude-sonnet-5.5";

// Picks the 3 writers whose interests overlap most with this member's, with a one-line reason each.
export const compute = internalAction({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const { self, others, hash } = await ctx.runQuery(internal.similar.inputs, {
      memberId,
    });
    if (!self) return;
    // Nobody to match yet (or no key): save an empty result so the UI stops waiting.
    if (others.length === 0 || !process.env.OPENROUTER_API_KEY) {
      if (!process.env.OPENROUTER_API_KEY)
        console.warn("OPENROUTER_API_KEY is not set; skipping similar writers");
      await ctx.runMutation(internal.similar.save, {
        memberId,
        picks: [],
        inputHash: hash,
      });
      return;
    }
    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    const { output } = await generateText({
      model: openrouter(MODEL),
      output: Output.object({
        schema: z.object({
          picks: z
            .array(
              z.object({
                id: z.string().describe("The writer's id, copied exactly"),
                reason: z
                  .string()
                  .describe(
                    "One short sentence, addressed to the reader as “you”",
                  ),
              }),
            )
            .max(3),
        }),
      }),
      system:
        "You match writers in a small online writing club (4 essays in November) with peers they'd enjoy reading and trading feedback with. " +
        "Use their bios, essay titles, essay ideas, and website domains. Prefer specific shared interests over generic ones. " +
        "Reasons are one plain, specific sentence under 20 words, e.g. “You’re both writing about raising kids in tech-heavy households.” " +
        "If someone has very little info, you may still pick them, but say what you'd guess they'd click on. Never invent facts.",
      prompt: `The reader:\n${JSON.stringify(self)}\n\nOther writers:\n${JSON.stringify(others)}\n\nPick the 3 best matches.`,
    });

    const valid = new Set(others.map((o) => o.id as string));
    const picks = (output?.picks ?? [])
      .filter((p) => valid.has(p.id))
      .slice(0, 3)
      .map((p) => ({
        memberId: p.id as Id<"members">,
        reason: p.reason.slice(0, 200),
      }));
    await ctx.runMutation(internal.similar.save, {
      memberId,
      picks,
      inputHash: hash,
    });
  },
});
