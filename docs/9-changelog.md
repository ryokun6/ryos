# Changelog

A summary of changes and updates to ryOS, organized by month.

---

## February 2026

- Add Spotlight Search, a unified command palette for ryOS, with enhanced functionality, styling, and Tauri compatibility.
- Implement a two-tier memory system with daily notes and long-term memories, including admin panel updates for management.
- Introduce proactive AI greetings for logged-in users, including user-specific greetings and typing animations.
- Enhance Karaoke and iPod components with a Display menu featuring new display modes like water shader, mesh gradient, liquid, and warp.
- Improve chat functionality with background notifications, pusher channel refactoring, and robust error handling.
- Refactor AmbientBackground component with audio-reactive features and performance optimizations.

<details>
<summary>Minor changes (9)</summary>

- Fix various styling issues in Spotlight, System 7 themes, and mobile layouts.
- Update Gemini image model and AI prompts for improved image generation.
- Improve Photo Booth functionality with fixes for stale captures and image exporting.
- Enhance security by hardening tool call handling, iframe message trust boundaries, and SSRF protections.
- Refactor various components and hooks to improve performance and reduce dependencies.
- Add new lyrics styles to Karaoke, including Serif Red, Gold Glow, and Neon Pink.
- Improve admin panel UI with unified styling and user memories view.
- Use abortable fetch for numerous network requests to improve stability and prevent memory leaks.
- Address various linting warnings and dependency issues.

</details>

## January 2026

- Add Listen Together feature for collaborative music listening in iPod and Karaoke, including session management, UI, and Pusher integration.
- Implement Stickies app with drag/resize support, color localization, and AI integration.
- Integrate Infinite Mac application with scaling, screenshot functionality, dynamic title, and presets.
- Enhance chat functionality with image upload support, improved styling, and AI-powered memory extraction.
- Refactor API endpoints to Node.js runtime for improved performance and security, and modularize REST API structure with unified authentication.
- Overhaul documentation with comprehensive guides, improved navigation, and System 7-inspired styling.

<details>
<summary>Minor changes (10)</summary>

- Improve Infinite Mac tool call messages and add double-click action for opening files/folders.
- Enhance application launch animations and window management.
- Update iPod and Karaoke apps with auto-skip functionality and improved lyrics handling.
- Refactor various components to use shared event listeners and improve code organization.
- Enhance UI styling across multiple components, including macOS aqua theme updates and icon replacements.
- Fix audio handling in Safari and improve reliability after backgrounding.
- Update translations for multiple languages and improve CJK typography.
- Add new commands and enhance functionality in the terminal application.
- Improve performance and stability of various applets, including Synth, Virtual PC, and Internet Explorer.
- Update dependencies and configuration files for improved development and deployment.

</details>

## December 2025

- Implement the Karaoke app, a windowed full-screen iPod player with lyrics synchronization and enhanced controls.
- Introduce Cover Flow album browser in iPod app with long-press gesture and menu toggle.
- Enhance lyrics processing with Japanese furigana, Chinese soramimi, and improved translation support.
- Add a unified song API endpoint with Redis caching for song metadata, improving performance and data management.
- Implement Expose/Mission Control mode for enhanced window management and add auto-hide dock for phone.
- Introduce an Admin application with restricted access for managing users, messages, and songs.
- Add screen saver functionality with framer-motion animations and i18n support.

<details>
<summary>Minor changes (10)</summary>

- Improve CoverFlow component with enhanced interactivity, styling, and iPod mode.
- Enhance iPod app with PIP player, YouTube search integration, and improved menu navigation.
- Refactor lyrics display in iPod and Karaoke components with improved text shadows and monotonic time handling.
- Update the Apple menu with new items and improved functionality.
- Enhance localization support across various components with new languages and improved translations.
- Fix various UI issues, including padding, font rendering, and layout inconsistencies in different components.
- Improve error handling and caching logic for lyrics and translations.
- Update dependencies and optimize Vite configuration for improved performance.
- Enhance audio transcription hook with adaptive silence detection and improved volume analysis.
- Implement desktop update notifications and download links for macOS users.

