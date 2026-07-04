import { Switch } from "@/components/ui/switch";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useSound, Sounds } from "@/hooks/useSound";
import { cn } from "@/lib/utils";
import type { TabStyleConfig } from "@/utils/tabStyles";
import { useAssistantStore } from "@/stores/useAssistantStore";
import {
  ASSISTANT_CHARACTERS,
  type AssistantCharacter,
} from "@/components/assistant/characters";
import {
  ClippySprite,
  useAgentData,
} from "@/components/assistant/ClippySprite";
import { controlPanelItemIconShell } from "./constants";

const TILE_PREVIEW_MAX = 64;
const TILE_PREVIEW_ROW_HEIGHT = 72;

/** Scale a character preview to fit the tile (downscales only — never upscales). */
function getCharacterTileScale(width: number, height: number): number {
  return Math.min(TILE_PREVIEW_MAX / height, TILE_PREVIEW_MAX / width);
}

/** Static character preview (sprite rest pose) scaled to fit a tile. */
function CharacterTilePreview({ character }: { character: AssistantCharacter }) {
  const agentData = useAgentData(character.agentUrl);
  const frameWidth = agentData?.framesize[0] ?? character.width;
  const frameHeight = agentData?.framesize[1] ?? character.height;
  const scale = getCharacterTileScale(frameWidth, frameHeight);

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

export function AssistantPaneContent({ t, tabStyles }: AssistantPaneContentProps) {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const enabled = useAssistantStore((state) => state.enabled);
  const setEnabled = useAssistantStore((state) => state.setEnabled);
  const characterId = useAssistantStore((state) => state.characterId);
  const setCharacterId = useAssistantStore((state) => state.setCharacterId);

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
    <div className="control-panels-pref-form space-y-0 h-full overflow-y-auto">
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

        <div className="@container">
          <div className="grid grid-cols-4 @max-[339px]:grid-cols-2 gap-2 py-1">
            {ASSISTANT_CHARACTERS.map((character) => {
              const isSelected = enabled && character.id === characterId;
              return (
                <button
                  key={character.id}
                  type="button"
                  aria-label={character.name}
                  aria-pressed={isSelected}
                  className="preview-button relative grid w-full aspect-square grid-rows-[72px_11px] content-start justify-items-center gap-0.5 overflow-hidden bg-black/5 cursor-pointer hover:opacity-90"
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
                    <CharacterTilePreview character={character} />
                  </span>
                  <span className="pointer-events-none -mt-[3px] block h-[11px] w-full truncate px-1 text-center font-geneva-12 text-[11px] leading-[11px] text-neutral-600">
                    {character.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-[11px] text-neutral-600 font-geneva-12">
          {t("apps.control-panels.assistant.hint")}
        </p>
      </div>
    </div>
  );
}
