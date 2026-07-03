# Changelog

A summary of changes and updates to ryOS, organized by month.

**Major changes** highlight new features, significant platform work, and large refactors. **Minor changes** (collapsed per month) cover fixes, polish, chores, and smaller updates.

---

## July 2026

- **Books read-aloud**: browser TTS via a Speech menu with sentence highlighting, auto page turns, carry-tail highlights across page cuts, and bottom overlay controls (rewind/pause/skip/stop). Controls use an Aqua Glass island pill that collapses to a home-indicator pill when idle; Control Panels → Sound adds a browser TTS voice picker.
- **Books customization & CJK reading**: a Customize panel for reading fonts (including Rounded and Original), custom colors, transparent backgrounds, vertical text layout (including legacy-tagged Japanese vertical text), live Simplified/Traditional Chinese conversion, and synced reader settings across devices; bookmarks and text-selection highlights with a selection toolbar.
- **Books Ask Ryo**: inline reply bubble with streamed text, thinking pulse, browser-TTS speak button, and highlight tap-to-ask on selected passages.
- **Offline PWA**: network-dependent apps show offline empty states; Books loads cached books reliably offline; the standalone server sends explicit Cache-Control headers for offline PWA cache behavior.
- **Boot performance**: cut boot-critical JS ~44% by code-splitting heavy desktop shell dependencies, plus startup and build performance improvements.

<details>
<summary>Minor changes (9)</summary>

- Restore Preview windows with their last document paths so reopened sessions load documents without persisting file contents.
- Improve locale-aware CJK reading and lyrics fonts; bold pronunciation ruby (furigana/pinyin/romaji) at 700 weight in rounded lyrics fonts.
- Match Aqua slider fills to tab bar shine; quiet Aqua slider track lighting with neutral rgba recess; match Aqua Glass pane radius on no-titlebar windows.
- Blend book images into the reading background (multiply on light themes, dim on dark).
- Books: in-page edge-tap page turns with hover chevrons over gutters (20% edge zones); render font chips in their typefaces; proportional fallback-cover typography and smoother close zoom.
- Enlarge mobile Books customize panel controls to 44px rows; fix Books menus on narrow screens.
- Fix Books read-aloud/Safari styling, font switching, line spacing, vertical layout glitches, and highlight flicker.
- Polish Books customization panel, speech bar, and toolbar layout.
- Use macOS 26 for the Apple terminology glossary.

</details>

## June 2026

- **Aqua Glass theme**: a new macOS theme variant with frosted-glass chrome, backdrop blur, and squircle corners (progressive enhancement with rounded-rect fallback). A transparent menubar adapts text and pill highlights to the wallpaper, and frosted toolbars, menus, sidebars, and inputs carry across Chats, Admin, Finder, Soundboard, and Spotlight.
- **Cloud Sync v2**: full rewrite to journal-based delta sync. State is a per-user `key → document` map; changes travel as ops with hybrid-logical-clock timestamps through `/api/sync/v2/*`, conflicts resolve per key (last-writer-wins, no 409s), small remote changes apply straight from realtime events with zero HTTP requests, and binary content is content-addressed with batched dedupe. Legacy v1 data imports lazily on first sync.
- **Sync v1 retirement**: remove the legacy manual cloud backup/status endpoints and Control Panels cloud backup UI; local `.gz` restores now strip stale Sync v2 metadata and promote restored state back into Sync v2 on next boot for logged-in users.
- **Redis canonical-only runtime**: API and app code read/write only canonical Redis keys (`src/shared/redisKeys.ts`); legacy key backfill and deletion moved to the standalone CLI `scripts/redis-key-migration.ts` (admin migration API/UI removed); rate-limit keys aligned and legacy read-only fallbacks removed.
- **Desktop app (Electron)**: replace the Tauri shell with Electron — signed macOS releases, auto-update with Check for Updates, native app permissions, background chat notifications, native toasts, and Castlabs Electron for Apple Music DRM playback (releases v1.0.3–v1.0.8).
- **Performance sweep**: cut ~1MB of boot-critical JS, narrowed store/instance/clock subscriptions, debounced write-behind localStorage persistence, lazy Pusher runtime, transient drag/resize and dock scaling, visibility-gated polling, and content-visibility for long lists.
- **Control Panels redesign**: a macOS System Preferences layout across all themes with a Preferences-style search field, a consolidated **Account** ⋯ menu (login, change password, logout, logout-all-devices), reliable Safari auto-height, and Aqua polish.
- **Books**: a new EPUB reader app with a 3D wooden bookshelf, a page-turn reader (zoom-in/out transitions, reading fonts including EB Garamond, single/double-column layouts, and light/sepia/dark page themes), auto-saved reading progress synced across devices, Finder `.epub` import into a protected `/Books` root, and *Meditations* bundled as the default book.
- **Preview**: a new document viewer for images, PDFs, HTML, Markdown, and structured text, with Finder file associations, Open With handoff, import, Save As, and export workflows.
- **International preferences**: a new Control Panels area (Language and Date & Time tabs) for locale formats and an interactive Earth-map time zone picker; the selected time zone is honored across the menubar clock, Dashboard, and Calendar, with localized time-zone and weather city names.
- **Dynamic wallpapers**: day/night gradient, now-playing cover, and shuffle options, plus animated **Weather** and **Lyrics** live wallpapers backed by unified weather data and per-user deterministic shuffle that stays in sync across devices.
- **Selectable accent colors**: named swatches in Control Panels → Appearance for Aqua and System 7, a wallpaper-sampled default, a **System** option that restores each theme's classic selection color, and accent theming applied across menus, sliders, progress bars, links, toasts, and Ryo AI bubbles.
- **Self-service account recovery and deletion**: recover access to and delete your account without admin involvement.
- **Privacy Policy & Terms of Service**: add GDPR Privacy Policy and Terms of Service pages.
- **iPod / Karaoke lyrics glow**: cache cover-derived glow color in song metadata for stable cross-device sync; default fullscreen lyrics to glow; mirror player visuals in lyrics wallpaper backgrounds; improve palette extraction and karaoke timing/alignment.

