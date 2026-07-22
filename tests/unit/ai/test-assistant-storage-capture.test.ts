import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  ensureTestLocalStorage,
  installTestLocalStorage,
  MemoryStorage,
} from "../../setup";

describe("assistant store live localStorage", () => {
  beforeAll(() => {
    if (!GlobalRegistrator.isRegistered) {
      GlobalRegistrator.register();
    }
  });

  afterAll(() => {
    if (GlobalRegistrator.isRegistered) {
      GlobalRegistrator.unregister();
    }
    ensureTestLocalStorage();
  });

  test("rehydrates seeds written after happy-dom replaces localStorage", async () => {
    // Import while happy-dom owns localStorage — the historical bug was that
    // createJSONStorage eagerly captured that Storage object.
    const { useAssistantStore } = await import(
      "../../../src/stores/useAssistantStore"
    );
    const { STORAGE_KEYS } = await import("../../../src/utils/storageKeys");

    GlobalRegistrator.unregister();
    const mem = installTestLocalStorage(new MemoryStorage());

    mem.setItem(
      STORAGE_KEYS.assistant,
      JSON.stringify({
        state: {
          enabled: false,
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

    expect(useAssistantStore.getState().enabled).toBe(false);
    expect(useAssistantStore.getState().characterId).toBe("clippy");
    expect(useAssistantStore.getState().bubbleDismissedAt).toBe(
      1_700_000_100_000
    );
  });
});
