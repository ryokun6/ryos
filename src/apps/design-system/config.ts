// Design System App Configuration
// Follows the ryOS app pattern for consistency

import DesignSystemApp from "./index";
import { BaseApp } from "@/apps/base/types";

export const DesignSystemAppConfig: BaseApp = {
  id: "design-system",
  name: "Design System",
  component: DesignSystemApp,
  icon: "/icons/apps/design-system.png",
  description: "Comprehensive design system showcase and documentation",
  metadata: {
    name: "Design System",
    version: "2.0.0",
    creator: {
      name: "ryOS Team",
      url: "https://github.com/ryos",
    },
    github: "https://github.com/ryos/design-system",
    icon: "/icons/apps/design-system.png",
  },
};