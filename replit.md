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


- **Rev. 2459** — **TIMELINE do equipamento locado · recibo de devolução assinado + botão "Gerar/compartilhar PDF" dentro do card do evento.** User (print IMG_1251, modal Raio-X equip #1314 mostrando só um "quadrado preto" no card DEVOLUCAO_FORNECEDOR): "aqui precisa aparecer o recibo de entrada com as assinaturas, e modal pra gerar PDF e enviar via WhatsApp". **Bug raiz:** `fotosJson` legado às vezes guardava `{ url: "" }` ou dataURL vazio → `<img>` ficava preto. As assinaturas e `pdfComprovanteToken` (existentes desde Rev. 2453) NUNCA foram renderizadas na timeline. **Fix fotos:** filtro `f?.url && length > 20` antes de mapear + `onError` que esconde o thumb se a imagem falhar + `bg-slate-100` como placeholder. **Fix recibo:** novo bloco no card do evento (só pra `DEVOLUCAO_FORNECEDOR`) com header "Recibo de devolução" + grid 2 colunas com cards das assinaturas PNG (Entregador FC cinza / Recebedor Locadora emerald, h-12 object-contain) + nomes em bold + fallback italic "sem assinatura". **Fix PDF:** botão CTA verde full-width "Gerar / compartilhar PDF" (só se `pdfComprovanteToken` existe) → monta `${origin}/api/comprovante-devolucao/${e.id}/${token}.pdf` e abre o `modalShareComprovante` EXISTENTE (reúso 100% — WhatsApp/Visualizar/Baixar/Copiar). `voltarParaAlmoxSeNecessario` é no-op quando aberto pela timeline (flag fica false). Frontend-only, sem mudanças em backend/schema. R-001/R-007/R-010 OK. Arquivo único: `client/src/pages/equipamentos/Locados.tsx`. Detalhe: `shared/changelog.ts`.
- **Rev. 2458** — **COMPROVANTE DE DEVOLUÇÃO (PDF) · layout padrão FC + FOTOS dos equipamentos + fim da página em branco.** User (print IMG_1375, comprovante Nº 011147 no Safari iOS): "ajuste o layout pra ter a lista completa, fotos dos produtos, sem páginas em branco, padrão visual alinhado". **Bug raiz:** rodapé posicionado em `pageH-35` (y=807) jogava texto pra uma 2ª página vazia (PDFKit auto-quebrava). **Fix layout:** cabeçalho reescrito no padrão FC centrado — logo 50pt no topo, razão social 13pt bold UPPERCASE centralizada, CNPJ + endereço cinza centralizados, faixa azul `#1B2A4A` full-width 30pt com "COMPROVANTE DE DEVOLUÇÃO" letter-spacing 2.5, linha Nº/Data abaixo. **Fix fotos:** nova coluna FOTO (8% largura) com thumb 32x32pt, altura linha 18→38pt. Pré-resolução assíncrona em `fetchReturnReceiptData` populando `fotosBuffers: Map<id, Buffer>` (mantém gerador síncrono). Prioridade: `fotosDevolucaoJson` → `fotosRecebimentoJson` → `equipamentos_fotos_canonicas` (match por descrição normalizada NFD+uppercase) → `fotoUrl` legado. Novo helper `resolveImageBuffer` suporta `data:image`, `/uploads/`, URLs http(s) (fetch timeout 4s + valida magic bytes JPG/PNG). **Fix rodapé:** removido `pageH-35`, agora desenha em `y+5` logo após assinaturas — conteúdo flui contínuo, sem 2ª página. Page break preserva 220pt (assinaturas+rodapé). R-001/R-007/R-010 OK. Arquivo único: `server/services/equipmentReturnReceiptPdf.ts`. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2457** — ALMOXARIFADO · `/almoxarifado/movimentacoes` virou timeline UNIFICADA das 4 fontes (estoque, ferramentas, insumos, transferências). Nova query `warehouse.listTimeline` com UNION ALL + chips FONTE no front. Ver `shared/changelog.ts`.
- **Rev. 2456** — DEVOLUÇÃO DE LOCAÇÃO · (a) autofill do entregador com user FC logado em `Locados.tsx` + (b) movimentação aparece no Raio-X do funcionário via nova query `empDevolucoesLocacao` em `controleDocumentos.ts`. Ver `shared/changelog.ts`.
- **Rev. 2455** — DEVOLVER LOCAÇÃO · ao concluir, volta pro Almoxarifado da MESMA obra de origem (não joga no Central). `returnToAlmoxObraId` em `Locados.tsx` grava obraId do query param e `voltarParaAlmoxSeNecessario` monta destino `/almoxarifado?obra=X`. Ver `shared/changelog.ts`.
- **Rev. 2454** — [BUG GRAVE — Rev. 2453 fallout] DEVOLVER ESTE (single do card) fechava a tela sem abrir modal de assinatura. `escolherSingle` agora envia o item pelo caminho do lote (`setModalDevLote([l])`) → ganha 2 etapas + assinaturas + comprovante PDF. Ver `shared/changelog.ts`.
- **Rev. 2453** — DEVOLUÇÃO DE LOCAÇÃO · fluxo completo com assinaturas (entregador FC + recebedor locadora) + comprovante PDF compartilhável via WhatsApp. `SignaturePad.tsx` + `equipmentReturnReceiptPdf.ts` + modal 2 etapas + rota pública assinada. Ver `shared/changelog.ts`.

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
