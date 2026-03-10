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

## January 2026

- Introduce Listen Together feature for shared listening experiences in iPod and Karaoke, including session management, invite dialogs, and reaction overlays.
- Implement Infinite Mac application with scaling options, screenshot functionality, dynamic title, and improved window management.
- Add Stickies application with draggable notes, color localization, and mobile touch support.
- Enhance chat functionality with image upload support, improved styling, and AI-powered memory extraction.
- Refactor API endpoints to Node.js runtime with consolidated middleware and unified authentication.
- Migrate to AI SDK 6.0 and implement structured output for song title parsing.

<details>
<summary>Minor changes (10)</summary>

- Improve application launch animations and styling for a smoother user experience.
- Enhance the CoverFlow component with improved styling, perspective calculations, and track playback.
- Update macOS theme with aqua styling for buttons, progress bars, and other UI elements.
- Refactor various application logic into reusable hooks for better code organization.
- Update documentation with comprehensive guides for ryOS applications and API endpoints.
- Fix audio playback issues in Safari and improve audio context handling.
- Standardize button attributes and icon sizes across the application.
- Improve terminal functionality with grep and uptime commands, and enhance Vim with search and visual modes.
- Update translations for various languages to improve clarity and consistency.
- Enhance error handling and logging throughout the application.

</details>

## December 2025

- Implement CoverFlow feature with interactive CD animation and play/pause functionality.
- Introduce karaoke app with full-screen iPod player and lyrics synchronization features.
- Add Japanese furigana and Chinese soramimi pronunciation options for lyrics display.
- Enhance song metadata handling with KuGou integration and Redis caching.
- Implement i18n support with language selection feature across the application.
- Add Admin application with restricted access for managing users and songs.
- Implement Expose/Mission Control mode for enhanced window management and add screen saver functionality.

<details>
<summary>Minor changes (10)</summary>

- Fix issues with lyrics translation, furigana, and soramimi processing.
- Improve iPod and Karaoke components with enhanced touch handling and playback stability.
- Update Apple menu with new items and improved functionality.
- Enhance lyrics display with improved text shadows, word timing, and font customization options.
- Refactor lyrics processing and API endpoints for improved performance and maintainability.
- Update dependencies and optimize Vite configuration for better performance.
- Add support for compressed content in song import/export.
- Improve error handling and timeout management in AI generation processes.
- Enhance localization support across various components and dialogs.
- Fix UI layout issues in iPod, Karaoke, and other components.

</details>

## November 2025

- Implement a new App Store with AI-powered applet generation, sharing, and management features.
- Integrate Google Gemini as the primary AI model for applet generation, with fallback to OpenAI.
- Enhance prefetching and caching mechanisms for improved performance and offline support, including service worker updates and version handling.
- Introduce iPod video playback, translation, and fullscreen controls, including new video entries.
- Implement PWA (Progressive Web App) support with a service worker for faster loading and offline capabilities.
- Add new tools and refactor existing ones for AI chat functionality, including file system access and applet management.
- Improve desktop and Finder app shortcut management, including theme-conditional visibility and trash functionality.

<details>
<summary>Minor changes (9)</summary>

- Fix various issues related to applet loading, sharing, and display.
- Update toast notifications for improved user feedback during prefetching and version updates.
- Enhance the PaintCanvas component with improved selection tools.
- Refactor code for improved clarity, maintainability, and performance in various components.
- Add analytics tracking for applet viewer and key events.
- Update dependencies and build configurations for improved stability and deployment.
- Improve error handling and logging in applet-ai.
- Enhance rate limiting and authentication handling in applet-ai and AppStoreFeed.
- Refactor Chats with Ryo help content and descriptions.

</details>

## October 2025

- Implement enhanced applet viewer with new sharing, import/export, and content handling features.
- Introduce applet saving functionality and HTML generation for ryOS Applets.
- Refactor applet design guidelines for enhanced clarity and responsiveness.
- Upgrade Zod library from v3 to v4.

<details>
<summary>Minor changes (8)</summary>

- Add icon support and toast notifications for generated HTML applets.
- Enhance MacDock component with emoji scaling and layout adjustments.
- Improve AI prompt instructions for app generation and Chinese responses.
- Refine font handling for macOSX theme in applet viewer and HTML preview.
- Update app icons and file handling for applets.
- Add watch option to Vite server configuration to ignore terminal files.
- Fix issue where login message was displayed when user was already logged in.
- Add new songs to ipod-videos.

