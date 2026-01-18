# Changelog

A summary of changes and updates to ryOS, organized by month.

---

## January 2026

- Restructured API with modular REST design, unified auth middleware, and consolidated imports.
- Migrated to Vercel AI SDK 6.0 with structured outputs for song title parsing and normalized tool inputs.
- Added image upload and display support in Chats app with AI image analysis capability.
- Introduced reusable effect hooks architecture: useEventListener, useLatestRef, useInterval, useTimeout, and useResizeObserver.
- Added CoverFlow album browser to Karaoke app with long-press gestures, responsive sizing, and pan navigation.
- Enhanced Apple Menu with Recent Items submenu, System Preferences, and login/logout options.

<details>
<summary>Minor changes (14)</summary>

- Restructured documentation with hierarchical DeepWiki-style navigation and clean URLs.
- Enhanced documentation generation with skip and force options.
- Added a 'View Docs' button to the Help Dialog and updated IE bookmarks linking to app-specific documentation.
- Implemented theme-aware boot screens with official Windows logos and System 7 hello.svg fix.
- Refactored multiple components to use shared event listener hooks for better cleanup and performance.
- Added image preprocessing (resize/compress) before sending to AI model.
- Fixed drag/resize sounds to play once instead of repeatedly.
- Implemented auto-skip to lyrics start for tracks with negative offset.
- Enhanced CoverFlow with iPod mode styling, container queries, and enter/exit animations.
- Added theme-aware translations for Control Panels in multiple languages.
- Updated localization for Japanese, Traditional Chinese, German, Spanish, and Portuguese.
- Improved Apple Menu document icon detection and Recent Items tracking.
- Fixed debug mode functionality in BootScreen component.
- Updated API design guide with comprehensive patterns and best practices.

</details>

## December 2025

- Added Karaoke app, a windowed full-screen iPod player with lyrics synchronization and customizable font options.
- Enhanced iPod app with Cover Flow album browser, PIP player, YouTube search, and improved lyrics handling including furigana, soramimi, and translations.
- Implemented Admin app with user and song management, enhanced authentication, and Redis sync for song metadata.
- Introduced screen saver functionality with bouncing logo and i18n support.
- Enhanced lyrics display with old-school karaoke styling, romaji support, and improved Chinese and Korean text rendering.
- Unified song API endpoint and client refactoring for improved song metadata handling and lyrics processing.

<details>
<summary>Minor changes (10)</summary>

- Improved CoverFlow component with enhanced interactivity, styling, and animation.
- Enhanced Apple Menu with new items and improved document handling.
- Refactored lyrics processing and display for improved performance and accuracy, including AI-powered soramimi generation and chunked streaming.
- Enhanced localization support across various components with new translations and improved language handling.
- Improved window management with Expose/Mission Control mode, dock auto-hide, and enhanced drag-and-drop functionality.
- Added keyboard shortcuts for lyrics offset adjustment and improved playback controls.
- Fixed various bugs related to lyrics display, font rendering, and UI layout in iPod and Karaoke components.
- Updated dependencies and optimized Vite configuration for improved performance and stability.
- Enhanced chat functionality with keep talking mode, audio waveform visualization, and transcript saving.
- Improved CORS handling and enhanced security measures for API endpoints.

</details>

## November 2025

- Implement App Store with AI-generated applets, including sharing, updating, and management features.
- Enhance iPod functionality with video playback, translation, and fullscreen controls, including new video additions.
- Improve applet-AI integration with Google Gemini, rate limiting, image attachments, and enhanced error handling.
- Introduce Progressive Web App (PWA) support with service worker for faster loading and offline capabilities.
- Implement build versioning with commit SHA and enhance prefetching and cache management with update notifications.
- Enhance desktop shortcut management with theme-conditional visibility and trash functionality.

<details>
<summary>Minor changes (9)</summary>

- Update UI components with improved toast notifications, styling, and animation enhancements.
- Refactor various components for improved performance, code clarity, and maintainability.
- Fix several bugs related to applet updates, file handling, and component mounting.
- Add analytics tracking for applet viewer and key events.
- Enhance security with improved CORS handling and authentication token validation.
- Improve audio control with enhancements to useSound and useWindowManager hooks.
- Update version information and applet metadata across various components.
- Refactor chat functionality with improved tool output and message formatting.
- Adjust iPod controls and update translations.

