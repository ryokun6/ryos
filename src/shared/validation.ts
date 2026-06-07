// Shared, runtime-neutral validation primitives used by BOTH the frontend
// (instant client-side feedback) and the API (authoritative server checks).
//
// Keep this module dependency-free (no leo-profanity, no DOM, no Node) so it
// can be imported by the Vite frontend (`@/shared/validation`) and the Bun API
// (`../../src/shared/validation.js`). Profanity/HTML-escape/assert helpers that
// need server deps stay in `api/_utils/_validation.ts`.

// Message constraints
export const MAX_MESSAGE_LENGTH = 1000;

// Username constraints
export const MAX_USERNAME_LENGTH = 30;
export const MIN_USERNAME_LENGTH = 3;

// Usernames: 3-30 chars, start with a letter, letters/numbers, optional single
// hyphen/underscore between alphanumerics (no leading/trailing or consecutive
// separators). Examples ok: "alice", "john_doe", "foo-bar"; not ok: "_joe",
// "joe_", "a--b", "a__b", "a b", "a@b".
export const USERNAME_REGEX = /^[a-z](?:[a-z0-9]|[-_](?=[a-z0-9])){2,29}$/i;

// Room IDs generated internally are base-36 alphanumerics; still validate when
// received from the client.
export const ROOM_ID_REGEX = /^[a-z0-9]+$/i;

// Password constraints
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
