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

- **Rev. 3111** — **MEDIÇÃO / LEVANTAMENTO DE CAMPO (DESENHO SOBRE A PLANTA) · DEPOIS DE CRIADO, UM CONTORNO PODE SER AJUSTADO: NA FERRAMENTA "SELECIONAR", TOCAR NUM CONTORNO O SELECIONA E APARECEM PONTOS AZUIS (HANDLES) PARA ARRASTAR E ALTERAR AS DIMENSÕES — RETÂNGULO GANHA 4 CANTOS + 4 LADOS; DEMAIS POLÍGONOS, UM PONTO POR VÉRTICE.** PEDIDO: "Depois q eu crie preciso poder fazer ajustes, o retângulo com ponto para alterar as dimensões" (print IMG_2044). SOLUÇÃO (FRONTEND-ONLY em `client/src/pages/medicao/MedicaoLevantamento.tsx`, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND — reusa `off.saveContorno` por id/uuid): (1) SELEÇÃO POR TOQUE: `onTap` em "Selecionar" faz hit-test via `contornoSobPonto()` (fechados por ray-casting `pontoEmPoligono` ou borda; abertos por `distAsArestas`; contagem por proximidade) → seleciona só 1 (destaque azul); vazio limpa; (2) HANDLES: `detectRectBox()` reconhece retângulo eixo-alinhado → 4 cantos (redimensiona, canto oposto fixo) + 4 lados (1 dimensão); polígono qualquer → 1 handle por vértice; handles têm `setPointerCapture`+`stopPropagation` (não disparam pan/zoom); (3) `pontosEditados()` recompõe geometria [0..1] (preview `editDrag`) e `salvarGeometriaContorno()` reconverte (`normToPt`), recalcula área/perímetro/volume/quantidade (`calcularContorno`, preserva espessura/altura/vínculo) e salva via UPDATE; MIN 0.004 evita degenerar. Detalhe: `shared/changelog.ts`.

