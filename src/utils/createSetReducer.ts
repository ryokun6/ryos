export type SetReducerAction<S extends object> = {
  type: "set";
  payload: Partial<S>;
};

/** Generic `{ type: "set", payload }` reducer used by dashboard/currency-style UI state. */
export function createSetReducer<S extends object>() {
  return function setReducer(
    state: S,
    action: SetReducerAction<S> | { type: string },
  ): S {
    if (action.type === "set" && "payload" in action) {
      return { ...state, ...(action as SetReducerAction<S>).payload };
    }
    return state;
  };
}
