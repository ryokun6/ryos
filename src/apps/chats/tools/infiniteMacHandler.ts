/**
 * Infinite Mac Control Tool Handler
 *
 * Controls the Infinite Mac emulator via postMessage API.
 * Supports launching systems, reading screen, mouse/keyboard control.
 * 
 * Coordinate Systems:
 * - Mini vMac (System 1, 6): Absolute coordinates supported
 * - Basilisk II (System 7.x): Absolute coordinates supported
 * - SheepShaver (Mac OS 8.x, 9.x): Absolute coordinates supported
 * - DingusPPC/PearPC (Mac OS X): Relative coordinates only (deltaX, deltaY)
 * 
 * When using screen_scale > 1, the screenshot dimensions are scaled but
 * coordinates should be in the native (unscaled) resolution space.
 */

import type { ToolContext } from "./types";
import { 
  useInfiniteMacStore, 
  MAC_PRESETS,
  type MacPreset,
} from "@/stores/useInfiniteMacStore";
import { useAppStore } from "@/stores/useAppStore";
import i18n from "@/lib/i18n";

const TOOL_NAME = "infiniteMacControl";

/**
 * Systems that support absolute mouse coordinates
 * (Mini vMac, Basilisk II, SheepShaver emulators)
 */
const ABSOLUTE_COORDINATE_SYSTEMS = new Set([
  "system-1",
  "system-6", 
  "system-7-5",
  "kanjitalk-7-5",
  "macos-8",
  "macos-8-5",
  "macos-9",
  "macos-9-2",
]);

// Note: Mac OS X systems (macosx-10-1 through 10-4) use DingusPPC/PearPC emulators
// which only support relative mouse coordinates (deltaX, deltaY), not absolute positioning.

/**
 * Check if a system supports absolute coordinates
 */
const supportsAbsoluteCoordinates = (systemId: string): boolean => {
  return ABSOLUTE_COORDINATE_SYSTEMS.has(systemId);
};

export interface InfiniteMacControlInput {
  action: 
    | "launchSystem"
    | "getStatus"
    | "readScreen"
    | "mouseMove"
    | "mouseClick"
    | "doubleClick"
    | "keyPress"
    | "pause"
    | "unpause";
  system?: string;
  x?: number;
  y?: number;
  button?: "left" | "right";
  key?: string;
}

type InfiniteMacState = ReturnType<typeof useInfiniteMacStore.getState>;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const addOutput = (
  context: ToolContext,
  toolCallId: string,
  output: unknown
): void => {
  context.addToolResult({
    tool: TOOL_NAME,
    toolCallId,
    output,
  });
};

const addError = (
  context: ToolContext,
  toolCallId: string,
  errorText: string
): void => {
  context.addToolResult({
    tool: TOOL_NAME,
    toolCallId,
    state: "output-error",
    errorText,
  });
};

const requireCoordinates = (
  action: "mouseMove" | "mouseClick" | "doubleClick",
  x: number | undefined,
  y: number | undefined,
  context: ToolContext,
  toolCallId: string
): { x: number; y: number } | undefined => {
  if (x !== undefined && y !== undefined) {
    return { x, y };
  }
  addError(
    context,
    toolCallId,
    `The '${action}' action requires 'x' and 'y' coordinates.`
  );
  return undefined;
};

const requireEmulatorLoaded = (
  store: InfiniteMacState,
  context: ToolContext,
  toolCallId: string
): boolean => {
  if (store.isEmulatorLoaded) {
    return true;
  }
  addError(context, toolCallId, "The emulator is not loaded. Use 'launchSystem' first.");
  return false;
};

const requireLoadedSystem = (
  store: InfiniteMacState,
  context: ToolContext,
  toolCallId: string
): store is InfiniteMacState & { selectedPreset: NonNullable<InfiniteMacState["selectedPreset"]> } => {
  if (store.isEmulatorLoaded && store.selectedPreset) {
    return true;
  }
  addError(context, toolCallId, "The emulator is not loaded. Use 'launchSystem' first.");
  return false;
};

const requireSelectedSystem = (
  store: InfiniteMacState,
  context: ToolContext,
  toolCallId: string
): store is InfiniteMacState & { selectedPreset: NonNullable<InfiniteMacState["selectedPreset"]> } => {
  if (store.selectedPreset) {
    return true;
  }
  addError(context, toolCallId, "No system is currently running. Use 'launchSystem' first.");
  return false;
};

