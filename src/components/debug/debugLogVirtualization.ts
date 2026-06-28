interface RestoredScrollTopOptions {
  previousScrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  stickToBottom: boolean;
}

export function getRestoredScrollTop({
  previousScrollTop,
  scrollHeight,
  clientHeight,
  stickToBottom,
}: RestoredScrollTopOptions): number {
  const maximumScrollTop = Math.max(0, scrollHeight - clientHeight);
  if (stickToBottom) return maximumScrollTop;
  return Math.min(Math.max(0, previousScrollTop), maximumScrollTop);
}
