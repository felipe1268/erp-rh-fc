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
    cssMinify: 'esbuild',
    reportCompressedSize: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('@radix-ui')) return 'vendor-radix';
            if (id.includes('react-dom')) return 'vendor-react-dom';
            if (id.includes('three') || id.includes('web-ifc')) return 'vendor-3d';
            if (id.includes('@trpc') || id.includes('@tanstack')) return 'vendor-data';
            return 'vendor';
          }
          if (id.includes('/pages/planejamento/')) return 'page-planejamento';
          if (id.includes('/pages/compras/')) return 'page-compras';
          if (id.includes('/pages/terceiros/')) return 'page-terceiros';
          if (id.includes('/pages/medicao/')) return 'page-medicao';
          if (id.includes('/pages/rh/') || id.includes('/pages/dp/')) return 'page-rh';
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  optimizeDeps: {
    exclude: ["web-ifc"],
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
