import { Redis } from "@upstash/redis";
import { Filter } from "bad-words";
import Pusher from "pusher";
import crypto from "crypto";

// Initialize profanity filter with custom placeholder
const filter = new Filter({ placeHolder: "█" });

// Add additional words to the blacklist
filter.addWords("badword1", "badword2", "inappropriate");

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
  useTLS: true,
});

// Logging utilities
const logRequest = (method, url, action, id) => {
  console.log(`[${id}] ${method} ${url} - Action: ${action || "none"}`);
};

const logInfo = (id, message, data) => {
  console.log(`[${id}] INFO: ${message}`, data ? data : "");
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
const CHAT_ROOM_PREFIX = "chat:room:";
const CHAT_MESSAGES_PREFIX = "chat:messages:";
const CHAT_USERS_PREFIX = "chat:users:";
const CHAT_ROOM_USERS_PREFIX = "chat:room:users:";

// USER TTL (in seconds) – after this period of inactivity the user record expires automatically
const USER_TTL_SECONDS = 2592000; // 30 days

// User expiration time in seconds (30 days)
const USER_EXPIRATION_TIME = 2592000; // 30 days

// Add constants for max message and username length
const MAX_MESSAGE_LENGTH = 1000;
const MAX_USERNAME_LENGTH = 30;

// Token constants
const AUTH_TOKEN_PREFIX = "chat:token:";
const TOKEN_LENGTH = 32; // 32 bytes = 256 bits

/**
 * Generate a secure authentication token
 */
const generateAuthToken = () => {
  return crypto.randomBytes(TOKEN_LENGTH).toString("hex");
};

/**
 * Validate authentication for a request
 * @param {string} username - The username to validate
 * @param {string} token - The authentication token
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<boolean>} - True if authenticated, false otherwise
 */
const validateAuth = async (username, token, requestId) => {
  if (!username || !token) {
    logInfo(requestId, "Auth validation failed: Missing username or token");
    return false;
  }

  const tokenKey = `${AUTH_TOKEN_PREFIX}${username.toLowerCase()}`;
  const storedToken = await redis.get(tokenKey);

  if (!storedToken) {
    logInfo(
      requestId,
      `Auth validation failed: No token found for user ${username}`
    );
    return false;
  }

  if (storedToken !== token) {
    logInfo(
      requestId,
      `Auth validation failed: Invalid token for user ${username}`
    );
    return false;
  }

  // Refresh token expiration on successful validation
  await redis.expire(tokenKey, USER_TTL_SECONDS);
  return true;
};

/**
 * Extract authentication from request headers
 * @param {Request} request - The incoming request
 * @returns {{ username: string | null, token: string | null }}
 */
const extractAuth = (request) => {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { username: null, token: null };
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  const username = request.headers.get("x-username");

  return { username, token };
};

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
  const roomData =
    typeof roomDataRaw === "string"
      ? (() => {
          try {
            return JSON.parse(roomDataRaw);
          } catch {
            return null;
          }
        })()
      : roomDataRaw;
  if (roomData) {
    const updatedRoom = { ...roomData, userCount };
    await redis.set(roomKey, updatedRoom);
  }

  return userCount;
};

// Add helper to fetch rooms with user list
async function getDetailedRooms() {
  const keys = await redis.keys(`${CHAT_ROOM_PREFIX}*`);
  const roomsData = await redis.mget(...keys);
  const rooms = await Promise.all(
    roomsData.map(async (raw) => {
      if (!raw) return null;
      const roomObj = typeof raw === "string" ? JSON.parse(raw) : raw;
      const activeUsers = await getActiveUsersAndPrune(roomObj.id);
      return { ...roomObj, userCount: activeUsers.length, users: activeUsers };
    })
  );
  return rooms.filter((r) => r !== null);
}

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
    headers: { "Content-Type": "application/json" },
  });
};

// Utility to ensure user data is an object
const parseUserData = (data) => {
  if (!data) return null;
  if (typeof data === "string") {
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
    logInfo(
      requestId,
      `User check failed: Username contains inappropriate language: ${username}`
    );
    throw new Error("Username contains inappropriate language");
  }

  // Check username length
  if (username.length > MAX_USERNAME_LENGTH) {
    logInfo(
      requestId,
      `User check failed: Username too long: ${username.length} chars (max: ${MAX_USERNAME_LENGTH})`
    );
    throw new Error(
      `Username must be ${MAX_USERNAME_LENGTH} characters or less`
    );
  }

  // Attempt to get existing user
  let userData = await redis.get(userKey);
  if (userData) {
    logInfo(requestId, `User ${username} exists. Refreshing TTL.`);
    await redis.expire(userKey, USER_TTL_SECONDS); // Refresh TTL
    return parseUserData(userData);
  }

  // User doesn't exist, attempt atomic creation
  logInfo(requestId, `User ${username} not found. Attempting creation.`);
  const newUser = {
    username,
    lastActive: getCurrentTimestamp(),
  };
  const created = await redis.setnx(userKey, JSON.stringify(newUser));

  if (created) {
    logInfo(requestId, `User ${username} created successfully. Setting TTL.`);
    await redis.expire(userKey, USER_TTL_SECONDS);
    return newUser;
  } else {
    // Race condition: User was created between GET and SETNX. Fetch the existing user.
    logInfo(
      requestId,
      `User ${username} created concurrently. Fetching existing data.`
    );
    userData = await redis.get(userKey);
    if (userData) {
      await redis.expire(userKey, USER_TTL_SECONDS); // Refresh TTL just in case
      return parseUserData(userData);
    } else {
      // Should be rare, but handle case where user disappeared again
      logError(
        requestId,
        `User ${username} existed momentarily but is now gone. Race condition?`
      );
      throw new Error("Failed to ensure user existence due to race condition.");
    }
  }
}

