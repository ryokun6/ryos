# i18n & Hooks

Internationalization and 29+ custom hooks.

## Supported Languages

| Code | Language |
|------|----------|
| `en` | English (default) |
| `zh-TW` | Chinese Traditional |
| `ja` | Japanese |
| `ko` | Korean |
| `fr` | French |
| `de` | German |
| `es` | Spanish |
| `pt` | Portuguese |
| `it` | Italian |
| `ru` | Russian |

## Key Hooks

**Window & App Management:**

| Hook | Purpose |
|------|---------|
| `useLaunchApp` | Launch apps with multi-window support |
| `useWindowManager` | Drag, resize, snap-to-edge |
| `useWindowInsets` | Theme-dependent constraints |

**Audio System:**

| Hook | Purpose |
|------|---------|
| `useSound` | Web Audio API playback |
| `useChatSynth` | Chat typing sounds |
| `useTerminalSounds` | Terminal feedback |
| `useTtsQueue` | Text-to-speech queue |
| `useAudioRecorder` | Audio recording |

**Device Detection:**

| Hook | Purpose |
|------|---------|
| `useIsMobile` | Mobile detection (<768px) |
| `useIsPhone` | Phone detection (<640px) |
| `useMediaQuery` | CSS media query hook |

## Using i18n

```typescript
import { useTranslation } from "react-i18next";

const { t } = useTranslation();

t("common.menu.file")              // "File"
t("apps.finder.name")              // "Finder"
t("common.dialog.aboutApp", { appName: "Finder" })
```
