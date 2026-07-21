# Changelog

The biggest ryOS updates, organized by month. Each release highlights about five features so the important work is easy to scan.

Open **More from this month** for fixes, polish, infrastructure, and smaller updates.

<style>
.changelog-month-note { color: var(--doc-text-tertiary); margin: -6px 0 14px; }
.changelog-feature-grid { display: flex; flex-direction: column; gap: 18px; margin: 12px 0 20px; }
.changelog-feature { overflow: hidden; border: 1px solid var(--doc-border); border-radius: 12px; background: var(--doc-surface-alt); }
.changelog-feature img { display: block; width: 100%; height: auto; object-fit: contain; border-bottom: 1px solid var(--doc-border); background: var(--doc-surface); }
.changelog-feature-copy { padding: 14px 16px 16px; }
.changelog-feature h3 { font-size: 14px; margin: 0 0 6px; }
.changelog-feature p { color: var(--doc-text-secondary); font-size: 12px; margin: 0; }
@media screen and (max-width: 768px) { .changelog-feature-grid { gap: 14px; } .changelog-feature-copy { padding: 12px 14px 14px; } }
</style>

---

## July 2026

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-07-08-ie-reader-mode-16x9.webp" alt="Internet Explorer Reader Mode in the July 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Internet Explorer Reader Mode</h3><p>Heavy modern pages open as a clean article view so the desktop stays responsive.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-07-07-weather-location-16x9.webp" alt="Weather and location tools in the July 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Weather &amp; location tools</h3><p>Ryo fetches live forecasts and asks for precise location with an in-chat Allow / Don't Allow card.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-07-07-save-anywhere-16x9.webp" alt="Save anywhere VFS in the July 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Save anywhere</h3><p>Create root folders in Finder and save documents to any writable path across apps.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-07-06-desktop-assistant-16x9.webp" alt="Desktop Assistant in the July 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Desktop Assistant</h3><p>Clippy, Rover, and friends float on the desktop with AI chat, speech, and custom behaviors.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-07-01-books-library-16x9.webp" alt="Books library in the July 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Books library</h3><p>A wooden EPUB shelf keeps imports, reading progress, and Meditations together.</p></div></article>
</div>
<details>
<summary>More from this month (27)</summary>

- **Internet Explorer Reader Mode**: oversized modern pages (about 1 MB+) open as a lite article view with Open original, so heavy sites no longer freeze the shared desktop tab.
- Add **runJs** chat tool: a QuickJS WASM sandbox runs pure ES2023 on the server and returns console output plus the completion value.
- Add **getWeather** and **getPreciseLocation** AI tools with Open-Meteo forecasts and an approval-gated location permission card in web chat.
- Allow user-created root folders and save-anywhere VFS: Finder can create folders at `/`, and Save dialogs list every writable directory.
- Fix AI analytics over-counting and a per-render conversation re-fetch loop in Chats.
- Remove Vercel-specific deployment code; production is Coolify-only with S3 storage and a standalone Bun server.
- Replace the Chats mobile room sheet with a dropdown menu switcher.

- **Server-owned AI conversations**: Ryo chat history lives on the server with delta reads and a single write path, streams updates to other signed-in devices in realtime, and delivers the proactive greeting as a server-owned message.
- Assistant polish: window-aware bubble placement with 4-side popping that never clips off-screen, per-character accent-colored speech bubbles, shimmer thinking states, compact map/HTML/Cursor tool embeds, browser text-to-speech with character voice defaults, and character names localized across all 11 locales.
- Add a Behavior tab to Assistant settings with customizable behaviors and more response-style presets (detailed, friendly, professional, playful); sync assistant settings via cloud sync.
- Improve the AI tool system with an expanded settings tool, tool-call repair, per-tool rate limits, and strict payload guardrails against junk settings updates.
- Make the AI wallpaper tool predictable with exact names, shuffle categories, and dynamic wallpaper support.
- Move client persistence and Sync v2 state to IndexedDB and prune stale markers.
- Add an IndexedDB viewer tab to the debug panel and entry/exit animations for the debug console overlay.
- Show the filename while fetching files in the cloud sync indicator; fix a crash when persisted deletion-marker buckets are missing.
- Fix chat clear failing after account changes; show a sign-in button when the assistant bubble is rate limited.
- Replace the docs home diagram with latest changelog cards and retake historical changelog screenshots.
- Clean up legacy code: drop AI SDK v4 aliases, remove dead exports and duplicate debug loggers, and unify duration formatting and log summarizer helpers.
- Cut boot-critical JavaScript by about 44% through code splitting and startup work.
- Add offline empty states for network-dependent apps and explicit standalone-server cache headers.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-07-05-aqua-appearance-16x9.webp" alt="Aqua Glass in the June 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Aqua Glass</h3><p>The new macOS material brings translucent chrome and wallpaper-aware controls.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-07-02-cloud-sync-16x9.webp" alt="Cloud Sync v2 in the June 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Cloud Sync v2</h3><p>Journal-based delta sync replaces full-state uploads and resolves changes per key.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-07-04-preview-16x9.webp" alt="Preview in the June 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Preview</h3><p>A focused document viewer adds Finder associations, import, Save As, and export.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-07-03-international-16x9.webp" alt="International preferences in the June 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>International preferences</h3><p>An interactive world map sets the time zone used across the system.</p></div></article>
</div>
<details>
<summary>More from this month (43)</summary>

