import { handleRequest } from "../../_http.js";
import { handleVerifyToken } from "../../_tokens.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["POST", "OPTIONS"],
    action: "auth:token:verify",
    handler: async ({ requestId }) => {
      return handleVerifyToken(request, requestId);
    },
  });
}
