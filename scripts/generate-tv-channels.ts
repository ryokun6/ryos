/**
 * Generates curated TV channel video lists by searching YouTube via the Data API.
 * Outputs src/apps/tv/data/curatedVideos.generated.ts
 *
 * Usage:
 *   YOUTUBE_API_KEY=... bun run scripts/generate-tv-channels.ts
 */

const key = process.env.YOUTUBE_API_KEY;
if (!key) {
  console.error("YOUTUBE_API_KEY required");
  process.exit(1);
}

interface Channel {
  constName: string;
  comment: string;
  q: string;
  max: number;
}

const channels: Channel[] = [
  {
    constName: "APPLE_VIDEOS",
    comment: "Apple keynote highlights and event recaps",
    q: "Apple event keynote 4K",
    max: 20,
  },
  {
    constName: "CINEMA_VIDEOS",
    comment: "Official movie trailers",
    // Pin to current calendar year so re-runs surface fresh trailers.
    q: `official movie trailer HD ${new Date().getFullYear()}`,
    max: 20,
  },
  {
    constName: "ANIME_VIDEOS",
    comment: "Anime openings and AMVs",
    q: "anime opening 4K",
    max: 20,
  },
];

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

const out: string[] = [
  "// AUTO-GENERATED — DO NOT EDIT BY HAND.",
  "// Re-run with: bun run scripts/generate-tv-channels.ts",
  `// Generated at: ${new Date().toISOString()}`,
  "",
  'import type { Video } from "@/stores/useVideoStore";',
  "",
];

for (const ch of channels) {
  const u = new URL("https://www.googleapis.com/youtube/v3/search");
  u.searchParams.set("part", "snippet");
  u.searchParams.set("q", ch.q);
  u.searchParams.set("type", "video");
  u.searchParams.set("videoEmbeddable", "true");
  u.searchParams.set("safeSearch", "none");
  u.searchParams.set("maxResults", String(ch.max));
  u.searchParams.set("order", "relevance");
  u.searchParams.set("key", key);

  const res = await fetch(u);
  const j = (await res.json()) as {
    items?: {
      id: { videoId: string };
      snippet: { title: string; channelTitle: string };
    }[];
    error?: { message: string };
  };
  if (j.error) {
    console.error(`${ch.constName} failed: ${j.error.message}`);
    process.exit(1);
  }

  const items = (j.items ?? []).map((i) => ({
    id: i.id.videoId,
    url: `https://youtu.be/${i.id.videoId}`,
    title: decodeHtml(i.snippet.title),
    artist: decodeHtml(i.snippet.channelTitle),
  }));

  console.error(`[${ch.constName}] fetched ${items.length} (q="${ch.q}")`);

  const body = items
    .map(
      (v) =>
        `  { id: ${JSON.stringify(v.id)}, url: ${JSON.stringify(
          v.url
        )}, title: ${JSON.stringify(v.title)}, artist: ${JSON.stringify(
          v.artist
        )} },`
    )
    .join("\n");

  out.push(`/** ${ch.comment}. q="${ch.q}" */`);
  out.push(`export const ${ch.constName}: Video[] = [\n${body}\n];\n`);
}

await Bun.write("src/apps/tv/data/curatedVideos.generated.ts", out.join("\n"));
console.error("Wrote src/apps/tv/data/curatedVideos.generated.ts");
