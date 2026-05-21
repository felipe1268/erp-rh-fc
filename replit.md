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

- **Rev. 2240** — **FIX/UX (continuação 2239) · Header de grupo agora funciona para atividades SEM `eapCodigo`.** User: "ainda não ficou ajustado corretamente.. tenho atividade de montagem de andaime mas não sei de qual pai ele se trata". Causa: Rev. 2239 usava `parentEapOf(eap)` mas muita folha importada do MSP vem sem EAP (Item vazio) — `null` → nenhum header. As 4× "Montagem do andaime" (VITRAL 01..04, todas sem EAP) ficavam órfãs. Fix em `PlanejamentoDetalhe.tsx:6427-6450` (novo `grupoParentByAtivId`): walk de `atividades` com stack por `nivel` (mesmo critério do Cronograma), mapeia cada folha-id → `{ id, nome, eap, nivel, ancestors }` do `isGrupo` imediato. Flatmap (L7711-7726) compara por `parent.id` estável. Breadcrumb na linha suprimido quando há header (ancestrais já lá). Funciona com ou sem EAP. **R-001/R-007/R-010:** N/A.
- **Rev. 2239** — **UX/AVANÇO-SEMANAL · Headers de grupo (EAP-pai imediato) antes de cada bloco de atividades.** User: "tenho várias atividades de monta de andaimes, pode ser do vitral 1, 2, 3... não consigo identificar onde é a atividade". A tela listava `folhasExibidas` plano. Agora `.flatMap` detecta troca de pai e emite linha-header `bg-slate-100` antes do 1º filho de cada grupo: EAP + nome em `font-bold uppercase` cor FC `#1B2A4A`. Linha da atividade ganha `pl-6` quando tem header. Stateless. **Limitação corrigida em 2240**: detecção EAP-only falhava para atividades sem EAP. `PlanejamentoDetalhe.tsx:7686-7868`. **R-001/R-007/R-010:** N/A.

### Revisões recentes (one-liners)

- ~~Rev. 2238~~ — STYLE/UI · Regra de Ouro FC aplicada no modal "Nova Revisão do Cronograma": faixa `#1B2A4A` no header com título caixa alta letter-spacing 3px branco, botão primário em azul-marinho FC. `PlanejamentoDetalhe.tsx:12336-12435`. Ver `shared/changelog.ts`.
- ~~Rev. 2237~~ — FEATURE/IMPORTER · Distribuição auto do avanço importado MSP em semanas passadas seguindo curva prevista. `cumW=min(planAtW,imp)`. 2237.1 pós-review: boundary alinhado ao cutoff. Ver `shared/changelog.ts`.
- ~~Rev. 2236~~ — FIX/IMPORTER (continuação 2235) · Avanço de terceiros (Rohr/Lotus/Friul/Santuário marcados `isIndireta=true`) não importava. `folhas`→`folhasComInd`. Ver `shared/changelog.ts`.
- ~~Rev. 2235~~ — FIX/IMPORTER · Importar MS Project pulava 20-30% das atividades (sem campo Item). DOIS maps (UID + Item), removida guarda `if (!wbs) return`. Ver `shared/changelog.ts`.
- ~~Rev. 2234~~ — FIX/UX · Planejamento abria sempre na 1ª semana, não na atual. Effect UNIFICADO em `[semanas, cutoffDow]` em `PlanejamentoDetalhe.tsx:6217-6253`. Ver `shared/changelog.ts`.

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
