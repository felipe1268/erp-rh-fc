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

- **Rev. 2906** — **COLETA DE CAMPO (RH) — A FILA DE REVISÃO GANHOU SELEÇÃO MÚLTIPLA NA ABA "APROVADAS" E O ADMINISTRADOR MASTER PODE CANCELAR A APROVAÇÃO DE VÁRIAS PESSOAS DE UMA VEZ (VOLTA P/ PENDENTES).** Pedido: "Preciso de múltipla seleção aqui também e, como adm master, poder cancelar as aprovações de múltiplas pessoas — vale para esta tela também" (aba "Aprovadas"; a seleção múltipla já existia só na aba "Pendentes" p/ aprovar em lote — Rev. 2871). SOLUÇÃO (ZERO ALTER/DROP/DELETE — só UPDATE de status): backend `server/routers/coletaRh.ts` nova mutation `cancelarAprovacaoVarias` (gate `assertColetaAdminMaster` SÓ `admin_master` + tenant guard `assertColetaCompanyAccess`) que volta o status `aprovada→pendente` e limpa `revisadoPor/Id/Em` + `motivoRejeicao`, idempotente (pula o que não está aprovada), `{canceladas,ignoradas}`; NÃO desfaz dados já gravados na ficha (não-destrutivo). Front `client/src/pages/ColetaCampo.tsx`: multi-seleção passa a valer na aba "Aprovadas" p/ Adm Master (`modoCancelar`), barra troca "Aprovar selecionados" por "Cancelar aprovação" (`destructive`) com diálogo de confirmação; `useEffect` de reconciliação considera o status da aba ativa. RESSALVA: cancelar só devolve à fila, não reverte a ficha. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2905** — **INSTALAR NO CELULAR (PWA) — AGORA DÁ PRA LIGAR/DESLIGAR O BANNER "INSTALAR" NAS CONFIGURAÇÕES GERAIS DO SISTEMA (POR EMPRESA).** Pedido: "Quero habilitar/desabilitar esta função nas configurações gerais; quero continuar abrindo o sistema em qualquer navegador; baixar é só para uso offline do cadastro de levantamento de campo via Medição — não mude essa lógica." SOLUÇÃO (ADITIVA — só `ADD COLUMN IF NOT EXISTS`, ZERO ALTER/DROP/DELETE destrutivo): nova coluna `pwa_install_banner_ativo SMALLINT DEFAULT 1` em `companies` (`drizzle/schema.ts` + self-heal `[SyncSchema+]` em `server/_core/index.ts`); backend `companies.getPwaBannerConfig` (guard de tenant via `getCompaniesForUser`, default `ativo:true`) + `setPwaBannerConfig` (guard de tenant + admin/admin_master, grava 0/1 + audit log) em `server/routers.ts`; UI novo card "Instalação no Celular (PWA)" com Switch na aba "Critérios do Sistema" (`client/src/pages/Configuracoes.tsx`); `PwaInstallBanner.tsx` lê o flag via `useCompany` e retorna `null` quando desligado (default ativo enquanto carrega). Ajuste de review: instruções "Compartilhar → Adicionar à Tela de Início" restritas ao iOS **Safari** (`isIOSSafari`), demais navegadores iOS orientam a abrir no Safari. NÃO toca a lógica offline do Levantamento de Campo (Rev. 2895) — só a VISIBILIDADE do convite. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2904** — INSTALAR NO CELULAR (PWA) — O BANNER "INSTALAR" AGORA APARECE NO iPad/iPhone (SAFARI), NÃO SÓ NO PC. `client/src/components/PwaInstallBanner.tsx` detecta iOS/iPadOS (UA `iPad|iPhone|iPod` + iPadOS 13+ `MacIntel`/`maxTouchPoints>1`) e, sem `beforeinstallprompt` (exclusivo Chromium), mostra INSTRUÇÕES manuais (Compartilhar → "Adicionar à Tela de Início") restritas ao iOS Safari; mantém botão automático Android/Chrome; some se já instalado; "Fechar" em `sessionStorage`. SÓ CLIENT; ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2903** — COLETA DE CAMPO (RH) — O FORMULÁRIO PÚBLICO SÓ DEIXA ENVIAR QUANDO TODOS OS DADOS SOLICITADOS ESTÃO PREENCHIDOS. `shared/coletaCampos.ts` vira fonte única (`camposFaltantesColeta`/`coletaCompleta`); `client/src/pages/portal/ColetaCampoPublica.tsx` `podeEnviar` exige zero faltantes + aviso âmbar; backend `enviarResposta` aplica a MESMA validação. Exceção: `complemento` opcional; auxiliar opcional. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2902** — COLETA DE CAMPO (RH) — O LINK FECHA SOZINHO E APARECE COMO "CONCLUÍDO" ASSIM QUE TODOS OS FUNCIONÁRIOS ALOCADOS NA OBRA JÁ FORAM COLETADOS. `server/routers/coletaRh.ts` `listarSessoes` conta coletados-distintos (pendente/aprovada) + alocados-ativos e expõe `totalAlocados/coletados/concluida`; `enviarResposta` recomputa e FECHA o link (`ativo=0`) best-effort; `ColetaCampo.tsx` mostra badge azul "Concluído". Adm reativa manualmente. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2901** — COLETA DE CAMPO (RH) — GERAR / EDITAR / EXCLUIR / DESATIVAR LINKS AGORA É EXCLUSIVO DO ADMINISTRADOR (role `admin`) E DO ADMINISTRADOR MASTER. `server/routers/coletaRh.ts` adiciona `assertColetaAdmin(ctx.user)` (admin E admin_master) em `criarSessao`/`criarSessoesTodas`/`desativarSessao`; `getMyPermissions` expõe `isAdmin`; `PermissionsContext` ganha `isAdmin`; `ColetaCampo.tsx` usa `canManage = isAdmin || isAdminMaster` p/ esconder criação + Desativar/Editar/Excluir de não-admins (mantém Copiar link/QR + revisão). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2900** — ASSINATURA ELETRÔNICA (INTEGRASIGN/FcSign) — FIX DE LAYOUT: O BOTÃO "REENVIAR" (E "COPIAR LINK") DA LINHA DE SIGNATÁRIO NÃO VAZA MAIS PARA FORA DO CARD DE DETALHES NO iPad. `client/src/pages/IntegraSignDashboard.tsx` — linha vira responsiva `flex flex-col gap-2 ... sm:flex-row sm:items-center sm:justify-between`; nome ganha `min-w-0`+`break-words`; grupo de ações ganha `flex-wrap shrink-0` (quebra dentro do card em vez de vazar). SÓ CLIENT; ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
