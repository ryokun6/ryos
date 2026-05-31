import React from "react";
import type { SongDetailPanelProps } from "./types";
import { SongDetailPanelView } from "./SongDetailPanelView";
import { useSongDetailPanel } from "./useSongDetailPanel";

export const SongDetailPanel: React.FC<SongDetailPanelProps> = (props) => {
  const vm = useSongDetailPanel(props);
  return <SongDetailPanelView {...vm} />;
};
