import { MenubarShortcut } from "@/components/ui/menubar";
import { formatShortcut, type ShortcutId } from "@/utils/shortcuts";
import { useIsMobile } from "@/hooks/useIsMobile";

/**
 * Renders a right-aligned keyboard-shortcut hint inside a `MenubarItem` /
 * `MenubarCheckboxItem`. Renders nothing when the shortcut isn't available in
 * the current environment (e.g. a browser-reserved combo on the web), or on
 * mobile/phone-sized screens where there's no hardware keyboard, so menus
 * never advertise a shortcut that can't fire.
 */
export function ShortcutHint({ id }: { id: ShortcutId }) {
  const isMobile = useIsMobile();
  const label = formatShortcut(id);
  if (isMobile || !label) return null;
  return <MenubarShortcut>{label}</MenubarShortcut>;
}