<details>
<summary>Minor changes (33)</summary>

- Allow multi-day all-day calendar events.
- Show cloud sync upload progress in the menubar.
- Adopt a shared Help/About dialog state across apps.
- Add a Zod request-body validation layer at the apiHandler boundary.
- Add Open Graph share previews for newer apps.
- Decompose the iPod logic hook into focused sub-hooks and route store debug logs through a production-silent logger.
- Fix mobile desktop context-menu taps, Internet Explorer history tracking on proxied link navigation, and help-doc links opening app routes instead of /docs.
- Secure realtime: authorize private chat/sync channels (fixes a channel-auth leak); enforce banned users and apply shared login lockout to registration.
- Refactor menubars: migrate remaining app menus to descriptors (radio + submenu-disabled support); surface cloud sync activity in a menubar dropdown on hover or tap.
- Add keyboard shortcuts in menus (Cmd/Ctrl-aware) and a stored user timezone context.
- Add an admin Redis browser with prefix-tree navigation, metadata pipelining, and doc caching; add an admin action audit log; list rooms in a View-menu submenu.
- Add blur-up progressive loading and crossfade transitions for wallpapers; new default wallpapers (Mt Fuji, dandelion seeds, earth moon horizon); now-playing cover fills the desktop.
- Show a rounded corner mask during boot; accent-theme the Aqua boot overlay and logo.
- Add dark mode for docs pages and Internet Explorer chrome; make the IE loading bar dark-mode aware; refresh stale documentation.
- Unify shader perf heuristics into a 3-tier classifier (off/reduced/full), migrate existing users, and throttle shader backgrounds on mobile.
- iPod / Karaoke: restart-on-previous and Apple Music shuffle-history parity; fix karaoke word-highlight mask timing, shadow clipping, and left alignment; skip redundant cached glow recalculation.
- Reactively merge external/sync/cloud TextEdit updates without losing the caret; fix the TextEdit slash menu and editor state bugs.
- Stop a Telegram document tool-call retry loop with idempotent updates.
- Add a sync maintenance cron (`/api/cron/sync-maintenance`): retire frozen v1 sync keys with 90-day TTLs and garbage-collect unreferenced content-addressed blobs (mark-and-sweep with a 24h grace window).
- Sort private chats by online status and recency; fix mobile Chats sidebar scrolling and overlay borders.
- Restrict IRC room creation to admins; scope IRC channel updates to active chat rooms.
- Simplify audio ducking and volume handling.
- Extract pure helpers from large hooks (Finder file system, IE url bar, Chats fuzzy search); unify the file-content `StoredContent` type; route Ryo tool loops through `ToolLoopAgent`.
- Rename theme flags `isXpTheme` → `isWindowsTheme`, `isMacOsxTheme` → `isMacOSTheme` via `useThemeFlags()`; refactor song metadata sync helpers.
- Remove React Scan integration, legacy migration paths, and dead code.
- Improve batch metadata cache listing and apply consistent accent-derived selection color for menus and selected items.
- Style the Admin Cursor agents view with semi-transparent amber.
- Fix Workbox stale app shell caching after deploys.
- Fix iPod cover-color sync drift and the Chats scroll-to-bottom chevron contrast in Aqua dark mode.
- Fix themed icon cache recovery; set the root document background to black.
- Make Redis backfill reliable on Upstash; fix migration log autoscroll and the Aqua glass sidebar gap.
- Add a codebase audit roadmap with "do first" API hardening.
- Fix always-pass, mislabeled, and weak-assertion tests from the audit.

