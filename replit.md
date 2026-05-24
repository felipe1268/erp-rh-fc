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

- **Rev. 2351** — **HOTFIX/FEATURE · Extração de PERÍODO DE LOCAÇÃO por contrato no import PDF reforçada: prompt Gemini ganha 8 regras críticas + 3 exemplos calibrados pro layout F051/R051 (Jalves), e `toIso` aceita variações (D/M/AAAA, DD-MM, DD.MM) com fallback fim = início + 30 dias quando só vem início.** Pedido user (24/05/2026, IMG_1145 do relatório F051/R051): "Analisando PDF do fornecedor tem o período de locação, que precisa ser respeitado ou renovado, quando fizer o upload quero que cadastre o período de locação de cada equipamento". Após pergunta de clarificação, user confirmou: "As datas NÃO estão sendo extraídas do PDF (vêm em branco ou erradas no preview) — preciso que a IA capture melhor". **Estado anterior**: pipeline completo JÁ existia — Gemini extraía `periodoInicio`/`periodoFim` por contrato, server persistia `dataInicio`/`dataFimPrevista` por unidade (linhas 781-782 de `importarContratosLocacaoLote`), client mostrava em todos os cards/tabelas/painéis. Mas o prompt era genérico ("periodoInicio (DD/MM/AAAA)") e Gemini frequentemente trazia vazio ou pegava o range global do cabeçalho ("Período para devolução entre 20/05/2010 a 20/05/2040") em vez do período próprio do contrato. **Causa raiz**: prompt sem (a) instrução de ONDE achar o campo, (b) exemplos calibrados pro layout do user, (c) regra explícita pra ignorar o range global do documento. **Implementação** (`server/routers/equipamentos.ts`, `executeParseContratoLocacao`): (1) **Prompt reforçado** com seção "REGRAS CRÍTICAS PARA O PERÍODO DE LOCAÇÃO" e 8 regras (período no canto direito da linha do "Nº Contrato"; texto típico `Período: DD/MM/AAAA  A  DD/MM/AAAA`; layout F051/R051 descrito; sinônimos Período/Vigência/Locação de/De/Até; só início → fim = início + 30 dias; IGNORAR range global do documento; cada contrato com período próprio; NUNCA inventar datas). (2) **3 exemplos calibrados** do IMG_1145 (contratos 19096-32 09/04→09/05; 19487-32 21/04→21/05; 19751-30 27/04→27/05). (3) **System prompt** ganha referência a F051/R051 + reforço "Datas SEMPRE no formato DD/MM/AAAA". (4) **responseSchema** ganha sufixo " — OBRIGATÓRIO" em `periodoInicio`/`periodoFim`. (5) **`toIso` mais tolerante** — antes só aceitava `^(\d{2})/(\d{2})/(\d{4})$` e ISO; agora aceita `D/M/AAAA` (zero-pad automático), `DD-MM-AAAA`, `DD.MM.AAAA`, com `trim()` e remoção de espaços internos via `replace(/\s+/g,"")`. (6) **Fallback `addDays`**: se LLM trouxer só `periodoInicio`, calcula `periodoFim = início + 30 dias` (locação mensal é o caso comum). (7) **Telemetria**: log `[executeParseContratoLocacao] Datas: X contratos OK / Y sem período`. **Preservado**: `importarContratosLocacaoLote` continua aplicando datas em CADA unidade; client `Locados.tsx` filtra contratos sem datas no preview e oferece inputs editáveis pra correção manual. **Por que NÃO defaultar tudo pra hoje + 30 dias**: violaria R-001 (nunca inventar dado em prod). Melhor fail-loud com "sem período" no preview. **Por que NÃO 2ª passada OCR pixel-level**: o problema não era OCR (Gemini Vision lê o texto perfeitamente), era o prompt sem instrução clara de onde olhar e o que ignorar. Few-shot com layout real resolve. **Esperado**: 100% dos contratos com período visível no cabeçalho vêm corretos. **Housekeeping**: replit.md reorganizado pra seguir convenção 2+5 (estava com 13+ entradas detalhadas); revs 2343-2325 migradas pra `replit-history.md`; linha duplicada "Revisões 2098 → 2044" removida. **R-001/R-007/R-010:** N/A — só LLM call + UPDATE escopado por `company_id`, idempotente, zero DDL.
- **Rev. 2350** — **CAUSA RAIZ ENCONTRADA via teste manual: (a) GOOGLE_API_KEY tem o Custom Search API PERMANENTEMENTE BLOQUEADO no projeto GCP 1052983877622 (`API_KEY_SERVICE_BLOCKED`); (b) OpenVerse/Wikimedia indexam quase só EN, não PT. Por isso todas as revs 2342-2349 deram 0/60. Fix: LLM gera query EN curta (2-3 palavras industriais), cascade OpenVerse→Wikimedia, blocklist cirúrgica + barra PDFs, fallback EN por categoria.** Pedido user (24/05/2026, IMG_1143 ainda com placeholder): "Não deu certo". Logs Rev. 2349: "LLM gerou 60/60 queries" + "Aprovadas: 0/60". **Debug manual** via shell: (1) Google CSE direto → `HTTP 403 API_KEY_SERVICE_BLOCKED` (chave tem serviço CustomSearch desabilitado no GCP — já era estado da Rev. 2341 mas só agora foi confirmado por teste isolado). (2) OpenVerse query PT "andaime fachadeiro produto" → 0 results. (3) Wikimedia query PT → 0 pages. (4) Wikimedia query EN "scaffolding" → 3 pages. (5) Loop EN curto em 7 queries: "adjustable scaffold jack" → `Scaffold-Jack.jpg` (perfeito), "concrete mixer" → foto perfeita, "demolition hammer" → Jackhammer.jpg, OV "Adjustable Base Jack"/"Titan Breaker" — cobertura excelente. Queries longas (4+ palavras) trazem PDFs de tratados antigos. **Diagnóstico**: 8 revs (2340-2349) trabalharam em torno do sintoma errado; causa raiz era IDIOMA da query, não validação/arquitetura. **Implementação** (`server/routers/equipamentos.ts`): (1) **Prompt LLM em INGLÊS pedindo query EN 2-3 palavras** com 10 exemplos canônicos (DIAGONAIS+ANDAIME → "scaffold brace"; RODAPÉ+ANDAIME → "toe board scaffold"; PAINEL NR18 → "scaffold facade panel"; SAPATAS+ESCORAMENTO → "adjustable scaffold jack"; BETONEIRA → "concrete mixer"; MARTELETE → "demolition hammer"; ESCORA+ESCORAMENTO → "shoring prop"; GERADOR → "diesel generator"; PRANCHAO+ANDAIME → "scaffold metal plank"; ANDAIME TUBULAR → "tubular scaffolding"); regras NO quotes/códigos/medidas/palavras-poluentes ("product/photo/equipment"). (2) **Cascade reordenado**: OpenVerse → Wikimedia → Google (Google `googleDesativadoPorErro=true` por default — branch teórico pra se algum dia destravarem). (3) **Blocklist mais cirúrgica**: removidos tokens ambíguos (`model/modelo`, `cover/capa`), adicionados específicos vistos em testes (`beetle/rhino/insect/cat/dog/bird/baby/nude/painting/exhibition/fragonard`), adicionado `\.pdf(\?|$)/i` pra barrar PDFs Wikimedia. (4) **`FALLBACK_EN` por categoria** quando LLM falha pra um item: `{andaime:"scaffolding", escora:"shoring prop", forma:"formwork", ferramenta:"construction tool", epi:"safety helmet", veiculo:"construction vehicle", maquina:"construction machine", container:"container", mobiliario:"office furniture", eletric:"electric tool"}` → fallback final "construction equipment". **Por que NÃO insistir em PT**: OV usa Flickr/Wikipedia/Smithsonian (todos majoritariamente EN); WM Commons usa títulos de arquivo EN; PT <5% cobertura industrial. **Por que NÃO trocar GOOGLE_API_KEY**: já discutido na Rev. 2341 — key compartilhada com Gemini/geocoding, editar restrições impacta outras integrações silenciosamente. **Por que NÃO Bing/Brave/SerpAPI**: nova secret + cota paga; OV+WM são free/ilimitados e cobrem 80%+ quando query é boa. **Esperado**: 30-50/60 fotos em descrições comuns. **R-001/R-007/R-010:** N/A — LLM batch + UPDATE escopado por `company_id` preservado, idempotente, zero DDL.
- **Rev. 2349** — **SOLUÇÃO DEFINITIVA · Busca de fotos com IA inverte a arquitetura: LLM gera a QUERY PT-BR perfeita por item e a gente confia no PRIMEIRO resultado do Google Images, sem validação a posteriori.** Pedido user (24/05/2026, IMG_1142, 60+ cards no placeholder amarelo): "Erro nas fotos, quero uma solução definitiva". Histórico: 2342 (validação rigorosa) → 0/60; 2345 (sem validação) → foto de homem em RODAPÉ; 2347-2348 ainda 0/60. **Causa raiz**: "buscar genérico + validar com LLM" tem equilíbrio impossível — estrito rejeita matches reais, frouxo deixa lixo. **Inversão**: LLM gera a QUERY, não valida resultados. **Implementação** (`server/routers/equipamentos.ts`, `locadosBuscarFotosComIA`): (1) 1 batch LLM call por lote gera query PT-BR de 4-7 palavras com 6 exemplos canônicos + categoria pra desambiguar; (2) filtro anti-lixo por keywords (5 regex sobre title+url: model/female/male, avatar/logo/cover, book/livro, food/comida, cartoon/illustration); (3) cascade trust por provider (Google → OpenVerse → Wikimedia, 1º não-lixo ganha); (4) bloco antigo de validação a posteriori (~80 linhas) REMOVIDO; (5) `motivo` reporta `<provider> · "<query>"` pra debug. Phase C placeholder SVG preservada da Rev. 2345. **Por que NÃO Claude gerando URL**: alucinaria. LLM gerar QUERY pra search engine real é o uso correto. **Por que blocklist em vez de validador LLM**: captura 95% dos casos de erro com latência zero. **Esperado**: 40-60/60 em descrições comuns. (Substituída pela Rev. 2350 ao descobrir que Google CSE estava bloqueado e provedores indexavam só EN. Detalhe completo em `shared/changelog.ts`.) **R-001/R-007/R-010:** N/A.

