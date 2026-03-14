import { describe, expect, test } from "bun:test";
import {
  persistChatApplet,
  persistChatDocument,
  type SaveFileHandler,
} from "../src/apps/chats/utils/chatFilePersistence";

describe("chat file persistence helpers", () => {
  test("persists chat documents through saveFile", async () => {
    const calls: Parameters<SaveFileHandler>[0][] = [];
    const saveFile: SaveFileHandler = async (file) => {
      calls.push(file);
    };

    await persistChatDocument({
      saveFile,
      path: "/Documents/notes.md",
      fileName: "notes.md",
      content: "# Hello",
    });

    expect(calls).toEqual([
      {
        name: "notes.md",
        path: "/Documents/notes.md",
        content: "# Hello",
        type: "markdown",
        icon: "📄",
      },
    ]);
  });

  test("persists chat applets through saveFile with metadata", async () => {
    const calls: Parameters<SaveFileHandler>[0][] = [];
    const saveFile: SaveFileHandler = async (file) => {
      calls.push(file);
    };

    await persistChatApplet({
      saveFile,
      fileItem: {
        path: "/Applets/demo.app",
        name: "demo.app",
        icon: "🧪",
        shareId: "share-123",
        createdBy: "ryo",
      },
      content: "<html></html>",
    });

    expect(calls).toEqual([
      {
        name: "demo.app",
        path: "/Applets/demo.app",
        content: "<html></html>",
        type: "html",
        icon: "🧪",
        shareId: "share-123",
        createdBy: "ryo",
      },
    ]);
  });
});
