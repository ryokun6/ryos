# Minesweeper

Minesweeper is a classic puzzle game available in ryOS, challenging users to locate hidden mines on a grid without detonating them. It provides a quick and engaging mental exercise directly within your web-based desktop environment.

## Overview

Minesweeper offers the familiar and addictive gameplay experience of the timeless puzzle game. The core objective is to uncover all safe cells on the board while avoiding the hidden mines. Players use logic and deduction, guided by numbers on revealed cells that indicate how many mines are adjacent to them.

Designed for both casual players and those seeking a quick mental workout, Minesweeper integrates seamlessly into the ryOS environment. Its intuitive controls are optimized for both desktop and mobile interfaces, ensuring a smooth experience regardless of the device. The app tracks game progress with a timer and a mine counter, adding a competitive element for players aiming to improve their times.

## Features

*   **Classic Minesweeper Gameplay:** Engage in the traditional game where you strategically reveal cells and use numerical clues to deduce mine locations.
*   **Intuitive Control Scheme:**
    *   **Desktop Controls:** Left-click to reveal a cell, right-click to flag a suspected mine, and double-click a revealed number to automatically reveal its unflagged neighbors.
    *   **Mobile Controls:** Tap a cell to reveal it, and long-press a cell to flag or unflag a mine.
*   **Real-time Game Tracking:** A dedicated top bar displays the elapsed game time and the count of remaining unflagged mines.
*   **Easy Game Restart:** Quickly begin a new game at any point by clicking the smiley face button on the top bar or selecting `Game ▸ New` from the menu.

## User Guide

### Getting Started
Launch Minesweeper from your ryOS app launcher. The game starts immediately with a new board. Begin by clicking or tapping cells to reveal them and start your deduction process.

### Key Actions
*   **Reveal a Cell:** Click the left mouse button (desktop) or tap (mobile) on any unrevealed cell. If it's a mine, the game ends. If it's a number, it indicates how many mines are in the 8 surrounding cells.
*   **Flag a Mine:** To mark a cell you suspect contains a mine, right-click (desktop) or long-press (mobile) on it. This places a flag, preventing accidental revelation and helping you keep track.
*   **Auto-Reveal Neighbors:** Once you've confidently flagged all the mines adjacent to a revealed number cell, you can double-click that number (desktop only) to automatically reveal all its unflagged neighbors. This is a powerful shortcut for clearing safe areas quickly.
*   **Restart Game:** If you want to start a fresh board, simply click the smiley face icon in the top bar or navigate to `Game ▸ New` in the application menu.

### Tips & Shortcuts
*   Use flags strategically to narrow down potential mine locations. Flagging a cell you're unsure about is safer than revealing it.
*   The double-click auto-reveal feature is crucial for efficient play on desktop. Master its use to speed up your game times.
*   Don't hesitate to restart if you find yourself in a tricky spot or make a mistake; the game is designed for quick, repeated plays.

## Technical Details

### Window Configuration
*   Default size: 305×400px
*   Minimum size: 305×400px
*   Maximum size: 305×400px

### Component Architecture
The app consists of 2 component file(s):

*   `components/MinesweeperAppComponent.tsx`
*   `components/MinesweeperMenuBar.tsx`

### Hooks & Utilities

No custom hooks or utilities.

### State Management
The Minesweeper app primarily manages its game state using local component state, leveraging React's `useState` hook for tracking the game board, cell properties (revealed, flagged, mine status), game status (active, won, lost), and the timer. It also integrates with ryOS-wide state management via `useThemeStore` for theme synchronization and `useTranslation` for internationalization, ensuring a consistent user experience within the desktop environment.

## Related Apps

*   **Solitaire:** Another classic single-player puzzle game found in ryOS, offering a different kind of mental challenge.
*   **Calculator:** A simple utility app, similar to Minesweeper in its direct, focused functionality and quick accessibility.
