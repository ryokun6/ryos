import type { SpotlightResult } from "@/hooks/useSpotlightSearch";

export type SpotlightResultWithIndex = SpotlightResult & { globalIndex: number };

export type SpotlightResultGroup = {
  type: SpotlightResult["type"];
  items: SpotlightResultWithIndex[];
};
