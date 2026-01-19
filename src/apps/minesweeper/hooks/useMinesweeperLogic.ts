import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { helpItems } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeStore } from "@/stores/useThemeStore";

const BOARD_SIZE = 9;
const MINES_COUNT = 10;

export type CellContent = {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  neighborMines: number;
};

const minesweeperStyles = `
  .minesweeper-cell {
    font-size: 11px !important;
    box-sizing: border-box !important;
    border: none !important;
    background: #c0c0c0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  .minesweeper-hidden {
    border: none !important;
    /* 98.css raised look */
    box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #ffffff,
      inset -2px -2px grey, inset 2px 2px #dfdfdf !important;
  }
  .minesweeper-hidden:hover {
    background-color: #d0d0d0 !important;
  }
  .minesweeper-hidden:active {
    /* pressed look */
    box-shadow: inset -1px -1px #ffffff, inset 1px 1px #0a0a0a,
      inset -2px -2px #dfdfdf, inset 2px 2px grey !important;
  }
  .minesweeper-cell:focus {
    outline: 1px dotted #000 !important;
    outline-offset: -4px !important;
  }
  .minesweeper-revealed {
    background: #d1d1d1 !important;
    border-top: 1px solid #808080 !important;
    border-left: 1px solid #808080 !important;
    border-right: 1px solid #f0f0f0 !important;
    border-bottom: 1px solid #f0f0f0 !important;
  }
`;

export function useMinesweeperLogic() {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems(
    "minesweeper",
    helpItems || []
  );
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isNewGameDialogOpen, setIsNewGameDialogOpen] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [remainingMines, setRemainingMines] = useState(MINES_COUNT);

  const initializeBoard = useCallback((): CellContent[][] => {
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

    let minesPlaced = 0;
    while (minesPlaced < MINES_COUNT) {
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const col = Math.floor(Math.random() * BOARD_SIZE);
      if (!board[row][col].isMine) {
        board[row][col].isMine = true;
        minesPlaced++;
      }
    }

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
  }, []);

  const [gameBoard, setGameBoard] = useState<CellContent[][]>(() =>
    initializeBoard()
  );

  const { play: playClick } = useSound(Sounds.CLICK, 0.3);
  const { play: playMineHit } = useSound(Sounds.ALERT_BONK, 0.3);
  const { play: playGameWin } = useSound(Sounds.ALERT_INDIGO, 0.3);
  const { play: playFlag } = useSound(Sounds.BUTTON_CLICK, 0.3);

  const revealCell = useCallback(function revealCell(
    board: CellContent[][],
    row: number,
    col: number
  ) {
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
  }, []);

  const revealAllMines = useCallback((board: CellContent[][]) => {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col].isMine) {
          board[row][col].isRevealed = true;
        }
      }
    }
    setGameBoard(board);
  }, []);

  const checkWinCondition = useCallback(
    (board: CellContent[][]) => {
      const allNonMinesRevealed = board.every((row) =>
        row.every((cell) => cell.isMine || cell.isRevealed)
      );
      if (allNonMinesRevealed) {
        playGameWin();
        setGameWon(true);
      }
    },
    [playGameWin]
  );

  const handleCellClick = useCallback(
    (row: number, col: number, isDoubleClick: boolean = false) => {
      if (gameOver || gameWon || gameBoard[row][col].isFlagged) return;

      const newBoard = [...gameBoard.map((row) => [...row])];

      if (
        isDoubleClick &&
        newBoard[row][col].isRevealed &&
        newBoard[row][col].neighborMines > 0
      ) {
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
        playMineHit();
        revealAllMines(newBoard);
        setGameOver(true);
        return;
      }

      playClick();
      revealCell(newBoard, row, col);
      setGameBoard(newBoard);
      checkWinCondition(newBoard);
    },
    [
      gameBoard,
      gameOver,
      gameWon,
      playClick,
      playMineHit,
      revealAllMines,
      revealCell,
      checkWinCondition,
    ]
  );

  const handleCellRightClick = useCallback(
    (e: React.MouseEvent | React.TouchEvent, row: number, col: number) => {
      if (e instanceof MouseEvent || "button" in e) {
        e.preventDefault();
      }
      if (gameOver || gameWon || gameBoard[row][col].isRevealed) return;

      playFlag();
      const newBoard = [...gameBoard.map((row) => [...row])];
      newBoard[row][col].isFlagged = !newBoard[row][col].isFlagged;
      setGameBoard(newBoard);
      setRemainingMines((prev) =>
        newBoard[row][col].isFlagged ? prev - 1 : prev + 1
      );
    },
    [gameBoard, gameOver, gameWon, playFlag]
  );

  const startNewGame = useCallback(() => {
    setGameBoard(initializeBoard());
    setGameOver(false);
    setGameWon(false);
    setIsNewGameDialogOpen(false);
    setRemainingMines(MINES_COUNT);
  }, [initializeBoard]);

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  return {
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
    totalMines: MINES_COUNT,
    minesweeperStyles,
    isXpTheme,
    isMacTheme,
    handleCellClick,
    handleCellRightClick,
    startNewGame,
  };
}
