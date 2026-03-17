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
          if (!id.includes("node_modules")) return undefined;
          // React e todo o ecossistema que depende dele ficam juntos
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/@radix-ui/") ||
            id.includes("/lucide-react/") ||
            id.includes("/@tanstack/react-query") ||
            id.includes("/@trpc/")
          ) return "vendor-react";
          // Pesados independentes
          if (id.includes("/recharts/") || id.includes("/d3-") || id.includes("/react-simple-maps/")) return "charts";
          if (id.includes("/xlsx/") || id.includes("/jspdf/") || id.includes("/pdfmake/")) return "documents";
          // Resto dos node_modules
          return "vendor";
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
