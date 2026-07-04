import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

let registeredDomForSuite = false;
if (typeof document === "undefined") {
  GlobalRegistrator.register();
  registeredDomForSuite = true;
}

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AIChatMessage } from "../src/types/chat";
import { useAssistantStore } from "../src/stores/useAssistantStore";
import {
  ASSISTANT_DISMISS_DONE_MS,
  useAssistantChat,
  type AssistantChatHandle,
} from "../src/components/assistant/useAssistantChat";
import { DEFAULT_ASSISTANT_CHARACTER_ID } from "../src/components/assistant/characters";

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let handle: AssistantChatHandle | null = null;

function ChatProbe() {
  handle = useAssistantChat();
  return null;
}

function makeMessage(role: "user" | "assistant", text: string): AIChatMessage {
  return {
    id: `${role}-${text}`,
    role,
    parts: [{ type: "text", text }],
    metadata: { createdAt: new Date() },
  } as AIChatMessage;
}

async function mountProbe() {
  await act(async () => {
    root?.render(<ChatProbe />);
  });
}

beforeAll(() => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });
});

beforeEach(() => {
  localStorage.clear();
  useAssistantStore.setState({
    enabled: true,
    characterId: DEFAULT_ASSISTANT_CHARACTER_ID,
    position: null,
    messages: [],
    lastInteractionAt: null,
    bubbleDismissedAt: null,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  host?.remove();
  host = null;
  handle = null;
  localStorage.clear();
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

// Anonymous (no username / not authenticated in useChatsStore) exercises the
// canned-greeting path with no network calls.
describe("useAssistantChat greeting wiring (anonymous)", () => {
  test("greets a brand-new conversation with a canned message", async () => {
    await mountProbe();

    act(() => handle!.greetIfStale());

    const stored = useAssistantStore.getState().messages;
    expect(stored.length).toBe(1);
    expect(stored[0].role).toBe("assistant");
    expect(stored[0].id).toStartWith("assistant-local-greeting-");
    expect(handle!.messages.length).toBe(1);
  });

  test("keeps a recent conversation on reopen within five minutes", async () => {
    const existing = [
      makeMessage("user", "hi"),
      makeMessage("assistant", "hello!"),
    ];
    useAssistantStore.setState({
      messages: existing,
      lastInteractionAt: Date.now() - 60_000,
      bubbleDismissedAt: Date.now() - 30_000,
    });
    await mountProbe();

    act(() => handle!.greetIfStale());

    const state = useAssistantStore.getState();
    expect(state.messages.map((msg) => msg.id)).toEqual(
      existing.map((msg) => msg.id)
    );
    // The dismissal marker is consumed by the reopen.
    expect(state.bubbleDismissedAt).toBeNull();
  });

  test("clears the chat and re-greets after a five-minute dismissal", async () => {
    const existing = [
      makeMessage("user", "hi"),
      makeMessage("assistant", "hello!"),
    ];
    useAssistantStore.setState({
      messages: existing,
      lastInteractionAt: Date.now() - 60_000,
      bubbleDismissedAt: Date.now() - ASSISTANT_DISMISS_DONE_MS - 1_000,
    });
    await mountProbe();

    act(() => handle!.greetIfStale());

    const state = useAssistantStore.getState();
    expect(state.messages.length).toBe(1);
    expect(state.messages[0].role).toBe("assistant");
    expect(state.messages[0].id).toStartWith("assistant-local-greeting-");
    expect(state.bubbleDismissedAt).toBeNull();
  });
});
