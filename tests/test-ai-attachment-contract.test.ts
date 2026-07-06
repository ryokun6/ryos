import { describe, expect, test } from "bun:test";
import {
  getAIAttachmentIdFromUrl,
  getAIAttachmentUrl,
  isAIAttachmentMediaType,
} from "../src/shared/contracts/aiAttachment";

const ATTACHMENT_ID = "33333333-3333-4333-8333-333333333333";

describe("AI attachment contract", () => {
  test("round-trips relative and absolute attachment URLs", () => {
    const relative = getAIAttachmentUrl(ATTACHMENT_ID);
    expect(relative).toBe(`/api/ai/attachments/${ATTACHMENT_ID}`);
    expect(getAIAttachmentIdFromUrl(relative)).toBe(ATTACHMENT_ID);
    expect(
      getAIAttachmentIdFromUrl(`https://os.example${relative}`)
    ).toBe(ATTACHMENT_ID);
  });

  test("rejects malformed attachment URLs and unsupported media", () => {
    expect(
      getAIAttachmentIdFromUrl(
        `/api/ai/attachments/${ATTACHMENT_ID}/unexpected`
      )
    ).toBeNull();
    expect(
      getAIAttachmentIdFromUrl(
        `/api/ai/attachments/${ATTACHMENT_ID}?download=1`
      )
    ).toBeNull();
    expect(isAIAttachmentMediaType("image/png")).toBe(true);
    expect(isAIAttachmentMediaType("image/svg+xml")).toBe(false);
  });
});
