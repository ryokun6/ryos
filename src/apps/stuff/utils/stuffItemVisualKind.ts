import type { StuffItem, StuffTag } from "../types";

/** Shelf / list thumbnail style — books keep the spine cover; CDs use a jewel case; everything else is a product tile. */
export type StuffVisualKind =
  | "book"
  | "cd"
  | "electronics"
  | "kitchen"
  | "clothing"
  | "furniture"
  | "media"
  | "other";

/** Priority order when an item has multiple category tags. */
const KIND_PRIORITY: StuffVisualKind[] = [
  "book",
  "cd",
  "media",
  "electronics",
  "kitchen",
  "clothing",
  "furniture",
  "other",
];

/** Exact tag names (lowercase) mapped to a visual kind. */
const TAG_NAME_TO_KIND: Record<string, StuffVisualKind> = {
  book: "book",
  books: "book",
  reading: "book",
  literature: "book",
  media: "media",
  movie: "media",
  movies: "media",
  music: "media",
  game: "media",
  games: "media",
  dvd: "media",
  dvds: "media",
  cd: "cd",
  cds: "cd",
  "compact disc": "cd",
  "compact discs": "cd",
  electronics: "electronics",
  electronic: "electronics",
  tech: "electronics",
  gadget: "electronics",
  gadgets: "electronics",
  computer: "electronics",
  computers: "electronics",
  kitchen: "kitchen",
  cookware: "kitchen",
  cooking: "kitchen",
  food: "kitchen",
  clothing: "clothing",
  clothes: "clothing",
  apparel: "clothing",
  fashion: "clothing",
  wear: "clothing",
  furniture: "furniture",
  furnishing: "furniture",
  furnishings: "furniture",
};

/** Seeded default tag ids (`stuff-default:<slug>`) → visual kind. */
const DEFAULT_TAG_ID_TO_KIND: Record<string, StuffVisualKind> = {
  "stuff-default:books": "book",
  "stuff-default:cd": "cd",
  "stuff-default:electronics": "electronics",
  "stuff-default:kitchen": "kitchen",
  "stuff-default:clothing": "clothing",
  "stuff-default:furniture": "furniture",
};

function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

function kindFromTag(tag: StuffTag): StuffVisualKind | null {
  const fromId = DEFAULT_TAG_ID_TO_KIND[tag.id];
  if (fromId) return fromId;
  return TAG_NAME_TO_KIND[normalizeTagName(tag.name)] ?? null;
}

/**
 * Resolve shelf thumbnail style from item tags. Uses explicit tag names / default
 * tag ids only; untagged or unknown tags default to `other` (product tile).
 */
export function resolveStuffItemVisualKind(
  item: StuffItem,
  tags: StuffTag[]
): StuffVisualKind {
  const matched = new Set<StuffVisualKind>();

  for (const tag of tags) {
    if (!item.tagIds.includes(tag.id)) continue;
    const kind = kindFromTag(tag);
    if (kind) matched.add(kind);
  }

  for (const kind of KIND_PRIORITY) {
    if (matched.has(kind)) return kind;
  }

  return "other";
}

export function isStuffBookItem(item: StuffItem, tags: StuffTag[]): boolean {
  return resolveStuffItemVisualKind(item, tags) === "book";
}

export function isStuffCdItem(item: StuffItem, tags: StuffTag[]): boolean {
  return resolveStuffItemVisualKind(item, tags) === "cd";
}
