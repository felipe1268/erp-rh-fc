---
name: Cheque devolvido — forma de pagamento no vínculo tipo 'ajuste'
description: como o pagamento sem linha de extrato (dinheiro/depósito/cheque próprio/outro) é rastreado na quitação de cheque devolvido
---

O vínculo `bank_cheque_vinculos` tipo `ajuste` (quitação sem PIX/TED, ou seja, sem `pix_line_id`) exige `forma_pagamento` (dinheiro/deposito/cheque_proprio/outro) — validado no backend (`registrarVinculoChequeDevolvido`).

**Por quê:** antes, todo pagamento sem linha de extrato virava um "ajuste manual" genérico e indistinguível; o usuário queria saber COMO cada parcela foi paga quando um cheque devolvido é quitado por múltiplas formas/pagamentos.

**Como aplicar:** o detalhamento completo de como um cheque `compensado_pix` foi pago (múltiplos PIX/TED de contas diferentes + dinheiro/depósito/etc.) é consultável via `getVinculosPorChequeNumero`, exposto como popover em Controle de Cheques (FinanceiroCheques.tsx) — não só na tela de Conciliação. `statusBadge()` de telas que listam `financial_cheques.status` deve sempre tratar o valor `compensado_pix` (Rev. 4079/4081), senão cai no "Indefinido" por default.
