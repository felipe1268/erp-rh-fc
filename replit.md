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

- **Rev. 3054** — **INTEGRASIGN (FCSIGN) · PDF DO CONTRATO ASSINADO 100% FORMATADO NO PADRÃO INSTITUCIONAL FC (FONTE SERIF, TABELA EAP REAL, FLUXO DE MEDIÇÃO DESENHADO, ASSINATURAS NO LOCAL DE ASSINATURA).** PEDIDO (print iPad do PDF "CT-2026-0006"): "Ficou péssimo o contrato, arrume p/ ficar formatado com tipo e letra que usamos no ERP; assinatura no local de assinatura; arquivo 100% ajustado incluso o fluxo de medição que adotamos como critério." CAUSA-RAIZ (render do PDF, sem bug de backend): `client/src/lib/contratoAssinadoPdf.ts` despejava `textoContrato` cru em fonte MONOESPAÇADA (Courier 7) p/ preservar a tabela EAP em ASCII (pipes/dashes) → corpo feio; o marcador `{{FLUXOGRAMA_PAGAMENTO}}` VAZAVA LITERAL; e as assinaturas só viravam uma lista "REGISTRO DE ASSINATURAS" no fim (não havia bloco no local de assinatura). SOLUÇÃO (ZERO ALTER/DROP/DELETE — só render/leitura): REESCRITA COMPLETA de `contratoAssinadoPdf.ts` no padrão FC (REGRA DE OURO): (a) cabeçalho logo `${origin}/logo-fc.jpg` (fallback) + RAZÃO SOCIAL + CNPJ + ENDEREÇO parseados do bloco CONTRATANTE + faixa azul #1B2A4A; (b) corpo SERIF (jsPDF "times") JUSTIFICADO via word-spacing manual, cláusulas em negrito/azul, alíneas/subitens indentados (espelha `ContratoDetalhe.tsx`); (c) ESCOPO EAP como TABELA real (cabeçalho azul, zebra, descrição multi-linha, numéricos à direita, TOTAL em negrito) parseando as linhas pipe-delimitadas; (d) FLUXO DE MEDIÇÃO desenhado como 6 caixas numeradas (Medição→Aprovação→Documentação→Emissão NF→Liberação OP→Pagamento) com prazos parseados das alíneas a)–f); (e) ASSINATURAS NO LOCAL: ao achar o bloco estático `____`/"TESTEMUNHAS:" PARA o corpo e renderiza blocos eletrônicos em grade 2 col (nome itálico sobre a linha + nome negrito + cargo/papel + CPF/CNPJ + "Assinado em DD/MM/AAAA HH:MM" verde, ou "Aguardando assinatura"); (f) rodapé hash SHA-256 + MP 2.200-2/Lei 14.063 + paginação. Backend `integrasign.ts` (`getDocumentoPublico`, ambos ramos) passou a SELECIONAR `cargo`/`cpfCnpj` em `todosSignatarios` (leitura pura); 2 call sites em `IntegraSignAssinar.tsx` repassam. RESSALVA: a view HTML da tela já era boa e não mudou; o parse do cabeçalho depende do padrão do texto (se não casar, cai p/ logo+faixa, nunca quebra). Detalhe: `shared/changelog.ts`.

- **Rev. 3053** — **INTEGRASIGN (FCSIGN) · "ADICIONAR SÓCIO ADMINISTRADOR" EM CONTRATOS JÁ ENVIADOS QUE FICARAM SÓ COM FORNECEDOR + GESTOR (SEM O LINK DO SÓCIO PARA ASSINAR).** PEDIDO (print iPad): no envelope "CT-2026-0006" só apareciam 2 signatários — "Cadê o link para o sócio administrador assinar?". CAUSA-RAIZ (dados, não regressão): a injeção automática do sócio como 3º signatário só vale da Rev. 3050+ e SÓ atua na CRIAÇÃO (`criarEnvelope`); envelopes antigos (id=9/id=7) ficaram congelados com 2 signatários. O sócio está OK configurado (FELIPE COSTA ALVES, id=6, `tipoContrato='Socio'`, com CPF — confirmado no Neon). SOLUÇÃO (ZERO ALTER/DROP/DELETE — só INSERT signatário + UPDATE contador): NOVO endpoint `integrasign.adicionarSocioAdministrador({companyId, envelopeId})` em `server/routers/integrasign.ts` — valida acesso via NOVA guarda `assertIntegraSignCompanyAccess` (anti-IDOR, fecha gap do router que confiava no companyId do input), exige `contratoTerceiroId` + status ativo, é IDEMPOTENTE (recusa se já há "diretor"), resolve o sócio via `resolveSocioAdministradorSigner` e INSERE signatário `papel:"diretor"` com `ordemAssinatura=max+1` (assina por ÚLTIMO), cargo "Sócio Administrador", `token`/`tokenExpiraEm` (link na hora), status "pendente"; bumpa `totalSignatariosObrigatorios`; auditoria `signatario_adicionado`. FRONT `IntegraSignDashboard.tsx`: botão verde "Adicionar sócio administrador" (Crown) no detalhe do envelope, visível só quando é contrato, ainda sem "diretor" e status ativo; após clicar refaz `getEnvelope`/`listarEnvelopes` e o link aparece (Copiar link/WhatsApp). RESSALVA: contratos NOVOS continuam pegando o sócio sozinhos (Rev. 3050); este botão é o reparo retroativo. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3052** — CONFIGURAÇÕES · "SÓCIOS": INDICAR O SÓCIO ADMINISTRADOR FICOU ÓBVIO — BOTÃO "DEFINIR COMO ADMINISTRADOR" DIRETO EM CADA CARD. CAUSA-RAIZ (FRONT/UX): botão inferior `disabled={!dirty}` (`dirty=selected!==currentId`) nascia FALSE pois o admin atual já vinha selecionado → parecia que a opção não existia. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE — reusa `setSocioAdministrador`) em `SociosAdministradorSection.tsx`: aposentado o rádio+botão único; cada card mostra OU selo "Sócio administrador atual" OU botão verde "Definir como administrador" (sempre habilitado, spinner no card); círculo do cabeçalho vira indicador visual (Crown). Gated por `isAdmin`. Detalhe: `shared/changelog.ts`.

