import { Redis } from '@upstash/redis';
import { Filter } from 'bad-words';
import Pusher from 'pusher';

// Initialize profanity filter with custom placeholder
const filter = new Filter({ placeHolder: '█' });

// Add additional words to the blacklist
filter.addWords('badword1', 'badword2', 'inappropriate');

// Set up Redis client
const redis = new Redis({
  url: process.env.REDIS_KV_REST_API_URL,
  token: process.env.REDIS_KV_REST_API_TOKEN,
});

// Initialize Pusher
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true
});

// Logging utilities
const logRequest = (method, url, action, id) => {
  console.log(`[${id}] ${method} ${url} - Action: ${action || 'none'}`);
};

const logInfo = (id, message, data) => {
  console.log(`[${id}] INFO: ${message}`, data ? data : '');
};

const logError = (id, message, error) => {
  console.error(`[${id}] ERROR: ${message}`, error);
};

const generateRequestId = () => {
  return Math.random().toString(36).substring(2, 10);
};

// API runtime config
export const runtime = "nodejs";
export const maxDuration = 15;

// Redis key prefixes
const CHAT_ROOM_PREFIX = 'chat:room:';
const CHAT_MESSAGES_PREFIX = 'chat:messages:';
const CHAT_USERS_PREFIX = 'chat:users:';
const CHAT_ROOM_USERS_PREFIX = 'chat:room:users:';

// USER TTL (in seconds) – after this period of inactivity the user record expires automatically
const USER_TTL_SECONDS = 60 * 30; // 30 minutes

// Add constants for max message and username length
const MAX_MESSAGE_LENGTH = 280;
const MAX_USERNAME_LENGTH = 20;

/**
 * Helper to set (or update) a user record **with** an expiry so stale
 * users are automatically evicted by Redis.
 */
const setUserWithTTL = async (username, data) => {
  await redis.set(`${CHAT_USERS_PREFIX}${username}`, JSON.stringify(data), {
    ex: USER_TTL_SECONDS,
  });
};

/**
 * Returns the list of active usernames in a room (based on presence of the
 * user key). Any stale usernames that no longer have a backing user key are
 * pruned from the room set so that future SCARD operations are accurate.
 */
const getActiveUsersAndPrune = async (roomId) => {
  const roomUsersKey = `${CHAT_ROOM_USERS_PREFIX}${roomId}`;
  const usernames = await redis.smembers(roomUsersKey);

  if (usernames.length === 0) return [];

  // Fetch all user keys in a single round-trip
  const userKeys = usernames.map((u) => `${CHAT_USERS_PREFIX}${u}`);
  const userDataList = await redis.mget(...userKeys);

  const activeUsers = [];
  const staleUsers = [];

  usernames.forEach((username, idx) => {
    if (userDataList[idx]) {
      activeUsers.push(username);
    } else {
      staleUsers.push(username);
    }
  });

  // Remove stale users from the set so counts stay in sync
  if (staleUsers.length > 0) {
    await redis.srem(roomUsersKey, ...staleUsers);
  }

  return activeUsers;
};

/**
 * Re-calculates the active user count for a room, updates the stored room
 * object and returns the fresh count.
 */
const refreshRoomUserCount = async (roomId) => {
  const activeUsers = await getActiveUsersAndPrune(roomId);
  const userCount = activeUsers.length;

  const roomKey = `${CHAT_ROOM_PREFIX}${roomId}`;
  const roomDataRaw = await redis.get(roomKey);
  const roomData = typeof roomDataRaw === 'string' ? (() => { try { return JSON.parse(roomDataRaw); } catch { return null; } })() : roomDataRaw;
  if (roomData) {
    const updatedRoom = { ...roomData, userCount };
    await redis.set(roomKey, updatedRoom);
  }

  return userCount;
};

// Helper functions
const generateId = () => {
  return Math.random().toString(36).substring(2, 15);
};

const getCurrentTimestamp = () => {
  return Date.now();
};

