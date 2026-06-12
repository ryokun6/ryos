import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
  type MenuItemDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslation } from "react-i18next";
import { Game, loadGames } from "@/stores/usePcStore";
import { getTranslatedAppName } from "@/utils/i18n";

interface InfinitePcMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onBackToBrowse: () => void;
  onFullScreen: () => void;
  onCaptureScreenshot: () => void;
  hasV86Session: boolean;
  isGameRunning: boolean;
  onSaveState?: () => void;
  onLoadState?: () => void;
  onReset?: () => void;
  onLoadGame?: (game: Game) => void;
  selectedGame?: Game;
  onSetMouseCapture?: (capture: boolean) => void;
  onSetDosFullScreen?: (fullScreen: boolean) => void;
  onSetRenderAspect?: (aspect: string) => void;
  onSetMouseSensitivity?: (sensitivity: number) => void;
  isMouseCaptured?: boolean;
  isDosFullScreen?: boolean;
  currentRenderAspect?: string;
  mouseSensitivity?: number;
}

export function InfinitePcMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onBackToBrowse,
  onFullScreen,
  onCaptureScreenshot,
  hasV86Session,
  isGameRunning,
  onSaveState,
  onLoadState,
  onReset,
  onLoadGame,
  selectedGame,
  onSetMouseCapture,
  onSetDosFullScreen,
  onSetRenderAspect,
  onSetMouseSensitivity,
  isMouseCaptured = false,
  isDosFullScreen = false,
  currentRenderAspect = "4/3",
  mouseSensitivity = 1,
}: InfinitePcMenuBarProps) {
  const { t } = useTranslation();
  const appName = getTranslatedAppName("pc");
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
  } = useAppMenuBarChrome("pc", appName);
  const availableGames = loadGames();
  const renderAspects = ["AsIs", "1/1", "5/4", "4/3", "16/10", "16/9", "Fit"];
  const sensitivityOptions = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  if (isGameRunning && selectedGame && onLoadGame && onReset) {
    const gameMenus: MenuDescriptor[] = [
      {
        label: t("common.menu.file"),
        items: [
          {
            type: "action",
            label: t("apps.pc.menu.backToBrowse"),
            onClick: onBackToBrowse,
          },
          { type: "separator" },
          {
            type: "submenu",
            label: t("apps.pc.menu.loadGame"),
            items: availableGames.map((game) => ({
              type: "action" as const,
              label: game.name,
              onClick: () => onLoadGame(game),
              className: selectedGame.id === game.id ? "bg-neutral-100" : "",
            })),
          },
          { type: "separator" },
          {
            type: "action",
            label: t("apps.pc.menu.saveState"),
            onClick: () => onSaveState?.(),
          },
          {
            type: "action",
            label: t("apps.pc.menu.loadState"),
            onClick: () => onLoadState?.(),
          },
          { type: "separator" },
          {
            type: "action",
            label: t("apps.pc.menu.reset"),
            onClick: onReset,
          },
          { type: "separator" },
          { type: "action", label: t("common.menu.close"), onClick: onClose },
        ],
      },
      {
        label: t("apps.pc.menu.controls"),
        items: [
          {
            type: "action",
            label: t("apps.pc.menu.fullScreen"),
            onClick: () => onSetDosFullScreen?.(!isDosFullScreen),
          },
          { type: "separator" },
          {
            type: "action",
            label: t("apps.pc.menu.toggleMouseCapture"),
            onClick: () => onSetMouseCapture?.(!isMouseCaptured),
          },
          {
            type: "submenu",
            label: t("apps.pc.menu.mouseSensitivity"),
            items: sensitivityOptions.map((sensitivity) => ({
              type: "action" as const,
              label: `${sensitivity}x`,
              onClick: () => onSetMouseSensitivity?.(sensitivity),
              className:
                mouseSensitivity === sensitivity ? "bg-neutral-100" : "",
            })),
          },
          { type: "separator" },
          {
            type: "submenu",
            label: t("apps.pc.menu.aspectRatio"),
            items: renderAspects.map((aspect) => ({
              type: "action" as const,
              label: t(`apps.pc.aspectRatios.${aspect}`, {
                defaultValue: aspect,
              }),
              onClick: () => onSetRenderAspect?.(aspect),
              className:
                currentRenderAspect === aspect ? "bg-neutral-100" : "",
            })),
          },
        ],
      },
    ];

    return (
      <AppMenuBarShell
        isXpTheme={isXpTheme}
        isMacOsxTheme={isMacOsxTheme}
        appId={appId}
        appName={appName}
        isShareDialogOpen={isShareDialogOpen}
        setIsShareDialogOpen={setIsShareDialogOpen}
        helpItemLabel={t("apps.pc.menu.virtualPcHelp")}
        aboutItemLabel={t("apps.pc.menu.aboutVirtualPc")}
        onShowHelp={onShowHelp}
        onShowAbout={onShowAbout}
      >
        <AppMenuBarMenus menus={gameMenus} />
      </AppMenuBarShell>
    );
  }

  const backToBrowseItems: MenuItemDescriptor[] = hasV86Session
    ? [
        {
          type: "action",
          label: t("apps.pc.menu.backToBrowse"),
          onClick: onBackToBrowse,
        },
        { type: "separator" },
      ]
    : [];

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        ...backToBrowseItems,
        { type: "action", label: t("common.menu.close"), onClick: onClose },
      ],
    },
    {
      label: t("common.menu.view"),
      items: [
        {
          type: "action",
          label: t("apps.pc.menu.fullScreen"),
          onClick: onFullScreen,
          disabled: !hasV86Session,
        },
        {
          type: "action",
          label: t("apps.pc.menu.captureScreenshot"),
          onClick: onCaptureScreenshot,
          disabled: !hasV86Session,
        },
      ],
    },
  ];

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.pc.menu.virtualPcHelp")}
      aboutItemLabel={t("apps.pc.menu.aboutVirtualPc")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
