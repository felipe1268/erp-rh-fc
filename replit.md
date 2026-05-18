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

- **Rev. 2094** — **Financeiro · Configurações / página inteira redesenhada nas regras de ouro + tributação didática com auto-fill por regime + KPI bar de sócios.** Pedido do user (após Rev. 2093 entregar só o modal): "revise o layout das telas tbm, conforme a nossa regra de ouro... deixando mais didatico, e o mais automatizado possivel". **Header** ganhou gradient `from-blue-600 via-indigo-600 to-blue-700` com ícone Settings em pill `bg-white/15 ring-4 ring-white/20`; botão Auto-Importar virou `bg-white text-blue-700 shadow-md`. **TabsList** com ícones (Calculator/Users) e active blue. Container `max-w-4xl→max-w-6xl`. **ABA TRIBUTÁRIA — automação:** `<Select>` de regime virou **4 cards visuais clicáveis** (PiggyBank/Calculator/TrendingUp/Briefcase) com classes Tailwind estáticas por card (sem template string dinâmica pra evitar purge); novo `REGIME_DEFAULTS` carrega alíquotas brasileiras típicas por regime (Presumido: PIS=0.65 COFINS=3 IRPJ=4.8 CSLL=2.88 INSS=20 FGTS=8 RAT=3 ISS=5; Real: PIS=1.65 COFINS=7.6 IRPJ=15 CSLL=9; Simples zera individuais e sugere DAS=10%; MEI zera tudo); `handleChangeRegime` só toca campos vazios/zerados (preserva ajustes manuais) e dispara toast informando quantos campos foram preenchidos. **ABA TRIBUTÁRIA — didática:** grid plano de 8 inputs idênticos virou **3 cards agrupados** com header gradient temático — Federais (Landmark, blue→indigo: PIS/COFINS/IRPJ/CSLL), Municipais (Receipt, amber→orange: ISS), Trabalhistas (Wallet, emerald→teal: INSS/FGTS/RAT); cada input com help inline (`text-[10.5px]` + ícone Info) explicando o tributo ("RAT: 1% leve · 2% médio · 3% grave — construção civil normalmente 3%"). Footer Salvar virou pill com dica Lightbulb. **ABA SÓCIOS — KPI bar:** 4 cards no topo (Sócios cadastrados, **% Sociedade alocado**, Total Pró-labore/mês, Custo anual estimado=×13); card % fica âmbar quando ≠100% + banner alerta. Lista redesenhada com avatar circular `gradient-to-br from-blue-500 to-indigo-600` + iniciais, badge indigo BadgePercent, pró-labore verde-bold. Empty state com CTA "Cadastrar primeiro sócio" + reforço do fluxo de auto-importação da Rev. 2093. **Arquivo único:** `client/src/pages/financeiro/FinanceiroConfiguracoes.tsx`. Zero backend / zero schema.
- **Rev. 2093** — **Financeiro · Configurações / modal "Novo Sócio" agora puxa sócios já cadastrados em Colaboradores (módulo RH) + regras de ouro aplicadas.** Pedido do user (screenshot do modal antigo em `/financeiro/configuracoes` aba "Sócios / Pró-labore" pedindo nome/CPF/cargo livres): "o ERP já tem o cadastro dos sócios no ERP, módulo colaboradores, procure lá todos que são sócios para organizar isso". **Problema:** o modal duplicava cadastro — pessoa já existia em `employees` com `tipoContrato='Socio'` (opção do select de Colaboradores) e ainda assim era pedida do zero em `company_partners`. **Backend (`server/routers/financial.ts`):** novo `listSociosFromEmployees({ companyId })` retorna funcionários sócios + flag `jaCadastrado` via subquery EXISTS em `company_partners` com `regexp_replace(cpf, '[^0-9]', '', 'g')` (CPF como chave natural). **Frontend (`client/src/pages/financeiro/FinanceiroConfiguracoes.tsx`):** modal redesenhado nas regras de ouro (DialogContent `max-w-md p-0 overflow-hidden`, header gradient + ícone `UserCheck`, labels uppercase, inputs h-9, `<select>` nativos); novo seletor "Origem do Sócio" com `<optgroup>` "Sócios cadastrados (Colaboradores)" — itens já cadastrados ficam **disabled** com "✓ já cadastrado"; auto-preenche nome/CPF/cargo ao escolher funcionário; campos nome/CPF disabled quando origem ≠ manual; pill verde/âmbar indicando origem. **R-001/R-007:** zero ALTER/DROP/DELETE — dedup via CPF normalizado.

### Revisões recentes (one-liners)

- ~~Rev. 2092~~ — Financeiro · Centros de Custo / modal Novo/Editar redesenhado no padrão Categorias (DialogContent `p-0 overflow-hidden`, header gradient + ícone Building2, labels uppercase, Input h-9, `<select>` nativo mata overflow lateral). Ver `shared/changelog.ts`.
- ~~Rev. 2091~~ — Compras · "Atender pelo Estoque" agora pergunta a OBRA DE ORIGEM. Modal `TransferenciaEstoqueDialog` com saldo na origem + badges; `criarOrdemDeCotacao` ganha `obraOrigemId` opcional (validado contra `getEffectiveAllowedObraIds`). Ver `shared/changelog.ts`.
- ~~Rev. 2090~~ — Compras · Ordens (OC/OS) ganha filtro por Obra. Novo `<Select>` Building2 com "Todas/Sem obra/lista ordenada", reusa `obrasQ`. Botão X limpa, pill de resultados conta o novo filtro. Ver `shared/changelog.ts`.
- ~~Rev. 2089~~ — Compras · Solicitações / ordenação clicável por coluna (default `criadoEm DESC`). Headers viraram `<button>` com ArrowUp/Down, pill "Ordenado por" + reset "↻ mais recentes". `localeCompare(numeric: true)`. Ver `shared/changelog.ts`.
- ~~Rev. 2088~~ — Financeiro · Centros de Custo CRUD completo (editar/inativar/reativar). Backend: `getCostCenters` ganhou `includeInactive`, novo `updateCostCenter` (SET dinâmico, soft delete R-007). Frontend: reescrita pro padrão Categorias (header gradient, KPI bar 4 cards, AlertDialog). Ver `shared/changelog.ts`.

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
