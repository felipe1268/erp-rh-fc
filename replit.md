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


- **Rev. 2479** — **EFETIVO / EQUIPE DA OBRA · foto real + badge CIPA nas 2 telas drill-down por obra que ainda faltavam:** (1) modal "Equipe — {obra}" do `ObraEfetivo.tsx` (IMG_1278/1279, antes só inicial colorida em avatar gradiente) e (2) tabela "Lista de Funcionários" do `EfetivoObraView` dentro do Planejamento (IMG_1280, já tinha foto+status, faltava CIPA). User: "Quero que tenha fotos de todos os funcionários nestas telas, e considerar a legenda de status de cada um, e quem é cipa tbm". **Backend** (`server/db.ts`): enrich CIPA via `getCipaStatusByEmployeeIds` + `projectCipaFields` em `getObraFuncionarios` (L1864 — spread duplo em `employee.*` e top-level) e `getEquipeObra` (L2831). Custo: +1 query batched/chamada, zero N+1. **Frontend**: `ObraEfetivo.tsx` modal Equipe — substituído `<div bg-gradient initial>` por `<PersonPhoto src={f.employee.fotoUrl} size="sm">` (lightbox + fallback iniciais blue-FC) e `<CipaBadge>` ao lado do nome; status segue evidenciado por agrupamento+tinte da linha (sem `<EmpStatusBadge>` redundante). `PlanejamentoDetalhe.tsx` `EfetivoObraView` (L11500): `<CipaBadge>` ao lado do `e.nomeCompleto` na coluna NOME. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
- **Rev. 2478** — **CIPA · badge identificando membros ATIVOS (verde) e ex-membros em ESTABILIDADE pós-mandato (âmbar com data) em TODAS as telas do Painel RH (10 mini-cards + 9 drill-downs full-screen) e do Controle de Documentos (4 tabelas: ASOs, Treinamentos, Atestados, Advertências).** User: "quero em todas estas telas também um badge marcando quem é da CIPA ativa e quem não é mais da CIPA mas ainda tem imunidade/estabilidade pós-mandato" (extensão das Rev. 2475/2476/2477 de fotos). Proteção CF Art. 10 II 'a' ADCT + CLT Art. 165 + Súmula 339 TST. **Helper backend novo** (`server/_core/cipaStatus.ts`): `getCipaStatusByEmployeeIds(db, companyId, ids)` faz 1 query batched JOIN cipa_members→cipa_elections; regra ATIVO = mandato vigente E statusMembro='Ativo'; ESTABILIDADE = ex-membro representacao='Empregados' com fimEstabilidade>=hoje. `projectCipaFields(map, empId)` projeta 4 campos flat pra spread. **Backend** `homeData.ts` (todos os 11 outputs do `getData` + `getAniversariantesMes`) e `controleDocumentos.ts` (4 lists). **Frontend componente novo** (`client/src/components/CipaBadge.tsx`): chips xs/sm verde-emerald (CIPA) ou âmbar (estab. DD/MM), tooltip cita CF Art. 10 II 'a' ADCT. Render em 23 spots (19 no PainelRH, 4 no ControleDocumentos). Custo: 1 query extra/procedure, zero N+1. R-001/R-007/R-010 OK (só SELECT). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2477** — CONTROLE DE DOCUMENTOS · foto real nas 4 tabelas (ASO/Trein./Atest./Advert.). `fotoUrl` em 4 list endpoints + `<PersonPhoto size="sm">` em 4 tabelas. Ver `shared/changelog.ts`.
- **Rev. 2476** — PAINEL RH · foto real em TODOS os 7 MODAIS expandidos (drill-down full-screen). `fotoUrl` em `getAniversariantesMes` + `<PersonPhoto size="md">` em 9 listas dentro de `<FullScreenDialog>`. Ver `shared/changelog.ts`.
- **Rev. 2475** — PAINEL RH · foto real em TODOS os 7 cards-resumo restantes. `fotoUrl` em 9 data sources + `<PersonPhoto size="xs">` em 9 listas. Ver `shared/changelog.ts`.
- **Rev. 2474** — PAINEL RH · "Avisos Prévios em Andamento" ganham foto real ao lado do nome. `fotoUrl` em `avisosPrevios` + `<PersonPhoto size="xs">`. Ver `shared/changelog.ts`.
- **Rev. 2473** — DASHBOARD AVISO PRÉVIO · foto real no modal de drill-down. `fotoUrl` no select de `getDashAvisoPrevio`; avatar custom→`<PersonPhoto>`. Ver `shared/changelog.ts`.

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
