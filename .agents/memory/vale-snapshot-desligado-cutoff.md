---
name: Vale snapshot — sanitização de desligados por mês
description: Por que a sanitização de leitura do snapshot de vale precisa de cutoff por saída efetiva × mês, não só PJ/Sócio/excluído.
---

# Vale (`payroll_advances`) — snapshot congelado precisa de sanitização por mês

O snapshot `valeResultJson` é gerado UMA vez (quando os funcionários ainda estavam Ativos) e fica congelado. A GERAÇÃO (`gerarVale`) exclui corretamente quem saiu antes do mês, mas a LEITURA lê o JSON velho — então qualquer mudança de status DEPOIS da geração (desligamento) precisa ser refletida por uma sanitização de leitura.

A sanitização original (`getIdsInelegiveisVale`) só removia PJ/Sócio/excluído (`deletedAt`). Faltava o caso DESLIGADO: um funcionário desligado cuja saída efetiva é anterior ao mês continuava "recebendo" vale no snapshot.

**Regra do cutoff:** inelegível ao vale quem está em `EMPLOYEE_STATUS_DESLIGADOS` E `(dataDesligamentoEfetiva ?? dataDemissao) < ${mes}-01`. Desligado em aviso prévio cuja saída cobre o mês (saída ≥ 1º dia) PERMANECE elegível (recebe vale proporcional).

**Why:** geração e leitura têm fontes de verdade diferentes (cálculo ao vivo vs JSON congelado); qualquer filtro de elegibilidade aplicado na geração precisa de espelho na sanitização de leitura, senão dados antigos vazam.

**How to apply:** ao mexer em elegibilidade de vale, alinhe `getIdsInelegiveisVale`/`sanitizarValeSnapshotNaoClt` (leitura) com `gerarVale` (geração) E com os guardas de `decidirVale`/`reverterVale` (aprovação/reversão). A sanitização é READ-ONLY — NÃO regrava o snapshot; a linha em `payroll_advances` persiste mas some da exibição/contagem/aprovação. Comparação de datas é lexicográfica `YYYY-MM-DD` (use `.slice(0,10)` + mês validado por regex `^\d{4}-\d{2}$`).
