import { useCallback, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { clearAllAppStates } from "@/stores/useAppStore";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
import {
  useAppStoreShallow,
  useAudioSettingsStoreShallow,
  useDisplaySettingsStoreShallow,
} from "@/stores/helpers";
import { DEFAULT_WALLPAPER_PATH } from "@/stores/useDisplaySettingsStore";
import { setNextBootMessage, clearNextBootMessage } from "@/utils/bootMessage";
import { clearPrefetchFlag, forceRefreshCache } from "@/utils/prefetch";
import { AI_MODEL_METADATA } from "@/types/aiModels";
import { triggerRuntimeCrashTest } from "@/utils/errorReporting";
import { SETTINGS_ANALYTICS, track } from "@/utils/analytics";
import {
  BACKUP_INDEXEDDB_STORES,
  upgradeLegacyBackupStoreValue,
  readStoreItems,
  restoreStoreItems,
  serializeStoreItems,
  type StoreItemWithKey,
} from "./backupShared";

const AI_MODELS = AI_MODEL_METADATA;

export function useSystemSettings() {
  const { t } = useTranslation();
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmFormatOpen, setIsConfirmFormatOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileToRestoreRef = useRef<File | null>(null);
  const { formatFileSystem } = useFileSystem();

  const { aiModel, setAiModel } = useAppStoreShallow((s) => ({
    aiModel: s.aiModel,
    setAiModel: s.setAiModel,
  }));

  const { setCurrentWallpaper } = useDisplaySettingsStoreShallow((s) => ({
    setCurrentWallpaper: s.setCurrentWallpaper,
  }));

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

  const performReset = () => {
    const fileMetadataStore = localStorage.getItem("ryos:files");
    const usernameRecovery = localStorage.getItem("_usr_recovery_key_");

    clearAllAppStates();
    clearPrefetchFlag();

    if (fileMetadataStore) {
      localStorage.setItem("ryos:files", fileMetadataStore);
    }
    if (usernameRecovery) {
      localStorage.setItem("_usr_recovery_key_", usernameRecovery);
    }

    window.location.reload();
  };

  const handleConfirmReset = () => {
    setIsConfirmResetOpen(false);
    track(SETTINGS_ANALYTICS.RESET, {
      appId: "control-panels",
      action: "reset_all",
    });
    setNextBootMessage(t("common.system.resettingSystem"));
    performReset();
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

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        backup.localStorage[key] = localStorage.getItem(key);
      }
    }

    try {
      const db = await ensureIndexedDBInitialized();
      const serializedStores = await Promise.all(
        BACKUP_INDEXEDDB_STORES.map(async (storeName) => [
          storeName,
          await serializeStoreItems(await readStoreItems(db, storeName)),
        ] as const)
      );
      for (const [storeName, items] of serializedStores) {
        backup.indexedDB[storeName] = items;
      }
      db.close();
    } catch (error) {
      console.error("Error backing up IndexedDB:", error);
      alert(t("apps.control-panels.alerts.failedToBackupFileSystem"));
    }

    const jsonString = JSON.stringify(backup);

    try {
      if (typeof CompressionStream === "undefined") {
        throw new Error("CompressionStream API not available in this browser");
      }

      const encoder = new TextEncoder();
      const inputData = encoder.encode(jsonString);

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

      const compressedBlob = new Blob(chunks as BlobPart[], {
        type: "application/gzip",
      });

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
        t("apps.control-panels.alerts.failedToCreateBackup", {
          error:
            compressionError instanceof Error
              ? compressionError.message
              : t("apps.control-panels.alerts.unknownError"),
        })
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

            const compressedResponse = new Response(arrayBuffer);
            const compressedStream = compressedResponse.body;

            if (!compressedStream) {
              throw new Error("Failed to create stream from compressed data");
            }

            const decompressionStream = new DecompressionStream("gzip");
            const decompressedStream =
              compressedStream.pipeThrough(decompressionStream);

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

        let backup;
        try {
          backup = JSON.parse(data);
        } catch (parseError) {
          console.error("JSON parse error:", parseError);
          throw new Error(
            "Invalid JSON format. The backup file may be corrupted."
          );
        }

        if (!backup || !backup.localStorage || !backup.timestamp) {
          throw new Error(
            "Invalid backup format. Missing required backup data."
          );
        }

        track(SETTINGS_ANALYTICS.RESET, {
          appId: "control-panels",
          action: "restore_backup",
          compressed: file.name.endsWith(".gz"),
        });

        clearAllAppStates();
        clearPrefetchFlag();

        Object.entries(backup.localStorage).forEach(([key, value]) => {
          if (value !== null) {
            localStorage.setItem(key, value as string);
          }
        });

        if (backup.indexedDB) {
          try {
            const db = await ensureIndexedDBInitialized();
            const restorePromises = BACKUP_INDEXEDDB_STORES.flatMap(
              (storeName) => {
                const items = backup.indexedDB?.[storeName];
                if (!items) {
                  return [];
                }

                return restoreStoreItems(db, storeName, items, {
                  mapValue: (value) =>
                    upgradeLegacyBackupStoreValue(
                      backup.version,
                      storeName,
                      value
                    ),
                });
              }
            );

            await Promise.all(restorePromises);
            db.close();
          } catch (error) {
            console.error("Error restoring IndexedDB:", error);
            alert(t("apps.control-panels.alerts.failedToRestoreFileSystem"));
          }
        }

        if (backup.localStorage["ryos:app:settings:wallpaper"]) {
          const wallpaper = backup.localStorage["ryos:app:settings:wallpaper"];
          if (wallpaper) {
            setCurrentWallpaper(wallpaper);
          }
        }

        try {
          const persistedKey = "ryos:files";
          const persistedState = localStorage.getItem(persistedKey);

          if (persistedState) {
            const parsed = JSON.parse(persistedState);
            if (parsed && parsed.state) {
              const hasItems =
                parsed.state.items &&
                Object.keys(parsed.state.items).length > 0;
              parsed.state.libraryState = hasItems
                ? "loaded"
                : "uninitialized";
              if (!parsed.version || parsed.version < 5) {
                parsed.version = 5;
              }
              localStorage.setItem(persistedKey, JSON.stringify(parsed));
            }
          }
        } catch (fallbackErr) {
          console.error(
            "[ControlPanels] Emergency fallback failed:",
            fallbackErr
          );
        }

        setNextBootMessage(t("common.system.restoringSystem"));

        window.location.reload();
      } catch (err) {
        console.error("Restore failed:", err);

        const detail =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : t("apps.control-panels.alerts.unknownError");
        alert(
          t("apps.control-panels.alerts.failedToRestoreBackup", {
            error: detail,
          })
        );
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
    track(SETTINGS_ANALYTICS.RESET, {
      appId: "control-panels",
      action: "format_file_system",
    });
    setCurrentWallpaper(DEFAULT_WALLPAPER_PATH);
    await formatFileSystem();
    clearPrefetchFlag();
    setNextBootMessage(t("common.system.formattingFileSystem"));
    window.location.reload();
  };

  const handleConfirmFormat = () => {
    setIsConfirmFormatOpen(false);
    setNextBootMessage(t("common.system.formattingFileSystem"));
    performFormat();
  };

  const handleCheckForUpdates = () => {
    forceRefreshCache();
  };

  const handleShowBootScreen = () => {
    setNextBootMessage(t("common.system.debugBootScreenTest"), true);
    window.location.reload();
  };

  const handleTriggerAppCrashTest = useCallback(() => {
    triggerRuntimeCrashTest({
      scope: "app",
      appId: "control-panels",
    });
  }, []);

  const handleTriggerDesktopCrashTest = useCallback(() => {
    triggerRuntimeCrashTest({
      scope: "desktop",
    });
  }, []);

  return {
    isConfirmResetOpen,
    setIsConfirmResetOpen,
    isConfirmFormatOpen,
    setIsConfirmFormatOpen,
    fileInputRef,
    handleRestore,
    handleBackup,
    handleResetAll,
    handleConfirmReset,
    handleConfirmFormat,
    handleCheckForUpdates,
    handleShowBootScreen,
    handleTriggerAppCrashTest,
    handleTriggerDesktopCrashTest,
    AI_MODELS,
    aiModel,
    setAiModel,
    terminalSoundsEnabled,
    setTerminalSoundsEnabled,
    uiSoundsEnabled,
    handleUISoundsChange,
    speechEnabled,
    handleSpeechChange,
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
  };
}
