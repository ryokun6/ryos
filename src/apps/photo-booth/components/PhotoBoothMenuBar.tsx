import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { useAppMenuBar } from "@/hooks/useAppMenuBar";

interface Effect {
  name: string;
  filter: string;
  translationKey: string;
}

interface PhotoBoothMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onClearPhotos: () => void;
  onExportPhotos: () => void;
  effects: Effect[];
  selectedEffect: Effect;
  onEffectSelect: (effect: Effect) => void;
  availableCameras: MediaDeviceInfo[];
  selectedCameraId: string | null;
  onCameraSelect: (deviceId: string) => void;
}

export function PhotoBoothMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onClearPhotos,
  onExportPhotos,
  effects,
  selectedEffect,
  onEffectSelect,
  availableCameras,
  selectedCameraId,
  onCameraSelect,
}: PhotoBoothMenuBarProps) {
  const appId = "photo-booth";
  const {
    t,
    appName,
    isXpTheme,
    isMacOsxTheme,
    isShareDialogOpen,
    setIsShareDialogOpen,
  } = useAppMenuBar(appId);

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onExportPhotos}
            className="text-md h-6 px-3"
          >
            {t("apps.photo-booth.menu.exportPhotos")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onClearPhotos}
            className="text-md h-6 px-3"
          >
            {t("apps.photo-booth.menu.clearAllPhotos")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.photo-booth.menu.camera")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {availableCameras.map((camera) => (
            <MenubarCheckboxItem
              key={camera.deviceId}
              checked={selectedCameraId === camera.deviceId}
              onCheckedChange={(checked) => {
                if (checked) onCameraSelect(camera.deviceId);
              }}
              className="text-md h-6 px-3"
            >
              {camera.label || `${t("apps.photo-booth.menu.camera")} ${camera.deviceId.slice(0, 4)}`}
            </MenubarCheckboxItem>
          ))}
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.photo-booth.menu.effects")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {effects.map((effect) => (
            <MenubarCheckboxItem
              key={effect.name}
              checked={selectedEffect.name === effect.name}
              onCheckedChange={(checked) => {
                if (checked) onEffectSelect(effect);
              }}
              className="text-md h-6 px-3"
            >
              {t(`apps.photo-booth.effects.${effect.translationKey}`)}
            </MenubarCheckboxItem>
          ))}
        </MenubarContent>
      </MenubarMenu>

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.photo-booth.menu.photoBoothHelp")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarItem
                onSelect={() => setIsShareDialogOpen(true)}
                className="text-md h-6 px-3"
              >
                {t("common.menu.shareApp")}
              </MenubarItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={onShowAbout}
                className="text-md h-6 px-3"
              >
                {t("apps.photo-booth.menu.aboutPhotoBooth")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier={appId}
        title={appName}
        generateShareUrl={generateAppShareUrl}
      />
    </MenuBar>
  );
}
