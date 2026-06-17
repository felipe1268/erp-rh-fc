---
name: Conciliação bancária é sempre só sugestiva
description: Regra de produto FC — conciliação automática nunca grava sem confirmação explícita do usuário.
---

A conciliação automática (sugerirConciliacao) é **apenas sugestiva**: nenhum lançamento é baixado/conciliado sem o usuário CONFIRMAR explicitamente cada valor.

**Why:** o piloto FC desconfiou que o sistema tivesse conciliado sozinho (eco do falso "Todo o extrato está conciliado 🎉"). Exigiu: "a conciliação automática deve ser apenas sugestiva, todos os valores devem obrigatoriamente ser confirmados pelo usuário."

**How to apply (Rev. 3201+):**
- O backend já é só sugestivo: `sugerirConciliacao` é `.query()` (read-only); a importação de extrato NÃO marca `conciliado=1`.
- Na UI (`FinanceiroConciliacao.tsx`), aplicar a baixa em lote (`conciliarSugestoes`) SEMPRE passa por um AlertDialog de revisão que lista cada par (extrato → lançamento + valores). Os atalhos "Selecionar alta confiança"/"Selecionar todas" só PRÉ-SELECIONAM.
- NÃO reintroduzir nenhum caminho de "aplicar tudo em 1 clique" sem essa etapa de confirmação. Qualquer novo botão que dispare `conciliarSugestoes`/`conciliarLancamento` deve exigir confirmação visível com os valores.
