import { describe, expect, test } from "bun:test";
import {
  NAMEPLATE_OFFSET_X_MAX,
  NAMEPLATE_OFFSET_X_MIN,
  NAMEPLATE_OFFSET_Y_MAX,
  NAMEPLATE_OFFSET_Y_MIN,
  NAMEPLATE_ROTATE_DEG_MAX,
  NAMEPLATE_ROTATE_DEG_MIN,
  nameplatePoseFromId,
} from "../../../src/apps/stuff/utils/stuffNameplatePose";

describe("nameplatePoseFromId", () => {
  test("is deterministic for the same id", () => {
    const a = nameplatePoseFromId("item-abc-123");
    const b = nameplatePoseFromId("item-abc-123");
    expect(a).toEqual(b);
  });

  test("varies across different ids", () => {
    const a = nameplatePoseFromId("item-a");
    const b = nameplatePoseFromId("item-b");
    expect(a).not.toEqual(b);
  });

  test("stays within documented offset and rotation ranges", () => {
    const ids = [
      "",
      "a",
      "item-1",
      "stuff-cover-uuid-deadbeef",
      "zzzzzzzzzzzzzzzz",
    ];
    for (const id of ids) {
      const pose = nameplatePoseFromId(id);
      expect(pose.rotateDeg).toBeGreaterThanOrEqual(NAMEPLATE_ROTATE_DEG_MIN);
      expect(pose.rotateDeg).toBeLessThanOrEqual(NAMEPLATE_ROTATE_DEG_MAX);
      expect(pose.offsetX).toBeGreaterThanOrEqual(NAMEPLATE_OFFSET_X_MIN);
      expect(pose.offsetX).toBeLessThanOrEqual(NAMEPLATE_OFFSET_X_MAX);
      expect(pose.offsetY).toBeGreaterThanOrEqual(NAMEPLATE_OFFSET_Y_MIN);
      expect(pose.offsetY).toBeLessThanOrEqual(NAMEPLATE_OFFSET_Y_MAX);
    }
  });
});
