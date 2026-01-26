# Changelog

A summary of changes and updates to ryOS, organized by month.

---

## January 2026

- Add Infinite Mac app with 12 classic Mac OS emulators (System 1.0 to Mac OS X 10.4), display scaling, pause/resume, and screenshot capture.
- Add Listen Together feature with session management, invite dialogs, reaction support, and Pusher integration for Karaoke and iPod apps.
- Implement modular REST API structure with unified authentication and migrate API endpoints to Edge runtime for improved performance.
- Introduce image upload support in chat input with aqua styling and thumbnail display.
- Enhance documentation with comprehensive guides, Mermaid diagrams, and improved navigation.
- Refactor application architecture by extracting logic into hooks and migrating to Zustand stores for improved state management.
- Replace Lucide icons with Phosphor icons across the application for a consistent design.
- Improve macOS theme with aqua styling, enhanced Finder app menu, and CJK typography.

<details>
<summary>Minor changes (10)</summary>

- Fix audio playback issues in Safari and improve audio context handling.
- Update API endpoints to enhance CORS handling, type safety, and logging.
- Refactor various components for improved UI, styling, and responsive design.
- Improve terminal functionality with grep, uptime commands, and Vim enhancements.
- Update translations for multiple languages, including Japanese and Chinese.
- Fix various bugs related to lyrics display, auto-skipping, and IE proxy click interception.
- Enhance Stickies app with mobile touch support, color enhancements, and localization.
- Update Vercel configuration and development setup for improved performance and stability.
- Standardize button attributes, icon sizes, and localStorage keys for UI consistency.
- Refactor coverflow animation and styling for improved media display.

</details>

## December 2025

- Added CoverFlow feature to Karaoke and iPod apps with long-press gesture and menu toggle, including iPod mode styling and responsive cover sizes.
- Implemented comprehensive lyrics support including furigana, soramimi, and translation features with AI-powered generation and streaming, enhanced display, and KRC parsing.
- Enhanced song management with Redis caching, improved metadata handling, admin controls, and song sharing capabilities.
- Introduced a Karaoke app with fullscreen iPod player, lyrics synchronization, and customizable styling.
- Implemented an Admin application with user and message management features, requiring admin authentication.
- Added Expose/Mission Control mode for improved window management and desktop update notifications.
- Enhanced localization support across the application with new languages and improved translations.

<details>
<summary>Minor changes (8)</summary>

- Improved iPod app with PIP player, enhanced menu navigation, and video search functionality.
- Refined lyrics display with improved text shadows, word timing, and font customization options.
- Updated the user interface with new components, improved layouts, and enhanced touch handling.
- Enhanced chat functionality with keep talking mode, audio transcription, and message deduplication.
- Improved window management with minimize sounds, shake animation, and centralized closing logic.
- Added screen saver functionality with responsive previews and dynamic sizing.
- Enhanced system settings tool and updated localization for settings changes.
- Updated dependencies and optimized Vite configuration for improved performance.

</details>

## November 2025

- Implement App Store with AI-powered applet generation, sharing, and management features.
- Enhance iPod functionality with video playback, translation, karaoke, and improved controls.
- Introduce a Progressive Web App (PWA) with service worker for faster loading and offline support.
- Improve applet AI request rate limiting and authentication handling.
- Refactor prefetching and caching strategies for improved performance and version handling.
- Enhance WindowFrame and Dock components with improved animation and functionality.
- Implement song similarity scoring and enhance search results.

<details>
<summary>Minor changes (10)</summary>

- Update version information to 10.3 and enhance build versioning to include commit SHA.
- Add analytics tracking for applet viewer and key events.
- Fix various issues related to CORS, file handling, and component mounting.
- Enhance toast styling and positioning for improved user experience.
- Refactor AI chat logic for improved tool output and performance.
- Update applet metadata structure and improve applet import/export functionality.
- Improve applet search display and fuzziness.
- Enhance IconButton with loading state and improve app instance management.
- Update various UI components and styles for improved consistency and clarity.
- Refactor iPod controls into a single `ipodControl` tool.

