/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as chatTasks from "../chatTasks.js";
import type * as crons from "../crons.js";
import type * as essays from "../essays.js";
import type * as events from "../events.js";
import type * as gcal from "../gcal.js";
import type * as http from "../http.js";
import type * as ideas from "../ideas.js";
import type * as improvements from "../improvements.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_channels from "../lib/channels.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_ics from "../lib/ics.js";
import type * as lib_improve from "../lib/improve.js";
import type * as lib_markdown from "../lib/markdown.js";
import type * as lib_messages from "../lib/messages.js";
import type * as lib_program from "../lib/program.js";
import type * as lib_pushEndpoint from "../lib/pushEndpoint.js";
import type * as lib_reactions from "../lib/reactions.js";
import type * as lib_richtext from "../lib/richtext.js";
import type * as lib_time from "../lib/time.js";
import type * as lib_util from "../lib/util.js";
import type * as lib_viewer from "../lib/viewer.js";
import type * as members from "../members.js";
import type * as presence from "../presence.js";
import type * as previewAccess from "../previewAccess.js";
import type * as push from "../push.js";
import type * as pushAction from "../pushAction.js";
import type * as reminders from "../reminders.js";
import type * as runner from "../runner.js";
import type * as server from "../server.js";
import type * as similar from "../similar.js";
import type * as similarAction from "../similarAction.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  admin: typeof admin;
  auth: typeof auth;
  chat: typeof chat;
  chatTasks: typeof chatTasks;
  crons: typeof crons;
  essays: typeof essays;
  events: typeof events;
  gcal: typeof gcal;
  http: typeof http;
  ideas: typeof ideas;
  improvements: typeof improvements;
  "lib/activity": typeof lib_activity;
  "lib/channels": typeof lib_channels;
  "lib/email": typeof lib_email;
  "lib/ics": typeof lib_ics;
  "lib/improve": typeof lib_improve;
  "lib/markdown": typeof lib_markdown;
  "lib/messages": typeof lib_messages;
  "lib/program": typeof lib_program;
  "lib/pushEndpoint": typeof lib_pushEndpoint;
  "lib/reactions": typeof lib_reactions;
  "lib/richtext": typeof lib_richtext;
  "lib/time": typeof lib_time;
  "lib/util": typeof lib_util;
  "lib/viewer": typeof lib_viewer;
  members: typeof members;
  presence: typeof presence;
  previewAccess: typeof previewAccess;
  push: typeof push;
  pushAction: typeof pushAction;
  reminders: typeof reminders;
  runner: typeof runner;
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
