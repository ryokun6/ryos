export const RECENT_MESSAGES_LIMIT = 50;
export const HEARTBEAT_LOOKBACK_DAYS = 7;

export const SECTION_HEADER_CLASS =
  "!text-[11px] uppercase tracking-wide text-black/50";

export interface UserProfile {
  username: string;
  lastActive: number;
  banned?: boolean;
  banReason?: string;
  bannedAt?: number;
  messageCount?: number;
  rooms?: { id: string; name: string }[];
}

export interface UserMessage {
  id: string;
  roomId: string;
  roomName?: string;
  content: string;
  timestamp: number;
}

export interface UserMemory {
  key: string;
  summary: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface DailyNoteEntry {
  timestamp: number;
  content: string;
}

export interface DailyNote {
  date: string;
  entries: DailyNoteEntry[];
  processedForMemories: boolean;
  updatedAt: number;
}

export interface HeartbeatRecord {
  id: string;
  timestamp: number;
  isoTimestamp?: string;
  localDate?: string;
  localTime?: string;
  timeZone?: string;
  shouldSend: boolean;
  topic: string;
  message: string | null;
  skipReason: string | null;
  stateSummary: string;
}

export interface UserProfilePanelProps {
  username: string;
  onBack: () => void;
  onUserDeleted: () => void;
}
