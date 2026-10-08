import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const registeredHere = !GlobalRegistrator.isRegistered;
if (registeredHere) GlobalRegistrator.register();

const { useIpodStore } = await import("../../../src/stores/useIpodStore");
const { handleVfsList } = await import("../../../src/apps/chats/tools/vfsHandlers");

type IpodTracks = ReturnType<typeof useIpodStore.getState>["tracks"];
type ToolOutput = { output?: string; state?: string; errorText?: string };

const originalState = useIpodStore.getState();

function seedTracks(count: number) {
  const tracks = Array.from({ length: count }, (_, i) => ({
    id: `vid_${i}`,
    url: `https://www.youtube.com/watch?v=vid_${i}`,
    title: `Track ${i}`,
    artist: "Artist",
  })) as IpodTracks;
  useIpodStore.setState({ tracks, librarySource: "youtube" });
}

async function runList(input: { offset?: number; limit?: number; query?: string }) {
  const outputs: ToolOutput[] = [];
  await handleVfsList({ path: "/Music", ...input }, "list", "call-1", {
    addToolOutput: (o: ToolOutput) => outputs.push(o),
    launchApp: mock(() => "instance"),
    detectUserOS: () => "macOS",
    saveFile: mock(async () => {}),
    recordOpenedInstance: mock(() => {}),
  } as unknown as Parameters<typeof handleVfsList>[3]);
  expect(outputs).toHaveLength(1);
  const output = outputs[0].output ?? "";
  const items = JSON.parse(output.match(/:\n(\[.*\])/s)?.[1] ?? "[]") as {
    id: string;
  }[];
  const pagination = JSON.parse(
    output.match(/Pagination: (\{.*?\})/)?.[1] ?? "null"
  ) as { total: number; hasMore: boolean; nextOffset: number | null } | null;
  return { output, ids: items.map((i) => i.id), pagination };
}

beforeAll(() => {
  useIpodStore.setState({ librarySource: "youtube" });
});

afterAll(() => {
  useIpodStore.setState({
    tracks: originalState.tracks,
    librarySource: originalState.librarySource,
  });
  if (registeredHere) GlobalRegistrator.unregister();
});

describe("list /Music paging", () => {
  test("empty library", async () => {
    seedTracks(0);
    const { ids, pagination } = await runList({});
    expect(ids).toEqual([]);
    expect(pagination).toBeNull();
  });

  test("no params returns the first 25 with paging metadata", async () => {
    seedTracks(60);
    const { ids, pagination, output } = await runList({});
    expect(ids).toHaveLength(25);
    expect(ids[0]).toBe("vid_0");
    expect(pagination).toMatchObject({ total: 60, hasMore: true, nextOffset: 25 });
    expect(output).toContain("showing 1-25 of 60");
  });

  test("exact page boundary", async () => {
    seedTracks(50);
    const { ids, pagination } = await runList({ offset: 25, limit: 25 });
    expect(ids).toEqual(Array.from({ length: 25 }, (_, i) => `vid_${i + 25}`));
    expect(pagination).toMatchObject({ total: 50, hasMore: false, nextOffset: null });
  });

  test("last partial page", async () => {
    seedTracks(60);
    const { ids, pagination } = await runList({ offset: 50, limit: 50 });
    expect(ids).toEqual(Array.from({ length: 10 }, (_, i) => `vid_${i + 50}`));
    expect(pagination).toMatchObject({ total: 60, hasMore: false, nextOffset: null });
  });

  test("offset past the end reports the total without items", async () => {
    seedTracks(5);
    const { ids, pagination, output } = await runList({ offset: 10 });
    expect(ids).toEqual([]);
    expect(pagination).toMatchObject({ total: 5, hasMore: false });
    expect(output.startsWith("Found 0 songs")).toBe(true);
  });
});
