import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useChatsStore } from "@/stores/useChatsStore";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useFilesStore } from "@/stores/useFilesStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { Trash2, Star } from "lucide-react";

interface Applet {
  id: string;
  title?: string;
  name?: string;
  icon?: string;
  createdAt?: number;
  featured?: boolean;
  createdBy?: string;
}

interface AppStoreProps {
  theme?: string;
}

export function AppStore({ theme }: AppStoreProps) {
  const [applets, setApplets] = useState<Applet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const username = useChatsStore((state) => state.username);
  const authToken = useChatsStore((state) => state.authToken);
  const isAdmin = username?.toLowerCase() === "ryo" && !!authToken;
  const isMacTheme = theme === "macosx";
  const isSystem7Theme = theme === "system7";
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const { saveFile, files } = useFileSystem("/Applets");
  const launchApp = useLaunchApp();
  const fileStore = useFilesStore();

  // Helper function to extract emoji from start of string
  const extractEmojiIcon = (
    text: string
  ): { emoji: string | null; remainingText: string } => {
    const emojiRegex =
      /^([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]+)\s*/u;
    const match = text.match(emojiRegex);

    if (match) {
      return {
        emoji: match[1],
        remainingText: text.slice(match[0].length),
      };
    }

    return {
      emoji: null,
      remainingText: text,
    };
  };

  const fetchApplets = async () => {
    try {
      const response = await fetch("/api/share-applet?list=true");
      if (response.ok) {
        const data = await response.json();
        setApplets(data.applets || []);
      }
    } catch (error) {
      console.error("Error fetching applets:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApplets();
  }, []);

  const handleInstall = async (applet: Applet) => {
    try {
      // Fetch the full applet content
      const response = await fetch(`/api/share-applet?id=${encodeURIComponent(applet.id)}`);
      if (!response.ok) {
        throw new Error("Failed to fetch applet");
      }

      const data = await response.json();
      
      // Prepare filename from applet name/title
      let defaultName = data.name || data.title || "shared-applet";
      
      // Strip emoji from name if present (emoji should be saved as icon metadata, not in filename)
      const { remainingText } = extractEmojiIcon(defaultName);
      defaultName = remainingText;
      
      // Ensure .app extension
      const nameWithExtension = defaultName.endsWith(".app") 
        ? defaultName 
        : `${defaultName}.app`;
      
      // Check if an applet with this shareId already exists (by checking metadata)
      const existingApplet = files.find((f) => {
        const fileItem = fileStore.getItem(f.path);
        return fileItem?.shareId === applet.id;
      });
      
      // Use existing path if found, otherwise use new path with normal name
      const finalPath = existingApplet?.path || `/Applets/${nameWithExtension}`;
      const finalName = existingApplet?.name || nameWithExtension;
      
      // Save the applet to /Applets with shareId and createdBy metadata
      await saveFile({
        path: finalPath,
        name: finalName,
        content: data.content,
        type: "html",
        icon: data.icon || undefined,
        shareId: applet.id,
        createdBy: data.createdBy || applet.createdBy,
      });
      
      // Notify that file was saved
      const event = new CustomEvent("saveFile", {
        detail: {
          name: finalName,
          path: finalPath,
          content: data.content,
          icon: data.icon || undefined,
        },
      });
      window.dispatchEvent(event);
      
      // Launch applet viewer with the saved applet
      launchApp("applet-viewer", {
        initialData: {
          path: finalPath,
          content: data.content,
        },
      });

      toast.success("Applet installed", {
        description: `Saved to /Applets/${finalName}`,
      });
    } catch (error) {
      console.error("Error installing applet:", error);
      toast.error("Failed to install applet", {
        description: error instanceof Error ? error.message : "Please try again later.",
      });
    }
  };

  const handleDelete = async (appletId: string) => {
    if (!isAdmin) return;
    
    if (!confirm("Are you sure you want to delete this applet?")) {
      return;
    }

    try {
      const response = await fetch(`/api/share-applet?id=${encodeURIComponent(appletId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "X-Username": username!,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete applet");
      }

      toast.success("Applet deleted");
      fetchApplets(); // Refresh list
    } catch (error) {
      console.error("Error deleting applet:", error);
      toast.error("Failed to delete applet", {
        description: "Please try again later.",
      });
    }
  };

  const handleToggleFeatured = async (appletId: string, currentFeatured: boolean) => {
    if (!isAdmin) return;

    try {
      const response = await fetch(`/api/share-applet?id=${encodeURIComponent(appletId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Username": username!,
        },
        body: JSON.stringify({ featured: !currentFeatured }),
      });

      if (!response.ok) {
        throw new Error("Failed to update featured status");
      }

      toast.success(currentFeatured ? "Removed from featured" : "Added to featured");
      fetchApplets(); // Refresh list
    } catch (error) {
      console.error("Error updating featured status:", error);
      toast.error("Failed to update featured status", {
        description: "Please try again later.",
      });
    }
  };

  // Add CSS to ensure emoji size doesn't get overridden by theme styles
  const appletIconStyles = `
    .applet-icon {
      font-size: 2.25rem !important;
    }
  `;

  if (isLoading) {
    return (
      <>
        <style>{appletIconStyles}</style>
        <div className="h-full w-full flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-sm text-gray-600 font-geneva-12">Loading...</p>
          </div>
        </div>
      </>
    );
  }

  // Filter applets based on search query
  const filteredApplets = applets.filter((applet) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const displayName = (applet.title || applet.name || "Untitled Applet").toLowerCase();
    const createdBy = (applet.createdBy || "").toLowerCase();
    return displayName.includes(query) || createdBy.includes(query);
  });

  if (applets.length === 0) {
    return (
      <>
        <style>{appletIconStyles}</style>
        <div className="h-full w-full flex items-center justify-center">
          <div className="text-center px-6 font-geneva-12">
            <p className="text-[11px] text-gray-600 font-geneva-12">
              No applets available at this time.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{appletIconStyles}</style>
      <div className="h-full w-full flex flex-col">
      <div
        className={`px-3 py-2 ${
          isXpTheme
            ? "border-b border-[#919b9c]"
            : currentTheme === "macosx"
            ? ""
            : currentTheme === "system7"
            ? "bg-gray-100 border-b border-black"
            : "bg-gray-100 border-b border-gray-300"
        }`}
        style={{
          background: isXpTheme ? "transparent" : undefined,
          backgroundImage: currentTheme === "macosx" ? "var(--os-pinstripe-window)" : undefined,
          borderBottom:
            currentTheme === "macosx"
              ? `var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))`
              : undefined,
        }}
      >
        <Input
          type="text"
          placeholder="Search apps"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`w-full pl-2 ${
            isXpTheme
              ? "!text-[11px]"
              : currentTheme === "macosx"
              ? "!text-[12px] h-[26px]"
              : "!text-[16px]"
          }`}
          style={
            currentTheme === "macosx"
              ? {
                  paddingTop: "2px",
                  paddingBottom: "2px",
                }
              : undefined
          }
        />
      </div>
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="space-y-1">
          {filteredApplets.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-[11px] text-gray-600 font-geneva-12">
                No applets found matching "{searchQuery}".
              </p>
            </div>
          ) : (
            filteredApplets.map((applet) => {
              const displayName = applet.title || applet.name || "Untitled Applet";
              const displayIcon = applet.icon || "📱";
              
              return (
                <div
                  key={applet.id}
                  className="flex items-center gap-3 px-3 py-2 rounded transition-colors odd:bg-gray-200/50"
                >
                  <div 
                    className="!text-4xl flex-shrink-0 applet-icon"
                    style={{ fontSize: '2.25rem' }}
                  >
                    {displayIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm font-geneva-12 truncate">
                        {displayName}
                      </span>
                      {applet.featured && (
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      )}
                    </div>
                    {applet.createdBy && (
                      <div className="text-[10px] text-gray-500 font-geneva-12">
                        {applet.createdBy}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleToggleFeatured(applet.id, applet.featured || false)}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                          title={applet.featured ? "Remove from featured" : "Add to featured"}
                        >
                          <Star 
                            className={`h-4 w-4 ${applet.featured ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`} 
                          />
                        </button>
                        <button
                          onClick={() => handleDelete(applet.id)}
                          className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-400"
                          title="Delete applet"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant={isMacTheme ? "secondary" : isSystem7Theme ? "retro" : "default"}
                      onClick={() => handleInstall(applet)}
                    >
                      Install
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    </>
  );
}
