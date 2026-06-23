---
name: HTML cache stale post-deploy
description: express.static com maxAge>0 serve index.html em cache → após deploy chunks antigos ficam 404 → tela branca
---

## A regra

**NUNCA servir `index.html` com `maxAge > 0` no `express.static`. Sempre usar `no-cache, no-store, must-revalidate`.**

O mesmo vale para `sw.js` — o browser precisa sempre buscar o sw.js atual para detectar atualizações.

## Por quê

`express.static(distPath, { maxAge: "1h" })` serve TODOS os arquivos estáticos, incluindo `index.html`, com `Cache-Control: private, max-age=3600`. Após um deploy:
- Novos chunks têm novos hashes (ex: `vendor-react-BYctn4vx.js` → `vendor-react-XYZ.js`)
- Browser serve HTML antigo (do cache) que referencia os hashes velhos
- Novos chunks com nomes velhos não existem no servidor → 404
- O crash acontece antes dos event listeners de erro → nenhum log → tela branca para TODOS

O Service Worker também pode retornar HTML do cache HTTP se o `fetch(req)` não usar `cache: 'no-store'`.

## Como aplicar

Em `server/_core/vite.ts`, usar `setHeaders` no `express.static`:
```typescript
app.use(express.static(distPath, {
  maxAge: "1h",
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html") || filePath.endsWith("sw.js")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  },
}));
```

No SW (sw.js), usar `cache: 'no-store'` no fetch de navegação:
```javascript
fetch(new Request(req.url, { cache: "no-store", credentials: "same-origin" }))
```

**Why:** Rev. 3587 — confirmado por `curl -sI "https://erp-gestao-integrada.replit.app/"` mostrando `cache-control: private, max-age=3600` no HTML.
