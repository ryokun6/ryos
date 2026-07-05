import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useSound, Sounds } from "@/hooks/useSound";
import { cn } from "@/lib/utils";
import type { TabStyleConfig } from "@/utils/tabStyles";
import { useAssistantStore } from "@/stores/useAssistantStore";
import {
  ASSISTANT_INSTRUCTIONS_MAX_LENGTH,
  ASSISTANT_RESPONSE_STYLES,
  normalizeAssistantResponseStyle,
} from "@/shared/assistantCustomization";
import {
  ASSISTANT_CHARACTERS,
  type AssistantCharacter,
} from "@/components/assistant/characters";
import {
  ClippySprite,
  useAgentData,
} from "@/components/assistant/ClippySprite";
import { controlPanelItemIconShell } from "./constants";
import { ControlPanelsPrefFormRow } from "./ControlPanelsPrefFormRow";
import { useControlPanelsTabClasses } from "./useControlPanelsTabClasses";

const TILE_PREVIEW_MAX = 64;

/** Horizontal breathing room inside a tile so previews never touch the edges. */
const TILE_PREVIEW_INSET = 6;

/** Scale a character preview to fit the tile (downscales only — never upscales). */
function getCharacterTileScale(
  width: number,
  height: number,
  maxWidth: number
): number {
  return Math.min(
    TILE_PREVIEW_MAX / height,
    Math.min(TILE_PREVIEW_MAX, maxWidth) / width
  );
}

