import type { StuffItem, StuffTag } from "../types";

/** Shelf / list thumbnail style — books keep the spine cover; everything else is a product tile. */
export type StuffVisualKind =
  | "book"
  | "electronics"
  | "kitchen"
  | "clothing"
  | "furniture"
  | "media"
  | "other";

/** Priority order when an item has multiple category tags. */
const KIND_PRIORITY: StuffVisualKind[] = [
  "book",
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

function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Resolve shelf thumbnail style from item tags. Uses explicit tag names only;
 * untagged or unknown tags default to `other` (product tile, not a book).
 */
export function resolveStuffItemVisualKind(
  item: StuffItem,
  tags: StuffTag[]
): StuffVisualKind {
  const matched = new Set<StuffVisualKind>();

  for (const tag of tags) {
    if (!item.tagIds.includes(tag.id)) continue;
    const kind = TAG_NAME_TO_KIND[normalizeTagName(tag.name)];
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
