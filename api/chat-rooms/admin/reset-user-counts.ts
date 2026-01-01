import { handleRequest } from "../_http.js";
import { handleResetUserCounts } from "../_admin.js";
import { extractAuth } from "../../_utils/auth.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["POST", "OPTIONS"],
    action: "admin:resetUserCounts",
    handler: async ({ requestId }) => {
      const { username, token } = extractAuth(request);
      return handleResetUserCounts(username, token, requestId);
    },
  });
}