</details>

## May 2026

- **Maps**: Apple MapKit JS app with place search (IP/region bias), Home/Work/Favorites pins, places drawer, POI category markers, cloud sync, and Chats **`mapsSearchPlaces`** inline cards that open places in-app; **Directions** hand off to Apple Maps in a new tab (in-map routing not yet implemented).
- **iPod modern UI**: classic-js–inspired skin (now default) with Myriad Pro typography, split-menu Ken Burns slideshow, Cover Flow flip-to-tracklist, brick game and Music Quiz polish, and Apple Music library/radio/quiz support with playback stability fixes.
- **Virtual PC (v86)**: expand beyond DOS games with the v86 OS browser (Windows 1.0–2000/ME through Linux/BSD/ReactOS catalog), COEP `/embed/pc.html`, generated thumbnails, persisted presets, full localization, and `infinite-pc` → `pc` id migration.
- **Cursor Cloud agent workflow**: `cursorCloudAgent` + `listCursorCloudAgentRuns` tools, live stream card with follow-up input and Open PR, Admin **Cursor agents** tab (90-day Redis retention), and Telegram completion DMs with plain-text **Agent** / **PR** URLs (markdown stripped via shared `telegram-format` helpers).
- **Dashboard**: **Aquarium** widget, **currency converter** with Frankfurter rates, Apple PNG widget glyphs, and mobile narrow layout with scroll-to-new-widget animation.
- **TV polish**: channel-bug logo overlay (fullscreen-safe), idle bursts, drawer SFX, square channel-strip buttons, fullscreen control parity with Karaoke (dismiss + CH± pills, viewport-scaled captions), synced reset-channel deletes, and continued CRT/UI refinements.
- **Theme platform layer**: refactor with `data-os-platform`, centralized menu tokens, and macOSX font fixes (menubar, Finder list, About dialog, TextEdit headings, chat meta).
- Remove **CandyBar** app (dock icon pack browser added in March is no longer shipped).
- **Cover Flow on fullscreen long-press**; **Apple menu toggle** for browser fullscreen ryOS shell.

<details>
<summary>Minor changes (30)</summary>

- Chats: Streamdown message rendering; subtler tool-error styling; extend Cursor SDK run Redis TTL to 90 days; rename channel prompt to "Make a new channel...".
- iPod / Karaoke: Cover Flow title-bar toggle; Apple Music sharing copies direct links; default Cover display mode; locale-aware lyrics `auto` translation; karaoke visual-effect gating and hidden-video perf.
- Calendar: tray event/todo details, drag/resize, keyboard delete; fix tray delete layout, mobile scroll during drag, and bottom padding clipping.
- Maps / Synth / TextEdit / TV: recreate MapKit after minimize; mobile synth preset UI; macOSX TextEdit heading font; theme UI font for TV channel-creation shimmer.
- Shared UI: extract `FullscreenMobileDismiss` for TV/Karaoke fullscreen portals; generalize **AppDrawer** (TV/Calendar) with viewport-aware repositioning.
- Admin: dashboard server card, panel headers, agent counts, relaxed rate limits, sidebar/View menu reordering; analytics top songs/sites/countries and app events.
- React 19 hardening: migrate deprecated APIs, refactor cascading setState to useReducer, effect cleanups, stable list keys, admin helper hoisting.
- CI / deploy: Coolify webhook deploy, GHCR image pipeline, decouple test/build from main pushes; security batch (password change flow, applet sandboxing, rate-limit hardening).
- Docs: Maps app page, Virtual PC v86 refresh, Admin Cursor agents, Dashboard Aquarium; regenerate static HTML.
- Fix duplicate-key empty dock slots (repro in Safari).
- Fix empty/broken dock slots from stale or unrenderable entries.
- Improve PWA precache with curated Workbox entries, network-aware prefetch, and offline fixes.
- Subdue dark-mode shimmer on tool call loading states.
- Style Cursor agent chat cards like Maps with pinstripes.
- Match dark-theme lyrics search dialog to song search.
- Unify duplicated iPod and Karaoke media app code paths.
- Split large React components into focused modules.
- Align submenu trigger font size with menu items.
- Fullscreen on `documentElement` so menubar portals stay visible.

