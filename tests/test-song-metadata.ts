/**
 * Test script for the song-metadata API
 *
 * Run with: npx ts-node tests/test-song-metadata.ts
 * Or with bun: bun tests/test-song-metadata.ts
 *
 * Prerequisites:
 * - Set REDIS_KV_REST_API_URL and REDIS_KV_REST_API_TOKEN environment variables
 * - Start the dev server with `vercel dev` or `bun run dev:vercel`
 */

const API_BASE = process.env.API_BASE || "http://localhost:3000";

interface SongMetadata {
  youtubeId: string;
  title: string;
  artist?: string;
  album?: string;
  lyricOffset?: number;
  lyricsSearch?: {
    query?: string;
    selection?: {
      hash: string;
      albumId: string | number;
      title: string;
      artist: string;
      album?: string;
    };
  };
  lyricsHash?: string;
  translationHash?: string;
  createdAt: number;
  updatedAt: number;
}

interface GetResponse {
  found: boolean;
  metadata?: SongMetadata;
  error?: string;
}

interface SaveResponse {
  success: boolean;
  youtubeId?: string;
  isUpdate?: boolean;
  error?: string;
}

async function testGetNonexistent(): Promise<void> {
  console.log("\n=== Test: GET non-existent song metadata ===");

  const testId = "nonexistent123";
  const response = await fetch(`${API_BASE}/api/song-metadata?id=${testId}`);
  const data: GetResponse = await response.json();

  console.log(`Status: ${response.status}`);
  console.log(`Response:`, JSON.stringify(data, null, 2));

  if (response.ok && data.found === false) {
    console.log("✅ Test passed: Non-existent song returns found=false");
  } else {
    console.error("❌ Test failed: Expected found=false");
  }
}

async function testSaveAndRetrieve(): Promise<void> {
  console.log("\n=== Test: Save and retrieve song metadata ===");

  const testSong = {
    youtubeId: "test123456",
    title: "Test Song Title",
    artist: "Test Artist",
    album: "Test Album",
    lyricOffset: 500,
    lyricsSearch: {
      selection: {
        hash: "abc123",
        albumId: "album123",
        title: "Test Song Title",
        artist: "Test Artist",
        album: "Test Album",
      },
    },
  };

  // Save metadata
  console.log("Saving metadata...");
  const saveResponse = await fetch(`${API_BASE}/api/song-metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(testSong),
  });
  const saveData: SaveResponse = await saveResponse.json();

  console.log(`Save Status: ${saveResponse.status}`);
  console.log(`Save Response:`, JSON.stringify(saveData, null, 2));

  if (!saveResponse.ok || !saveData.success) {
    console.error("❌ Test failed: Could not save metadata");
    return;
  }

  console.log("✅ Metadata saved successfully");

  // Retrieve metadata
  console.log("\nRetrieving metadata...");
  const getResponse = await fetch(`${API_BASE}/api/song-metadata?id=${testSong.youtubeId}`);
  const getData: GetResponse = await getResponse.json();

  console.log(`Get Status: ${getResponse.status}`);
  console.log(`Get Response:`, JSON.stringify(getData, null, 2));

  if (getResponse.ok && getData.found && getData.metadata) {
    const meta = getData.metadata;
    if (
      meta.youtubeId === testSong.youtubeId &&
      meta.title === testSong.title &&
      meta.artist === testSong.artist &&
      meta.album === testSong.album &&
      meta.lyricOffset === testSong.lyricOffset &&
      meta.lyricsSearch?.selection?.hash === testSong.lyricsSearch.selection.hash
    ) {
      console.log("✅ Test passed: Metadata retrieved correctly");
    } else {
      console.error("❌ Test failed: Retrieved metadata doesn't match saved data");
    }
  } else {
    console.error("❌ Test failed: Could not retrieve metadata");
  }
}

async function testUpdateMetadata(): Promise<void> {
  console.log("\n=== Test: Update existing metadata ===");

  const testId = "test123456";
  const updatedSong = {
    youtubeId: testId,
    title: "Updated Song Title",
    artist: "Updated Artist",
    album: "Updated Album",
    lyricOffset: 750,
  };

  // Update metadata
  console.log("Updating metadata...");
  const updateResponse = await fetch(`${API_BASE}/api/song-metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedSong),
  });
  const updateData: SaveResponse = await updateResponse.json();

  console.log(`Update Status: ${updateResponse.status}`);
  console.log(`Update Response:`, JSON.stringify(updateData, null, 2));

  if (updateResponse.ok && updateData.success && updateData.isUpdate) {
    console.log("✅ Test passed: Metadata updated (isUpdate=true)");
  } else {
    console.error("❌ Test failed: Expected isUpdate=true");
  }

  // Verify update
  const getResponse = await fetch(`${API_BASE}/api/song-metadata?id=${testId}`);
  const getData: GetResponse = await getResponse.json();

  if (getData.found && getData.metadata?.title === updatedSong.title) {
    console.log("✅ Update verified: Title matches updated value");
  } else {
    console.error("❌ Update verification failed");
  }
}

async function testMissingId(): Promise<void> {
  console.log("\n=== Test: GET without id parameter ===");

  const response = await fetch(`${API_BASE}/api/song-metadata`);
  const data = await response.json();

  console.log(`Status: ${response.status}`);
  console.log(`Response:`, JSON.stringify(data, null, 2));

  if (response.status === 400 && data.error) {
    console.log("✅ Test passed: Missing id returns 400 error");
  } else {
    console.error("❌ Test failed: Expected 400 status");
  }
}

async function testInvalidBody(): Promise<void> {
  console.log("\n=== Test: POST with invalid body ===");

  const response = await fetch(`${API_BASE}/api/song-metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invalid: "data" }),
  });
  const data = await response.json();

  console.log(`Status: ${response.status}`);
  console.log(`Response:`, JSON.stringify(data, null, 2));

  if (response.status === 400 && data.error) {
    console.log("✅ Test passed: Invalid body returns 400 error");
  } else {
    console.error("❌ Test failed: Expected 400 status");
  }
}

async function runAllTests(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Song Metadata API Tests");
  console.log(`API Base: ${API_BASE}`);
  console.log("=".repeat(60));

  try {
    await testGetNonexistent();
    await testSaveAndRetrieve();
    await testUpdateMetadata();
    await testMissingId();
    await testInvalidBody();

    console.log("\n" + "=".repeat(60));
    console.log("All tests completed!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Test execution failed:", error);
    process.exit(1);
  }
}

runAllTests();
