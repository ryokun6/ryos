import { X } from "@phosphor-icons/react";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemedTabsContent } from "@/components/shared/ThemedTabs";
import { cn } from "@/lib/utils";
import type { CreateRoomDialogViewModel } from "./useCreateRoomDialog";

type Props = Pick<
  CreateRoomDialogViewModel,
  | "t"
  | "theme"
  | "searchTerm"
  | "setSearchTerm"
  | "isLoading"
  | "isSearching"
  | "selectedUsers"
  | "users"
  | "toggleUserSelection"
>;

export function CreateRoomDialogPrivateTab(props: Props) {
  const {
    t,
    theme,
    searchTerm,
    setSearchTerm,
    isLoading,
    isSearching,
    selectedUsers,
    users,
    toggleUserSelection,
  } = props;
  const { themeFont, themeFontStyle, isWindowsTheme } = theme;

  return (
    <ThemedTabsContent value="private">
<div className="p-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label
                  htmlFor="search-users"
                  className={cn("text-neutral-700", themeFont)}
                  style={themeFontStyle}
                >
                  {t("apps.chats.dialogs.addUsersToPrivateChat")}
                </Label>
                <div className="relative">
                  <Input
                    id="search-users"
                    placeholder={t(
                      "apps.chats.dialogs.searchUsernamePlaceholder"
                    )}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={cn("shadow-none h-8 pr-8", themeFont)}
                    style={themeFontStyle}
                    disabled={isLoading}
                  />
                  {isSearching && searchTerm.length >= 2 && (
                    <ActivityIndicator
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500"
                    />
                  )}
                </div>

                {/* Selected users tokens */}
                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedUsers.map((username) => (
                      <Badge
                        key={username}
                        variant="secondary"
                        className={cn(
                          "py-0.5 pl-2 pr-1 bg-neutral-100 hover:bg-neutral-200 border-neutral-300",
                          isWindowsTheme
                            ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                            : "font-geneva-12 text-[11px]"
                        )}
                        style={
                          isWindowsTheme
                            ? {
                                fontFamily:
                                  '"Pixelated MS Sans Serif", "ArkPixel", Arial',
                                fontSize: "10px",
                              }
                            : undefined
                        }
                      >
                        @{username}
                        <button
                          type="button"
                          onClick={() => toggleUserSelection(username)}
                          className="ml-1 hover:bg-neutral-300 rounded-sm p-0.5"
                          disabled={isLoading}
                        >
                          <X className="size-3" weight="bold" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Show results */}
              {!isSearching && searchTerm.length >= 2 && users.length > 0 && (
                <div className="border border-neutral-300 rounded max-h-[180px] overflow-y-auto bg-white">
                  <div className="p-1">
                    {users.map((user) => (
                      <label
                        key={user.username}
                        className={cn(
                          "flex items-center p-2 hover:bg-neutral-100 cursor-pointer rounded",
                          themeFont
                        )}
                        style={themeFontStyle}
                      >
                        <Checkbox
                          checked={selectedUsers.includes(user.username)}
                          onCheckedChange={() =>
                            toggleUserSelection(user.username)
                          }
                          className="size-4"
                          disabled={isLoading}
                        />
                        <span className="ml-2">@{user.username}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
    </ThemedTabsContent>
  );
}