</details>

## October 2025

- Implement new sharing and saving functionality for Applets, including icon support and toast notifications.
- Enhance the Applet Viewer with improved content handling, user interaction, window management, and import/export capabilities.
- Refactor ryOS chat and file management functionality for improved performance and maintainability.
- Upgrade Zod library from v3 to v4.
- Improve AI prompt instructions for app generation and Chinese responses, including core priority instructions.

<details>
<summary>Minor changes (8)</summary>

- Fix an issue where the login message was visible when a user was already logged in.
- Update app icons and file handling for applets.
- Enhance the MacDock component with emoji scaling and layout adjustments.
- Refine font handling for the macOSX theme in the Applet Viewer and HTML preview.
- Improve rendering and styling of FileIcon and FileList components.
- Add interaction listeners for iframes within the Applet Viewer.
- Add several new songs to ipod-videos.
- Add a watch option to the Vite server configuration to ignore terminal files.

</details>

## September 2025

- Added lyrics translation persistence and force refresh functionality.
- Enhanced AI chat integration with automatic message handling and improved logging.
- Refactored title parsing to use Google Gemini and improved AI prompt handling.
- Updated default AI model to Claude 4.5, then GPT-5, then GPT-5-mini.

<details>
<summary>Minor changes (9)</summary>

- Added new videos to ipod-videos.
- Improved TextEdit functionality with instance management fallback.
- Fixed issues with lyrics display, offset, and album information.
- Added more prefixes to skip in LRC parsing.
- Removed rate limiting from lyrics translation API.
- Refactored lyrics display delay and translation language preference.
- Increased lyrics translation timeout to 120 seconds.
- Upgraded zod dependency to satisfy AI SDK requirements.
- Prioritized English names in metadata parsing.

</details>

## August 2025

- Updated the default AI model to GPT-4.1.
- Implemented a macOS-style Dock with app icons, animations, and improved app launching behavior.
- Enhanced chat room functionality with improved user presence tracking, profanity filtering, and collapsible sections.
- Refactored TextEditAppComponent with new editor context, hooks, toolbar features, and improved dialog handling.
- Implemented multi-token support for authentication and enhanced security measures.

<details>
<summary>Minor changes (10)</summary>

- Added new music videos to the iPod videos collection.
- Improved Finder UI responsiveness, layout, and icon styling for different view types.
- Enhanced Dock component with dynamic dividers, improved animations, and macOS-specific rendering logic.
- Updated Dock component to use app names from appRegistry for icon labels, improving clarity and user experience when displaying applications.
- Added 404 page redirect to homepage and enabled horizontal scrolling for mobile dock.
- Refactored terminal component and AI command to support functional updates.
- Enforced password requirement for user creation and updated validation logic.
- Improved iframe security with sandbox attributes and updated CSP directives.
- Implemented CORS support and rate limiting across multiple API endpoints.
- Updated themes and styling for improved consistency across components.

</details>

## July 2025

- Add emoji aquarium feature to chat messages for enhanced user engagement.
- Implement server-side Ryo reply generation and enhance chat handling.
- Enhance iPod app with fullscreen lyrics controls, improved UI, and responsive design adjustments.
- Implement link previews in chats with custom handling for YouTube and web links.
- Refactor application themes with improved macOS, Windows 98, and Windows XP styling across various components.
- Improve instance management in AppManager and useAppStore for better consistency and performance.
- Add rate limiting for user creation and chat burst rate limiting for public rooms.

<details>
<summary>Minor changes (10)</summary>

- Fix mobile Safari playback issues and improve fullscreen video player interactions.
- Update video store with new default videos and music metadata.
- Enhance username validation and handling in chat rooms and Redis operations.
- Improve mobile touch interactions across various components and prevent unwanted gestures.
- Refactor chat messages and components for improved message handling and theme support.
- Update application icons and assets for improved visual consistency and theme support.
- Enhance token management and verification process.
- Switch from OpenAI to Google Gemini for lyrics translation.
- Improve shuffled playback history navigation and track selection logic in the iPod app.
- Update dependencies and configurations for improved performance and stability.

