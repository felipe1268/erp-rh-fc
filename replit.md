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

- **Rev. 3007** — **FINANCEIRO → CONTAS A RECEBER (TÍTULOS) → MODAL "NOVO TÍTULO": CLIENTE PESQUISÁVEL, OBRA = OBRAS ATIVAS DO CLIENTE, CATEGORIA COM LISTA DEFINIDA.** PEDIDO (via screenshots do iPad): "Arrumar a linha clientes (nome escondido/sobreposto); ao clicar no cliente, o campo de obra mostrar as obras ATIVAS dele; e definir as categorias — medição, SEC (serviços extras contratuais) e mais que a literatura indique". SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema; `criarTituloReceber` recebe os MESMOS campos — `clienteId`/`clienteNome`/`obraNome`/`contaNome`) em `client/src/pages/financeiro/FinanceiroContasAReceberTitulos.tsx`: (1) novo componente local `Combobox` (`Popover`+`Command`) substitui o `Select` nativo do Cliente — como o `PopoverContent` usa portal + largura `--radix-popover-trigger-width`, o dropdown NÃO é mais cortado/sobreposto dentro do modal e ganha BUSCA por digitação; (2) campo Obra virou `Combobox` populado por `trpc.obras.listActive`, filtrando obras cujo `obras.cliente` (texto) casa com a razão social/nome fantasia do cliente selecionado (vínculo por TEXTO, não FK → `matchNames` em `clientesOpts`); fica DESABILITADO até escolher o cliente, é RESETADO ao trocar de cliente e mantém `allowCustom` p/ títulos manuais; (3) Categoria virou `Select` com a const `CATEGORIAS_RECEBER` (Medição, SEC — Serviços Extras Contratuais, Aditivo Contratual, Mobilização/Adiantamento, Reajuste/Reequilíbrio, Liberação de Retenção (Caução), Reembolso de Despesas, Outros); default mudou de "Faturamento de Obras" p/ "Medição". NENHUMA mudança de rota/permissão/contrato/backend. Requer REPUBLICAR (só front). Detalhe: `shared/changelog.ts`.
- **Rev. 3006** — **FINANCEIRO → CONTAS A RECEBER (TÍTULOS): LAYOUT DA TELA ALINHADO AO PADRÃO DA "CONTAS A PAGAR".** PEDIDO (via screenshot do iPad): "Layout tá diferente do contas a pagar mantenha o padrão". SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema; nenhuma mudança de dados/procedure) em `client/src/pages/financeiro/FinanceiroContasAReceberTitulos.tsx`: (1) HEADER — removido o HERO em gradiente emerald→teal + faixa de "resumo do ano"; entra o header-padrão do CAP (`<h1 className="text-2xl font-bold text-gray-900">` + subtítulo cinza + botão "Novo título" emerald à direita); (2) NAVEGAÇÃO DE ANO movida do hero para DENTRO do card de meses (setas ◀ {ano} ▶ à esquerda + legenda à direita, igual ao CAP); memo `anoResumo` removido; (3) BARRA DE MESES no padrão CAP (`grid-cols-6 sm:grid-cols-12`, botões `rounded-lg` cinza com nome em cima + bolinha embaixo); saiu o pill de "valor por mês" (memo `mesesValor` + helper `formatCompactBRL` removidos); (4) KPIs — `KCard` migrou de chip de ícone arredondado para o cartão `border-0 shadow-sm border-l-4` (barra lateral colorida) do CAP. Mantida a paleta EMERALD nos acentos, grupos por cliente, filtros e o modal "Novo título" (Rev. 3005). NENHUMA mudança de rota/permissão/contrato/backend. Requer REPUBLICAR (só front). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 3005** — FINANCEIRO → CONTAS A RECEBER (TÍTULOS): MODAL "NOVO TÍTULO" REDESENHADO + MÁXIMO DE AUTOMAÇÃO. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema; mesma procedure) em `FinanceiroContasAReceberTitulos.tsx`: header em gradiente com corpo rolável + footer fixo; máscara de moeda BRL (`maskBRL`/`parseMaskBRL`); descrição auto-sugerida; presets de parcelas (1x…12x); cronograma completo das parcelas (memo `schedule`+`addMonthsISO`); 1º venc acompanha a competência. Detalhe: `shared/changelog.ts`.

