import { useState, useCallback, useRef } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { MinesweeperMenuBar } from "./MinesweeperMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { appMetadata } from "..";
import { isMobileDevice } from "@/utils/device";
import { getTranslatedAppName } from "@/utils/i18n";
import {
  useMinesweeperLogic,
  type CellContent,
} from "../hooks/useMinesweeperLogic";

type CellProps = {
  cell: CellContent;
  rowIndex: number;
  colIndex: number;
  onCellClick: (row: number, col: number, isDoubleClick?: boolean) => void;
  onCellRightClick: (
    e: React.MouseEvent | React.TouchEvent,
    row: number,
    col: number
  ) => void;
  disabled: boolean;
};

function useLongPress(
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void,
  onClick: () => void,
  { shouldPreventDefault = false, delay = 500 } = {}
) {
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout>();
  const longPressTriggeredRef = useRef(false);
  const lastButtonRef = useRef<number | null>(null);
  const lastWasTouchRef = useRef(false);

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (shouldPreventDefault && e.target) {
        e.preventDefault();
      }
      longPressTriggeredRef.current = false;

      if ("touches" in e) {
        lastWasTouchRef.current = true;
        lastButtonRef.current = null;
      } else {
        const me = e as React.MouseEvent;
        lastWasTouchRef.current = false;
        lastButtonRef.current = typeof me.button === "number" ? me.button : 0;
      }

      const timer = setTimeout(() => {
        onLongPress(e);
        longPressTriggeredRef.current = true;
      }, delay);
      setTimeoutId(timer);
    },
    [onLongPress, delay, shouldPreventDefault]
  );

  const clear = useCallback(
    (_: React.TouchEvent | React.MouseEvent, shouldTriggerClick = true) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setTimeoutId(undefined);

      const isRightClick = lastButtonRef.current === 2;
      const allowClick =
        shouldTriggerClick &&
        !longPressTriggeredRef.current &&
        (lastWasTouchRef.current || !isRightClick);

      if (allowClick) {
        onClick();
      }

      setTimeout(() => {
        longPressTriggeredRef.current = false;
        lastButtonRef.current = null;
        lastWasTouchRef.current = false;
      }, 100);
    },
    [onClick, timeoutId]
  );

  return {
    onMouseDown: (e: React.MouseEvent) => start(e),
    onTouchStart: (e: React.TouchEvent) => start(e),
    onMouseUp: (e: React.MouseEvent) => clear(e),
    onMouseLeave: (e: React.MouseEvent) => clear(e, false),
    onTouchEnd: (e: React.TouchEvent) => clear(e),
  };
}

function Cell({
  cell,
  rowIndex,
  colIndex,
  onCellClick,
  onCellRightClick,
  disabled,
}: CellProps) {
  const handleClick = () => {
    if (isMobileDevice() && cell.isRevealed && cell.neighborMines > 0) {
      onCellClick(rowIndex, colIndex, true);
    } else {
      onCellClick(rowIndex, colIndex, false);
    }
  };

  const longPressHandlers = useLongPress(
    (e) => onCellRightClick(e, rowIndex, colIndex),
    handleClick,
    { delay: 500, shouldPreventDefault: false }
  );

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isMobileDevice() && cell.isRevealed && cell.neighborMines > 0) {
      onCellClick(rowIndex, colIndex, true);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onCellRightClick(e, rowIndex, colIndex);
  };

  return (
    <button
      key={`${rowIndex}-${colIndex}`}
      className={`w-7 h-7 flex items-center justify-center text-sm font-bold rounded-none select-none touch-none minesweeper-cell
        ${cell.isRevealed ? "minesweeper-revealed" : "minesweeper-hidden"}`}
      {...longPressHandlers}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      disabled={disabled}
    >
      {cell.isRevealed ? (
        cell.isMine ? (
          "💣"
        ) : cell.neighborMines > 0 ? (
          <span className={`text-${getNumberColor(cell.neighborMines)} text-lg`}>
            {cell.neighborMines}
          </span>
        ) : null
      ) : cell.isFlagged ? (
        "🚩"
      ) : null}
    </button>
  );
}

