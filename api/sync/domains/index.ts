import { apiHandler } from "../../_utils/api-handler.js";
import { readLogicalCloudSyncMetadata } from "../_logical.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
  },
  async ({ res, redis, user }): Promise<void> => {
    const username = user?.username || "";
    const metadata = await readLogicalCloudSyncMetadata(redis, username);
    res.status(200).json({
      ok: true,
      metadata,
    });
  }
);

