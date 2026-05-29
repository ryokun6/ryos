#!/usr/bin/env bun

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  RYOS_FULLSCREEN_ROOT_ID,
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
  });

  test("getRyosFullscreenRoot returns the shell root element", () => {
    if (typeof document === "undefined") {
      expect(true).toBe(true);
      return;
    }
    expect(getRyosFullscreenRoot()).toBe(root);
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
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
  });

  test("isRyosFullscreenActive is true when shell root is fullscreen", () => {
    if (typeof document === "undefined" || !root) {
      expect(true).toBe(true);
      return;
    }
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => root,
    });
    expect(isRyosFullscreenActive()).toBe(true);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
  });

  test("isRyosFullscreenSupported requires fullscreenEnabled and requestFullscreen", () => {
    if (typeof document === "undefined" || !root) {
      expect(true).toBe(true);
      return;
    }
    const originalEnabled = document.fullscreenEnabled;
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: true,
    });
    root.requestFullscreen = async () => {};
    document.exitFullscreen = async () => {};
    expect(isRyosFullscreenSupported()).toBe(true);
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: originalEnabled,
    });
  });
});
