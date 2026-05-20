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

- **Rev. 2204** — **FIX UX · Impressão do Espelho de Ponto totalmente refatorada (acabou a bagunça de 5 páginas com a 1ª em branco).** Lilian: "corrija totalmente a tela de impresssão do cartão de ponto.. esta tudo bagunçado." Causa-raiz: impressão usava a "tela viva" com `display:grid` + várias colunas `no-print` + cards/banner consumindo 85% da 1ª página, empurrando a tabela e quebrando colunas em outras páginas (CSS Grid não repete cabeçalho por página). **Fix (`client/src/pages/EspelhoPonto.tsx:1402-1620`):** novo bloco `.print-only hidden print:block` self-contained antes do `<PrintFooterLGPD/>` com cabeçalho institucional FC (logo + razão social + CNPJ + "Gerado por" + timestamp), faixa título azul `#1B2A4A` "ESPELHO DE PONTO", cartão funcionário, 4 KPIs, banner CLT 62 (se aplicável), TABELA HTML real (`<table>` com `thead display:table-header-group` que REPETE cabeçalho a cada página), zebra por status, breakdown HE, 3 assinaturas, footer LGPD. CSS `body:has(.print-only)` (index.css:364-370) esconde tudo o resto. Todos os elementos com fundo carregam `printColorAdjust:"exact"` inline. Logo com fallback `${origin}/logo-fc.jpg`. Cabe em 1-2 páginas A4 retrato mesmo com 31 dias. **R-001/R-007/R-010:** OK — só client.
- **Rev. 2203** — **MELHORIA UX · Informativo de "Diluição de Caixa" no preview de Aviso Prévio quando há FÉRIAS VENCIDAS.** Lilian: "precisa considerar tbm no aviso o valor das férias vencidas, e se for o caso quando gera o alerta, fazer esta sugestão para dar férias para o colaborador, se compensar claro... para diluição do caixa... ao menos um informativo." O cálculo de `feriasVencidas + 1/3` já existia em `rescisaoCalc.ts:355-360` (somado no total via `periodosVencidosOverride` do banco). **Fix (`client/src/pages/AvisoPrevio.tsx:2959-2989`):** banner âmbar `border-l-4` logo abaixo do "TOTAL ESTIMADO DA RESCISÃO", renderizado quando `feriasVencidas > 0 && !isPedidoDemissao`. Mostra períodos/dias/valor e 4 bullets: Art. 145 CLT (pgto 2 dias antes), suspensão do contrato empurra desligamento em ~N dias, caixa rescisão cai de `total` p/ `total − feriasVencidas`, risco evitado da dobra Art. 137 CLT. Disclaimer "decisão é do RH/gestão". **R-001/R-007/R-010:** OK — só client.

### Revisões recentes (one-liners)

- ~~Rev. 2202~~ — MELHORIA UX · Filtro do Histórico Catalogado (Frotas → Controle de Km) virou INTERVALO de datas (de → até) em vez de data única. State `DateInicio`+`DateFim`, comparação lexicográfica YYYY-MM-DD. Ver `shared/changelog.ts`.
- ~~Rev. 2201~~ — HOTFIX · Excluir Aviso Prévio agora reverte `employees.status` de 'Aviso' para 'Ativo' (guard preserva Desligado/Férias). Cleanup direto no Neon p/ Robson. Ver `shared/changelog.ts`.
- ~~Rev. 2200~~ — MELHORIA UX · Calendário do topo da Folha de Pagamento adotou padrão visual do calendário do Fechamento de Ponto (cores sólidas + Lock no canto). Ver `shared/changelog.ts`.
- ~~Rev. 2199~~ — HOTFIX · Calendário da Folha respeita cores da legenda com múltiplas linhas em `payroll_periods` por mês. Agrupa por `mesReferencia` num `Map` e usa `Array.some()` (`anyTravada` → consolida vale+pag de uma vez). Ver `shared/changelog.ts`.
- ~~Rev. 2198~~ — HOTFIX UX · Mês SELECIONADO no calendário da Folha respeita cor da legenda em vez de virar branco. Separou `statusClasses` (bg+text sempre aplicado) de `borderClasses` (prioriza seleção). Ver `shared/changelog.ts`.

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
