---
name: Cheque estorno pairing false-positive
description: Pairing "compensação débito × devolução crédito" do mesmo cheque no extrato é heurístico; precisa de guardas anti-falso-positivo senão esconde linhas legítimas.
---

# Pareamento de estorno de cheque (par "débito compensação + crédito devolução")

A Conciliação Bancária detecta a TENTATIVA DE PAGAMENTO FRUSTRADA casando, nas linhas
do extrato (`bank_statement_lines`), o débito de compensação de um cheque com o crédito
de devolução do MESMO cheque (saldo zero). O motor vive em `shared/chequeMotivos.ts`
(`detectarParesEstorno`) e alimenta tanto a Conciliação (`financial.ts` → `chequesDevolvidos[]`,
remove o par da lista "no extrato sem lançamento") quanto a dupla checagem do Controle de
Cheques (`cheques.ts` → exclui débitos estornados de `byNumVal`/`byValData` p/ NÃO confirmar
`conciliado=1` um cheque cujo débito foi revertido).

**Regra / armadilha:** o pareamento é heurístico (descrição + valor + data). Um falso par
NÃO é só ruído visual — ele **some** com uma linha legítima da lista de pendências E pode
impedir uma confirmação de cheque válida. Por isso os classificadores precisam de guardas:

- **`cheque especial` ≠ cheque em papel.** É limite/overdraft; suas tarifas/juros/IOF (e
  estornos) contêm a palavra "cheque" e geram par falso. Excluir via `pareceChequeEspecial`
  (`cheque especial`, `ch especial`, `LIS`, `limite especial`).
- **Tarifa/juros/anuidade/IOF/manutenção** citando "cheque" NÃO são compensação — excluir em
  `pareceCompensacaoCheque`.
- **Fallback por valor-só** (sem nº doc/cheque na descrição) só pode parear quando há
  EXATAMENTE 1 candidato de mesmo valor E dentro de janela curta (≤60 dias antes do crédito),
  senão um débito coincidente de meses atrás é pareado por acaso.

**Sinais do extrato:** crédito/entrada = `valor >= 0`; saída = negativo; a devolução é um
crédito de mesmo valor absoluto do débito.

**Why:** code review (architect) apontou que classificadores amplos (`/cheq/` puro) +
fallback valor-só sem janela criam falsos pares que escondem pendências legítimas e bloqueiam
confirmações válidas.

**How to apply:** ao mexer em qualquer classificador `parece*Cheque*` ou no fallback de
`detectarParesEstorno`, preserve os guardas (cheque-especial, tarifa/juros, janela de data,
pool único). Tudo é READ-ONLY — nenhum par baixa/altera status; só reclassifica exibição.
