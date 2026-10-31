import { ConvexError } from "convex/values";

// The user-facing message from a ConvexError thrown by our functions, or a generic fallback.
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again.") {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}
