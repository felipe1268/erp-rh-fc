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


- **Rev. 2439** — **ALMOXARIFADO · INVENTÁRIO SEMANAL · thumbnail da foto do item em cada card + overlay ampliado on-tap (facilita aferição visual no iPad).** Pedido user (print sessão Central W22, 173 itens): cards mostravam só nome+qtd+botões BATE/DIFERENTE, sem foto — operador precisava sair pra outra tela pra identificar visualmente itens com nomes parecidos ("Cantoneira 1\"", "Filetes 1,20×0,04 com 2 Frizos" etc.). **Fix:** backend `server/routers/warehouse.ts` L922-951 — `getInventorySessionItems` agora faz LEFT JOIN com `almoxarifado_itens` trazendo `fotoUrl` + `unidade`. Frontend `client/src/pages/almoxarifado/Inventario.tsx` L30-145 — `ItemCard` renderiza thumb 56×56 (pendente) / 48×48 (conferido / divergente) substituindo os ícones; toque na thumb abre overlay `bg-black/85` com imagem ampliada (× pra fechar, toque-fora também). `unidade` real do item substitui o hard-coded "un". `loading="lazy"` em todas as thumbs. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
- **Rev. 2438** — **ALMOXARIFADO · VISÃO GERAL · badge do item mostra o NOME da obra (antes só "Obra: 100" genérico).** Pedido user (print iPad 21:57): busca em todos os almoxarifados → card Areia Lavada agregado só mostrava "Central: 100" / "Obra: NN" sem dizer QUAL obra. **Fix:** `client/src/pages/almoxarifado/index.tsx` — view Cards (L1932-1950) e Tabela (L1991-2010) reformuladas: badge passa a fazer lookup em `obrasAtivas` por `a.obraId` (fallback `Obra #${id}`) + `max-w-[140px]` (card) / `[180px]` (tabela) + `truncate` + `title` com nome completo+qtd+unidade pra long-press no iPad. Zero query nova — `obrasAtivas` já estava no escopo. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2437** — ALMOXARIFADO · INVENTÁRIO VISUAL · validação CORRETA `volumeEstimado ≤ saldoItem` (back+front) — cobre num só if "subir sem entrada" e "baixar pra negativo". `warehouse.ts` L2564-2586 + `InventarioVisual.tsx` L253-266/L881-919. Ver `shared/changelog.ts`.
- **Rev. 2436** — ALMOXARIFADO · INVENTÁRIO VISUAL · validação DURA de saldo no BACKEND (precursor da Rev. 2437 — só pegava BAIXA, não pegava leitura subindo). `server/routers/warehouse.ts` L2594-2620. Ver `shared/changelog.ts`.
- **Rev. 2435** — ALMOXARIFADO · INVENTÁRIO VISUAL · bloqueio de baixa que zeraria saldo pra negativo + feedback ao vivo no modal "Registrar baixa" (precursor da validação correta da Rev. 2437). `InventarioVisual.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2434** — ALMOXARIFADO · INVENTÁRIO VISUAL · `fmtData` força `timeZone: "America/Sao_Paulo"` (datas mostravam UTC no iPad: 21:37 BRT virava 00:37 do dia seguinte). `InventarioVisual.tsx` L57-73. Ver `shared/changelog.ts`.
- **Rev. 2433** — ALMOXARIFADO · INVENTÁRIO VISUAL · fix layout foto baia vazando sobre mini-cards no Safari iPad — wrapper `overflow-hidden flex-shrink-0` + img `absolute inset-0` + `loading="lazy"`. `InventarioVisual.tsx` L327-345. Ver `shared/changelog.ts`.

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
