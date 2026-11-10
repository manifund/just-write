// Everything the runner sends to Convex (convex/runner.ts) while it works: checklist steps,
// the detailed log, and the activity heartbeat.
import {
  LOG_BATCH_EVENTS,
  LOG_EVENT_CHARS,
  clip,
} from "../../convex/lib/improve";
// Type-only imports are erased, so these don't need their modules at runtime.
import type { LogKind, TaskState } from "../../convex/lib/improveLogs";
import { DRY, OPENROUTER_API_KEY, RUN_TOKEN, env } from "./context";

type Report = {
  step?: string;
  fail?: boolean;
  sessionId?: string;
};

// Calls a convex/runner.ts mutation for this run. Null if it failed; callers keep working.
export async function runnerMutation(
  path: string,
  args: Record<string, unknown> = {},
) {
  try {
    const res = await fetch(`${env.CONVEX_URL}/api/mutation`, {
      method: "POST",
      // A hung request mustn't hold up the steps and the finish that wait on it.
      signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path,
        format: "json",
        args: { runToken: RUN_TOKEN, id: env.IMPROVEMENT_ID, ...args },
      }),
    });
    if (!res.ok) {
      console.error(path, "failed", res.status, await res.text());
      return null;
    }
    return ((await res.json()) as { value?: unknown }).value ?? true;
  } catch (err) {
    console.error(path, "failed", err);
    return null;
  }
}

let lastStep = "";
export const currentStep = () => lastStep;
export async function report(r: Report) {
  if (r.step) lastStep = r.step;
  if (DRY) return console.log("[report]", JSON.stringify(r));
  // Convex logs the step itself; send what came before it first, so the log stays in order.
  if (r.step) await flushLogs();
  await runnerMutation("runner:report", r); // on failure the card just lags
}
export const step = (label: string) => report({ step: label });

// --- Log -------------------------------------------------------------------------------

// Secrets this process knows, and the shapes of common API keys, are replaced before anything
// goes into the log. The sandbox holds no site secrets (see the top), but the agent could still
// print a key it finds.
const SECRETS = [OPENROUTER_API_KEY, RUN_TOKEN].filter((s) => s.length >= 8);
const SECRET_PATTERNS = [
  /\bsk-(?:or|ant)-[\w-]{10,}/g, // OpenRouter, Anthropic
  /\b(?:sk|rk)_(?:live|test)_\w{10,}/g, // Stripe
  /\bwhsec_\w{10,}/g,
  /\b(?:ghp|gho|ghs|ghu|github_pat)_\w{20,}/g, // GitHub
  /\bBearer\s+[\w.~+/-]{16,}=*/gi,
  /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g, // JWTs
  /\b(?:CONVEX_SERVER_SECRET|BETTER_AUTH_SECRET|[A-Z_]*(?:API_KEY|TOKEN|SECRET))=\S+/g,
];
export function redact(text: string) {
  let out = text;
  for (const secret of SECRETS) out = out.split(secret).join("[redacted]");
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}

const LOG_LIMITS: Partial<Record<LogKind, number>> = {
  tool: 1500,
  result: 2000,
};
const LOG_FLUSH_MS = 3000;

const logBuffer: { kind: LogKind; text: string; agent?: string; t: number }[] =
  [];
export function log(kind: LogKind, text: string, agent?: string) {
  const t = redact(text).trim();
  if (!t) return;
  const entry = {
    kind,
    text: clip(t, LOG_LIMITS[kind] ?? LOG_EVENT_CHARS),
    agent: agent && redact(agent),
    t: Date.now(),
  };
  if (DRY)
    console.log(
      `[log ${kind}${agent ? ` · ${agent}` : ""}]`,
      entry.text.slice(0, 300),
    );
  else logBuffer.push(entry);
}

// Sends the buffered events (convex/runner.ts#log). One send at a time, in order. Failed
// batches are dropped: the log is best effort.
let flushing = Promise.resolve();
export function flushLogs() {
  flushing = flushing.then(async () => {
    while (logBuffer.length) {
      const now = Date.now();
      const events = logBuffer
        .splice(0, LOG_BATCH_EVENTS)
        .map(({ t, agent, ...e }) => ({
          ...e,
          ...(agent ? { agent } : {}),
          ago: now - t,
        }));
      await runnerMutation("runner:log", { events });
    }
  });
  return flushing;
}
setInterval(() => void flushLogs(), LOG_FLUSH_MS).unref();

