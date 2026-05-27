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


- **Rev. 2502** — **COLABORADORES · Campo "Tipo de Remuneração" (Mensalista / Horista) na aba Profissional + CLÁUSULA 2ª do Contrato de Experiência adaptada ao regime.** User: "preciso de um campo para selecionar MENSALISTA OU HORISTA... caso horista, o texto do contrato deve ser 'receberá a título de remuneração por hora no valor de R$ xx,xx (extenso)' ... caso mensalista, mantém o texto atual". Backend já tinha `employees.tipoRemuneracao` (default 'horista', consumido por `payrollEngine.ts` e `financial.ts`). Mudanças: (1) `client/src/pages/Colaboradores.tsx` L1855-1870 novo `<Select>` Tipo de Remuneração após Tipo de Contrato (default horista, fluído via spread genérico do form para `createMut`/`updateMut`). (2) `Colaboradores.tsx` L2072-2083 CLÁUSULA 2ª virou IIFE condicional: horista usa `formatBRL(form.valorHora)` + `valorPorExtenso(form.valorHora)` com texto "remuneração por hora"; mensalista mantém texto legado com `salarioBase` mensal. (3) `server/db.ts` L686 adicionou `"tipoRemuneracao"` à whitelist `validFields` do `updateEmployee` — sem isso o backend filtrava o campo silenciosamente em edições (achado do code review). Sem schema change. Detalhe: `shared/changelog.ts`.
- **Rev. 2501** — **COTAÇÕES · BUGFIX "Selecionar do Estoque" não finalizava cotação por falta de fallback de vencedor.** User: "erro ao selecionar do estoque nao deixa finalizar cotação, porque nao existe um fornecedor vencedor" — toast "Nenhum fornecedor vencedor identificado" no botão "Aprovar e Gerar OC" quando único participante era "Estoque (Almoxarifado)". Causa raiz em `client/src/pages/compras/Cotacoes.tsx` L2728-2733: `vencForBackend = vencSelecionado ?? fallback`, mas `fallback` só considerava participantes com `totalOrcado > 0` (proposta monetária). Estoque NÃO tem proposta monetária (`isEstoque: true` é só fonte interna do Almoxarifado) → `vencForBackend` null → `vencEst` false → cai no fluxo de fornecedor → `validarCondicoesVencedor` (L2599) dispara o toast. Fix em L2735-2740: novo nível de fallback `estoqueParticipante = participantes.find(p => p.isEstoque)` aplicado APÓS o fallback monetário → `vencSelecionado ?? fallback ?? estoqueParticipante`. Selecionar como Vencedor explícito e melhor proposta monetária mantêm precedência. Backend intacto. Sem schema change. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2500** — CONTRATO DE EXPERIÊNCIA · BUGFIX off-by-one no cálculo das datas fim1/fim2 (CLT: dia do início conta como dia 1). Fix `+ dias - 1` em `homeData.ts` L538-541 e `Colaboradores.tsx` L1875-1876/L1900-1901. Ver `shared/changelog.ts`.
- **Rev. 2499** — AVISO PRÉVIO · UX · Botão do modal mostra "Salvar Alterações" no modo edição (em vez de sempre "Criar Aviso Prévio") + disabled/loading respeita `updateAviso.isPending`. `AvisoPrevio.tsx` L3215-3221. Ver `shared/changelog.ts`.
- **Rev. 2498** — FOLHA + VALE · `employees.dataDesligamentoEfetiva` virou cap superior na repesca de desligados (caso Elizeu — aviso TRABALHADO com `dataFim` projetada em maio mas saída efetiva em março). `gerarVale` ~L2122 e `simularPagamento` ~L2950 em `payrollEngine.ts`. Ver `shared/changelog.ts`.
- **Rev. 2497** — FOLHA + VALE · Aviso INDENIZADO excluído da repesca de desligados (`tn.tipo NOT LIKE '%indenizado%'` em `gerarVale` L2114-2122 e `simularPagamento` L2935-2951). Convenção `homeData.ts` L595-608. Ver `shared/changelog.ts`.
- **Rev. 2496** — FOLHA · Desligados em aviso prévio passam a entrar na folha mensal cheia (espelha `gerarVale`), eliminando "vale órfão". WHERE de `simularPagamento` trocado pra `status IN ('Ativo','Ferias') OR (status='Desligado' AND EXISTS termination_notices ...)` via subquery EXISTS. Ver `shared/changelog.ts`.

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
