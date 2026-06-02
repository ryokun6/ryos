/**
 * Shared test preload. API integration suites read this base URL through
 * test helpers; they still require a running standalone API server.
 */

export const BASE_URL = process.env.API_URL || "http://localhost:3000";
