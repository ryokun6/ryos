const PASSWORD_CHECK_DELAY_MS = 100;

export const shouldCheckPasswordStatus = (
  username: string | null,
  authToken: string | null
): boolean => Boolean(username && authToken);

export const schedulePasswordStatusCheck = (
  checkFn: () => void,
  delayMs: number = PASSWORD_CHECK_DELAY_MS
): void => {
  setTimeout(checkFn, delayMs);
};
