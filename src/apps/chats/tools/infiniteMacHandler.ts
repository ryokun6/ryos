/**
 * Infinite Mac Control Tool Handler
 *
 * Controls the Infinite Mac emulator via postMessage API.
 * Supports launching systems, reading screen, mouse/keyboard control.
 */

import type { ToolContext } from "./types";
import { 
  useInfiniteMacStore, 
  MAC_PRESETS,
  type MacPreset,
} from "@/stores/useInfiniteMacStore";
import { useAppStore } from "@/stores/useAppStore";
import i18n from "@/lib/i18n";

export interface InfiniteMacControlInput {
  action: 
    | "launchSystem"
    | "getStatus"
    | "readScreen"
    | "mouseMove"
    | "mouseClick"
    | "keyPress"
    | "pause"
    | "unpause";
  system?: string;
  x?: number;
  y?: number;
  button?: "left" | "right";
  key?: string;
}

/**
 * Ensure the Infinite Mac app is open
 */
const ensureInfiniteMacAppOpen = (context: ToolContext): string => {
  const appStore = useAppStore.getState();
  const infiniteMacInstances = appStore.getInstancesByAppId("infinite-mac");
  
  // Check if there's already an open instance
  const openInstance = infiniteMacInstances.find((inst) => inst.isOpen);
  if (openInstance) {
    return openInstance.instanceId;
  }
  
  // Launch a new instance
  return context.launchApp("infinite-mac");
};

/**
 * Get a preset by its ID
 */
const getPresetById = (systemId: string): MacPreset | undefined => {
  return MAC_PRESETS.find((p) => p.id === systemId);
};

/**
 * Wait for the emulator to be loaded (with timeout)
 */
const waitForEmulatorLoaded = async (
  timeoutMs: number = 30000,
  pollIntervalMs: number = 500
): Promise<boolean> => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const { isEmulatorLoaded } = useInfiniteMacStore.getState();
    if (isEmulatorLoaded) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
};

/**
 * Handle Infinite Mac control tool call
 */
