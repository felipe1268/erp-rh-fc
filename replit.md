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

- **Rev. 2834** — **TERCEIROS · MENU REORGANIZADO EM TORNO DE EMPRESA → CONTRATOS (DE 7 SEÇÕES PARA 3) + SEPARAÇÃO CLARA EMPRESAS DE SERVIÇO × PRESTADORES PJ.** Pedido (usuário): "O menu de Terceiros está muito confuso. Temos dois grupos — PJ que fornecem mão de obra, e contratos de serviço que fornecem material e mão de obra; uma empresa pode ter vários contratos." Validado: (1) dois menus SEPARADOS — Empresas de Serviço × Prestadores PJ; (2) avaliação dada pelo gestor do contrato (próxima revisão); (3) reduzir 7→3 seções sem apagar nada. CONTEXTO DE DADOS: "Empresas de Serviço" = `empresas_terceiras` (contratos em `terceiro_contratos`); "Prestadores PJ" = indivíduos em `employees` com `pj_contracts` — entidades distintas. O QUE FOI FEITO (SÓ frontend; ZERO backend/schema/rota nova): `DashboardLayout.tsx` (`menuSectionsTerceiros`) — 7 seções/18 itens reagrupadas em 3 ("Empresas & Contratos", "Conformidade & Pessoas", "Ferramentas"), TODOS os 18 itens preservados; renomeações "Empresas Terceiras"→"Empresas de Serviço" e "Contratos PJ"→"Prestadores PJ"; `EmpresasTerceiras.tsx` cabeçalho/subtítulo alinhados. RESSALVA: `savedMenuConfig` (por usuário) sobrescreve o default; quem tem menu custom mantém o salvo (pode resetar no Painel de Controle). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2833** — **FINANCEIRO · DRE — O DEMONSTRATIVO PASSA A FUNCIONAR (NÚMEROS REAIS DOS LANÇAMENTOS) + MENSAL/TRIMESTRAL/ANUAL.** Pedido (usuário, com print do iPad): "E já temos dados para fazer o DRE funcionar" — a tela só mostrava "Selecione um período…", nunca renderizava números. CAUSA-RAIZ: incompatibilidade TOTAL de shape — `FinanceiroDRE.tsx` lê um objeto CHATO CPC (`receitaBruta`/`deducoes`/`custosObra`/`lucroBruto`/`ebitda`/`lair`/`impostos`/`lucroLiquido`/margens), mas `calcularDRE` devolvia `receitas[]`/`despesas[]`/`totalReceita` — nenhum campo lido pela UI existia. Além disso `getDRE` ignorava `tipoPeriodo` e o seletor não resetava o período ao trocar Mensal↔Anual. O QUE FOI FEITO: (1) `calcularDRE(companyId, periodo, tipoPeriodo)` REESCRITO (`server/services/financialKpiService.ts`) p/ devolver o shape CHATO CPC via UMA query agregada em `financial_entries` (status!=cancelado, tipo!=transferencia): Receita Bruta=receitas (exceto financeiras); Custos Obra=despesas origem obra (cronograma_atividade/compras/compra_oc/almoxarifado_saida); Despesas Fixas=`natureza='fixo'`, Variáveis=bucket RESIDUAL (variavel/nula/inesperada, p/ não dropar lançamentos sem natureza); Financeiras por origem/conta (juros/tarifa/IOF); Impostos=`guia_tributaria`+`financial_tax_obligations`; NOVO `dreRange` (mensal/trimestral/anual). (2) `getDRE` aceita `tipoPeriodo` e repassa. (3) Front reseta `periodo` ao trocar o tipo. Validado direto no Neon (company 60002, 2026-06/2026/Q2). RESSALVA: DRE GERENCIAL dos lançamentos; "Deduções"=0 e Financeiras dependem de origem/conta marcada. ZERO ALTER/DROP/DELETE; ZERO schema. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2832** — FINANCEIRO · DRE — MESES NO PADRÃO BRASILEIRO (NOME DO MÊS) NO SELETOR DE PERÍODO E NO TÍTULO. O seletor listava meses no formato ISO `AAAA-MM`, pouco legível. FIX (`FinanceiroDRE.tsx`, só frontend): array `MESES_PT` + helper `fmtPeriodo(p)` converte `AAAA-MM`→`Mês/AAAA` (ex.: "Junho/2026") e mantém `AAAA` puro no anual; `<SelectItem>` exibe o label formatado preservando o `value` ISO; título "DRE — …" também formatado. ZERO ALTER/DROP/DELETE; ZERO backend. Detalhe: `shared/changelog.ts`.