</details>

## April 2026

- **Ryo TV**: channel-surfing UI with CRT shader effects (power on/off, channel switch, buffering), procedural CRT SFX, AI-generated channels with import/export and cloud sync, MTV music-video channel with per-word KRC-timed Geneva CC captions, `/tv` route, OG card, and full localization.
- **`tvControl` chat tool**: list/tune channels, AI `createChannel` server-side fanout, add/remove videos on custom lineups; expose current TV channel and custom lineup in system state; gate channel creation on login.
- **IRC chat**: `irc.pieter.com` default, IRC server registry, channel browser in New Chat IRC tab, authenticated-user join via registered servers, `IRC_BRIDGE_DISABLED` env opt-out, and IRC bridge wiring tests.
- **`cursorCloudAgent` chat tool** (renamed from legacy `cursorRyOsRepoAgent`): async Cursor Cloud repo-agent runs with live stream card, persisted PR URL with Open PR button, follow-up endpoint with reply input, and Telegram completion notification.
- **Karaoke polish**: intro title card (5s with lead time, scaling, marquee scroll, pause-aware), empty library state with Add Songs CTA, smoother ScrollingText marquee (shared with iPod), Korean romanization default, and lyrics perf isolation from playback ticks.
- **Wallpaper system**: Leopard sets, picker layout improvements, category ordering, new default `nature earth horizon` wallpaper, and display settings persisted at version 1.
- **Themed desktop**: System 7 shows Chats, IE, Karaoke after iPod; Applications shortcut on non-macOS X themes (Applet Store hidden there); themed Chats icons across System 7, macOSX, XP 48px, and Win98.
- **System prompts**: optimize for static caching with tiered dynamic context.

<details>
<summary>Minor changes (10)</summary>

- TV (CRT & playback): multi-stage power on/off, screen on/off with play/pause, LCD Filter toggle, opaque static and native-refresh noise, lineup-based channel numbers, mobile Safari sync play, hide CC during transitions, reset-channels item, Shorts exclusion, substring-confusable YouTube host rejection (CodeQL).
- TV (lineup & drawer): dedicated channel cloud sync, YouTube URL paste, playlist drawer (side panel + compact bottom), drawer remove control, cached random playlists, prepopulate from exported library (incl. Taiwan), allow hiding default channels, synced reset-channel deletes.
- TV (UI): marquee-scroll long NET names, inline AI channel creation shimmer, Ryo TV pulls from Videos library, channel-bug and fullscreen control groundwork.
- Chats: localize toasts, Applet Viewer flows, and Finder list icons; 400px new-chat dialog max width; IRC channel list aligned with lyrics search dialog; dialog/tab truncation constraints; stabilize IRC tab; delegate embedded `StartGrindPlanning` to parent.
- Karaoke / iPod: react to locale changes for lyrics translation `auto` mode; open Karaoke cover flow from title art.
- macOSX: include CJK and emoji pixel fonts in LCD font stack.
- Control Panels: retro Login button on System 7; desktop-shell fullscreen menubar flicker fix.
- Files: sparse default desktop shortcuts on System 7 and Windows themes; guard optional `aliasTarget` in System 7 desktop migration.
- IRC: use `crypto.randomInt` for bridge IRC nick suffix.
- Tests: cover `cursor-agent` PR URL extraction and follow-up pre-checks.

</details>

## March 2026

