import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "@phosphor-icons/react";
import { Soundboard } from "@/types/types";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";

interface BoardListProps {
  boards: Soundboard[];
  activeBoardId: string;
  onBoardSelect: (id: string) => void;
  onNewBoard: () => void;
  selectedDeviceId: string;
  onDeviceSelect: (deviceId: string) => void;
  audioDevices: MediaDeviceInfo[];
  micPermissionGranted: boolean;
}

export function BoardList({
  boards,
  activeBoardId,
  onBoardSelect,
  onNewBoard,
  selectedDeviceId,
  onDeviceSelect,
  audioDevices,
  micPermissionGranted,
}: BoardListProps) {
  // Theme detection for border styling
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98" || currentTheme === "win7";
  const isWindowsLegacyTheme = isXpTheme;
  const { t } = useTranslation();

  return (
    <div
      className={`w-full bg-neutral-100 flex flex-col max-h-44 overflow-hidden md:w-56 md:max-h-full font-geneva-12 text-[12px] ${
        isWindowsLegacyTheme
          ? "border-b border-[#919b9c] md:border-r md:border-b-0"
          : currentTheme === "macosx"
          ? "border-b border-black/10 md:border-r md:border-b-0"
          : "border-b border-black md:border-r md:border-b-0"
      }`}
    >
      <div className="py-3 flex flex-col flex-1 overflow-hidden">
        <div className="flex justify-between items-center mb-2 flex-shrink-0 px-3">
          <h2 className="text-[14px] pl-1">{t("apps.soundboard.soundboards")}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewBoard}
            className="flex items-center text-xs hover:bg-black/5 w-[24px] h-[24px]"
          >
            <Plus className="w-3 h-3" weight="bold" />
          </Button>
        </div>
        <div
          className="space-y-1 overscroll-contain w-full flex-1 overflow-y-auto min-h-0"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {boards.map((board) => {
            const isSelected = board.id === activeBoardId;
            return (
              <div
                key={board.id}
                className={cn(
                  "group relative py-1 px-5 cursor-pointer",
                  isSelected ? "" : "hover:bg-black/5"
                )}
                style={
                  isSelected
                    ? {
                        background: "var(--os-color-selection-bg)",
                        color: "var(--os-color-selection-text)",
                      }
                    : undefined
                }
                onClick={() => onBoardSelect(board.id)}
              >
                {board.name}
              </div>
            );
          })}
        </div>

        {micPermissionGranted && (
          <div
            className={`mt-auto pt-2 border-t px-3 pb-3 ${
              isWindowsLegacyTheme ? "border-[#919b9c]" : "border-gray-300"
            }`}
          >
            <Select value={selectedDeviceId} onValueChange={onDeviceSelect}>
              <SelectTrigger className="w-full h-7 text-xs">
                <SelectValue placeholder="Select microphone" />
              </SelectTrigger>
              <SelectContent>
                {audioDevices.map((device) => (
                  <SelectItem
                    key={device.deviceId}
                    value={device.deviceId}
                    className="text-xs"
                  >
                    {device.label ||
                      `Microphone ${device.deviceId.slice(0, 4)}...`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
