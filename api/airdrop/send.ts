import { apiHandler } from "../_utils/api-handler.js";
import { triggerRealtimeEvent } from "../_utils/realtime.js";
import { AIRDROP_PRESENCE_TTL_SECONDS } from "./heartbeat.js";
import { redisKeys } from "../../src/shared/redisKeys.js";

const TRANSFER_TTL_SECONDS = 300;
const MAX_CONTENT_SIZE = 2 * 1024 * 1024; // 2MB

interface SendBody {
  recipient: string;
  fileName: string;
  fileType?: string;
  content: string;
}

export default apiHandler<SendBody>(
  { methods: ["POST"], auth: "required", parseJsonBody: true },
  async ({ res, user, body, redis }) => {
    const senderUsername = user!.username;

    if (!body?.recipient || !body?.fileName || !body?.content) {
      res.status(400).json({ error: "Missing required fields: recipient, fileName, content" });
      return;
    }

    const { recipient, fileName, fileType, content } = body;

    if (content.length > MAX_CONTENT_SIZE) {
      res.status(413).json({ error: "File too large (max 2MB)" });
      return;
    }

    const cutoff = Date.now() - AIRDROP_PRESENCE_TTL_SECONDS * 1000;
    const canonicalPresenceKey = redisKeys.presence.airdropLobby();
    await redis.zremrangebyscore(canonicalPresenceKey, 0, cutoff);
    const onlineUsers = await redis.zrange(canonicalPresenceKey, 0, -1);

    if (!onlineUsers.includes(recipient)) {
      res.status(404).json({ error: "Recipient is not available" });
      return;
    }

    const transferId = crypto.randomUUID();
    const transferKey = redisKeys.session.airdropTransfer(transferId);
    const transferData = {
      id: transferId,
      sender: senderUsername,
      recipient,
      fileName,
      fileType: fileType || "text",
      content,
      createdAt: Date.now(),
    };

    await redis.set(transferKey, JSON.stringify(transferData), {
      ex: TRANSFER_TTL_SECONDS,
    });

    await triggerRealtimeEvent(`airdrop-${recipient}`, "airdrop-request", {
      transferId,
      sender: senderUsername,
      fileName,
      fileType: fileType || "text",
    });

    res.status(200).json({ success: true, transferId });
  }
);
