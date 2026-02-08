interface SremPipelineLike {
  srem: (key: string, member: string) => void;
  exec: () => Promise<unknown>;
}

interface DelPipelineLike extends SremPipelineLike {
  del: (key: string) => void;
}

interface RedisWithSremPipeline {
  pipeline: () => SremPipelineLike;
}

interface RedisWithDelPipeline {
  pipeline: () => DelPipelineLike;
}

function parseNumericCount(value: unknown): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  ) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  if (Array.isArray(value)) {
    if (value.length === 2 && value[0] !== null && typeof value[0] !== "undefined") {
      return null;
    }

    for (let i = value.length - 1; i >= 0; i -= 1) {
      const parsed = parseNumericCount(value[i]);
      if (parsed !== null) {
        return parsed;
      }
    }
    return null;
  }

  if (typeof value === "object" && value !== null) {
    if ("result" in value) {
      return parseNumericCount((value as { result: unknown }).result);
    }
    if ("data" in value) {
      return parseNumericCount((value as { data: unknown }).data);
    }
    if ("value" in value) {
      return parseNumericCount((value as { value: unknown }).value);
    }
  }

  return null;
}

function normalizeExecResults(execResult: unknown): unknown[] {
  return Array.isArray(execResult) ? execResult : [];
}

function sumCommandCounts(commandResults: unknown[]): number | null {
  let total = 0;
  for (const entry of commandResults) {
    const parsed = parseNumericCount(entry);
    if (parsed === null) {
      return null;
    }
    if (parsed > 1) {
      return null;
    }
    total += parsed;
  }
  return total;
}

export function getDistinctNonEmptyTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  for (const token of tokens) {
    if (typeof token !== "string") continue;
    if (token.length === 0) continue;
    seen.add(token);
  }
  return Array.from(seen);
}

export async function removeTokensFromUserSet(
  redis: RedisWithSremPipeline,
  userTokensKey: string,
  tokens: string[]
): Promise<number> {
  const distinctTokens = getDistinctNonEmptyTokens(tokens);
  if (distinctTokens.length === 0) {
    return 0;
  }

  const pipeline = redis.pipeline();
  for (const token of distinctTokens) {
    pipeline.srem(userTokensKey, token);
  }
  const execResult = await pipeline.exec();

  const commandResults = normalizeExecResults(execResult).slice(0, distinctTokens.length);
  const parsedRemovedCount =
    commandResults.length === distinctTokens.length
      ? sumCommandCounts(commandResults)
      : null;
  if (parsedRemovedCount !== null) {
    return parsedRemovedCount;
  }

  return distinctTokens.length;
}

export async function removeTokensAndMetadata(
  redis: RedisWithDelPipeline,
  userTokensKey: string,
  tokens: string[],
  getTokenMetaKey: (token: string) => string
): Promise<number> {
  const distinctTokens = getDistinctNonEmptyTokens(tokens);
  if (distinctTokens.length === 0) {
    return 0;
  }

  const pipeline = redis.pipeline();
  for (const token of distinctTokens) {
    pipeline.srem(userTokensKey, token);
    pipeline.del(getTokenMetaKey(token));
  }
  const execResult = await pipeline.exec();

  const allResults = normalizeExecResults(execResult);
  const sremResults: unknown[] = [];
  for (let index = 0; index < distinctTokens.length; index += 1) {
    sremResults.push(allResults[index * 2]);
  }
  const parsedRemovedCount = sumCommandCounts(sremResults);
  if (parsedRemovedCount !== null) {
    return parsedRemovedCount;
  }

  return distinctTokens.length;
}

export async function removeTokenMetadataKeys(
  redis: RedisWithDelPipeline,
  tokens: string[],
  getTokenMetaKey: (token: string) => string
): Promise<number> {
  const distinctTokens = getDistinctNonEmptyTokens(tokens);
  if (distinctTokens.length === 0) {
    return 0;
  }

  const pipeline = redis.pipeline();
  for (const token of distinctTokens) {
    pipeline.del(getTokenMetaKey(token));
  }
  const execResult = await pipeline.exec();

  const commandResults = normalizeExecResults(execResult).slice(0, distinctTokens.length);
  const parsedRemovedCount =
    commandResults.length === distinctTokens.length
      ? sumCommandCounts(commandResults)
      : null;
  if (parsedRemovedCount !== null) {
    return parsedRemovedCount;
  }

  return distinctTokens.length;
}
