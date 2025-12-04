export const generateRequestId = (): string =>
  Math.random().toString(36).substring(2, 10);

export const logRequest = (
  method: string,
  url: string,
  action: string | null | undefined,
  id: string
): void => {
  console.log(`[${id}] ${method} ${url} - Action: ${action || "none"}`);
};

export const logInfo = (
  id: string,
  message: string,
  data?: unknown
): void => {
  if (data !== undefined) {
    console.log(`[${id}] INFO: ${message}`, data);
    return;
  }
  console.log(`[${id}] INFO: ${message}`);
};

export const logError = (id: string, message: string, error: unknown): void => {
  console.error(`[${id}] ERROR: ${message}`, error);
};
