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

- **Rev. 3068** — **INTEGRASIGN · 1 CLIQUE NO "ENVIAR POR E-MAIL" JÁ ABRE O WHATSAPP DO 1º SIGNATÁRIO COM O LINK DE ASSINATURA PRONTO — SEM PRECISAR CLICAR DEPOIS NO BOTÃO "WHATSAPP" / "GERAR LINKS".** PEDIDO (print iPad IMG_1996, envelope CT-2026-0006 em Rascunho): "Quando clicar em enviar contrato, já considera o link para enviar pelo WhatsApp tbm sem precisar clicar no botão". CONTEXTO: a assinatura é SEQUENCIAL (no envio só o 1º signatário `ordemAssinatura===1` é notificado), os tokens já existem desde a criação e a tela de Detalhes usa `getEnvelope` (select completo) → `env.signatarios[].token`/`ordemAssinatura` disponíveis SÍNCRONOS no clique. SOLUÇÃO (FRONTEND-ONLY, ZERO ALTER/DROP/DELETE, ZERO schema/backend) em `client/src/pages/IntegraSignDashboard.tsx`: nova fn `handleEnviarComWhatsApp(env)` no botão "Enviar por e-mail" — acha o 1º pendente, abre o WhatsApp dele (`handleWhatsApp`, wa.me sem número, msg+link prontos) e dispara `handleEnviar(env.id,true)`. CRÍTICO: o `window.open` roda SÍNCRONO no gesto do clique (antes do await) p/ não ser bloqueado no iPad/Safari. Botão "Gerar links (WhatsApp)" mantido. RESSALVA: wa.me sem número só abre o WhatsApp pronto p/ escolher o contato (não dispara sozinho). Detalhe: `shared/changelog.ts`.

- **Rev. 3067** — **PADRONIZAÇÃO GLOBAL DE MOEDA: VARREDURA EM TODO O ERP PARA ELIMINAR AS ABREVIAÇÕES DE VALOR ("R$ X mil" / "R$ X,X mi" / "R$ XK" / "R$ XM" / "R$ Xk") — AGORA TUDO EXIBE O VALOR COMPLETO EM BRL POR EXTENSO (R$ 51.929,02), EM TELAS, TABELAS, KPIs, RÓTULOS E EIXOS DE GRÁFICOS.** PEDIDO (print iPad IMG_1995, gráfico "Distribuição por Mês — 2026" com eixos "R$ 7 mil"/"R$ 60 mil"): "deixe tudo em número completo com ponto e vírgula (R$ 51.929,02) para padronizar tudo". A Rev. 3063 já havia trocado as células da tabela da Análise de Custos, mas mantinha o compacto nos eixos/rótulos — e o formato compacto existia espalhado em vários módulos. SOLUÇÃO (FRONTEND-ONLY, ZERO ALTER/DROP/DELETE, ZERO schema/backend) em 14 arquivos: (1) FORMATADORES NOMEADOS (`BRLk`/`BRLShort`/`fmtBRLShort`/`fmtBRLAxis`/`fmtK`/`formatBRL`) passaram a delegar SEMPRE ao formato completo `toLocaleString("pt-BR",{style:"currency",currency:"BRL"})` (CFO também subiu `BRL` de 0→2 casas); (2) tickFormatters/labels INLINE trocaram a expressão compacta por `Intl.NumberFormat` BRL completo, e os `<YAxis>` estreitos ganharam `width≈108` p/ não cortar. PRESERVADOS (não são moeda): `/1000` de segundos (ProcessosTrabalhistas/Migration/Locados/Oraculo) e km (PrecosCombustivel), e o "mil" por extenso de contratos. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3066** — AVISO PRÉVIO · CIPEIRO (ESTABILIDADE PROVISÓRIA): O CARD DA "INDENIZAÇÃO DO PERÍODO DE ESTABILIDADE" GANHA UMA BARRA "TOTAL GERAL (RESCISÃO + INDENIZAÇÃO ESTABILIDADE)" SOMANDO O TOTAL LÍQUIDO DA RESCISÃO COM A INDENIZAÇÃO — ANTES SÓ MOSTRAVA OS DOIS TOTAIS SEPARADOS. Em `AvisoPrevio.tsx`, dentro do card de estabilidade (`indenizacaoEstabilidade.aplicavel`): barra escura "TOTAL GERAL (Rescisão + Indenização Estabilidade)" = `parseFloat(totalLiquido) + parseFloat(ie.total)` via `formatMoeda`, + os dois componentes em fonte pequena. Só p/ cipeiro com indenização aplicável; é só EXIBIÇÃO (não altera persistido/TRCT). FRONTEND-ONLY, ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3065** — CONTRATOS DE TERCEIROS · TEMPLATE DO CONTRATO (TEXTO+CLÁUSULAS+LAYOUT) CENTRALIZADO EM CONFIGURAÇÕES › "CONTRATO TERCEIROS"; NO MÓDULO TERCEIROS O CONTRATO FICA SÓ P/ VISUALIZAR, ASSINAR (FCSIGN) E BAIXAR (edição inline removida). `ContratoTemplate.tsx` ganha prop `embedded` + NOVA aba em `Configuracoes.tsx`; menu "Template de Contrato" sai do submenu Terceiros; `ContratoDetalhe.tsx` perde toolbar de edição (Gerar/Editar/Salvar) e AUTO-GERA o texto do template via `useEffect`; metadados (datas/objeto) seguem editáveis. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3064** — CONTRATOS DE TERCEIROS · CONTRATO 100% ASSINADO NO FCSIGN NÃO LIBERAVA AS MEDIÇÕES (NEM SAÍA DO MODO EDITÁVEL): O STATUS DE ASSINATURA FICOU ROBUSTO A RASCUNHOS/CANCELADOS E ENVELOPES SOFT-DELETADOS, E A TELA RE-BUSCA SOZINHA AO FOCAR A JANELA. CAUSA-RAIZ: `getContrato` derivava `assinaturaStatus` do ÚLTIMO envelope por `criado_em` SEM excluir `excluido_em` e SEM tratar "concluido" como terminal (rascunho/cancelado posterior re-fechava o gate); + cache obsoleto (`refetchOnWindowFocus:false`). SOLUÇÃO (ZERO ALTER/DROP/DELETE): derivação EXCLUI `excluido_em` (via `isNull`) e "concluido" vira ADESIVO; `ContratoDetalhe.tsx` ganha `refetchOnWindowFocus:true`. Detalhe: `shared/changelog.ts`.

