import { mapWithConcurrency } from "./_concurrency.js";
import {
  type PushTokenMetadata,
  extractTokenMetadataOwner,
  getTokenMetaKey,
} from "./_shared.js";

export interface TokenOwnershipEntry {
  token: string;
  ownedByCurrentUser: boolean;
}

interface RedisLikeGet {
  get<T>(key: string): Promise<T>;
}

export async function getTokenOwnershipEntries(
  redis: RedisLikeGet,
  username: string,
  tokens: string[],
  concurrency: number
): Promise<TokenOwnershipEntry[]> {
  return mapWithConcurrency(tokens, concurrency, async (token) => {
    const tokenMeta = await redis.get<Partial<PushTokenMetadata> | null>(
      getTokenMetaKey(token)
    );
    return {
      token,
      ownedByCurrentUser: extractTokenMetadataOwner(tokenMeta) === username,
    };
  });
}

export function splitTokenOwnership(entries: TokenOwnershipEntry[]): {
  ownedTokens: string[];
  unownedTokens: string[];
} {
  const ownedTokens: string[] = [];
  const unownedTokens: string[] = [];

  for (const entry of entries) {
    if (entry.ownedByCurrentUser) {
      ownedTokens.push(entry.token);
    } else {
      unownedTokens.push(entry.token);
    }
  }

  return {
    ownedTokens,
    unownedTokens,
  };
}
