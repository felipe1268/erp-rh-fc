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


- **Rev. 2526** — **FOLHA DE PAGAMENTO · RELATÓRIO CONSOLIDADO 2.0 (multi-filtro + severidade + ordenação + impacto R$ + export CSV + tabs Por Funcionário × Por Tipo).** User: "Melhore — tela com TODAS as inconsistências classificadas por filtros pra análise rápida e certeira; navegabilidade mais simples". Sobre a Rev. 2524 (original), 9 melhorias: (1) KPIs viram MULTI-SELECT (combina Ponto+HE, etc, cada tipo com cor ativa distinta); (2) chip-group severidade "Todas/Alta/Média"; (3) `<select>` ordenação (Severidade/Impacto R$/Qtd/Nome); (4) novo KPI dinâmico "Impacto R$" emerald — soma `impactoFinanceiro` (desconto=abs(dif), HE=horas×R$50 proxy, HE folha-sem-ponto=contabValor); (5) export CSV UTF-8 BOM + `;` (Excel BR direto) respeitando filtros; (6) tabs **Por Funcionário** (acordeon atual) × **Por Tipo** (NOVA — agrupa todas divergências por categoria, header colorido + impacto, linhas alta com `bg-red-50/30`); (7) contador "Mostrando X de Y"; (8) botão "Limpar" só aparece com filtro ativo; (9) tabela interna do card respeita filtros (vê só Desconto CLT quando filtrado). Backend INTOCADO — reusa as 3 queries existentes. Arquivos: `client/src/pages/FolhaPagamento.tsx` componente `RelatorioConsolidadoView` (~700 linhas reescritas). Disclaimer: R$50/h é PROXY de priorização, não valor a corrigir. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2525** — **FOLHA DE PAGAMENTO · IMPORT MULTI-PDF: ACUMULAR REGISTROS DE TODOS OS ARQUIVOS ANEXADOS (bug — 2º PDF sobrescrevia o 1º).** User: "ERP precisa analisar TODOS PDFs anexados; hoje analisa só 1 mesmo quando anexo 2 simultaneamente". Causa-raiz em `server/routers/folhaPagamento.ts` L899-946 (mutation `importarFolhaAuto`): dentro do `for` por arquivo, fazia `analiticoData = parsed` / `sinteticoData = parsed` — atribuição direta DESCARTAVA o PDF anterior; só o último sobrevivia até o bloco de persistência (L932+). Cliente (L1209-1234) já enviava `arquivos[]` completo — bug 100% server. Fix: trocado por PUSH com dedup defensiva por chave `${codigo}|${normalizeNome(nome)}|${dataAdmissao}` (Set), pra absorver caso o user anexe o mesmo PDF 2× por engano. Capturada `registrosEsteArquivo = parsed.length` ANTES do merge pra que `payrollUploads.recordsProcessed` registre contagem REAL daquele upload (antes usava acumulado). `processedFiles.push({registros: parsed.length})`, `analiticoUploadId`/`sinteticoUploadId` (último PDF do tipo), e `matchItensComCadastro` 1× no fim com array completo — inalterados. Exemplo: 94 func + 37 func → AGORA 131 (antes 37). Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2524** — FOLHA DE PAGAMENTO — Relatório Consolidado de Divergências v1: UMA tela com TODAS inconsistências por funcionário (cadastro × ponto × desconto CLT × HE). Banner CTA gradient red/amber, 6 KPIs clicáveis, acordeon por func com tabela 5 colunas. Reusa `verificacaoCruzada`+`comparativoDescontos`+`cruzamentoHE`. `client/src/pages/FolhaPagamento.tsx` componente `RelatorioConsolidadoView`. Substituído pela 2526 com filtros multi+severidade+impacto R$+CSV+tabs. Ver `shared/changelog.ts`.
- **Rev. 2523** — FOLHA DE PAGAMENTO — Parser sintético com regex `matchGlued` pro layout SCI Novo Visual (pdf-parse gruda NOME↔CÓDIGO↔DATA↔FUNÇÃO↔VALOR sem whitespace); resolve "0 funcionários processados". Código `\d{1,4}?` LAZY. `server/routers/folhaPagamento.ts` L353-374. Ver `shared/changelog.ts`.
- **Rev. 2522** — FOLHA DE PAGAMENTO — Parser sintético com regex fallback permissivo `matchFlex` (ancora em data dd/mm/yyyy + valor BR `,XX`); resolve "0 funcionários processados" quando `pdf-parse@1.1.1` colapsa whitespace. `server/routers/folhaPagamento.ts` L353-374. Substituído pela 2523 com matchGlued. Ver `shared/changelog.ts`.
- **Rev. 2521** — FOLHA DE PAGAMENTO — Barra de progresso 0→100% no import de PDFs da contabilidade (substitui spinner "Processando PDFs…"). Progresso CLIENTE estimado (sem SSE/WS), curva assintótica até 90% via interval 250ms, snap 100/0 no onSuccess/onError. `client/src/pages/FolhaPagamento.tsx` L371-403 + L7121 + L7198. Ver `shared/changelog.ts`.
- **Rev. 2520** — FOLHA DE PAGAMENTO — Log diagnóstico no import do PDF quando parser devolve 0 registros (gated em `parsed.length===0`, loga primeiras 60 linhas com `JSON.stringify`). `server/routers/folhaPagamento.ts` L878-897. Mantido ativo após Rev. 2522 como rede de segurança. Ver `shared/changelog.ts`.

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
