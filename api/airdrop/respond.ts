import { apiHandler } from "../_utils/api-handler.js";
import { createRedis } from "../_utils/redis.js";
import { triggerRealtimeEvent } from "../_utils/realtime.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface RespondBody {
  transferId: string;
  accept: boolean;
}

export default apiHandler<RespondBody>(
  { methods: ["POST"], auth: "required", parseJsonBody: true },
  async ({ res, user, body }) => {
    const username = user!.username;

    if (!body?.transferId || typeof body?.accept !== "boolean") {
      res
        .status(400)
        .json({ error: "Missing required fields: transferId, accept" });
      return;
    }

    const { transferId, accept } = body;
    const redis = createRedis();
    const transferKey = `airdrop:transfer:${transferId}`;

    const raw = await redis.get<string>(transferKey);
    if (!raw) {
      res.status(404).json({ error: "Transfer expired or not found" });
      return;
    }

    let transfer: {
      id: string;
      sender: string;
      recipient: string;
      fileName: string;
      fileType: string;
      content: string;
    };
    try {
      transfer = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      res.status(500).json({ error: "Corrupted transfer data" });
      return;
    }

    if (transfer.recipient !== username) {
      res.status(403).json({ error: "This transfer is not for you" });
      return;
    }

    if (accept) {
      await redis.del(transferKey);

      await triggerRealtimeEvent(
        `airdrop-${transfer.sender}`,
        "airdrop-accepted",
        {
          transferId,
          recipient: username,
          fileName: transfer.fileName,
        }
      );

      res.status(200).json({
        success: true,
        fileName: transfer.fileName,
        fileType: transfer.fileType,
        content: transfer.content,
        sender: transfer.sender,
      });
    } else {
      await redis.del(transferKey);

      await triggerRealtimeEvent(
        `airdrop-${transfer.sender}`,
        "airdrop-declined",
        {
          transferId,
          recipient: username,
          fileName: transfer.fileName,
        }
      );

      res.status(200).json({ success: true, declined: true });
    }
  }
);
