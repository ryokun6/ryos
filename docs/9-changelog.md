# Changelog

A summary of changes and updates to ryOS, organized by month.

---

## March 2026

- Add Calendar app with iCal support, AI integration, and Dashboard widget.
- Implement universal undo/redo mechanism for Finder, Paint, and TextEdit.
- Introduce realtime sync notifications via Pusher/local WebSocket and Redis-direct cloud sync.
- Enable Telegram bot linking with DM chat support, image support, and AI-powered heartbeat insights.
- Redesign Dashboard with brushed metal UI, widget strip, and new widgets (iPod, Dictionary, Stocks, Translator).
- Implement cloud sync for dock icons, iPod/karaoke settings, stickies, and videos library.
- Support subdomain wildcard patterns in CORS and host allowlists.

<details>
<summary>Minor changes (9)</summary>

- Refactor API endpoints to use apiHandler for improved security and consistency.
- Improve Contacts app with vCard import, refined UI, and cloud sync.
- Enhance iPod and karaoke playback performance and widget controls.
- Fix various UI issues across Calendar, Contacts, Dashboard, and other apps.
- Update documentation with comprehensive codebase audit, API references, and self-hosting guides.
- Localize missing translations across various apps and control panels.
- Add heartbeat records UI to admin user details page.
- Improve crash dialog recovery UX and add quit option.
- Optimize app performance with code splitting and memoization.

</details>

## February 2026

- Add Winamp app with Webamp integration, including skins, YouTube seeking, and iPod library loading.
- Implement cloud sync backup and restore functionality with increased limit and progress tracking.
- Introduce two-tier memory system with daily notes and long-term memories, including admin panel updates.
- Enhance Spotlight Search functionality and styling, including Tauri compatibility and improved localization.
- Add proactive AI greeting for logged-in users with memories.
- Implement display mode selection in Karaoke and iPod apps, including new water, mesh gradient, liquid, and warp modes.
- Refactor AmbientBackground component with audio-reactive features and performance optimizations.

<details>
<summary>Minor changes (9)</summary>

- Fix various Winamp UI and functionality issues, including playlist layout and media controls.
- Improve error handling and crash fallbacks with new error boundaries and shared dialog chrome.
- Update admin panel with detailed import progress states, rate-limit waits, and memory management tools.
- Fix mobile input styles, spotlight positioning, and theme inconsistencies.
- Localize Winamp and cloud sync strings across all locales.
- Refactor app routing, event orchestration, and memory processing for improved performance and stability.
- Update dependencies and resolve lint warnings across various components and hooks.
- Improve System 7 dialog title bar styling and consistency.
- Add crash test controls and app/desktop error boundaries.

</details>

---

*This changelog is automatically generated and summarized from git history. Last updated: 2026-03-09*
