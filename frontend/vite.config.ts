import path from "path"
import react from "@vitejs/plugin-react"
import { visualizer } from "rollup-plugin-visualizer"
import { defineConfig } from "vite"

const analyzeBundle = process.env.ANALYZE === "1"

export default defineConfig({
  plugins: [
    react(),
    analyzeBundle
      ? visualizer({
          filename: "dist/stats.html",
          gzipSize: true,
          brotliSize: true,
          open: false,
        })
      : null,
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "frappe-gantt/dist/frappe-gantt.css": path.resolve(
        __dirname,
        "node_modules/frappe-gantt/dist/frappe-gantt.css"
      ),
    },
  },
  build: {
    sourcemap: "hidden",
    modulePreload: {
      // Drop preload directives for chunks that are only reachable from lazy
      // routes. Keeping them as separate chunks for caching, but not paying
      // the network cost on the initial shell load.
      resolveDependencies(_filename, deps) {
        const eagerPreloadAllowlist = new Set([
          "vendor",
          "query",
        ])

        return deps.filter((dep) => {
          const name = dep.split("/").pop() ?? dep
          return Array.from(eagerPreloadAllowlist).some((prefix) =>
            name.startsWith(`${prefix}-`)
          )
        })
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          excalidraw: ["@excalidraw/excalidraw"],
          blocknote: [
            "@blocknote/core",
            "@blocknote/code-block",
            "@blocknote/react",
            "@blocknote/shadcn",
          ],
          syntax: ["react-syntax-highlighter"],
          calendar: [
            "@fullcalendar/core",
            "@fullcalendar/daygrid",
            "@fullcalendar/timegrid",
            "@fullcalendar/interaction",
            "@fullcalendar/react",
          ],
          editor: ["yjs"],
          dnd: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
