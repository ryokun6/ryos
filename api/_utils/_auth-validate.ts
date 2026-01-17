/**
 * Edge-compatible authentication validation utilities
 * 
 * @deprecated This module re-exports from auth/index.js for backwards compatibility.
 * Import directly from "../_utils/auth/index.js" instead.
 * 
 * This module can be imported by both Node.js and Edge runtime API endpoints.
 */

// Re-export types from auth module
export type { AuthValidationResult } from "./auth/_types.js";

// Re-export constants from auth module
export {
  USER_TTL_SECONDS,
  TOKEN_GRACE_PERIOD,
} from "./auth/_constants.js";

// Re-export key helpers from auth module
export {
  getUserTokenKey,
  getLastTokenKey,
} from "./auth/_tokens.js";

// Re-export validation from auth module (validateAuthToken is an alias for validateAuth)
export { validateAuthToken } from "./auth/_validate.js";

// Re-export token generation from auth module (generateToken is an alias for generateAuthToken)
export { generateToken } from "./auth/_tokens.js";

// Re-export auth extraction from auth module (extractAuthFromRequest is an alias for extractAuth)
export { extractAuthFromRequest } from "./auth/_extract.js";
