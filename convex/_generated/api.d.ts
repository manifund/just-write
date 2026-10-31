/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as essays from "../essays.js";
import type * as http from "../http.js";
import type * as ideas from "../ideas.js";
import type * as lib_channels from "../lib/channels.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_program from "../lib/program.js";
import type * as lib_reactions from "../lib/reactions.js";
import type * as lib_richtext from "../lib/richtext.js";
import type * as lib_util from "../lib/util.js";
import type * as lib_viewer from "../lib/viewer.js";
import type * as members from "../members.js";
import type * as presence from "../presence.js";
import type * as server from "../server.js";
import type * as similar from "../similar.js";
import type * as similarAction from "../similarAction.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  chat: typeof chat;
  essays: typeof essays;
  http: typeof http;
  ideas: typeof ideas;
  "lib/channels": typeof lib_channels;
  "lib/email": typeof lib_email;
  "lib/program": typeof lib_program;
  "lib/reactions": typeof lib_reactions;
  "lib/richtext": typeof lib_richtext;
  "lib/util": typeof lib_util;
  "lib/viewer": typeof lib_viewer;
  members: typeof members;
  presence: typeof presence;
  server: typeof server;
  similar: typeof similar;
  similarAction: typeof similarAction;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
};
