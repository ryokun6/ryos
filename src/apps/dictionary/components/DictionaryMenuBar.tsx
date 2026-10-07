import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import { AppMenuBarMenus } from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { requestCloudSyncDomainCheck } from "@/utils/cloudSyncEvents";
import type { DictionaryView } from "@/stores/useDictionaryStore";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";

interface DictionaryMenuBarProps {
  l: DictionaryLogic;
  onClose: () => void;
  onNewLookup: () => void;
}

export function DictionaryMenuBar({ l, onClose, onNewLookup }: DictionaryMenuBarProps) {
  const { t, phonetics, setPhonetic } = l;
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("dictionary");

  return (
    <AppMenuBarShell
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.dictionary.menu.help")}
      aboutItemLabel={t("apps.dictionary.menu.about")}
      onShowHelp={() => l.setIsHelpDialogOpen(true)}
      onShowAbout={() => l.setIsAboutDialogOpen(true)}
    >
      <AppMenuBarMenus
        menus={[
          {
            label: t("common.menu.file"),
            items: [
              {
                type: "action",
                label: t("apps.dictionary.menu.newLookup"),
                onClick: onNewLookup,
              },
              {
                type: "action",
                label: t("apps.dictionary.menu.clearHistory"),
                onClick: l.clearHistory,
                disabled: l.history.length === 0,
              },
              { type: "separator" },
              {
                type: "action",
                label: t("apps.dictionary.menu.syncFavorites"),
                onClick: () => requestCloudSyncDomainCheck("dictionary"),
              },
              { type: "separator" },
              {
                type: "action",
                label: t("common.menu.close"),
                onClick: onClose,
                shortcutId: "close",
              },
            ],
          },
          {
            label: t("common.menu.view"),
            items: [
              {
                type: "radioGroup",
                value: l.view,
                onValueChange: (value) => l.setView(value as DictionaryView),
                options: [
                  { value: "lookup", label: t("apps.dictionary.views.lookup") },
                  { value: "favorites", label: t("apps.dictionary.views.favorites") },
                  { value: "flashcards", label: t("apps.dictionary.views.flashcards") },
                ],
              },
              { type: "separator" },
              {
                type: "checkbox",
                label: t("apps.dictionary.menu.showSidebar"),
                checked: l.isSidebarVisible,
                onChange: l.setSidebarVisible,
              },
              {
                type: "checkbox",
                label: t("apps.dictionary.menu.handwriting"),
                checked: l.isHandwritingOpen,
                onChange: l.setHandwritingOpen,
              },
              {
                type: "checkbox",
                label: t("apps.dictionary.menu.aiNotes"),
                checked: l.aiExtrasEnabled,
                onChange: l.setAiExtrasEnabled,
              },
            ],
          },
          {
            label: t("apps.dictionary.menu.readings"),
            items: [
              {
                type: "submenu",
                label: t("apps.dictionary.languages.zh"),
                items: [
                  {
                    type: "checkbox",
                    label: t("apps.dictionary.menu.pinyin"),
                    checked: phonetics.pinyin,
                    onChange: (checked) => setPhonetic("pinyin", checked),
                  },
                  {
                    type: "checkbox",
                    label: t("apps.dictionary.menu.zhuyin"),
                    checked: phonetics.zhuyin,
                    onChange: (checked) => setPhonetic("zhuyin", checked),
                  },
                  { type: "separator" },
                  {
                    type: "radioGroup",
                    value: l.chineseScript,
                    onValueChange: (value) =>
                      l.setChineseScript(value as typeof l.chineseScript),
                    options: [
                      {
                        value: "simplified",
                        label: t("apps.dictionary.menu.simplified"),
                      },
                      {
                        value: "traditional",
                        label: t("apps.dictionary.menu.traditional"),
                      },
                    ],
                  },
                ],
              },
              {
                type: "submenu",
                label: t("apps.dictionary.languages.ja"),
                items: [
                  {
                    type: "checkbox",
                    label: t("apps.dictionary.menu.furigana"),
                    checked: phonetics.furigana,
                    onChange: (checked) => setPhonetic("furigana", checked),
                  },
                  {
                    type: "checkbox",
                    label: t("apps.dictionary.menu.romaji"),
                    checked: phonetics.romaji,
                    onChange: (checked) => setPhonetic("romaji", checked),
                  },
                ],
              },
              {
                type: "checkbox",
                label: t("apps.dictionary.menu.koreanRomanization"),
                checked: phonetics.koreanRomanization,
                onChange: (checked) => setPhonetic("koreanRomanization", checked),
              },
            ],
          },
        ]}
      />
    </AppMenuBarShell>
  );
}