- **Calendar**: iCal support, Dashboard widget overlay, and AI integration; redesign Dashboard with widget strip, Stocks, Dictionary, Translator, and smarter placement.
- **CandyBar**: browse and apply dock icon packs; align dock customization with shared app UI patterns.
- **AirDrop-style Finder sharing**: discovery, send/receive, and Downloads folder; multi-select on Desktop and Finder (marquee, modifier, range); universal undo/redo for Finder, Paint, and TextEdit.
- **Cloud sync (logical domains)**: refactor around `/api/sync/domains`, per-domain GET/PUT, and attachment prepare — incremental settings and files-metadata uploads, coalesced uploads, domain triggers on app launch, deletion markers for songs, custom wallpapers on the files domain, and safer remote apply / merge (incl. iPod translation and wallpaper ordering).
- **Auto Sync**: persist server-side (default on) with incremental Redis settings upload and force-full on manual upload; localized Sync tab statuses.
- **`webFetch` chat tool**: server-side URL → HTML-to-text extraction with hardening and unit tests.
- **Contacts, Telegram, and auth**: vCard import and cloud sync; Telegram linking, DMs, voice notes, song library tool, Gemini web search, heartbeats; migrate auth to **httpOnly cookies** with force upload/download sync controls.
- **Real-time stack**: improve presence (heartbeat when Chats open with auth); fix launch crashes from partial cloud-sync persist and invalid theme.
- **Theme system**: unify on semantic tokens and CSS variables; extract shared UI (ToolbarButton, SearchInput, EmptyState, SelectableListItem); z-index scale and prefers-reduced-motion; Finder brushed metal and Spotlight-style selection.

<details>
<summary>Minor changes (22)</summary>

- Improve iPod/karaoke playback, voice ducking for TTS/karaoke, and iPod widget control for karaoke.
- Switch parse-title to Gemini 3 Flash; harden add-track against CORS, duplicates, and Shorts URLs.
- Enable Gemini web search in chat for authenticated gemini-3-flash users; upgrade default chat/image models (gpt-5.4, etc.).
- Admin dashboard date range (Today/7d/14d/30d); calendar todos with due dates and mobile editing.
- Finder Go Up, sidebar reorder, narrow sidebar hide; refactor apiHandler across APIs; Bun SSE improvements.
- Smart weather default (San Francisco); Vercel Blob / S3-compatible storage switch; TrafficLightButton for dialogs. <!-- pragma: allowlist secret -->
- Stale cache recovery clears storage and unregisters service worker; subdomain wildcard CORS; fix dev PORT clash when `.env.local` sets 3000; reduce app reload loops on version update.
- Remove Telegram reply truncation; refactor cloud sync client (single transport, logical grouping); optimize IndexedDB hot paths.
- Centralize frontend API paths; unify IndexedDB/backup access; remove legacy sync public routes.
- Docs: simplification waves, audit roadmaps, sync utility ordering, browser sidecar plan.

</details>

## February 2026

- **Winamp integration**: Webamp with frameless mode, skins, YouTube seeking, and iPod library loading.
- **Two-tier memory system**: daily notes and long-term memories for AI proactive greetings and context.
- **AmbientBackground**: audio-reactive liquid and warp display modes for iPod and Karaoke.
- **Karaoke display modes**: selectable display mode in Karaoke; aligned display modes in iPod and Karaoke.
- **Error boundaries**: app and desktop error boundaries for improved stability.
- **App switcher**: keyboard shortcuts for switching between open apps.

<details>
<summary>Minor changes (9)</summary>

- Improve cloud backup and restore with increased limit, progress tracking, and UI enhancements.
- Refactor daily notes processing for improved efficiency and reduced timeouts.
- Fix Winamp icon theming, playlist layout, and foreground handling.
- Localize Winamp and cloud sync strings across multiple languages.
- Update Admin panel to display daily notes alongside long-term memories and add memory management tools.
- Fix proactive greeting display and animation.
- Improve memory timestamps and stale-memory cleanup.
- Update AI models and restrict debug mode to admin users.
- Fix missing Vercel rewrites for specific URLs.

</details>

## January 2026

- **Listen Together**: shared listening in iPod and Karaoke with session management, invite dialogs, and reaction overlays.
- **Infinite Mac**: scaling options, screenshot functionality, dynamic title, and improved window management.
- **Stickies**: draggable notes with color localization and mobile touch support.
- **Chats**: image upload support, improved styling, and AI-powered memory extraction.
- **API runtime**: refactor endpoints to Node.js runtime with consolidated middleware and unified authentication.
- **AI SDK 6.0**: migrate to AI SDK 6.0 and implement structured output for song title parsing.

<details>
<summary>Minor changes (10)</summary>

- Improve application launch animations and styling.
- Enhance CoverFlow with improved styling, perspective calculations, and track playback.
- Update macOS theme with aqua styling for buttons, progress bars, and other UI elements.
- Refactor application logic into reusable hooks.
- Update documentation with comprehensive guides for ryOS applications and API endpoints.
- Fix audio playback in Safari and improve audio context handling.
- Standardize button attributes and icon sizes across the application.
- Improve Terminal with grep and uptime commands; enhance Vim with search and visual modes.
- Update translations across languages for clarity and consistency.
- Improve error handling and logging throughout the application.

