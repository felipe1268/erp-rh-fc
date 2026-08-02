---
name: Levantamento de Campo — catálogo de serviços
description: Classificação por serviço (alvenaria/chapisco/emboço/reboco), derivados automáticos e vínculo EAP por serviço
---

- Rev. 4819: fonte única = `medicao_servicos_catalogo` (GLOBAL por empresa, lock 478007+companyId; categoria criada em 1 contrato vale p/ todos; subcategoria via `parent_chave` com fallback de convenção de prefixo). `medicao_levantamento_servicos` continua POR levantamento (vínculo EAP + desativar locais) e é MATERIALIZADA/sincronizada do catálogo em `listServicosLevantamento` sob `pg_advisory_xact_lock(478002, campoId)`; campo consolidado NUNCA sofre sync. Órfãos (chave fora do catálogo): sem contorno → recolhe; com contorno → re-insere no catálogo. Excluir do catálogo = tx sob 478007 + bloqueia se houver sub/derivado/contorno em qualquer contrato.
- Contorno carrega `servico` (chave). **Regra:** TODO caminho de update de contorno no client deve reenviar `servico` (recolor, rótulo, bind, geometria) — o upsert do `sincronizarLote` faz patch parcial (`d.servico === undefined` → preserva o existente) para não zerar classificação de clients offline antigos.
- Derivados (derivaDe+fator=faces): consolidado e totais do client SUPRIMEM a derivação se existir contorno manual com a chave do derivado (anti-dupla-contagem). Mesma regra nos dois lados ou divergem.
- Vínculo EAP: prioridade contorno.orcamentoItemId próprio > herdado do serviço; consolidação compartilhada em `shared/levantamentoConsolidado.ts` (server + offline usam o MESMO motor).
- **Why:** review apontou perda de classificação em edições + corrida de seed + dupla contagem.
- **How to apply:** qualquer novo caminho de escrita/edição de contorno ou de serviço deve respeitar as 3 regras acima.
