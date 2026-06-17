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

- **Rev. 3205** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · AS DUAS LISTAS DE PENDÊNCIA ("NO EXTRATO, SEM LANÇAMENTO" E "NO ERP, SEM EXTRATO") GANHARAM UM BOTÃO "EXPANDIR" QUE ABRE A LISTA EM TELA CHEIA (MODAL 96vw × 92vh) PARA ANALISAR MELHOR, COM MAIS LINHAS VISÍVEIS DE UMA VEZ.** PEDIDO (piloto FC): "coloca um botão de expansão das telas, onde você consegue ver na tela inteira para analisar melhor" + print das duas listas lado a lado (cada uma com scroll interno de ~420px / ~7 linhas). SOLUÇÃO — FRONT (`client/src/pages/financeiro/FinanceiroConciliacao.tsx`): cada card ganhou botão "Expandir" (ícone `Maximize2`) ao lado de Excel/PDF; abre um `Dialog` em tela cheia (`max-w-[96vw] w-[96vw] h-[92vh]`, cabeçalho + barra Excel/PDF + corpo rolável) que renderiza EXATAMENTE as mesmas linhas (seleção p/ conciliar, "Lançar" e comprovante seguem funcionando). A linha do extrato foi extraída em `renderExtratoRow` (reuso inline + modal); ERP já usava `renderEntryRow`. Novo estado `expandedList: "extrato"|"erp"|null`; removido `max-w-[200px]` da descrição do extrato. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE · só UI. Detalhe: `shared/changelog.ts`.

- **Rev. 3204** — **FINANCEIRO / CONTROLE DE CHEQUES · A TELA GANHOU A MESMA RÉGUA DE MÊS/ANO DA CONCILIAÇÃO BANCÁRIA: NAVEGAÇÃO POR ANO (SETAS `< 2026 >`), BOTÃO "ANO TODO" E A FAIXA DE MESES JAN–DEZ EM CHIPS COM BOLINHA DE STATUS (AZUL = COM LANÇAMENTO · VERDE = CONSOLIDADO/TODOS COMPENSADOS · CINZA = SEM DADOS), PRA MANTER O MESMO PADRÃO DE ORGANIZAÇÃO ENTRE AS TELAS.** PEDIDO (piloto FC): "no controle de cheques quero o mesmo filtro por mês e ano, para manter o mesmo padrão de organização" + prints (Cheques com dropdowns Ano/Mês vs. a régua de chips da Conciliação). SOLUÇÃO — FRONT (`client/src/pages/financeiro/FinanceiroCheques.tsx`): os dropdowns "Ano"/"Mês" foram substituídos pela régua da Conciliação — setas `<`/`>` de ano, botão "Ano todo" (`mesSel=null` abre o ano) e 12 chips (Jan–Dez) com bolinha de status; estado mudou de `fAno`/`fMes` string ("todos") para `ano: number` + `mesSel: number|null` (default = mês atual). Busca e Status seguem no mesmo card; KPI "Total" agora lê `ano`. SOLUÇÃO — BACK (`server/routers/cheques.ts`): nova query `resumoMensal({ companyId, ano })` agregando por mês (`COUNT(*)` + `COUNT(*) FILTER (WHERE status='compensado')`) pra pintar a bolinha (tudo compensado→verde; com pendência→azul; vazio→cinza); tem `assertCompanyAccess`. `listar`/`resumo` já aceitavam `mes`/`ano` e seguem inalteradas. ZERO SCHEMA/ALTER/DROP/DELETE · ZERO mudança no parser/dedup/importação · cheque continua NÃO virando lançamento (Opção A). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3203** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · CORREÇÃO DE BUG CRÍTICO: A TELA MOSTRAVA "NÃO FOI POSSÍVEL CARREGAR A CONCILIAÇÃO · DB code=42703 | column e.comprovante_beneficiario does not exist"; AS COLUNAS `comprovante_*` (Rev. 3193) NUNCA FORAM GARANTIDAS POR SELF-HEAL.** Self-heal Rev. 3203 (`server/_core/index.ts`) garante as 6 colunas `comprovante_*` via `ADD COLUMN IF NOT EXISTS`; pós-fix o report roda OK. ZERO ALTER/DROP/DELETE destrutivo. Detalhe: `shared/changelog.ts`.

