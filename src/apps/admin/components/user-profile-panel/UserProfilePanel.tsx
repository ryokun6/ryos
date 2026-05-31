import React from "react";
import type { UserProfilePanelProps } from "./types";
import { UserProfilePanelView } from "./UserProfilePanelView";
import { useUserProfilePanel } from "./useUserProfilePanel";

export const UserProfilePanel: React.FC<UserProfilePanelProps> = (props) => {
  const vm = useUserProfilePanel(props);
  return <UserProfilePanelView {...vm} />;
};
