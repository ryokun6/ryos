import type { ReactNode } from "react";
import { VimState } from "../types";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderLineWithHighlights(
  line: string,
  searchPattern: string | undefined
): ReactNode {
  if (!searchPattern || searchPattern.length === 0) return line;
  try {
    const re = new RegExp(escapeRegex(searchPattern), "gi");
    const parts: { text: string; highlight: boolean }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      parts.push({ text: line.slice(last, m.index), highlight: false });
      parts.push({ text: m[0], highlight: true });
      last = m.index + m[0].length;
    }
    parts.push({ text: line.slice(last), highlight: false });
    return (
      <>
        {parts.map((p, i) =>
          p.highlight ? (
            <span key={i} className="bg-yellow-600/60 text-black">
              {p.text}
            </span>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
      </>
    );
  } catch {
    return line;
  }
}

interface VimEditorProps {
  file: { name: string; content: string };
  position: number;
  vimCursorLine: number;
  vimCursorColumn: number;
  vimMode: VimState["mode"];
  searchPattern?: string;
  visualStartLine?: number | null;
}

export function VimEditor({
  file,
  position,
  vimCursorLine,
  vimCursorColumn,
  vimMode,
  searchPattern,
  visualStartLine,
}: VimEditorProps) {
  const lines = file.content.split("\n");
  const maxVisibleLines = 20; // Show up to 20 lines at a time

  // Get the visible lines based on the current position
  const visibleLines = lines.slice(position, position + maxVisibleLines);

  // Fill with empty lines if there are fewer lines than maxVisibleLines
  while (visibleLines.length < maxVisibleLines) {
    visibleLines.push("~");
  }

  // Calculate percentage through the file
  const percentage =
    lines.length > 0
      ? Math.min(
          100,
          Math.floor(((position + maxVisibleLines) / lines.length) * 100)
        )
      : 100;

  const modeLabel =
    vimMode === "normal"
      ? "NORMAL"
      : vimMode === "insert"
        ? "INSERT"
        : vimMode === "command"
          ? "COMMAND"
          : vimMode === "search"
            ? "SEARCH"
            : vimMode === "visual"
              ? "VISUAL"
              : "NORMAL";

  return (
    <div className="vim-editor font-monaco text-white">
      {visibleLines.map((line, i) => {
        const lineNumber = position + i;
        const isFiller = line === "~" && lineNumber >= lines.length;
        const isCursorLine = !isFiller && lineNumber === vimCursorLine;
        const isVisualSelected =
          vimMode === "visual" &&
          visualStartLine != null &&
          !isFiller &&
          lineNumber >= Math.min(visualStartLine, vimCursorLine) &&
          lineNumber <= Math.max(visualStartLine, vimCursorLine);

        return (
          <div
            key={i}
            className={`vim-line flex ${isCursorLine ? "bg-white/10" : ""} ${isVisualSelected ? "bg-blue-900/40" : ""}`}
          >
            <span className="text-gray-500 w-6 text-right mr-2 shrink-0">
              {isFiller ? "" : lineNumber + 1}
            </span>
            {isCursorLine ? (
              // Render line with cursor
              <span className="select-text flex-1">
                {line.substring(0, vimCursorColumn)}
                <span className="bg-orange-300 text-black">
                  {line.charAt(vimCursorColumn) || " "}
                </span>
                {line.substring(vimCursorColumn + 1)}
              </span>
            ) : (
              // Render line (with optional search highlights)
              <span className="select-text flex-1">
                {renderLineWithHighlights(line, searchPattern)}
              </span>
            )}
          </div>
        );
      })}
      <div className="vim-status-bar flex text-white text-xs mt-2">
        <div
          className={`px-2 py-1 font-bold ${
            vimMode === "insert" ? "bg-green-600/50" : "bg-blue-600/50"
          }`}
        >
          {modeLabel}
        </div>
        <div className="flex-1 bg-white/10 px-2 py-1 flex items-center justify-between">
          <span className="flex-1 mx-2">[{file.name}]</span>
          <span>{percentage}%</span>
          <span className="ml-4 mr-2">
            {vimCursorLine + 1}:{vimCursorColumn + 1}
          </span>
        </div>
      </div>
    </div>
  );
}