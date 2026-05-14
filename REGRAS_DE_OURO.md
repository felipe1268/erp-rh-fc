# 🏆 REGRAS DE OURO — ERP RH/DP FC Engenharia

> **Este arquivo é OBRIGATÓRIO de consulta antes de criar ou editar qualquer tela, modal, dashboard ou componente visual.**
> Ele é referenciado no `replit.md` e deve ser revisado a cada nova feature.
> Quando descobrir um padrão recorrente que vale como regra, **adicione aqui**.

---

## R-001 · Modais e telas full-screen (NÃO NEGOCIÁVEL)

**Toda tela nova OU antiga que abrir um modal de detalhe / análise / drilldown deve ocupar a tela inteira.**

- ✅ Mobile (`<sm`): `w-[100vw] h-[100dvh] rounded-none border-0` — **full bleed**, sem cantos arredondados, sem borda
- ✅ Desktop (`≥sm`): `w-[98vw] h-[96dvh] max-w-none rounded-lg border` — quase tela cheia, com cantos suaves
- ✅ **SEMPRE** passar `resizable={false}` no `<DialogContent>` da shadcn — caso contrário, ele injeta `style={{ width: 'min(512px, ...)' }}` inline e mata as classes Tailwind
- ✅ **SEMPRE** passar `showCloseButton={false}` quando o header já tem um botão X próprio (evita dois X visíveis)
- ✅ Usar `100dvh` (dynamic viewport) e NÃO `100vh` — respeita a barra de URL/notch dinâmica do iOS Safari/iPad
- ✅ Layout interno em **flex-col** com header `shrink-0`, body `flex-1 overflow-auto` e footer `shrink-0`

**Template de referência**:
```tsx
<DialogContent
  resizable={false}
  showCloseButton={false}
  className="w-[100vw] sm:w-[98vw] max-w-none h-[100dvh] sm:h-[96dvh] max-h-[100dvh] sm:max-h-[96dvh] p-0 gap-0 overflow-hidden flex flex-col rounded-none sm:rounded-lg border-0 sm:border"
>
  <div className="bg-gradient-to-r ... text-white p-4 sm:p-6 ... shrink-0">{/* header */}</div>
  <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5 bg-slate-50/40">{/* body scrollável */}</div>
  <div className="border-t bg-white px-4 sm:px-6 py-3 ... shrink-0">{/* footer */}</div>
</DialogContent>
```

**Componentes de referência (já corretos)**:
- `client/src/components/TabelaComparativaAnual.tsx` (Rev 1779b)
- `client/src/pages/dashboards/DashCartaoPonto.tsx` `IndicadorDetalheModal` (Rev 1780b)

---

## R-002 · Visual rico, nunca chapado

- ✅ **Header com gradient** colorido por contexto (azul=info, verde=ok, laranja=alerta, vermelho=crítico, roxo=especial)
- ✅ **Ícones grandes** (lucide-react) — `h-6 w-6` mínimo no header, `h-4 w-4` em badges/labels
- ✅ **Badges/chips** para status, contagens e filtros (não usar texto solto)
- ✅ **KPI cards** com borda + sombra leve + número grande tabular-nums
- ✅ **Linhas/cards clicáveis** com hover state visível e `focus-visible:ring` para navegação por teclado
- ❌ Evitar telas com fundo cinza chapado, texto solto, sem hierarquia visual

---

## R-003 · Tailwind JIT-safe (cores dinâmicas)

- ❌ NUNCA usar template literals para classes: `bg-${cor}-500` — Tailwind JIT não reconhece e a classe não vai pro CSS final
- ✅ SEMPRE usar lookup estático em `Record<string, ...>`:
  ```ts
  const COR_CLASSES: Record<string, { bg: string; text: string; gradient: string }> = {
    blue: { bg: "bg-blue-50", text: "text-blue-700", gradient: "from-blue-500 to-blue-600" },
    red: { bg: "bg-red-50", text: "text-red-700", gradient: "from-red-500 to-red-600" },
    // ...
  };
  ```

---

## R-004 · Responsividade obrigatória

