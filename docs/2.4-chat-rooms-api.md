# Chat Rooms API

Real-time chat rooms API powered by Pusher WebSockets and Redis (Upstash). Supports public and private rooms with presence tracking, token-based authentication, and AI-powered replies.

## Endpoints

All actions are performed on a single endpoint using the `action` query parameter.

| Method   | Action                      | Description                              | Auth Required |
|----------|----------------------------|------------------------------------------|---------------|
| GET      | `getRooms`                 | List all accessible rooms                | No            |
| GET      | `getRoom`                  | Get a single room by ID                  | Yes           |
| GET      | `getMessages`              | Get messages for a room                  | No            |
| GET      | `getBulkMessages`          | Get messages for multiple rooms          | No            |
| GET      | `getRoomUsers`             | Get active users in a room               | Yes           |
| GET      | `getUsers`                 | Search users by username                 | No            |
| GET      | `checkPassword`            | Check if user has password set           | Yes           |
| GET      | `cleanupPresence`          | Clean up expired presence (admin)        | Yes (admin)   |
| GET      | `debugPresence`            | Debug presence data (admin)              | Yes (admin)   |
| POST     | `createRoom`               | Create a new room                        | Yes           |
| POST     | `joinRoom`                 | Join a room                              | No            |
| POST     | `leaveRoom`                | Leave a room                             | No            |
| POST     | `switchRoom`               | Switch between rooms                     | No            |
| POST     | `sendMessage`              | Send a message to a room                 | Yes           |
| POST     | `generateRyoReply`         | Generate AI reply from Ryo               | Yes           |
| POST     | `createUser`               | Create a new user account                | No            |
| POST     | `generateToken`            | Generate auth token for user             | Yes           |
| POST     | `refreshToken`             | Refresh an existing token                | No            |
| POST     | `verifyToken`              | Verify token validity                    | No            |
| POST     | `authenticateWithPassword` | Login with username/password             | No            |
| POST     | `setPassword`              | Set user password                        | Yes           |
| POST     | `clearAllMessages`         | Clear all messages (admin)               | Yes (admin)   |
| POST     | `resetUserCounts`          | Reset all user counts (admin)            | Yes (admin)   |
| POST     | `listTokens`               | List user's active tokens                | Yes           |
| POST     | `logoutAllDevices`         | Logout from all devices                  | Yes           |
| POST     | `logoutCurrent`            | Logout current session                   | Yes           |
| DELETE   | `deleteRoom`               | Delete a room                            | Yes           |
| DELETE   | `deleteMessage`            | Delete a message (admin)                 | Yes (admin)   |

## Authentication

The API uses token-based authentication with the following headers:

```
X-Username: <username>
Authorization: Bearer <token>
```

### Token Lifecycle

- **Generation**: Tokens are generated on user creation or via `generateToken`
- **Expiration**: Tokens expire after 90 days (`USER_EXPIRATION_TIME`)
- **Grace Period**: Expired tokens can be refreshed within 30 days (`TOKEN_GRACE_PERIOD`)
- **Refresh**: Use `refreshToken` to get a new token before/after expiration

### Password Authentication

Users can optionally set a password for account recovery:

```typescript
// Set password (requires auth)
POST /api/chat-rooms?action=setPassword
Body: { password: "min8chars" }

// Login with password
POST /api/chat-rooms?action=authenticateWithPassword
Body: { username: "alice", password: "min8chars" }
```

Minimum password length: 8 characters

## TypeScript Types

### Room Types

```typescript
type RoomType = "public" | "private";

interface Room {
  id: string;
  name: string;
  type: RoomType;
  createdAt: number;
  userCount: number;
  members?: string[]; // Only for private rooms
}

interface RoomWithUsers extends Room {
  users: string[];
}
```

### Message Types

```typescript
interface Message {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: number;
}

interface BulkMessagesResult {
  messagesMap: Record<string, Message[]>;
  validRoomIds: string[];
  invalidRoomIds: string[];
}
```

### User Types

```typescript
interface User {
  username: string;
  lastActive: number;
}
```

## Room Management

### Creating Rooms

**Public Rooms** (admin only):
```typescript
POST /api/chat-rooms?action=createRoom
Headers: { X-Username: "ryo", Authorization: "Bearer <token>" }
Body: { name: "general", type: "public" }
```

**Private Rooms** (any authenticated user):
```typescript
POST /api/chat-rooms?action=createRoom
Headers: { X-Username: "alice", Authorization: "Bearer <token>" }
Body: { type: "private", members: ["alice", "bob"] }
```

