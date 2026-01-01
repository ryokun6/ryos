import { create } from "zustand";
import { createPersistedStore, type PersistedStoreMeta } from "./persistAdapter";

export interface Game {
  id: string;
  name: string;
  path: string;
  image: string;
}

const DEFAULT_GAMES: Game[] = [
  {
    id: "doom",
    name: "Doom",
    path: "/assets/games/jsdos/doom.jsdos",
    image: "/assets/games/images/doom.webp",
  },
  {
    id: "simcity2000",
    name: "SimCity 2000",
    path: "/assets/games/jsdos/simcity2000.jsdos",
    image: "/assets/games/images/simcity2000.webp",
  },
  {
    id: "mario",
    name: "Mario & Luigi",
    path: "/assets/games/jsdos/mario-luigi.jsdos",
    image: "/assets/games/images/mario.webp",
  },
  {
    id: "ageofempires",
    name: "Age of Empires",
    path: "/assets/games/jsdos/aoe.jsdos",
    image: "/assets/games/images/aoe.webp",
  },
  {
    id: "ageofempires2",
    name: "Age of Empires II",
    path: "/assets/games/jsdos/aoe2.jsdos",
    image: "/assets/games/images/aoe2.webp",
  },
  {
    id: "princeofpersia",
    name: "Prince of Persia",
    path: "/assets/games/jsdos/prince.jsdos",
    image: "/assets/games/images/prince.webp",
  },
  {
    id: "aladdin",
    name: "Aladdin",
    path: "/assets/games/jsdos/aladdin.jsdos",
    image: "/assets/games/images/aladdin.webp",
  },
  {
    id: "oregontrail",
    name: "The Oregon Trail",
    path: "/assets/games/jsdos/oregon-trail.jsdos",
    image: "/assets/games/images/oregon-trail.webp",
  },
  {
    id: "commandandconquer",
    name: "Command & Conquer",
    path: "/assets/games/jsdos/command-conquer.jsdos",
    image: "/assets/games/images/command-conquer.webp",
  },
];

interface PcStoreState extends PersistedStoreMeta {
  games: Game[];
  setGames: (games: Game[]) => void;
}

export const usePcStore = create<PcStoreState>()(
  createPersistedStore(
    (set) => ({
      games: DEFAULT_GAMES,
      _updatedAt: Date.now(),
      setGames: (games) => set({ games, _updatedAt: Date.now() }),
    }),
    {
      name: "ryos:pc",
      partialize: (state) => ({
        games: state.games,
        _updatedAt: state._updatedAt,
      }),
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