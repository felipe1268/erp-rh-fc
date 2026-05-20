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

- **Rev. 2200** — **MELHORIA UX · Calendário do topo da Folha de Pagamento adotou o mesmo padrão visual do calendário do Fechamento de Ponto (cores sólidas + Lock no canto).** Lilian (após Rev. 2199): "precisa respeitar as cores conforme estamos usando o ponto". **Fix (`client/src/pages/FolhaPagamento.tsx:5738-5754`):** Alinhou classes Tailwind ao `FechamentoPonto.tsx:1495-1593` — `bg-green-500 text-white border-green-600` (consolidado), `bg-blue-500 text-white border-blue-600` (completo), `bg-gray-200 text-gray-500` (sem dados). Seleção: `ring-2 ring-offset-1 ring-[#1B2A4A] shadow-md scale-105` mantendo cor de status. Ícones `Lock/FileText` reposicionados pra `absolute top-0.5 right-0.5 text-white/80`. Botão virou `relative` com `py-2 px-1 text-sm`. **R-001/R-007/R-010:** OK — só client.
- **Rev. 2199** — **HOTFIX · Calendário da Folha respeita as cores da legenda mesmo com múltiplas linhas em `payroll_periods` por mês.** Lilian (após Rev. 2198): "precisa respeitar as cores das legendas". Mar/2026 FC tem 2 linhas (`travada` + `pagamento_simulado`) e a ordem de retorno do Drizzle fazia a versão "travada" perder pro `if (!m.vale)` guard, pintando Mar de azul em vez de verde. **Fix (`server/routers/folhaPagamento.ts:2097-2124`):** Pré-agrupar `payroll_periods` por `mesReferencia` num `Map`, depois calcular flags com `Array.some()`. `anyTravada` em qualquer linha → vale+pagamento consolidados. Resultado: Mar/2026 FC (1 linha travada) → VERDE; Abr/2026 (pagamento consol mas vale ainda não) segue AZUL refletindo estado real. **R-001/R-007/R-010:** OK — leitura adicional, zero schema.

### Revisões recentes (one-liners)

- ~~Rev. 2198~~ — HOTFIX UX · Mês SELECIONADO no calendário da Folha respeita cor da legenda em vez de virar branco. Separou `statusClasses` (bg+text sempre aplicado) de `borderClasses` (prioriza seleção). Ver `shared/changelog.ts`.
- ~~Rev. 2197~~ — HOTFIX · Calendário da Folha volta a pintar meses calculados pelo Cálculo Interno (Rev. 2180+). `listarMesesComLancamentos` agora lê `folha_lancamentos` + `payroll_periods` (legacy + novo). Ver `shared/changelog.ts`.
- ~~Rev. 2196~~ — MELHORIA UX · Avatar 32px do colaborador no Relatório de Períodos HE virou clicável: abre lightbox com foto ampliada (max-h 70vh, fundo preto). Fallback iniciais não ganha click. Ver `shared/changelog.ts`.
- ~~Rev. 2195~~ — NOVA FEATURE · Tela "Encargos Sociais sobre Folha" (RH&DP > Operacional) p/ upload DCTFWeb + FGTS Digital. Nova tabela `encargos_sociais_documentos`, router `encargosSociais.ts`, página `EncargosSociais.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2194~~ — REMOÇÃO DE FEATURE · Bloco "Conferência com Contabilidade" removido da aba Folha de Pagamento (Card colapsável + Dialog de alerta + states `showConferencia`/`conferenciaDialog`). Server intacto. Ver `shared/changelog.ts`.

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
