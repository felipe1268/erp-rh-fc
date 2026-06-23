---
name: Circular chunk vendor-misc crash
description: catch-all "vendor-misc" em manualChunks cria dependências circulares entre chunks → exports undefined no runtime → tela branca
---

## A regra

**NUNCA usar `return "vendor-misc"` (ou qualquer nome catch-all) em `manualChunks` do Vite/Rollup.**

## Por quê

Quando um chunk catch-all absorve módulos que são importados POR outros chunks específicos (react-dom importa `use-sync-external-store`, recharts importa utilidades, etc.), cria-se um ciclo de dependência entre chunks:

```
vendor-misc → vendor-react (misc imports React)
vendor-react → vendor-misc (react-dom imports use-sync-external-store que está em misc)
```

No runtime ESM, um dos chunks começa a executar antes do outro terminar. O chunk que carrega primeiro acessa exports `undefined` do outro → crash silencioso.

O crash acontece **antes** dos `window.addEventListener("error", ...)` em `main.tsx` serem registrados → nenhum erro vai para `/api/diag/client-error` → diagnóstico impossível → tela branca para TODOS.

## Como aplicar

Em `vite.config.ts`, substituir qualquer catch-all por `return undefined`:

```typescript
// ERRADO — cria ciclos
return "vendor-misc";

// CORRETO — deixa Rollup alocar automaticamente
return undefined;
```

Padrões específicos (vendor-react, vendor-radix, etc.) são seguros porque cada módulo vai para UM chunk determinístico sem ciclo.

**Why:** Identificado em Rev. 3586 como causa raiz de tela branca em produção para TODOS os usuários. Confirmado via inspeção do bundle: `vendor-react` começava com `import{...}from"./vendor-misc...js"` e vice-versa.