- **Rev. 2831** — TERCEIROS · CONTRATOS — NATUREZA DO CONTRATO EDITÁVEL NO DETALHE (DESTRAVA A ABA FD EM CONTRATOS EXISTENTES). A aba "FD" só aparece quando o contrato INCLUI material OU já tem FDs; contratos criados ANTES da Rev. 2830 eram "Mão de Obra" e não havia tela de edição p/ trocar a natureza. FIX (`ContratoDetalhe.tsx`, só frontend; reusa `terceiroContratos.atualizarContrato`): BADGE de natureza no cabeçalho virou CLICÁVEL (lápis) → `<Select>` inline com as 3 opções; escolher "Material"/"MDO + Material" faz a aba FD aparecer na hora + habilita o desconto. ZERO ALTER/DROP/DELETE; ZERO backend. Detalhe: `shared/changelog.ts`.

- **Rev. 2830** — TERCEIROS — UM CONTRATO COBRE MDO + MATERIAL; MATERIAL VIRA FD E É DESCONTADO + RAIO-X 360° DA EMPRESA TERCEIRA. Coluna `natureza_contrato` (`mao_de_obra`|`material`|`mao_de_obra_material`) em `terceiro_contratos` (self-heal `[SyncSchema+] Rev. 2830`, mapa `shared/terceiroNatureza.ts`); helper `_fdMaterialDoContrato` deriva FD de material das OCs (por `contrato_id` ou heurística obra+fornecedor só p/ OCs sem contrato) e DESCONTA do valor (aba "FD" com STATUS; resumo Valor Fechado → − Material em FD → Líquido MDO → Pago); endpoint `terceiros.empresas.raioX(id)` + página `TerceiroRaioX.tsx` (6 abas: Visão Geral/Contratos/Faturamento[medição bruto−retenções=líquido]/Funcionários/Documentos/Movimentações) + rota `/terceiros/empresas/:id`. ANTI-DUPLA-CONTAGEM: FD unbound da obra alocado a 1 único contrato. ZERO ALTER/DROP/DELETE (coluna só via ADD COLUMN IF NOT EXISTS). Detalhe: `shared/changelog.ts`.

- **Rev. 2829** — TERCEIROS · CONTRATOS — NOVO LAYOUT DO TOPO DA TELA DE DETALHE DO CONTRATO (ESCOPO ENXUTO + INFO CLARA). O `<h1>` renderizava o `contrato.descricao` INTEIRO em `text-xl font-bold` → parede de texto. FIX (`ContratoDetalhe.tsx`, só frontend): `<h1>` da descrição removido; cabeçalho prioriza nº+status+pendências + EMPRESA (Building2) + obra (MapPin); NOVO card "Objeto do Contrato" com `line-clamp-2` + "Ver mais"/"Ver menos" (>130 chars); `min-w-0`/`flex-wrap` p/ tablet. ZERO ALTER/DROP/DELETE; ZERO backend. Detalhe: `shared/changelog.ts`.

