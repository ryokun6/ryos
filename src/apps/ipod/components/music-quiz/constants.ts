import {
  musicQuizMaxScore,
  MUSIC_QUIZ_SNIPPET_MS,
} from "../../utils/musicQuizScoring";

export const SNIPPET_DURATION_MS = MUSIC_QUIZ_SNIPPET_MS;
export const FEEDBACK_DURATION_MS = 1800;
export const TOTAL_ROUNDS = 5;
export const NUM_OPTIONS = 4;
export const MAX_GAME_SCORE = musicQuizMaxScore(TOTAL_ROUNDS);

export const SNIPPET_MIN_START_SEC = 20;
export const SNIPPET_MAX_FALLBACK_SEC = 180;

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const isIOS = /iP(hone|od|ad)/.test(ua);
const isSafari =
  /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
export const isIOSSafari = isIOS && isSafari;