</details>

## October 2025

- Enhance ryOS Applet Viewer with new sharing, import/export, and content handling features.
- Improve applet design guidelines for enhanced clarity and responsiveness.
- Implement HTML generation and saving functionality for ryOS Applets.
- Upgrade Zod library from v3 to v4.

<details>
<summary>Minor changes (10)</summary>

- Add icon support and toast notifications for generated HTML applets.
- Refactor chat and file management functionality in ryOS.
- Improve AI prompt instructions for app generation and Chinese responses.
- Enhance MacDock component with emoji scaling and layout adjustments.
- Update app icons and file handling for applets.
- Fix login message visibility when user is logged in.
- Add new songs to ipod-videos.
- Add watch option to Vite server configuration to ignore terminal files.
- Refine font handling for macOSX theme in applet viewer and HTML preview.
- Update app filtering and enhance file synchronization.

</details>

## September 2025

- Add lyrics translation persistence and force refresh functionality.
- Switch title parsing from OpenAI to Google Gemini and refactor AI prompt handling.
- Enhance AI chat hook with automatic message handling and improved logging.
- Update default AI model to Claude 4.5 and then GPT-5.
- Improve TextEdit functionality with a fallback mechanism for instance management.

<details>
<summary>Minor changes (8)</summary>

- Add several new videos to the iPod video library.
- Fix display of active language in translation dropdown and lyric offset for specific songs.
- Add more prefixes to skip in LRC parsing and recording engineer/digital editing to skip prefixes.
- Remove rate limiting from lyrics translation API.
- Refactor lyrics display delay and use persistent translation language preference.
- Increase lyrics translation timeout to 120 seconds.
- Upgrade zod dependency to satisfy AI SDK requirements.
- Prioritize English names in metadata parsing.

</details>

## August 2025

- Updated the default AI model to GPT-4.1.
- Implemented a macOS-style Dock with app icons, animations, and improved interactions.
- Enhanced chat room functionality with Redis-based presence tracking, improved profanity filtering, and collapsible sections.
- Refactored TextEditAppComponent with new editor context, hooks, toolbar features, and improved dialog handling.
- Implemented multi-token support for authentication and enhanced security measures.

<details>
<summary>Minor changes (10)</summary>

- Added new music videos to the iPod videos collection.
- Improved Finder UI responsiveness, layout, and icon styling for different view types.
- Enhanced Dock component with improved app launching behavior, dynamic dividers, and macOS-specific rendering logic.
- Updated iframe sandbox to allow forms and popups and added security enhancements.
- Implemented mobile/touch support in Dock component by disabling magnification for coarse pointers and no hover.
- Refactored terminal component to extract commands, utils, and components.
- Improved chat message handling, styling, and emoji support in chat rooms.
- Enhanced app components to conditionally render the menu bar based on foreground state.
- Implemented CORS and rate limiting across multiple API endpoints.
- Fixed aquarium token detection for Ryo's messages in chat rooms.

</details>

## July 2025

- Add emoji aquarium feature to chat messages.
- Implement server-side Ryo reply generation and update chat handling.
- Enhance iPod app with fullscreen lyrics controls, translation, and improved responsiveness.
- Implement link previews in chats with custom handling for YouTube and web links.
- Refactor instance management in AppManager and useAppStore for improved consistency and performance.
- Implement theme-aware menu bars across various components and enhance theme support throughout the application.
- Add Windows 98 theme support and legacy CSS management.

<details>
<summary>Minor changes (10)</summary>

- Add rate limiting for user creation and chat bursts to prevent abuse.
- Update AI model to Google Gemini for lyrics translation and add Gemini 2.5 flash model.
- Fix mobile Safari playback issues and improve fullscreen video player interactions in the iPod app.
- Improve mobile touch interactions for chat messages, link previews, and video playback controls.
- Update macOS icons with new graphics assets and refine theme styling across various components.
- Enhance username validation and handling in chat rooms and Redis operations.
- Update video store with new default video and improve shuffle and track selection logic.
- Refactor ChatMessages and ChatsApp components for improved message handling and styling.
- Update TerminalAppComponent to use Monaco font and adjust sound playback logic.
- Improve icon caching and versioning strategy, and enhance wallpaper routing and caching strategy.

