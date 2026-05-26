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


- **Rev. 2465** — **RECEBIMENTO DE EQUIPAMENTO LOCADO · espelho do fluxo de devolução (Rev. 2453+2461) com assinaturas + comprovante PDF + Nº DA OC em destaque.** User: "Desenhamos o fluxo para devolução dos equipamentos locados, preciso do mesmo procedimento, para o recebimento" + clarificação "puxar o número da OS E SEGUIR os mesmos critérios de recebimento de material, porém com as melhorias q fizemos" (IMG_1259 modal antigo single-step + IMG_1260 modal Almoxarifado de referência). **Implementação:** (1) `server/routers/equipamentos.ts#locadoCriar` — 4 inputs OPCIONAIS (`assinaturaEntregador{Nome,Url}` locadora + `assinaturaRecebedor{Nome,Url}` FC), gera `pdfComprovanteToken` via `crypto.randomBytes(24)` SÓ quando ambas sigs presentes (gate igual `locadoDevolverEmLote`), persiste no INSERT do evento RECEBIMENTO, retorna `{ id, comprovante: { eventoId, token } | null }`. Opcionalidade preserva retrocompat com importação em lote do PDF (que cria N equipamentos sem passar pela tela). (2) **NOVO** `server/services/equipmentReceiptPdf.ts` — clone do return PDF (Rev. 2461) com título "COMPROVANTE DE RECEBIMENTO", faixa lateral VERDE (`#059669`), cards INVERTIDOS (Entregador=Locadora azul / Recebedor=FC verde), **Nº DA OC em destaque** via JOIN com `comprasOrdens` (caixa verde claro pré-cards quando 1 OC única; coluna dedicada quando múltiplas), coluna `DIAS` substituída por `DATA INÍCIO`, filtro `evento.tipo === "RECEBIMENTO"`, fotos via `fotosRecebimentoJson`. (3) `server/_core/index.ts` — rota pública `/api/comprovante-recebimento/:eventoId/:token.pdf` espelho da devolução. (4) `client/src/pages/equipamentos/Locados.tsx` — modal "Receber Locação na Obra" 2-etapas (stepper emerald, autofill `recRecNome` com `meAuth.name`, fluxo importação em lote skip etapa 2), share modal estendido com `tipo?: "devolucao"|"recebimento"` (títulos/textos/Web Share condicionais). R-001/R-007/R-010 OK (colunas já existem desde Rev. 2453, ZERO ALTER). Dev server restartou limpo. Detalhe: `shared/changelog.ts`.
- **Rev. 2464** — **HOTFIX build de produção · `SignaturePad` sem `export default` nem `SignaturePadHandle` quebrava `vite build`.** User: "My deployment build failed to publish. Help me debug the error." (IMG_1258 mostrava Publishing parado em "There was an issue publishing your artifact"). **Bug raiz:** `AssinarDocumento.tsx` L6 importa `SignaturePad` como **default** + tipo `SignaturePadHandle` (ref imperativo) + prop `disabled`, mas `client/src/components/SignaturePad.tsx` (Rev. 2453, criado só pro fluxo de devolução) só expunha named export controlado (`value`/`onChange`). Rollup do `vite build` falhava com `"default" is not exported by ...` → exit 1 → Publishing parava no 3º step (Build artifact). `pnpm dev` não pegava porque o esbuild do dev server é permissivo. **Fix:** estendi o componente pra suportar AS DUAS APIs sem breaking change — virou `forwardRef<SignaturePadHandle, SignaturePadProps>`, `value`/`onChange` viraram opcionais (com `onChange?.()`), nova interface `SignaturePadHandle` exportada com `toDataURL()` (respeita o gate `MIN_INK_DISTANCE` Rev. 2453, retorna null se traço < 30px) / `clear()` / `hasInk()`, nova prop `disabled` bloqueia pointer events + esconde botão Limpar + aplica `opacity-60 pointer-events-none`, e `export default SignaturePad` no fim do arquivo. `pnpm build` passou em 1m6s. R-001/R-007/R-010 OK (zero ALTER/DROP/DELETE). Arquivo único: `client/src/components/SignaturePad.tsx`. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2463** — HOTFIX Rev. 2462 · toggle "Exigir aprovação do gestor" travado (coluna não criada no Neon). 3º `ALTER TABLE companies ADD COLUMN IF NOT EXISTS almoxarifado_exige_aprovacao SMALLINT NOT NULL DEFAULT 1` no bloco `SyncSchema+` de `server/_core/index.ts`. Ver `shared/changelog.ts`.
- **Rev. 2462** — AUDITORIA DO ALMOXARIFADO · 3º toggle independente "Exigir aprovação do gestor" (log sempre, aprovação opcional). Schema `companies.almoxarifadoExigeAprovacao` + helper `getAuditoriaInicialFields` (auto-validação quando dispensada) aplicado em `atualizarItem`/`excluirItem`/`excluirUnidade`. Ver `shared/changelog.ts`.
- **Rev. 2461** — COMPROVANTE DE DEVOLUÇÃO (PDF) · layout modernizado + logo FC garantido + NOME DA LOCADORA em destaque pro rastreio. `fetchReturnReceiptData` popula todos fornecedores via `inArray`, header novo, cards de partes com pílula, tabela zebra striping. Ver `shared/changelog.ts`.
- **Rev. 2460** — EQUIPAMENTO LOCADO · botão "Desfazer devolução" no Raio-X com senha + motivo (auditado). Nova mutation `locadoDesfazerDevolucao` em `equipamentos.ts` (tx atômica + UPDATE condicionado + evento `REVERSAO_DEVOLUCAO` + auditoria) + botão laranja no footer do modal + reuso `ModalConfirmacaoAuditoria`. Ver `shared/changelog.ts`.
- **Rev. 2459** — TIMELINE do equipamento locado · recibo de devolução assinado + botão "Gerar/compartilhar PDF" dentro do card do evento. Filtro `f?.url && length>20`, bloco "Recibo de devolução" com PNGs das assinaturas, CTA verde reúso do `modalShareComprovante`. Ver `shared/changelog.ts`.

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
