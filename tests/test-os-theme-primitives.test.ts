import { describe, expect, test } from "bun:test";
import {
  osCardClassName,
  osDrawerSurfaceClassName,
  osToolbarSurfaceClassName,
  windowsBevelClassName,
} from "../src/components/shared/osThemePrimitives";

describe("os theme primitives", () => {
  test("uses tokenized XP card colors without changing the legacy shell shape", () => {
    const className = osCardClassName({
      isMacOSTheme: false,
      isSystem7Theme: false,
      isXpTheme: true,
    });

    expect(className).toContain("rounded-[0.4rem]");
    expect(className).toContain("border-os-window");
    expect(className).toContain("bg-os-window-bg");
    expect(className).toContain("text-os-text-primary");
  });

  test("keeps app drawer placement-specific borders centralized", () => {
    const rightXp = osDrawerSurfaceClassName(
      {
        isMacOSTheme: false,
        isSystem7Theme: false,
        isXpTheme: true,
        isWin98: false,
      },
      "right"
    );
    const bottomWin98 = osDrawerSurfaceClassName(
      {
        isMacOSTheme: false,
        isSystem7Theme: false,
        isXpTheme: true,
        isWin98: true,
      },
      "bottom"
    );

    expect(rightXp).toContain("border-l-0");
    expect(rightXp).toContain("rounded-r-[0.5rem]");
    expect(bottomWin98).toContain("border-t-0");
    expect(bottomWin98).toContain("border-r-os-separator");
  });

  test("composes toolbar borders and platform colors from one helper", () => {
    const toolbar = osToolbarSurfaceClassName(
      {
        isMacOSTheme: false,
        isSystem7Theme: false,
        isXpTheme: true,
      },
      { border: "top" }
    );

    expect(toolbar).toContain("border-t");
    expect(toolbar).toContain("bg-os-window-bg");
    expect(toolbar).toContain("border-os-separator");
  });

  test("exposes reusable Windows bevel classes", () => {
    expect(windowsBevelClassName("raised")).toContain("border-t-white");
    expect(windowsBevelClassName("sunken")).toContain("border-t-os-separator");
  });
});
