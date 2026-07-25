---
name: Aplicação financeira não é despesa
description: Lançamentos de aplicação (ex. CONTAMAX) criados via conciliação não podem entrar nas Saídas do Fluxo de Caixa
---

**Regra:** Lançamentos de extrato do tipo "APLICACAO ..." (dinheiro indo para investimento, ex. CONTAMAX) NÃO são despesa — devem ter `origem_modulo='aplicacao_financeira'` e ficar FORA das Saídas do Fluxo de Caixa; ida e volta (aplicações + resgates) aparecem juntas, líquidas, na linha informativa "Outras movimentações bancárias".

**Why:** Conciliação bancária criava essas linhas como despesa com origem NULL; os resgates voltavam só como "outras movimentações" (nunca receita) → assimetria criou déficit fantasma de ~R$3,2 mi na matriz. Corrigido com UPDATE reversível no Neon + exclusão no client (despBuckets/despSplit) + inclusão na condição de "outras" no endpoint de movimentações.

**How to apply:** Qualquer novo caminho que crie despesa a partir de conciliação de extrato deve detectar descrições APLICACAO* e semear `origem_modulo='aplicacao_financeira'` (follow-up Poka-Yoke pendente). Telas de custo/saída devem excluir essa origem. Contas a Pagar ainda lista essas 66 linhas (fora de escopo até agora).
