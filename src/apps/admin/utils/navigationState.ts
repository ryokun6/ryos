export type AdminSection = "users" | "rooms" | "songs" | "server";

export interface AdminDetailSelectionState {
  selectedRoomId: string | null;
  selectedUserProfile: string | null;
  selectedSongId: string | null;
}

export function getClearedAdminDetailSelection(
  section: AdminSection,
  state: AdminDetailSelectionState
): AdminDetailSelectionState {
  return {
    selectedRoomId: section === "rooms" ? state.selectedRoomId : null,
    selectedUserProfile:
      section === "users" ? state.selectedUserProfile : null,
    selectedSongId: section === "songs" ? state.selectedSongId : null,
  };
}
