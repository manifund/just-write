// Headless Chromium for the agent, so it can screenshot what it builds
// (scripts/screenshot.ts). Installed in the background after `bun install`, so the agent
// starts without waiting: the system libraries it needs (Playwright's install-deps on apt
// systems, LIBS with dnf on Amazon Linux, where install-deps doesn't work), then Playwright's
// headless shell at the version bun.lock pins. A saved sandbox keeps it, so this is a quick
// no-op there. The outcome goes to BROWSER_DONE ("ok" or "failed"), which the screenshot
// script waits for; the output is in BROWSER_LOG.
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { ROOT, env } from "./context";
import { log } from "./report";

export const BROWSER_DONE = "/tmp/chromium.done";
export const BROWSER_LOG = "/tmp/chromium-install.log";

// What headless Chromium links against, plus a few fonts for pages without web fonts.
// --skip-broken skips any that this release doesn't have instead of failing.
const LIBS = [
  "nss",
  "nspr",
  "atk",
  "at-spi2-atk",
  "cups-libs",
  "libdrm",
  "libxkbcommon",
  "libXcomposite",
  "libXdamage",
  "libXext",
  "libXfixes",
  "libXrandr",
  "libxshmfence",
  "mesa-libgbm",
  "pango",
  "cairo",
  "alsa-lib",
  "dejavu-sans-fonts",
  "dejavu-serif-fonts",
  "google-noto-emoji-color-fonts",
].join(" ");

export function installBrowser() {
  if (existsSync(BROWSER_DONE) && readFileSync(BROWSER_DONE, "utf8").trim() === "ok")
    return;
  const script = [
    `rm -f ${BROWSER_DONE}`,
    // Playwright's install-deps knows apt; on dnf systems, install the list above.
    `if command -v apt-get >/dev/null; then sudo -E env PATH="$PATH" bunx playwright-core install-deps chromium-headless-shell || true; elif command -v dnf >/dev/null; then sudo dnf install -y -q --skip-broken ${LIBS} || true; fi`,
    `if bunx playwright-core install chromium-headless-shell; then echo ok > ${BROWSER_DONE}; else echo failed > ${BROWSER_DONE}; fi`,
  ].join("; ");
  const out = openSync(BROWSER_LOG, "w");
  try {
    const child = spawn("bash", ["-c", script], {
      cwd: ROOT,
      env: { ...env, RUN_TOKEN: "" },
      stdio: ["ignore", out, out],
      detached: true,
    });
    child.on("exit", (code) =>
      log("shell", `Chromium install finished (exit ${code}); see ${BROWSER_LOG}`),
    );
    child.unref();
  } finally {
    closeSync(out);
  }
}
