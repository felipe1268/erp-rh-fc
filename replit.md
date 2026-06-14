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

- **Rev. 3099** — **MEDIÇÃO / LEVANTAMENTO DE CAMPO · A ÁREA DE DESENHO SOBRE A PLANTA (PDF) GANHA ZOOM PELA RODINHA DO MOUSE (ESTILO AUTOCAD, EM DIREÇÃO AO CURSOR) NO PC, MANTENDO A PINÇA DE 2 DEDOS NO CELULAR/TABLET — E O ZOOM ACONTECE SÓ NA PLANTA, NUNCA NA PÁGINA INTEIRA.** PEDIDO: "dar zoom rolando a bolinha do mouse como no AutoCAD no PC, e com os dedos no celular/tablet, sem dar zoom na tela toda — só na área de desenho". SOLUÇÃO (FRONTEND-ONLY, ZERO BACKEND/ALTER/DROP/DELETE/SCHEMA): `MedicaoLevantamento.tsx` registra listener NATIVO `wheel` `{passive:false}` no `canvasWrapRef` (passive:false é obrigatório p/ `preventDefault` impedir a página/container de rolar); o handler calcula a fração sob o cursor (mesma matemática do pinch) e reusa `focusRef`+`useLayoutEffect` (Rev. 3097) p/ reposicionar o scroll mantendo o ponto sob o cursor fixo (zoom focal). Passo `exp(clamp(-deltaY*0.0015))` clampado 0.5..6× (mesmo range dos botões +/− e da pinça); `zoom/baseWidth/pageDims` via refs p/ evitar closure stale entre ticks. Pinça e pan intactos (pan no PC = arraste com Selecionar). RESSALVA/DRIFT: nenhuma — só ENTRADA de zoom. Detalhe: `shared/changelog.ts`.

- **Rev. 3098** — **MEDIÇÃO DE TERCEIROS · NA "CONFIGURAÇÃO DE RETENÇÕES DO CONTRATO (%)" O USUÁRIO VOLTA A CONSEGUIR APAGAR O "0" DOS CAMPOS (ISS/INSS/IRRF/OUTRAS/RET. TÉCNICA) NO TABLET (iPad/Safari) — O FIX DA Rev. 3096 RESOLVEU O ESTADO REACT, MAS O `<input type="number">` NO iOS CONTINUAVA "GRUDANDO" O 0 AO APAGAR.** PEDIDO: usuário no iPad reportou de novo "Não consigo apagar o número 0" nos inputs de % de retenção. CAUSA-RAIZ: a Rev. 3096 já tinha trocado `percConfig` p/ TEXTO e o `onChange` p/ valor cru (corrige desktop), mas os inputs seguiam `type="number"`; no iOS/Safari um `<input type="number">` controlado por React não reflete de forma confiável a string vazia ao apagar o último dígito (campo "volta" a exibir 0). SOLUÇÃO (FRONTEND-ONLY, ZERO BACKEND/ALTER/DROP/DELETE/SCHEMA): em `client/src/pages/terceiros/contratos/ContratoDetalhe.tsx` os 5 inputs passam de `type="number"` p/ `type="text" inputMode="decimal"` (teclado numérico no mobile + edição livre de string); `onChange` sanitiza p/ dígitos/ponto/vírgula (`replace(/[^0-9.,]/g,"")`) mantendo TEXTO; conversão p/ número só no "Salvar Config", agora com vírgula pt-BR (`parseFloat(String(...).replace(",", ".")) || 0`). RESSALVA/DRIFT: nenhuma. Detalhe: `shared/changelog.ts`.



### Revisões recentes (one-liners)

