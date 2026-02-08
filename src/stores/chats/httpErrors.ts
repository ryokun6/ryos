export interface ErrorResponseBody {
  error: string;
}

export const readErrorResponseBody = async (
  response: Response
): Promise<ErrorResponseBody> => {
  const fallbackError = `HTTP error! status: ${response.status}`;
  const parsed = await response
    .json()
    .catch(() => ({ error: fallbackError })) as { error?: unknown };

  return {
    error:
      typeof parsed.error === "string" && parsed.error.length > 0
        ? parsed.error
        : fallbackError,
  };
};
