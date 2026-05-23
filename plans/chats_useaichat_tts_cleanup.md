# Chats / useAiChat / TTS Cleanup Plan

Scope: the Chats app (`src/apps/chats/**`), the `useAiChat` hook (`src/apps/chats/hooks/useAiChat.ts`), and the TTS pipeline that powers @ryo speech and the (currently broken) "currently spoken" highlighting in chat bubbles.

The plan is organized in waves. Each wave is independently shippable and reduces blast radius — earlier waves are mostly mechanical, later waves carry more design.

---

## 0. Current State (diagnostic)

### Files involved

| File | Lines | Role |
|---|---|---|
| `src/apps/chats/hooks/useAiChat.ts` | 2,745 | Owns AI SDK wiring, system-state snapshot, tool dispatch, composer state, submit/auth, TTS + highlight, lifecycle |
| `src/apps/chats/components/ChatsAppComponent.tsx` | 952 | App shell — auth/dialogs/menubar/sidebar/routing/proactive greeting |
| `src/apps/chats/components/ChatMessages.tsx` | 1,438 | Message list, bubbles, manual speak button, streaming guard |
| `src/apps/chats/hooks/useRyoChat.ts` | 202 | @ryo mentions in rooms (POSTs `/api/ai/ryo-reply`) |
| `src/apps/chats/hooks/useChatRoom.ts` | ~728 | Pusher + room messages + send |
| `src/apps/chats/hooks/useProactiveGreeting.ts` | ~205 | Bypasses the SDK and writes directly into the store |
| `src/apps/chats/hooks/useTokenRefresh.ts` | 13 | Dead no-op stub |
| `src/apps/chats/tools/*` | — | Partial extraction of client tool handlers; registry exists but is not used |
| `src/apps/chats/utils/textForSpeech.ts` | 42 | `cleanTextForSpeech` (used) + `stripUrlsForSpeech` (dead) |
| `src/hooks/useTtsQueue.ts` | 414 | Streaming TTS queue. Only callback is per-chunk `onEnd` — no progress / segment events |
| `src/apps/textedit/extensions/SpeechHighlight.ts` + `SpeechManager.tsx` | — | Working reference pattern (ProseMirror decoration driven by `speak(text, onEnd)`) |
| `src/stores/useChatsStore.ts` | ~1,563 | Persisted AI + rooms store |

### Cross-app dependency

`src/apps/terminal/hooks/useTerminalLogic.ts` imports `useAiChat`. Any change to the hook's public surface needs to keep Terminal working.

### Why "TTS highlighting" is broken

There are three independent problems stacked on top of each other:

1. **Props dropped at the `ChatMessages` boundary.** `ChatsAppComponent.tsx` passes `highlightSegment` and `isSpeaking` into `<ChatMessages …>` (`ChatsAppComponent.tsx` L829–830). `ChatMessagesProps` declares them (`ChatMessages.tsx` L259–260). But the `ChatMessages` exported function destructures neither and never forwards them to `ChatMessagesContent` (`ChatMessages.tsx` L1387–1438). They die at the boundary.
2. **No consumer renders the segment.** Even if forwarded, nothing in `ChatMessageItem` or the Streamdown render path knows how to highlight `[start, end)` offsets. The only working highlight pattern in the codebase is TextEdit's ProseMirror decoration, which has nothing to do with Streamdown.
3. **Coordinate-system mismatch.** Highlight ranges in `useAiChat` (`useAiChat.ts` L726–730, L2243–2314) are character offsets into the **raw** concatenated text returned by `getAssistantVisibleText` (L587–597, joins all text parts with `""`). The UI renders **per text part** through Streamdown which strips/reformats markdown, so character offsets do not map to rendered DOM nodes. Speech itself uses **cleaned** text (`cleanTextForSpeech`) so the offsets used for highlighting don't even match what the user hears.
4. **Two `useTtsQueue` instances.** `useAiChat` has one (auto-streaming TTS, L752) and `ChatMessagesContent` has its own (manual per-message speak button, L1057). They race — the manual button can talk over auto-streaming and the two `isSpeaking` flags drift.

