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

- **Rev. 2755** — **RH/DP · RECONTRATAÇÃO DE FUNCIONÁRIOS DESLIGADOS COM LIBERAÇÃO DO SÓCIO (FILA DE APROVAÇÃO EM SEPARADO) — NADA VIRA FUNCIONÁRIO ATÉ A LIBERAÇÃO; FICHA/RAIO-X NOVO LIGADO AO ANTIGO POR CPF.** Pedido (Felipe, aprovado): recontratar quem já trabalhou na FC sem refazer cadastro, mas com CONTROLE — o sócio (ou suplente) LIBERA antes de virar colaborador. Fix (SCHEMA ADITIVO + SERVER + CLIENT; ZERO ALTER DESTRUTIVO/DROP/DELETE — R-001/R-007/R-010): (1) `drizzle/schema.ts` — NOVA tabela `recontratacao_solicitacoes` (staging) + colunas aditivas em `employees` (`recontratado_de_employee_id`/`recontratado_de_company_id`/`recontratado_data`), garantidas por `CREATE TABLE/ADD COLUMN IF NOT EXISTS` no `[SyncSchema+]`. (2) Critérios (`server/routers.ts` initDefaults): `recontratacao_prazo_resolucao_dias=30`, `recontratacao_carencia_dias=90`, `recontratacao_permitir_experiencia_funcao_diferente=1`; categoria `recontratacao` auto-render em Config·Critérios. (3) NOVO router `server/routers/recontratacao.ts` (verificarCpf, getDadosCopia, criarSolicitacao [notifica tela+e-mail], listarSolicitacoes, contarPendentes, aprovar [cria colaborador NOVO + link], recusar, souAprovador, get/setSuplentes, cardRecontratados); aprovador = admin_master + suplentes. (4) `Colaboradores.tsx` — banner âmbar no CPF com vínculo anterior + alerta jurídico de experiência (CLT/TST: mesma empresa+mesma função = SEM experiência) + carência; picker de blocos a copiar; botão "Enviar para liberação do sócio". (5) `Configuracoes.tsx` — `RecontratacaoAprovadoresSection` (suplentes; só master grava). (6) NOVA página `RecontratacoesPendentes.tsx` (fila + card métrico "Recontratados" com tempo fora médio e link Raio-X), rota `/recontratacoes-pendentes`, sidebar RH/DP, ModuleContext, `shared/modules.ts`, Home alerta + `notifications.ts`. (7) `RaioXFuncionario.tsx` — banner/badge "Recontratado de [código]" (raioX enriquecido com `recontratadoDeCodigo` em `controleDocumentos.ts`). **HARDENING (code review):** gate de staging fechado (`employees.create` ramo `_recontratacao` agora SEMPRE lança e direciona à fila); tenancy/IDOR via `assertAcessoEmpresas`/`empresasGrupoPermitidas` em todos os reads de recontratação + `notifications.pendingRequestCounts` (servidor nunca confia no companyId do cliente); `getSuplentes` só devolve PII ao admin_master; `criarSolicitacao` exige vínculo desligado/inativo do grupo permitido com CPF coincidente. Validação: esbuild parse client+server EXIT 0; `vitest server/rescisao.test.ts` 41/41 verde; architect PASS. Detalhe: `shared/changelog.ts`.
- **Rev. 2754** — **CONFIGURAÇÕES · CENTRAL DE DOCUMENTOS: AGORA DÁ PRA EXCLUIR UM DOCUMENTO (SOFT-DELETE) — SAI DA CENTRAL E DO CONSUMO DOS MÓDULOS, SEM APAGAR NADA FISICAMENTE.** Pedido (Felipe): "preciso ter a opção de apagar o documento". Faltava REMOVER um doc da lista (custom criado por engano ou fixo sem uso); "Obsoleto" só tira do consumo. Fix (SCHEMA ADITIVO + SERVER + CLIENT; ZERO ALTER DESTRUTIVO/DROP/DELETE FÍSICO — R-001/R-007/R-010): (1) `drizzle/schema.ts` — NOVA coluna `deleted_at TIMESTAMP` (nullable) em `system_document_templates`, garantida por `ALTER ... ADD COLUMN IF NOT EXISTS` no `[SyncSchema+]` (`server/_core/index.ts`). (2) `server/routers/systemDocumentTemplates.ts` — NOVO `excluir(tipo)` (admin) carimba `deleted_at=NOW()` (jamais DELETE físico); TODAS as leituras filtram `isNull(deletedAt)` (`listAll`/`get`/`listVersions`/`getVigente`); `save` volta `deleted_at=null` (re-salvar REVIVE); `seedDefaults` REVIVE fixo excluído via UPDATE (não INSERT — evita violar uniq `tipo`). (3) `client/.../TemplatesDocsTab.tsx` — mutation `excluirMut` + botão "Excluir" (vermelho, `Trash2`) com `confirm()` diferente p/ custom (some de vez) vs fixo (recriável em "Inicializar padrões"); deseleciona e invalida. Ressalva: custom excluído não tem lixeira na UI; slug fica reservado. Validação: esbuild parse client+server EXIT 0; `vitest server/rescisao.test.ts` 41/41 verde. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2753** — CONFIGURAÇÕES · CENTRAL DE DOCUMENTOS: A GERAÇÃO POR IA AGORA MOSTRA BARRA DE PROGRESSO 0–100% E NUNCA PASSA DE ~1 MINUTO. `server/routers/systemDocumentTemplates.ts` ganhou `withTimeout(promise, 58_000)` (folga p/ o limite de 60s do proxy) em `iaGerarDoZero` (agora `fast: true`) e `iaLerPdfSugerir`; `client/.../TemplatesDocsTab.tsx` ganhou hook `useIaProgress` + `IaProgressBar` (estimativa rumo a 95% em ~55s, crava 100% ao terminar). Ressalva: progresso é estimativa visual; garantido é o TETO de ~1 min. SERVER+CLIENT; ZERO SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2752** — CONFIGURAÇÕES · CENTRAL DE DOCUMENTOS: A PRÉ-VISUALIZAÇÃO (E A NOVA IMPRESSÃO) SAEM 100% FIÉIS AO MODELO INSTITUCIONAL — CABEÇALHO, LOGO, FAIXA AZUL, MARGENS, TIPOGRAFIA E ASSINATURAS. NOVO helper `buildFcPreviewHtml(bodyHtml,meta,geradoPor)` monta o doc COMPLETO via `buildFcDocument` (mesmo wrapper dos geradores) com dados de EXEMPLO + DOMPurify; `previewHtml`/`novoPreviewHtml` renderizam via `<iframe srcDoc sandbox="allow-same-origin">`; NOVO botão "Imprimir" (`handleImprimir`→`window.open`+`print()`). SÓ CLIENT/UI; ZERO SCHEMA/SERVER. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2751** — CONFIGURAÇÕES · CENTRAL DE DOCUMENTOS: AGORA DÁ PRA CRIAR DOCUMENTOS NOVOS (ALÉM DOS 7 FIXOS) VIA IA — SUBINDO UM PDF MODELO OU DIGITANDO O ASSUNTO. Helpers `PH_COMUM`/`slugifyDocTipo`/`isCustomTipo`/`getDocMetaOrFallback`; router com `tipoFlexSchema` (admin) mantendo `getVigente` nos 7 fixos (segurança), `criarNovo` sob advisory-lock global (slug+código `FC-DOC-NNN` únicos), `listAll` anexa custom; UI com botão "Novo Documento" + modal 2 abas (PDF / assunto). Ressalva: docs custom não alimentam geradores. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2750** — TERCEIROS · CONTRATOS · TESTEMUNHA "GESTOR DE PROJETO" DEIXOU DE SER CAMPO CONFIGURÁVEL — O ERP ADOTA SEMPRE O "ENGENHEIRO / RESPONSÁVEL" DO CADASTRO DA OBRA. Em Config · Terceiros · "Gestores para Contratos" havia 2 seletores (Financeiro + Projeto); o de Projeto era redundante (`obras.responsavel`). Fix (CLIENT+SERVER; ZERO SCHEMA): `GestoresContratoTab` removeu o seletor (grava `gestorProjeto*=null` inerte); `getContrato` devolve `obraResponsavel` e a var `TESTEMUNHA_GESTOR_PROJETO` prioriza `obra?.responsavel`; preview/pré-preenchimento FcSign usam o responsável. Colunas antigas inertes; nada dropado. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2749** — CONFIGURAÇÕES · CENTRAL DE DOCUMENTOS: layout redesenhado para leitura — templates saíram da lateral para um seletor horizontal no topo e a área de texto ficou muito mais larga. `TemplatesDocsTab.tsx` passou o grid de 3/6/3 para 9/3 (editor ~75%); `RichTextEditor.tsx` ganhou prop opcional `readable` (prose-base + leading-relaxed, linha ~820px). SÓ CLIENT/UI; lógica ISO/IA/histórico intacta. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

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
