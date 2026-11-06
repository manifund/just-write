// Opt-ins: frontend changes a member asked @Claude to make "just for me". Each one ships to
// everyone's copy of the site but stays off unless a member turns it on, except for the
// member it was made for (`for`, their handle), who has it on until they turn it off.
// Members switch them on and off in /settings; choices are stored in `members.optIns`.
// Check one in a client component with `useOptIn("key")` (components/portal/opt-ins.ts).

export type OptIn = {
  key: string; // lowercase letters, digits, and dashes; never reuse or rename one
  label: string; // short, plain description shown in /settings
  for: string; // handle of the member who asked for it
  by: string; // their name, shown in /settings
};

export const OPT_INS: OptIn[] = [];

export function optInOn(
  key: string,
  me: { handle: string | null; optIns?: Record<string, boolean> } | null,
) {
  if (!me) return false;
  const choice = me.optIns?.[key];
  if (choice !== undefined) return choice;
  return OPT_INS.some((o) => o.key === key && o.for === me.handle);
}
