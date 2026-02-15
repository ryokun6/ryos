import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { helpItems } from "..";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { clearAllAppStates } from "@/stores/useAppStore";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
import {
  useAppStoreShallow,
  useAudioSettingsStoreShallow,
  useDisplaySettingsStoreShallow,
} from "@/stores/helpers";
import { setNextBootMessage, clearNextBootMessage } from "@/utils/bootMessage";
import { clearPrefetchFlag, forceRefreshCache } from "@/utils/prefetch";
import { AI_MODEL_METADATA } from "@/types/aiModels";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useThemeStore } from "@/stores/useThemeStore";
import { getApiUrl } from "@/utils/platform";
import { getTranslatedAppName } from "@/utils/i18n";
import { getTabStyles } from "@/utils/tabStyles";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { ControlPanelsInitialData } from "@/apps/base/types";
import { abortableFetch } from "@/utils/abortableFetch";

interface StoreItem {
  name: string;
  content?: string;
  type?: string;
  modifiedAt?: string;
  size?: number;
  [key: string]: unknown;
}

interface StoreItemWithKey {
  key: string;
  value: StoreItem;
}

type PhotoCategory =
  | "3d_graphics"
  | "convergency"
  | "foliage"
  | "landscapes"
  | "nostalgia"
  | "objects"
  | "structures";

const PHOTO_WALLPAPERS: Record<PhotoCategory, string[]> = {
  "3d_graphics": [
    "capsule",
    "capsule_azul",
    "capsule_pistachio",
    "tub",
    "tub_azul",
    "tub_bondi",
    "ufo_1",
    "ufo_2",
    "ufo_3",
  ],
  convergency: Array.from({ length: 15 }, (_, i) => `convergence_${i + 1}`),
  foliage: [
    "blue_flowers",
    "cactus",
    "golden_poppy",
    "red_cyclamens",
    "red_tulips",
    "rose",
    "spider_lily",
    "waterdrops_on_leaf",
    "yellow_tulips",
  ],
  landscapes: [
    "beach",
    "clouds",
    "french_alps",
    "ganges_river",
    "golden_gate_at_dusk",
    "mono_lake",
    "palace_on_lake_in_jaipur",
    "rain_god_mesa",
    "refuge-col_de_la_grasse-alps",
    "zabriskie_point",
  ],
  nostalgia: [
    "acropolis",
    "beach_on_ko_samui",
    "birds_in_flight",
    "cancun_sunset",
    "cliffs_of_moher",
    "fish_eagle",
    "galway_bay",
    "glacier_national_park",
    "highway_395",
    "hong_kong_at_night",
    "islamorada_sunrise",
    "lily_pad",
    "long_island_sound",
    "mac_os_background",
    "midsummer_night",
    "moraine_lake",
    "oasis_in_baja",
    "red_clouds",
    "toronto_skyline",
    "tuolumne_meadows",
    "yosemite_valley",
    "yucatan",
  ],
  objects: [
    "alpine_granite",
    "bicycles",
    "bottles",
    "burmese_claypots",
    "burning_candle",
    "chairs",
    "faucet_handle",
    "neon",
    "salt_shaker_top",
    "shamus",
  ],
  structures: [
    "gate",
    "gate_lock",
    "glass_door_knob",
    "padlock",
    "rusty_lock",
    "shutters",
    "stone_wall",
    "wall_of_stones",
  ],
};

// Transform photo paths
Object.entries(PHOTO_WALLPAPERS).forEach(([category, photos]) => {
  PHOTO_WALLPAPERS[category as PhotoCategory] = photos.map(
    (name) => `/wallpapers/photos/${category}/${name}.jpg`
  );
});

// Use shared AI model metadata
const AI_MODELS = AI_MODEL_METADATA;

// Utility to convert Blob to base64 string for JSON serialization
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string; // data:<mime>;base64,xxxx
      resolve(dataUrl);
    };
    reader.onerror = (error) => {
      console.error("Error converting blob to base64:", error);
      reject(error);
    };
    reader.readAsDataURL(blob);
  });

