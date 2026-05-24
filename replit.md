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

- **Rev. 2368** — **UX · Lightbox de foto na Biblioteca: clicar no thumbnail amplia em fullscreen pra melhor visualização (ESC ou click fora fecha).** Pedido user (24/05/2026): "Quando clicar foto, quero que ela seja ampliada para melhor visualização." Thumbnail 80x80px era pequeno demais pra avaliar se a foto retornada pelo DDG (Rev. 2367) correspondia à descrição. **Implementação** (`client/src/pages/equipamentos/Locados.tsx`): estado `lightbox: {url, titulo} | null` + listener `keydown` ESC via useEffect só quando aberto. Modal `fixed inset-0 bg-black/85 backdrop-blur-md z-[60]` (acima do modal Biblioteca z-50), `cursor-zoom-out` no overlay com `onClick={() => setLightbox(null)}`, `stopPropagation` no `<img>` pra clique na imagem não fechar. Imagem `max-w-[95vw] max-h-[88vh] object-contain` preserva aspect, nunca corta. Botão X canto superior direito + título descrição truncado canto superior esquerdo + dica rodapé com `<kbd>` estilizado. A11y: `role=dialog`, `aria-modal=true`, aria-labels. **Mudança no thumb da Biblioteca:** ANTES era sempre `<label>` (click = upload); AGORA — SEM foto continua `<label>` (preserva caminho "Subir"); COM foto vira `<button>` que abre lightbox com overlay preto no hover + ícone `ZoomIn`. Upload de substituição continua acessível via "Remover" + click no thumb vazio OU "Trocar pela web" (Rev. 2367). **Escopo:** intencionalmente NÃO mexi nos thumbs dos cards de grupo/unidade (já têm handlers próprios — hover "buscar nova foto" no grupo, navegação no card da unidade); pode ser feito em revisão futura. **Ícone novo:** `ZoomIn` no import lucide. **R-001/R-007/R-010:** UI-only, zero backend, zero DDL, idempotente.
- **Rev. 2367** — **FEATURE/UX · Extensão do "Buscar na web" (Rev. 2366) pra dentro do modal Biblioteca de fotos — cada linha das 65 descrições ganha botão sky "Buscar na web" que faz DDG → BAIXA o arquivo → storagePut → upsert em `equipamentos_fotos_canonicas` → propaga pras unidades.** Pedido user (24/05/2026, IMG_1165): abriu o modal Biblioteca depois da Rev. 2366 e perguntou "Cadê as fotos aqui?" — contador mostrava "0 com foto na biblioteca" mesmo após o batch ter rodado. **Diagnóstico:** Rev. 2366 só popula `equipamentos_locados.foto_url`, NÃO `equipamentos_fotos_canonicas`. São 2 sistemas paralelos: a biblioteca curada (1 foto por descrição normalizada) é a fonte ESTRATÉGICA (aplica em unidades atuais + importações FUTURAS, porque o `bulkInsert` lê a canônica na hora). A foto da Rev. 2366 não sobrevive a re-importações. Conclusão: faz sentido buscar na web e salvar na biblioteca direto, sem download manual → comprimir → upload. **Backend** (`server/routers/equipamentos.ts:1924`): nova `fotosCanonicasBuscarWebUpsert({companyId, descricaoOriginal})` com tenant guard, fluxo idêntico ao da Rev. 2366 (vqd via 3 regex fallback + timeout 9s; i.js JSON pega 1ª URL https jpg/png/webp ≤1000c). DIFERENCIAL: em vez de gravar URL externa direto, **baixa o arquivo** (timeout 10s, ≤5MB, lê `content-type` pra MIME correto) com **SSRF guard em 3 camadas** (URL→only HTTPS; DNS lookup all+verbatim e rejeita IP privado/loopback/link-local/CGNAT/multicast em IPv4+IPv6; `redirect:'manual'` → 3xx vira erro), joga no `storagePut` com key estável (`equipamentos/fotos-canonicas/{companyId}/{sha1(descNorm).slice(12)}-{ts}.{ext}`), faz UPSERT em `equipamentos_fotos_canonicas` (ON CONFLICT por `company_id+descricao_normalizada`) e propaga em chunks de 1000 IDs. Razão de baixar: URLs externas (CDNs aleatórias) expiram a qualquer momento — biblioteca é fonte oficial, não pode ter URL podre. **Frontend** (`client/src/pages/equipamentos/Locados.tsx`): hook `fotoCanonBuscarWebMut` + Set `buscandoWebBibliotecaDescNorm` (loading por desc, permite paralelismo) + wrapper `buscarWebParaBiblioteca(d)`. UI por linha do modal: SEM foto → botão hero sky `bg-sky-50 border-sky-200` com Globe + "Buscar na web" (vira "Buscando…" com Loader2) + texto fraco "ou clique no quadro p/ subir" (preserva upload manual). COM foto → link sutil "🌐 Trocar pela web" pra trocar a errada. Thumbnail dim 60% + spinner sky no overlay durante busca. Botão Remover desabilita durante busca (anti-race). **Preservado:** endpoint Rev. 2366 (`locadosBuscarFotoWebPorDescricao`) intocado nos cards; `fotosCanonicasUpsert` (upload manual, Rev. 2355) intocado — compartilham só destino (storage + tabela canônica). **R-001/R-007/R-010:** UPDATE escopado, idempotente (ON CONFLICT), zero DDL.
- _placeholder removido na rotação Rev. 2368_

