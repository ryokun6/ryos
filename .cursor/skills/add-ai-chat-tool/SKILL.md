---
name: add-ai-chat-tool
description: Add or modify an AI chat tool ("Ask Ryo" capability) in ryOS. Covers the server-side tool definition (Zod schema + description + optional execute) and the client-side handler dispatch, plus the server-vs-client execution split. Use when giving the AI a new capability, adding a tool to the chat agent, or editing chat/tool schemas, descriptions, or handlers.
---

# Adding an AI Chat Tool

ryOS chat tools follow the Vercel AI SDK tool-loop pattern. A tool is **defined on the server** (name + description + Zod `inputSchema`), and is either:

- **Server-executed** — has an `execute` fn that runs in `api/chat/tools/` (needs Redis, secrets, server fetch). Add the name to `SERVER_EXECUTED_TOOL_NAMES`.
- **Client-executed** — has **no** `execute`. The model emits a tool call, the browser runs a handler in `src/apps/chats/tools/`, and the result is sent back via `addToolOutput` (needs Zustand stores, IndexedDB, media/DOM APIs).

## File Map

| Concern | File |
|---------|------|
| Server: input schemas (Zod) | `api/chat/tools/schemas.ts` |
| Server: descriptions + tool object + profile filtering | `api/chat/tools/index.ts` (`TOOL_DESCRIPTIONS`, `createChatTools`) |
| Server: shared types/constants | `api/chat/tools/types.ts` |
| Server: `execute` logic | `api/chat/tools/executors.ts`, `app-state-executors.ts`, `maps-executor.ts` |
| Server/client: execution split source of truth | `src/shared/tools/serverExecuted.ts` |
| Client: per-tool handlers | `src/apps/chats/tools/<name>Handler.ts` |
| Client: handler types/registry | `src/apps/chats/tools/types.ts`, `index.ts` |
| Client: dispatch (`switch` on tool name) | `src/apps/chats/hooks/useAiChat.ts` |

## Decision: Server or Client?

| Needs… | Execution |
|--------|-----------|
| Redis, secrets, server-only fetch, SSRF-safe fetch | **Server** (`execute`) |
| Zustand store mutation, IndexedDB/VFS, media playback, app windows, DOM | **Client** (handler) |

Some tools run **both** ways (e.g. `stickiesControl`, `calendarControl`, `contactsControl`): client in web chat, server in the Telegram profile. In that case provide both a handler and an executor.

---

## A. Add the Schema (`api/chat/tools/schemas.ts`)

Schemas are Zod. Keep action-style tools as a discriminated/enum `action` plus optional params, and use `.superRefine` for cross-field rules so the model gets a clear error before the handler runs.

```typescript
export const myFeatureControlSchema = z.object({
  action: z.enum(["list", "create", "delete"]),
  id: z.string().optional(),
  content: z.string().optional(),
});
```

Add any shared enums/constants to `types.ts` and import them here (mirrors `CALENDAR_ACTIONS`, `TV_ACTIONS`, etc.).

## B. Define the Tool (`api/chat/tools/index.ts`)

1. Add a clear, behavior-specifying entry to `TOOL_DESCRIPTIONS` (the model relies heavily on this — describe each action, required params, and when NOT to use it).
2. Add the tool to the `allTools` object inside `createChatTools`.

Client-executed (no `execute`):

```typescript
myFeatureControl: {
  description: TOOL_DESCRIPTIONS.myFeatureControl,
  inputSchema: schemas.myFeatureControlSchema,
  // No execute — handled client-side (requires Zustand store access)
},
```

Server-executed:

```typescript
myFeatureControl: {
  description: TOOL_DESCRIPTIONS.myFeatureControl,
  inputSchema: schemas.myFeatureControlSchema,
  execute: async (input: MyFeatureControlInput) => executeMyFeatureControl(input, context),
},
```

If the tool should be available to the Telegram/memory profiles, also add it to the relevant branch in `createChatTools` (the `telegram` profile object or `MEMORY_TOOL_NAMES`). Tools default to the `"all"` profile.

## C. Mark Execution Side (`src/shared/tools/serverExecuted.ts`)

If (and only if) the tool is server-executed, add it to `TOOL_EXECUTION_METADATA` with `execution: "server"`. The client uses `SERVER_EXECUTED_TOOL_NAME_SET` to skip client dispatch for these (it returns early without running a handler).

```typescript
export const TOOL_EXECUTION_METADATA = [
  // ...
  { name: "myFeatureControl", execution: "server" },
] as const;
```