// Utility to convert base64 data URL back to Blob
const base64ToBlob = (dataUrl: string): Blob => {
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = meta.match(/data:(.*);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(base64);
  const array = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new Blob([array], { type: mime });
};

export interface UseControlPanelsLogicProps {
  initialData?: ControlPanelsInitialData;
}

export function useControlPanelsLogic({
  initialData,
}: UseControlPanelsLogicProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems(
    "control-panels",
    helpItems
  );
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmFormatOpen, setIsConfirmFormatOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileToRestoreRef = useRef<File | null>(null);
  const { formatFileSystem } = useFileSystem();
  // AI model settings from app store
  const { aiModel, setAiModel } = useAppStoreShallow((s) => ({
    aiModel: s.aiModel,
    setAiModel: s.setAiModel,
  }));

  // Display settings from display settings store
  const {
    debugMode,
    setDebugMode,
    shaderEffectEnabled,
    setShaderEffectEnabled,
    setCurrentWallpaper,
  } = useDisplaySettingsStoreShallow((s) => ({
    debugMode: s.debugMode,
    setDebugMode: s.setDebugMode,
    shaderEffectEnabled: s.shaderEffectEnabled,
    setShaderEffectEnabled: s.setShaderEffectEnabled,
    setCurrentWallpaper: s.setCurrentWallpaper,
  }));

  // Audio settings from audio settings store
  const {
    terminalSoundsEnabled,
    setTerminalSoundsEnabled,
    uiSoundsEnabled,
    setUiSoundsEnabled,
    uiVolume,
    setUiVolume,
    speechEnabled,
    setSpeechEnabled,
    chatSynthVolume,
    setChatSynthVolume,
    speechVolume,
    setSpeechVolume,
    ttsModel,
    setTtsModel,
    ttsVoice,
    setTtsVoice,
    synthPreset,
    setSynthPreset,
    ipodVolume,
    setIpodVolume,
    masterVolume,
    setMasterVolume,
  } = useAudioSettingsStoreShallow((s) => ({
    terminalSoundsEnabled: s.terminalSoundsEnabled,
    setTerminalSoundsEnabled: s.setTerminalSoundsEnabled,
    uiSoundsEnabled: s.uiSoundsEnabled,
    setUiSoundsEnabled: s.setUiSoundsEnabled,
    uiVolume: s.uiVolume,
    setUiVolume: s.setUiVolume,
    speechEnabled: s.speechEnabled,
    setSpeechEnabled: s.setSpeechEnabled,
    chatSynthVolume: s.chatSynthVolume,
    setChatSynthVolume: s.setChatSynthVolume,
    speechVolume: s.speechVolume,
    setSpeechVolume: s.setSpeechVolume,
    ttsModel: s.ttsModel,
    setTtsModel: s.setTtsModel,
    ttsVoice: s.ttsVoice,
    setTtsVoice: s.setTtsVoice,
    synthPreset: s.synthPreset,
    setSynthPreset: s.setSynthPreset,
    ipodVolume: s.ipodVolume,
    setIpodVolume: s.setIpodVolume,
    masterVolume: s.masterVolume,
    setMasterVolume: s.setMasterVolume,
  }));

  // Theme state
  const currentTheme = useThemeStore((state) => state.current);
  const setTheme = useThemeStore((state) => state.setTheme);

  // Language state
  const currentLanguage = useLanguageStore((state) => state.current);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  // Use auth hook
  const {
    username,
    authToken,
    promptSetUsername,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    hasPassword,
    setPassword,
    logout,
    confirmLogout,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
  } = useAuth();

  // Password dialog states
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Log out all devices state
  const [isLoggingOutAllDevices, setIsLoggingOutAllDevices] = useState(false);

  // Password status is now automatically checked by the store when username/token changes

  // Debug hasPassword value
  useEffect(() => {
    console.log(
      "[ControlPanel] hasPassword value:",
      hasPassword,
      "type:",
      typeof hasPassword
    );
  }, [hasPassword]);

  const handleSetPassword = async (password: string) => {
    setIsSettingPassword(true);
    setPasswordError(null);

    if (!password || password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      setIsSettingPassword(false);
      return;
    }

    const result = await setPassword(password);

    if (result.ok) {
      toast.success("Password Set", {
        description: "You can now use your password to recover your account",
      });
      setIsPasswordDialogOpen(false);
      setPasswordInput("");
    } else {
      setPasswordError(result.error || "Failed to set password");
    }

    setIsSettingPassword(false);
  };

  const handleLogoutAllDevices = async () => {
    setIsLoggingOutAllDevices(true);

    try {
      // Ensure we have auth info from the auth hook
      if (!authToken || !username) {
        toast.error("Authentication Error", {
          description: "No authentication token found",
        });
        return;
      }

      const response = await abortableFetch(getApiUrl("/api/auth/logout-all"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Username": username,
        },
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Logged Out", {
          description: data.message || "Logged out from all devices",
        });

        // Immediately clear auth via store logout (bypass confirmation)
        confirmLogout();

        // No full page reload needed – UI will update via store reset
      } else {
        toast.error("Logout Failed", {
          description: data.error || "Failed to logout from all devices",
        });
      }
    } catch (error) {
      console.error("Error logging out all devices:", error);
      toast.error("Network Error", {
        description: "Failed to connect to server",
      });
    } finally {
      setIsLoggingOutAllDevices(false);
    }
  };

  // ====================================================================
  // Cloud Sync state
  // ====================================================================
  const [cloudSyncStatus, setCloudSyncStatus] = useState<{
    hasBackup: boolean;
    metadata: {
      timestamp: string;
      version: number;
      totalSize: number;
      createdAt: string;
    } | null;
  } | null>(null);
  const [isCloudBackingUp, setIsCloudBackingUp] = useState(false);
  const [isCloudRestoring, setIsCloudRestoring] = useState(false);
  const [isCloudStatusLoading, setIsCloudStatusLoading] = useState(false);
  const [isConfirmCloudRestoreOpen, setIsConfirmCloudRestoreOpen] =
    useState(false);

  /** Fetch cloud backup status */
  const fetchCloudSyncStatus = useCallback(async () => {
    if (!username || !authToken) return;

    setIsCloudStatusLoading(true);
    try {
      const response = await abortableFetch(getApiUrl("/api/sync/status"), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "X-Username": username,
        },
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 2, initialDelayMs: 500 },
      });

      if (response.ok) {
        const data = await response.json();
        setCloudSyncStatus(data);
      }
    } catch (error) {
      console.error("[CloudSync] Error fetching status:", error);
    } finally {
      setIsCloudStatusLoading(false);
    }
  }, [username, authToken]);

  // Fetch cloud sync status when user is logged in
  useEffect(() => {
    if (username && authToken) {
      fetchCloudSyncStatus();
    } else {
      setCloudSyncStatus(null);
    }
  }, [username, authToken, fetchCloudSyncStatus]);

  /** Upload current state to cloud */
  const handleCloudBackup = useCallback(async () => {
    if (!username || !authToken) {
      toast.error(t("apps.control-panels.cloudSync.loginRequired"));
      return;
    }

    setIsCloudBackingUp(true);

    try {
      // Build the same backup structure used for local backup
      const backup: {
        localStorage: Record<string, string | null>;
        indexedDB: {
          documents: StoreItemWithKey[];
          images: StoreItemWithKey[];
          trash: StoreItemWithKey[];
          custom_wallpapers: StoreItemWithKey[];
          applets: StoreItemWithKey[];
        };
        timestamp: string;
        version: number;
      } = {
        localStorage: {},
        indexedDB: {
          documents: [],
          images: [],
          trash: [],
          custom_wallpapers: [],
          applets: [],
        },
        timestamp: new Date().toISOString(),
        version: 3,
      };

      // Backup all localStorage data
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          backup.localStorage[key] = localStorage.getItem(key);
        }
      }

      // Backup IndexedDB data
      try {
        const db = await ensureIndexedDBInitialized();
        const getStoreData = async (
          storeName: string
        ): Promise<StoreItemWithKey[]> => {
          return new Promise((resolve, reject) => {
            try {
              const transaction = db.transaction(storeName, "readonly");
              const store = transaction.objectStore(storeName);
              const items: StoreItemWithKey[] = [];
              const request = store.openCursor();
              request.onsuccess = (event) => {
                const cursor = (
                  event.target as IDBRequest<IDBCursorWithValue>
                ).result;
                if (cursor) {
                  items.push({ key: cursor.key as string, value: cursor.value });
                  cursor.continue();
                } else {
                  resolve(items);
                }
              };
              request.onerror = () => reject(request.error);
            } catch (error) {
              console.error(`Error accessing store ${storeName}:`, error);
              resolve([]);
            }
          });
        };

        const [docs, imgs, trash, walls, apps] = await Promise.all([
          getStoreData("documents"),
          getStoreData("images"),
          getStoreData("trash"),
          getStoreData("custom_wallpapers"),
          getStoreData("applets"),
        ]);

        const serializeStore = async (items: StoreItemWithKey[]) =>
          Promise.all(
            items.map(async (item) => {
              const serializedValue: Record<string, unknown> = {
                ...item.value,
              };
              for (const key of Object.keys(item.value)) {
                if (item.value[key] instanceof Blob) {
                  const base64 = await blobToBase64(item.value[key] as Blob);
                  serializedValue[key] = base64;
                  serializedValue[`_isBlob_${key}`] = true;
                }
              }
              return { key: item.key, value: serializedValue as StoreItem };
            })
          );

        backup.indexedDB.documents = await serializeStore(docs);
        backup.indexedDB.images = await serializeStore(imgs);
        backup.indexedDB.trash = await serializeStore(trash);
        backup.indexedDB.custom_wallpapers = await serializeStore(walls);
        backup.indexedDB.applets = await serializeStore(apps);
        db.close();
      } catch (error) {
        console.error("[CloudSync] Error backing up IndexedDB:", error);
      }

      // Convert to JSON and compress
      const jsonString = JSON.stringify(backup);
      const encoder = new TextEncoder();
      const inputData = encoder.encode(jsonString);

      // Gzip compress
      const readableStream = new ReadableStream({
        start(controller) {
          controller.enqueue(inputData);
          controller.close();
        },
      });
      const compressionStream = new CompressionStream("gzip");
      const compressedStream = readableStream.pipeThrough(compressionStream);
      const chunks: Uint8Array[] = [];
      const reader = compressedStream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine chunks and convert to base64
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Convert Uint8Array to base64 string
      let binary = "";
      for (let i = 0; i < combined.length; i++) {
        binary += String.fromCharCode(combined[i]);
      }
      const base64Data = btoa(binary);

      // Upload to cloud
      const response = await abortableFetch(getApiUrl("/api/sync/backup"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Username": username,
        },
        body: JSON.stringify({
          data: base64Data,
          timestamp: backup.timestamp,
          version: backup.version,
        }),
        timeout: 60000,
        throwOnHttpError: false,
        retry: { maxAttempts: 2, initialDelayMs: 1000 },
      });

      if (response.ok) {
        toast.success(t("apps.control-panels.cloudSync.backupSuccess"));
        // Refresh status
        await fetchCloudSyncStatus();
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg =
          (errorData as { error?: string }).error ||
          t("apps.control-panels.cloudSync.backupFailed");
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error("[CloudSync] Backup error:", error);
      toast.error(t("apps.control-panels.cloudSync.backupFailed"));
    } finally {
      setIsCloudBackingUp(false);
    }
  }, [username, authToken, t, fetchCloudSyncStatus]);

  /** Download and restore backup from cloud */
  const handleCloudRestore = useCallback(async () => {
    if (!username || !authToken) {
      toast.error(t("apps.control-panels.cloudSync.loginRequired"));
      return;
    }

    setIsCloudRestoring(true);

    try {
      // Download backup from cloud
      const response = await abortableFetch(getApiUrl("/api/sync/backup"), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "X-Username": username,
        },
        timeout: 60000,
        throwOnHttpError: false,
        retry: { maxAttempts: 2, initialDelayMs: 1000 },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg =
          (errorData as { error?: string }).error ||
          t("apps.control-panels.cloudSync.restoreFailed");
        toast.error(errorMsg);
        return;
      }

      const result = await response.json();
      const base64Data = result.data as string;

      // Decode base64 to Uint8Array
      const binaryStr = atob(base64Data);
      const compressedData = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        compressedData[i] = binaryStr.charCodeAt(i);
      }

      // Decompress gzip
      const compressedResponse = new Response(compressedData);
      const compressedStreamBody = compressedResponse.body;
      if (!compressedStreamBody) {
        throw new Error("Failed to create stream from compressed data");
      }
      const decompressionStream = new DecompressionStream("gzip");
      const decompressedStream =
        compressedStreamBody.pipeThrough(decompressionStream);
      const decompressedResponse = new Response(decompressedStream);
      const jsonString = await decompressedResponse.text();

      // Parse backup
      const backup = JSON.parse(jsonString);

      if (!backup || !backup.localStorage || !backup.timestamp) {
        throw new Error("Invalid backup format");
      }

      // Store auth credentials before clearing (to preserve login)
      const savedAuthToken = authToken;
      const savedUsername = username;

      // Clear current state
      clearAllAppStates();
      clearPrefetchFlag();

      // Restore localStorage
      Object.entries(backup.localStorage).forEach(([key, value]) => {
        if (value !== null) {
          localStorage.setItem(key, value as string);
        }
      });

      // Re-set auth credentials so user stays logged in
      const chatsStoreKey = "ryos:chats";
      const chatsStore = localStorage.getItem(chatsStoreKey);
      if (chatsStore) {
        try {
          const parsed = JSON.parse(chatsStore);
          if (parsed?.state) {
            parsed.state.username = savedUsername;
            parsed.state.authToken = savedAuthToken;
            localStorage.setItem(chatsStoreKey, JSON.stringify(parsed));
          }
        } catch {
          // Ignore parse errors
        }
      }

      // Restore IndexedDB data if available
      if (backup.indexedDB) {
        try {
          const db = await ensureIndexedDBInitialized();

          const restoreStore = async (
            storeName: string,
            items: StoreItemWithKey[]
          ) => {
            return new Promise<void>((resolve, reject) => {
              const transaction = db.transaction(storeName, "readwrite");
              const store = transaction.objectStore(storeName);
              const clearRequest = store.clear();

              clearRequest.onsuccess = async () => {
                try {
                  for (const item of items) {
                    const itemValue: Record<string, unknown> = {
                      ...item.value,
                    };
                    for (const key of Object.keys(item.value)) {
                      const isBlobKey = `_isBlob_${key}`;
                      if (item.value[isBlobKey] === true) {
                        itemValue[key] = base64ToBlob(
                          item.value[key] as string
                        );
                        delete itemValue[isBlobKey];
                      }
                    }
                    if (backup.version < 2) {
                      if (
                        storeName === "documents" ||
                        storeName === "images"
                      ) {
                        if (!itemValue.uuid) {
                          itemValue.uuid = uuidv4();
                        }
                        if (!itemValue.contentUrl && itemValue.content) {
                          itemValue.contentUrl = URL.createObjectURL(
                            itemValue.content as Blob
                          );
                        }
                      }
                    }
                    store.put(itemValue, item.key);
                  }
                  resolve();
                } catch (error) {
                  reject(error);
                }
              };
              clearRequest.onerror = () => reject(clearRequest.error);
            });
          };

          const restorePromises: Promise<void>[] = [];
          if (backup.indexedDB.documents) {
            restorePromises.push(
              restoreStore("documents", backup.indexedDB.documents)
            );
          }
          if (backup.indexedDB.images) {
            restorePromises.push(
              restoreStore("images", backup.indexedDB.images)
            );
          }
          if (backup.indexedDB.trash) {
            restorePromises.push(
              restoreStore("trash", backup.indexedDB.trash)
            );
          }
          if (backup.indexedDB.custom_wallpapers) {
            restorePromises.push(
              restoreStore(
                "custom_wallpapers",
                backup.indexedDB.custom_wallpapers
              )
            );
          }
          if (backup.indexedDB.applets) {
            restorePromises.push(
              restoreStore("applets", backup.indexedDB.applets)
            );
          }

          await Promise.all(restorePromises);
          db.close();
        } catch (error) {
          console.error("[CloudSync] Error restoring IndexedDB:", error);
        }
      }

      // Handle wallpaper restore
      if (backup.localStorage["ryos:app:settings:wallpaper"]) {
        const wallpaper = backup.localStorage["ryos:app:settings:wallpaper"];
        if (wallpaper) {
          setCurrentWallpaper(wallpaper);
        }
      }

      // Ensure files store is in a safe state
      try {
        const persistedKey = "ryos:files";
        const persistedState = localStorage.getItem(persistedKey);
        if (persistedState) {
          const parsed = JSON.parse(persistedState);
          if (parsed?.state) {
            const hasItems =
              parsed.state.items &&
              Object.keys(parsed.state.items).length > 0;
            parsed.state.libraryState = hasItems ? "loaded" : "uninitialized";
            parsed.version = 5;
            localStorage.setItem(persistedKey, JSON.stringify(parsed));
          }
        } else {
          const defaultStore = {
            state: { items: {}, libraryState: "loaded" },
            version: 5,
          };
          localStorage.setItem(persistedKey, JSON.stringify(defaultStore));
        }
      } catch (fallbackErr) {
        console.error("[CloudSync] Files store fallback failed:", fallbackErr);
      }

      setNextBootMessage(t("common.system.restoringSystem"));

      // Reload the page to apply changes
      window.location.reload();
    } catch (error) {
      console.error("[CloudSync] Restore error:", error);
      toast.error(t("apps.control-panels.cloudSync.restoreFailed"));
      clearNextBootMessage();
    } finally {
      setIsCloudRestoring(false);
    }
  }, [username, authToken, t, setCurrentWallpaper]);

  // States for previous volume levels for mute/unmute functionality
  const [prevMasterVolume, setPrevMasterVolume] = useState(
    masterVolume > 0 ? masterVolume : 1
  );
  const [prevUiVolume, setPrevUiVolume] = useState(uiVolume > 0 ? uiVolume : 1);
  const [prevSpeechVolume, setPrevSpeechVolume] = useState(
    speechVolume > 0 ? speechVolume : 1
  );
  const [prevChatSynthVolume, setPrevChatSynthVolume] = useState(
    chatSynthVolume > 0 ? chatSynthVolume : 1
  );
  const [prevIpodVolume, setPrevIpodVolume] = useState(
    ipodVolume > 0 ? ipodVolume : 1
  );

  // Detect iOS Safari – volume API does not work for YouTube embeds there
  const isIOS =
    typeof navigator !== "undefined" &&
    /iP(hone|od|ad)/.test(navigator.userAgent);

  const handleUISoundsChange = (enabled: boolean) => {
    setUiSoundsEnabled(enabled);
  };

  const handleSpeechChange = (enabled: boolean) => {
    setSpeechEnabled(enabled);
  };

  const handleSynthPresetChange = (value: string) => {
    setSynthPreset(value);
  };

  // Mute toggle handlers
  const handleMasterMuteToggle = () => {
    if (masterVolume > 0) {
      setPrevMasterVolume(masterVolume);
      setMasterVolume(0);
    } else {
      setMasterVolume(prevMasterVolume);
    }
  };

  const handleUiMuteToggle = () => {
    if (uiVolume > 0) {
      setPrevUiVolume(uiVolume);
      setUiVolume(0);
    } else {
      setUiVolume(prevUiVolume);
    }
  };

  const handleSpeechMuteToggle = () => {
    if (speechVolume > 0) {
      setPrevSpeechVolume(speechVolume);
      setSpeechVolume(0);
    } else {
      setSpeechVolume(prevSpeechVolume);
    }
  };

  const handleChatSynthMuteToggle = () => {
    if (chatSynthVolume > 0) {
      setPrevChatSynthVolume(chatSynthVolume);
      setChatSynthVolume(0);
    } else {
      setChatSynthVolume(prevChatSynthVolume);
    }
  };

  const handleIpodMuteToggle = () => {
    if (isIOS) return;
    if (ipodVolume > 0) {
      setPrevIpodVolume(ipodVolume);
      setIpodVolume(0);
    } else {
      setIpodVolume(prevIpodVolume);
    }
  };

  const handleResetAll = () => {
    setIsConfirmResetOpen(true);
  };

  const handleConfirmReset = () => {
    setIsConfirmResetOpen(false);
    setNextBootMessage(t("common.system.resettingSystem"));
    performReset();
  };

  const performReset = () => {
    // Preserve critical recovery keys while clearing everything else
    const fileMetadataStore = localStorage.getItem("ryos:files");
    const usernameRecovery = localStorage.getItem("_usr_recovery_key_");
    const authTokenRecovery = localStorage.getItem("_auth_recovery_key_");

    clearAllAppStates();
    clearPrefetchFlag(); // Force re-prefetch on next boot

    if (fileMetadataStore) {
      localStorage.setItem("ryos:files", fileMetadataStore);
    }
    if (usernameRecovery) {
      localStorage.setItem("_usr_recovery_key_", usernameRecovery);
    }
    if (authTokenRecovery) {
      localStorage.setItem("_auth_recovery_key_", authTokenRecovery);
    }

    window.location.reload();
  };

  const handleBackup = async () => {
    const backup: {
      localStorage: Record<string, string | null>;
      indexedDB: {
        documents: StoreItemWithKey[];
        images: StoreItemWithKey[];
        trash: StoreItemWithKey[];
        custom_wallpapers: StoreItemWithKey[];
        applets: StoreItemWithKey[];
      };
      timestamp: string;
      version: number; // Add version to identify backup format
    } = {
      localStorage: {},
      indexedDB: {
        documents: [],
        images: [],
        trash: [],
        custom_wallpapers: [],
        applets: [],
      },
      timestamp: new Date().toISOString(),
      version: 3, // Version 3 includes applets support
    };

    // Backup all localStorage data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        backup.localStorage[key] = localStorage.getItem(key);
      }
    }

    // Backup IndexedDB data
    try {
      const db = await ensureIndexedDBInitialized();
      const getStoreData = async (
        storeName: string
      ): Promise<StoreItemWithKey[]> => {
        return new Promise((resolve, reject) => {
          try {
            const transaction = db.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const items: StoreItemWithKey[] = [];

            // Use openCursor to get both keys and values
            const request = store.openCursor();

            request.onsuccess = (event) => {
              const cursor = (event.target as IDBRequest<IDBCursorWithValue>)
                .result;
              if (cursor) {
                items.push({
                  key: cursor.key as string,
                  value: cursor.value,
                });
                cursor.continue();
              } else {
                // No more entries
                resolve(items);
              }
            };

            request.onerror = () => reject(request.error);
          } catch (error) {
            console.error(`Error accessing store ${storeName}:`, error);
            resolve([]);
          }
        });
      };

      const [docs, imgs, trash, walls, apps] = await Promise.all([
        getStoreData("documents"),
        getStoreData("images"),
        getStoreData("trash"),
        getStoreData("custom_wallpapers"),
        getStoreData("applets"),
      ]);

      const serializeStore = async (items: StoreItemWithKey[]) =>
        Promise.all(
          items.map(async (item) => {
            const serializedValue: Record<string, unknown> = { ...item.value };

            // Check all fields for Blob instances
            for (const key of Object.keys(item.value)) {
              if (item.value[key] instanceof Blob) {
                const base64 = await blobToBase64(item.value[key] as Blob);
                serializedValue[key] = base64;
                serializedValue[`_isBlob_${key}`] = true;
              }
            }

            return {
              key: item.key,
              value: serializedValue as StoreItem,
            };
          })
        );

      backup.indexedDB.documents = await serializeStore(docs);
      backup.indexedDB.images = await serializeStore(imgs);
      backup.indexedDB.trash = await serializeStore(trash);
      backup.indexedDB.custom_wallpapers = await serializeStore(walls);
      backup.indexedDB.applets = await serializeStore(apps);
      db.close();
    } catch (error) {
      console.error("Error backing up IndexedDB:", error);
      alert(
        "Failed to backup file system data. Only settings will be backed up."
      );
    }

    // Convert to JSON string
    const jsonString = JSON.stringify(backup);

    // Create download with gzip compression
    try {
      // Check if CompressionStream is available
      if (typeof CompressionStream === "undefined") {
        throw new Error("CompressionStream API not available in this browser");
      }

      // Convert string to Uint8Array for compression
      const encoder = new TextEncoder();
      const inputData = encoder.encode(jsonString);

      // Create a ReadableStream from the data
      const readableStream = new ReadableStream({
        start(controller) {
          controller.enqueue(inputData);
          controller.close();
        },
      });

      // Compress the stream
      const compressionStream = new CompressionStream("gzip");
      const compressedStream = readableStream.pipeThrough(compressionStream);

      // Convert the compressed stream to a blob
      const chunks: Uint8Array[] = [];
      const reader = compressedStream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine chunks into a single blob
      const compressedBlob = new Blob(chunks as BlobPart[], {
        type: "application/gzip",
      });

      // Create download link
      const url = URL.createObjectURL(compressedBlob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .split("T")
        .join("-")
        .slice(0, -5);
      a.download = `ryOS-backup-${timestamp}.gz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (compressionError) {
      console.error("Compression failed:", compressionError);
      alert(
        `Failed to create compressed backup: ${
          compressionError instanceof Error
            ? compressionError.message
            : "Unknown error"
        }`
      );
    }
  };

  const handleRestore = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    fileToRestoreRef.current = file;
    performRestore();
  };

  const performRestore = async () => {
    const file = fileToRestoreRef.current;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let data: string;

        if (file.name.endsWith(".gz")) {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer;

            // Create a Response object with the compressed data
            const compressedResponse = new Response(arrayBuffer);
            const compressedStream = compressedResponse.body;

            if (!compressedStream) {
              throw new Error("Failed to create stream from compressed data");
            }

            // Decompress the stream
            const decompressionStream = new DecompressionStream("gzip");
            const decompressedStream =
              compressedStream.pipeThrough(decompressionStream);

            // Read the decompressed data
            const decompressedResponse = new Response(decompressedStream);
            data = await decompressedResponse.text();
          } catch (decompressionError) {
            console.error("Decompression failed:", decompressionError);
            throw new Error(
              `Failed to decompress backup file: ${
                decompressionError instanceof Error
                  ? decompressionError.message
                  : "Unknown error"
              }`
            );
          }
        } else {
          data = e.target?.result as string;
        }

        // Try to parse the JSON
        let backup;
        try {
          backup = JSON.parse(data);
        } catch (parseError) {
          console.error("JSON parse error:", parseError);
          throw new Error(
            "Invalid JSON format. The backup file may be corrupted."
          );
        }

        // Validate backup structure
        if (!backup || !backup.localStorage || !backup.timestamp) {
          throw new Error(
            "Invalid backup format. Missing required backup data."
          );
        }

        // Clear current state
        clearAllAppStates();
        clearPrefetchFlag(); // Force re-prefetch on next boot

        // Restore localStorage
        Object.entries(backup.localStorage).forEach(([key, value]) => {
          if (value !== null) {
            localStorage.setItem(key, value as string);
          }
        });

        // Restore IndexedDB data if available
        if (backup.indexedDB) {
          try {
            const db = await ensureIndexedDBInitialized();

            const restoreStore = async (
              storeName: string,
              items: StoreItemWithKey[]
            ) => {
              return new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(storeName, "readwrite");
                const store = transaction.objectStore(storeName);

                // First clear the existing store
                const clearRequest = store.clear();

                clearRequest.onsuccess = async () => {
                  try {
                    for (const item of items) {
                      const itemValue: Record<string, unknown> = {
                        ...item.value,
                      };

                      // Convert base64 strings back to blobs where needed
                      for (const key of Object.keys(item.value)) {
                        const isBlobKey = `_isBlob_${key}`;

                        if (item.value[isBlobKey] === true) {
                          itemValue[key] = base64ToBlob(
                            item.value[key] as string
                          );
                          delete itemValue[isBlobKey];
                        }
                      }

                      // Special handling for older backup formats
                      if (backup.version < 2) {
                        // Ensure we have required metadata
                        if (
                          storeName === "documents" ||
                          storeName === "images"
                        ) {
                          // Older backups might not have a UUID or contentUrl
                          if (!itemValue.uuid) {
                            itemValue.uuid = uuidv4();
                          }
                          if (!itemValue.contentUrl && itemValue.content) {
                            itemValue.contentUrl = URL.createObjectURL(
                              itemValue.content as Blob
                            );
                          }
                        }
                      }

                      // Add the item to the store
                      store.put(itemValue, item.key);
                    }
                    resolve();
                  } catch (error) {
                    reject(error);
                  }
                };

                clearRequest.onerror = () => reject(clearRequest.error);
              });
            };

            // Restore each store
            const restorePromises: Promise<void>[] = [];

            if (backup.indexedDB.documents) {
              restorePromises.push(
                restoreStore("documents", backup.indexedDB.documents)
              );
            }
            if (backup.indexedDB.images) {
              restorePromises.push(
                restoreStore("images", backup.indexedDB.images)
              );
            }
            if (backup.indexedDB.trash) {
              restorePromises.push(
                restoreStore("trash", backup.indexedDB.trash)
              );
            }
            if (backup.indexedDB.custom_wallpapers) {
              restorePromises.push(
                restoreStore(
                  "custom_wallpapers",
                  backup.indexedDB.custom_wallpapers
                )
              );
            }
            if (backup.indexedDB.applets) {
              restorePromises.push(
                restoreStore("applets", backup.indexedDB.applets)
              );
            }

            await Promise.all(restorePromises);
            db.close();
          } catch (error) {
            console.error("Error restoring IndexedDB:", error);
            alert(
              "Failed to restore file system data. Only settings will be restored."
            );
          }
        }

        // Update wallpaper after restore
        if (backup.localStorage["ryos:app:settings:wallpaper"]) {
          const wallpaper = backup.localStorage["ryos:app:settings:wallpaper"];
          if (wallpaper) {
            setCurrentWallpaper(wallpaper);
          }
        }

        try {
          // Ensure the files store is in a safe state after restore
          const persistedKey = "ryos:files";
          const persistedState = localStorage.getItem(persistedKey);

          if (persistedState) {
            const parsed = JSON.parse(persistedState);
            if (parsed && parsed.state) {
              // Check if we likely have restored data
              const hasItems =
                parsed.state.items &&
                Object.keys(parsed.state.items).length > 0;
              parsed.state.libraryState = hasItems
                ? "loaded"
                : "uninitialized";
              parsed.version = 5;
              localStorage.setItem(persistedKey, JSON.stringify(parsed));
              console.log(
                `[ControlPanels] Emergency: Set libraryState to ${parsed.state.libraryState} to handle restore properly`
              );
            } else {
              // No files store exists, create one with "loaded" state to be safe
              const defaultStore = {
                state: { items: {}, libraryState: "loaded" },
                version: 5,
              };
              localStorage.setItem(persistedKey, JSON.stringify(defaultStore));
              console.log(
                "[ControlPanels] Emergency: Created files store with libraryState: loaded"
              );
            }
          } else {
            // No files store exists, create one with "loaded" state to be safe
            const defaultStore = {
              state: { items: {}, libraryState: "loaded" },
              version: 5,
            };
            localStorage.setItem(persistedKey, JSON.stringify(defaultStore));
            console.log(
              "[ControlPanels] Emergency: Created files store with libraryState: loaded"
            );
          }
        } catch (fallbackErr) {
          console.error(
            "[ControlPanels] Emergency fallback failed:",
            fallbackErr
          );
        }

        setNextBootMessage(t("common.system.restoringSystem"));

        // Reload the page to apply changes
        window.location.reload();
      } catch (err) {
        console.error("Restore failed:", err);

        // Show more specific error message
        let errorMessage = "Failed to restore backup: ";
        if (err instanceof Error) {
          errorMessage += err.message;
        } else if (typeof err === "string") {
          errorMessage += err;
        } else {
          errorMessage += "Unknown error occurred";
        }

        alert(errorMessage);
        clearNextBootMessage();
      }
    };

    if (file.name.endsWith(".gz")) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
    fileToRestoreRef.current = null;
  };

  const performFormat = async () => {
    // Reset wallpaper to default before formatting
    setCurrentWallpaper("/wallpapers/photos/aqua/water.jpg");
    await formatFileSystem();
    clearPrefetchFlag(); // Force re-prefetch on next boot
    setNextBootMessage(t("common.system.formattingFileSystem"));
    window.location.reload();
  };

  const handleConfirmFormat = () => {
    setIsConfirmFormatOpen(false);
    setNextBootMessage(t("common.system.formattingFileSystem"));
    performFormat();
  };

  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOSXTheme = currentTheme === "macosx";
  const isSystem7Theme = currentTheme === "system7";
  const isClassicMacTheme = isMacOSXTheme || isSystem7Theme;
  const isWindowsLegacyTheme = isXpTheme;

  const tabStyles = getTabStyles(currentTheme);
  const defaultTab = initialData?.defaultTab || "appearance";
  const windowTitle = getTranslatedAppName("control-panels");

  const handleCheckForUpdates = () => {
    forceRefreshCache();
  };

  const handleShowBootScreen = () => {
    setNextBootMessage(t("common.system.debugBootScreenTest"), true);
    window.location.reload();
  };

  return {
    t,
    translatedHelpItems,
    windowTitle,
    defaultTab,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isConfirmResetOpen,
    setIsConfirmResetOpen,
    isConfirmFormatOpen,
    setIsConfirmFormatOpen,
    isPasswordDialogOpen,
    setIsPasswordDialogOpen,
    passwordInput,
    setPasswordInput,
    passwordError,
    setPasswordError,
    isSettingPassword,
    isLoggingOutAllDevices,
    fileInputRef,
    handleRestore,
    handleBackup,
    handleResetAll,
    handleConfirmReset,
    handleConfirmFormat,
    handleCheckForUpdates,
    handleShowBootScreen,
    AI_MODELS,
    aiModel,
    setAiModel,
    debugMode,
    setDebugMode,
    shaderEffectEnabled,
    setShaderEffectEnabled,
    currentTheme,
    setTheme,
    currentLanguage,
    setLanguage,
    tabStyles,
    isXpTheme,
    isMacOSXTheme,
    isClassicMacTheme,
    isWindowsLegacyTheme,
    uiSoundsEnabled,
    handleUISoundsChange,
    speechEnabled,
    handleSpeechChange,
    terminalSoundsEnabled,
    setTerminalSoundsEnabled,
    synthPreset,
    handleSynthPresetChange,
    masterVolume,
    setMasterVolume,
    setPrevMasterVolume,
    handleMasterMuteToggle,
    uiVolume,
    setUiVolume,
    setPrevUiVolume,
    handleUiMuteToggle,
    speechVolume,
    setSpeechVolume,
    setPrevSpeechVolume,
    handleSpeechMuteToggle,
    chatSynthVolume,
    setChatSynthVolume,
    setPrevChatSynthVolume,
    handleChatSynthMuteToggle,
    ipodVolume,
    setIpodVolume,
    setPrevIpodVolume,
    handleIpodMuteToggle,
    isIOS,
    ttsModel,
    setTtsModel,
    ttsVoice,
    setTtsVoice,
    username,
    promptSetUsername,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    hasPassword,
    logout,
    confirmLogout,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
    handleSetPassword,
    handleLogoutAllDevices,
    // Cloud Sync
    cloudSyncStatus,
    isCloudBackingUp,
    isCloudRestoring,
    isCloudStatusLoading,
    isConfirmCloudRestoreOpen,
    setIsConfirmCloudRestoreOpen,
    handleCloudBackup,
    handleCloudRestore,
  };
}
