import { appRegistry } from "./appRegistry";
import { resolveAppId, type AppId } from "./appRegistryData";

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowConstraints {
  minSize?: WindowSize;
  maxSize?: WindowSize;
  defaultSize: WindowSize;
  mobileDefaultSize?: WindowSize;
  /** If true, mobile height will be set to window.innerWidth (square) */
  mobileSquare?: boolean;
}

const defaultWindowConstraints: WindowConstraints = {
  defaultSize: { width: 730, height: 475 },
  minSize: { width: 300, height: 200 },
};

function resolveRegistryAppId(appId: AppId): AppId {
  return resolveAppId(appId) ?? appId;
}

export const getWindowConfig = (appId: AppId): WindowConstraints => {
  const resolved = resolveRegistryAppId(appId);
  return appRegistry[resolved].windowConfig || defaultWindowConstraints;
};

export const getMobileWindowSize = (appId: AppId): WindowSize => {
  const config = getWindowConfig(appId);
  if (config.mobileDefaultSize) {
    return config.mobileDefaultSize;
  }
  if (config.mobileSquare) {
    return {
      width: window.innerWidth,
      height: window.innerWidth,
    };
  }
  return {
    width: window.innerWidth,
    height: config.defaultSize.height,
  };
};
