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

- **Rev. 4006** — **ALMOXARIFADO: PACOTE DE 6 CORREÇÕES E MELHORIAS (usuário: "quero que você faça tudo").** Item principal: código automático de material — os 2.823 itens cadastrados (2 empresas) renumerados no Neon para o padrão `MATNNNNNN` (6 dígitos, sequencial por empresa); antes só 96 tinham código. Detectados 149 grupos de nomes "duplicados" (953 linhas), mas a maioria (~897 linhas) são peças com rastreio unitário legítimo (formas/andaimes serializados) — decisão: NÃO mesclar estoque (destruiria o rastreio), só normalizado texto de 29 nomes com diferença de espaço/maiúscula. Novo helper `criarItemAlmoxarifadoComCodigo` (mesmo padrão de `gerarProximoNumeroOC`: `pg_advisory_xact_lock` dentro da transação do INSERT) plugado nos 5 pontos que criam material novo (cadastro manual, auto-cadastro via OC, recebimento inteligente, import Mas Controle API/CSV); pontos de transferência entre obras mantidos como estavam (copiam o código do item de origem de propósito). Demais 5 itens do pacote: matching de duplicata NF/OC melhorado; Saída de Insumos aceita busca de terceiro; Fechar Dia trata pendências antigas + filtro por obra; corrigido bug do "Devolver Todas"; Inventário ganhou botão "Corrigir" + Empréstimo ganhou campo de observação. Detalhe completo em `shared/changelog.ts`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4004** — COMPRAS/COTAÇÕES: PDF e Excel do Mapa de Cotação não traziam a linha de total por fornecedor; `gerarPdfCotacao`/`exportarExcelCotacao` passaram a reaproveitar `getFornTotal`/`metaGrandTotal`/`qtdGrandTotal` pra gerar a linha de total. ZERO DELETE · ZERO ALTER.

### 5 one-liners

- **Rev. 4003** — **COMPRAS/COTAÇÕES: "EXPORTAR PDF" GERAVA PÁGINA EM BRANCO — BLOQUEAVA ENVIO DE COTAÇÃO PARA CLIENTE APROVAR ITEM A ITEM; ADICIONADO TAMBÉM "EXPORTAR EXCEL".** Causa: `window.print()` sobre `<div className="fixed inset-0 ...">` (mesma causa-raiz de `print-dialog-fixed-clip`); fix via HTML autônomo em `window.open`+`document.write`. ZERO DELETE · ZERO ALTER.

- **Rev. 4002** — **IMPORTAÇÃO DE EXTRATO PDF (SANTANDER IBPJ): PARSER ESTAVA IGNORANDO 100% DOS LANÇAMENTOS EM EXTRATOS DE VÁRIAS PÁGINAS.** `parseSantanderIbpjPdf` assumia cada lançamento em UMA linha só, mas a extração real do `pdf-parse` quebra em 2-3 linhas; reescrito como scanner por blocos. Validado: 0→131 lançamentos, saldo diário reconciliado 100%. ZERO DELETE · ZERO ALTER.

- **Rev. 4001** — **COMPRAS / COTAÇÕES: SOLICITAÇÕES DE OBRAS DIFERENTES CAINDO COM O MESMO NÚMERO DE COTAÇÃO.** 4 dos 7 pontos que geram `numeroCotacao` em `compras.ts` calculavam via `COUNT(*)+1` FORA de lock/transação (race condition); fix roda dentro de `db.transaction` com `pg_advisory_xact_lock`; 32 grupos duplicados (41 cotações) renumerados no Neon. ZERO DELETE · ZERO ALTER.

- **Rev. 4000** — **BANCO DE HORAS: DÉBITOS AUTOMÁTICOS DE ATRASO/FALTA E DSR (GERADOS PELA FOLHA) GRAVAVAM `minutos` NEGATIVO, INVERTENDO O SALDO MENSAL NA ABA "SALDOS".** `debito_atraso_falta`/`debito_dsr` gravavam `minutos` negativo, dupla-negação inflava o saldo mensal; fix grava positivo (igual ao manual) + `ABS()` de defesa nas leituras + correção das 93 linhas históricas no Neon. ZERO DELETE · ZERO ALTER.

- **Rev. 3999** — **CONTAS A PAGAR: BUSCA POR FORNECEDOR/OC AGORA PROCURA NO ANO INTEIRO, NÃO SÓ NO MÊS ABERTO NA TELA.** Busca por texto rodava sobre `mesData` (mês selecionado), não `allContas` (ano inteiro); fornecedor com títulos em outros meses ou sem `data_vencimento` ficava invisível. Fix: com termo ativo, `filtered` usa `allContas` + checa `fornecedorNome`. ZERO DELETE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3998 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
