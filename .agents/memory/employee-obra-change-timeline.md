---
name: Mudança de obra na timeline do Raio-X
description: Por que troca de obra não aparecia na timeline do funcionário e como as 2 tabelas de histórico se relacionam.
---

# Mudança de obra na Timeline Cronológica (Raio-X do funcionário)

A troca de obra do funcionário é gravada em `employee_site_history` (por
`allocateEmployeeToObra` / `removeEmployeeFromObra` em `server/db.ts`), NÃO em
`employee_history`. A Timeline Cronológica (`controleDocumentos.raioX`) historicamente
só agregava `employee_history` (Histórico Funcional), então a mudança de obra NUNCA
aparecia — apesar de existir o label "Transferencia" no employee_history, nenhum fluxo
de troca de obra escreve lá.

**Duas tabelas distintas de histórico do funcionário:**
- `employee_history` — histórico FUNCIONAL administrativo (admissão, promoção, mudança
  de função/setor/salário, afastamento, etc.). Aba "Hist. Funcional".
- `employee_site_history` — histórico de ALOCAÇÃO em obra. tipos: `alocacao`,
  `transferencia`, `saida`, `gestor_obra`.

**Padrão de gravação em `allocateEmployeeToObra`:**
- 1ª alocação (sem obra ativa anterior) → grava SÓ `alocacao` (sem saída).
- Transferência (já tinha obra) → grava DUAS linhas no mesmo dia: uma `saida` da obra
  origem + uma `transferencia` p/ a obra destino (com `obraOrigemId`).
- `removeEmployeeFromObra` → grava `saida` avulsa (sem transferência par).

**Why (dedup):** ao exibir na timeline, a `saida`-par de uma transferência é redundante
com o evento `transferencia` (mesmo dia). Suprima a `saida` cuja `dataFim` casa com a
`dataInicio` de uma **transferência** do mesmo dia. NÃO inclua `alocacao` no critério de
dedup — a saída-par só acompanha transferência, então incluir alocacao arriscaria ocultar
uma saída avulsa legítima caída no mesmo dia de uma nova alocação por fluxo separado.

`gestor_obra` é designação de gestor, não relocação do funcionário — ignorar na timeline.
Eventos futuros são filtrados no fim do `raioX` (Rev. 2545).
