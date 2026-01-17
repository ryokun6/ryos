/**
 * Password utilities (Edge-compatible using Web Crypto API)
 * 
 * Uses PBKDF2 with SHA-256 for password hashing - fully Edge compatible.
 */

import type { Redis } from "@upstash/redis";
import {
  PASSWORD_HASH_PREFIX,
} from "./_constants.js";

// Re-export constants for convenience
export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "./_constants.js";

// PBKDF2 configuration
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert ArrayBuffer to hex string
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Generate a random salt
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Derive a key from password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  return await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
}

// ============================================================================
// Password Hashing (Edge-compatible)
// ============================================================================

/**
 * Hash a password using PBKDF2
 * Returns format: iterations$salt$hash (all hex encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const derivedKey = await deriveKey(password, salt);
  
  const saltHex = bufferToHex(salt);
  const hashHex = bufferToHex(derivedKey);
  
  return `${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    const parts = storedHash.split('$');
    
    // Handle legacy bcrypt hashes (start with $2a$ or $2b$)
    if (storedHash.startsWith('$2')) {
      // For legacy bcrypt hashes, we can't verify on Edge
      // Return false and let user reset password
      console.warn('Legacy bcrypt hash detected - user needs to reset password');
      return false;
    }
    
    if (parts.length !== 3) {
      return false;
    }
    
    const [iterationsStr, saltHex, expectedHashHex] = parts;
    const iterations = parseInt(iterationsStr, 10);
    
    if (isNaN(iterations) || iterations < 1) {
      return false;
    }
    
    const salt = hexToBuffer(saltHex);
    const derivedKey = await deriveKey(password, salt);
    const actualHashHex = bufferToHex(derivedKey);
    
    // Constant-time comparison to prevent timing attacks
    if (actualHashHex.length !== expectedHashHex.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < actualHashHex.length; i++) {
      result |= actualHashHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
    }
    
    return result === 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Password Storage
// ============================================================================

/**
 * Get Redis key for user's password hash
 */
function getPasswordKey(username: string): string {
  return `${PASSWORD_HASH_PREFIX}${username.toLowerCase()}`;
}

/**
 * Set or update a user's password hash
 */
export async function setUserPasswordHash(
  redis: Redis,
  username: string,
  passwordHash: string
): Promise<void> {
  const key = getPasswordKey(username);
  await redis.set(key, passwordHash);
}

/**
 * Get a user's password hash
 */
export async function getUserPasswordHash(
  redis: Redis,
  username: string
): Promise<string | null> {
  const key = getPasswordKey(username);
  return await redis.get(key);
}

/**
 * Delete a user's password hash
 */
export async function deleteUserPasswordHash(
  redis: Redis,
  username: string
): Promise<void> {
  const key = getPasswordKey(username);
  await redis.del(key);
}

/**
 * Check if a user has a password set
 */
export async function userHasPassword(
  redis: Redis,
  username: string
): Promise<boolean> {
  const hash = await getUserPasswordHash(redis, username);
  return !!hash;
}
