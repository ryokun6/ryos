/**
 * Runtime parity checks between:
 * - Vercel dev server APIs
 * - VPS adapter APIs
 *
 * This is intentionally lightweight and focuses on status/shape parity
 * for representative endpoints.
 */

const vercelBaseUrl = process.env.VERCEL_API_BASE_URL || "http://127.0.0.1:3000";
const vpsBaseUrl = process.env.VPS_API_BASE_URL || "http://127.0.0.1:3100";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<{ status: number; headers: Headers; data: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // keep text
  }
  return { status: res.status, headers: res.headers, data };
}

async function testParseTitleParity(): Promise<void> {
  const init: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "Artist - Song" }),
  };

  const vercel = await fetchJson(vercelBaseUrl, "/api/parse-title", init);
  const vps = await fetchJson(vpsBaseUrl, "/api/parse-title", init);

  assert(vercel.status === 200, `vercel parse-title expected 200, got ${vercel.status}`);
  assert(vps.status === 200, `vps parse-title expected 200, got ${vps.status}`);

  const vercelData = vercel.data as { title?: string; artist?: string };
  const vpsData = vps.data as { title?: string; artist?: string };
  assert(
    vercelData.title === vpsData.title,
    `parse-title mismatch title: vercel=${vercelData.title} vps=${vpsData.title}`
  );
  assert(
    vercelData.artist === vpsData.artist,
    `parse-title mismatch artist: vercel=${vercelData.artist} vps=${vpsData.artist}`
  );
}

async function testChatParity(): Promise<void> {
  const init: RequestInit = {
    method: "GET",
    headers: { Origin: "http://localhost:5173" },
  };

  const vercel = await fetch(`${vercelBaseUrl}/api/chat`, init);
  const vps = await fetch(`${vpsBaseUrl}/api/chat`, init);

  assert(vercel.status === 405, `vercel chat GET expected 405, got ${vercel.status}`);
  assert(vps.status === 405, `vps chat GET expected 405, got ${vps.status}`);
}

