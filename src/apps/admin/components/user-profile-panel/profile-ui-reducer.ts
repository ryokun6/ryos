export type UserProfileUiState = {
  expandedMemories: Set<string>;
  expandedDailyNotes: Set<string>;
  expandedHeartbeats: Set<string>;
  banReason: string;
  showBanInput: boolean;
  isRoomsOpen: boolean;
  isMessagesOpen: boolean;
  isMemoriesOpen: boolean;
  isHeartbeatsOpen: boolean;
  hasLoadedMessages: boolean;
  hasLoadedMemories: boolean;
  hasLoadedHeartbeats: boolean;
  isMessagesLoading: boolean;
  isMemoriesLoading: boolean;
  isHeartbeatsLoading: boolean;
};

export type UserProfileUiAction =
  | { type: "resetForUsername" }
  | { type: "set"; payload: Partial<UserProfileUiState> }
  | { type: "toggleMemory"; key: string }
  | { type: "toggleDailyNote"; date: string }
  | { type: "toggleHeartbeat"; id: string };

export const initialUiState: UserProfileUiState = {
  expandedMemories: new Set(),
  expandedDailyNotes: new Set(),
  expandedHeartbeats: new Set(),
  banReason: "",
  showBanInput: false,
  isRoomsOpen: false,
  isMessagesOpen: false,
  isMemoriesOpen: false,
  isHeartbeatsOpen: false,
  hasLoadedMessages: false,
  hasLoadedMemories: false,
  hasLoadedHeartbeats: false,
  isMessagesLoading: false,
  isMemoriesLoading: false,
  isHeartbeatsLoading: false,
};

export function profileUiReducer(
  state: UserProfileUiState,
  action: UserProfileUiAction
): UserProfileUiState {
  switch (action.type) {
    case "resetForUsername":
      return initialUiState;
    case "set":
      return { ...state, ...action.payload };
    case "toggleMemory": {
      const next = new Set(state.expandedMemories);
      if (next.has(action.key)) next.delete(action.key);
      else next.add(action.key);
      return { ...state, expandedMemories: next };
    }
    case "toggleDailyNote": {
      const next = new Set(state.expandedDailyNotes);
      if (next.has(action.date)) next.delete(action.date);
      else next.add(action.date);
      return { ...state, expandedDailyNotes: next };
    }
    case "toggleHeartbeat": {
      const next = new Set(state.expandedHeartbeats);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ...state, expandedHeartbeats: next };
    }
    default:
      return state;
  }
}
