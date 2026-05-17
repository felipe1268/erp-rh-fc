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
- `server/`: Express backend + tRPC routers
  - `server/_core/`: Auth, OAuth, Vite setup, env config
  - `server/routers/`: tRPC routers per módulo
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (`shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> **Convenção OBRIGATÓRIA (não negociável)** — este arquivo guarda APENAS as últimas **5 revisões** em formato detalhado (o quê + por quê + arquivos tocados). As 10 revisões seguintes aparecem como one-liner com título curto. Demais revisões vão para `replit-history.md`.
>
> **Ao criar uma nova revisão**:
> 1. Adicionar o bloco detalhado da NOVA revisão no TOPO.
> 2. Pegar o bloco mais ANTIGO dos 5 detalhados e converter pra one-liner curto na seção "Revisões recentes".
> 3. Se a seção "Revisões recentes" passar de 10 itens, mover o mais antigo pra `replit-history.md`.
> 4. NUNCA deletar parcialmente um bloco. Linhas órfãs sem prefixo `- ` são bug.
> 5. NUNCA usar marcadores HTML do tipo `<!-- DETALHES -->` (banidos na Rev. 1958).
>
> O histórico completo (causa-raiz, stack traces, arquivos tocados, comentários longos) vive em `shared/changelog.ts`. Esta convenção é validada visualmente: cada linha do bloco deve começar com `- ` (hífen+espaço).

### Top 5 detalhadas

- **Rev. 2042**: **SST · Integração de Segurança · "Iniciar agora" · CAUSA-RAIZ encontrada: SELECT usava coluna inexistente `employees.nome` (correto é `employees.nomeCompleto`).** Pedido direto do usuário (img IMG_0889 — graças à tela de erro inline da Rev. 2041 ficou visível): "Não foi possível iniciar a integração — Cannot convert undefined or null to object". **Causa-raiz** (1 letra de diferença que custou 3 revisões): o handler `criarRegistro` em `server/routers/integracaoSST.ts` tinha `nome: employees.nome` no SELECT, mas a coluna real do schema é `nomeCompleto`. Como `employees.nome` retorna `undefined` no objeto drizzle, ao construir `{id, nome: undefined, cpf, funcao}` o `db.select({...})` lançava "Cannot convert undefined or null to object" internamente. A `listarPendentesAuto` (Rev. 2034) já usava `employees.nomeCompleto` certo — só o `criarRegistro` ficou com o nome errado desde a versão original. **Mudança** em 1 arquivo (`server/routers/integracaoSST.ts`, ~32L em 3 hunks): SELECT em `criarRegistro` (L505) `employees.nome` → `employees.nomeCompleto` (FIX da causa-raiz); MESMO FIX em `criarRegistrosEmLote` (L563) e `listarRegistrosParaLote` (L790) — 2 bugs latentes flagrados pelo code-review/architect (iam explodir o lote inteiro/o registro avulso com o mesmo erro); wrap em try/catch com `console.error("[criarRegistro] FAIL", {input, userId, err, stack})` pra debug futuro; TRPCErrors re-throwed (preserva código), outros viram INTERNAL_SERVER_ERROR com mensagem real (intencional pra debug temporário — ver follow-up #4); coerção explícita de tipos no `values` do insert (Number/String/?? null) como defesa em profundidade. + `shared/version.ts` → 2042. **R-001/R-007/R-010 OK**: ZERO ALTER TABLE / DROP / DELETE. 1 arquivo server-side. Sem novas deps. **Preservado**: Rev. 2041 (tela de erro inline) INTACTA — graças a ela achamos a causa; Rev. 2040/2039/2038 INTACTAS; esquema do banco INTACTO. **Follow-up**: (1) ✅ auditoria global feita — só restavam 2 ocorrências no próprio `integracaoSST.ts`, ambas corrigidas nesta rev; (2) renomear `nomeCompleto` → `nome` no schema com migration OU adicionar alias `nome` no drizzle pra fechar a porta de vez; (3) tipagem TS estrita no campo (drizzle aceita qualquer chave indexada, undefined passa silenciosamente); (4) **segurança**: trocar `INTERNAL_SERVER_ERROR` com `err.message` cru por mensagem genérica + ID de correlação (architect flagou OWASP A03 — pg pode vazar nomes de coluna/FK pro cliente).
- **Rev. 2041**: **SST · Integração de Segurança · "Iniciar agora" · BUGFIX "abre e fecha sozinho": janela de splash agora mostra mensagem de erro DENTRO dela em vez de fechar.** Pedido direto do usuário (img IMG_0888): após Rev. 2040, ao clicar "Iniciar agora" a janela abria com splash "Preparando a integracao de ANA…" e fechava sozinha em ~1-2s sem o usuário ver o motivo. **Causa-raiz**: o `onError` do `criarRegistro.useMutation` chamava `w.close()` na janela pendente, deixando o usuário sem feedback visível (toast de erro fica na aba ORIGINAL, mas o usuário tá olhando pra aba NOVA que fechou — parece bug aleatório). **Mudança** em 1 arquivo (`client/src/pages/sst/IntegracaoSST.tsx`, ~25L em 1 hunk): `onError` reescrito — em vez de `w.close()`, faz `w.document.open()` + `write` com tela de ERRO inline (caixa branca, ícone ⚠️, mensagem REAL do servidor, botão "Fechar" `window.close()`); `msg` extraído de `err.message || err.data.message || fallback`; `console.error("[criarRegistro] erro:", err)` adicionado; sanitização `[<>&]` na mensagem; try/catch no document.write (loga warning se janela morreu); toast.error continua disparando na aba original (defesa em profundidade). + `shared/version.ts` → 2041. **R-001/R-007/R-010 OK**: ZERO SQL/schema/router. 1 arquivo client-side. Sem novas deps. **Preservado**: Rev. 2040 (hardening try/catch no iniciarAgora) INTACTA; Rev. 2039 (open-blank-then-redirect) INTACTA; Rev. 2038 (boas-vindas + atalho) INTACTA; `onSuccess` INTACTO (segue navegando `w.location.href`); modal "Iniciar Integração" do header INTACTO. **Follow-up**: (1) capturar o `err.message` real (provavelmente "Colaborador não encontrado nesta empresa" — ANA pode estar em outra company que não a selecionada); (2) pré-validar companyId/employeeId no client antes de mutar; (3) botão "Reportar problema" na tela de erro que envia o stack pro RH.
- **Rev. 2040**: **SST · Integração de Segurança · "Iniciar agora" · BUGFIX hardening: erro genérico "Cannot convert undefined or null to object" silencioso.** Pedido do usuário (img IMG_0887): toast "Cannot convert undefined or null to object" ao clicar "Iniciar agora". Mensagem genérica do JS engine sem stack — provavelmente em algum item de `pendentesAuto` com campo nulo ou no `emp.nome.split(" ")[0]` quando nome é null. **Mudança** em 1 arquivo (`client/src/pages/sst/IntegracaoSST.tsx`, ~25L em 1 hunk): tipo de `iniciarAgora` afrouxado (aceita `nome: string|null` e o próprio `emp` `null|undefined`); try/catch GERAL com `console.error` + stack + `toast.error` com mensagem real (em vez do toast genérico) + fecha janela pendente; early-return `toast.error("Colaborador inválido")` se `!emp || !emp.id`; `nome` normalizado via `String(emp.nome || "Colaborador").trim()`; `primeiroNome` com fallback + sanitização `[<>&"]` removida pra não quebrar `document.write`; `window.open` em try/catch separado; `document.write` em try/catch separado; aspas tipográficas (… → ..., "integração" → "integracao") removidas do splash pra evitar problemas de charset em about:blank antes do `<meta charset>` ser parseado. + `shared/version.ts` → 2040. **R-001/R-007/R-010 OK**: ZERO SQL/schema/router. 1 arquivo client-side. Sem novas deps. **Preservado**: Rev. 2039 (open-blank-then-redirect) INTACTA — só blindada; Rev. 2038 (boas-vindas + atalho) INTACTA; Rev. 2037 INTACTA; Modal "Iniciar Integração" do header INTACTO; `criarRegistro` server-side INTACTO. **Follow-up**: (1) investigar item específico de `pendentesAuto` que causou o erro (provavelmente CPF de teste "TESTE" ou colaborador com `nome IS NULL` no SELECT); (2) Sentry/log centralizado pra capturar console.error desses guards; (3) validar Zod no client antes do mutate pra mensagem de erro amigável.
- **Rev. 2039**: **SST · Integração de Segurança · "Iniciar agora" · BUGFIX pop-up blocker Safari/iPad: "Clico em iniciar e não acontece nada".** Pedido direto do usuário (img IMG_0886): após Rev. 2038 o botão parecia inerte no Safari do iPad. **Causa-raiz**: `window.open(link,"_blank")` rodava dentro do `onSuccess` (callback ASSÍNCRONO da mutation tRPC), fora da pilha de gesto do usuário — Safari/iPad bloqueia silenciosamente todo `window.open` que não esteja na pilha direta de clique. Code review da 2038 já previu (follow-up #2). **Solução** (padrão "open-blank-then-redirect"): (1) no CLICK síncrono, `iniciarAgora(emp)` abre `window.open("about:blank","_blank")` IMEDIATO e guarda em `pendingWindowRef` — dentro da pilha de gesto, navegador autoriza; (2) janela mostra splash inline com spinner CSS + "Preparando a integração de NOME…" via `document.write` (CSS embutido, gradient emerald); (3) dispara `criarRegistro.mutate`; (4) no `onSuccess`, faz `w.location.href = link` — janela pré-aberta navega; se `w.closed` cai no fallback do modal com link copiável + `toast.warning("Pop-up bloqueado")`; (5) `onError` adicionado fecha janela pendente (não deixa órfã). **Mudança** em 2 arquivos (~30L em 2 hunks): (A) `client/src/pages/sst/IntegracaoSST.tsx` — `autoOpenRef` (boolean) substituído por `pendingWindowRef` (`useRef<Window|null>`); mutation ganha tratamento de janela pré-aberta + onError; `iniciarAgora` reescrita com `window.open` síncrono + splash inline (spinner verde, primeiro nome do colaborador). (B) `shared/version.ts` → 2039. **R-001/R-007/R-010 OK**: ZERO SQL/schema/router. Apenas client-side. Sem novas deps. **Preservado**: Rev. 2038 (boas-vindas + atalho) INTACTA — só o mecanismo de abrir janela mudou; Rev. 2037 INTACTA; modal "Iniciar Integração" do header continua gerando link e mostrando UI de cópia/WhatsApp; `iniciarParaEmployee` preservada; `criarRegistro` server INTACTO; botão "Iniciar agora" de terceiros (redireciona pra `/terceiros/funcionarios`) INTACTO. **Follow-up**: (1) mover splash inline pra `/public/integracao-loading.html` em vez de `document.write` (alguns navegadores corporativos são restritivos); (2) detectar pop-up bloqueado (`w===null` imediatamente) e oferecer fallback de navegar na mesma aba; (3) persistir preferência do usuário (se bloqueou uma vez, próximo abre na mesma aba com confirmação).
- **Rev. 2038**: **SST · Integração de Segurança · aba Pendentes · botão "Iniciar agora" agora INICIA a integração de fato (cria registro + abre tela pública em nova aba) + NOVA tela de Boas-vindas antes dos vídeos.** Pedido direto do usuário (imgs IMG_0883/0884): "Quando clicar em iniciar agora deve começar a integração, com o texto de boas vindas, e depois, abrir o vídeo, [parar] assistir, depois disso o questionário". Antes (Rev. 2034), o botão só pré-selecionava o colaborador no modal — o RH ainda tinha que escolher obra/config, clicar "Criar Integração", copiar o link e abrir manualmente. Fluxo de 4 cliques pra 1. **Mudança** em 3 arquivos (ZERO server, ZERO schema): (A) `client/src/pages/sst/IntegracaoSST.tsx` (~12L) — import `useRef`; novo `autoOpenRef` (useRef<bool>) sinaliza pro `onSuccess` do `criarRegistro` que veio do "Iniciar agora" → em vez de mostrar o modal com link criado, abre `window.open(link, "_blank", "noopener,noreferrer")` direto e toasta "Integração de NOME iniciada em nova aba"; nova função `iniciarAgora(emp)` chama `criarRegistro.mutate({ companyId, employeeId })` sem config/obra (usa "Automática"); botão "Iniciar agora" trocado de `iniciarParaEmployee` pra `iniciarAgora` + `disabled={criarRegistro.isPending}` + spinner Loader2 pra evitar duplo clique; `iniciarParaEmployee` PRESERVADA (retomada manual futura via modal). (B) `client/src/pages/sst/IntegracaoPublica.tsx` (~75L) — tipo `step` ganha `"boasvindas"` (cpf → boasvindas → modulos → quiz → resultado, 5 passos); imports `Sparkles, BookOpen, Clock`; `handleBuscarCpf` vai pra `setStep("boasvindas")` em vez de "modulos"; stepper visual virou 5 itens; NOVO bloco `step === "boasvindas"` — Card max-w-2xl com header gradient emerald→teal, ícone Sparkles em círculo glass, saudação "Bem-vindo(a), {NOME}!", texto introdutório, box "Como funciona" com 3 passos numerados (Assista vídeos / Responda questionário / Tire certificado válido por {validadeMeses}m), grid 2-col com contagem de vídeos (azul) + perguntas (roxo), callout âmbar com Clock "Reserve um tempo tranquilo — você precisa de {notaMinima}% de acertos pra aprovado", CTA pleno emerald h-12 "Começar Treinamento →" → setStep("modulos"). (C) `shared/version.ts` → 2038. **R-001/R-007/R-010 OK**: ZERO ALTER TABLE, ZERO mudança de schema, ZERO mudança de router (server intacto — só usa `criarRegistro` que já existia). Reversível em 3 arquivos. **Preservado**: Rev. 2037 (Memorial DSR) INTACTA; Rev. 2036/2035/2034/2033/2026 INTACTAS; Modal "Iniciar Integração" header continua funcional pra lote/obra-config específica; `iniciarParaEmployee` preservada (não chamada mas mantida); fluxo CPF (autoload, validação, ja_aprovado, sem_config) INTACTO; steps modulos/quiz/resultado INTACTOS. **Follow-up**: (1) auto-preencher CPF na URL `?cpf=` pra pular etapa de CPF quando RH inicia em nome do colaborador; (2) modal de confirmação antes do `window.open` (pop-up blockers); (3) botão "Reenviar link por e-mail" na lista pendentes; (4) botão WhatsApp no item de pendente (hoje só no modal de link criado); (5) auto-fechamento da janela após "Aprovado".
### Revisões recentes (one-liners)

- **Rev. 2037**: **DP · Biblioteca de Conhecimento · NOVO artigo "Memorial de Cálculo — DSR".** Resumido aqui — detalhe em `shared/changelog.ts`.
- ~~Rev. 2036~~ — SST Integração aba Pendentes (Rev. 2034) agora filtra "funcionários fantasma" — exclui soft-delete, lista negra e demitidos com status inconsistente. Ver `shared/changelog.ts`.
- ~~Rev. 2035~~ — SST Integração: pontuação vai pro Raio-X do Funcionário + certificado de aprovação em PDF (público e re-emissão no Raio-X). Ver `shared/changelog.ts`.
- ~~Rev. 2034~~ — SST Integração aba Pendentes: novo bloco "Sem integração válida" listando TODOS CLT/PJ/Terceiros que precisam fazer/renovar (24 meses). Ver `shared/changelog.ts`.
- ~~Rev. 2033~~ — SST Integração Modal "Iniciar Integração": BUGFIX nomes de obra cortados no dropdown em iPad (max-w 480px + whitespace-normal). Ver `shared/changelog.ts`.
> Revisões anteriores à 2031: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).

## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (ver convenção acima — Top-5 detalhado + 10 recentes em one-liner).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
