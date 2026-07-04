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

const TILE_PREVIEW_HEIGHT = 64;

/** Static character preview (sprite rest pose or image) scaled into a tile. */
function CharacterTilePreview({ character }: { character: AssistantCharacter }) {
  const agentData = useAgentData(
    character.kind === "sprite" ? character.agentUrl : undefined
  );
  const scale = Math.min(1, TILE_PREVIEW_HEIGHT / character.height);

  return (
    <div
      className="flex items-end justify-center overflow-hidden"
      style={{ height: TILE_PREVIEW_HEIGHT }}
    >
      <div
        style={{ transform: `scale(${scale})`, transformOrigin: "bottom center" }}
      >
        {character.kind === "sprite" ? (
          agentData ? (
            <ClippySprite
              mapUrl={character.mapUrl!}
              data={agentData}
              animation="RestPose"
            />
          ) : (
            <div style={{ width: character.width, height: character.height }} />
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
    setCharacterId(character.id);
    setEnabled(true);
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

        <div className="grid grid-cols-3 gap-2 py-1">
          {ASSISTANT_CHARACTERS.map((character) => {
            const isSelected = enabled && character.id === characterId;
            return (
              <button
                key={character.id}
                type="button"
                aria-label={character.name}
                aria-pressed={isSelected}
                className="preview-button relative w-full aspect-video cursor-pointer hover:opacity-90 flex items-center justify-center overflow-hidden"
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
                <span className="pointer-events-none -mt-4">
                  <CharacterTilePreview character={character} />
                </span>
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent pt-3 pb-1 text-center font-geneva-12 text-[10px] leading-none text-white">
                  {character.name}
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
  );
}