/** Static character preview (sprite rest pose) scaled to fit a tile. */
function CharacterTilePreview({
  character,
  maxWidth = TILE_PREVIEW_MAX,
}: {
  character: AssistantCharacter;
  maxWidth?: number;
}) {
  const agentData = useAgentData(character.agentUrl);
  const frameWidth = agentData?.framesize[0] ?? character.width;
  const frameHeight = agentData?.framesize[1] ?? character.height;
  const scale = getCharacterTileScale(frameWidth, frameHeight, maxWidth);

  return (
    <div
      style={{
        width: frameWidth * scale,
        height: frameHeight * scale,
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {agentData ? (
          <ClippySprite
            mapUrl={character.mapUrl}
            data={agentData}
            characterId={character.id}
            animation="RestPose"
            muted
          />
        ) : (
          <div style={{ width: frameWidth, height: frameHeight }} />
        )}
      </div>
    </div>
  );
}

export type AssistantPaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  tabStyles: TabStyleConfig;
};

type AssistantPaneTab = "character" | "behavior";

export function AssistantPaneContent({ t, tabStyles }: AssistantPaneContentProps) {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const [paneTab, setPaneTab] = useState<AssistantPaneTab>("character");
  const { barClassName, triggerClassName, triggerStyle } =
    useControlPanelsTabClasses();

  const enabled = useAssistantStore((state) => state.enabled);
  const setEnabled = useAssistantStore((state) => state.setEnabled);
  const characterId = useAssistantStore((state) => state.characterId);
  const setCharacterId = useAssistantStore((state) => state.setCharacterId);
  const speechEnabled = useAssistantStore((state) => state.speechEnabled);
  const setSpeechEnabled = useAssistantStore((state) => state.setSpeechEnabled);
  const greetOnSummon = useAssistantStore((state) => state.greetOnSummon);
  const setGreetOnSummon = useAssistantStore((state) => state.setGreetOnSummon);
  const responseStyle = useAssistantStore((state) => state.responseStyle);
  const setResponseStyle = useAssistantStore((state) => state.setResponseStyle);
  const customInstructions = useAssistantStore(
    (state) => state.customInstructions
  );
  const setCustomInstructions = useAssistantStore(
    (state) => state.setCustomInstructions
  );

  // The grid is always 4 columns, so previews must shrink with the tile
  // width when the pane is narrow (the sprite scale is computed in JS).
  const characterGridRef = useRef<HTMLDivElement | null>(null);
  const [previewMaxWidth, setPreviewMaxWidth] = useState(TILE_PREVIEW_MAX);
  useEffect(() => {
    const grid = characterGridRef.current;
    if (!grid) return;
    const measure = () => {
      if (grid.clientWidth <= 0) return; // hidden tab panel
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      const tileWidth = (grid.clientWidth - gap * 3) / 4;
      setPreviewMaxWidth(
        Math.min(TILE_PREVIEW_MAX, Math.max(24, tileWidth - TILE_PREVIEW_INSET))
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const handleCharacterSelect = (character: AssistantCharacter) => {
    playClick();
    if (character.id !== characterId) {
      setCharacterId(character.id);
    }
    if (!enabled) {
      setEnabled(true);
    }
  };

  return (
    <div className="control-panels-pref-form control-panels-pref-form-tabbed">
      <div className="control-panels-pref-tabbed">
        <div
          role="tablist"
          className={cn("control-panels-pref-tab-bar", barClassName)}
          aria-label={t("apps.control-panels.assistant.title")}
        >
          <button
            type="button"
            role="tab"
            className={triggerClassName}
            style={triggerStyle}
            data-state={paneTab === "character" ? "active" : "inactive"}
            aria-selected={paneTab === "character"}
            onClick={() => setPaneTab("character")}
          >
            {t("apps.control-panels.assistant.tabs.character")}
          </button>
          <button
            type="button"
            role="tab"
            className={triggerClassName}
            style={triggerStyle}
            data-state={paneTab === "behavior" ? "active" : "inactive"}
            aria-selected={paneTab === "behavior"}
            onClick={() => setPaneTab("behavior")}
          >
            {t("apps.control-panels.assistant.tabs.behavior")}
          </button>
        </div>
        <div className="control-panels-pref-well">
          <div
            role="tabpanel"
            className="control-panels-pref-tab-panel"
            hidden={paneTab !== "character"}
            aria-hidden={paneTab !== "character"}
          >
            <div className="control-panels-pref-form-section">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      controlPanelItemIconShell,
                      "flex items-center justify-center overflow-hidden"
                    )}
                  >
                    <ThemedIcon
                      name="assistant.png"
                      alt=""
                      className="size-8 object-contain"
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <span className="block text-[13px] font-geneva-12 font-medium leading-tight truncate">
                      {t("apps.control-panels.assistant.title")}
                    </span>
                    <p className="text-[11px] text-neutral-600 font-geneva-12 leading-tight truncate">
                      {t("apps.control-panels.assistant.description")}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  className="data-[state=checked]:bg-[#000000]"
                />
              </div>

              <hr className="border-t" style={tabStyles.separatorStyle} />

              <div ref={characterGridRef} className="grid grid-cols-4 gap-2 py-1">
                {ASSISTANT_CHARACTERS.map((character) => {
                  const isSelected = enabled && character.id === characterId;
                  const characterName = t(character.nameKey);
                  return (
                    <button
                      key={character.id}
                      type="button"
                      aria-label={characterName}
                      aria-pressed={isSelected}
                      className="preview-button relative grid w-full h-[90px] grid-rows-[72px_11px] content-start justify-items-center gap-0.5 overflow-hidden bg-black/5 cursor-pointer hover:opacity-90"
                      style={{
                        boxShadow: isSelected
                          ? "0 0 0 1px var(--os-color-selection-ring-gap), 0 0 0 3px var(--os-color-selection-bg)"
                          : undefined,
                      }}
                      onClick={() => handleCharacterSelect(character)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleCharacterSelect(character);
                        }
                      }}
                    >
                      <span className="pointer-events-none flex h-[72px] w-full items-center justify-center">
                        <CharacterTilePreview
                          character={character}
                          maxWidth={previewMaxWidth}
                        />
                      </span>
                      <span className="pointer-events-none -mt-[3px] block h-[11px] w-full truncate px-1 text-center font-geneva-12 text-[11px] leading-[11px] text-neutral-600">
                        {characterName}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-neutral-600 font-geneva-12">
                {t("apps.control-panels.assistant.hint")}
              </p>
            </div>
          </div>
          <div
            role="tabpanel"
            className="control-panels-pref-tab-panel"
            hidden={paneTab !== "behavior"}
            aria-hidden={paneTab !== "behavior"}
          >
            <div className="control-panels-pref-form-section">
              <ControlPanelsPrefFormRow
                label={t("apps.control-panels.assistant.behavior.greeting")}
                description={t(
                  "apps.control-panels.assistant.behavior.greetingDescription"
                )}
              >
                <Switch
                  checked={greetOnSummon}
                  onCheckedChange={setGreetOnSummon}
                  className="data-[state=checked]:bg-[#000000]"
                />
              </ControlPanelsPrefFormRow>

              <ControlPanelsPrefFormRow
                label={t("apps.control-panels.assistant.behavior.speech")}
                description={t(
                  "apps.control-panels.assistant.behavior.speechDescription"
                )}
              >
                <Switch
                  checked={speechEnabled}
                  onCheckedChange={setSpeechEnabled}
                  className="data-[state=checked]:bg-[#000000]"
                />
              </ControlPanelsPrefFormRow>

              <ControlPanelsPrefFormRow
                label={t("apps.control-panels.assistant.behavior.responseStyle")}
                description={t(
                  "apps.control-panels.assistant.behavior.responseStyleDescription"
                )}
              >
                <Select
                  value={responseStyle}
                  onValueChange={(value) =>
                    setResponseStyle(normalizeAssistantResponseStyle(value))
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSISTANT_RESPONSE_STYLES.map((style) => (
                      <SelectItem key={style} value={style}>
                        {t(
                          `apps.control-panels.assistant.behavior.responseStyleOptions.${style}`
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ControlPanelsPrefFormRow>

              <hr className="border-t" style={tabStyles.separatorStyle} />

              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-geneva-12">
                    {t("apps.control-panels.assistant.behavior.instructions")}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-geneva-12 tabular-nums">
                    {customInstructions.length}/{ASSISTANT_INSTRUCTIONS_MAX_LENGTH}
                  </span>
                </div>
                <Textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  maxLength={ASSISTANT_INSTRUCTIONS_MAX_LENGTH}
                  rows={4}
                  className="min-h-20 max-h-40 font-geneva-12 text-[12px] md:text-[12px]"
                  placeholder={t(
                    "apps.control-panels.assistant.behavior.instructionsPlaceholder"
                  )}
                  aria-label={t(
                    "apps.control-panels.assistant.behavior.instructions"
                  )}
                />
                <p className="text-[11px] text-neutral-600 font-geneva-12">
                  {t("apps.control-panels.assistant.behavior.instructionsHint")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
