# Chat System

Real-time messaging with AI integration.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Real-time | Pusher (WebSocket) |
| Storage | Redis (Upstash) |
| Backend | Vercel Serverless |
| AI | Google Gemini 2.5 Flash |
| Frontend | Zustand + Vercel AI SDK v5 |

## Room Types

```typescript
type RoomType = "public" | "private";

interface Room {
  id: string;           // 128-bit hex ID
  name: string;
  type: RoomType;
  userCount: number;
  members?: string[];   // Private rooms only
}
```

## Redis Key Structure

```
chat:room:{roomId}           # Room data
chat:messages:{roomId}       # Message list (max 100)
chat:users:{username}        # User profiles
chat:presencez:{roomId}      # Active users (ZSET)
chat:token:user:{user}:{tok} # Auth tokens
```

## AI Integration (@Ryo)

- **Direct Chat:** Full tool calling, system state awareness
- **@Ryo Mentions:** Context from recent messages, short responses
