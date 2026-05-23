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

- **Rev. 2313** — **UX · Substitui os 2 botões de locação por 1 único "IMPORTAR PDF (IA)" no Almoxarifado; receber fica só na tela Locados.** Pedido user (23/05/2026, após Rev. 2312): "Só deixe o botão de importação o receber só vai ficar na outra tela". Print mostra a tela Equipamentos Locados com 2 botões no hero (Importar PDF (IA) + Receber locação) — o user concluiu que receber/devolver já estão acessíveis na própria tela Locados (botões e cards) e quer apenas 1 atalho de produtividade no Almoxarifado: o de importação em lote via PDF (Rev. 2308). **Implementação**: (1) `index.tsx`: removidos os botões RECEBER LOCAÇÃO e DEVOLVER LOCAÇÃO criados na Rev. 2312; import trocado de `Truck` → `FileUp`; grid voltou pra `grid-cols-3 gap-3 sm:grid-cols-6` (6 cards: 5 originais + 1 novo). Adicionado **IMPORTAR PDF (IA)** com gradient indigo→purple→fuchsia (mesma paleta da Rev. 2310) navegando pra `/equipamentos/locados?action=importar`. (2) `Locados.tsx`: useEffect ganha branch `action === "importar"` que reseta `importArquivo`/`importPreview` e dispara `setModalImport(true)` — abre direto o modal de seleção de PDF. Branches `receber` e `devolver` preservados (continuam funcionando se alguém colar URL antigo, mas não há mais entry-point UI pra eles). **0 lógica nova** — só re-arranjo de UI.
- **Rev. 2312** — **UX · Botões dedicados "RECEBER LOCAÇÃO" e "DEVOLVER LOCAÇÃO" na barra de ações rápidas do Almoxarifado.** Pedido user (23/05/2026, após Rev. 2311): "Acho melhor refazer o que pedi, quero um botão separado para receber outro para devolver equipamento locado. Somente por estes dois botões". Rev. 2311 colocou os atalhos DENTRO do modal Receber Material (Foto NF / Via OC / Manual + atalhos), mas o user quer eles no MESMO NÍVEL dos botões ENTRADA / SAÍDA / FERRAMENTAS / TRANSFERIR / FECHAR DIA (header da Visão Geral). **Implementação**: (1) revertido o divider+grid dentro do `SmartEntry.tsx` (removido import `useLocation`, removido bloco "Locação de equipamentos"); (2) `index.tsx` ganha 2 botões novos no grid de ações rápidas — RECEBER LOCAÇÃO (teal) e DEVOLVER LOCAÇÃO (amber) — navegando via `setLocation("/equipamentos/locados?action=receber|devolver")`. `useEffect` em `Locados.tsx` (criado na Rev. 2311) detecta o param. **NOTA**: revertida na Rev. 2313 — os 2 botões foram removidos e substituídos por 1 único "IMPORTAR PDF (IA)". O `useEffect` em `Locados.tsx` foi preservado e ganhou branch `action=importar`. **R-001/R-007/R-010:** N/A.
### Revisões recentes (one-liners)

- ~~Rev. 2311~~ — UX · Atalho "Receber/Devolver locação" dentro do modal Receber Material (revertido na Rev. 2312 → 2313). Ver `shared/changelog.ts`.
- ~~Rev. 2310~~ — UX · Barra de progresso 0→100% animada (ease-out) no modal de importação PDF (Gemini) de contratos de locação. Ver `shared/changelog.ts`.
- ~~Rev. 2309~~ — UX · Redesign moderno tela Equipamentos Locados (hero gradient + KPIs + pills + lista em cards) + modal Receber em 5 seções coloridas. Ver `shared/changelog.ts`.
- ~~Rev. 2308~~ — FEAT · Importação em lote de contratos de locação via PDF (Gemini Vision); SyncSchema+ aditivo. Ver `shared/changelog.ts`.
- ~~Rev. 2307~~ — UX · Pills de filtro por TIPO (Material/MDO/MAT+MDO/Equipamento) na tela Ordens de Compra, com cross-filter de contadores. Ver `shared/changelog.ts`.

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
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
