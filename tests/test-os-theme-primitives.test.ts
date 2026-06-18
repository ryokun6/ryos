import { describe, expect, test } from "bun:test";
import {
  osAppSidebarSurfaceClassName,
  osCardClassName,
  osDrawerSurfaceClassName,
  osSeparatorBorderClassName,
  osSubtleIconButtonClassName,
  osToolbarSurfaceClassName,
  windowsBevelClassName,
} from "../src/components/shared/osThemePrimitives";

describe("os theme primitives", () => {
  test("uses tokenized XP card colors without changing the legacy shell shape", () => {
    const className = osCardClassName({
      isMacOSTheme: false,
      isSystem7Theme: false,
      isWindowsTheme: true,
    });

    expect(className).toContain("rounded-[0.4rem]");
    expect(className).toContain("border-os-window");
    expect(className).toContain("bg-os-window-bg");
    expect(className).toContain("text-os-text-primary");
  });

  test("uses Win98 bevels when Windows card callers pass the exact theme", () => {
    const className = osCardClassName({
      isMacOSTheme: false,
      isSystem7Theme: false,
      isWindowsTheme: true,
      isWin98: true,
    });

    expect(className).toContain("rounded-none");
    expect(className).toContain("border-t-white");
    expect(className).toContain("border-b-os-separator");
    expect(className).not.toContain("rounded-[0.4rem]");
  });

  test("suppresses non-Mac rounded corners for panel card embeds", () => {
    const className = osCardClassName(
      {
        isMacOSTheme: false,
        isSystem7Theme: false,
        isWindowsTheme: true,
      },
      { embed: "panel" }
    );

    expect(className).toContain("border-os-window");
    expect(className).not.toContain("my-1");
    expect(className).not.toContain("rounded-[0.4rem]");
  });

  test("keeps app drawer placement-specific borders centralized", () => {
    const rightXp = osDrawerSurfaceClassName(
      {
        isMacOSTheme: false,
        isSystem7Theme: false,
        isWindowsTheme: true,
        isWin98: false,
      },
      "right"
    );
    const bottomWin98 = osDrawerSurfaceClassName(
      {
        isMacOSTheme: false,
        isSystem7Theme: false,
        isWindowsTheme: true,
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
        isWindowsTheme: true,
      },
      { border: "top" }
    );

    expect(toolbar).toContain("border-t");
    expect(toolbar).toContain("bg-os-window-bg");
    expect(toolbar).toContain("border-os-separator");
  });

  test("centralizes app sidebar surfaces and Aqua Glass border handoff", () => {
    const glassSidebar = osAppSidebarSurfaceClassName(
      {
        isMacOSTheme: true,
        isWindowsTheme: false,
        isAquaGlass: true,
      },
      { surfaceClassName: "bg-white/90", className: "custom-sidebar" }
    );
    const responsiveWindowsSidebar = osAppSidebarSurfaceClassName(
      {
        isMacOSTheme: false,
        isWindowsTheme: true,
      },
      { layout: "responsive" }
    );

    expect(glassSidebar).toContain("bg-transparent");
    expect(glassSidebar).not.toContain("border-black/10");
    expect(glassSidebar).toContain("custom-sidebar");
    expect(responsiveWindowsSidebar).toContain("border-[#919b9c]");
    expect(responsiveWindowsSidebar).toContain("md:border-r");
  });

  test("exposes reusable Windows bevel classes", () => {
    expect(windowsBevelClassName("raised")).toContain("border-t-white");
    expect(windowsBevelClassName("sunken")).toContain("border-t-os-separator");
  });

  test("exposes tokenized separator and dark-aware subtle icon button classes", () => {
    expect(osSeparatorBorderClassName()).toContain("--os-color-separator");
    expect(osSubtleIconButtonClassName()).toContain("hover:bg-black/10");
    expect(osSubtleIconButtonClassName()).toContain("os-mac-aqua-dark:hover:bg-white/12");
  });
});
