import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
import type { KaraokeMenuBarViewModel } from "./useKaraokeMenuBar";

export function KaraokeMenuBarFileMenu({ vm }: { vm: KaraokeMenuBarViewModel }) {
  const {
    t,
    tracks,
    currentIndex,
    onAddSong,
    onShareSong,
    isInListenSession,
    isListenSessionHost,
    onStartListenSession,
    onJoinListenSession,
    onShareListenSession,
    onLeaveListenSession,
    handleExportLibrary,
    handleImportLibrary,
    onClose,
  } = vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
        {t("apps.karaoke.menu.file")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        <MenubarItem onClick={onAddSong} className="text-md h-6 px-3">
          {t("apps.ipod.menu.addSong")}
        </MenubarItem>
        <MenubarItem
          onClick={onShareSong}
          className="text-md h-6 px-3"
          disabled={tracks.length === 0 || currentIndex === -1}
        >
          {t("apps.ipod.menu.shareSong")}
        </MenubarItem>
        <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
        {!isInListenSession ? (
          <>
            <MenubarItem
              onClick={onStartListenSession}
              className="text-md h-6 px-3"
            >
              {t("apps.karaoke.liveListen.start")}
            </MenubarItem>
            <MenubarItem
              onClick={onJoinListenSession}
              className="text-md h-6 px-3"
            >
              {t("apps.karaoke.liveListen.join")}
            </MenubarItem>
          </>
        ) : (
          <>
            <MenubarItem
              onClick={onShareListenSession}
              className="text-md h-6 px-3"
            >
              {t("apps.karaoke.liveListen.invite")}
            </MenubarItem>
            <MenubarItem
              onClick={onLeaveListenSession}
              className="text-md h-6 px-3"
            >
              {isListenSessionHost
                ? t("apps.karaoke.liveListen.end")
                : t("apps.karaoke.liveListen.leave")}
            </MenubarItem>
          </>
        )}
        <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
        <MenubarItem
          onClick={handleExportLibrary}
          className="text-md h-6 px-3"
          disabled={tracks.length === 0}
        >
          {t("apps.ipod.menu.exportLibrary")}
        </MenubarItem>
        <MenubarItem
          onClick={handleImportLibrary}
          className="text-md h-6 px-3"
        >
          {t("apps.ipod.menu.importLibrary")}
        </MenubarItem>
        <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
        <MenubarItem onClick={onClose} className="text-md h-6 px-3">
          {t("common.menu.close")}
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
