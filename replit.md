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


- **Rev. 2497** — **FOLHA + VALE · Aviso INDENIZADO excluído da repesca de desligados (fix do bug histórico que arrastou Elizeu pra folha/vale de maio após desligamento em março).** User: "mas o elizeu foi desligado em março, ele nao deveria aparecer na folha.... pq está aparecendo?" — feedback imediato pós Rev. 2496. Causa raiz: query de repesca de desligados (em `gerarVale` desde Rev. 1764 e em `simularPagamento` desde 2496) usava SÓ `tn.dataFim` como janela, mas pra aviso INDENIZADO o `dataFim` é só projeção legal (pra cálculo de 13º/férias proporcionais) — o funcionário sai em `dataInicio - 1` (véspera da comunicação). Convenção confirmada em `homeData.ts` L595-608. Fix em `server/routers/payrollEngine.ts`: `gerarVale` (L2114-2122) e `simularPagamento` (L2935-2951) ganharam `AND tn.tipo NOT LIKE '%indenizado%'` (mesmo padrão de homeData L599, pega `empregador_indenizado` + `empregado_indenizado`). Elizeu (indenizado, comunicado em março com dataFim≈14/mai) sai da folha+vale; Mariana e Myriélle (trabalhado, dataFim em maio) seguem aparecendo proporcionais. Sem schema change. Detalhe: `shared/changelog.ts`.
- **Rev. 2496** — **FOLHA · Desligados em aviso prévio passam a entrar na folha mensal cheia (espelha lógica do `gerarVale`), eliminando "vale órfão".** User (image_1779889692506+833192): "não está gerando folha pra quem está de aviso (mariana e myrielle)" + "elizeu foi desligado, não sei pq está considerando ele na folha de adiantamento". Aviso amarelo em Pagamento/Saldo (Mai/2026) listava 3 com vale calculado MAS fora da folha mensal (R$ 3.387 bruto, R$ 3.115 líq). Causa raiz: descompasso em `server/routers/payrollEngine.ts` — `gerarVale` (L2101) INCLUI desligados com `termination_notice.dataFim` no mês, mas `simularPagamento` (L2920) só pegava `status IN ('Ativo','Ferias')` → vale órfão. Após confirmação explícita do user (user_query opção A: "GERAR folha mensal cheia pra eles"), fix em L2884-2953: WHERE da query principal trocou pra `status IN ('Ativo','Ferias') OR (status='Desligado' AND EXISTS (termination_notices tn WHERE tn.dataFim>=primeiroDiaMes AND tn.dataInicio<=ultimoDiaMes AND status NOT IN ('cancelado')))` — mesma janela do gerarVale (single-source-of-truth). Implementação via subquery EXISTS (não JOIN/UNION) pra preservar o shape do select de ~25 colunas e evitar refatorar o pipeline de vt/va/banco/pix/pensão. Cálculo proporcional aos dias trabalhados "just works" pq o pipeline existente já lida com admissão/demissão via auto-processamento de timecard. Sem schema change. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2495** — TERCEIROS · Padronização: nomes SEMPRE em MAIÚSCULAS + lista SEMPRE em ordem alfabética por nome. Backend `terceiros.ts` create/update normaliza `.trim().toUpperCase()` + frontend input com `onChange` UPPERCASE + `<h3>` defensivo + `.sort()` localeCompare pt-BR. Ver `shared/changelog.ts`.
- **Rev. 2494** — TERCEIROS · BUGFIX `Atualizar` não salvava por falha silenciosa Zod (`null` em `string().optional()`) + ausência de `onError`. Schema relaxado pra `.nullish()` + `empresaTerceiraId` adicionado + handler limpa `undefined` antes do set + toast de erro. Ver `shared/changelog.ts`.
- **Rev. 2493** — TERCEIROS · Campo "Função" virou Combobox vinculado ao catálogo `jobFunctions` (saiu de texto livre). Novo `FuncaoCombobox.tsx` compartilhado entre Colaboradores e FuncionariosTerceiros. Ver `shared/changelog.ts`.
- **Rev. 2492** — EFETIVO DA OBRA (Planejamento) · Gráfico "Distribuição por Função" virou clicável — filtra Lista de Funcionários (cross-filter), pill removível, "Limpar" global zera 4 filtros. `PlanejamentoDetalhe.tsx` L11287/11340/11530. Ver `shared/changelog.ts`.
- **Rev. 2491** — EFETIVO DA OBRA · Redesign modal "Transferir em Lote" — header FC #1B2A4A, fluxo De→Para, chips, progresso real (bulkProgress), atalhos Esc/Ctrl+Enter, responsivo. `PlanejamentoDetalhe.tsx`. Ver `shared/changelog.ts`.

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
