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

- **Rev. 2254** — **FIX · Programação Semanal (Padrão LOTUS) preserva a hierarquia EAP completa — pais sem `eapCodigo` (VITRAIS, PROTÓTIPO, VITRAL 01/02/03 etc.) agora aparecem como cabeçalhos de grupo.** User (22/05/2026, screenshots VITRA Sem. 6): folhas apareciam REPETIDAS 3× sem cabeçalho de pai (impossível identificar a qual vitral pertenciam). Causa-raiz em `ProgramacaoSemanalLotus.tsx` memo `linhas`: reconstruía pais por **prefixo de `eapCodigo`** — falhava p/ grupos importados do MSP só com nome (sem código). Fix: troca p/ **walk-back via `nivel` + ordem original** (mesmo algoritmo do Cronograma) — para cada folha visível, percorre array de atividades de trás pra frente empilhando ancestrais `isGrupo=true` com `nivel` < atual, até nível 1. Aplicado em 3 pontos: render on-screen (L437-492), helper `buildLinhas` do export Excel (L1186-1227) e indent visual no `<tr>` do grupo (L1778-1788, `paddingLeft = 8 + (nivel-1)*12 px`). Cache por id; O(N·D) com D=profundidade. **R-001/R-007/R-010:** N/A (frontend only).
- **Rev. 2253** — **UX · Campo "Responsável" do modal "Nova Revisão" vira FIXO (readOnly) — sempre exibe o engenheiro do cadastro da obra.** User (22/05/2026, pós-2252): "AINDA NÃO FOI ALTERADO, E NÃO PRECISA DEIXAR DIGITAR DEVE DEIXAR O NOME FIXADO". 2252 já lia o campo correto (`engenheiroResponsavel`), mas input continuava editável → risco de divergência. Fix em `PlanejamentoDetalhe.tsx` L12592-12604: label "Responsável (do cadastro)"; `value={projetoResponsavel || "—"}` bindado direto ao prop (não ao state); `readOnly` + `tabIndex={-1}` + classes `bg-slate-100 text-slate-700 cursor-not-allowed`; `title` tooltip "Para alterar, edite a obra em Obras → Editar". `form.responsavel` segue no state pro submit (mesmo valor do cadastro). Sem cadastro: mostra "—". **R-001/R-007/R-010:** N/A (frontend only).

### Revisões recentes (one-liners)

- ~~Rev. 2252~~ — FIX · Modal "Nova Revisão" lê `obra.engenheiroResponsavel` (não `proj.responsavel` legado). Ver `shared/changelog.ts`.
- ~~Rev. 2251~~ — UX/FIX · Modal "Nova Revisão" auto-preenche Responsável com engenheiro do cadastro (1ª tentativa, lia `proj.responsavel` legado). Refinada em 2252/2253. Ver `shared/changelog.ts`.
- ~~Rev. 2250~~ — UX · Modal "Nova Revisão" auto-preenche Responsável com nome do usuário logado. Substituída pela 2251/2252/2253. Ver `shared/changelog.ts`.
- ~~Rev. 2249~~ — FEATURE/CONSISTÊNCIA · Topo "Avanço Físico" lê DIRETO snapshot XML MSP (Texto10/Texto7) — Fase 1 pivot "ERP só lê, não calcula". Ver `shared/changelog.ts`.
- ~~Rev. 2248~~ — FIX/CONSISTÊNCIA · Unifica ABSOLUTAMENTE régua topo↔REFIS via `topRefStr` no parent. Ver `shared/changelog.ts`.

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
