import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canCreateAudioNodes,
  tryCreateGainNode,
} from "../../../src/lib/audioContext";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("AudioContext node creation guards", () => {
  test("rejects the dummy closed context that lacks createGain", () => {
    const dummy = { state: "closed" } as AudioContext;
    expect(canCreateAudioNodes(dummy)).toBe(false);
    expect(tryCreateGainNode(dummy)).toBeNull();
  });

  test("rejects null, undefined, and closed real-shaped contexts", () => {
    expect(canCreateAudioNodes(null)).toBe(false);
    expect(canCreateAudioNodes(undefined)).toBe(false);
    expect(
      canCreateAudioNodes({
        state: "closed",
        createGain: () => {
          throw new Error("should not run");
        },
        destination: {},
      } as unknown as AudioContext),
    ).toBe(false);
  });

  test("creates a gain node when the context is usable", () => {
    const created: { gain: { value: number } } = { gain: { value: 1 } };
    const ctx = {
      state: "running",
      destination: {},
      createGain: () => created,
    } as unknown as AudioContext;
    expect(canCreateAudioNodes(ctx)).toBe(true);
    expect(tryCreateGainNode(ctx)).toBe(created);
  });

  test("swallows createGain throws instead of escalating", () => {
    const ctx = {
      state: "running",
      destination: {},
      createGain: () => {
        throw new Error("WAAPI / Web Audio unavailable");
      },
    } as unknown as AudioContext;
    expect(tryCreateGainNode(ctx)).toBeNull();
  });

  test("useSound mounts through tryCreateGainNode", () => {
    const source = readSource("src/hooks/useSound.ts");
    expect(source).toContain("tryCreateGainNode");
    expect(source).not.toMatch(/getAudioContext\(\)\.createGain\(\)/);
  });
});
