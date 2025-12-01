export const generateRequestId = () =>
  Math.random().toString(36).substring(2, 10);

export const logRequest = (method, url, action, id) => {
  console.log(`[${id}] ${method} ${url} - Action: ${action || "none"}`);
};

export const logInfo = (id, message, data) => {
  if (data !== undefined) {
    console.log(`[${id}] INFO: ${message}`, data);
    return;
  }
  console.log(`[${id}] INFO: ${message}`);
};

export const logError = (id, message, error) => {
  console.error(`[${id}] ERROR: ${message}`, error);
};
