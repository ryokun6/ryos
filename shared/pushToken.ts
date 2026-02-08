export const PUSH_TOKEN_MIN_LENGTH = 20;
export const PUSH_TOKEN_MAX_LENGTH = 512;

export const PUSH_TOKEN_FORMAT_REGEX = new RegExp(
  `^[A-Za-z0-9:_\\-.]{${PUSH_TOKEN_MIN_LENGTH},${PUSH_TOKEN_MAX_LENGTH}}$`
);

export function isPushTokenFormat(token: string): boolean {
  return PUSH_TOKEN_FORMAT_REGEX.test(token);
}

export function normalizePushTokenValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return isPushTokenFormat(normalized) ? normalized : null;
}