// GET handler
export async function GET(request) {
  const requestId = generateRequestId();
  const startTime = performance.now();
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  logRequest("GET", request.url, action, requestId);

  try {
    // Actions that don't require authentication
    const publicActions = ["getRooms", "getMessages"];

    // Check authentication for protected actions
    if (!publicActions.includes(action)) {
      const { username, token } = extractAuth(request);

      // Validate authentication
      const isValid = await validateAuth(username, token, requestId);
      if (!isValid) {
        return createErrorResponse("Unauthorized", 401);
      }
    }

    switch (action) {
      case "getRooms": {
        const { username, token } = extractAuth(request);
        let validatedUser = null;
        if (username && token) {
          if (await validateAuth(username, token, requestId)) {
            validatedUser = username.toLowerCase();
          }
        }
        return await handleGetRooms(requestId, validatedUser);
      }
      case "getRoom": {
        const roomId = url.searchParams.get("roomId");
        if (!roomId) {
          logInfo(requestId, "Missing roomId parameter");
          return createErrorResponse("roomId query parameter is required", 400);
        }
        const { username, token } = extractAuth(request);
        let validatedUser = null;
        if (username && token) {
          if (await validateAuth(username, token, requestId)) {
            validatedUser = username.toLowerCase();
          }
        }
        return await handleGetRoom(roomId, requestId, validatedUser);
      }
      case "getMessages": {
        const roomId = url.searchParams.get("roomId");
        if (!roomId) {
          logInfo(requestId, "Missing roomId parameter");
          return createErrorResponse("roomId query parameter is required", 400);
        }
        return await handleGetMessages(roomId, requestId);
      }
      case "getRoomUsers": {
        const roomId = url.searchParams.get("roomId");
        if (!roomId) {
          logInfo(requestId, "Missing roomId parameter for getRoomUsers");
          return createErrorResponse("roomId query parameter is required", 400);
        }
        const users = await getActiveUsersAndPrune(roomId);
        return new Response(JSON.stringify({ users }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      case "getUsers":
        return await handleGetUsers(requestId);
      default:
        logInfo(requestId, `Invalid action: ${action}`);
        return createErrorResponse("Invalid action", 400);
    }
  } catch (error) {
    logError(requestId, "Error handling GET request:", error);
    return createErrorResponse("Internal server error", 500);
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
  const action = url.searchParams.get("action");

  logRequest("POST", request.url, action, requestId);

  try {
    // Parse JSON body
    const body = await request.json();

    // Declare username and token at function level
    let username = null;
    let token = null;

    // Actions that don't require authentication
    const publicActions = [
      "createUser",
      "joinRoom",
      "leaveRoom",
      "switchRoom",
      "generateToken",
    ];

    // Actions that specifically require authentication
    const protectedActions = [
      "createRoom",
      "sendMessage",
      "clearAllMessages",
      "resetUserCounts",
    ];

    // Check authentication for protected actions
    if (protectedActions.includes(action)) {
      const authResult = extractAuth(request);
      username = authResult.username;
      token = authResult.token;

      // For actions that include username in body, validate it matches the auth header
      if (
        body.username &&
        body.username.toLowerCase() !== username?.toLowerCase()
      ) {
        const allowedRyoProxy =
          action === "sendMessage" &&
          body.username.toLowerCase() === "ryo" &&
          username;
        if (!allowedRyoProxy) {
          logInfo(
            requestId,
            `Auth mismatch: body username (${body.username}) != auth username (${username})`
          );
          return createErrorResponse("Username mismatch", 401);
        }
      }

      // Validate authentication
      const isValid = await validateAuth(
        username || body.username,
        token,
        requestId
      );
      if (!isValid) {
        return createErrorResponse("Unauthorized", 401);
      }
    }

    switch (action) {
      case "createRoom":
        // Pass authenticated username for admin validation
        return await handleCreateRoom(body, username, requestId);
      case "joinRoom":
        return await handleJoinRoom(body, requestId);
      case "leaveRoom":
        return await handleLeaveRoom(body, requestId);
      case "switchRoom":
        return await handleSwitchRoom(body, requestId);
      case "sendMessage":
        return await handleSendMessage(body, requestId);
      case "createUser":
        return await handleCreateUser(body, requestId);
      case "generateToken":
        return await handleGenerateToken(body, requestId);
      case "clearAllMessages":
        // Pass authenticated username for admin validation
        return await handleClearAllMessages(username, requestId);
      case "resetUserCounts":
        // Pass authenticated username for admin validation
        return await handleResetUserCounts(username, requestId);
      default:
        logInfo(requestId, `Invalid action: ${action}`);
        return createErrorResponse("Invalid action", 400);
    }
  } catch (error) {
    logError(requestId, "Error handling POST request:", error);
    return createErrorResponse("Internal server error", 500);
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
  const action = url.searchParams.get("action");

  logRequest("DELETE", request.url, action, requestId);

  try {
    // All DELETE actions require authentication
    const { username, token } = extractAuth(request);

    // Validate authentication
    const isValid = await validateAuth(username, token, requestId);
    if (!isValid) {
      return createErrorResponse("Unauthorized", 401);
    }

    switch (action) {
      case "deleteRoom": {
        const roomId = url.searchParams.get("roomId");
        if (!roomId) {
          logInfo(requestId, "Missing roomId parameter");
          return createErrorResponse("roomId query parameter is required", 400);
        }
        // Pass authenticated username to handleDeleteRoom for admin validation
        return await handleDeleteRoom(roomId, username, requestId);
      }
      case "deleteMessage": {
        const roomId = url.searchParams.get("roomId");
        const messageId = url.searchParams.get("messageId");
        if (!roomId || !messageId) {
          logInfo(requestId, "Missing roomId or messageId parameter");
          return createErrorResponse(
            "roomId and messageId query parameters are required",
            400
          );
        }
        // Pass authenticated username to handleDeleteMessage for admin validation
        return await handleDeleteMessage(
          roomId,
          messageId,
          username,
          requestId
        );
      }
      default:
        logInfo(requestId, `Invalid action: ${action}`);
        return createErrorResponse("Invalid action", 400);
    }
  } catch (error) {
    logError(requestId, "Error handling DELETE request:", error);
    return createErrorResponse("Internal server error", 500);
  } finally {
    const duration = performance.now() - startTime;
    logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms`);
  }
}

// Room functions
async function handleGetRooms(requestId, username) {
  logInfo(requestId, `Fetching rooms for user: ${username || "public"}`);
  try {
    const rooms = await getDetailedRooms();
    const filtered = rooms.filter((room) => {
      if (room.type === "private") {
        if (!username) return false;
        const members = room.members || [];
        return members.includes(username.toLowerCase());
      }
      return true;
    });
    return new Response(JSON.stringify({ rooms: filtered }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, "Error fetching rooms:", error);
    return createErrorResponse("Failed to fetch rooms", 500);
  }
}

async function handleGetRoom(roomId, requestId, username) {
  logInfo(requestId, `Fetching room: ${roomId}`);
  try {
    const roomRaw = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
    const roomObj =
      typeof roomRaw === "string"
        ? (() => {
            try {
              return JSON.parse(roomRaw);
            } catch {
              return null;
            }
          })()
        : roomRaw;

    if (!roomObj) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    if (roomObj.type === "private") {
      const members = roomObj.members || [];
      if (!username || !members.includes(username.toLowerCase())) {
        logInfo(requestId, `Unauthorized access to private room ${roomId}`);
        return createErrorResponse("Forbidden", 403);
      }
    }

    // Refresh user count before returning
    const userCount = await refreshRoomUserCount(roomId);
    const room = { ...roomObj, userCount };

    return new Response(JSON.stringify({ room }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error fetching room ${roomId}:`, error);
    return createErrorResponse("Failed to fetch room", 500);
  }
}

async function handleCreateRoom(data, username, requestId) {
  const { name: originalName, type = "public", members = [] } = data;

  if (type === "public") {
    if (!originalName) {
      logInfo(requestId, "Room creation failed: Name is required");
      return createErrorResponse("Room name is required", 400);
    }

    // Only admin can create public rooms
    if (username?.toLowerCase() !== "ryo") {
      logInfo(requestId, `Unauthorized: User ${username} is not the admin`);
      return createErrorResponse("Forbidden - Admin access required", 403);
    }

    // Check for profanity in room name
    if (filter.isProfane(originalName)) {
      logInfo(
        requestId,
        `Room creation failed: Name contains inappropriate language: ${originalName}`
      );
      return createErrorResponse(
        "Room name contains inappropriate language",
        400
      );
    }
  }

  const name =
    (originalName || "private-room")
      .toLowerCase()
      .replace(/ /g, "-");

  logInfo(requestId, `Creating ${type} room: ${name} by ${username}`);
  try {
    const roomId = generateId();
    const room = {
      id: roomId,
      name,
      type,
      members: type === "private" ? [username.toLowerCase(), ...members.map((u) => u.toLowerCase())] : undefined,
      createdAt: getCurrentTimestamp(),
      userCount: 0,
    };

    if (room.members) {
      // Ensure unique members
      room.members = Array.from(new Set(room.members));
    }

    await redis.set(`${CHAT_ROOM_PREFIX}${roomId}`, room);
    logInfo(requestId, `Room created: ${roomId}`);

    // Trigger Pusher event for room creation
    try {
      const rooms = await getDetailedRooms();
      await pusher.trigger("chats", "rooms-updated", { rooms });
      logInfo(requestId, "Pusher event triggered: rooms-updated");
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for room creation:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block room creation
    }

    return new Response(JSON.stringify({ room }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error creating room ${name}:`, error);
    return createErrorResponse("Failed to create room", 500);
  }
}

async function handleDeleteRoom(roomId, username, requestId) {
  logInfo(requestId, `Deleting room: ${roomId}`);
  try {
    const roomExists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);

    if (!roomExists) {
      logInfo(requestId, `Room not found for deletion: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    // Check if the user is the admin ("ryo")
    if (username.toLowerCase() !== "ryo") {
      logInfo(requestId, `Unauthorized: User ${username} is not the admin`);
      return createErrorResponse("Unauthorized", 401);
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
      const rooms = await getDetailedRooms();
      await pusher.trigger("chats", "rooms-updated", { rooms });
      logInfo(
        requestId,
        "Pusher event triggered: rooms-updated after deletion"
      );
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for room deletion:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block the operation
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error deleting room ${roomId}:`, error);
    return createErrorResponse("Failed to delete room", 500);
  }
}

// Message functions
async function handleGetMessages(roomId, requestId) {
  logInfo(requestId, `Fetching messages for room: ${roomId}`);

  try {
    const roomExists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);

    if (!roomExists) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
    // Fetch only the last 10 messages (most recent)
    const messagesStrings = await redis.lrange(messagesKey, 0, 19);
    logInfo(
      requestId,
      `Retrieved ${messagesStrings.length} raw messages for room ${roomId}`
    );

    // Parse each message string/object
    const messages = messagesStrings
      .map((item) => {
        try {
          if (typeof item === "object" && item !== null) {
            // Already an object, assume it's ChatMessage
            return item;
          } else if (typeof item === "string") {
            // Item is a string, try parsing it
            const parsed = JSON.parse(item);
            return parsed;
          } else {
            // Unexpected type
            logInfo(
              requestId,
              `Unexpected item type in list for room ${roomId}:`,
              item
            );
            return null;
          }
        } catch (e) {
          logError(
            requestId,
            `Failed to process or parse item for room ${roomId}:`,
            { item, error: e }
          );
          return null;
        }
      })
      .filter((message) => message !== null);

    logInfo(
      requestId,
      `Processed ${messages.length} valid messages for room ${roomId}`
    );

    return new Response(JSON.stringify({ messages }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error fetching messages for room ${roomId}:`, error);
    return createErrorResponse("Failed to fetch messages", 500);
  }
}

async function handleCreateUser(data, requestId) {
  const { username: originalUsername } = data;

  if (!originalUsername) {
    logInfo(requestId, "User creation failed: Username is required");
    return createErrorResponse("Username is required", 400);
  }

  // Check for profanity in username
  if (filter.isProfane(originalUsername)) {
    logInfo(
      requestId,
      `User creation failed: Username contains inappropriate language: ${originalUsername}`
    );
    return createErrorResponse("Username contains inappropriate language", 400);
  }

  // Check username length
  if (originalUsername.length > MAX_USERNAME_LENGTH) {
    logInfo(
      requestId,
      `User creation failed: Username too long: ${originalUsername.length} chars (max: ${MAX_USERNAME_LENGTH})`
    );
    return createErrorResponse(
      `Username must be ${MAX_USERNAME_LENGTH} characters or less`,
      400
    );
  }

  // Normalize username to lowercase
  const username = originalUsername.toLowerCase();

  logInfo(requestId, `Creating user: ${username}`);
  try {
    // Check if username already exists using setnx for atomicity
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const user = {
      username, // Store the normalized lowercase username
      lastActive: getCurrentTimestamp(),
    };

    const created = await redis.setnx(userKey, JSON.stringify(user));

    if (!created) {
      // User already exists - return conflict error
      logInfo(requestId, `Username already taken: ${username}`);
      return createErrorResponse("Username already taken", 409);
    }

    // Generate authentication token
    const authToken = generateAuthToken();
    const tokenKey = `${AUTH_TOKEN_PREFIX}${username}`;

    // Store token with same expiration as user
    await redis.set(tokenKey, authToken, { ex: USER_EXPIRATION_TIME });

    // Set expiration time for the new user
    await redis.expire(userKey, USER_EXPIRATION_TIME);
    logInfo(
      requestId,
      `User created with 30-day expiration and auth token: ${username}`
    );

    return new Response(JSON.stringify({ user, token: authToken }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error creating user ${username}:`, error);
    return createErrorResponse("Failed to create user", 500);
  }
}

// Room membership functions
async function handleJoinRoom(data, requestId) {
  const { roomId, username: originalUsername } = data;
  const username = originalUsername?.toLowerCase(); // Normalize

  if (!roomId || !username) {
    logInfo(requestId, "Room join failed: Missing required fields", {
      roomId,
      username,
    });
    return createErrorResponse("Room ID and username are required", 400);
  }

  logInfo(requestId, `User ${username} joining room ${roomId}`);
  try {
    // Use Promise.all for concurrent checks
    const [roomData, userData] = await Promise.all([
      redis.get(`${CHAT_ROOM_PREFIX}${roomId}`),
      redis.get(`${CHAT_USERS_PREFIX}${username}`),
    ]);

    if (!roomData) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      return createErrorResponse("User not found", 404);
    }

    if (roomData.type === "private") {
      const members = roomData.members || [];
      if (!members.includes(username)) {
        logInfo(requestId, `User ${username} not allowed in private room ${roomId}`);
        return createErrorResponse("Forbidden", 403);
      }
    }

    // Add user to room set
    await redis.sadd(`${CHAT_ROOM_USERS_PREFIX}${roomId}`, username);

    // Update room user count - Fetch latest count after adding
    const userCount = await redis.scard(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
    const updatedRoom = { ...roomData, userCount };
    await redis.set(`${CHAT_ROOM_PREFIX}${roomId}`, updatedRoom);
    logInfo(
      requestId,
      `User ${username} joined room ${roomId}, new user count: ${userCount}`
    );

    // Update user's last active timestamp
    const updatedUser = { ...userData, lastActive: getCurrentTimestamp() };
    await redis.set(`${CHAT_USERS_PREFIX}${username}`, updatedUser);
    // Refresh user expiration
    await redis.expire(`${CHAT_USERS_PREFIX}${username}`, USER_EXPIRATION_TIME);
    logInfo(
      requestId,
      `User ${username} last active time updated and expiration reset to 30 days`
    );

    // Removed individual user-count-updated event; rooms-updated will carry the new count

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(
      requestId,
      `Error joining room ${roomId} for user ${username}:`,
      error
    );
    return createErrorResponse("Failed to join room", 500);
  }
}

async function handleLeaveRoom(data, requestId) {
  const { roomId, username: originalUsername } = data;
  const username = originalUsername?.toLowerCase(); // Normalize

  if (!roomId || !username) {
    logInfo(requestId, "Room leave failed: Missing required fields", {
      roomId,
      username,
    });
    return createErrorResponse("Room ID and username are required", 400);
  }

  logInfo(requestId, `User ${username} leaving room ${roomId}`);
  try {
    // Check if room exists first
    const roomData = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomData) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    // Remove user from room set
    const removed = await redis.srem(
      `${CHAT_ROOM_USERS_PREFIX}${roomId}`,
      username
    );

    // If user was actually removed, update the count
    if (removed) {
      // Re-calculate active user count after possible pruning of stale users
      const previousUserCount = roomData.userCount; // Get count before update
      const userCount = await refreshRoomUserCount(roomId);
      logInfo(
        requestId,
        `User ${username} left room ${roomId}, new active user count: ${userCount}`
      );

      // Trigger Pusher events only if user count changed
      if (userCount !== previousUserCount) {
        try {
          // Removed individual user-count-updated event; rooms-updated will carry the new count
        } catch (pusherError) {
          logError(
            requestId,
            "Error triggering Pusher events for room leave:",
            pusherError
          );
          // Continue with response - Pusher error shouldn't block operation
        }
      } else {
        logInfo(
          requestId,
          `Skipping Pusher events: user count (${userCount}) did not change.`
        );
      }
    } else {
      logInfo(requestId, `User ${username} was not in room ${roomId}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(
      requestId,
      `Error leaving room ${roomId} for user ${username}:`,
      error
    );
    return createErrorResponse("Failed to leave room", 500);
  }
}

// Function to clear all messages from all rooms
async function handleClearAllMessages(username, requestId) {
  logInfo(requestId, "Clearing all chat messages from all rooms");

  // Check if the user is the admin ("ryo")
  if (username?.toLowerCase() !== "ryo") {
    logInfo(requestId, `Unauthorized: User ${username} is not the admin`);
    return createErrorResponse("Forbidden - Admin access required", 403);
  }

  try {
    // Get all message keys
    const messageKeys = await redis.keys(`${CHAT_MESSAGES_PREFIX}*`);
    logInfo(
      requestId,
      `Found ${messageKeys.length} message collections to clear`
    );

    if (messageKeys.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No messages to clear" }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Delete all message keys
    const pipeline = redis.pipeline();
    messageKeys.forEach((key) => {
      pipeline.del(key);
    });
    await pipeline.exec();

    logInfo(
      requestId,
      `Successfully cleared messages from ${messageKeys.length} rooms`
    );

    // Notify clients that messages have been cleared
    try {
      // For each room, trigger a room-message event with an empty message list
      const roomKeys = await redis.keys(`${CHAT_ROOM_PREFIX}*`);
      const roomsData = await redis.mget(...roomKeys);
      const rooms = roomsData.map((r) => r).filter(Boolean);

      // Trigger a single event for all rooms to refresh
      await pusher.trigger("chats", "messages-cleared", {
        timestamp: getCurrentTimestamp(),
      });

      logInfo(requestId, "Pusher event triggered: messages-cleared");
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for message clearing:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block the operation
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleared messages from ${messageKeys.length} rooms`,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(requestId, "Error clearing all messages:", error);
    return createErrorResponse("Failed to clear messages", 500);
  }
}

// Function to reset all user counts in rooms and clear room user lists
async function handleResetUserCounts(username, requestId) {
  logInfo(requestId, "Resetting all user counts and clearing room memberships");

  // Check if the user is the admin ("ryo")
  if (username?.toLowerCase() !== "ryo") {
    logInfo(requestId, `Unauthorized: User ${username} is not the admin`);
    return createErrorResponse("Forbidden - Admin access required", 403);
  }

  try {
    // Get all room keys
    const roomKeys = await redis.keys(`${CHAT_ROOM_PREFIX}*`);
    logInfo(requestId, `Found ${roomKeys.length} rooms to update`);

    if (roomKeys.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No rooms to update" }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get all room user set keys
    const roomUserKeys = await redis.keys(`${CHAT_ROOM_USERS_PREFIX}*`);

    // First, clear all room user sets
    const deleteRoomUsersPipeline = redis.pipeline();
    roomUserKeys.forEach((key) => {
      deleteRoomUsersPipeline.del(key);
    });
    await deleteRoomUsersPipeline.exec();
    logInfo(requestId, `Cleared ${roomUserKeys.length} room user sets`);

    // Then update all room objects to set userCount to 0
    const roomsData = await redis.mget(...roomKeys);
    const updateRoomsPipeline = redis.pipeline();

    roomsData.forEach((roomData, index) => {
      if (roomData) {
        const room =
          typeof roomData === "object" ? roomData : JSON.parse(roomData);
        const updatedRoom = { ...room, userCount: 0 };
        updateRoomsPipeline.set(roomKeys[index], updatedRoom);
      }
    });

    await updateRoomsPipeline.exec();
    logInfo(requestId, `Reset user count to 0 for ${roomKeys.length} rooms`);

    // Notify clients that user counts have been reset
    try {
      const rooms = await getDetailedRooms();
      await pusher.trigger("chats", "rooms-updated", { rooms });
      logInfo(
        requestId,
        "Pusher event triggered: rooms-updated after user count reset"
      );
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for user count reset:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block the operation
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Reset user counts for ${roomKeys.length} rooms`,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    logError(requestId, "Error resetting user counts:", error);
    return createErrorResponse("Failed to reset user counts", 500);
  }
}

// User functions
async function handleGetUsers(requestId) {
  logInfo(requestId, "Fetching all users");
  try {
    const keys = await redis.keys(`${CHAT_USERS_PREFIX}*`);
    logInfo(requestId, `Found ${keys.length} users`);

    if (keys.length === 0) {
      return new Response(JSON.stringify({ users: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const usersData = await redis.mget(...keys);
    const users = usersData.map((user) => user).filter(Boolean);

    return new Response(JSON.stringify({ users }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, "Error fetching users:", error);
    return createErrorResponse("Failed to fetch users", 500);
  }
}

async function handleSendMessage(data, requestId) {
  const { roomId, username: originalUsername, content: originalContent } = data;
  const username = originalUsername?.toLowerCase(); // Normalize

  if (!roomId || !username || !originalContent) {
    logInfo(requestId, "Message sending failed: Missing required fields", {
      roomId,
      username,
      hasContent: !!originalContent,
    });
    return createErrorResponse(
      "Room ID, username, and content are required",
      400
    );
  }

  // Filter profanity from message content AFTER checking username profanity
  const content = filter.clean(originalContent);

  logInfo(requestId, `Sending message in room ${roomId} from user ${username}`);

  try {
    // Check if room exists
    const roomDataRaw = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomDataRaw) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }
    const roomData =
      typeof roomDataRaw === "string" ? JSON.parse(roomDataRaw) : roomDataRaw;

    if (roomData.type === "private") {
      const members = roomData.members || [];
      if (!members.includes(username)) {
        logInfo(requestId, `User ${username} not allowed to message private room ${roomId}`);
        return createErrorResponse("Forbidden", 403);
      }
    }

    // Ensure user exists (or create if not) - This now handles profanity check for username
    let userData;
    try {
      userData = await ensureUserExists(username, requestId);
      if (!userData) {
        // Should not happen if ensureUserExists throws errors correctly
        logError(
          requestId,
          `Failed to ensure user ${username} exists, ensureUserExists returned falsy.`
        );
        return createErrorResponse("Failed to verify or create user", 500);
      }
    } catch (error) {
      logError(requestId, `Error ensuring user ${username} exists:`, error);
      if (error.message === "Username contains inappropriate language") {
        return createErrorResponse(
          "Username contains inappropriate language",
          400
        );
      }
      // Handle the rare race condition error specifically if needed, or just generic error
      if (error.message.includes("race condition")) {
        return createErrorResponse(
          "Failed to send message due to temporary issue, please try again.",
          500
        );
      }
      return createErrorResponse("Failed to verify or create user", 500);
    }

    // Validate message length
    if (content.length > MAX_MESSAGE_LENGTH) {
      logInfo(
        requestId,
        `Message too long from ${username}: length ${content.length}`
      );
      return createErrorResponse(
        `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
        400
      );
    }

    // Fetch last message from this user in this room to prevent duplicates
    const lastMessagesRaw = await redis.lrange(
      `${CHAT_MESSAGES_PREFIX}${roomId}`,
      0,
      0
    ); // Most recent
    if (lastMessagesRaw.length > 0) {
      let lastMsgObj = null;
      const raw = lastMessagesRaw[0];

      if (typeof raw === "object" && raw !== null) {
        // Value is already a parsed object (legacy data that was stored without JSON.stringify)
        lastMsgObj = raw;
      } else if (typeof raw === "string") {
        try {
          lastMsgObj = JSON.parse(raw);
        } catch (e) {
          // Log but do not block sending – just skip duplicate check if unparsable
          logError(
            requestId,
            `Error parsing last message for duplicate check`,
            e
          );
        }
      }

      if (
        lastMsgObj &&
        lastMsgObj.username === username &&
        lastMsgObj.content === content
      ) {
        logInfo(requestId, `Duplicate message prevented from ${username}`);
        // Return 400 for duplicate
        return createErrorResponse("Duplicate message detected", 400);
      }
    }

    // Create and save the message
    const messageId = generateId();
    const message = {
      id: messageId,
      roomId,
      username,
      content,
      timestamp: getCurrentTimestamp(),
    };

    // Store message as stringified JSON in the list
    await redis.lpush(
      `${CHAT_MESSAGES_PREFIX}${roomId}`,
      JSON.stringify(message)
    );
    // Keep only the latest 100 messages per room
    await redis.ltrim(`${CHAT_MESSAGES_PREFIX}${roomId}`, 0, 99);
    logInfo(requestId, `Message saved with ID: ${message.id}`);

    // Update user's last active timestamp (userData is already parsed)
    // ensureUserExists already refreshed TTL, but updating lastActive is still correct
    const updatedUser = { ...userData, lastActive: getCurrentTimestamp() };
    await redis.set(
      `${CHAT_USERS_PREFIX}${username}`,
      JSON.stringify(updatedUser)
    ); // Ensure it's stringified for Redis
    // Refresh expiration time again just to be safe upon activity
    await redis.expire(`${CHAT_USERS_PREFIX}${username}`, USER_EXPIRATION_TIME);
    logInfo(
      requestId,
      `Updated user ${username} last active timestamp and reset expiration`
    );

    // Trigger Pusher event for new message
    try {
      await pusher.trigger("chats", "room-message", {
        roomId,
        message,
      });
      logInfo(
        requestId,
        `Pusher event triggered: room-message for room ${roomId}`
      );
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for new message:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block message sending
    }

    return new Response(JSON.stringify({ message }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Catch any unexpected errors from the main try block
    logError(
      requestId,
      `Unexpected error sending message in room ${roomId} from user ${username}:`,
      error
    );
    return createErrorResponse(
      "Failed to send message due to an internal error",
      500
    );
  }
}

async function handleDeleteMessage(roomId, messageId, username, requestId) {
  if (!roomId || !messageId) {
    logInfo(requestId, "Message deletion failed: Missing required fields", {
      roomId,
      messageId,
    });
    return createErrorResponse("Room ID and message ID are required", 400);
  }

  // Only admin user (ryo) can delete via this endpoint - use authenticated username
  if (username?.toLowerCase() !== "ryo") {
    logInfo(
      requestId,
      `Unauthorized delete attempt by authenticated user: ${username}`
    );
    return createErrorResponse("Forbidden", 403);
  }

  logInfo(
    requestId,
    `Deleting message ${messageId} from room ${roomId} by admin ${username}`
  );
  try {
    // Check if room exists
    const roomExists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);
    if (!roomExists) {
      logInfo(requestId, `Room not found: ${roomId}`);
      return createErrorResponse("Room not found", 404);
    }

    const listKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
    // Fetch all messages
    const messagesRaw = await redis.lrange(listKey, 0, -1);
    let targetRaw = null;
    for (const raw of messagesRaw) {
      try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
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
      return createErrorResponse("Message not found", 404);
    }

    // Remove the specific raw string from list
    await redis.lrem(listKey, 1, targetRaw);
    logInfo(requestId, `Message deleted: ${messageId}`);

    // Trigger Pusher event for message deletion
    try {
      await pusher.trigger("chats", "message-deleted", {
        roomId,
        messageId,
      });
      logInfo(
        requestId,
        `Pusher event triggered: message-deleted for room ${roomId}`
      );
    } catch (pusherError) {
      logError(
        requestId,
        "Error triggering Pusher event for message deletion:",
        pusherError
      );
      // Continue with response - Pusher error shouldn't block message deletion
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(
      requestId,
      `Error deleting message ${messageId} from room ${roomId}:`,
      error
    );
    return createErrorResponse("Failed to delete message", 500);
  }
}

async function handleSwitchRoom(data, requestId) {
  const { previousRoomId, nextRoomId, username: originalUsername } = data;
  const username = originalUsername?.toLowerCase(); // Normalize username

  if (!username) {
    logInfo(requestId, "Room switch failed: Username is required");
    return createErrorResponse("Username is required", 400);
  }

  // Nothing to do if IDs are the same (including both null)
  if (previousRoomId === nextRoomId) {
    logInfo(
      requestId,
      `Room switch noop: previous and next are the same (${previousRoomId}).`
    );
    return new Response(JSON.stringify({ success: true, noop: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Ensure user exists (refreshes TTL)
    await ensureUserExists(username, requestId);

    const changedRooms = [];

    // --- LEAVE PREVIOUS ---
    if (previousRoomId) {
      const roomKey = `${CHAT_ROOM_PREFIX}${previousRoomId}`;
      const roomDataRaw = await redis.get(roomKey);

      if (roomDataRaw) {
        await redis.srem(
          `${CHAT_ROOM_USERS_PREFIX}${previousRoomId}`,
          username
        );
        const userCount = await refreshRoomUserCount(previousRoomId);
        changedRooms.push({ roomId: previousRoomId, userCount });
      }
    }

    // --- JOIN NEXT ---
    if (nextRoomId) {
      const roomKey = `${CHAT_ROOM_PREFIX}${nextRoomId}`;
      const roomDataRaw = await redis.get(roomKey);
      if (!roomDataRaw) {
        logInfo(requestId, `Room not found while switching: ${nextRoomId}`);
        return createErrorResponse("Next room not found", 404);
      }

      const roomData =
        typeof roomDataRaw === "string" ? JSON.parse(roomDataRaw) : roomDataRaw;

      if (roomData.type === "private") {
        const members = roomData.members || [];
        if (!members.includes(username)) {
          logInfo(requestId, `User ${username} not allowed in private room ${nextRoomId}`);
          return createErrorResponse("Forbidden", 403);
        }
      }

      await redis.sadd(`${CHAT_ROOM_USERS_PREFIX}${nextRoomId}`, username);
      const userCount = await redis.scard(
        `${CHAT_ROOM_USERS_PREFIX}${nextRoomId}`
      );

      // Update room object with new count
      await redis.set(roomKey, { ...roomData, userCount });

      // Update user's last active timestamp
      await redis.set(
        `${CHAT_USERS_PREFIX}${username}`,
        JSON.stringify({ username, lastActive: getCurrentTimestamp() })
      );
      await redis.expire(
        `${CHAT_USERS_PREFIX}${username}`,
        USER_EXPIRATION_TIME
      );

      changedRooms.push({ roomId: nextRoomId, userCount });
    }

    // Trigger Pusher events in batch
    try {
      for (const room of changedRooms) {
        // Removed individual user-count-updated event; rooms-updated will carry the new count
      }

      const rooms = await getDetailedRooms();
      await pusher.trigger("chats", "rooms-updated", { rooms });
    } catch (pusherErr) {
      logError(
        requestId,
        "Error triggering Pusher events in switchRoom:",
        pusherErr
      );
      // Non-fatal
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, "Error during switchRoom:", error);
    return createErrorResponse("Failed to switch room", 500);
  }
}

async function handleGenerateToken(data, requestId) {
  const { username: originalUsername } = data;

  if (!originalUsername) {
    logInfo(requestId, "Token generation failed: Username is required");
    return createErrorResponse("Username is required", 400);
  }

  // Normalize username to lowercase
  const username = originalUsername.toLowerCase();

  logInfo(requestId, `Generating token for user: ${username}`);
  try {
    // Check if user exists
    const userKey = `${CHAT_USERS_PREFIX}${username}`;
    const userData = await redis.get(userKey);

    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      return createErrorResponse("User not found", 404);
    }

    // Check if token already exists
    const tokenKey = `${AUTH_TOKEN_PREFIX}${username}`;
    const existingToken = await redis.get(tokenKey);

    if (existingToken) {
      logInfo(requestId, `Token already exists for user: ${username}`);
      return createErrorResponse("Token already exists for this user", 409);
    }

    // Generate new token
    const authToken = generateAuthToken();

    // Store token with same expiration as user
    await redis.set(tokenKey, authToken, { ex: USER_EXPIRATION_TIME });

    // Refresh user expiration
    await redis.expire(userKey, USER_EXPIRATION_TIME);

    logInfo(requestId, `Token generated successfully for user ${username}`);

    return new Response(JSON.stringify({ token: authToken }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, `Error generating token for user ${username}:`, error);
    return createErrorResponse("Failed to generate token", 500);
  }
}
