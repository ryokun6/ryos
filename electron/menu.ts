import {
  app,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { checkForUpdates } from "./updater";

const APP_HOMEPAGE = "https://os.ryo.lu";

/**
 * Build and install the native application menu.
 *
 * On macOS this renders in the global menu bar (where "Check for Updates…"
 * conventionally lives, under the app menu). Replacing Electron's default menu
 * means we must re-declare the standard Edit/View/Window roles so system
 * shortcuts (copy/paste/select-all, etc.) keep working.
 *
 * Note: the Windows/Linux windows are frameless, so this native menu bar is not
 * visible there — the in-app ryOS Apple menu exposes "Check for Updates…" for
 * those platforms.
 */
export function buildApplicationMenu(): void {
  const isMac = process.platform === "darwin";

  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: "Check for Updates…",
    click: () => {
      void checkForUpdates(true);
    },
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.getName(),
            submenu: [
              { role: "about" },
              checkForUpdatesItem,
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac
          ? ([
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
              { role: "selectAll" },
            ] as MenuItemConstructorOptions[])
          : ([
              { role: "delete" },
              { type: "separator" },
              { role: "selectAll" },
            ] as MenuItemConstructorOptions[])),
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      role: "windowMenu",
    },
    {
      role: "help",
      submenu: [
        // On non-mac there is no app menu, so surface updates here too.
        ...(!isMac
          ? ([
              checkForUpdatesItem,
              { type: "separator" },
            ] as MenuItemConstructorOptions[])
          : []),
        {
          label: "Learn More",
          click: () => {
            void shell.openExternal(APP_HOMEPAGE);
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
