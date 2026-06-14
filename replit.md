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

- **Rev. 3059** — **CONTRATOS DE TERCEIROS · ABA "CONTRATO" FICA VIEW-ONLY QUANDO O CONTRATO JÁ ESTÁ ASSINADO (FCSIGN CONCLUÍDO) — EM VEZ DO TOOLBAR DE EDIÇÃO + FOLHA A4 EDITÁVEL, MOSTRA O ARQUIVO ASSINADO (COM TODAS AS AUTENTICAÇÕES) + BOTÃO DE OLHO (VISUALIZAR) E BOTÃO DE BAIXAR EM PDF.** PEDIDO: na aba "Contrato" do detalhe de contrato de terceiros, quando JÁ ESTIVER ASSINADO via FcSign, travar a edição e mostrar o arquivo assinado com botão de olho (visualizar) + botão de baixar PDF. DIAGNÓSTICO: `ContratoDetalhe.tsx` (aba `tab==="documento"`) sempre renderizava toolbar editável + folha A4, mesmo com `assinaturaStatus==="concluido"` (status já vinha em `getContrato`); o PDF institucional (`contratoAssinadoPdf.ts`·`gerarContratoAssinadoPdf`, com rúbrica/assinatura real/auditoria) só era gerado na rota PÚBLICA por token, e a procedure autenticada `getEnvelope` STRIPA as imagens. SOLUÇÃO (ZERO ALTER/DROP/DELETE): BACKEND nova procedure AUTENTICADA `integrasign.getContratoAssinadoPdfData({companyId, contratoTerceiroId})` (tenant guard `assertIntegraSignCompanyAccess`, busca envelope `concluido` mais recente, retorna `{envelope, todosSignatarios[]}` COM imagens+auditoria espelhando o `getDocumentoPublico`); PDF `gerarContratoAssinadoPdf` ganha `modo?: "download"|"abrir"`+`janela?` (em "abrir" usa `pdf.output("bloburl")`, janela aberta no gesto do clique p/ iOS); FRONT quando assinado a aba vira CARD TRAVADO (ShieldCheck/Lock "edição bloqueada") com "Visualizar contrato" (olho) + "Baixar PDF" + hash SHA-256 + lista de assinaturas. Toolbar/A4 só p/ contratos NÃO concluídos. Detalhe: `shared/changelog.ts`.