- **Sync v1 retirement**: remove manual cloud backup endpoints and promote restored local backups into Sync v2.
- Move legacy Redis backfill and deletion into a standalone migration CLI.
- Cut about 1MB of boot-critical JavaScript and reduce hot subscriptions, polling, and persistence work.
- Redesign Control Panels around a System Preferences layout with a consolidated Account menu.
- Add locale formats and an interactive time-zone picker to International preferences.
- Add day/night, now-playing, shuffle, Weather, and Lyrics wallpaper modes.
- Add selectable accent colors across Aqua and System 7.
- Add self-service account recovery and deletion.
- Publish the Privacy Policy and Terms of Service.
- Improve stable cover-derived glow and karaoke timing across iPod and Karaoke.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-05-01-maps-16x9.webp" alt="Maps in the May 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Maps</h3><p>MapKit search, saved places, and chat place cards bring Apple Maps into ryOS.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-05-02-ipod-16x9.webp" alt="iPod modern UI in the May 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>iPod modern UI</h3><p>A new classic-inspired player adds Cover Flow, games, and Apple Music.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-05-03-virtual-pc-16x9.webp" alt="Virtual PC v86 in the May 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Virtual PC (v86)</h3><p>The emulator browser expands to classic Windows, Linux, BSD, and ReactOS images.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-05-04-dashboard-16x9.webp" alt="Dashboard in the May 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Dashboard</h3><p>Aquarium and currency widgets join the responsive widget canvas.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-05-05-tv-16x9.webp" alt="Ryo TV in the May 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Ryo TV</h3><p>Fullscreen controls, channel graphics, and CRT details make channel surfing feel complete.</p></div></article>
</div>
<details>
<summary>More from this month (34)</summary>

- Polish TV with a channel bug, idle bursts, drawer sounds, and fullscreen controls.
- Centralize shared platform styling with `data-os-platform` and menu tokens.
- Remove the CandyBar dock icon pack browser.
- Add Cover Flow on fullscreen long-press and a browser-fullscreen Apple menu toggle.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-04-01-ryo-tv-16x9.webp" alt="Ryo TV in the April 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Ryo TV</h3><p>AI-generated channels, CRT effects, captions, and custom lineups launch as a new app.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-04-02-chats-16x9.webp" alt="IRC and Cursor agents in the April 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>IRC and Cursor agents</h3><p>Chats gains IRC discovery and live Cursor Cloud agent runs.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-04-03-karaoke-16x9.webp" alt="Karaoke in the April 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Karaoke</h3><p>Title cards, smoother marquees, and faster lyric rendering polish fullscreen playback.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-04-04-ipod-16x9.webp" alt="iPod in the April 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>iPod</h3><p>Shared media controls and Cover Flow connect the player with Karaoke.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-04-05-wallpapers-16x9.webp" alt="Wallpaper system in the April 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Wallpaper system</h3><p>Leopard sets, improved browsing, and persisted display settings refresh the desktop.</p></div></article>
</div>
<details>
<summary>More from this month (13)</summary>

- Add Leopard wallpaper sets, picker improvements, and persisted display settings.
- Refresh default desktop shortcuts and Chats icons across classic themes.
- Optimize AI system prompts for static caching.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-03-01-calendar-16x9.webp" alt="Calendar in the March 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Calendar</h3><p>iCal support, todos, and Dashboard integration make scheduling useful across apps.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-03-02-dashboard-16x9.webp" alt="Dashboard in the March 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Dashboard</h3><p>Stocks, Dictionary, Translator, and smarter placement redesign the widget layer.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-03-03-finder-16x9.webp" alt="Finder sharing in the March 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Finder sharing</h3><p>AirDrop-style transfers, multi-select, and universal undo expand file workflows.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-03-04-contacts-16x9.webp" alt="Contacts in the March 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Contacts</h3><p>vCard import and cloud sync add a system address book.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-03-05-cloud-sync-16x9.webp" alt="Cloud Sync in the March 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Cloud Sync</h3><p>Logical domains upload settings and files incrementally instead of replacing everything.</p></div></article>
</div>
<details>
<summary>More from this month (26)</summary>

