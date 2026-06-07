import { getWindowConfig } from "@/config/appWindowConfig";
import type { AppId } from "@/config/appIds";
import { useMemo } from "react";
import type { WindowFrameProps } from "../windowFrameTypes";

export function useWindowFrameConstraints(
  appId: AppId,
  windowConstraints: WindowFrameProps["windowConstraints"] = {}
) {
  const config = getWindowConfig(appId);

  const defaultConstraints = useMemo(
    () => ({
      minWidth: config.minSize?.width,
      minHeight: config.minSize?.height,
      maxWidth: config.maxSize?.width,
      maxHeight: config.maxSize?.height,
      defaultSize: config.defaultSize,
    }),
    [config]
  );

  const mergedConstraints = useMemo(
    () => ({
      ...defaultConstraints,
      ...windowConstraints,
    }),
    [defaultConstraints, windowConstraints]
  );

  return { mergedConstraints };
}
