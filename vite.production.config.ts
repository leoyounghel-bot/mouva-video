import { defineConfig } from "vite";
export default defineConfig({
  server: { proxy: { "/api/ai": "http://127.0.0.1:5175" } },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: { workspace: "index.html", scene: "scene-render.html" },
      output: {
        manualChunks(id) {
          if (id.includes("/three/")) return "three";
        },
      },
    },
  },
});
