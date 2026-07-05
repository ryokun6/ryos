import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { readFileSync, statSync } from "node:fs";
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
  getAssistantAnimationMappedToolNames,
  getAssistantExitAnimationTimeout,
  getAssistantLifecycleAnimationIntent,
  getAssistantPointingDirection,
  getAnimationCandidates,
  getDeepIdleAnimationPool,
  getDocumentToolSequenceKind,
  getIdleAnimationPool,
  getToolAnimationIntent,
  isAssistantEntranceAnimation,
  isDocumentSequenceTool,
  resolveAssistantEntranceSequencePlan,
  resolveDocumentToolSequencePlan,
  selectAssistantAnimation,
  selectAssistantPointingAnimation,
} from "../src/components/assistant/assistantAnimation";
import { ASSISTANT_CHARACTERS } from "../src/components/assistant/characters";
import { TOOL_DESCRIPTIONS } from "../api/chat/tools/index.js";
import { SERVER_EXECUTED_TOOL_NAMES } from "../src/shared/tools/serverExecuted";

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
  test("keeps enter and exit intents at character lifecycle boundaries", () => {
    expect(getAssistantLifecycleAnimationIntent("characterLoad")).toBe(
      "greeting"
    );
    expect(getAssistantLifecycleAnimationIntent("bubbleOpen")).toBe(
      "attention"
    );
    expect(getAssistantLifecycleAnimationIntent("bubbleClose")).toBe(
      "acknowledge"
    );
    expect(getAssistantLifecycleAnimationIntent("quit")).toBe("goodbye");
  });

  test("keeps entrance clips out of every non-entrance candidate pool", () => {
    // Entrance clips must only play through the entrance sequence plan;
    // random picks replaying the entry animation looked like a double entry.
    expect(
      getAnimationCandidates("greeting").some(isAssistantEntranceAnimation)
    ).toBe(false);
    expect(
      getAnimationCandidates("attention").some(isAssistantEntranceAnimation)
    ).toBe(false);
    expect(
      getAnimationCandidates("processing", {
        toolName: "launchApp",
      }).some(isAssistantEntranceAnimation)
    ).toBe(false);
    expect(
      getAnimationCandidates("processing", {
        toolName: "closeApp",
      })
    ).not.toContain("Hide");
  });

  test("tool-specific prepends survive the entrance/exit filter", () => {
    // "Show" (launchApp) and "Hide" (closeApp) prepends used to be filtered
    // out entirely, leaving those tools with generic clips only.
    expect(
      getAnimationCandidates("processing", { toolName: "launchApp" })[0]
    ).toBe("GetAttention");
    expect(
      getAnimationCandidates("processing", { toolName: "closeApp" })[0]
    ).toBe("Wave");
    expect(
      getAnimationCandidates("processing", { toolName: "settings" })[0]
    ).toBe("GetWizardy");
  });

  test("falls back to Show plus a greeting gesture when there is no Greeting clip", () => {
    const data = agentWithAnimations(["Show", "Greet", "Wave", "RestPose"]);

    expect(resolveAssistantEntranceSequencePlan(data)).toEqual({
      first: "Show",
      followUp: "Greet",
    });
    expect(
      resolveAssistantEntranceSequencePlan(
        agentWithAnimations(["Greet", "RestPose"])
      )
    ).toEqual({
      first: "RestPose",
      followUp: null,
    });
  });

  test("prefers the fully-authored Greeting entrance over Show, with no follow-up", () => {
    // On every character that ships one, "Greeting" is the real entrance: it
    // starts from (nearly) empty frames, materializes the character, greets,
    // and ends at the rest pose — while "Show" on those characters is a
    // 40–300ms pop. Greeting already contains the greeting gesture, so
    // chaining a follow-up (or playing Show first) would double the entry.
    const withGreeting = agentWithAnimations([
      "Show",
      "Greeting",
      "Wave",
      "RestPose",
    ]);
    expect(resolveAssistantEntranceSequencePlan(withGreeting)).toEqual({
      first: "Greeting",
      followUp: null,
    });
    expect(isAssistantEntranceAnimation("Greeting")).toBe(true);
  });

  test("uses clip duration for quit with a bounded malformed-data fallback", () => {
    const data = agentWithAnimations(["GoodBye"]);
    data.animations.GoodBye = {
      frames: [
        { duration: 400, images: frameImages },
        { duration: 600, images: frameImages },
      ],
    };

    expect(getAssistantExitAnimationTimeout(data, "GoodBye")).toBe(1250);
    data.animations.GoodBye = {
      frames: [{ duration: 60_000, images: frameImages }],
    };
    expect(getAssistantExitAnimationTimeout(data, "GoodBye")).toBe(10_000);
    expect(getAssistantExitAnimationTimeout(data, "Missing")).toBe(500);
  });

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

  test("maps open and songLibraryControl tools to reading and searching", () => {
    expect(getToolAnimationIntent("open")).toBe("reading");
    expect(getToolAnimationIntent("songLibraryControl")).toBe("searching");
    expect(getToolAnimationIntent("stickiesControl")).toBe("writing");
  });

  test("speaks once the in-flight turn has visible reply text", () => {
    expect(
      getAssistantAnimationIntent({
        isLoading: true,
        hasError: false,
        toolActivity: null,
        hasVisibleReply: true,
      })
    ).toBe("speaking");
    // A running tool still wins over streamed text.
    expect(
      getAssistantAnimationIntent({
        isLoading: true,
        hasError: false,
        toolActivity: { name: "webFetch", phase: "running" },
        hasVisibleReply: true,
      })
    ).toBe("searching");
    expect(
      getAssistantAnimationIntent({
        isLoading: false,
        hasError: false,
        toolActivity: null,
        hasVisibleReply: true,
      })
    ).toBe("idle");
  });

  test("every animation-mapped tool name exists in the tool registry", () => {
    // Guards against tool renames silently killing animations (this bit us
    // when switchTheme became settings and songLibrary became
    // songLibraryControl).
    const knownToolNames = new Set<string>([
      ...Object.keys(TOOL_DESCRIPTIONS),
      ...SERVER_EXECUTED_TOOL_NAMES,
    ]);
    for (const toolName of getAssistantAnimationMappedToolNames()) {
      expect(knownToolNames).toContain(toolName);
    }
  });

  test("excludes mega idle loops from the ambient idle pool", () => {
    const data = agentWithAnimations([
      "Idle",
      "Idle1_1",
      "DeepIdle1",
      "RestPose",
    ]);

    expect(getIdleAnimationPool(data)).toEqual(["Idle1_1"]);
    expect(getDeepIdleAnimationPool(data)).toEqual(["DeepIdle1"]);
    expect(getDeepIdleAnimationPool(agentWithAnimations(["RestPose"]))).toEqual(
      []
    );
  });

  test("resolves pointing directions from viewer-space geometry", () => {
    const assistant = { x: 500, y: 400, width: 100, height: 100 };
    const at = (x: number, y: number) => ({ x, y, width: 200, height: 100 });

    // Window centered far to the left / right of the character.
    expect(getAssistantPointingDirection(assistant, at(100, 420))).toBe(
      "left"
    );
    expect(getAssistantPointingDirection(assistant, at(900, 420))).toBe(
      "right"
    );
    // Mostly above / below.
    expect(getAssistantPointingDirection(assistant, at(460, 40))).toBe("up");
    expect(getAssistantPointingDirection(assistant, at(460, 800))).toBe(
      "down"
    );
    // Clearly diagonal.
    expect(getAssistantPointingDirection(assistant, at(100, 100))).toBe(
      "upLeft"
    );
    expect(getAssistantPointingDirection(assistant, at(900, 800))).toBe(
      "downRight"
    );
    // Too close to point at.
    expect(getAssistantPointingDirection(assistant, at(470, 410))).toBeNull();
  });

  test("selects pointing clips with diagonal fallbacks and null when unavailable", () => {
    // Clip names use the CHARACTER's perspective (it faces the viewer), so a
    // viewer-space direction maps to the mirrored clip name: a target on the
    // viewer's left plays the character's right-side clip and vice versa.
    const clippyLike = agentWithAnimations([
      "GestureLeft",
      "GestureRight",
      "LookUpLeft",
      "LookUp",
      "RestPose",
    ]);
    expect(selectAssistantPointingAnimation(clippyLike, "left")).toBe(
      "GestureRight"
    );
    expect(selectAssistantPointingAnimation(clippyLike, "right")).toBe(
      "GestureLeft"
    );
    expect(selectAssistantPointingAnimation(clippyLike, "upRight")).toBe(
      "LookUpLeft"
    );
    // No LookUpRight clip: viewer upLeft falls back through GestureRight.
    expect(selectAssistantPointingAnimation(clippyLike, "upLeft")).toBe(
      "GestureRight"
    );
    expect(selectAssistantPointingAnimation(clippyLike, "up")).toBe("LookUp");

    // Rover only ships GestureLeft / LookUp / LookUpLeft (character-side
    // names), so it can only look toward the viewer's right.
    const roverLike = agentWithAnimations([
      "GestureLeft",
      "LookUp",
      "LookUpLeft",
      "RestPose",
    ]);
    expect(selectAssistantPointingAnimation(roverLike, "left")).toBeNull();
    expect(selectAssistantPointingAnimation(roverLike, "right")).toBe(
      "GestureLeft"
    );
    expect(selectAssistantPointingAnimation(roverLike, "upLeft")).toBe(
      "LookUp"
    );
    expect(selectAssistantPointingAnimation(roverLike, "upRight")).toBe(
      "LookUpLeft"
    );
  });

  test("adds enriched semantic candidates", () => {
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

describe("assistant character assets", () => {
  test("every registered character ships consistent sprite data", () => {
    for (const character of ASSISTANT_CHARACTERS) {
      const dir = join(
        process.cwd(),
        "public/assets/assistant",
        character.id
      );
      const data = JSON.parse(
        readFileSync(join(dir, "agent.json"), "utf8")
      ) as AgentData;

      expect(data.framesize).toEqual([character.width, character.height]);
      expect(statSync(join(dir, "map.png")).size).toBeGreaterThan(0);
      // Core clips the overlay/animation planner relies on.
      for (const name of ["RestPose", "Show", "Hide"]) {
        expect(data.animations[name]).toBeDefined();
      }
      expect(getIdleAnimationPool(data).length).toBeGreaterThan(0);
    }
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

  test("starts empty and reveals the first visible entrance frame", async () => {
    const data: AgentData = {
      framesize: [64, 64],
      animations: {
        Show: {
          frames: [
            { duration: 30 },
            { duration: 10_000, images: [[64, 0]] },
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
          animation="Show"
          initiallyHidden
        />
      );
    });

    expect(
      host.querySelectorAll("[data-assistant-sprite-layer]")
    ).toHaveLength(0);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    const layers = host.querySelectorAll("[data-assistant-sprite-layer]");
    expect(layers).toHaveLength(1);
    expect(layers.item(0).getAttribute("style")).toContain(
      "background-position: -64px 0px"
    );
  });

  test("renders static previews immediately", async () => {
    const data = agentWithAnimations(["RestPose"]);
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <ClippySprite
          mapUrl="/map.png"
          data={data}
          characterId="clippy"
          animation="RestPose"
        />
      );
    });

    const layers = host.querySelectorAll("[data-assistant-sprite-layer]");
    expect(layers).toHaveLength(1);
    expect(layers.item(0).getAttribute("style")).toContain(
      "background-position: 0px 0px"
    );
  });

  test("falls back to the base pose when an entrance clip is missing", async () => {
    const onAnimationEnd: string[] = [];
    const data: AgentData = {
      framesize: [64, 64],
      animations: {},
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
          animation="Show"
          initiallyHidden
          onAnimationEnd={(name) => onAnimationEnd.push(name)}
        />
      );
    });

    expect(
      host.querySelectorAll("[data-assistant-sprite-layer]")
    ).toHaveLength(1);
    // A missing clip must still notify the state machine, otherwise the
    // sprite freezes at its base pose until an unrelated state change.
    expect(onAnimationEnd).toEqual(["Show"]);
  });

  test("keeps the current frame during ordinary animation changes", async () => {
    const data: AgentData = {
      framesize: [64, 64],
      animations: {
        RestPose: { frames: [frame] },
        Thinking: { frames: [{ duration: 10_000 }] },
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
          animation="RestPose"
        />
      );
    });

    await act(async () => {
      root?.render(
        <ClippySprite
          mapUrl="/map.png"
          data={data}
          characterId="clippy"
          animation="Thinking"
        />
      );
    });

    expect(
      host.querySelectorAll("[data-assistant-sprite-layer]")
    ).toHaveLength(1);
  });

  test("winds down exit-branching clips before starting the next animation", async () => {
    const onAnimationEnd: string[] = [];
    const data: AgentData = {
      framesize: [64, 64],
      animations: {
        // Loops frame 0 forever; the only way out is the exitBranch path.
        Loop: {
          useExitBranching: true,
          frames: [
            {
              duration: 30,
              images: [[0, 0]],
              exitBranch: 1,
              branching: { branches: [{ frameIndex: 0, weight: 100 }] },
            },
            { duration: 30, images: [[64, 0]] },
          ],
        },
        Next: { frames: [{ duration: 10_000, images: [[128, 0]] }] },
      },
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    const renderSprite = (animation: string) =>
      act(async () => {
        root?.render(
          <ClippySprite
            mapUrl="/map.png"
            data={data}
            characterId="clippy"
            animation={animation}
            onAnimationEnd={(name) => onAnimationEnd.push(name)}
          />
        );
      });

    await renderSprite("Loop");
    const layer = () =>
      host
        .querySelector("[data-assistant-sprite-layer]")
        ?.getAttribute("style") ?? "";
    expect(layer()).toContain("background-position: 0px 0px");

    // Interrupt: the clip must not hard-cut to Next…
    await renderSprite("Next");
    expect(layer()).toContain("background-position: 0px 0px");

    // …but follow its exit frame, then start Next without reporting an end
    // for the interrupted clip.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(layer()).toContain("background-position: -128px 0px");
    expect(onAnimationEnd).toEqual([]);
  });

  test("holds exit-branching clips at their wait point, then winds down into the next clip", async () => {
    // Real Microsoft Agent exit-branching clips (e.g. Merlin's idles) never
    // reach their wind-down frames naturally: the held pose branches straight
    // to a terminal keep-previous frame, and the wind-down is only reachable
    // via exitBranch. Ending the clip there used to strand the held pose and
    // snap to the next clip.
    const onAnimationEnd: string[] = [];
    const data: AgentData = {
      framesize: [64, 64],
      animations: {
        Held: {
          useExitBranching: true,
          frames: [
            {
              // Held pose: natural flow jumps to the terminal marker.
              duration: 30,
              images: [[64, 0]],
              exitBranch: 1,
              branching: { branches: [{ frameIndex: 3, weight: 100 }] },
            },
            { duration: 30, images: [[128, 0]] }, // wind-down
            { duration: 30, images: [[0, 0]] }, // back at rest
            { duration: 0 }, // terminal keep-previous marker
          ],
        },
        Next: { frames: [{ duration: 10_000, images: [[192, 0]] }] },
      },
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    const renderSprite = (animation: string) =>
      act(async () => {
        root?.render(
          <ClippySprite
            mapUrl="/map.png"
            data={data}
            characterId="clippy"
            animation={animation}
            onAnimationEnd={(name) => onAnimationEnd.push(name)}
          />
        );
      });
    const layer = () =>
      host
        .querySelector("[data-assistant-sprite-layer]")
        ?.getAttribute("style") ?? "";

    await renderSprite("Held");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    // Natural end reached: the end is reported, but the held pose stays on
    // screen instead of jumping anywhere.
    expect(onAnimationEnd).toEqual(["Held"]);
    expect(layer()).toContain("background-position: -64px 0px");

    // The next request winds down through the exit path before Next starts.
    await renderSprite("Next");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(layer()).toContain("background-position: -192px 0px");
    expect(onAnimationEnd).toEqual(["Held"]);
  });

  test("hard-switches clips that lack exit branching", async () => {
    const data: AgentData = {
      framesize: [64, 64],
      animations: {
        Busy: {
          frames: [{ duration: 10_000, images: [[0, 0]] }],
        },
        Next: { frames: [{ duration: 10_000, images: [[128, 0]] }] },
      },
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    const renderSprite = (animation: string) =>
      act(async () => {
        root?.render(
          <ClippySprite
            mapUrl="/map.png"
            data={data}
            characterId="clippy"
            animation={animation}
          />
        );
      });

    await renderSprite("Busy");
    await renderSprite("Next");
    expect(
      host
        .querySelector("[data-assistant-sprite-layer]")
        ?.getAttribute("style")
    ).toContain("background-position: -128px 0px");
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