- **Rev. 3110** — **COLABORADORES / RAIO-X DO FUNCIONÁRIO (ABA "DESEMPENHO") · A SEÇÃO "AVALIAÇÃO DO CLIENTE" GANHOU O BOTÃO "GERAR FICHA (PDF)" QUE EMITE UMA FICHA INSTITUCIONAL FC DA AVALIAÇÃO DO CLIENTE — PRONTA P/ IMPRIMIR OU SALVAR EM PDF E ENVIAR (EX.: WHATSAPP).** PEDIDO: gerar ficha em PDF da avaliação no Raio-X (prints IMG_2041/IMG_2042); no `user_query` o usuário escolheu "Só a Avaliação do Cliente (notas + comentários do cliente)". SOLUÇÃO (FRONTEND-ONLY em `client/src/components/RaioXFuncionario.tsx`, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND): (1) novo `gerarFichaAvaliacaoCliente()` (espelha `handleExportSST`): janela de impressão com cabeçalho FC (faixa #1B2A4A, logo `${origin}/logo-fc-branco-amarelo.png`, razão/CNPJ, "Emitido em/por") + barra do colaborador (foto/nome/função/CPF/código/nº avaliações); (2) corpo = 5 cards de média (Geral/Gestor/Equipe/Prazo/Qualidade, cores 8+/6+/<6) + tabela com Data, Obra, as 5 notas coloridas e os "Comentários do Cliente" — lê SOMENTE `desempenho.avaliacaoCliente` (nada de avaliação interna); (3) botão "Gerar Ficha (PDF)" (outline, ícone Printer) no cabeçalho do card, só com `total > 0`. SEGURANÇA: tudo escapado (`esc`/`escAttr`) e `fotoUrl`/logo via `safeImgUrl` (allowlist http/https/blob/data:image). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3109** — COLABORADORES / GRADE DE TAMANHOS (EPI) · O DIÁLOGO "GRADE DE TAMANHOS" AGORA LISTA QUEM ESTÁ SEM OS DADOS DE EPI (COM FOTO E NOME) E PERMITE IMPRIMIR/GERAR PDF DESSA LISTA — ANTES SÓ MOSTRAVA O CONTADOR "N SEM INFORMAÇÃO". FRONTEND-ONLY em `Colaboradores.tsx`: `useMemo gradeTamanhos` ganhou `semInfoList` (ativos sem `tamanhoCalcado/Camisa/Calca`, flags `faltaCalcado/Camisa/Calca`); `<Dialog>` ganhou seção rolável com foto/nome/função•obra + badges do que falta; `imprimirSemInfoEpi()` abre janela de impressão com cabeçalho FC + tabela. ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3108** — DOCUMENTOS / RAIO-X DO FUNCIONÁRIO (E TODO O APP) · O LINK "VER" DO ATESTADO (E DE QUALQUER ANEXO PDF/IMAGEM) VOLTOU A ABRIR — ANTES O PREVIEW ABRIA EM BRANCO NO iPad/Safari. CAUSA: disco efêmero → fallback de banco servia 387 arquivos legados com `content_type='application/octet-stream'` (89 JPEGs de atestado) → Safari iOS não renderiza octet-stream em `<img>`/`<iframe>`. SOLUÇÃO (BACKEND SERVE-PATH + UPDATE DE DADOS, ZERO ALTER/DROP/DELETE/SCHEMA): `server/_core/index.ts` ganha `mimeFromKey(key)` (MIME pela extensão) no fallback; HARDENING guarda de PATH TRAVERSAL + tenant guard em `terceiroContratos.listarItens`; DADOS (Neon UPDATE) `uploaded_files.content_type` corrigido em 96 registros. Detalhe: `shared/changelog.ts`.

- **Rev. 3107** — MEDIÇÃO / LEVANTAMENTO DE CAMPO · OS AVISOS DE EXCLUSÃO ("EXCLUIR CONTORNO?", "EXCLUIR FOTO?", "REMOVER PLANTA?", "EXCLUIR SELECIONADOS") DEIXARAM DE USAR O POP-UP NATIVO DO NAVEGADOR (DOMÍNIO/URL FEIO "…replit.dev diz") E PASSARAM A USAR UM `<AlertDialog>` ESTILIZADO DO APP. FRONTEND-ONLY em `MedicaoLevantamento.tsx`: estado `confirmDlg` + helper `askConfirm({title,description,confirmText,onConfirm})` (1 único AlertDialog ao fim); os 4 `confirm()` viraram `askConfirm(...)` com mensagens descritivas + botão vermelho; bulk `excluirSelecionados` movido p/ dentro do `onConfirm` (preserva `bulkBusy`/offline-first). ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3106** — FINANCEIRO / ANÁLISE DE CUSTOS · O MODAL "EDITAR LANÇAMENTO" (DRILL "POR CENTRO DE CUSTO") FOI REDESENHADO (MAIS MODERNO) E PAROU DE CORTAR/SOBREPOR O TEXTO DO DROPDOWN DE CATEGORIA/CENTRO DE CUSTO EM iPad ~768px. FRONTEND-ONLY em `FinanceiroAnaliseCustosDetalhe.tsx`: Categoria/Centro saem do `grid-cols-2` p/ largura total (gatilho largo=popper largo); `SelectContent` ganha `align="start"` + `max-w-[calc(100vw-2rem)]` + `SelectItem whitespace-normal` (quebra em 2 linhas em vez de cortar). `ui/select.tsx` intocado. ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3105** — MEDIÇÃO / LEVANTAMENTO DE CAMPO · O DESENHO DOS CONTORNOS GANHA ESCOLHA DE COR E DE OPACIDADE DO PREENCHIMENTO (ANTES FIXO 18% E COR AUTOMÁTICA POR TIPO). FRONTEND-ONLY (campo `cor` já persistia via `off.saveContorno`): estado em localStorage `corDesenho`/`fillOpacity` (default 0.32); render usa `fillOpacity` variável; Popover "Estilo" (paleta + slider); "Recolorir em massa" na barra de multi-seleção via `recolorContorno` reusando `off.saveContorno` preservando todos os campos. Opacidade é setting global de render; cor é por contorno. ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

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