</details>

## September 2025

- Add lyrics translation persistence and force refresh functionality.
- Switch title parsing from OpenAI to Google Gemini and use a messages array for AI prompts.
- Enhance AI chat integration with automatic message handling and improved logging.
- Update default AI model to Claude 4.5 and later GPT-5.
- Improve TextEdit functionality with a fallback mechanism for instance management.

<details>
<summary>Minor changes (8)</summary>

- Fix issues with the translation dropdown and lyric offset for specific songs.
- Update dependencies, including upgrading zod to satisfy AI SDK requirements.
- Refactor lyrics display delay and use persistent translation language preference.
- Increase lyrics translation timeout to 120 seconds.
- Add new videos to ipod-videos and update song details.
- Add more prefixes to skip in LRC parsing and recording engineer/digital editing to skip prefixes.
- Remove rate limiting from lyrics translation API.
- Clean up vite.config.ts and vercel.json configuration.

</details>

## August 2025

- Updated the default AI model to GPT-4.1.
- Implemented a macOS-style Dock with app icons, interactions, and dynamic animations.
- Enhanced chat room functionality with improved presence tracking, profanity filtering, and collapsible sections.
- Refactored TextEditAppComponent with new editor context, hooks, toolbar features, and improved dialog handling.
- Improved Finder UI with responsive layout, consistent icon styling, and remembered view types.
- Enhanced authentication with Redis-based rate limiting and multi-token support.

<details>
<summary>Minor changes (10)</summary>

- Added several new music videos by Crush and ILLIT to the iPod videos collection.
- Updated iframe sandbox security with enhanced permissions.
- Improved Dock component with mobile/touch support, dynamic app focus/launch logic, and macOS X theme integration.
- Enhanced chat room messages with aquarium emoji support and improved rendering.
- Implemented CORS and rate limiting across multiple API endpoints.
- Updated themes and styling for improved consistency across various components and macOS themes.
- Enforced password requirements for user creation.
- Refactored terminal component for improved functionality and organization.
- Added 404 page redirect to homepage.
- Reordered and restored previously removed video entries.

</details>

## July 2025

- Added an emoji aquarium feature to chat messages.
- Implemented server-side Ryo reply generation and updated chat handling.
- Enhanced the iPod app with fullscreen lyrics controls, improved UI, and added NewJeans videos.
- Improved theme support across the application, including macOS, Windows 98, and Windows XP themes, with updated styling and layout adjustments for various components.
- Integrated link previews into chats with custom handling for YouTube and web links.
- Refactored app and instance management for improved performance and consistency.

<details>
<summary>Minor changes (10)</summary>

- Added chat burst rate limiting for public rooms and enhanced username handling in Redis.
- Fixed mobile Safari playback issues and improved fullscreen video player interactions.
- Updated default wallpapers and improved wallpaper routing and caching.
- Enhanced chat message component with scrollbar width handling and improved message handling.
- Improved mobile touch interactions and prevented unwanted gestures.
- Switched from OpenAI to Google Gemini for lyrics translation.
- Refactored urgent message animations in ChatMessages component.
- Updated TerminalAppComponent to use Monaco font and adjust sound playback logic.
- Enhanced token management and verification process.
- Improved icon caching and versioning strategy.

</details>

## June 2025

- Implement multi-token authentication with improved validation and user mapping.
- Enhance chat rooms with private room support, user presence tracking, and improved room management.
- Refactor chat API for improved system message handling, caching, and Pusher event broadcasting.
- Improve chat user experience with enhanced error handling, updated dialogs, and better layout consistency.
- Implement password management features in the chat application.
- Add right-click context menus to Desktop and Finder with data-driven menu items.

<details>
<summary>Minor changes (10)</summary>

- Add user-specific token management in chat API and AI chat requests.
- Update rate limiting and input validation for chat rooms.
- Extend user token expiration time and implement token refresh functionality.
- Refactor authentication handling to prioritize headers and improve logging.
- Update iPod app with new videos, clickwheel sound, and volume settings adjustments.
- Improve file metadata restoration with existing UUID preservation.
- Fix Safari emoji rendering and update SpeechHighlight extension.
- Refactor Redis key retrieval to use SCAN for improved performance.
- Update dependencies and refactor TypeScript type assertions.
- Add login and logout commands and improve related UI components.

</details>

## May 2025

