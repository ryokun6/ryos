import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("media app issue regressions", () => {
  test("karaoke sync mode uses lyric-offset-adjusted time", () => {
    const source = readSource(
      "src/apps/karaoke/components/KaraokeLyricsPlayback.tsx"
    );

    expect(
      source.includes(
        "const currentTimeMs = elapsedTime * 1000 + (currentTrack?.lyricOffset ?? 0);"
      )
    ).toBe(true);
    expect(
      source.match(/currentTimeMs=\{currentTimeMs\}/g)?.length
    ).toBeGreaterThanOrEqual(2);
  });

  test("karaoke and ipod fullscreen players subscribe to master volume", () => {
    const karaokeSource = readSource(
      "src/apps/karaoke/components/KaraokeAppComponent.tsx"
    );
    const ipodSource = readSource(
      "src/apps/ipod/components/IpodAppComponent.tsx"
    );

    expect(karaokeSource).not.toContain(
      "useAudioSettingsStore.getState().masterVolume"
    );
    expect(ipodSource).not.toContain(
      "useAudioSettingsStore.getState().masterVolume"
    );
    expect(karaokeSource).toContain(
      "const masterVolume = useAudioSettingsStore((state) => state.masterVolume);"
    );
    expect(ipodSource).toContain(
      "const masterVolume = useAudioSettingsStore((state) => state.masterVolume);"
    );
  });

  test("ipod avoids duplicate inline playback while fullscreen is active", () => {
    const source = readSource("src/apps/ipod/components/IpodScreen.tsx");

    expect(source).toContain("isFullScreen ? null : (");
    expect(source).toContain("playing={isPlaying && !isFullScreen}");
  });

  test("ipod seek/watchdog paths read live state and active player", () => {
    const source = readSource("src/apps/ipod/hooks/useIpodLogic.ts");

    expect(source).toContain("store.isPlaying && store.elapsedTime === startElapsed");
    expect(source.match(/const activePlayer = isFullScreen \? fullScreenPlayerRef\.current : playerRef\.current;/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("chats @ryo and pusher handlers use latest guarded state", () => {
    const ryoSource = readSource("src/apps/chats/hooks/useRyoChat.ts");
    const roomSource = readSource("src/apps/chats/hooks/useChatRoom.ts");

    expect(ryoSource).toContain(
      "useChatsStore.getState().roomMessages[currentRoomId] ?? roomMessages"
    );
    expect(roomSource).toContain("let didBindPusherConnectionLogging = false;");
    expect(roomSource).toContain("if (!data?.roomId || !data?.messageId) return;");
  });
});
