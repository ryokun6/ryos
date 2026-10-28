/** Window event the shell listens for to open the standard sign-in dialog. */
export const REQUEST_SIGN_IN_EVENT = "ryos:request-sign-in";

export function dispatchSignInRequest(target: EventTarget): void {
  target.dispatchEvent(new Event(REQUEST_SIGN_IN_EVENT));
}

/** Open the same sign-in dialog used by the Apple menu and other apps. */
export function requestSignIn(): void {
  if (typeof window === "undefined") return;
  dispatchSignInRequest(window);
}
