# ryOS for iOS

Native iOS shell for ryOS: a SwiftUI app that hosts the web client in a
`WKWebView` and implements the same `window.ryosDesktop` bridge the Electron
desktop app exposes, so the web client gets native notifications, haptics, and
Now Playing / background audio without iOS-specific code paths.

## Layout

```
ios/
├── ryOS.xcodeproj/        # Xcode project (shared scheme: ryOS)
├── ryOS/                  # App sources
│   ├── ryOSApp.swift, AppDelegate.swift, ShellView.swift
│   ├── ShellWebView.swift     # WKWebView host + bridge message handler
│   ├── DesktopBridge.swift    # JS injected at document start (window.ryosDesktop)
│   ├── ShellViewModel.swift   # Origin, boot/splash state, notification state
│   ├── RelayClient.swift      # APNs token -> /api/push/register, notification routing
│   └── MediaHapticsController.swift  # Haptics, audio session, Now Playing, remote commands
├── ryOSTests/             # XCTest target
├── scripts/make-icon.swift    # Flattens AppIconSource.png onto black for the asset catalog
├── web/dist/              # Static App Store microsite (landing, privacy, support), not the Vite app
└── .airbuild/airbuild.yaml    # Airbuild signing, archive, and test config
```

## Opening in Xcode

```bash
open ios/ryOS.xcodeproj
```

The project lists its files explicitly instead of using Xcode's synchronized
folders: CodeQL's Swift autobuilder (code scanning) reads each target's
Sources build phase and finds nothing to build in a synchronized folder. Add
new files to their target in Xcode (File → Add Files…, or "Target
Membership"); `tests/unit/build/test-ios-xcodeproj-sources.test.ts` fails if a
Swift file under `ryOS/` or `ryOSTests/` is not compiled by its target.

Select the `ryOS` scheme and run on a simulator or device. The project targets
iOS 26 and Swift 6. Bundle ID is `com.ryo.lu.ryos`; pick your own team under
Signing & Capabilities for local device builds. Signing material is not
checked in.

## What the shell loads

`ShellViewModel.origin` is hard-coded to `https://os.ryo.lu`. To point the shell
at a local dev server (`bun run dev`, port 5173), temporarily change that URL
to your machine's LAN address, e.g. `http://192.168.x.x:5173`. Plain HTTP also
needs an App Transport Security exception in `Info.plist`.

On first launch a splash stays up until the web client posts `boot-finished`.
Later launches go straight to the web view and use the WebKit cache.

## Bridge overview

`DesktopBridge.injectedJavaScript` runs at document start and installs
`window.ryosDesktop` with `platform: 'ios'`. The web client detects it with
`"ryosDesktop" in window`, the same check it uses for Electron. See
`src/types/ryos-desktop.d.ts` and `src/utils/nativeShellBridge.ts`.

- **Web to native:** each method posts `{ kind: 'invoke', id, name, args }` to the
  `ryosBridge` script message handler. Native code replies with
  `window.__ryosReply({ id, ok, value })`. Calls time out after 15 seconds.
  Supported calls include notification config and state
  (`configureChatNotifications`, `updateChatNotificationState`,
  `showNotification`), `playHaptic`, `setAudioActive`, `setNowPlaying`,
  `updatePlayback`, `getVersion`. Desktop-only calls such as `openFile`,
  `saveFile`, and `checkForUpdates` resolve to `null`.
- **Native to web:**
  - `window.__ryosDesktopRemoteCommand(command)` forwards lock-screen and
    Control Center media commands.
  - `window.__ryosEmitOpenRoom(roomId)` opens a chat room when the user taps a
    notification.
- **Lifecycle messages:** `boot-finished` hides the splash. `app-active` flushes
  a pending notification-tap room.
- **Push:** after sign-in, the shell requests notification permission and sends
  the APNs token, username, and rooms to `https://os.ryo.lu/api/push/register`.
  The server side lives in `api/push/` and `api/_utils/push-relay.ts`.

## Airbuild

Signing, archive, and test config live in `ios/.airbuild/airbuild.yaml`. The
scripts use paths relative to `ios/` (`ryOS.xcodeproj`,
`scripts/make-icon.swift`, `.airbuild/artifacts/`), so `ios/` is the project
root and Airbuild must run with `ios/` as its working directory. To regenerate
the icon locally:

```bash
cd ios && swift scripts/make-icon.swift
```