- **Rev. 2828** — TERCEIROS · FCSIGN — OPÇÃO DE COPIAR O LINK DE ASSINATURA P/ ENVIAR AO TERCEIRO (WHATSAPP). NOVO botão "Copiar link" por signatário no card do envelope (`IntegraSignDashboard.tsx`, só UI) — copia `${origin}/integrasign/assinar/${sig.token}` via `navigator.clipboard` + toast "Copiado". GATING: só com `sig.token`, signatário não assinado/recusado e envelope enviado/em_andamento. O token já existia; faltava copiá-lo na UI. PARTE 1 da padronização de assinatura. ZERO ALTER/DROP/DELETE; ZERO backend. Detalhe: `shared/changelog.ts`.

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
- **REGRA DE OURO — CAMINHO B (Rev. 2646+, substitui Rev. 2644/2617/2533/2603).** O "% PREVISTO" é a réplica da coluna **"% PREVISTO" (Texto10) do MS Project** — "verdade absoluta". O "% CONCLUÍDA" segue a coluna `PercentComplete`. As duas régua são alinhadas às fórmulas do MSP:
  - **% PREVISTO — FÓRMULA-FONTE (Texto10):** a coluna "% PREVISTO" do MSP é `Int(Num Dur(Prev)[188743983] ÷ PESO DUR(BL)[188743982] × 100 + 0.5)` = fração de duração da baseline DECORRIDA até o StatusDate, ponderada por DURAÇÃO das folhas, **ARREDONDADA** (`+0.5` antes do `Int` = `round`, NÃO trunca).
  - **% PREVISTO — RÉGUA NO ERP (projeção p/ TODAS as semanas):** motor de **TEMPO ÚTIL MINUTO-A-MINUTO** da baseline (`unitsElapsed`/`unitsTotal` sobre `shared/diasUteis`, clipando aos `weekDayIntervals` do calendário). **RAIZ = ROLLUP** = `round(Σ minutos úteis DECORRIDOS das folhas ÷ Σ minutos úteis TOTAIS das folhas × 100)` — soma das DURAÇÕES das folhas, **NÃO** o vão início→fim do projeto (corrigido na Rev. 2644). POR ATIVIDADE = `round(elapsed/total × 100)`. `round` (não `trunc`) p/ espelhar o `+0.5` do Texto10.
  - **% PREVISTO — LEITURA DO VALOR-SNAPSHOT (cliente) (Rev. 2647+, substitui Rev. 2644):** `client/.../ImportarCronograma.tsx` lê SEMPRE a MESMA coluna FIXA `Texto10 (188743750)` via const `FID_PREVISTO_TEXTO10`, em TODOS os projetos (presentes e futuros). **ACABARAM a detecção por `<Alias>` (`detectarFidPorAlias` removida) e as reservas Texto6/Texto11.** Se Texto10 faltar no XML, o valor fica `null` → a tela mostra "—" (jamais lê outra coluna; Texto6 em templates LOTUS é lixo sem alias/fórmula). Vale pra RAIZ (`parseMSProjectFull`) e pra cada ATIVIDADE (`parseMSProjectTasksFromDoc`).
  - **Baseline COM HORA é OBRIGATÓRIA.** Lê `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora). Sem `weekDayIntervals` OU sem TS → fallback day-granular ponderado por duração (backward compat). Cutoff semanal = fim-do-dia (`T23:59:59Z`).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **PADRÃO ATUAL (Rev. 2646): o snapshot "% Previsto" REGENERA EM TODO UPLOAD DO XML — inclusive o SEMANAL — usando o calendário do XML como verdade absoluta.** Acontece em `salvarAtividades` (cadastro/substituir) E em `salvarMetadadosMSProject` (que roda em todo import e regrava o `calendarioJson` limpo). Como a baseline é imutável dentro da revisão, re-rodar é IDEMPOTENTE (mesma curva), mas garante que projetos ANTIGOS se AUTO-CUREM no próximo upload semanal (ex.: a curva ~1% baixa por feriado injetado pré-Rev. 2645 some sozinha). REVOGA a regra anterior "snapshot regenerado SÓ no salvarAtividades / avanço semanal NÃO regenera". RESSALVA: projetos dormentes (sem novos uploads) só corrigem com reimport do cronograma inicial.
  - **RESSALVA DE PARIDADE NUMÉRICA:** o XML de referência (PLN_816 R04) tem StatusDate < StartDate → Texto10 = 0% em tudo, então a curva numérica NÃO foi cravada empiricamente nesta revisão. A régua matemática está alinhada à fórmula; falta re-validar com XML de status-date no meio do projeto.
  - Implementação: `server/routers/planejamento.ts` (`regenerarPrevistoSemanasCaminhoB` — rollup das folhas + round; chamada pós-transaction em `salvarAtividades` E em `salvarMetadadosMSProject` — Rev. 2646, que roda em TODO upload e resolve a revisão ativa + respeita a fonte; `importarComModo` propaga os TS), `client/src/pages/planejamento/ImportarCronograma.tsx` (`detectarFidPorAlias` + parser `<Baseline Number=0>` COM HORA + `<WorkingTime>`→`weekDayIntervals`), `shared/diasUteis.ts` (motor minuto-a-minuto), `drizzle/schema.ts` + self-heal `[SyncSchema+]` (`baseline_start_ts`/`baseline_finish_ts`).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