</details>

## June 2025

- Implement multi-token authentication and user-specific token management in the chat API.
- Enhance chat room functionality with private room support, user presence tracking, and improved room management.
- Refactor chat API for improved system message handling, caching, and Pusher event broadcasting.
- Implement password management features and enhance authentication flow across chat components.
- Add right-click context menus to Desktop and Finder with data-driven menu items.
- Implement bulk message fetching for chat rooms, enhancing the API with a new action and corresponding handler.
- Improve file metadata restoration with existing UUID preservation.

<details>
<summary>Minor changes (10)</summary>

- Update Redis cache prefix for lyric translations.
- Improve chat rendering accuracy by decoding HTML entities in chat messages.
- Enhance CreateRoomDialog with user selection badges and improved UI styles.
- Refactor rate limiting logic for privileged user handling and fix type casting for AI message count check.
- Update iPod videos with new entries and adjustments.
- Extend token grace period and user token expiration time.
- Refactor chat error messages and placeholders for improved clarity.
- Update dependencies and refactor SpeechHighlight extension.
- Refactor room selection logic in ChatsAppComponent to handle scrolling for unread messages.
- Update speech volume settings in useAppStore and adjust ducking factor in useTtsQueue hook.

</details>

## May 2025

- Implement multi-instance support for Finder and Terminal apps, enabling users to run multiple instances simultaneously.
- Enhance chat functionality with AI-powered tools, improved message handling, markdown support, and user experience improvements.
- Improve iPod app with full-screen lyrics display, enhanced playback controls, library import/export, and updated default videos.
- Refactor core components to use Zustand for state management, improving performance and removing local storage dependencies.
- Integrate geolocation and user local time into the chat system state for more contextual interactions.
- Enhance text editing with markdown conversion, search/replace functionality, and external content synchronization.

<details>
<summary>Minor changes (10)</summary>

- Add volume control and mute functionality for master, UI, speech, chat synth, and iPod audio.
- Improve Internet Explorer with direct passthrough URL handling, updated favorites, and enhanced navigation.
- Enhance file management in Finder with drag-and-drop support and improved file type handling.
- Update AI prompts and instructions for improved clarity and user engagement.
- Fix audio context management for improved playback reliability on iOS Safari.
- Implement username recovery mechanism and profanity filter in chat rooms.
- Enhance PhotoBoothComponent with new effects and swipe detection.
- Refactor chat room API for consistency and clarity.
- Update dependencies for improved functionality and security.
- Improve mobile responsiveness and layout consistency across various components.

</details>

## April 2025

- Enhanced the Internet Explorer app with AI-powered content generation, caching, and improved navigation, including Wayback Machine integration and shared URL handling.
- Refactored multiple components (TextEdit, Chats, InternetExplorer, TimeMachineView, Ipod, Videos, AppManager) to use Zustand for improved state management.
- Enhanced the Time Machine View with improved animations, navigation, responsiveness, and shader effects.
- Integrated terminal sounds feature into the application with UI toggle and enhanced audio effects.
- Updated the default AI model to gpt-4.1 and claude-3.7 at various points, reflecting model testing and availability.
- Improved chat functionality with sidebar visibility preference, toast notifications, and AI-generated HTML support.

<details>
<summary>Minor changes (10)</summary>

- Added new tracks and updated video titles in the iPod app.
- Updated default favorites in Internet Explorer with new and reordered entries.
- Improved error handling and debugging capabilities in the Internet Explorer app.
- Enhanced font mapping and added Monaco font support for improved readability.
- Refined AI generation prompts and deliverable instructions for better content creation.
- Updated dependencies and improved TypeScript configuration.
- Implemented CORS support in API endpoints.
- Added pixelated rendering for images in the iframe-check API.
- Improved iframe embedding check logic and navigation handling.
- Enhanced system state to include iPod functionality.

</details>

## March 2025

