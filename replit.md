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

- **Rev. 2223** — **UX · Foto do funcionário no alerta "HE aprovada SEM ponto".** Lilian: "quero que coloca a foto, de cada usuário para saber quem é". A procedure `aprovadasSemPonto` já retornava `fotoUrl` desde a Rev. 2217 — só faltava renderizar. Em `HEAprovadaSemPontoAlert.tsx`, cada pill de funcionário (Rev. 2222) ganhou `<Avatar h-5 w-5>` com `<AvatarImage src=fotoUrl>` quando existe e `<AvatarFallback>` com iniciais (até 2 letras) seguindo a cor de seleção (laranja/azul). `pl-2`→`pl-1` no pill + `ring-1 ring-white` no avatar. Sem mudança de backend. **R-001/R-007/R-010:** N/A (só UI).
- **Rev. 2222** — **FEATURE/UX · Alerta "HE aprovada SEM ponto" agora permite DIGITAR o ponto e gravar direto no Espelho do funcionário (individual ou em lote).** Lilian: "preciso que tem a opção de digitar o ponto e corrigir nesta tela mesmo.. individualmente para cada um. ou selecionar vários e aplicar o mesmo horário". Componente `HEAprovadaSemPontoAlert.tsx` reescrito: checkbox por funcionário + "Selec. todos" + inputs `<Input type="time">` Entrada/Saída (default = horário da HE) + botão "Lançar ponto (N)". Backend `heSolicitacoes.lancarPontoFromHE` (`server/routers/heSolicitacoes.ts:330-432`): valida sol aprovada + acesso à obra + funcs vinculados, `pg_advisory_xact_lock` por (emp, data), UPSERT em `time_records` setando `entrada1`/`saida1`/`horasTrabalhadas`/`horasExtras` = duração, `fonte=manual`, `ajusteManual=1`. Preserva entrada2/3+saida2/3 quando atualiza. Audit log + invalidate da query. Limitação: HE cruzando meia-noite bloqueada. **R-001/R-007/R-010:** OK — só INSERT/UPDATE em `time_records`.

### Revisões recentes (one-liners)

- ~~Rev. 2221~~ — FIX/LOGIC · Alerta "HE aprovada SEM ponto" agora detecta falta de batida NO HORÁRIO APROVADO (não só no dia). Novo `NOT EXISTS` em `heSolicitacoes.ts:269-287` considera "bateu HE" se `horasExtras > 0` OU alguma das 6 batidas (entrada1..3/saida1..3) cai BETWEEN `[horaInicio, horaFim]`. Ver `shared/changelog.ts`.
- ~~Rev. 2220~~ — UX · Alerta "HE aprovada SEM ponto" agora vive EXCLUSIVAMENTE no Módulo Hora Extra da Folha. Removido de `SolicitacaoHE.tsx` (L1128) e `FechamentoPonto.tsx` (L1600). Componente compartilhado + procedure intactos. Ver `shared/changelog.ts`.
- ~~Rev. 2219~~ — UX/PAYROLL · Alerta HE-sem-ponto mostra status do período HE + aviso de duplicidade. LEFT JOIN LATERAL com `he_periods` (tie-break pago>aprovado>calculado) + EXISTS `he_period_employees`. Ver `shared/changelog.ts`.
- ~~Rev. 2218~~ — FIX/UX · Alerta "HE aprovada SEM ponto" propagado pra Fechamento de Ponto + Módulo HE + bugfix tenant na 2217. Componente compartilhado aceita companyId+companyIds, mesReferencia OU dataInicio/dataFim. Ver `shared/changelog.ts`. *(superseded pela Rev. 2220)*.
- ~~Rev. 2217~~ — UX/HE · Alerta "HE aprovada SEM ponto batido" na aba Aprovações. Nova procedure `heSolicitacoes.aprovadasSemPonto` (`server/routers/heSolicitacoes.ts:184-264`) com raw SQL + `NOT EXISTS` contra `time_records`, respeitando `getEffectiveAllowedObraIds`. Ver `shared/changelog.ts`.

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
