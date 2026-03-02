/**
 * Password hashing utilities (Node.js runtime only - uses bcrypt)
 * 
 * IMPORTANT: This module uses bcrypt and MUST only be imported in Node.js endpoints.
 * For Edge-compatible password storage functions, use _password-storage.ts
 */

import bcrypt from "bcryptjs";

// Re-export storage functions for convenience in Node.js endpoints
export {
  setUserPasswordHash,
  getUserPasswordHash,
  deleteUserPasswordHash,
  userHasPassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "./_password-storage.js";

// Bcrypt configuration
const BCRYPT_ROUNDS = 10;

/**
 * Hash a password using bcrypt (Node.js only)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash (Node.js only)
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, storedHash);
  } catch {
    return false;
  }
}
