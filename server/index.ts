/**
 * Canonical VPS API entrypoint.
 * Kept separate so deploy tooling can target `server/index.ts`
 * while local scripts can continue to use `server/vps-api-server.ts`.
 */
import "./vps-api-server.ts";
