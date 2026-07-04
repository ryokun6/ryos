#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import type { AppId } from "../src/config/appRegistry";
import type { AppInstance } from "../src/stores/useAppStore";
import { computeDockOpenItems } from "../src/components/layout/dock/dockOpenList";
import { computeDockPinnedItems } from "../src/components/layout/dock/dockPinnedList";

// Apps the fake registry knows about for these tests.
const KNOWN_APPS = new Set<string>([
  "finder",
  "chats",
  "textedit",
  "applet-viewer",
]);
const isValidAppId = (appId: AppId) => KNOWN_APPS.has(appId);

function makeInstance(overrides: Partial<AppInstance>): AppInstance {
  return {
    instanceId: overrides.instanceId ?? "i-default",
    appId: (overrides.appId ?? "chats") as AppId,
    isOpen: overrides.isOpen ?? true,
    createdAt: overrides.createdAt ?? 0,
    ...overrides,
  } as AppInstance;
}

function toRecord(instances: AppInstance[]): Record<string, AppInstance> {
  return Object.fromEntries(instances.map((i) => [i.instanceId, i]));
}

describe("computeDockOpenItems", () => {
  test("returns one entry per open app, sorted by createdAt", () => {
    const instances = toRecord([
      makeInstance({ instanceId: "a", appId: "textedit", createdAt: 200 }),
      makeInstance({ instanceId: "b", appId: "chats", createdAt: 100 }),
    ]);

    const result = computeDockOpenItems(instances, [], isValidAppId);

    expect(result.map((i) => i.appId)).toEqual(["chats", "textedit"]);
    expect(result.every((i) => i.type === "app")).toBe(true);
  });

  test("excludes closed instances", () => {
    const instances = toRecord([
      makeInstance({ instanceId: "a", appId: "chats", isOpen: false }),
    ]);

    expect(computeDockOpenItems(instances, [], isValidAppId)).toEqual([]);
  });

  test("excludes pinned apps so they are not duplicated", () => {
    const instances = toRecord([
      makeInstance({ instanceId: "a", appId: "chats", createdAt: 1 }),
      makeInstance({ instanceId: "b", appId: "textedit", createdAt: 2 }),
    ]);

    const result = computeDockOpenItems(
      instances,
      ["chats" as AppId],
      isValidAppId
    );

    expect(result.map((i) => i.appId)).toEqual(["textedit"]);
  });

  test("accepts pinned ids as a Set", () => {
    const instances = toRecord([
      makeInstance({ instanceId: "a", appId: "chats", createdAt: 1 }),
    ]);

    const result = computeDockOpenItems(
      instances,
      new Set<AppId>(["chats" as AppId]),
      isValidAppId
    );

    expect(result).toEqual([]);
  });

  test("emits one entry per applet-viewer instance", () => {
    const instances = toRecord([
      makeInstance({
        instanceId: "applet-1",
        appId: "applet-viewer",
        createdAt: 10,
      }),
      makeInstance({
        instanceId: "applet-2",
        appId: "applet-viewer",
        createdAt: 20,
      }),
    ]);

    const result = computeDockOpenItems(instances, [], isValidAppId);

    expect(result).toHaveLength(2);
    expect(result.every((i) => i.type === "applet")).toBe(true);
    expect(result.map((i) => i.instanceId)).toEqual(["applet-1", "applet-2"]);
  });

  // Regression: stale/unknown app ids (e.g. from old localStorage or cloud
  // sync) must not become a dock slot — they previously threw in
  // getAppIconPath / rendered an empty slot.
  test("drops open instances whose app id is unknown (no empty slot)", () => {
    const instances = toRecord([
      makeInstance({ instanceId: "a", appId: "chats", createdAt: 1 }),
      makeInstance({
        instanceId: "ghost",
        appId: "removed-legacy-app" as AppId,
        createdAt: 2,
      }),
    ]);

    const result = computeDockOpenItems(instances, [], isValidAppId);

    expect(result.map((i) => i.appId)).toEqual(["chats"]);
  });

  // Accessory apps (hideFromDock in the registry, e.g. Assistant) never get a
  // running-apps dock slot even while their window is open.
  test("drops open instances of hideFromDock accessory apps", () => {
    const instances = toRecord([
      makeInstance({ instanceId: "a", appId: "chats", createdAt: 1 }),
      makeInstance({
        instanceId: "helper",
        appId: "assistant" as AppId,
        createdAt: 2,
      }),
    ]);

    const result = computeDockOpenItems(instances, [], (appId) =>
      KNOWN_APPS.has(appId) || appId === "assistant"
    );

    expect(result.map((i) => i.appId)).toEqual(["chats"]);
  });

  // Regression: an applet entry with no instanceId can't be matched to a live
  // window, so it must be skipped rather than render an empty slot.
  test("drops applet instances missing an instanceId", () => {
    const instances: Record<string, AppInstance> = {
      bad: makeInstance({
        instanceId: "" as string,
        appId: "applet-viewer",
        createdAt: 1,
      }),
    };

    expect(computeDockOpenItems(instances, [], isValidAppId)).toEqual([]);
  });
});

describe("computeDockPinnedItems", () => {
  test("drops pinned app ids that are unknown", () => {
    const result = computeDockPinnedItems([
      { type: "app", id: "finder" },
      { type: "app", id: "removed-legacy-app" },
      { type: "file", id: "custom-applet", path: "/Desktop/Custom.app" },
    ]);

    expect(result).toEqual([
      { type: "app", id: "finder" },
      { type: "file", id: "custom-applet", path: "/Desktop/Custom.app" },
    ]);
  });

  test("drops removed infinite-pc app id pins", () => {
    const result = computeDockPinnedItems([
      { type: "app", id: "infinite-pc" },
    ]);

    expect(result).toEqual([]);
  });

  test("keeps pc pins without infinite-pc alias normalization", () => {
    const result = computeDockPinnedItems([
      { type: "app", id: "infinite-pc" },
      { type: "app", id: "pc" },
    ]);

    expect(result).toEqual([{ type: "app", id: "pc" }]);
  });
});
