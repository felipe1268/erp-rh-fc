---
name: Contas a Pagar — base da janela de fechamento do fornecedor
description: qual data usar para bucketizar consolidação por ciclo de fechamento de fornecedor
---

Ao agrupar títulos de um fornecedor por janela de fechamento (`_cicloWindow`), a data usada para
decidir em qual janela um título cai deve ser a data da COMPRA (`dataCompetencia`, gravada no
momento em que a OC é lançada no financeiro), NUNCA `dataVencimento`.

**Why:** o vencimento de cada título é calculado com prazo PRÓPRIO da compra (15/30/45 dias,
varia OC a OC) e não tem relação com o calendário de fechamento do fornecedor — usá-lo como base
espalha compras feitas no MESMO ciclo em janelas diferentes, fragmentando o agrupamento (ou
agrupando só por coincidência). `dataCompetencia` é estável e reflete "quando comprou", que é o
que de fato define a janela de fechamento.

**How to apply:** qualquer novo agrupamento por ciclo/fechamento de fornecedor (Contas a Pagar,
Conciliação, relatórios futuros) deve bucketizar por competência/data de origem, não por
vencimento. O vencimento do GRUPO consolidado (`_cicloFechamentoDate`) continua sendo derivado da
janela normalmente — só a classificação de "que título pertence a qual janela" muda.

Também: ciclo de fechamento só é lido de `empresas_terceiras.ciclo_pagamento`; um fornecedor sem
linha correspondente ali (ou sem o campo salvo) nunca vai agrupar — não é bug, falta cadastro.