const requireAbsoluteCoordinateSupport = (
  store: InfiniteMacState & { selectedPreset: NonNullable<InfiniteMacState["selectedPreset"]> },
  context: ToolContext,
  toolCallId: string,
  actionLabel: string
): boolean => {
  if (supportsAbsoluteCoordinates(store.selectedPreset.id)) {
    return true;
  }
  addError(
    context,
    toolCallId,
    `${actionLabel} is limited on ${store.selectedPreset.name} (Mac OS X uses relative coordinates only). Consider using an older Mac OS system for precise mouse control.`
  );
  return false;
};

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
    await sleep(pollIntervalMs);
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
          addError(context, toolCallId, "The 'launchSystem' action requires a 'system' parameter.");
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
          addError(
            context,
            toolCallId,
            `Unknown system '${system}'. Available systems: ${availableSystems.map((s) => s.id).join(", ")}`
          );
          return;
        }

        // Ensure the Infinite Mac app is open
        ensureInfiniteMacAppOpen(context);

        // Wait a moment for the app to initialize
        await sleep(500);

        // Set the selected preset via a custom event (the component will pick this up)
        // We need to dispatch this to the app instance
        window.dispatchEvent(
          new CustomEvent("infiniteMac:selectPreset", { detail: { preset } })
        );

        // Wait for emulator to load (with timeout)
        const loaded = await waitForEmulatorLoaded(45000);

        if (loaded) {
          addOutput(
            context,
            toolCallId,
            `Successfully launched ${preset.name} (${preset.year}). ${preset.description}. Screen size: ${preset.screenSize.width}x${preset.screenSize.height}. Use 'readScreen' to see the current display.`
          );
        } else {
          addOutput(
            context,
            toolCallId,
            `Launched ${preset.name} - the emulator is loading. It may take a few moments to fully boot. Use 'getStatus' to check when it's ready, or 'readScreen' to see the current display.`
          );
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
          addOutput(
            context,
            toolCallId,
            `No system is currently running. Use 'launchSystem' to start a Mac OS. Available systems: ${MAC_PRESETS.map((p) => `${p.id} (${p.name}, ${p.year})`).join(", ")}`
          );
        } else {
          addOutput(context, toolCallId, `Emulator status: ${JSON.stringify(status, null, 2)}`);
        }
        break;
      }

      case "readScreen": {
        const { getScreenAsBase64 } = store;

        if (!requireSelectedSystem(store, context, toolCallId)) {
          return;
        }

        if (!store.isEmulatorLoaded) {
          addError(context, toolCallId, "The emulator is still loading. Please wait and try again.");
          return;
        }

        const screenBase64 = await getScreenAsBase64();

        if (!screenBase64) {
          addError(
            context,
            toolCallId,
            "Unable to capture screen. The screen data is not yet available. Try again in a moment."
          );
          return;
        }

        // Get the current scale and calculate dimensions
        const scale = store.scale;
        const nativeScreenSize = store.selectedPreset.screenSize;
        const scaledScreenSize = store.lastScreenData
          ? { width: store.lastScreenData.width, height: store.lastScreenData.height }
          : { 
              width: Math.round(nativeScreenSize.width * scale), 
              height: Math.round(nativeScreenSize.height * scale) 
            };

        // Check if this system supports absolute coordinates
        const absoluteCoords = supportsAbsoluteCoordinates(store.selectedPreset.id);
        const coordInfo = absoluteCoords
          ? `Coordinates are 1:1 with the screenshot - use pixel positions directly from the image.`
          : `This Mac OS X system uses relative coordinates only - mouse control may be limited.`;

        addOutput(context, toolCallId, {
          success: true,
          message: `Screen captured from ${store.selectedPreset.name}. Screenshot is ${scaledScreenSize.width}x${scaledScreenSize.height} pixels (scale: ${scale}x, native: ${nativeScreenSize.width}x${nativeScreenSize.height}). ${coordInfo}`,
          screenSize: scaledScreenSize,
          nativeScreenSize,
          scale,
          currentSystem: store.selectedPreset.name,
          supportsAbsoluteCoordinates: absoluteCoords,
          // Include the base64 image data so it can be displayed in the UI or used programmatically
          screenImageDataUrl: screenBase64,
        });
        break;
      }

      case "mouseMove": {
        const coords = requireCoordinates("mouseMove", x, y, context, toolCallId);
        if (!coords) {
          return;
        }

        if (!requireLoadedSystem(store, context, toolCallId)) {
          return;
        }

        if (!requireAbsoluteCoordinateSupport(store, context, toolCallId, "Mouse movement")) {
          return;
        }

        // Coordinates from the AI are based on the screenshot dimensions
        // which match the emulator's screen output directly
        const moveSent = store.sendEmulatorCommand({
          type: "emulator_mouse_move",
          x: coords.x,
          y: coords.y,
        });

        if (moveSent) {
          addOutput(context, toolCallId, `Mouse moved to (${coords.x}, ${coords.y})`);
        } else {
          addError(context, toolCallId, "Failed to send mouse move command.");
        }
        break;
      }

      case "mouseClick": {
        const coords = requireCoordinates("mouseClick", x, y, context, toolCallId);
        if (!coords) {
          return;
        }

        if (!requireLoadedSystem(store, context, toolCallId)) {
          return;
        }

        if (!requireAbsoluteCoordinateSupport(store, context, toolCallId, "Mouse clicking")) {
          return;
        }

        const buttonNum = button === "right" ? 2 : 0;

        // Move mouse to position first - coordinates match screenshot dimensions
        store.sendEmulatorCommand({
          type: "emulator_mouse_move",
          x: coords.x,
          y: coords.y,
        });

        // Small delay between move and click
        await sleep(50);

        // Mouse down
        store.sendEmulatorCommand({
          type: "emulator_mouse_down",
          button: buttonNum,
        });

        // Small delay for click duration
        await sleep(100);

        // Mouse up
        const upSent = store.sendEmulatorCommand({
          type: "emulator_mouse_up",
          button: buttonNum,
        });

        if (upSent) {
          addOutput(
            context,
            toolCallId,
            `${button === "right" ? "Right-" : ""}Clicked at (${coords.x}, ${coords.y})`
          );
        } else {
          addError(context, toolCallId, "Failed to send mouse click command.");
        }
        break;
      }

      case "doubleClick": {
        const coords = requireCoordinates("doubleClick", x, y, context, toolCallId);
        if (!coords) {
          return;
        }

        if (!requireLoadedSystem(store, context, toolCallId)) {
          return;
        }

        if (!requireAbsoluteCoordinateSupport(store, context, toolCallId, "Double-clicking")) {
          return;
        }

        const dblButtonNum = button === "right" ? 2 : 0;

        // Move mouse to position first
        store.sendEmulatorCommand({
          type: "emulator_mouse_move",
          x: coords.x,
          y: coords.y,
        });

        // Small delay after move
        await sleep(30);

        // First click - fast down/up
        store.sendEmulatorCommand({
          type: "emulator_mouse_down",
          button: dblButtonNum,
        });
        await sleep(30);
        store.sendEmulatorCommand({
          type: "emulator_mouse_up",
          button: dblButtonNum,
        });

        // Very short delay between clicks (must be fast for double-click detection)
        await sleep(50);

        // Second click - fast down/up
        store.sendEmulatorCommand({
          type: "emulator_mouse_down",
          button: dblButtonNum,
        });
        await sleep(30);
        const dblUpSent = store.sendEmulatorCommand({
          type: "emulator_mouse_up",
          button: dblButtonNum,
        });

        if (dblUpSent) {
          addOutput(context, toolCallId, `Double-clicked at (${coords.x}, ${coords.y})`);
        } else {
          addError(context, toolCallId, "Failed to send double-click command.");
        }
        break;
      }

      case "keyPress": {
        if (!key) {
          addError(context, toolCallId, "The 'keyPress' action requires a 'key' parameter.");
          return;
        }

        if (!requireEmulatorLoaded(store, context, toolCallId)) {
          return;
        }

        // Key down
        store.sendEmulatorCommand({
          type: "emulator_key_down",
          code: key,
        });

        // Small delay for key press duration
        await sleep(100);

        // Key up
        const keyUpSent = store.sendEmulatorCommand({
          type: "emulator_key_up",
          code: key,
        });

        if (keyUpSent) {
          addOutput(context, toolCallId, `Key pressed: ${key}`);
        } else {
          addError(context, toolCallId, "Failed to send key press command.");
        }
        break;
      }

      case "pause": {
        if (!requireEmulatorLoaded(store, context, toolCallId)) {
          return;
        }

        const pauseSent = store.sendEmulatorCommand({ type: "emulator_pause" });
        store.setIsPaused(true);

        if (pauseSent) {
          addOutput(context, toolCallId, "Emulator paused.");
        } else {
          addError(context, toolCallId, "Failed to pause emulator.");
        }
        break;
      }

      case "unpause": {
        if (!requireEmulatorLoaded(store, context, toolCallId)) {
          return;
        }

        const unpauseSent = store.sendEmulatorCommand({ type: "emulator_unpause" });
        store.setIsPaused(false);

        if (unpauseSent) {
          addOutput(context, toolCallId, "Emulator unpaused.");
        } else {
          addError(context, toolCallId, "Failed to unpause emulator.");
        }
        break;
      }

      default:
        addError(context, toolCallId, `Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("[infiniteMacControl] Error:", error);
    addError(
      context,
      toolCallId,
      error instanceof Error ? error.message : i18n.t("apps.chats.toolCalls.unknownError")
    );
  }
};
