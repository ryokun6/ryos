import type { Applet } from "../../utils/appletActions";

export interface AppStoreFeedProps {
  theme?: string;
  focusWindow?: () => void;
  onAppletSelect?: (applet: Applet) => void;
}

export interface AppStoreFeedRef {
  goToNext: () => void;
  goToPrevious: () => void;
}
