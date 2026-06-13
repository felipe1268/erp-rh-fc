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

- **Rev. 3051** — **CONFIGURAÇÕES · "SÓCIOS": TODAS AS INFORMAÇÕES DOS SÓCIOS UNIFICADAS EM UM ÚNICO LOCAL (CADASTRO DOS COLABORADORES + ADMINISTRADOR + DADOS FINANCEIROS: PRÓ-LABORE, % SOCIEDADE, PIX, VENCIMENTO).** PEDIDO: "unifique todas as informações dos sócios em um só local"; usuário escolheu a aba Configurações → "Sócios" como painel COMPLETO e o Financeiro só APONTA pra lá. CAUSA-RAIZ: dados espalhados — a aba "Sócios" lia employees `tipoContrato='Socio'` (cadastro + administrador), enquanto o Financeiro tinha CRUD PRÓPRIO em `company_partners` (VAZIA p/ FC 60002), sem VÍNCULO entre as tabelas → pró-labore nunca casava com o sócio do RH. SOLUÇÃO (ZERO ALTER/DROP/DELETE — só ADD COLUMN IF NOT EXISTS/INSERT/UPDATE): SCHEMA `company_partners.employee_id` (elo RH↔financeiro) + self-heal `[SyncSchema+]` Rev.3051 (coluna + índice `idx_cp_employee` + ÚNICO parcial `idx_cp_employee_uniq` = 1 financeiro por sócio, verificados no Neon via pg); BACKEND `financial.ts` NOVOS `listSociosUnificado` (LEFT JOIN LATERAL employees↔company_partners casando por employee_id, fallback CPF normalizado; tenant guard) e `upsertPartnerByEmployee` (salva financeiro ANCORADO no employee, re-vincula registro legado por CPF, valida sócio da empresa = anti-IDOR, exige admin); HARDENING (code review): legados `createPartner`/`updatePartner` ganham tenant guard + admin (fecham IDOR/elevação no caminho antigo da tela `FinanceiroConfiguracoes.tsx`); FRONT `SociosAdministradorSection.tsx` reescrito como painel completo (card por sócio: rádio administrador + % + pró-labore máscara BRL local + dia venc + PIX + salvar), `FinanceiroConfigSection.tsx` vira PONTEIRO (remove CRUD/modal "Novo Sócio", botão → aba Sócios via prop `onManageSocios`), `Configuracoes.tsx` aba renomeada "Sócios". RESSALVA: o cadastro do sócio (nome/CPF/cargo) continua vindo de Colaboradores (tipo "Sócio"); `createPartner`/`updatePartner` legados permanecem (ainda usados pela tela `FinanceiroConfiguracoes.tsx`), agora com tenant guard + admin. Detalhe: `shared/changelog.ts`.

- **Rev. 3050** — **INTEGRASIGN (FCSIGN) · TODO CONTRATO ONLINE É ASSINADO POR 3 SIGNATÁRIOS NA ORDEM FORNECEDOR → GESTOR DA OBRA → SÓCIO ADMINISTRADOR (ESTE POR ÚLTIMO), CADA UM COM SEUS RESPECTIVOS DADOS.** PEDIDO: todo contrato deve ser assinado por fornecedor + gestor da obra + sócio administrador (nome + CPF/CNPJ), nessa ordem, com o sócio por último. CAUSA-RAIZ: contratos de terceiros (CT-AAAA-NNNN) iam ao FCSign com só 2 signatários (fornecedor + gestor) via `integrasign.criarEnvelope` (insere o que o front manda) → "0/2" SEM o sócio; o envelope automático via OC tinha 4 (incluindo "financeiro" genérico + gestor = quem gerou a OC). SOLUÇÃO (ZERO ALTER/DROP/DELETE — só lógica): NOVO `server/services/signatariosContrato.ts` com `resolveSocioAdministradorSigner` (movido de `compras.ts`) + NOVO `resolveGestorObraSigner` (lê `obras.responsavel`, sem CPF); `integrasign.ts` (`criarEnvelope`) injeta o SÓCIO como "diretor" quando o envelope é contrato (`contratoTerceiroId`) e reordena FORNECEDOR/GESTOR → testemunhas → SÓCIO por ÚLTIMO (recalcula ordem + total; idempotente; não afeta advertências); `compras.ts` (`criarEnvelopeIntegraSign`) padroniza para os MESMOS 3 (remove "financeiro", gestor = responsável da obra, total 4→3); FRONT `ContratoDetalhe.tsx` nota no modal avisando que o sócio é adicionado automaticamente. RESSALVA: gestor assina com nome mas sem CPF (obra não persiste CPF do responsável); envelopes já criados não mudam. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3049** — CONFIGURAÇÕES · CRITÉRIO EXCLUSIVO DE SÓCIOS: DEFINIR O "SÓCIO ADMINISTRADOR ATUAL" QUE ASSINA TODOS OS CONTRATOS/DOCUMENTOS ONLINE (FCSIGN); FELIPE COSTA ALVES DEIXADO COMO TAL. `financial.ts` corrige `listSociosFromEmployees` (employees é camelCase) + NOVOS `getSocioAdministrador`/`setSocioAdministrador` (admin-only, UPSERT `system_criteria` societario/socio_administrador_employee_id); `compras.ts` `resolveSocioAdministradorSigner` (signatário "diretor" da OC usa nome+CPF do sócio); FRONT nova aba "Sócios / Administrador". Detalhe: `shared/changelog.ts`.

