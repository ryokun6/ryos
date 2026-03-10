# Changelog

A summary of changes and updates to ryOS, organized by month.

---

## March 2026

- Add Calendar app with iCal support, Dashboard widget overlay, and AI integration.
- Implement cloud sync for dock icons, iPod/karaoke settings, stickies, wallpapers, images, contacts, and videos library.
- Introduce a universal undo/redo mechanism for Finder, Paint, and TextEdit.
- Redesign the Dashboard with a widget strip, improved placement, and new widgets like Stocks, Dictionary, and Translator.
- Enhance Contacts app with vCard import, refined UI, and cloud sync.
- Add Telegram bot linking, DM chat support, web search, and heartbeat insights.

<details>
<summary>Minor changes (10)</summary>

- Improve iPod and karaoke playback performance and add iPod widget control for karaoke.
- Refactor API endpoints to use apiHandler for improved security and consistency.
- Fix smart widget placement to avoid overlap and default weather to San Francisco.
- Update documentation for file system, audio system, AI system, apps index, and API reference.
- Enhance admin app with usage analytics dashboard, server page, and improved user details.
- Improve crash dialog recovery UX and add a quit option.
- Refine the UI with a semantic color palette and clean up the dashboard.
- Optimize analytics write and read paths for better performance.
- Add switchable Vercel Blob and S3-compatible storage.
- Support subdomain wildcard patterns in CORS and host allowlists.

</details>

## February 2026

- Implement Winamp integration with Webamp, including frameless mode, skins, YouTube seeking, and iPod library loading.
- Introduce a two-tier memory system with daily notes and long-term memories, enhancing AI proactive greetings and user experience.
- Enhance the AmbientBackground component with audio-reactive features and new liquid and warp display modes for iPod and Karaoke.
- Implement display mode selection in KaraokeAppComponent and update display modes in iPod and Karaoke components.
- Add app and desktop error boundaries for improved stability and user experience.
- Implement app switcher functionality with keyboard shortcuts.

<details>
<summary>Minor changes (9)</summary>

- Improve cloud backup and restore functionality with increased limit, progress tracking, and UI enhancements.
- Refactor daily notes processing for improved efficiency and reduced timeouts.
- Fix various issues related to Winamp integration, including icon theming, playlist layout, and foreground handling.
- Localize Winamp and cloud sync strings across multiple languages.
- Update admin panel to display daily notes alongside long-term memories and add memory management tools.
- Fix issues related to proactive greeting display and animation.
- Improve memory timestamps and stale-memory cleanup.
- Update AI models and restrict debug mode to admin users.
- Fix missing Vercel rewrites for specific URLs.

</details>

---

*This changelog is automatically generated and summarized from git history. Last updated: 2026-03-10*
