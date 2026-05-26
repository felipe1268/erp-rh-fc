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


- **Rev. 2477** — **CONTROLE DE DOCUMENTOS · foto real do colaborador nas 4 tabelas principais (ASOs, Treinamentos, Atestados, Advertências). Click amplia em lightbox.** User (ref. IMG_1272_1779810349637.png — aba ASO): "Quero em todas estas telas tbm". Extensão natural da Rev. 2476. **Backend** (`server/routers/controleDocumentos.ts`): `fotoUrl: employees.fotoUrl` adicionado ao select dos 4 list endpoints (asos L422, atestados L721, treinamentos L874, advertencias L1015) — custo zero, já tem `innerJoin(employees)`. **Frontend** (`ControleDocumentos.tsx`): import `PersonPhoto`; `<PersonPhoto size="sm">` em flex-row com nome dentro do `<td>` de Colaborador nas 4 tabelas (L2522/2603/2691/2796). Fallback automático pras iniciais blue-FC. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
- **Rev. 2476** — **PAINEL RH · foto real do colaborador em TODOS os 7 MODAIS EXPANDIDOS (drill-down full-screen) do Painel RH. Click amplia em lightbox.** User (ref. IMG_1267_1779810285626.png — modal Férias-Período Aquisitivo expandido): "Quero fotos aqui tbm". Extensão da Rev. 2475 (que cobriu os cards-resumo). **Backend** (`server/routers/homeData.ts`): `fotoUrl` adicionado ao map de `getAniversariantesMes` (L775) — usado pelo modal com navegador de meses; os outros 6 modais já consumiam `homeData.*` (já tinha fotoUrl). **Frontend** (`PainelRH.tsx`, dentro de `<FullScreenDialog cardExpand>`): `<PersonPhoto size="md">` em 9 listas: Aniversariantes do Mês, Férias-Painel/De Férias Agora, Férias-Painel/Próximas Agendadas, ASOs lista principal, ASOs/sem ASO, Férias-Período Aquisitivo, Movimentações 30d, Aniversários de Empresa, Advertências Recentes. Ícones contextuais (HeartPulse/↑↓/ShieldAlert) reduzidos pra 8×8 e ficam ao lado da foto. `stopPropagation` nas fotos onde o card tem `onClick`. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2475** — PAINEL RH · foto real em TODOS os 7 cards-resumo restantes (Aniversariantes, Férias-Painel, ASOs, Férias-Período, Movimentações, Aniversários Empresa, Advertências). `fotoUrl` em 9 data sources + `<PersonPhoto size="xs">` em 9 listas. Ver `shared/changelog.ts`.
- **Rev. 2474** — PAINEL RH · cards de "Avisos Prévios em Andamento" ganham foto real do colaborador ao lado do nome (click amplia em lightbox). `fotoUrl` em `avisosPrevios` + `<PersonPhoto size="xs">` no mini-card com `stopPropagation`. Ver `shared/changelog.ts`.
- **Rev. 2473** — DASHBOARD AVISO PRÉVIO · foto real do colaborador no modal de drill-down (click amplia em lightbox). `fotoUrl` adicionado ao select de `getDashAvisoPrevio`; avatar custom substituído por `<PersonPhoto>`. Ver `shared/changelog.ts`.
- **Rev. 2472** — DASHBOARD AVISO PRÉVIO · modal de drill-down ganha layout ultra moderno (header gradient temático, avatares com gradient único, cards polidos, footer com resumo financeiro). Reutilizado por todos os 13 drill-downs do dashboard. Ver `shared/changelog.ts`.
- **Rev. 2471** — COTAÇÕES · estoque-picker ganha layout ultra moderno (cards em grid, gradient header, chips de filtro por origem, footer com resumo financeiro). Header `#1E1B4B→#312E81→#4C1D95`, chips de origem (Todas/Central/UM POR OBRA), avatar gradient único (hash mod 6), footer com botão Confirmar gradient. Ver `shared/changelog.ts`.

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

> Revisões anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
- **REGRA DE OURO — Leitura do XML do MS Project (Rev. 2427+, vale pra TODAS as obras).** Fonte ÚNICA pra cronograma e avanços semanais. Validada com paridade 100% no XML HOTEL DO PAPA (BL 25/05/2026). Conventions canônicas:
  - **% PREVISTO** (raiz e atividades) = `Texto6` (FieldID 188743746) puro do XML. O MSP calcula via fórmula `Int(((StatusDate − BL_Start)/(BL_Finish − BL_Start))*100)` sobre as datas da BASELINE — não precisa ler `<Baseline>` separado. Fallback compatível: Texto10 (188743750) → Texto11 (188743997).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` nativo do MSP. ZERO heurística (Texto7, AD/(AD+RD), Texto9, Texto12, PhysicalPercentComplete ficaram fora — não são a coluna que o engenheiro vê na tela).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
  - Implementação: `client/src/pages/planejamento/ImportarCronograma.tsx` (bloco "REGRA DE OURO" L257-281).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
