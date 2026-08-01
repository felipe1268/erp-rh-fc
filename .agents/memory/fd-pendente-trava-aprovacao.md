---
name: FD pendente trava aprovação de medição
description: FD de material (Compras) deve ser descontado das medições de terceiros; regras do guard, do puxar automático e do título líquido
---

Regra: FD de material do contrato (OCs FD detectadas por `_fdMaterialDoContrato`) ainda não lançado em `terceiro_medicao_fds` = **débito pendente** (`_fdPendenteDoContrato`).

**Como aplicar:**
- `_assertSemFdPendente` bloqueia aprovarMedicao E aprovarNivelSocio enquanto pendente>0,01 — exceção: a própria medição já descontou até o teto (FD ≥ valorMedido, líquido 0).
- `puxarFdPendente` cria 1 lançamento origem "auto" capado em `min(pendente, valorMedido − jáLançadoNaMedição)`; transação + advisory xact lock (478003, medicaoId) — idempotente, 2 cliques não dobram o desconto. Restante fica pendente pras próximas medições.
- Bridge financeiro (importTerceirosToFinancial) desconta `fd_total_abatido` do título; líquido ≤0 → NENHUM título. `valor_liquido_pagamento` NÃO inclui FD (só amortização/retenção) — o FD entra só no bridge, cuidado com dupla contagem se mudar isso.
- aprovarMedicao E aprovarNivelSocio persistem `fd_total_abatido`.
- cancelarAprovacao apaga o título da medição (reconciliação); título com baixa ativa bloqueia com "estorne a baixa antes".

**Why:** pedido do usuário (ago/2026): "sistema tem que puxar automaticamente como aviso; não deixar aprovar enquanto o débito não for descontado; usuário não pode pagar mais do que o combinado".
