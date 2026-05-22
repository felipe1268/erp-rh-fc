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

- **Rev. 2251** — **UX/FIX · Modal "Nova Revisão do Cronograma" auto-preenche Responsável com o ENGENHEIRO RESPONSÁVEL DA OBRA (cadastro), não com o usuário logado.** User (22/05/2026, pós-2250): "tem que ser o engenheiro responsável da obra, que está no cadastro." Correção da 2250 — o "Responsável" da revisão é o engenheiro do projeto (`proj.responsavel`, já mostrado no header), não quem opera o upload. Fix em `PlanejamentoDetalhe.tsx`: prop `projetoResponsavel={proj?.responsavel ?? ""}` passada pro `<Revisoes />` (L1218); componente `Revisoes` remove `useAuth()` local; estado inicial `form.responsavel = projetoResponsavel ?? ""`; `useEffect` resyncroniza quando query do projeto resolve (só preenche se vazio); `fecharModal` reseta pro responsável do cadastro. Backward-compat: projeto sem responsável → campo vazio. **R-001/R-007/R-010:** N/A (frontend only).
- **Rev. 2250** — **UX · Modal "Nova Revisão do Cronograma" auto-preenche Responsável com nome do engenheiro logado.** User (22/05/2026): "o nome do engenheiro deve ser colocado automaticamente". Antes o campo nascia vazio (placeholder "Engenheiro") e exigia digitação manual a cada revisão. Fix em `PlanejamentoDetalhe.tsx` componente `Revisoes`: `useAuth()` no topo (L12120 — hook já importado); estado inicial `form.responsavel = revUser?.name ?? ""` (L12122); novo `useEffect` (L12124-12128) resyncroniza se `useAuth` resolver após mount (preserva edição manual — só preenche se vazio); `fecharModal` reseta pro nome do logado (L12237). **Substituída pela 2251** — usuário logado ≠ engenheiro responsável da obra. **R-001/R-007/R-010:** N/A (frontend only).

### Revisões recentes (one-liners)

- ~~Rev. 2249~~ — FEATURE/CONSISTÊNCIA · Topo "Avanço Físico" lê DIRETO snapshot XML MSP (Texto10/Texto7) — Fase 1 pivot "ERP só lê, não calcula". Ver `shared/changelog.ts`.
- ~~Rev. 2248~~ — FIX/CONSISTÊNCIA · Unifica ABSOLUTAMENTE régua topo↔REFIS via `topRefStr` no parent. Ver `shared/changelog.ts`.
- ~~Rev. 2247~~ — FIX/CONSISTÊNCIA (1ª tentativa) · Unifica régua Previsto Acumulado topo↔REFIS via `refDateTop`. Insuficiente — corrigido em 2248. Ver `shared/changelog.ts`.
- ~~Rev. 2246~~ — PRIVACY/UX · Removido card "Ocorrências de Segurança" do Painel SST (vazava advertências disciplinares com nome). Ver `shared/changelog.ts`.
- ~~Rev. 2245~~ — SECURITY/UX · Removido card "Atividade Recente - SST" do Painel SST (vazava lançamentos financeiros via `trpc.audit.list` sem filtro de módulo). Ver `shared/changelog.ts`.

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