</details>

## November 2025

- Implement App Store with AI-powered applet generation, sharing, and management.
- Enhance iPod functionality with video playback, lyrics translation, and fullscreen controls.
- Improve applet viewer with update checks, authentication, and enhanced launch experience.
- Introduce build versioning and prefetching enhancements for faster loading and updates.
- Implement PWA with service worker for faster repeat loads and offline support.
- Refactor AI chat functionality with improved tool output and applet integration.
- Enhance desktop and Finder with improved app shortcut management and Trash functionality.

<details>
<summary>Minor changes (9)</summary>

- Add new AI models (Gemini, GPT-5) and improve AI prompt instructions.
- Update UI components with improved styling, animations, and toast notifications.
- Fix various bugs related to applet loading, sharing, and display.
- Refactor code for improved performance, maintainability, and security.
- Update dependencies and build configurations for Vercel deployment.
- Enhance audio control in useSound and useWindowManager hooks.
- Add analytics tracking for applet viewer and key events.
- Improve CORS handling for local network and Vercel preview deployments.
- Update version information and app metadata across components.

</details>

## October 2025

- Implement enhanced applet viewer with sharing, import/export, and improved content handling.
- Enhance ryOS applet functionality with new HTML generation, saving, and icon support.
- Refactor applet design guidelines for enhanced clarity and responsiveness.
- Upgrade Zod library from v3 to v4.

<details>
<summary>Minor changes (9)</summary>

- Add toast notifications for applet saves.
- Improve AI prompt instructions for app generation and Chinese responses.
- Enhance MacDock component with emoji scaling and layout adjustments.
- Refine font handling for macOSX theme in applet viewer and HTML preview.
- Update app icons and file handling for applets.
- Fix login message visibility when user is logged in.
- Add watch option to Vite server configuration to ignore terminal files.
- Update app filtering and enhance file synchronization.
- Add new songs to ipod-videos.

</details>

## September 2025

- Add lyrics translation request persistence and language preference.
- Switch title parsing from OpenAI to Google Gemini and refactor AI prompt handling.
- Set default AI model to Claude 4.5, then updated to GPT-5.
- Enhance AI chat integration with automatic message handling and improved logging.
- Improve TextEdit functionality with instance management fallback.

<details>
<summary>Minor changes (9)</summary>

- Add new videos to ipod-videos.
- Add more prefixes to skip in LRC parsing.
- Remove rate limiting from lyrics translation API.
- Fix display of active language in translation dropdown.
- Update lyric offset and add empty album for CORTIS FaSHioN.
- Adjust alternating lyrics display delay and increase lyrics translation timeout.
- Upgrade zod dependency to satisfy AI SDK requirements.
- Prioritize English names in metadata parsing.
- Add recording engineer and digital editing to skip prefixes.

</details>

## August 2025

- Updated the default AI model to GPT-4.1.
- Implemented a macOS-style Dock with app icons, animations, and interactions, including dynamic sizing and improved performance.
- Enhanced chat room functionality with Redis-based presence tracking, improved profanity filtering, collapsible sections, and message rendering limits.
- Refactored TextEditAppComponent with new editor context, hooks, toolbar features, and improved dialog handling.
- Implemented multi-token support for authentication, enhancing security and flexibility.

<details>
<summary>Minor changes (9)</summary>

- Added several new music videos to the iPod videos collection.
- Improved Finder UI with fixes to icon alignment, file list layout, and responsiveness.
- Enhanced Dock component with mobile/touch support, dynamic app focus/launch logic, and updated app name display.
- Updated iframe sandbox to allow forms and popups and added security enhancements.
- Refactored terminal component for improved structure and functionality.
- Enhanced app components to conditionally render the menu bar based on foreground state and improved window management.
- Implemented CORS support and rate limiting across multiple API endpoints.
- Fixed aquarium token detection and handling in chat messages.
- Updated themes and styles for improved consistency and visual appeal across various components.

