import { preconnect, preload, preinit } from "react-dom";

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
  { href: "/fonts/ChicagoKare-Regular.woff2", type: "font/woff2", priority: "high" },
  { href: "/fonts/fusion-pixel-12px-proportional-ja.woff2", type: "font/woff2" },
  { href: "/fonts/geneva-12.woff2", type: "font/woff2", priority: "high" },
  { href: "/fonts/Mondwest-Regular.woff2", type: "font/woff2" },
];

const FETCH_RESOURCES: FetchResource[] = [
  { href: "/data/filesystem.json", priority: "high" },
  { href: "/data/applets.json" },
];

const PRECONNECT_RESOURCES = [
  "https://ws-us3.pusher.com",
  "https://sockjs-us3.pusher.com",
];

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
        fetchPriority: resource.priority ?? "low",
      })
    )
  );

  PRECONNECT_RESOURCES.forEach((href) =>
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