- Implement a new AI-powered chat assistant with HTML preview and terminal integration, featuring code generation, streaming support, and enhanced user interaction.
- Introduce a Synth app with piano presets, mobile responsiveness, 3D waveform visualization, and preset management with storage support.
- Add a Photo Booth app with camera selection, filter support, stream sharing, and file system integration for capturing and saving photos.
- Enhance the iPod app with dynamic video playlist loading, touch event handling, animated text scrolling, and improved layout.
- Implement IndexedDB for caching chat rooms, messages, and wallpapers, along with backup and restore functionality.
- Improve terminal functionality with Vim editor, command history, new commands (echo, whoami, date), and enhanced UI elements.

<details>
<summary>Minor changes (10)</summary>

- Enhance chat functionality with Pusher integration for real-time updates, profanity filtering, and improved message handling.
- Update chat API to use Node.js runtime, improve response formatting, and add logging and error handling improvements.
- Improve IpodAppComponent with video playback functionality, dynamic menu items, and theme management.
- Refactor file handling to support Blob content and object URLs in Finder, Paint, and other components.
- Enhance HTML Preview component with draggable controls, toolbar collapse, and improved scaling and positioning logic.
- Update TerminalAppComponent with urgent message animation, input focus state management, and improved command help output.
- Improve video wallpaper handling in Desktop and WallpaperPicker components with loading state management.
- Enhance WindowFrame with persistent window state management and sound effects for window state changes.
- Update dependencies and refactor code for improved clarity and maintainability across various components.
- Add mobile responsiveness to HtmlPreview component and improve touch interaction in Synth app.

</details>

## February 2025

- Add PC Emulator app with multiple classic games and enhanced UI.
- Add Minesweeper app with mobile touch support and responsive window management.
- Add Videos app with retro CD player UI, time tracking, and enhanced playback controls.
- Implement Trash Management and File Saving Features in Finder and TextEdit apps.
- Enhance Paint app with pattern-based drawing, advanced drawing tools, clipboard operations, and improved UI inspired by MacPaint.
- Integrate audio transcription support into Chats and TextEdit apps.
- Migrate file system to IndexedDB and enhance storage management.

<details>
<summary>Minor changes (10)</summary>

- Add file saving and drag-and-drop functionality to Chats, Finder, and TextEdit apps.
- Add sound effects to UI components and Finder file interactions.
- Improve mobile touch interactions and window resizing across multiple apps.
- Enhance ChatInput with keyboard and touch device support, nudge feature, and MSN nudge sound effect.
- Enhance Finder UI with Dynamic View and Sorting Options.
- Enhance TextEdit with file import/export, markdown support, and improved file handling.
- Improve video player with animated title, number transitions, and migration to react-player for enhanced browser compatibility.
- Update Internet Explorer with enhanced navigation state management and Wayback Machine integration.
- Add CRT display mode and scanline effect.
- Update Control Panels with system management features, backup/restore functionality, and typing sound synthesis toggle.

</details>

## January 2025

- Introduced a multi-app architecture with improved window management and persistent app state using localStorage.
- Added a new Chats app with rich text editing powered by Tiptap, including slash commands, text formatting, and persistent chat history.
- Enhanced the Soundboard app with JSON-based import/export, multiple board support, and improved audio recording and playback.
- Implemented a new Internet Explorer app with favorites functionality, history navigation, and improved iframe rendering.
- Improved mobile web app support with enhanced UI responsiveness, window constraints, and disabled user scaling.
- Added AI assistant persona with cultural interests and software creation mission.

<details>
<summary>Minor changes (9)</summary>

- Enhanced UI components with styling and formatting improvements, including dialogs, menus, and buttons.
- Improved chat message styling with sender and timestamp details, animations, and text selection support.
- Refactored several components for better modularity and maintainability, including App, MenuBar, and dialogs.
- Added sound effects to UI components and interactions using Tone.js.
- Updated default favorites in Internet Explorer and added new fonts.
- Improved audio device selection and permission handling for sound recording.
- Added window resizing and draggable functionality with persistent size and position.
- Updated README with comprehensive project features and structure.
- Added help and about dialogs to apps with metadata and help items.

</details>

---

*This changelog is automatically generated and summarized from git history. Last updated: 2026-01-18*
