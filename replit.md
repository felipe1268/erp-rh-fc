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

- **Rev. 2912** — **COLETA DE CAMPO (RH) · LISTA DE LINKS — AGORA FICA EXPLÍCITO QUANTOS FUNCIONÁRIOS AINDA FALTAM COLETAR EM CADA OBRA, NÃO SÓ "X/Y COLETADO(S)".** Pedido (usuário): "PRECISA FICAR CLARO QUANTOS FALTAM PARA COLETAR OS DADOS EM CADA OBRA" (print da tela "Coleta de Campo" com linhas tipo "QIU 2 - FASE 4 · 38/41 coletado(s)"). Os dados JÁ existiam no backend (`listarSessoes` expõe `coletados`/`totalAlocados` desde a Rev. 2902), mas o usuário tinha que fazer a conta de cabeça e a info de "quanto falta" não estava destacada. SOLUÇÃO (FRONTEND — ZERO ALTER/DROP/DELETE): em `client/src/pages/ColetaCampo.tsx`, badge laranja "Faltam N de TOTAL" ao lado dos badges de status (só quando NÃO concluída, há alocados e restam pendentes) + a linha-resumo acrescenta "· faltam N" (ou "· completo" quando zerado) após "X/Y coletado(s)". `faltam = totalAlocados − coletados`. Sem mudança de backend/schema. Detalhe: `shared/changelog.ts`.
- **Rev. 2911** — **CONTROLE DE EPIs · ABA "ENTREGAS" — A BUSCA AGORA É SERVER-SIDE E VARRE TODAS AS PÁGINAS. ANTES, BUSCAR POR NOME (EX.: "JAMES") SÓ FILTRAVA A PÁGINA DE 50 JÁ CARREGADA — QUEM TINHA ENTREGA FORA DO TOP-50 MAIS RECENTE SUMIA DA BUSCA, MESMO COM FICHA/ENTREGAS REGISTRADAS.** Pedido (admin_master): "JAMES não aparece na lista de EPI pra mim, mas aparece pro Leonardo" (print com "Nenhuma entrega registrada" ao buscar "james"; rodapé "Página 2 de 8"). DIAGNÓSTICO (via Neon): JAMES (id 31, empresa 60002, Ativo) TEM 4 entregas ativas (12–25/05/2026, posições 63/64/94/127 na ordem `dataEntrega DESC`); os endpoints de EPI filtram SÓ por empresa (a obra 90004 no `allowed_obra_ids` do Leonardo é PISTA FALSA — `listDeliveries`/`getEmployees` ignoram obra). Causa real: a aba Entregas pagina 50/50 e a busca era CLIENT-SIDE só sobre a página carregada (`filteredDeliveries`) → James caía na página 2. Afetava 51 dos 83 funcionários da 60002. SOLUÇÃO (ZERO ALTER/DROP/DELETE — só leitura): `server/routers/epis.ts` `listDeliveries` ganhou input opcional `search` (OR ilike nome/função/EPI/CA no WHERE; `leftJoin(epis)`/`leftJoin(employees)` replicados na query de COUNT; imports `ilike, or`); `client/src/pages/Epis.tsx` passa `search: debouncedSearch` à `deliveriesQ`, reseta `deliveriesPage` no debounce, e `filteredDeliveries` parou de re-filtrar por texto no cliente (mantém só o filtro de assinatura) — import órfão `removeAccents` removido. RESSALVA: filtro/contadores de "Assinatura" seguem client-side por página (pré-existente). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2910** — PWA "ABRIR NO APP"/"INSTALAR" — O NAVEGADOR NÃO OFERECE MAIS INSTALAR/ABRIR O ERP COMO APP. Removidos o `<link rel="manifest">` e as meta tags `*-web-app-capable` de `client/index.html` (o site deixou de ser PWA instalável → some a UI nativa "Abrir no app" do Chrome). MANTIDOS de propósito: registro do SW `/sw.js` (prod) e `client/public/manifest.json` órfão — o offline do Levantamento de Campo (Rev. 2895) depende de SW+IndexedDB+fila, não do manifest. Quem JÁ instalou precisa desinstalar manualmente. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2909** — CANCELAMENTO EM CASCATA (ADMIN MASTER) — O SÓCIO CANCELA UMA OC/OS COM SENHA+MOTIVO, CASCATEANDO P/ O CONTRATO (VIRA "CANCELADO", PRESERVA HISTÓRICO) E P/ O FINANCEIRO NÃO PAGO; A EXCLUSÃO DEFINITIVA DO CONTRATO PASSA A EXIGIR SENHA+MOTIVO. Colunas de rastro `cancelado_por/em/motivo` em `comprasOrdens`+`terceiroContratos` (self-heal ADD COLUMN IF NOT EXISTS); helper `cancelarContratoCascade` (cancela contrato + medições/OCs/financeiros não pagos), mutations `compras.cancelarOrdemMaster`/`terceiroContratos.cancelarContratoMaster`, `excluirContrato` gated por senha+motivo; front `Ordens.tsx`+`ContratoDetalhe.tsx` com diálogo senha+motivo. Pagos intactos. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2908** — INSTALAR NO CELULAR (PWA) — O BANNER "INSTALAR NO CELULAR" FOI REMOVIDO COMPLETAMENTE DO ERP (UI + CONFIGURAÇÃO + ENDPOINTS); A INFRA OFFLINE DO LEVANTAMENTO DE CAMPO (Rev. 2895) PERMANECE INTOCADA. Removido `<PwaInstallBanner />`+import (`App.tsx`), DELETADO o componente, removidos card "Instalação no Celular (PWA)" + hooks `get/setPwaBannerConfig` (`Configuracoes.tsx`) e endpoints `companies.get/setPwaBannerConfig` (`server/routers.ts`); coluna `companies.pwa_install_banner_ativo` mantida inerte (R-001). Complementada pela Rev. 2910 (instalabilidade do PWA removida). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2907** — RECONTRATAÇÃO · SUPLENTES DE APROVAÇÃO — A TELA AGORA MOSTRA OS DEMAIS SÓCIOS (ADMIN MASTER) COMO APROVADORES TITULARES, PRA OUTRO SÓCIO PODER LIBERAR/RECUSAR QUANDO O TITULAR NÃO PUDER. Backend `recontratacao.ts` JÁ permitia qualquer `admin_master` aprovar (`assertPodeAprovar`) e `getSuplentes` já retornava todos os usuários; o gap era SÓ de visibilidade. Frontend-only `Configuracoes.tsx` (`RecontratacaoAprovadoresSection`): bloco só-leitura âmbar "Aprovadores titulares (sócios)" com badge "TITULAR"; lista de suplentes inalterada. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2906** — COLETA DE CAMPO (RH) — A FILA DE REVISÃO GANHOU SELEÇÃO MÚLTIPLA NA ABA "APROVADAS" E O ADM MASTER PODE CANCELAR A APROVAÇÃO DE VÁRIAS PESSOAS DE UMA VEZ (VOLTA P/ PENDENTES). Backend `server/routers/coletaRh.ts` nova mutation `cancelarAprovacaoVarias` (gate `assertColetaAdminMaster` + tenant guard) volta `aprovada→pendente` e limpa `revisadoPor/Id/Em`+`motivoRejeicao`, idempotente, `{canceladas,ignoradas}`; NÃO desfaz a ficha. Front `ColetaCampo.tsx`: multi-seleção na aba "Aprovadas" (`modoCancelar`) + diálogo de confirmação. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2905** — INSTALAR NO CELULAR (PWA) — AGORA DÁ PRA LIGAR/DESLIGAR O BANNER "INSTALAR" NAS CONFIGURAÇÕES GERAIS (POR EMPRESA). Nova coluna `pwa_install_banner_ativo SMALLINT DEFAULT 1` em `companies` (`drizzle/schema.ts` + self-heal `[SyncSchema+]`); `companies.getPwaBannerConfig`/`setPwaBannerConfig` (guard de tenant + admin) em `server/routers.ts`; card "Instalação no Celular (PWA)" com Switch na aba "Critérios do Sistema" (`Configuracoes.tsx`); `PwaInstallBanner.tsx` retorna `null` quando desligado. NÃO toca a lógica offline (Rev. 2895). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`. (REVOGADA pela Rev. 2908 — banner removido.)

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
