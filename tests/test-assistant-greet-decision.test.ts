import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  ASSISTANT_DISMISS_DONE_MS,
  getAssistantGreetDecision,
} from "../src/components/assistant/useAssistantChat";
import { DEFAULT_ASSISTANT_CHARACTER_ID } from "../src/components/assistant/characters";
import { STORAGE_KEYS } from "../src/utils/storageKeys";
import { useAssistantStore } from "../src/stores/useAssistantStore";

const NOW = 1_700_000_000_000;
const RECENT = NOW - 60_000; // 1 minute ago
const STALE = NOW - 7 * 60 * 60 * 1000; // 7 hours ago (> 6h staleness)

describe("getAssistantGreetDecision", () => {
  test("keeps a recent conversation when the bubble was never dismissed", () => {
    expect(
      getAssistantGreetDecision({
        bubbleDismissedAt: null,
        lastInteractionAt: RECENT,
        hasAssistantReply: true,
        now: NOW,
      })
    ).toBe("none");
  });

  test("keeps a recent conversation when redismissed under five minutes ago", () => {
    expect(
      getAssistantGreetDecision({
        bubbleDismissedAt: NOW - ASSISTANT_DISMISS_DONE_MS + 1,
        lastInteractionAt: RECENT,
        hasAssistantReply: true,
        now: NOW,
      })
    ).toBe("none");
  });

  test("starts fresh once the bubble stayed dismissed for five minutes", () => {
    expect(
      getAssistantGreetDecision({
        bubbleDismissedAt: NOW - ASSISTANT_DISMISS_DONE_MS,
        lastInteractionAt: RECENT,
        hasAssistantReply: true,
        now: NOW,
      })
    ).toBe("fresh-greet");
  });

  test("starts fresh even without prior replies or interactions", () => {
    expect(
      getAssistantGreetDecision({
        bubbleDismissedAt: NOW - ASSISTANT_DISMISS_DONE_MS - 1,
        lastInteractionAt: null,
        hasAssistantReply: false,
        now: NOW,
      })
    ).toBe("fresh-greet");
  });

  test("greets on the existing thread when there is no assistant reply yet", () => {
    expect(
      getAssistantGreetDecision({
        bubbleDismissedAt: null,
        lastInteractionAt: RECENT,
        hasAssistantReply: false,
        now: NOW,
      })
    ).toBe("greet");
  });

  test("greets on the existing thread when the last exchange is stale", () => {
    expect(
      getAssistantGreetDecision({
        bubbleDismissedAt: null,
        lastInteractionAt: STALE,
        hasAssistantReply: true,
        now: NOW,
      })
    ).toBe("greet");
  });

  test("greets when there was never an interaction", () => {
    expect(
      getAssistantGreetDecision({
        bubbleDismissedAt: null,
        lastInteractionAt: null,
        hasAssistantReply: true,
        now: NOW,
      })
    ).toBe("greet");
  });
});

describe("assistant store bubble dismissal", () => {
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
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("markBubbleDismissed stamps now, clearBubbleDismissed resets", () => {
    const before = Date.now();
    useAssistantStore.getState().markBubbleDismissed();
    const dismissedAt = useAssistantStore.getState().bubbleDismissedAt;
    expect(dismissedAt).not.toBeNull();
    expect(dismissedAt!).toBeGreaterThanOrEqual(before);
    expect(dismissedAt!).toBeLessThanOrEqual(Date.now());

    useAssistantStore.getState().clearBubbleDismissed();
    expect(useAssistantStore.getState().bubbleDismissedAt).toBeNull();
  });

  test("clearMessages resets the dismissal marker too", () => {
    useAssistantStore.getState().markBubbleDismissed();
    useAssistantStore.getState().clearMessages();
    const state = useAssistantStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.lastInteractionAt).toBeNull();
    expect(state.bubbleDismissedAt).toBeNull();
  });

  test("persists and rehydrates bubbleDismissedAt", async () => {
    localStorage.setItem(
      STORAGE_KEYS.assistant,
      JSON.stringify({
        state: {
          enabled: true,
          characterId: "clippy",
          position: null,
          messages: [],
          lastInteractionAt: 1_700_000_000_000,
          bubbleDismissedAt: 1_700_000_100_000,
        },
        version: 1,
      })
    );

    await useAssistantStore.persist.rehydrate();

    expect(useAssistantStore.getState().bubbleDismissedAt).toBe(
      1_700_000_100_000
    );
  });
});
