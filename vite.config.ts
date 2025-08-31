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
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:5174',
        changeOrigin: true,
        // Verbose proxy logging can be enabled with VITE_PROXY_VERBOSE=1
        configure: (proxy, _options) => {
          const verbose = !!process.env.VITE_PROXY_VERBOSE;
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          if (verbose) {
            proxy.on('proxyReq', (_proxyReq, _req, _res) => {
              console.log('Sending Request to the Target:', _req?.method, _req?.url);
            });
            proxy.on('proxyRes', (proxyRes, _req, _res) => {
              console.log('Received Response from the Target:', proxyRes.statusCode, _req?.url);
            });
          }
        },
      }
    }
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
          react: ["react", "react-dom"],
          ui: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-label",
          ],
          audio: ["tone", "wavesurfer.js", "audio-buffer-utils"],
        },
      },
    },
    sourcemap: false,
    minify: true,
  },
});
