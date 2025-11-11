export const BOOT_MESSAGE_KEY = "zios:nextBootMessage";

export const setNextBootMessage = (message: string): void => {
  try {
    sessionStorage.setItem(BOOT_MESSAGE_KEY, message);
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

export const clearNextBootMessage = (): void => {
  try {
    sessionStorage.removeItem(BOOT_MESSAGE_KEY);
  } catch (error) {
    console.error("Error clearing boot message from sessionStorage:", error);
  }
}; 