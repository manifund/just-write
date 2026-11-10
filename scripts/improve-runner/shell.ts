// Shell commands in the clone, logged with secrets redacted.
import { spawnSync } from "node:child_process";
import { ROOT, env } from "./context";
import { log, redact } from "./report";

export function sh(cmd: string, opts: { quiet?: boolean } = {}) {
  const r = spawnSync("bash", ["-c", cmd], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...env, RUN_TOKEN: "" },
  });
  // Redacted before anything slices it (a cut through a key would hide it from `redact`).
  // Quiet commands are parsed (git status, git diff), so they're left as they are.
  const raw = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const out = opts.quiet ? raw : redact(raw);
  if (!opts.quiet) {
    console.log(`$ ${cmd}\n${out.slice(-4000)}`);
    log(
      "shell",
      `$ ${cmd}${r.status === 0 ? "" : ` (exit ${r.status})`}\n${tail(out.trim(), 2500)}`,
    );
  }
  return { ok: r.status === 0, out };
}
export function must(cmd: string) {
  const r = sh(cmd);
  if (!r.ok) throw new Error(`\`${cmd}\` failed:\n${r.out.slice(-1500)}`);
  return r.out.trim();
}
export const tail = (s: string, n = 6000) => (s.length > n ? `…${s.slice(-n)}` : s);
