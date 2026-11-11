import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// What /themes knows about an essay, for its card in chat: the themes it's in and
// Claude's one-sentence summary (both set by themesAction.compute).
export type EssayExtras = { themes: string[]; summary: string | null };

export async function themesRow(ctx: QueryCtx) {
  return await ctx.db.query("themes").first();
}

export function essayExtras(
  row: Doc<"themes"> | null,
  essayId: Id<"essays">,
): EssayExtras {
  return {
    themes: (row?.themes ?? [])
      .filter((t) => t.essayIds.includes(essayId))
      .map((t) => t.name),
    summary:
      row?.summaries?.find((s) => s.essayId === essayId)?.summary ?? null,
  };
}
