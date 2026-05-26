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


- **Rev. 2437** — **ALMOXARIFADO · INVENTÁRIO VISUAL · validação CORRETA: volume estimado da baia ≤ saldo do almoxarifado (cobre o caso "subir sem entrada formal", que a Rev. 2436 deixou passar).** Bug: user digitou "restou 80 m³" num item com saldo 10 m³ no sistema — Rev. 2436 só validava BAIXA (`novoVol < antVol`), e como aqui o volume SUBIU (5 → 80), passou direto. Estado fisicamente impossível: card mostrava RESTANTE 80 m³, mas saldo continuou 10 m³. **Fix:** validação de `volumeEstimado > saldoItem` no backend (`server/routers/warehouse.ts` L2564-2586, ANTES do INSERT — sem leitura órfã) + frontend (`InventarioVisual.tsx` L253-266 `confirmarLeitura` + painel ao vivo L881-919 com "Volume informado · Saldo no sistema · Baixa proposta" e aviso ⚠️ "Impossível: a baia não pode ter mais material do que o sistema registra"). Cobre num só if os 2 cenários: baixa que zera saldo + leitura subindo sem entrada. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
- **Rev. 2436** — **ALMOXARIFADO · INVENTÁRIO VISUAL · validação DURA de saldo no BACKEND (Rev. 2435 cobriu só o frontend e o user reportou que ainda passava).** Bug: `baiaLeituraRegistrar` em `server/routers/warehouse.ts` usava `GREATEST(quantidadeAtual - consumo, 0)` no UPDATE do saldo — clamp silencioso. Baixa de 50 num saldo de 10 → debitava 10, criava leitura + movimentação como se desse certo, 40 m³ sumiam da auditoria. **Fix (zero migration):** L2594-2620 — SELECT do `quantidadeAtual` antes do UPDATE; se `consumoDebitado > saldoAtual` (tolerância 1e-9), DELETE da leitura recém-inserida (sem órfã) + `TRPCError BAD_REQUEST` com mensagem contextual (nome+unidade do item). UPDATE vira `quantidadeAtual::numeric - consumo` direto, sem clamp — regressões futuras explodem em vez de silenciar. Frontend (Rev. 2435) + backend (Rev. 2436) = defesa em profundidade. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2435** — ALMOXARIFADO · INVENTÁRIO VISUAL · bloqueio de baixa que zeraria saldo pra negativo + feedback ao vivo no modal "Registrar baixa" (precursor da validação correta da Rev. 2437). `InventarioVisual.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2434** — ALMOXARIFADO · INVENTÁRIO VISUAL · `fmtData` força `timeZone: "America/Sao_Paulo"` (datas mostravam UTC no iPad: 21:37 BRT virava 00:37 do dia seguinte). `InventarioVisual.tsx` L57-73. Ver `shared/changelog.ts`.
- **Rev. 2433** — ALMOXARIFADO · INVENTÁRIO VISUAL · fix layout foto baia vazando sobre mini-cards no Safari iPad — wrapper `overflow-hidden flex-shrink-0` + img `absolute inset-0` + `loading="lazy"`. `InventarioVisual.tsx` L327-345. Ver `shared/changelog.ts`.
- **Rev. 2432** — ALMOXARIFADO · INVENTÁRIO SEMANAL · `window.confirm` nativo substituído por AlertDialog estilizado ao cancelar sessão (mostrava URL Replit + "Bloquear caixas de diálogo" no iOS). `Inventario.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2431** — ALMOXARIFADO · INVENTÁRIO VISUAL · preview visual da foto no modal "Registrar baixa da baia" (`<img>` h-44 + botões Trocar/Remover + badge "Foto pronta · NN KB"). `InventarioVisual.tsx`. Ver `shared/changelog.ts`.

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