- **Rev. 3058** — **RECONTRATAÇÃO · "SÓCIOS TITULARES (APROVADORES)" AGORA SÃO CONFIGURÁVEIS — O ADMIN MASTER ESCOLHE QUAIS USUÁRIOS SÃO OS SÓCIOS TITULARES (ADICIONAR/REMOVER), EM VEZ DE A LISTA SER FIXA EM "TODOS OS ADMIN MASTER".** PEDIDO: print da tela "Configurações › Recontratação" (bloco "Aprovadores titulares (sócios)" com Ana Beatriz Silva Conceição, Camila Mariana de Araujo, Felipe Costa Alves, Mariana Castilho): "Estes nomes de sócios estão errados, quero poder editar e indicar os corretos"; em esclarecimento escolheu "Tem gente ERRADA nessa lista — quero ESCOLHER quais usuários são os sócios titulares". DIAGNÓSTICO (read-only NEON): os 4 são contas REAIS em `users` com `role='admin_master'`; a lista de titulares era DERIVADA e FIXA = todos os admin_master, tanto no FRONT (`Configuracoes.tsx` filtrava por `role==="admin_master"`, só-leitura) quanto no BACKEND (`recontratacao.ts`: `getAprovadores`/`isAprovador` tratavam qualquer admin_master como aprovador). SOLUÇÃO (ZERO ALTER/DROP/DELETE — só config key/value em `system_criteria` + render): BACKEND nova chave `CHAVE_SOCIOS_TITULARES`, helper `getSociosTitularesIds` (lista configurada NÃO-vazia = verdade; vazia/ausente = FALLBACK todos admin_master p/ compat), `getAprovadores`/`isAprovador` passam a ler essa lista (admin_master fora dela deixa de ser aprovador automático; edição da CONFIG segue gated por role, sem auto-lockout), `getSuplentes` devolve `socioTitularIds`+`socioTitulares`, NOVA mutation `setSociosTitulares` (admin_master only, dedup, upsert, auditoria); FRONT `RecontratacaoAprovadoresSection` vira "Recontratação · Aprovadores" com seção "Sócios titulares" EDITÁVEL (picker busca/checkbox de TODOS + "Salvar Sócios Titulares") + "Suplentes" (picker exclui titulares). RESSALVA: sem lista salva, vale o padrão (todos admin_master). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3057** — ESTABILIDADE GLOBAL · LAZY-LOAD RESILIENTE A "IMPORTING A MODULE SCRIPT FAILED" / CHUNK SUMIDO APÓS DEPLOY (AUTO-RECUPERAÇÃO SEM TELA DE ERRO, ESP. IPAD/SAFARI). NOVO `lazyWithRetry()` (`client/src/App.tsx`) que encapsula `React.lazy`: ao detectar erro de chunk faz RETRY 1x após 600ms, senão RECARREGA a página 1x (guard `sessionStorage`, janela 10s) devolvendo promise pendente → Suspense mantém `PageLoader` (sem tela de erro); só na exaustão sobe p/ ErrorBoundary. As 243 chamadas `lazy(() => import())` migraram. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3056** — INTEGRASIGN (FCSIGN) · PDF DO CONTRATO GANHA RÚBRICA DOS SIGNATÁRIOS EM TODAS AS PÁGINAS (ANTI-TROCA DE PÁGINA) + RENDERIZA A ASSINATURA DO SÓCIO ADMINISTRADOR (ÚLTIMO) QUANDO ELE JÁ ASSINOU. `getDocumentoPublico` (2 ramos) passou a trazer `rubricaImagem`/`hashRubrica`; `IntegraSignAssinar.tsx` repassa; `contratoAssinadoPdf.ts` ganha `desenharRubricas()` (faixa no rodapé de CADA página com a imagem real, máx. 4 lado a lado, fallback iniciais). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3055** — INTEGRASIGN (FCSIGN) · PDF DO CONTRATO PASSA A MOSTRAR A ASSINATURA REAL DESENHADA PELO SIGNATÁRIO (IMAGEM) + "CONTROLE DE ASSINATURAS — TRILHA DE AUDITORIA" (nome+CPF confirmados, data/hora, visualizado em, IP, geo lat/long+precisão, dispositivo, termo de aceite, hash SHA-256 individual). `getDocumentoPublico` (2 ramos) passou a selecionar `assinaturaImagem`+campos de auditoria; `contratoAssinadoPdf.ts` desenha a imagem real (fallback itálico p/ envelopes antigos) e a seção da trilha; `IntegraSignAssinar.tsx` repassa os campos. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3054** — INTEGRASIGN (FCSIGN) · PDF DO CONTRATO ASSINADO 100% FORMATADO NO PADRÃO INSTITUCIONAL FC (REESCRITA de `contratoAssinadoPdf.ts`): cabeçalho logo+RAZÃO SOCIAL+CNPJ+ENDEREÇO+faixa azul #1B2A4A, corpo SERIF (Times) justificado com cláusulas em negrito, ESCOPO EAP como TABELA real (zebra), FLUXO DE MEDIÇÃO em 6 caixas numeradas, ASSINATURAS NO LOCAL (grade 2 col substitui as linhas `____`/"TESTEMUNHAS:"), rodapé hash SHA-256 + MP 2.200-2/Lei 14.063 + paginação; backend `getDocumentoPublico` passou a selecionar `cargo`/`cpfCnpj`. Detalhe: `shared/changelog.ts`.

- **Rev. 3053** — INTEGRASIGN (FCSIGN) · "ADICIONAR SÓCIO ADMINISTRADOR" EM CONTRATOS JÁ ENVIADOS QUE FICARAM SÓ COM FORNECEDOR + GESTOR (SEM O LINK DO SÓCIO PARA ASSINAR). CAUSA-RAIZ (dados): injeção automática do sócio como 3º signatário só vale da Rev. 3050+ e SÓ na CRIAÇÃO; envelopes antigos ficaram congelados com 2. SOLUÇÃO (ZERO ALTER/DROP/DELETE — só INSERT signatário + UPDATE contador): NOVO `integrasign.adicionarSocioAdministrador({companyId, envelopeId})` (guarda anti-IDOR `assertIntegraSignCompanyAccess`, IDEMPOTENTE, INSERE "diretor" com `ordemAssinatura=max+1`, token na hora, bumpa contador, auditoria); FRONT `IntegraSignDashboard.tsx` botão verde "Adicionar sócio administrador" (Crown) no detalhe. Detalhe: `shared/changelog.ts`.

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
