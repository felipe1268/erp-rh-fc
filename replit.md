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

- **Rev. 2247** — **FIX/CONSISTÊNCIA · Unifica "régua" de Previsto Acumulado entre a barra "Avanço Físico" do topo e o card "Previsto Acumulado" do BLOCO 2 do REFIS.** User (VITRA, semana 22-28/05/2026): topo lia 6.40%, REFIS lia 7.07% — "todos devem ler a mesma informação.. sempre". Causa: topo clipava em `refDateStr` (Live=today / Oficial=cutoff); REFIS clipava SÓ em `cutoffOficial`. VITRA tem cutoff oficial em 04/12/2022 (nunca foi fechada semana), então o IF de clipping no REFIS jamais disparava e ele lia PV no FIM da semana (28/05). Fix em `PlanejamentoDetalhe.tsx`: passa `refDateTop={refDateStr}` + `modoVisao` pro `<Refis />` (L1205-1206); destructure na assinatura (L12615); `semanaFimRefis` agora clipa em `refDateTop ?? cutoffOficial` (L12834-12837). Resultado: topo e BLOCO 2 SEMPRE leem PV no mesmo instante, em qualquer semana/modo. **R-001/R-007/R-010:** N/A (frontend only).
- **Rev. 2246** — **PRIVACY/UX · Removido card "Ocorrências de Segurança" do Painel SST — listava advertências disciplinares com nome do colaborador.** User (screenshot mobile, continuação da 2245): "Tire este aqui tbm" — card mostrava "MARIANA CASTILHO DE LIMA · Verbal · 19/05", "ALEX ALESSANDRO MONTEIRO DA SILVA · Escrita · 23/04" etc. Painel SST é operacional (EPI/ASO/CIPA/dashboards), não deve expor dado disciplinar nominal aberto. Fix em `client/src/pages/PainelSST.tsx`: removido o `<Card>` "Ocorrências de Segurança" (L282-307 originais). Query `homeData.advertenciasRecentes` permanece — ainda alimenta o agregado "Alertas Críticos" (FullScreenDialog), onde os itens entram numa lista filtrável/priorizada, não em feed bruto. **R-001/R-007/R-010:** N/A (frontend only).

### Revisões recentes (one-liners)

- ~~Rev. 2245~~ — SECURITY/UX · Removido card "Atividade Recente - SST" do Painel SST (vazava lançamentos financeiros via `trpc.audit.list` sem filtro de módulo). Ver `shared/changelog.ts`.
- ~~Rev. 2244~~ — FIX/TZ · `todayLocalISO()` substitui `new Date().toISOString().split("T")[0]` em TODO `PlanejamentoDetalhe.tsx` — corrige badge "ATUAL" antecipando 1 dia em UTC. 19 trocas. Ver `shared/changelog.ts`.
- ~~Rev. 2243~~ — FIX/UX · "Importar MS Project" do Avanço Semanal vira self-healing (matching por NOME + backfill auto de `msp_uid`). Backend `backfillMspUid` (chunks 50, idempotente); frontend dispara em background após match via EAP/nome. Ver `shared/changelog.ts`.
- ~~Rev. 2242~~ — FEATURE/DEFESA · Alerta visível de drift `msp_uid` no importer MSP (follow-up 2241). Toast vermelho se `xmlUids>10 && pctFolhasUid<0.30`. Ver `shared/changelog.ts`.
- ~~Rev. 2241~~ — FIX/SCHEMA · Coluna `msp_uid` criada em `planejamento_atividades` (DRIFT drizzle↔DB); renomeados índices `clcom_*` da `clienteComentarios`. Ver `shared/changelog.ts`.

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
