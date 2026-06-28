export type SessionTeardownReason = "logout" | "account-deleted" | "unauthorized";

export interface SessionTeardownContext {
  username: string;
  reason: SessionTeardownReason;
}

type SessionTeardownHandler = (
  context: SessionTeardownContext
) => void | Promise<void>;

const teardownHandlers = new Set<SessionTeardownHandler>();

export function registerSessionTeardown(
  handler: SessionTeardownHandler
): () => void {
  teardownHandlers.add(handler);
  return () => teardownHandlers.delete(handler);
}

export async function runSessionTeardown(
  context: SessionTeardownContext
): Promise<void> {
  await Promise.allSettled(
    Array.from(teardownHandlers, (handler) => Promise.resolve(handler(context)))
  );
}