- **Rev. 3063** — FINANCEIRO · ANÁLISE DE CUSTOS · A TABELA MENSAL POR CATEGORIA PASSA A EXIBIR VALORES EM BRL POR EXTENSO (R$ 232.000,00) EM VEZ DA ABREVIAÇÃO "R$ X mil"/"R$ X,X mi". As CÉLULAS da tabela mensal (valor do mês, sublinhas pago/a pagar, "Total geral" e totais por mês do rodapé) em `FinanceiroAnaliseCustos.tsx` trocaram `BRLk(...)` por `formatBRL(...)`; `BRLk` mantido só nos eixos/labels dos gráficos (compacto p/ caber). Wrapper `overflow-x-auto` absorve números mais largos. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3062** — AVISO PRÉVIO · QUANDO O COLABORADOR É CIPEIRO (ESTABILIDADE PROVISÓRIA), O "NOVO AVISO PRÉVIO" PASSA A CALCULAR E EXIBIR A INDENIZAÇÃO DEVIDA POR LEI (SÚMULA 396 TST) NA DISPENSA SEM JUSTA CAUSA — COMPONENTE A COMPONENTE + TOTAL, SEPARADO DA RESCISÃO. Nova função pura `calcularIndenizacaoEstabilidade` em `rescisaoCalc.ts` (salários + 13º + férias + 1/3 + FGTS 8%); procedure `calcular` consulta `cipa_members ⨝ cipa_elections` e SÓ p/ dispensa do EMPREGADOR; FRONT `AvisoPrevio.tsx` card vermelho dedicado. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
- **Moeda SEMPRE em formato BRL pt-BR (`R$ 100.000,00` — ponto p/ milhar, vírgula p/ centavos).** Tanto na EXIBIÇÃO (usar `formatBRL`) quanto em INPUTS de digitação de valor (usar máscara `maskBRL`/`parseMaskBRL`). Nunca exibir/aceitar o formato cru anglo `100000.00`.
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