### Other dead / disconnected code surfaced during the audit

- `src/apps/chats/hooks/useTokenRefresh.ts` — only references are inside the file itself.
- `stripUrlsForSpeech` in `utils/textForSpeech.ts` — exported, never imported.
- `useRyoChat`'s embedded `useChat` and `ryoMessages` — destructured and returned but no UI consumes them. The actual @ryo-in-rooms reply path is the server endpoint `/api/ai/ryo-reply`.
- `executeToolHandler` registry in `src/apps/chats/tools/index.ts` — handlers are registered but `useAiChat` calls each handler directly. The indirection adds no value today.
- Duplicate fuzzy search: `useAiChat.ts` L141–293 and `tools/karaokeHandler.ts` L19–84+ (with a "should eventually be moved to helpers" comment).
- Two different `getSystemState` shapes: rich version in `useAiChat.ts` L332–576 vs the smaller legacy version in `useRyoChat.ts` L15–96.

---

## 1. Guiding Principles

- **One concern per hook.** `useAiChat` should orchestrate the AI SDK; tools, TTS, composer state, and system-state collection are separate hooks/modules.
- **Keep the public surface stable until the last wave.** Wave 1–3 are pure refactors with no behavior changes; wave 4 ships the highlight fix; wave 5 is the optional component split.
- **Speech is block-based, not offset-based.** Drop character offsets. Speak paragraph-by-paragraph and identify each spoken block with a stable ID that the renderer can match against.
- **One TTS queue per app.** Provide it via a small context so the auto path and manual speak button share state.
- **Tests follow each wave.** Most of this surface has zero unit coverage today — every wave should leave behind a thin regression test.

---

## 2. Waves

### Wave 1 — Dead-code removal (zero-risk)

Pure deletions / inlinings. Land in one PR.

1. Delete `src/apps/chats/hooks/useTokenRefresh.ts`. No callers in the repo.
2. Remove `stripUrlsForSpeech` from `src/apps/chats/utils/textForSpeech.ts`. Keep `cleanTextForSpeech`.
3. In `src/apps/chats/hooks/useRyoChat.ts`:
   - Remove the embedded `useChat`, the `ryoChatTransport` memo, and the exported `ryoMessages` / `stopRyo`.
   - The hook becomes a small utility around `handleRyoMention` + `detectAndProcessMention` (~50 lines).
   - Update `ChatsAppComponent.tsx` to stop reading `ryoMessages` / `stopRyo` (it never used them in the UI; `isRyoLoading` is still needed).
4. In `src/apps/chats/tools/index.ts`: either delete `executeToolHandler` and the `toolHandlers` registry **or** wire it up. Wave 1 deletes; Wave 3 reintroduces a real registry if needed.
5. Run `bun run lint` and `bun test tests/test-chat-tools-*.test.ts tests/test-chat-store-guards-wiring.test.ts`.

**Expected diff:** ~250 lines removed, no behavior change.

---

### Wave 2 — Extract shared utilities out of `useAiChat`

Pure relocations. No behavior change. Should produce a single PR that shrinks `useAiChat.ts` by ~1,000 lines without touching its observable behavior.

1. **`src/apps/chats/utils/fuzzySearch.ts`** — move `normalizeSearchText` / `computeMatchScore` and friends (`useAiChat.ts` L141–293). Re-export from `tools/karaokeHandler.ts` so the duplicate copy can be removed.
2. **`src/apps/chats/utils/systemState.ts`** — move `getSystemState` (`useAiChat.ts` L332–576) and the helper `getAssistantVisibleText` (L579–597). Make it accept a small dependency bag (stores, locale, time provider) rather than reaching into singletons directly so it's testable. Replace the smaller `getSystemState` in `useRyoChat.ts` with this canonical implementation (or document the intentional differences).
3. **`src/apps/chats/utils/detectUserOS.ts`** — move `detectUserOS` (L296–329).
4. **`src/apps/chats/utils/textEditInstanceTracking.ts`** — move `recentlyCreatedTextEditInstances` write→open race fallback (L96–138).
5. Add **`tests/test-chat-system-state.test.ts`** with cases for: running apps order, TextEdit / IE state collection, locale + timezone formatting, iPod / TV / karaoke snapshot shape. This catches future drift.
6. Add **`tests/test-fuzzy-search.test.ts`** to lock the matching algorithm.

