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


- **Rev. 2463** — **HOTFIX Rev. 2462 · toggle "Exigir aprovação do gestor" estava travado (coluna não criada no Neon).** User (IMG_1257): "Não consigo desligar a função de aprovação, fica cinza.. vc pode ajustar isso?". **Bug raiz:** Rev. 2462 declarou `almoxarifadoExigeAprovacao` em `drizzle/schema.ts` mas o sync em produção (Neon) é feito por ALTERs HARDCODED no bloco `SyncSchema+` em `server/_core/index.ts` L708-710, que só listava as 2 colunas antigas. Sem o 3º ALTER, o SELECT em `getAlmoxAuditoriaConfig` lançava `column "almoxarifado_exige_aprovacao" does not exist` → query `getAuditoriaConfig` ficava em erro → `auditCfgQ.data` undefined → toggle congelado em ON (fallback `true` do useMemo) e mutation `setAuditoriaConfig` explodia ao tentar UPDATE. **Fix:** adicionado 3º `ALTER TABLE companies ADD COLUMN IF NOT EXISTS almoxarifado_exige_aprovacao SMALLINT NOT NULL DEFAULT 1` no mesmo bloco. Log atualizado pra "Colunas almoxarifado_exige_senha/justificativa/aprovacao garantidas em companies.". Restart confirmou criação no Neon. R-001/R-007/R-010 OK (ADD COLUMN IF NOT EXISTS idempotente). Arquivo único: `server/_core/index.ts`. Detalhe: `shared/changelog.ts`.
- **Rev. 2462** — **AUDITORIA DO ALMOXARIFADO · toggle independente "Exigir aprovação do gestor" (log sempre, aprovação opcional).** User (IMG_1255 + IMG_1256): "quero poder habilitar/desabilitar a obrigatoriedade de aprovar as ações do almoxarifado, mantendo o registro completo… por ora dispensar a aprovação". **Bug raiz:** os 2 toggles existentes (`almoxarifadoExigeSenha`/`...Justificativa`, Rev. 2400) controlavam só o que era pedido na hora da ação — mesmo com ambos OFF, o INSERT em `almoxarifadoAuditoria` caía no default `statusValidacao='pendente'`, criando pendências contraditórias com o aviso "Auditoria desabilitada". **Schema:** nova coluna `companies.almoxarifadoExigeAprovacao` smallint default 1 (auto-sync via `syncSchema+`). **Backend (`compras.ts`):** `getAlmoxAuditoriaConfig` retorna `exigeAprovacao`; novo helper exportado `getAuditoriaInicialFields(companyId, ctx)` retorna `{}` (deixa default `pendente`) OU `{statusValidacao:'validado', validadoPorId/Nome=user_que_fez, validadoEm, observacaoValidacao:"Auto-validado: aprovação não exigida pela empresa."}` quando dispensada. Aplicado nos 3 inserts (`atualizarItem` L1888, `excluirItem` L2288, `excluirUnidade` L3118) + `setAuditoriaConfig` aceita `exigeAprovacao?` opcional (backwards compat). **Backend (`equipamentos.ts`):** `locadoDesfazerDevolucao` lê inline a coluna na transação (mesmo padrão da Rev. 2460). **Frontend:** 3º toggle "Exigir aprovação do gestor" + descrição refeita ("Toda exclusão/alteração fica registrada no log com usuário, horário e IP — independente dos toggles") + 2 alertas contextuais (azul "aprovação dispensada" / âmbar "sem barreira no momento mas gestor aprova depois"). **Decisão:** ações dispensadas viram "Auto-validado" pelo próprio executor — preserva integridade do log e mostra na aba "Validados" com carimbo claro. R-001/R-007/R-010 OK (ALTER ADD COLUMN idempotente). Arquivos: `drizzle/schema.ts`, `server/routers/compras.ts`, `server/routers/equipamentos.ts`, `client/src/pages/configuracoes/AlmoxarifadoConfigSection.tsx`. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2461** — COMPROVANTE DE DEVOLUÇÃO (PDF) · layout modernizado + logo FC garantido + NOME DA LOCADORA em destaque pro rastreio. `fetchReturnReceiptData` popula todos fornecedores via `inArray`, header novo, cards de partes com pílula, tabela zebra striping. Ver `shared/changelog.ts`.
- **Rev. 2460** — EQUIPAMENTO LOCADO · botão "Desfazer devolução" no Raio-X com senha + motivo (auditado). Nova mutation `locadoDesfazerDevolucao` em `equipamentos.ts` (tx atômica + UPDATE condicionado + evento `REVERSAO_DEVOLUCAO` + auditoria) + botão laranja no footer do modal + reuso `ModalConfirmacaoAuditoria`. Ver `shared/changelog.ts`.
- **Rev. 2459** — TIMELINE do equipamento locado · recibo de devolução assinado + botão "Gerar/compartilhar PDF" dentro do card do evento. Filtro `f?.url && length>20`, bloco "Recibo de devolução" com PNGs das assinaturas, CTA verde reúso do `modalShareComprovante`. Ver `shared/changelog.ts`.
- **Rev. 2458** — COMPROVANTE DE DEVOLUÇÃO (PDF) · layout padrão FC + fotos dos equipamentos + fim da página em branco. Header logo+razão social+faixa azul, coluna FOTO (8%) com thumb 32x32pt, rodapé deslocado pra y+5 (sem 2ª página). Ver `shared/changelog.ts`.
- **Rev. 2457** — ALMOXARIFADO · `/almoxarifado/movimentacoes` virou timeline UNIFICADA das 4 fontes (estoque, ferramentas, insumos, transferências). Nova query `warehouse.listTimeline` com UNION ALL + chips FONTE no front. Ver `shared/changelog.ts`.

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
