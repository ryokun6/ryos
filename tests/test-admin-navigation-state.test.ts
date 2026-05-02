#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import { getClearedAdminDetailSelection } from "../src/apps/admin/utils/navigationState";

describe("admin navigation detail reset", () => {
  const detailState = {
    selectedRoomId: "room-1",
    selectedUserProfile: "alice",
    selectedSongId: "song-1",
  };

  test("keeps song detail only in songs section", () => {
    expect(getClearedAdminDetailSelection("songs", detailState)).toEqual({
      selectedRoomId: null,
      selectedUserProfile: null,
      selectedSongId: "song-1",
    });
  });

  test("keeps user detail only in users section", () => {
    expect(getClearedAdminDetailSelection("users", detailState)).toEqual({
      selectedRoomId: null,
      selectedUserProfile: "alice",
      selectedSongId: null,
    });
  });

  test("keeps room detail only in rooms section", () => {
    expect(getClearedAdminDetailSelection("rooms", detailState)).toEqual({
      selectedRoomId: "room-1",
      selectedUserProfile: null,
      selectedSongId: null,
    });
  });

  test("clears all details in dashboard section", () => {
    expect(getClearedAdminDetailSelection("dashboard", detailState)).toEqual({
      selectedRoomId: null,
      selectedUserProfile: null,
      selectedSongId: null,
    });
  });
});
