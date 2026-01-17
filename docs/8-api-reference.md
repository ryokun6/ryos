# API Reference

ryOS uses Vercel Serverless Functions with Edge runtime for all backend APIs.

## API Request Flow

```mermaid
graph LR
    Client[Client App] --> Auth{Auth Check}
    Auth -->|Valid| Router[API Router]
    Auth -->|Invalid| Error[401 Error]
    Router --> Edge[Edge Runtime]
    Edge --> Services[External Services]
    Services --> AI[AI Providers]
    Services --> DB[(Redis/KV)]
    Services --> Media[Media APIs]
    Edge --> Response[JSON Response]
    Response --> Client
```

## Endpoint Documentation

| Endpoint Group | Description |
|----------------|-------------|
| [Chat API](/docs/chat-api) | Main AI chat with streaming and tool calling |
| [Song API](/docs/song-api) | Music library CRUD, lyrics, furigana, translations |
| [Media API](/docs/media-api) | Text-to-speech, transcription, YouTube search |
| [Chat Rooms API](/docs/chat-rooms-api) | Real-time chat rooms with Pusher/Redis |
| [IRC Gateway API](/docs/irc-api) | IRC channels via `/api/irc/*` endpoints |
| [AI Generation APIs](/docs/ai-generation-apis) | Applet generation, IE time-travel, parse-title |
| [Utility APIs](/docs/utility-apis) | Link preview, iframe check, share applet, admin |

## Quick Reference

### AI Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/chat` | Main AI chat with tool calling |
| `/api/applet-ai` | Applet text + image generation |
| `/api/ie-generate` | Time-travel page generation |
| `/api/parse-title` | Music metadata extraction |

### Media Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/song/` | Song library CRUD |
| `/api/song/[id]` | Individual song operations |
| `/api/speech` | Text-to-speech |
| `/api/audio-transcribe` | Speech-to-text |
| `/api/youtube-search` | YouTube music search |

### Communication Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/chat-rooms` | Real-time chat room management |
| `/api/irc/connect` | Connect to IRC server |
| `/api/irc/stream` | Stream IRC events (SSE) |
| `/api/irc/send` | Send IRC channel message |
| `/api/irc/join` | Join IRC channel |
| `/api/irc/part` | Leave IRC channel |
| `/api/irc/channels` | List joined IRC channels |

### Utility Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/link-preview` | URL metadata extraction |
| `/api/iframe-check` | Embeddability checking |
| `/api/share-applet` | Applet sharing |
| `/api/admin` | Admin operations |

### Endpoint Categories Overview

```mermaid
graph TD
    API["/api/*"]
    API --> AI[AI Services]
    API --> Media[Media Services]
    API --> Comm[Communication]
    API --> Util[Utilities]
    
    AI --> chat["/chat"]
    AI --> applet["/applet-ai"]
    AI --> ie["/ie-generate"]
    AI --> parse["/parse-title"]
    
    Media --> song["/song/*"]
    Media --> speech["/speech"]
    Media --> transcribe["/audio-transcribe"]
    Media --> yt["/youtube-search"]
    
    Comm --> rooms["/chat-rooms"]
    Comm --> irc["/irc/*"]
    
    Util --> preview["/link-preview"]
    Util --> iframe["/iframe-check"]
    Util --> share["/share-applet"]
    Util --> admin["/admin"]
```

## Authentication

```
Authorization: Bearer {token}
X-Username: {username}
```

Token-based with 90-day expiration.

## AI Providers

| Provider | Models |
|----------|--------|
| OpenAI | gpt-5, gpt-5.1, gpt-5-mini, gpt-4o, gpt-4.1, gpt-4.1-mini |
| Anthropic | claude-4.5, claude-4, claude-3.7, claude-3.5 |
| Google | gemini-2.5-pro, gemini-2.5-flash, gemini-3-pro-preview |
