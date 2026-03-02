export function shouldApplyLiveDesktopSyncPayload(params: {
  hasSession: boolean;
  isHost: boolean;
  username: string | null;
  syncedBy?: string;
  operationId?: string;
  lastAppliedOperationId?: string | null;
}): boolean {
  const {
    hasSession,
    isHost,
    username,
    syncedBy,
    operationId,
    lastAppliedOperationId,
  } = params;

  if (!hasSession) return false;
  if (isHost) return false;
  if (!operationId) return false;
  if (username && syncedBy === username) return false;
  if (lastAppliedOperationId && lastAppliedOperationId === operationId) return false;
  return true;
}