export const handleInfiniteMacControl = async (
  input: InfiniteMacControlInput,
  toolCallId: string,
  context: ToolContext
): Promise<void> => {
  const { action, system, x, y, button = "left", key } = input;
  const store = useInfiniteMacStore.getState();

  try {
    switch (action) {
      case "launchSystem": {
        if (!system) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "The 'launchSystem' action requires a 'system' parameter.",
          });
          return;
        }

        const preset = getPresetById(system);
        if (!preset) {
          const availableSystems = MAC_PRESETS.map((p) => ({
            id: p.id,
            name: p.name,
            year: p.year,
            description: p.description,
          }));
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: `Unknown system '${system}'. Available systems: ${availableSystems.map((s) => s.id).join(", ")}`,
          });
          return;
        }

        // Ensure the Infinite Mac app is open
        ensureInfiniteMacAppOpen(context);

        // Wait a moment for the app to initialize
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Set the selected preset via a custom event (the component will pick this up)
        // We need to dispatch this to the app instance
        window.dispatchEvent(
          new CustomEvent("infiniteMac:selectPreset", { detail: { preset } })
        );

        // Wait for emulator to load (with timeout)
        const loaded = await waitForEmulatorLoaded(45000);

        if (loaded) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            output: `Successfully launched ${preset.name} (${preset.year}). ${preset.description}. Screen size: ${preset.screenSize.width}x${preset.screenSize.height}. Use 'readScreen' to see the current display.`,
          });
        } else {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            output: `Launched ${preset.name} - the emulator is loading. It may take a few moments to fully boot. Use 'getStatus' to check when it's ready, or 'readScreen' to see the current display.`,
          });
        }
        break;
      }

      case "getStatus": {
        const { 
          isEmulatorLoaded, 
          isPaused, 
          selectedPreset,
          lastScreenData,
        } = store;

        const status = {
          isEmulatorLoaded,
          isPaused,
          currentSystem: selectedPreset
            ? `${selectedPreset.name} (${selectedPreset.year})`
            : null,
          screenSize: lastScreenData
            ? { width: lastScreenData.width, height: lastScreenData.height }
            : selectedPreset
              ? selectedPreset.screenSize
              : null,
        };

        if (!selectedPreset) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            output: `No system is currently running. Use 'launchSystem' to start a Mac OS. Available systems: ${MAC_PRESETS.map((p) => `${p.id} (${p.name}, ${p.year})`).join(", ")}`,
          });
        } else {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            output: `Emulator status: ${JSON.stringify(status, null, 2)}`,
          });
        }
        break;
      }

      case "readScreen": {
        const { isEmulatorLoaded, selectedPreset, getScreenAsBase64 } = store;

        if (!selectedPreset) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "No system is currently running. Use 'launchSystem' first.",
          });
          return;
        }

        if (!isEmulatorLoaded) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "The emulator is still loading. Please wait and try again.",
          });
          return;
        }

        const screenBase64 = await getScreenAsBase64();

        if (!screenBase64) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "Unable to capture screen. The screen data is not yet available. Try again in a moment.",
          });
          return;
        }

        context.addToolResult({
          tool: "infiniteMacControl",
          toolCallId,
          output: {
            message: `Screen captured from ${selectedPreset.name}`,
            screenImage: screenBase64,
            screenSize: store.lastScreenData
              ? { width: store.lastScreenData.width, height: store.lastScreenData.height }
              : selectedPreset.screenSize,
          },
        });
        break;
      }

      case "mouseMove": {
        if (x === undefined || y === undefined) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "The 'mouseMove' action requires 'x' and 'y' coordinates.",
          });
          return;
        }

        if (!store.isEmulatorLoaded) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "The emulator is not loaded. Use 'launchSystem' first.",
          });
          return;
        }

        const moveSent = store.sendEmulatorCommand({
          type: "emulator_mouse_move",
          x,
          y,
        });

        if (moveSent) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            output: `Mouse moved to (${x}, ${y})`,
          });
        } else {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "Failed to send mouse move command.",
          });
        }
        break;
      }

      case "mouseClick": {
        if (x === undefined || y === undefined) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "The 'mouseClick' action requires 'x' and 'y' coordinates.",
          });
          return;
        }

        if (!store.isEmulatorLoaded) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "The emulator is not loaded. Use 'launchSystem' first.",
          });
          return;
        }

        const buttonNum = button === "right" ? 2 : 0;

        // Move mouse to position first
        store.sendEmulatorCommand({
          type: "emulator_mouse_move",
          x,
          y,
        });

        // Small delay between move and click
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Mouse down
        store.sendEmulatorCommand({
          type: "emulator_mouse_down",
          button: buttonNum,
        });

        // Small delay for click duration
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Mouse up
        const upSent = store.sendEmulatorCommand({
          type: "emulator_mouse_up",
          button: buttonNum,
        });

        if (upSent) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            output: `${button === "right" ? "Right-" : ""}Clicked at (${x}, ${y})`,
          });
        } else {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "Failed to send mouse click command.",
          });
        }
        break;
      }

      case "keyPress": {
        if (!key) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "The 'keyPress' action requires a 'key' parameter.",
          });
          return;
        }

        if (!store.isEmulatorLoaded) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "The emulator is not loaded. Use 'launchSystem' first.",
          });
          return;
        }

        // Key down
        store.sendEmulatorCommand({
          type: "emulator_key_down",
          code: key,
        });

        // Small delay for key press duration
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Key up
        const keyUpSent = store.sendEmulatorCommand({
          type: "emulator_key_up",
          code: key,
        });

        if (keyUpSent) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            output: `Key pressed: ${key}`,
          });
        } else {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "Failed to send key press command.",
          });
        }
        break;
      }

      case "pause": {
        if (!store.isEmulatorLoaded) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "The emulator is not loaded. Use 'launchSystem' first.",
          });
          return;
        }

        const pauseSent = store.sendEmulatorCommand({ type: "emulator_pause" });
        store.setIsPaused(true);

        if (pauseSent) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            output: "Emulator paused.",
          });
        } else {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "Failed to pause emulator.",
          });
        }
        break;
      }

      case "unpause": {
        if (!store.isEmulatorLoaded) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "The emulator is not loaded. Use 'launchSystem' first.",
          });
          return;
        }

        const unpauseSent = store.sendEmulatorCommand({ type: "emulator_unpause" });
        store.setIsPaused(false);

        if (unpauseSent) {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            output: "Emulator unpaused.",
          });
        } else {
          context.addToolResult({
            tool: "infiniteMacControl",
            toolCallId,
            state: "output-error",
            errorText: "Failed to unpause emulator.",
          });
        }
        break;
      }

      default:
        context.addToolResult({
          tool: "infiniteMacControl",
          toolCallId,
          state: "output-error",
          errorText: `Unknown action: ${action}`,
        });
    }
  } catch (error) {
    console.error("[infiniteMacControl] Error:", error);
    context.addToolResult({
      tool: "infiniteMacControl",
      toolCallId,
      state: "output-error",
      errorText: error instanceof Error ? error.message : i18n.t("apps.chats.toolCalls.unknownError"),
    });
  }
};