</details>

## July 2025

- Add emoji aquarium feature to chat messages.
- Implement server-side Ryo reply generation and update chat handling.
- Enhance iPod video playback with fullscreen controls, lyrics display, and improved mobile support.
- Introduce link previews in chat messages with custom handling for YouTube and web links.
- Implement new themes (macOS, Windows 98, Windows XP) with extensive styling updates across various components.
- Refactor application architecture for improved instance management, theme support, and performance.

<details>
<summary>Minor changes (10)</summary>

- Add rate limiting for user creation and chat bursts to prevent abuse.
- Update default AI model to Claude 4 and add Gemini 2.5 flash model for lyrics translation.
- Improve mobile touch interactions across various components.
- Fix mobile Safari playback issues in fullscreen video player.
- Update video store with new default videos and improve shuffle playback logic.
- Enhance username validation and handling in Redis operations.
- Refactor chat message component with scrollbar width handling.
- Update application icons and wallpaper defaults.
- Improve fullscreen controls auto-hide behavior and interaction.
- Update TerminalAppComponent to use Monaco font and adjust sound playback logic.

</details>

## June 2025

- Implement multi-token authentication with user-specific token management and improved validation in the chat API.
- Enhance chat room functionality with private room support, user presence tracking, and improved room management.
- Refactor chat API for improved system message handling, caching, and Pusher event broadcasting.
- Implement password management features in the chat application with login, logout, and password reset capabilities.
- Add right-click context menus to Desktop and Finder with data-driven menu items for sorting and file management.
- Implement token refresh functionality and enhance authentication flow in chat API with improved security.

<details>
<summary>Minor changes (9)</summary>

- Improve chat room creation with enhanced UI, user selection, and input validation.
- Update iPod application with new videos, clickwheel sound, and dependency updates.
- Refactor chat components for improved layout, scrolling behavior, and user experience.
- Enhance error handling and authentication messages across chat components.
- Update dependencies and refactor TypeScript type assertions.
- Extend token grace period and user token expiration time.
- Fix Safari emoji rendering by conditionally overriding SerenityOS-Emoji font in CSS.
- Update Redis cache prefix for lyric translations.
- Improve file metadata restoration with existing UUID preservation.

</details>

## May 2025

- Enhanced chat functionality with AI-powered tools, improved message handling, markdown support, and new commands for controlling apps like iPod and TextEdit.
- Improved iPod app with new features including fullscreen lyrics display, swipe gesture navigation, library import/export, and enhanced track management.
- Implemented multi-instance window management for Finder and other apps, allowing users to run multiple instances simultaneously.
- Enhanced text editing capabilities with markdown conversion, search and replace functionality, and improved file handling.
- Refactored application state management to use Zustand store, improving performance and removing local storage dependencies.
- Improved Internet Explorer with direct passthrough URL handling, updated favorites, and enhanced navigation controls.
- Enhanced chat system with username management, profanity filter, and improved room handling.

<details>
<summary>Minor changes (10)</summary>

- Updated AI prompts and instructions for improved chat interactions and tool usage.
- Improved audio handling with volume controls, mute functionality, and enhanced audio context management.
- Enhanced UI components with improved layout consistency, responsiveness, and accessibility.
- Updated default videos and metadata in the iPod app.
- Improved file management in Finder with drag-and-drop support and enhanced file type handling.
- Fixed various bugs related to speech synthesis, audio playback, and UI rendering.
- Updated dependencies for improved performance and security.
- Enhanced error handling and logging across various components.
- Improved boot screen functionality with user feedback and default messages.
- Added sound and vibration feedback for swipe navigation.

</details>

## April 2025

