---
name: Vale snapshot — congelado, sanitização por mês/contrato, e fonte de leitura da Folha
description: Consolidated notes — payroll_advances/valeResultJson is a frozen snapshot; read-path sanitization, contract-change staleness, and re-sync-on-write rules.
---

# Vale (`payroll_advances` / `payroll_periods.valeResultJson`) — snapshot congelado

`valeResultJson` é gerado UMA vez em "Gerar Vale" e fica IMUTÁVEL até a próxima geração.
A tela de Folha/Vale sempre lê esse snapshot, NUNCA direto de `payroll_advances` ao vivo.
Qualquer mudança de estado DEPOIS da geração (desligamento, CLT→PJ/Sócio, decisão de
pagar/rejeitar) precisa ser refletida por sanitização de leitura OU re-sincronização do
snapshot — a geração e a leitura têm fontes de verdade diferentes.

**Regras de elegibilidade / cutoff:**
- Inelegível ao vale: PJ | Sócio | `deletedAt` (nunca recebe, mesmo forçado).
- Desligado: inelegível quando `(dataDesligamentoEfetiva ?? dataDemissao) < ${mes}-01`
  (comparação lexicográfica `YYYY-MM-DD`, mês validado por regex `^\d{4}-\d{2}$`). Em aviso
  prévio com saída cobrindo o mês (saída ≥ 1º dia) PERMANECE elegível (vale proporcional).

**Why:** um fix inicial só cobriu um endpoint de decisão (`decidirVale`); code review achou
que `reverterVale` era bypass (revertia rejeitado→calculado e recriava o evento financeiro
sem reaplicar a guarda). Lição: garantia de negócio sobre dinheiro saindo tem que cobrir
TODOS os sinks, não só o endpoint "óbvio".

**How to apply:**
- Leitura (`getPeriod`): sanitiza o snapshot na hora, READ-ONLY (recalcula
  totalFuncionarios/totalAlertas/totalVale/valorLiquido) via `getIdsInelegiveisVale` — NÃO
  regrava `payroll_advances`; a linha persiste mas some da exibição/contagem/aprovação.
  Linha órfã se auto-higieniza no próximo "Gerar Vale" (DELETE do mês + reinsert).
- Escrita: TODO write-path que muda estado de um vale (pagar/rejeitar, valores,
  arredondamento) precisa re-derivar/re-sincronizar o snapshot a partir de
  `payroll_advances` (helper no `payrollEngine`) — senão a mudança "funciona" na sessão
  (update otimista) mas some no reload. Teste sempre o reload, não só a sessão.
- Cobrir os DOIS sinks de decisão (`decidirVale` pagar:true e `reverterVale`): inelegível
  → `rejeitado`+`bloqueado=1`, sem evento financeiro.
- A SIMULAÇÃO DA FOLHA é mais um sink de leitura: o desconto "VALE" lê
  `payroll_advances.valorTotalVale` direto — precisa pular `status='rejeitado'`
  (vale cancelado/revertido NUNCA desconta na folha). Bug real jul/2026 (Acacio).
