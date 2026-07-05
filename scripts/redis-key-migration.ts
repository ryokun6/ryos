#!/usr/bin/env bun
/**
 * Redis key-scheme migration CLI.
 *
 * The runtime now reads and writes only canonical Redis keys. This standalone
 * tool is the sole remaining way to inspect, backfill, and retire the historical
 * "legacy" key scheme — it is intentionally NOT exposed through the app API.
 *
 * Usage:
 *   bun run scripts/redis-key-migration.ts status [--limit=50]
 *   bun run scripts/redis-key-migration.ts backfill --pattern='chat:users:*' [--limit=100] [--cursor=0] [--execute]
 *   bun run scripts/redis-key-migration.ts backfill --all [--limit=100] [--execute]
 *   bun run scripts/redis-key-migration.ts delete --pattern='chat:users:*' [--limit=100] [--cursor=0] [--execute]
 *   bun run scripts/redis-key-migration.ts delete --all [--limit=100] [--execute]
 *
 * Safety:
 *   - All mutating commands DEFAULT TO DRY RUN. Pass `--execute` (or
 *     `--no-dry-run`) to actually copy/delete keys.
 *   - `--all` walks every registered legacy pattern, paginating with the
 *     server-returned cursor until each pattern is exhausted.
 *
 * Requires REDIS_KV_REST_API_URL / REDIS_KV_REST_API_TOKEN in the environment.
 */

import { createRedis } from "../api/_utils/redis.js";
import { LEGACY_REDIS_SCAN_PATTERNS } from "../src/shared/redisLegacyPatterns.js";
import {
  assertKnownLegacyRedisPattern,
  backfillRedisKeyScheme,
  deleteLegacyRedisKeys,
  getRedisMigrationStatus,
} from "./lib/redis-key-migration.js";

const COLOR = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  CYAN: "\x1b[36m",
};

interface CliArgs {
  command: string;
  pattern?: string;
  limit: number;
  cursor?: string;
  all: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const [command = "", ...rest] = argv;
  const args: CliArgs = {
    command,
    limit: command === "status" ? 50 : 100,
    all: false,
    dryRun: true,
  };

