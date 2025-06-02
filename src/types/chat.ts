export type ChatMessage = {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: number;
};

export type ChatRoom = {
  id: string;
  name: string;
  /**
   * Room visibility type. Public rooms are visible to all users while
   * private rooms are only returned for members specified in `members`.
   */
  type?: "public" | "private";
  createdAt: number;
  userCount: number;
  /** Current active users in the room */
  users?: string[];
  /** Allowed participants for private rooms */
  members?: string[];
};

export type User = {
  username: string;
  lastActive: number;
}; 