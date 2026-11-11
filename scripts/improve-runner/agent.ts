// Runs the Claude Agent SDK on the request: the session, the follow-ups and Stop presses that
// reach it while it works, and the thread's images on its first message.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  AGENT_MODEL,
  BRIEF_IMAGE_BYTES,
  isEffort,
  type Effort,
} from "../../convex/lib/improve";
// Type-only imports are erased, so these don't need their modules at runtime.
import type { TaskState } from "../../convex/lib/improveLogs";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  AGENT_DIR,
  CHAT,
  CHAT_AGENT_MS,
  DRY,
  EFFORT,
  OPENROUTER_API_KEY,
  ROOT,
  brief,
  env,
  startedAt,
} from "./context";
import {
  CHAT_RESULT_SCHEMA,
  CHAT_RULES,
  RESULT_SCHEMA,
  RULES,
  parseFinal,
  statusLine,
  type Final,
} from "./prompt";
import {
  agentLabel,
  agentLabels,
  clearActivity,
  describeInput,
  log,
  openTools,
  report,
  resultText,
  runnerMutation,
  step,
  taskByToolUse,
  tasks,
  touch,
} from "./report";
import { sh } from "./shell";

// Follow-ups members sent in the thread since the run started (runner.followUps), and
// whether someone pressed Stop on the card (then `stoppedBy` is their name and the running
// agent is stopped). Chat tasks don't take any: Convex ends those itself when stopped, and
// follow-ups start as their own run when this one ends.
type FollowUp = {
  author: string;
  text: string;
  tagged?: boolean; // false: a reply that didn't mention @Claude
  edited?: boolean; // the new text of the request, edited while the run was going
  effort?: string; // "!effort high" in the follow-up: switch the running agent's effort
};
let stoppedBy: string | null = null;
let stopAgent = () => {};
export const whoStopped = () => stoppedBy;
async function claimFollowUps() {
  if (DRY || CHAT) return [];
  const res = await runnerMutation("runner:followUps");
  if (Array.isArray(res)) return res as FollowUp[]; // older Convex
  const { followUps, stop } = (res ?? {}) as {
    followUps?: FollowUp[];
    stop?: string | null;
  };
  if (stop && !stoppedBy) {
    stoppedBy = stop;
    console.log("[stop] asked by", stop);
    stopAgent();
  }
  return followUps ?? [];
}

// Files changed so far (tracked and new), relative to the repo root.
function dirtyFiles() {
  return sh("git status --porcelain --untracked-files=all", { quiet: true })
    .out.split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
}

const FOLLOW_UP_POLL_MS = 4000;

