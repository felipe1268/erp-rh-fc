---
name: Levantamento de Campo — catálogo de serviços
description: Classificação por serviço (alvenaria/chapisco/emboço/reboco), derivados automáticos e vínculo EAP por serviço
---

- `medicao_levantamento_servicos` = catálogo POR levantamento (companyId+medicaoCampoId), seed automático de 8 serviços em `listServicosLevantamento` sob `pg_advisory_xact_lock(478002, campoId)` + re-check dentro da tx (senão duplica em 2 aberturas simultâneas).
- Contorno carrega `servico` (chave). **Regra:** TODO caminho de update de contorno no client deve reenviar `servico` (recolor, rótulo, bind, geometria) — o upsert do `sincronizarLote` faz patch parcial (`d.servico === undefined` → preserva o existente) para não zerar classificação de clients offline antigos.
- Derivados (derivaDe+fator=faces): consolidado e totais do client SUPRIMEM a derivação se existir contorno manual com a chave do derivado (anti-dupla-contagem). Mesma regra nos dois lados ou divergem.
- Vínculo EAP: prioridade contorno.orcamentoItemId próprio > herdado do serviço; consolidação compartilhada em `shared/levantamentoConsolidado.ts` (server + offline usam o MESMO motor).
- **Why:** review apontou perda de classificação em edições + corrida de seed + dupla contagem.
- **How to apply:** qualquer novo caminho de escrita/edição de contorno ou de serviço deve respeitar as 3 regras acima.
