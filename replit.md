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

- **Rev. 2226** — **FEATURE/UX · Campo Fornecedor/Prestador no modal "Novo Lançamento" Financeiro: agora em AMBOS modos (Único+Recorrente), com autocomplete dos cadastrados + botão "Cadastrar novo" (abre `/compras/fornecedores` em nova aba) + dialog em tela cheia.** Lilian: "sem ordem de compra, nao tem lugar para lançar o fornecedor, porem se eu alterar para recorrente, tem... preciso que apareça em ambos. Os fornecedores já cadastrados não estão aparecendo... preciso de um botão CADASTRAR NOVO FORNECEDOR/PRESTADOR ao lado. (Fornecedor abrange empresa terceira/prestador). E aumente essa tela, está muito pequeno". Bug em `FinanceiroLancamentos.tsx:763`: campo vivia dentro de `{form.modoRecorrente && (...)}` (só Recorrente) + Input puro SEM `list=datalist` (não consultava `compras.listarFornecedores`). Fix: (1) nova query `compras.listarFornecedores` + helper `fornecedoresOptions` (dedup); (2) campo movido pra fora do bloco recorrente — visível sempre; (3) `<Input list="...">` + `<datalist>` com cadastrados; (4) botão "Cadastrar novo" abre `/compras/fornecedores` em nova aba via `window.open`; (5) label "Fornecedor / Prestador / Pagador"; (6) `DialogContent` `max-w-lg` → `max-w-[min(1200px,96vw)] w-[96vw] h-[95vh]` (tela cheia). **R-001/R-007/R-010:** N/A (UI + 1 READ).
- **Rev. 2225** — **FIX/UX · Botão "Cadastrar contas" do Painel Financeiro abria Regime Tributário em vez da tela de contas bancárias.** Lilian: "a tela de cadastrar contas está abrindo outra informação. quando clico para cadastrar, ele abre a tela para configurar o regime tributário da empresa". Bug em `FinanceiroDashboard.tsx:162`: `Link href="/financeiro/configuracoes"` (Regime Tributário) em vez de `/contas-bancarias`. Sobre "replicar contas no financeiro": a query `financial.getDashboardExecutivo` (`financial.ts:2715`) JÁ lê de `company_bank_accounts` — mesma tabela do cadastro (`folha.listarContasBancarias`) — então qualquer conta cadastrada já aparece no painel. Fix: (1) link corrigido pra `/contas-bancarias`; (2) novo botão "+ Nova / Gerenciar" no header do card quando há contas, também levando pra `/contas-bancarias`. **R-001/R-007/R-010:** N/A (só UI).

### Revisões recentes (one-liners)

- ~~Rev. 2224~~ — FIX/PARSER · Contrato puxava "R$ 3,20" quando salário base era "3.200" (formato BR de milhar). `client/src/lib/numeroExtenso.ts:17-37` `parseValor` novo ramo `else if (hasDot)`: se último grupo após ponto tem 3 dígitos exatos = milhar BR (strip pontos); senão decimal US. Impacto: contratos, advertências, comunicados via `formatBRL`/`valorPorExtenso`. Ver `shared/changelog.ts`.
- ~~Rev. 2223~~ — UX · Foto do funcionário no alerta "HE aprovada SEM ponto". `HEAprovadaSemPontoAlert.tsx`: avatar (h-5 w-5) com `<AvatarImage src=fotoUrl>` quando existe ou `<AvatarFallback>` com iniciais (cor laranja/azul seguindo seleção). `pl-2`→`pl-1` + `ring-1 ring-white`. Sem backend. Ver `shared/changelog.ts`.
- ~~Rev. 2222~~ — FEATURE/UX · Alerta "HE aprovada SEM ponto" permite DIGITAR o ponto direto no card (individual/lote) e gravar via `heSolicitacoes.lancarPontoFromHE` (`server/routers/heSolicitacoes.ts:330-432`) — UPSERT em `time_records` com `pg_advisory_xact_lock`, `fonte=manual`, `ajusteManual=1`. Ver `shared/changelog.ts`.
- ~~Rev. 2221~~ — FIX/LOGIC · Alerta "HE aprovada SEM ponto" agora detecta falta de batida NO HORÁRIO APROVADO (não só no dia). Novo `NOT EXISTS` em `heSolicitacoes.ts:269-287` considera "bateu HE" se `horasExtras > 0` OU alguma das 6 batidas (entrada1..3/saida1..3) cai BETWEEN `[horaInicio, horaFim]`. Ver `shared/changelog.ts`.
- ~~Rev. 2220~~ — UX · Alerta "HE aprovada SEM ponto" agora vive EXCLUSIVAMENTE no Módulo Hora Extra da Folha. Removido de `SolicitacaoHE.tsx` (L1128) e `FechamentoPonto.tsx` (L1600). Componente compartilhado + procedure intactos. Ver `shared/changelog.ts`.

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

> Revisões 2098 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