- **Rev. 3051** — CONFIGURAÇÕES · "SÓCIOS": TODAS AS INFORMAÇÕES DOS SÓCIOS UNIFICADAS EM UM ÚNICO LOCAL (CADASTRO + ADMINISTRADOR + DADOS FINANCEIROS: PRÓ-LABORE, % SOCIEDADE, PIX, VENCIMENTO); FINANCEIRO SÓ APONTA PRA LÁ. SCHEMA `company_partners.employee_id` (elo RH↔financeiro) + self-heal `[SyncSchema+]` (coluna + `idx_cp_employee` + ÚNICO parcial `idx_cp_employee_uniq`); BACKEND `financial.ts` NOVOS `listSociosUnificado` (LEFT JOIN LATERAL employees↔company_partners por employee_id, fallback CPF; tenant guard) e `upsertPartnerByEmployee` (anti-IDOR + admin); legados `createPartner`/`updatePartner` ganham tenant guard + admin; FRONT `SociosAdministradorSection.tsx` vira painel completo, `FinanceiroConfigSection.tsx` vira ponteiro, aba renomeada "Sócios". Detalhe: `shared/changelog.ts`.

- **Rev. 3050** — INTEGRASIGN (FCSIGN) · TODO CONTRATO ONLINE É ASSINADO POR 3 SIGNATÁRIOS NA ORDEM FORNECEDOR → GESTOR DA OBRA → SÓCIO ADMINISTRADOR (POR ÚLTIMO), CADA UM COM SEUS DADOS. NOVO `server/services/signatariosContrato.ts` (`resolveSocioAdministradorSigner` movido de `compras.ts` + NOVO `resolveGestorObraSigner` lê `obras.responsavel` sem CPF); `integrasign.ts` (`criarEnvelope`) injeta o sócio como "diretor" em contratos e reordena FORNECEDOR/GESTOR → testemunhas → SÓCIO por último; `compras.ts` (`criarEnvelopeIntegraSign`) padroniza os MESMOS 3 (remove "financeiro", 4→3); FRONT `ContratoDetalhe.tsx` avisa que o sócio entra automaticamente. RESSALVA: gestor sem CPF; envelopes já criados não mudam. Detalhe: `shared/changelog.ts`.

- **Rev. 3049** — CONFIGURAÇÕES · CRITÉRIO EXCLUSIVO DE SÓCIOS: DEFINIR O "SÓCIO ADMINISTRADOR ATUAL" QUE ASSINA TODOS OS CONTRATOS/DOCUMENTOS ONLINE (FCSIGN); FELIPE COSTA ALVES DEIXADO COMO TAL. `financial.ts` corrige `listSociosFromEmployees` (employees é camelCase) + NOVOS `getSocioAdministrador`/`setSocioAdministrador` (admin-only, UPSERT `system_criteria` societario/socio_administrador_employee_id); `compras.ts` `resolveSocioAdministradorSigner` (signatário "diretor" da OC usa nome+CPF do sócio); FRONT nova aba "Sócios / Administrador". Detalhe: `shared/changelog.ts`.

- **Rev. 3048** — INTEGRASIGN (FCSIGN) · "DETALHES DO ENVELOPE → SIGNATÁRIOS": NOME DO SIGNATÁRIO PARA DE QUEBRAR UMA LETRA POR LINHA (TEXTO VOLTA A SER HORIZONTAL). PEDIDO (prints iPad): o nome (ex.: "CELSO ANTONIO BITTENCOURT SALES JUNIOR") aparecia na VERTICAL, 1 letra/linha. CAUSA-RAIZ (FRONT/CSS): linha do signatário usava `... sm:flex-row sm:items-center sm:justify-between`; no painel estreito o `sm:` já vira row pondo NOME e BOTÕES lado a lado — botões `shrink-0` + nome `min-w-0` colapsam a coluna do nome a ~1 caractere e `break-words` quebra letra a letra. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE) em `client/src/pages/IntegraSignDashboard.tsx`: remove `sm:flex-row sm:items-center sm:justify-between`, deixando `flex flex-col gap-2` — nome ocupa largura inteira (horizontal) e botões (Copiar link/WhatsApp/Reenviar, com `flex-wrap`) vão pra linha de baixo. Detalhe: `shared/changelog.ts`.

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
- **Moeda SEMPRE em formato BRL pt-BR (`R$ 100.000,00` — ponto p/ milhar, vírgula p/ centavos).** Tanto na EXIBIÇÃO (usar `formatBRL`) quanto em INPUTS de digitação de valor (usar máscara `maskBRL`/`parseMaskBRL`). Nunca exibir/aceitar o formato cru anglo `100000.00`.
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
