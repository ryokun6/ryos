import { useState, useCallback } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { MinesweeperMenuBar } from "./MinesweeperMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { helpItems, appMetadata } from "..";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";

const BOARD_SIZE = 9;
const MINES_COUNT = 10;

type CellContent = {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  neighborMines: number;
};

function useLongPress(
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void,
  onClick: () => void,
  { shouldPreventDefault = true, delay = 500 } = {}
) {
  const [longPressTriggered, setLongPressTriggered] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout>();

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (shouldPreventDefault && e.target) {
        e.preventDefault();
      }
      const timer = setTimeout(() => {
        onLongPress(e);
        setLongPressTriggered(true);
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
      if (shouldTriggerClick && !longPressTriggered && onClick) {
        onClick();
      }
      setLongPressTriggered(false);
    },
    [onClick, timeoutId, longPressTriggered]
  );

  return {
    onMouseDown: (e: React.MouseEvent) => start(e),
    onTouchStart: (e: React.TouchEvent) => start(e),
    onMouseUp: (e: React.MouseEvent) => clear(e),
    onMouseLeave: (e: React.MouseEvent) => clear(e, false),
    onTouchEnd: (e: React.TouchEvent) => clear(e),
  };
}

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

function Cell({
  cell,
  rowIndex,
  colIndex,
  onCellClick,
  onCellRightClick,
  disabled,
}: CellProps) {
  const longPressHandlers = useLongPress(
    (e) => onCellRightClick(e, rowIndex, colIndex),
    () => onCellClick(rowIndex, colIndex, false),
    { delay: 500 }
  );

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (cell.isRevealed && cell.neighborMines > 0) {
      onCellClick(rowIndex, colIndex, true);
    }
  };

  return (
    <button
      key={`${rowIndex}-${colIndex}`}
      className={`w-7 h-7 flex items-center justify-center text-sm font-bold rounded-none select-none touch-none
        ${
          cell.isRevealed
            ? "bg-[#d1d1d1] border border-t-gray-600 border-l-gray-600 border-r-[#f0f0f0] border-b-[#f0f0f0]"
            : "bg-[#c0c0c0] border-2 border-t-white border-l-white border-r-gray-800 border-b-gray-800 hover:bg-[#d0d0d0] active:border active:border-gray-600"
        }`}
      {...longPressHandlers}
      onContextMenu={(e) => onCellRightClick(e, rowIndex, colIndex)}
      onDoubleClick={handleDoubleClick}
      disabled={disabled}
    >
      {cell.isRevealed ? (
        cell.isMine ? (
          "💣"
        ) : cell.neighborMines > 0 ? (
          <span
            className={`text-${getNumberColor(cell.neighborMines)} text-lg`}
          >
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
}: AppProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isNewGameDialogOpen, setIsNewGameDialogOpen] = useState(false);
  const [gameBoard, setGameBoard] = useState<CellContent[][]>(() =>
    initializeBoard()
  );
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [remainingMines, setRemainingMines] = useState(MINES_COUNT);

  // Add sound effects
  const { play: playClick } = useSound(Sounds.CLICK, 0.3);
  const { play: playMineHit } = useSound(Sounds.ALERT_BONK, 0.3);
  const { play: playGameWin } = useSound(Sounds.ALERT_INDIGO, 0.3);
  const { play: playFlag } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const vibrateFlag = useVibration(100, 50);

  function initializeBoard(): CellContent[][] {
    const board = Array(BOARD_SIZE)
      .fill(null)
      .map(() =>
        Array(BOARD_SIZE)
          .fill(null)
          .map(() => ({
            isMine: false,
            isRevealed: false,
            isFlagged: false,
            neighborMines: 0,
          }))
      );

    // Place mines randomly
    let minesPlaced = 0;
    while (minesPlaced < MINES_COUNT) {
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const col = Math.floor(Math.random() * BOARD_SIZE);
      if (!board[row][col].isMine) {
        board[row][col].isMine = true;
        minesPlaced++;
      }
    }

    // Calculate neighbor mines
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (!board[row][col].isMine) {
          let count = 0;
          for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
              const newRow = row + i;
              const newCol = col + j;
              if (
                newRow >= 0 &&
                newRow < BOARD_SIZE &&
                newCol >= 0 &&
                newCol < BOARD_SIZE &&
                board[newRow][newCol].isMine
              ) {
                count++;
              }
            }
          }
          board[row][col].neighborMines = count;
        }
      }
    }

    return board;
  }

  function handleCellClick(
    row: number,
    col: number,
    isDoubleClick: boolean = false
  ) {
    if (gameOver || gameWon || gameBoard[row][col].isFlagged) return;

    const newBoard = [...gameBoard.map((row) => [...row])];

    if (
      isDoubleClick &&
      newBoard[row][col].isRevealed &&
      newBoard[row][col].neighborMines > 0
    ) {
      // Check if the number of flags around matches the number
      let flagCount = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const newRow = row + i;
          const newCol = col + j;
          if (
            newRow >= 0 &&
            newRow < BOARD_SIZE &&
            newCol >= 0 &&
            newCol < BOARD_SIZE &&
            newBoard[newRow][newCol].isFlagged
          ) {
            flagCount++;
          }
        }
      }

      // If flags match the number, reveal all non-flagged adjacent cells
      if (flagCount === newBoard[row][col].neighborMines) {
        playClick();
        let hitMine = false;
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            const newRow = row + i;
            const newCol = col + j;
            if (
              newRow >= 0 &&
              newRow < BOARD_SIZE &&
              newCol >= 0 &&
              newCol < BOARD_SIZE &&
              !newBoard[newRow][newCol].isFlagged &&
              !newBoard[newRow][newCol].isRevealed
            ) {
              if (newBoard[newRow][newCol].isMine) {
                hitMine = true;
              }
              revealCell(newBoard, newRow, newCol);
            }
          }
        }

        if (hitMine) {
          playMineHit();
          revealAllMines(newBoard);
          setGameOver(true);
          return;
        }
      }
      setGameBoard(newBoard);
      checkWinCondition(newBoard);
      return;
    }

    if (newBoard[row][col].isMine) {
      // Game Over
      playMineHit();
      revealAllMines(newBoard);
      setGameOver(true);
      return;
    }

    playClick();
    revealCell(newBoard, row, col);
    setGameBoard(newBoard);
    checkWinCondition(newBoard);
  }

  function handleCellRightClick(
    e: React.MouseEvent | React.TouchEvent,
    row: number,
    col: number
  ) {
    if (e instanceof MouseEvent || "button" in e) {
      e.preventDefault();
    }
    if (gameOver || gameWon || gameBoard[row][col].isRevealed) return;

    playFlag();
    const newBoard = [...gameBoard.map((row) => [...row])];
    const newFlagState = !newBoard[row][col].isFlagged;
    newBoard[row][col].isFlagged = newFlagState;
    setGameBoard(newBoard);
    setRemainingMines((prev) =>
      newFlagState ? prev - 1 : prev + 1
    );
    if (newFlagState) {
      vibrateFlag();
    }
  }

  function revealCell(board: CellContent[][], row: number, col: number) {
    if (
      row < 0 ||
      row >= BOARD_SIZE ||
      col < 0 ||
      col >= BOARD_SIZE ||
      board[row][col].isRevealed ||
      board[row][col].isFlagged
    ) {
      return;
    }

    board[row][col].isRevealed = true;

    if (board[row][col].neighborMines === 0) {
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          revealCell(board, row + i, col + j);
        }
      }
    }
  }

  function revealAllMines(board: CellContent[][]) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col].isMine) {
          board[row][col].isRevealed = true;
        }
      }
    }
    setGameBoard(board);
  }

  function checkWinCondition(board: CellContent[][]) {
    const allNonMinesRevealed = board.every((row) =>
      row.every((cell) => cell.isMine || cell.isRevealed)
    );
    if (allNonMinesRevealed) {
      playGameWin();
      setGameWon(true);
    }
  }

  function startNewGame() {
    setGameBoard(initializeBoard());
    setGameOver(false);
    setGameWon(false);
    setIsNewGameDialogOpen(false);
    setRemainingMines(MINES_COUNT);
  }

  if (!isWindowOpen) return null;

  return (
    <>
      <MinesweeperMenuBar
        onClose={onClose}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
        onNewGame={() => setIsNewGameDialogOpen(true)}
      />
      <WindowFrame
        title="Minesweeper"
        onClose={onClose}
        isForeground={isForeground}
        appId="minesweeper"
        skipInitialSound={skipInitialSound}
        windowConstraints={{
          minWidth: 270,
          maxWidth: 270,
          minHeight: 360,
        }}
      >
        <div className="flex flex-col h-full bg-[#c0c0c0] p-1.5 w-full">
          <div className="mb-1.5 flex justify-between items-center gap-2 py-1 bg-[#c0c0c0]">
            <div className="flex-1 bg-[#8a9a8a] text-[#1a2a1a] text-lg px-2 py-0.5 border border-t-gray-800 border-l-gray-800 border-r-white border-b-white shadow-inner [text-shadow:1px_1px_0px_rgba(0,0,0,0.2)] h-[48px] flex items-center">
              <div className="flex items-center justify-between text-sm relative w-full">
                <div className="flex flex-col items-start w-[80px]">
                  <span className="font-[ChicagoKare] text-lg leading-none mt-1">
                    {remainingMines}
                  </span>
                  <span className="font-[Geneva-9] text-[16px] mt-[-6px]">
                    Left
                  </span>
                </div>
                <div className="flex flex-col items-center absolute left-1/2 -translate-x-1/2">
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
                </div>
                <div className="flex flex-col items-end w-[80px]">
                  <span className="font-[ChicagoKare] text-lg leading-none mt-1">
                    {MINES_COUNT}
                  </span>
                  <span className="font-[Geneva-9] text-[16px] mt-[-6px]">
                    Total
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-9 gap-0 bg-gray-800 p-[1px] border border-t-gray-800 border-l-gray-800 border-r-white border-b-white  max-w-[250px] m-auto">
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
          helpItems={helpItems || []}
          appName="Minesweeper"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={
            appMetadata || {
              name: "Minesweeper",
              version: "1.0.0",
              creator: { name: "Ryo", url: "https://github.com/ryokun6" },
              github: "https://github.com/ryokun6/ryos",
              icon: "/icons/minesweeper.png",
            }
          }
        />
        <ConfirmDialog
          isOpen={isNewGameDialogOpen}
          onOpenChange={setIsNewGameDialogOpen}
          onConfirm={startNewGame}
          title="New Game"
          description="Are you sure you want to start a new game?"
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
