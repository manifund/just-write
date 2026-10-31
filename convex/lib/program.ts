// Essay deadlines from the terms: Mondays at 9pm PT (PST, UTC−8) on Nov 9, 16, 23, 30, 2026.
export const DEADLINES = [
  Date.UTC(2026, 10, 10, 5), // Mon Nov 9, 9pm PT
  Date.UTC(2026, 10, 17, 5), // Mon Nov 16
  Date.UTC(2026, 10, 24, 5), // Mon Nov 23
  Date.UTC(2026, 11, 1, 5), // Mon Nov 30
] as const;

export const DEADLINE_LABELS = ["Nov 9", "Nov 16", "Nov 23", "Nov 30"] as const;

export type Slot = {
  week: number; // 1–4
  deadline: number;
  label: string;
  essayId: string | null;
};

// Fills the 4 weekly slots in submission order: each essay fills the earliest open slot
// whose deadline it beat. Writing two essays early covers two weeks; a late essay fills nothing.
export function fillSlots<
  E extends { _id: string; submittedAt: number; review: string },
>(essays: E[]): Slot[] {
  const slots: Slot[] = DEADLINES.map((deadline, i) => ({
    week: i + 1,
    deadline,
    label: DEADLINE_LABELS[i],
    essayId: null,
  }));
  const counted = essays
    .filter((e) => e.review !== "rejected")
    .sort((a, b) => a.submittedAt - b.submittedAt);
  for (const e of counted) {
    const slot = slots.find((s) => !s.essayId && e.submittedAt <= s.deadline);
    if (slot) slot.essayId = e._id;
  }
  return slots;
}
