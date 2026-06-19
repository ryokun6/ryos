import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

// Polyfill __dirname in ESM context (Node >=16)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect dev mode for memory optimizations. `vite build` may evaluate this
// config before NODE_ENV is set to "production", so also key off the command.
const isBuildCommand = process.argv.includes("build");
const isDev = !isBuildCommand && process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
const standaloneApiProxyTarget = process.env.STANDALONE_API_PROXY_TARGET?.trim();

// Browserslist warns if caniuse-lite is stale; suppress when up-to-date
process.env.BROWSERSLIST_IGNORE_OLD_DATA ??= "1";

function readBuildNumber(): string {
  const versionPath = path.resolve(__dirname, "public/version.json");
  if (!existsSync(versionPath)) {
    return "dev";
  }
  try {
    const data = JSON.parse(readFileSync(versionPath, "utf-8")) as {
      buildNumber?: string;
    };
    return data.buildNumber ?? "dev";
  } catch {
    return "dev";
  }
}

const ryosBuildNumber = readBuildNumber();

const devServiceWorkerResetScript = `
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    if (self.caches) {
      const keys = await self.caches.keys();
      await Promise.all(keys.map((key) => self.caches.delete(key)));
    }
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    await Promise.all(clients.map((client) => client.navigate(client.url)));
  })());
});
`;

// ---------------------------------------------------------------------------
// Curated Workbox precache
//
// We precache the app shell + every "normal" JS chunk so apps load offline and
// updates only re-download content-hashed chunks that actually changed. But we
// EXCLUDE a handful of heavy / rarely-needed-offline families from the precache
// to keep the service-worker install small: they stay available on-demand via
// the runtime CacheFirst /assets/*.js rule (and degrade gracefully offline):
//   - shiki syntax grammars + themes  (chat code highlighting; falls back to
//     plain text offline)
//   - mermaid                         (chat diagrams)
//   - webamp                          (Winamp app)
//   - v86                             (Virtual PC emulator)
//   - pusher-js                       (realtime chat; needs network anyway)
//   - react-player                    (YouTube playback; needs network anyway)
// `three` (3D wallpapers / Synth) and `audio` (Synth/Soundboard/iPod) are NOT
// excluded so those keep working offline.
//
// The set is populated at build time by `collectHeavyChunksPlugin` (which
// inspects each emitted chunk's modules) and consumed by the Workbox
// `manifestTransforms` hook below.
// ---------------------------------------------------------------------------
const HEAVY_PRECACHE_PACKAGES =
  /[/\\]node_modules[/\\](?:\.pnpm[/\\][^/\\]+[/\\]node_modules[/\\])?(?:shiki|@shikijs|mermaid|webamp|v86|pusher-js|react-player)[/\\]/;
const heavyPrecacheExclusions = new Set<string>();

function collectHeavyChunksPlugin() {
  return {
    name: "ryos-collect-heavy-chunks",
    apply: "build" as const,
    generateBundle(_options: unknown, bundle: Record<string, unknown>) {
      for (const [fileName, output] of Object.entries(bundle)) {
        const chunk = output as {
          type?: string;
          moduleIds?: string[];
          modules?: Record<string, unknown>;
          facadeModuleId?: string | null;
        };
        if (chunk.type !== "chunk" || !fileName.endsWith(".js")) continue;
        const moduleIds =
          chunk.moduleIds ?? Object.keys(chunk.modules ?? {});
        if (moduleIds.length === 0) continue;
        // Exclude a chunk when it is ENTIRELY composed of heavy packages
        // (catches shiki language/theme grammars and manual heavy chunks), OR
        // when its facade module is a heavy package (catches dynamic-import
        // entry chunks like mermaid that also bundle non-heavy transitive deps
        // such as d3/dagre). Requiring all-heavy or a heavy facade avoids ever
        // dropping a shared chunk that also contains app code.
        const allHeavy = moduleIds.every((id) =>
          HEAVY_PRECACHE_PACKAGES.test(id)
        );
        const heavyFacade =
          typeof chunk.facadeModuleId === "string" &&
          HEAVY_PRECACHE_PACKAGES.test(chunk.facadeModuleId);
        if (allHeavy || heavyFacade) {
          heavyPrecacheExclusions.add(fileName.split("/").pop() as string);
        }
      }
    },
  };
}

