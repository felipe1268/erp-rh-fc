import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Use process.cwd() for reliable path resolution in production bundles
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "dist", "public"),          // running from workspace root
    path.resolve(import.meta.dirname, "public"), // running from dist/
    path.resolve(import.meta.dirname, "../dist", "public"), // fallback
  ];

  const distPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
  console.log(`[Static] Serving from: ${distPath} (exists: ${fs.existsSync(distPath)})`);

  // Serve hashed assets with long-term cache (1 year) — safe because hash changes on every build
  app.use("/assets", express.static(path.join(distPath, "assets"), {
    maxAge: "1y",
    immutable: true,
    etag: false,
  }));

  // Serve other static files — HTML and sw.js MUST NOT be cached (they reference
  // hashed assets; any stale HTML after a deploy → old chunk hashes → 404 → white screen)
  app.use(express.static(distPath, {
    maxAge: "1h",
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html") || filePath.endsWith("sw.js")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }));

  // fall through to index.html for client-side routing
  app.use("*", (_req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(indexPath);
  });
}
