#!/usr/bin/env bun

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  uploadStoredObject,
  type StoragePutOptions,
  type StoragePutResult,
} from "../api/_utils/storage.js";

const DEFAULT_BACKUP_PREFIX = "redis-rdb-backups";
const REDIS_CLI = process.env.REDIS_CLI_PATH?.trim() || "redis-cli";

export interface RedisCliRdbCommand {
  args: string[];
  env: Record<string, string>;
}

export interface RedisRdbBackupOptions {
  now?: Date;
  redisUrl?: string;
  prefix?: string;
  dumpRedisRdb?: (redisUrl: string, outputPath: string) => Promise<void>;
  uploadObject?: (options: StoragePutOptions) => Promise<StoragePutResult>;
}

export interface RedisRdbBackupResult {
  generatedAt: string;
  pathname: string;
  storageUrl: string;
  provider: string;
  bytes: number;
}

function getRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for Redis RDB backups.");
  }
  return redisUrl;
}

function normalizeBackupPrefix(prefix: string | undefined): string {
  const normalized = (prefix || DEFAULT_BACKUP_PREFIX)
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return normalized || DEFAULT_BACKUP_PREFIX;
}

export function buildRedisRdbBackupPathname(
  now: Date,
  prefix: string | undefined
): string {
  const generatedAt = now.toISOString();
  const day = generatedAt.slice(0, 10);
  const timestamp = generatedAt.replace(/[:.]/g, "-");
  return `${normalizeBackupPrefix(prefix)}/${day}/${timestamp}.rdb`;
}

function parseRedisDatabase(pathname: string): string | null {
  const db = pathname.replace(/^\/+/, "");
  if (!db) return null;
  if (!/^\d+$/.test(db)) {
    throw new Error(`Redis URL database must be numeric, got "${db}".`);
  }
  return db;
}

export function buildRedisCliRdbCommand(
  redisUrl: string,
  outputPath: string
): RedisCliRdbCommand {
  const parsed = new URL(redisUrl);
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss://.");
  }

  const args = [
    REDIS_CLI,
    "-h",
    parsed.hostname,
    "-p",
    parsed.port || "6379",
  ];
  const env: Record<string, string> = {};
  const username = decodeURIComponent(parsed.username || "");
  const password = decodeURIComponent(parsed.password || "");
  const database = parseRedisDatabase(parsed.pathname);

  if (parsed.protocol === "rediss:") {
    args.push("--tls");
  }
  if (username) {
    args.push("--user", username);
  }
  if (password) {
    env.REDISCLI_AUTH = password;
  }
  if (database) {
    args.push("-n", database);
  }

  args.push("--rdb", outputPath);
  return { args, env };
}

async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return "";
  return await new Response(stream).text();
}

export async function dumpRedisRdbWithRedisCli(
  redisUrl: string,
  outputPath: string
): Promise<void> {
  const command = buildRedisCliRdbCommand(redisUrl, outputPath);
  const child = Bun.spawn(command.args, {
    env: { ...process.env, ...command.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    readStream(child.stdout),
    readStream(child.stderr),
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `redis-cli --rdb failed with exit code ${exitCode}: ${
        stderr.trim() || stdout.trim() || "no output"
      }`
    );
  }
}

export async function runRedisRdbBackup(
  options: RedisRdbBackupOptions = {}
): Promise<RedisRdbBackupResult> {
  const now = options.now || new Date();
  const generatedAt = now.toISOString();
  const redisUrl = options.redisUrl || getRedisUrl();
  const pathname = buildRedisRdbBackupPathname(
    now,
    options.prefix ||
      process.env.REDIS_RDB_BACKUP_S3_PREFIX ||
      process.env.REDIS_BACKUP_S3_PREFIX
  );
  const tempDir = mkdtempSync(join(tmpdir(), "ryos-redis-rdb-"));
  const outputPath = join(tempDir, "dump.rdb");

  try {
    await (options.dumpRedisRdb || dumpRedisRdbWithRedisCli)(redisUrl, outputPath);
    const body = readFileSync(outputPath);
    const uploaded = await (options.uploadObject || uploadStoredObject)({
      pathname,
      contentType: "application/octet-stream",
      body,
      allowOverwrite: true,
    });

    return {
      generatedAt,
      pathname,
      storageUrl: uploaded.storageUrl,
      provider: uploaded.provider,
      bytes: body.byteLength,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  runRedisRdbBackup()
    .then((result) => {
      console.log(JSON.stringify({ success: true, ...result }, null, 2));
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Redis RDB backup failed: ${message}`);
      process.exit(1);
    });
}
