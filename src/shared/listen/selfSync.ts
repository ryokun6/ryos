/**
 * A playback tab ignores its own sync echo. After a reload the same user is
 * still the DJ, but the first room snapshot must be applied so the tab seeks
 * to the session instead of broadcasting a fresh local zero.
 */

export function isSelfOriginatedSync(args: {
  username: string | null;
  clientInstanceId: string | null;
  sourceUsername: string;
  sourceClientInstanceId?: string | null;
}): boolean {
  if (args.username == null) return false;
  if (args.sourceUsername.toLowerCase() !== args.username.toLowerCase()) return false;
  if (args.sourceClientInstanceId == null) return true;
  return args.sourceClientInstanceId === args.clientInstanceId;
}

export function shouldIgnoreOwnSyncEcho(args: {
  isDj: boolean;
  playbackCatchUp: boolean;
  username: string | null;
  clientInstanceId: string | null;
  sourceUsername: string;
  sourceClientInstanceId?: string | null;
}): boolean {
  return (
    args.isDj &&
    !args.playbackCatchUp &&
    isSelfOriginatedSync(args)
  );
}
