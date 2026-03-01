# Changelog

A summary of changes and updates to ryOS, organized by month.

---

## March 2026

- Implement a new API handler for improved endpoint management and security.
- Introduce frontend API clients for auth, rooms, and listen flows.
- Add support for standalone API deployment using Bun.serve.

<details>
<summary>Minor changes (8)</summary>

- Fix infinite re-render loops causing crashes in the Applet Store and Expose mode.
- Optimize store subscriptions and reduce unnecessary re-renders for improved performance.
- Harden API auth boundaries and improve origin handling.
- Update documentation to reflect recent API and feature changes.
- Refresh documentation for application framework, filesystem, audio, UI components, and AI systems.
- Add a quit option to the crash dialog and improve TextEdit open flow.
- Migrate admin and song cache to API client modules.
- Update AGENTS local testing to use Bun API and Vite proxy.

</details>

## February 2026

- Add Winamp integration with webamp, including skins, YouTube seeking, and iPod library loading.
- Implement Spotlight Search as a unified command palette with enhanced styling and Tauri compatibility.
- Enhance cloud backup and restore functionality with increased limit, progress tracking, and UI improvements.
- Introduce a two-tier memory system with daily notes and long-term memories, accessible in the admin panel.
- Add proactive AI greeting for logged-in users with memories.
- Implement display mode selection in Karaoke and iPod components, including new water, mesh gradient, liquid, and warp modes.
- Refactor chat system with improved notifications, pusher integration, and memory handling.

<details>
<summary>Minor changes (10)</summary>

- Improve admin panel UI with detailed import progress, memory views, and user details layout.
- Fix various Winamp issues, including icon theming, playlist layout, and interaction restoration.
- Update Karaoke with new lyrics styles and gradient effects.
- Enhance AmbientBackground component with audio-reactive features and performance optimizations.
- Refactor app routing, event bus, and component styling for better consistency and performance.
- Use abortable fetch for various network requests to improve stability and prevent issues.
- Harden security with SSRF protections, iframe message trust boundaries, and input sanitization.
- Fix mobile layout and styling issues in Spotlight and other components.
- Update translations across multiple languages for improved localization.
- Improve error handling with app and desktop error boundaries and simplified dialogs.

</details>

## January 2026

- Introduce Infinite Mac application with enhanced features, styling, and documentation.
- Implement Listen Together feature for iPod and Karaoke with session management, UI, and API endpoints.
- Add Stickies app with drag/resize support, color localization, and management functionality.
- Refactor API endpoints to Node.js runtime with consolidated middleware and unified authentication.
- Enhance chat functionality with image upload support, aqua styling, and improved message handling.
- Implement comprehensive documentation with architecture diagrams and app-specific guides.
- Improve application performance by extracting logic into hooks and optimizing event listeners.

<details>
<summary>Minor changes (9)</summary>

- Add app launch animations and improve window management.
- Enhance terminal with grep and uptime commands, and improve Vim functionality.
- Update iPod and Karaoke with auto-skip functionality and improved lyrics handling.
- Refactor CoverFlow component with improved styling and animations.
- Improve UI consistency with updated styles for buttons, icons, and themes.
- Fix audio handling in Safari and improve audio context resume.
- Update translations for various languages and improve CJK typography.
- Standardize localStorage keys and improve documentation clarity.
- Fix various bugs related to app functionality, build errors, and UI issues.

</details>

## December 2025

- Implement CoverFlow feature with long-press gesture, menu toggle, play/pause functionality, and CD animation.
- Add Karaoke app, a windowed full-screen iPod player, with enhanced control visibility and lyrics sync features.
- Introduce Japanese furigana and Chinese soramimi pronunciation options for lyrics display, with language-aware spacing and improved formatting.
- Enhance song import and export functionality with content support, including compressed content and soramimi support.
- Implement i18n support with language selection feature and localization across various components.
- Add Admin application with restricted access for admin users, featuring song management, user profiles, and message tables.
- Implement Expose/Mission Control mode for enhanced window management and add screen saver functionality.

