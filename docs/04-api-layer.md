# API Layer

ryOS uses Vercel Serverless Functions with Edge runtime.

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
