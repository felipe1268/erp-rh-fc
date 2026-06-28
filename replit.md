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

- **Rev. 3839** — **NF-E RECEBIDAS · MUDAR STATUS EM LOTE.** Botão "Mudar Status" adicionado na barra de seleção múltipla da aba "NF-e Recebidas" (existia só nas Emitidas). States `bulkRecStatusOpen`+`bulkRecStatusTarget`, mutation `bulkRecStatusMut` (reutiliza `fiscalNotes.bulkUpdateStatus`), AlertDialog com 5 opções de status. `client/src/pages/financeiro/FinanceiroNotasFiscais.tsx`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3838** — **EXTRATO BANCÁRIO XLSX · FORMATAÇÃO CONDICIONAL NATIVA EXCEL NA COLUNA SALDO.** `ws.addConditionalFormatting()`: regra `< 0` → vermelho (#FF0000) + fonte branca; regra `> 0` → verde (#00B050) + fonte branca; range `H9:H{lastDataRow}`. Cor muda automaticamente ao editar fórmulas no Excel. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3837** — **EXTRATO BANCÁRIO XLSX · COLUNA SALDO COM FÓRMULA EXCEL.** H(row 9)=`=H6+F9-G9`; H(row N)=`=H{N-1}+FN-GN`. Campo `result` pré-preenchido para abrir sem recalcular. Formatação condicional verde/vermelho inalterada. `server/routers/downloadContabilidadeXlsx.ts`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3836** — **EXTRATO BANCÁRIO XLSX · BUGFIX: "ERRO AO GERAR PLANILHA" (column fe.fornecedor_cnpj does not exist).** Causa-raiz: `linesQ` referenciava `fe.fornecedor_cnpj AS entry_cnpj` via LEFT JOIN com `financial_entries`, mas essa coluna não existe (a tabela só tem `fornecedor_nome` e `descricao`). Diagnosticado executando a query diretamente contra o Neon. Fix: `fe.fornecedor_cnpj` → `NULL::text AS entry_cnpj` (campo é só fallback de CNPJ na 3ª camada de cruzamento NF). Bônus: `[SyncSchema+] Rev.3836` garante `fiscal_notes.stmt_line_id INTEGER` via `ALTER TABLE ADD COLUMN IF NOT EXISTS`. Arquivos: `server/routers/downloadContabilidadeXlsx.ts`, `server/_core/index.ts`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3835** — **NOTIFICAÇÕES CONTABILIDADE · BUGFIX: "UNEXPECTED END OF JSON INPUT".** `getConfig` SELECT adicionado `auto_envio` (estava omitido → valor DB ignorado). `emails_json ?? "[]"` → `|| "[]"` (string vazia `""` não é capturada por `??` → `JSON.parse("")` lançava o erro). Retorno padrão adicionado `autoEnvio: false`. Bug `mes` no "Enviar Teste": `now.getMonth()` 0-indexado → `+1`. Import dinâmico do XLSX movido para dentro do try/catch. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3833** — **EXTRATO BANCÁRIO XLSX: FORMATAÇÃO CONDICIONAL SALDO + BORDAS + NF 100% CRUZADO.** ZERO DELETE. Detalhe: `shared/changelog.ts`. Saldo calculado em JS (acumulado linha a linha): verde (#00B050) se ≥ 0, vermelho (#FF0000) se < 0, fonte branca em ambos. Bordas finas em TODAS as células de dados (A-H), não só no cabeçalho. NF cruzado em 3 camadas: stmt_line_id direto → entry_id pré-carregado → CNPJ+valor com dedup por usedNfKeys. Label do banco agora inclui apelido da conta ("BANCO SANTANDER – LOCNOW – APARECIDA"). ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3832** — **CONTABILIDADE · BUGFIX: BAIXAR PACOTE ZIP FALHAVA COM JSON DE ERRO.** `queryData` usava `Promise.all` sem fallback — qualquer query falhando (ex.: tabela de cartão ausente em dev) rejeitava tudo e o catch enviava JSON em vez de ZIP. Fix: `safeQuery` wrapper em cada query (`[]` no erro); `setHeader`+`archive.pipe(res)` movidos para ANTES de `processarMes` (browser recebe `application/zip` desde o início). ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3831** — **CONTABILIDADE · CONFIGURAÇÕES MOVIDAS PARA CONFIGURAÇÕES DO SISTEMA + ENVIO AUTOMÁTICO DIÁRIO.** ZERO DELETE. Detalhe: `shared/changelog.ts`. `contabilidade_alertas_config` ganha coluna `auto_envio BOOLEAN` (SyncSchema+ Rev.3831). `getConfig`/`saveConfig` atualizados para incluir `autoEnvio`. `verificarEnvioAutomaticoContabilidade()` adicionado ao `statusSyncJob.ts` (chamado em `syncWithRetry` com `.catch` isolado): verifica empresas com prazo ativo + autoEnvio + mês pendente, dispara e-mail e registra em `contabilidade_email_auto_log` (sem duplicata no mesmo dia). Front: nova aba "Notificações Contabilidade" (icon=Receipt, indigo) em `Configuracoes.tsx` com `NotificacoesContabilidadeTab` (status alerta, prazos, destinatários CRUD, toggles Ativo/Envio Auto, botão Teste). `FinanceiroContabilidade.tsx`: modal de config + estados removidos; botão vira link chip para `/configuracoes`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3830** — **CONTABILIDADE · SISTEMA DE ALERTAS DE PRAZO + ENVIO POR E-MAIL.** Tabela `contabilidade_alertas_config` (SyncSchema+ Rev.3830): dia_fiscal/dia_contabil/emails_json/ativo. 4 endpoints novos em `contabilidade.ts`: `getAlertaStatus` (verifica pendência do mês anterior vs janela de prazo), `getConfig`/`saveConfig` (upsert com 3 e-mails Pronus pré-populados), `enviarPorEmail` (gera XLSX + envia via SMTP com anexo). Front: banner âmbar/vermelho entre header e seletor; botão "Configurações" no header (modal com prazos + lista de destinatários); botão "Enviar por E-mail" em cada PainelMes. Badge piscante no menu lateral (DashboardLayout) quando `temAlerta`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3834** — **EXTRATO BANCÁRIO XLSX: LOGO FC ENGENHARIA + CONTORNO EXTERNO (MEDIUM BORDER).** `getLogoBuffer` retorna `{buffer,extension}`; `applyTableBorders` medium outer + thin inner. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3829** — **EXTRATO BANCÁRIO XLSX: REESCRITA COMPLETA COM EXCELJS PARA IGUALAR TEMPLATE DA CONTABILIDADE.** ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3828** — **FINANCEIRO · LIMPEZA JAN/2026: HOTEL CONSAGRADO MÚTUO — CANCELAMENTO DE DUPLICATAS. ZERO DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3827** — **REVERT Rev.3826 — TRANSPORTE DE EQUIPES volta a "Benefícios (VR/VA/Transporte)". ZERO DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3826** — **TRANSPORTE DE EQUIPES → Frota (revertido em 3827). ZERO DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3823 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