<details>
<summary>Minor changes (10)</summary>

- Improve lyrics display with enhanced text shadows, word timing support, and KRC parsing logic.
- Enhance iPod app with Cover Flow album browser, song cover art in PIP player, and YouTube video search.
- Refactor lyrics processing to use streamText for line-by-line streaming and add robust soramimi partial result resilience with auto-resume.
- Update Apple menu with new items and improve document icon detection.
- Enhance song metadata handling for KuGou integration and add support for compressed content in song import/export.
- Fix various issues in CoverFlow, iPod, Karaoke, and lyrics components for improved stability and performance.
- Update dependencies and optimize Vite configuration for improved performance.
- Enhance Dock component with context menu, auto-hide features, and improved drag-and-drop functionality.
- Refactor code for improved maintainability and performance, including migrating to domain-specific stores and streamlining lyrics processing.
- Update version information and enhance localization across multiple dialogs and components.

</details>

## November 2025

- Implement a new Applet Store with AI-powered applet generation and sharing capabilities, including a dedicated viewer and enhanced metadata handling.
- Integrate Google Gemini as the primary AI model for applet generation, with fallback to OpenAI GPT-5, and introduce rate limiting for the applet-ai endpoint.
- Enhance prefetching and caching strategies with versioning to improve app loading speed and offline functionality, including service worker updates and toast notifications.
- Add iPod video playback, translation, and fullscreen controls, including new video entries and lyric support.
- Implement a new PWA (Progressive Web App) with service worker for faster repeat loads and offline support.
- Improve applet management with features like bulk updates, desktop shortcut creation, and trash functionality.
- Enhance the PaintCanvas component with improved selection tools and normalize selection bounds.

<details>
<summary>Minor changes (10)</summary>

- Refactor Chats with Ryo help content and descriptions for improved clarity.
- Fix various issues related to applet loading, sharing, and display across different components.
- Update versioning details and build configurations for consistent version management.
- Improve toast styling and positioning for better user experience across different themes and devices.
- Enhance IconButton with loading state and improve app instance management.
- Add analytics tracking for applet viewer and key events.
- Fix CORS issues and authentication race conditions for improved security.
- Refactor iPod controls into a single `ipodControl` tool for easier management.
- Improve logging and error handling in applet-ai for better debugging.
- Update AppStore component styles and section titles for improved user experience.

</details>

## October 2025

- Implement new sharing and saving functionality for Applets, including toast notifications.
- Enhance Applet Viewer with improved content handling, user interaction, and window management.
- Refactor ryOS chat and file management functionality for improved performance and maintainability.
- Improve AI prompt instructions for app generation and Chinese responses, adding core priority instructions.
- Enhance HTML generation for ryOS Applets, including icon support and updated design guidelines.

<details>
<summary>Minor changes (7)</summary>

- Fix an issue where the login message was visible when the user was logged in.
- Update app icons and file handling for Applets.
- Refine font handling for the macOSX theme in the Applet Viewer and HTML preview.
- Adjust font size and layout for emoji rendering in the MacDock component.
- Update app filtering and enhance file synchronization.
- Add new songs to ipod-videos.
- Add watch option to Vite server configuration to ignore terminal files.

</details>

## September 2025

- Add lyrics translation persistence and force refresh functionality.
- Switch title parsing from OpenAI to Google Gemini and refactor AI prompt handling.
- Enhance AI chat hook with automatic message handling and improved logging.
- Update default AI model to Claude 4.5 and later to GPT-5.
- Add new videos to ipod-videos including JoyRide, Asics by Fredi Casso, and BIGBANG FOREVER WITH U.

<details>
<summary>Minor changes (9)</summary>