- ✅ Toda tabela `<md` deve virar **cards stacked**
- ✅ Toda toolbar deve quebrar em colunas no mobile (`flex-col sm:flex-row`)
- ✅ Modais full-screen em mobile (R-001)
- ✅ Texto e padding escalando: `text-sm sm:text-base`, `p-3 sm:p-5`
- ✅ Testar no iPad (768-1024px) — é o device principal do usuário

---

## R-005 · Acessibilidade básica

- ✅ Linhas/cards clicáveis: `tabIndex={0}`, `role="button"`, handler para Enter/Space
- ✅ `aria-label` em botões só com ícone
- ✅ `focus-visible:ring-2` em todos os elementos interativos
- ✅ `title=` em truncamentos para revelar texto completo no hover

---

## R-006 · pt-BR em toda comunicação

- ✅ Todas as labels, mensagens, toasts, modais, comentários de código em português brasileiro
- ✅ Datas formato `dd/MM/yyyy`, mês curto `Jan/26`, valores `Number.toLocaleString("pt-BR")`
- ✅ Moeda `R$ X.XXX,XX` (vírgula decimal)

---

## R-007 · Imports lucide-react sem duplicação

- ❌ NÃO ter dois `import { ... } from "lucide-react"` no mesmo arquivo — Babel reclama de duplicate declaration mesmo se nomes diferentes
- ✅ Consolidar TODOS os ícones em UM ÚNICO import por arquivo
- ✅ Verificar antes de adicionar novos ícones se já não estão importados em outro bloco

---

## R-008 · Gestão de revisões

- ✅ Bumpar `shared/version.ts` (`APP_VERSION`, `APP_VERSION_NUMBER`)
- ✅ Adicionar entry **completa** (com causa-raiz, arquivos, linhas, decisões) no fim do array em `shared/changelog.ts`
- ✅ Atualizar `replit.md` com versão **curta** (1-3 linhas) e remover a 6ª mais antiga
- ✅ Nunca duplicar conteúdo entre `replit.md` e `shared/changelog.ts`

---

## R-009 · Nunca expor secrets

- ❌ Nunca logar, ecoar ou exibir valores de variáveis de ambiente sensíveis
- ❌ Nunca fazer `console.log(process.env.X)` para tokens, senhas, keys
- ✅ Usar a skill `environment-secrets` para gerenciar; nunca tentar ler/escrever secrets manualmente

---

## R-010 · Defensive coding em SQL/Drizzle

- ✅ Sempre usar aspas duplas em colunas camelCase no `WHERE` SQL bruto: `WHERE "dataAdmissao" >= ...`
- ✅ Sempre filtrar `deleted_at IS NULL` em soft-deletes
- ✅ Sempre filtrar `companyId` (multi-tenant) — usar helper `companyWhere`
- ✅ Joins com `LEFT JOIN` quando o lado direito pode não existir (evita perda silenciosa de linhas)

---

## R-012 · Tela de impressão SEM páginas em branco / vazias (NÃO NEGOCIÁVEL)

**Toda tela do sistema precisa imprimir limpa, sem nenhuma página em branco no fim, sem páginas vazias no meio, sem corte de conteúdo.**

### Causa raiz dos problemas mais comuns

- ❌ **Containers com `min-h-screen` / `h-[100dvh]` / `h-[calc(100vh-...)]`** — o navegador interpreta como página inteira mesmo se o conteúdo dentro for pequeno → gera 1 página em branco no fim.
- ❌ **Overlays Radix (Dialog backdrop, Sheet overlay)** — viram fundo cinza ocupando página inteira no PDF.
- ❌ **`overflow: hidden` em `html` / `body` / containers SPA** — corta o conteúdo no PDF (a impressão respeita overflow).
- ❌ **`overflow-y-auto` em scrollers** — só imprime o que está visível, o resto some.
- ❌ **Cards/sections com `min-h-[...]` grande** quando vazios — geram páginas em branco.
- ❌ **Modais full-screen abertos** (R-001) — quando o usuário imprime com modal aberto, vira altura enorme + backdrop preto.

