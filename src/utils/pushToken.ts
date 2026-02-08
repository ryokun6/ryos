const PUSH_TOKEN_FORMAT_REGEX = /^[A-Za-z0-9:_\-.]{20,512}$/;

export function normalizePushToken(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return PUSH_TOKEN_FORMAT_REGEX.test(normalized) ? normalized : null;
}
