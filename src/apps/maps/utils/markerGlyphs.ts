/**
 * MapKit JS marker-annotation glyph images.
 *
 * Apple's `MarkerAnnotation.glyphImage` (and `selectedGlyphImage`) expects an
 * `ImageHashObject` of the form `{ 1, 2, 3 }` whose values are URLs to
 * monochrome template images. The framework then tints the image with the
 * marker's `glyphColor`.
 *
 * We render the desired Phosphor icon as an inline SVG `data:` URI sized to
 * 40 × 40 points (Apple's recommendation; MapKit also accepts ≥ 20 × 20). The
 * SVG is vector so the same string works for `1x`, `2x`, and `3x` densities.
 *
 * The path data is copied verbatim from `@phosphor-icons/react`'s "fill"
 * variant for each icon (256 × 256 viewBox) so the on-pin glyph matches the
 * filled icons we already render in the place card and drawer.
 */

const SVG_SIZE = 40;
// Phosphor icons are authored on a 256×256 grid and the path data sits
// edge-to-edge. We add a small amount of breathing room around the path
// so the glyph doesn't kiss the marker pill outline, but keep the inset
// tight — earlier values (~58% scale) made the icon look lost inside the
// balloon. Tuning the scale up to ~0.85 puts the glyph at roughly the
// same density as Apple Maps' built-in marker glyphs.
const ICON_GRID = 256;
const GLYPH_SCALE = 0.7;
const VIEWBOX_SIZE = Math.round(ICON_GRID / GLYPH_SCALE);
const VIEWBOX_OFFSET = Math.round((VIEWBOX_SIZE - ICON_GRID) / 2);
const SVG_VIEWBOX = `${-VIEWBOX_OFFSET} ${-VIEWBOX_OFFSET} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`;

function buildGlyphSvg(pathD: string): string {
  // Inline SVG with white fill on a transparent background. Apple's docs
  // describe glyph images as template images that MapKit tints with
  // `glyphColor`, but that tinting pipeline is geared toward raster PNG
  // assets; SVG `data:` URIs render as-is in MapKit JS. Hard-coding the
  // fill to white means the glyph reads correctly against every marker
  // color we use (Home blue, Work amber, Favorites gold) without depending
  // on the tint behavior.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SVG_VIEWBOX}" ` +
    `width="${SVG_SIZE}" height="${SVG_SIZE}" fill="#ffffff">` +
    `<path d="${pathD}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function buildGlyphHash(
  pathD: string
): { 1: string; 2: string; 3: string } {
  const url = buildGlyphSvg(pathD);
  // Same vector source for every density; MapKit picks one based on devicePixelRatio.
  return { 1: url, 2: url, 3: url };
}

// Phosphor "fill" variant paths (256×256 viewBox). Source:
//   node_modules/@phosphor-icons/react/dist/defs/{House,Briefcase,Star}.es.js
const HOUSE_FILL_PATH =
  "M224,120v96a8,8,0,0,1-8,8H160a8,8,0,0,1-8-8V164a4,4,0,0,0-4-4H108a4,4,0,0,0-4,4v52a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V120a16,16,0,0,1,4.69-11.31l80-80a16,16,0,0,1,22.62,0l80,80A16,16,0,0,1,224,120Z";

const BRIEFCASE_FILL_PATH =
  "M152,112a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h32A8,8,0,0,1,152,112Zm80-40V200a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V72A16,16,0,0,1,40,56H80V48a24,24,0,0,1,24-24h48a24,24,0,0,1,24,24v8h40A16,16,0,0,1,232,72ZM96,56h64V48a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8Zm120,57.61V72H40v41.61A184,184,0,0,0,128,136,184,184,0,0,0,216,113.61Z";

export const HOME_GLYPH_IMAGE = buildGlyphHash(HOUSE_FILL_PATH);
export const WORK_GLYPH_IMAGE = buildGlyphHash(BRIEFCASE_FILL_PATH);
