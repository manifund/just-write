import { handler } from "@/lib/auth-server";

// Better Auth runs in Convex; this proxies /api/auth/* to it so cookies stay on our domain.
export const { GET, POST } = handler;
