import type { SpotlightResult } from "@/hooks/useSpotlightSearch";
import { SECTION_TYPE_ORDER } from "./constants";
import type { SpotlightResultGroup } from "./types";

export function groupSpotlightResults(
  results: SpotlightResult[]
): SpotlightResultGroup[] {
  const groups: SpotlightResultGroup[] = [];

  for (const type of SECTION_TYPE_ORDER) {
    const items = results.reduce<
      Array<SpotlightResult & { globalIndex: number }>
    >((acc, result) => {
      if (result.type === type) {
        acc.push({ ...result, globalIndex: 0 });
      }
      return acc;
    }, []);
    if (items.length > 0) {
      groups.push({ type, items });
    }
  }
  let idx = 0;
  for (const group of groups) {
    for (const item of group.items) {
      item.globalIndex = idx++;
    }
  }
  return groups;
}
