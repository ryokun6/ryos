import { useRef } from "react";
import type {
  ChangeEvent,
  Dispatch,
  KeyboardEvent,
  SetStateAction,
} from "react";
import { useTerminalStore } from "@/stores/useTerminalStore";
import type {
  CommandHistory,
  SaveFileData,
  TerminalFileItem,
} from "../types";

interface UseVimLogicOptions {
  currentCommand: string;
  setCurrentCommand: (value: string) => void;
  commandHistory: CommandHistory[];
  setCommandHistory: Dispatch<SetStateAction<CommandHistory[]>>;
  currentPath: string;
  files: TerminalFileItem[];
  saveFile: (file: SaveFileData) => Promise<void>;
}

export const useVimLogic = ({
  currentCommand,
  setCurrentCommand,
  commandHistory,
  setCommandHistory,
  currentPath,
  files,
  saveFile,
}: UseVimLogicOptions) => {
  const {
    isInVimMode,
    setIsInVimMode,
    vimFile,
    setVimFile,
    vimPosition,
    setVimPosition,
    vimCursorLine,
    setVimCursorLine,
    vimCursorColumn,
    setVimCursorColumn,
    vimMode,
    setVimMode,
    vimClipboard,
    setVimClipboard,
  } = useTerminalStore();

  const lastGPressTimeRef = useRef<number>(0);
  const lastKeyPressRef = useRef<{ key: string; time: number }>({
    key: "",
    time: 0,
  });

  // Helper function to save vim file content
  const saveVimFile = async (vimFileToSave: { name: string; content: string }) => {
    try {
      // Find the file in the current files list to get its path
      const fileObj = files.find((file) => file.name === vimFileToSave.name);

      if (!fileObj) {
        console.error(`Could not find file ${vimFileToSave.name} for saving`);
        return;
      }

      // Use the saveFile API directly from useFileSystem
      await saveFile({
        path: fileObj.path,
        name: vimFileToSave.name,
        content: vimFileToSave.content,
        type: "text",
      });

      console.log(`Saved vim file ${vimFileToSave.name} to ${fileObj.path}`);
    } catch (error) {
      const err = error as Error;
      console.error(`Error saving vim file: ${err.message || "Unknown error"}`);

      // Show error in terminal
      setCommandHistory((prev) => [
        ...prev,
        {
          command: "",
          output: `Error saving file: ${err.message || "Unknown error"}`,
          path: currentPath,
        },
      ]);
    }
  };

  const handleVimInput = (input: string) => {
    // Handle commands that start with ":"
    if (input.startsWith(":")) {
      if (input === ":q" || input === ":q!" || input === ":wq") {
        // Exit vim mode
        const output = input === ":wq" ? `"${vimFile?.name}" written` : "";

        setCommandHistory([
          ...commandHistory,
          {
            command: input,
            output,
            path: currentPath,
          },
        ]);

        // Save file if using :wq
        if (input === ":wq" && vimFile) {
          saveVimFile(vimFile);
        }

        // Clear vim state
        setIsInVimMode(false);
        setVimFile(null);
        setVimPosition(0);
        setVimMode("normal");
      } else {
        // Unsupported vim command
        setCommandHistory([
          ...commandHistory,
          {
            command: input,
            output: `unsupported vim command: ${input}`,
            path: currentPath,
          },
        ]);
      }
    } else if (input === "j" || input === "k") {
      // Handle navigation (j: down, k: up)
      if (!vimFile) return;

      const lines = vimFile.content.split("\n");
      const maxVisibleLines = 20; // Number of lines to display
      const maxPosition = Math.max(0, lines.length - maxVisibleLines);

      if (input === "j" && vimPosition < maxPosition) {
        setVimPosition((prev) => prev + 1);
      } else if (input === "k" && vimPosition > 0) {
        setVimPosition((prev) => prev - 1);
      }
    }

    // Clear the input field
    setCurrentCommand("");
  };

  const handleVimTextInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (!isInVimMode || !vimFile || vimMode !== "insert") return;

    const inputText = e.target.value;
    const lastChar = inputText.slice(-1);

    // Process the character input by modifying the file content
    const lines = vimFile.content.split("\n");
    const currentLine = lines[vimCursorLine] || "";

    // Insert the character at cursor position
    const newLine =
      currentLine.substring(0, vimCursorColumn) +
      lastChar +
      currentLine.substring(vimCursorColumn);
    lines[vimCursorLine] = newLine;

    // Update file content
    setVimFile({
      ...vimFile,
      content: lines.join("\n"),
    });

    // Move cursor forward
    setVimCursorColumn((prev) => prev + 1);

    // Clear the input field after processing
    setCurrentCommand("");
  };

  const handleVimKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isInVimMode) return;

    // Insert mode handling
    if (vimMode === "insert") {
      if (e.key === "Escape") {
        // Exit insert mode
        e.preventDefault();
        setVimMode("normal");
        return;
      }

      // Handle backspace in insert mode
      if (e.key === "Backspace") {
        e.preventDefault();

        if (!vimFile) return;

        const lines = vimFile.content.split("\n");

        // Check if we are at the beginning of a line and not on the first line
        if (vimCursorColumn === 0 && vimCursorLine > 0) {
          // We need to merge with the previous line
          const previousLine = lines[vimCursorLine - 1];
          const currentLine = lines[vimCursorLine];
          const previousLineLength = previousLine.length;

          // Merge the lines
          lines[vimCursorLine - 1] = previousLine + currentLine;

          // Remove the current line
          lines.splice(vimCursorLine, 1);

          // Update file content
          setVimFile({
            ...vimFile,
            content: lines.join("\n"),
          });

          // Move cursor to the end of the previous line
          setVimCursorLine((prev) => prev - 1);
          setVimCursorColumn(previousLineLength);

          // Auto-scroll if needed
          const maxVisibleLines = 20;
          const lowerThreshold = Math.floor(maxVisibleLines * 0.4);

          if (
            vimCursorLine - 1 - vimPosition < lowerThreshold &&
            vimPosition > 0
          ) {
            setVimPosition((prev) => Math.max(prev - 1, 0));
          }

          return;
        }

        // Regular backspace in the middle of a line
        if (vimCursorColumn > 0) {
          const currentLine = lines[vimCursorLine] || "";

          // Remove character before cursor
          const newLine =
            currentLine.substring(0, vimCursorColumn - 1) +
            currentLine.substring(vimCursorColumn);
          lines[vimCursorLine] = newLine;

          // Update file content
          setVimFile({
            ...vimFile,
            content: lines.join("\n"),
          });

          // Move cursor backward
          setVimCursorColumn((prev) => Math.max(0, prev - 1));
        }

        return;
      }

      // Handle Enter key in insert mode to create a new line
      if (e.key === "Enter") {
        e.preventDefault();

        if (!vimFile) return;

        const lines = vimFile.content.split("\n");
        const currentLine = lines[vimCursorLine] || "";

        // Split the line at cursor position
        const beforeCursor = currentLine.substring(0, vimCursorColumn);
        const afterCursor = currentLine.substring(vimCursorColumn);

        // Update the current line and add a new line
        lines[vimCursorLine] = beforeCursor;
        lines.splice(vimCursorLine + 1, 0, afterCursor);

        // Update file content
        setVimFile({
          ...vimFile,
          content: lines.join("\n"),
        });

        // Move cursor to the beginning of the new line
        setVimCursorLine((prev) => prev + 1);
        setVimCursorColumn(0);

        // Auto-scroll if the cursor moves out of view
        const maxVisibleLines = 20;
        const upperThreshold = Math.floor(maxVisibleLines * 0.6);
        const maxPosition = Math.max(0, lines.length - maxVisibleLines);

        if (
          vimCursorLine + 1 - vimPosition > upperThreshold &&
          vimPosition < maxPosition
        ) {
          setVimPosition((prev) => Math.min(prev + 1, maxPosition));
        }

        return;
      }

      // Handle Tab key in insert mode
      if (e.key === "Tab") {
        e.preventDefault();

        if (!vimFile) return;

        const lines = vimFile.content.split("\n");
        const currentLine = lines[vimCursorLine] || "";

        // Insert 2 spaces (standard tab size)
        const newLine =
          currentLine.substring(0, vimCursorColumn) +
          "  " +
          currentLine.substring(vimCursorColumn);
        lines[vimCursorLine] = newLine;

        // Update file content
        setVimFile({
          ...vimFile,
          content: lines.join("\n"),
        });

        // Move cursor after the tab
        setVimCursorColumn((prev) => prev + 2);

        return;
      }

      // Handle Delete key in insert mode
      if (e.key === "Delete") {
        e.preventDefault();

        if (!vimFile) return;

        const lines = vimFile.content.split("\n");
        const currentLine = lines[vimCursorLine] || "";

        // Check if we are at the end of a line and not on the last line
        if (
          vimCursorColumn === currentLine.length &&
          vimCursorLine < lines.length - 1
        ) {
          // We need to merge with the next line
          const nextLine = lines[vimCursorLine + 1];

          // Merge the lines
          lines[vimCursorLine] = currentLine + nextLine;

          // Remove the next line
          lines.splice(vimCursorLine + 1, 1);

          // Update file content
          setVimFile({
            ...vimFile,
            content: lines.join("\n"),
          });

          return;
        }

        // Regular delete in the middle of a line
        if (vimCursorColumn < currentLine.length) {
          // Remove character after cursor
          const newLine =
            currentLine.substring(0, vimCursorColumn) +
            currentLine.substring(vimCursorColumn + 1);
          lines[vimCursorLine] = newLine;

          // Update file content
          setVimFile({
            ...vimFile,
            content: lines.join("\n"),
          });
        }

        return;
      }

      // Handle Home/End keys in insert mode
      if (e.key === "Home") {
        e.preventDefault();
        setVimCursorColumn(0);
        return;
      }

      if (e.key === "End") {
        e.preventDefault();
        if (!vimFile) return;

        const lines = vimFile.content.split("\n");
        const currentLine = lines[vimCursorLine] || "";
        setVimCursorColumn(currentLine.length);
        return;
      }

      // Let most keys pass through to be handled by onChange in insert mode
      // Only handle special navigation cases here
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        e.preventDefault();

        if (!vimFile) return;
        const lines = vimFile.content.split("\n");

        // Handle arrow navigation in insert mode
        if (e.key === "ArrowDown" && vimCursorLine < lines.length - 1) {
          // Move cursor down
          const newCursorLine = vimCursorLine + 1;
          setVimCursorLine(newCursorLine);

          // Adjust column position if needed
          const newLineLength = lines[newCursorLine].length;
          if (newLineLength < vimCursorColumn) {
            setVimCursorColumn(Math.max(0, newLineLength));
          }

          // Auto-scroll if needed
          const maxVisibleLines = 20;
          const upperThreshold = Math.floor(maxVisibleLines * 0.6);
          const maxPosition = Math.max(0, lines.length - maxVisibleLines);

          if (
            newCursorLine - vimPosition > upperThreshold &&
            vimPosition < maxPosition
          ) {
            setVimPosition((prev) => Math.min(prev + 1, maxPosition));
          }
        } else if (e.key === "ArrowUp" && vimCursorLine > 0) {
          // Move cursor up
          const newCursorLine = vimCursorLine - 1;
          setVimCursorLine(newCursorLine);

          // Adjust column position if needed
          const newLineLength = lines[newCursorLine].length;
          if (newLineLength < vimCursorColumn) {
            setVimCursorColumn(Math.max(0, newLineLength));
          }

          // Auto-scroll if needed
          const maxVisibleLines = 20;
          const lowerThreshold = Math.floor(maxVisibleLines * 0.4);

          if (
            newCursorLine - vimPosition < lowerThreshold &&
            vimPosition > 0
          ) {
            setVimPosition((prev) => Math.max(prev - 1, 0));
          }
        } else if (e.key === "ArrowLeft" && vimCursorColumn > 0) {
          // Move cursor left
          setVimCursorColumn((prev) => prev - 1);
        } else if (e.key === "ArrowRight") {
          // Move cursor right, but don't go beyond the end of the line
          const currentLineLength = lines[vimCursorLine]?.length || 0;
          if (vimCursorColumn < currentLineLength) {
            setVimCursorColumn((prev) => prev + 1);
          }
        }

        return;
      }

      return;
    }

    // Normal mode handling
    if (
      e.key === "j" ||
      e.key === "k" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "h" ||
      e.key === "l" ||
      e.key === "0" ||
      e.key === "$" ||
      e.key === "w" ||
      e.key === "b" ||
      e.key === "g" ||
      e.key === "G" ||
      e.key === "a" ||
      e.key === "o" ||
      e.key === "O" ||
      e.key === "d" ||
      e.key === "y" ||
      e.key === "p" ||
      (e.key === "d" && e.ctrlKey) ||
      (e.key === "u" && e.ctrlKey)
    ) {
      e.preventDefault();

      // Directly handle navigation keys
      if (!vimFile) return;

      const lines = vimFile.content.split("\n");
      const maxVisibleLines = 20;
      const maxPosition = Math.max(0, lines.length - maxVisibleLines);

      // Calculate scroll threshold for comfortable viewing
      const lowerThreshold = Math.floor(maxVisibleLines * 0.4); // 40% from top
      const upperThreshold = Math.floor(maxVisibleLines * 0.6); // 60% from top

      // Handle vertical movement (up/down)
      if (
        (e.key === "j" || e.key === "ArrowDown") &&
        vimCursorLine < lines.length - 1
      ) {
        // Move cursor down
        const newCursorLine = vimCursorLine + 1;
        setVimCursorLine(newCursorLine);

        // Adjust column position if the new line is shorter than current column
        const newLineLength = lines[newCursorLine].length;
        if (newLineLength < vimCursorColumn) {
          setVimCursorColumn(Math.max(0, newLineLength));
        }

        // Auto-scroll if cursor is below the upper threshold
        if (
          newCursorLine - vimPosition > upperThreshold &&
          vimPosition < maxPosition
        ) {
          setVimPosition((prev) => Math.min(prev + 1, maxPosition));
        }
      } else if (
        (e.key === "k" || e.key === "ArrowUp") &&
        vimCursorLine > 0
      ) {
        // Move cursor up
        const newCursorLine = vimCursorLine - 1;
        setVimCursorLine(newCursorLine);

        // Adjust column position if the new line is shorter than current column
        const newLineLength = lines[newCursorLine].length;
        if (newLineLength < vimCursorColumn) {
          setVimCursorColumn(Math.max(0, newLineLength));
        }

        // Auto-scroll if cursor is above the lower threshold
        if (newCursorLine - vimPosition < lowerThreshold && vimPosition > 0) {
          setVimPosition((prev) => Math.max(prev - 1, 0));
        }
      }
      // Handle horizontal movement (left/right)
      else if (
        (e.key === "ArrowLeft" || e.key === "h") &&
        vimCursorColumn > 0
      ) {
        // Move cursor left
        setVimCursorColumn((prev) => prev - 1);
      } else if (e.key === "ArrowRight" || e.key === "l") {
        // Move cursor right, but don't go beyond the end of the line
        const currentLineLength = lines[vimCursorLine]?.length || 0;
        if (vimCursorColumn < currentLineLength) {
          setVimCursorColumn((prev) => prev + 1);
        }
      }
      // Go to start of line (0)
      else if (e.key === "0") {
        setVimCursorColumn(0);
      }
      // Go to end of line ($)
      else if (e.key === "$") {
        const currentLineLength = lines[vimCursorLine]?.length || 0;
        setVimCursorColumn(Math.max(0, currentLineLength));
      }
      // Move to next word (w)
      else if (e.key === "w") {
        const currentLine = lines[vimCursorLine] || "";
        // Find next word boundary
        const wordRegex = /\b\w/g;
        wordRegex.lastIndex = vimCursorColumn + 1; // Start from next character

        const match = wordRegex.exec(currentLine);
        if (match) {
          // Found a word boundary in current line
          setVimCursorColumn(match.index);
        } else if (vimCursorLine < lines.length - 1) {
          // Move to beginning of next line
          setVimCursorLine((prev) => prev + 1);
          setVimCursorColumn(0);

          // Auto-scroll if needed
          if (
            vimCursorLine + 1 - vimPosition > upperThreshold &&
            vimPosition < maxPosition
          ) {
            setVimPosition((prev) => Math.min(prev + 1, maxPosition));
          }
        }
      }
      // Move to previous word (b)
      else if (e.key === "b") {
        const currentLine = lines[vimCursorLine] || "";

        // If at start of line and not first line, go to end of previous line
        if (vimCursorColumn === 0 && vimCursorLine > 0) {
          setVimCursorLine((prev) => prev - 1);
          const prevLineLength = lines[vimCursorLine - 1]?.length || 0;
          setVimCursorColumn(prevLineLength);

          // Auto-scroll if needed
          if (
            vimCursorLine - 1 - vimPosition < lowerThreshold &&
            vimPosition > 0
          ) {
            setVimPosition((prev) => Math.max(prev - 1, 0));
          }
          return;
        }

        // Find previous word boundary
        let position = vimCursorColumn - 1;
        while (position > 0) {
          // Check if this position is at a word boundary
          const isWordBoundary =
            /\w/.test(currentLine[position]) &&
            (position === 0 || /\W/.test(currentLine[position - 1]));

          if (isWordBoundary) {
            setVimCursorColumn(position);
            return;
          }
          position--;
        }

        // If no word boundary found, go to start of line
        setVimCursorColumn(0);
      }
      // Go to top of file (gg)
      else if (e.key === "g") {
        // Track 'g' press for double-g (gg) command
        const now = Date.now();
        const lastGPress = lastGPressTimeRef.current;
        lastGPressTimeRef.current = now;

        // If pressed 'g' twice quickly
        if (now - lastGPress < 500) {
          setVimCursorLine(0);
          setVimCursorColumn(0);
          setVimPosition(0);
          lastGPressTimeRef.current = 0; // Reset timer
        }
      }
      // Go to bottom of file (G)
      else if (e.key === "G") {
        const lastLineIndex = Math.max(0, lines.length - 1);
        setVimCursorLine(lastLineIndex);
        setVimCursorColumn(0);

        // Update scroll position to show the last lines
        setVimPosition(Math.max(0, lines.length - maxVisibleLines));
      }
      // Page down (Ctrl+d) - move half screen down
      else if (e.key === "d" && e.ctrlKey) {
        const halfScreen = Math.floor(maxVisibleLines / 2);
        const newPosition = Math.min(vimPosition + halfScreen, maxPosition);
        setVimPosition(newPosition);

        // Move cursor down too if possible
        const newCursorLine = Math.min(
          vimCursorLine + halfScreen,
          lines.length - 1
        );
        setVimCursorLine(newCursorLine);

        // Adjust column if needed
        const newLineLength = lines[newCursorLine]?.length || 0;
        if (vimCursorColumn > newLineLength) {
          setVimCursorColumn(Math.max(0, newLineLength));
        }
      }
      // Page up (Ctrl+u) - move half screen up
      else if (e.key === "u" && e.ctrlKey) {
        const halfScreen = Math.floor(maxVisibleLines / 2);
        const newPosition = Math.max(vimPosition - halfScreen, 0);
        setVimPosition(newPosition);

        // Move cursor up too if possible
        const newCursorLine = Math.max(vimCursorLine - halfScreen, 0);
        setVimCursorLine(newCursorLine);

        // Adjust column if needed
        const newLineLength = lines[newCursorLine]?.length || 0;
        if (vimCursorColumn > newLineLength) {
          setVimCursorColumn(Math.max(0, newLineLength));
        }
      }
      // Insert after cursor (a)
      else if (e.key === "a") {
        setVimMode("insert");
        // Move cursor one position right if not at end of line
        const currentLineLength = lines[vimCursorLine]?.length || 0;
        if (vimCursorColumn < currentLineLength) {
          setVimCursorColumn((prev) => prev + 1);
        }
      }
      // Open new line below cursor (o)
      else if (e.key === "o") {
        // Insert a new line below current line
        const newLines = [...lines];
        newLines.splice(vimCursorLine + 1, 0, "");

        // Update file content
        setVimFile({
          ...vimFile,
          content: newLines.join("\n"),
        });

        // Move cursor to the beginning of the new line
        setVimCursorLine((prev) => prev + 1);
        setVimCursorColumn(0);

        // Enter insert mode
        setVimMode("insert");

        // Auto-scroll if needed
        if (
          vimCursorLine + 1 - vimPosition > upperThreshold &&
          vimPosition < maxPosition
        ) {
          setVimPosition((prev) => Math.min(prev + 1, maxPosition));
        }
      }
      // Open new line above cursor (O)
      else if (e.key === "O") {
        // Insert a new line above current line
        const newLines = [...lines];
        newLines.splice(vimCursorLine, 0, "");

        // Update file content
        setVimFile({
          ...vimFile,
          content: newLines.join("\n"),
        });

        // Keep cursor at the same line (which is now the new empty line)
        setVimCursorColumn(0);

        // Enter insert mode
        setVimMode("insert");
      }

      // Delete line (dd)
      else if (e.key === "d") {
        // Track for double-d (dd) command
        const now = Date.now();
        const lastKey = lastKeyPressRef.current;

        // Update last key press
        lastKeyPressRef.current = { key: "d", time: now };

        // If pressed 'd' twice quickly
        if (lastKey.key === "d" && now - lastKey.time < 500) {
          // Can't delete the last line - vim always keeps at least one line
          if (lines.length > 1) {
            // Copy the line to clipboard before deleting
            setVimClipboard(lines[vimCursorLine]);

            // Remove the current line
            const newLines = [...lines];
            newLines.splice(vimCursorLine, 1);

            // Update file content
            setVimFile({
              ...vimFile,
              content: newLines.join("\n"),
            });

            // Adjust cursor position if we deleted the last line
            if (vimCursorLine >= newLines.length) {
              setVimCursorLine(Math.max(0, newLines.length - 1));
            }

            // Reset column position to the start of the line
            setVimCursorColumn(0);
          } else {
            // If it's the last line, just clear it and copy its content
            setVimClipboard(lines[0]);

            // Clear the line content but keep the line
            const newLines = [""];
            setVimFile({
              ...vimFile,
              content: newLines.join("\n"),
            });

            setVimCursorColumn(0);
          }

          // Reset the last key press
          lastKeyPressRef.current = { key: "", time: 0 };
        }
      }

      // Yank (copy) line (yy)
      else if (e.key === "y") {
        // Track for double-y (yy) command
        const now = Date.now();
        const lastKey = lastKeyPressRef.current;

        // Update last key press
        lastKeyPressRef.current = { key: "y", time: now };

        // If pressed 'y' twice quickly
        if (lastKey.key === "y" && now - lastKey.time < 500) {
          // Copy the current line to clipboard
          setVimClipboard(lines[vimCursorLine]);

          // Reset the last key press
          lastKeyPressRef.current = { key: "", time: 0 };
        }
      }

      // Paste (p)
      else if (e.key === "p") {
        // Only paste if there's content in the clipboard
        if (vimClipboard) {
          const newLines = [...lines];

          // Paste after current line
          newLines.splice(vimCursorLine + 1, 0, vimClipboard);

          // Update file content
          setVimFile({
            ...vimFile,
            content: newLines.join("\n"),
          });

          // Move cursor to the next line (the pasted line)
          setVimCursorLine((prev) => prev + 1);
          setVimCursorColumn(0);

          // Auto-scroll if needed
          if (
            vimCursorLine + 1 - vimPosition > upperThreshold &&
            vimPosition < maxPosition
          ) {
            setVimPosition((prev) => Math.min(prev + 1, maxPosition));
          }
        }
      }

      return;
    } else if (e.key === "i") {
      // Enter insert mode
      e.preventDefault();
      setVimMode("insert");
      return;
    } else if (e.key === ":") {
      // Switch to command mode without adding colon to the input
      e.preventDefault();
      setVimMode("command");
      setCurrentCommand("");
      return;
    } else if (e.key === "Escape" && vimMode === "command") {
      // Return to normal mode
      setVimMode("normal");
      setCurrentCommand("");
      return;
    } else if (e.key === "Enter" && vimMode === "command") {
      // Execute command on Enter
      e.preventDefault();

      // Add colon prefix to command if needed
      const command = ":" + currentCommand;
      handleVimInput(command);
      return;
    }
  };

  return {
    isInVimMode,
    vimFile,
    vimPosition,
    vimCursorLine,
    vimCursorColumn,
    vimMode,
    handleVimInput,
    handleVimTextInput,
    handleVimKeyDown,
  };
};
