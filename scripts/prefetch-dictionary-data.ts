#!/usr/bin/env bun
/**
 * Download dictionary datasets into DICTIONARY_DATA_DIR.
 * Used by the Docker image so the first lookup after a deploy is local.
 * Dev and a trimmed image still fall back to loadDatasetBytes.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DATASET_TIMEOUT_MS,
  DATASETS,
  type DatasetId,
} from "../api/dictionary/_helpers/_dataset-sources.js";

const dir = process.env.DICTIONARY_DATA_DIR || path.join(process.cwd(), "data", "dictionary");

async function download(id: DatasetId): Promise<void> {
  const { url, file } = DATASETS[id];
  const target = path.join(dir, file);
  try {
    const existing = await readFile(target);
    if (existing.byteLength > 0) {
      console.log(`[dictionary] ${id} cached (${existing.byteLength} bytes)`);
      return;
    }
  } catch {
    // not on disk yet
  }
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DATASET_TIMEOUT_MS[id]),
    headers: { "User-Agent": "ryOS-dictionary/1.0 (+https://os.ryo.lu)" },
  });
  if (!response.ok) throw new Error(`${id} download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error(`${id} download was empty`);
  await mkdir(dir, { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, bytes);
  await rename(temp, target);
  console.log(`[dictionary] ${id} saved (${bytes.byteLength} bytes)`);
}

const failed: string[] = [];
for (const id of Object.keys(DATASETS) as DatasetId[]) {
  try {
    await download(id);
  } catch (error) {
    failed.push(id);
    console.error(`[dictionary] ${id} failed:`, error instanceof Error ? error.message : error);
  }
}

if (failed.length) {
  console.error(`[dictionary] prefetch incomplete: ${failed.join(", ")}`);
  process.exit(1);
}