/**
 * Vendor package → manual chunk assignment (used by the function-form
 * `manualChunks` below). Mirrors the previous object-form mapping:
 *
 * - react: loaded immediately
 * - ui-core: Radix primitives, loaded early. ui-form was merged into ui-core
 *   to eliminate a circular chunk dependency (ui-form -> ui-core -> ui-form)
 *   that caused a TDZ crash in Vite 6.4.x.
 * - audio: heavy audio libs, deferred until Soundboard/iPod/Synth opens
 * - media-player: shared by iPod and Videos apps
 * - hangul: Korean romanization, only needed for lyrics
 * - ai-sdk: deferred until Chats/IE opens
 * - tiptap: rich text editor, deferred until TextEdit opens. @tiptap/pm is
 *   excluded because it only exports subpaths and has no main entry point.
 * - three: 3D rendering, deferred until shader wallpapers / Synth need it
 * - motion / zustand / pusher / webamp: see comments at their use sites
 */
const MANUAL_CHUNK_BY_PACKAGE: Record<string, string> = {
  react: "react",
  "react-dom": "react",
  "@radix-ui/react-dialog": "ui-core",
  "@radix-ui/react-dropdown-menu": "ui-core",
  "@radix-ui/react-menubar": "ui-core",
  "@radix-ui/react-scroll-area": "ui-core",
  "@radix-ui/react-tooltip": "ui-core",
  "@radix-ui/react-label": "ui-core",
  "@radix-ui/react-select": "ui-core",
  "@radix-ui/react-slider": "ui-core",
  "@radix-ui/react-switch": "ui-core",
  "@radix-ui/react-checkbox": "ui-core",
  "@radix-ui/react-tabs": "ui-core",
  tone: "audio",
  "wavesurfer.js": "audio",
  "audio-buffer-utils": "audio",
  "react-player": "media-player",
  "hangul-romanization": "hangul",
  ai: "ai-sdk",
  "@ai-sdk/anthropic": "ai-sdk",
  "@ai-sdk/google": "ai-sdk",
  "@ai-sdk/openai": "ai-sdk",
  "@ai-sdk/react": "ai-sdk",
  "@tiptap/core": "tiptap",
  "@tiptap/react": "tiptap",
  "@tiptap/starter-kit": "tiptap",
  "@tiptap/extension-task-item": "tiptap",
  "@tiptap/extension-task-list": "tiptap",
  "@tiptap/extension-text-align": "tiptap",
  "@tiptap/extension-underline": "tiptap",
  "@tiptap/suggestion": "tiptap",
  three: "three",
  motion: "motion",
  zustand: "zustand",
  "pusher-js": "pusher",
  webamp: "webamp",
};

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ['VITE_'],
  define: {
    'import.meta.env.VITE_BUILD_NUMBER': JSON.stringify(ryosBuildNumber),
    // Expose VERCEL_ENV to the client for environment detection
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV || ''),
    // Expose Pusher public key/cluster so the client connects to the correct app in dev
    'import.meta.env.VITE_PUSHER_KEY': JSON.stringify(process.env.PUSHER_KEY || ''),
    'import.meta.env.VITE_PUSHER_CLUSTER': JSON.stringify(process.env.PUSHER_CLUSTER || ''),
    'import.meta.env.VITE_REALTIME_PROVIDER': JSON.stringify(process.env.REALTIME_PROVIDER || ''),
  },
  // Optimize JSON imports for better performance
  json: {
    stringify: true, // Use JSON.parse instead of object literals (faster)
  },
  // Explicit cache directory for better memory management
  cacheDir: 'node_modules/.vite',
  // Disable CSS source maps in dev to reduce memory usage (~30% reduction)
  css: {
    devSourcemap: false,
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    cors: { origin: ["*"] },
    ...(standaloneApiProxyTarget
      ? {
          proxy: {
            "/api": {
              target: standaloneApiProxyTarget,
              changeOrigin: true,
            },
            "/ws": {
              target: standaloneApiProxyTarget,
              ws: true,
            },
          },
        }
      : {}),
    // Pre-transform requests for faster page loads
    preTransformRequests: true,
    watch: {
      // Each pattern must be a separate array element for proper matching
      ignored: [
        "**/.terminals/**",
        "**/dist/**",
        "**/.vercel/**",
        "**/dist-electron/**",
        "**/electron/**",
        "**/api/**",
        "**/public/**", // 500+ static files don't need HMR watching
        "**/node_modules/**",
        "**/.git/**",
        "**/scripts/**", // Build scripts don't need HMR
        "**/*.md", // Documentation files
        "**/*.json", // JSON data files (except vite.config imports)
        "**/tests/**", // Test files don't need HMR
      ],
      // Use polling only when necessary (e.g., Docker/VM)
      usePolling: false,
      // Debounce rapid file changes to prevent duplicate HMR updates
      // This helps when editors save multiple times or trigger multiple events
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    },
    // Reduce HMR full reload frequency
    hmr: {
      // Increase timeout to allow for slower transforms
      timeout: 5000,
    },
    // Enable warmup for critical files to speed up first page load
    // These files are always needed and pre-transforming them improves perceived startup
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/config/appRegistry.tsx",
        "./src/stores/useAppStore.ts",
        "./src/components/layout/WindowFrame.tsx",
      ],
    },
  },
  optimizeDeps: {
    // Don't wait for full crawl - allows faster initial dev startup
    holdUntilCrawlEnd: false,
    // Limit entry points to reduce initial crawl scope and memory usage
    entries: [
      'src/main.tsx',
      'src/App.tsx',
    ],
    // Force pre-bundle these core deps to avoid slow unbundled ESM loading
    // Keep this list minimal - only include deps used on initial page load
    include: [
      "react",
      "react-dom",
      "zustand",
      "clsx",
      "tailwind-merge",
      // Motion (motion/react) is used on initial load for animations
      "motion/react",
      "motion",
      // Pre-bundle so CJS→ESM works (avoids "exports is not defined" / "no export named default" in dev)
      "react-player",
      "pinyin-pro",
      "wanakana",
      "hangul-romanization",
    ],
    // Exclude heavy deps from initial pre-bundling to reduce memory
    // These will be bundled on-demand when their apps are opened
    // Note: AI SDK removed from exclude to fix ESM/CJS compatibility with @vercel/oidc
    exclude: isDev ? [
      // Audio libs - only needed when Soundboard/iPod/Synth/Karaoke opens
      "tone",
      "wavesurfer.js",
      "audio-buffer-utils",
      // 3D rendering - only needed when PC app opens
      "three",
      // Rich text editor - only needed when TextEdit opens
      "@tiptap/core",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/pm",
      // pinyin-pro, wanakana, hangul-romanization are in include for CJS→ESM pre-bundle
      // Realtime chat - only needed when Chats opens
      "pusher-js",
      // QR codes - only needed for specific features
      "qrcode.react",
    ] : [],
  },
  plugins: [
    // Replace any production service worker left on localhost with a tiny
    // cleanup worker so Vite dev sessions cannot be controlled by stale bundles.
    ...(isDev
      ? [
          {
            name: "serve-dev-service-worker-reset",
            configureServer(server: ViteDevServer) {
              server.middlewares.use((
                req: IncomingMessage,
                res: ServerResponse,
                next: () => void
              ) => {
                const pathPart = (req.url || "").split("?")[0];
                if (pathPart !== "/sw.js") {
                  next();
                  return;
                }

                res.statusCode = 200;
                res.setHeader(
                  "Content-Type",
                  "application/javascript; charset=utf-8"
                );
                res.setHeader("Cache-Control", "no-store, max-age=0");
                res.end(devServiceWorkerResetScript);
              });
            },
          },
        ]
      : []),
    // Serve static docs HTML files (before SPA fallback kicks in)
    {
      name: 'serve-static-docs',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';
          // Redirect /docs and /docs/ to /docs/overview
          if (url === '/docs' || url === '/docs/') {
            res.writeHead(302, { Location: '/docs/overview' });
            res.end();
            return;
          }
          // Redirect short /privacy URL to the docs page
          if (url === '/privacy' || url === '/privacy/') {
            res.writeHead(302, { Location: '/docs/privacy' });
            res.end();
            return;
          }
          // Handle clean URLs for docs - serve .html files
          if (url.startsWith('/docs/') && !url.endsWith('.html')) {
            const htmlPath = url + '.html';
            req.url = htmlPath;
            return next();
          }
          // Redirect .html URLs to clean URLs (match Vercel behavior)
          if (url.startsWith('/docs/') && url.endsWith('.html')) {
            const cleanUrl = url.replace(/\.html$/, '');
            res.writeHead(308, { Location: cleanUrl });
            res.end();
            return;
          }
          next();
        });
      },
    },
    // Serve cross-origin-isolated embed wrappers in dev
    // (e.g. /embed/infinite-mac, /embed/infinite-pc).
    // Vercel applies COEP/COOP headers via vercel.json + rewrites in prod;
    // this plugin mirrors that behavior for the Vite dev server.
    {
      name: 'serve-coep-embeds',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const rawUrl = req.url || '';
          // Strip query string for matching but keep it for the rewrite below
          const [pathPart, queryPart] = rawUrl.split('?');
          // Only match clean URLs like /embed/foo (no extension, no further segments)
          const match = pathPart.match(/^\/embed\/([a-zA-Z0-9_-]+)$/);
          if (!match) return next();
          const name = match[1];
          const htmlName = name === 'infinite-pc' ? 'pc' : name;
          const htmlPath = path.resolve(__dirname, 'public/embed', `${htmlName}.html`);
          import('node:fs').then(({ promises: fs }) => {
            fs.readFile(htmlPath)
              .then((buf) => {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
                res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
                res.end(buf);
              })
              .catch(() => {
                // No matching embed file — let the request fall through
                // (it will hit the SPA fallback, same as before).
                req.url = queryPart ? `${pathPart}?${queryPart}` : pathPart;
                next();
              });
          });
        });
      },
    },
    react(),
    tailwindcss(),
    // Only include PWA plugin in production builds (not dev)
    // Skip PWA plugin entirely in dev mode to save ~50MB memory (Workbox config is heavy)
    ...(isDev ? [] : [
      collectHeavyChunksPlugin(),
      VitePWA({
      registerType: "autoUpdate",
      manifestFilename: "manifest.json",
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "icons/*.png",
        "fonts/*.woff2",
      ],
      manifest: {
        name: "ryOS",
        short_name: "ryOS",
        description: "An AI OS experience, made with Cursor",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          {
            src: "/icons/mac-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/mac-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/mac-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Do not let Workbox auto-register a precached navigation fallback.
        // GenerateSW emits that route before runtimeCaching, which means it can
        // serve an old precached index.html before our NetworkFirst navigation
        // route below gets a chance to fetch the latest shell.
        navigateFallback: null,
        // Prevent precacheAndRoute from mapping "/" directly to cached
        // index.html; navigations should flow through the NetworkFirst route.
        directoryIndex: null,
        // Cache strategy for different asset types
        runtimeCaching: [
          {
            // Navigation requests (/, /foo, etc.) - network first to avoid stale index.html.
            // If the network is unavailable, fall back to the precached shell for offline use.
            // Denied routes still go to the server/middleware for APIs, embeds,
            // docs, redirects, and OG preview links.
            urlPattern: ({ request, url }: { request: Request; url: URL }) => {
              if (request.mode !== 'navigate') return false;
              return ![
                /^\/api\//,
                /^\/embed\//,
                /^\/iframe-check/,
                /^\/404/,
                /^\/docs(\/|$)/,
                /^\/finder$/,
                /^\/soundboard$/,
                /^\/internet-explorer(\/|$)/,
                /^\/chats$/,
                /^\/textedit$/,
                /^\/paint$/,
                /^\/photo-booth$/,
                /^\/minesweeper$/,
                /^\/videos(\/|$)/,
                /^\/tv$/,
                /^\/ipod(\/|$)/,
                /^\/karaoke(\/|$)/,
                /^\/listen(\/|$)/,
                /^\/synth$/,
                /^\/pc$/,
                /^\/terminal$/,
                /^\/applet-viewer(\/|$)/,
                /^\/control-panels$/,
                /^\/dashboard$/,
              ].some((pattern) => pattern.test(url.pathname));
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "html-pages",
              precacheFallback: {
                fallbackURL: "/index.html",
              },
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            // App version / update probe — always prefer network (not hashed; must stay fresh)
            urlPattern: /\/version\.json(?:\?.*)?$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "version-json",
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            // Vite hashed chunks under /assets/ — cache first for fast/offline loads
            // (new deploys use new filenames; navigation stays NetworkFirst separately)
            urlPattern: /\/assets\/.+\.js(?:\?.*)?$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "js-resources",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
            },
          },
          {
            // Other same-origin .js (e.g. root register scripts) — network first; listed after /assets/ rule
            urlPattern: /\.js(?:\?.*)?$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "js-resources",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
              networkTimeoutSeconds: 3, // Fall back to cache after 3s
            },
          },
          {
            // Cache CSS - stale-while-revalidate (CSS changes less often)
            // Serves cached immediately, updates in background
            urlPattern: /\.css(?:\?.*)?$/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "css-resources",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          {
            // Cache wallpaper images (photos and tiles only, NOT videos)
            // Videos need range request support which CacheFirst doesn't handle well.
            // Keep this before the generic image route so wallpapers use their
            // larger, dedicated cache instead of consuming the shared image cache.
            urlPattern: /\/wallpapers\/(?:photos|tiles)\/.+\.(?:jpg|jpeg|png|webp)(?:\?.*)?$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "wallpapers",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Cache images aggressively
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)(?:\?.*)?$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              // Ignore query params for cache matching.
              // Icon URLs no longer use ?v= cache busting (prefetch uses cache: 'reload' instead).
              // This setting is kept for any external images that might have query params.
              matchOptions: {
                ignoreSearch: true,
              },
            },
          },
          {
            // Cache local fonts
            urlPattern: /\.(?:woff|woff2|ttf|otf|eot)(?:\?.*)?$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "fonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            // Cache Google Fonts stylesheets
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            // Cache Google Fonts webfont files
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache audio files (used by useSound.ts)
            // Match audio extensions with optional query params
            urlPattern: /\.(?:mp3|wav|ogg|m4a)(?:\?.*)?$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "audio",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Cache JSON data files with network-first for freshness
            urlPattern: /\/data\/.*\.json$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "data-files",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
              networkTimeoutSeconds: 3, // Fall back to cache after 3s
            },
          },
          {
            // Cache icon and wallpaper manifests for offline theming support
            // These are critical for resolving themed icon paths when offline
            urlPattern: /\/(icons|wallpapers)\/manifest\.json$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "manifests",
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
              networkTimeoutSeconds: 3, // Fall back to cache after 3s
            },
          },
        ],
        // Precache the app shell + JS chunks for reliable offline support and
        // efficient, revision-aware updates (only changed hashed chunks are
        // re-fetched). Heavy/optional chunks are filtered out below via
        // manifestTransforms so the install stays small; they load on-demand
        // through the runtime CacheFirst /assets/*.js rule instead.
        globPatterns: [
          "index.html",
          "assets/*.js",
          "**/*.css",
          "fonts/*.woff2",
          "icons/manifest.json",
        ],
        // Exclude large data files from precaching (they'll be cached at runtime)
        globIgnores: [
          "**/data/all-sounds.json", // 4.7MB - too large
          "**/node_modules/**",
        ],
        // Drop heavy / rarely-needed-offline chunk families from the precache
        // manifest (see heavyPrecacheExclusions above). They remain runtime
        // cacheable on first use, and chat code/diagrams degrade gracefully.
        manifestTransforms: [
          (
            entries: Array<{
              url: string;
              revision: string | null;
              size: number;
            }>
          ) => {
            const manifest = entries.filter((entry) => {
              const base = entry.url.split("/").pop() ?? entry.url;
              return !heavyPrecacheExclusions.has(base);
            });
            return { manifest, warnings: [] };
          },
        ],
        // Allow the main bundle to be precached (it's chunked, but entry is ~3MB)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB limit
        // Clean up old caches
        cleanupOutdatedCaches: true,
        // Skip waiting to activate new service worker immediately
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false, // Disable in dev to avoid confusion
      },
    }),
    ]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // esbuild options for faster dev transforms
  esbuild: {
    // Remove legal comments to reduce memory overhead
    legalComments: 'none',
    // Target modern browsers for faster transforms
    target: 'es2022',
  },
  build: {
    // Target modern browsers for smaller bundles
    target: 'es2022',
    rollupOptions: {
      output: {
        // Function form (instead of the object form) so that ONLY modules of
        // the listed packages are assigned to these chunks. With the object
        // form, rollup hoisted shared virtual helpers (e.g. Vite's preload
        // helper) into manual chunks like "media-player", which made the
        // entry chunk statically import react-player & co. at boot just to
        // reach the ~1KB helper.
        manualChunks: (id: string) => {
          // Pin Vite's virtual preload helper (needed by the entry and every
          // dynamic import site) to its own tiny chunk; otherwise rollup
          // co-locates it with an arbitrary vendor chunk, forcing that whole
          // chunk to load at boot.
          if (id.includes("vite/preload-helper")) return "preload-helper";
          const match = id.match(
            /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(@[^/]+\/[^/]+|[^/]+)\//
          );
          if (!match) return undefined;
          return MANUAL_CHUNK_BY_PACKAGE[match[1]];
        },
      },
    },
    sourcemap: false,
    minify: true,
    // Main bundle includes core shell + app registry; keep warnings meaningful
    chunkSizeWarningLimit: 2500,
  },
});
