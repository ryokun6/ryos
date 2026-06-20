import { useCallback, useEffect, useReducer, useRef, useState } from "react";
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
  current: NavigationEntry;
};

type NavigationAction = { type: "navigate"; entry: NavigationEntry };

function createInitialState(defaultPane?: string): NavigationState {
  const normalized = normalizeControlPanelPaneId(defaultPane);
  const initialPane = normalized ?? null;

  return {
    current: initialPane ?? "home",
  };
}

function navigationReducer(
  state: NavigationState,
  action: NavigationAction
): NavigationState {
  switch (action.type) {
    case "navigate":
      if (state.current === action.entry) {
        return state;
      }
      return {
        current: action.entry,
      };
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

  const currentEntry = navState.current;
  const showHome = currentEntry === "home";
  const activePane = showHome ? undefined : currentEntry;

  useEffect(() => {
    onCurrentEntryChange?.(currentEntry);
  }, [currentEntry, onCurrentEntryChange]);

  const navigateTo = useCallback((entry: NavigationEntry) => {
    dispatch({ type: "navigate", entry });
  }, []);

  const showAll = useCallback(() => {
    navigateTo("home");
  }, [navigateTo]);

  const selectPane = useCallback(
    (paneId: ControlPanelPaneId) => {
      navigateTo(paneId);
    },
    [navigateTo]
  );

  return (
    <div className="control-panels-mac flex flex-col w-full">
      <div ref={toolbarRef} className="shrink-0">
        <ControlPanelsMacToolbar
          t={t}
          showHome={showHome}
          onShowAll={showAll}
          onSelectPane={selectPane}
          activePane={activePane}
        />
      </div>

      <ControlPanelsMacAnimatedBody
        instanceId={instanceId}
        toolbarHeight={toolbarHeight}
        navKey={currentEntry}
      >
        {showHome ? (
          <ControlPanelsCategoryGrid t={t} onSelect={selectPane} />
        ) : activePane ? (
          <ControlPanelsPreferencePane>
            {renderPane(activePane, selectPane)}
          </ControlPanelsPreferencePane>
        ) : null}
      </ControlPanelsMacAnimatedBody>
    </div>
  );
}
