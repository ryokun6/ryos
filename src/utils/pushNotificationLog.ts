import { createClientLogger } from "@/utils/logger";

/**
 * Client half of the `[push]` notification trail (server half:
 * `api/_utils/push-relay.ts`). Debug lines need debug mode
 * (`localStorage["ryos:debug"] = "1"` or a dev build).
 */
export const pushLog = createClientLogger("push");
