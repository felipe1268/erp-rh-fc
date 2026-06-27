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

- **Rev. 3783** — **FINANCEIRO · AUDITORIA COMPLETA CATEGORIAS/CC/PLANO: FOLHA DE PAGAMENTO→CC-0005+FIXO; MEDIÇÃO PJ→CC-0002+3.1.3; PRÓ-LABORE DUPLICATA INATIVADA (1 LANÇAMENTO MIGRADO); BLOQUEIO JUDICIAL PLANO 10→10.1; 0 CATEGORIAS ATIVAS SEM CC OU PLANO. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3782** — **FINANCEIRO · PLANO DE CONTAS: "FOLHA DE PAGAMENTO" VINCULADA A "4.7.1 · SALÁRIOS, HORAS EXTRAS E RESCISÕES — ADMINISTRATIVO". ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3780** — **FINANCEIRO · LANÇAMENTO DUPLICADO REMOVIDO: PIX LACCA R$118.057,70 DE 08/01/2026 (id 885394) ESTAVA DUPLICADO DO id 885382; VÍNCULO DO EXTRATO (id 12570) MOVIDO PARA O ORIGINAL ANTES DA EXCLUSÃO. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3777** — **FINANCEIRO · 13 LANÇAMENTOS DO ROSENDO NUNES ROSA MOVIDOS DE `ALUGUEL - OBRA` → `FRETES - OBRA`. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3776** — **FINANCEIRO · `id 488 · RENDIMENTO FINANCEIRO` DESATIVADA; LANÇAMENTO MIGRADO PARA `id 489 · JUROS E RENDIMENTOS RECEBIDOS`; ALIAS NO MAPA CANÔNICO. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3775** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · CORREÇÃO DE DADOS: 2 VÍNCULOS "CHEQUE DEVOLVIDO ↔ PIX/TED" (DOC 655 · R$9.715 E DOC 1077 · R$7.278,45) ESTAVAM APONTANDO PARA A 1ª COMPENSAÇÃO; MOVIDOS PARA A 2ª COMPENSAÇÃO (MAIS RECENTE, VISÍVEL NA CONCILIAÇÃO). CABEÇALHO DO DIÁLOGO PASSA A MOSTRAR O VALOR CORRETO E O ERRO "JÁ VINCULADA" SOME. MENSAGEM DE ERRO APRIMORADA COM CONTA BANCÁRIA + DATA. APENAS UPDATE EM bank_cheque_vinculos. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3774** — **FINANCEIRO · `id 281` RENOMEADA PARA "Materiais para Obra": CONTA + LANÇAMENTOS + MAPA CANÔNICO. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3773** — **FINANCEIRO · CONTAS DUPLICADAS DE MATERIAIS ELIMINADAS: `id 56 · Materiais e Insumos` E `id 218 · Materiais para Obra` DESATIVADAS; LANÇAMENTOS MIGRADOS PARA `id 281`. MAPA CANÔNICO ATUALIZADO. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3769** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · O DIÁLOGO "VINCULAR CHEQUE DEVOLVIDO A PIX/TED" VOLTA A MOSTRAR O VALOR JÁ VINCULADO NO CABEÇALHO ("VINCULADO R$ X / SALDO R$ Y") MESMO QUANDO O RELATÓRIO ACABOU DE SER RECARREGADO OU AINDA ESTÁ NO 1º LOAD. ANTES, NESSES MOMENTOS, O CABEÇALHO LIA "VINCULADO R$ 0,00" APESAR DE HAVER VÍNCULO ATIVO — E REVINCULAR O MESMO PIX DAVA "ESTA LINHA JÁ ESTÁ VINCULADA A ESTE CHEQUE". FRONTEND READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Caso (Doc 1063 · PIER BRASIL · R$ 4.344,60 · vínculo parcial R$ 3.212,92): o backend (cobertura fresca `_coberturaChequeDevolvido`, usada pelo registrar) ACHAVA o vínculo (daí o "já vinculada"), mas o cabeçalho lia o `vincMap` do LOTE, que zera `data` no 1º load e a cada refetch do report (`refreshAposVinculo` → `refetchReport` → `repDevol`/`vincItens` mudam → lote refetcha). Com `vincMap={}`, cabeçalho e selo "Parcial" da linha caíam a R$ 0,00. Fix (`FinanceiroConciliacao.tsx`): (1) `placeholderData:(prev)=>prev` no lote → mantém o mapa durante refetch (conserta o selo da linha); (2) nova `useQuery` DEDICADA chaveada SÓ pelo cheque aberto (`vincDlgItens`, mesmo endpoint, identidade doc/nº+valor) → `vincDlgInfo` vira fonte AUTORITATIVA do cabeçalho (`info = vincDlgInfo ?? vincMap[debId]`). Cabeçalho passa a espelhar o registrar. Regra de ouro preservada (read-only). Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3768** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · DIÁLOGOS "CONCILIAR PIX NO EXTRATO" E "TROCAR LANÇAMENTO VINCULADO" AGORA PRIORIZAM NO TOPO DA LISTA "CHEQUES DO CONTROLE DE CHEQUES (SEM LANÇAMENTO)" OS CHEQUES CUJO VALOR BATE COM O DA LINHA/PIX SENDO CONCILIADA. BACKEND READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3767** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · VÍNCULO DE CHEQUE DEVOLVIDO ↔ PIX/TED AGORA (a) APARECE DIRETO NA CONCILIAÇÃO (SELO "🔗 SUBSTITUI CHEQUE DEVOLVIDO DOC NNN · R$ X · VÍNCULO POR FULANO" NA LINHA DO EXTRATO) E (b) O CABEÇALHO DO DIÁLOGO "VINCULAR CHEQUE DEVOLVIDO" PARA DE MOSTRAR "VINCULADO R$ 0,00" QUANDO O VÍNCULO EXISTE MAS A LINHA DO CHEQUE TROCOU DE ID NUM RE-IMPORT. BACKEND READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3766** — **FINANCEIRO · DASHBOARD · CONCILIAÇÃO BANCÁRIA · DRILL-DOWN POR ITEM ESPECÍFICO: CLICAR EM UMA FATIA/BARRA DE CATEGORIA (DESPESAS OU RECEITAS) OU EM UM ITEM DO RANKING ABRE OS LANÇAMENTOS INDIVIDUAIS DAQUELA CATEGORIA; CLICAR EM UMA BARRA DE OBRA OU ITEM DO RANKING DE OBRAS ABRE OS LANÇAMENTOS DA OBRA. 2 NOVOS ENDPOINTS BACKEND (READ-ONLY) + FRONTEND. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3765** — **FINANCEIRO · DASHBOARD · CONCILIAÇÃO BANCÁRIA · TODOS OS GRÁFICOS DA TELA GANHARAM DRILL-DOWN (CLIQUE): BARRAS DE MÊS NAVEGAM O SELETOR DE PERÍODO; CONTA BANCÁRIA/FORNECEDOR ABREM DIALOG COM OS LANÇAMENTOS FILTRADOS; CATEGORIA E OBRA ABREM A LISTA AGRUPADA; ITENS DOS TOPLISTCARDS TAMBÉM FICARAM CLICÁVEIS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3764** — **FINANCEIRO · DASHBOARD · CONTROLE DE CHEQUES · GANHOU O FILTRO "MÊS A MÊS": SELETOR WHITE-CARD "PERÍODO" (CHIP "TUDO" + JAN…DEZ, DOT VERDE = COM DADOS / CINZA = SEM DADOS), IGUAL AO DA CONCILIAÇÃO BANCÁRIA (Rev. 3755). 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3763** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · CHEQUES DEVOLVIDOS QUE JÁ TIVERAM AS 2 LINHAS (COMPENSAÇÃO + DEVOLUÇÃO) CONCILIADAS VOLTAM A APARECER NO CARD "CHEQUES DEVOLVIDOS NO BANCO" — MARCADOS COMO "CONCILIADO NO EXTRATO" (RESOLVIDO). BACKEND READ-ONLY · NÃO ALTERA O CÁLCULO DO % · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3762 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
