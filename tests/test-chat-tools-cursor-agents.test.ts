import { describe, expect, test, mock } from "bun:test";
import { createChatTools } from "../api/chat/tools/index.js";

const context = {
  log: mock(() => {}),
  logError: mock(() => {}),
  env: {},
  username: "ryo",
  timeZone: "America/Los_Angeles",
};

describe("cursor agents tool registration", () => {
  test("chat profile exposes server-executed cursorAgentsControl", () => {
    const tools = createChatTools(context, { profile: "all" });
    expect("cursorAgentsControl" in tools).toBe(true);
    expect(typeof tools.cursorAgentsControl.execute).toBe("function");
  });

  test("telegram profile exposes server-executed cursorAgentsControl", () => {
    const tools = createChatTools(context, { profile: "telegram" });
    expect("cursorAgentsControl" in tools).toBe(true);
    expect(typeof tools.cursorAgentsControl.execute).toBe("function");
  });
});
