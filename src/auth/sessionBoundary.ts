export type SessionTeardownReason = "logout" | "account-deleted" | "unauthorized";

export interface SessionTeardownContext {
  username: string;
  reason: SessionTeardownReason;
}

type SessionTeardownHandler = (
  context: SessionTeardownContext
) => void | Promise<void>;

const teardownHandlers = new Set<SessionTeardownHandler>();
let authCookieRequestTail: Promise<void> = Promise.resolve();

/**
 * Browsers apply Set-Cookie before JavaScript observes a response. Keep every
 * request that can set or clear the auth cookie in invocation order so an
 * older response cannot overwrite the cookie produced by a newer auth action.
 */
export function serializeAuthCookieRequest<T>(
  request: () => Promise<T>
): Promise<T> {
  const result = authCookieRequestTail.then(request, request);
  authCookieRequestTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

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
