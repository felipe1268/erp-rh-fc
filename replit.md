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
- `server/`: Express backend + tRPC routers
  - `server/_core/`: Auth, OAuth, Vite setup, env config
  - `server/routers/`: tRPC routers per módulo
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (`shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> **Convenção (importante)**: este arquivo guarda APENAS as últimas **5 revisões**, em formato curto (1–3 linhas: o quê + por quê).
> Quando entrar uma nova revisão, **remova a mais antiga daqui** — o histórico completo (com causa-raiz, stack traces, nomes de arquivos, etc.) vive em `shared/changelog.ts`.
> Não duplique conteúdo entre os dois arquivos.

- **Rev. 1776**: **Currículos · renomear função** + **Gestão de Documentos · criar sub-pasta na árvore**. (1) Botão lápis azul ao lado da lixeira em cada função de Currículos → renomeia (UPPERCASE, propaga `funcaoNome` nos currículos vinculados, bloqueia duplicata canônica). (2) Botão verde **📁+** no hover de cada categoria/disciplina (Projetos Técnicos e Documentos da Obra) → cria sub-pasta nova (`createPasta`, herda `ficheiroId`, bloqueia colisão por nome). Sem schema change.
- **Rev. 1775**: **Gestão de Documentos · explorador redesenhado + backfill defensivo + auto-clone de templates**. (A) Painel esquerdo cresce 256→288px, abas viram cards com gradient/badge ATIVO. (B) `UPDATE gd_disciplinas SET tipo_acervo='projeto' WHERE tipo_acervo IS NULL` no ColFix v1775. (C) `ensureDisciplinasProjetoNoFicheiro` em `getFicheiroDetail` clona templates ARQ/EST/ROHR pra obras vazias. Sem schema change.
- **Rev. 1774**: **Gestão de Documentos · 2 acervos por obra (Projetos Técnicos + Documentos da Obra) + Catálogo central de Categorias Administrativas**. Schema: `gd_disciplinas` ganha `tipoAcervo`/`categoriaChave`/`ordem`; nova tabela `gd_categorias_admin_padrao`. 9 seeds padrão (Contratos/Propostas/Atas/Seguros/Licenças/ARTs/Comunicações/Memoriais/Diversos), 5 procedures admin + CRUD inline em Configurações. ColFix v1774.
- **Rev. 1773**: **DDS · Confirm bonito — fim do pop-up nativo**. Novo hook `client/src/hooks/useConfirm.tsx` (`AlertDialog` shadcn, 4 tons: destructive/warning/info/default). Aplicado nos 6 `confirm()` nativos de `DDSGuia.tsx`. Sem schema/server change.
- **Rev. 1772**: **Raio-X · Modal de detalhe do DDS redesenhado**. DialogContent vira `w-[96vw] max-w-[980px]` com 3 zonas (header gradient azul-índigo / body slate-50 com 4 cards + cards Roteiro/Participação/Observações com headers gradiente / footer fixo). Sem schema/server change.

## User preferences

- **Idioma**: português brasileiro em toda comunicação.
- **Publicação**: Autoscale (`pnpm run build` + `node dist/index.js`).
- **Tom de UI**: visual rico, gradientes coloridos por contexto, badges, ícones grandes — evitar telas chapadas.
- **Nunca mostrar valores de secrets** em código ou logs.
