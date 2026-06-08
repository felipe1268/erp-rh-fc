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

- **Rev. 2893** — **MEDIÇÃO DE CONTRATOS — NOVO MÓDULO "LEVANTAMENTO DE CAMPO EM PDF": MEDIR ÁREA/VOLUME/PERÍMETRO/CONTAGEM SOBRE A PLANTA (PDF) NO TABLET, CONSOLIDAR POR ITEM DO ORÇAMENTO → R$ E GERAR BOLETIM.** Pedido (Task #66): levantamento de campo direto sobre o PDF (tablet): medições numeradas, múltiplos PDFs por pavimento/setor, contornos com calibração de escala, fotos ilimitadas, consolidação por item em R$ e memória de cálculo. SOLUÇÃO (aditiva, ZERO destrutivo): (1) SCHEMA `drizzle/schema.ts` — 4 tabelas novas `medicao_campo` / `_pdfs` (`calibracao_json` por página) / `_contornos` (`geometria_json` normalizado [0..1] + área/perímetro/volume/contagem/qtd/unidade + `orcamento_item_id`) / `_fotos`; cada linha com `uuid` client-stable (preparo PWA Task #67) + `deleted_at`; self-heal `[SyncSchema+]` Rev. 2893 (`CREATE TABLE IF NOT EXISTS`) em `server/_core/index.ts`. (2) GEOMETRIA `shared/levantamentoGeo.ts` (shoelace/linha/volume=área×espessura/contagem + `fatorCalibracao` m/ponto). (3) BACKEND `server/routers/medicao.ts` — 14 procedures com guard de tenant (CRUD campo/pdf/contorno/foto + `getConsolidadoCampo` × `vendaUnitTotal` + `gerarBoletimDoCampo`). (4) FRONT — aba "Levantamento de Campo" em `MedicaoDetalhe.tsx` + página `MedicaoLevantamento.tsx` (canvas react-pdf + overlay SVG normalizado respeitando aspect ratio; calibrar/área/volume/perímetro/contagem; consolidado em R$; fotos `capture=environment`; memória de cálculo HTML/print) + rota `/medicao/:contratoId/levantamento/:campoId` em `App.tsx`. ZERO ALTER/DROP/DELETE destrutivo. Detalhe: `shared/changelog.ts`.
- **Rev. 2892** — **PORTAL DO CLIENTE — LINK PÚBLICO DE AVALIAÇÃO (NPS) AGORA PODE SER SEPARADO POR OBRA, EVITANDO AVALIAÇÃO NA OBRA ERRADA.** Pedido (print iPad aba "Avaliações (NPS)"): "Precisa separar o link por obra... para não ter erro de avaliação." O link da Rev. 2890 era único por empresa; no modo público o seletor de obra fica vazio (`minhasObras` desabilitada) → avaliação caía como "geral"/obra errada. SOLUÇÃO (embute e TRAVA a obra no token, ZERO schema): (1) BACKEND `server/routers/portalExterno.ts` — `admin.gerarLinkAvaliacao` ganha `obraId` opcional (valida tenant → NOT_FOUND; assina JWT com `{obraId, obraNome}`; retorna `{token, obraId, obraNome}`); nova query `admin.obrasDaEmpresaAdmin` lista obras da empresa; `criarAvaliacao` usa `obraIdEfetivo = decoded.obraId ?? input.obraId` (obra do token MANDA). (2) FRONT ADMIN `ClientesPortalAdmin.tsx` — `<select>` de obra ao lado de "Gerar link" + exibe "Link vinculado à obra: X". (3) FRONT PÚBLICO `PortalDashboardCliente.tsx` — decodifica payload base64url do `publicToken`, trava `aval.obraId` e troca `<select>` por campo de leitura "Obra avaliada". ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2891** — MEDIÇÃO DE CONTRATOS — NOVO CONTRATO AGORA AUTO-PREENCHE TAMBÉM O "VALOR MÍNIMO PARA FD" A PARTIR DA CONFIG DE MEDIÇÃO DO PLANEJAMENTO. Pedido (print iPad do modal "Novo Contrato de Medição"): "Tem mais dados que podem ser preenchidos automaticamente, que está no orçamento e no planejamento... verifique isso." O modal já auto-preenchia Valor Total (orçamento), Critério, % Desconto de Sinal, Sinal Recebido e % Retenção (planejamento), mas o campo "Valor Mínimo para FD — Faturamento Direto" ficava SEMPRE vazio mesmo havendo `fd_valor` na Medição do Planejamento. FIX: (1) BACKEND `server/routers/medicao.ts` — `getProjetoMedicaoConfig` passa a SELECIONAR também `fdValor`. (2) FRONTEND `client/src/pages/medicao/MedicaoContratos.tsx` — `handleProjetoSelect` lê `config.fdValor` (>0 → `formatBrlInput`) e seta `form.valorMinimoFd`; `<Label>` ganha o selo "• do planejamento". ZERO schema (coluna já existe); ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2890** — PORTAL DO CLIENTE — LINK PÚBLICO DE AVALIAÇÃO (NPS) PARA ENVIAR DIRETO AO CLIENTE, SEM LOGIN/ACESSO AO PORTAL. Pedido: "Além do portal quero ter a opção de gerar link para enviar ao cliente fazer a avaliação." Reaproveita 100% o formulário NPS e os endpoints públicos: (1) BACKEND `server/routers/portalExterno.ts` — nova `admin.gerarLinkAvaliacao` (admin/admin_master) assina JWT "link aberto" `{tipo:"cliente", companyId, linkAberto:true}` SEM `portalId` (180d, STATELESS); token sem credencial pula o limite por período (anônimo/reutilizável). Guard cross-tenant: admin não-master só gera link da própria empresa. (2) `PortalDashboardCliente.tsx` — prop `publicToken` (modo público): lê token da URL, pula guard de login, desabilita queries que exigem credencial, força aba avaliação. (3) NOVA página `AvaliacaoPublica.tsx` + rota pública `/portal/avaliacao/:token`. (4) `ClientesPortalAdmin.tsx` — botão "Gerar link". ZERO schema; ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2889** — PORTAL DO CLIENTE — NOVO ATALHO "PESQUISA DE SATISFAÇÃO (NPS)" NA BARRA LATERAL, ABRINDO DIRETO A ABA DE AVALIAÇÕES. Pedido: a pesquisa de satisfação (avaliações/NPS) só era acessível entrando em "Acessos do Portal" e trocando manualmente p/ a aba "Avaliações (NPS)"; usuário quer acesso direto no menu. FIX (só front): (1) `client/src/components/DashboardLayout.tsx` — novo item "Pesquisa de Satisfação (NPS)" (ícone `Star`) na seção Administração do menu Portal do Cliente, path `/clientes/portal?tab=avaliacoes` (herda visibilidade de "Acessos do Portal"). (2) `client/src/pages/ClientesPortalAdmin.tsx` — passa a LER `?tab=` via `useSearch` (wouter) p/ inicializar/sincronizar a aba ativa. ZERO schema; ZERO backend; ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2888** — CONTROLE DE REVISÕES — CARD "TOTAL" PASSA A MOSTRAR O NÚMERO DA REVISÃO ATUAL (2888) EM VEZ DA CONTAGEM DE REGISTROS DISTINTOS (2503). Sintoma (print iPad): card "Total" mostrava 2503; usuário aponta que "o correto é 2888". CAUSA: o card usava `revisions.length` (= versões DISTINTAS em `system_revisions`); o banco tem só 2503 distintas porque a numeração tem 383 GAPS reais (números nunca registrados, herdados do `CHANGELOG` legado ≤1878) → `length` ≠ número da revisão atual. FIX (só front `client/src/pages/Revisoes.tsx`): card "Total" passa a exibir `APP_VERSION_NUMBER` (de `@shared/version`) — fonte única do nº da revisão atual; os 5 cards de categoria seguem contando registros (inalterados). ZERO schema; ZERO backend; ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2887** — COLETA DE CAMPO (RH) — ITENS EXTRAS POR LINK, DEFINIDOS NA HORA, MAPEANDO CADA UM PARA UM CAMPO DA FICHA → GRAVA AUTOMÁTICO NA APROVAÇÃO. Pedido: além dos 5 grupos fixos (contato/emergência/endereço/EPI/foto), o RH quer acrescentar na geração do link OUTROS dados (CPF, RG, PIS, CNH, banco/agência/conta, chave PIX, e-mail…), cada um amarrado a um campo do cadastro, de forma que ao APROVAR já caia na ficha. NOVO catálogo SEGURO `CAMPOS_CUSTOM_CATALOGO` (26 campos — subconjunto do whitelist `updateEmployee`) + helpers `shared/coletaCampos.ts`. SCHEMA ADITIVO `coletaRhSessoes.itensCustomJson` (TEXT) + self-heal `[SyncSchema+]`. BACKEND `server/routers/coletaRh.ts`; FRONTEND `ColetaCampo.tsx` + `ColetaCampoPublica.tsx`. ZERO ALTER/DROP/DELETE destrutivo (só ADD COLUMN aditivo). Detalhe: `shared/changelog.ts`.

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
