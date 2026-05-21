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

- **Rev. 2221** — **FIX/LOGIC · Alerta "HE aprovada SEM ponto" agora detecta falta de batida NO HORÁRIO APROVADO (não só no dia).** Lilian: "ainda não apareceu todos que têm hora extra aprovada mas não têm indicação de ponto no horário aprovado.. analise esta lógica e resolva". Bug Revs. 2217-2220: filtro `NOT EXISTS time_records WHERE data=dataSolicitacao AND horasTrabalhadas > 0` excluía qualquer um que batesse o turno regular, mesmo se a HE específica (sábado/HE noturna) não foi batida. Fix `server/routers/heSolicitacoes.ts:283-301`: novo `NOT EXISTS` considera "bateu HE" se **(a)** `tr.horasExtras > 0` OU **(b)** alguma das 6 batidas (`entrada1..3`/`saida1..3`) cai dentro de `[s.horaInicio, s.horaFim]` (BETWEEN lex em 'HH:MM'). Copy atualizada em `HEAprovadaSemPontoAlert.tsx` + `FolhaPagamento.tsx` L4610. Limitação: HE cruzando meia-noite não tratada (UI também não aceita). **R-001/R-007/R-010:** OK — só SELECT.
- **Rev. 2220** — **UX · Alerta "HE aprovada SEM ponto" agora vive EXCLUSIVAMENTE no Módulo Hora Extra da Folha.** Lilian: "a tela não é pra ficar aqui.. ela deve ficar no cálculo de hora extra.. mais precisamente Módulo Hora Extra". Removido `<HEAprovadaSemPontoAlert />` + import de `SolicitacaoHE.tsx` (aba Aprovações L1128) e `FechamentoPonto.tsx` (L1600). Mantido apenas em `FolhaPagamento.tsx` Módulo HE L4605. Componente e procedure `heSolicitacoes.aprovadasSemPonto` continuam intactos — toda a lógica Rev. 2219 (período HE + duplicidade) vale. Justificativa: a decisão de pagar manual vs. recalcular o período só faz sentido dentro do Módulo HE; nas outras telas era ruído visual. **R-001/R-007/R-010:** N/A (só remoção de UI).

### Revisões recentes (one-liners)

- ~~Rev. 2219~~ — UX/PAYROLL · Alerta HE-sem-ponto mostra status do período HE + aviso de duplicidade. LEFT JOIN LATERAL com `he_periods` (tie-break pago>aprovado>calculado) + EXISTS `he_period_employees`. Ver `shared/changelog.ts`.
- ~~Rev. 2218~~ — FIX/UX · Alerta "HE aprovada SEM ponto" propagado pra Fechamento de Ponto + Módulo HE + bugfix tenant na 2217. Componente compartilhado `HEAprovadaSemPontoAlert.tsx` aceita companyId+companyIds, mesReferencia OU dataInicio/dataFim. Ver `shared/changelog.ts`. *(superseded pela Rev. 2220 — alerta agora só no Módulo HE)*.
- ~~Rev. 2217~~ — UX/HE · Alerta "HE aprovada SEM ponto batido" na aba Aprovações. Nova procedure `heSolicitacoes.aprovadasSemPonto` (`server/routers/heSolicitacoes.ts:184-264`) com raw SQL + `NOT EXISTS` contra `time_records`, respeitando `getEffectiveAllowedObraIds`. Ver `shared/changelog.ts`.
- ~~Rev. 2216~~ — FIX/PAYROLL · Memorial de Cálculo de HE reconhece feriados (nacionais fixos, móveis e custom). Novo helper `getFeriadosSetForPeriod` exportado de `server/routers/feriados.ts`; `computeHEForPeriod`+`memorialCalculo` tratam feriado idêntico a domingo. Ver `shared/changelog.ts`.
- ~~Rev. 2215~~ — UX/LAYOUT · Tela Contas a Pagar usa largura estendida (1600px) — `FinanceiroContasAPagar.tsx:480` `max-w-7xl` → `max-w-[1600px]`, coluna "Ações" não corta mais. Ver `shared/changelog.ts`.

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