- **Rev. 3202** — **FINANCEIRO / CONTROLE DE CHEQUES · A IMPORTAÇÃO DEIXOU DE PEDIR O "ANO DA PLANILHA": O ERP AGORA LÊ O ANO AUTOMATICAMENTE DA DATA DE CADA CHEQUE E CLASSIFICA CADA LINHA SOZINHO; O MODAL DE IMPORTAÇÃO FOI MODERNIZADO (DROPZONE, KPIs EM CARDS, CHIPS DE ABAS/SITUAÇÃO).** Em `parseWorkbook` (`server/routers/cheques.ts`) o ano de cada linha vem da própria data do cheque (vencimento→compensação→aba→ano atual); inputs `ano` de import viraram opcionais; dedup `(company, numero_cheque, valor, ano_ref)` segue válida. Layout (`FinanceiroCheques.tsx`): removido "Ano da planilha", modal com dropzone, KPIs em cards e chips. ZERO SCHEMA/ALTER/DROP/DELETE · cheque NÃO vira lançamento. Detalhe: `shared/changelog.ts`.

- **Rev. 3201** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · A CONCILIAÇÃO AUTOMÁTICA AGORA É APENAS SUGESTIVA: NADA É GRAVADO SEM O USUÁRIO REVISAR E CONFIRMAR EXPLICITAMENTE CADA VALOR.** Backend JÁ era só sugestivo; o "automático" era o atalho de UI "Selecionar todas" → "Conciliar selecionadas". Em `FinanceiroConciliacao.tsx`, `conciliarSelecionadas` agora ABRE um `AlertDialog` (`confirmConciliar`) listando CADA par (extrato → lançamento, BRL pt-BR); só "Confirmar conciliação (N)" dispara `conciliarSugestoes`. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3200** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · CORREÇÃO: A LISTA "NO EXTRATO, SEM LANÇAMENTO" DEIXOU DE DIZER FALSAMENTE "TODO O EXTRATO ESTÁ CONCILIADO 🎉" QUANDO, NA VERDADE, NÃO HAVIA NADA CONCILIADO. AGORA A MENSAGEM DERIVA DO RELATÓRIO (FONTE ÚNICA), NÃO DA QUERY À PARTE `statements`.** Dentro de `repExt.length === 0` (`FinanceiroConciliacao.tsx`), a mensagem passou a olhar `repConc.length`: `===0` → "Nenhum extrato importado" + botão Importar; `>0` → "Todo o extrato está conciliado 🎉". Coerente com os KPIs do topo. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3199** — **FINANCEIRO / CONTROLE DE CHEQUES · NOVO MÓDULO QUE IMPORTA A PLANILHA "CONTROLE DE CHEQUES" (ABAS MENSAIS) PARA UMA TABELA DEDICADA — O CHEQUE NÃO VIRA LANÇAMENTO (SÓ CONTROLE/CONSULTA) E O Nº DO CHEQUE VIRA FONTE DE IDENTIFICAÇÃO NA CONCILIAÇÃO DA CAIXA ("COMPENSACAO CHEQUE NNN" → FAVORECIDO).** Tabela `financial_cheques` (self-heal `CREATE TABLE IF NOT EXISTS`, ZERO ALTER); router `cheques.ts` (`importarPreview`/`importarConfirmar`/`listar`/`resumo`/`atualizar`/`excluir`/`reverterLote`, tenant guard); tela `FinanceiroCheques.tsx` (rota `/financeiro/cheques`, permissão `financeiro-cheques`); gancho em `sugerirConciliacao` extrai nº do cheque e EXIGE valor batendo (informativo, nunca concilia sozinho). ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
