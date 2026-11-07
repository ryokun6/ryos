import { afterAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { stripHtmlToText } from "../../../api/chat/tools/htmlExtract";
import {
  installHappyDom,
  uninstallHappyDom,
} from "../../helpers/register-happy-dom";

const installedHappyDom = installHappyDom();

const LINK_HTML = `<p>Visit <a href="https://example.com">Example</a> for more</p>`;

describe("happy-dom registry cleanup", () => {
  test("keeps happy-dom installed for this file and releases it afterward", async () => {
    expect(GlobalRegistrator.isRegistered).toBe(true);
    expect(stripHtmlToText(LINK_HTML)).toContain("[Example](https://example.com/)");

    await GlobalRegistrator.unregister();

    const restored = stripHtmlToText(LINK_HTML);
    expect(restored).toContain("[Example](https://example.com)");
    expect(restored).not.toContain("https://example.com/");

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "2",
      },
      body: "{}",
    });
    expect(request.headers.get("content-length")).toBe("2");
    expect(GlobalRegistrator.isRegistered).toBe(false);
  });
});

afterAll(async () => {
  await uninstallHappyDom(installedHappyDom);
});
