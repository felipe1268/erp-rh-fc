---
name: Conciliação cheque/boleto cross-month suggestion
description: Why the reconciliation suggestion engine must search OTHER months (and match by cheque number) for cheques/boletos
---

# Conciliação · sugestão de cheque/boleto

A sugestão de conciliação (`sugerirConciliacao` em `server/routers/financial.ts`)
limita o pool de lançamentos do ERP ESTRITAMENTE ao período analisado, e o
pareamento usa tolerância de data `tol` (padrão 0).

**Regra:** para `forma_pagamento` cheque/boleto isso NÃO vale — o Controle de
Cheques lança o cheque/boleto na data "bom para" (parcela), mas a compensação no
extrato pode cair em OUTRO mês (cheque de dez/fev compensa em jan). Por isso, só
para cheque/boleto:
- o pool de entries abre uma janela AMPLA (±6 meses) além da estrita (OR no WHERE);
- o pareamento usa tolerância de data AMPLA (≈6 meses) em vez do `tol` estrito;
- casa pelo Nº do cheque/doc quando ambos os lados o expõem (extrato via
  `extrairNumCheque`/`extrairDocCheque`; lançamento via descrição): números
  DIFERENTES descartam o par (903 nunca casa com 902), número IGUAL = casamento forte.

**Why:** sem isso o motor pareia só por VALOR e (1) some com cheques lançados em
outro mês e (2) cola a linha de um cheque no lançamento de outro de mesmo valor.

**How to apply:** demais formas de pagamento DEVEM continuar estritas ao período
(senão regride). Honra "conciliação só sugestiva" — nada concilia/baixa sozinho.
Atenção ao binding posicional do `dbExecute` (params na ordem TEXTUAL dos $N).
