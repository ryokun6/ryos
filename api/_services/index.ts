/**
 * API Services - Shared business logic for API routes
 */

// Rooms
export {
  generateRoomId,
  getRoom,
  setRoom,
  deleteRoom,
  registerRoom,
  createRoom,
  updateRoomMembers,
  getAllRoomIds,
  getAllRooms,
  filterVisibleRooms,
} from "./rooms.js";

// Presence
export {
  setRoomPresence,
  removeRoomPresence,
  getActiveUsersInRoom,
  refreshRoomUserCount,
  deleteRoomPresence,
  getRoomsWithCounts,
  getRoomsWithUsers,
  cleanupExpiredPresence,
} from "./presence.js";

// Messages
export {
  generateMessageId,
  getMessages,
  getBulkMessages,
  addMessage,
  deleteMessage,
  deleteAllMessages,
  getLastMessage,
  isDuplicateMessage,
} from "./messages.js";

// Pusher
export {
  sanitizeForChannel,
  broadcastRoomUpdated,
  broadcastRoomCreated,
  broadcastRoomDeleted,
  broadcastNewMessage,
  broadcastMessageDeleted,
  broadcastToUsers,
} from "./pusher.js";
