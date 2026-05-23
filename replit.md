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

- **Rev. 2263** — **UX · Modal "Editar Revisão" adota layout moderno FC, espelhando "Nova Revisão do Cronograma".** Pedido user: "ajuste este layout conforme as regras de ouro... padrão moderno e fácil usabilidade". Screenshot mostrava modal Editar com header desbotado, Responsável editável (violando Rev. 2253) e botão Salvar `bg-blue-600` genérico — inconsistente com o modal-irmão Nova Revisão que já tinha faixa azul #1B2A4A + título uppercase letter-spacing 3px + Responsável readOnly do cadastro + botão azul institucional. Fix: reescrita do JSX em `PlanejamentoDetalhe.tsx` L12568-12627: (1) `DialogContent` com `p-0 overflow-hidden gap-0`, header faixa azul #1B2A4A + título "EDITAR REVISÃO REV. NN" caixa alta, corpo com `px-5 pb-5`; (2) campo Responsável vira readOnly `bg-slate-100` puxando `projetoResponsavel`; (3) botão Salvar com `backgroundColor: "#1B2A4A"`; (4) `editarMutation.mutate` envia `responsavel: projetoResponsavel ?? editForm.responsavel`; (5) placeholder do motivo mais útil. ZERO mudança funcional (mutation/validação intactas). **R-001/R-007/R-010:** N/A (100% UI client-side).
- **Rev. 2262** — **FIX/REGRA DE OURO · Card "Avanço Físico" do topo (Planejamento → Detalhe) espelha snapshot MSP da raiz UID=0 — ZERO cálculo no ERP quando o XML traz a foto.** Pedido user: "aplique a regra de ouro... sempre adote % PREVISTO do MSP e PercentComplete da tarefa-resumo, o ERP deve sempre ler do MSP". Regra já formalizada em User preferences desde Rev. 2260; esta revisão APLICA no card que ainda recomputava. Sintoma (VITRA, XML 4ª Semana): XML diz Previsto 4 % / Realizado 8 %; card mostrava 6,40 % / 6,12 %. Causa: `avancoAtual` (L659) SEMPRE fazia média ponderada Σ(folha×duração); `avancoPrevistoDia` (L739) SEMPRE caía em `pctRaizMSP(refStr,…)`. Snapshot `previstoMspSnapshot`/`realizadoMspSnapshot` em `calendarioJson` JÁ era persistido por `ImportarCronograma.tsx` (L260-334), mas as funções do card ignoravam. Fix: 2 IFs no topo de cada `useMemo` em `PlanejamentoDetalhe.tsx` — se `snapshot != null` + envelope intacto + (sem semana OU semana cobre statusDate) + `!refisComIndiretasGlobal` → **retorna snapshot direto**. Caem no cálculo dinâmico apenas: (a) snapshot ausente, (b) envelope alterado pós-import, (c) toggle Global c/ Indiretas, (d) navegação histórica fora do statusDate. **R-001/R-007/R-010:** N/A (100% client-side em 2 useMemo).

### Revisões recentes (one-liners)

- ~~Rev. 2261~~ — BACKFILL · Propaga leitura MSP da Rev. 2260 para todas as obras antigas, automaticamente no startup (idempotente). Ver `shared/changelog.ts`.
- ~~Rev. 2260~~ — FIX · Importador MS Project lê `% PREVISTO` por atividade via Texto6 (FieldID 188743746) como fallback de Texto10. Ver `shared/changelog.ts`.
- ~~Rev. 2259~~ — REFACTOR · SE (Solicitação de Equipamento de locação) migra do Almoxarifado para o módulo Compras. Ver `shared/changelog.ts`.
- ~~Rev. 2258~~ — FEATURE · Módulo Controle de Equipamentos Fase 1 Sprint 3 (5 páginas React em /equipamentos/*). Ver `shared/changelog.ts`.
- ~~Rev. 2257~~ — FEATURE · Módulo Controle de Equipamentos Fase 1 Sprint 2 (tRPC router 18 procedures + auto-seed CAPEX). Ver `shared/changelog.ts`.

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
- **Métricas de avanço de obra — fonte ÚNICA é o MS Project (XML LOTUS).** O ERP deve SEMPRE ler do XML do MSP pra garantir paridade absoluta com o que o engenheiro vê no Project. Convenção fixa (Rev. 2260+):
  - **PREVISTO** = campo `% PREVISTO` calculado pelo MSP na **tarefa-resumo** (UID=0). Lido em ordem de prioridade: Texto10 (FieldID 188743750, 4 casas) → Texto11 (188743997) → Texto6 (188743746, inteiro — usado pelo template LOTUS R05). Por atividade: mesma ordem (Texto10 → Texto6).
  - **REALIZADO** = `PercentComplete` da **tarefa-resumo** do projeto. Por atividade: Texto7 (188743747 — %Reali AUX) com fallback `ActualDuration / (ActualDuration + RemainingDuration)` (precisão MSP-nativa).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
