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

- **Rev. 3983** — **BANCO DE HORAS: DSR PERDIDO TAMBÉM VIRA DÉBITO DE HORAS (SEPARADO DE ATRASO/FALTA).** A Rev. 3977 já redirecionava atraso/falta para débito no banco de horas; agora o DSR perdido (Lei 605/49 Art. 6º) decorrente dessas faltas também vira débito de horas, num lançamento PRÓPRIO (`tipo='debito_dsr'`, mirror do `'debito_atraso_falta'`), discriminado do atraso/falta. Conversão fixa: cada DSR perdido = 440min (7h33 = 220h/30d), independente do dia da semana. Regra de QUANDO se perde 1 DSR (1/semana com falta injustificada) não mudou. `descontoFaltas` zera (em vez de receber o valor do DSR) quando a empresa usa banco de horas e o funcionário não tem exceção. Frontend (`BancoHoras.tsx`): extrato agora distingue 4 badges (crédito/débito atraso-falta/débito DSR/débito manual), rodapé corrigido para somar TODO débito (bug antigo só contava `tipo==='debito'`), e novos cards de resumo por tipo. ZERO DELETE · ZERO ALTER.

- **Rev. 3982** — **DISSÍDIO: RELATÓRIO DE DIFERENÇAS RETROATIVAS — ORDEM ALFABÉTICA.** Usuário confirmou que o layout de impressão (Rev. 3980) ficou bom, mas a lista não estava em ordem alfabética — vinha ordenada por `valorRetroativo` decrescente (ordem do backend). Fix: `[...rows].sort((a,b)=>a.employeeName.localeCompare(b.employeeName,'pt-BR'))` aplicado tanto na tabela on-screen do Dialog quanto em `handlePrintDissidioRel` (`FolhaPagamento.tsx`), mantendo tela e impressão consistentes. Sem mudança de backend. ZERO DELETE · ZERO ALTER.

### 5 one-liners

- **Rev. 3981** — **VALE ALIMENTAÇÃO: BOTÃO "CALCULAR REAJUSTE" PELO % DO DISSÍDIO.** Campos de VA/café/lanche em Configurações já existiam (`meal_benefit_configs`). Novo: aba "Configuração" de `ValeAlimentacao.tsx` ganha botão "Calcular Reajuste" que abre Dialog com prévia atual→novo de café/lanche/VA/janta calculada com o `percentualReajuste` do `dissidios` do ano informado (data-base maio). Backend: `previewReajusteBeneficios` (query) + `aplicarReajusteBeneficios` (mutation, UPDATE em `meal_benefit_configs` + recalcula `totalVA_iFood`) em `avisoPrevioFerias.ts`. Sem dissídio/percentual inválido → erro explícito. Marca "[Reajuste dissídio ANO: X%]" anexada em `observacoes` p/ rastreabilidade (não bloqueia reaplicação). ZERO DELETE · ZERO ALTER.

- **Rev. 3980** — **DISSÍDIO: LAYOUT DE IMPRESSÃO FEIO/COM COLUNAS CORTADAS — CORRIGIDO.** `handlePrintDissidioRel` reescrito pro padrão de `DashAvisoPrevio.tsx` (HTML auto-contido via `window.open`+`document.write`), corrigindo colunas cortadas por imprimir dentro do Dialog Radix. ZERO DELETE · ZERO ALTER.

- **Rev. 3979** — **DISSÍDIO: BOTÃO IMPRIMIR / PDF NO RELATÓRIO DE DIFERENÇAS RETROATIVAS.** Dialog "Diferenças Salariais Retroativas (Dissídio)" (`FolhaPagamento.tsx`) ganha botão "Imprimir / PDF" no header, seguindo convenção de `DashAvisoPrevio.tsx` (`print-only`+`window.print()`). Sem mudança de backend. ZERO DELETE · ZERO ALTER. *(Superado pela Rev. 3980 — abordagem de impressão trocada.)*

- **Rev. 3978** — **DISSÍDIO: DIFERENÇA RETROATIVA SAI DA FOLHA MENSAL E GANHA ENCARGOS PRÓPRIOS.** A diferença salarial retroativa do dissídio deixou de ser somada em `totalProventos` da folha mensal (`payrollEngine.ts`) — é paga separadamente, com guia própria. O relatório de diferenças agora calcula INSS/IRRF e valor líquido por linha. FGTS 8% informativo. ZERO DELETE · ZERO ALTER.

- **Rev. 3976** — **TERCEIROS: TRIPLE-FIX NOS DOCUMENTOS DE FUNCIONÁRIOS TERCEIROS.** (1) Validade fechava a página: `updateMut.onSuccess` tem `setShowForm(false)` → trocado para `bulkUpdateMut` no onChange inline. (2) Upload não refletia na UI: `onSuccess` agora faz `setForm(f=>({...f,[field]:url}))` antes do refetch + `onError` com toast. (3) Validade de NR-10/NR-33/NR-35 e 8 outros campos nunca salvava: Zod descartava silenciosamente → 11 campos adicionados ao schema do `update`. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3977 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