- Add and apply dock icon packs with CandyBar.
- Persist Auto Sync server-side with incremental settings uploads.
- Add a hardened server-side `webFetch` chat tool.
- Improve presence heartbeats and recover from partial sync or invalid theme state.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-02-01-winamp-16x9.webp" alt="Winamp in the February 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Winamp</h3><p>Webamp joins ryOS with skins, YouTube seeking, and iPod library loading.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-02-02-ipod-ambient-16x9.webp" alt="Ambient visuals in the February 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Ambient visuals</h3><p>Audio-reactive liquid and warp backgrounds respond to playback.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-02-03-karaoke-16x9.webp" alt="Karaoke display modes in the February 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Karaoke display modes</h3><p>Karaoke and iPod share selectable fullscreen visual modes.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-02-04-chats-memory-16x9.webp" alt="Ryo memory in the February 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Ryo memory</h3><p>Daily notes and long-term memories give Chats useful continuity.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-02-05-dashboard-16x9.webp" alt="Dashboard in the February 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Dashboard</h3><p>Widgets keep lightweight information close without opening full apps.</p></div></article>
</div>
<details>
<summary>More from this month (10)</summary>

- Add app and desktop error boundaries for safer recovery.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-01-01-listen-together-16x9.webp" alt="Listen Together in the January 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Listen Together</h3><p>iPod and Karaoke can host shared sessions with invites and reactions.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-01-02-infinite-mac-16x9.webp" alt="Infinite Mac in the January 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Infinite Mac</h3><p>Scaling, screenshots, and stronger window controls improve the classic Mac emulator.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-01-03-stickies-16x9.webp" alt="Stickies in the January 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Stickies</h3><p>Draggable, colored notes add a lightweight scratchpad to the desktop.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-01-04-chats-16x9.webp" alt="Chats in the January 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Chats</h3><p>Image uploads and AI memory extraction broaden conversations.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-01-05-finder-16x9.webp" alt="Finder in the January 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Finder</h3><p>File browsing remains the center of the growing multi-app desktop.</p></div></article>
</div>
<details>
<summary>More from this month (11)</summary>

- Migrate to AI SDK 6.0 and structured song-title output.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-12-01-cover-flow-16x9.webp" alt="Cover Flow in the December 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Cover Flow</h3><p>Interactive album art gains CD motion and direct playback controls.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-12-02-karaoke-16x9.webp" alt="Karaoke in the December 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Karaoke</h3><p>A dedicated fullscreen player synchronizes video, music, and timed lyrics.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-12-03-videos-16x9.webp" alt="Videos in the December 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Videos</h3><p>The media library connects playback with iPod and Karaoke.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-12-04-control-panels-16x9.webp" alt="International settings in the December 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>International settings</h3><p>System language and localization become user-selectable.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-12-05-finder-16x9.webp" alt="Mission Control in the December 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Mission Control</h3><p>Window management gains Exposé-style overview and a screen saver.</p></div></article>
</div>
<details>
<summary>More from this month (12)</summary>

- Add KuGou song metadata lookup and Redis caching.
- Add an Admin app for managing users and songs.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-11-01-applet-store-16x9.webp" alt="Applet Store in the November 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Applet Store</h3><p>AI-generated applets can be created, shared, imported, and managed.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-11-02-chats-16x9.webp" alt="AI chat tools in the November 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>AI chat tools</h3><p>Ryo gains applet and file-system tools for richer desktop actions.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-11-03-ipod-video-16x9.webp" alt="iPod video in the November 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>iPod video</h3><p>Video playback, translation, and fullscreen controls join the music player.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-11-04-finder-16x9.webp" alt="Desktop shortcuts in the November 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Desktop shortcuts</h3><p>Theme-aware shortcuts and Trash behavior make files easier to reach.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-11-05-paint-16x9.webp" alt="Paint selections in the November 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Paint selections</h3><p>Selection tools become more capable inside the MacPaint-inspired canvas.</p></div></article>
</div>
<details>
<summary>More from this month (10)</summary>

