import { useState, useRef } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ControlPanelsMenuBar } from "./ControlPanelsMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { AuthDialog } from "@/components/dialogs/AuthDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { helpItems, appMetadata } from "..";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WallpaperPicker } from "./WallpaperPicker";
import { AppProps, ControlPanelsInitialData } from "@/apps/base/types";
import { clearAllAppStates } from "@/stores/useAppStore";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
import { SYNTH_PRESETS } from "@/hooks/useChatSynth";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { useAppStoreShallow } from "@/stores/helpers";
import { setNextBootMessage, clearNextBootMessage } from "@/utils/bootMessage";
import { AIModel, AI_MODEL_METADATA } from "@/types/aiModels";
import { VolumeMixer } from "./VolumeMixer";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import React from "react";

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

export function ControlPanelsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<ControlPanelsInitialData>) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmFormatOpen, setIsConfirmFormatOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileToRestoreRef = useRef<File | null>(null);
  const { formatFileSystem } = useFileSystem();
  const {
    debugMode,
    setDebugMode,
    shaderEffectEnabled,
    setShaderEffectEnabled,
    aiModel,
    setAiModel,
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
    setCurrentWallpaper,
  } = useAppStoreShallow((s) => ({
    debugMode: s.debugMode,
    setDebugMode: s.setDebugMode,
    shaderEffectEnabled: s.shaderEffectEnabled,
    setShaderEffectEnabled: s.setShaderEffectEnabled,
    aiModel: s.aiModel,
    setAiModel: s.setAiModel,
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
    setCurrentWallpaper: s.setCurrentWallpaper,
  }));

  // Use auth hook
  const {
    username,
    promptSetUsername,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    setUsernameError,
    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,

    isVerifyingToken,
    verifyError,
    setVerifyError,
    handleVerifyTokenSubmit,
    newPassword,
    setNewPassword,
    loginFormUsername,
    setLoginFormUsername,
    loginFormPassword,
    setLoginFormPassword,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    hasPassword,
    checkHasPassword,
    setPassword,
    authToken,
    logout,
  } = useAuth();

  // Password dialog states
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Check if user has password when component mounts or username/token changes
  React.useEffect(() => {
    if (username && authToken) {
      console.log("[ControlPanel] Checking password for user:", username);
      checkHasPassword();
    }
  }, [username, authToken, checkHasPassword]);

  // Debug hasPassword value
  React.useEffect(() => {
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
    setNextBootMessage("Resetting System...");
    performReset();
  };

  const performReset = () => {
    // Preserve file metadata store while clearing everything else
    const fileMetadataStore = localStorage.getItem("ryos:files");
    clearAllAppStates();
    if (fileMetadataStore) {
      localStorage.setItem("ryos:files", fileMetadataStore);
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
      },
      timestamp: new Date().toISOString(),
      version: 2, // Version 2 includes keys
    };

    // Backup all localStorage data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        backup.localStorage[key] = localStorage.getItem(key);
      }
    }

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

      const [docs, imgs, trash, walls] = await Promise.all([
        getStoreData("documents"),
        getStoreData("images"),
        getStoreData("trash"),
        getStoreData("custom_wallpapers"),
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
      const compressedBlob = new Blob(chunks, { type: "application/gzip" });

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

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
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
          console.error("Data preview:", data.substring(0, 200));
          throw new Error("Invalid backup file format - not valid JSON");
        }

        // Validate backup structure
        if (!backup || typeof backup !== "object") {
          throw new Error("Invalid backup structure - expected an object");
        }

        console.log("Backup loaded successfully:", {
          hasLocalStorage: !!backup.localStorage,
          hasIndexedDB: !!backup.indexedDB,
          version: backup.version,
          timestamp: backup.timestamp,
        });

        // Detect if this is an old backup format
        let isOldBackupFormat = false;

        // First check if backup has version field (new backups have version 2+)
        if (!backup.version || backup.version < 2) {
          isOldBackupFormat = true;
          console.log(
            "[Restore] Detected old backup format (no version or version < 2)"
          );
        } else if (backup.localStorage && backup.localStorage["ryos:files"]) {
          // For newer backups, also check if files lack UUIDs
          try {
            const filesDataStr = backup.localStorage["ryos:files"];
            const filesData = filesDataStr ? JSON.parse(filesDataStr) : {};
            if (filesData.state && filesData.state.items) {
              // Check if any files lack UUIDs
              const fileItems = (
                Object.values(filesData.state.items) as Array<
                  Record<string, unknown>
                >
              ).filter(
                (item) => !(item as { isDirectory?: boolean }).isDirectory
              );
              isOldBackupFormat =
                fileItems.length > 0 &&
                fileItems.every((item) => !(item as { uuid?: string }).uuid);
              if (isOldBackupFormat) {
                console.log(
                  "[Restore] Detected old backup format (files lack UUIDs)"
                );
              }
            }
          } catch (err) {
            console.error("[Restore] Error checking backup format:", err);
          }
        }

        if (backup.localStorage) {
          console.log("Restoring localStorage items...");
          let restoredCount = 0;
          Object.entries(backup.localStorage).forEach(([key, value]) => {
            if (value !== null) {
              try {
                localStorage.setItem(key, value as string);
                restoredCount++;
              } catch (err) {
                console.error(
                  `Failed to restore localStorage item ${key}:`,
                  err
                );
              }
            }
          });
          console.log(`Restored ${restoredCount} localStorage items`);
        }

        // Track which files need UUID migration
        const fileUUIDMap = new Map<string, string>();

        if (backup.indexedDB) {
          console.log("Restoring IndexedDB data...");
          try {
            const db = await ensureIndexedDBInitialized();
            const restoreStoreData = async (
              storeName: string,
              dataToRestore: Array<StoreItem | StoreItemWithKey>
            ): Promise<void> => {
              console.log(
                `Restoring ${dataToRestore.length} items to ${storeName}...`
              );
              return new Promise((resolve, reject) => {
                try {
                  const transaction = db.transaction(storeName, "readwrite");
                  const store = transaction.objectStore(storeName);
                  const clearRequest = store.clear();
                  clearRequest.onsuccess = async () => {
                    try {
                      for (const itemOrPair of dataToRestore) {
                        let restoredItem: Record<string, unknown>;
                        let itemKey: string | undefined;

                        // Check if this is new format (with key) or old format (without key)
                        if ("value" in itemOrPair) {
                          const pair = itemOrPair as StoreItemWithKey;
                          // New format: { key: string, value: StoreItem }
                          itemKey = pair.key;
                          restoredItem = { ...pair.value };
                        } else {
                          const oldItem = itemOrPair as StoreItem;
                          restoredItem = { ...oldItem };
                          if (
                            oldItem.name &&
                            typeof oldItem.name === "string"
                          ) {
                            itemKey = oldItem.name;
                          }
                        }

                        // Check for fields that were Blobs and convert them back
                        for (const key of Object.keys(restoredItem)) {
                          if (key.startsWith("_isBlob_")) {
                            const fieldName = key.substring(8); // Remove '_isBlob_' prefix
                            if (
                              restoredItem[fieldName] &&
                              typeof restoredItem[fieldName] === "string"
                            ) {
                              restoredItem[fieldName] = base64ToBlob(
                                restoredItem[fieldName] as string
                              );
                            }
                            delete restoredItem[key]; // Remove the metadata flag
                          }
                        }

                        if (!itemKey) {
                          console.warn(
                            `[Restore] Skipping item without a valid key in ${storeName}:`,
                            restoredItem
                          );
                          continue;
                        }

                        await new Promise<void>((resolveItem, rejectItem) => {
                          // Pass the key as the second parameter for stores without keyPath
                          const addRequest = store.put(restoredItem, itemKey);
                          addRequest.onsuccess = () => resolveItem();
                          addRequest.onerror = () => {
                            console.error(
                              `Error adding item to ${storeName} with key ${itemKey}:`,
                              addRequest.error
                            );
                            rejectItem(addRequest.error);
                          };
                        });
                      }
                      resolve();
                    } catch (err) {
                      reject(err);
                    }
                  };
                  clearRequest.onerror = () => reject(clearRequest.error);
                } catch (error) {
                  console.error(`Error accessing store ${storeName}:`, error);
                  resolve();
                }
              });
            };

            if (backup.indexedDB.documents)
              await restoreStoreData("documents", backup.indexedDB.documents);
            if (backup.indexedDB.images)
              await restoreStoreData("images", backup.indexedDB.images);
            if (backup.indexedDB.trash)
              await restoreStoreData("trash", backup.indexedDB.trash);
            if (backup.indexedDB.custom_wallpapers)
              await restoreStoreData(
                "custom_wallpapers",
                backup.indexedDB.custom_wallpapers
              );

            db.close();
          } catch (error) {
            console.error("Error restoring IndexedDB:", error);
            alert(
              "Failed to restore file system data. Only settings were restored."
            );
          }

          /* Synchronize files store metadata with IndexedDB content after restore */
          try {
            const db = await ensureIndexedDBInitialized();
            const persistedKey = "ryos:files";
            let raw = localStorage.getItem(persistedKey);

            // Handle case where files store doesn't exist yet (very old backups)
            if (!raw) {
              // Check if we have any content in IndexedDB to determine initial state
              const docsTransaction = db.transaction("documents", "readonly");
              const docsStore = docsTransaction.objectStore("documents");
              const docsCountRequest = docsStore.count();

              const imagesTransaction = db.transaction("images", "readonly");
              const imagesStore = imagesTransaction.objectStore("images");
              const imagesCountRequest = imagesStore.count();

              const [docsCount, imagesCount] = await Promise.all([
                new Promise<number>((resolve) => {
                  docsCountRequest.onsuccess = () =>
                    resolve(docsCountRequest.result);
                  docsCountRequest.onerror = () => resolve(0);
                }),
                new Promise<number>((resolve) => {
                  imagesCountRequest.onsuccess = () =>
                    resolve(imagesCountRequest.result);
                  imagesCountRequest.onerror = () => resolve(0);
                }),
              ]);

              const hasContent = docsCount > 0 || imagesCount > 0;

              const defaultStore = {
                state: {
                  items: {},
                  // If we have content in IndexedDB, mark as loaded to prevent re-initialization
                  libraryState: hasContent ? "loaded" : "uninitialized",
                },
                version: 5, // Use current version
              };
              localStorage.setItem(persistedKey, JSON.stringify(defaultStore));
              raw = localStorage.getItem(persistedKey);
              console.log(
                `[Restore] Created files store with libraryState: ${defaultStore.state.libraryState}, docs: ${docsCount}, images: ${imagesCount}`
              );
            }

            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.state) {
                const items = parsed.state.items || {};
                let hasChanges = false;

                // Helper function to ensure metadata exists for a file
                const ensureFileMetadata = (
                  path: string,
                  name: string,
                  type: string,
                  icon: string
                ) => {
                  if (!items[path]) {
                    const uuid = uuidv4();
                    items[path] = {
                      path,
                      name,
                      isDirectory: false,
                      type,
                      icon,
                      status: "active",
                      uuid, // Always generate UUID for restored files
                    };
                    hasChanges = true;
                    fileUUIDMap.set(name, uuid); // Track for migration
                    console.log(
                      `[Restore] Created metadata with UUID for: ${path} (${uuid})`
                    );
                  } else if (!items[path].uuid) {
                    // File exists but lacks UUID (old backup)
                    const uuid = uuidv4();
                    items[path].uuid = uuid;
                    hasChanges = true;
                    fileUUIDMap.set(name, uuid); // Track for migration
                    console.log(
                      `[Restore] Added UUID to existing file: ${path} (${uuid})`
                    );
                  } else {
                    // File already has UUID
                    fileUUIDMap.set(name, items[path].uuid);
                  }
                };

                // Ensure default directories exist first
                const defaultDirs = [
                  { path: "/", name: "/", type: "directory", icon: undefined },
                  {
                    path: "/Documents",
                    name: "Documents",
                    type: "directory",
                    icon: "/icons/documents.png",
                  },
                  {
                    path: "/Images",
                    name: "Images",
                    type: "directory",
                    icon: "/icons/images.png",
                  },
                  {
                    path: "/Applications",
                    name: "Applications",
                    type: "directory-virtual",
                    icon: "/icons/applications.png",
                  },
                  {
                    path: "/Music",
                    name: "Music",
                    type: "directory-virtual",
                    icon: "/icons/sounds.png",
                  },
                  {
                    path: "/Videos",
                    name: "Videos",
                    type: "directory-virtual",
                    icon: "/icons/movies.png",
                  },
                  {
                    path: "/Sites",
                    name: "Sites",
                    type: "directory-virtual",
                    icon: "/icons/sites.png",
                  },
                  {
                    path: "/Trash",
                    name: "Trash",
                    type: "directory",
                    icon: "/icons/trash-empty.png",
                  },
                ];

                for (const dir of defaultDirs) {
                  if (!items[dir.path]) {
                    items[dir.path] = {
                      path: dir.path,
                      name: dir.name,
                      isDirectory: true,
                      type: dir.type,
                      icon: dir.icon,
                      status: "active",
                    };
                    hasChanges = true;
                    console.log(
                      `[Restore] Created missing directory: ${dir.path}`
                    );
                  }
                }

                // Scan documents store and ensure metadata exists
                const docsTransaction = db.transaction("documents", "readonly");
                const docsStore = docsTransaction.objectStore("documents");
                const docsRequest = docsStore.getAll();

                await new Promise<void>((resolve) => {
                  docsRequest.onsuccess = () => {
                    const docs = docsRequest.result;
                    console.log(
                      `[Restore] Found ${docs.length} documents in IndexedDB`
                    );
                    for (const doc of docs) {
                      if (doc.name) {
                        const path = `/Documents/${doc.name}`;
                        const type = doc.name.endsWith(".md")
                          ? "markdown"
                          : "text";
                        ensureFileMetadata(
                          path,
                          doc.name,
                          type,
                          "/icons/file-text.png"
                        );
                      }
                    }
                    resolve();
                  };
                  docsRequest.onerror = () => {
                    console.warn("[Restore] Failed to scan documents store");
                    resolve();
                  };
                });

                // Scan images store and ensure metadata exists
                const imagesTransaction = db.transaction("images", "readonly");
                const imagesStore = imagesTransaction.objectStore("images");
                const imagesRequest = imagesStore.getAll();

                await new Promise<void>((resolve) => {
                  imagesRequest.onsuccess = () => {
                    const images = imagesRequest.result;
                    console.log(
                      `[Restore] Found ${images.length} images in IndexedDB`
                    );
                    for (const img of images) {
                      if (img.name) {
                        const path = `/Images/${img.name}`;
                        const ext =
                          img.name.split(".").pop()?.toLowerCase() || "png";
                        ensureFileMetadata(
                          path,
                          img.name,
                          ext,
                          "/icons/image.png"
                        );
                      }
                    }
                    resolve();
                  };
                  imagesRequest.onerror = () => {
                    console.warn("[Restore] Failed to scan images store");
                    resolve();
                  };
                });

                // CRITICAL: Set library state based on whether we have any files
                // For old backups without libraryState, if we have files (from IndexedDB or metadata),
                // we should mark as "loaded" to prevent re-initialization
                const hasFiles = Object.keys(items).some(
                  (path) => !items[path].isDirectory
                );
                const currentLibraryState = parsed.state.libraryState;

                // Only change libraryState if it's not already set or if it's "uninitialized" but we have files
                if (
                  !currentLibraryState ||
                  (currentLibraryState === "uninitialized" && hasFiles)
                ) {
                  parsed.state.libraryState = "loaded";
                  hasChanges = true;
                  console.log(
                    `[Restore] Setting libraryState to "loaded" (was: ${currentLibraryState}, hasFiles: ${hasFiles})`
                  );
                }

                // Ensure the store version is current to prevent migration issues
                if (!parsed.version || parsed.version < 5) {
                  parsed.version = 5;
                  hasChanges = true;
                }

                // Save if we made any changes
                if (hasChanges || !currentLibraryState) {
                  parsed.state.items = items;
                  localStorage.setItem(persistedKey, JSON.stringify(parsed));
                  console.log(
                    `[Restore] Updated files store with ${
                      Object.keys(items).length
                    } items, libraryState: ${parsed.state.libraryState}`
                  );
                }

                const fileCount = Object.keys(items).filter(
                  (path) => !items[path].isDirectory
                ).length;
                console.log(
                  `[ControlPanels] Synchronized files store: ${fileCount} files, libraryState: ${parsed.state.libraryState}`
                );
              }
            }

            // If this was an old backup, migrate IndexedDB content from filename keys to UUID keys
            if (isOldBackupFormat && fileUUIDMap.size > 0) {
              console.log(
                `[Restore] Migrating ${fileUUIDMap.size} files from filename to UUID keys...`
              );

              // Migrate documents
              const docsTransaction = db.transaction("documents", "readwrite");
              const docsStore = docsTransaction.objectStore("documents");

              for (const [filename, uuid] of fileUUIDMap) {
                try {
                  const getRequest = docsStore.get(filename);
                  await new Promise<void>((resolve) => {
                    getRequest.onsuccess = async () => {
                      const content = getRequest.result;
                      if (content) {
                        // Save with UUID key
                        await new Promise<void>((res, rej) => {
                          const putRequest = docsStore.put(content, uuid);
                          putRequest.onsuccess = () => res();
                          putRequest.onerror = () => rej(putRequest.error);
                        });
                        // Delete old filename key
                        await new Promise<void>((res, rej) => {
                          const deleteRequest = docsStore.delete(filename);
                          deleteRequest.onsuccess = () => res();
                          deleteRequest.onerror = () =>
                            rej(deleteRequest.error);
                        });
                        console.log(
                          `[Restore] Migrated document ${filename} to UUID ${uuid}`
                        );
                      }
                      resolve();
                    };
                    getRequest.onerror = () => resolve();
                  });
                } catch (err) {
                  console.error(
                    `[Restore] Failed to migrate document ${filename}:`,
                    err
                  );
                }
              }

              // Migrate images
              const imagesTransaction = db.transaction("images", "readwrite");
              const imagesStore = imagesTransaction.objectStore("images");

              for (const [filename, uuid] of fileUUIDMap) {
                try {
                  const getRequest = imagesStore.get(filename);
                  await new Promise<void>((resolve) => {
                    getRequest.onsuccess = async () => {
                      const content = getRequest.result;
                      if (content) {
                        // Save with UUID key
                        await new Promise<void>((res, rej) => {
                          const putRequest = imagesStore.put(content, uuid);
                          putRequest.onsuccess = () => res();
                          putRequest.onerror = () => rej(putRequest.error);
                        });
                        // Delete old filename key
                        await new Promise<void>((res, rej) => {
                          const deleteRequest = imagesStore.delete(filename);
                          deleteRequest.onsuccess = () => res();
                          deleteRequest.onerror = () =>
                            rej(deleteRequest.error);
                        });
                        console.log(
                          `[Restore] Migrated image ${filename} to UUID ${uuid}`
                        );
                      }
                      resolve();
                    };
                    getRequest.onerror = () => resolve();
                  });
                } catch (err) {
                  console.error(
                    `[Restore] Failed to migrate image ${filename}:`,
                    err
                  );
                }
              }

              // Clear any migration flag to ensure migration doesn't run again
              localStorage.setItem(
                "ryos:indexeddb-uuid-migration-v1",
                "completed"
              );
              console.log("[Restore] UUID migration completed during restore");
            }

            db.close();
          } catch (err) {
            console.error(
              "[ControlPanels] Failed to synchronize files store with IndexedDB after restore:",
              err
            );

            // Emergency fallback: ensure library state is set to prevent auto-init even on error
            try {
              const persistedKey = "ryos:files";
              const raw = localStorage.getItem(persistedKey);
              if (raw) {
                const parsed = JSON.parse(raw);
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
                }
              } else {
                // No files store exists, create one with "loaded" state to be safe
                const defaultStore = {
                  state: { items: {}, libraryState: "loaded" },
                  version: 5,
                };
                localStorage.setItem(
                  persistedKey,
                  JSON.stringify(defaultStore)
                );
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
          }
        }
        setNextBootMessage("Restoring System...");
        window.location.reload();
      } catch (err) {
        console.error("Backup restore failed:", err);

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
    setCurrentWallpaper("/wallpapers/videos/blue_flowers_loop.mp4");
    await formatFileSystem();
    setNextBootMessage("Formatting File System...");
    window.location.reload();
  };

  const handleConfirmFormat = () => {
    setIsConfirmFormatOpen(false);
    setNextBootMessage("Formatting File System...");
    performFormat();
  };

  if (!isWindowOpen) return null;

  return (
    <>
      <ControlPanelsMenuBar
        onClose={onClose}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
      />
      <WindowFrame
        title="Control Panels"
        onClose={onClose}
        isForeground={isForeground}
        appId="control-panels"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      >
        <div className="flex flex-col h-full bg-[#E3E3E3] p-4 w-full">
          <Tabs
            defaultValue={initialData?.defaultTab || "appearance"}
            className="w-full h-full"
          >
            <TabsList className="flex w-full h-6 space-x-0.5 bg-[#E3E3E3] shadow-none border-b border-[#808080]">
              <TabsTrigger
                value="appearance"
                className="relative flex-1 h-6 px-2 -mb-[1px] rounded-t bg-[#D4D4D4] data-[state=active]:bg-[#E3E3E3] border border-[#808080] data-[state=active]:border-b-[#E3E3E3] shadow-none! text-[16px]"
              >
                Appearance
              </TabsTrigger>
              <TabsTrigger
                value="sound"
                className="relative flex-1 h-6 px-2 -mb-[1px] rounded-t bg-[#D4D4D4] data-[state=active]:bg-[#E3E3E3] border border-[#808080] data-[state=active]:border-b-[#E3E3E3] shadow-none! text-[16px]"
              >
                Sound
              </TabsTrigger>
              <TabsTrigger
                value="system"
                className="relative flex-1 h-6 px-2 -mb-[1px] rounded-t bg-[#D4D4D4] data-[state=active]:bg-[#E3E3E3] border border-[#808080] data-[state=active]:border-b-[#E3E3E3] shadow-none! text-[16px]"
              >
                System
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="appearance"
              className="mt-0 bg-[#E3E3E3] border border-t-0 border-[#808080] h-[calc(100%-2rem)]"
            >
              <div className="space-y-4 h-full overflow-y-auto p-4">
                <WallpaperPicker />
              </div>
            </TabsContent>

            <TabsContent
              value="sound"
              className="mt-0 bg-[#E3E3E3] border border-t-0 border-[#808080] h-[calc(100%-2rem)]"
            >
              <div className="space-y-4 h-full overflow-y-auto p-4">
                {/* UI Sounds toggle + volume */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <Label>UI Sounds</Label>
                    <Switch
                      checked={uiSoundsEnabled}
                      onCheckedChange={handleUISoundsChange}
                      className="data-[state=checked]:bg-[#000000]"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <Label>Speech</Label>
                    <Switch
                      checked={speechEnabled}
                      onCheckedChange={handleSpeechChange}
                      className="data-[state=checked]:bg-[#000000]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <Label>Terminal & IE Ambient Synth</Label>
                  </div>
                  <Switch
                    checked={terminalSoundsEnabled}
                    onCheckedChange={setTerminalSoundsEnabled}
                    className="data-[state=checked]:bg-[#000000]"
                  />
                </div>

                {/* Chat Synth preset */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <Label>Chat Synth</Label>
                    <Select
                      value={synthPreset}
                      onValueChange={handleSynthPresetChange}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Select a preset" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SYNTH_PRESETS).map(([key, preset]) => (
                          <SelectItem key={key} value={key}>
                            {preset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Volume controls separator */}
                <hr className="border-gray-400 my-3" />

                {/* Vertical Volume Sliders - Mixer UI */}
                <VolumeMixer
                  masterVolume={masterVolume}
                  setMasterVolume={setMasterVolume}
                  setPrevMasterVolume={setPrevMasterVolume}
                  handleMasterMuteToggle={handleMasterMuteToggle}
                  uiVolume={uiVolume}
                  setUiVolume={setUiVolume}
                  setPrevUiVolume={setPrevUiVolume}
                  handleUiMuteToggle={handleUiMuteToggle}
                  speechVolume={speechVolume}
                  setSpeechVolume={setSpeechVolume}
                  setPrevSpeechVolume={setPrevSpeechVolume}
                  handleSpeechMuteToggle={handleSpeechMuteToggle}
                  chatSynthVolume={chatSynthVolume}
                  setChatSynthVolume={setChatSynthVolume}
                  setPrevChatSynthVolume={setPrevChatSynthVolume}
                  handleChatSynthMuteToggle={handleChatSynthMuteToggle}
                  ipodVolume={ipodVolume}
                  setIpodVolume={setIpodVolume}
                  setPrevIpodVolume={setPrevIpodVolume}
                  handleIpodMuteToggle={handleIpodMuteToggle}
                  isIOS={isIOS}
                />
              </div>
            </TabsContent>

            <TabsContent
              value="system"
              className="mt-0 bg-[#E3E3E3] border border-t-0 border-[#808080] h-[calc(100%-2rem)]"
            >
              <div className="space-y-4 h-full overflow-y-auto p-4">
                {/* User Account Section */}
                <div className="space-y-2">
                  {username ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[13px] font-geneva-12 font-medium">
                            @{username}
                          </span>
                          <span className="text-[11px] text-gray-600 font-geneva-12">
                            Logged in to ryOS
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {debugMode && (
                            <Button
                              variant="retro"
                              onClick={promptVerifyToken}
                              className="h-7"
                            >
                              Log In
                            </Button>
                          )}
                          {hasPassword === false ? (
                            <Button
                              variant="retro"
                              onClick={() => {
                                setPasswordInput("");
                                setPasswordError(null);
                                setIsPasswordDialogOpen(true);
                              }}
                              className="h-7"
                            >
                              Set Password
                            </Button>
                          ) : hasPassword === true ? (
                            <Button
                              variant="retro"
                              onClick={logout}
                              className="h-7"
                            >
                              Log Out
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[13px] font-geneva-12 font-medium">
                            ryOS Account
                          </span>
                          <span className="text-[11px] text-gray-600 font-geneva-12">
                            Login to access chat rooms and more.
                          </span>
                        </div>
                        <Button
                          variant="retro"
                          onClick={promptSetUsername}
                          className="h-7"
                        >
                          Create Account
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <hr className="border-gray-400 my-4" />

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      variant="retro"
                      onClick={handleBackup}
                      className="flex-1"
                    >
                      Backup
                    </Button>
                    <Button
                      variant="retro"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1"
                    >
                      Restore
                    </Button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleRestore}
                      accept=".json,.gz"
                      className="hidden"
                    />
                  </div>
                  <p className="text-[11px] text-gray-600 font-geneva-12">
                    Backup or restore all app settings and files.
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    variant="retro"
                    onClick={handleResetAll}
                    className="w-full"
                  >
                    Reset All Settings
                  </Button>
                  <p className="text-[11px] text-gray-600 font-geneva-12">
                    This will clear all saved settings and restore default
                    states.
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    variant="retro"
                    onClick={() => {
                      setIsConfirmFormatOpen(true);
                    }}
                    className="w-full"
                  >
                    Format File System
                  </Button>
                  <p className="text-[11px] text-gray-600 font-geneva-12">
                    This will clear all files (except sample docs), images, and
                    custom wallpapers. ryOS will restart after format.
                  </p>
                </div>

                <hr className="border-gray-400 my-4"></hr>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <Label>Debug Mode</Label>
                    <Label className="text-[11px] text-gray-600 font-geneva-12">
                      Enable debugging settings
                    </Label>
                  </div>
                  <Switch
                    checked={debugMode}
                    onCheckedChange={setDebugMode}
                    className="data-[state=checked]:bg-[#000000]"
                  />
                </div>

                {debugMode && (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <Label>Shader Effect</Label>
                      <Label className="text-[11px] text-gray-600 font-geneva-12">
                        Performance intensive background effect
                      </Label>
                    </div>
                    <Switch
                      checked={shaderEffectEnabled}
                      onCheckedChange={setShaderEffectEnabled}
                      className="data-[state=checked]:bg-[#000000]"
                    />
                  </div>
                )}

                {debugMode && (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <Label>AI Model</Label>
                      <Label className="text-[11px] text-gray-600 font-geneva-12">
                        Used in Chats, IE, and more
                      </Label>
                    </div>
                    <Select
                      value={aiModel || "__null__"}
                      onValueChange={(value) =>
                        setAiModel(
                          value === "__null__" ? null : (value as AIModel)
                        )
                      }
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Select">
                          {aiModel || "Select"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__null__">Default</SelectItem>
                        {AI_MODELS.map((model) => (
                          <SelectItem key={model.id} value={model.id as string}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {debugMode && (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <Label>TTS Model</Label>
                      <Label className="text-[11px] text-gray-600 font-geneva-12">
                        Text-to-speech provider
                      </Label>
                    </div>
                    <Select
                      value={ttsModel || "__null__"}
                      onValueChange={(value) =>
                        setTtsModel(
                          value === "__null__"
                            ? null
                            : (value as "openai" | "elevenlabs")
                        )
                      }
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Select">
                          {ttsModel || "Select"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__null__">Default</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {debugMode && ttsModel && (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <Label>TTS Voice</Label>
                      <Label className="text-[11px] text-gray-600 font-geneva-12">
                        {ttsModel === "elevenlabs"
                          ? "ElevenLabs Voice ID"
                          : "OpenAI Voice"}
                      </Label>
                    </div>
                    {ttsModel === "elevenlabs" ? (
                      <Select
                        value={ttsVoice || "__null__"}
                        onValueChange={(value) =>
                          setTtsVoice(value === "__null__" ? null : value)
                        }
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder="Select">
                            {ttsVoice === "YC3iw27qriLq7UUaqAyi"
                              ? "Ryo v3"
                              : ttsVoice === "kAyjEabBEu68HYYYRAHR"
                              ? "Ryo v2"
                              : ttsVoice === "G0mlS0y8ByHjGAOxBgvV"
                              ? "Ryo"
                              : "Select"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__null__">Select</SelectItem>
                          <SelectItem value="YC3iw27qriLq7UUaqAyi">
                            Ryo v3
                          </SelectItem>
                          <SelectItem value="kAyjEabBEu68HYYYRAHR">
                            Ryo v2
                          </SelectItem>
                          <SelectItem value="G0mlS0y8ByHjGAOxBgvV">
                            Ryo
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={ttsVoice || "__null__"}
                        onValueChange={(value) =>
                          setTtsVoice(value === "__null__" ? null : value)
                        }
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder="Select">
                            {ttsVoice || "Select"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__null__">Select</SelectItem>
                          <SelectItem value="alloy">Alloy</SelectItem>
                          <SelectItem value="echo">Echo</SelectItem>
                          <SelectItem value="fable">Fable</SelectItem>
                          <SelectItem value="onyx">Onyx</SelectItem>
                          <SelectItem value="nova">Nova</SelectItem>
                          <SelectItem value="shimmer">Shimmer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {debugMode && (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <Label>Boot Screen</Label>
                      <Label className="text-[11px] text-gray-600 font-geneva-12">
                        Test the boot screen animation
                      </Label>
                    </div>
                    <Button
                      variant="retro"
                      onClick={() => {
                        setNextBootMessage("Debug Boot Screen Test...");
                        window.location.reload();
                      }}
                      className="w-fit"
                    >
                      Show
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={helpItems}
          appName="Control Panels"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
        />
        <ConfirmDialog
          isOpen={isConfirmResetOpen}
          onOpenChange={setIsConfirmResetOpen}
          onConfirm={handleConfirmReset}
          title="Reset All Settings"
          description="Are you sure you want to reset all settings? This will clear all saved settings and restore default states. ryOS will restart after reset."
        />
        <ConfirmDialog
          isOpen={isConfirmFormatOpen}
          onOpenChange={setIsConfirmFormatOpen}
          onConfirm={handleConfirmFormat}
          title="Format File System"
          description="Are you sure you want to format the file system? This will permanently delete all documents (except sample documents), images, and custom wallpapers. ryOS will restart after format."
        />
        <AuthDialog
          isOpen={isUsernameDialogOpen || isVerifyDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setIsUsernameDialogOpen(false);
              setVerifyDialogOpen(false);
            }
          }}
          // Login props - use dedicated login form states to prevent re-renders
          onLogin={async (username: string, password: string) => {
            if (isUsernameDialogOpen) {
              // Coming from "Create Account" - use general login endpoint
              setVerifyUsernameInput(username);
              await handleVerifyTokenSubmit(password, true);
            } else {
              // Coming from token verification dialog - use existing logic
              await handleVerifyTokenSubmit(password, true);
            }
          }}
          loginUsernameInput={isUsernameDialogOpen ? loginFormUsername : verifyUsernameInput}
          onLoginUsernameInputChange={isUsernameDialogOpen ? setLoginFormUsername : setVerifyUsernameInput}
          loginPasswordInput={isUsernameDialogOpen ? loginFormPassword : verifyPasswordInput}
          onLoginPasswordInputChange={isUsernameDialogOpen ? setLoginFormPassword : setVerifyPasswordInput}
          // Sign up props
          onSignUp={submitUsernameDialog}
          signUpUsername={newUsername}
          onSignUpUsernameChange={setNewUsername}
          signUpPassword={newPassword}
          onSignUpPasswordChange={setNewPassword}
          // Common props
          isLoading={isSettingUsername || isVerifyingToken}
          error={usernameError || verifyError}
          onErrorChange={(error) => {
            setUsernameError(error);
            setVerifyError(error);
          }}
          initialTab={isUsernameDialogOpen ? "signup" : "login"}
        />
        <InputDialog
          isOpen={isPasswordDialogOpen}
          onOpenChange={setIsPasswordDialogOpen}
          onSubmit={handleSetPassword}
          title="Set Password"
          description="Set a password to enable account recovery. You can use this password to get a new token if you lose access."
          value={passwordInput}
          onChange={(value) => {
            setPasswordInput(value);
            setPasswordError(null);
          }}
          isLoading={isSettingPassword}
          errorMessage={passwordError}
          submitLabel="Set Password"
        />
      </WindowFrame>
    </>
  );
}
