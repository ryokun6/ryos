type ChatRetryConfig = {
  maxAttempts: number;
  initialDelayMs: number;
};

type ChatRequestOptions = RequestInit & {
  timeout?: number;
  throwOnHttpError?: boolean;
  retry?: ChatRetryConfig;
};

const DEFAULT_CHAT_RETRY: ChatRetryConfig = {
  maxAttempts: 1,
  initialDelayMs: 250,
};

export const withChatRequestDefaults = (
  options: ChatRequestOptions
): ChatRequestOptions => {
  const mergedRetry: ChatRetryConfig = {
    ...DEFAULT_CHAT_RETRY,
    ...(options.retry || {}),
  };

  return {
    timeout: 15000,
    throwOnHttpError: false,
    ...options,
    retry: mergedRetry,
  };
};
