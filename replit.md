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

- **Rev. 3752** — **CONCILIAÇÃO BANCÁRIA · OS DIÁLOGOS "CONCILIAR PIX NO EXTRATO" E "TROCAR LANÇAMENTO VINCULADO" SÓ BUSCAVAM EM `financial_entries` — CHEQUES QUE EXISTEM SÓ NO CONTROLE DE CHEQUES (`financial_cheques`), SEM LANÇAMENTO DE DESPESA, NÃO APARECIAM COMO CANDIDATOS. SCHEMA-NEUTRO · ZERO ALTER/DROP/DELETE.** Agora os 2 diálogos: (1) incluem os cheques pendentes (`conciliado=0`, `lancamento_id IS NULL`) na busca via novo `getChequesParaConciliacao`; (2) mostram o nº do cheque/Doc em CADA candidato (lançamento via `entryChequeIdent` lendo `cheque_numero`/`comprovante_documento`/parse da descrição; cheque via badge "🪙 Cheque nº N") p/ não conciliar o cheque errado quando o valor repete; (3) **Opção A** — selecionar um cheque sem lançamento + "Conciliar agora" (PIX) ou clicar no cheque (Trocar) dispara `conciliarChequeComLinha`, que em `db.transaction` CRIA a despesa (`tipo='despesa'`, `natureza='variavel'`, `status='pago'`, `forma='cheque'`, `origem_modulo='cheque_conciliacao'`, conta = a da linha), concilia a linha (UPDATE atômico com guard `conciliado=0` → vencedor único) e BAIXA o cheque (`conciliado=1`, `lancamento_id`). Conciliação SEGUE SÓ SUGESTIVA (nada roda sem ação explícita). Arquivos: `server/routers/financial.ts`, `client/src/pages/financeiro/FinanceiroConciliacao.tsx`. Detalhe: `shared/changelog.ts`.

- **Rev. 3751** — **CONCILIAÇÃO BANCÁRIA · "JÁ CONCILIEI O CHEQUE E AO RECARREGAR A PÁGINA ELE VOLTA": A LINHA SUMIA AO CLICAR EM "CONCILIAR SELECIONADAS" MAS REAPARECIA NO RELOAD (EX.: CHEQUE COMPENSADO DOC 001052, −R$ 1.500,00, BRAVO LOCAÇÕES, EMPRESA 60002, CONTA 2). 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Causa (2 camadas): (1) FRONTEND — `conciliarSugMut.onSuccess` adicionava TODOS os `pares` selecionados a `conciliadosIds` (que esconde a linha) INDEPENDENTE de `res.conciliados`; então par pulado pelo backend sumia otimisticamente e "voltava" no reload. (2) BACKEND — o CTE de `conciliarSugestoes` (Rev. 3749) corretamente pula pares cujo lançamento já está conciliado/cancelado/indisponível (ex.: sugestão DEFASADA em cache apontando p/ lançamento já consumido por outra linha; agravado pela ambiguidade do greedy quando 2+ linhas de mesmo valor disputam o único lançamento elegível da conta), mas só devolvia a CONTAGEM, sem dizer QUAIS linhas gravaram. Diagnóstico (Neon): linha re-importada (12893 COMPENSADO/12894 DEVOLVIDO, `conciliado=0`), lançamentos Bravo seguem `a_pagar`/`conciliado=0` (nunca gravou); CTE em ROLLBACK p/ par válido {12893,868517} → `conciliados=1`. Fix (zero schema, conciliação SEGUE SÓ SUGESTIVA): backend `RETURNING l.id` + CTE `ok` (JOIN upd_l⋈upd_e) → retorna `conciliadosLineIds`; frontend esconde SÓ as linhas confirmadas, mantém as falhas visíveis, avisa e REANALISA (`refetchSug`). Arquivos: `server/routers/financial.ts`, `client/src/pages/financeiro/FinanceiroConciliacao.tsx`. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3750** — **CONCILIAÇÃO BANCÁRIA · "VINCULAR CHEQUE DEVOLVIDO A PIX/TED" (Rev. 3747): CHEQUE COM VÍNCULO ATIVO MOSTRAVA "VINCULADO R$ 0,00"/SALDO CHEIO E A SEÇÃO "VÍNCULOS REGISTRADOS" SUMIA (EX.: DOC 1063, PIER BRASIL, R$ 4.344,60; VÍNCULO REAL R$ 3.212,92). CAUSA: COBERTURA ANCORADA NO `debito_line_id` VOLÁTIL (RE-IMPORT RECRIA LINHAS); AGORA CASA PELA IDENTIDADE DO CHEQUE (valor + doc/nº). 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3749** — **CONCILIAÇÃO BANCÁRIA · "CONCILIAR SELECIONADAS (N)" COM MAIS DE UM PAGAMENTO FALHAVA COM TOAST "ERRO AO CONCILIAR / Unexpected end of JSON input", APESAR DE O SERVIDOR TER GRAVADO (SUCESSO PARCIAL SILENCIOSO). REESCRITO P/ UM ÚNICO STATEMENT SET-BASED (CTE), ATÔMICO E IDEMPOTENTE (1 ROUND-TRIP). 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3748** — **CONCILIAÇÃO BANCÁRIA · SUGESTÃO DE CHEQUE CRUZAVA O CHEQUE ERRADO QUANDO HÁ DOIS DO MESMO FORNECEDOR/VALOR/DATA (EX.: JEFCAR Nº 902 × 903, AMBOS R$2.050 EM 06/01): A LINHA DO 903 NO EXTRATO CASAVA COM O LANÇAMENTO DO 902. AGORA A TRAVA "NÚMERO DIFERENTE ⇒ NÃO É O MESMO CHEQUE" TAMBÉM LÊ O Nº ESTRUTURADO DO LANÇAMENTO (`cheque_numero`/`comprovante_documento`), NÃO SÓ O TEXTO DA DESCRIÇÃO. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3747** — **CONCILIAÇÃO BANCÁRIA · CHEQUES DEVOLVIDOS — VÍNCULO PIX/TED REFORMULADO: BOTÃO "VINCULAR PIX/TED" SEMPRE VISÍVEL, VARREDURA AUTOMÁTICA POR VALOR EXATO EM TODAS AS CONTAS, VÍNCULO PARCIAL 1→N PAGAMENTOS COM HISTÓRICO/ESTORNO POR VÍNCULO + "QUITAR SALDO". SCHEMA ADITIVO (1 TABELA NOVA) · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3746** — **CONCILIAÇÃO BANCÁRIA · 2 BUGS APÓS VINCULAR CONTA NO RECEBIMENTO: (1) LANÇAMENTO RECEBIDO/BAIXADO COM CONTA CONTINUAVA EM "SEM CONTA BANCÁRIA DEFINIDA" (ROLLUP DA BAIXA NÃO PROPAGAVA A CONTA PRO ENTRY); (2) "CONFIRMAR" NA CONCILIAÇÃO SEM-CONTA QUEBRAVA COM `42703 column "company_id" does not exist` (COLUNA É `company_bank_accounts."companyId"`, camelCase). 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3745 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
