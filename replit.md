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


- **Rev. 2508** — **ALMOXARIFADO · MOVIMENTAÇÕES — Filtro defensivo esconde itens não-material (serviço/MDO/topografia) + classificador ampliado.** User (iPad): "atenção para itens que não tem nada a ver com almoxarifado, tipo serviço de topografia… crie a lógica para garantir isso" + screenshot mostrando "Levantamento Topográfico para As Built", "Serviços de Confecção de Placas Diversas", "Alçapão (Material e Mão de Obra)" como entrega no almox. Causa: regex de `classificarNaturezaItemAlmox` (existente desde Rev. 2389) não cobria topografia/levantamento/as built/sondagem/projeto/locação-de-equipamento — daí topografia passou. Além disso, HISTÓRICO pré-Rev. 2389 já estava no banco e não pode ser deletado (R-001/R-007/R-010). Solução: (1) função movida pra `shared/naturezaItemAlmox.ts` (single source of truth backend+client) com 9 novos patterns + unidades ampliadas (hr/hrs/meses/diária/hh); (2) `server/routers/compras.ts` re-exporta do shared (compat); (3) client `Movimentacoes.tsx` anota timeline via `timelineAnotada` + filtra por `_naturezaMaterial` ANTES dos demais filtros; banner âmbar mostra `ocultasNaoMaterialCount` + botão "Mostrar/Esconder" só pra admin. Zero ALTER/DROP/DELETE — banco intacto, só UI esconde. Gateway OC→Almox (compras.ts L8368) e SmartEntry continuam bloqueando na origem. Follow-up: botão "Reclassificar e estornar" em lote (não implementado). Detalhe: `shared/changelog.ts`.
- **Rev. 2507** — **PERSON PHOTO · LIGHTBOX — Foto ampliada usa quase 100% da tela e respeita EXIF.** User (iPad, Controle de Documentos > Advertências): "A foto está sendo cortada, isso não pode" + screenshot do lightbox do GISLEI com face cortada. Via `user_query` respondeu "inline sem clicar" (provável tap acidental no avatar `PersonPhoto size=sm` da tabela). Causa real: o lightbox já usava `object-contain` (sem corte CSS) e o upload é raw `storagePut` sem `sharp`/crop — se a face está cortada, a fonte do arquivo TAMBÉM está. Fix defensivo em `client/src/components/PersonPhoto.tsx`: `figure` ganha `max-w-[96vw] max-h-[96vh]` (era 92/92); `<img>` ganha style `{ maxHeight: 'calc(96vh - 70px)', maxWidth: '96vw', width:'auto', height:'auto', imageOrientation:'from-image' }` — usa toda a área livre, descontando ~70px da caption, e respeita EXIF orientation tag (alguns iPads/safari interpretam mal). Avatares `size="sm"` na tabela mantidos com `object-cover object-top`. Ressalva: se a foto ainda aparecer cortada, é o arquivo de origem — solução é reenviar via Colaboradores > Foto 3x4. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2506** — DASHBOARD PERFIL POR TEMPO DE CASA · UX — Barra de progresso 0→100% no card "Analisando perfis..." (Anthropic não expõe progresso real → curva assintótica simulada 250ms, satura em 95%, fixa em 100% no `onSuccess`, reset em 800ms). Refs separados (interval + reset timeout), helper `clearIaTimers`, cleanup no unmount. Ver `shared/changelog.ts`.
- **Rev. 2505** — AVALIAÇÃO INTELIGENTE FUNCIONÁRIOS · FASE 2 — 2 novos pilares (Capacitação + Lealdade) elevando score de 4→6 dimensões. `employeeScore.ts` ganha `scoreCapacitacao` (base 70 + 6/válido + 3/recente − 12/vencido) + `scoreLealdade` (escala <6m=60 → 10a+=100, piso 60 LGPD). `PESOS_DEFAULT` 4 core 20% + 2 complementares 10%. UI: 6 KPIs + colunas Capac./Leald. + drill 6 sub-cards. Ver `shared/changelog.ts`.
- **Rev. 2504** — DASHBOARD PERFIL POR TEMPO DE CASA · BUGFIX "Erro na análise IA" (JSON do Claude vinha envolto em fence ```json...```). Novo helper `parseLLMJson` em `server/routers/dashboards.ts` (remove fence + fallback extrai `{...}`/`[...]`). Catch re-throw em vez de engolir. Ver `shared/changelog.ts`.
- **Rev. 2503** — PLANEJAMENTO · BUGFIX aba "Efetivo" invisível para grupos custom — página `efetivo` faltava em `modulePages.planejamento.pages`. Adicionada com actions view/create/edit/delete + rota `/planejamento?tab=efetivo`. Ver `shared/changelog.ts`.
- **Rev. 2502** — COLABORADORES · Campo "Tipo de Remuneração" (Mensalista/Horista) na aba Profissional + CLÁUSULA 2ª do Contrato de Experiência adaptada ao regime. `Colaboradores.tsx` L1855-1870, IIFE L2072-2083, whitelist `server/db.ts` L686. Ver `shared/changelog.ts`.

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
