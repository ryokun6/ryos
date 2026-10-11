#!/usr/bin/env bun
/**
 * Download dictionary datasets into DICTIONARY_DATA_DIR.
 * Used by the Docker image so the first lookup after a deploy is local.
 * Dev and a trimmed image still fall back to loadDatasetBytes.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DATASETS,
  datasetCacheFiles,
  fetchDatasetBytes,
  type DatasetId,
} from "../api/dictionary/_helpers/_dataset-sources.js";

const dir = process.env.DICTIONARY_DATA_DIR || path.join(process.cwd(), "data", "dictionary");

async function cachedFile(id: DatasetId): Promise<{ file: string; bytes: number } | null> {
  for (const file of datasetCacheFiles(id)) {
    try {
      const existing = await readFile(path.join(dir, file));
      if (existing.byteLength > 0) return { file, bytes: existing.byteLength };
    } catch {
      // try the next cached name
    }
  }
  return null;
}

async function download(id: DatasetId): Promise<void> {
  const cached = await cachedFile(id);
  if (cached) {
    console.log(`[dictionary] ${id} cached ${cached.file} (${cached.bytes} bytes)`);
    return;
  }
  const { bytes, file } = await fetchDatasetBytes(id);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, file);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, bytes);
  await rename(temp, target);
  console.log(`[dictionary] ${id} saved ${file} (${bytes.byteLength} bytes)`);
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