</details>

## December 2025

- **CoverFlow**: interactive CD animation with play/pause.
- **Karaoke**: full-screen iPod player with lyrics synchronization.
- **Lyrics pronunciation**: Japanese furigana and Chinese soramimi options.
- **Song metadata**: KuGou integration and Redis caching.
- **i18n**: language selection across the application.
- **Admin**: restricted-access app for managing users and songs.
- **Expose / Mission Control**: enhanced window management; screen saver.

<details>
<summary>Minor changes (10)</summary>

- Fix lyrics translation, furigana, and soramimi processing.
- Improve iPod and Karaoke touch handling and playback stability.
- Update Apple menu with new items and improved functionality.
- Enhance lyrics display with text shadows, word timing, and font customization.
- Refactor lyrics processing and API endpoints for performance and maintainability.
- Update dependencies and optimize Vite configuration.
- Add support for compressed content in song import/export.
- Improve error handling and timeout management in AI generation.
- Enhance localization across components and dialogs.
- Fix UI layout issues in iPod, Karaoke, and other components.

</details>

## November 2025

- **Applet Store**: AI-powered applet generation, sharing, and management.
- **Gemini for applets**: Google Gemini as primary AI model for applet generation with OpenAI fallback.
- **Prefetching and caching**: service worker updates, version handling, and improved offline support.
- **iPod video**: playback, translation, and fullscreen controls with new video entries.
- **PWA support**: service worker for faster loading and offline capabilities.
- **AI chat tools**: new and refactored tools for file system access and applet management.
- **Desktop and Finder shortcuts**: theme-conditional visibility and trash functionality.

<details>
<summary>Minor changes (9)</summary>

- Fix applet loading, sharing, and display.
- Update toast notifications for prefetching and version updates.
- Enhance PaintCanvas selection tools.
- Refactor components for clarity, maintainability, and performance.
- Add analytics tracking for applet viewer and key events.
- Update dependencies and build configurations.
- Improve error handling and logging in applet-ai.
- Enhance rate limiting and authentication in applet-ai and AppStoreFeed.
- Refactor Chats with Ryo help content and descriptions.

</details>

## October 2025

- **Applet viewer**: sharing, import/export, and content handling.
- **Applet saving**: save applets and generate HTML for ryOS Applets.
- **Applet design guidelines**: refactor for clarity and responsiveness.
- **Zod v4**: upgrade from v3.

<details>
<summary>Minor changes (8)</summary>

- Add icon support and toast notifications for generated HTML applets.
- Enhance MacDock with emoji scaling and layout adjustments.
- Improve AI prompt instructions for app generation and Chinese responses.
- Refine font handling for macOSX theme in applet viewer and HTML preview.
- Update app icons and file handling for applets.
- Add watch option to Vite server configuration to ignore terminal files.
- Fix login message shown when user was already logged in.
- Add new songs to ipod-videos.

</details>

## September 2025

- **Lyrics translation**: persistence and force-refresh.
- **Title parsing**: switch from OpenAI to Google Gemini with messages-array prompts.
- **AI chat**: automatic message handling and improved logging.
- **Default AI model**: Claude 4.5, later GPT-5.
- **TextEdit**: fallback mechanism for instance management.

<details>
<summary>Minor changes (8)</summary>

- Fix translation dropdown and lyric offset for specific songs.
- Update dependencies, including zod upgrade for AI SDK requirements.
- Refactor lyrics display delay; persist translation language preference.
- Increase lyrics translation timeout to 120 seconds.
- Add new videos to ipod-videos and update song details.
- Add more prefixes to skip in LRC parsing; skip recording engineer/digital editing prefixes.
- Remove rate limiting from lyrics translation API.
- Clean up vite.config.ts and vercel.json configuration.

</details>

## August 2025

- **Default AI model**: GPT-4.1.
- **macOS-style Dock**: app icons, interactions, and dynamic animations.
- **Chat rooms**: improved presence tracking, profanity filtering, and collapsible sections.
- **TextEdit**: new editor context, hooks, toolbar features, and improved dialog handling.
- **Finder**: responsive layout, consistent icon styling, and remembered view types.
- **Authentication**: Redis-based rate limiting and multi-token support.

