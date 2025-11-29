import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import vercel from "vite-plugin-vercel";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Polyfill __dirname in ESM context (Node >=16)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    cors: { origin: ["*"] },
    watch: {
      ignored: ["**/.terminals/**"],
    },
  },
  plugins: [react(), tailwindcss(), vercel()],
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
