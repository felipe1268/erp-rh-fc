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
- `server/`: Express backend + tRPC routers
  - `server/_core/`: Auth, OAuth, Vite setup, env config
  - `server/routers/`: tRPC routers per módulo
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (`shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> **Convenção (importante)**: este arquivo guarda APENAS as últimas **5 revisões**, em formato curto (1–3 linhas: o quê + por quê).
> Quando entrar uma nova revisão, **remova a mais antiga daqui** — o histórico completo (com causa-raiz, stack traces, nomes de arquivos, etc.) vive em `shared/changelog.ts`.
> Não duplique conteúdo entre os dois arquivos.

- **Rev. 1862**: **Cronograma · Cascata Responsável Manual — fix detecção de descendentes (EAP-prefix vs nivel)**. User (16/05/2026, pós Rev. 1860): 'Não tá funcionando' — modal de cascata não abria ao sair do campo. **Causa**: `PlanejamentoDetalhe.tsx` L4047 (Rev. 1860) detectava descendentes via `nivel` — quebrava no 1º filho quando `nivel` vem `undefined` (comum em imports MSP). Resto do arquivo (L3902 hasChildren) usa **prefixo EAP**, que é confiável. **Fix (1 hunk L4047-4072)**: estratégia híbrida — se `a.eapCodigo` existe, scan `linhas` por `l.eapCodigo.startsWith(parentEap + '.')` (toda subárvore qualquer profundidade); senão fallback no loop por nivel original. Particionamento semValor/comValor + AlertDialog 3-ações intactos. **Preservado**: ZERO backend; outras lógicas com `nivel` (Gantt, render, indent) não tocadas. Reversível em 1 hunk. R-001 OK.
- **Rev. 1861**: **DDS · Biblioteca expandida — 172 novos temas únicos (total 205)**. User (16/05/2026, screenshot DDSGuia mostrando '33 tema(s) cadastrado(s)'): 'Cria mais o temas, importantes a serem tratados, quero uma biblioteca grande com 200 temas, não repetidos ok'. **Solução (1 arquivo novo + 1 hunk em dds.ts)**: novo `server/_shared/temasBiblioteca.ts` com array `TEMAS_BIBLIOTECA` de 172 entradas (codigo+titulo+descricao+norma+categoria+pontosChave[]+reforco) cobrindo: 22 NRs restantes (NR-02/03/04/05/07/08/09/13/14/15/16/19/21/22/25/28/29/30/31/32/34/36/37/38), 27 atividades de obra (escavação, demolição, içamento, alvenaria, telhado, fachada, etc), 24 equipamentos (esmerilhadeira, serra, betoneira, balancim, etc), 15 EPI específicos, 15 saúde física, 15 saúde mental, 15 riscos (ruído/calor/sílica/dengue/etc), 10 emergência (RCP/queimadura/etc), 5 trânsito, 10 documentação (CAT/ASO/PGR/etc), 10 cultura (5S/near miss/CIPA/etc). Helper `buildRoteiroLib(t)` gera markdown estruturado padrão (Objetivo/Por que/Pontos-chave/Aplicação/Perguntas/Reforço). Plug no `seedTemasPadrao` (L996) com mesma idempotência por codigo dos loops existentes. Categoria respeita t.categoria (NR ou LIVRE). **Preservado**: ZERO schema/contrato; ROTEIROS_DETALHADOS original intacto; UI DDSGuia.tsx não tocada (agrupa por categoria automaticamente); enum 'LIVRE' já existia. Reversível em 2 hunks. R-001 OK.
- **Rev. 1860**: **Cronograma · Responsável Manual em pai → cascata para descendentes (com confirmação)**. User (16/05/2026, screenshot Cronograma QIU 2): 'caso o usuário preencher o nome de alguma atividade que seja pai e tenha filhos abaixo dela, todas elas assumem que o responsável será o nome informado automaticamente'. Decisões de UX (perguntadas): perguntar na hora quando há conflito; cascata até as folhas. **Fix (PlanejamentoDetalhe.tsx, 3 hunks)**: (1) state `cascadeResp` + ref `respOriginalRef` (snapshot no focus). (2) Input ResponsávelManual ganha `onFocus`/`onBlur` — detecta mudança real, scan forward em `linhas` por descendentes (`nivel > parent.nivel` até quebra), particiona em `semValor`/`comValor`. (3) AlertDialog 3-ações: 'Cancelar' (só pai), 'Só os N vazios' (cyan claro, condicional), 'Sobrescrever todos os N' (cyan sólido). Aplica `setLinhas(... responsavelLotus + _respManual=true)` + toast. **Preservado**: ZERO backend/schema; cascata só client (persiste ao Salvar); reversível em 3 hunks. R-001 OK.
- **Rev. 1859**: **Visão Geral · Histórico de REFIs — seleção múltipla para exclusão em lote (admin)**. User (16/05/2026, screenshot pós-Rev. 1858): 'Faz seleção múltipla para apagar várias juntas'. **Backend (planejamento.ts L1991-2000)**: novo endpoint `deletarRefisLote(ids: number[].min(1).max(100))` admin-only, single `db.delete().where(inArray(...))` atômico. **Client (PlanejamentoDetalhe.tsx, 4 hunks no VisaoGeral)**: (1) state `selectedRefisIds: Set<number>`+`confirmBulkDelete`+mutation. (2) Barra de ações condicional (contador, Limpar, botão vermelho 'Excluir N REFIs'). (3) Nova coluna checkbox (admin) — header faz select-all/clear; linha selecionada highlight `bg-red-50`; `stopPropagation` no input/td para não abrir modal de view. (4) AlertDialog lista REFIs selecionados (Nº+semana BR+status, max-h-40 overflow); `asChild` para evitar `<div>` dentro de `<p>`. **Preservado**: ZERO schema; `deletarRefis` (single) intacto; aba REFIS não tocada; ordem nº DESC mantida; não-admins sem checkbox. Reversível em 4 hunks. R-001/R-007 OK.
- **Rev. 1858**: **Visão Geral · Histórico de REFIs — botão Excluir + ordenação por nº (admin)**. User (15/05/2026, screenshot QIU 2 - FASE 4): 'Apague estes refis pq vamos gerar novamente e deixa organizado pela numeração sempre'. Antes: ordem `semana DESC` do backend (014, 002, 003, 011…); sem UI de delete. **Por que via UI e não SQL**: dados estão em PROD (R-001/R-007). **Fix (4 hunks em PlanejamentoDetalhe.tsx)**: (1) L1865-1875 novo state+mutation `deletarRefisVisaoMut` (reusa endpoint existente, admin-only para consolidado). (2) L2257 nova coluna 'Ações' (admin). (3) L2261 sort `[...refisLista].sort((a,b)=>(b.numero??0)-(a.numero??0))` — sempre por nº DESC. (4) L2281-2293 botão Trash por linha + `stopPropagation` (não abre modal). (5) L2301-2326 AlertDialog confirma 'não pode ser desfeita' + mostra Nº/semana BR/status, Action vermelho, disabled durante pending. **Preservado**: ZERO backend/schema; aba REFIS interna intacta; backend continua `semana DESC` (só display reordenado); não-admins não veem coluna. Reversível em 4 hunks. R-001/R-007 OK.
