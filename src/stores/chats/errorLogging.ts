const NETWORK_ERROR_MESSAGE = "Network error. Please try again.";

export const logIfNetworkResultError = (
  message: string,
  error: string
): void => {
  if (error === NETWORK_ERROR_MESSAGE) {
    console.error(message);
  }
};
