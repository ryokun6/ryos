import { MenubarShortcut } from "@/components/ui/menubar";
import { formatShortcut, type ShortcutId } from "@/utils/shortcuts";

/**
 * Renders a right-aligned keyboard-shortcut hint inside a `MenubarItem` /
 * `MenubarCheckboxItem`. Renders nothing when the shortcut isn't available in
 * the current environment (e.g. a browser-reserved combo on the web), so menus
 * never advertise a shortcut that can't fire.
 */
export function ShortcutHint({ id }: { id: ShortcutId }) {
  const label = formatShortcut(id);
  if (!label) return null;
  return <MenubarShortcut>{label}</MenubarShortcut>;
}