// Error response helper
const createErrorResponse = (message, status) => {
  return new Response(JSON.stringify({ error: message }), { 
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

// Utility to ensure user data is an object
const parseUserData = (data) => {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data; // Already object
};

// Helper function to ensure user exists or create them
async function ensureUserExists(username, requestId) {
  const userKey = `${CHAT_USERS_PREFIX}${username}`;

  // Check for profanity first
  if (filter.isProfane(username)) {
      logInfo(requestId, `User check failed: Username contains inappropriate language: ${username}`);
      throw new Error('Username contains inappropriate language');
  }
  
  if (username.length > MAX_USERNAME_LENGTH) {
      logInfo(requestId, `User check failed: Username exceeds maximum length: ${username}`);
      throw new Error(`Username cannot exceed ${MAX_USERNAME_LENGTH} characters`);
  }

  // Attempt to get existing user
  let userData = await redis.get(userKey);
  if (userData) {
    logInfo(requestId, `User ${username} exists. Refreshing TTL.`);
    await redis.expire(userKey, USER_EXPIRATION_TIME); // Refresh TTL
    return parseUserData(userData);
  }

  // User doesn't exist, attempt atomic creation
  logInfo(requestId, `User ${username} not found. Attempting creation.`);
  const newUser = {
    username,
    lastActive: getCurrentTimestamp()
  };
  const created = await redis.setnx(userKey, JSON.stringify(newUser));

  if (created) {
    logInfo(requestId, `User ${username} created successfully. Setting TTL.`);
    await redis.expire(userKey, USER_EXPIRATION_TIME);
    return newUser;
  } else {
    // Race condition: User was created between GET and SETNX. Fetch the existing user.
    logInfo(requestId, `User ${username} created concurrently. Fetching existing data.`);
    userData = await redis.get(userKey);
    if (userData) {
       await redis.expire(userKey, USER_EXPIRATION_TIME); // Refresh TTL just in case
       return parseUserData(userData);
    } else {
       // Should be rare, but handle case where user disappeared again
       logError(requestId, `User ${username} existed momentarily but is now gone. Race condition?`);
       throw new Error('Failed to ensure user existence due to race condition.');
    }
  }
}

// GET handler
export async function GET(request) {
  const requestId = generateRequestId();
  const startTime = performance.now();
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  
  logRequest('GET', request.url, action, requestId);

  try {
    switch (action) {
      case 'getRooms':
        return await handleGetRooms(requestId);
      case 'getRoom': {
        const roomId = url.searchParams.get('roomId');
        if (!roomId) {
          logInfo(requestId, 'Missing roomId parameter');
          return createErrorResponse('roomId query parameter is required', 400);
        }
        return await handleGetRoom(roomId, requestId);
      }
      case 'getMessages': {
        const roomId = url.searchParams.get('roomId');
        if (!roomId) {
          logInfo(requestId, 'Missing roomId parameter');
          return createErrorResponse('roomId query parameter is required', 400);
        }
        return await handleGetMessages(roomId, requestId);
      }
      case 'getUsers':
        return await handleGetUsers(requestId);
      default:
        logInfo(requestId, `Invalid action: ${action}`);
        return createErrorResponse('Invalid action', 400);
    }
  } catch (error) {
    logError(requestId, 'Error handling GET request:', error);
    return createErrorResponse('Internal server error', 500);
  } finally {
    const duration = performance.now() - startTime;
    logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms`);
  }
}

// POST handler
export async function POST(request) {
  const requestId = generateRequestId();
  const startTime = performance.now();
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  
  logRequest('POST', request.url, action, requestId);

  try {
    // Parse JSON body
    const body = await request.json();

    switch (action) {
      case 'createRoom':
        return await handleCreateRoom(body, requestId);
      case 'joinRoom':
        return await handleJoinRoom(body, requestId);
      case 'leaveRoom':
        return await handleLeaveRoom(body, requestId);
      case 'sendMessage':
        return await handleSendMessage(body, requestId);
      case 'deleteMessage':
        return await handleDeleteMessage(body, requestId);
      case 'createUser':
        return await handleCreateUser(body, requestId);
      case 'clearAllMessages':
        return await handleClearAllMessages(requestId);
      case 'resetUserCounts':
        return await handleResetUserCounts(requestId);
      default:
        logInfo(requestId, `Invalid action: ${action}`);
        return createErrorResponse('Invalid action', 400);
    }
  } catch (error) {
    logError(requestId, 'Error handling POST request:', error);
    return createErrorResponse('Internal server error', 500);
  } finally {
    const duration = performance.now() - startTime;
    logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms`);
  }
}

// DELETE handler
export async function DELETE(request) {
  const requestId = generateRequestId();
  const startTime = performance.now();
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  
  logRequest('DELETE', request.url, action, requestId);

  try {
    switch (action) {
      case 'deleteRoom': {
        const roomId = url.searchParams.get('roomId');
        if (!roomId) {
          logInfo(requestId, 'Missing roomId parameter');
          return createErrorResponse('roomId query parameter is required', 400);
        }
        return await handleDeleteRoom(roomId, requestId);
      }
      default:
        logInfo(requestId, `Invalid action: ${action}`);
        return createErrorResponse('Invalid action', 400);
    }
  } catch (error) {
    logError(requestId, 'Error handling DELETE request:', error);
    return createErrorResponse('Internal server error', 500);
  } finally {
    const duration = performance.now() - startTime;
    logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms`);
  }
}

// Room functions
async function handleGetRooms(requestId) {
  logInfo(requestId, 'Fetching all rooms');
  try {
    const keys = await redis.keys(`${CHAT_ROOM_PREFIX}*`);
    logInfo(requestId, `Found ${keys.length} rooms`);
    
    if (keys.length === 0) {
      return new Response(JSON.stringify({ rooms: [] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const roomsData = await redis.mget(...keys);

    // Refresh user counts for each room concurrently
    const rooms = await Promise.all(
      roomsData.map(async (room) => {
        if (!room) return null;
        const roomObj = typeof room === 'string' ? (() => { try { return JSON.parse(room); } catch { return null; } })() : room;
        if (!roomObj || !roomObj.id) return null;
        const userCount = await refreshRoomUserCount(roomObj.id);
        return { ...roomObj, userCount };
      })
    ).then(list => list.filter(Boolean));

    return new Response(JSON.stringify({ rooms }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logError(requestId, 'Error fetching rooms:', error);
    return createErrorResponse('Failed to fetch rooms', 500);
  }
}

async function handleGetRoom(roomId, requestId) {
  logInfo(requestId, `Fetching room: ${roomId}`);
  try {
    const roomRaw = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
    const roomObj = typeof roomRaw === 'string' ? (() => { try { return JSON.parse(roomRaw); } catch { return null; } })() : roomRaw;

    if (!roomObj) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse('Room not found', 404);
    }

    // Refresh user count before returning
    const userCount = await refreshRoomUserCount(roomId);
    const room = { ...roomObj, userCount };

    return new Response(JSON.stringify({ room }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logError(requestId, `Error fetching room ${roomId}:`, error);
    return createErrorResponse('Failed to fetch room', 500);
  }
}

async function handleCreateRoom(data, requestId) {
  const { name: originalName } = data;

  if (!originalName) {
    logInfo(requestId, 'Room creation failed: Name is required');
    return createErrorResponse('Room name is required', 400);
  }

  // Check for profanity in room name
  if (filter.isProfane(originalName)) {
    logInfo(requestId, `Room creation failed: Name contains inappropriate language: ${originalName}`);
    return createErrorResponse('Room name contains inappropriate language', 400);
  }

  const name = originalName.toLowerCase().replace(/ /g, '-');

  logInfo(requestId, `Creating room: ${name}`);
  try {
    const roomId = generateId();
    const room = {
      id: roomId,
      name,
      createdAt: getCurrentTimestamp(),
      userCount: 0
    };

    await redis.set(`${CHAT_ROOM_PREFIX}${roomId}`, room);
    logInfo(requestId, `Room created: ${roomId}`);

    // Trigger Pusher event for room creation
    try {
      // Get all rooms to send the updated list
      const keys = await redis.keys(`${CHAT_ROOM_PREFIX}*`);
      const roomsData = await redis.mget(...keys);
      const rooms = roomsData.map(room => room).filter(Boolean);
      
      await pusher.trigger('chats', 'rooms-updated', { rooms });
      logInfo(requestId, 'Pusher event triggered: rooms-updated');
    } catch (pusherError) {
      logError(requestId, 'Error triggering Pusher event for room creation:', pusherError);
      // Continue with response - Pusher error shouldn't block room creation
    }

    return new Response(JSON.stringify({ room }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logError(requestId, `Error creating room ${name}:`, error);
    return createErrorResponse('Failed to create room', 500);
  }
}

async function handleDeleteRoom(roomId, requestId) {
  logInfo(requestId, `Deleting room: ${roomId}`);
  try {
    const roomExists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);

    if (!roomExists) {
      logInfo(requestId, `Room not found for deletion: ${roomId}`);
      return createErrorResponse('Room not found', 404);
    }

    // Delete room and associated messages/users
    const pipeline = redis.pipeline();
    pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
    pipeline.del(`${CHAT_MESSAGES_PREFIX}${roomId}`);
    pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
    await pipeline.exec();
    logInfo(requestId, `Room deleted: ${roomId}`);

    // Trigger Pusher event for room deletion
    try {
      // Get all rooms to send the updated list
      const keys = await redis.keys(`${CHAT_ROOM_PREFIX}*`);
      const roomsData = await redis.mget(...keys);
      const rooms = roomsData.map(room => room).filter(Boolean);
      
      await pusher.trigger('chats', 'rooms-updated', { rooms });
      logInfo(requestId, 'Pusher event triggered: rooms-updated after deletion');
    } catch (pusherError) {
      logError(requestId, 'Error triggering Pusher event for room deletion:', pusherError);
      // Continue with response - Pusher error shouldn't block the operation
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logError(requestId, `Error deleting room ${roomId}:`, error);
    return createErrorResponse('Failed to delete room', 500);
  }
}

// Message functions
async function handleGetMessages(roomId, requestId) {
  logInfo(requestId, `Fetching messages for room: ${roomId}`);

  try {
    const roomExists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);

    if (!roomExists) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse('Room not found', 404);
    }

    const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
    // Fetch only the last 10 messages (most recent)
    const messagesStrings = await redis.lrange(messagesKey, 0, 19);
    logInfo(requestId, `Retrieved ${messagesStrings.length} raw messages for room ${roomId}`);

    // Parse each message string/object
    const messages = messagesStrings
      .map(item => {
        try {
          if (typeof item === 'object' && item !== null) {
            // Already an object, assume it's ChatMessage
            return item; 
          } else if (typeof item === 'string') {
            // Item is a string, try parsing it
            const parsed = JSON.parse(item);
            return parsed;
          } else {
            // Unexpected type
            logInfo(requestId, `Unexpected item type in list for room ${roomId}:`, item);
            return null;
          }
        } catch (e) {
          logError(requestId, `Failed to process or parse item for room ${roomId}:`, { item, error: e });
          return null;
        }
      })
      .filter(message => message !== null);

    logInfo(requestId, `Processed ${messages.length} valid messages for room ${roomId}`);

    return new Response(JSON.stringify({ messages }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logError(requestId, `Error fetching messages for room ${roomId}:`, error);
    return createErrorResponse('Failed to fetch messages', 500);
  }
}

// User expiration time in seconds (1 day)
const USER_EXPIRATION_TIME = 86400;

async function handleCreateUser(data, requestId) {
  const { username: originalUsername } = data;

  if (!originalUsername) {
    logInfo(requestId, 'User creation failed: Username is required');
    return createErrorResponse('Username is required', 400);
  }

  // Check for profanity in username
  if (filter.isProfane(originalUsername)) {
    logInfo(requestId, `User creation failed: Username contains inappropriate language: ${originalUsername}`);
    return createErrorResponse('Username contains inappropriate language', 400);
  }
  
  if (originalUsername.length > MAX_USERNAME_LENGTH) {
    logInfo(requestId, `User creation failed: Username exceeds maximum length: ${originalUsername}`);
    return createErrorResponse(`Username cannot exceed ${MAX_USERNAME_LENGTH} characters`, 400);
  }

  // Normalize username to lowercase
  const username = originalUsername.toLowerCase();

  logInfo(requestId, `Creating user: ${username}`);
  try {
    // Check if username already exists using setnx for atomicity
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const user = {
      username, // Store the normalized lowercase username
      lastActive: getCurrentTimestamp()
    };

    const created = await redis.setnx(userKey, JSON.stringify(user));

    if (!created) {
      // User already exists - return conflict error
      logInfo(requestId, `Username already taken: ${username}`);
      return createErrorResponse('Username already taken', 409);
    }

    // Set expiration time for the new user
    await redis.expire(userKey, USER_EXPIRATION_TIME);
    logInfo(requestId, `User created with 1-day expiration: ${username}`);
    
    return new Response(JSON.stringify({ user }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logError(requestId, `Error creating user ${username}:`, error);
    return createErrorResponse('Failed to create user', 500);
  }
}

// Room membership functions
async function handleJoinRoom(data, requestId) {
  const { roomId, username: originalUsername } = data;
  const username = originalUsername?.toLowerCase(); // Normalize

  if (!roomId || !username) {
    logInfo(requestId, 'Room join failed: Missing required fields', { roomId, username });
    return createErrorResponse('Room ID and username are required', 400);
  }

  logInfo(requestId, `User ${username} joining room ${roomId}`);
  try {
    // Use Promise.all for concurrent checks
    const [roomData, userData] = await Promise.all([
      redis.get(`${CHAT_ROOM_PREFIX}${roomId}`),
      redis.get(`${CHAT_USERS_PREFIX}${username}`)
    ]);

    if (!roomData) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse('Room not found', 404);
    }

    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      return createErrorResponse('User not found', 404);
    }

    // Add user to room set
    await redis.sadd(`${CHAT_ROOM_USERS_PREFIX}${roomId}`, username);

    // Update room user count - Fetch latest count after adding
    const userCount = await redis.scard(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
    const updatedRoom = { ...roomData, userCount };
    await redis.set(`${CHAT_ROOM_PREFIX}${roomId}`, updatedRoom);
    logInfo(requestId, `User ${username} joined room ${roomId}, new user count: ${userCount}`);

    // Update user's last active timestamp
    const updatedUser = { ...userData, lastActive: getCurrentTimestamp() };
    await redis.set(`${CHAT_USERS_PREFIX}${username}`, updatedUser);
    // Refresh user expiration
    await redis.expire(`${CHAT_USERS_PREFIX}${username}`, USER_EXPIRATION_TIME);
    logInfo(requestId, `User ${username} last active time updated and expiration reset to 1 day`);

    // Trigger Pusher events only if user count changed
    const previousUserCount = roomData.userCount; // Get count before update
    if (userCount !== previousUserCount) {
        try {
            // Trigger user count update
            await pusher.trigger('chats', 'user-count-updated', {
                roomId,
                userCount
            });
            logInfo(requestId, `Pusher event triggered: user-count-updated for room ${roomId}`);

            // Also send a rooms-updated event to refresh room lists in all clients
            const keys = await redis.keys(`${CHAT_ROOM_PREFIX}*`);
            const roomsData = await redis.mget(...keys);
            const rooms = roomsData.map(room => room).filter(Boolean);
            await pusher.trigger('chats', 'rooms-updated', { rooms });
            logInfo(requestId, 'Pusher event triggered: rooms-updated after user join');
        } catch (pusherError) {
            logError(requestId, 'Error triggering Pusher events for room join:', pusherError);
            // Continue with response - Pusher error shouldn't block operation
        }
    } else {
         logInfo(requestId, `Skipping Pusher events: user count (${userCount}) did not change.`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logError(requestId, `Error joining room ${roomId} for user ${username}:`, error);
    return createErrorResponse('Failed to join room', 500);
  }
}

async function handleLeaveRoom(data, requestId) {
  const { roomId, username: originalUsername } = data;
  const username = originalUsername?.toLowerCase(); // Normalize

  if (!roomId || !username) {
    logInfo(requestId, 'Room leave failed: Missing required fields', { roomId, username });
    return createErrorResponse('Room ID and username are required', 400);
  }

  logInfo(requestId, `User ${username} leaving room ${roomId}`);
  try {
    // Check if room exists first
    const roomData = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomData) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse('Room not found', 404);
    }

    // Remove user from room set
    const removed = await redis.srem(`${CHAT_ROOM_USERS_PREFIX}${roomId}`, username);

    // If user was actually removed, update the count
    if (removed) {
      // Re-calculate active user count after possible pruning of stale users
      const previousUserCount = roomData.userCount; // Get count before update
      const userCount = await refreshRoomUserCount(roomId);
      logInfo(requestId, `User ${username} left room ${roomId}, new active user count: ${userCount}`);

      // Trigger Pusher events only if user count changed
      if (userCount !== previousUserCount) {
          try {
            // Trigger user count update
            await pusher.trigger('chats', 'user-count-updated', {
              roomId,
              userCount
            });
            logInfo(requestId, `Pusher event triggered: user-count-updated for room ${roomId}`);

            // Also send a rooms-updated event
            const keys = await redis.keys(`${CHAT_ROOM_PREFIX}*`);
            const roomsData = await redis.mget(...keys);
            const rooms = roomsData.map(room => room).filter(Boolean);
            await pusher.trigger('chats', 'rooms-updated', { rooms });
            logInfo(requestId, 'Pusher event triggered: rooms-updated after user leave');
          } catch (pusherError) {
            logError(requestId, 'Error triggering Pusher events for room leave:', pusherError);
            // Continue with response - Pusher error shouldn't block operation
          }
      } else {
          logInfo(requestId, `Skipping Pusher events: user count (${userCount}) did not change.`);
      }
    } else {
      logInfo(requestId, `User ${username} was not in room ${roomId}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logError(requestId, `Error leaving room ${roomId} for user ${username}:`, error);
    return createErrorResponse('Failed to leave room', 500);
  }
}

// Function to clear all messages from all rooms
async function handleClearAllMessages(requestId) {
  logInfo(requestId, 'Clearing all chat messages from all rooms');
  try {
    // Get all message keys
    const messageKeys = await redis.keys(`${CHAT_MESSAGES_PREFIX}*`);
    logInfo(requestId, `Found ${messageKeys.length} message collections to clear`);
    
    if (messageKeys.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No messages to clear' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Delete all message keys
    const pipeline = redis.pipeline();
    messageKeys.forEach(key => {
      pipeline.del(key);
    });
    await pipeline.exec();
    
    logInfo(requestId, `Successfully cleared messages from ${messageKeys.length} rooms`);
    
    // Notify clients that messages have been cleared
    try {
      // For each room, trigger a room-message event with an empty message list
      const roomKeys = await redis.keys(`${CHAT_ROOM_PREFIX}*`);
      const roomsData = await redis.mget(...roomKeys);
      const rooms = roomsData.map(room => room).filter(Boolean);
      
      // Trigger a single event for all rooms to refresh
      await pusher.trigger('chats', 'messages-cleared', { 
        timestamp: getCurrentTimestamp()
      });
      
      logInfo(requestId, 'Pusher event triggered: messages-cleared');
    } catch (pusherError) {
      logError(requestId, 'Error triggering Pusher event for message clearing:', pusherError);
      // Continue with response - Pusher error shouldn't block the operation
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: `Cleared messages from ${messageKeys.length} rooms` 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logError(requestId, 'Error clearing all messages:', error);
    return createErrorResponse('Failed to clear messages', 500);
  }
}

// Function to reset all user counts in rooms and clear room user lists
async function handleResetUserCounts(requestId) {
  logInfo(requestId, 'Resetting all user counts and clearing room memberships');
  try {
    // Get all room keys
    const roomKeys = await redis.keys(`${CHAT_ROOM_PREFIX}*`);
    logInfo(requestId, `Found ${roomKeys.length} rooms to update`);
    
    if (roomKeys.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No rooms to update' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get all room user set keys
    const roomUserKeys = await redis.keys(`${CHAT_ROOM_USERS_PREFIX}*`);
    
    // First, clear all room user sets
    const deleteRoomUsersPipeline = redis.pipeline();
    roomUserKeys.forEach(key => {
      deleteRoomUsersPipeline.del(key);
    });
    await deleteRoomUsersPipeline.exec();
    logInfo(requestId, `Cleared ${roomUserKeys.length} room user sets`);
    
    // Then update all room objects to set userCount to 0
    const roomsData = await redis.mget(...roomKeys);
    const updateRoomsPipeline = redis.pipeline();
    
    roomsData.forEach((roomData, index) => {
      if (roomData) {
        const room = typeof roomData === 'object' ? roomData : JSON.parse(roomData);
        const updatedRoom = { ...room, userCount: 0 };
        updateRoomsPipeline.set(roomKeys[index], updatedRoom);
      }
    });
    
    await updateRoomsPipeline.exec();
    logInfo(requestId, `Reset user count to 0 for ${roomKeys.length} rooms`);
    
    // Notify clients that user counts have been reset
    try {
      // Get the updated rooms
      const updatedRoomsData = await redis.mget(...roomKeys);
      const updatedRooms = updatedRoomsData.map(room => room).filter(Boolean);
      
      // Trigger a rooms-updated event
      await pusher.trigger('chats', 'rooms-updated', { rooms: updatedRooms });
      logInfo(requestId, 'Pusher event triggered: rooms-updated after user count reset');
    } catch (pusherError) {
      logError(requestId, 'Error triggering Pusher event for user count reset:', pusherError);
      // Continue with response - Pusher error shouldn't block the operation
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: `Reset user counts for ${roomKeys.length} rooms` 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logError(requestId, 'Error resetting user counts:', error);
    return createErrorResponse('Failed to reset user counts', 500);
  }
}

// User functions
async function handleGetUsers(requestId) {
  logInfo(requestId, 'Fetching all users');
  try {
    const keys = await redis.keys(`${CHAT_USERS_PREFIX}*`);
    logInfo(requestId, `Found ${keys.length} users`);
    
    if (keys.length === 0) {
      return new Response(JSON.stringify({ users: [] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const usersData = await redis.mget(...keys);
    const users = usersData.map(user => user).filter(Boolean);

    return new Response(JSON.stringify({ users }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logError(requestId, 'Error fetching users:', error);
    return createErrorResponse('Failed to fetch users', 500);
  }
}

async function handleSendMessage(data, requestId) {
  const { roomId, username: originalUsername, content: originalContent } = data;
  const username = originalUsername?.toLowerCase(); // Normalize

  if (!roomId || !username || !originalContent) {
    logInfo(requestId, 'Message sending failed: Missing required fields', { roomId, username, hasContent: !!originalContent });
    return createErrorResponse('Room ID, username, and content are required', 400);
  }

  // Filter profanity from message content AFTER checking username profanity
  const content = filter.clean(originalContent);

  logInfo(requestId, `Sending message in room ${roomId} from user ${username}`);

  try {
    // Check if room exists
    const roomExists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomExists) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse('Room not found', 404);
    }

    // Ensure user exists (or create if not) - This now handles profanity check for username
    let userData;
    try {
      userData = await ensureUserExists(username, requestId);
       if (!userData) { // Should not happen if ensureUserExists throws errors correctly
         logError(requestId, `Failed to ensure user ${username} exists, ensureUserExists returned falsy.`);
         return createErrorResponse('Failed to verify or create user', 500);
      }
    } catch (error) {
      logError(requestId, `Error ensuring user ${username} exists:`, error);
      if (error.message === 'Username contains inappropriate language') {
          return createErrorResponse('Username contains inappropriate language', 400);
      }
      // Handle the rare race condition error specifically if needed, or just generic error
      if (error.message.includes('race condition')) {
          return createErrorResponse('Failed to send message due to temporary issue, please try again.', 500);
      }
      return createErrorResponse('Failed to verify or create user', 500);
    }

    // Validate message length
    if (content.length > MAX_MESSAGE_LENGTH) {
      logInfo(requestId, `Message too long from ${username}: length ${content.length}`);
      return createErrorResponse(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`, 400);
    }

    // Fetch last message from this user in this room to prevent duplicates
    const lastMessagesRaw = await redis.lrange(`${CHAT_MESSAGES_PREFIX}${roomId}`, 0, 0); // Most recent
    if (lastMessagesRaw.length > 0) {
      try {
        const lastMsgObj = JSON.parse(lastMessagesRaw[0]);
        if (lastMsgObj.username === username && lastMsgObj.content === content) {
          logInfo(requestId, `Duplicate message prevented from ${username}`);
          // Return 400 for duplicate
          return createErrorResponse('Duplicate message detected', 400);
        }
      } catch (e) {
        // ignore parse errors
        logError(requestId, `Error parsing last message for duplicate check`, e);
      }
    }

    // Create and save the message
    const messageId = generateId();
    const message = {
      id: messageId,
      roomId,
      username,
      content,
      timestamp: getCurrentTimestamp()
    };

    // Store message as stringified JSON in the list
    await redis.lpush(`${CHAT_MESSAGES_PREFIX}${roomId}`, JSON.stringify(message));
    // Keep only the latest 100 messages per room
    await redis.ltrim(`${CHAT_MESSAGES_PREFIX}${roomId}`, 0, 99);
    logInfo(requestId, `Message saved with ID: ${message.id}`);

    // Update user's last active timestamp (userData is already parsed)
    // ensureUserExists already refreshed TTL, but updating lastActive is still correct
    const updatedUser = { ...userData, lastActive: getCurrentTimestamp() };
    await redis.set(`${CHAT_USERS_PREFIX}${username}`, JSON.stringify(updatedUser)); // Ensure it's stringified for Redis
    // Refresh expiration time again just to be safe upon activity
    await redis.expire(`${CHAT_USERS_PREFIX}${username}`, USER_EXPIRATION_TIME);
    logInfo(requestId, `Updated user ${username} last active timestamp and reset expiration`);


    // Trigger Pusher event for new message
    try {
      await pusher.trigger('chats', 'room-message', {
        roomId,
        message
      });
      logInfo(requestId, `Pusher event triggered: room-message for room ${roomId}`);
    } catch (pusherError) {
      logError(requestId, 'Error triggering Pusher event for new message:', pusherError);
      // Continue with response - Pusher error shouldn't block message sending
    }

    return new Response(JSON.stringify({ message }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
     // Catch any unexpected errors from the main try block
    logError(requestId, `Unexpected error sending message in room ${roomId} from user ${username}:`, error);
    return createErrorResponse('Failed to send message due to an internal error', 500);
  }
}

async function handleDeleteMessage(data, requestId) {
  const { roomId, messageId, username: originalUsername } = data;
  const username = originalUsername?.toLowerCase(); // Normalize

  if (!roomId || !messageId || !username) {
    logInfo(requestId, 'Message deletion failed: Missing required fields', { roomId, messageId, username });
    return createErrorResponse('Room ID, message ID and username are required', 400);
  }

  // Only admin user (ryo) can delete via this endpoint
  if (username !== 'ryo') { // Check against normalized lowercase
    logInfo(requestId, `Unauthorized delete attempt by ${username}`);
    return createErrorResponse('Forbidden', 403);
  }

  logInfo(requestId, `Deleting message ${messageId} from room ${roomId} by admin ${username}`);
  try {
    // Check if room exists
    const roomExists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomExists) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse('Room not found', 404);
    }

    const listKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
    // Fetch all messages
    const messagesRaw = await redis.lrange(listKey, 0, -1);
    let targetRaw = null;
    for (const raw of messagesRaw) {
      try {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (obj && obj.id === messageId) {
          targetRaw = raw;
          break;
        }
      } catch {
        // skip parse errors
      }
    }

    if (!targetRaw) {
      logInfo(requestId, `Message not found in list: ${messageId}`);
      return createErrorResponse('Message not found', 404);
    }

    // Remove the specific raw string from list
    await redis.lrem(listKey, 1, targetRaw);
    logInfo(requestId, `Message deleted: ${messageId}`);

    // Trigger Pusher event for message deletion
    try {
      await pusher.trigger('chats', 'message-deleted', {
        roomId,
        messageId,
      });
      logInfo(requestId, `Pusher event triggered: message-deleted for room ${roomId}`);
    } catch (pusherError) {
      logError(requestId, 'Error triggering Pusher event for message deletion:', pusherError);
      // Continue with response - Pusher error shouldn't block message deletion
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logError(requestId, `Error deleting message ${messageId} from room ${roomId}:`, error);
    return createErrorResponse('Failed to delete message', 500);
  }
}  