- Implement multi-instance support for apps like Finder and Terminal, enhancing app management and window ordering.
- Enhance chat functionality with AI-generated HTML support, improved message handling, and new tool integrations for iPod and TextEdit control.
- Improve iPod app with full-screen lyrics display, track navigation via swipe gestures, and enhanced library management including import/export functionality.
- Refactor core components to utilize Zustand for state management, removing local storage dependencies and improving performance across the application.
- Enhance text editing capabilities with markdown conversion, search/replace functionality, and improved file handling.
- Implement new chat features including user mentions, online status, message deletion, and improved room management.

<details>
<summary>Minor changes (10)</summary>

- Update iPod app with new video entries, lyric offset adjustments, and improved playback synchronization.
- Enhance chat UI with improved layout consistency, sound effects for interactions, and copy message functionality.
- Improve Internet Explorer app with direct passthrough URL handling, updated favorites, and enhanced navigation controls.
- Refactor audio synthesis and sound handling for improved performance and volume control management.
- Fix various bugs related to chat message display, audio context management, and file handling.
- Update AI prompts and instructions for improved chat response behavior and tool usage.
- Enhance Control Panels with volume mute toggle functionality and improved UI for sound settings.
- Improve mobile responsiveness in various components, including WindowFrame and ChatsAppComponent.
- Add new tool call for creating a blank document in TextEdit
- Implement Redis caching for lyrics and translation requests

</details>

## April 2025

- Implement the Time Machine feature in the Internet Explorer app, allowing users to navigate through past and future web designs with enhanced animations, layouts, and mobile responsiveness.
- Enhance the Internet Explorer app with AI-powered content generation, caching, and improved navigation, including support for shared URLs and Wayback Machine integration.
- Improve the Internet Explorer app's user experience with terminal sounds, a debug mode, a foreground overlay, and dynamic title management.
- Refactor the Internet Explorer app's state management using Zustand for improved performance and maintainability.
- Update the AI model to gpt-4.1 and enhance AI generation prompts for improved content creation.

<details>
<summary>Minor changes (10)</summary>

- Update the Internet Explorer app's menu bar with new 'Share App...' functionality and reordered menu items.
- Improve video management by adding new default videos and updating existing titles and artist names.
- Enhance font mapping and add Jacquard font support.
- Update default favorites in the Internet Explorer store with new and reordered entries.
- Refine HTML sanitization in the HtmlPreview component for improved security and cleanliness.
- Improve error handling and logging in the Internet Explorer app and iframe-check API.
- Update dependencies and enhance TypeScript configuration for improved project stability.
- Implement CORS support in API endpoints.
- Add browser headers and pixelated rendering for images in the iframe-check API.
- Refactor various components (Chats, Videos, Ipod) to use Zustand for state management.

</details>

## March 2025

- Add a new Synth app with preset management, 3D waveform visualization, and mobile responsiveness.
- Implement HTML preview feature in TerminalAppComponent with streaming support, save to disk, and copy to clipboard functionality.
- Enhance chat functionality with username management, message polling, profanity filtering, and real-time updates via Pusher.
- Improve iPod app with video playback, dynamic menu items, responsive scaling, and theme management.
- Add Photo Booth app with camera selection, filter support, file system integration, and enhanced iOS compatibility.
- Refactor chat components and API for improved performance, error handling, and code clarity, including model selection and response formatting.

<details>
<summary>Minor changes (10)</summary>

- Enhance TerminalAppComponent with Vim editor functionality, new commands (echo, whoami, date), and improved command history navigation.
- Improve IpodAppComponent with touch event handling, animated text scrolling, and dynamic video playlist loading.
- Update chat generation instructions for improved clarity on UI element sizing, container wrapping, and responsive design.
- Refactor HtmlPreview component for improved scaling, positioning, and animation logic during streaming.
- Enhance Desktop and useWallpaper components to improve video wallpaper handling and loading state management.
- Add IndexedDB backup and restore functionality in ControlPanelsAppComponent for improved data management.
- Implement Blob content handling in Terminal, TextEdit, finder, and paint components for improved file management.
- Update dependencies and clean up unused variables across various components.
- Improve sound effects integration in TerminalAppComponent, HtmlPreview, and ChatMessages components.
- Refactor vibration handling in IpodAppComponent and ChatMessages for improved user feedback.

</details>

---

*This changelog is automatically generated and summarized from git history. Last updated: 2026-03-10*
