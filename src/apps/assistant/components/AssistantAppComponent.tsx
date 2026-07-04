import { useTranslation } from "react-i18next";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { Switch } from "@/components/ui/switch";
import { appMetadata } from "../metadata";
import { AssistantMenuBar } from "./AssistantMenuBar";
import { useAssistantLogic } from "../hooks/useAssistantLogic";
import {
  ASSISTANT_CHARACTERS,
  type AssistantCharacter,
} from "@/components/assistant/characters";
import { ClippySprite, useAgentData } from "@/components/assistant/ClippySprite";
import { cn } from "@/lib/utils";

const PREVIEW_HEIGHT = 84;

function CharacterPreview({ character }: { character: AssistantCharacter }) {
  const agentData = useAgentData(
    character.kind === "sprite" ? character.agentUrl : undefined
  );
  const scale = Math.min(1, PREVIEW_HEIGHT / character.height);

  return (
    <div
      className="flex items-end justify-center overflow-hidden"
      style={{ height: PREVIEW_HEIGHT }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "bottom center",
        }}
      >
        {character.kind === "sprite" ? (
          agentData ? (
            <ClippySprite
              mapUrl={character.mapUrl!}
              data={agentData}
              animation="RestPose"
            />
          ) : (
            <div
              style={{ width: character.width, height: character.height }}
            />
          )
        ) : (
          <img
            src={character.imageUrl}
            alt={character.name}
            draggable={false}
            style={{ width: character.width, height: character.height }}
          />
        )}
      </div>
    </div>
  );
}

export function AssistantAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const { t } = useTranslation();
  const {
    translatedHelpItems,
    isWindowsTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    enabled,
    setEnabled,
    characterId,
    selectCharacter,
  } = useAssistantLogic();

  const menuBar = (
    <AssistantMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      enabled={enabled}
      onToggleEnabled={() => setEnabled(!enabled)}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isWindowsTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.assistant.name")}
        onClose={onClose}
        isForeground={isForeground}
        appId="assistant"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isWindowsTheme ? menuBar : undefined}
      >
        <div className="flex flex-col h-full bg-os-window-bg font-os-ui">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-black/10">
            <div className="min-w-0">
              <div className="text-[13px] font-medium truncate">
                {t("apps.assistant.window.title")}
              </div>
              <div className="text-[11px] opacity-60 truncate">
                {t("apps.assistant.window.subtitle")}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] opacity-70">
                {enabled
                  ? t("apps.assistant.window.on")
                  : t("apps.assistant.window.off")}
              </span>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label={t("apps.assistant.window.toggleLabel")}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ASSISTANT_CHARACTERS.map((character) => {
                const isSelected = character.id === characterId;
                return (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => selectCharacter(character.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-2 pt-3 transition-colors",
                      isSelected && enabled
                        ? "border-black bg-black/5 shadow-[1px_1px_0_rgba(0,0,0,0.3)]"
                        : "border-black/15 hover:border-black/40 hover:bg-black/5"
                    )}
                    aria-pressed={isSelected && enabled}
                  >
                    <CharacterPreview character={character} />
                    <span className="text-[12px]">
                      {character.name}
                      {isSelected && enabled ? " ✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-4 py-2 border-t border-black/10 text-[11px] opacity-60">
            {t("apps.assistant.window.hint")}
          </div>
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="assistant"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="assistant"
      />
    </>
  );
}