</details>

## June 2025

- Implement multi-token authentication and user-specific token management in the chat API.
- Enhance chat room functionality with private room support, improved room management, and user presence tracking.
- Refactor chat API for improved system message handling, caching, and Pusher event broadcasting.
- Implement password management features and enhance authentication flow across the chat application.
- Add right-click context menus to Desktop and Finder with data-driven menu items.
- Improve chat room layout and scrolling behavior for better user experience and responsiveness.

<details>
<summary>Minor changes (10)</summary>

- Update Redis cache prefix for lyric translations and improve Redis key retrieval performance.
- Enhance CreateRoomDialog with user selection badges, improved UI styles, and username length validation.
- Update iPod app with new videos, clickwheel sound, and volume settings adjustments.
- Fix Safari emoji rendering and disable overscroll behavior.
- Refactor chat error messages and authentication handling for improved clarity and user experience.
- Extend token grace period to one year and user token expiration time to 90 days.
- Update dependencies and refactor TypeScript type assertions.
- Add authentication headers to AI chat requests and improve rate limiting logic.
- Decode HTML entities in chat messages to improve rendering accuracy.
- Update button text and simplify logout options in chat components for improved clarity.

</details>

## May 2025

- Enhance chat functionality with AI-powered tools, improved message handling, markdown support, and context-aware prompts.
- Implement multi-instance app management for Finder, TextEdit, and Terminal, allowing multiple windows of the same application.
- Improve iPod app with full-screen lyrics display, enhanced playback controls, new video tracks, and library import/export functionality.
- Refactor core components to utilize Zustand for global state management, improving performance and removing local storage dependencies.
- Enhance Internet Explorer with direct passthrough URL handling, improved navigation, and updated favorites.
- Improve file management with drag-and-drop support in Finder, enhanced file type handling, and virtual file support.
- Implement a new system for managing audio contexts and volume controls, including master volume, mute toggles, and iOS compatibility.

<details>
<summary>Minor changes (10)</summary>

- Fix various issues in chat components, including message rendering, username handling, and profanity filtering.
- Update AI prompts and instructions for improved clarity and user experience.
- Enhance mobile responsiveness and layout consistency across various components.
- Improve error handling and logging in multiple components for better debugging.
- Refactor code for improved readability, maintainability, and performance.
- Update dependencies to the latest versions for improved functionality and security.
- Add sound effects and visual feedback to enhance user interactions.
- Improve boot screen functionality with user feedback and default messages.
- Update default settings and configurations for various apps and features.
- Enhance photo booth and webcam with new effects and swipe detection.

</details>

## April 2025

- Implement a Time Machine feature within the Internet Explorer app, allowing users to navigate through historical and future web content with enhanced animations and improved layout.
- Overhaul Internet Explorer app with AI-powered content generation, caching, and improved navigation, including shared URL handling and a new debug mode.
- Refactor multiple app components (TextEdit, Chats, InternetExplorer, TimeMachineView, Ipod, Videos) to use Zustand for improved state management.
- Enhance the chat experience with sidebar visibility preferences, toast notifications, and AI-generated HTML support.
- Implement terminal sounds feature with UI toggle and improved audio effects.
- Significantly update the Internet Explorer AI generation prompt and deliverable instructions for better content creation.

<details>
<summary>Minor changes (9)</summary>

- Update the default AI model to claude-3.7 and then to gpt-4.1, optimizing for performance and compatibility.
- Improve the iframe-check API with Wayback Machine integration and enhanced error handling.
- Update default favorites in Internet Explorer with new and reordered entries.
- Enhance font handling and styling across multiple components for improved readability and consistency.
- Add CORS support to API endpoints.
- Implement mobile layout optimizations for TimeMachineView.
- Update video titles and add new entries to the default video list.
- Add shader effect toggle and integrate with app store state management.
- Improve error handling and logging in various components.

</details>

## March 2025