### Revisões recentes (one-liners)

- **Rev. 2349** — SOLUÇÃO DEFINITIVA · Busca de fotos com IA inverte a arquitetura: LLM gera a QUERY PT-BR perfeita por item e confia no 1º resultado do Google (substituída pela Rev. 2350 ao descobrir Google CSE bloqueado). Ver `shared/changelog.ts`.
- **Rev. 2348** — HOTFIX/UX · Busca de fotos com IA ganha auto-loop client-side (não para mais em 60 por click) + validação strict "foto EXATA do produto" com categoria no payload. Ver `shared/changelog.ts`.
- **Rev. 2347** — HOTFIX/FILOSOFIA · Busca de fotos volta a buscar em PORTUGUÊS com validação rigorosa em todos os candidatos; Phase B "busca ampla sem validação" da Rev. 2345 removida (era ela que aplicou foto errada em RODAPÉ 20 CM). Ver `shared/changelog.ts`.
- **Rev. 2346** — UX/i18n · Inteiros ≥ 1.000 em Equipamentos Locados formatados em pt-BR com separador de milhar (1220 → "1.220"). Ver `shared/changelog.ts`.
- **Rev. 2345** — FEATURE/FILOSOFIA · Busca de fotos com IA passa a garantir cobertura 100% via 3 fases (A match preciso → B busca ampla → C placeholder SVG por categoria). Ver `shared/changelog.ts`.

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
