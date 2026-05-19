# ERP RH & DP — FC Engenharia

A comprehensive full-stack ERP system for FC Engenharia, managing HR, payroll, projects, finance, procurement, and operational workflows.

## Run & Operate

- **Dev**: `PORT=5000 NODE_ENV=development pnpm dev`
- **Build**: `pnpm build`
- **Prod**: `node dist/index.js`

**Required Env Vars**:
- `NEON_DATABASE_URL` (or `DATABASE_URL`)
- `JWT_SECRET` (random 48-char hex)
- `NODE_ENV=production`
- `SMTP_PASSWORD`
- `GOOGLE_API_KEY`
- `FROTA_API_TOKEN` (for Infleet API)
- `VITE_APP_TITLE`
- `VITE_APP_LOGO`
- `OAUTH_SERVER_URL`
- `VITE_APP_ID`
- `OWNER_OPEN_ID`

## Stack

- **Frontend**: React 19, Tailwind CSS 4, shadcn/ui, Wouter
- **Backend**: Express 4, tRPC 11, Drizzle ORM
- **Database**: PostgreSQL (Neon)
- **Auth**: Manus OAuth (JWT) or local username/password
- **Build**: Vite 7
- **Package Manager**: pnpm

## Where things live

- `client/`: React frontend
- `server/`: Express backend + tRPC routers (`_core/`, `routers/`, `db.ts`)
- `drizzle/`: Schema (`schema.ts`) + migrations
- `shared/`: Tipos e constantes (`version.ts`, `changelog.ts`, `paymentConditions.ts`, `modules.ts`)
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui`

## Recent changes

> **Convenção (atualizada Rev. 2062 — mais enxuta)** — `replit.md` guarda apenas as **2 últimas revisões** em formato detalhado e as **5 seguintes** em one-liner. Detalhe completo (causa-raiz, arquivos tocados, racional, follow-ups) vive SEMPRE em `shared/changelog.ts`. Demais one-liners vão para `replit-history.md`.
>
> **Ao criar uma nova revisão**:
> 1. Adicionar bloco detalhado da NOVA revisão no TOPO (1-2 parágrafos: o quê + por quê + arquivos principais — sem racional longo, isso vai pro `changelog.ts`).
> 2. Demover a Rev. mais antiga das 2 detalhadas pra one-liner.
> 3. Demover a Rev. mais antiga dos 5 one-liners pra `replit-history.md`.
> 4. Bumpar `shared/version.ts` + prepender entrada COMPLETA (com todo o racional) no topo de `shared/changelog.ts`.

### Top 2 detalhadas

- **Rev. 2146** — **Termo de Responsabilidade movido da ficha do colaborador pra nova aba "Termo de Recebimento" em Controle de Documentos (gestão centralizada + fix bug "tela não atualiza pós-assinatura").** User: "retirar a opção da ficha de Colaborador e levar pra Controle de Documentos numa nova aba ao lado de 'Integrações'... listar TODOS os colaboradores com seus termos (vários por colaborador), criar/visualizar/baixar/excluir... continuar indo pro Raio-X... e corrigir o bug de refresh manual pós-assinatura". **Mudanças:** (1) novo procedure `signatures.listByTipo` (ACL + JOIN employees + signers ordenados) em `server/routers/signatures.ts`; (2) novo `client/src/components/controleDocumentos/TermosResponsabilidadePanel.tsx` (4 KPIs + filtros + tabela + dialog seletor de colaborador → reusa `TermoResponsabilidadeDialog`); (3) FCSignSendDialog vive DENTRO do painel e invalida `listByTipo` no close — corrige o bug; (4) `ControleDocumentos.tsx` ganhou TabsTrigger + TabsContent (grid 8→9); (5) `Colaboradores.tsx` perdeu o entry point + state/dialog/import órfãos. Vínculo c/ Raio-X via `employee_documents` continua automático (Rev. 2137 inalterada). **R-001/R-007/R-010:** OK — sem ALTER/DROP/DELETE em prod (excluir já era soft-cancel + soft-delete via `signatures.adminDelete`).
- **Rev. 2145** — **Documentos institucionais FC (`buildFcDocument`) · margens padronizadas 2,5cm topo / 1,5cm laterais / 2,5cm rodapé + aproveitamento máximo da área útil do A4.** User (com PDF do Termo Responsabilidade renderizado): "ajustar as margens, quero 2,5cm no topo, 1,5cm nas laterais e 2,5cm na parte inferior... aproveitar ao máximo o papel". **Fix em `client/src/lib/fcDocumentTemplate.ts`:** `@page margin: 25mm 15mm 14mm 15mm` → `25mm 15mm 25mm 15mm` UNIFORME (removido `:first` override que comprimia topo em 14mm); tela `.fc-doc padding: 32px 1.5cm` → `2.5cm 1.5cm` (espelha exatamente o @page do PDF); print `.fc-doc padding: 8px 0` → `0` (zero padding interno, conteúdo aproveita 100% da área útil dentro do @page margin). Aplica-se a TODOS os 7 docs institucionais. **R-001/R-007/R-010:** OK — só client-side.

### Revisões recentes (one-liners)

- ~~Rev. 2144~~ — Termo de Responsabilidade · campo Quantidade agora permite apagar livremente (Input type=text inputMode=numeric, clamp movido pro onBlur). Fix UX da Rev. 2143. Ver `shared/changelog.ts`.
- ~~Rev. 2143~~ — Termo de Responsabilidade · novo campo "Quantidade" por item entregue (Input + coluna Qtd. na tabela HTML do termo FCSign, colspan fotos 3→4). Ver `shared/changelog.ts`.
- ~~Rev. 2142~~ — SECURITY/CONCORRÊNCIA · Hardening Templates Docs (Rev. 2141) pós code review: race condition em save/restoreVersion (db.transaction + pg_advisory_xact_lock + SELECT FOR UPDATE) + XSS no preview (DOMPurify.sanitize). Ver `shared/changelog.ts`.
- ~~Rev. 2141~~ — NOVA FEATURE · Aba "Templates de Documentos" em Configurações (Fase 1 fundação): 2 tabelas novas + 5 procedures + editor TipTap WYSIWYG + UI 3 colunas com versionamento Rev. 1/2/3 e restaurar. Ver `shared/changelog.ts`.
- ~~Rev. 2140~~ — Documentos institucionais FC (`buildFcDocument`) · margens laterais padronizadas em 1,5cm (15mm). Aplica-se a TODOS os 7 docs institucionais. Ver `shared/changelog.ts`.

### REGRA DE OURO — Cabeçalho de documentos institucionais FC (Rev. 2106+)

Todo documento oficial FC (contrato, aviso prévio, termo de rescisão, comunicado interno, carta MDO, advertência etc.) DEVE usar este cabeçalho HTML:

```
[logo centralizado ~88px — fallback ${window.location.origin}/logo-fc.jpg]
[RAZÃO SOCIAL caixa alta 16pt bold centralizado]
[CNPJ: xx.xxx.xxx/xxxx-xx — 9.5pt centralizado cinza]
[ENDEREÇO COMPLETO uppercase 9pt centralizado cinza claro]
[faixa azul #1B2A4A full-width, border branco 2px, padding 14px,
 TÍTULO DO DOC caixa alta 13pt letter-spacing 3px branco]
[Nº NNN/AAAA (esq) ───── Data de Emissão: DD/MM/AAAA (dir)]
```

Regras técnicas obrigatórias:
- **Inline styles** em TODOS elementos críticos (DOMPurify pode descartar `<style>` externo).
- `<style>` interno SEMPRE dentro do `<body>` (não no `<head>`).
- `print-color-adjust: exact` inline na faixa azul (cores de fundo no print).
- JAMAIS usar `onerror=`, `onload=` ou qualquer handler `on*` (filtro XSS do `signatures.create`).
- Logo SEMPRE com fallback `${window.location.origin}/logo-fc.jpg`.
- Corpo: `text-align:justify; hyphens:auto`, Times serif 11.5pt.
- Cláusulas com `border-left:3px solid #1B2A4A; padding-left:8px` no título.

> Revisões 2098 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
