export const LEGACY_AUTH_TOKEN_RECOVERY_KEY = "_auth_recovery_key_";

export function clearLegacyTokenRecovery(): void {
  localStorage.removeItem(LEGACY_AUTH_TOKEN_RECOVERY_KEY);
}

export function consumeLegacyAuthToken(): string | null {
  const encoded = localStorage.getItem(LEGACY_AUTH_TOKEN_RECOVERY_KEY);
  if (!encoded) return null;
  localStorage.removeItem(LEGACY_AUTH_TOKEN_RECOVERY_KEY);
  try {
    return atob(encoded).split("").reverse().join("");
  } catch {
    return null;
  }
}
