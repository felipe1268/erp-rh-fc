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


- **Rev. 2576** — **PLANEJAMENTO · NOVA ABA "EFETIVO × IA" (Planejamento Detalhe, `/planejamento/:id`) · CRUZA O EFETIVO ATUAL DA OBRA COM O CRONOGRAMA E A IA DIAGNOSTICA O DIMENSIONAMENTO DA EQUIPE (CONTRATAR / REDUZIR / MANTER POR FUNÇÃO).** User (screenshots das telas de Efetivo e Cronograma): "Quero uma aba que cruza o efetivo com o cronograma e analisa via IA se o efetivo está compatível com as atividades... indicadores pra saber se podemos reduzir ou contratar." Não existia leitura cruzada. FIX (SOMENTE LEITURA): SERVER nova mutation `analisarEfetivo({projetoId,companyId})` (`server/routers/iaCronograma.ts`) — resolve projeto+obra, escolhe revisão (baseline>aprovada>última), agrega efetivo via `getObraFuncionarios` por função/categoria MO (`job_functions.categoria_mo`)/vínculo/status, lê atividades folha em andamento + próximas 8 semanas (56d) ordenadas por peso, monta prompt e chama `invokeLLM` (Claude→fallback Gemini, `response_format json_object`) pedindo JSON estruturado (diagnóstico, indicadores, recomendação por cargo c/ delta/ação, frentes críticas, riscos, recomendações); parse robusto; fallback retorna efetivo bruto + `erroIa` sem quebrar. CLIENT novo `client/src/pages/planejamento/AnaliseEfetivoIA.tsx` (CTA "Gerar análise", badge de diagnóstico, cards de indicadores, tabela por função atual×sugerido×Δ×ação, frentes críticas, riscos+recomendações). CLIENT `PlanejamentoDetalhe.tsx` registra a aba `efetivo-ia` (ícone Sparkles) e o render. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2575** — **RH & DP · BANCO DE HORAS (`/banco-horas`, aba "Saldos") · SELEÇÃO MÚLTIPLA DE FUNCIONÁRIOS + "DAR BAIXA NOS SELECIONADOS" (ZERA O SALDO EM LOTE).** User (screenshot da tela com 62 funcionários com saldo): "Quero múltipla seleção, e poder dar baixa em todos, pq todos estes foram pagos da última vez." Antes só existia o débito individual (botão "Debitar" por linha). FIX (não-destrutivo, só UPDATE/INSERT): SERVER nova mutation `debitarBancoLote({employeeIds[],companyId,descricao,data})` (`server/routers/horasExtras.ts`) que ZERA o saldo de cada selecionado gravando lançamento `tipo='debito'`; HARDENING (pós code review): cada item em `db.transaction` (UPDATE+INSERT atômicos), UPDATE `=0` com guard `>0` + saldo anterior via CTE/RETURNING (sem race read-subtract), `try/catch` por item isola falhas parciais; retorna `{processados,totalMinutos,ignorados,falhas}`. CLIENT (`client/src/pages/BancoHoras.tsx`) coluna de checkbox (+ "selecionar todos" sobre os filtrados), barra de ação com contagem/total, botão "Dar baixa nos selecionados" → Dialog de confirmação (data + motivo default "Pagamento de horas extras na folha", aviso de ignorados); `stopPropagation` no checkbox p/ não abrir histórico. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2574** — RH & DP · CONTROLE DE FÉRIAS (`/ferias`) · A TABELA PRINCIPAL "LISTA DE FÉRIAS" E OS CARDS DA ABA "FÉRIAS VENCIDAS" PASSAM A EXIBIR A FOTO DO CADASTRO DE CADA COLABORADOR. User: "Quero fotos de todos os colaboradores aqui tbm." Nem `avisoPrevio.ferias.list` nem `listarVencidas` (`server/routers/avisoPrevioFerias.ts`) projetavam a foto. FIX (não-destrutivo, só leitura/UI): SERVER ambas projetam `employeeFotoUrl`/`fotoUrl`; CLIENT (`Ferias.tsx`) importa `PersonPhoto`, coluna Colaborador renderiza `<PersonPhoto size="sm">` e cards de Vencidas `size="md"`. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2573** — RH & DP · PAINEL RH / HOME · PAINÉIS "FÉRIAS — PAINEL RÁPIDO", "FÉRIAS — PERÍODO AQUISITIVO" E "MOVIMENTAÇÕES (30 DIAS)" PASSAM A EXIBIR A OBRA DE CADA FUNCIONÁRIO. User: "mostrar a obra de cada pessoa nesses painéis." As listas em `home.getData` (`server/routers/homeData.ts`) — `feriasAlerta`, `feriasDashboard.agendadas`/`emAndamento`, `admissoes/demissoesRecentes` — não projetavam `obra` (mapas `homeEmpObraMap`/`obraMap` já em escopo). FIX (não-destrutivo): SERVER as 5 listas incluem `obra`; CLIENT (`PainelRH.tsx`+`Home.tsx`) cards e telas cheias renderizam `📍 {obra}` (azul) condicional. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2572** — GLOBAL · COMPONENTE `<PersonPhoto>` · LIGHTBOX (FOTO AMPLIADA) NÃO CORTA MAIS A CABEÇA/PÉS DA PESSOA NO iPad/SAFARI MOBILE. User: "Tá com bug quando clico para ampliar a foto." A lightbox de `<PersonPhoto>` (`client/src/components/PersonPhoto.tsx`) usava `vh` → no Safari mobile `100vh` = viewport máxima (sem barras), estourava a altura e clipava a foto retrato em cima/embaixo. FIX (SÓ CLIENT/CSS): `vh`→`dvh` (viewport dinâmica) — `<figure>` `max-h-[96dvh]` e `<img>` `maxHeight: calc(96dvh - 96px)`. Vale global. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2571** — RH & DP · CONTROLE DE ANIVERSÁRIOS · TELA CHEIA "ANIVERSARIANTES — <MÊS>" · SÓ MONITORAR FUNCIONÁRIOS ATIVOS. User: "Quem tá com status de desligado, lista negra.. não pode aparecer... só vamos monitorar quem está ATIVO." `home.getAniversariantesMes` (`server/routers/homeData.ts` ~L797) filtrava só `status !== "Desligado"` → deixava passar Lista Negra/Inativo etc.; cards da Home usam `status === "Ativo"` estrito → drift. FIX (não-destrutivo): `getAniversariantesMes` usa o MESMO check estrito (`status === "Ativo"`) + `listaNegra !== 1`. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2570** — RH & DP · HORA EXTRA · ANÁLISE DA SOLICITAÇÃO (`/solicitacao-he`, modal "Análise da Solicitação HE-NNNNN") · FUNCIONÁRIO DE CARGO DE CONFIANÇA NÃO GERA VALOR DE HORA EXTRA A PAGAR (CLT art. 62, II). User: "se for cargo de confiança não tem valor a ser pago de hora extra." `heSolicitacoes.getById` não projetava `cargo_confianca`/`cargo_confianca_inciso` e a Análise calculava HE p/ todos. FIX (não-destrutivo): SERVER `getById` projeta os 2 campos; CLIENT (`SolicitacaoHE.tsx`) helper `isCargoConfianca(f)`; reduces de custo pulam confiança; linha vira selo `colSpan={3}` "Isento de hora extra (CLT art. 62)" + badge; resumo nota "N cargo de confiança". Motor de folha intocado. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.


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
- **REGRA DE OURO — CAMINHO B (Rev. 2533+, substitui Rev. 2427).** FONTE ÚNICA = coluna `PercentComplete` do MS Project, lida nos dois momentos:
  - **% PREVISTO** (raiz e atividades) = EXPANSÃO de `PercentComplete` sobre `BaselineStart`/`BaselineFinish` pela fórmula nativa do MSP `floor(((cutoff − BL_Start) / (BL_Finish − BL_Start)) * 100)`, gerada uma vez no `salvarAtividades` (cadastro do cronograma) e congelada em `planejamento_projetos.previsto_semanas_json`. Matematicamente idêntico a varrer "Data do Status" no MSP semana a semana (Caminho A) — mesma fórmula, mesmo resultado, sem o trabalho repetido.
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **Mesma coluna nos dois momentos** = paridade matemática absoluta MSP × ERP. Sem `Texto6`/`Texto10`/`Texto11` (continuam sendo gravados em `previsto_msp_pct` por atividade só pra retrocompat — leitura desativada).
  - Snapshot é regenerado SÓ no `salvarAtividades` (substituir/cadastro). Mudou baseline = nova revisão = novo snapshot. Avanço semanal NÃO regenera (baseline é imutável dentro da revisão).
  - Implementação: `server/routers/planejamento.ts` (helper `regenerarPrevistoSemanasCaminhoB` L96-203 + chamada pós-transaction em `salvarAtividades`), `client/src/pages/planejamento/ImportarCronograma.tsx` (parser `<Baseline Number=0>` L470-490).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
