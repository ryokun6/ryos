import { createContext } from "react";
import type { DockPlacement } from "./dockPlacement";

/** Edge the dock sits on. Icons, spacers, and dividers lay out along it. */
export const DockPlacementContext = createContext<DockPlacement>("bottom");