  for (const token of rest) {
    if (token === "--all") {
      args.all = true;
    } else if (token === "--execute" || token === "--no-dry-run") {
      args.dryRun = false;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token.startsWith("--pattern=")) {
      args.pattern = token.slice("--pattern=".length);
    } else if (token.startsWith("--limit=")) {
      const parsed = Number.parseInt(token.slice("--limit=".length), 10);
      if (Number.isFinite(parsed) && parsed > 0) args.limit = parsed;
    } else if (token.startsWith("--cursor=")) {
      args.cursor = token.slice("--cursor=".length);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function printUsage(): void {
  console.log(`${COLOR.BOLD}Redis key-scheme migration CLI${COLOR.RESET}

Commands:
  ${COLOR.CYAN}status${COLOR.RESET}    [--limit=50]
  ${COLOR.CYAN}backfill${COLOR.RESET}  (--pattern='<legacy:*>' | --all) [--limit=100] [--cursor=0] [--execute]
  ${COLOR.CYAN}delete${COLOR.RESET}    (--pattern='<legacy:*>' | --all) [--limit=100] [--cursor=0] [--execute]

Mutating commands default to a DRY RUN. Pass --execute to apply changes.

Registered legacy patterns:
${LEGACY_REDIS_SCAN_PATTERNS.map((p) => `  - ${p}`).join("\n")}
`);
}

function requireRedisEnv(): void {
  if (!process.env.REDIS_KV_REST_API_URL || !process.env.REDIS_KV_REST_API_TOKEN) {
    console.error(
      `${COLOR.RED}Missing REDIS_KV_REST_API_URL / REDIS_KV_REST_API_TOKEN in environment.${COLOR.RESET}`
    );
    process.exit(1);
  }
}

async function runStatus(limit: number): Promise<void> {
  const redis = createRedis();
  const status = await getRedisMigrationStatus(redis, limit);
  console.log(
    `${COLOR.BOLD}Legacy key status${COLOR.RESET} (checked ${status.checkedAt}, per-pattern limit ${status.perPatternLimit})`
  );
  for (const pattern of status.patterns) {
    const count = pattern.truncated ? `${pattern.count}+` : `${pattern.count}`;
    const color = pattern.count > 0 ? COLOR.YELLOW : COLOR.DIM;
    console.log(`  ${color}${pattern.pattern.padEnd(36)}${COLOR.RESET} ${count}`);
  }
  console.log(
    `${COLOR.BOLD}Total legacy keys:${COLOR.RESET} ${status.totalLegacyKeys}${
      status.truncated ? "+ (truncated)" : ""
    }`
  );
}

async function runBackfill(args: CliArgs): Promise<void> {
  const redis = createRedis();
  const patterns = args.all ? [...LEGACY_REDIS_SCAN_PATTERNS] : [args.pattern!];
  let totalScanned = 0;
  let totalCopied = 0;
  let totalSkipped = 0;

  for (const pattern of patterns) {
    assertKnownLegacyRedisPattern(pattern);
    let cursor: string | number | undefined = args.all ? "0" : args.cursor;
    do {
      const result = await backfillRedisKeyScheme(redis, {
        pattern,
        limit: args.limit,
        dryRun: args.dryRun,
        cursor,
      });
      totalScanned += result.scanned;
      totalCopied += result.copied;
      totalSkipped += result.skipped;
      console.log(
        `${COLOR.CYAN}[backfill]${COLOR.RESET} ${pattern} cursor=${result.cursor} scanned=${result.scanned} copied=${result.copied} skipped=${result.skipped}${
          result.dryRun ? ` ${COLOR.DIM}(dry-run)${COLOR.RESET}` : ""
        }`
      );
      for (const warning of result.warnings) {
        console.log(`  ${COLOR.YELLOW}warn:${COLOR.RESET} ${warning}`);
      }
      cursor = result.cursor;
      if (!args.all) break;
    } while (cursor !== "0" && cursor !== 0);
  }

  console.log(
    `${COLOR.BOLD}Backfill done${COLOR.RESET} scanned=${totalScanned} copied=${totalCopied} skipped=${totalSkipped}${
      args.dryRun ? ` ${COLOR.DIM}(dry-run — pass --execute to apply)${COLOR.RESET}` : ""
    }`
  );
}

async function runDelete(args: CliArgs): Promise<void> {
  const redis = createRedis();
  const patterns = args.all ? [...LEGACY_REDIS_SCAN_PATTERNS] : [args.pattern!];
  let totalScanned = 0;
  let totalDeleted = 0;

  for (const pattern of patterns) {
    assertKnownLegacyRedisPattern(pattern);
    let cursor: string | number | undefined = args.all ? "0" : args.cursor;
    do {
      const result = await deleteLegacyRedisKeys(redis, {
        pattern,
        limit: args.limit,
        dryRun: args.dryRun,
        cursor,
      });
      totalScanned += result.scanned;
      totalDeleted += result.deleted;
      console.log(
        `${COLOR.CYAN}[delete]${COLOR.RESET} ${pattern} cursor=${result.cursor} scanned=${result.scanned} deleted=${result.deleted}${
          result.dryRun ? ` ${COLOR.DIM}(dry-run)${COLOR.RESET}` : ""
        }`
      );
      cursor = result.cursor;
      if (!args.all) break;
    } while (cursor !== "0" && cursor !== 0);
  }

  console.log(
    `${COLOR.BOLD}Delete done${COLOR.RESET} scanned=${totalScanned} deleted=${totalDeleted}${
      args.dryRun ? ` ${COLOR.DIM}(dry-run — pass --execute to apply)${COLOR.RESET}` : ""
    }`
  );
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${COLOR.RED}${error instanceof Error ? error.message : String(error)}${COLOR.RESET}`);
    printUsage();
    process.exit(1);
  }

  if (!args.command || args.command === "help" || args.command === "--help") {
    printUsage();
    return;
  }

  requireRedisEnv();

  switch (args.command) {
    case "status":
      await runStatus(args.limit);
      return;
    case "backfill":
      if (!args.all && !args.pattern) {
        console.error(`${COLOR.RED}backfill requires --pattern='<legacy:*>' or --all${COLOR.RESET}`);
        process.exit(1);
      }
      await runBackfill(args);
      return;
    case "delete":
      if (!args.all && !args.pattern) {
        console.error(`${COLOR.RED}delete requires --pattern='<legacy:*>' or --all${COLOR.RESET}`);
        process.exit(1);
      }
      await runDelete(args);
      return;
    default:
      console.error(`${COLOR.RED}Unknown command: ${args.command}${COLOR.RESET}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(`${COLOR.RED}Migration CLI failed:${COLOR.RESET}`, error);
  process.exit(1);
});