<details>
<summary>Minor changes (10)</summary>

- Add music videos by Crush and ILLIT to the iPod videos collection.
- Update iframe sandbox security with enhanced permissions.
- Improve Dock with mobile/touch support, dynamic app focus/launch logic, and macOS X theme integration.
- Enhance chat room messages with aquarium emoji support and improved rendering.
- Implement CORS and rate limiting across multiple API endpoints.
- Update themes and styling for consistency across components and macOS themes.
- Enforce password requirements for user creation.
- Refactor Terminal for improved functionality and organization.
- Add 404 page redirect to homepage.
- Reorder and restore previously removed video entries.

</details>

## July 2025

- **Emoji aquarium**: aquarium feature in chat messages.
- **Ryo replies**: server-side reply generation and updated chat handling.
- **iPod**: fullscreen lyrics controls, improved UI, and NewJeans videos.
- **Themes**: macOS, Windows 98, and Windows XP support with updated styling and layout adjustments.
- **Link previews**: custom handling for YouTube and web links in chats.
- **App management**: refactor app and instance management for performance and consistency.

<details>
<summary>Minor changes (10)</summary>

- Add chat burst rate limiting for public rooms; enhance username handling in Redis.
- Fix mobile Safari playback; improve fullscreen video player interactions.
- Update default wallpapers; improve wallpaper routing and caching.
- Enhance chat message component with scrollbar width handling.
- Improve mobile touch interactions; prevent unwanted gestures.
- Switch lyrics translation from OpenAI to Google Gemini.
- Refactor urgent message animations in ChatMessages.
- Update Terminal to use Monaco font; adjust sound playback logic.
- Enhance token management and verification.
- Improve icon caching and versioning strategy.

</details>

## June 2025

- **Multi-token authentication**: improved validation and user mapping.
- **Chat rooms**: private room support, user presence tracking, and improved room management.
- **Chat API**: improved system message handling, caching, and Pusher event broadcasting.
- **Chat UX**: enhanced error handling, updated dialogs, and better layout consistency.
- **Password management**: password features in the chat application.
- **Context menus**: right-click menus on Desktop and Finder with data-driven menu items.

<details>
<summary>Minor changes (10)</summary>

- Add user-specific token management in chat API and AI chat requests.
- Update rate limiting and input validation for chat rooms.
- Extend user token expiration and implement token refresh.
- Refactor authentication to prioritize headers and improve logging.
- Update iPod with new videos, clickwheel sound, and volume settings.
- Improve file metadata restoration with existing UUID preservation.
- Fix Safari emoji rendering; update SpeechHighlight extension.
- Refactor Redis key retrieval to use SCAN.
- Update dependencies and refactor TypeScript type assertions.
- Add login and logout commands and improve related UI.

</details>

## May 2025

- **Multi-instance apps**: Finder and Terminal multi-instance support with improved window ordering.
- **Chats**: AI-generated HTML support, improved message handling, and iPod/TextEdit tool integrations.
- **iPod**: full-screen lyrics, swipe track navigation, and library import/export.
- **State management**: Zustand across core components, removing local storage dependencies.
- **TextEdit**: markdown conversion, search/replace, and improved file handling.
- **Chat features**: user mentions, online status, message deletion, and improved room management.

<details>
<summary>Minor changes (10)</summary>

- Update iPod with new video entries, lyric offset adjustments, and playback synchronization.
- Enhance chat UI with layout consistency, interaction sounds, and copy message.
- Improve Internet Explorer with direct passthrough URL handling, updated favorites, and navigation controls.
- Refactor audio synthesis and sound handling for performance and volume control.
- Fix chat message display, audio context management, and file handling bugs.
- Update AI prompts and instructions for chat response behavior and tool usage.
- Enhance Control Panels with volume mute toggle and improved sound settings UI.
- Improve mobile responsiveness in WindowFrame and ChatsAppComponent.
- Add TextEdit tool call for creating a blank document.
- Implement Redis caching for lyrics and translation requests.

</details>

## April 2025

- **Internet Explorer Time Machine**: navigate past and future web designs with animations, layouts, and mobile responsiveness.
- **Internet Explorer AI**: AI-powered content generation, caching, and improved navigation with shared URLs and Wayback Machine integration.
- **Internet Explorer UX**: terminal sounds, debug mode, foreground overlay, and dynamic title management.
- **Internet Explorer state**: Zustand refactor for performance and maintainability.
- **AI model**: update to gpt-4.1 with enhanced generation prompts.

