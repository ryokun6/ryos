import {
  normalizePushTokenValue,
  PUSH_TOKEN_MAX_LENGTH,
  PUSH_TOKEN_MIN_LENGTH,
} from "../../shared/pushToken";

export { PUSH_TOKEN_MIN_LENGTH, PUSH_TOKEN_MAX_LENGTH };

export function normalizePushToken(value: unknown): string | null {
  return normalizePushTokenValue(value);
}
