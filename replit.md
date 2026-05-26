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


- **Rev. 2468** — **HOTFIX REAL DA Rev. 2466 (COTAÇÕES) · "Atender pelo Estoque" agora abre o modal de seleção.** User (image_1779800786361): "o botao ATENDER PELO ESTOQUE ainda nao funciona... ao clicar nele, nao aparece a lista do almoxarifado". **Bug raiz:** `Cotacoes.tsx` tem 2 returns JSX (bloco `if (showDetalhe !== null)` em L2486 + return principal em L6163). O `<Dialog>` que adicionei na Rev. 2466 ficou no return principal, mas o BOTÃO está dentro do bloco fullscreen. Como o `if` faz early-return, o JSX do principal nunca monta quando o user abre uma cotação → state setado mas Dialog desmontado. Bônus: `onClick` do Confirmar também usava `detalheFullscreen` (TDZ no scope errado). **Fix:** movido o Dialog (~125 linhas) pra DENTRO do bloco fullscreen, antes do `</DashboardLayout>`. Agora `detalheFullscreen` está em escopo (L2487) E o Dialog monta. Comentário-âncora deixado na posição antiga. R-001/R-007/R-010 OK (só JSX). Detalhe: `shared/changelog.ts`.
- **Rev. 2467** — **HOTFIX SEGUROS DA FROTA · vincular veículo manualmente na apólice não estava salvando — ao reabrir, o veículo "sumia".** User (IMG_1779800120335 + IMG_1779800168606 + IMG_1779800227158, tela `/frotas/seguros`): "ao vincular manualemnte um veículo na apolice de seguro.. nao está salvando.... quando eu volto na tela, o veivulo que eu seleciono, desaparece". **Bug raiz:** input zod de `frotas.updateInsurance` (`server/routers/frotas.ts` L2655) não declarava `vehicleId`. Frontend (`Seguros.tsx` L106) envia o campo no payload, mas zod strip silencioso descarta tudo que não está no schema → UPDATE rodava sem tocar `vehicle_id` → no banco continuava NULL/antigo → ao reabrir, select aparecia vazio. Evolutivo: tela ganhou "vincular manualmente" depois que o schema do update foi congelado para cadastro inicial via importação de PDF. **Fix:** uma linha — `vehicleId: z.number().optional()` adicionada ao input schema (o `...data` spread no `db.update().set()` já estava correto e passa o campo direto). R-001/R-007/R-010 OK (coluna `vehicle_id` já existe). **Bônus:** mesma Rev. inclui hotfix de regressão da Rev. 2466 — `useQuery` de `listEstoqueDisponivel` em `Cotacoes.tsx` L1157 referenciava `detalheFullscreen` (declarado só dentro do `if (showDetalhe !== null)` em L2487) → TDZ ReferenceError quebrava `/compras/cotacoes` inteiro; trocado por `detalheQ.data` (top-level L981). Detalhe: `shared/changelog.ts`.
- **Rev. 2466** — **COTAÇÕES · botão "Atender pelo Estoque" agora abre modal de seleção do almoxarifado em vez de auto-matchear cego.** User (IMG_1779799532073, COT-2026-0138 MAT "Resma Papel Sulfite"): "botão nao esta funcionando, ao clicar nele ele deve deixar eu selecionar dentro do meu estoque o item que preciso". Esclarecido via user_query: opção B = modal lista almox completo com saldo, user marca, sistema cruza com SC. **Bug raiz:** botão disparava direto `adicionarEstoqueAoMapa.mutate()` que rodava auto-match heurístico (codigo/nome/contém) sobre TODO o almox — quando zero matches (caso comum), criava linha "Estoque" com totalOrcado=R$0 e respostas com qty=0, dando impressão de "não fazer nada". **Implementação:** (1) `server/routers/compras.ts` — NOVA query `listEstoqueDisponivel({ companyId, obraId? })` filtrando central+obra atual com `quantidadeAtual > 0`; `adicionarEstoqueAoMapa` ganhou input OPCIONAL `almoxItemIds: number[]` que vira whitelist via `inArray()` (retrocompat preservada: sem param = varredura completa como antes). (2) `client/src/pages/compras/Cotacoes.tsx` — botão abre novo `Dialog` (max-w-4xl) com busca por nome/código/categoria, tabela scrollável (max-h 420px) com checkboxes click-on-row, pílulas Central/Obra, preço médio, contador no botão Confirmar; `adicionarEstoque.onSuccess` fecha picker e limpa seleção. R-001/R-007/R-010 OK (ZERO ALTER). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2466** — COTAÇÕES · botão "Atender pelo Estoque" passa a abrir modal de seleção do almoxarifado (checkboxes + busca) em vez de auto-match cego. Backend: nova query `listEstoqueDisponivel` + input opcional `almoxItemIds` em `adicionarEstoqueAoMapa` (whitelist via `inArray`). **NOTA:** a entrega do modal em si só ficou completa na Rev. 2468 (hotfix do scope-bug do Dialog). Ver `shared/changelog.ts`.
- **Rev. 2465** — RECEBIMENTO DE EQUIPAMENTO LOCADO · espelho do fluxo de devolução (Rev. 2453+2461) com assinaturas + comprovante PDF + Nº DA OC em destaque. Inputs opcionais (`assinaturaEntregador/Recebedor{Nome,Url}`) em `locadoCriar`, novo `equipmentReceiptPdf.ts` (faixa verde, cards invertidos, Nº OC via JOIN comprasOrdens), rota pública `/api/comprovante-recebimento/:eventoId/:token.pdf`, modal 2-etapas em Locados.tsx. Ver `shared/changelog.ts`.
- **Rev. 2464** — HOTFIX build de produção · `SignaturePad` sem `export default` nem `SignaturePadHandle` quebrava `vite build`. Componente virou `forwardRef<SignaturePadHandle, SignaturePadProps>` com `value/onChange` opcionais + `toDataURL()/clear()/hasInk()` (respeita gate `MIN_INK_DISTANCE`) + prop `disabled` + `export default`. Ver `shared/changelog.ts`.
- **Rev. 2463** — HOTFIX Rev. 2462 · toggle "Exigir aprovação do gestor" travado (coluna não criada no Neon). 3º `ALTER TABLE companies ADD COLUMN IF NOT EXISTS almoxarifado_exige_aprovacao SMALLINT NOT NULL DEFAULT 1` no bloco `SyncSchema+` de `server/_core/index.ts`. Ver `shared/changelog.ts`.
- **Rev. 2462** — AUDITORIA DO ALMOXARIFADO · 3º toggle independente "Exigir aprovação do gestor" (log sempre, aprovação opcional). Schema `companies.almoxarifadoExigeAprovacao` + helper `getAuditoriaInicialFields` (auto-validação quando dispensada) aplicado em `atualizarItem`/`excluirItem`/`excluirUnidade`. Ver `shared/changelog.ts`.

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
