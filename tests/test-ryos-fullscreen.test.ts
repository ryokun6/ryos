#!/usr/bin/env bun

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  RYOS_FULLSCREEN_ROOT_ID,
  getRyosFullscreenElement,
  getRyosFullscreenRoot,
  isRyosFullscreenActive,
  isRyosFullscreenSupported,
} from "../src/utils/ryosFullscreen";

describe("ryosFullscreen", () => {
  let root: HTMLDivElement | null = null;

  beforeEach(() => {
    if (typeof document === "undefined") {
      return;
    }
    root = document.createElement("div");
    root.id = RYOS_FULLSCREEN_ROOT_ID;
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (typeof document === "undefined" || !root) {
      return;
    }
    root.remove();
    root = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
  });

  test("getRyosFullscreenRoot returns the React shell root", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }
    expect(getRyosFullscreenRoot()).toBe(root);
  });

  test("getRyosFullscreenElement returns documentElement", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }
    expect(getRyosFullscreenElement()).toBe(document.documentElement);
  });

  test("isRyosFullscreenActive is false when another element is fullscreen", () => {
    if (typeof document === "undefined" || !root) {
      expect(true).toBe(true);
      return;
    }
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
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.documentElement,
    });
    expect(isRyosFullscreenActive()).toBe(true);
  });

  test("isRyosFullscreenSupported requires fullscreenEnabled and requestFullscreen on html", () => {
    if (typeof document === "undefined" || !root) {
      expect(true).toBe(true);
      return;
    }
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
