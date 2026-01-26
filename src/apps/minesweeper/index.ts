export const appMetadata = {
  name: "Minesweeper",
  version: "1.0.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/minesweeper.png",
};

export const helpItems = [
  {
    icon: "🖱️",
    title: "Desktop Controls",
    description:
      "Left-click to reveal, right-click to flag, double-click numbers to auto-reveal neighbors.",
  },
  {
    icon: "📱",
    title: "Mobile Controls",
    description: "Tap to reveal, long-press to flag a mine.",
  },
  {
    icon: "📖",
    title: "Game Rules",
    description:
      "Numbers show adjacent mines. Flag every mine and reveal all safe cells to win.",
  },
  {
    icon: "💣",
    title: "Mine Counter",
    description: "Top bar shows remaining unflagged mines and total mine count.",
  },
  {
    icon: "🙂",
    title: "Game Status",
    description:
      "The smiley face shows game state: 🙂 playing, 💀 game over, 😎 you won!",
  },
  {
    icon: "🔄",
    title: "Restart",
    description:
      "Press the smiley face or choose File ▸ New Game to start a fresh board.",
  },
];
