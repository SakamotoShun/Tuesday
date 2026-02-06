import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
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
    sourcemap: false,
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
