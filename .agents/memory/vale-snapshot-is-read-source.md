---
name: Vale snapshot é a fonte de LEITURA da Folha
description: Telas de Folha/Vale leem o snapshot JSON do período, não payroll_advances; writes de decisão precisam re-sincronizar o snapshot.
---

A tela de Folha de Vale renderiza a partir do snapshot JSON do período
(`payroll_periods.valeResultJson`), NÃO direto da tabela de lançamentos
(`payroll_advances`). São duas representações do mesmo estado.

**Regra:** todo write-path que muda o estado de um vale (decisão pagar/rejeitar,
valores, arredondamento) precisa re-derivar o snapshot a partir de `payroll_advances`
(há um helper de sincronização no `payrollEngine`). Senão a mudança "funciona" na
sessão (update otimista no client) mas some no próximo reload, porque a leitura volta
ao snapshot velho.

**Why:** um endpoint de decisão gravava só na tabela e esquecia de re-sincronizar o
snapshot; os outros caminhos (reversão/aprovação) já sincronizavam — a assimetria
fazia a exclusão "voltar" no reload e parecer um botão quebrado.

**How to apply:** ao tocar qualquer endpoint de vale, confirme que ele re-sincroniza
o snapshot no fim. Update otimista mascara o bug — teste o reload, não só a sessão.
