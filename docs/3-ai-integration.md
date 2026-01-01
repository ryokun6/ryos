# AI Integration

Multi-provider AI with tool calling support.

## Providers

| Provider | SDK | Models |
|----------|-----|--------|
| OpenAI | `@ai-sdk/openai` | gpt-5, gpt-5.1, gpt-4o |
| Anthropic | `@ai-sdk/anthropic` | claude-4.5, claude-4, claude-3.7 |
| Google | `@ai-sdk/google` | gemini-2.5-pro, gemini-2.5-flash |

```mermaid
graph TD
    A[User Message] --> B[Chat API]
    B --> C{Provider Selection}
    C -->|OpenAI| D[GPT Models]
    C -->|Anthropic| E[Claude Models]
    C -->|Google| F[Gemini Models]
    D --> G[AI SDK Stream]
    E --> G
    F --> G
    G --> H[Response Handler]
    H --> I[UI Update]
```

## Available Tools

| Tool | Description |
|------|-------------|
| `launchApp` | Open applications |
| `closeApp` | Close applications |
| `ipodControl` | Music playback control |
| `karaokeControl` | Karaoke playback |
| `generateHtml` | Create HTML applets |
| `list` | List VFS items |
| `open` | Open files/apps |
| `read` | Read file contents |
| `write` | Create/modify documents |
| `edit` | Edit existing files |
| `searchSongs` | YouTube music search |
| `settings` | System settings |

```mermaid
sequenceDiagram
    participant U as User
    participant C as Chat UI
    participant A as AI Provider
    participant T as Tool Handler
    participant S as System

    U->>C: Send message
    C->>A: Stream request
    A->>A: Process message
    A-->>C: Tool call (e.g., launchApp)
    C->>T: Execute tool
    T->>S: Perform action
    S-->>T: Result
    T-->>A: Tool result
    A-->>C: Final response
    C-->>U: Display result
```