async function testSongsNotFoundParity(): Promise<void> {
  const init: RequestInit = {
    headers: { Origin: "http://localhost:5173" },
  };
  const path = "/api/songs/nonexistent123?include=metadata";
  const vercel = await fetchJson(vercelBaseUrl, path, init);
  const vps = await fetchJson(vpsBaseUrl, path, init);

  assert(vercel.status === 404, `vercel songs expected 404, got ${vercel.status}`);
  assert(vps.status === 404, `vps songs expected 404, got ${vps.status}`);

  const vercelError = (vercel.data as { error?: string })?.error;
  const vpsError = (vps.data as { error?: string })?.error;
  assert(
    vercelError === vpsError,
    `songs not-found error mismatch: vercel=${vercelError} vps=${vpsError}`
  );

  const deleteInit: RequestInit = {
    method: "DELETE",
    headers: { Origin: "http://localhost:5173" },
  };
  const vercelDeleteUnauthorized = await fetch(`${vercelBaseUrl}/api/songs/dQw4w9WgXcQ`, deleteInit);
  const vpsDeleteUnauthorized = await fetch(`${vpsBaseUrl}/api/songs/dQw4w9WgXcQ`, deleteInit);
  assert(
    vercelDeleteUnauthorized.status === 401,
    `vercel songs/[id] delete unauthorized expected 401, got ${vercelDeleteUnauthorized.status}`
  );
  assert(
    vpsDeleteUnauthorized.status === 401,
    `vps songs/[id] delete unauthorized expected 401, got ${vpsDeleteUnauthorized.status}`
  );

  const searchLyricsInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "search-lyrics" }),
  };
  const vercelSearchLyricsMissingQuery = await fetch(
    `${vercelBaseUrl}/api/songs/dQw4w9WgXcQ`,
    searchLyricsInit
  );
  const vpsSearchLyricsMissingQuery = await fetch(
    `${vpsBaseUrl}/api/songs/dQw4w9WgXcQ`,
    searchLyricsInit
  );
  assert(
    vercelSearchLyricsMissingQuery.status === vpsSearchLyricsMissingQuery.status,
    `songs/[id] search-lyrics status mismatch: vercel=${vercelSearchLyricsMissingQuery.status} vps=${vpsSearchLyricsMissingQuery.status}`
  );
  assert(
    [200, 400].includes(vercelSearchLyricsMissingQuery.status),
    `songs/[id] search-lyrics expected 200/400, got ${vercelSearchLyricsMissingQuery.status}`
  );

  const translateInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "translate" }),
  };
  const vercelTranslateMissingLanguage = await fetch(
    `${vercelBaseUrl}/api/songs/dQw4w9WgXcQ`,
    translateInit
  );
  const vpsTranslateMissingLanguage = await fetch(
    `${vpsBaseUrl}/api/songs/dQw4w9WgXcQ`,
    translateInit
  );
  assert(
    vercelTranslateMissingLanguage.status === 400,
    `vercel songs/[id] translate missing language expected 400, got ${vercelTranslateMissingLanguage.status}`
  );
  assert(
    vpsTranslateMissingLanguage.status === 400,
    `vps songs/[id] translate missing language expected 400, got ${vpsTranslateMissingLanguage.status}`
  );

  const translateStreamInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "translate-stream" }),
  };
  const vercelTranslateStreamInvalid = await fetch(
    `${vercelBaseUrl}/api/songs/dQw4w9WgXcQ`,
    translateStreamInit
  );
  const vpsTranslateStreamInvalid = await fetch(
    `${vpsBaseUrl}/api/songs/dQw4w9WgXcQ`,
    translateStreamInit
  );
  assert(
    vercelTranslateStreamInvalid.status === 400,
    `vercel songs/[id] translate-stream invalid expected 400, got ${vercelTranslateStreamInvalid.status}`
  );
  assert(
    vpsTranslateStreamInvalid.status === 400,
    `vps songs/[id] translate-stream invalid expected 400, got ${vpsTranslateStreamInvalid.status}`
  );

  const furiganaStreamInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "furigana-stream" }),
  };
  const vercelFuriganaStreamInvalid = await fetch(
    `${vercelBaseUrl}/api/songs/dQw4w9WgXcQ`,
    furiganaStreamInit
  );
  const vpsFuriganaStreamInvalid = await fetch(
    `${vpsBaseUrl}/api/songs/dQw4w9WgXcQ`,
    furiganaStreamInit
  );
  assert(
    vercelFuriganaStreamInvalid.status === vpsFuriganaStreamInvalid.status,
    `songs/[id] furigana-stream status mismatch: vercel=${vercelFuriganaStreamInvalid.status} vps=${vpsFuriganaStreamInvalid.status}`
  );
  assert(
    [200, 400].includes(vercelFuriganaStreamInvalid.status),
    `songs/[id] furigana-stream expected 200/400, got ${vercelFuriganaStreamInvalid.status}`
  );

  const soramimiStreamInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "soramimi-stream" }),
  };
  const vercelSoramimiStreamInvalid = await fetch(
    `${vercelBaseUrl}/api/songs/dQw4w9WgXcQ`,
    soramimiStreamInit
  );
  const vpsSoramimiStreamInvalid = await fetch(
    `${vpsBaseUrl}/api/songs/dQw4w9WgXcQ`,
    soramimiStreamInit
  );
  assert(
    vercelSoramimiStreamInvalid.status === vpsSoramimiStreamInvalid.status,
    `songs/[id] soramimi-stream status mismatch: vercel=${vercelSoramimiStreamInvalid.status} vps=${vpsSoramimiStreamInvalid.status}`
  );
  assert(
    [200, 400].includes(vercelSoramimiStreamInvalid.status),
    `songs/[id] soramimi-stream expected 200/400, got ${vercelSoramimiStreamInvalid.status}`
  );

  const clearCachedDataInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "clear-cached-data" }),
  };
  const vercelClearCachedDataMissingSong = await fetch(
    `${vercelBaseUrl}/api/songs/aaaaaaaaaaa`,
    clearCachedDataInit
  );
  const vpsClearCachedDataMissingSong = await fetch(
    `${vpsBaseUrl}/api/songs/aaaaaaaaaaa`,
    clearCachedDataInit
  );
  assert(
    vercelClearCachedDataMissingSong.status === 404,
    `vercel songs/[id] clear-cached-data missing song expected 404, got ${vercelClearCachedDataMissingSong.status}`
  );
  assert(
    vpsClearCachedDataMissingSong.status === 404,
    `vps songs/[id] clear-cached-data missing song expected 404, got ${vpsClearCachedDataMissingSong.status}`
  );

  const fetchLyricsNoSourceInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "fetch-lyrics" }),
  };
  const vercelFetchLyricsNoSource = await fetch(
    `${vercelBaseUrl}/api/songs/dQw4w9WgXcQ`,
    fetchLyricsNoSourceInit
  );
  const vpsFetchLyricsNoSource = await fetch(
    `${vpsBaseUrl}/api/songs/dQw4w9WgXcQ`,
    fetchLyricsNoSourceInit
  );
  assert(
    vercelFetchLyricsNoSource.status === vpsFetchLyricsNoSource.status,
    `songs/[id] fetch-lyrics status mismatch: vercel=${vercelFetchLyricsNoSource.status} vps=${vpsFetchLyricsNoSource.status}`
  );
  assert(
    [200, 400].includes(vercelFetchLyricsNoSource.status),
    `songs/[id] fetch-lyrics expected 200/400, got ${vercelFetchLyricsNoSource.status}`
  );

  const unshareInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "unshare" }),
  };
  const vercelUnshareUnauthorized = await fetch(
    `${vercelBaseUrl}/api/songs/dQw4w9WgXcQ`,
    unshareInit
  );
  const vpsUnshareUnauthorized = await fetch(
    `${vpsBaseUrl}/api/songs/dQw4w9WgXcQ`,
    unshareInit
  );
  assert(
    vercelUnshareUnauthorized.status === 401,
    `vercel songs/[id] unshare unauthorized expected 401, got ${vercelUnshareUnauthorized.status}`
  );
  assert(
    vpsUnshareUnauthorized.status === 401,
    `vps songs/[id] unshare unauthorized expected 401, got ${vpsUnshareUnauthorized.status}`
  );

  const updateSongInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "Updated Title" }),
  };
  const vercelUpdateSongUnauthorized = await fetch(
    `${vercelBaseUrl}/api/songs/dQw4w9WgXcQ`,
    updateSongInit
  );
  const vpsUpdateSongUnauthorized = await fetch(
    `${vpsBaseUrl}/api/songs/dQw4w9WgXcQ`,
    updateSongInit
  );
  assert(
    vercelUpdateSongUnauthorized.status === 401,
    `vercel songs/[id] update unauthorized expected 401, got ${vercelUpdateSongUnauthorized.status}`
  );
  assert(
    vpsUpdateSongUnauthorized.status === 401,
    `vps songs/[id] update unauthorized expected 401, got ${vpsUpdateSongUnauthorized.status}`
  );
}

async function testIframeCheckParity(): Promise<void> {
  const path = `/api/iframe-check?url=${encodeURIComponent("https://example.com")}`;
  const init: RequestInit = {
    headers: { Origin: "http://localhost:5173" },
  };

  const vercelRes = await fetch(`${vercelBaseUrl}${path}`, init);
  const vpsRes = await fetch(`${vpsBaseUrl}${path}`, init);

  assert(vercelRes.status === 200, `vercel iframe-check expected 200, got ${vercelRes.status}`);
  assert(vpsRes.status === 200, `vps iframe-check expected 200, got ${vpsRes.status}`);

  const vercelCsp = vercelRes.headers.get("content-security-policy");
  const vpsCsp = vpsRes.headers.get("content-security-policy");
  assert(!!vercelCsp, "vercel iframe-check missing content-security-policy");
  assert(!!vpsCsp, "vps iframe-check missing content-security-policy");

  const vercelMissingUrl = await fetch(`${vercelBaseUrl}/api/iframe-check`, init);
  const vpsMissingUrl = await fetch(`${vpsBaseUrl}/api/iframe-check`, init);
  assert(
    vercelMissingUrl.status === 400,
    `vercel iframe-check missing url expected 400, got ${vercelMissingUrl.status}`
  );
  assert(
    vpsMissingUrl.status === 400,
    `vps iframe-check missing url expected 400, got ${vpsMissingUrl.status}`
  );
}

