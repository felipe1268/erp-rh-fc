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

- **Rev. 2354** — **UX · Inputs de dinheiro no preview do import PDF de locação passam a usar formato BRL "R$ X.XXX,XX" (ponto de milhar + vírgula decimal).** Pedido user (24/05/2026, IMG_1151): "Coloca o valor em dinheiro no formato de dinheiro com ponto e vírgula". **Antes**: "Valor total" do contrato e "Subtotal" do item eram `<input type="number">` cru — exibiam "1641" pra R$ 1.641,00. **Depois** (`client/src/pages/equipamentos/Locados.tsx`, ~2066 e ~2113): `<input type="text" inputMode="numeric">` com padrão centavos — display via `toLocaleString("pt-BR", {minimumFractionDigits:2})`, onChange faz `replace(/\D/g,"") / 100`. Ao digitar "164100" vira R$ 1.641,00 (padrão fintech BR). Classes `text-right tabular-nums` pra alinhamento financeiro. **Por que NÃO componente compartilhado**: só 2 inputs em 1 tela — extrair quando aparecer 3º uso. **Preservado**: tipo do state interno (`number`) e schema Zod inalterados — só representação visual mudou. **R-001/R-007/R-010:** N/A — só UI client-side, zero DDL.
- **Rev. 2353** — **FEATURE/REGRA · Import PDF de locação EXIGE obra vinculada por contrato antes de cadastrar (client bloqueia botão + server recusa BAD_REQUEST). Tudo que for igual + mesma obra fica corretamente agrupado na tela.** Pedido user (24/05/2026, IMG_1150 — 32 unidades com label vermelho "Sem obra vinculada"): "Não pode ter equipamento sem obra vinculada, quando fizer o upload do documento, e o ERP não consegue identificar deve deixar o usuário escolher antes de importar, e tudo que for igual e estiver na mesma obra deve ser agrupado". **Estado anterior**: cruzamento auto por endereço (Rev. 2326) + select manual no preview (Rev. 2326) + agrupamento por descrição+obra (Rev. 2344) JÁ existiam, mas era possível confirmar o import com `obraId` undefined — esses iam pro DB com `obra_id = null` e quebravam o agrupamento posterior (cartões soltos com "Sem obra vinculada"). **Causa raiz**: validação faltando em `confirmarImport` (client) e `importarContratosLocacaoLote` (server). **Implementação client** (`client/src/pages/equipamentos/Locados.tsx`): (1) **Guard no `confirmarImport`** — filtra `importPreview` por `!c.obraId` e abre modal de erro listando os 8 primeiros contratos pendentes. (2) **Banner de cruzamento** vira vermelho/bloqueante quando há sem-obra (label "SEM OBRA — selecione no campo Obra ERP" + nota da regra). (3) **Botão "Confirmar e cadastrar"** com branch visual: se `semObra > 0`, vira vermelho "⛔ N sem obra — vincule antes" com `cursor-not-allowed`; quando 0, volta ao verde normal. **Implementação server** (`server/routers/equipamentos.ts`, `importarContratosLocacaoLote`): guard de defense-in-depth — refuse BAD_REQUEST se `(c.obraId ?? input.obraId)` falsy (fronteira de verdade contra cliente desatualizado). **Sobre o agrupamento** (Rev. 2344 preservada): tela já tem toggle Agrupar/Individual default agrupar; o fix faz o agrupamento funcionar bem na prática porque toda unidade nasce com `obra_id` populado. **Como user resolve os 32 já órfãos**: filtrar "Sem obra vinculada — 32 unid" → "Vincular em lote" (Rev. 2325/2329, fluxo já existente). **Por que NÃO migration retroativa**: violaria R-001 (UPDATE em massa sem critério). **R-001/R-007/R-010:** N/A — só validações novas, zero DDL.

### Revisões recentes (one-liners)

- **Rev. 2352** — CLEANUP/UX · Removida a subpágina "Parâmetros CAPEX" da UI (sidebar + card no hub + rota + page + mapeamento de módulo); backend procedures e tabela DB preservados. Ver `shared/changelog.ts`.
- **Rev. 2351** — HOTFIX/FEATURE · Extração de PERÍODO DE LOCAÇÃO por contrato no import PDF reforçada (prompt Gemini com 8 regras + 3 exemplos F051/R051; `toIso` aceita D/M/AAAA, DD-MM, DD.MM; fallback fim = início + 30 dias). Ver `shared/changelog.ts`.
- **Rev. 2350** — CAUSA RAIZ ENCONTRADA · Busca de fotos com IA — GOOGLE_API_KEY tem Custom Search BLOQUEADO no GCP + OpenVerse/Wikimedia indexam quase só EN. Fix: LLM gera query EN curta, cascade OV→WM, blocklist cirúrgica + barra PDFs, fallback EN por categoria. Ver `shared/changelog.ts`.
- **Rev. 2349** — SOLUÇÃO DEFINITIVA · Busca de fotos com IA inverte a arquitetura: LLM gera a QUERY PT-BR perfeita por item e confia no 1º resultado do Google (substituída pela Rev. 2350 ao descobrir Google CSE bloqueado). Ver `shared/changelog.ts`.
- **Rev. 2348** — HOTFIX/UX · Busca de fotos com IA ganha auto-loop client-side (não para mais em 60 por click) + validação strict "foto EXATA do produto" com categoria no payload. Ver `shared/changelog.ts`.

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
- **Métricas de avanço de obra — fonte ÚNICA é o MS Project (XML LOTUS).** O ERP deve SEMPRE ler do XML do MSP pra garantir paridade absoluta com o que o engenheiro vê no Project. Convenção fixa (Rev. 2260+):
  - **PREVISTO** = campo `% PREVISTO` calculado pelo MSP na **tarefa-resumo** (UID=0). Lido em ordem de prioridade: Texto10 (FieldID 188743750, 4 casas) → Texto11 (188743997) → Texto6 (188743746, inteiro — usado pelo template LOTUS R05). Por atividade: mesma ordem (Texto10 → Texto6).
  - **REALIZADO** = `PercentComplete` da **tarefa-resumo** do projeto. Por atividade: Texto7 (188743747 — %Reali AUX) com fallback `ActualDuration / (ActualDuration + RemainingDuration)` (precisão MSP-nativa).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
