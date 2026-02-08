import { lazy, Suspense, type ComponentType } from "react";
import type {
  AppProps,
  ControlPanelsInitialData,
  InternetExplorerInitialData,
  IpodInitialData,
  PaintInitialData,
  VideosInitialData,
} from "@/apps/base/types";
import type { AppletViewerInitialData } from "@/apps/applet-viewer";
import { AppLoadSignal } from "./AppLoadSignal";

// Cache for lazy components to maintain stable references across HMR
const lazyComponentCache = new Map<string, ComponentType<AppProps<unknown>>>();

// Helper to create a lazy-loaded component with Suspense
// Uses a cache to maintain stable component references across HMR
function createLazyComponent<T = unknown>(
  importFn: () => Promise<{ default: ComponentType<AppProps<T>> }>,
  cacheKey: string
): ComponentType<AppProps<T>> {
  // Return cached component if it exists (prevents HMR issues)
  const cached = lazyComponentCache.get(cacheKey);
  if (cached) {
    return cached as ComponentType<AppProps<T>>;
  }

  const LazyComponent = lazy(importFn);

  // Wrap with Suspense to handle loading state
  const WrappedComponent = (props: AppProps<T>) => (
    <Suspense fallback={null}>
      <LazyComponent {...props} />
      <AppLoadSignal instanceId={props.instanceId} />
    </Suspense>
  );

  // Cache the component
  lazyComponentCache.set(
    cacheKey,
    WrappedComponent as ComponentType<AppProps<unknown>>
  );

  return WrappedComponent;
}

export const LazyTextEditApp = createLazyComponent<unknown>(
  () =>
    import("@/apps/textedit/components/TextEditAppComponent").then((m) => ({
      default: m.TextEditAppComponent,
    })),
  "textedit"
);

export const LazyInternetExplorerApp =
  createLazyComponent<InternetExplorerInitialData>(
    () =>
      import(
        "@/apps/internet-explorer/components/InternetExplorerAppComponent"
      ).then((m) => ({ default: m.InternetExplorerAppComponent })),
    "internet-explorer"
  );

export const LazyChatsApp = createLazyComponent<unknown>(
  () =>
    import("@/apps/chats/components/ChatsAppComponent").then((m) => ({
      default: m.ChatsAppComponent,
    })),
  "chats"
);

export const LazyControlPanelsApp =
  createLazyComponent<ControlPanelsInitialData>(
    () =>
      import("@/apps/control-panels/components/ControlPanelsAppComponent").then(
        (m) => ({ default: m.ControlPanelsAppComponent })
      ),
    "control-panels"
  );

export const LazyMinesweeperApp = createLazyComponent<unknown>(
  () =>
    import("@/apps/minesweeper/components/MinesweeperAppComponent").then(
      (m) => ({ default: m.MinesweeperAppComponent })
    ),
  "minesweeper"
);

export const LazySoundboardApp = createLazyComponent<unknown>(
  () =>
    import("@/apps/soundboard/components/SoundboardAppComponent").then(
      (m) => ({ default: m.SoundboardAppComponent })
    ),
  "soundboard"
);

export const LazyPaintApp = createLazyComponent<PaintInitialData>(
  () =>
    import("@/apps/paint/components/PaintAppComponent").then((m) => ({
      default: m.PaintAppComponent,
    })),
  "paint"
);

export const LazyVideosApp = createLazyComponent<VideosInitialData>(
  () =>
    import("@/apps/videos/components/VideosAppComponent").then((m) => ({
      default: m.VideosAppComponent,
    })),
  "videos"
);

export const LazyPcApp = createLazyComponent<unknown>(
  () =>
    import("@/apps/pc/components/PcAppComponent").then((m) => ({
      default: m.PcAppComponent,
    })),
  "pc"
);

export const LazyPhotoBoothApp = createLazyComponent<unknown>(
  () =>
    import("@/apps/photo-booth/components/PhotoBoothComponent").then((m) => ({
      default: m.PhotoBoothComponent,
    })),
  "photo-booth"
);

export const LazySynthApp = createLazyComponent<unknown>(
  () =>
    import("@/apps/synth/components/SynthAppComponent").then((m) => ({
      default: m.SynthAppComponent,
    })),
  "synth"
);

export const LazyIpodApp = createLazyComponent<IpodInitialData>(
  () =>
    import("@/apps/ipod/components/IpodAppComponent").then((m) => ({
      default: m.IpodAppComponent,
    })),
  "ipod"
);

export const LazyKaraokeApp = createLazyComponent<IpodInitialData>(
  () =>
    import("@/apps/karaoke/components/KaraokeAppComponent").then((m) => ({
      default: m.KaraokeAppComponent,
    })),
  "karaoke"
);

export const LazyTerminalApp = createLazyComponent<unknown>(
  () =>
    import("@/apps/terminal/components/TerminalAppComponent").then((m) => ({
      default: m.TerminalAppComponent,
    })),
  "terminal"
);

export const LazyAppletViewerApp =
  createLazyComponent<AppletViewerInitialData>(
    () =>
      import("@/apps/applet-viewer/components/AppletViewerAppComponent").then(
        (m) => ({ default: m.AppletViewerAppComponent })
      ),
    "applet-viewer"
  );

export const LazyAdminApp = createLazyComponent<unknown>(
  () =>
    import("@/apps/admin/components/AdminAppComponent").then((m) => ({
      default: m.AdminAppComponent,
    })),
  "admin"
);

export const LazyStickiesApp = createLazyComponent<unknown>(
  () =>
    import("@/apps/stickies/components/StickiesAppComponent").then((m) => ({
      default: m.StickiesAppComponent,
    })),
  "stickies"
);

export const LazyInfiniteMacApp = createLazyComponent<unknown>(
  () =>
    import("@/apps/infinite-mac/components/InfiniteMacAppComponent").then(
      (m) => ({ default: m.InfiniteMacAppComponent })
    ),
  "infinite-mac"
);