async function testUsersAndBulkParity(): Promise<void> {
  const usersInit: RequestInit = {
    headers: { Origin: "http://localhost:5173" },
  };
  const vercelUsers = await fetch(`${vercelBaseUrl}/api/users?search=parity`, usersInit);
  const vpsUsers = await fetch(`${vpsBaseUrl}/api/users?search=parity`, usersInit);
  assert(vercelUsers.status === 200, `vercel users search expected 200, got ${vercelUsers.status}`);
  assert(vpsUsers.status === 200, `vps users search expected 200, got ${vpsUsers.status}`);

  const vercelBulkInvalid = await fetch(
    `${vercelBaseUrl}/api/messages/bulk?roomIds=bad room id`,
    usersInit
  );
  const vpsBulkInvalid = await fetch(
    `${vpsBaseUrl}/api/messages/bulk?roomIds=bad room id`,
    usersInit
  );
  assert(
    vercelBulkInvalid.status === 400,
    `vercel bulk invalid roomId expected 400, got ${vercelBulkInvalid.status}`
  );
  assert(
    vpsBulkInvalid.status === 400,
    `vps bulk invalid roomId expected 400, got ${vpsBulkInvalid.status}`
  );

  const songsCreateInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: "dQw4w9WgXcQ", title: "Parity Song" }),
  };
  const vercelSongsCreateUnauthorized = await fetch(`${vercelBaseUrl}/api/songs`, songsCreateInit);
  const vpsSongsCreateUnauthorized = await fetch(`${vpsBaseUrl}/api/songs`, songsCreateInit);
  assert(
    vercelSongsCreateUnauthorized.status === 401,
    `vercel songs create unauthorized expected 401, got ${vercelSongsCreateUnauthorized.status}`
  );
  assert(
    vpsSongsCreateUnauthorized.status === 401,
    `vps songs create unauthorized expected 401, got ${vpsSongsCreateUnauthorized.status}`
  );

  const presenceInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  };
  const vercelPresence = await fetch(`${vercelBaseUrl}/api/presence/switch`, presenceInit);
  const vpsPresence = await fetch(`${vpsBaseUrl}/api/presence/switch`, presenceInit);
  assert(
    vercelPresence.status === 400,
    `vercel presence/switch missing username expected 400, got ${vercelPresence.status}`
  );
  assert(
    vpsPresence.status === 400,
    `vps presence/switch missing username expected 400, got ${vpsPresence.status}`
  );

  const vercelLinkPreviewMissing = await fetch(`${vercelBaseUrl}/api/link-preview`, usersInit);
  const vpsLinkPreviewMissing = await fetch(`${vpsBaseUrl}/api/link-preview`, usersInit);
  assert(
    vercelLinkPreviewMissing.status === 400,
    `vercel link-preview missing url expected 400, got ${vercelLinkPreviewMissing.status}`
  );
  assert(
    vpsLinkPreviewMissing.status === 400,
    `vps link-preview missing url expected 400, got ${vpsLinkPreviewMissing.status}`
  );

  const speechInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
      "X-Forwarded-For": `10.77.${Math.floor(Math.random() * 200)}.${Math.floor(
        Math.random() * 200
      )}`,
    },
    body: JSON.stringify({}),
  };
  let vercelSpeechMissing = await fetch(`${vercelBaseUrl}/api/speech`, speechInit);
  let vpsSpeechMissing = await fetch(`${vpsBaseUrl}/api/speech`, speechInit);
  if (vercelSpeechMissing.status === 429 || vpsSpeechMissing.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 65000));
    vercelSpeechMissing = await fetch(`${vercelBaseUrl}/api/speech`, speechInit);
    vpsSpeechMissing = await fetch(`${vpsBaseUrl}/api/speech`, speechInit);
  }
  assert(
    [400, 429].includes(vercelSpeechMissing.status),
    `vercel speech missing text expected 400/429, got ${vercelSpeechMissing.status}`
  );
  assert(
    [400, 429].includes(vpsSpeechMissing.status),
    `vps speech missing text expected 400/429, got ${vpsSpeechMissing.status}`
  );

  const pusherInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: "test", event: "noop", data: {} }),
  };
  const vercelPusherForbidden = await fetch(`${vercelBaseUrl}/api/pusher/broadcast`, pusherInit);
  const vpsPusherForbidden = await fetch(`${vpsBaseUrl}/api/pusher/broadcast`, pusherInit);
  assert(
    vercelPusherForbidden.status === vpsPusherForbidden.status,
    `pusher/broadcast status mismatch: vercel=${vercelPusherForbidden.status} vps=${vpsPusherForbidden.status}`
  );
  assert(
    [200, 403].includes(vercelPusherForbidden.status),
    `unexpected pusher/broadcast status ${vercelPusherForbidden.status}`
  );

  const vercelListenList = await fetch(`${vercelBaseUrl}/api/listen/sessions`, usersInit);
  const vpsListenList = await fetch(`${vpsBaseUrl}/api/listen/sessions`, usersInit);
  assert(
    vercelListenList.status === 200,
    `vercel listen/sessions list expected 200, got ${vercelListenList.status}`
  );
  assert(
    vpsListenList.status === 200,
    `vps listen/sessions list expected 200, got ${vpsListenList.status}`
  );

  const vercelListenGetMissing = await fetch(
    `${vercelBaseUrl}/api/listen/sessions/nonexistent123`,
    usersInit
  );
  const vpsListenGetMissing = await fetch(
    `${vpsBaseUrl}/api/listen/sessions/nonexistent123`,
    usersInit
  );
  assert(
    vercelListenGetMissing.status === 404,
    `vercel listen/sessions/[id] missing expected 404, got ${vercelListenGetMissing.status}`
  );
  assert(
    vpsListenGetMissing.status === 404,
    `vps listen/sessions/[id] missing expected 404, got ${vpsListenGetMissing.status}`
  );

  const syncPayload = {
    username: "parityuser",
    state: {
      currentTrackId: "track-1",
      currentTrackMeta: { title: "Parity Track" },
      isPlaying: true,
      positionMs: 1234,
    },
  };
  const vercelListenSyncMissing = await fetch(
    `${vercelBaseUrl}/api/listen/sessions/nonexistent123/sync`,
    {
      ...usersInit,
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(syncPayload),
    }
  );
  const vpsListenSyncMissing = await fetch(
    `${vpsBaseUrl}/api/listen/sessions/nonexistent123/sync`,
    {
      ...usersInit,
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(syncPayload),
    }
  );
  assert(
    vercelListenSyncMissing.status === 404,
    `vercel listen/sessions/[id]/sync missing expected 404, got ${vercelListenSyncMissing.status}`
  );
  assert(
    vpsListenSyncMissing.status === 404,
    `vps listen/sessions/[id]/sync missing expected 404, got ${vpsListenSyncMissing.status}`
  );

  const vercelListenReactionMissing = await fetch(
    `${vercelBaseUrl}/api/listen/sessions/nonexistent123/reaction`,
    {
      ...usersInit,
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "parityuser", emoji: "🔥" }),
    }
  );
  const vpsListenReactionMissing = await fetch(
    `${vpsBaseUrl}/api/listen/sessions/nonexistent123/reaction`,
    {
      ...usersInit,
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "parityuser", emoji: "🔥" }),
    }
  );
  assert(
    vercelListenReactionMissing.status === 404,
    `vercel listen/sessions/[id]/reaction missing expected 404, got ${vercelListenReactionMissing.status}`
  );
  assert(
    vpsListenReactionMissing.status === 404,
    `vps listen/sessions/[id]/reaction missing expected 404, got ${vpsListenReactionMissing.status}`
  );

  const vercelListenLeaveMissing = await fetch(
    `${vercelBaseUrl}/api/listen/sessions/nonexistent123/leave`,
    {
      ...usersInit,
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "parityuser" }),
    }
  );
  const vpsListenLeaveMissing = await fetch(
    `${vpsBaseUrl}/api/listen/sessions/nonexistent123/leave`,
    {
      ...usersInit,
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "parityuser" }),
    }
  );
  assert(
    vercelListenLeaveMissing.status === 404,
    `vercel listen/sessions/[id]/leave missing expected 404, got ${vercelListenLeaveMissing.status}`
  );
  assert(
    vpsListenLeaveMissing.status === 404,
    `vps listen/sessions/[id]/leave missing expected 404, got ${vpsListenLeaveMissing.status}`
  );

  const vercelListenJoinMissing = await fetch(
    `${vercelBaseUrl}/api/listen/sessions/nonexistent123/join`,
    {
      ...usersInit,
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "parityuser" }),
    }
  );
  const vpsListenJoinMissing = await fetch(
    `${vpsBaseUrl}/api/listen/sessions/nonexistent123/join`,
    {
      ...usersInit,
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "parityuser" }),
    }
  );
  assert(
    vercelListenJoinMissing.status === 404,
    `vercel listen/sessions/[id]/join missing expected 404, got ${vercelListenJoinMissing.status}`
  );
  assert(
    vpsListenJoinMissing.status === 404,
    `vps listen/sessions/[id]/join missing expected 404, got ${vpsListenJoinMissing.status}`
  );

  const vercelShareAppletMissingId = await fetch(`${vercelBaseUrl}/api/share-applet`, usersInit);
  const vpsShareAppletMissingId = await fetch(`${vpsBaseUrl}/api/share-applet`, usersInit);
  assert(
    vercelShareAppletMissingId.status === 400,
    `vercel share-applet missing id expected 400, got ${vercelShareAppletMissingId.status}`
  );
  assert(
    vpsShareAppletMissingId.status === 400,
    `vps share-applet missing id expected 400, got ${vpsShareAppletMissingId.status}`
  );

  const shareAppletPostInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: "console.log('hello')" }),
  };
  const vercelShareAppletUnauthorized = await fetch(
    `${vercelBaseUrl}/api/share-applet`,
    shareAppletPostInit
  );
  const vpsShareAppletUnauthorized = await fetch(
    `${vpsBaseUrl}/api/share-applet`,
    shareAppletPostInit
  );
  assert(
    vercelShareAppletUnauthorized.status === 401,
    `vercel share-applet POST unauthorized expected 401, got ${vercelShareAppletUnauthorized.status}`
  );
  assert(
    vpsShareAppletUnauthorized.status === 401,
    `vps share-applet POST unauthorized expected 401, got ${vpsShareAppletUnauthorized.status}`
  );

  const vercelAdminUnauthorized = await fetch(
    `${vercelBaseUrl}/api/admin?action=getStats`,
    usersInit
  );
  const vpsAdminUnauthorized = await fetch(
    `${vpsBaseUrl}/api/admin?action=getStats`,
    usersInit
  );
  assert(
    vercelAdminUnauthorized.status === 403,
    `vercel admin unauthorized expected 403, got ${vercelAdminUnauthorized.status}`
  );
  assert(
    vpsAdminUnauthorized.status === 403,
    `vps admin unauthorized expected 403, got ${vpsAdminUnauthorized.status}`
  );

  const vercelTranscribeNoFile = await fetch(`${vercelBaseUrl}/api/audio-transcribe`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
    },
    body: new FormData(),
  });
  const vpsTranscribeNoFile = await fetch(`${vpsBaseUrl}/api/audio-transcribe`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
    },
    body: new FormData(),
  });
  assert(
    [400, 429].includes(vercelTranscribeNoFile.status),
    `vercel audio-transcribe without file expected 400/429, got ${vercelTranscribeNoFile.status}`
  );
  assert(
    [400, 429].includes(vpsTranscribeNoFile.status),
    `vps audio-transcribe without file expected 400/429, got ${vpsTranscribeNoFile.status}`
  );

  const vercelRoomsList = await fetch(`${vercelBaseUrl}/api/rooms`, usersInit);
  const vpsRoomsList = await fetch(`${vpsBaseUrl}/api/rooms`, usersInit);
  assert(
    vercelRoomsList.status === 200,
    `vercel rooms list expected 200, got ${vercelRoomsList.status}`
  );
  assert(
    vpsRoomsList.status === 200,
    `vps rooms list expected 200, got ${vpsRoomsList.status}`
  );

  const roomsCreateInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "parity-room", type: "public" }),
  };
  const vercelRoomsCreateUnauthorized = await fetch(
    `${vercelBaseUrl}/api/rooms`,
    roomsCreateInit
  );
  const vpsRoomsCreateUnauthorized = await fetch(
    `${vpsBaseUrl}/api/rooms`,
    roomsCreateInit
  );
  assert(
    vercelRoomsCreateUnauthorized.status === 401,
    `vercel rooms create unauthorized expected 401, got ${vercelRoomsCreateUnauthorized.status}`
  );
  assert(
    vpsRoomsCreateUnauthorized.status === 401,
    `vps rooms create unauthorized expected 401, got ${vpsRoomsCreateUnauthorized.status}`
  );

  const vercelRoomGetMissing = await fetch(
    `${vercelBaseUrl}/api/rooms/nonexistent123`,
    usersInit
  );
  const vpsRoomGetMissing = await fetch(
    `${vpsBaseUrl}/api/rooms/nonexistent123`,
    usersInit
  );
  assert(
    vercelRoomGetMissing.status === 404,
    `vercel rooms/[id] missing expected 404, got ${vercelRoomGetMissing.status}`
  );
  assert(
    vpsRoomGetMissing.status === 404,
    `vps rooms/[id] missing expected 404, got ${vpsRoomGetMissing.status}`
  );

  const roomsDeleteInit: RequestInit = {
    method: "DELETE",
    headers: {
      Origin: "http://localhost:5173",
    },
  };
  const vercelRoomDeleteUnauthorized = await fetch(
    `${vercelBaseUrl}/api/rooms/nonexistent123`,
    roomsDeleteInit
  );
  const vpsRoomDeleteUnauthorized = await fetch(
    `${vpsBaseUrl}/api/rooms/nonexistent123`,
    roomsDeleteInit
  );
  assert(
    vercelRoomDeleteUnauthorized.status === 401,
    `vercel rooms/[id] delete unauthorized expected 401, got ${vercelRoomDeleteUnauthorized.status}`
  );
  assert(
    vpsRoomDeleteUnauthorized.status === 401,
    `vps rooms/[id] delete unauthorized expected 401, got ${vpsRoomDeleteUnauthorized.status}`
  );

  const roomJoinInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username: "parityuser" }),
  };
  const vercelRoomJoinMissing = await fetch(
    `${vercelBaseUrl}/api/rooms/nonexistent123/join`,
    roomJoinInit
  );
  const vpsRoomJoinMissing = await fetch(
    `${vpsBaseUrl}/api/rooms/nonexistent123/join`,
    roomJoinInit
  );
  assert(
    vercelRoomJoinMissing.status === 404,
    `vercel rooms/[id]/join missing expected 404, got ${vercelRoomJoinMissing.status}`
  );
  assert(
    vpsRoomJoinMissing.status === 404,
    `vps rooms/[id]/join missing expected 404, got ${vpsRoomJoinMissing.status}`
  );

  const roomLeaveInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username: "parityuser" }),
  };
  const vercelRoomLeaveMissing = await fetch(
    `${vercelBaseUrl}/api/rooms/nonexistent123/leave`,
    roomLeaveInit
  );
  const vpsRoomLeaveMissing = await fetch(
    `${vpsBaseUrl}/api/rooms/nonexistent123/leave`,
    roomLeaveInit
  );
  assert(
    vercelRoomLeaveMissing.status === 404,
    `vercel rooms/[id]/leave missing expected 404, got ${vercelRoomLeaveMissing.status}`
  );
  assert(
    vpsRoomLeaveMissing.status === 404,
    `vps rooms/[id]/leave missing expected 404, got ${vpsRoomLeaveMissing.status}`
  );

  const vercelRoomUsers = await fetch(
    `${vercelBaseUrl}/api/rooms/nonexistent123/users`,
    usersInit
  );
  const vpsRoomUsers = await fetch(
    `${vpsBaseUrl}/api/rooms/nonexistent123/users`,
    usersInit
  );
  assert(
    vercelRoomUsers.status === 200,
    `vercel rooms/[id]/users expected 200, got ${vercelRoomUsers.status}`
  );
  assert(
    vpsRoomUsers.status === 200,
    `vps rooms/[id]/users expected 200, got ${vpsRoomUsers.status}`
  );

  const roomMessageDeleteInit: RequestInit = {
    method: "DELETE",
    headers: {
      Origin: "http://localhost:5173",
    },
  };
  const vercelRoomMessageDeleteUnauthorized = await fetch(
    `${vercelBaseUrl}/api/rooms/nonexistent123/messages/nonexistentMsg`,
    roomMessageDeleteInit
  );
  const vpsRoomMessageDeleteUnauthorized = await fetch(
    `${vpsBaseUrl}/api/rooms/nonexistent123/messages/nonexistentMsg`,
    roomMessageDeleteInit
  );
  assert(
    vercelRoomMessageDeleteUnauthorized.status === 401,
    `vercel rooms/[id]/messages/[msgId] unauthorized expected 401, got ${vercelRoomMessageDeleteUnauthorized.status}`
  );
  assert(
    vpsRoomMessageDeleteUnauthorized.status === 401,
    `vps rooms/[id]/messages/[msgId] unauthorized expected 401, got ${vpsRoomMessageDeleteUnauthorized.status}`
  );

  const vercelRoomMessagesMissing = await fetch(
    `${vercelBaseUrl}/api/rooms/nonexistent123/messages`,
    usersInit
  );
  const vpsRoomMessagesMissing = await fetch(
    `${vpsBaseUrl}/api/rooms/nonexistent123/messages`,
    usersInit
  );
  assert(
    vercelRoomMessagesMissing.status === 404,
    `vercel rooms/[id]/messages missing expected 404, got ${vercelRoomMessagesMissing.status}`
  );
  assert(
    vpsRoomMessagesMissing.status === 404,
    `vps rooms/[id]/messages missing expected 404, got ${vpsRoomMessagesMissing.status}`
  );

  const roomMessagesPostInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: "hello" }),
  };
  const vercelRoomMessagesPostUnauthorized = await fetch(
    `${vercelBaseUrl}/api/rooms/nonexistent123/messages`,
    roomMessagesPostInit
  );
  const vpsRoomMessagesPostUnauthorized = await fetch(
    `${vpsBaseUrl}/api/rooms/nonexistent123/messages`,
    roomMessagesPostInit
  );
  assert(
    vercelRoomMessagesPostUnauthorized.status === 401,
    `vercel rooms/[id]/messages POST unauthorized expected 401, got ${vercelRoomMessagesPostUnauthorized.status}`
  );
  assert(
    vpsRoomMessagesPostUnauthorized.status === 401,
    `vps rooms/[id]/messages POST unauthorized expected 401, got ${vpsRoomMessagesPostUnauthorized.status}`
  );

  const ryoReplyInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roomId: "nonexistent123", prompt: "hello" }),
  };
  const vercelRyoReplyUnauthorized = await fetch(
    `${vercelBaseUrl}/api/ai/ryo-reply`,
    ryoReplyInit
  );
  const vpsRyoReplyUnauthorized = await fetch(
    `${vpsBaseUrl}/api/ai/ryo-reply`,
    ryoReplyInit
  );
  assert(
    vercelRyoReplyUnauthorized.status === 401,
    `vercel ai/ryo-reply unauthorized expected 401, got ${vercelRyoReplyUnauthorized.status}`
  );
  assert(
    vpsRyoReplyUnauthorized.status === 401,
    `vps ai/ryo-reply unauthorized expected 401, got ${vpsRyoReplyUnauthorized.status}`
  );

  const extractMemoriesInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "hello world" }] }),
  };
  const vercelExtractMemoriesUnauthorized = await fetch(
    `${vercelBaseUrl}/api/ai/extract-memories`,
    extractMemoriesInit
  );
  const vpsExtractMemoriesUnauthorized = await fetch(
    `${vpsBaseUrl}/api/ai/extract-memories`,
    extractMemoriesInit
  );
  assert(
    vercelExtractMemoriesUnauthorized.status === 401,
    `vercel ai/extract-memories unauthorized expected 401, got ${vercelExtractMemoriesUnauthorized.status}`
  );
  assert(
    vpsExtractMemoriesUnauthorized.status === 401,
    `vps ai/extract-memories unauthorized expected 401, got ${vpsExtractMemoriesUnauthorized.status}`
  );

  const processDailyNotesInit: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
    },
  };
  const vercelProcessDailyNotesUnauthorized = await fetch(
    `${vercelBaseUrl}/api/ai/process-daily-notes`,
    processDailyNotesInit
  );
  const vpsProcessDailyNotesUnauthorized = await fetch(
    `${vpsBaseUrl}/api/ai/process-daily-notes`,
    processDailyNotesInit
  );
  assert(
    vercelProcessDailyNotesUnauthorized.status === 401,
    `vercel ai/process-daily-notes unauthorized expected 401, got ${vercelProcessDailyNotesUnauthorized.status}`
  );
  assert(
    vpsProcessDailyNotesUnauthorized.status === 401,
    `vps ai/process-daily-notes unauthorized expected 401, got ${vpsProcessDailyNotesUnauthorized.status}`
  );

  const vercelAppletAiMethod = await fetch(`${vercelBaseUrl}/api/applet-ai`, usersInit);
  const vpsAppletAiMethod = await fetch(`${vpsBaseUrl}/api/applet-ai`, usersInit);
  assert(
    vercelAppletAiMethod.status === 405,
    `vercel applet-ai method expected 405, got ${vercelAppletAiMethod.status}`
  );
  assert(
    vpsAppletAiMethod.status === 405,
    `vps applet-ai method expected 405, got ${vpsAppletAiMethod.status}`
  );

  const vercelIeGenerateMethod = await fetch(`${vercelBaseUrl}/api/ie-generate`, usersInit);
  const vpsIeGenerateMethod = await fetch(`${vpsBaseUrl}/api/ie-generate`, usersInit);
  assert(
    vercelIeGenerateMethod.status === 405,
    `vercel ie-generate method expected 405, got ${vercelIeGenerateMethod.status}`
  );
  assert(
    vpsIeGenerateMethod.status === 405,
    `vps ie-generate method expected 405, got ${vpsIeGenerateMethod.status}`
  );
}

