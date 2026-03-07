/**
 * GET /api/sync/state          - Get metadata for all Redis-direct sync domains
 * GET /api/sync/state?domain=X - Download one Redis-direct domain's JSON data
 * PUT /api/sync/state          - Write a JSON snapshot for one Redis-direct domain
 */

import type { VercelResponse } from "@vercel/node";
import type { Redis } from "@upstash/redis";
import {
  AUTO_SYNC_SNAPSHOT_VERSION,
  REDIS_SYNC_DOMAINS,
  isRedisSyncDomain,
  type CloudSyncDomainMetadata,
  type RedisSyncDomain,
} from "../../src/utils/cloudSyncShared.js";
import { apiHandler } from "../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 30;

interface PersistedRedisStateDomain {
  data: unknown;
  updatedAt: string;
  version: number;
  createdAt: string;
}

interface PutStateBody {
  domain?: string;
  data?: unknown;
  updatedAt?: string;
  version?: number;
}

export function stateKey(username: string, domain: RedisSyncDomain): string {
  return `sync:state:${username}:${domain}`;
}

function metaKey(username: string): string {
  return `sync:state:meta:${username}`;
}

interface PersistedMetaEntry {
  updatedAt: string;
  version: number;
  createdAt: string;
}

type PersistedMetaMap = Record<RedisSyncDomain, PersistedMetaEntry | null>;

function createEmptyMetaMap(): PersistedMetaMap {
  const map = {} as PersistedMetaMap;
  for (const domain of REDIS_SYNC_DOMAINS) {
    map[domain] = null;
  }
  return map;
}

async function readMetaMap(
  redis: Redis,
  username: string
): Promise<PersistedMetaMap> {
  const raw = await redis.get<string | PersistedMetaMap>(metaKey(username));
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const normalized = createEmptyMetaMap();

  if (!parsed || typeof parsed !== "object") {
    return normalized;
  }

  for (const domain of REDIS_SYNC_DOMAINS) {
    const entry = (parsed as Record<string, unknown>)[domain];
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as PersistedMetaEntry).updatedAt === "string" &&
      typeof (entry as PersistedMetaEntry).createdAt === "string"
    ) {
      normalized[domain] = entry as PersistedMetaEntry;
    }
  }

  return normalized;
}

export default apiHandler<PutStateBody>(
  {
    methods: ["GET", "PUT"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ req, res, redis, user, body }): Promise<void> => {
    const username = user?.username || "";
    const method = (req.method || "GET").toUpperCase();

    if (method === "GET") {
      const rawDomain = Array.isArray(req.query.domain)
        ? req.query.domain[0]
        : req.query.domain;

      if (rawDomain && !isRedisSyncDomain(rawDomain as never)) {
        res.status(400).json({ error: "Invalid or non-Redis sync domain" });
        return;
      }

      if (rawDomain && isRedisSyncDomain(rawDomain as never)) {
        await handleDomainDownload(res, redis, username, rawDomain as RedisSyncDomain);
        return;
      }

      const meta = await readMetaMap(redis, username);
      const metadata: Record<string, CloudSyncDomainMetadata | null> = {};
      for (const domain of REDIS_SYNC_DOMAINS) {
        const entry = meta[domain];
        metadata[domain] = entry
          ? {
              updatedAt: entry.updatedAt,
              version: entry.version,
              totalSize: 0,
              createdAt: entry.createdAt,
            }
          : null;
      }

      res.status(200).json({ ok: true, metadata });
      return;
    }

    if (method === "PUT") {
      await handlePutState(res, redis, username, body);
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  }
);

async function handleDomainDownload(
  res: VercelResponse,
  redis: Redis,
  username: string,
  domain: RedisSyncDomain
): Promise<void> {
  const raw = await redis.get<string | PersistedRedisStateDomain>(
    stateKey(username, domain)
  );
  const entry: PersistedRedisStateDomain | null =
    typeof raw === "string" ? JSON.parse(raw) : raw;

  if (!entry) {
    res.status(404).json({ error: `No ${domain} state found` });
    return;
  }

  res.status(200).json({
    ok: true,
    domain,
    data: entry.data,
    metadata: {
      updatedAt: entry.updatedAt,
      version: entry.version,
      totalSize: 0,
      createdAt: entry.createdAt,
    },
  });
}

async function handlePutState(
  res: VercelResponse,
  redis: Redis,
  username: string,
  body: PutStateBody | null
): Promise<void> {
  if (!body || !body.domain || body.data === undefined || !body.updatedAt) {
    res.status(400).json({
      error: "Missing required fields: domain, data, updatedAt",
    });
    return;
  }

  if (!isRedisSyncDomain(body.domain as never)) {
    res.status(400).json({ error: "Invalid or non-Redis sync domain" });
    return;
  }

  const domain = body.domain as RedisSyncDomain;
  const now = new Date().toISOString();

  const entry: PersistedRedisStateDomain = {
    data: body.data,
    updatedAt: body.updatedAt,
    version: body.version || AUTO_SYNC_SNAPSHOT_VERSION,
    createdAt: now,
  };

  try {
    await redis.set(stateKey(username, domain), JSON.stringify(entry));

    const meta = await readMetaMap(redis, username);
    meta[domain] = {
      updatedAt: entry.updatedAt,
      version: entry.version,
      createdAt: entry.createdAt,
    };
    await redis.set(metaKey(username), JSON.stringify(meta));

    res.status(200).json({
      ok: true,
      domain,
      metadata: {
        updatedAt: entry.updatedAt,
        version: entry.version,
        totalSize: 0,
        createdAt: entry.createdAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error saving Redis state:", message, error);
    res.status(500).json({ error: `Failed to save state: ${message}` });
  }
}
