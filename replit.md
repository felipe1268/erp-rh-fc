# ERP Gestão Integrada — FC Engenharia

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

- **Rev. 4096** — **CONTROLE DE CHEQUES RECEBIDOS: NOVO SUB-MÓDULO COMPLETO (CADASTRO + IMPORT XLSX + SUGESTÃO NO PAGAMENTO).** Novo router tRPC `chequesRecebidos` (listar/criar/atualizar/alocar/liberarAlocacao/excluir/importarPreview/importarConfirmar/sugerirPorValor/totais) + tabela `financial_cheques_recebidos` via SyncSchema+ + página `FinanceiroChequesRecebidos.tsx` (cards totais, tabela com ações inline, painel import xlsx com preview, dialog de cadastro manual) + abas "Emitidos/Recebidos" em `FinanceiroCheques.tsx` + opção "Cheque de Terceiro" em `PagarConsolidadoDialog.tsx` com seletor de cheques disponíveis por proximidade de valor. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4095** — **NFS-e: FÓRMULA DO VALOR LÍQUIDO CORRIGIDA (ISS RETIDO ENTRA NO CÁLCULO) + CAMPO VOLTA A SER READ-ONLY.** Rev. 4094 tinha removido o ISS da fórmula por suposição errada e tornado o campo editável. Com a DANFSe real da NF #39 (ISSQN Retido pelo Tomador R$1.600 + INSS retido R$2.322,72 = Valor Líquido R$60.077,28 sobre bruto R$64.000), a fórmula correta é `Bruto − ISS − INSS − IRRF − PIS/COFINS (retidos)`. Campo volta a ser `<div>` read-only recalculado em tempo real; PIS/COFINS do form = só valor RETIDO (nunca "Débito Apuração Própria"). ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### 5 one-liners

- **Rev. 4094** — **CORREÇÕES DE PRODUÇÃO: 3 BUGS (SQL $N, ferias.list coerce, getAlertasCompras try/catch).** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4093** — **SPED: EFD CONTRIBUIÇÕES (PIS/COFINS) + SPED ECF (IRPJ/CSLL LP) + SPED ECD.** 3 novos geradores de arquivo SPED + 3 tRPC routers + 3 Express routes + 3 páginas frontend. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4092** — **EFD-ICMS/IPI: GERADOR DE ARQUIVO TXT (SPED) — GUIA PRÁTICO v3.2.2, COD_VER 017.** Novo tRPC router `efdIcmsIpi` (getConfig/saveConfig) + Express route. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4090** — **CONCILIAÇÃO: DEDUP DE IMPORTAÇÃO CIENTE DE DUPLICATAS LEGÍTIMAS NO BATCH.** Fix: pré-passe conta ocorrências no batch e no DB. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4089** — **NOTAS FISCAIS: CARDS DE TOTAIS EXCLUEM CANCELADAS/SUBSTITUÍDAS.** Fix: `ativas = nfs.filter(!cancelada && !substituida)`. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4088 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
