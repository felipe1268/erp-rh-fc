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


- **Rev. 2484** — **EFETIVO DA OBRA (Planejamento, `EfetivoObraView` em `PlanejamentoDetalhe.tsx`) · seleção múltipla + transferência EM LOTE entre obras.** User (IMG_1295): "Preciso poder selecionar os funcionários em múltipla seleção e ter opção de transferir para outra obra". Antes (Rev. 2480) só tinha botão individual por linha. Adicionado: (a) checkbox por linha + select-all no header (filtra Terceiros — não suportados pelo `allocateEmployee`); (b) barra de ações que aparece quando `selectedIds.size>0` com botão "Transferir" + "Limpar"; (c) modal em lote com preview dos nomes selecionados (ordem alfabética pt-BR), select de obra destino, textarea motivo, aviso âmbar "execução sequencial — falha parcial não reverte"; (d) handler `handleBulkTransfer` itera `obras.allocateEmployee.mutateAsync` (zero endpoint novo — reusa authz por funcionário, fecha alocação anterior automaticamente), coleta ok/fails, invalida queries UMA vez ao final, toast resumo. `colSpan` 11→12 nas linhas full-width. Detalhe: `shared/changelog.ts`.
- **Rev. 2483** — **ORDENS DE COMPRA · BUG de numeração duplicada (ex: `OC-2026-218` vs `OC-2026-0218`) corrigido.** User (IMG_1779817698104): print mostrando OC com 3 dígitos coexistindo com OC de 4 dígitos. Causa: 4 geradores inconsistentes — `purchaseRouter.gerarNumeroOC` usava `padStart(3)`, `compras.gerarProximoNumeroOC` usava `padStart(4)` sobre o MESMO `ocNumberConfig.proximoNumero`; mais 3 spots (`criarOrdemManual` L7880, `confirmarRascunhoOrdem` L8113, `salvarRascunhoOrdem` L8038) usavam `COUNT(*)+1` racy bypassando o contador. Fix: (a) `gerarProximoNumeroOC` virou `export` = fonte única; (b) bootstrap do `proximoNumero` passou de `COUNT(*)` pra `MAX(seq parsed do numeroOc)+1` (ignora rascunhos e exclusões); (c) `purchaseRouter.gerarNumeroOC` virou thin-wrapper que delega; (d) `criarOrdemManual` + `confirmarRascunhoOrdem` chamam `gerarProximoNumeroOC`; (e) RASCUNHO virou `RASCUNHO-${year}-${timestamp36}${rand36}` (não-sequencial, não queima número). Sempre 4 dígitos agora. Detalhe: `shared/changelog.ts`. Follow-ups (próxima rev): inspecionar/renumerar OCs duplicadas existentes + CREATE UNIQUE INDEX CONCURRENTLY.

### Revisões recentes (one-liners)

- **Rev. 2482** — EQUIPE DA OBRA (modal `ObraEfetivo.tsx`) · funcionários ordenados alfabeticamente (`localeCompare pt-BR`) dentro de cada grupo de status. Ver `shared/changelog.ts`.
- **Rev. 2481** — EQUIPE DA OBRA (modal `ObraEfetivo.tsx`) · coluna FUNÇÃO mostra cargo do CADASTRO, não o override `funcaoNaObra`. Inverter prioridade em 5 spots: `f.employee?.cargo || f.employee?.funcao || f.funcaoNaObra`. Ver `shared/changelog.ts`.
- **Rev. 2480** — EFETIVO DA OBRA (Planejamento) · botão Transferir + Remover por linha em `EfetivoObraView`. Authz por escopo nas 2 mutations via `getEffectiveAllowedObraIds`. Ver `shared/changelog.ts`.
- **Rev. 2479** — EFETIVO/EQUIPE DA OBRA · foto real + badge CIPA nas 2 telas drill-down por obra. Backend enrich CIPA em `getObraFuncionarios` + `getEquipeObra`. Ver `shared/changelog.ts`.
- **Rev. 2478** — CIPA · badge ATIVO (verde) / ESTABILIDADE (âmbar) em 23 spots (Painel RH + Controle Documentos). Helper `server/_core/cipaStatus.ts` + componente `CipaBadge.tsx`. Ver `shared/changelog.ts`.

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
- **REGRA DE OURO — Leitura do XML do MS Project (Rev. 2427+, vale pra TODAS as obras).** Fonte ÚNICA pra cronograma e avanços semanais. Validada com paridade 100% no XML HOTEL DO PAPA (BL 25/05/2026). Conventions canônicas:
  - **% PREVISTO** (raiz e atividades) = `Texto6` (FieldID 188743746) puro do XML. O MSP calcula via fórmula `Int(((StatusDate − BL_Start)/(BL_Finish − BL_Start))*100)` sobre as datas da BASELINE — não precisa ler `<Baseline>` separado. Fallback compatível: Texto10 (188743750) → Texto11 (188743997).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` nativo do MSP. ZERO heurística (Texto7, AD/(AD+RD), Texto9, Texto12, PhysicalPercentComplete ficaram fora — não são a coluna que o engenheiro vê na tela).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
  - Implementação: `client/src/pages/planejamento/ImportarCronograma.tsx` (bloco "REGRA DE OURO" L257-281).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
