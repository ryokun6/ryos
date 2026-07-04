import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_ASSISTANT_CHARACTER_ID,
  getAssistantCharacter,
} from "../src/components/assistant/characters";
import { STORAGE_KEYS } from "../src/utils/storageKeys";
import { useAssistantStore } from "../src/stores/useAssistantStore";

describe("assistant store defaults", () => {
  beforeEach(() => {
    localStorage.clear();
    useAssistantStore.setState({
      enabled: true,
      characterId: DEFAULT_ASSISTANT_CHARACTER_ID,
      position: null,
      messages: [],
      lastInteractionAt: null,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("defaults the desktop assistant to enabled with Rover selected", () => {
    expect(DEFAULT_ASSISTANT_CHARACTER_ID).toBe("rover");
    expect(useAssistantStore.getState().enabled).toBe(true);
    expect(useAssistantStore.getState().characterId).toBe("rover");
  });

  test("falls back unknown character ids to Rover", () => {
    expect(getAssistantCharacter("missing").id).toBe("rover");
    expect(getAssistantCharacter(undefined).id).toBe("rover");
  });

  test("rehydrates explicit stored preferences without overwriting them", async () => {
    localStorage.setItem(
      STORAGE_KEYS.assistant,
      JSON.stringify({
        state: {
          enabled: false,
          characterId: "clippy",
          position: { x: 12, y: 34 },
          messages: [],
          lastInteractionAt: 1_700_000_000_000,
        },
        version: 1,
      })
    );

    await useAssistantStore.persist.rehydrate();

    const state = useAssistantStore.getState();
    expect(state.enabled).toBe(false);
    expect(state.characterId).toBe("clippy");
    expect(state.position).toEqual({ x: 12, y: 34 });
    expect(state.lastInteractionAt).toBe(1_700_000_000_000);
  });
});
