export const CHAT_ROOM_PREFIX = "chat:room:";
export const CHAT_MESSAGES_PREFIX = "chat:messages:";
export const CHAT_USERS_PREFIX = "chat:users:";
export const CHAT_ROOM_USERS_PREFIX = "chat:room:users:";
export const CHAT_ROOM_PRESENCE_PREFIX = "chat:presence:";
export const CHAT_ROOM_PRESENCE_ZSET_PREFIX = "chat:presencez:";

export const CHAT_ROOMS_SET = "chat:rooms";

export const USER_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
export const USER_EXPIRATION_TIME = USER_TTL_SECONDS;
export const TOKEN_GRACE_PERIOD = 60 * 60 * 24 * 365; // 1 year

export const ROOM_PRESENCE_TTL_SECONDS = 60 * 60 * 24; // 1 day

export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_USERNAME_LENGTH = 30;
export const MIN_USERNAME_LENGTH = 3;

export const AUTH_TOKEN_PREFIX = "chat:token:";
export const TOKEN_LAST_PREFIX = "chat:token:last:";
export const TOKEN_LENGTH = 32; // 32 bytes = 256 bits

export const PASSWORD_HASH_PREFIX = "chat:password:";
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_BCRYPT_ROUNDS = 10;

export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_ATTEMPTS = 10;
export const RATE_LIMIT_PREFIX = "rl:";
export const RATE_LIMIT_BLOCK_PREFIX = "rl:block:";
export const CREATE_USER_BLOCK_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export const CHAT_BURST_PREFIX = "rl:chat:b:";
export const CHAT_BURST_SHORT_WINDOW_SECONDS = 10;
export const CHAT_BURST_SHORT_LIMIT = 3;
export const CHAT_BURST_LONG_WINDOW_SECONDS = 60;
export const CHAT_BURST_LONG_LIMIT = 20;
export const CHAT_MIN_INTERVAL_SECONDS = 2;

export const USERNAME_REGEX = /^[a-z](?:[a-z0-9]|[-_](?=[a-z0-9])){2,29}$/i;
export const ROOM_ID_REGEX = /^[a-z0-9]+$/i;