- Implement a new Synth app with preset management, 3D waveform visualization, and mobile responsiveness.
- Add a Photo Booth app with camera selection, filter support, and file system integration.
- Enhance the Terminal app with a Vim editor, AI chat mode, command history, and HTML preview functionality.
- Implement custom wallpaper support with IndexedDB storage, including video wallpapers.
- Integrate Pusher for real-time chat updates and add profanity filtering to chat rooms.
- Refactor chat components for improved message handling, animation, and user experience.

<details>
<summary>Minor changes (10)</summary>

- Improve Ipod app with scrolling text, touch event handling, and dynamic video playlist loading.
- Enhance HtmlPreview component with draggable controls, toolbar collapse, and improved scaling and positioning logic.
- Update chat API to use Node.js runtime, improve response formatting, and add logging and error handling.
- Refactor vibration handling in IpodAppComponent and useChatSynth for improved performance.
- Update dependencies and clean up unused variables across various components.
- Improve video playback handling in Desktop component and refine LCD filter implementation in IpodAppComponent.
- Enhance TerminalAppComponent with urgent message handling, markdown parsing, and sound effects integration.
- Update IpodAppComponent styles for improved visual consistency and add backlight functionality.
- Improve error handling in Webcam component and add resume functionality for audio context in useSound hook.
- Update chat generation instructions in api/chat.ts for clarity and consistency, enhancing code generation process.

</details>

## February 2025

- Added PC Emulator app with multiple classic games and enhanced UI.
- Introduced the Videos app featuring a retro CD player UI, time tracking, and enhanced playback controls.
- Implemented the Paint app with MacPaint-inspired design, pattern-based drawing, and advanced drawing tools.
- Added the Minesweeper app with mobile touch support and responsive window management.
- Enhanced the Finder app with dynamic view, sorting options, trash management, and file saving features.
- Integrated audio transcription support into Chats and TextEdit apps.
- Added Control Panels app for system management, including display mode toggling, sound settings, and backup/restore functionality.

<details>
<summary>Minor changes (10)</summary>

- Improved chat functionality with message history navigation, copy functionality, urgent message display, and nudge feature.
- Enhanced TextEdit with markdown support, improved markup parsing, file handling, and task list support.
- Updated Internet Explorer with Wayback Machine integration and improved navigation.
- Refactored window management with improved resizing, positioning, and sound effects.
- Improved file system with IndexedDB migration, enhanced storage management, and image file management.
- Enhanced UI with sound effects, Apple Garamond font, and improved dialog styling.
- Refined video player with animated title, number transitions, and react-player integration.
- Improved mobile responsiveness and touch interactions across multiple apps.
- Updated default wallpapers and UI text for better user experience.
- Fixed various bugs and improved performance across multiple apps.

</details>

## January 2025

- Added a new Chats app featuring rich text editing with Tiptap, slash commands, persistent message storage, and Framer Motion animations.
- Implemented a multi-app architecture with improved window management, persistent app state, and a unified menu bar.
- Enhanced the Internet Explorer app with favorites functionality, history navigation, and improved error handling.
- Significantly improved the Soundboard app with JSON-based loading/reloading, multi-board support, and enhanced UI.
- Added audio feedback to UI components using Tone.js and enhanced chat synth with richer audio effects.
- Improved mobile web app support with responsive layouts, enhanced input handling, and disabled user scaling.

<details>
<summary>Minor changes (10)</summary>

- Improved chat message styling, text segmentation, and emoji handling.
- Refined the UI and styling of various components including dialogs, soundboard slots, and window frames.
- Added default favorites to Internet Explorer, including Andrew's and Lucas's websites and the Particle Simulator.
- Updated the AI assistant system prompt with expanded persona details.
- Added help and about dialogs to apps with metadata and help items.
- Improved audio recording compatibility and device selection.
- Added window minimize functionality and desktop icon.
- Updated README with comprehensive project features and setup instructions.
- Added SEO and social media meta tags for improved sharing and discoverability.
- Fixed layout responsiveness in BoardList and WindowFrame components.

</details>

---

*This changelog is automatically generated and summarized from git history. Last updated: 2026-01-25*
