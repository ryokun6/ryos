import { describe, expect, test, mock } from "bun:test";
import { createChatTools } from "../api/chat/tools/index.js";

const context = {
  log: mock(() => {}),
  logError: mock(() => {}),
  env: {},
  username: "ryo",
  timeZone: "America/Los_Angeles",
};

describe("contacts tool registration", () => {
  test("chat profile exposes contactsControl for client handling", () => {
    const tools = createChatTools(context, { profile: "all" });
    expect("contactsControl" in tools).toBe(true);
    expect(typeof tools.contactsControl.execute).toBe("undefined");
  });

  test("telegram profile exposes server-executed contactsControl", () => {
    const tools = createChatTools(context, { profile: "telegram" });
    expect("contactsControl" in tools).toBe(true);
    expect(typeof tools.contactsControl.execute).toBe("function");
  });
});
