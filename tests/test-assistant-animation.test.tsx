import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ClippySprite,
  type AgentData,
} from "../src/components/assistant/ClippySprite";
import {
  getAssistantAnimationIntent,
  getAnimationCandidates,
  getDocumentToolSequenceKind,
  getIdleAnimationPool,
  getToolAnimationIntent,
  isDocumentSequenceTool,
  resolveDocumentToolSequencePlan,
  selectAssistantAnimation,
} from "../src/components/assistant/assistantAnimation";

const frameImages: Array<[number, number]> = [[0, 0]];
const frame = { duration: 100, images: frameImages };

function agentWithAnimations(names: string[]): AgentData {
  return {
    framesize: [64, 64],
    overlayCount: 3,
    animations: Object.fromEntries(
      names.map((name) => [name, { frames: [frame] }])
    ),
  };
}

describe("assistant semantic animation selection", () => {
  test("supports original agent naming variants", () => {
    const data = agentWithAnimations([
      "Greet",
      "Think",
      "Process",
      "Goodbye",
      "RestPose",
    ]);

    expect(
      selectAssistantAnimation({ data, intent: "greeting", randomValue: 0 })
    ).toBe("Greet");
    expect(
      selectAssistantAnimation({ data, intent: "thinking", randomValue: 0 })
    ).toBe("Think");
    expect(
      selectAssistantAnimation({ data, intent: "processing", randomValue: 0 })
    ).toBe("Process");
    expect(
      selectAssistantAnimation({ data, intent: "goodbye", randomValue: 0 })
    ).toBe("Goodbye");
  });

  test("maps exact tool names to useful poses", () => {
    expect(getToolAnimationIntent("searchSongs")).toBe("searching");
    expect(getToolAnimationIntent("webFetch")).toBe("searching");
    expect(getToolAnimationIntent("read")).toBe("reading");
    expect(getToolAnimationIntent("memoryRead")).toBe("reading");
    expect(getToolAnimationIntent("edit")).toBe("writing");
    expect(getToolAnimationIntent("generateHtml")).toBe("writing");
    expect(getToolAnimationIntent("launchApp")).toBe("processing");
  });

  test("prioritizes tool errors over loading state", () => {
    expect(
      getAssistantAnimationIntent({
        isLoading: true,
        hasError: false,
        toolActivity: { name: "read", phase: "error" },
      })
    ).toBe("error");
    expect(
      getAssistantAnimationIntent({
        isLoading: true,
        hasError: false,
        toolActivity: { name: "read", phase: "running" },
      })
    ).toBe("reading");
    expect(
      getAssistantAnimationIntent({
        isLoading: true,
        hasError: false,
        toolActivity: { name: "read", phase: "complete" },
      })
    ).toBe("thinking");
    expect(
      getAssistantAnimationIntent({
        isLoading: false,
        hasError: false,
        toolActivity: { name: "read", phase: "complete" },
      })
    ).toBe("idle");
  });

  test("prefers rover topic animations for matching tools", () => {
    const data = agentWithAnimations([
      "Travel",
      "Searching",
      "RestPose",
    ]);

    expect(
      selectAssistantAnimation({
        data,
        intent: "searching",
        characterId: "rover",
        toolName: "mapsSearchPlaces",
        randomValue: 0,
      })
    ).toBe("Travel");
  });

  test("prepends tool-specific processing animations", () => {
    const data = agentWithAnimations([
      "Hearing_1",
      "Processing",
      "RestPose",
    ]);

    expect(
      selectAssistantAnimation({
        data,
        intent: "processing",
        toolName: "mediaControl",
        randomValue: 0,
      })
    ).toBe("Hearing_1");
  });

  test("maps open and songLibrary tools to reading and searching", () => {
    expect(getToolAnimationIntent("open")).toBe("reading");
    expect(getToolAnimationIntent("songLibrary")).toBe("searching");
  });

  test("excludes mega idle loops from the ambient idle pool", () => {
    const data = agentWithAnimations([
      "Idle",
      "Idle1_1",
      "DeepIdle1",
      "RestPose",
    ]);

    expect(getIdleAnimationPool(data)).toEqual(["Idle1_1"]);
  });

  test("adds enriched semantic candidates when present", () => {
    const data = agentWithAnimations([
      "Explain",
      "DoMagic2",
      "Embarrassed",
      "HideQuick",
      "RestPose",
    ]);

    expect(
      getAnimationCandidates("thinking").includes("Explain")
    ).toBe(true);
    expect(
      getAnimationCandidates("processing").includes("DoMagic2")
    ).toBe(true);
    expect(getAnimationCandidates("error").includes("Embarrassed")).toBe(true);
    expect(getAnimationCandidates("goodbye").includes("HideQuick")).toBe(true);
  });
});

