import type { Redis } from "../../_utils/redis.js";
import type { ApiRequest } from "../../_utils/api-types.js";
import { getHeader } from "../../_utils/request-helpers.js";
import { USER_TTL_SECONDS } from "../../_utils/auth/index.js";
import { redisKeys } from "../../../src/shared/redisKeys.js";
import { md5Hex } from "../../../src/shared/kosync/md5.js";
import {
  isValidKosyncField,
  isValidKosyncKeyField,
} from "./_md5.js";

export function kosyncUserKey(username: string): string {
  return redisKeys.integration.kosyncUserKey(username.toLowerCase());
}

export async function getKosyncAuthKey(
  redis: Redis,
  username: string
): Promise<string | null> {
  const raw = await redis.get<string>(kosyncUserKey(username));
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export async function setKosyncAuthKey(
  redis: Redis,
  username: string,
  md5Password: string
): Promise<void> {
  await redis.set(kosyncUserKey(username), md5Password.toLowerCase(), {
    ex: USER_TTL_SECONDS,
  });
}

/**
 * Keep the kosync auth key in sync with the ryOS account password.
 * KOReader only sends `md5(plain)` — we store that whenever the plain
 * password is known (login / register / password change / recovery).
 */
export async function syncKosyncAuthKeyFromPlainPassword(
  redis: Redis,
  username: string,
  plainPassword: string
): Promise<void> {
  if (!plainPassword) return;
  await setKosyncAuthKey(redis, username, md5Hex(plainPassword));
}

/**
 * Authorize a kosync request via `X-Auth-User` + `X-Auth-Key` (MD5 password).
 * Returns the normalized username or null.
 */
export async function authorizeKosyncRequest(
  req: ApiRequest,
  redis: Redis
): Promise<string | null> {
  const authUser = getHeader(req, "x-auth-user");
  const authKey = getHeader(req, "x-auth-key");
  if (!isValidKosyncKeyField(authUser) || !isValidKosyncField(authKey)) {
    return null;
  }
  const username = authUser.toLowerCase();
  const stored = await getKosyncAuthKey(redis, username);
  if (!stored || stored !== authKey.toLowerCase()) {
    return null;
  }
  // Refresh TTL on successful auth so active syncers stay alive.
  await redis.expire(kosyncUserKey(username), USER_TTL_SECONDS);
  return username;
}
