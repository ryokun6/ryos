import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useChatsStore } from "@/stores/useChatsStore";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { useLaunchApp } from "@/hooks/useLaunchApp";
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
  const username = useChatsStore((state) => state.username);
  const authToken = useChatsStore((state) => state.authToken);
  const isAdmin = username?.toLowerCase() === "ryo" && !!authToken;
  const isMacTheme = theme === "macosx";
  const isSystem7Theme = theme === "system7";
  const { saveFile } = useFileSystem("/Applets");
  const launchApp = useLaunchApp();

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
      
      const filePath = `/Applets/${nameWithExtension}`;
      
      // Save the applet to /Applets
      await saveFile({
        path: filePath,
        name: nameWithExtension,
        content: data.content,
        type: "html",
        icon: data.icon || undefined,
      });
      
      // Notify that file was saved
      const event = new CustomEvent("saveFile", {
        detail: {
          name: nameWithExtension,
          path: filePath,
          content: data.content,
          icon: data.icon || undefined,
        },
      });
      window.dispatchEvent(event);
      
      // Launch applet viewer with the saved applet
      launchApp("applet-viewer", {
        path: filePath,
        content: data.content,
      });

      toast.success("Applet installed", {
        description: `Saved to /Applets/${nameWithExtension}`,
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

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-sm text-gray-600 font-geneva-12">Loading...</p>
        </div>
      </div>
    );
  }

  if (applets.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center px-6 font-geneva-12">
          <p className="text-[11px] text-gray-600 font-geneva-12">
            No applets available at this time.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="space-y-1">
        {applets.map((applet) => {
          const displayName = applet.title || applet.name || "Untitled Applet";
          const displayIcon = applet.icon || "📱";
          
          return (
            <div
              key={applet.id}
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 rounded transition-colors"
            >
              <div className="text-2xl flex-shrink-0">{displayIcon}</div>
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
                  <div className="text-xs text-gray-500 font-geneva-12 mt-0.5">
                    by {applet.createdBy}
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
                      className="p-1 hover:bg-red-100 rounded transition-colors text-red-600"
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
        })}
      </div>
    </div>
  );
}
