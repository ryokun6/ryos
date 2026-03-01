# Changelog

A summary of changes and updates to ryOS, organized by month.

---

## March 2026

- Migrated multiple backend routes to use the new apiHandler for improved consistency and security.
- Introduced frontend API clients for auth, rooms, and listen flows.
- Added support for standalone API deployment using Bun.serve.

<details>
<summary>Minor changes (7)</summary>

- Improved app stability by resolving an infinite re-render loop in Expose mode.
- Optimized frontend performance by reducing unnecessary re-renders and improving store subscriptions.
- Enhanced crash dialog with a Quit option and improved TextEdit open flow.
- Updated documentation for API reference, architecture, application framework, and various system components.
- Hardened API authentication boundaries and unified route metadata.
- Updated AGENTS local testing to use Bun API and Vite proxy.
- Made the Quit action in the crash dialog visually secondary.

</details>

## February 2026

- Add Winamp app with Webamp integration, including skins, YouTube seeking, and iPod library loading.
- Implement Spotlight Search as a unified command palette for ryOS, featuring themed styling and Tauri compatibility.
- Enhance cloud backup and restore functionality with increased limit, progress tracking, and simplified UI.
- Introduce a two-tier memory system with daily notes and long-term memories, accessible in the admin panel.
- Add proactive AI greeting for logged-in users with memories.
- Implement display mode selection in Karaoke and iPod components, including new water, mesh gradient, liquid, and warp display modes.
- Refactor chat system with pusher channel refcounting, improved notification handling, and background updates.

<details>
<summary>Minor changes (10)</summary>

- Fix various styling inconsistencies and layout issues across different themes and components.
- Improve error handling and add error boundaries for apps and desktop.
- Enhance admin panel with detailed import progress states and user memory views.
- Update AI models and restrict debug mode to admin users.
- Refactor and optimize AmbientBackground component with audio-reactive features.
- Use abortable fetch for various API requests to improve stability and prevent issues.
- Add crash test controls and shared dialog chrome for crash fallbacks.
- Localize Winamp controls menu and other UI elements across all locales.
- Harden iframe message trust boundaries for IE and applets.
- Improve mobile input styles and Spotlight positioning.

</details>

## January 2026

- Introduce Listen Together feature with session management, UI, and Pusher integration for collaborative listening in iPod and Karaoke apps.
- Implement Infinite Mac application with scaling, screenshot functionality, dynamic title, and improved window management.
- Add Stickies application with draggable notes, color localization, and mobile touch support.
- Enhance chat functionality with image upload support, improved styling, and AI-powered memory extraction.
- Refactor API endpoints to Node.js runtime, consolidate API design, and unify authentication.
- Migrate to AI SDK 6.0 and implement structured output for song title parsing.

<details>
<summary>Minor changes (9)</summary>

- Improve Infinite Mac tool call messages and loading experience.
- Enhance application launch animations and styling for macOS and Windows themes.
- Update iPod and Karaoke apps with auto-skip functionality and improved lyrics handling.
- Refactor various app components (Synth, Terminal, iPod, Karaoke, etc.) into reusable logic hooks.
- Replace Lucide icons with Phosphor icons throughout the application.
- Improve Safari audio handling and fix audio resume issues.
- Update documentation with comprehensive guides for API endpoints and applications.
- Enhance CoverFlow component with improved styling and animations.
- Fix various bugs related to app functionality, UI, and translations.

</details>

## December 2025

- Implement a new CoverFlow feature with long-press gesture and menu toggle for enhanced music browsing.
- Introduce a Karaoke app with windowed full-screen iPod player and lyrics synchronization features.
- Add Japanese furigana and Chinese soramimi (空耳) pronunciation options for lyrics display.
- Implement a new Admin application with restricted access for managing users, messages, and songs.
- Enhance lyrics handling with KRC support, YouTube title parsing, and chunked streaming for translation and furigana.
- Implement a new Expose/Mission Control mode for enhanced window management.
- Add i18n support with language selection feature and enhance localization across various components.

<details>
<summary>Minor changes (10)</summary>

- Improve CoverFlow interactivity with track selection, CD click handling, and play/pause functionality.
- Enhance iPod functionality with long press for CoverFlow, Kugou image URL formatting, and song cover art in PIP player.
- Refactor lyrics processing to use streamText for line-by-line streaming and improve soramimi generation.
- Update Apple Menu with new items and improve document icon detection.
- Add support for compressed content in song import/export and improve song metadata handling.
- Enhance media control schemas and refine system state management for karaoke control features.
- Fix various issues related to CoverFlow, iPod, lyrics display, and translation across different browsers and devices.
- Update dependencies, version information, and improve error handling across various components.
- Enhance UI styling and layout adjustments in iPod, Karaoke, and other components for improved user experience.
- Implement desktop update notifications and download links for macOS users.

</details>

---

*This changelog is automatically generated and summarized from git history. Last updated: 2026-03-01*
