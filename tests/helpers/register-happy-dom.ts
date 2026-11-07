import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * Install happy-dom for the current test file.
 *
 * Returns whether this file performed the install. Pair it with
 * `uninstallHappyDom` from the file's last `afterAll`: Bun runs every unit
 * file in one process, and a leaked registrator replaces `URL`, `Request`,
 * and `fetch` for later files. Register the uninstall hook after any other
 * `afterAll` that still needs `window`.
 */
export function installHappyDom(): boolean {
  if (GlobalRegistrator.isRegistered) return false;
  GlobalRegistrator.register();
  return true;
}

export async function uninstallHappyDom(installedByFile: boolean): Promise<void> {
  if (installedByFile && GlobalRegistrator.isRegistered) {
    await GlobalRegistrator.unregister();
  }
}
