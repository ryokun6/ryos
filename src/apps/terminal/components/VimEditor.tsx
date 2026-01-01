
import { VimState } from "../types";

interface VimEditorProps {
  file: { name: string; content: string };
  position: number;
  vimCursorLine: number;
  vimCursorColumn: number;
  vimMode: VimState["mode"];
  isDirty?: boolean;
  isNewFile?: boolean;
}

export function VimEditor({
  file,
  position,
  vimCursorLine,
  vimCursorColumn,
  vimMode,
  isDirty = false,
  isNewFile = false,
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

  return (
    <div className="vim-editor font-monaco text-white">
      {visibleLines.map((line, i) => {
        const lineNumber = position + i;
        const isCursorLine = lineNumber === vimCursorLine;

        return (
          <div
            key={i}
            className={`vim-line flex ${isCursorLine ? "bg-white/10" : ""}`}
          >
            <span className="text-gray-500 w-6 text-right mr-2">
              {lineNumber + 1}
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
              // Render line without cursor
              <span className="select-text flex-1">{line}</span>
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
          {vimMode === "normal"
            ? "NORMAL"
            : vimMode === "insert"
            ? "INSERT"
            : "COMMAND"}
        </div>
        <div className="flex-1 bg-white/10 px-2 py-1 flex items-center justify-between">
          <span className="flex-1 mx-2">
            [{file.name}]
            <span className="ml-2 text-gray-200 text-xs">
              {isNewFile ? "[New]" : ""}
              {isDirty ? " [+]" : ""}
            </span>
          </span>
          <span>{percentage}%</span>
          <span className="ml-4 mr-2">
            {vimCursorLine + 1}:{vimCursorColumn + 1}
          </span>
        </div>
      </div>
    </div>
  );
}