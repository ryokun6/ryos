/** Read-only: bun --env-file=.env.local scripts/audit-sync-files.ts <username> */
import { createRedis } from "../api/_utils/redis";
import { parseRedisJson, sync2KvKey } from "../api/sync/v2/_core";
import { auditFileSync } from "../api/sync/v2/_fileAudit";
import type { SyncKvEntry } from "../src/shared/sync2/types";

const username = process.argv[2]?.trim().toLowerCase();
if (!username || process.argv.length !== 3) {
  console.error("Usage: bun scripts/audit-sync-files.ts <username>");
  process.exit(1);
}
const redis = createRedis();
const raw = await redis.hgetall<Record<string, unknown>>(sync2KvKey(username));
const entries = Object.fromEntries(Object.entries(raw ?? {}).flatMap(([key, value]) => {
  const entry = parseRedisJson<SyncKvEntry>(value);
  return entry ? [[key, entry]] : [];
}));
const issues = auditFileSync(entries);
console.log(JSON.stringify({ username, issues, recoveryProtected: issues.length > 0 }, null, 2));
process.exit(0);