### O que JÁ está resolvido globalmente em `client/src/index.css` (`@media print`)

1. **Reset de altura**: `html, body, #root` ganham `height: auto !important; min-height: 0 !important; overflow: visible !important;`.
2. **Reset Tailwind viewport**: classes `.min-h-screen`, `.h-screen`, `.h-dvh`, `.h-[100vh]`, `.h-[100dvh]`, `.h-[calc(100vh-…)]`, `.h-[calc(100dvh-…)]` viram `height: auto`.
3. **Liberação de scrollers**: todos os `.overflow-*` viram `overflow: visible !important; max-height: none !important;`.
4. **Esconde overlays Radix**: `[data-radix-portal]`, `[data-radix-dialog-overlay]`, `[data-radix-popper-content-wrapper]` somem (a menos que marcados com `.print-keep`).
5. **Modo `.print-only`**: marcar uma área com a classe `print-only` faz o CSS esconder TODO o resto da árvore (recursivo, não só filhos diretos do body) via `body:has(.print-only) *:not(.print-only):not(.print-only *):not(:has(.print-only)) { display:none }` — preserva ancestrais, descendentes e o próprio `.print-only`. Portais Radix que contenham `.print-only` também são preservados (mesma exceção via `:not(:has(.print-only))`).
6. **Esconde último filho com padding/margin** que gera página em branco trailing.

### Checklist da tela ANTES de aprovar PR

- [ ] Abrir a tela em produção e dar Ctrl+P (Cmd+P no Mac).
- [ ] Confirmar que a **última página tem conteúdo** (sem branco no fim).
- [ ] Confirmar que **não há páginas vazias no meio** (verificar `page-break-before/after` em modais e seções).
- [ ] Confirmar que **tabelas grandes** repetem cabeçalho em cada página (já vem do `thead { display: table-header-group }` global).
- [ ] Confirmar que **sidebar/header/botões** estão escondidos (vem do CSS global, mas use `print-hidden` ou `print:hidden` em qualquer botão flutuante novo).
- [ ] Para **imprimir só uma região** (ex: o conteúdo de um modal aberto, sem o resto da tela atrás), envolver essa região com `<div className="print-only">…</div>` e o resto some automaticamente.

### Quando criar uma área específica de impressão

```tsx
// Toda a árvore do app some na impressão exceto este bloco:
<div className="print-only">
  <PrintHeader title="Relatório XYZ" userName={...} />
  {/* conteúdo do PDF/print */}
</div>
```

### NUNCA faça

- ❌ Adicionar `@media print` específico que sobrescreve as regras globais (consulte primeiro o que já existe em `index.css` L256-).
- ❌ Usar `position: fixed` em rodapé sem `.print-keep` (some na impressão).
- ❌ Usar `display: flex` com `height: 100vh` em wrapper de página — quebra impressão e gera página em branco.

---

## R-011 · Indiretas/LoE NÃO compõem o caminho crítico (PMBOK §6.4.2 / DCMA #6)

**Atividades sinalizadas como `isIndireta=true` (Level of Effort) ou `isExterna=true` (executadas por terceiros) NUNCA podem aparecer como CRÍTICA / QUASE CRÍTICA em telas de planejamento.**

- ❌ Errado: `criticasIds = atividades.filter(a => float === 0).map(a => a.id)` — pinta Administração de Obra de vermelho a obra inteira, gerando ansiedade falsa
- ✅ Certo: `criticasIds = atividades.filter(a => float === 0 && !a.isIndireta && !a.isExterna).map(a => a.id)`
- ✅ Indiretas recebem badge próprio cinza/slate **`INDIRETA (LoE)`** com tooltip citando PMBOK §6.4.2 / DCMA #6
- ✅ Heurística no import de cronograma: atividades com duração ≥90% do projeto são pré-marcadas como indiretas (usuário confirma no checkbox)

**Justificativa técnica**: PMBOK §6.4.2 classifica atividades de apoio (admin, vigilância, mob/desmob) como **Level of Effort** — esforço que cresce linearmente com o projeto, não consome float e portanto não pertence ao Critical Path Method. DCMA Assessment #6 ("Critical Path Test") explicitamente desconta LoE da contagem de atividades críticas em qualquer auditoria de cronograma.

