---
name: Payroll rounding carry-forward (vale + folha)
description: How the R$1-rounding carry-forward ledger works and the invariant every paid-value writer must respect.
---

# Arredondamento p/ R$ 1 com carry-forward (vale + folha)

O ERP paga vale e líquido da folha em REAIS INTEIROS, mas sem o funcionário perder/ganhar centavos ao longo do tempo: o residual carrega para o próximo evento do MESMO funcionário (vale→folha→vale...).

- `pago_n = round(exato_n + B_{n-1})`; `residual_n = exato_n + B_{n-1} − pago_n = B_n` (saldo corrente).
- Carry de um evento = `residualGerado` do ÚLTIMO evento anterior (maior `ordem` < ordemAtual), **NÃO** a soma de todos (somar conta o saldo em dobro).
- `ordem = ((ano*12)+(mês-1))*2 + (origem==='folha'?1:0)` ⇒ vale(M) < folha(M) < vale(M+1).
- Trilha persistida em `payroll_rounding_ledger` (camelCase QUOTED), 1 linha por (companyId,employeeId,origem,mesReferencia). Regeneração de um mês = DELETE da linha do mês/origem → carregar saldos → arredondar → INSERT (idempotente).

**Why:** pedido do piloto FC (valores redondos sem deriva financeira). Carry como "último residual" (não soma) é o que torna a regeneração estável/idempotente.

**How to apply — INVARIANTE:** TODO caminho que grava o VALOR PAGO de um funcionário deve reaplicar o arredondamento e atualizar o ledger + colunas `*Exato`/`ajuste*`, senão o pago volta a ter centavos e o carry do próximo evento usa um residual que não bate com o pago real. Isso inclui não só `gerarVale`/`simularPagamento`, mas também:
- `editarDescontoManual` (folha): reaplica arred sobre o líquido recomputado + regrava linha 'folha' do ledger.
- `editarValorVale`/`editarLiquidoVale` (override do master): o valor forçado vira o pago final → `ajuste=0`, `valorLiquidoExato`=forçado, e DELETE da linha 'vale' do ledger (sem residual, não corrompe o carry).
- `decidirVale` (aprovar bloqueado): arredonda + regrava ledger; DELETE do `financial_event` de vale anterior antes de reinserir (idempotência da saída financeira).

**Ressalva tenant:** a folha (`simularPagamento`) keya ledger/pagamentos por `input.companyId` (consolida o grupo). O vale (`gerarVale`) keya por `emp.companyId`. Em empresa única (uso padrão) coincidem e o carry vale↔folha encadeia certo; em folha multi-empresa de grupo (raro) o carry só encadeia quando `input.companyId` == empresa do funcionário.
