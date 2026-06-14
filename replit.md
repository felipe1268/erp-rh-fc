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

- **Rev. 3065** — **CONTRATOS DE TERCEIROS · O TEMPLATE DO CONTRATO (TEXTO + CLÁUSULAS + LAYOUT) FOI CENTRALIZADO EM CONFIGURAÇÕES › "CONTRATO TERCEIROS"; NO MÓDULO TERCEIROS O CONTRATO FICA SOMENTE PARA VISUALIZAR, ASSINAR (FCSIGN) E BAIXAR — A EDIÇÃO DE TEXTO/INLINE DO CONTRATO FOI REMOVIDA.** PEDIDO (prints do Contrato CT-2026-0006 no iPad): centralizar a configuração do template (template + cláusulas + layout) num único lugar e tirar a edição do contrato de dentro do módulo. CONTEXTO: já existia um sistema de template de terceiros (tabelas `terceiro_contrato_templates`/`terceiro_template_revisoes`, backend `getTemplate`/`salvarTemplate`/`gerarTextoContrato` e o editor `ContratoTemplate.tsx`), mas vivia DENTRO do módulo Terceiros e a tela do contrato expunha toolbar de edição. SOLUÇÃO (FRONTEND-ONLY, ZERO ALTER/DROP/DELETE, ZERO schema/migração — reusa o backend de template existente): `ContratoTemplate.tsx` ganha prop `embedded` (sem `DashboardLayout`/botão voltar) e é renderizado numa NOVA aba "Contrato Terceiros" em `Configuracoes.tsx`; o item de menu "Template de Contrato" saiu do submenu Terceiros (`DashboardLayout.tsx`); a rota `/terceiros/contratos/template` segue válida p/ deep-link. Em `ContratoDetalhe.tsx` a toolbar do documento perde "Gerar/Regenerar", "Editar texto" e "Salvar" (+ modais de edição/observação removidos) e o texto AUTO-GERA do template via `useEffect` (guard `useRef`, sem botão) qd o contrato não tem texto e não está assinado; MANTIDOS "Enviar p/ FcSign", visualizar e baixar (assinado). RESSALVA: edição inline de metadados (datas/objeto/natureza) NÃO foi removida (são dados de cadastro, não do template). Detalhe: `shared/changelog.ts`.