### Revisões recentes (one-liners)

- **Rev. 2366** — FEATURE/UX · Busca de foto "como usuário normal faria" em `/equipamentos/locados`: 1 descrição → DuckDuckGo Images → 1º resultado → UPDATE em todas as unidades. ZERO LLM. Botão hero "Buscar fotos da web" + thumbnails interativos por grupo + widget de progresso flutuante. Ver `shared/changelog.ts`.IA" antigo — ícone Globe, cor sky em vez de pink, badge contador). (3) **Thumbnail interativo no grupo**: COM foto → overlay preto no hover com RefreshCw chama `buscarFotoUma(d,true)`; SEM foto → placeholder INTEIRO vira botão (hover sky-50, badge Globe). Loading mostra spinner. (4) **Widget de progresso flutuante** canto inferior direito (z-80, `role=status`+`aria-live=polite`) com header sky/cyan, barra animada, descrição atual, 3 KPIs (Encontradas/Sem foto/Aplicadas) + botão "Parar busca" (cancela após call atual). **Preservado:** `locadosBuscarFotosComIA` (multi-source LLM) intocado no backend; biblioteca curada (Rev. 2355) segue como caminho determinístico (indigo). **Limitação:** "1º resultado" não é 100% — botão por card permite re-trigger individual; pra casos críticos, biblioteca curada garante 100%. **R-001/R-007/R-010:** UPDATE escopado, idempotente, zero DDL.

### Revisões recentes (one-liners)

- **Rev. 2365** — UX/REORG + KPI · Análise IA "Comprar vs Continuar Alugando" migrada de `/equipamentos/locados` pra Dashboard Almoxarifado aba "Equip. Locados", agora com KPI 0-100% em anel SVG ("% do gasto mensal que vale a pena comprar"). Ver `shared/changelog.ts`.
- **Rev. 2364** — UX/REDESIGN · Modal de cadastro de Equipamentos Próprios refeito do zero pra "servente consegue cadastrar" (foto no topo c/ câmera traseira, descrição único obrigatório, 8 chips de categoria toque, patrimônio auto, mais detalhes collapsible, mobile-first bottom-sheet). Ver `shared/changelog.ts`.
- **Rev. 2363** — UX/FILTRO · Cards KPI da aba "Equip. Locados" do Dashboard Almoxarifado ficaram CLICÁVEIS — clique aplica filtro contextual à tabela abaixo (troca fonte + título + colunas). Ver `shared/changelog.ts`.
- **Rev. 2362** — FEATURE/IA · Nova análise "Comprar vs Continuar Alugando" em /equipamentos/locados — IA estima preço de mercado de cada descrição e calcula payback + recomendação (migrada pra Dashboard na Rev. 2365). Ver `shared/changelog.ts`.

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
