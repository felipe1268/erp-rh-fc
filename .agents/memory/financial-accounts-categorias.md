---
name: Financial accounts / Categorias constraints
description: Hidden constraints when editing financial_accounts (categorias AUTO-* vs plano de contas)
---

# financial_accounts — gotchas ao editar categorias

- **`tipo` só aceita `receita` | `despesa`** (e `natureza` só `fixo` | `variavel`). NÃO existe tipo "transferência". A tela Categorias e os filtros só conhecem esses 2. Então "tirar de despesa" = virar `receita`; movimentações neutras (transferência bancária, aplicação, resgate) não têm tipo próprio — escolha o lado que faz sentido (entrada→receita) e avise o usuário da limitação.
- **Índice único parcial `uq_fa_company_lower_nome_ativo` = (company_id, lower(nome)) WHERE ativo=1 e abrange TODOS os escopos** (Plano de Contas `codigo` contábil + Categorias `AUTO-NNNN` juntos). Renomear uma categoria pode colidir com um item do Plano de Contas com mesmo nome (ex.: renomear AUTO-0047 "DESPESAS VARIAVEIS"→"DESPESAS VARIÁVEIS" bate no plano código `5`). Antes de renomear em lote, cheque `LOWER(nome)` contra TODAS as linhas ativas, não só as `AUTO-%`.

**Why:** limpeza em massa de categorias quebrou no COMMIT por essas duas restrições não-óbvias.
**How to apply:** ao mexer em `financial_accounts` (rename/reativar/reclassificar), keyear por `codigo`+`company_id`, pré-validar colisão de nome contra todos os ativos, e lembrar que reclassificar = só receita/despesa.