- **Rev. 3004** — FINANCEIRO → CONTAS A RECEBER (TÍTULOS): REDESIGN MODERNO + MAIS AUTOMÁTICO. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema; mesmas procedures) em `FinanceiroContasAReceberTitulos.tsx`: HERO com gradiente emerald→teal + faixa de resumo do ano (memo `anoResumo`); barra de meses com valor em aberto compacto por mês (`mesesValor`+`formatCompactBRL`); KPIs com chips de ícone; grupos por cliente com barra de % recebido; automações no "Novo título"/"Receber" (1º venc acompanha competência, preview de parcelas, atalhos saldo/50%); paleta EMERALD. **(Substituída em layout pela Rev. 3006.)** Detalhe: `shared/changelog.ts`.

- **Rev. 3003** — FINANCEIRO → CONTAS A RECEBER (TÍTULOS): NAVEGAÇÃO MÊS-A-MÊS NOS MOLDES DO CONTAS A PAGAR — BARRA DE MESES JAN…DEZ COM LEGENDA/STATUS POR MÊS + KPIs DO MÊS E ACUMULADO DO ANO. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema; reusa `getContasAReceberByYear` e fatia por mês no cliente) em `FinanceiroContasAReceberTitulos.tsx`: helper `getMesFromDate` + const `MESES` + estado `mesSel`; memo `mesesStatus` (verde=todos recebidos, azul=há aberto, cinza=sem dados); KPIs em 2 do mês + 2 acumulados do ano; barra de meses com legenda + navegação de ano embutida. Detalhe: `shared/changelog.ts`.

- **Rev. 3002** — FINANCEIRO → "CONTAS A RECEBER DE VERDADE" (ESPELHO DO CONTAS A PAGAR): NOVA TELA DEDICADA COM TÍTULOS POR CLIENTE, ORIGEM AUTOMÁTICA (MEDIÇÕES) + MANUAL, PARCELAS E BAIXA TOTAL/PARCIAL. SOLUÇÃO (full-stack ADITIVO, ZERO ALTER destrutivo/DROP/DELETE): 2 colunas nullable `cliente_id`/`cliente_nome` em `financial_entries` (drizzle + guard `[SyncSchema+]` `ADD COLUMN IF NOT EXISTS`); 4 procedures novas em `server/routers/financial.ts` (`getContasAReceberByYear`, `criarTituloReceber`, `darBaixaReceber`, `estornarReceber`) com tenant guard; nova página `FinanceiroContasAReceberTitulos.tsx` + registro em `shared/modules.ts`/`App.tsx`/sidebar. Detalhe: `shared/changelog.ts`.

- **Rev. 3001** — PESQUISA DE SATISFAÇÃO (NPS) → ENVIAR AVALIAÇÃO PELO LINK PÚBLICO DAVA "THE STRING DID NOT MATCH THE EXPECTED PATTERN" NO iPad/iPhone (SAFARI) E NÃO REGISTRAVA. CAUSA-RAIZ: iOS/WebKit DERRUBA A REQUISIÇÃO NO TRANSPORTE + RETRY GLOBAL = false. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema): em `client/src/pages/portal/PortalDashboardCliente.tsx` a mutation `criarAvaliacao` ganhou helper `isTransportErr` + `retry` ciente de transporte (reenvia até 2x SÓ erros de transporte), seguro pois o backend é idempotente (`linkId` de uso único + limite por `credId`); `onError` troca a mensagem críptica pela amigável `toastErroConexao` (i18n pt/en/zh em `shared/portalAvaliacaoI18n.ts`). Detalhe: `shared/changelog.ts`.

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
