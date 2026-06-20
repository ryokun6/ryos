import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { ControlPanelsCategoryGrid } from "./ControlPanelsCategoryGrid";
import { ControlPanelsMacAnimatedBody } from "./ControlPanelsMacAnimatedBody";
import { ControlPanelsMacToolbar } from "./ControlPanelsMacToolbar";
import { ControlPanelsPreferencePane } from "./ControlPanelsPreferencePane";
import {
  normalizeControlPanelPaneId,
  type ControlPanelMacNavigationEntry,
  type ControlPanelPaneId,
} from "./controlPanelsCategories";
import {
  getSpotlightPaneIds,
  searchControlPanels,
} from "./controlPanelsSearch";

export type ControlPanelsMacLayoutProps = {
  t: (key: string) => string;
  instanceId?: string;
  defaultPane?: string;
  onCurrentEntryChange?: (entry: ControlPanelMacNavigationEntry) => void;
  renderPane: (
    paneId: ControlPanelPaneId,
    onNavigateToPane: (paneId: ControlPanelPaneId) => void
  ) => ReactNode;
};

type NavigationEntry = ControlPanelMacNavigationEntry;

type NavigationState = {
  history: NavigationEntry[];
  index: number;
};

type NavigationAction =
  | { type: "navigate"; entry: NavigationEntry }
  | { type: "back" }
  | { type: "forward" };

function createInitialState(defaultPane?: string): NavigationState {
  const normalized = normalizeControlPanelPaneId(defaultPane);
  const initialPane = normalized ?? null;

  return {
    history: [initialPane ?? "home"],
    index: 0,
  };
}

function navigationReducer(
  state: NavigationState,
  action: NavigationAction
): NavigationState {
  switch (action.type) {
    case "navigate": {
      if (state.history[state.index] === action.entry) {
        return state;
      }
      // Truncate any forward entries, then push the new entry.
      const history = state.history.slice(0, state.index + 1);
      history.push(action.entry);
      return {
        history,
        index: history.length - 1,
      };
    }
    case "back": {
      if (state.index <= 0) {
        return state;
      }
      return { ...state, index: state.index - 1 };
    }
    case "forward": {
      if (state.index >= state.history.length - 1) {
        return state;
      }
      return { ...state, index: state.index + 1 };
    }
    default:
      return state;
  }
}

export function ControlPanelsMacLayout({
  t,
  instanceId,
  defaultPane,
  onCurrentEntryChange,
  renderPane,
}: ControlPanelsMacLayoutProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);

  useResizeObserverWithRef(toolbarRef, (entry) => {
    setToolbarHeight(Math.ceil(entry.contentRect.height));
  });

  const [navState, dispatch] = useReducer(
    navigationReducer,
    defaultPane,
    createInitialState
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [focusedPaneId, setFocusedPaneId] =
    useState<ControlPanelPaneId | null>(null);

  const isSearching = searchQuery.trim().length > 0;

  const searchResults = useMemo(
    () => searchControlPanels(searchQuery, t),
    [searchQuery, t]
  );
  const spotlightPaneIds = useMemo(
    () => getSpotlightPaneIds(searchResults),
    [searchResults]
  );

  const currentEntry = navState.history[navState.index];
  // While searching, force the Show All grid so the spotlight is visible. The
  // displayed entry (what the body actually shows, and what the window title
  // must reflect) is therefore "home" while searching, regardless of the
  // underlying nav-history pane.
  const displayedEntry: NavigationEntry = isSearching ? "home" : currentEntry;
  const showHome = displayedEntry === "home";
  const activePane = displayedEntry === "home" ? undefined : displayedEntry;

  const canGoBack = navState.index > 0;
  const canGoForward = navState.index < navState.history.length - 1;

  useEffect(() => {
    onCurrentEntryChange?.(displayedEntry);
  }, [displayedEntry, onCurrentEntryChange]);

  const navigateTo = useCallback((entry: NavigationEntry) => {
    dispatch({ type: "navigate", entry });
  }, []);

  const goBack = useCallback(() => {
    dispatch({ type: "back" });
  }, []);

  const goForward = useCallback(() => {
    dispatch({ type: "forward" });
  }, []);

  // Clearing search state restores the normal pane view per nav history and
  // tears down the spotlight grid / dimmed scrim.
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setFocusedPaneId(null);
  }, []);

  const showAll = useCallback(() => {
    clearSearch();
    navigateTo("home");
  }, [clearSearch, navigateTo]);

  // Selecting a pane (from the grid, a spotlight match, or an in-pane link)
  // must clear any active search so the chosen pane actually becomes visible
  // instead of staying behind the forced search grid.
  const selectPane = useCallback(
    (paneId: ControlPanelPaneId) => {
      clearSearch();
      navigateTo(paneId);
    },
    [clearSearch, navigateTo]
  );

  return (
    <div className="control-panels-mac flex flex-col w-full">
      <div ref={toolbarRef} className="shrink-0">
        <ControlPanelsMacToolbar
          t={t}
          onShowAll={showAll}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={goBack}
          onGoForward={goForward}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchResults={searchResults}
          onSelectResult={selectPane}
          onFocusResult={setFocusedPaneId}
        />
      </div>

      <ControlPanelsMacAnimatedBody
        instanceId={instanceId}
        toolbarHeight={toolbarHeight}
        navKey={currentEntry}
      >
        {showHome ? (
          <ControlPanelsCategoryGrid
            t={t}
            onSelect={selectPane}
            spotlightActive={isSearching}
            spotlightPaneIds={spotlightPaneIds}
            focusedPaneId={focusedPaneId}
          />
        ) : activePane ? (
          <ControlPanelsPreferencePane>
            {renderPane(activePane, selectPane)}
          </ControlPanelsPreferencePane>
        ) : null}
      </ControlPanelsMacAnimatedBody>
    </div>
  );
}
