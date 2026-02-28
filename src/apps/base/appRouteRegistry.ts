import { appIds, appNames, type AppId } from "@/config/appRegistryData";
import type { AppLaunchRequest } from "@/utils/appEventBus";

export interface RouteToastDescriptor {
  type: "translation" | "text";
  message: string;
}

type UrlCleanupTiming = "immediate" | "after-dispatch" | "never";

export type RouteAction =
  | {
      kind: "launch";
      request: AppLaunchRequest;
      delayMs: number;
      toast?: RouteToastDescriptor;
      urlCleanupTiming: UrlCleanupTiming;
    }
  | {
      kind: "cleanup";
      urlCleanupTiming: Exclude<UrlCleanupTiming, "never">;
    };

const KNOWN_APP_IDS = new Set<string>(appIds);

function createLaunchAction(
  request: AppLaunchRequest,
  options: {
    delayMs: number;
    toast?: RouteToastDescriptor;
    urlCleanupTiming: UrlCleanupTiming;
  },
): RouteAction {
  return {
    kind: "launch",
    request,
    delayMs: options.delayMs,
    toast: options.toast,
    urlCleanupTiming: options.urlCleanupTiming,
  };
}

export function resolveInitialRoute(pathname: string): RouteAction | null {
  if (!pathname || pathname === "/") {
    return null;
  }

  if (pathname === "/applet-viewer" || pathname === "/applet-viewer/") {
    return createLaunchAction(
      { appId: "applet-viewer" },
      {
        delayMs: 100,
        toast: {
          type: "translation",
          message: "common.loading.openingAppletStore",
        },
        urlCleanupTiming: "after-dispatch",
      },
    );
  }

  const internetExplorerMatch = pathname.match(/^\/internet-explorer\/([^/]+)$/);
  if (internetExplorerMatch) {
    return createLaunchAction(
      {
        appId: "internet-explorer",
        initialData: {
          shareCode: internetExplorerMatch[1],
        },
      },
      {
        delayMs: 0,
        toast: {
          type: "translation",
          message: "common.loading.openingSharedIELink",
        },
        urlCleanupTiming: "immediate",
      },
    );
  }

  const appletViewerShareMatch = pathname.match(/^\/applet-viewer\/([^/]+)$/);
  if (appletViewerShareMatch) {
    return createLaunchAction(
      {
        appId: "applet-viewer",
        initialData: {
          shareCode: appletViewerShareMatch[1],
          path: "",
          content: "",
          icon: undefined,
          name: undefined,
        },
      },
      {
        delayMs: 0,
        toast: {
          type: "translation",
          message: "common.loading.openingSharedApplet",
        },
        urlCleanupTiming: "immediate",
      },
    );
  }

  const ipodMatch = pathname.match(/^\/ipod\/(.+)$/);
  if (ipodMatch) {
    return createLaunchAction(
      {
        appId: "ipod",
        initialData: {
          videoId: ipodMatch[1],
        },
      },
      {
        delayMs: 0,
        toast: {
          type: "translation",
          message: "common.loading.openingSharedIpodTrack",
        },
        urlCleanupTiming: "immediate",
      },
    );
  }

  const listenMatch = pathname.match(/^\/listen\/(.+)$/);
  if (listenMatch) {
    return createLaunchAction(
      {
        appId: "karaoke",
        initialData: {
          listenSessionId: listenMatch[1],
        },
      },
      {
        delayMs: 100,
        toast: {
          type: "text",
          message: "Opening live session...",
        },
        urlCleanupTiming: "immediate",
      },
    );
  }

  const karaokeMatch = pathname.match(/^\/karaoke\/(.+)$/);
  if (karaokeMatch) {
    return createLaunchAction(
      {
        appId: "karaoke",
        initialData: {
          videoId: karaokeMatch[1],
        },
      },
      {
        delayMs: 0,
        toast: {
          type: "translation",
          message: "common.loading.openingSharedKaraokeTrack",
        },
        urlCleanupTiming: "immediate",
      },
    );
  }

  const videosMatch = pathname.match(/^\/videos\/(.+)$/);
  if (videosMatch) {
    return createLaunchAction(
      {
        appId: "videos",
        initialData: {
          videoId: videosMatch[1],
        },
      },
      {
        delayMs: 0,
        toast: {
          type: "translation",
          message: "common.loading.openingSharedVideo",
        },
        urlCleanupTiming: "immediate",
      },
    );
  }

  if (
    pathname.startsWith("/internet-explorer/") ||
    pathname.startsWith("/applet-viewer/") ||
    pathname.startsWith("/ipod/") ||
    pathname.startsWith("/listen/") ||
    pathname.startsWith("/karaoke/") ||
    pathname.startsWith("/videos/")
  ) {
    return null;
  }

  const directAppPathMatch = pathname.match(/^\/([^/]+)$/);
  if (directAppPathMatch) {
    const potentialAppId = directAppPathMatch[1];
    if (KNOWN_APP_IDS.has(potentialAppId)) {
      const appId = potentialAppId as AppId;
      const appName = appNames[appId] || appId;

      return createLaunchAction(
        { appId },
        {
          delayMs: 100,
          toast: {
            type: "text",
            message: `Launching ${appName}...`,
          },
          urlCleanupTiming: "after-dispatch",
        },
      );
    }
  }

  return {
    kind: "cleanup",
    urlCleanupTiming: "immediate",
  };
}
