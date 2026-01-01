# API Layer

ryOS uses Vercel Serverless Functions with Edge runtime.

## API Documentation

| Endpoint Group | Description |
|----------------|-------------|
| [Chat API](api-chat.html) | Main AI chat with streaming and tool calling |
| [Song API](api-song.html) | Music library CRUD, lyrics, furigana, translations |
| [Chat Rooms API](api-chat-rooms.html) | Real-time chat rooms with Pusher/Redis |
| [AI Endpoints](api-ai-endpoints.html) | Applet generation, IE time-travel, parse-title |
| [Media API](api-media.html) | Text-to-speech, transcription, YouTube search |
| [Utility APIs](api-utilities.html) | Link preview, iframe check, share applet, admin |

## AI Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/chat` | Main AI chat with tool calling |
| `/api/applet-ai` | Applet text + image generation |
| `/api/ie-generate` | Time-travel page generation |
| `/api/parse-title` | Music metadata extraction |

## Media Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/song/` | Song library CRUD |
| `/api/song/[id]` | Individual song operations |
| `/api/speech` | Text-to-speech |
| `/api/audio-transcribe` | Speech-to-text |
| `/api/youtube-search` | YouTube music search |

## Communication Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/chat-rooms` | Real-time chat room management |

## Utility Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/link-preview` | URL metadata extraction |
| `/api/iframe-check` | Embeddability checking |
| `/api/share-applet` | Applet sharing |
| `/api/admin` | Admin operations |

## Authentication

```
Authorization: Bearer {token}
X-Username: {username}
```

Token-based with 90-day expiration.

## AI Providers

| Provider | Models |
|----------|--------|
| OpenAI | gpt-5, gpt-5.1, gpt-4o, gpt-4.1 |
| Anthropic | claude-4.5, claude-4, claude-3.7 |
| Google | gemini-2.5-pro, gemini-2.5-flash |
