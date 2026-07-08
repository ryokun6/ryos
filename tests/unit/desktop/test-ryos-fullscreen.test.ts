#!/usr/bin/env bun

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { ensureTestLocalStorage } from "../../setup";

// These helpers operate on the real DOM (document.getElementById,
// document.documentElement, document.fullscreenElement). Bun has no DOM by
// default, so register happy-dom for this suite — otherwise every test would
// silently no-op. See the previous `typeof document === "undefined"` guards.
beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
  }
});

afterAll(() => {
  if (GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
  ensureTestLocalStorage();
});

import {
  RYOS_FULLSCREEN_ROOT_ID,
  getRyosFullscreenElement,
  getRyosFullscreenRoot,
  isRyosFullscreenActive,
  isRyosFullscreenSupported,
} from "../../../src/utils/ryosFullscreen";

describe("ryosFullscreen", () => {
  let root: HTMLDivElement | null = null;

  beforeEach(() => {
    root = document.createElement("div");
    root.id = RYOS_FULLSCREEN_ROOT_ID;
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (root) {
      root.remove();
      root = null;
    }
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
  });

  test("getRyosFullscreenRoot returns the React shell root", () => {
    expect(getRyosFullscreenRoot()).toBe(root);
  });

  test("getRyosFullscreenElement returns documentElement", () => {
    expect(getRyosFullscreenElement()).toBe(document.documentElement);
  });

  test("isRyosFullscreenActive is false when another element is fullscreen", () => {
    const other = document.createElement("div");
    document.body.appendChild(other);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => other,
    });
    expect(isRyosFullscreenActive()).toBe(false);
    other.remove();
  });

  test("isRyosFullscreenActive is true when documentElement is fullscreen", () => {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.documentElement,
    });
    expect(isRyosFullscreenActive()).toBe(true);
  });

  test("isRyosFullscreenSupported requires fullscreenEnabled and requestFullscreen on html", () => {
    const originalEnabled = document.fullscreenEnabled;
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: true,
    });
    document.documentElement.requestFullscreen = async () => {};
    document.exitFullscreen = async () => {};
    expect(isRyosFullscreenSupported()).toBe(true);
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: originalEnabled,
    });
  });
});
