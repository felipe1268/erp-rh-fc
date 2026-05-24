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

- **Rev. 2388** — **SEGURANÇA · Controle rígido de auditoria no Almoxarifado: excluir item/unidade + alterar quantidade manualmente exigem senha (se user local) + justificativa obrigatória; log com snapshot antes/depois; admin valida/rejeita pendências.** Pedido user: 3 ações sensíveis rodavam sem nenhum gate. Agora abrem um modal único exigindo justificativa (min 10 chars) sempre, e senha de login se `users.password` truthy (OAuth dispensado). **Schema** (`drizzle/schema.ts` L8829): nova tabela `almoxarifado_auditoria` (id, companyId, obraId, userId, userNome, acao, entidadeTipo/Id/Nome, dadosAntes/Depois jsonb, justificativa, ip, statusValidacao, validadoPor*). Bootstrap CREATE TABLE IF NOT EXISTS em `server/db.ts > getDb()` — evita migrate em prod. **Backend** (`server/routers/compras.ts`): helpers `verificarSenhaSeLocal` (bcryptjs.compareSync) + `getClientIp`; `excluirItem`, `excluirUnidade`, `atualizarItem` (gated quando qtd muda, tolerância 1e-3) gravam log; 3 endpoints novos `auditoriaListar` / `auditoriaPendenciasCount` (só admin/admin_master) / `auditoriaValidar`. `auth.me` em `server/routers.ts` agora retorna `hasLocalPassword: !!password`. **Frontend**: novo `ModalConfirmacaoAuditoria.tsx` (header red→rose + Trash2 + textarea justif com contador + input senha condicional + badge "Operação auditada"); `almoxarifado/index.tsx` wire em 3 fluxos (`handleExcluirItem`, botão excluir unidade ~L3293, `salvarItem` quando qtd diverge do `itemOriginal`); botão "Auditoria" no header (só admin) com badge de pendências (poll 30s); modal viewer com tabs Pendentes/Validados/Rejeitados/Todos + ações Aprovar/Rejeitar inline. R-001/R-007/R-010 OK.
- **Rev. 2387** — **UX · Substituídos os 2 `window.confirm()` nativos que sobravam no Almoxarifado por modais customizados (header red→rose + Trash2).** Pedido user (IMG_1188, 24/05/2026): print do iPad mostrava o confirm nativo do Safari com a URL ".picard.replit.dev diz" ocupando 3 linhas no título e oferecendo "Bloquear caixas de diálogo" (quebra UX). **Frontend** (`client/src/pages/almoxarifado/index.tsx`): removidos `confirm()` em `handleExcluirItem` (~L808) + `window.confirm` do botão excluir-unidade (~L3252). Adicionados states `confirmExcluirItem` (`{ nome, ids[] }` cobrindo sub-itens agregados) e `confirmExcluirUnidade` (`{ id, sigla }`). Modais red→rose com Trash2, descrição clara do impacto, mesmo padrão visual dos modais sky/violet das Rev. 2378-2381. UI-only. (Substituídos pela Rev. 2388 que injeta auditoria nesses mesmos pontos.)

### Revisões recentes (one-liners)

- **Rev. 2386** — FEATURE · IA sugere categorias para itens "Sem categoria" no Almoxarifado (em lote, com modal de revisão); vocabulário fechado (`almoxarifado_categorias`); apply POR IDS via `atualizarCategoriaEmLote`. Ver `shared/changelog.ts`.
- **Rev. 2385** — UX · Filtro "⚠️ Sem categoria" no dropdown de categorias do Almoxarifado (view por obra E consolidado). `<option value="__sem__">` + filtro em `lista`/`consFinal`. Ver `shared/changelog.ts`.
- **Rev. 2384** — FIX/UX · Badges "X pra receber" do ENTRADA e RECEBER LOCAÇÃO contam só OCs da obra em contexto (ou das obras permitidas); `obraId` opcional + `getEffectiveAllowedObraIds` + FORBIDDEN se fora do allowed (IDOR). Ver `shared/changelog.ts`.
- **Rev. 2383** — FEATURE · Multi-seleção também no view "Todos almoxarifados": Alterar categoria em lote (`atualizarCategoriaPorNomeEmLote` com `lower(nome) IN (...)`) + Próprio/Alugado no consolidado. Ver `shared/changelog.ts`.
- **Rev. 2382** — FEATURE · Multi-seleção de itens no Almoxarifado (por obra): alterar categoria em lote + unificar duplicatas (mesma obra/nome/unidade) somando quantidades no item de MAIOR qtd, migrando movimentações + recebimentos. Transação. Ver `shared/changelog.ts`.

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

> Revisões anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
- **Métricas de avanço de obra — fonte ÚNICA é o MS Project (XML LOTUS).** O ERP deve SEMPRE ler do XML do MSP pra garantir paridade absoluta com o que o engenheiro vê no Project. Convenção fixa (Rev. 2260+):
  - **PREVISTO** = campo `% PREVISTO` calculado pelo MSP na **tarefa-resumo** (UID=0). Lido em ordem de prioridade: Texto10 (FieldID 188743750, 4 casas) → Texto11 (188743997) → Texto6 (188743746, inteiro — usado pelo template LOTUS R05). Por atividade: mesma ordem (Texto10 → Texto6).
  - **REALIZADO** = `PercentComplete` da **tarefa-resumo** do projeto. Por atividade: Texto7 (188743747 — %Reali AUX) com fallback `ActualDuration / (ActualDuration + RemainingDuration)` (precisão MSP-nativa).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
