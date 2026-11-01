#!/usr/bin/env bun

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTextEditState } from "../../../src/apps/textedit/hooks/useTextEditState";
import { useTextEditStore } from "../../../src/stores/useTextEditStore";
import { settleAllPersistWrites } from "../../../src/utils/persistWriteQueue";

const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  "IS_REACT_ACT_ENVIRONMENT"
);
let registeredDomHere = false;

if (typeof document === "undefined" || !GlobalRegistrator.isRegistered) {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register();
    registeredDomHere = true;
  }
}

const draft = {
  type: "doc" as const,
  content: [
    {
      type: "paragraph" as const,
      content: [{ type: "text" as const, text: "Do not lose me" }],
    },
  ],
};

function Probe({ instanceId }: { instanceId: string }) {
  useTextEditState({ instanceId });
  return null;
}

async function renderProbe(instanceId: string): Promise<Root> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Probe, { instanceId }));
  });
  roots.push(root);
  return root;
}

async function unmountProbe(root: Root): Promise<void> {
  await act(async () => {
    root.unmount();
  });
  const index = roots.indexOf(root);
  if (index >= 0) roots.splice(index, 1);
}

const roots: Root[] = [];

beforeAll(async () => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
  await useTextEditStore.persist.rehydrate();
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount();
  });
  roots.length = 0;
  useTextEditStore.setState({ instances: {} });
  document.body.replaceChildren();
  await settleAllPersistWrites();
});

afterAll(() => {
  if (originalActEnvironment) {
    Object.defineProperty(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
      originalActEnvironment
    );
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
  if (registeredDomHere && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

describe("TextEdit instance lifecycle", () => {
  test("remounting keeps a restored saved file and its unsaved sibling", async () => {
    useTextEditStore.setState({
      instances: {
        saved: {
          instanceId: "saved",
          filePath: "/Documents/Notes.md",
          contentJson: null,
          hasUnsavedChanges: false,
        },
        draft: {
          instanceId: "draft",
          filePath: null,
          contentJson: draft,
          hasUnsavedChanges: true,
        },
      },
    });

    const savedRoot = await renderProbe("saved");
    const draftRoot = await renderProbe("draft");

    await unmountProbe(savedRoot);
    await unmountProbe(draftRoot);

    const instances = useTextEditStore.getState().instances;
    expect(instances.saved?.filePath).toBe("/Documents/Notes.md");
    expect(instances.saved?.contentJson).toBeNull();
    expect(instances.draft?.contentJson).toEqual(draft);
    expect(instances.draft?.hasUnsavedChanges).toBe(true);

    await renderProbe("saved");
    await renderProbe("draft");

    expect(useTextEditStore.getState().instances.saved?.filePath).toBe(
      "/Documents/Notes.md"
    );
    expect(useTextEditStore.getState().instances.draft?.filePath).toBeNull();
    expect(useTextEditStore.getState().instances.draft?.contentJson).toEqual(
      draft
    );
  });

  test("closing one window removes only that document", async () => {
    useTextEditStore.setState({
      instances: {
        saved: {
          instanceId: "saved",
          filePath: "/Documents/Notes.md",
          contentJson: null,
          hasUnsavedChanges: false,
        },
        other: {
          instanceId: "other",
          filePath: "/Documents/Letter.md",
          contentJson: null,
          hasUnsavedChanges: false,
        },
      },
    });

    await renderProbe("saved");
    await renderProbe("other");

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("instanceStateChange", {
          detail: { instanceId: "saved", isOpen: false },
        })
      );
    });

    const instances = useTextEditStore.getState().instances;
    expect(instances.saved).toBeUndefined();
    expect(instances.other?.filePath).toBe("/Documents/Letter.md");
  });

  test("minimizing a window keeps the document", async () => {
    useTextEditStore.setState({
      instances: {
        saved: {
          instanceId: "saved",
          filePath: "/Documents/Notes.md",
          contentJson: null,
          hasUnsavedChanges: false,
        },
      },
    });

    await renderProbe("saved");

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("instanceStateChange", {
          detail: { instanceId: "saved", isOpen: true, isMinimized: true },
        })
      );
    });

    expect(useTextEditStore.getState().instances.saved?.filePath).toBe(
      "/Documents/Notes.md"
    );
  });
});
