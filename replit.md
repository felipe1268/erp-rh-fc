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

- **Rev. 2291** — **HOTFIX/DX · Erro real do Postgres agora exposto no toast + server log ao criar SC.** Pedido user (23/05/2026): "Erro ao criar SC: Failed query: insert into compras_solicitacoes…" — toast cortava na query e não mostrava QUAL constraint/coluna violou. Causa-raiz: o catch de `criarSolicitacao` (compras.ts L2746+, Rev. 1799/R-014) montava `friendly = e?.message`, mas Drizzle embrulha o erro PG em `e.cause` e `e.message` perde o motivo real ("violates not-null", "invalid input syntax", "duplicate key"). Fix: extrai `causeMsg = e.cause.message` + `pgMsg = e.cause.hint`, `friendly = [causeMsg, detail, pgMsg].filter(Boolean).join(" · ")` antes do fallback. `console.error` extra inclui `tipoSC`, `isLocacao`, `locacaoDuracaoDias` e datas de início/fim pra facilitar reprodução. Stack 8 linhas (era 5). Sem schema, sem fluxo, só observabilidade. **R-001/R-007/R-010:** N/A (server-only).
- **Rev. 2290** — **FEAT · Locação de Equipamento na SC (engenheiro indica o aluguel + período já na Solicitação).** Pedido user (23/05/2026, IMG_1079/IMG_1080): "A locação deve ser feita na solicitação, pq o engenheiro deve preencher o equipamento e o tempo de uso, para que o suprimentos faça a cotação correta". O toggle `isLocacao` só existia na OC — tarde demais. Mudanças: (1) **Schema** — `compras_solicitacoes` ganha `is_locacao`, `locacao_duracao_dias`, `locacao_data_inicio_prevista`, `locacao_data_fim_prevista` (aditivo, nullable). (2) **Router** `criarSolicitacao` + `editarSolicitacao` aceitam os campos (só persistem se `tipo === "equipamento"`). `criarOrdemDeCotacao` lê SC origem e herda os campos para `compras_ordens` (`isLocacao`, datas, duração). SmartEntry no Almoxarifado já transferia para `almoxarifado_itens` (`origem='alugado'` + datas) → `AlertasAlmoxarifado` notifica vencimento via `getItensLocadosVencendo`. (3) **Frontend** `Solicitacoes.tsx` — bloco amarelo condicional quando tipo=Equipamento c/ checkbox "É Locação" + 3 campos (Início, Duração, Fim) com auto-cálculo bidirecional. Submit criar+editar, loadDetalhe ao editar, badge **EQUIP·LOC** nas listas. Fluxo end-to-end 100% via Compras + Almoxarifado, sem módulo Equipamentos. **R-001/R-007/R-010:** Migration aditiva (4 colunas nullable, sem DROP/ALTER). Aplicada em DEV via `pnpm db:push`. PROD precisa rodar a mesma migration.
### Revisões recentes (one-liners)

- ~~Rev. 2289~~ — FEAT/UX · Filtro por VÍNCULO (CLT/PJ/TERCEIRO) na tela Efetivo da Obra. Ver `shared/changelog.ts`.
- ~~Rev. 2288~~ — HOTFIX · ReferenceError fotoZoom (Efetivo da Obra) — state movido de EfetivoObraTab pra EfetivoObraView. Ver `shared/changelog.ts`.
- ~~Rev. 2287~~ — FEAT/UX · Foto do funcionário clicável (lightbox) na aba Efetivo da Obra. Ver `shared/changelog.ts`.
- ~~Rev. 2286~~ — FEAT/UX · Histórico REFIS com seleção múltipla + exclusão em lote (admin-only). Ver `shared/changelog.ts`.
- ~~Rev. 2285~~ — FIX · TODA aba REFIS lê `realOficialRefis` (snapshot MSP raiz UID=0) — eliminadas últimas 3 ocorrências de `avancoRealAtual`. Ver `shared/changelog.ts`.

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
