// Runs in the browser before the app starts (Next.js convention).
import { installRouterFetchTimeout } from "@/lib/router-fetch-timeout";

installRouterFetchTimeout();