Client-executed tools do NOT go here.

---

## D. Client Handler (client-executed tools only)

Create `src/apps/chats/tools/myFeatureHandler.ts`. The handler reads/writes Zustand stores and reports a result through `context.addToolOutput`.

```typescript
import type { ToolContext } from "./types";
import { useMyFeatureStore } from "@/stores/useMyFeatureStore";
import { useAppStore } from "@/stores/useAppStore";
import i18n from "@/lib/i18n";

export interface MyFeatureControlInput {
  action: "list" | "create" | "delete";
  id?: string;
  content?: string;
}

export const handleMyFeatureControl = (
  input: MyFeatureControlInput,
  toolCallId: string,
  context: ToolContext
): void => {
  const store = useMyFeatureStore.getState();
  try {
    switch (input.action) {
      case "list": {
        context.addToolOutput({
          tool: "myFeatureControl",
          toolCallId,
          output: JSON.stringify(store.items, null, 2),
        });
        break;
      }
      // create / delete ...
      default:
        context.addToolOutput({
          tool: "myFeatureControl",
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.unknownError"),
        });
    }
  } catch (error) {
    context.addToolOutput({
      tool: "myFeatureControl",
      toolCallId,
      state: "output-error",
      errorText: error instanceof Error ? error.message : "error",
    });
  }
};
```

Handler conventions (match existing handlers like `stickiesHandler.ts`):

- Always emit exactly one `addToolOutput` per call — a success `output` string or an `{ state: "output-error", errorText }`.
- Localize user-facing strings via `i18n.t(...)` (`apps.chats.toolCalls.*`).
- Open the relevant app first when a mutation should surface it (`context.launchApp("myfeature")` / guard with `useAppStore.getState().getInstancesByAppId`).
- For list→mutate flows where the AI passes IDs back, use `createShortIdMap` / `resolveId` from `./helpers` to keep token usage low.

`ToolContext` provides `{ launchApp, addToolOutput, detectUserOS }`.

## E. Wire the Client Dispatch

1. In `src/apps/chats/tools/index.ts`, export the handler and its input type.
2. In `src/apps/chats/tools/dispatchToolCall.ts` (shared by the Chats app and the desktop assistant), add a `case` to the `switch (toolCall.toolName)`:

```typescript
case "myFeatureControl": {
  handleMyFeatureControl(
    toolCall.input as MyFeatureControlInput,
    toolCall.toolCallId,
    toolContext
  );
  result = ""; // handler already called addToolOutput
  break;
}
```

> Dispatch is an explicit `switch` — there is no handler registry. Add the `case`, otherwise the tool falls through to the `default` branch and reports "Unhandled tool". Set `result = ""` when the handler emits its own output (return a non-empty string only for trivial tools that don't call `addToolOutput`). VFS tools (`list`/`open`/`read`/`write`/`edit`) live in `vfsHandlers.ts` and receive a `VfsToolContext` with `saveFile` + `recordOpenedInstance`.

## F. Server Executor (server-executed / dual tools)

Add `executeMyFeatureControl(input, context)` to `executors.ts` (or `app-state-executors.ts` for app-state tools), export it from `api/chat/tools/index.ts`, and reference it in the tool's `execute`. The executor receives the server `context` (`MemoryToolContext`: logging, env, redis/auth helpers) and must return a JSON-serializable result.

For tools that return images to the model (like `infiniteMacControl`'s `readScreen`), add a `toModelOutput` that converts the result into multimodal content.

---

## Testing

- **Schema** (fast, no server): add a `tests/test-<feature>-schema.test.ts` that `safeParse`s valid and invalid inputs (see `tests/test-media-control-unified.test.ts`). Register it in `test:unit`. See the `write-tests` skill.
- **Server executor**: cover via the AI endpoint suite (`test:ai`) where applicable.
- **Client handler / end-to-end**: exercise in the Chats app by asking Ryo to use the capability and confirming the store/app updates and the tool result bubble.

## Checklist

```
- [ ] Schema in api/chat/tools/schemas.ts (+ shared enums in types.ts)
- [ ] Description in TOOL_DESCRIPTIONS + entry in createChatTools (right profile)
- [ ] If server-executed: add to TOOL_EXECUTION_METADATA (serverExecuted.ts) + write executor
- [ ] If client-executed: handler in src/apps/chats/tools/ + export + switch case in useAiChat.ts
- [ ] Localize tool-call strings (apps.chats.toolCalls.*)
- [ ] Schema unit test in tests/ (registered in test:unit)
```
