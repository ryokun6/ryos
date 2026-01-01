# TextEdit

TextEdit is a versatile rich text editor for ryOS, designed for creating and managing documents with advanced formatting, markdown support, and smart productivity features like slash commands and speech-to-text. It serves as the primary tool for text and document creation within the ryOS environment.

## Overview

TextEdit provides a robust platform for everything from quick notes to detailed reports. It caters to users who need rich text capabilities, markdown flexibility, and modern productivity enhancements in a web-based desktop environment. Whether drafting an email, writing code snippets, or composing a detailed article, TextEdit offers a streamlined experience with a focus on ease of use and powerful features.

The application's intuitive interface combines traditional editing tools with innovative functionalities such as hands-free voice dictation and AI-powered slash commands. This blend makes document creation efficient and accessible for a wide range of tasks, empowering users to produce high-quality content with minimal effort.

## Features

*   **Comprehensive Text Editing:** Perform fundamental editing actions including typing, selecting, copying, cutting, pasting, undoing, and redoing text with ease.
*   **Rich Formatting Options:** Style your documents effectively with options for bold, italic, and underline text, various heading levels (H1-H6), and text alignment (left, center, right, justify).
*   **Structured Content Creation:** Organize information clearly using bulleted lists, numbered lists, and interactive check-box task lists to track progress.
*   **Flexible File Management:** Create new documents, open existing files from your ryOS storage, save your current work, and export documents in multiple formats including HTML, Markdown (MD), and plain text (TXT).
*   **Hands-Free Voice Dictation:** Leverage integrated speech-to-text functionality to dictate content directly into your document, enhancing productivity and accessibility for hands-free input.
*   **Efficient Slash Commands:** Access quick actions and commands by typing `/` anywhere in your document, enabling rapid formatting, insertions, or even remote editing suggestions and content generation from Ryo AI.
*   **Markdown Support:** Write and preview content using standard Markdown syntax, blending the simplicity of plain text with the power of rich formatting.

## User Guide

### Getting Started
To launch TextEdit, locate its icon in the ryOS application launcher or dock and click it. A new, blank document will open, ready for you to start typing immediately. You can begin entering text, or use the menu bar and toolbar options to format your document.

### Key Actions
*   **Typing and Basic Editing:** Simply place your cursor in the editor and begin typing. Standard keyboard shortcuts are supported for copying (`Ctrl/Cmd+C`), cutting (`Ctrl/Cmd+X`), pasting (`Ctrl/Cmd+V`), undoing (`Ctrl/Cmd+Z`), and redoing (`Ctrl/Cmd+Y`).
*   **Applying Formatting:** Select the text you wish to format, then use the icons in the `EditorToolbar` for options like bold, italic, underline, headings, or alignment.
*   **Creating Lists:** Click the respective icons in the toolbar to start a bulleted, numbered, or task list. Press Enter to add new list items.
*   **Saving and Opening Files:** Use the "File" menu in the `TextEditMenuBar` to "Save" your current document, "Save As..." to choose a new name or format, or "Open..." to load an existing file from your ryOS file system.
*   **Exporting Documents:** From the "File" menu, select "Export As..." to save your document in different formats like HTML, Markdown, or plain text.
*   **Using Voice Dictation:** Click the microphone icon in the toolbar or select the "Start Dictation" option (if available) to begin speaking your text. Click the icon again to stop dictation.
*   **Executing Slash Commands:** Type `/` anywhere in your document to bring up a list of available commands. Select a command from the `SlashCommandsList` or type to filter. These commands can perform actions like inserting elements, applying specific formatting, or leveraging Ryo AI for content suggestions and edits.

### Tips & Shortcuts
*   **Markdown Shortcuts:** TextEdit intelligently recognizes common Markdown syntax. For example, typing `#` followed by a space will create a heading, `*` or `-` for bullet points, and `**text**` for bold.
*   **Drag & Drop:** You can often drag and drop text or compatible files (like `.txt`, `.md`) directly into the TextEdit window to insert their content.
*   **Ryo AI Integration:** Explore the capabilities of Ryo AI through slash commands. Use commands like `/summarize` or `/rewrite` on selected text for quick content generation or modification.
*   **Window Resizing:** Adjust the TextEdit window to your preferred working size by dragging its edges. The application will remember your last used size for convenience in subsequent sessions.

## Technical Details

### Window Configuration
-   **Default size:** 430×475px
-   **Minimum size:** 430×200px

### Component Architecture
The TextEdit application is built using a modular component architecture, facilitating maintainability and scalability within the ryOS framework. It comprises the following primary component files:

-   `components/TextEditMenuBar.tsx`: Manages the application's top-level menu options, including File, Edit, and View actions.
-   `components/EditorToolbar.tsx`: Provides quick access to common formatting and editing tools, displayed above the text editor.
-   `components/TextEditAppComponent.tsx`: The main application wrapper component, orchestrating other components and managing app-level logic and lifecycle.
-   `components/SpeechManager.tsx`: Handles the integration and control of speech-to-text dictation functionality.
-   `components/SlashCommandsList.tsx`: Displays and manages the interactive list of available slash commands triggered by typing `/`.
-   `components/EditorProvider.tsx`: Provides a React Context for sharing editor-specific state and functions across child components, ensuring consistent editor behavior.
-   `components/DialogManager.tsx`: Manages and displays various application dialogs, such as "Save As," "Open File," or confirmation prompts.
-   `components/TextEditor.tsx`: The core component responsible for rendering and managing the rich text editing area where users type and format content.

### Hooks & Utilities
**Custom Hooks:** These hooks encapsulate reusable logic for specific TextEdit functionalities:

-   `hooks/useDragAndDrop.ts`: Manages drag-and-drop interactions within the editor, allowing users to move content or open files.
-   `hooks/useTextEditState.ts`: Handles the complex local state management for the editor's content, selection, and UI-specific flags.
-   `hooks/useFileOperations.ts`: Provides abstracted functions for creating, opening, saving, and exporting files, integrating with ryOS's file system.

**Utilities:**
-   `utils/textEditUtils.ts`: Contains various helper functions and constants specific to TextEdit's operations, such as file extension handling and initial data parsing.

### State Management
TextEdit employs a hybrid approach to state management. Core editor content, selection, and UI-specific states (e.g., whether a dialog is open, transcription status) are managed locally within the `TextEditAppComponent` and its children, often facilitated by the `useTextEditState` hook and the `EditorProvider` context. For global ryOS settings and application-wide data, TextEdit integrates with Zustand stores, specifically `useAppStore` for application instance management, `useAudioSettingsStore` for speech-to-text preferences, and `useThemeStore` for theme-related styling.

## Related Apps
*   **Notepad:** For simpler, plain text editing tasks without the need for rich formatting, markdown, or advanced features.
*   **Ryo AI:** TextEdit leverages Ryo AI's capabilities directly through its slash command interface for intelligent content assistance and generation.
