export const toggleBoolean = (value: boolean): boolean => !value;

export const resolveNextFontSize = (
  currentSize: number,
  sizeOrFn: number | ((prevSize: number) => number)
): number =>
  typeof sizeOrFn === "function" ? sizeOrFn(currentSize) : sizeOrFn;

export const sanitizeMessageRenderLimit = (limit: number): number =>
  Math.max(20, Math.floor(limit));

export const incrementUnreadCount = (
  unreadCounts: Record<string, number>,
  roomId: string
): Record<string, number> => ({
  ...unreadCounts,
  [roomId]: (unreadCounts[roomId] || 0) + 1,
});

export const clearUnreadCount = (
  unreadCounts: Record<string, number>,
  roomId: string
): Record<string, number> => {
  const { [roomId]: _removed, ...rest } = unreadCounts;
  return rest;
};