// The agent's effort: the brief's, until a follow-up switches it. Later sessions in this run
// (fixing failed checks) keep the switched level. `applyEffort` sets it on the live session.
let effort: Effort | undefined = EFFORT;
let applyEffort: (e: Effort) => Promise<void> = async () => {};
async function switchEffort(f: FollowUp) {
  if (!isEffort(f.effort) || f.effort === effort) return "";
  effort = f.effort;
  await step(`Switching to ${f.effort} effort`);
  try {
    await applyEffort(f.effort);
    log("info", `Effort switched to ${f.effort} by ${f.author}`);
  } catch (err) {
    log(
      "error",
      `Couldn't switch the effort: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return `\n(That message switched your effort level to ${f.effort}; nothing else to do for that part.)`;
}

type ImageBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
};

const userMessage = (
  text: string,
  priority?: SDKUserMessage["priority"],
  images: ImageBlock[] = [],
): SDKUserMessage => ({
  type: "user",
  message: {
    role: "user",
    content: images.length ? [{ type: "text", text }, ...images] : text,
  },
  parent_tool_use_id: null,
  priority,
});

// The images posted in the thread, fetched once and attached to the agent's first message,
// with a note saying whose message each came from. Ones that can't be read are listed too.
type Attached = { blocks: ImageBlock[]; note: string };
let attached: Promise<Attached> | null = null;
function threadImages() {
  return (attached ??= loadImages());
}
async function loadImages(): Promise<Attached> {
  const wanted = brief.thread.flatMap((m) =>
    (m.images ?? []).map((url) => ({ url, author: m.author })),
  );
  if (!wanted.length) return { blocks: [], note: "" };
  await step(`Looking at ${wanted.length} image(s) from the thread`);
  const results = await Promise.all(
    wanted.map(async ({ url }) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) return `it couldn't be downloaded (${res.status})`;
        const type = (res.headers.get("content-type") ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        const media_type = (
          ["image/jpeg", "image/png", "image/gif", "image/webp"] as const
        ).find((t) => t === type);
        if (!media_type)
          return `its format (${type || "unknown"}) isn't supported`;
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length > BRIEF_IMAGE_BYTES)
          return `it's too large (${(bytes.length / 1e6).toFixed(1)} MB)`;
        return {
          type: "image",
          source: {
            type: "base64",
            media_type,
            data: bytes.toString("base64"),
          },
        } satisfies ImageBlock;
      } catch (err) {
        return `it couldn't be downloaded (${err instanceof Error ? err.message : String(err)})`;
      }
    }),
  );
  const blocks: ImageBlock[] = [];
  const lines: string[] = [];
  results.forEach((r, i) => {
    const from = `${wanted[i].author}'s message`;
    if (typeof r === "string") {
      lines.push(`- An image in ${from} isn't attached: ${r}.`);
      log("error", `Skipped an image (${wanted[i].url}): ${r}`);
    } else {
      blocks.push(r);
      lines.push(`- Image ${blocks.length}: from ${from}.`);
    }
  });
  return {
    blocks,
    note: `The images posted in the thread ("(image)" in the text) are attached after this message, in order:\n${lines.join("\n")}`,
  };
}

// The agent's input: the prompt, then any follow-ups from the thread while it works. They go
// in at priority "next", so the agent reads them after its current tool call, like a message
// typed into Claude Code mid-task. The stream ends once the agent has returned its result;
// later follow-ups wait and start as their own run (convex/improvements.ts#releaseWaiting).
async function* agentInput(
  first: string,
  images: ImageBlock[],
  isDone: () => boolean,
  waitForDone: Promise<void>,
) {
  yield userMessage(first, undefined, images);
  while (!isDone()) {
    await Promise.race([
      new Promise((r) => setTimeout(r, FOLLOW_UP_POLL_MS)),
      waitForDone,
    ]);
    if (isDone()) return;
    for (const f of await claimFollowUps()) {
      const effortNote = await switchEffort(f);
      await step(
        f.edited
          ? `Reading ${f.author}'s edited request`
          : `Reading a follow-up from ${f.author}`,
      );
      log(
        "info",
        `${f.edited ? "Edited request" : "Follow-up"} from ${f.author}:\n${f.text}`,
      );
      yield userMessage(
        f.edited
          ? `${f.author} edited the request while you were working. It now reads:\n"""\n${f.text}\n"""\nTreat the changes as a follow-up note: take them into account, then carry on. When you're done, return the structured result covering the whole change.`
          : f.tagged === false
          ? `${f.author} replied in the thread while you were working, without mentioning @Claude:\n"""\n${f.text}\n"""\nThis may be members talking to each other ("looks good", "it works"). If it asks for something about this change, take it into account; otherwise ignore it. Then carry on. When you're done, return the structured result covering the whole change.`
          : `${f.author} added this in the thread while you were working:\n"""\n${f.text}\n"""${effortNote}\nTake it into account, then carry on. When you're done, return the structured result covering the whole change.`,
        "next",
      );
    }
  }
}

// From the clone's node_modules (this file runs from /tmp/improve-runner, see the top), or
// for a chat task from AGENT_DIR.
async function loadSdk() {
  const path = createRequire(`${CHAT ? AGENT_DIR : ROOT}/package.json`).resolve(
    "@anthropic-ai/claude-agent-sdk",
  );
  return (await import(
    pathToFileURL(path).href
  )) as typeof import("@anthropic-ai/claude-agent-sdk");
}

// The latest agent session, saved to the run as soon as it starts so a failed run (out of
// steps, timed out, crashed) can still be resumed by a follow-up.
let agentSessionId = "";
export const agentSession = () => agentSessionId;
async function saveSession(id: string) {
  if (!id || id === agentSessionId) return;
  agentSessionId = id;
  await report({ sessionId: id });
}

