import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import type { KaraokeMenuBarViewModel } from "./useKaraokeMenuBar";

export function KaraokeMenuBarLibraryMenu({
  vm,
}: {
  vm: KaraokeMenuBarViewModel;
}) {
  const {
    t,
    tracks,
    currentIndex,
    onAddSong,
    onPlayTrack,
    tracksByArtist,
    artists,
    onClearLibrary,
    onSyncLibrary,
  } = vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
        {t("apps.ipod.menu.library")}
      </MenubarTrigger>
      <MenubarContent
        align="start"
        sideOffset={1}
        className="px-0 max-w-[180px] sm:max-w-[220px]"
      >
        <MenubarItem onClick={onAddSong} className="text-md h-6 px-3">
          {t("apps.ipod.menu.addToLibrary")}
        </MenubarItem>

        {tracks.length > 0 && (
          <>
            <MenubarSeparator className="h-[2px] bg-black my-1" />

            <MenubarSub>
              <MenubarSubTrigger className="text-md h-6 px-3">
                <div className="flex justify-between w-full items-center overflow-hidden">
                  <span className="truncate min-w-0">
                    {t("apps.ipod.menu.allSongs")}
                  </span>
                </div>
              </MenubarSubTrigger>
              <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px] max-h-[400px] overflow-y-auto">
                {tracks.map((track, index) => (
                  <MenubarCheckboxItem
                    key={`all-${track.id}`}
                    checked={index === currentIndex}
                    onCheckedChange={() => onPlayTrack(index)}
                    className="text-md h-6 pr-3 max-w-[220px] truncate"
                  >
                    <span className="truncate min-w-0">{track.title}</span>
                  </MenubarCheckboxItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>

            <div className="max-h-[300px] overflow-y-auto">
              {artists.map((artist) => (
                <MenubarSub key={artist}>
                  <MenubarSubTrigger className="text-md h-6 px-3">
                    <div className="flex justify-between w-full items-center overflow-hidden">
                      <span className="truncate min-w-0">{artist}</span>
                    </div>
                  </MenubarSubTrigger>
                  <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px] max-h-[200px] overflow-y-auto">
                    {tracksByArtist[artist].map(({ track, index }) => (
                      <MenubarCheckboxItem
                        key={`${artist}-${track.id}`}
                        checked={index === currentIndex}
                        onCheckedChange={() => onPlayTrack(index)}
                        className="text-md h-6 pr-3 max-w-[160px] sm:max-w-[200px] truncate"
                      >
                        <span className="truncate min-w-0">{track.title}</span>
                      </MenubarCheckboxItem>
                    ))}
                  </MenubarSubContent>
                </MenubarSub>
              ))}
            </div>

            <MenubarSeparator className="h-[2px] bg-black my-1" />
          </>
        )}

        <MenubarItem onClick={onClearLibrary} className="text-md h-6 px-3">
          {t("apps.ipod.menu.clearLibrary")}
        </MenubarItem>
        <MenubarItem onClick={onSyncLibrary} className="text-md h-6 px-3">
          {t("apps.ipod.menu.syncLibrary")}
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