- Add theme-aware Desktop and Finder shortcuts with Trash support.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-10-01-applet-viewer-16x9.webp" alt="Applet Viewer in the October 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Applet Viewer</h3><p>Generated applets gain a dedicated viewer with sharing and import or export.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-10-02-chats-16x9.webp" alt="Applet generation in the October 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Applet generation</h3><p>Chats can generate applets and hand them to the viewer.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-10-03-textedit-16x9.webp" alt="Generated HTML in the October 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Generated HTML</h3><p>Editable applet content can be inspected and saved as HTML.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-10-04-finder-16x9.webp" alt="Applet files in the October 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Applet files</h3><p>Finder recognizes applet assets and their icons.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-10-05-control-panels-16x9.webp" alt="Responsive applets in the October 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Responsive applets</h3><p>Updated design guidance keeps generated interfaces readable at different sizes.</p></div></article>
</div>
<details>
<summary>More from this month (8)</summary>

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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-09-01-lyrics-16x9.webp" alt="Lyrics translation in the September 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Lyrics translation</h3><p>Translated lyrics persist and can be refreshed on demand.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-09-02-ai-chat-16x9.webp" alt="AI chat in the September 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>AI chat</h3><p>Automatic message handling and clearer logs improve Ryo conversations.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-09-03-textedit-16x9.webp" alt="TextEdit in the September 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>TextEdit</h3><p>More reliable instance fallback keeps editor windows available.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-09-04-finder-16x9.webp" alt="Finder in the September 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Finder</h3><p>File workflows stay integrated with the expanding media and editor apps.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-09-05-control-panels-16x9.webp" alt="Model settings in the September 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Model settings</h3><p>The default assistant progresses from Claude 4.5 to GPT-5.</p></div></article>
</div>
<details>
<summary>More from this month (8)</summary>

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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-08-01-dock-and-finder-16x9.webp" alt="macOS-style Dock in the August 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>macOS-style Dock</h3><p>Animated app icons, focus, and touch support establish the desktop launcher.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-08-02-chat-rooms-16x9.webp" alt="Chat rooms in the August 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Chat rooms</h3><p>Presence, moderation, and collapsible room sections improve public chat.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-08-03-textedit-16x9.webp" alt="TextEdit in the August 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>TextEdit</h3><p>A new editor context and toolbar make document work more reliable.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-08-04-authentication-16x9.webp" alt="Authentication in the August 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Authentication</h3><p>Redis-backed rate limits and multiple tokens harden account sessions.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-08-05-ipod-16x9.webp" alt="iPod in the August 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>iPod</h3><p>The player continues to gain responsive controls and a larger library.</p></div></article>
</div>
<details>
<summary>More from this month (11)</summary>

- Update the default AI model to GPT-4.1.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-07-01-chats-aquarium-16x9.webp" alt="Emoji aquarium in the July 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Emoji aquarium</h3><p>Aquarium messages bring a playful animated scene into Chats.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-07-02-ipod-16x9.webp" alt="iPod in the July 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>iPod</h3><p>Fullscreen lyrics and touch controls improve mobile music playback.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-07-03-themes-16x9.webp" alt="Themes in the July 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Themes</h3><p>macOS, Windows 98, and Windows XP become complete desktop choices.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-07-04-link-previews-16x9.webp" alt="Link previews in the July 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Link previews</h3><p>Chats recognizes YouTube and web links with custom previews.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-07-05-finder-16x9.webp" alt="App management in the July 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>App management</h3><p>Window and instance handling becomes faster and more consistent.</p></div></article>
</div>
<details>
<summary>More from this month (11)</summary>

- Refactor app and instance management for performance and consistency.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-06-01-chat-rooms-16x9.webp" alt="Private chat rooms in the June 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Private chat rooms</h3><p>Presence and room management expand beyond the original public channels.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-06-02-context-menus-16x9.webp" alt="Context menus in the June 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Context menus</h3><p>Desktop and Finder actions move into data-driven right-click menus.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-06-03-ipod-16x9.webp" alt="iPod in the June 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>iPod</h3><p>New videos, click-wheel sound, and volume settings deepen the player.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-06-04-passwords-16x9.webp" alt="Password management in the June 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Password management</h3><p>Account and password controls become part of the desktop experience.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-06-05-internet-explorer-16x9.webp" alt="Internet Explorer in the June 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Internet Explorer</h3><p>The Time Machine browser keeps favorites and historical navigation close.</p></div></article>
</div>
<details>
<summary>More from this month (11)</summary>

