#!/usr/bin/env bun
/**
 * Wiring tests for macOS System Preferences layout in Control Panels.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";
import {
  CONTROL_PANEL_CATEGORIES,
  CONTROL_PANEL_PINNED_PANES,
  CONTROL_PANEL_SECTIONS,
  getControlPanelCategory,
  getControlPanelsMacWindowTitle,
  normalizeControlPanelClassicTabId,
  normalizeControlPanelPaneId,
} from "../src/apps/control-panels/components/control-panels-app/controlPanelsCategories";
import {
  MACOSX_PREVIEW_CANVAS_WIDTH,
  MACOSX_PREVIEW_WINDOW_WIDTH,
  computeMacosxPreviewWindowLeft,
} from "../src/apps/control-panels/components/control-panels-app/AppearanceMacosxPreviewScene";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("Control Panels macOS 10.3 layout", () => {
  test("macosx theme uses ControlPanelsMacLayout instead of ThemedTabs", () => {
    const source = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsAppComponent.tsx"
    );
    expect(source.includes("ControlPanelsMacLayout")).toBe(true);
    expect(source.includes("isMacOSTheme ? (")).toBe(true);
    expect(source.includes("ControlPanelsMacPaneRenderer")).toBe(true);
  });

  test("mac layout provides category grid, toolbar, and navigation reducer", () => {
    const layoutSource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsMacLayout.tsx"
    );
    expect(layoutSource.includes("ControlPanelsCategoryGrid")).toBe(true);
    expect(layoutSource.includes("ControlPanelsMacToolbar")).toBe(true);
    expect(layoutSource.includes("navigationReducer")).toBe(true);
    expect(layoutSource.includes("ControlPanelsPreferencePane")).toBe(true);
    expect(layoutSource.includes("ControlPanelsMacAnimatedBody")).toBe(true);
    expect(layoutSource.includes("onSelectPane={selectPane}")).toBe(true);
    expect(layoutSource.includes("renderPane(activePane, selectPane)")).toBe(true);
    expect(layoutSource.includes("instanceId={instanceId}")).toBe(true);
    expect(layoutSource.includes("navKey={currentEntry}")).toBe(true);
    expect(layoutSource.includes("normalizeControlPanelPaneId")).toBe(true);
    expect(layoutSource.includes("onCurrentEntryChange")).toBe(true);
    expect(layoutSource.includes("goBack")).toBe(false);
    expect(layoutSource.includes("goForward")).toBe(false);
    expect(layoutSource.includes("history:")).toBe(false);
  });

  test("macosx window title shows pane name or default on Show All", () => {
    const appSource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsAppComponent.tsx"
    );
    const categoriesSource = readSource(
      "src/apps/control-panels/components/control-panels-app/controlPanelsCategories.ts"
    );

    expect(categoriesSource.includes("getControlPanelsMacWindowTitle")).toBe(
      true
    );
    expect(categoriesSource.includes('current === "home"')).toBe(true);
    expect(categoriesSource.includes("getControlPanelCategory(current)")).toBe(
      true
    );
    expect(categoriesSource.includes("category.labelKey")).toBe(true);

    expect(appSource.includes("getControlPanelsMacWindowTitle")).toBe(true);
    expect(appSource.includes("macCurrentEntry")).toBe(true);
    expect(appSource.includes("effectiveWindowTitle")).toBe(true);
    expect(appSource.includes("isMacOSTheme ? macWindowTitle : windowTitle")).toBe(
      true
    );
    expect(appSource.includes("onCurrentEntryChange={setMacCurrentEntry}")).toBe(
      true
    );
    expect(appSource.includes("title: effectiveWindowTitle")).toBe(true);

    const mockT = (key: string) => key;
    const defaultTitle = "System Preferences";
    expect(getControlPanelsMacWindowTitle("home", mockT, defaultTitle)).toBe(
      defaultTitle
    );
    expect(
      getControlPanelsMacWindowTitle("appearance", mockT, defaultTitle)
    ).toBe("apps.control-panels.panes.appearance");
    expect(getControlPanelsMacWindowTitle("sound", mockT, defaultTitle)).toBe(
      "apps.control-panels.panes.sound"
    );
    expect(
      getControlPanelsMacWindowTitle("dot-mac", mockT, defaultTitle)
    ).toBe("apps.control-panels.panes.dotMac");
  });

  test("mac layout animates body height with WindowFrame resize transition", () => {
    const animatedBodySource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsMacAnimatedBody.tsx"
    );
    const motionSource = readSource(
      "src/apps/control-panels/components/control-panels-app/controlPanelsMacMotion.ts"
    );
    const appSource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsAppComponent.tsx"
    );
    const cssSource = readSource("src/styles/themes/control-panels-mac.css");

    expect(animatedBodySource.includes('from "motion/react"')).toBe(true);
    expect(animatedBodySource.includes("motion.div")).toBe(true);
    expect(animatedBodySource.includes("useResizeObserverWithRef")).toBe(true);
    expect(animatedBodySource.includes("updateInstanceWindowState")).toBe(true);
    expect(animatedBodySource.includes("CONTROL_PANELS_MAC_SIZE_TRANSITION")).toBe(
      true
    );
    // Measurement is decoupled from display: the measure subtree is never
    // height-constrained (the body itself scrolls past the cap), so the natural
    // height is read off the measure node's layout box via offsetHeight — which
    // ignores ancestor transforms (open animation), unlike getBoundingClientRect,
    // and needs no scrollHeight / flex / collapsed-inner-scroller hacks.
    expect(animatedBodySource.includes("offsetHeight")).toBe(true);
    expect(animatedBodySource.includes("getBoundingClientRect")).toBe(false);
    expect(animatedBodySource.includes("scrollHeight")).toBe(false);
    expect(animatedBodySource.includes("collapsedOverflow")).toBe(false);
    expect(animatedBodySource.includes("data-scrollable")).toBe(true);
    expect(animatedBodySource.includes("control-panels-mac-body-layout")).toBe(
      true
    );
    expect(animatedBodySource.includes("naturalHeightRef")).toBe(true);
    expect(animatedBodySource.includes("isMeasuring")).toBe(true);
    expect(animatedBodySource.includes("overflow-y-auto")).toBe(false);
    expect(motionSource.includes("duration: 0.15")).toBe(true);
    expect(motionSource.includes("0.25, 0.1, 0.25, 1")).toBe(true);
    expect(appSource.includes("minHeight: 200")).toBe(true);
    expect(appSource.includes("maxHeight: 600")).toBe(true);
    // Single scroll container: cap + overflow live on the body (parent of the
    // measured node), and there is no inner tab-panel scroller anymore.
    expect(cssSource.includes(".control-panels-mac-body[data-scrollable]")).toBe(
      true
    );
    expect(cssSource.includes("overflow-y: auto")).toBe(true);
    expect(
      cssSource.match(
        /\.control-panels-pref-form-tabbed \.control-panels-pref-tab-panel[\s\S]*?overflow-y:\s*auto/
      )
    ).toBeNull();
  });

  test("macosx layout starts on Show All unless deep-linked", () => {
    const appSource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsAppComponent.tsx"
    );
    const layoutSource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsMacLayout.tsx"
    );
    const toolbarSource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsMacToolbar.tsx"
    );

    expect(appSource.includes("defaultPane={initialData?.defaultTab}")).toBe(
      true
    );
    expect(appSource.includes("defaultPane={defaultTab}")).toBe(false);
    expect(layoutSource.includes('current: initialPane ?? "home"')).toBe(true);
    expect(toolbarSource.includes("showHome &&")).toBe(true);
  });

  test("category icons use macosx-themed assets", () => {
    const categoriesSource = readSource(
      "src/apps/control-panels/components/control-panels-app/controlPanelsCategories.ts"
    );
    const manifest = JSON.parse(
      readSource("public/icons/manifest.json")
    ) as { themes: Record<string, string[]> };
    const macosxIcons = new Set(manifest.themes.macosx ?? []);

    const iconMatches = [
      ...categoriesSource.matchAll(/icon:\s*"([^"]+)"/g),
    ].map((match) => match[1]);

    expect(iconMatches.length).toBe(10);
    for (const icon of iconMatches) {
      expect(macosxIcons.has(icon)).toBe(true);
    }

    expect(categoriesSource.includes("desktop.png")).toBe(true);
    expect(categoriesSource.includes("control-panels/desktop-screen-saver.png")).toBe(
      false
    );
    expect(getControlPanelCategory("desktop-screen-saver")?.icon).toBe(
      "desktop.png"
    );
    expect(categoriesSource.includes("sound.png")).toBe(true);
    expect(getControlPanelCategory("sound")?.icon).toBe("sound.png");
    expect(categoriesSource.includes("cloud-sync.png")).toBe(true);
    expect(categoriesSource.includes("software-update.png")).toBe(true);
    expect(getControlPanelCategory("dot-mac")?.icon).toBe("cloud-sync.png");
    expect(getControlPanelCategory("software-update")?.icon).toBe(
      "software-update.png"
    );
    expect(categoriesSource.includes("background-fill.png")).toBe(false);
    expect(categoriesSource.includes("location/app.png")).toBe(false);
    expect(categoriesSource.includes("floppy.png")).toBe(false);
    expect(categoriesSource.includes("control-panels/keychain.png")).toBe(true);
    expect(getControlPanelCategory("security")?.icon).toBe(
      "control-panels/keychain.png"
    );
    expect(categoriesSource.includes("control-panels/users.png")).toBe(true);
    expect(getControlPanelCategory("accounts")?.icon).toBe(
      "control-panels/users.png"
    );
    expect(categoriesSource.includes("control-panels/displays.png")).toBe(true);
  });

  test("Cloud Sync pane uses Sync and Backup tabs with cloud backup UI", () => {
    const dotMacSource = readSource(
      "src/apps/control-panels/components/control-panels-app/DotMacPaneContent.tsx"
    );
    const sharingSource = readSource(
      "src/apps/control-panels/components/control-panels-app/SharingPaneContent.tsx"
    );
    const rendererSource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsMacPaneRenderer.tsx"
    );

    expect(dotMacSource.includes("control-panels-pref-form-tabbed")).toBe(true);
    expect(dotMacSource.includes("control-panels-pref-tab-bar")).toBe(true);
    expect(dotMacSource.includes("cloudSyncTabs.sync")).toBe(true);
    expect(dotMacSource.includes("cloudSyncTabs.backup")).toBe(true);
    expect(dotMacSource.includes("control-panels-pref-tab-panel")).toBe(true);
    expect(dotMacSource.includes("handleCloudBackup")).toBe(true);
    expect(dotMacSource.includes("setIsConfirmForceUploadOpen")).toBe(true);
    expect(dotMacSource.includes("forceSyncDescription")).toBe(true);
    expect(dotMacSource.includes("sharingDescription")).toBe(false);

    const syncTabPanel = dotMacSource.slice(
      dotMacSource.indexOf('hidden={dotMacTab !== "sync"}'),
      dotMacSource.indexOf('hidden={dotMacTab !== "backup"}')
    );
    const backupTabPanel = dotMacSource.slice(
      dotMacSource.indexOf('hidden={dotMacTab !== "backup"}'),
      dotMacSource.indexOf("</div>\n      </div>\n    </div>\n  );")
    );
    expect(syncTabPanel.includes("setIsConfirmForceUploadOpen")).toBe(true);
    expect(syncTabPanel.includes("setIsConfirmForceDownloadOpen")).toBe(true);
    expect(syncTabPanel.includes("handleCloudBackup")).toBe(false);
    expect(backupTabPanel.includes("handleCloudBackup")).toBe(true);
    expect(backupTabPanel.includes("setIsConfirmForceUploadOpen")).toBe(false);
    expect(backupTabPanel.includes("setIsConfirmForceDownloadOpen")).toBe(false);

    expect(sharingSource.includes("handleCloudBackup")).toBe(false);
    expect(sharingSource.includes("control-panels-pref-divider")).toBe(false);
    expect(sharingSource.includes("sharingDescription")).toBe(false);
    expect(sharingSource.includes("backupRestoreDescription")).toBe(true);

    const dotMacCase = rendererSource.slice(
      rendererSource.indexOf('case "dot-mac":'),
      rendererSource.indexOf('case "sharing":')
    );
    expect(dotMacCase.includes("handleCloudBackup")).toBe(true);
    expect(dotMacCase.includes("cloudSyncStatus")).toBe(true);

    const sharingCase = rendererSource.slice(
      rendererSource.indexOf('case "sharing":'),
      rendererSource.indexOf('case "accounts":')
    );
    expect(sharingCase.includes("handleCloudBackup")).toBe(false);
    expect(sharingCase.includes("handleBackup")).toBe(true);
  });

  test("legacy defaultTab values normalize to macOS pane ids", () => {
    expect(normalizeControlPanelPaneId("system")).toBe("international");
    expect(normalizeControlPanelPaneId("sync")).toBe("dot-mac");
    expect(normalizeControlPanelPaneId("sound")).toBe("sound");
    expect(normalizeControlPanelPaneId("appearance")).toBe("appearance");
    expect(normalizeControlPanelPaneId("wallpaper")).toBe("desktop-screen-saver");
    expect(normalizeControlPanelPaneId("screensaver")).toBe("desktop-screen-saver");
    expect(normalizeControlPanelPaneId("desktop-screen-saver")).toBe(
      "desktop-screen-saver"
    );
    expect(normalizeControlPanelPaneId(undefined)).toBeUndefined();
  });

  test("legacy deep links map to classic tabs without breaking non-macosx layout", () => {
    expect(normalizeControlPanelClassicTabId("wallpaper")).toBe("appearance");
    expect(normalizeControlPanelClassicTabId("screensaver")).toBe("appearance");
    expect(normalizeControlPanelClassicTabId("system")).toBe("system");
    expect(normalizeControlPanelClassicTabId("sync")).toBe("sync");
    expect(normalizeControlPanelClassicTabId(undefined)).toBe("appearance");
  });

  test("spotlight wallpaper and screen saver deep links target desktop-screen-saver", () => {
    const spotlightSource = readSource("src/hooks/useSpotlightSearch.ts");
    expect(spotlightSource.includes('tab: "wallpaper"')).toBe(true);
    expect(spotlightSource.includes('tab: "screensaver"')).toBe(true);
    expect(spotlightSource.includes('id: "setting-wallpaper"')).toBe(true);
    expect(spotlightSource.includes('id: "setting-screensaver"')).toBe(true);
  });

  test("Security pane shows account header and delete account row", () => {
    const securitySource = readSource(
      "src/apps/control-panels/components/control-panels-app/SecurityPaneContent.tsx"
    );
    const rendererSource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsMacPaneRenderer.tsx"
    );
    const headerSource = readSource(
      "src/apps/control-panels/components/control-panels-app/AccountProfileHeader.tsx"
    );
    const constantsSource = readSource(
      "src/apps/control-panels/components/control-panels-app/constants.ts"
    );

    expect(headerSource.includes("AccountProfileHeader")).toBe(true);
    expect(headerSource.includes("control-panels-account-profile")).toBe(true);
    expect(headerSource.includes("getAccountJoinStatusLabel")).toBe(true);
    expect(headerSource.includes("accountJoinedAt")).toBe(true);
    expect(headerSource.includes("loggedInToRyOS")).toBe(false);
    expect(headerSource.includes("AccountActionsMenu")).toBe(false);
    expect(headerSource.includes("ThemedIcon")).toBe(true);
    expect(headerSource.includes("ACCOUNT_PROFILE_AVATAR_ICON")).toBe(true);
    expect(constantsSource.includes("control-panels/account-avatar.png")).toBe(
      true
    );
    expect(headerSource.includes("accountAvatarInitials")).toBe(true);
    expect(securitySource.includes("AccountProfileHeader")).toBe(true);
    expect(securitySource.includes("DeleteAccountDialog")).toBe(true);
    expect(securitySource.includes("deleteAccountRowDescription")).toBe(true);
    expect(securitySource.includes("deleteAccount.submit")).toBe(true);

    const securityCase = rendererSource.slice(
      rendererSource.indexOf('case "security":'),
      rendererSource.indexOf('case "sound":')
    );
    expect(securityCase.includes("myContact")).toBe(true);
    expect(securityCase.includes("accountAvatarLabel")).toBe(true);
    expect(securityCase.includes("realtimeStatus")).toBe(true);
    expect(securityCase.includes("accountJoinedAt")).toBe(true);
    expect(securitySource.includes("logOutRowDescription")).toBe(true);
    expect(securitySource.includes("logOutOfAllDevices")).toBe(true);
    expect(securitySource.includes("logOutOfAllDevicesRowDescription")).toBe(true);
    expect(securitySource.includes("verifyAccount")).toBe(false);
    expect(securityCase.includes("logout")).toBe(true);
    expect(securityCase.includes("handleLogoutAllDevices")).toBe(true);
    expect(securityCase.includes("isLoggingOutAllDevices")).toBe(true);
    expect(securityCase.includes("promptVerifyToken")).toBe(false);

    const logOutRowIndex = securitySource.indexOf("logOutRowDescription");
    const logOutAllRowIndex = securitySource.indexOf("logOutOfAllDevicesRowDescription");
    const deleteAccountRowIndex = securitySource.indexOf("deleteAccountRowDescription");
    expect(logOutRowIndex).toBeGreaterThan(-1);
    expect(logOutAllRowIndex).toBeGreaterThan(logOutRowIndex);
    expect(deleteAccountRowIndex).toBeGreaterThan(logOutAllRowIndex);
  });

  test("Sound pane Effects tab rows include secondary descriptions", () => {
    const soundSource = readSource(
      "src/apps/control-panels/components/control-panels-app/SoundPaneContent.tsx"
    );

    expect(soundSource.includes("uiSoundsDescription")).toBe(true);
    expect(soundSource.includes("speechDescription")).toBe(true);
    expect(soundSource.includes("terminalIeAmbientSynthDescription")).toBe(true);
    expect(soundSource.includes("chatSynthDescription")).toBe(true);
    expect(soundSource.includes("soundTabs.effects")).toBe(true);
  });

  test("Accounts pane uses Accounts, Security, and admin-gated Debug tabs", () => {
    const accountsSource = readSource(
      "src/apps/control-panels/components/control-panels-app/AccountsPaneContent.tsx"
    );
    const rendererSource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsMacPaneRenderer.tsx"
    );

    expect(accountsSource.includes("control-panels-pref-form-tabbed")).toBe(true);
    expect(accountsSource.includes("control-panels-pref-tab-bar")).toBe(true);
    expect(accountsSource.includes("accountsTabs.accounts")).toBe(true);
    expect(accountsSource.includes("accountsTabs.security")).toBe(true);
    expect(accountsSource.includes("accountsTabs.debug")).toBe(true);
    expect(accountsSource.includes("accountsTabs.advanced")).toBe(false);
    expect(accountsSource.includes("AccountProfileHeader")).toBe(true);
    expect(accountsSource.includes("SecurityPaneContent")).toBe(true);
    expect(accountsSource.includes("control-panels-pref-tab-panel")).toBe(true);
    expect(accountsSource.includes("openTelegramDialog")).toBe(true);
    expect(accountsSource.includes("recoveryEmailStatus")).toBe(true);
    expect(accountsSource.includes("apps.control-panels.email.title")).toBe(true);
    expect(accountsSource.includes("ThemedIcon")).toBe(true);
    expect(accountsSource.includes("mail.png")).toBe(true);
    expect(accountsSource.includes("cloud-sync.png")).toBe(true);
    expect(accountsSource.includes("panes.dotMac")).toBe(true);
    expect(accountsSource.includes("cloudSync.accountDescription")).toBe(true);
    expect(accountsSource.includes("apps.control-panels.setup")).toBe(true);
    expect(accountsSource.includes('onNavigateToPane?.("dot-mac")')).toBe(true);
    expect(accountsSource.includes("setDebugMode")).toBe(true);
    expect(accountsSource.includes("shaderEffectEnabled")).toBe(false);
    expect(accountsSource.includes("setAiModel")).toBe(true);
    expect(accountsSource.includes("setTtsModel")).toBe(true);
    expect(accountsSource.includes("handleShowBootScreen")).toBe(true);
    expect(accountsSource.includes("ControlPanelsPrefFormRow")).toBe(true);
    expect(accountsSource.includes("handleTriggerAppCrashTest")).toBe(true);
    expect(accountsSource.includes("control-panels-pref-divider")).toBe(false);

    const accountsTabBar = accountsSource.slice(
      accountsSource.indexOf('aria-label={t("apps.control-panels.panes.accounts")}'),
      accountsSource.indexOf('<div className="control-panels-pref-well">')
    );
    const accountsTabIndex = accountsTabBar.indexOf("accountsTabs.accounts");
    const securityTabIndex = accountsTabBar.indexOf("accountsTabs.security");
    const debugTabIndex = accountsTabBar.indexOf("accountsTabs.debug");
    expect(accountsTabIndex).toBeGreaterThan(-1);
    expect(securityTabIndex).toBeGreaterThan(accountsTabIndex);
    expect(debugTabIndex).toBeGreaterThan(securityTabIndex);
    expect(accountsTabBar.indexOf("{isAdmin &&")).toBeGreaterThan(securityTabIndex);

    const accountsTabPanel = accountsSource.slice(
      accountsSource.indexOf('hidden={accountsTab !== "accounts"}'),
      accountsSource.indexOf('hidden={accountsTab !== "security"}')
    );
    const emailRowIndex = accountsTabPanel.indexOf("apps.control-panels.email.title");
    const telegramRowIndex = accountsTabPanel.indexOf("apps.control-panels.telegram.title");
    const cloudSyncRowIndex = accountsTabPanel.indexOf("panes.dotMac");
    expect(emailRowIndex).toBeGreaterThan(-1);
    expect(telegramRowIndex).toBeGreaterThan(emailRowIndex);
    expect(cloudSyncRowIndex).toBeGreaterThan(telegramRowIndex);

    const securityTabPanel = accountsSource.slice(
      accountsSource.indexOf('hidden={accountsTab !== "security"}'),
      accountsSource.indexOf('hidden={accountsTab !== "debug"}')
    );
    expect(securityTabPanel.includes("SecurityPaneContent")).toBe(true);
    expect(securityTabPanel.includes("hasPassword")).toBe(true);
    expect(securityTabPanel.includes("handleLogoutAllDevices")).toBe(true);

    const debugTabPanel = accountsSource.slice(
      accountsSource.indexOf('hidden={accountsTab !== "debug"}'),
      accountsSource.indexOf("</div>\n      </div>\n      <RecoveryEmailDialog")
    );
    expect(debugTabPanel.includes("setDebugMode")).toBe(true);
    expect(debugTabPanel.includes("shaderEffectEnabled")).toBe(false);

    const accountsCase = rendererSource.slice(
      rendererSource.indexOf('case "accounts":'),
      rendererSource.indexOf('case "software-update":')
    );
    expect(accountsCase.includes("setDebugMode")).toBe(true);
    expect(accountsCase.includes("shaderEffectEnabled")).toBe(false);
    expect(accountsCase.includes("AI_MODELS")).toBe(true);
    expect(accountsCase.includes("setAiModel")).toBe(true);
    expect(accountsCase.includes("setTtsModel")).toBe(true);
    expect(accountsCase.includes("handleShowBootScreen")).toBe(true);
    expect(accountsCase.includes("recoveryEmailStatus")).toBe(true);
    expect(accountsCase.includes("hasPassword")).toBe(true);
    expect(accountsCase.includes("logout")).toBe(true);
    expect(accountsCase.includes("handleLogoutAllDevices")).toBe(true);
    expect(accountsCase.includes("isAdmin")).toBe(true);
    expect(accountsCase.includes("onNavigateToPane")).toBe(true);

    const appSource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsAppComponent.tsx"
    );
    expect(appSource.includes("onNavigateToPane={onNavigateToPane}")).toBe(true);
  });

  test("dedicated pane components exist for split settings", () => {
    expect(
      readSource(
        "src/apps/control-panels/components/control-panels-app/AppearancePaneContent.tsx"
      ).includes("AppearancePaneContent")
    ).toBe(true);
    expect(
      readSource(
        "src/apps/control-panels/components/control-panels-app/DesktopScreenSaverPaneContent.tsx"
      ).includes("DesktopScreenSaverPaneContent")
    ).toBe(true);
    expect(
      readSource(
        "src/apps/control-panels/components/control-panels-app/InternationalPaneContent.tsx"
      ).includes("InternationalPaneContent")
    ).toBe(true);
    expect(
      readSource(
        "src/apps/control-panels/components/control-panels-app/DotMacPaneContent.tsx"
      ).includes("DotMacPaneContent")
    ).toBe(true);
    expect(
      readSource(
        "src/apps/control-panels/components/control-panels-app/ControlPanelsMacPaneRenderer.tsx"
      ).includes("ControlPanelsUnavailablePane")
    ).toBe(false);
  });

  test("toolbar exposes pinned quick-access pane icons without back/forward", () => {
    expect(CONTROL_PANEL_PINNED_PANES).toEqual([
      "appearance",
      "desktop-screen-saver",
      "accounts",
    ]);

    const toolbarSource = readSource(
      "src/apps/control-panels/components/control-panels-app/ControlPanelsMacToolbar.tsx"
    );
    expect(toolbarSource.includes("CONTROL_PANEL_PINNED_PANES")).toBe(true);
    expect(toolbarSource.includes("control-panels-toolbar-pin")).toBe(true);
    expect(toolbarSource.includes("control-panels-toolbar-divider")).toBe(true);
    expect(toolbarSource.includes("onSelectPane")).toBe(true);
    expect(toolbarSource.includes("onGoBack")).toBe(false);
    expect(toolbarSource.includes("onGoForward")).toBe(false);
    expect(toolbarSource.includes("ToolbarButtonGroup")).toBe(false);
    expect(toolbarSource.includes("SquaresFour")).toBe(false);
    expect(toolbarSource.includes("SHOW_ALL_ICON")).toBe(true);
    expect(toolbarSource.includes("appMetadata")).toBe(true);
  });

  test("category and pinned pane icons resolve on macosx theme", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/icons/manifest.json"), "utf-8")
    ) as { themes: { macosx: string[]; default: string[] } };
    const macosxIcons = new Set(manifest.themes.macosx);
    const defaultIcons = new Set(manifest.themes.default);

    for (const category of CONTROL_PANEL_CATEGORIES) {
      expect(macosxIcons.has(category.icon)).toBe(true);
    }

    for (const paneId of CONTROL_PANEL_PINNED_PANES) {
      const category = getControlPanelCategory(paneId);
      expect(category).toBeDefined();
      expect(macosxIcons.has(category!.icon)).toBe(true);
    }

    expect(macosxIcons.has("control-panels/users.png")).toBe(true);
    expect(macosxIcons.has("control-panels/account-avatar.png")).toBe(true);
    expect(defaultIcons.has("control-panels/account-avatar.png")).toBe(true);
    expect(getControlPanelCategory("accounts")?.icon).toBe(
      "control-panels/users.png"
    );
  });

  test("sections merge hardware and system with removed panes omitted", () => {
    expect(CONTROL_PANEL_SECTIONS).toHaveLength(3);
    expect(CONTROL_PANEL_SECTIONS.map((section) => section.id)).toEqual([
      "personal",
      "hardware-system",
      "internet-network",
    ]);

    const allPaneIds = CONTROL_PANEL_SECTIONS.flatMap((section) => section.paneIds);
    expect(allPaneIds).toHaveLength(10);
    expect(allPaneIds).toEqual([
      "appearance",
      "desktop-screen-saver",
      "international",
      "displays",
      "sound",
      "accounts",
      "security",
      "dot-mac",
      "sharing",
      "software-update",
    ]);
    expect(allPaneIds).not.toContain("energy-saver");
    expect(allPaneIds).not.toContain("date-time");
    expect(allPaneIds).not.toContain("speech");
    expect(allPaneIds).not.toContain("startup-disk");
  });

  test("macosx-only styles are scoped under control-panels-mac", () => {
    const cssSource = readSource("src/styles/themes/control-panels-mac.css");
    expect(cssSource.includes(':root[data-os-theme="macosx"] .control-panels-mac')).toBe(
      true
    );
    expect(cssSource.includes("control-panels-section-grid")).toBe(true);
    expect(cssSource.includes("control-panels-pref-form-row")).toBe(true);
    expect(cssSource.includes("control-panels-toolbar-pin")).toBe(true);
  });

  test("preference pane tabs defer to global aqua tab styles", () => {
    const cssSource = readSource("src/styles/themes/control-panels-mac.css");
    expect(cssSource.includes("control-panels-pref-tabbed")).toBe(true);
    expect(cssSource.includes("control-panels-pref-form-tabbed")).toBe(true);
    expect(cssSource.includes("control-panels-pref-tab-bar")).toBe(true);
    expect(cssSource.includes("justify-content: center")).toBe(true);
    expect(cssSource.includes("min-width: 100px")).toBe(true);
    expect(
      cssSource.match(
        /\.control-panels-pref-tab-bar \.aqua-tab \{[^}]*background:/
      )
    ).toBeNull();
    expect(
      cssSource.match(
        /\.control-panels-pref-tab-bar\.aqua-tab-bar:after[\s\S]*?display:\s*none/
      )
    ).toBeNull();
    expect(cssSource.includes("margin-bottom: -1px")).toBe(false);
    expect(cssSource.includes("translateY(-4px)")).toBe(false);
    expect(cssSource.includes("rgb(48, 123, 201)")).toBe(false);
    expect(cssSource.includes("#f5e6a8")).toBe(false);
    expect(cssSource.includes("#d4a84a")).toBe(false);
    expect(cssSource.includes("--os-accent-tab-active-bg")).toBe(false);
    expect(cssSource.includes("--os-accent-tab-bar-line")).toBe(false);
  });

  test("aqua glass pref wells and tab panels have semi-transparent backgrounds", () => {
    const cssSource = readSource("src/styles/themes/control-panels-mac.css");
    expect(
      cssSource.includes(
        '[data-os-aqua-material="glass"]\n  .window.window-material-glass'
      )
    ).toBe(true);
    expect(cssSource.includes(".control-panels-pref-well")).toBe(true);
    expect(cssSource.includes(".control-panels-pref-tab-panel")).toBe(true);
    expect(cssSource.includes(".control-panels-pref-form-section")).toBe(true);
    expect(
      cssSource.match(
        /\[data-os-aqua-material="glass"\][\s\S]*?:is\([\s\S]*?\.control-panels-pref-well[\s\S]*?\.control-panels-pref-tab-panel[\s\S]*?\)[\s\S]*?background-color: rgba\(255, 255, 255, 0\.2\) !important/
      )
    ).not.toBeNull();
    expect(
      cssSource.match(
        /\[data-os-aqua-material="glass"\]\[data-os-color-scheme="dark"\][\s\S]*?:is\([\s\S]*?\.control-panels-pref-well[\s\S]*?\.control-panels-pref-tab-panel[\s\S]*?\)[\s\S]*?background-color: rgba\(0, 0, 0, 0\.18\) !important/
      )
    ).not.toBeNull();
    expect(
      cssSource.match(
        /\[data-os-aqua-material="glass"\][\s\S]*?\.control-panels-pref-form-section[\s\S]*?background-color: transparent !important/
      )
    ).not.toBeNull();
    expect(cssSource.includes(".control-panels-pref-format-samples")).toBe(true);
    expect(
      cssSource.match(
        /\[data-os-aqua-material="glass"\][\s\S]*?\.control-panels-pref-format-samples[\s\S]*?background-color: rgba\(0, 0, 0, 0\.035\) !important/
      )
    ).not.toBeNull();
    expect(cssSource.includes(".control-panels-pref-theme-preview")).toBe(true);
    expect(
      cssSource.match(
        /\[data-os-aqua-material="glass"\][\s\S]*?\.control-panels-pref-theme-preview[\s\S]*?background-color: rgba\(0, 0, 0, 0\.035\) !important/
      )
    ).not.toBeNull();
  });

  test("Appearance pane renders live theme preview below preference rows", () => {
    const appearanceSource = readSource(
      "src/apps/control-panels/components/control-panels-app/AppearancePaneContent.tsx"
    );
    const previewSource = readSource(
      "src/apps/control-panels/components/control-panels-app/AppearanceThemePreview.tsx"
    );
    const macosxSceneSource = readSource(
      "src/apps/control-panels/components/control-panels-app/AppearanceMacosxPreviewScene.tsx"
    );
    const cssSource = readSource("src/styles/themes/control-panels-mac.css");
    expect(appearanceSource.includes("AppearanceThemePreview")).toBe(true);
    expect(previewSource.includes("control-panels-pref-theme-preview")).toBe(
      true
    );
    expect(previewSource.includes("data-preview-theme")).toBe(true);
    expect(previewSource.includes("getAccentCssVars")).toBe(true);
    expect(previewSource.includes("resolvePreviewDarkMode")).toBe(true);
    expect(previewSource.includes("AppearanceMacosxPreviewScene")).toBe(true);
    expect(macosxSceneSource.includes("MACOSX_PREVIEW_CANVAS_WIDTH")).toBe(true);
    expect(macosxSceneSource.includes("MACOSX_PREVIEW_INSET")).toBe(true);
    expect(macosxSceneSource.includes("control-panels-theme-preview-scale-host")).toBe(
      true
    );
    expect(macosxSceneSource.includes("control-panels-theme-preview-canvas")).toBe(
      true
    );
    expect(macosxSceneSource.includes("control-panels-theme-preview-scale-box")).toBe(
      false
    );
    expect(macosxSceneSource.includes("Math.min")).toBe(false);
    expect(macosxSceneSource.includes("Math.max(1")).toBe(true);
    expect(macosxSceneSource.includes("control-panels-theme-preview-desktop-live")).toBe(
      true
    );
    expect(macosxSceneSource.includes("useWallpaper")).toBe(true);
    expect(macosxSceneSource.includes("TrafficLightButton")).toBe(true);
    expect(macosxSceneSource.includes("aqua-tab-bar")).toBe(true);
    expect(macosxSceneSource.includes("desktop-background")).toBe(true);
    expect(macosxSceneSource.includes("mac-top-menubar")).toBe(false);
    expect(macosxSceneSource.includes("control-panels-theme-preview-menubar-live")).toBe(
      false
    );
    expect(macosxSceneSource.includes("MACOSX_PREVIEW_WINDOW_WIDTH")).toBe(true);
    expect(macosxSceneSource.includes("computeMacosxPreviewWindowLeft")).toBe(
      true
    );
    expect(macosxSceneSource.includes("style={{ left: windowLeft }}")).toBe(
      true
    );
    expect(
      cssSource.match(
        /\.control-panels-theme-preview-window-live[\s\S]*?left:\s*72px/
      )
    ).toBeNull();
    expect(cssSource.includes("--control-panels-preview-inset")).toBe(true);
    expect(
      cssSource.match(
        /\.control-panels-theme-preview-canvas[\s\S]*?top:\s*var\(--control-panels-preview-inset\)/
      )
    ).not.toBeNull();
    expect(
      cssSource.match(
        /\.control-panels-theme-preview-canvas[\s\S]*?left:\s*var\(--control-panels-preview-inset\)/
      )
    ).not.toBeNull();
    expect(
      cssSource.match(
        /\.control-panels-theme-preview-canvas[\s\S]*?transform-origin:\s*0 0/
      )
    ).not.toBeNull();
    expect(cssSource.includes("control-panels-theme-preview-scale-box")).toBe(
      false
    );
  });

  test("Displays pane keeps shader toggle visible to all users", () => {
    const displaysSource = readSource(
      "src/apps/control-panels/components/control-panels-app/DisplaysPaneContent.tsx"
    );
    expect(displaysSource.includes("shaderEffectEnabled")).toBe(true);
    expect(displaysSource.includes("debugMode")).toBe(false);
    expect(displaysSource.includes("isAdmin")).toBe(false);
    expect(displaysSource.includes("Intentionally visible to all users")).toBe(true);
  });

  test("macosx preview window is centered within visible canvas width", () => {
    const scale = 1;
    const hostWidth = 400;
    const left = computeMacosxPreviewWindowLeft(hostWidth, scale);
    expect(left).toBe((hostWidth - MACOSX_PREVIEW_WINDOW_WIDTH) / 2);

    const scaledHostWidth = 720;
    const scaledScale = Math.max(1, scaledHostWidth / MACOSX_PREVIEW_CANVAS_WIDTH);
    const scaledLeft = computeMacosxPreviewWindowLeft(
      scaledHostWidth,
      scaledScale
    );
    expect(scaledLeft).toBe(
      (MACOSX_PREVIEW_CANVAS_WIDTH - MACOSX_PREVIEW_WINDOW_WIDTH) / 2
    );
  });
});
