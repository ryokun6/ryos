export const appMetadata = {
  name: "Minesweeper",
  version: "1.0.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/minesweeper-app.png",
};

export const helpItems = [
  {
    icon: "🖱️",
    title: "Desktop Controls",
    description:
      "Left-click to reveal a cell, right-click to flag a suspected mine",
  },
  {
    icon: "📱",
    title: "Mobile Controls",
    description: "Tap to reveal, long-press to flag — works great on phones and tablets",
  },
  {
    icon: "⚡",
    title: "Chord Reveal",
    description:
      "Double-click a numbered cell with the right flags to auto-clear all safe neighbors",
  },
  {
    icon: "💣",
    title: "Mine Counter & Timer",
    description: "The top bar tracks remaining unflagged mines and your elapsed time",
  },
  {
    icon: "🙂",
    title: "Smiley Status",
    description:
      "The smiley shows your game state: 🙂 playing, 💀 boom, 😎 victory",
  },
  {
    icon: "🔄",
    title: "Quick Restart",
    description:
      "Click the smiley or use File ▸ New Game any time to deal a fresh board",
  },
];
