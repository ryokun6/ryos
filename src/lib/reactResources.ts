import { preconnect, preload, preinit } from "react-dom";
import {
  getRealtimeProvider,
  getRealtimeWebSocketUrl,
} from "@/utils/runtimeConfig";

type FontResource = {
  href: string;
  type: string;
  priority?: "low" | "high";
};

type FetchResource = {
  href: string;
  priority?: "low" | "high";
};

const STYLE_RESOURCES = ["/fonts/fonts.css"];

const FONT_RESOURCES: FontResource[] = [
  // NOTE: ChicagoKare-Regular and geneva-12 are intentionally omitted here —
  // index.html already preloads them with high priority before this module
  // runs, so re-declaring them would emit duplicate <link rel=preload> hints.
  { href: "/fonts/fusion-pixel-12px-proportional-ja.woff2", type: "font/woff2" },
  { href: "/fonts/Mondwest-Regular.woff2", type: "font/woff2" },
];

const FETCH_RESOURCES: FetchResource[] = [
  { href: "/data/filesystem.json", priority: "high" },
  { href: "/data/applets.json" },
];

function getPreconnectResources(): string[] {
  if (getRealtimeProvider() === "local") {
    try {
      const websocketUrl = new URL(getRealtimeWebSocketUrl());
      websocketUrl.protocol =
        websocketUrl.protocol === "wss:" ? "https:" : "http:";
      return [websocketUrl.origin];
    } catch {
      return [];
    }
  }

  return ["https://ws-us3.pusher.com", "https://sockjs-us3.pusher.com"];
}

let primed = false;

export function primeReactResources(): void {
  if (primed || typeof window === "undefined") {
    return;
  }

  primed = true;

  STYLE_RESOURCES.forEach((href) =>
    safely(() =>
      preinit(href, {
        as: "style",
        fetchPriority: "high",
      })
    )
  );

  FONT_RESOURCES.forEach((resource) =>
    safely(() =>
      preload(resource.href, {
        as: "font",
        type: resource.type,
        crossOrigin: "anonymous",
        fetchPriority: resource.priority ?? "auto",
      })
    )
  );

  FETCH_RESOURCES.forEach((resource) =>
    safely(() =>
      preload(resource.href, {
        as: "fetch",
        crossOrigin: "use-credentials",
        fetchPriority: resource.priority ?? "low",
      })
    )
  );

  getPreconnectResources().forEach((href) =>
    safely(() =>
      preconnect(href, {
        crossOrigin: "anonymous",
      })
    )
  );
}

function safely(action: () => void) {
  try {
    action();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[react-resources] Failed to prime resource", error);
    }
  }
}
