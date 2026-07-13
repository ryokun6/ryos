/** KOReader Progress Sync (kosync) wire types. */

export interface KosyncProgressRecord {
  percentage: number;
  progress: string;
  device: string;
  device_id: string;
  timestamp: number;
}

export interface KosyncProgressResponse extends Partial<KosyncProgressRecord> {
  document?: string;
}

export interface KosyncDocMapEntry {
  /** MD5 of the EPUB basename (KOReader "filename" document matching). */
  filenameMd5: string;
  /** KOReader partial content MD5 when known (KOReader "binary" matching). */
  partialMd5?: string;
}

export const KOSYNC_ACCEPT = "application/vnd.koreader.v1+json";
export const KOSYNC_DEVICE_RYOS = "ryOS Books";
export const KOSYNC_DEVICE_ID_RYOS = "ryos-books";

/** CORS headers KOReader / kosync clients may send. */
export const KOSYNC_CORS_HEADERS = [
  "Content-Type",
  "Accept",
  "Authorization",
  "X-Username",
  "X-Auth-User",
  "X-Auth-Key",
];
