// Git in the clone: bringing main into a PR's branch, and listing what the run changed.
import { readFileSync } from "node:fs";
import { ROOT } from "./context";
import { must, sh } from "./shell";

// main merged into a PR's branch (not committed; the site commits it with both parents).
export type Merge = { main: string; conflicts: string[] };

const unmerged = () =>
  must("git diff --name-only --diff-filter=U").split("\n").filter(Boolean);

// Brings main into a PR's branch, so the PR can merge after main has moved on. Null if the
// branch already has everything on main. Conflicts are left in the tree for the agent.
export function mergeMain(): Merge | null {
  const shallow =
    sh("git rev-parse --is-shallow-repository", { quiet: true }).out.trim() ===
    "true";
  // Merging needs the history back to where the branch split from main.
  must(`git fetch -q ${shallow ? "--unshallow " : ""}origin main`);
  const main = must("git rev-parse FETCH_HEAD");
  if (sh(`git merge-base --is-ancestor ${main} HEAD`).ok) return null;
  const r = sh(
    `git -c user.name=Claude -c user.email=noreply@anthropic.com merge -q --no-commit --no-ff ${main}`,
  );
  const conflicts = unmerged();
  if (!r.ok && conflicts.length === 0)
    throw new Error(`Couldn’t merge main:\n${r.out.slice(-1500)}`);
  return { main, conflicts };
}

// A merge the saved sandbox was in the middle of (a resumed run keeps its edits).
export function mergeInProgress(): Merge | null {
  const head = sh("git rev-parse -q --verify MERGE_HEAD", { quiet: true });
  return head.ok ? { main: head.out.trim(), conflicts: unmerged() } : null;
}

// Files from the merge's conflicts that still have conflict markers in them.
export function conflictMarkers(merge: Merge) {
  return merge.conflicts.filter((f) => {
    try {
      return /^(<{7}|>{7})( |$)/m.test(readFileSync(`${ROOT}/${f}`, "utf8"));
    } catch {
      return false; // deleted
    }
  });
}

export function mergeNote(merge: Merge | null) {
  if (!merge) return "";
  if (!merge.conflicts.length)
    return `main had moved on, so the harness merged it into this branch (cleanly; not committed yet, and it gets pushed as a real merge commit with your changes). Don't run \`git merge --abort\`, \`git reset\`, or \`git commit\`.`;
  return `main had moved on, so the harness started merging it into this branch, and these files have conflicts: ${merge.conflicts.join(", ")}. Resolve them first: edit each file so it keeps what both sides meant (main's latest code plus this PR's change) and has no conflict markers left. The merge gets pushed as a real merge commit with your changes, so don't run \`git merge --abort\`, \`git reset\`, or \`git commit\`; the harness stages and commits everything.`;
}

export type ChangedFile = { path: string; mode: "100644" | "100755" | null }; // null: deleted

// Every file that differs from `base` (tracked, new, and deleted), with its git file mode.
export function changedFiles(base: string): ChangedFile[] {
  must("git add -A");
  const r = sh(`git diff --cached --raw -z --no-renames ${base}`, {
    quiet: true,
  });
  if (!r.ok)
    throw new Error(`Couldn’t list the changed files:\n${r.out.slice(-1500)}`);
  // -z output: ":<old mode> <new mode> <old sha> <new sha> <status>" NUL "<path>" NUL ...
  const parts = r.out.split("\0");
  const files: ChangedFile[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const meta = parts[i].trim();
    const path = parts[i + 1];
    if (!meta.startsWith(":")) continue;
    const [, mode] = meta.slice(1).split(" ");
    if (meta.endsWith("D")) files.push({ path, mode: null });
    else if (mode === "100644" || mode === "100755") files.push({ path, mode });
    else
      throw new Error(`${path} is a symlink or submodule, which I can’t push.`);
  }
  return files;
}