- **Rev. 3064** — **CONTRATOS DE TERCEIROS · CONTRATO 100% ASSINADO NO FCSIGN NÃO LIBERAVA AS MEDIÇÕES (NEM SAÍA DO MODO EDITÁVEL): O STATUS DE ASSINATURA AGORA É ROBUSTO A RASCUNHOS/CANCELADOS E ENVELOPES SOFT-DELETADOS, E A TELA RE-BUSCA SOZINHA AO FOCAR A JANELA.** PEDIDO (prints do Contrato CT-2026-0006 no iPad): "assinado por todos e mesmo assim não liberou as medições, por quê?" — a aba "Medições (0)" mostrava "Envie o contrato para assinatura antes de gerar medições." e a aba "Contrato" seguia editável. CAUSA-RAIZ: o gate inteiro depende de `contrato.assinaturaStatus === "concluido"`, campo DERIVADO em `terceiroContratos.getContrato` a partir do envelope FCSign. A derivação antiga pegava o ÚLTIMO envelope por `criado_em` (`orderBy desc + limit 1`) SEM excluir soft-deletados (`excluido_em`) e SEM tratar "concluido" como terminal — frágil: um rascunho/cancelado criado depois (ex.: clicar "Enviar p/ FcSign" de novo) mascararia o concluído e RE-FECHARIA o gate. Sintoma imediato = CACHE OBSOLETO: signatários assinam por link público em outra sessão e, com `refetchOnWindowFocus:false` global + staleTime 2min, a aba do dono não re-buscava. SOLUÇÃO (BACKEND+FRONTEND, ZERO ALTER/DROP/DELETE, ZERO schema): em `getContrato` a derivação passa a EXCLUIR `excluido_em` (via `isNull`) e tornar o "concluido" ADESIVO (qualquer envelope não-excluído concluído → contrato concluído); `ContratoDetalhe.tsx` ganha `refetchOnWindowFocus:true` no `getContrato.useQuery`. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3063** — FINANCEIRO · ANÁLISE DE CUSTOS · A TABELA MENSAL POR CATEGORIA PASSA A EXIBIR VALORES EM BRL POR EXTENSO (R$ 232.000,00) EM VEZ DA ABREVIAÇÃO "R$ X mil"/"R$ X,X mi". As CÉLULAS da tabela mensal (valor do mês, sublinhas pago/a pagar, "Total geral" e totais por mês do rodapé) em `FinanceiroAnaliseCustos.tsx` trocaram `BRLk(...)` por `formatBRL(...)`; `BRLk` mantido só nos eixos/labels dos gráficos (compacto p/ caber). Wrapper `overflow-x-auto` absorve números mais largos. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3062** — AVISO PRÉVIO · QUANDO O COLABORADOR É CIPEIRO (ESTABILIDADE PROVISÓRIA), O "NOVO AVISO PRÉVIO" PASSA A CALCULAR E EXIBIR A INDENIZAÇÃO DEVIDA POR LEI (SÚMULA 396 TST) NA DISPENSA SEM JUSTA CAUSA — COMPONENTE A COMPONENTE + TOTAL, SEPARADO DA RESCISÃO. Nova função pura `calcularIndenizacaoEstabilidade` em `rescisaoCalc.ts` (salários + 13º + férias + 1/3 + FGTS 8%); procedure `calcular` consulta `cipa_members ⨝ cipa_elections` e SÓ p/ dispensa do EMPREGADOR; FRONT `AvisoPrevio.tsx` card vermelho dedicado. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3061** — CONTRATOS DE TERCEIROS · ABA "MEDIÇÕES" GANHA O BOTÃO "GERAR MEDIÇÃO" NO PRÓPRIO LUGAR — ANTES SÓ EXISTIA NO CABEÇALHO DO TOPO (E SÓ QUANDO ASSINADO), ENTÃO O EMPTY-STATE APONTAVA P/ UM BOTÃO INEXISTENTE. `MedicoesTab` recebe `setShowGerarMedicao` por prop e deriva `assinado`; empty-state mostra o botão "Gerar Medição" (azul, Zap) quando ASSINADO, ou o motivo em badge âmbar quando não; lista ganha o botão no topo da aba. Botão do header mantido. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3060** — CONTRATOS DE TERCEIROS · REMOVIDO O BOTÃO "ADICIONAR ITEM" DA ABA "ITENS" — ITENS DO CONTRATO VÊM DEFINIDOS DO MÓDULO DE COMPRAS; ACRÉSCIMOS SERÃO TRATADOS COMO SEC (SERVIÇOS EXTRAS CONTRATUAIS) VINCULADOS MAS RASTREADOS À PARTE. REMOVIDO botão + form inline (`showAddItem`/`newItem`) e a mutation `adicionarItemMut` (procedure backend `adicionarItem` MANTIDA, sem caller); MANTIDO "Vincular Item" (relink EAP); empty-state atualizado p/ a regra. RESSALVA: SEC como entidade separada é próximo passo. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3059** — CONTRATOS DE TERCEIROS · ABA "CONTRATO" FICA VIEW-ONLY QUANDO JÁ ASSINADO (FCSIGN CONCLUÍDO) — EM VEZ DO TOOLBAR/FOLHA A4 EDITÁVEL, MOSTRA O ARQUIVO ASSINADO + BOTÃO DE OLHO (VISUALIZAR) E BAIXAR EM PDF. BACKEND nova procedure AUTENTICADA `integrasign.getContratoAssinadoPdfData({companyId, contratoTerceiroId})` (tenant guard, envelope `concluido` mais recente, retorna `{envelope, todosSignatarios[]}` COM imagens+auditoria); PDF `gerarContratoAssinadoPdf` ganha `modo?:"download"|"abrir"`+`janela?` (iOS); FRONT card travado com Visualizar/Baixar + hash + assinaturas. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
