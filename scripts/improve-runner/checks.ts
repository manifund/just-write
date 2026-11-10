// The harness's own checks, after the agent is done: typecheck, lint, and no conflict markers.
import { conflictMarkers, type Merge } from "./git";
import { sh, tail } from "./shell";

export function checks(merge: Merge | null) {
  const tsc = sh("bun check");
  const lint = sh("bun lint");
  const markers = merge ? conflictMarkers(merge) : [];
  return {
    ok: tsc.ok && lint.ok && markers.length === 0,
    output: [
      !tsc.ok && tail(tsc.out, 4000),
      !lint.ok && tail(lint.out, 4000),
      markers.length &&
        `Merge conflict markers are still in: ${markers.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
