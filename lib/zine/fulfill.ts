// Turns a paid /zine order into a Lulu print job. Server-only.
//
// startPrint starts a Vercel Sandbox that renders the order's PDFs (scripts/zine-print.ts),
// detached, so it can take longer than a request. The sandbox reports back to
// app/api/zine/print with the order's one-time key: after the interior, we answer with Lulu's
// cover size for its page count; after the cover, we send the print job to Lulu. The sandbox
// holds no secrets: just that key and two Convex upload URLs.
import { createHash, randomBytes } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { REPO, SANDBOX_ROOT } from "@/convex/lib/improve";
import { serverSecret } from "@/lib/auth-server";
import { coverDimensions, createPrintJob, LuluError, luluConfigured } from "@/lib/lulu";
import { withTimeLimit } from "@/lib/time-limit";
import { interiorPages, type ShippingLevel } from "./print";

const SANDBOX_TIMEOUT_MS = 20 * 60_000;
const REF = /^[0-9a-f]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA ?? "")
  ? process.env.VERCEL_GIT_COMMIT_SHA!
  : "main";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

const update = (
  id: Id<"zineOrders">,
  patch: Parameters<typeof fetchMutation<typeof api.zineOrders.update>>[1]["patch"],
) => fetchMutation(api.zineOrders.update, { secret: serverSecret(), id, patch });

// Bun, the repo's packages, and Playwright's Chromium (with the libraries it needs on the
// sandbox's Amazon Linux), at the commit this site was deployed from. Then the render.
const SETUP = [
  "command -v bun >/dev/null || [ -x ~/.bun/bin/bun ] || curl -fsSL https://bun.sh/install | bash",
  'export PATH="$HOME/.bun/bin:$PATH"',
  `git fetch -q --depth=1 origin ${REF} && git checkout -q FETCH_HEAD`,
  "bun install --frozen-lockfile",
  "sudo dnf install -y -q nss atk at-spi2-atk cups-libs libdrm libxkbcommon libXcomposite libXdamage libXrandr libXfixes mesa-libgbm pango alsa-lib >/dev/null",
  "bunx playwright-core install chromium",
].join(" && ");

export async function startPrint(id: Id<"zineOrders">, origin: string) {
  const secret = serverSecret();
  const order = await fetchQuery(api.zineOrders.get, { secret, id });
  if (!order) throw new Error("No such order.");
  if (order.status !== "paid" && order.status !== "failed")
    throw new Error(`Order is ${order.status}.`);
  const token = randomBytes(24).toString("hex");
  const [interiorUpload, coverUpload] = await Promise.all([
    fetchMutation(api.zineOrders.uploadUrl, { secret }),
    fetchMutation(api.zineOrders.uploadUrl, { secret }),
  ]);
  await update(id, {
    status: "rendering",
    printTokenHash: hash(token),
    error: null,
    luluJobId: null, // a retry after Lulu rejected the files makes a new job
  });
  const job = {
    orderId: id,
    token,
    week: order.week,
    tweaks: JSON.parse(order.tweaks),
    finishUrl: `${origin}/api/zine/print`,
    interiorUpload,
    coverUpload,
  };
  const failNote = JSON.stringify({ print: { orderId: id, token, stage: "failed", error: "Setting up the sandbox failed." } });
  try {
    const sandbox = await withTimeLimit("create", 120_000, (signal) =>
      Sandbox.create({
        source: { type: "git", url: `https://github.com/${REPO}.git`, depth: 1 },
        resources: { vcpus: 4 },
        timeout: SANDBOX_TIMEOUT_MS,
        persistent: false,
        signal,
      }),
    );
    await update(id, { sandboxId: sandbox.name });
    await withTimeLimit("start", 30_000, (signal) =>
      sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          `set -eo pipefail; trap 'curl -s -X POST -H "content-type: application/json" --data "$FAIL" "$FINISH"' ERR; ${SETUP}; bun scripts/zine-print.ts`,
        ],
        cwd: SANDBOX_ROOT,
        detached: true,
        env: {
          ZINE_JOB: JSON.stringify(job),
          ZINE_CHROMIUM: "bundled",
          FAIL: failNote,
          FINISH: job.finishUrl,
        },
        signal,
      }),
    );
  } catch (err) {
    await update(id, { status: "failed", error: `Couldn’t start rendering: ${String(err)}`.slice(0, 500) });
    throw err;
  }
}

type Report = {
  orderId?: string;
  token?: string;
  stage?: "interior" | "cover" | "failed";
  storageId?: string;
  pages?: number;
  error?: string;
};

// The sandbox's reports. Returns the JSON to answer with, or throws a Response.
export async function onReport(r: Report): Promise<Record<string, unknown>> {
  const secret = serverSecret();
  const id = r.orderId as Id<"zineOrders">;
  const order = r.orderId
    ? await fetchQuery(api.zineOrders.get, { secret, id }).catch(() => null)
    : null;
  if (!order || !r.token || !order.printTokenHash || order.printTokenHash !== hash(r.token))
    throw new Response("Forbidden", { status: 403 });
  if (order.status !== "rendering") throw new Response("Not rendering", { status: 409 });

  if (r.stage === "failed") {
    await update(id, { status: "failed", error: r.error ?? "Rendering failed.", printTokenHash: null });
    await stopSandbox(order.sandboxId);
    return {};
  }

  if (r.stage === "interior") {
    if (!r.storageId || !r.pages) throw new Response("Bad report", { status: 400 });
    const pages = interiorPages(r.pages, { cover: false });
    await update(id, { interiorId: r.storageId as Id<"_storage">, printedPages: pages });
    const { widthPt, heightPt } = luluConfigured()
      ? await coverDimensions(order.podPackageId, pages)
      : { widthPt: (17 + pages / 444 + 0.06 + 0.25) * 72, heightPt: 11.25 * 72 };
    return { cover: { widthIn: widthPt / 72, heightIn: heightPt / 72 } };
  }

  if (r.stage === "cover") {
    if (!r.storageId || !order.interiorId) throw new Response("Bad report", { status: 400 });
    await update(id, { coverId: r.storageId as Id<"_storage">, printTokenHash: null });
    await stopSandbox(order.sandboxId);
    await submit(id);
    return {};
  }
  throw new Response("Bad report", { status: 400 });
}

// Sends a rendered order to Lulu. Also used to retry one whose files are already made.
export async function submit(id: Id<"zineOrders">) {
  const secret = serverSecret();
  const order = await fetchQuery(api.zineOrders.get, { secret, id });
  const urls = await fetchQuery(api.zineOrders.fileUrls, { secret, id });
  if (!order || !urls?.interior || !urls.cover) throw new Error("Files missing.");
  if (order.luluJobId) return;
  try {
    const job = await createPrintJob({
      externalId: id,
      title: `Just Write · Issue ${order.week}`,
      podPackageId: order.podPackageId,
      quantity: order.quantity,
      interiorUrl: urls.interior,
      coverUrl: urls.cover,
      address: order.address,
      level: order.shippingLevel as ShippingLevel,
    });
    await update(id, { status: "printing", luluJobId: job.id, luluStatus: job.status.name });
  } catch (err) {
    const error = err instanceof LuluError ? `Lulu: ${err.userMessage}` : String(err);
    await update(id, { status: "failed", error: error.slice(0, 500) });
    throw err;
  }
}

async function stopSandbox(name: string | undefined) {
  if (!name) return;
  await withTimeLimit("stop", 15_000, async (signal) => {
    const s = await Sandbox.get({ name, signal });
    await s.stop({ signal });
  }).catch(() => {});
}