**Outcome:** `useAiChat.ts` drops below ~1,800 lines. No app-visible change.

---

### Wave 3 — Split `useAiChat` into composable hooks

The hook still does at least five jobs. Break them out behind a thin `useAiChat` orchestrator that keeps today's return shape so `ChatsAppComponent.tsx` and `useTerminalLogic.ts` don't need to change.

Target shape:

```
useAiChat()                 // orchestrator (~200 lines)
├─ useChatComposer()        // reducer + input/image/clear/save dialog state
├─ useChatSubmit()          // handleSubmitMessage, handleDirectMessageSubmit, auth, rate limit
├─ useChatTools()           // onToolCall switch + registry
│   └─ tools/vfsHandlers.ts // list/open/read/write/edit (was L923–1855)
├─ useChatTts()             // streaming TTS + highlight queue (rewritten in Wave 4)
└─ useChatLifecycle()       // clear, save transcript, memory extraction, stop
```

Steps:

1. Extract **`useChatComposer`** from `useAiChat.ts` L624–665 + L2325–2491. Owns: `chatUiReducer`, input string, attached image, dialog open flags. Returns `{ state, dispatch, handleSubmitMessage, handleDirectMessageSubmit }`. The auth/rate-limit code stays in `useChatSubmit` (next step) — `useChatComposer` only owns local UI state.
2. Extract **`useChatSubmit`** owning the two `*Submit*` callbacks. De-duplicate the auth + rate-limit checks (today they're nearly identical at L2329–2345 and L2443–2459). One private helper `runAuthAndRateLimitGuards()` then two thin wrappers.
3. Extract **`useChatTools`** owning `onToolCall` plus the per-tool dispatch. Move the giant VFS cases (`list` / `open` / `read` / `write` / `edit`, L923–1855) to `src/apps/chats/tools/vfsHandlers.ts`. Each tool case becomes a function with signature `(args, ctx) => Promise<string>` where `ctx` carries the stores + helpers needed (`recentlyCreatedTextEditInstances`, `persistChatDocument`, etc.). The dispatcher becomes a small `switch` or a typed map.
4. Decide on the registry: either delete the `executeToolHandler` indirection (cleaner) or rebuild it as the only call path used by `useChatTools` (avoids drift between switch + registry). Recommendation: **delete**, use a typed `const handlers = { … } as const` map inside `useChatTools`.
5. Extract **`useChatLifecycle`** owning clear/save/stop and memory extraction (L2498–2703).
6. Keep **`useChatTts`** as a stub in this wave (still char-offset based). Wave 4 rewrites the internals.
7. The orchestrator `useAiChat` keeps today's return shape so `ChatsAppComponent` is unchanged. This is critical for the PR diff to stay reviewable.
8. Add a tiny smoke test asserting `useAiChat()`'s return keys (`messages`, `input`, `handleSubmit`, `isLoading`, `error`, `reload`, `stop`, …) using `@testing-library/react`'s `renderHook` — this prevents accidental shape drift while we refactor internals.

**Outcome:** `useAiChat.ts` becomes a ~250-line orchestrator; behavior identical.

---

### Wave 4 — Fix TTS highlighting (the broken thing)

This is the only wave that ships a real user-visible change. Two sub-options. Recommendation: **Option B**.

#### Option A — Minimal repair, keep char-offset model

1. Forward `highlightSegment` + `isSpeaking` through `ChatMessages` → `ChatMessagesContent` → `ChatMessageItem`.
2. Inside `ChatMessageItem`, render a single semi-transparent overlay span over the `[start, end)` range using a `<mark>`-wrapped node by post-processing the raw text **before** it's handed to Streamdown.
3. Cost: small diff, but it's still fragile — character offsets continue to mis-align with rendered markdown (e.g. when the text contains links, code, or list markers) and the highlight will jump or vanish on those spans.

Use only if Wave 4B has to slip.

#### Option B — Replace char-offsets with block-based highlighting (recommended)

Mirror the working TextEdit pattern but in markdown space.

1. **Speech chunks become "blocks".** In `useChatTts`:
   - Split assistant text into blocks on blank-line / paragraph boundaries (markdown semantics) instead of single newlines.
   - Each block gets a stable ID: `tts:${messageId}:${blockIndex}`.
   - Replace `highlightSegment: { messageId, start, end }` with `currentSpokenBlockId: string | null` (much smaller state, no offset bookkeeping).
2. **Unify the TTS queue via context.** Add `ChatTtsProvider` that owns a single `useTtsQueue` and exposes `{ speak, stop, isSpeaking, currentSpokenBlockId, enqueueBlock, manualSpeak }`. Both `useAiChat` (auto path) and `ChatMessageItem` (manual speak button) consume the context. Delete the second `useTtsQueue` in `ChatMessagesContent`.
3. **Renderer support.**
   - Pre-process each assistant message's markdown by splitting on blank-line boundaries; each block is rendered through a `<Speakable id="tts:…">` wrapper that adds `data-tts-block-id` on the outer element and applies a `.is-speaking` class when `currentSpokenBlockId` matches.
   - Add a `.is-speaking { background: rgba(255,221,0,0.45); border-radius: 4px; transition: background 120ms ease; }` rule to `chats-streamdown.css`.
   - For the streaming case (the last assistant message), only the most-recent complete block is "speakable"; the still-streaming tail block can be omitted from speech until the next blank line appears (current behavior).
4. **Wiring.**
   - `useChatTts` calls `speak(blockText, () => advanceTo(nextBlockId))`.
   - On `stop()` (assistant cancellation or user mute), clear `currentSpokenBlockId`.
   - When a new message starts streaming, reset `currentSpokenBlockId` to `null` so the previous highlight clears.
5. **Manual speak button.**
   - Move from the per-message text content to "speak this whole message starting at block 0".
   - Reuses the same `enqueueBlock` API → highlight works the same way for manual playback.
6. **`cleanTextForSpeech` integration.** Clean each block's text once at queue-time. The block ID is stable across raw + cleaned, so highlighting tracks the rendered raw block while the audio plays the cleaned variant — exactly what users want.
7. **Tests.**
   - `tests/test-chat-tts-blocks.test.ts` — splitting markdown into speakable blocks (edge cases: code fences, lists, tables, single-line answers, trailing whitespace).
   - `tests/test-chat-tts-highlight-wiring.test.ts` — render-hook test asserting `currentSpokenBlockId` flips through the queue as `onEnd` callbacks fire, and clears on `stop()`.
   - Manual verification in the cloud agent (since highlighting is visual): one screenshot of an assistant reply with a block highlighted, captured via the screenshot helpers — not a video unless the user asks.

**Outcome:** Chat bubble highlights the paragraph that's currently being read aloud; manual speak button uses the same UI; one TTS queue.

---

### Wave 5 — `ChatsAppComponent` + `ChatMessages` slimming (optional / nice-to-have)

Lower priority. Land only after Wave 4 ships.

1. Extract **`MobileChatSidebarOverlay`** from `ChatsAppComponent.tsx` L619–691.
2. Extract **`ChatTitleBar`** from L714–799.
3. Extract **`useChatsSubmitRouter`** to consolidate the AI vs room vs @ryo branching in `handleSubmit` (L276–337).
4. Memoize the `<ChatsDialogs>` prop bundle (L893–948) or shape it into a single `dialogs` object so the dialog component can take one prop.
5. In `ChatMessages.tsx`: split `ChatMessageItem` into `AssistantMessageBody` (Streamdown + tool parts + speak control + highlight wrapper) and `RoomHumanMessage`. Both stay memoized.
6. Investigate `react-virtuoso` for the message list. Today only `messageRenderLimit` (50) prevents unbounded growth; virtualization would let us raise the cap and improve scrolling on long threads.
7. Stop selecting the entire `aiMessages` array in both `useAiChat` and `ChatsAppComponent`. Use length + last-message selectors where possible to cut re-renders.

---

## 3. Sequencing and Risk

| Wave | Risk | Reviewability | Ship order |
|---|---|---|---|
| 1 — Dead code | None | Trivial diff | First |
| 2 — Utility extraction | Low (mechanical) | Easy if file-by-file | Second |
| 3 — Hook split | Medium (preserve return shape) | Needs the smoke test from step 8 | Third |
| 4 — TTS highlight rewrite | Medium (new user-visible behavior) | Needs block-splitter tests + manual screenshot | Fourth |
| 5 — Component split / virtualization | Low–medium | Independent of above | Optional follow-up |

**Hard constraint:** Waves 1–3 must not change `useAiChat`'s return shape (Terminal depends on it via `useTerminalLogic.ts`). Add a regression test for the return shape in Wave 3 and keep it green through Wave 4.

**Cross-app constraint:** Verify Terminal still works after Wave 3 — quick `bun test` + manual sanity run of the Terminal `chat` command.

---

## 4. Test Coverage Gaps to Backfill

The audit found zero direct coverage for the surfaces we're touching. Add these as we go:

- `tests/test-chat-system-state.test.ts` — Wave 2.
- `tests/test-fuzzy-search.test.ts` — Wave 2.
- `tests/test-use-ai-chat-shape.test.ts` — Wave 3 (return-shape smoke test).
- `tests/test-chat-tools-vfs.test.ts` — Wave 3 (list / open / read / write / edit handlers in isolation).
- `tests/test-chat-tts-blocks.test.ts` — Wave 4 (block splitter).
- `tests/test-chat-tts-highlight-wiring.test.ts` — Wave 4 (queue → `currentSpokenBlockId`).
- `tests/test-chat-message-render.test.ts` — Wave 5 (only if components are split).

All of these are unit/wiring tests — runnable without the API server (`bun run test:unit`).

---

## 5. Open Questions

1. **Block boundary for speech.** Paragraphs (blank line) feel right for English replies. For long Chinese / Japanese replies that don't use blank lines we may want to also split on sentence terminators (`。！？`). Decide in Wave 4 implementation by skimming a few real assistant replies.
2. **Speak-button behavior change.** Today the manual speak button reads the whole message as one chunk. Switching to block-based means it produces multiple TTS requests. Is the latency acceptable? Likely yes — `useTtsQueue` already streams chunks back-to-back.
3. **Highlight color across themes.** Yellow works in System 7 / Aqua / XP / Win98 differently. Pick a per-theme accent via the existing theme system (`src/themes/*`).
4. **`useProactiveGreeting` writing directly to the store.** This bypasses the SDK and forces a sync effect inside `useAiChat` (L2224–2238). Worth revisiting after Wave 3 — likely a small follow-up to route greetings through the same path.
5. **Server-tool stubs in client switch.** Wave 3 should fold them into a `SERVER_SIDE_TOOLS` set early-return rather than empty cases.

---

## 6. What we are NOT doing in this plan

- Touching `useChatRoom` / Pusher beyond removing the dead `ryoMessages` from `useRyoChat`.
- Restructuring `useChatsStore` — the store's size deserves its own audit later.
- Server-side tool changes in `api/chat/tools/*` — out of scope.
- Migrating off Streamdown / the AI SDK — out of scope.
- Visual redesign of message bubbles beyond adding the highlight CSS.

---

## 7. Suggested PR breakdown

1. `chore(chats): remove dead code` — Wave 1.
2. `refactor(chats): extract systemState + fuzzy search + helpers from useAiChat` — Wave 2.
3. `refactor(chats): split useAiChat into composer/submit/tools/tts/lifecycle` — Wave 3.
4. `fix(chats): block-based TTS highlighting in chat bubbles` — Wave 4 (the user-visible win).
5. `refactor(chats): slim ChatsAppComponent + ChatMessages` — Wave 5 (optional).