- Fix display of active language in translation dropdown and lyric offset for CORTIS FaSHioN.
- Refactor lyrics display delay and use persistent translation language preference.
- Increase lyrics translation timeout to 120 seconds.
- Add more prefixes to skip in LRC parsing and recording engineer/digital editing to skip prefixes.
- Remove rate limiting from lyrics translation API.
- Upgrade zod dependency to satisfy AI SDK peer dependencies.
- Prioritize English names in metadata parsing.
- Enhance TextEdit functionality with fallback mechanism for instance management.
- Clean up vite.config.ts and vercel.json configuration.

</details>

## August 2025

- Updated the default AI model to GPT-4.1.
- Implemented a macOS-style Dock with app icons, animations, and interactions, including dynamic sizing, magnification, and focus/launch logic.
- Enhanced chat room functionality with improved presence tracking, profanity filtering, message handling, and collapsible sections.
- Refactored TextEditAppComponent with new editor context, hooks, toolbar features, and improved dialog handling.
- Implemented multi-token support for authentication and added rate limiting for user creation.

<details>
<summary>Minor changes (9)</summary>

- Added new music videos to the iPod videos collection.
- Improved Finder UI with fixes for icon alignment, layout consistency, and responsiveness.
- Enhanced security by adding sandbox attributes and updating CSP directives for iframes.
- Updated Dock component to use app names from appRegistry and allow vertical overflow on mobile.
- Refactored terminal component to extract commands, utils, and components.
- Enforced password requirement for user creation across API and client-side.
- Improved theme support across various components, including SynthAppComponent, VideosAppComponent, and iframe-check API.
- Implemented CORS support and rate limiting across multiple API endpoints.
- Updated system prompt and chat instructions for improved user interaction in chat rooms.

</details>

## July 2025

- Added an emoji aquarium feature to chat messages.
- Implemented server-side Ryo reply generation and updated chat handling.
- Enhanced iPod video playback with fullscreen controls, lyrics display, and improved mobile support.
- Improved theme support across the application with updates to macOS, Windows 98, and Windows XP themes.
- Integrated link previews into chat messages with custom handling for YouTube and web links.
- Switched from OpenAI to Google Gemini for lyrics translation.

<details>
<summary>Minor changes (10)</summary>

- Added chat burst rate limiting for public rooms.
- Enhanced username handling in Redis operations and validation for chat rooms.
- Refactored chat message component for improved scrollbar handling and theme support.
- Improved mobile touch interactions across various components to prevent unwanted gestures.
- Updated default wallpapers and enhanced wallpaper routing and caching.
- Refactored app instance management for improved consistency and performance.
- Updated various app icons and assets for improved visual quality and theme consistency.
- Enhanced button styling and layout across multiple components for improved theme integration.
- Fixed mobile Safari playback issues in fullscreen video player.
- Updated video store with new default videos and music metadata parser instructions.

</details>

## June 2025

- Implement multi-token authentication with improved validation and token-to-username mapping.
- Enhance chat room functionality with private room support, improved room management, and user presence tracking.
- Refactor chat API for improved system message handling, caching, and permission checks.
- Implement token refresh functionality and enhance authentication flow in chat API with improved security.
- Add right-click context menus to Desktop and Finder with data-driven menu items.

<details>
<summary>Minor changes (9)</summary>

- Improve chat user experience with enhanced error handling, tooltips, and clearer prompts.
- Refactor chat components for improved layout, consistency, and user interface.
- Update chat room display with prioritized private rooms and consistent name formatting.
- Enhance CreateRoomDialog with user selection badges and improved input handling.
- Refactor Pusher event broadcasting in chat rooms for improved performance and reliability.
- Extend user token and expiration time, and implement token TTL migration.
- Update iPod videos with new content and adjustments.
- Refactor rate limiting and password management in chat components.
- Update dependencies and refactor TypeScript type assertions.

</details>

## May 2025

- Implement multi-instance app management and window order tracking for improved multitasking.
- Enhance chat functionality with AI-generated HTML support, improved message handling, and new tool integrations.
- Improve iPod app with full-screen lyrics display, enhanced playback controls, and library management features.
- Refactor core components to utilize Zustand for state management, removing local storage dependencies and improving performance.
- Enhance file management in Finder with drag-and-drop support and improved file type handling.
- Integrate geolocation and user local time information into the chat system state for enhanced context awareness.

