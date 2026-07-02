---
name: Banco de Horas — lista de saldos excluía negativos
description: getSaldoBanco filtrava saldoMinutos > 0, escondendo funcionários com saldo negativo mesmo quando os cards de alerta (getAlertasSaldoNegativo) já os contavam.
---

A tela "Banco de Horas" tem 2 fontes que parecem a mesma coisa mas divergiam:
- `getSaldoBanco` (lista "Saldos") — filtrava `saldoMinutos > 0`, escondendo TODO funcionário com saldo negativo.
- `getAlertasSaldoNegativo` (card "Saldo Negativo mensal") — sempre incluiu negativos.

Resultado: card mostrava "4 funcionários devendo horas" mas a lista principal dizia "nenhum funcionário com saldo".

**Fix**: trocar o filtro de `getSaldoBanco` para `saldoMinutos <> 0` (inclui positivo e negativo). UI da lista precisa colorir negativo em vermelho (estava fixo em azul assumindo só positivo).

**Padrão relacionado**: o toggle "Hora Extra × Banco de Horas" (destino padrão de HE) deve ser editável só por `admin_master` — gate em AMBOS os lados (client `disabled={!isAdminMaster}` E backend `ctx.user.role !== 'admin_master'` no mutation), nunca só um dos dois.
