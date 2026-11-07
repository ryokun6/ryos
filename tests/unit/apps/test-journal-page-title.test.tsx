import { afterAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JournalPageTitle } from "../../../src/apps/journal/components/JournalPageTitle";

let registeredDomHere = false;
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});
if (typeof document === "undefined" || !GlobalRegistrator.isRegistered) {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register();
    registeredDomHere = true;
  }
}

describe("journal page title", () => {
  test("shows the date until a double click saves a new title", async () => {
    const saved: Array<{ id: string; title: string }> = [];
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);

    function render(title: string) {
      root.render(
        <JournalPageTitle
          pageId="2026-11-01"
          defaultTitle="Nov 1"
          title={title}
          onSave={(id, next) => saved.push({ id, title: next })}
        />
      );
    }

    await act(async () => {
      render("Nov 1");
    });
    const heading = container.querySelector("h2");
    expect(heading?.textContent).toBe("Nov 1");
    await act(async () => {
      heading?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const editor = container.querySelector("input");
    if (!(editor instanceof HTMLInputElement)) throw new Error("title editor missing");
    expect(editor.value).toBe("Nov 1");
    editor.value = "Taipei";
    await act(async () => {
      editor.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
      editor.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(saved).toEqual([{ id: "2026-11-01", title: "Taipei" }]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test("a blank title clears back to the date", async () => {
    const saved: string[] = [];
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(
        <JournalPageTitle
          pageId="2026-11-01"
          defaultTitle="Nov 1"
          title="Taipei"
          onSave={(_id, title) => saved.push(title)}
        />
      );
    });
    await act(async () => {
      container.querySelector("h2")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const editor = container.querySelector("input");
    if (!(editor instanceof HTMLInputElement)) throw new Error("title editor missing");
    editor.value = "   ";
    await act(async () => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      );
    });
    expect(saved).toEqual([""]);
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  if (registeredDomHere && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});
