// Time limits for calls that can hang without ever answering. On 2026-11-10 Vercel's Sandbox
// API did that for several minutes (a resumed sandbox said it was running, but runCommand never
// returned), and /api/improve was killed at maxDuration before it could mark its runs failed. So
// every Sandbox call there gets a limit, and each request a deadline, which turn a hang into an
// error that the existing retry and fail paths handle.

export class TimedOut extends Error {
  constructor(readonly what: string) {
    super(`${what} didn’t answer in time`);
    this.name = "TimedOut";
  }
}

// When a request has to be done by, leaving time to report a failure before the platform kills
// the function.
export type Deadline = { end: number };

export function deadline(ms: number, start = Date.now()): Deadline {
  return { end: start + ms };
}

export function timeLeft(d: Deadline, now = Date.now()) {
  return Math.max(0, d.end - now);
}

// Runs `call` with up to `ms` (or what's left before `by`). On time out the signal is aborted
// and this throws TimedOut, whether or not `call` notices the signal. The signal is only aborted
// on time out, so it's safe to pass to a detached command, which keeps running after this
// returns.
export async function withTimeLimit<T>(
  what: string,
  ms: number,
  call: (signal: AbortSignal) => Promise<T>,
  by?: Deadline,
): Promise<T> {
  const limit = by ? Math.min(ms, timeLeft(by)) : ms;
  if (limit <= 0) throw new TimedOut(what);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimedOut(what));
    }, limit);
  });
  try {
    return await Promise.race([call(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Whether another start attempt, after waiting `delayMs`, still gets at least `minMs` before
// the deadline.
export function fitsAnotherTry(
  by: Deadline,
  delayMs: number,
  minMs: number,
  now = Date.now(),
) {
  return timeLeft(by, now) >= delayMs + minMs;
}
