export type SongEditState = {
  isEditingTitle: boolean;
  isEditingArtist: boolean;
  isEditingAlbum: boolean;
  isEditingOffset: boolean;
  editTitle: string;
  editArtist: string;
  editAlbum: string;
  editOffset: string;
  isSaving: boolean;
};

export type SongEditAction =
  | { type: "startEdit"; field: "title" | "artist" | "album" | "offset"; value: string }
  | {
      type: "setValue";
      field: "editTitle" | "editArtist" | "editAlbum" | "editOffset";
      value: string;
    }
  | { type: "stopEditing"; field?: "title" | "artist" | "album" | "offset" }
  | { type: "setSaving"; isSaving: boolean };

export const initialEditState: SongEditState = {
  isEditingTitle: false,
  isEditingArtist: false,
  isEditingAlbum: false,
  isEditingOffset: false,
  editTitle: "",
  editArtist: "",
  editAlbum: "",
  editOffset: "",
  isSaving: false,
};

export function songEditReducer(
  state: SongEditState,
  action: SongEditAction
): SongEditState {
  switch (action.type) {
    case "startEdit":
      return {
        ...state,
        isEditingTitle: action.field === "title",
        isEditingArtist: action.field === "artist",
        isEditingAlbum: action.field === "album",
        isEditingOffset: action.field === "offset",
        editTitle: action.field === "title" ? action.value : state.editTitle,
        editArtist:
          action.field === "artist" ? action.value : state.editArtist,
        editAlbum: action.field === "album" ? action.value : state.editAlbum,
        editOffset:
          action.field === "offset" ? action.value : state.editOffset,
      };
    case "setValue":
      return { ...state, [action.field]: action.value };
    case "stopEditing":
      if (!action.field) {
        return {
          ...state,
          isEditingTitle: false,
          isEditingArtist: false,
          isEditingAlbum: false,
          isEditingOffset: false,
        };
      }
      if (action.field === "title") return { ...state, isEditingTitle: false };
      if (action.field === "artist") {
        return { ...state, isEditingArtist: false };
      }
      if (action.field === "album") return { ...state, isEditingAlbum: false };
      return { ...state, isEditingOffset: false };
    case "setSaving":
      return { ...state, isSaving: action.isSaving };
    default:
      return state;
  }
}