- Revamped Internet Explorer app with AI-powered content generation, caching, and improved navigation.
- Enhanced Time Machine View with improved animations, layout, mobile responsiveness, and shader effects.
- Refactored multiple app components (TextEdit, Chats, InternetExplorer, TimeMachineView, Ipod, Videos, AppManager) to use Zustand for state management.
- Improved chat functionality with sidebar preferences, toast notifications, and AI-generated HTML support.
- Integrated terminal sounds feature into multiple app components with UI toggle.
- Enhanced AI model integration and updated default AI model to gpt-4.1.
- Implemented shared URL handling and share dialog in Internet Explorer app.

<details>
<summary>Minor changes (9)</summary>

- Updated default favorites in Internet Explorer with new and reordered entries.
- Improved error handling and debugging capabilities in Internet Explorer app.
- Enhanced font mapping and added Jacquard font support.
- Updated video titles and added new entries to default videos.
- Added CORS support to API endpoints.
- Refined AI generation prompts and deliverable instructions.
- Updated dependencies and enhanced iframe-check functionality.
- Added auto-proxy domain handling and reset favorites functionality in Internet Explorer components.
- Updated help items in Chats and Photo Booth apps for clarity and new features.

</details>

## March 2025

- Implement a new AI-powered chat assistant with HTML preview capabilities in the terminal, including streaming support, code generation instructions, and enhanced user interface elements.
- Introduce a Synth app with piano presets, configurable key labels, 3D waveform visualization, and mobile responsiveness.
- Add a Photo Booth app with camera selection, filter support, file system integration, and enhanced iOS compatibility.
- Enhance the iPod app with dynamic video playlist loading, animated scrolling text, touch event handling, and improved layout.
- Implement real-time chat updates using Pusher and add profanity filtering to chat rooms and user creation.
- Refactor the chat system with improved message handling, caching, room management, and dynamic window titles.
- Add IndexedDB backup and restore functionality for improved data management across various app components.

<details>
<summary>Minor changes (10)</summary>

- Improve TerminalAppComponent with Vim editor functionality, new commands (echo, whoami, date), and enhanced command history management.
- Enhance HtmlPreview component with draggable controls, toolbar collapse functionality, and improved scaling and positioning logic.
- Update chat API to use Node.js runtime, improve request handling, and enhance error handling with logging improvements.
- Refactor vibration handling in IpodAppComponent and useChatSynth for improved performance and user feedback.
- Update video wallpaper links and implement loading state management for video wallpapers in WallpaperPicker and Desktop components.
- Enhance TerminalAppComponent with urgent message handling, markdown parsing, and animated terminal output.
- Improve IpodAppComponent styles for visual consistency and add backlight functionality with user activity tracking.
- Update dependencies and clean up unused variables across various components.
- Add mobile responsiveness to HtmlPreview component and sound effects for window state changes in WindowFrame and HtmlPreview components.
- Fix various styling and layout issues in multiple components for improved visual consistency and user experience.

</details>

## February 2025

- Add message history navigation and copy functionality to the Chat app.
- Enhance TextEdit with advanced markup parsing, rendering, and document editing capabilities, including markdown support and context integration with the Chat app.
- Implement advanced window maximization, touch interactions, and mobile swipe navigation for improved user experience.
- Migrate the file system to IndexedDB and enhance storage management.
- Add fullscreen functionality to the Videos app and advanced image filters to the Paint app.

<details>
<summary>Minor changes (11)</summary>

- Improve mobile touch interactions in the WindowFrame and dialog pointer events.
- Update the default games list and PC emulator title.
- Refine TextEdit markup line description generation and formatting.
- Optimize TextEdit context processing for mobile and desktop performance.
- Update chat nudge response to include system context and improve chat clearing mechanism.
- Refactor PaintCanvas event handling and history saving.
- Update GitHub repository references across multiple apps.
- Add a new video to the default videos list.
- Add shimmer loading effect and optimize DOSBox rendering.
- Enhance file system formatting and add mouse sensitivity control.
- Update UI text and global font size.

</details>

---

*This changelog is automatically generated and summarized from git history. Last updated: 2026-02-13*
