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
  await pipeline.exec();

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
  await pipeline.exec();

  return distinctTokens.length;
}