// `outOfTurns`: the agent hit maxTurns before returning its result. Its edits are kept.
// `withImages`: attach the thread's images (for the brief, not for later nudges).
export async function runAgent(input: string, resume?: string, withImages = false) {
  const images = withImages ? await threadImages() : { blocks: [], note: "" };
  if (images.note) input = `${input}\n\n${images.note}`;
  log(
    "info",
    `${resume ? "Resuming the agent session with" : "Starting the agent with"}:\n${input}`,
  );
  try {
    return await runAgentSession(input, resume, images.blocks);
  } finally {
    await clearActivity();
  }
}

async function runAgentSession(
  input: string,
  resume: string | undefined,
  images: ImageBlock[],
) {
  const { query } = await loadSdk();
  // A chat task has to finish before its sandbox stops.
  const abortController = new AbortController();
  const timer = CHAT
    ? setTimeout(
        () => abortController.abort(),
        Math.max(0, startedAt + CHAT_AGENT_MS - Date.now()),
      )
    : null;
  timer?.unref();
  let done = false;
  let markDone = () => {};
  const waitForDone = new Promise<void>((r) => (markDone = r));

  const reported = new Set(dirtyFiles());
  let typechecked = false;
  let final: Final = { title: null, summary: "", details: "" };
  let sessionId = resume ?? "";
  let outOfTurns = false;
  stopAgent = () => abortController.abort();
  if (stoppedBy) abortController.abort();
  const q = query({
    prompt: agentInput(input, images, () => done, waitForDone),
    options: {
      cwd: ROOT,
      model: AGENT_MODEL,
      resume,
      effort,
      maxTurns: CHAT ? 100 : 150,
      abortController,
      // Subagents' own text and periodic summaries, for the log and the card's heartbeat.
      forwardSubagentText: true,
      agentProgressSummaries: true,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      settingSources: ["project"], // loads CLAUDE.md
      outputFormat: {
        type: "json_schema",
        schema: CHAT ? CHAT_RESULT_SCHEMA : RESULT_SCHEMA,
      },
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: CHAT ? CHAT_RULES : RULES,
      },
      env: {
        ...env,
        RUN_TOKEN: "",
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        ANTHROPIC_AUTH_TOKEN: OPENROUTER_API_KEY,
        ANTHROPIC_API_KEY: "",
        ANTHROPIC_DEFAULT_OPUS_MODEL: AGENT_MODEL,
        ANTHROPIC_DEFAULT_SONNET_MODEL: "anthropic/claude-sonnet-5.5",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "anthropic/claude-haiku-5.5",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      },
    },
  });

  applyEffort = (e) => q.applyFlagSettings({ effortLevel: e });

  // However the session ends (a result, or the stream throwing), stop polling for follow-ups.
  try {
    for await (const msg of q) {
      if (msg.type === "system") {
        const now = Date.now();
        switch (msg.subtype) {
          case "init":
            sessionId = msg.session_id;
            log(
              "info",
              `Agent session ${resume ? "resumed" : "started"} (${msg.model})`,
            );
            await saveSession(sessionId);
            break;
          case "task_started":
            if (msg.ambient || msg.skip_transcript) break;
            tasks.set(msg.task_id, {
              // Subagents show their description; background commands are marked as such.
              label:
                msg.task_type === "local_bash"
                  ? `Command: ${msg.description}`
                  : msg.description,
              state: "running",
              lastAt: now,
            });
            if (msg.tool_use_id)
              taskByToolUse.set(msg.tool_use_id, msg.task_id);
            log(
              "task",
              `Started ${msg.subagent_type ?? msg.task_type ?? "task"}${msg.is_backgrounded ? " in the background" : ""}: ${msg.description}`,
            );
            touch();
            break;
          case "task_progress": {
            const task = tasks.get(msg.task_id);
            if (!task) break;
            task.lastAt = now;
            if (msg.summary) task.summary = msg.summary;
            touch();
            break;
          }
          case "task_updated": {
            const task = tasks.get(msg.task_id);
            const s = msg.patch.status;
            if (!task || !s) break;
            if (s === "completed") task.state = "done";
            else if (s === "failed") task.state = "failed";
            else if (s === "killed") task.state = "stopped";
            touch();
            break;
          }
          case "task_notification": {
            // Can be for a task from before this session (a resume), which isn't tracked.
            const task = tasks.get(msg.task_id);
            const state: TaskState =
              msg.status === "completed"
                ? "done"
                : msg.status === "failed"
                  ? "failed"
                  : "stopped";
            if (task) {
              task.state = state;
              task.lastAt = now;
            }
            const label =
              task?.label ??
              (msg.tool_use_id && agentLabels.get(msg.tool_use_id)) ??
              "a task";
            const usage = msg.usage
              ? ` (${msg.usage.tool_uses} tool calls, ${Math.round(msg.usage.duration_ms / 1000)}s)`
              : "";
            const verb =
              state === "done"
                ? "Finished"
                : state === "failed"
                  ? "Failed"
                  : "Stopped";
            log("task", `${verb}: ${label}${usage}\n${msg.summary ?? ""}`);
            touch();
            break;
          }
        }
      }
      if (msg.type === "assistant") {
        const sub = msg.parent_tool_use_id;
        const agent = sub ? agentLabel(sub) : undefined;
        touch(sub);
        for (const block of msg.message.content) {
          if (block.type === "text") {
            log("text", block.text, agent);
            // The agent narrates in short sentences between tool calls; those are its status lines.
            const line = sub ? null : statusLine(block.text);
            if (line) await step(line);
          } else if (block.type === "tool_use") {
            log("tool", describeInput(block.name, block.input), agent);
            const input = (block.input ?? {}) as {
              command?: unknown;
              description?: unknown;
            };
            if (block.name === "Agent" || block.name === "Task")
              agentLabels.set(
                block.id,
                String(input.description ?? "subagent").slice(0, 120),
              );
            if (sub) continue;
            openTools.set(block.id, { name: block.name, since: Date.now() });
            const cmd = String(input.command ?? "");
            console.log(
              "[tool]",
              block.name,
              JSON.stringify(block.input).slice(0, 200),
            );
            if (!typechecked && /\btsc\b|\bbun (--)?check\b/.test(cmd)) {
              typechecked = true;
              await step("Typechecking");
            }
          }
        }
      }
      // Tool results are back: log them, and newly changed files (the card lists files at the end).
      if (msg.type === "user") {
        const sub = msg.parent_tool_use_id;
        const agent = sub ? agentLabel(sub) : undefined;
        touch(sub);
        const content = msg.message.content;
        if (Array.isArray(content))
          for (const block of content) {
            if (block.type !== "tool_result") continue;
            if (!sub) openTools.delete(block.tool_use_id);
            log(
              block.is_error ? "error" : "result",
              resultText(block.content),
              agent,
            );
          }
        for (const f of dirtyFiles())
          if (!reported.has(f)) {
            reported.add(f);
            console.log("[edited]", f);
            log("info", `Changed ${f}`);
          }
      }
      if (msg.type === "result") {
        // Stop taking follow-ups. One sent just before this still gets its own turn, and its
        // result (the last one) is what counts.
        done = true;
        markDone();
        sessionId = msg.session_id;
        log(
          msg.subtype === "success" ? "info" : "error",
          `Agent finished (${msg.subtype}) after ${msg.num_turns} turns, ${Math.round(msg.duration_ms / 1000)}s`,
        );
        await saveSession(sessionId);
        if (msg.subtype === "success")
          final = parseFinal(msg.structured_output, msg.result);
        else if (msg.subtype === "error_max_turns") outOfTurns = true;
        else if (!stoppedBy)
          throw new Error(`The agent stopped early (${msg.subtype}).`);
      }
    }
  } catch (err) {
    // Stopped from the card: the abort ends the query. Its edits and session are kept.
    if (!stoppedBy) throw err;
    log("info", `Agent stopped (asked by ${stoppedBy})`);
  } finally {
    stopAgent = () => {};
    applyEffort = async () => {};
    done = true;
    markDone();
    if (timer) clearTimeout(timer);
  }
  return { final, sessionId, outOfTurns };
}