Private room names are auto-generated as `@alice, @bob`.

### Listing Rooms

```typescript
GET /api/chat-rooms?action=getRooms&username=alice

// Response
{
  "rooms": [
    { "id": "abc123", "name": "general", "type": "public", "userCount": 5, ... },
    { "id": "def456", "name": "@alice, @bob", "type": "private", "userCount": 2, "members": ["alice", "bob"], ... }
  ]
}
```

Users only see public rooms and private rooms they're members of.

### Joining/Leaving Rooms

```typescript
// Join
POST /api/chat-rooms?action=joinRoom
Body: { roomId: "abc123", username: "alice" }

// Leave
POST /api/chat-rooms?action=leaveRoom
Body: { roomId: "abc123", username: "alice" }

// Switch (optimized for changing rooms)
POST /api/chat-rooms?action=switchRoom
Body: { previousRoomId: "abc123", nextRoomId: "def456", username: "alice" }
```

### Deleting Rooms

- **Public rooms**: Admin only
- **Private rooms**: Any member can leave; room is deleted when ≤1 member remains

```typescript
DELETE /api/chat-rooms?action=deleteRoom&roomId=abc123
Headers: { X-Username: "ryo", Authorization: "Bearer <token>" }
```

## Messages

### Sending Messages

```typescript
POST /api/chat-rooms?action=sendMessage
Headers: { X-Username: "alice", Authorization: "Bearer <token>" }
Body: { roomId: "abc123", username: "alice", content: "Hello world!" }
```

**Rate Limiting** (public rooms only):
- Short burst: 3 messages per 10 seconds
- Long burst: 20 messages per 60 seconds
- Minimum interval: 2 seconds between messages

**Content Validation**:
- Maximum length: Configured via `MAX_MESSAGE_LENGTH`
- Profanity filtering with URL preservation
- HTML escaping for XSS prevention
- Duplicate message detection

### Getting Messages

```typescript
// Single room (default limit: 20, max: 500)
GET /api/chat-rooms?action=getMessages&roomId=abc123&limit=50

// Multiple rooms
GET /api/chat-rooms?action=getBulkMessages&roomIds=abc123,def456
```

### AI-Powered Replies (Ryo)

Generate responses from the AI assistant "Ryo":

```typescript
POST /api/chat-rooms?action=generateRyoReply
Headers: { X-Username: "alice", Authorization: "Bearer <token>" }
Body: {
  roomId: "abc123",
  prompt: "@ryo what do you think?",
  systemState: {
    chatRoomContext: {
      recentMessages: "alice: Hello\nbob: Hi there",
      mentionedMessage: "What's the weather like?"
    }
  }
}
```

Uses Google's Gemini 2.5 Flash model.

## Real-time Events

The API uses Pusher for real-time WebSocket communication.

### Channels

| Channel Pattern | Description |
|----------------|-------------|
| `chats-public` | Public room events (all users) |
| `chats-{username}` | Private events for specific user |
| `room-{roomId}` | Room-specific message events |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `room-created` | `{ room: Room }` | New room created |
| `room-updated` | `{ room: Room }` | Room data changed (user count, etc.) |
| `room-deleted` | `{ roomId: string }` | Room deleted |
| `room-message` | `{ roomId: string, message: Message }` | New message in room |
| `message-deleted` | `{ roomId: string, messageId: string }` | Message deleted |
| `rooms-updated` | `{ rooms: Room[] }` | Batch room updates |

### Subscribing to Events

```typescript
import Pusher from 'pusher-js';

const pusher = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER });

// Subscribe to public rooms
const publicChannel = pusher.subscribe('chats-public');
publicChannel.bind('room-created', (data) => console.log('New room:', data.room));

// Subscribe to room messages
const roomChannel = pusher.subscribe('room-abc123');
roomChannel.bind('room-message', (data) => console.log('New message:', data.message));

// Subscribe to private updates (for logged-in user)
const userChannel = pusher.subscribe('chats-alice');
userChannel.bind('room-created', (data) => console.log('Invited to room:', data.room));
```

## Redis Data Structure

### Key Prefixes

| Prefix | Description |
|--------|-------------|
| `chat:room:{roomId}` | Room object (JSON) |
| `chat:messages:{roomId}` | Message list (Redis List, max 100) |
| `chat:users:{username}` | User object (JSON) |
| `chat:room:users:{roomId}` | Room user set (deprecated, use presence) |
| `chat:presence:{roomId}:{username}` | Individual presence key |
| `chat:presencez:{roomId}` | Room presence ZSET (score = timestamp) |
| `chat:rooms` | Set of all room IDs |