describe("document read/write animation sequences", () => {
  test("maps applet and TextEdit tools to sequence kinds", () => {
    expect(isDocumentSequenceTool("read")).toBe(true);
    expect(isDocumentSequenceTool("write")).toBe(true);
    expect(isDocumentSequenceTool("edit")).toBe(true);
    expect(isDocumentSequenceTool("generateHtml")).toBe(true);
    expect(isDocumentSequenceTool("open")).toBe(false);
    expect(isDocumentSequenceTool("list")).toBe(false);
    expect(isDocumentSequenceTool("memoryRead")).toBe(false);

    expect(getDocumentToolSequenceKind("read")).toBe("read");
    expect(getDocumentToolSequenceKind("write")).toBe("write");
    expect(getDocumentToolSequenceKind("edit")).toBe("write");
    expect(getDocumentToolSequenceKind("generateHtml")).toBe("write");
    expect(getDocumentToolSequenceKind("open")).toBeNull();
  });

  test("resolves full read sequence when character supports it", () => {
    const data = agentWithAnimations([
      "Reading",
      "ReadContinued",
      "ReadReturn",
      "RestPose",
    ]);

    expect(resolveDocumentToolSequencePlan(data, "read")).toEqual({
      kind: "read",
      intro: "Reading",
      continued: "ReadContinued",
      returnAnim: "ReadReturn",
    });
  });

  test("prefers Read over Reading and skips long continued clips", () => {
    const longContinuedFrame = { duration: 4000, images: frameImages };
    const data = agentWithAnimations([
      "Read",
      "ReadContinued",
      "ReadReturn",
      "RestPose",
    ]);
    data.animations.ReadContinued = { frames: [longContinuedFrame] };

    expect(resolveDocumentToolSequencePlan(data, "read")).toEqual({
      kind: "read",
      intro: "Read",
      continued: null,
      returnAnim: "ReadReturn",
    });
  });

  test("falls back to RestPose when return animation is missing", () => {
    const data = agentWithAnimations(["Writing", "WriteContinued", "RestPose"]);

    expect(resolveDocumentToolSequencePlan(data, "write")).toEqual({
      kind: "write",
      intro: "Writing",
      continued: "WriteContinued",
      returnAnim: "RestPose",
    });
  });

  test("returns null read sequence when character lacks intro poses", () => {
    const data = agentWithAnimations(["Writing", "RestPose"]);

    expect(resolveDocumentToolSequencePlan(data, "read")).toBeNull();
    expect(resolveDocumentToolSequencePlan(data, "write")).toEqual({
      kind: "write",
      intro: "Writing",
      continued: null,
      returnAnim: "RestPose",
    });
  });

  test("loads genie agent.json with full read/write sequences", () => {
    const data = JSON.parse(
      readFileSync(
        join(process.cwd(), "public/assets/assistant/genie/agent.json"),
        "utf8"
      )
    ) as AgentData;

    expect(resolveDocumentToolSequencePlan(data, "read")).toMatchObject({
      kind: "read",
      intro: "Reading",
      continued: "ReadContinued",
      returnAnim: "ReadReturn",
    });
    expect(resolveDocumentToolSequencePlan(data, "write")).toMatchObject({
      kind: "write",
      intro: "Writing",
      returnAnim: "WriteReturn",
    });
  });

  test("loads clippy agent.json with write-only partial sequence", () => {
    const data = JSON.parse(
      readFileSync(
        join(process.cwd(), "public/assets/assistant/clippy/agent.json"),
        "utf8"
      )
    ) as AgentData;

    expect(resolveDocumentToolSequencePlan(data, "read")).toBeNull();
    expect(resolveDocumentToolSequencePlan(data, "write")).toEqual({
      kind: "write",
      intro: "Writing",
      continued: null,
      returnAnim: "RestPose",
    });
  });
});

describe("assistant sprite overlays", () => {
  let registeredDomForSuite = false;
  let root: Root | null = null;
  const originalActEnvironment = Object.getOwnPropertyDescriptor(
    globalThis,
    "IS_REACT_ACT_ENVIRONMENT"
  );

  beforeAll(() => {
    if (typeof document === "undefined") {
      GlobalRegistrator.register();
      registeredDomForSuite = true;
    }
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    document.body.replaceChildren();
  });

  afterAll(() => {
    if (originalActEnvironment) {
      Object.defineProperty(
        globalThis,
        "IS_REACT_ACT_ENVIRONMENT",
        originalActEnvironment
      );
    } else {
      Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    }
    if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
      GlobalRegistrator.unregister();
    }
  });

  test("stacks every image and keeps layers through duration-only frames", async () => {
    const data: AgentData = {
      framesize: [64, 64],
      overlayCount: 3,
      animations: {
        Sparkle: {
          frames: [
            {
              duration: 5,
              images: [
                [0, 0],
                [64, 0],
                [128, 0],
              ],
            },
            { duration: 10_000 },
          ],
        },
      },
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <ClippySprite
          mapUrl="/map.png"
          data={data}
          characterId="clippy"
          animation="Sparkle"
        />
      );
      await new Promise((resolve) => setTimeout(resolve, 15));
    });

    const layers = host.querySelectorAll("[data-assistant-sprite-layer]");
    expect(layers).toHaveLength(3);
    expect(layers.item(0).getAttribute("style")).toContain(
      "background-position: 0px 0px"
    );
    expect(layers.item(1).getAttribute("style")).toContain(
      "background-position: -64px 0px"
    );
    expect(layers.item(2).getAttribute("style")).toContain(
      "background-position: -128px 0px"
    );
  });
});
