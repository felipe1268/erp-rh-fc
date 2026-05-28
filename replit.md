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


- **Rev. 2505** — **AVALIAÇÃO INTELIGENTE DE FUNCIONÁRIOS · FASE 2 — 2 NOVOS PILARES (Capacitação + Lealdade) elevando o score de 4 → 6 dimensões.** User: "Quero mais indicadores, para fazer uma análise mais detalhada" + via `user_query` escolheu "Novos pilares de score" + "Me surpreenda". Adicionados (a) **Capacitação** (tabela `trainings`): val/vencidos/recentes — mede reciclagem NR-35, NR-10 etc.; (b) **Lealdade** (employees.dataAdmissao): tempo de casa em meses, **piso 60** (LGPD: nunca pune adaptação/idade). Pilares descartados: Produtividade (sem meta consolidada), EPI/funcionário (sem tabela entrega individual), Atestados detalhados (já em Saúde). Backend `server/utils/employeeScore.ts`: novos types `CapacitacaoInputs`/`LealdadeInputs`, `scoreCapacitacao` (base 70 + 6 por válido + 3 por recente − 12 por vencido), `scoreLealdade` (tabela escalonada <6m=60 → 10a+=100), `SubScores`/`PesosScore` expandidos pra 6 campos, `PESOS_DEFAULT` rebalanceado (4 core 20% + 2 complementares 10%, total 100%), `gerarObservacoes` recebe `cap?`/`leal?` opcionais. Backend `server/routers/avaliacaoFuncionarios.ts`: bloco "6) Capacitação" — UMA query agregada em trainings com 3 CASE WHEN; bloco "7) Lealdade" — derivado da `dataAdmissao` já carregada, sem query extra. Frontend `DashAvaliacaoFuncionarios.tsx`: header declara "6 pilares"; KPIs reorganizados em 2 linhas (linha 1 = total + ScoreCircle 72px hero; linha 2 = grid 6 colunas via novo `KpiPilarCard`); tabela Ranking ganhou colunas "Capac." e "Leald."; drill virou grid 6 sub-cards (cores novas `amber`/`indigo` no `SUBSCORE_COLOR_MAP`); "Dados Brutos" ganhou linhas Capacitação e Lealdade (com formatação anos/meses + data admissão). Ícones novos: `GraduationCap`/`History`. Zero ALTER/DROP/DELETE — só SELECT em `trainings`. Detalhe: `shared/changelog.ts`.
- **Rev. 2504** — **DASHBOARD PERFIL POR TEMPO DE CASA · BUGFIX "Erro na análise IA" (JSON do Claude vinha envolto em fence markdown ```json ... ```).** User (iPad): "Tá com erro a tela" + screenshot do dashboard com toast vermelho. Causa raiz: `invokeAnthropic` em `server/_core/llm.ts` IGNORA o param `response_format` (Anthropic não tem JSON mode nativo, só `invokeGemini` consome), então o Claude responde em texto livre e frequentemente envolve a resposta em fence markdown. `getAnaliseIAPerfil` em `server/routers/dashboards.ts` L3553 fazia `JSON.parse(content)` cru → `SyntaxError: Unexpected token '`'` (confirmado nos logs de prod). Catch silenciosamente retornava `{ analise: null }` → mutation parecia ter sucesso mas UI ficava vazia. O "Load failed" do toast veio de uma tentativa anterior com timeout de proxy (caso isolado). Fix: (1) Novo helper `parseLLMJson(raw)` em dashboards.ts L3567-3590 que remove fence markdown via regex e, fallback, extrai `{...}` ou `[...]` do texto. (2) `getAnaliseIAPerfil` chama `parseLLMJson` em vez de `JSON.parse`. (3) Catch agora **re-throw** em vez de engolir o erro — frontend `DashPerfilTempoCasa.tsx` L76-78 já tem `onError` com toast, agora mostra mensagem real. Scope cirúrgico: outros callers de Claude (`iaCronograma.ts`, `oraculo.ts` etc) podem ter o mesmo bug latente — próxima rev pode promover `parseLLMJson` pra utilitário em `_core/llm.ts`. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2503** — PLANEJAMENTO · BUGFIX aba "Efetivo" invisível para grupos custom (Engenheiro de Campo etc) — página `efetivo` faltava em `modulePages.planejamento.pages`. Adicionada com actions view/create/edit/delete + rota `/planejamento?tab=efetivo`. Admin precisa marcar permissão no UI pós-deploy. Ver `shared/changelog.ts`.
- **Rev. 2502** — COLABORADORES · Campo "Tipo de Remuneração" (Mensalista/Horista) na aba Profissional + CLÁUSULA 2ª do Contrato de Experiência adaptada ao regime. Backend já tinha `employees.tipoRemuneracao`; faltava `<Select>` no form (`Colaboradores.tsx` L1855-1870), IIFE condicional na cláusula (L2072-2083) e whitelist `validFields` em `server/db.ts` L686. Ver `shared/changelog.ts`.
- **Rev. 2501** — COTAÇÕES · BUGFIX "Selecionar do Estoque" não finalizava cotação por falta de fallback de vencedor. Novo nível `estoqueParticipante = participantes.find(p => p.isEstoque)` em `Cotacoes.tsx` L2735-2740 (`vencSelecionado ?? fallback ?? estoqueParticipante`). Ver `shared/changelog.ts`.
- **Rev. 2500** — CONTRATO DE EXPERIÊNCIA · BUGFIX off-by-one no cálculo das datas fim1/fim2 (CLT: dia do início conta como dia 1). Fix `+ dias - 1` em `homeData.ts` L538-541 e `Colaboradores.tsx` L1875-1876/L1900-1901. Ver `shared/changelog.ts`.
- **Rev. 2499** — AVISO PRÉVIO · UX · Botão do modal mostra "Salvar Alterações" no modo edição (em vez de sempre "Criar Aviso Prévio") + disabled/loading respeita `updateAviso.isPending`. `AvisoPrevio.tsx` L3215-3221. Ver `shared/changelog.ts`.

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
