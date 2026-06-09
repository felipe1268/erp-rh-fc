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

- **Rev. 2914** — **CONTROLE DE EPIs · NOVA ABA "NECESSIDADE" — CRUZA OS TAMANHOS CADASTRADOS DE CADA FUNCIONÁRIO ATIVO (CAMISA/CALÇA/CALÇADO) COM O ESTOQUE TOTAL (CENTRAL + OBRAS), DESCONTA O QUE JÁ FOI ENTREGUE E MOSTRA QUANTO FALTA COMPRAR POR TAMANHO.** Pedido (usuário): saber, por TAMANHO, quanto comprar para vestir todo o efetivo ativo sem comprar a mais p/ quem já recebeu. Decisões: necessidade CONFIGURÁVEL por tipo (default 1); estoque TOTAL central+obras; DESCONTAR entregas. SOLUÇÃO (ZERO ALTER/DROP/DELETE — só ADD COLUMN IF NOT EXISTS + leitura): schema `drizzle/schema.ts` companies `epiNecCamisa/Calca/Calcado` SMALLINT default 1 + self-heal `server/_core/index.ts` (3× ADD COLUMN IF NOT EXISTS); backend `server/routers/epis.ts` `getNecessidadeConfig`/`setNecessidadeConfig` (clamp 0..99) + `necessidadeVsEstoque` ({companyId, companyIds?}) que classifica buckets (calçado=cat 'Calcado'; calça='Uniforme'+tamanho numérico; camisa='Uniforme'+letra), por funcionário `liquida=max(0,necessidade−jaEntregue)` no SEU tamanho, agrega por (bucket,tamanho) com `deficit=max(0,liquida−estoque)` e `semTamanho`; front novo `client/src/pages/EpiNecessidade.tsx` (editor 3 inputs+Salvar quando !readOnly, cards-resumo, 3 tabelas com "A comprar" em vermelho + alerta "N sem tamanho"), wire em `Epis.tsx` (aba ShoppingCart "Necessidade"). Detalhe: `shared/changelog.ts`.
- **Rev. 2913** — **COLETA DE CAMPO (RH) · LISTA DE LINKS — AGORA DÁ PRA CLICAR EM "FALTAM N DE TOTAL" E VER NOMINALMENTE QUEM AINDA FALTA COLETAR EM CADA OBRA (NÃO SÓ O NÚMERO).** Pedido (usuário): "Preciso poder clicar e ver quem está faltando em cada obra" (a Rev. 2912 mostrava o NÚMERO, não QUEM). SOLUÇÃO (ZERO ALTER/DROP/DELETE — só leitura): backend `server/routers/coletaRh.ts` nova query `listarFaltantesSessao` (valida sessão+tenant, lista funcionários ATIVOS alocados ∩ coletados pendente/aprovada, dedup por employeeId, retorna `{obraNome,total,coletados,faltantes,funcionarios:[{employeeId,nome,funcao,coletado}]}` faltantes-primeiro); front `client/src/pages/ColetaCampo.tsx` transforma o badge laranja num botão (ícone Users) que abre um Dialog com seções "Faltam coletar (N)" + "Já coletados (N)" (nome+função), com loading/erro/vazio. Mesma régua da Rev. 2902/2912; sem mudança de schema. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2912** — COLETA DE CAMPO (RH) · LISTA DE LINKS — AGORA FICA EXPLÍCITO QUANTOS FUNCIONÁRIOS AINDA FALTAM COLETAR EM CADA OBRA, NÃO SÓ "X/Y COLETADO(S)". Dados JÁ existiam no backend (`listarSessoes` expõe `coletados`/`totalAlocados` desde a Rev. 2902); FRONTEND-only em `client/src/pages/ColetaCampo.tsx`: badge laranja "Faltam N de TOTAL" (só quando NÃO concluída, há alocados e restam pendentes) + "· faltam N"/"· completo" na linha-resumo. `faltam = totalAlocados − coletados`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2911** — CONTROLE DE EPIs · ABA "ENTREGAS" — A BUSCA AGORA É SERVER-SIDE E VARRE TODAS AS PÁGINAS. Antes, buscar por nome (ex.: "JAMES") só filtrava a página de 50 já carregada → quem tinha entrega fora do top-50 mais recente sumia da busca. `server/routers/epis.ts` `listDeliveries` ganhou input `search` (OR ilike nome/função/EPI/CA no WHERE + joins replicados no COUNT); `client/src/pages/Epis.tsx` passa `search: debouncedSearch`, reseta página no debounce e parou de re-filtrar texto no cliente. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2910** — PWA "ABRIR NO APP"/"INSTALAR" — O NAVEGADOR NÃO OFERECE MAIS INSTALAR/ABRIR O ERP COMO APP. Removidos o `<link rel="manifest">` e as meta tags `*-web-app-capable` de `client/index.html` (o site deixou de ser PWA instalável → some a UI nativa "Abrir no app" do Chrome). MANTIDOS de propósito: registro do SW `/sw.js` (prod) e `client/public/manifest.json` órfão — o offline do Levantamento de Campo (Rev. 2895) depende de SW+IndexedDB+fila, não do manifest. Quem JÁ instalou precisa desinstalar manualmente. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2909** — CANCELAMENTO EM CASCATA (ADMIN MASTER) — O SÓCIO CANCELA UMA OC/OS COM SENHA+MOTIVO, CASCATEANDO P/ O CONTRATO (VIRA "CANCELADO", PRESERVA HISTÓRICO) E P/ O FINANCEIRO NÃO PAGO; A EXCLUSÃO DEFINITIVA DO CONTRATO PASSA A EXIGIR SENHA+MOTIVO. Colunas de rastro `cancelado_por/em/motivo` em `comprasOrdens`+`terceiroContratos` (self-heal ADD COLUMN IF NOT EXISTS); helper `cancelarContratoCascade` (cancela contrato + medições/OCs/financeiros não pagos), mutations `compras.cancelarOrdemMaster`/`terceiroContratos.cancelarContratoMaster`, `excluirContrato` gated por senha+motivo; front `Ordens.tsx`+`ContratoDetalhe.tsx` com diálogo senha+motivo. Pagos intactos. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2908** — INSTALAR NO CELULAR (PWA) — O BANNER "INSTALAR NO CELULAR" FOI REMOVIDO COMPLETAMENTE DO ERP (UI + CONFIGURAÇÃO + ENDPOINTS); A INFRA OFFLINE DO LEVANTAMENTO DE CAMPO (Rev. 2895) PERMANECE INTOCADA. Removido `<PwaInstallBanner />`+import (`App.tsx`), DELETADO o componente, removidos card "Instalação no Celular (PWA)" + hooks `get/setPwaBannerConfig` (`Configuracoes.tsx`) e endpoints `companies.get/setPwaBannerConfig` (`server/routers.ts`); coluna `companies.pwa_install_banner_ativo` mantida inerte (R-001). Complementada pela Rev. 2910 (instalabilidade do PWA removida). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
