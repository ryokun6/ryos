import type { Applet } from "../../utils/appletActions";
import type { useAppletActions } from "../../utils/appletActions";

type AppletActions = ReturnType<typeof useAppletActions>;

const seededRandom = (seed: number) => {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
};

const deterministicShuffle = <T extends { id: string }>(
  array: T[],
  sessionSeed: number,
  categorySeed: number
): T[] => {
  if (array.length === 0) return array;

  const seed = (sessionSeed + categorySeed) % 1000000;
  const random = seededRandom(seed);

  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export function sortAppletsForFeed(
  allApplets: Applet[],
  actions: AppletActions,
  sessionSeed: number
): Applet[] {
  const featured: Applet[] = [];
  const withUpdates: Applet[] = [];
  const notInstalled: Applet[] = [];
  const others: Applet[] = [];

  allApplets.forEach((applet: Applet) => {
    const installed = actions.isAppletInstalled(applet.id);
    const needsUpdate = actions.needsUpdate(applet);
    const isFeatured = applet.featured === true;

    if (isFeatured) {
      featured.push(applet);
    } else if (needsUpdate && installed) {
      withUpdates.push(applet);
    } else if (!installed) {
      notInstalled.push(applet);
    } else {
      others.push(applet);
    }
  });

  return [
    ...deterministicShuffle(featured, sessionSeed, 1),
    ...deterministicShuffle(withUpdates, sessionSeed, 2),
    ...deterministicShuffle(notInstalled, sessionSeed, 3),
    ...deterministicShuffle(others, sessionSeed, 4),
  ];
}