- **Rev. 3048** — INTEGRASIGN (FCSIGN) · "DETALHES DO ENVELOPE → SIGNATÁRIOS": NOME DO SIGNATÁRIO PARA DE QUEBRAR UMA LETRA POR LINHA (TEXTO VOLTA A SER HORIZONTAL). PEDIDO (prints iPad): o nome (ex.: "CELSO ANTONIO BITTENCOURT SALES JUNIOR") aparecia na VERTICAL, 1 letra/linha. CAUSA-RAIZ (FRONT/CSS): linha do signatário usava `... sm:flex-row sm:items-center sm:justify-between`; no painel estreito o `sm:` já vira row pondo NOME e BOTÕES lado a lado — botões `shrink-0` + nome `min-w-0` colapsam a coluna do nome a ~1 caractere e `break-words` quebra letra a letra. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE) em `client/src/pages/IntegraSignDashboard.tsx`: remove `sm:flex-row sm:items-center sm:justify-between`, deixando `flex flex-col gap-2` — nome ocupa largura inteira (horizontal) e botões (Copiar link/WhatsApp/Reenviar, com `flex-wrap`) vão pra linha de baixo. Detalhe: `shared/changelog.ts`.

- **Rev. 3047** — INTEGRASIGN (FCSIGN) · PÁGINA PÚBLICA DE ASSINATURA PRÉ-PREENCHE AUTOMATICAMENTE "NOME COMPLETO" E "CPF / CNPJ" CONFORME O CADASTRO DO SIGNATÁRIO. SOLUÇÃO (ZERO ALTER/DROP/DELETE — só leitura/exibição): BACKEND `integrasign.ts` (`getDocumentoPublico`) inclui `cpfCnpj` no objeto `signatario` (o `nome` já vinha); FRONT `IntegraSignAssinar.tsx` novo `useEffect([doc.data])` semeia `nomeConfirmado`/`cpfCnpjConfirmado` com guarda `prev => prev || valor` (não sobrescreve digitação; editável). Envelopes antigos sem `cpfCnpj` seguem vazios. Detalhe: `shared/changelog.ts`.

- **Rev. 3046** — CIPA · DIÁLOGO "NOVA AÇÃO" (PLANOS DE AÇÃO) GANHA LAYOUT MODERNO, "RESPONSÁVEL" VIRA SELETOR DE CIPEIROS E "PRAZO" GANHA CALENDÁRIO COM ÍCONE. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE — usa `cipa.planosAcao` create/update existentes; `responsavel` segue TEXT) em `client/src/pages/CipaCompleta.tsx` (diálogo `showPlanoDialog`): card `rounded-2xl` com cabeçalho gradiente FC + ícones por campo e grid responsivo; Responsável vira `<Select>` de `membrosAtivos` (opções "— Sem responsável" e "(externo)" preservando valor fora da lista); Prazo mantém `type=date` + ícone `CalendarDays`. Detalhe: `shared/changelog.ts`.

- **Rev. 3045** — CIPA · ABA "REUNIÕES" GANHA SELEÇÃO MÚLTIPLA COM EXCLUSÃO EM MASSA E ORDENAÇÃO CRESCENTE POR DATA. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE — usa `cipa.reunioes.delete` existente) em `CipaCompleta.tsx`: memo `reunioesOrdenadas` ordena CRESCENTE por `dataReuniao`; estado `selReunioes` (Set) + `Checkbox` header/linha com realce; botão "Excluir N selecionada(s)" → `handleBulkDeleteReunioes` em loop `mutateAsync` (sem toast por item), tolera falha parcial (mantém as que falharam selecionadas), 1 refetch + toast de resumo; seleção limpa ao trocar mandato e saneada quando a lista muda. Detalhe: `shared/changelog.ts`.

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
