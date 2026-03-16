import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    minify: 'esbuild',
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("react/")) return "react-core";
            if (id.includes("@tanstack/react-query") || id.includes("@trpc")) return "trpc-query";
            if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("tailwind")) return "ui-lib";
            if (id.includes("date-fns") || id.includes("zod") || id.includes("superjson")) return "utils";
            if (id.includes("recharts") || id.includes("d3-") || id.includes("react-simple-maps")) return "charts";
            if (id.includes("xlsx") || id.includes("pdf") || id.includes("jspdf")) return "documents";
            return "vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
