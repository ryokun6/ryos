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

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  define: {
    // Expose VERCEL_ENV to the client for environment detection
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV || ''),
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    cors: { origin: ["*"] },
    watch: {
      // Each pattern must be a separate array element for proper matching
      ignored: [
        "**/.terminals/**",
        "**/dist/**",
        "**/.vercel/**",
        "**/src-tauri/**",
        "**/api/**",
        "**/public/**", // 500+ static files don't need HMR watching
        "**/node_modules/**",
      ],
    },
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/components/**/*.tsx",
      ],
    },
  },
  optimizeDeps: {
    // Force pre-bundle these deps to avoid slow unbundled ESM loading
    include: [
      "react",
      "react-dom",
      "zustand",
      "framer-motion",
      "clsx",
      "tailwind-merge",
      // Heavy deps - pre-bundle to avoid slow first load from many small ESM files
      "tone",
      "wavesurfer.js",
      "three",
      "shiki",
    ],
  },
  plugins: [
    react(),
    tailwindcss(),
    // Only include Vercel and PWA plugins when not building for Tauri
    ...(process.env.TAURI_ENV ? [] : [
      vercel(),
      VitePWA({
      registerType: "autoUpdate",
      manifestFilename: "manifest.json",
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "icons/*.png",
        "fonts/*.woff",
        "fonts/*.woff2",
        "fonts/*.otf",
        "fonts/*.ttf",
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
        // This prevents the SW from returning index.html for iframe requests
        // and allows the middleware to handle OG meta tags for shared links
        navigateFallbackDenylist: [
          /^\/api\//,  // API routes
          /^\/iframe-check/,  // iframe proxy endpoint
          /^\/404/,  // Don't intercept 404 redirects
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
          "fonts/*.{woff,woff2,otf,ttf}",
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
  },
  build: {
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
          
          // Chinese character conversion - large dictionary data, only needed for lyrics
          "opencc": ["opencc-js"],
          
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
          
          // Code highlighting - deferred until needed
          shiki: ["shiki"],
          
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
  },
});
