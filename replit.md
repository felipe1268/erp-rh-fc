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

- **Rev. 2206** — **SEGURANÇA · Sigilo do status "Aviso Prévio" do colaborador — visível só para Admin Master e grupo RH/DP.** Lilian: "somente o usuário master e os usuários de RH, poderão ver se o colaborador esta de aviso previo ou não.. garanta que isso seja um sigilo para todos que naõ fazem parte deste grupo." Defesa em profundidade — **backend mascara** (`server/db.ts:3169-3191` novo helper `userCanSeeAvisoStatus`; `server/routers.ts:415-459` aplica em `employees.list/stats/getById`, soma Aviso em Ativos, zera o KPI, cacheKey com flag `:av0/:av1`) E **frontend mascara** (`client/src/pages/Colaboradores.tsx` usa `usePermissions().groupPermissions`, novo helper `maskedStatus` aplicado em badge da tabela L1236, ficha L3440 e PDF L893; KPI "Aviso" L993 e opção do filtro L1034 some completamente). Reconhece grupos "RH", "DP", "RH e DP", "RHDP", "Recursos Humanos" (regex). **R-001/R-007/R-010:** OK — só SELECT + mascaramento em memória, zero DDL.
- **Rev. 2205** — **MELHORIA UX · Campo "Quando venceu" no preview de Aviso Prévio mostra a data limite (Art. 134 CLT) de cada período de férias vencidas.** Lilian: "coloca um campo de quando venceu as ferias para saber.. ok." Antes a linha "Férias Vencidas + 1/3 (1 período(s))" só mostrava QUANTIDADE — gestor não sabia QUANDO cada período venceu (info crítica pra Art. 137 CLT e Rev. 2203). **Backend (`server/routers/avisoPrevioFerias.ts:752-776`):** query `COUNT(*)` virou `SELECT periodoAquisitivoInicio, Fim, periodoConcessivoFim ORDER BY ASC`; novo campo `periodosVencidosDetalhes` no retorno do procedure `calcular`. **Frontend (`AvisoPrevio.tsx:2864-2920`):** bloco "📅 Quando venceu (Art. 134 CLT)" lista cada período: aquisitivo DD/MM → DD/MM · limite p/ conceder: DD/MM. Badge vermelho "⚠ vencido há N dia(s)" se `periodoConcessivoFim < hoje`. **R-001/R-007/R-010:** OK — SELECT readonly.

### Revisões recentes (one-liners)

- ~~Rev. 2204~~ — FIX UX · Impressão do Espelho de Ponto refatorada (acabou bagunça de 5 páginas com 1ª em branco). Bloco `.print-only` self-contained com cabeçalho institucional FC, faixa azul, TABELA HTML real (`thead display:table-header-group` repete cabeçalho). Ver `shared/changelog.ts`.
- ~~Rev. 2203~~ — MELHORIA UX · Banner âmbar "Sugestão de Diluição de Caixa" no preview de Aviso Prévio quando há `feriasVencidas > 0 && !isPedidoDemissao` (Art. 145 CLT, suspensão de contrato, redução do caixa imediato). Ver `shared/changelog.ts`.
- ~~Rev. 2202~~ — MELHORIA UX · Filtro do Histórico Catalogado (Frotas → Controle de Km) virou INTERVALO de datas (de → até) em vez de data única. State `DateInicio`+`DateFim`, comparação lexicográfica YYYY-MM-DD. Ver `shared/changelog.ts`.
- ~~Rev. 2201~~ — HOTFIX · Excluir Aviso Prévio agora reverte `employees.status` de 'Aviso' para 'Ativo' (guard preserva Desligado/Férias). Cleanup direto no Neon p/ Robson. Ver `shared/changelog.ts`.
- ~~Rev. 2200~~ — MELHORIA UX · Calendário do topo da Folha de Pagamento adotou padrão visual do calendário do Fechamento de Ponto (cores sólidas + Lock no canto). Ver `shared/changelog.ts`.

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
