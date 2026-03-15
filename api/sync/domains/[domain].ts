import { apiHandler } from "../../_utils/api-handler.js";
import {
  getLogicalCloudSyncDomainPayload,
  parseLogicalDomainQuery,
  putLogicalCloudSyncDomain,
  type PutLogicalDomainBody,
} from "../_domains.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export default apiHandler<PutLogicalDomainBody>(
  {
    methods: ["GET", "PUT"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ req, res, redis, user, body }): Promise<void> => {
    const rawDomain = Array.isArray(req.query.domain)
      ? req.query.domain[0]
      : req.query.domain;
    const logicalDomain = parseLogicalDomainQuery(rawDomain);

    if (!logicalDomain) {
      res.status(400).json({ error: "Invalid logical sync domain" });
      return;
    }

    const username = user?.username || "";

    if ((req.method || "GET").toUpperCase() === "GET") {
      const payload = await getLogicalCloudSyncDomainPayload(
        redis,
        username,
        logicalDomain
      );
      if (!payload) {
        res
          .status(404)
          .json({ error: `No ${logicalDomain} sync data found` });
        return;
      }

      res.status(200).json(payload);
      return;
    }

    const sourceSessionId =
      typeof req.headers["x-sync-session-id"] === "string"
        ? req.headers["x-sync-session-id"]
        : undefined;
    const result = await putLogicalCloudSyncDomain(
      redis,
      username,
      logicalDomain,
      body,
      sourceSessionId
    );

    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        ...(result.code ? { code: result.code } : {}),
        ...(result.metadata ? { metadata: result.metadata } : {}),
        ...(result.partDomain ? { partDomain: result.partDomain } : {}),
      });
      return;
    }

    res.status(200).json(result);
  }
);

