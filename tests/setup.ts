/**
 * Global test setup — preloaded before every bun test run.
 * Validates that the API server is reachable for integration suites.
 */

export const BASE_URL = process.env.API_URL || "http://localhost:3000";
