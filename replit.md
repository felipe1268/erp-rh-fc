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

> **Convenção (importante)**: este arquivo guarda APENAS as últimas **5 revisões**, em formato curto (1–3 linhas: o quê + por quê).
> Quando entrar uma nova revisão, **remova a mais antiga daqui** — o histórico completo (com causa-raiz, stack traces, nomes de arquivos, etc.) vive em `shared/changelog.ts`.
> Não duplique conteúdo entre os dois arquivos.

- **Rev. 1902**: **Planejamento · Cronograma · BUG FIX cascata de responsável em GRUPO com filhos denormalizados (EAP idêntico)**. User (16/05/2026, screenshot): pai "03.05 Mosaico" marcado como grupo + Input "JULIO FERRAZ" + 4 "Ajudante de pedreiro" abaixo também com EAP "03.05": "estou clicando na atividade MARCADA COM GRUPO, E AS ATIVIDADES ABAIXO DELA NÃO ESTÃO SENDO PREENCHIDAS COM O MESMO RESPONSAVEL QUE INDIQUEI NO GRUPO. VEJA QUE QANDO EU SALDO NÃO ACONTECE NADA.. ARRUME ISSO..". **Causa-raiz** (em `PlanejamentoDetalhe.tsx` L4296-4322 — onBlur do Input ciano `responsavelLotus`): detecção de descendentes estrita demais pra MSP "denormalizado" — L4306 guard de nivel quebra na 1ª linha (filhos herdam `nivel` do pai); L4308 `if (ceap === parentEap) continue` pula CADA filho com EAP idêntico ao do grupo. Resultado: `descIdxs.length === 0` → return → cascata nunca dispara. **Mudança** (L4324-4344): NOVO fallback ANTES do return — se `a.isGrupo && descIdxs.length === 0`, scan relaxado de `idx+1` empilhando TODAS as linhas até próximo `isGrupo` (fim do escopo) OU fim da lista (pula `disabled`). Semântica: "todas linhas abaixo do grupo, até o próximo grupo, são filhos lógicos". Depois cai no fluxo Rev. 1892 (auto-aplica via setLinhas + toast, sem modal). version → 1902. **Preservado**: detecção estrita Rev. 1865 (dotted+flat) intacta pro caso comum; fallback é específico de GRUPO — folhas com sub-itens seguem com modal Rev. 1860/1865 (3 opções) pra proteger contra mudança acidental; Input ciano Rev. 1823, Input âmbar Rev. 1641, badge Rev. 1898/1900 intactos. Zero backend/DB/schema/tRPC. Reversível em 1 hunk + version bump. R-001/R-007/R-010 OK.
- **Rev. 1901**: **Planejamento · Atividades em Atraso · Impressão DENSIFICADA (eliminar espaços em branco)**. User (16/05/2026, screenshot): "esta bagunçado muito espaço branco.. ajuste a tela para que tenha o minimo de espaços brancos.. quero a organização extremamemnte profissional". **Causa**: o CSS Rev. 1899 era conservador (1-col em retrato + padding 8-12px + DESVIO box 150-180px + barras 16px + space-y 12px); resultado: 4 pgs/10 cards = 2.5 cards/pg. **Mudança** (em `PlanejamentoDetalhe.tsx` L1949 + L2129-2238): (1) default `atrasosOrient`=`"landscape"` (era portrait); (2) `dispararImpressao` reescrita: grid 2-cols SEMPRE (retrato+paisagem), margens A4 8-10mm, font-base 9-9.5px, line-height 1.25, gap entre cards 4px, padding header 3x6px, padding body 4x6px, space entre barras 3px, altura barras 9px (era 16), DESVIO box min-w 56px (era 100) padding 3x6 número 14px (era 24), datas gap 10px, cascata de tamanhos (text-sm 9.5/text-xs 8.5/text-[11px] 8/text-[10px] 7.5/text-[9px] 7), badges header compactos. Resultado esperado: 4-6 cards/pg em paisagem, ~4 em retrato (era 2.5). version → 1901. **Preservado**: PrintHeader (REGRA DE OURO), conteúdo do relatório (datas/barras/% /desvio), tela não-impressão idêntica (tudo `@media print`), isolamento `visibility:hidden` Rev. 1899, refactor pós-architect (dispararImpressao local + dedupe + word-break). Zero backend/DB/schema. Reversível em 2 hunks + version bump. R-001/R-007/R-010 OK.
- **Rev. 1900**: **Planejamento · Cronograma · Badge do RESPONSÁVEL replicado na VISUALIZAÇÃO (modo leitura)**. User (16/05/2026, screenshot): "ainda não apareceu aqui no cronograma que a atividade é de responsabilidade de outra empresa. como indicado.. coloca um card aqui..". **Causa**: Rev. 1898 colocou o badge APENAS no modo EDIÇÃO; o ramo `!editando` (tabela read-only — o que o usuário vê 99% do tempo) ficou sem o badge, mostrando só os chips legados Marco/Indireta/EXTERNA. **Mudança** (em `PlanejamentoDetalhe.tsx` L4401-4459, dentro do `<td>` do Nome ramo !editando, após o chip "EXTERNA"): NOVO IIFE com mesma lógica de Rev. 1898 (manual=ciano, contrato_terceiro=azul). FC permanece IMPLÍCITO (sem badge). Early return `null` quando `isExterna && externaLocal` (não duplica com chip EXTERNA âmbar). Estilo INLINE (não "abaixo do nome") porque é layout tabular com altura fixa de linha — quebrar linha desalinharia a tabela. Tag compacta `text-[9px] uppercase max-w-[180px] truncate` com tooltip Radix. testid `badge-responsavel-leitura-${a.id}`. **Pós-architect FAIL→PASS**: short-circuit `!a.isExterna` antes do IIFE + filtro `r.tipo !== "externa"` no ramo resolvido pelo backend — externas nunca ganham segundo badge. version → 1900. **Preservado**: Rev. 1898 (edição) intacta — paridade total entre modos. Chips Marco/Indireta/EXTERNA preservados. Estrutura de dados (`a.responsavel`, `responsavelLotus`, `externaResponsavel`) sem mudanças — só consumo. Zero backend/DB/schema/tRPC. Reversível em 1 hunk + version bump. R-001/R-007/R-010 OK.
- **Rev. 1899**: **Planejamento · Atividades em Atraso · Impressão REDESENHADA com toggle Retrato/Paisagem + anti-sobreposição**. User (16/05/2026, screenshot do preview Chrome): "tudo bagunçado na tela de impressão... que o usuário possa escolher os formatos, retro ou paisagem". **Causa**: tela "Atividades em Atraso" (modal full-screen) tinha 2 botões custom com CSS de impressão primitivo, hardcoded em A4 retrato, sem orientação configurável, sem `break-inside:avoid` reforçado nos cards. **Mudança** (em `PlanejamentoDetalhe.tsx`): (1) L1945 novo state `atrasosOrient`; (2) L41 import `RectangleVertical/RectangleHorizontal`; (3) L2076-2202 barra de ações refeita com toggle visual Retrato/Paisagem + botão Imprimir que injeta CSS dedicado: `@page { size: A4 <orient> }`, margens otimizadas, grid 2-cols em landscape vs 1-col em portrait, font-size adaptativo, `break-inside:avoid` reforçado, matar margens trailing; (4) Gerar PDF reusa via dispatch + toast com orientação; (5) isolamento via `visibility:hidden` global + `visibility:visible` no `#atrasos-print-area`; (6) cleanup `afterprint` + safety 60s. version → 1899. **Preservado**: PrintHeader (REGRA DE OURO), conteúdo do relatório (cards/barras/desvio), tela não-impressão. Zero backend/DB/schema. Reversível em 3 hunks + version bump. R-001/R-007/R-010 OK.
- **Rev. 1898**: **Planejamento · Cronograma · Badge do RESPONSÁVEL movido para ABAIXO do nome + visível APENAS quando indicado**. User (16/05/2026, 2 screenshots): "coloque a tag abaixo da atividade informando o responsavel pela atividade, quando for inficado [indicado] na atividade". **Contexto**: Rev. 1896 colocou inline + sempre visível (incluindo "FC" cinza no default). User quer (1) tag em linha própria abaixo do nome e (2) só renderizar quando há indicação explícita (manual/contrato_terceiro/externa). Padrão FC fica implícito (construtora). **Mudança** (em `PlanejamentoDetalhe.tsx` L4031-4097): removido renderizador inline; novo `<div className="mt-1">` após o `</div>` do flex container do nome, antes dos inputs âmbar/ciano; early return `null` para tipo='fc' OU sem indicação local; inclui externas (badge âmbar com `externaResponsavel` digitado, complementa o Input — Input edita, tag identifica tipo); truncamento aumentado p/ 22 chars e `max-w-[200px]`. version → 1898. **Preservado**: Inputs (âmbar Rev. 1641 + ciano Rev. 1823), checkboxes (externa/disabled/manual), cascata grupo Rev. 1892, modal cascadeResp Rev. 1860/1865 — tudo intacto. Zero backend/DB/schema. Architect PASS (ressalva apenas educacional sobre comunicar "sem tag = FC" aos usuários). Reversível em 1 hunk + version bump. R-001/R-007/R-010 OK.
