export interface DescribedError {
  name?: string;
  message: string;
  cause?: string;
}

function causeText(cause: unknown): string | undefined {
  if (cause instanceof Error) {
    const message = cause.message.trim();
    return message || cause.name || undefined;
  }
  if (typeof cause === "string") {
    const message = cause.trim();
    return message || undefined;
  }
  return undefined;
}

/** Name, message, and cause as plain strings for client debug logs. */
export function describeErrorForLog(error: unknown): DescribedError {
  if (error instanceof Error) {
    const cause = causeText(error.cause);
    return {
      name: error.name,
      message: error.message,
      ...(cause ? { cause } : {}),
    };
  }
  return { message: typeof error === "string" ? error : String(error) };
}
