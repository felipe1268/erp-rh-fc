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

- **Rev. 2752** — **CONFIGURAÇÕES · CENTRAL DE DOCUMENTOS: A PRÉ-VISUALIZAÇÃO (E A NOVA IMPRESSÃO) SAEM 100% FIÉIS AO MODELO INSTITUCIONAL — CABEÇALHO, LOGO, FAIXA AZUL, MARGENS, TIPOGRAFIA E ASSINATURAS.** Pedido (Felipe): o preview/impressão da Central precisa ser a réplica exata do que será impresso — cabeçalho, logo, posição do logo, margens, tipo de texto, modelo. O preview (doc selecionado E modal "Novo Documento" da Rev. 2751) só renderizava o CORPO bruto num `<div class="prose">`; o envelope institucional (header/logo/faixa/margens/assinaturas) só era aplicado pelos GERADORES dos 7 docs fixos via `buildFcDocument`, então docs custom não tinham como ser vistos/impressos como saem. Fix (SÓ CLIENT/UI; ZERO SCHEMA; ZERO SERVER; ZERO ALTER/DROP/DELETE — R-001/R-007/R-010) em `client/src/pages/configuracoes/TemplatesDocsTab.tsx`: (1) NOVO helper puro `buildFcPreviewHtml(bodyHtml,meta,geradoPor)` que monta o documento COMPLETO via `buildFcDocument` (mesmo wrapper canônico dos geradores: logo 64px + fallback `${origin}/logo-fc.jpg`, razão social #1B2A4A, CNPJ/endereço, faixa azul com título, Nº/Data, bloco ASSUNTO, corpo, 2 assinaturas + testemunhas + local/data, rodapé, `@page A4 25mm 15mm`); corpo renderizado com dados de EXEMPLO dos placeholders (que p/ empresa já são os dados reais FC) e SANITIZADO (DOMPurify, `SANITIZE_OPTS` extraída) antes de injetar. (2) `previewHtml` e `novoPreviewHtml` agora chamam o helper e renderizam via `<iframe srcDoc sandbox="allow-same-origin">` (retorno é `<!DOCTYPE html>` completo; isola do CSS do app, sem scripts) — editor h-760px, modal h-46vh. (3) NOVO botão "Imprimir" na barra do editor: `handleImprimir` abre `window.open`, escreve o mesmo HTML e dispara `print()` no load. Ressalva: preview usa valores de exemplo + assinaturas genéricas (empresa+colaborador+2 testemunhas); doc real preenchido segue pelos geradores. Validação: esbuild parse EXIT 0 (sem imports órfãos); `vitest server/rescisao.test.ts` 41/41 verde. Detalhe: `shared/changelog.ts`.
- **Rev. 2751** — **CONFIGURAÇÕES · CENTRAL DE DOCUMENTOS: AGORA DÁ PRA CRIAR DOCUMENTOS NOVOS (ALÉM DOS 7 FIXOS) VIA IA — SUBINDO UM PDF MODELO OU DIGITANDO O ASSUNTO.** Pedido (Felipe): poder criar documentos avulsos na Central, por 2 caminhos com IA — (a) subir PDF modelo → IA lê, reproduz como corpo HTML, troca dados por placeholders e sugere melhorias; (b) digitar o assunto/título → IA gera o texto. Fix (SHARED+SERVER+CLIENT; ZERO SCHEMA; ZERO ALTER/DROP/DELETE — R-001/R-007/R-010): (1) `shared/documentTemplates.ts` — novos helpers `PH_COMUM`, `slugifyDocTipo` (`custom_<slug>` ≤60ch), `isCustomTipo`, `getDocMetaOrFallback(tipo,titulo?)` (meta fixa OU sintética com `PH_COMUM`+ícone FileText). (2) `server/routers/systemDocumentTemplates.ts` — `tipoFlexSchema` (`/^[a-z0-9_]{3,60}$/`) substitui o enum nos endpoints ADMIN get/listVersions/save/restoreVersion/aprovar/marcarObsoleto/voltarParaRascunho; **`getVigente` (NÃO-admin, consumido pelos geradores) PERMANECE em `tipoSchema` (só os 7 fixos) — segurança: impede leitura horizontal de doc custom por slug adivinhado**; `listAll` anexa linhas custom (`isCustom:true`); `get` resolve meta via fallback; NOVO `criarNovo` {titulo,descricao?,conteudoHtml,codigo?} sob advisory-lock GLOBAL constante (serializa criações; evita slug E código `FC-DOC-NNN` duplicados) gera slug único + código auto `FC-DOC-NNN`, insere RASCUNHO+versão 1; `save` só cria fixo (custom vem do `criarNovo`); IAs `iaGerarDoZero`/`iaLerPdfSugerir` com `tipo` opcional + `tituloDoc`. (3) `TemplatesDocsTab.tsx` — `tipoSelecionado:string`, `meta` via `getDocMetaOrFallback` (antes `.find(...)!` quebrava); botão "Novo Documento" + MODAL 2 abas (PDF / assunto) com Título+Código opcional, preview seguro (DOMPurify) e sugestões da IA; mutations dedicadas populam o modal e selecionam o novo tipo ao criar. Ressalva: docs custom NÃO alimentam geradores (avulsos); sem delete (use `marcarObsoleto`); `tipo` já é varchar(60). Validação: esbuild parse EXIT 0 nos 3 arquivos; `vitest server/rescisao.test.ts` 41/41 verde. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2750** — TERCEIROS · CONTRATOS · TESTEMUNHA "GESTOR DE PROJETO" DEIXOU DE SER CAMPO CONFIGURÁVEL — O ERP ADOTA SEMPRE O "ENGENHEIRO / RESPONSÁVEL" DO CADASTRO DA OBRA. Em Config · Terceiros · "Gestores para Contratos" havia 2 seletores (Financeiro + Projeto); o de Projeto era redundante (`obras.responsavel`). Fix (CLIENT+SERVER; ZERO SCHEMA): `GestoresContratoTab` removeu o seletor (grava `gestorProjeto*=null` inerte); `getContrato` devolve `obraResponsavel` e a var `TESTEMUNHA_GESTOR_PROJETO` prioriza `obra?.responsavel`; preview/pré-preenchimento FcSign usam o responsável. Colunas antigas inertes; nada dropado. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2749** — CONFIGURAÇÕES · CENTRAL DE DOCUMENTOS: layout redesenhado para leitura — templates saíram da lateral para um seletor horizontal no topo e a área de texto ficou muito mais larga. `TemplatesDocsTab.tsx` passou o grid de 3/6/3 para 9/3 (editor ~75%); `RichTextEditor.tsx` ganhou prop opcional `readable` (prose-base + leading-relaxed, linha ~820px). SÓ CLIENT/UI; lógica ISO/IA/histórico intacta. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2748** — TESTES · CENTRAL DE DOCUMENTOS ISO: o GATE de aprovação ganhou cobertura automatizada (regressão). Task #60: o gate ISO (editar via `save` OU restaurar via `restoreVersion` um documento VIGENTE rebaixa p/ `rascunho` + LIMPA aprovação, fazendo `getVigente` parar de entregá-lo até nova `aprovar`) só tinha revisão manual. NOVO `server/systemDocumentTemplatesGate.test.ts` (4 casos: save com/sem mudança, restoreVersion, obsoleto). Abordagem (drift): testa funções puras que ESPELHAM o router (padrão do `rescisao.test.ts`), pois no vitest 2.1.9 importar qualquer router quebra com `__vite_ssr_exportName__`. ZERO produção — R-001/R-007/R-010. `vitest` 45/45 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2747** — CONFIGURAÇÕES · CENTRAL DE DOCUMENTOS (TEMPLATES DE DOCUMENTOS) virou a fonte oficial ISO + IA dos 7 documentos institucionais FC (código FC-RH-001..007, status rascunho/vigente/obsoleto, elaborado/aprovado por+data, vigência, próxima revisão), com seed faithful, placeholders pesquisáveis, IA (ler PDF→sugerir / gerar do zero→validar) e os geradores passando a consumir o template VIGENTE (com fallback ao HTML atual). Schema aditivo (9 campos ISO via ALTER IF NOT EXISTS no `[SyncSchema+]`) + fix do bug `column "createdAt"` (nome snake explícito). GATE ISO: mudar conteúdo rebaixa p/ rascunho + limpa aprovação. Auto-seed no boot quando a tabela está vazia. `vitest` 45/45 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2746** — CONFIGURAÇÕES · TERCEIROS · "GESTORES PARA CONTRATOS DE TERCEIROS": os dois seletores (Gestor Financeiro / Gestor de Projeto) viraram campos pesquisáveis por nome e listam SÓ funções da categoria indireta. Antes os `<Select>` listavam todos os ativos (incl. mão de obra direta). Fix (SÓ CLIENT/UI): NOVO `EmployeeCombobox.tsx`; `GestoresContratoTab` classifica via `jobFunctions.categoriaMO` (`indireta_obra`|`escritorio_central`→Indireto) e `withSelected()` reinclui o gestor já salvo. ZERO SERVER/SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

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