<details>
<summary>Minor changes (10)</summary>

- Update default AI model to Claude 3.7 and refine AI prompts for improved chat response quality.
- Enhance Internet Explorer with direct passthrough URL handling and updated favorites.
- Improve audio context management and add sound effects for volume changes and UI interactions.
- Refactor chat room API for consistency and clarity, adding detailed room fetching and user list functionality.
- Update default voice settings and ElevenLabs voice ID in speech API configuration for improved performance.
- Fix scrollbar calculations in IpodScreen and enhance touch interaction handling in IpodWheel component.
- Update lyrics offsets and add new video entries to the iPod store for improved synchronization and content variety.
- Enhance ControlPanelsAppComponent with improved error handling, backup functionality, and volume mute toggle.
- Refactor TextEditAppComponent to enhance file saving and autosave functionality.
- Improve mobile responsiveness in WindowFrame component and enhance swipe gesture functionality in IpodAppComponent.

</details>

## April 2025

- Enhanced the Internet Explorer app with a Time Machine feature, including improved navigation, animations, and mobile responsiveness.
- Implemented AI-powered content generation and caching for the Internet Explorer app, including improved prompts, error handling, and model selection.
- Refactored the Internet Explorer app's state management using Zustand for improved performance and maintainability.
- Improved shared URL handling and share dialog functionality in the Internet Explorer app.
- Enhanced the Internet Explorer app with terminal sounds and a UI toggle for enabling/disabling them.

<details>
<summary>Minor changes (9)</summary>

- Updated the Internet Explorer app's UI with improved loading states, debug visibility, and font consistency.
- Enhanced the iframe-check API with Wayback Machine integration and improved error handling.
- Updated default favorites in the Internet Explorer app and storage with new and reordered entries.
- Refactored various app components (Chats, Videos, Ipod) to use Zustand for state management.
- Improved video management by relocating default videos to useIpodStore.ts and adding new video entries.
- Updated dependencies and enhanced TypeScript configuration for improved stability and performance.
- Added CORS support to API endpoints and improved error handling throughout the application.
- Enhanced HTML sanitization in HtmlPreview component for improved security and cleanliness.
- Updated default AI model to gpt-4.1 and enhanced model selection in ControlPanelsAppComponent.

</details>

## March 2025

- Implement a new Synth app with preset management, 3D waveform visualization, and mobile responsiveness.
- Add a Photo Booth app with camera selection, filters, stream sharing, and file system integration.
- Enhance the Terminal app with AI chat mode, command history, app control handling, and improved UI.
- Implement HTML preview feature in Terminal app with streaming support, copy/save functionality, and improved styling.
- Overhaul chat functionality with Pusher integration for real-time updates, profanity filtering, and improved message handling.
- Introduce video wallpaper support with loading state management and improved video playback interaction.
- Refactor the iPod app with dynamic video playlist loading, touch event handling, and enhanced scrolling text.

<details>
<summary>Minor changes (10)</summary>

- Improve chat API by updating the default model, optimizing runtime configuration, and enhancing error handling.
- Enhance the HtmlPreview component with draggable controls, improved scaling, and better animation transitions.
- Update the Terminal app with new commands, standardized output messages, and improved visual indicators.
- Refactor IndexedDB handling across components for improved data management and reliability.
- Enhance vibration feedback in various components for improved user experience.
- Update app icons and meta tags for improved visual quality and SEO.
- Add sound effects for window state changes and terminal interactions.
- Refine code generation instructions in chat.ts for improved clarity and responsiveness.
- Improve mobile responsiveness and accessibility across various components.
- Update dependencies and clean up unused variables for improved performance and maintainability.

</details>

---

*This changelog is automatically generated and summarized from git history. Last updated: 2026-03-01*
