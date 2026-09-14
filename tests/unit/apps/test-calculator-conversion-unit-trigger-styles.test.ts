#!/usr/bin/env bun

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { calculatorStyles } from "../../../src/apps/calculator/utils/calculatorStyles";

const aquaCss = readFileSync("src/styles/themes/aqua.css", "utf8");
const darkAquaCss = readFileSync("src/styles/themes/dark-aqua.css", "utf8");

function isTransparentBackground(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    normalized === "transparent" ||
    normalized === "rgba(0, 0, 0, 0)" ||
    normalized === "rgba(0,0,0,0)" ||
    normalized === "none"
  );
}

function isGlossySelectBackground(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").toLowerCase();
  return (
    normalized.includes("linear-gradient") &&
    (normalized.includes("rgba(255, 255, 255") ||
      normalized.includes("rgba(255,255,255"))
  );
}

function mountTrigger(scheme: "light" | "dark") {
  document.documentElement.setAttribute("data-os-theme", "macosx");
  if (scheme === "dark") {
    document.documentElement.setAttribute("data-os-color-scheme", "dark");
  } else {
    document.documentElement.removeAttribute("data-os-color-scheme");
  }

  document.body.innerHTML = `
    <style id="aqua-theme">${aquaCss}</style>
    <style id="dark-aqua-theme">${darkAquaCss}</style>
    <style id="calculator-styles">${calculatorStyles}</style>
    <div class="calc-theme-aqua">
      <div class="calc-display calc-conversion-lcd">
        <button
          class="macos-select-trigger os-select-trigger-macos calc-conversion-unit-trigger"
          type="button"
        >
          米 · M
        </button>
      </div>
    </div>
  `;

  return document.querySelector(".calc-conversion-unit-trigger") as HTMLButtonElement;
}

beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
  }
});

afterAll(() => {
  if (GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-os-theme");
  document.documentElement.removeAttribute("data-os-color-scheme");
});

describe("calculator conversion unit trigger styles", () => {
  test("keeps light Aqua unit selects transparent (no dark-mode selector wrap)", () => {
    const trigger = mountTrigger("light");
    const styles = getComputedStyle(trigger);

    expect(isTransparentBackground(styles.backgroundColor)).toBe(true);
    expect(isGlossySelectBackground(styles.backgroundImage)).toBe(false);
    expect(styles.boxShadow === "none" || styles.boxShadow === "").toBe(true);
  });

  test("beats Aqua Dark macos-select-trigger gloss on the LCD unit chips", () => {
    const trigger = mountTrigger("dark");
    const styles = getComputedStyle(trigger);

    expect(isTransparentBackground(styles.backgroundColor)).toBe(true);
    expect(isGlossySelectBackground(styles.backgroundImage)).toBe(false);
    expect(styles.boxShadow === "none" || styles.boxShadow === "").toBe(true);
    expect(styles.textShadow === "none" || styles.textShadow === "").toBe(true);
  });

  test("does not flatten a generic Aqua Dark select outside the calculator LCD", () => {
    document.documentElement.setAttribute("data-os-theme", "macosx");
    document.documentElement.setAttribute("data-os-color-scheme", "dark");
    document.body.innerHTML = `
      <style id="aqua-theme">${aquaCss}</style>
      <style id="dark-aqua-theme">${darkAquaCss}</style>
      <style id="calculator-styles">${calculatorStyles}</style>
      <button class="macos-select-trigger os-select-trigger-macos" type="button">
        Generic
      </button>
    `;

    const trigger = document.querySelector(".macos-select-trigger") as HTMLButtonElement;
    const styles = getComputedStyle(trigger);

    expect(isGlossySelectBackground(styles.backgroundImage) || !isTransparentBackground(styles.backgroundColor)).toBe(
      true
    );
  });
});
