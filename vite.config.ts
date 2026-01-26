import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import vercel from "vite-plugin-vercel";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Polyfill __dirname in ESM context (Node >=16)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect dev mode for memory optimizations
const isDev = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;

// Browserslist warns if caniuse-lite is stale; suppress when up-to-date
process.env.BROWSERSLIST_IGNORE_OLD_DATA ??= "1";

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  define: {
    // Expose VERCEL_ENV to the client for environment detection
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV || ''),
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
    // Pre-transform requests for faster page loads
    preTransformRequests: true,
    watch: {
      // Each pattern must be a separate array element for proper matching
      ignored: [
        "**/.terminals/**",
        "**/dist/**",
        "**/.vercel/**",
        "**/src-tauri/**",
        "**/_api/**",
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
      // framer-motion is used on initial load for animations
      "framer-motion",
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
      // Video player - only needed when Videos app opens
      "react-player",
      // Realtime chat - only needed when Chats opens
      "pusher-js",
      // Chinese/Japanese text processing - only needed for lyrics features
      "pinyin-pro",
      "wanakana",
      "hangul-romanization",
      // QR codes - only needed for specific features
      "qrcode.react",
    ] : [],
  },
  plugins: [
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
    react(),
    tailwindcss(),
    // Only include Vercel and PWA plugins when not building for Tauri
    // Skip PWA plugin entirely in dev mode to save ~50MB memory (Workbox config is heavy)
    ...(process.env.TAURI_ENV ? [] : isDev ? [vercel()] : [
      vercel(),
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
        // Exclude API routes, iframe content, and app deep links from navigation fallback
        // This prevents the SW from returning index.html for API/iframe requests
        // and allows the middleware to handle OG meta tags for shared links
        // IMPORTANT: Safari has issues with service worker responses that contain redirections.
        // The middleware returns HTML with location.replace() which Safari treats as a redirect.
        // By denying these routes, the request goes directly to the server/middleware.
        navigateFallbackDenylist: [
          /^\/api\//,  // API routes
          /^\/embed\//,  // embed wrapper pages (e.g. infinite-mac with COEP)
          /^\/iframe-check/,  // iframe proxy endpoint
          /^\/404/,  // Don't intercept 404 redirects
          /^\/docs(\/|$)/,  // Documentation pages - serve static HTML files directly (including /docs root redirect)
          // App routes handled by middleware for OG preview links
          // These need to reach the middleware first, then redirect to ?_ryo=1
          /^\/finder$/,
          /^\/soundboard$/,
          /^\/internet-explorer(\/|$)/,
          /^\/chats$/,
          /^\/textedit$/,
          /^\/paint$/,
          /^\/photo-booth$/,
          /^\/minesweeper$/,
          /^\/videos(\/|$)/,
          /^\/ipod(\/|$)/,
          /^\/karaoke(\/|$)/,
          /^\/synth$/,
          /^\/pc$/,
          /^\/terminal$/,
          /^\/applet-viewer(\/|$)/,
          /^\/control-panels$/,
        ],
        // Enable navigation fallback to precached index.html for offline support
        // This ensures the app can start when offline by serving the cached shell
        navigateFallback: 'index.html',
        // Cache strategy for different asset types
        runtimeCaching: [
          {
            // Navigation requests (/, /foo, etc.) - network first to avoid stale index.html
            // Critical for Safari which can error on missing chunks after updates
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: "NetworkFirst",
            options: {
              cacheName: "html-pages",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            // Cache JS chunks - network first for freshness (code changes often)
            // Falls back to cache if network is slow/unavailable
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
          {
            // Cache wallpaper images (photos and tiles only, NOT videos)
            // Videos need range request support which CacheFirst doesn't handle well
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
        ],
        // Precache the most important assets for offline support
        // index.html is precached to serve as navigation fallback when offline
        // Service worker uses skipWaiting + clientsClaim to update immediately,
        // minimizing risk of stale HTML referencing old scripts
        globPatterns: [
          "index.html",
          "**/*.css",
          "fonts/*.woff2",
          "icons/manifest.json",
        ],
        // Exclude large data files from precaching (they'll be cached at runtime)
        globIgnores: [
          "**/data/all-sounds.json", // 4.7MB - too large
          "**/node_modules/**",
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
  vercel: {
    defaultSupportsResponseStreaming: true,
    // Fix routing for subdirectory index files
    rewrites: [
      // Route /api/songs to /api/songs/index
      { source: "/api/songs", destination: "/api/songs/index" },
      // Route /api/rooms to /api/rooms/index
      { source: "/api/rooms", destination: "/api/rooms/index" },
      // Route /api/users to /api/users/index
      { source: "/api/users", destination: "/api/users/index" },
    ],
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
        manualChunks: {
          // Core React - loaded immediately
          react: ["react", "react-dom"],
          
          // UI primitives - loaded early
          "ui-core": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-menubar",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-tooltip",
          ],
          "ui-form": [
            "@radix-ui/react-label",
            "@radix-ui/react-select",
            "@radix-ui/react-slider",
            "@radix-ui/react-switch",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-tabs",
          ],
          
          // Heavy audio libs - deferred until Soundboard/iPod/Synth opens
          audio: ["tone", "wavesurfer.js", "audio-buffer-utils"],
          
          // Media player - shared by iPod and Videos apps
          "media-player": ["react-player"],

          // Korean romanization - only needed for lyrics
          "hangul": ["hangul-romanization"],
          
          // AI SDK - deferred until Chats/IE opens  
          "ai-sdk": ["ai", "@ai-sdk/anthropic", "@ai-sdk/google", "@ai-sdk/openai", "@ai-sdk/react"],
          
          // Rich text editor - deferred until TextEdit opens
          // Note: @tiptap/pm is excluded because it only exports subpaths (e.g. @tiptap/pm/state)
          // and has no main entry point, which causes Vite to fail
          tiptap: [
            "@tiptap/core",
            "@tiptap/react",
            "@tiptap/starter-kit",
            "@tiptap/extension-task-item",
            "@tiptap/extension-task-list",
            "@tiptap/extension-text-align",
            "@tiptap/extension-underline",
            "@tiptap/suggestion",
          ],
          
          // 3D rendering - deferred until PC app opens
          three: ["three"],
          
          // Animation - used by multiple apps
          motion: ["framer-motion"],
          
          // State management
          zustand: ["zustand"],
          
          // Realtime chat
          pusher: ["pusher-js"],
        },
      },
    },
    sourcemap: false,
    minify: true,
    // Main bundle includes core shell + app registry; keep warnings meaningful
    chunkSizeWarningLimit: 2500,
  },
});
