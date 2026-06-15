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

- **Rev. 3108** — **DOCUMENTOS / RAIO-X DO FUNCIONÁRIO (E TODO O APP) · O LINK "VER" DO ATESTADO (E DE QUALQUER ANEXO PDF/IMAGEM) VOLTOU A ABRIR — ANTES O PREVIEW ABRIA EM BRANCO ("NÃO ABRIA") NO iPad/Safari.** PEDIDO: "o link 'Ver' do atestado no Raio-X do Funcionário não abre" (print IMG_2040). CAUSA-RAIZ (infra, não da tela): disco efêmero → quando o arquivo some, `/uploads` cai no FALLBACK de banco (`dbRetrieve`→`uploaded_files`); 387 arquivos legados tinham `content_type='application/octet-stream'` (89 JPEGs de atestado) e o fallback setava esse header genérico → Safari iOS NÃO renderiza imagem/PDF octet-stream dentro de `<img>`/`<iframe>` → `DocumentPreviewDialog` abria em branco. (Quando já estava em disco, `express.static` inferia o MIME pela extensão e funcionava — daí a intermitência.) A fiação da tela estava CORRETA. SOLUÇÃO (BACKEND SERVE-PATH + UPDATE DE DADOS, ZERO ALTER/DROP/DELETE/SCHEMA): (1) `server/_core/index.ts` ganha `mimeFromKey(key)` que deriva o MIME pela EXTENSÃO; no fallback de DB, content-type vazio/octet-stream passa a usar o MIME derivado (mantém o gravado quando específico). HARDENING (code review): o fallback grava o buffer em disco a partir de `key` (de `req.path`) → adicionada guarda de PATH TRAVERSAL (`path.resolve` confinado a `server/uploads`, senão 400). (2) DADOS (Neon, UPDATE): `uploaded_files.content_type` dos 387 genéricos corrigido pela extensão → 96 atualizados (89 image/jpeg, 5 image/webp, 2 image/png); 291 `.dwg`/`.ifc` (CAD) intocados. Detalhe: `shared/changelog.ts`.