// --- Activity ---------------------------------------------------------------------------
// Between checklist lines the agent can be busy for minutes: waiting on a long command, or on
// subagents it started in the background. The card shows that from a heartbeat
// (convex/runner.ts#activity), sent when something changes, at most every ACTIVITY_MS.

type Task = {
  label: string;
  state: TaskState;
  lastAt: number;
  summary?: string;
};
export const tasks = new Map<string, Task>(); // by SDK task id
export const taskByToolUse = new Map<string, string>(); // the Agent/Bash call that started it → task id
export const agentLabels = new Map<string, string>(); // Agent tool call id → its description
export const openTools = new Map<string, { name: string; since: number }>(); // the main agent's calls
let lastEventAt = Date.now();
const ACTIVITY_MS = 12_000;
const FINISHED_TASK_SHOWN_MS = 10 * 60_000;
let lastActivitySent = 0;
let lastActivityEmpty = true;
let activityTimer: ReturnType<typeof setTimeout> | null = null;

export function touch(toolUseId?: string | null) {
  const now = Date.now();
  lastEventAt = now;
  const task = toolUseId
    ? tasks.get(taskByToolUse.get(toolUseId) ?? "")
    : undefined;
  if (task) task.lastAt = now;
  scheduleActivity();
}

function scheduleActivity() {
  if (activityTimer) return;
  activityTimer = setTimeout(
    () => {
      activityTimer = null;
      lastActivitySent = Date.now();
      void queueActivity();
    },
    Math.max(0, lastActivitySent + ACTIVITY_MS - Date.now()),
  );
  activityTimer.unref();
}

// One send at a time, in order, so a late heartbeat can't land after the one that clears it.
let activitySending = Promise.resolve();
function queueActivity() {
  activitySending = activitySending.then(sendActivity);
  return activitySending;
}

async function sendActivity() {
  const now = Date.now();
  const tool = [...openTools.values()].sort((a, b) => a.since - b.since)[0];
  const shown = [...tasks.values()].filter(
    (t) => t.state === "running" || now - t.lastAt < FINISHED_TASK_SHOWN_MS,
  );
  const payload = {
    idleMs: now - lastEventAt,
    ...(tool ? { tool: { name: tool.name, forMs: now - tool.since } } : {}),
    tasks: shown.map((t) => ({
      label: redact(t.label),
      state: t.state,
      ...(t.summary ? { summary: redact(t.summary) } : {}),
    })),
  };
  // Nothing to show, and the card already shows nothing: skip the write.
  const empty = !tool && payload.tasks.length === 0;
  if (empty && lastActivityEmpty) return;
  lastActivityEmpty = empty;
  if (DRY) return console.log("[activity]", JSON.stringify(payload));
  await runnerMutation("runner:activity", payload);
}

// The agent session ended: nothing is open any more, so the card drops the line.
export async function clearActivity() {
  if (activityTimer) clearTimeout(activityTimer);
  activityTimer = null;
  openTools.clear();
  tasks.clear();
  taskByToolUse.clear();
  await queueActivity();
}

// Which subagent a message came from, for the log.
export const agentLabel = (toolUseId: string) =>
  agentLabels.get(toolUseId) ??
  tasks.get(taskByToolUse.get(toolUseId) ?? "")?.label ??
  "subagent";

export function describeInput(name: string, input: unknown) {
  const o = (input ?? {}) as Record<string, unknown>;
  if (typeof o.command === "string")
    return `${name}: $ ${o.command}${o.run_in_background ? " (background)" : ""}`;
  if (
    typeof o.file_path === "string" &&
    !("content" in o) &&
    !("old_string" in o)
  )
    return `${name}: ${o.file_path}`;
  return `${name}: ${JSON.stringify(o)}`;
}

export function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c: { type?: string; text?: string }) =>
      c.type === "text" ? (c.text ?? "") : `[${c.type ?? "content"}]`,
    )
    .join("\n");
}
