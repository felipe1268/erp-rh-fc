import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Rev. 3585 — Injeta timestamp de build no sw.js para forçar atualização do
    // Service Worker a cada deploy. Sem isso, o browser não detecta mudança no
    // sw.js e o SW antigo continua servindo assets velhos → tela branca no iOS.
    {
      name: "inject-sw-build-ts",
      apply: "build",
      closeBundle() {
        const swOut = path.resolve(import.meta.dirname, "dist/public/sw.js");
        if (fs.existsSync(swOut)) {
          const content = fs.readFileSync(swOut, "utf-8");
          const patched = content.replace("__SW_BUILD_TS__", Date.now().toString());
          fs.writeFileSync(swOut, patched);
        }
      },
    },
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
    // Rev. 3545 — chunks mais granulares para reduzir pico de memória do Rollup
    // durante o build de produção (OOM com 4679 módulos + 8GB de heap pedido).
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // ── heavy standalone libs ──────────────────────────────────────────
          if (id.includes("/three/"))                  return "vendor-three";
          if (id.includes("/web-ifc"))                 return "vendor-webifc";
          if (id.includes("/pdfjs-dist/"))             return "vendor-pdf";
          if (id.includes("/exceljs/") || id.includes("/xlsx/")) return "vendor-xlsx";
          // ── charts / data-viz ─────────────────────────────────────────────
          if (id.includes("/recharts/") || id.includes("/d3-") || id.includes("/d3/") || id.includes("/victory")) return "vendor-charts";
          // ── icons (lucide é grande, ~3 MB minificado) ────────────────────
          if (id.includes("/lucide-react/"))           return "vendor-icons";
          // ── radix-ui (muitos pacotes individuais) ─────────────────────────
          if (id.includes("/@radix-ui/"))              return "vendor-radix";
          // ── framer-motion ─────────────────────────────────────────────────
          if (id.includes("/framer-motion/"))          return "vendor-motion";
          // ── tRPC + tanstack-query ─────────────────────────────────────────
          if (id.includes("/@trpc/") || id.includes("/@tanstack/")) return "vendor-trpc";
          // ── react core ────────────────────────────────────────────────────
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/") || id.includes("/use-sync-external-store/") || id.includes("/react-is/")) return "vendor-react";
          // ── form / validation ─────────────────────────────────────────────
          if (id.includes("/react-hook-form/") || id.includes("/zod/") || id.includes("/@hookform/")) return "vendor-forms";
          // ── date / i18n utils ─────────────────────────────────────────────
          if (id.includes("/date-fns/") || id.includes("/dayjs/") || id.includes("/luxon/")) return "vendor-dates";
          // ── tudo mais: deixa Rollup decidir (evita chunks circulares) ──
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 3000,
  },
  optimizeDeps: {
    exclude: ["web-ifc"],
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
