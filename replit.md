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

- **Rev. 2899** — **ASSINATURA ELETRÔNICA (INTEGRASIGN/FcSign) — BOTÕES "EDITAR" E "EXCLUIR" AGORA APARECEM DIRETO EM CADA CARD DA LISTA DE ENVELOPES (ANTES SÓ NO PAINEL DE DETALHES).** Pedido (print iPad — usuário reabriu o tema): "Quero poder editar e apagar os envelopes." A Rev. 2898 já tinha entregue Editar/Excluir, mas só no PAINEL DE DETALHES (lado direito), que abre depois de CLICAR num envelope — no print o usuário estava na lista ("Selecione um envelope" à direita) e não via os botões. SOLUÇÃO (SÓ CLIENT, ADITIVA — ZERO schema/server/ALTER/DROP/DELETE): `client/src/pages/IntegraSignDashboard.tsx` — cada card da lista ganha dois botões-ícone (Pencil "Editar" / Trash2 "Excluir") ao lado do chevron, ambos com `e.stopPropagation()` p/ não selecionar o card; reaproveitam `abrirEdicao(env)` e `setDeleteDialog(env.id)` (dialogs e backend `editarEnvelope`/`excluirEnvelope` soft-delete da Rev. 2898 — nenhuma procedure nova). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2898** — **ASSINATURA ELETRÔNICA (INTEGRASIGN/FcSign) — DASHBOARD DE CONTRATOS AGORA PERMITE EDITAR E EXCLUIR OS ENVELOPES EM QUALQUER STATUS.** Pedido (print iPad da tela IntegraSign): "Preciso poder editar, ou excluir os contratos." A tela só tinha Enviar/Cancelar/Nova Versão/Reenviar/Copiar link: (1) NÃO havia botão "Editar" na UI; (2) "Excluir" só aparecia p/ rascunho/cancelado — os contratos do print (enviado/em_andamento/concluído) não tinham como ser editados nem excluídos. AGRAVANTE (R-001/R-007/R-010): o `excluirEnvelope` antigo fazia HARD DELETE (`db.delete()`×3 — envelope+signatários+audit), violando a regra de ouro e destruindo registro legal. SOLUÇÃO (aditiva — ZERO ALTER/DROP/DELETE destrutivo): (1) SCHEMA `drizzle/schema.ts` nova coluna `excluidoEm` (timestamp nullable) em `integrasign_envelopes` + self-heal `[SyncSchema+]` Rev. 2898 (`ADD COLUMN IF NOT EXISTS excluido_em`). (2) BACKEND `server/routers/integrasign.ts`: `excluirEnvelope` reescrito como SOFT-DELETE (marca `excluido_em=now` em QUALQUER status, audit `envelope_excluido`, preserva tudo no banco; `listarEnvelopes` ganha `isNull(excluidoEm)`); NOVA procedure `editarEnvelope` (título/descrição em qualquer status — metadado, não toca o hash; CORPO só em rascunho, senão BAD_REQUEST orientando Cancelar→Nova Versão; guard de tenant; audit `envelope_editado`). (3) FRONT `client/src/pages/IntegraSignDashboard.tsx`: botão "Editar" (Pencil) + dialog (título/descrição sempre; corpo só rascunho c/ aviso); botão "Excluir" em TODOS os status; texto do dialog de exclusão ajustado p/ soft-delete. (4) COERÊNCIA (pós code review): `isNull(excluidoEm)` propagado p/ `getEnvelope`/`editarEnvelope`/`atualizarTextoContrato`/`enviarParaAssinatura`/`cancelarEnvelope`/`criarNovaVersao` + checagem de `excluidoEm` nas rotas públicas `getDocumentoPublico`/`assinarDocumento`/`recusarDocumento` (contrato excluído não fica acessível/assinável por ID ou link). ZERO ALTER/DROP/DELETE destrutivo. Detalhe: `shared/changelog.ts`.
- **Rev. 2897** — **ASSINATURA ELETRÔNICA (INTEGRASIGN/FcSign) — "BAIXAR CONTRATO ASSINADO" AGORA GERA PDF PROFISSIONAL (LOGO DA CONSTRUTORA + FAIXA AZUL + CORPO COM A TABELA EAP PRESERVADA + REGISTRO DE ASSINATURAS + HASH) NO LUGAR DO `.txt` PLANO.** Pedido (anexo do `.txt` do CT-2026-0013 — RF Gesso): "baixar em PDF com todas as assinaturas, logo da construtora e todos os dados conforme a visualização". O botão da tela pública `/integrasign/assinar/:token` gerava `Blob text/plain` (sem logo/formatação). SOLUÇÃO (SÓ CLIENT, ADITIVA — ZERO schema/server/ALTER/DROP/DELETE): (1) NOVO `client/src/lib/contratoAssinadoPdf.ts` → `gerarContratoAssinadoPdf(...)` usa `jspdf` (já dep; mesmo padrão de `epiReceiptPdf.ts`): logo de `${origin}/logo-fc.jpg` (fetch→FileReader→dataURL, fallback silencioso), faixa azul `#1B2A4A` com o título, corpo em Courier 7pt (preserva o alinhamento da tabela EAP) com quebra de página, registro de assinaturas (nome/papel/"Assinado em <data>"/status), hash SHA-256, rodapé FcSign + nota de conformidade (MP 2.200-2/2001 e Lei 14.063/2020) + "Página X de Y"; datas via `formatDateTime` iOS-safe; download direto `pdf.save("<titulo>_assinado.pdf")` (1 toque — ideal no iPad). (2) `client/src/pages/IntegraSignAssinar.tsx` — os 2 handlers (`handleDownload` do branch `jaAssinado` e `handleSuccessDownload` do branch `sucesso`) trocam a montagem do `.txt` pela chamada ao helper; rótulos viram "Baixar Contrato Assinado (PDF)". Conteúdo idêntico ao da visualização. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2896** — ASSINATURA ELETRÔNICA (INTEGRASIGN) — ABRIR O LINK NO iPad/SAFARI NÃO MOSTRA MAIS O ERRO CRÍPTICO "The string did not match the expected pattern."; AGORA EXIBE MENSAGEM CLARA E AS DATAS RENDERIZAM iOS-SAFE. SÓ CLIENT em `client/src/pages/IntegraSignAssinar.tsx`: helper `msgErroLink(err)` troca a DOMException nativa do iOS por texto claro (erros reais do servidor intactos); os `new Date(...).toLocale*` de RENDER sobre `dataAssinatura` trocados pelos helpers iOS-safe `formatDateTime`/`formatDate`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2895** — MEDIÇÃO DE CONTRATOS — LEVANTAMENTO DE CAMPO AGORA É OFFLINE-FIRST NO TABLET (PWA): MEDIR/CONTORNAR/CALIBRAR/FOTOGRAFAR SEM INTERNET E SINCRONIZAR SOZINHO AO RECONECTAR, SEM PERDA/DUPLICAÇÃO. SHARED `shared/levantamentoConsolidado.ts` (`consolidarContornos` server+client); `medicao.sincronizarLote` (≤500 ops idempotentes por `uuid`/`id`, last-write-wins por `atualizadoEm`, guard de tenant por op); CLIENTE sem deps (`offlineDb.ts` IndexedDB + `levantamentoSync.ts` fila/dreno + hook `useLevantamentoOffline.ts`); PWA `manifest.json` icons + `client/public/sw.js` (registro só em produção). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2894** — COMPRAS — NUMERAÇÃO DE EXIBIÇÃO DAS OC/OS AGORA É "NÚMERO PRIMEIRO, ANO DEPOIS" (OC-2026-389 → OC-389-2026), IGUAL AO PADRÃO JÁ APLICADO EM SOLICITAÇÕES (SC) E COTAÇÕES (COT). NOVO helper `shared/numeroOc.ts` (`formatNumeroOcDisplay`); wrap só de EXIBIÇÃO em ~12 telas; valor canônico/geração/busca/PDF do servidor INALTERADOS. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2893** — MEDIÇÃO DE CONTRATOS — NOVO MÓDULO "LEVANTAMENTO DE CAMPO EM PDF": MEDIR ÁREA/VOLUME/PERÍMETRO/CONTAGEM SOBRE A PLANTA (PDF) NO TABLET, CONSOLIDAR POR ITEM DO ORÇAMENTO → R$ E GERAR BOLETIM. Pedido (Task #66): levantamento de campo direto sobre o PDF (tablet): medições numeradas, múltiplos PDFs por pavimento/setor, contornos com calibração de escala, fotos ilimitadas, consolidação por item em R$ e memória de cálculo. SOLUÇÃO (aditiva, ZERO destrutivo): (1) SCHEMA `drizzle/schema.ts` — 4 tabelas novas `medicao_campo` / `_pdfs` / `_contornos` (`geometria_json` normalizado [0..1] + `orcamento_item_id`) / `_fotos`; cada linha com `uuid` client-stable (preparo PWA Task #67) + `deleted_at`; self-heal `[SyncSchema+]` Rev. 2893. (2) GEOMETRIA `shared/levantamentoGeo.ts` (shoelace/linha/volume/contagem + `fatorCalibracao`). (3) BACKEND `server/routers/medicao.ts` — 14 procedures com guard de tenant. (4) FRONT — aba "Levantamento de Campo" + página `MedicaoLevantamento.tsx` (canvas react-pdf + overlay SVG normalizado) + rota em `App.tsx`. ZERO ALTER/DROP/DELETE destrutivo. Detalhe: `shared/changelog.ts`.


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
- **REGRA DE OURO — CAMINHO B (Rev. 2646+, substitui Rev. 2644/2617/2533/2603).** O "% PREVISTO" é a réplica da coluna **"% PREVISTO" (Texto10) do MS Project** — "verdade absoluta". O "% CONCLUÍDA" segue a coluna `PercentComplete`. As duas régua são alinhadas às fórmulas do MSP:
  - **% PREVISTO — FÓRMULA-FONTE (Texto10):** a coluna "% PREVISTO" do MSP é `Int(Num Dur(Prev)[188743983] ÷ PESO DUR(BL)[188743982] × 100 + 0.5)` = fração de duração da baseline DECORRIDA até o StatusDate, ponderada por DURAÇÃO das folhas, **ARREDONDADA** (`+0.5` antes do `Int` = `round`, NÃO trunca).
  - **% PREVISTO — RÉGUA NO ERP (projeção p/ TODAS as semanas):** motor de **TEMPO ÚTIL MINUTO-A-MINUTO** da baseline (`unitsElapsed`/`unitsTotal` sobre `shared/diasUteis`, clipando aos `weekDayIntervals` do calendário). **RAIZ = ROLLUP** = `round(Σ minutos úteis DECORRIDOS das folhas ÷ Σ minutos úteis TOTAIS das folhas × 100)` — soma das DURAÇÕES das folhas, **NÃO** o vão início→fim do projeto (corrigido na Rev. 2644). POR ATIVIDADE = `round(elapsed/total × 100)`. `round` (não `trunc`) p/ espelhar o `+0.5` do Texto10.
  - **% PREVISTO — LEITURA DO VALOR-SNAPSHOT (cliente) (Rev. 2647+, substitui Rev. 2644):** `client/.../ImportarCronograma.tsx` lê SEMPRE a MESMA coluna FIXA `Texto10 (188743750)` via const `FID_PREVISTO_TEXTO10`, em TODOS os projetos (presentes e futuros). **ACABARAM a detecção por `<Alias>` (`detectarFidPorAlias` removida) e as reservas Texto6/Texto11.** Se Texto10 faltar no XML, o valor fica `null` → a tela mostra "—" (jamais lê outra coluna; Texto6 em templates LOTUS é lixo sem alias/fórmula). Vale pra RAIZ (`parseMSProjectFull`) e pra cada ATIVIDADE (`parseMSProjectTasksFromDoc`).
  - **Baseline COM HORA é OBRIGATÓRIA.** Lê `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora). Sem `weekDayIntervals` OU sem TS → fallback day-granular ponderado por duração (backward compat). Cutoff semanal = fim-do-dia (`T23:59:59Z`).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **PADRÃO ATUAL (Rev. 2646): o snapshot "% Previsto" REGENERA EM TODO UPLOAD DO XML — inclusive o SEMANAL — usando o calendário do XML como verdade absoluta.** Acontece em `salvarAtividades` (cadastro/substituir) E em `salvarMetadadosMSProject` (que roda em todo import e regrava o `calendarioJson` limpo). Como a baseline é imutável dentro da revisão, re-rodar é IDEMPOTENTE (mesma curva), mas garante que projetos ANTIGOS se AUTO-CUREM no próximo upload semanal (ex.: a curva ~1% baixa por feriado injetado pré-Rev. 2645 some sozinha). REVOGA a regra anterior "snapshot regenerado SÓ no salvarAtividades / avanço semanal NÃO regenera". RESSALVA: projetos dormentes (sem novos uploads) só corrigem com reimport do cronograma inicial.
  - **RESSALVA DE PARIDADE NUMÉRICA:** o XML de referência (PLN_816 R04) tem StatusDate < StartDate → Texto10 = 0% em tudo, então a curva numérica NÃO foi cravada empiricamente nesta revisão. A régua matemática está alinhada à fórmula; falta re-validar com XML de status-date no meio do projeto.
  - Implementação: `server/routers/planejamento.ts` (`regenerarPrevistoSemanasCaminhoB` — rollup das folhas + round; chamada pós-transaction em `salvarAtividades` E em `salvarMetadadosMSProject` — Rev. 2646, que roda em TODO upload e resolve a revisão ativa + respeita a fonte; `importarComModo` propaga os TS), `client/src/pages/planejamento/ImportarCronograma.tsx` (`detectarFidPorAlias` + parser `<Baseline Number=0>` COM HORA + `<WorkingTime>`→`weekDayIntervals`), `shared/diasUteis.ts` (motor minuto-a-minuto), `drizzle/schema.ts` + self-heal `[SyncSchema+]` (`baseline_start_ts`/`baseline_finish_ts`).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
