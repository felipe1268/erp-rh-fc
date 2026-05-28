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


- **Rev. 2516** — **EQUIPAMENTOS LOCADOS — Editor inline de OBRA no modal de GRUPO (drill-down). Vincula/troca/desvincula a obra de todas as unidades do grupo de uma vez.** User (screenshot do modal "Esmilhadeira Angular 5″" / 1 unidade / "Sem obra vinculada"): "quando clicar na edição quer poder editar e indicar a obra que ele ta cadastrada..." Mudança 100% client-side em `client/src/pages/equipamentos/Locados.tsx`: (1) **State** — 2 novos estados `editandoObraGrupo: boolean` + `novaObraGrupo: string` ("" | "__null__" | "<id>"). (2) **Header do modal GRUPO** — pílula "Editar" (ícone Pencil) à direita da linha "Sem obra vinculada"/nome-da-obra; click abre `<select>` com todas as obras ativas + opção "— Sem obra vinculada —" (permite desvincular) + botões Salvar/Cancelar; `<select>` pré-selecionado com obra atual. (3) **Save** — reusa mutation `locadosVincularObraLote` (já existente da action bar flutuante) com `ids = modalGrupo.unidades.map(u => u.id)` + `obraId` derivado; sucesso → `invalidate()` + toast + fecha o modal (key do grupo muda com a obra); erro → `formatTrpcError`. (4) **Close paths** — `setEditandoObraGrupo(false)` em backdrop click + X + Fechar pra não deixar picker pendurado. (5) **Import** — `Pencil` adicionado ao único import de `lucide-react`. Zero ALTER/DROP/DELETE — server inalterado. Detalhe: `shared/changelog.ts`.
- **Rev. 2515** — **EQUIPAMENTOS PRÓPRIOS — Lightbox ao clicar na foto do card + FOTOS sempre visíveis no modal (saíram de dentro de "Mais detalhes").** User (iPad, screenshot do modal sem fotos): "quando clicar na foto, quero que ela aumente de tamanho pra facilitar a visualiação.. e quando estou clicando na tela de edição, a foto precisa aparecer tbm. ate porque posso precisar adicionar novas fotos, ou trocar." Mudanças 100% client-side em `client/src/pages/equipamentos/Proprios.tsx`: (1) **Lightbox** novo (estado `lightbox: {urls, index}|null` + helper `openLightbox`) — overlay z-[60] (acima do modal z-50), `maxWidth:96vw/maxHeight:96vh/object-contain/imageOrientation:from-image` (padrão Rev. 2507), botão X canto sup-dir, setas ‹ › + contador "N/total" quando há +1 foto, useEffect com keydown listener (Esc fecha, ←/→ navegam, cleanup no unmount), click no backdrop fecha (foto/setas com stopPropagation). (2) **Card thumbnail** virou `<button>` (era `<div>`) com `e.stopPropagation()` no onClick pra não disparar `abrirEdit(p)` do card pai + hover state com pílula "Ampliar" pra dar affordance + `disabled` quando sem foto. (3) **Modal FOTOS** movido pra FORA do collapse "Mais detalhes" e removido o gating `{editingId && (...)}` — antes user precisava abrir accordeon (que começa colapsado desde Rev. 2512) E estar em edição pra ver upload; agora bloco `<FotosUploader>` + grid 6-col de thumbs ampliáveis fica sempre visível em criar e editar. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2514** — EQUIPAMENTOS PRÓPRIOS — Rastreabilidade: card e modal informam OBRA + criador (`criadoPorUserId`/`criadoPorNome` via ADD COLUMN IF NOT EXISTS + LEFT JOIN em obras multi-tenant). `server/routers/equipamentos.ts` + `client/src/pages/equipamentos/Proprios.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2513** — EQUIPAMENTOS PRÓPRIOS — Padronização MAIÚSCULA em todos os textos + código de patrimônio AUTO-GERADO server-side com UNIQUE constraint + retry de 8 tentativas em PG 23505 (anti-race entre dispositivos). `server/routers/equipamentos.ts` (helpers `upperBR` + `proximoCodigoPatrimonio`) + `client/src/pages/equipamentos/Proprios.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2512** — EQUIPAMENTOS PRÓPRIOS — Modal redesenhado em 2 colunas (cabe sem scroll) + cadastro de NOVAS categorias (localStorage por company) + seletor de STATUS no modal de edição. `client/src/pages/equipamentos/Proprios.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2511** — EQUIPAMENTOS PRÓPRIOS — Botão Excluir (soft delete via `ativo=false`) no modal de edição. Server `proprioExcluir` filtrando por company; client `confirmarExcluir` no footer vermelho à esquerda apenas em modo edição. Ver `shared/changelog.ts`.
- **Rev. 2510** — EQUIPAMENTOS PRÓPRIOS — Bugfix CREATE TABLE faltante no bootstrap (`equipamentos_proprios`) + redesign completo da tela com identidade FC (faixa azul #1B2A4A, KPIs com ring colorido, grid de cards, header e modal estilizados). `server/_core/index.ts` ~L2197 + `client/src/pages/equipamentos/Proprios.tsx`. Ver `shared/changelog.ts`.

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
