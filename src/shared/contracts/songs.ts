import { z } from "zod";

export const LyricsSourceSchema = z.object({
  hash: z.string(),
  albumId: z.union([z.string(), z.number()]),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
});

export const CoverColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const CreateSongSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  album: z.string().optional(),
  cover: z.string().max(2000).optional(),
  coverColor: CoverColorSchema.optional(),
  lyricOffset: z.number().optional(),
  lyricsSource: LyricsSourceSchema.optional(),
});

export const FuriganaSegmentSchema = z.object({
  text: z.string(),
  reading: z.string().optional(),
});

export const LyricsContentSchema = z.object({
  lrc: z.string().optional(),
  krc: z.string().optional(),
  cover: z.string().optional(),
});

export const compressedOrRaw = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.string().startsWith("gzip:"), schema]);

export const BulkImportSongSchema = z.object({
  id: z.string().min(1),
  url: z.string().optional(),
  title: z.string().min(1),
  artist: z.string().optional(),
  album: z.string().optional(),
  cover: z.string().max(2000).optional(),
  coverColor: CoverColorSchema.optional(),
  lyricOffset: z.number().optional(),
  lyricsSource: LyricsSourceSchema.optional(),
  lyricsSearch: z
    .object({
      query: z.string().optional(),
      selection: LyricsSourceSchema.optional(),
    })
    .optional(),
  lyrics: compressedOrRaw(LyricsContentSchema).optional(),
  translations: compressedOrRaw(z.record(z.string(), z.string())).optional(),
  furigana: compressedOrRaw(z.array(z.array(FuriganaSegmentSchema))).optional(),
  soramimi: compressedOrRaw(z.array(z.array(FuriganaSegmentSchema))).optional(),
  soramimiByLang: compressedOrRaw(
    z.record(z.string(), z.array(z.array(FuriganaSegmentSchema)))
  ).optional(),
  createdBy: z.string().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  importOrder: z.number().optional(),
});

export const BulkImportSchema = z.object({
  action: z.literal("import"),
  songs: z.array(BulkImportSongSchema),
});

export type SongLyricsSource = z.infer<typeof LyricsSourceSchema>;
export type CreateSongPayload = z.infer<typeof CreateSongSchema>;
export type BulkImportSongPayload = z.infer<typeof BulkImportSongSchema>;
export type BulkImportPayload = z.infer<typeof BulkImportSchema>;
