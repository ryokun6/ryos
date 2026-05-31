import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemedTabsContent } from "@/components/shared/ThemedTabs";
import { cn } from "@/lib/utils";
import type { CreateRoomDialogViewModel } from "./useCreateRoomDialog";

type Props = Pick<
  CreateRoomDialogViewModel,
  "t" | "theme" | "roomName" | "setRoomName" | "isLoading"
>;

export function CreateRoomDialogPublicTab({
  t,
  theme,
  roomName,
  setRoomName,
  isLoading,
}: Props) {
  const { themeFont, themeFontStyle } = theme;

  return (
    <ThemedTabsContent value="public">
<div className="p-4">
              <div className="space-y-2">
                <Label
                  htmlFor="room-name"
                  className={cn("text-neutral-700", themeFont)}
                  style={themeFontStyle}
                >
                  {t("apps.chats.dialogs.roomName")}
                </Label>
                <div className="relative">
                  <span
                    className={cn(
                      "absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none",
                      themeFont
                    )}
                    style={themeFontStyle}
                  >
                    #
                  </span>
                  <Input
                    id="room-name"
                    value={roomName}
                    onChange={(e) => {
                      // Remove # if user types it
                      const value = e.target.value.replace(/^#/, "");
                      setRoomName(value);
                    }}
                    placeholder={t("apps.chats.dialogs.roomNamePlaceholder")}
                    className={cn("shadow-none h-8 pl-6", themeFont)}
                    style={themeFontStyle}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>
    </ThemedTabsContent>
  );
}