### TTL Values

| Key Type | TTL |
|----------|-----|
| Room presence | 24 hours (86400s) |
| User/Token | 90 days (7776000s) |
| Token grace period | 30 days (2592000s) |

### Rate Limiting Keys

| Prefix | Description |
|--------|-------------|
| `rl:chat:b:s:{roomId}:{username}` | Short burst counter (10s window) |
| `rl:chat:b:l:{roomId}:{username}` | Long burst counter (60s window) |
| `rl:chat:b:last:{roomId}:{username}` | Last message timestamp |
| `rl:block:{action}:{identifier}` | Rate limit block (24h) |

## Presence

User presence is tracked using Redis Sorted Sets (ZSETs) with timestamps as scores.

### How It Works

1. When a user joins/sends a message, their presence is updated:
   ```
   ZADD chat:presencez:{roomId} {timestamp} {username}
   ```

2. Active users are retrieved by pruning expired entries:
   ```
   ZREMRANGEBYSCORE chat:presencez:{roomId} 0 {cutoffTimestamp}
   ZRANGE chat:presencez:{roomId} 0 -1
   ```

3. Users are considered "offline" after 24 hours of inactivity

### Presence Operations

```typescript
// Set/refresh presence
await setRoomPresence(roomId, username);
await refreshRoomPresence(roomId, username);

// Remove presence
await removeRoomPresence(roomId, username);

// Get active users
const users = await getActiveUsersInRoom(roomId);

// Refresh room user count
const count = await refreshRoomUserCount(roomId);
```

### Admin Cleanup

```typescript
GET /api/chat-rooms?action=cleanupPresence
Headers: { X-Username: "ryo", Authorization: "Bearer <token>" }
```

## Example Usage

### Complete Flow: Create User and Send Message

```typescript
// 1. Create user
const createRes = await fetch('/api/chat-rooms?action=createUser', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'alice', password: 'securepass123' })
});
const { user, token } = await createRes.json();

// 2. Get rooms
const roomsRes = await fetch('/api/chat-rooms?action=getRooms&username=alice');
const { rooms } = await roomsRes.json();

// 3. Join a room
await fetch('/api/chat-rooms?action=joinRoom', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ roomId: rooms[0].id, username: 'alice' })
});

// 4. Send a message
const msgRes = await fetch('/api/chat-rooms?action=sendMessage', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Username': 'alice',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    roomId: rooms[0].id,
    username: 'alice',
    content: 'Hello everyone!'
  })
});
const { message } = await msgRes.json();

// 5. Subscribe to real-time updates
const pusher = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER });
const channel = pusher.subscribe(`room-${rooms[0].id}`);
channel.bind('room-message', (data) => {
  console.log('New message:', data.message);
});
```

### Creating a Private Room

```typescript
const res = await fetch('/api/chat-rooms?action=createRoom', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Username': 'alice',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    type: 'private',
    members: ['alice', 'bob', 'charlie']
  })
});
const { room } = await res.json();
// room.name = "@alice, @bob, @charlie"
```

### Token Refresh Flow

```typescript
// When token is about to expire or has expired (within grace period)
const res = await fetch('/api/chat-rooms?action=refreshToken', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'alice',
    oldToken: expiredToken
  })
});
const { token: newToken } = await res.json();
```

## Error Responses

All errors return JSON with an `error` field:

```typescript
{ "error": "Error message" }
```

| Status | Description |
|--------|-------------|
| 400 | Bad request (missing/invalid parameters) |
| 401 | Unauthorized (invalid/missing token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found (room/user doesn't exist) |
| 409 | Conflict (username already taken) |
| 429 | Too many requests (rate limited) |
| 500 | Internal server error |

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `REDIS_KV_REST_API_URL` | Upstash Redis REST URL |
| `REDIS_KV_REST_API_TOKEN` | Upstash Redis REST token |
| `PUSHER_APP_ID` | Pusher application ID |
| `PUSHER_KEY` | Pusher public key |
| `PUSHER_SECRET` | Pusher secret key |
| `PUSHER_CLUSTER` | Pusher cluster region |

### Runtime Configuration

```typescript
export const runtime = "nodejs";
export const maxDuration = 15; // seconds
```

## Related

- [ryOS Documentation](/docs/README.md)
- [API Utils](/api/_utils/) - Shared utilities for authentication, validation, logging
- [Pusher Documentation](https://pusher.com/docs)
- [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted)