export function MinesweeperAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isNewGameDialogOpen,
    setIsNewGameDialogOpen,
    gameBoard,
    gameOver,
    gameWon,
    remainingMines,
    totalMines,
    minesweeperStyles,
    isXpTheme,
    isMacTheme,
    handleCellClick,
    handleCellRightClick,
    startNewGame,
  } = useMinesweeperLogic();

  const menuBar = (
    <MinesweeperMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onNewGame={() => setIsNewGameDialogOpen(true)}
    />
  );

  if (!isWindowOpen) return null;

  const displayPanelStyle = isMacTheme
    ? {
        border: "1px solid rgba(0, 0, 0, 0.55)",
        boxShadow:
          "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.35)",
      }
    : undefined;

  const boardFrameStyle = isMacTheme
    ? {
        border: "1px solid rgba(0, 0, 0, 0.55)",
        boxShadow:
          "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
      }
    : undefined;

  return (
    <>
      <style>{minesweeperStyles}</style>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getTranslatedAppName("minesweeper")}
        onClose={onClose}
        isForeground={isForeground}
        appId="minesweeper"
        material={isMacTheme ? "brushedmetal" : "default"}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        windowConstraints={{
          minWidth: 270,
          maxWidth: 270,
          minHeight: 360,
        }}
      >
        <div
          className={cn(
            "flex flex-col h-full w-full",
            isMacTheme
              ? "bg-transparent px-1.5 pb-1.5 pt-0.5 gap-1"
              : "bg-[#c0c0c0] p-1.5"
          )}
        >
          <div
            className={cn(
              "flex justify-between items-center gap-2",
              isMacTheme ? "py-0.5" : "mb-1.5 py-1 bg-[#c0c0c0]"
            )}
          >
            <div
              className={cn(
                "flex-1 text-lg border shadow-inner flex items-center",
                isMacTheme
                  ? "rounded-[4px] bg-gradient-to-b from-[#b5c4b9] to-[#7b8c80] text-[#152418] h-[44px] px-1.5 py-0.5"
                  : "py-0.5 bg-[#8a9a8a] text-[#1a2a1a] border-t-gray-800 border-l-gray-800 border-r-white border-b-white [text-shadow:1px_1px_0px_rgba(0,0,0,0.2)]"
              )}
              style={displayPanelStyle}
            >
              <div className="flex items-center justify-between text-sm relative w-full">
                <div className="flex flex-col items-start w-[80px]">
                  <span
                    className={`font-[ChicagoKare] text-lg leading-none ${
                      isMacTheme ? "mt-0 mb-1" : "mt-1"
                    }`}
                  >
                    {remainingMines}
                  </span>
                  <span
                    className={`font-[Geneva-9] ${
                      isMacTheme ? "text-xs" : "text-[16px]"
                    } mt-[-6px]`}
                  >
                    {t("apps.minesweeper.lcd.left")}
                  </span>
                </div>
                <div className="flex flex-col items-center absolute left-1/2 -translate-x-1/2">
                  {isMacTheme ? (
                    <button
                      type="button"
                      onClick={() =>
                        gameOver || gameWon
                          ? startNewGame()
                          : setIsNewGameDialogOpen(true)
                      }
                      className="metal-inset-btn !w-[36px] !h-[36px] !min-w-[36px] !rounded-full overflow-hidden flex items-center justify-center text-xl leading-none !p-0"
                      aria-label={t("apps.minesweeper.dialogs.newGameTitle")}
                    >
                      {gameOver ? "💀" : gameWon ? "😎" : "🙂"}
                    </button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() =>
                        gameOver || gameWon
                          ? startNewGame()
                          : setIsNewGameDialogOpen(true)
                      }
                      className="aspect-square h-[34px] flex items-center justify-center text-xl leading-none bg-[#c0c0c0] hover:bg-[#d0d0d0] border-2 border-t-white border-l-white border-r-gray-800 border-b-gray-800 active:border active:border-gray-600 shadow-none p-0"
                    >
                      {gameOver ? "💀" : gameWon ? "😎" : "🙂"}
                    </Button>
                  )}
                </div>
                <div className="flex flex-col items-end w-[80px]">
                  <span
                    className={`font-[ChicagoKare] text-lg leading-none ${
                      isMacTheme ? "mt-0 mb-1" : "mt-1"
                    }`}
                  >
                    {totalMines}
                  </span>
                  <span
                    className={`font-[Geneva-9] ${
                      isMacTheme ? "text-xs" : "text-[16px]"
                    } mt-[-6px]`}
                  >
                    {t("apps.minesweeper.lcd.total")}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div
            className={cn(
              "grid grid-cols-9 gap-0 m-auto w-fit",
              isMacTheme
                ? "p-[2px] rounded-[4px] bg-[#b7bcc1]"
                : "bg-gray-800 p-[1px] border border-t-gray-800 border-l-gray-800 border-r-white border-b-white max-w-[250px]"
            )}
            style={boardFrameStyle}
          >
            {gameBoard.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <Cell
                  key={`${rowIndex}-${colIndex}`}
                  cell={cell}
                  rowIndex={rowIndex}
                  colIndex={colIndex}
                  onCellClick={handleCellClick}
                  onCellRightClick={handleCellRightClick}
                  disabled={gameOver || gameWon}
                />
              ))
            )}
          </div>
        </div>
        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="minesweeper"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={
            appMetadata || {
              name: "Minesweeper",
              version: "1.0.0",
              creator: { name: "Ryo Lu", url: "https://ryo.lu" },
              github: "https://github.com/ryokun6/ryos",
              icon: "/icons/default/minesweeper.png",
            }
          }
          appId="minesweeper"
        />
        <ConfirmDialog
          isOpen={isNewGameDialogOpen}
          onOpenChange={setIsNewGameDialogOpen}
          onConfirm={startNewGame}
          title={t("apps.minesweeper.dialogs.newGameTitle")}
          description={t("apps.minesweeper.dialogs.newGameDescription")}
        />
      </WindowFrame>
    </>
  );
}

function getNumberColor(num: number): string {
  const colors = [
    "",
    "blue-600",
    "green-600",
    "red-600",
    "purple-600",
    "red-800",
    "cyan-600",
    "black",
    "gray-600",
  ];
  return colors[num] || "black";
}
