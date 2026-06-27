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

- **Rev. 3754** — **AUDIT LOG · CONTINUAÇÃO DO Rev. 3753 NOS DEMAIS CALL-SITES: 11 CHAMADAS `createAuditLog(db, {...})` (2 ARGS) EM `financial.ts` (7) E `heSolicitacoes.ts` (4) PASSAVAM O `db` COMO `data`, DESCARTANDO O PAYLOAD E ENGOLINDO O INSERT NO try/catch → O LOG DE AUDITORIA NUNCA ERA GRAVADO (A FEATURE SEGUIA OK). PADRONIZADAS P/ `createAuditLog({...})` (1 ARG, ASSINATURA REAL EM `server/db.ts`, QUE OBTÉM O `db` INTERNAMENTE). 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Fix uniforme `await createAuditLog(db, {` → `await createAuditLog({` (objeto inalterado; nenhum dependia do `db` posicional). Não restam mais call-sites de 2 args (`rg "createAuditLog\(db"` = só a definição). `tsc` limpo; app HTTP 200. Arquivos: `server/routers/financial.ts`, `server/routers/heSolicitacoes.ts`. Detalhe: `shared/changelog.ts`.

- **Rev. 3753** — **CONCILIAÇÃO BANCÁRIA · "ERRO AO DESCONSIDERAR" — AO CLICAR EM "DESCONSIDERAR DA CONCILIAÇÃO" NUM CHEQUE DEVOLVIDO O TOAST MOSTRAVA "Failed to execute 'json' on 'Response': Unexpected end of JSON input" (CORPO VAZIO = QUEDA DE TRANSPORTE; SERVIDOR REINICIANDO/CONEXÃO INSTÁVEL), MESMO COM A ALTERAÇÃO POSSIVELMENTE APLICADA. ALÉM DISSO, O AUDIT LOG DE DESCONSIDERAR/RECONSIDERAR NUNCA ERA GRAVADO. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Diagnóstico (Neon): a mensagem é o cliente tRPC falhando `Response.json()` sobre corpo vazio (queda de transporte), NÃO erro de regra (estes voltam JSON legível); o par É elegível (CHEQUE COMPENSADO Doc 978 id 12981 −3205,15 + CHEQUE DEVOLVIDO MOT 11 Doc 978 id 12982 +3205,15, ambos `conciliado=0`) → a mutation TERIA sucesso. Bug latente: `desconsiderarChequeDevolvido`/`reconsiderarChequeDevolvido` chamavam `createAuditLog(db,{...})` (2 args) sendo que a função aceita 1 (`createAuditLog(data)`) → payload ignorado, audit silencioso no try/catch. Fix: (1) backend `createAuditLog({...})` nas 2 mutations; (2) frontend — como são IDEMPOTENTES (`desconsiderado_em`), `onError` distingue queda de transporte (json/failed to fetch/load failed/networkerror/aborted) e então recarrega (`repintarConciliacao`) + aviso PT "Conexão instável", enquanto erros de negócio seguem mostrando a mensagem real. Arquivos: `server/routers/financial.ts`, `client/src/pages/financeiro/FinanceiroConciliacao.tsx`. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3752** — **CONCILIAÇÃO BANCÁRIA · OS DIÁLOGOS "CONCILIAR PIX NO EXTRATO" E "TROCAR LANÇAMENTO VINCULADO" SÓ BUSCAVAM EM `financial_entries` — CHEQUES QUE EXISTEM SÓ NO CONTROLE DE CHEQUES (`financial_cheques`), SEM LANÇAMENTO DE DESPESA, NÃO APARECIAM COMO CANDIDATOS. AGORA OS 2 DIÁLOGOS INCLUEM OS CHEQUES PENDENTES NA BUSCA, MOSTRAM O Nº DO CHEQUE/DOC EM CADA CANDIDATO, E (OPÇÃO A) SELECIONAR UM CHEQUE SEM LANÇAMENTO + "CONCILIAR AGORA" CRIA DESPESA (PAGO) + CONCILIA A LINHA + BAIXA O CHEQUE, ATÔMICO. SCHEMA-NEUTRO · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3751** — **CONCILIAÇÃO BANCÁRIA · "JÁ CONCILIEI O CHEQUE E AO RECARREGAR A PÁGINA ELE VOLTA": A LINHA SUMIA AO CLICAR EM "CONCILIAR SELECIONADAS" MAS REAPARECIA NO RELOAD (EX.: DOC 001052, −R$ 1.500,00, BRAVO LOCAÇÕES). CAUSA: SUCESSO-FALSO NO FRONTEND (ESCONDIA TODOS OS SELECIONADOS INDEP. DO QUE O BACKEND GRAVOU) + BACKEND SÓ DEVOLVIA A CONTAGEM. AGORA O BACKEND RETORNA AS LINHAS REALMENTE GRAVADAS E O FRONTEND ESCONDE SÓ ESSAS + REANALISA AS QUE FALHARAM. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3750** — **CONCILIAÇÃO BANCÁRIA · "VINCULAR CHEQUE DEVOLVIDO A PIX/TED" (Rev. 3747): CHEQUE COM VÍNCULO ATIVO MOSTRAVA "VINCULADO R$ 0,00"/SALDO CHEIO E A SEÇÃO "VÍNCULOS REGISTRADOS" SUMIA (EX.: DOC 1063, PIER BRASIL, R$ 4.344,60; VÍNCULO REAL R$ 3.212,92). CAUSA: COBERTURA ANCORADA NO `debito_line_id` VOLÁTIL (RE-IMPORT RECRIA LINHAS); AGORA CASA PELA IDENTIDADE DO CHEQUE (valor + doc/nº). 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3749** — **CONCILIAÇÃO BANCÁRIA · "CONCILIAR SELECIONADAS (N)" COM MAIS DE UM PAGAMENTO FALHAVA COM TOAST "ERRO AO CONCILIAR / Unexpected end of JSON input", APESAR DE O SERVIDOR TER GRAVADO (SUCESSO PARCIAL SILENCIOSO). REESCRITO P/ UM ÚNICO STATEMENT SET-BASED (CTE), ATÔMICO E IDEMPOTENTE (1 ROUND-TRIP). 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3748** — **CONCILIAÇÃO BANCÁRIA · SUGESTÃO DE CHEQUE CRUZAVA O CHEQUE ERRADO QUANDO HÁ DOIS DO MESMO FORNECEDOR/VALOR/DATA (EX.: JEFCAR Nº 902 × 903, AMBOS R$2.050 EM 06/01): A LINHA DO 903 NO EXTRATO CASAVA COM O LANÇAMENTO DO 902. AGORA A TRAVA "NÚMERO DIFERENTE ⇒ NÃO É O MESMO CHEQUE" TAMBÉM LÊ O Nº ESTRUTURADO DO LANÇAMENTO (`cheque_numero`/`comprovante_documento`), NÃO SÓ O TEXTO DA DESCRIÇÃO. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3745 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
