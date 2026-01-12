export const BOOT_MESSAGE_KEY = "ryos:nextBootMessage";
export const BOOT_DEBUG_KEY = "ryos:bootDebugMode";

export const setNextBootMessage = (message: string, debugMode = false): void => {
  try {
    sessionStorage.setItem(BOOT_MESSAGE_KEY, message);
    if (debugMode) {
      sessionStorage.setItem(BOOT_DEBUG_KEY, "true");
    } else {
      sessionStorage.removeItem(BOOT_DEBUG_KEY);
    }
  } catch (error) {
    console.error("Error setting boot message in sessionStorage:", error);
  }
};

export const getNextBootMessage = (): string | null => {
  try {
    return sessionStorage.getItem(BOOT_MESSAGE_KEY);
  } catch (error) {
    console.error("Error getting boot message from sessionStorage:", error);
    return null;
  }
};

export const isBootDebugMode = (): boolean => {
  try {
    return sessionStorage.getItem(BOOT_DEBUG_KEY) === "true";
  } catch (error) {
    console.error("Error getting boot debug mode from sessionStorage:", error);
    return false;
  }
};

export const clearNextBootMessage = (): void => {
  try {
    sessionStorage.removeItem(BOOT_MESSAGE_KEY);
    sessionStorage.removeItem(BOOT_DEBUG_KEY);
  } catch (error) {
    console.error("Error clearing boot message from sessionStorage:", error);
  }
}; 