import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Game {
  id: string;
  name: string;
  path: string;
  image: string;
  year: number;
}

const DEFAULT_GAMES: Game[] = [
  {
    id: "doom",
    name: "Doom",
    path: "/assets/games/jsdos/doom.jsdos",
    image: "/assets/games/images/doom.webp",
    year: 1993,
  },
  {
    id: "simcity2000",
    name: "SimCity 2000",
    path: "/assets/games/jsdos/simcity2000.jsdos",
    image: "/assets/games/images/simcity2000.webp",
    year: 1993,
  },
  {
    id: "mario",
    name: "Mario & Luigi",
    path: "/assets/games/jsdos/mario-luigi.jsdos",
    image: "/assets/games/images/mario.webp",
    year: 1992,
  },
  {
    id: "princeofpersia",
    name: "Prince of Persia",
    path: "/assets/games/jsdos/prince.jsdos",
    image: "/assets/games/images/prince.webp",
    year: 1989,
  },
  {
    id: "aladdin",
    name: "Aladdin",
    path: "/assets/games/jsdos/aladdin.jsdos",
    image: "/assets/games/images/aladdin.webp",
    year: 1994,
  },
  {
    id: "oregontrail",
    name: "The Oregon Trail",
    path: "/assets/games/jsdos/oregon-trail.jsdos",
    image: "/assets/games/images/oregon-trail.webp",
    year: 1990,
  },
  {
    id: "commandandconquer",
    name: "Command & Conquer",
    path: "/assets/games/jsdos/command-conquer.jsdos",
    image: "/assets/games/images/command-conquer.webp",
    year: 1995,
  },
  {
    id: "atrain",
    name: "A-Train",
    path: "/assets/games/jsdos/a-train.jsdos",
    image: "/assets/games/images/a-train.webp",
    year: 1992,
  },
  {
    id: "simrefinery",
    name: "SimRefinery",
    path: "/assets/games/jsdos/simrefinery.jsdos",
    image: "/assets/games/images/simrefinery.webp",
    year: 1993,
  },
];

interface PcStoreState {
  games: Game[];
  setGames: (games: Game[]) => void;
}

export const usePcStore = create<PcStoreState>()(
  persist(
    (set) => ({
      games: DEFAULT_GAMES,
      setGames: (games) => set({ games }),
    }),
    {
      name: "ryos:pc",
      version: 6,
      partialize: (state) => ({ games: state.games }),
      migrate: () => {
        // Reset to default games on version change
        return { games: DEFAULT_GAMES };
      },
    }
  )
);

// Helper functions mirroring old API ---------------------------------
export const loadGames = (): Game[] => {
  return usePcStore.getState().games;
};

export const saveGames = (games: Game[]): void => {
  usePcStore.getState().setGames(games);
};