- Add password management to Chats.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-05-01-multi-instance-finder-16x9.webp" alt="Multi-instance Finder in the May 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Multi-instance Finder</h3><p>Multiple Finder and Terminal windows gain predictable ordering.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-05-02-chats-16x9.webp" alt="Chats in the May 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Chats</h3><p>HTML replies, mentions, deletion, and app tools broaden conversations.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-05-03-ipod-16x9.webp" alt="iPod in the May 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>iPod</h3><p>Fullscreen lyrics, swipe navigation, and library import or export arrive.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-05-04-textedit-16x9.webp" alt="TextEdit in the May 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>TextEdit</h3><p>Markdown conversion, search and replace, and file handling mature.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-05-05-internet-explorer-16x9.webp" alt="Internet Explorer in the May 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Internet Explorer</h3><p>Favorites and direct navigation connect the browser to the rest of ryOS.</p></div></article>
</div>
<details>
<summary>More from this month (11)</summary>

- Add chat mentions, online status, message deletion, and room-management improvements.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-04-01-time-machine-16x9.webp" alt="Internet Explorer Time Machine in the April 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Internet Explorer Time Machine</h3><p>Browse past and future versions of the web from one address bar.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-04-02-ai-chat-16x9.webp" alt="Internet Explorer AI in the April 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Internet Explorer AI</h3><p>Generated pages, caching, and shared URLs connect the browser with Ryo.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-04-03-ipod-16x9.webp" alt="iPod in the April 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>iPod</h3><p>Media playback remains available beside the new browsing experience.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-04-04-finder-16x9.webp" alt="Finder in the April 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Finder</h3><p>Files can move between the browser, editors, and media apps.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-04-05-paint-16x9.webp" alt="Paint in the April 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Paint</h3><p>The MacPaint-style canvas stays integrated with shared files.</p></div></article>
</div>
<details>
<summary>More from this month (10)</summary>

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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-03-01-synth-16x9.webp" alt="Synth in the March 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Synth</h3><p>Preset management and a 3D waveform launch a playable instrument.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-03-02-terminal-16x9.webp" alt="Terminal in the March 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Terminal</h3><p>Vim, new commands, command history, and streaming HTML previews arrive.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-03-03-chats-16x9.webp" alt="Chats in the March 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Chats</h3><p>Pusher-powered realtime messages add rooms, presence, and moderation.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-03-04-ipod-16x9.webp" alt="iPod in the March 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>iPod</h3><p>Video playback and responsive controls expand the music player.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-03-05-photo-booth-16x9.webp" alt="Photo Booth in the March 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Photo Booth</h3><p>Camera selection, filters, file saving, and iOS support add a new creative app.</p></div></article>
</div>
<details>
<summary>More from this month (11)</summary>

- Refactor the Chat API for performance, error handling, and model selection.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-02-01-paint-16x9.webp" alt="Paint in the February 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Paint</h3><p>A MacPaint-inspired canvas launches with patterns, selections, undo, and touch.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-02-02-videos-16x9.webp" alt="Videos in the February 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Videos</h3><p>A retro CD-player interface wraps responsive video playback.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-02-03-virtual-pc-16x9.webp" alt="Virtual PC in the February 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Virtual PC</h3><p>Classic games run inside a DOSBox-powered PC app.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-02-04-finder-16x9.webp" alt="IndexedDB files in the February 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>IndexedDB files</h3><p>Images and documents move into a durable browser file system.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-02-05-textedit-16x9.webp" alt="TextEdit in the February 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>TextEdit</h3><p>Markdown, drag and drop, and document commands improve editing.</p></div></article>
</div>
<details>
<summary>More from this month (11)</summary>

- Add backup and restore to Control Panels.
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

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-01-01-desktop-16x9.webp" alt="ryOS launches in the January 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>ryOS launches</h3><p>A compact desktop starts with Soundboard, Internet Explorer, and Chats.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-01-02-soundboard-16x9.webp" alt="Soundboard in the January 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Soundboard</h3><p>Record sounds, see waveforms, and organize clips into boards.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-01-03-soundboard-library-16x9.webp" alt="Sound libraries in the January 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Sound libraries</h3><p>Named boards keep themed sound collections one click away.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-01-04-internet-explorer-16x9.webp" alt="Internet Explorer in the January 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Internet Explorer</h3><p>Favorites and Wayback Machine navigation bring the web onto the desktop.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2025-01-05-chats-16x9.webp" alt="Chats in the January 2025 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Chats</h3><p>Ryo debuts with persistent messages and an animated typing display.</p></div></article>
</div>
<details>
<summary>More from this month (11)</summary>

- Add Minesweeper, Finder, and Control Panels to the multi-app desktop.
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

*This changelog is maintained from git history and manual curation. Last updated: 2026-07-07*
