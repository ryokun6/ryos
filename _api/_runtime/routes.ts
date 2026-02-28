import type { RouteDefinition, VercelLikeHandler } from "./http-types.js";

const createLoader = (
  importer: () => Promise<{ default: VercelLikeHandler }>
): (() => Promise<VercelLikeHandler>) => {
  let cached: VercelLikeHandler | null = null;
  return async () => {
    if (!cached) {
      const mod = await importer();
      cached = mod.default;
    }
    return cached;
  };
};

export const API_ROUTES: RouteDefinition[] = [
  // Most specific routes first
  { pattern: "/api/rooms/:id/messages/:msgId", loadHandler: createLoader(() => import("../rooms/[id]/messages/[msgId].ts")) },
  { pattern: "/api/rooms/:id/messages", loadHandler: createLoader(() => import("../rooms/[id]/messages.ts")) },
  { pattern: "/api/rooms/:id/join", loadHandler: createLoader(() => import("../rooms/[id]/join.ts")) },
  { pattern: "/api/rooms/:id/leave", loadHandler: createLoader(() => import("../rooms/[id]/leave.ts")) },
  { pattern: "/api/rooms/:id/users", loadHandler: createLoader(() => import("../rooms/[id]/users.ts")) },
  { pattern: "/api/rooms/:id", loadHandler: createLoader(() => import("../rooms/[id].ts")) },
  { pattern: "/api/rooms/index", loadHandler: createLoader(() => import("../rooms/index.ts")) },
  { pattern: "/api/rooms", loadHandler: createLoader(() => import("../rooms/index.ts")) },

  { pattern: "/api/listen/sessions/:id/reaction", loadHandler: createLoader(() => import("../listen/sessions/[id]/reaction.ts")) },
  { pattern: "/api/listen/sessions/:id/join", loadHandler: createLoader(() => import("../listen/sessions/[id]/join.ts")) },
  { pattern: "/api/listen/sessions/:id/leave", loadHandler: createLoader(() => import("../listen/sessions/[id]/leave.ts")) },
  { pattern: "/api/listen/sessions/:id/sync", loadHandler: createLoader(() => import("../listen/sessions/[id]/sync.ts")) },
  { pattern: "/api/listen/sessions/:id", loadHandler: createLoader(() => import("../listen/sessions/[id]/index.ts")) },
  { pattern: "/api/listen/sessions/index", loadHandler: createLoader(() => import("../listen/sessions/index.ts")) },
  { pattern: "/api/listen/sessions", loadHandler: createLoader(() => import("../listen/sessions/index.ts")) },

  { pattern: "/api/auth/password/check", loadHandler: createLoader(() => import("../auth/password/check.ts")) },
  { pattern: "/api/auth/password/set", loadHandler: createLoader(() => import("../auth/password/set.ts")) },
  { pattern: "/api/auth/token/verify", loadHandler: createLoader(() => import("../auth/token/verify.ts")) },
  { pattern: "/api/auth/token/refresh", loadHandler: createLoader(() => import("../auth/token/refresh.ts")) },
  { pattern: "/api/auth/register", loadHandler: createLoader(() => import("../auth/register.ts")) },
  { pattern: "/api/auth/login", loadHandler: createLoader(() => import("../auth/login.ts")) },
  { pattern: "/api/auth/logout-all", loadHandler: createLoader(() => import("../auth/logout-all.ts")) },
  { pattern: "/api/auth/logout", loadHandler: createLoader(() => import("../auth/logout.ts")) },
  { pattern: "/api/auth/tokens", loadHandler: createLoader(() => import("../auth/tokens.ts")) },

  { pattern: "/api/sync/backup-token", loadHandler: createLoader(() => import("../sync/backup-token.ts")) },
  { pattern: "/api/sync/backup", loadHandler: createLoader(() => import("../sync/backup.ts")) },
  { pattern: "/api/sync/status", loadHandler: createLoader(() => import("../sync/status.ts")) },

  { pattern: "/api/songs/index", loadHandler: createLoader(() => import("../songs/index.ts")) },
  { pattern: "/api/songs/:id", loadHandler: createLoader(() => import("../songs/[id].ts")) },
  { pattern: "/api/songs", loadHandler: createLoader(() => import("../songs/index.ts")) },

  { pattern: "/api/users/index", loadHandler: createLoader(() => import("../users/index.ts")) },
  { pattern: "/api/users", loadHandler: createLoader(() => import("../users/index.ts")) },

  { pattern: "/api/ai/process-daily-notes", loadHandler: createLoader(() => import("../ai/process-daily-notes.ts")) },
  { pattern: "/api/ai/extract-memories", loadHandler: createLoader(() => import("../ai/extract-memories.ts")) },
  { pattern: "/api/ai/ryo-reply", loadHandler: createLoader(() => import("../ai/ryo-reply.ts")) },

  { pattern: "/api/messages/bulk", loadHandler: createLoader(() => import("../messages/bulk.ts")) },
  { pattern: "/api/presence/switch", loadHandler: createLoader(() => import("../presence/switch.ts")) },
  { pattern: "/api/pusher/broadcast", loadHandler: createLoader(() => import("../pusher/broadcast.ts")) },

  { pattern: "/api/audio-transcribe", parseBody: false, loadHandler: createLoader(() => import("../audio-transcribe.ts")) },
  { pattern: "/api/youtube-search", loadHandler: createLoader(() => import("../youtube-search.ts")) },
  { pattern: "/api/parse-title", loadHandler: createLoader(() => import("../parse-title.ts")) },
  { pattern: "/api/speech", loadHandler: createLoader(() => import("../speech.ts")) },
  { pattern: "/api/link-preview", loadHandler: createLoader(() => import("../link-preview.ts")) },
  { pattern: "/api/iframe-check", loadHandler: createLoader(() => import("../iframe-check.ts")) },
  { pattern: "/api/ie-generate", loadHandler: createLoader(() => import("../ie-generate.ts")) },
  { pattern: "/api/applet-ai", loadHandler: createLoader(() => import("../applet-ai.ts")) },
  { pattern: "/api/share-applet", loadHandler: createLoader(() => import("../share-applet.ts")) },
  { pattern: "/api/admin", loadHandler: createLoader(() => import("../admin.ts")) },
  { pattern: "/api/chat", loadHandler: createLoader(() => import("../chat.ts")) },
];