<details>
<summary>Minor changes (10)</summary>

- Update Internet Explorer menu bar with Share App and reordered menu items.
- Improve video management with new default videos and updated titles and artist names.
- Enhance font mapping and add Jacquard font support.
- Update default favorites in Internet Explorer store.
- Refine HTML sanitization in HtmlPreview for security and cleanliness.
- Improve error handling and logging in Internet Explorer and iframe-check API.
- Update dependencies and TypeScript configuration.
- Implement CORS support in API endpoints.
- Add browser headers and pixelated rendering for images in iframe-check API.
- Refactor Chats, Videos, and iPod to use Zustand for state management.

</details>

## March 2025

- **Synth**: preset management, 3D waveform visualization, and mobile responsiveness.
- **Terminal HTML preview**: streaming support, save to disk, and copy to clipboard.
- **Chats**: username management, message polling, profanity filtering, and real-time updates via Pusher.
- **iPod**: video playback, dynamic menu items, responsive scaling, and theme management.
- **Photo Booth**: camera selection, filter support, file system integration, and iOS compatibility.
- **Chat API**: refactor for performance, error handling, model selection, and response formatting.

<details>
<summary>Minor changes (10)</summary>

- Enhance Terminal with Vim editor, new commands (echo, whoami, date), and command history navigation.
- Improve iPod with touch event handling, animated text scrolling, and dynamic video playlist loading.
- Update chat generation instructions for UI element sizing, container wrapping, and responsive design.
- Refactor HtmlPreview for improved scaling, positioning, and animation during streaming.
- Enhance Desktop and useWallpaper for video wallpaper handling and loading state.
- Add IndexedDB backup and restore in Control Panels.
- Implement Blob content handling in Terminal, TextEdit, Finder, and Paint.
- Update dependencies and clean up unused variables.
- Improve sound effects in Terminal, HtmlPreview, and ChatMessages.
- Refactor vibration handling in iPod and ChatMessages.

</details>

## February 2025

- **Paint**: MacPaint-inspired UI with pattern drawing, selection tools, undo/redo, clipboard, and touch support.
- **Videos**: React Player with retro CD player UI, animated digit display, and fullscreen playback.
- **Virtual PC**: classic games with DOSBox integration.
- **File system**: migrate to IndexedDB with dedicated image storage.
- **TextEdit**: document editing commands, markdown support, and file drag-and-drop.
- **Backup and restore**: in Control Panels.

<details>
<summary>Minor changes (10)</summary>

- Add advanced image filters and improved import scaling to Paint.
- Add CRT display mode with scanline effect to Videos.
- Enhance chat with nudge feature, urgent message highlighting, and markdown parsing.
- Improve file management with restore and rename in Finder.
- Add MSN nudge sound effect and tooltip to audio input button.
- Update AI assistant system prompt with expanded persona and app details.
- Add chat typing synthesis preset selection to Control Panels.
- Improve canvas touch and pointer event handling across Paint and other apps.
- Add storage space tracking and UI improvements to Finder.
- Enhance window management with improved resize delta calculations.

</details>

## January 2025

- **ryOS launch**: Soundboard with audio recording, waveform visualization, and board management.
- **Internet Explorer**: Wayback Machine integration, favorites, and history navigation.
- **Chats**: AI assistant (Ryo), persistent message storage, and animated typing display.
- **TextEdit**: Tiptap rich text editor with slash commands and typography formatting.
- **Desktop environment**: window management, drag/resize, minimize, and sound effects.
- **Core apps**: Minesweeper, Finder, and Control Panels with multi-app architecture and desktop icons.

<details>
<summary>Minor changes (10)</summary>

- Add sound effects for window operations, buttons, menus, and chat interactions.
- Implement chat typing synthesis with Tone.js and pentatonic scale.
- Add audio transcription for voice input in Chats and TextEdit.
- Improve mobile responsiveness with touch support, swipe navigation, and adaptive window sizing.
- Add SEO meta tags, favicon, and Geneva font for classic Mac aesthetics.
- Implement localStorage persistence for app state across sessions.
- Add About This Computer dialog with dynamic memory usage visualization.
- Add help and about dialogs with grid layout to all apps.
- Enhance Internet Explorer with loading states, error handling, and favicon support.
- Add emoji picker, wallpaper selection, and UI interaction sound effects.

</details>

---

*This changelog is maintained from git history and manual curation. Last updated: 2026-07-03*
