/**
 * Client Action Handler - Executes actions requested by server-side tools
 * This enables proper sequential tool chaining with state dependencies
 */

import { useCallback } from "react";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useAppStore } from "@/stores/useAppStore";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { AppId } from "@/config/appIds";
import type { OsThemeId } from "@/themes/types";
import { generateHTML, generateJSON } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { htmlToMarkdown, markdownToHtml } from "@/utils/markdown";
import { AnyExtension, JSONContent } from "@tiptap/core";
import type {
  ClientAction,
  ClientActionResult,
  LaunchAppActionParams,
  TextEditNewFileActionParams,
  TextEditInsertTextActionParams,
  TextEditSearchReplaceActionParams,
} from "@/types/clientActions";

export function useClientActionHandler() {
  const launchApp = useLaunchApp();
  const closeApp = useAppStore((state) => state.closeApp);

  const executeAction = useCallback(
    async (action: ClientAction): Promise<ClientActionResult> => {
      console.log(`[ClientAction] Executing: ${action.type}`, action.params);

      try {
        switch (action.type) {
          case "launchApp": {
            const { id, url, year } =
              action.params as unknown as LaunchAppActionParams;

            const launchOptions: {
              initialData?: { url?: string; year?: string };
            } = {};
            if (id === "internet-explorer" && (url || year)) {
              launchOptions.initialData = { url, year: year || "current" };
            }

            const instanceId = launchApp(id as AppId, launchOptions);

            return {
              success: true,
              data: { instanceId, appId: id },
            };
          }

          case "closeApp": {
            const { id } = action.params as unknown as { id: string };
            const appStore = useAppStore.getState();
            const appInstances = appStore.getInstancesByAppId(id as AppId);
            const openInstances = appInstances.filter((inst) => inst.isOpen);

            openInstances.forEach((instance) => {
              appStore.closeAppInstance(instance.instanceId);
            });

            closeApp(id as AppId);

            return {
              success: true,
              data: { closedCount: openInstances.length },
            };
          }

          case "textEditNewFile": {
            const { title } =
              action.params as unknown as TextEditNewFileActionParams;
            const appStore = useAppStore.getState();

            // Launch TextEdit and get the instance ID
            const instanceId = appStore.launchApp(
              "textedit",
              undefined,
              title,
              true
            );

            // Wait for app to initialize
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Bring to foreground
            appStore.bringInstanceToForeground(instanceId);

            return {
              success: true,
              data: { instanceId, title: title || "Untitled" },
            };
          }

          case "textEditInsertText": {
            const { instanceId, text, position } =
              action.params as unknown as TextEditInsertTextActionParams;

            const textEditState = useTextEditStore.getState();
            const targetInstance = textEditState.instances[instanceId];

            if (!targetInstance) {
              return {
                success: false,
                error: `TextEdit instance ${instanceId} not found`,
              };
            }

            const { updateInstance } = textEditState;

            // Convert markdown to TipTap JSON
            const htmlFragment = markdownToHtml(text);
            const parsedJson = generateJSON(htmlFragment, [
              StarterKit,
              Underline,
              TextAlign.configure({ types: ["heading", "paragraph"] }),
              TaskList,
              TaskItem.configure({ nested: true }),
            ] as AnyExtension[]);

            const nodesToInsert = Array.isArray(parsedJson.content)
              ? parsedJson.content
              : [];

            let newDocJson: JSONContent;

            if (
              targetInstance.contentJson &&
              Array.isArray(targetInstance.contentJson.content)
            ) {
              const cloned = JSON.parse(
                JSON.stringify(targetInstance.contentJson)
              );
              if (position === "start") {
                cloned.content = [...nodesToInsert, ...cloned.content];
              } else {
                cloned.content = [...cloned.content, ...nodesToInsert];
              }
              newDocJson = cloned;
            } else {
              newDocJson = parsedJson;
            }

            updateInstance(instanceId, {
              contentJson: newDocJson,
              hasUnsavedChanges: true,
            });

            // Bring to foreground
            const appStore = useAppStore.getState();
            appStore.bringInstanceToForeground(instanceId);

            return {
              success: true,
              data: { instanceId },
            };
          }

          case "textEditSearchReplace": {
            const { instanceId, search, replace, isRegex } =
              action.params as unknown as TextEditSearchReplaceActionParams;

            const textEditState = useTextEditStore.getState();
            const targetInstance = textEditState.instances[instanceId];

            if (!targetInstance) {
              return {
                success: false,
                error: `TextEdit instance ${instanceId} not found`,
              };
            }

            const { updateInstance } = textEditState;

            // Normalize line endings
            const normalizedSearch = search.replace(/\r\n?/g, "\n");
            const normalizedReplace = replace.replace(/\r\n?/g, "\n");

            const escapeRegExp = (str: string) =>
              str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            const currentContentJson = targetInstance.contentJson || {
              type: "doc",
              content: [{ type: "paragraph", content: [] }],
            };

            // Convert to markdown, replace, convert back
            const htmlStr = generateHTML(currentContentJson, [
              StarterKit,
              Underline,
              TextAlign.configure({ types: ["heading", "paragraph"] }),
              TaskList,
              TaskItem.configure({ nested: true }),
            ] as AnyExtension[]);

            const markdownStr = htmlToMarkdown(htmlStr);

            const pattern = isRegex
              ? normalizedSearch
              : escapeRegExp(normalizedSearch);
            const regex = new RegExp(pattern, "gm");
            const updatedMarkdown = markdownStr.replace(
              regex,
              normalizedReplace
            );

            if (updatedMarkdown === markdownStr) {
              return {
                success: false,
                error: "No matches found",
              };
            }

            const updatedHtml = markdownToHtml(updatedMarkdown);
            const updatedJson = generateJSON(updatedHtml, [
              StarterKit,
              Underline,
              TextAlign.configure({ types: ["heading", "paragraph"] }),
              TaskList,
              TaskItem.configure({ nested: true }),
            ] as AnyExtension[]);

            updateInstance(instanceId, {
              contentJson: updatedJson,
              hasUnsavedChanges: true,
            });

            // Bring to foreground
            const appStore = useAppStore.getState();
            appStore.bringInstanceToForeground(instanceId);

            return {
              success: true,
              data: { instanceId },
            };
          }

          case "switchTheme": {
            const { theme } = action.params as unknown as { theme: OsThemeId };
            const { setTheme } = useThemeStore.getState();
            setTheme(theme);

            return {
              success: true,
              data: { theme },
            };
          }

          case "ipodPlayPause": {
            const { action: playAction } = action.params as unknown as {
              action?: "play" | "pause" | "toggle";
            };

            const appState = useAppStore.getState();
            const ipodInstances = appState.getInstancesByAppId("ipod");
            const hasOpenIpodInstance = ipodInstances.some(
              (inst) => inst.isOpen
            );

            if (!hasOpenIpodInstance) {
              launchApp("ipod");
            }

            const ipod = useIpodStore.getState();

            switch (playAction) {
              case "play":
                if (!ipod.isPlaying) ipod.setIsPlaying(true);
                break;
              case "pause":
                if (ipod.isPlaying) ipod.setIsPlaying(false);
                break;
              default:
                ipod.togglePlay();
                break;
            }

            const nowPlaying = useIpodStore.getState().isPlaying;

            return {
              success: true,
              data: { isPlaying: nowPlaying },
            };
          }

          case "ipodPlaySong": {
            const { id, title, artist } = action.params as unknown as {
              id?: string;
              title?: string;
              artist?: string;
            };

            const appState = useAppStore.getState();
            const ipodInstances = appState.getInstancesByAppId("ipod");
            const hasOpenIpodInstance = ipodInstances.some(
              (inst) => inst.isOpen
            );

            if (!hasOpenIpodInstance) {
              launchApp("ipod");
            }

            const ipodState = useIpodStore.getState();
            const { tracks } = ipodState;

            // Helper for case-insensitive includes
            const ciIncludes = (
              source: string | undefined,
              query: string | undefined
            ): boolean => {
              if (!source || !query) return false;
              return source.toLowerCase().includes(query.toLowerCase());
            };

            let finalCandidateIndices: number[] = [];
            const allTracksWithIndices = tracks.map((t, idx) => ({
              track: t,
              index: idx,
            }));

            // Filter by ID first if provided
            const idFilteredTracks = id
              ? allTracksWithIndices.filter(({ track }) => track.id === id)
              : allTracksWithIndices;

            // Primary filter: title in track.title, artist in track.artist
            const primaryCandidates = idFilteredTracks.filter(({ track }) => {
              const titleMatches = title
                ? ciIncludes(track.title, title)
                : true;
              const artistMatches = artist
                ? ciIncludes(track.artist, artist)
                : true;
              return titleMatches && artistMatches;
            });

            if (primaryCandidates.length > 0) {
              finalCandidateIndices = primaryCandidates.map(
                ({ index }) => index
              );
            } else if (title || artist) {
              // Secondary filter (cross-match)
              const secondaryCandidates = idFilteredTracks.filter(
                ({ track }) => {
                  const titleInArtistMatches = title
                    ? ciIncludes(track.artist, title)
                    : false;
                  const artistInTitleMatches = artist
                    ? ciIncludes(track.title, artist)
                    : false;

                  if (title && artist) {
                    return titleInArtistMatches || artistInTitleMatches;
                  }
                  if (title) {
                    return titleInArtistMatches;
                  }
                  if (artist) {
                    return artistInTitleMatches;
                  }
                  return false;
                }
              );
              finalCandidateIndices = secondaryCandidates.map(
                ({ index }) => index
              );
            }

            if (finalCandidateIndices.length === 0) {
              return {
                success: false,
                error: "Song not found in iPod library",
              };
            }

            // Choose random match if multiple
            const randomIndexFromArray =
              finalCandidateIndices[
                Math.floor(Math.random() * finalCandidateIndices.length)
              ];

            const { setCurrentIndex, setIsPlaying } = useIpodStore.getState();
            setCurrentIndex(randomIndexFromArray);
            setIsPlaying(true);

            const track = tracks[randomIndexFromArray];

            return {
              success: true,
              data: { track: { title: track.title, artist: track.artist } },
            };
          }

          case "ipodAddAndPlaySong": {
            const { id } = action.params as unknown as { id: string };

            const appState = useAppStore.getState();
            const ipodInstances = appState.getInstancesByAppId("ipod");
            const hasOpenIpodInstance = ipodInstances.some(
              (inst) => inst.isOpen
            );

            if (!hasOpenIpodInstance) {
              launchApp("ipod");
            }

            const addedTrack = await useIpodStore
              .getState()
              .addTrackFromVideoId(id);

            if (addedTrack) {
              return {
                success: true,
                data: { track: { title: addedTrack.title } },
              };
            } else {
              return {
                success: false,
                error: "Failed to add song",
              };
            }
          }

          case "ipodNextTrack": {
            const appState = useAppStore.getState();
            const ipodInstances = appState.getInstancesByAppId("ipod");
            const hasOpenIpodInstance = ipodInstances.some(
              (inst) => inst.isOpen
            );

            if (!hasOpenIpodInstance) {
              launchApp("ipod");
            }

            const ipodState = useIpodStore.getState();
            const { nextTrack } = ipodState;
            if (typeof nextTrack === "function") {
              nextTrack();
            }

            const updatedIpod = useIpodStore.getState();
            const track = updatedIpod.tracks[updatedIpod.currentIndex];

            return {
              success: true,
              data: track
                ? { track: { title: track.title, artist: track.artist } }
                : {},
            };
          }

          case "ipodPreviousTrack": {
            const appState = useAppStore.getState();
            const ipodInstances = appState.getInstancesByAppId("ipod");
            const hasOpenIpodInstance = ipodInstances.some(
              (inst) => inst.isOpen
            );

            if (!hasOpenIpodInstance) {
              launchApp("ipod");
            }

            const ipodState = useIpodStore.getState();
            const { previousTrack } = ipodState;
            if (typeof previousTrack === "function") {
              previousTrack();
            }

            const updatedIpod = useIpodStore.getState();
            const track = updatedIpod.tracks[updatedIpod.currentIndex];

            return {
              success: true,
              data: track
                ? { track: { title: track.title, artist: track.artist } }
                : {},
            };
          }

          default:
            return {
              success: false,
              error: `Unknown action type: ${action.type}`,
            };
        }
      } catch (error) {
        console.error(`[ClientAction] Error executing ${action.type}:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    [launchApp, closeApp]
  );

  return { executeAction };
}