**Locais que aplicam o filtro** (verificar em qualquer nova tela CPM):
- `client/src/pages/planejamento/ProgramacaoSemanal.tsx` (`pesoSemana.criticasIds`)
- `client/src/components/planejamento/ProgramacaoSemanalLotus.tsx` (`analiseSemana.criticasIds`)
- `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (KPI atrasadas + aba Caminho Crítico)
- `client/src/pages/planejamento/ImportarCronograma.tsx` (sugestão automática + checkbox)

---

## R-013 · EAP do Orçamento é IMUTÁVEL — fonte da verdade do rastreio

**O `eapCodigo` (item) do Orçamento é a CHAVE PRIMÁRIA de rastreio entre orçamento, cronograma, medições, SCs, contratos e financeiro. NUNCA pode ser renumerado, gerado automaticamente ou sobrescrito sem ação explícita do usuário.**

**Regras inegociáveis**:

- ✅ Parser do orçamento (`server/routers/orcamento.ts:657`) lê `eapCodigo` EXATAMENTE da coluna "Item" da planilha — preservar.
- ✅ Reimportação (`orcamento.ts:2342`) deleta+reinsere mas mantém o `eapCodigo` que vem do parser — preservar.
- ✅ Importação MS Project XML lê `<WBS>` do MSP — preservar.
- ❌ **PROIBIDO**: gerar EAP sequencial (`String(i + 1)`, `1, 2, 3...`) como fallback quando a coluna WBS está ausente — falhar a importação com mensagem clara.
- ❌ **PROIBIDO**: sobrescrever silenciosamente o `eapCodigo` da atividade pelo `eapCodigo` do orçamento sem mostrar a divergência ao usuário.
- ✅ **OBRIGATÓRIO**: tela de Diagnóstico EAP Orçamento ↔ Cronograma (`DiagnosticoEapOrcCron.tsx`) acessível na PlanejamentoDetalhe com 3 listas: casados, só no orçamento, só no cronograma — usuário corrige a fonte (planilha de orçamento ou MPP), nunca o ERP "adivinha".

**Locais que aplicam a regra** (verificar em qualquer alteração):
- `server/routers/orcamento.ts` (parser + reimportar) — preservar `eapCodigo` do upload
- `server/routers/planejamento.ts` (`gerarCronogramaDoOrcamento`, `criarRevisao`, `salvarAtividades`) — propagar `eapCodigo` sem alterar
- `client/src/pages/planejamento/ImportarCronograma.tsx` (`parseMSProjectXLSX`, `parseMSProjectXML`) — falhar se WBS ausente
- `client/src/components/planejamento/DiagnosticoEapOrcCron.tsx` — única tela autorizada a comparar e expor divergências

**Justificativa**: o `eapCodigo` é a chave de JOIN entre todas as tabelas do projeto (curva S financeira via orçamento, medições por EAP, SCs vinculadas ao item do orçamento, contratos com terceiros). Renumeração silenciosa quebra rastreio e gera divergência R$ no realizado vs previsto sem origem identificável.

---

## Checklist obrigatório antes de marcar uma tarefa como pronta

- [ ] Modal/tela é full-screen (R-001)?
- [ ] Visual rico, com gradient/badges/ícones (R-002)?
- [ ] Cores via lookup estático (R-003)?
- [ ] Responsivo no iPad e mobile (R-004)?
- [ ] Acessível por teclado (R-005)?
- [ ] Textos em pt-BR (R-006)?
- [ ] Sem imports lucide duplicados (R-007)?
- [ ] Version bumped + changelog + replit.md atualizados (R-008)?
- [ ] Sem exposição de secrets (R-009)?
- [ ] SQL com aspas em camelCase + soft-delete + companyId (R-010)?
- [ ] Tela de planejamento exclui `isIndireta`/`isExterna` do CPM (R-011)?
- [ ] Importação preserva `eapCodigo` do orçamento sem renumerar (R-013)?
