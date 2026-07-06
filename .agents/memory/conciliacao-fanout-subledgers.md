---
name: Conciliação deve propagar para sub-razões dependentes
description: Conciliar uma linha do extrato (conciliarLancamento) não baixa sozinho sub-registros derivados (ex. Controle de Cheques); cada write de conciliação precisa varrer explicitamente os módulos que espelham aquele lançamento.
---

# Conciliação bancária ↔ sub-razões (ex. Controle de Cheques)

`financial_entries`/`bank_statement_lines` são a fonte principal de conciliação, mas módulos
como Controle de Cheques (`financial_cheques`) mantêm seu PRÓPRIO status/flag de conciliado
que não é atualizado automaticamente quando o lançamento correspondente é conciliado — só um
fluxo secundário raro (`conciliarChequeComLinha`, sem lançamento prévio) tocava essa tabela.

**Why:** cada sub-razão foi construída independentemente ao longo do tempo (cheques, baixas
parciais, grupos de conciliação); não existe um único "conciliar" central que propague. Sem
fan-out explícito, o usuário via a linha do extrato conciliada mas o cheque continuava
"pendente" no Controle de Cheques.

**How to apply:** ao adicionar/alterar QUALQUER mutation de conciliação, pergunte "que outras
telas mostram este mesmo pagamento com seu próprio status?" e replique o efeito lá também,
com match por identidade (nº cheque normalizado + valor em centavos, nunca id de linha que gira
em reimport) e SEMPRE dentro de try/catch que não bloqueia a conciliação principal se o
sub-registro não casar de forma inequívoca (ambíguo → não escreve, mesma filosofia de
"conciliação só sugestiva"). Também prefira computar campos de status "ao vivo" (ex. motivo de
devolução) com fallback para um valor PERSISTIDO quando uma ação explícita do usuário já
confirmou o estado — não deixe apenas o cálculo on-the-fly ser a única fonte.