interface AuthFlowResult {
  registerStatus: number;
  loginStatus: number;
  verifyStatus: number;
  logoutStatus: number;
  verifyAfterLogoutStatus: number;
}

interface AuthExtendedFlowResult {
  registerStatus: number;
  refreshStatus: number;
  verifyRefreshedTokenStatus: number;
  syncStatusStatus: number;
  syncStatusHasBackup: boolean | null;
  backupTokenUnauthorizedStatus: number;
  syncBackupGetStatus: number;
  syncBackupUnauthorizedStatus: number;
  passwordCheckStatus: number;
  tokensStatus: number;
  passwordSetStatus: number;
  loginWithUpdatedPasswordStatus: number;
  logoutAllStatus: number;
  verifyAfterLogoutAllStatus: number;
}

async function runAuthFlow(baseUrl: string, marker: string): Promise<AuthFlowResult> {
  const username = `p${marker[0] || "x"}${Date.now().toString(36)}${Math.floor(
    Math.random() * 100000
  ).toString(36)}`;
  const password = "parity-password-123";
  let token: string | undefined;
  let registerStatus = 0;
  let registerPayload: unknown = null;
  let registerIp = "10.0.0.1";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const syntheticIp = `10.${attempt}.${Math.floor(Math.random() * 200)}.${Math.floor(
      Math.random() * 200
    )}`;
    registerIp = syntheticIp;
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        "X-Forwarded-For": syntheticIp,
      },
      body: JSON.stringify({ username, password }),
    });
    registerStatus = registerRes.status;
    registerPayload = (await registerRes.json()) as unknown;
    token = (registerPayload as { token?: string })?.token;
    if (token) {
      break;
    }
    if (registerRes.status !== 429) {
      break;
    }
  }

  assert(
    !!token,
    `${marker} register response missing token (status=${registerStatus}, body=${JSON.stringify(
      registerPayload
    )})`
  );

  const verifyRes = await fetch(`${baseUrl}/api/auth/token/verify`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${token}`,
      "X-Username": username,
    },
  });

  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${token}`,
      "X-Username": username,
    },
  });

  const verifyAfterLogoutRes = await fetch(`${baseUrl}/api/auth/token/verify`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${token}`,
      "X-Username": username,
    },
  });

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
      "X-Forwarded-For": registerIp,
    },
    body: JSON.stringify({ username, password }),
  });

  return {
    registerStatus,
    loginStatus: loginRes.status,
    verifyStatus: verifyRes.status,
    logoutStatus: logoutRes.status,
    verifyAfterLogoutStatus: verifyAfterLogoutRes.status,
  };
}

async function testAuthFlowParity(): Promise<void> {
  const vercel = await runAuthFlow(vercelBaseUrl, "vercel");
  const vps = await runAuthFlow(vpsBaseUrl, "vps");

  assert(vercel.registerStatus === 201, `vercel register expected 201, got ${vercel.registerStatus}`);
  assert(vps.registerStatus === 201, `vps register expected 201, got ${vps.registerStatus}`);
  assert(vercel.loginStatus === 200, `vercel login expected 200, got ${vercel.loginStatus}`);
  assert(vps.loginStatus === 200, `vps login expected 200, got ${vps.loginStatus}`);
  assert(vercel.verifyStatus === 200, `vercel verify expected 200, got ${vercel.verifyStatus}`);
  assert(vps.verifyStatus === 200, `vps verify expected 200, got ${vps.verifyStatus}`);
  assert(vercel.logoutStatus === 200, `vercel logout expected 200, got ${vercel.logoutStatus}`);
  assert(vps.logoutStatus === 200, `vps logout expected 200, got ${vps.logoutStatus}`);
  assert(
    vercel.verifyAfterLogoutStatus === 401,
    `vercel verify-after-logout expected 401, got ${vercel.verifyAfterLogoutStatus}`
  );
  assert(
    vps.verifyAfterLogoutStatus === 401,
    `vps verify-after-logout expected 401, got ${vps.verifyAfterLogoutStatus}`
  );
}

async function runAuthExtendedFlow(
  baseUrl: string,
  marker: string
): Promise<AuthExtendedFlowResult> {
  const username = `e${marker[0] || "x"}${Date.now().toString(36)}${Math.floor(
    Math.random() * 100000
  ).toString(36)}`;
  const initialPassword = "parity-password-123";
  const updatedPassword = "parity-password-456";
  const forwardedIp = `10.42.${Math.floor(Math.random() * 200)}.${Math.floor(
    Math.random() * 200
  )}`;

  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
      "X-Forwarded-For": forwardedIp,
    },
    body: JSON.stringify({ username, password: initialPassword }),
  });
  const registerJson = (await registerRes.json()) as { token?: string };
  const token = registerJson.token;
  assert(!!token, `${marker} extended register missing token`);

  const refreshRes = await fetch(`${baseUrl}/api/auth/token/refresh`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
      "X-Forwarded-For": forwardedIp,
    },
    body: JSON.stringify({ username, oldToken: token }),
  });
  const refreshJson = (await refreshRes.json()) as { token?: string };
  const refreshedToken = refreshJson.token;
  assert(!!refreshedToken, `${marker} refresh missing token`);

  const verifyRefreshedTokenRes = await fetch(`${baseUrl}/api/auth/token/verify`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${refreshedToken}`,
      "X-Username": username,
    },
  });

  const syncStatusRes = await fetch(`${baseUrl}/api/sync/status`, {
    method: "GET",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${refreshedToken}`,
      "X-Username": username,
    },
  });
  const syncStatusJson = (await syncStatusRes.json()) as { hasBackup?: boolean };

  const backupTokenUnauthorizedRes = await fetch(`${baseUrl}/api/sync/backup-token`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
    },
  });

  const syncBackupGetRes = await fetch(`${baseUrl}/api/sync/backup`, {
    method: "GET",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${refreshedToken}`,
      "X-Username": username,
    },
  });

  const syncBackupUnauthorizedRes = await fetch(`${baseUrl}/api/sync/backup`, {
    method: "GET",
    headers: {
      Origin: "http://localhost:5173",
    },
  });

  const passwordCheckRes = await fetch(`${baseUrl}/api/auth/password/check`, {
    method: "GET",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${refreshedToken}`,
      "X-Username": username,
    },
  });

  const tokensRes = await fetch(`${baseUrl}/api/auth/tokens`, {
    method: "GET",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${refreshedToken}`,
      "X-Username": username,
    },
  });

  const passwordSetRes = await fetch(`${baseUrl}/api/auth/password/set`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${refreshedToken}`,
      "X-Username": username,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: updatedPassword }),
  });

  const loginWithUpdatedPasswordRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
      "X-Forwarded-For": forwardedIp,
    },
    body: JSON.stringify({ username, password: updatedPassword }),
  });
  const loginJson = (await loginWithUpdatedPasswordRes.json()) as { token?: string };
  const latestToken = loginJson.token;
  assert(!!latestToken, `${marker} extended login with updated password missing token`);

  const logoutAllRes = await fetch(`${baseUrl}/api/auth/logout-all`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${latestToken}`,
      "X-Username": username,
    },
  });

  const verifyAfterLogoutAllRes = await fetch(`${baseUrl}/api/auth/token/verify`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${latestToken}`,
      "X-Username": username,
    },
  });

  return {
    registerStatus: registerRes.status,
    refreshStatus: refreshRes.status,
    verifyRefreshedTokenStatus: verifyRefreshedTokenRes.status,
    syncStatusStatus: syncStatusRes.status,
    syncStatusHasBackup:
      typeof syncStatusJson.hasBackup === "boolean" ? syncStatusJson.hasBackup : null,
    backupTokenUnauthorizedStatus: backupTokenUnauthorizedRes.status,
    syncBackupGetStatus: syncBackupGetRes.status,
    syncBackupUnauthorizedStatus: syncBackupUnauthorizedRes.status,
    passwordCheckStatus: passwordCheckRes.status,
    tokensStatus: tokensRes.status,
    passwordSetStatus: passwordSetRes.status,
    loginWithUpdatedPasswordStatus: loginWithUpdatedPasswordRes.status,
    logoutAllStatus: logoutAllRes.status,
    verifyAfterLogoutAllStatus: verifyAfterLogoutAllRes.status,
  };
}

async function testAuthExtendedParity(): Promise<void> {
  const vercel = await runAuthExtendedFlow(vercelBaseUrl, "vercel");
  const vps = await runAuthExtendedFlow(vpsBaseUrl, "vps");

  assert(vercel.registerStatus === 201, `vercel extended register expected 201, got ${vercel.registerStatus}`);
  assert(vps.registerStatus === 201, `vps extended register expected 201, got ${vps.registerStatus}`);
  assert(vercel.refreshStatus === 201, `vercel token refresh expected 201, got ${vercel.refreshStatus}`);
  assert(vps.refreshStatus === 201, `vps token refresh expected 201, got ${vps.refreshStatus}`);
  assert(
    vercel.verifyRefreshedTokenStatus === 200,
    `vercel verify(refreshed token) expected 200, got ${vercel.verifyRefreshedTokenStatus}`
  );
  assert(
    vps.verifyRefreshedTokenStatus === 200,
    `vps verify(refreshed token) expected 200, got ${vps.verifyRefreshedTokenStatus}`
  );
  assert(vercel.syncStatusStatus === 200, `vercel sync/status expected 200, got ${vercel.syncStatusStatus}`);
  assert(vps.syncStatusStatus === 200, `vps sync/status expected 200, got ${vps.syncStatusStatus}`);
  assert(
    vercel.syncStatusHasBackup === false,
    `vercel sync/status hasBackup expected false, got ${String(vercel.syncStatusHasBackup)}`
  );
  assert(
    vps.syncStatusHasBackup === false,
    `vps sync/status hasBackup expected false, got ${String(vps.syncStatusHasBackup)}`
  );
  assert(
    vercel.backupTokenUnauthorizedStatus === 401,
    `vercel sync/backup-token unauthorized expected 401, got ${vercel.backupTokenUnauthorizedStatus}`
  );
  assert(
    vps.backupTokenUnauthorizedStatus === 401,
    `vps sync/backup-token unauthorized expected 401, got ${vps.backupTokenUnauthorizedStatus}`
  );
  assert(
    vercel.syncBackupGetStatus === 404,
    `vercel sync/backup GET expected 404, got ${vercel.syncBackupGetStatus}`
  );
  assert(
    vps.syncBackupGetStatus === 404,
    `vps sync/backup GET expected 404, got ${vps.syncBackupGetStatus}`
  );
  assert(
    vercel.syncBackupUnauthorizedStatus === 401,
    `vercel sync/backup unauthorized expected 401, got ${vercel.syncBackupUnauthorizedStatus}`
  );
  assert(
    vps.syncBackupUnauthorizedStatus === 401,
    `vps sync/backup unauthorized expected 401, got ${vps.syncBackupUnauthorizedStatus}`
  );
  assert(vercel.passwordCheckStatus === 200, `vercel password/check expected 200, got ${vercel.passwordCheckStatus}`);
  assert(vps.passwordCheckStatus === 200, `vps password/check expected 200, got ${vps.passwordCheckStatus}`);
  assert(vercel.tokensStatus === 200, `vercel tokens expected 200, got ${vercel.tokensStatus}`);
  assert(vps.tokensStatus === 200, `vps tokens expected 200, got ${vps.tokensStatus}`);
  assert(vercel.passwordSetStatus === 200, `vercel password/set expected 200, got ${vercel.passwordSetStatus}`);
  assert(vps.passwordSetStatus === 200, `vps password/set expected 200, got ${vps.passwordSetStatus}`);
  assert(
    vercel.loginWithUpdatedPasswordStatus === 200,
    `vercel login(updated password) expected 200, got ${vercel.loginWithUpdatedPasswordStatus}`
  );
  assert(
    vps.loginWithUpdatedPasswordStatus === 200,
    `vps login(updated password) expected 200, got ${vps.loginWithUpdatedPasswordStatus}`
  );
  assert(vercel.logoutAllStatus === 200, `vercel logout-all expected 200, got ${vercel.logoutAllStatus}`);
  assert(vps.logoutAllStatus === 200, `vps logout-all expected 200, got ${vps.logoutAllStatus}`);
  assert(
    vercel.verifyAfterLogoutAllStatus === 401,
    `vercel verify-after-logout-all expected 401, got ${vercel.verifyAfterLogoutAllStatus}`
  );
  assert(
    vps.verifyAfterLogoutAllStatus === 401,
    `vps verify-after-logout-all expected 401, got ${vps.verifyAfterLogoutAllStatus}`
  );
}

async function main(): Promise<void> {
  await testParseTitleParity();
  await testChatParity();
  await testSongsNotFoundParity();
  await testIframeCheckParity();
  await testUsersAndBulkParity();
  await testAuthFlowParity();
  await testAuthExtendedParity();
  console.log(`[runtime-parity] parity checks passed (${vercelBaseUrl} vs ${vpsBaseUrl})`);
}

main().catch((error) => {
  console.error("[runtime-parity] failed:", error);
  process.exit(1);
});