- **Rev. 3097** — MEDIÇÃO / LEVANTAMENTO DE CAMPO · A TELA DE DESENHO SOBRE A PLANTA (PDF) VIRA TÁTIL E "FLUIDA" ESTILO AUTOCAD: PLANTA EM P&B POR PADRÃO, ZOOM POR PINÇA + PAN, FERRAMENTAS RETÂNGULO/DESENHO LIVRE/PAREDE (L×A→m²), TOOLBAR FIXA, DESFAZER E ENTRADA DE ALTURA/ESCALA POR CAMPO NO APP (FIM DO `window.prompt`). `shared/levantamentoGeo.ts` ganha tipo "parede" + `simplificarPontos` (RDP); `salvarContorno` aceita "parede"; `MedicaoLevantamento.tsx` filtro CSS P&B só no `<Page>` + gestos Pointer Events + `NumberPromptDialog`. Engine Cliente/Terceiros, offline-first. FRONTEND + BACKEND ADITIVO, ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3096** — MEDIÇÃO DE TERCEIROS · NA "CONFIGURAÇÃO DE RETENÇÕES DO CONTRATO (%)" O USUÁRIO VOLTA A CONSEGUIR APAGAR O "0" DOS CAMPOS (ISS/INSS/IRRF/OUTRAS/RET. TÉCNICA) PARA DIGITAR O PERCENTUAL. `ContratoDetalhe.tsx`: `percConfig` passa de estado NUMÉRICO p/ TEXTO; `onChange` grava o valor cru (permite vazio); conversão `parseFloat(...) || 0` só no "Salvar Config". FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3095** — MEDIÇÃO DE TERCEIROS · A LISTA "MEDIÇÕES REGISTRADAS" PASSA A SER ORGANIZADA POR MÊS E ANO, COM NAVEGADOR DE ANO (`< 2026 >`) E 12 CHIPS (JAN–DEZ), CADA UM COM "DOT" DE STATUS (AZUL = COM LANÇAMENTO · VERDE = CONSOLIDADO · CINZA = SEM DADOS), IGUAL À LEGENDA DO CONTAS A PAGAR. `Medicoes.tsx`: helper `periodoDe(m)` extrai `{ano,mes}` de `m.periodo`/`m.dataReferencia`; `mesesStatus` (useMemo) classifica o dot; `filtradas` filtra por mês/ano+status; UI espelha o padrão inline de `FinanceiroContasAPagar.tsx`. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3094** — MEDIÇÃO/LEVANTAMENTO DE CAMPO · O VÍNCULO "CONTORNO → ITEM DA PLANILHA" GANHA BUSCA QUE FILTRA CONFORME SE DIGITA (CÓDIGO/ATIVIDADE/PAVIMENTO) E AGRUPAMENTO POR PAVIMENTO/ETAPA, PARA QUE A MESMA ATIVIDADE REPETIDA EM VÁRIOS PAVIMENTOS NÃO SEJA CONFUNDIDA. Novo `client/src/pages/medicao/VincularItemCombobox.tsx` (Popover + cmdk `Command`, `shouldFilter={false}` + filtro JS por tokens, cap 200) busca por EAP+descrição+pavimento e AGRUPA por `grupoPath`; exporta `buildItensVinculaveis` (item mensurável = FOLHA da árvore EAP, independente do `tipo`); `MedicaoLevantamento.tsx` troca o `<Select>` pelo combobox + banner âmbar p/ lista vazia. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3093** — MEDIÇÃO/LEVANTAMENTO DE CAMPO · AS PLANTAS (PDF) PASSAM A VIVER NO NÍVEL DO CONTRATO (BIBLIOTECA COMPARTILHADA: ENVIA 1x, TODAS AS MEDIÇÕES ENXERGAM) E CADA LEVANTAMENTO PODE EXIBIR, COMO REFERÊNCIA TRACEJADA, OS CONTORNOS JÁ MEDIDOS NAS MEDIÇÕES ANTERIORES DO MESMO CONTRATO. ARQUITETURA "BIBLIOTECA DE PLANTAS" sem schema novo = um `medicao_campo` dedicado por (contrato, origem) `status="biblioteca"`, `numero=0`, `medicaoId=NULL` — PDFs+calibração vivem nela, contornos/fotos seguem por medição referenciando o `pdf.id` compartilhado. `medicao.ts` helpers `resolverBibliotecaPlantas`/`migrarPlantasParaBiblioteca`/`origemCampoCond`; nova proc read-only `getContornosReferencia`; `MedicaoLevantamento.tsx` toggle "Ver medição anterior" + camada SVG faint/dashed. BACKEND ADITIVO + FRONTEND, ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.



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