- **Rev. 3107** — **MEDIÇÃO / LEVANTAMENTO DE CAMPO · OS AVISOS DE EXCLUSÃO ("EXCLUIR CONTORNO?", "EXCLUIR FOTO?", "REMOVER PLANTA?", "EXCLUIR SELECIONADOS") DEIXARAM DE USAR O POP-UP NATIVO DO NAVEGADOR (QUE EXIBIA O DOMÍNIO/URL FEIO — "…replit.dev diz" — NO TOPO) E PASSARAM A USAR UM DIÁLOGO ESTILIZADO DO APP, COM TÍTULO E TEXTO LIMPOS.** PEDIDO: "revise a mensagem de alerta, não precisa ter os códigos, deixa melhor apresentável" (print IMG_2039). CAUSA: a tela usava `window.confirm(...)` em 4 pontos; o navegador SEMPRE prefixa o alerta nativo com a origem ("<domínio> diz"), que no preview Replit é um hash longo — sem como estilizar/remover num `confirm()`. SOLUÇÃO (FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND) em `client/src/pages/medicao/MedicaoLevantamento.tsx`: (1) novo estado `confirmDlg` + helper `askConfirm({title, description, confirmText, onConfirm})` que abre UM único `<AlertDialog>` (shadcn `ui/alert-dialog`) renderizado ao fim do componente; (2) os 4 `confirm()` viraram `askConfirm(...)` com mensagens descritivas (contorno cita tipo+nº, planta cita o nome, bulk cita a contagem) e botão de ação vermelho; (3) o fluxo assíncrono do bulk (`excluirSelecionados`) foi movido p/ dentro do `onConfirm`, preservando `bulkBusy`/offline-first. Lógica de exclusão (`off.excluirContorno`/`off.excluirFoto`/`excluirPdfM`) intacta. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3106** — FINANCEIRO / ANÁLISE DE CUSTOS · O MODAL "EDITAR LANÇAMENTO" (DRILL "POR CENTRO DE CUSTO") FOI REDESENHADO (MAIS MODERNO) E PAROU DE CORTAR/SOBREPOR O TEXTO DO DROPDOWN DE CATEGORIA/CENTRO DE CUSTO EM iPad ~768px. FRONTEND-ONLY em `FinanceiroAnaliseCustosDetalhe.tsx`: Categoria/Centro saem do `grid-cols-2` p/ largura total (gatilho largo=popper largo); `SelectContent` ganha `align="start"` + `max-w-[calc(100vw-2rem)]` + `SelectItem whitespace-normal` (quebra em 2 linhas em vez de cortar). `ui/select.tsx` intocado. ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3105** — MEDIÇÃO / LEVANTAMENTO DE CAMPO · O DESENHO DOS CONTORNOS GANHA ESCOLHA DE COR E DE OPACIDADE DO PREENCHIMENTO (ANTES FIXO 18% E COR AUTOMÁTICA POR TIPO). FRONTEND-ONLY (campo `cor` já persistia via `off.saveContorno`): estado em localStorage `corDesenho`/`fillOpacity` (default 0.32); render usa `fillOpacity` variável; Popover "Estilo" (paleta + slider); "Recolorir em massa" na barra de multi-seleção via `recolorContorno` reusando `off.saveContorno` preservando todos os campos. Opacidade é setting global de render; cor é por contorno. ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3104** — MEDIÇÃO / LEVANTAMENTO DE CAMPO · A TELA DE DESENHO SOBRE A PLANTA PASSA A ACEITAR DXF (CAD VETORIAL) ALÉM DE PDF, COM ESCALA CALIBRADA AUTOMÁTICA VIA `$INSUNITS` (DISPENSANDO "CALIBRAR 2 PONTOS"). Novo util `client/src/pages/medicao/dxfPlanta.ts` (`parseDxfPlanta`, lib `dxf-parser`) tessela entidades CAD → SVG vetorial e deriva `metrosPorUnidade`; `MedicaoLevantamento.tsx` troca `<Document>/<Page>` por SVG no mesmo overlay/filtro P&B reusando o motor [0..1]; backend `medicao.uploadPdf` deriva extensão .dxf/.pdf. DWG (proprietário) fica p/ depois. FRONTEND + BACKEND ADITIVO, ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3103** — MEDIÇÃO DE TERCEIROS · O CARD DA LISTA "MEDIÇÕES REGISTRADAS" GANHA NOME AMIGÁVEL "MED-01" (EM VEZ DE "MEDIÇÃO #1") E EXIBE O PERÍODO EM FORMATO BRASILEIRO (MM/AAAA, EX.: 06/2026) EM VEZ DO CRU "2026-06". SOLUÇÃO (FRONTEND-ONLY): em `client/src/pages/terceiros/Medicoes.tsx` dois helpers — `medLabel(numero)` → `MED-${padStart(2,"0")}` e `fmtPeriodo(m)` (reusa `periodoDe` → `MM/AAAA`, fallback p/ valor cru). ZERO BACKEND/ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3102** — MEDIÇÃO / LEVANTAMENTO DE CAMPO (TERCEIROS) · O COMBOBOX DE VÍNCULO DE CONTORNOS VOLTA A LISTAR OS ITENS DO CONTRATO (BLOCO B/FORROS) EM VEZ DE "SEM ORÇAMENTO VINCULADO", MESMO COM ITENS NA ABA "ITENS". CAUSA: `useLevantamentoOffline` só buscava itens via `getItensOrcamento` (orçamento de obra); contrato de terceiro tem `orcamentoId` 0/null e itens em `terceiro_contrato_itens` → query nunca roda → vazio. SOLUÇÃO (FRONTEND-ONLY): hook ganha `itensOverride?:any[]|null`; `MedicaoLevantamento.tsx` carrega `terceiroContratos.listarItens` e injeta como override; `vincularEmptyHint` ganha ramo terceiro. ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

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
