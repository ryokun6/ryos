export interface IrcServerFormState {
  showAddServerForm: boolean;
  newServerHost: string;
  newServerPort: number;
  newServerTls: boolean;
  newServerLabel: string;
  isAddingServer: boolean;
  addServerError: string | null;
}

export const initialIrcServerFormState: IrcServerFormState = {
  showAddServerForm: false,
  newServerHost: "",
  newServerPort: 6667,
  newServerTls: false,
  newServerLabel: "",
  isAddingServer: false,
  addServerError: null,
};

export type IrcServerFormAction =
  | { type: "setShowAddServerForm"; value: boolean }
  | { type: "setNewServerHost"; value: string }
  | { type: "setNewServerPort"; value: number }
  | { type: "setNewServerTls"; value: boolean }
  | { type: "setNewServerLabel"; value: string }
  | { type: "setIsAddingServer"; value: boolean }
  | { type: "setAddServerError"; value: string | null }
  | { type: "resetForm" };

export function ircServerFormReducer(
  state: IrcServerFormState,
  action: IrcServerFormAction
): IrcServerFormState {
  switch (action.type) {
    case "setShowAddServerForm":
      return { ...state, showAddServerForm: action.value };
    case "setNewServerHost":
      return { ...state, newServerHost: action.value };
    case "setNewServerPort":
      return { ...state, newServerPort: action.value };
    case "setNewServerTls":
      return { ...state, newServerTls: action.value };
    case "setNewServerLabel":
      return { ...state, newServerLabel: action.value };
    case "setIsAddingServer":
      return { ...state, isAddingServer: action.value };
    case "setAddServerError":
      return { ...state, addServerError: action.value };
    case "resetForm":
      return initialIrcServerFormState;
    default:
      return state;
  }
}
