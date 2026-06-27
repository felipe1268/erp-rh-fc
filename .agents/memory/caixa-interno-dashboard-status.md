---
name: Caixa Interno no dashboard de Conciliação (status por conta)
description: Por que a conta Caixa Interno some/zera nos gráficos da Conciliação e como completar os valores
---

## Regra
Contas **Caixa Interno** (`company_bank_accounts.caixaInterno=1`) NÃO têm extrato
(`bank_statement_lines`); seus lançamentos vivem em `financial_entries`, confirmados
manualmente (`conciliado=1` via "Confirmar"). Por isso o endpoint do dashboard de
Conciliação (`getBankAccountsConciliacaoStatus`) faz uma **2ª query separada** sobre
`financial_entries` e "empurra" a linha da conta CI no resultado.

**Armadilha:** essa linha empurrada precisa carregar os VALORES EM R$
(`valorTotal/valorConciliado/valorEntradas/valorSaidas` + splits por direção), não só
`total`/`conciliadas` (COUNT). Se qualquer R$ ficar hardcoded em 0, a conta aparece
listada nos gráficos ("Por conta bancária", donut, KPIs) com **barra vazia / R$ 0,00**
mesmo tendo lançamentos.

**Why:** os gráficos plotam os valores R$ por conta; CI sem R$ = barra fantasma.
Aconteceu porque a primeira versão (que incluiu CI no endpoint) só computou a contagem.

**How to apply:** a agregação de CI deve ESPELHAR a fonte canônica da tela Caixa
Interno (`getEntradasCaixaInterno`): entradas=`SUM(tipo='receita')`,
saídas=`SUM(tipo='despesa')`, valor=`ABS(COALESCE(valor_realizado, valor_previsto, 0))`
(colunas numeric → soma direta em SQL), filtro `status<>'cancelado'`, janela por
`data_competencia`. CI não é extrato → manter `valorEntradasInternas/SaidasInternas=0`
(o split "movimentação interna" é conceito de extrato, via descrição/CNPJ). Validar no
Neon que os números batem com a tela Caixa Interno (ex.: conta 22, company 60002).
