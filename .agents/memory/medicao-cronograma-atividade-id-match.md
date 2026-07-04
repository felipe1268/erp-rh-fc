---
name: Medição × Cronograma — casar por atividade_id, não EAP
description: Por que casamento de avanço/medição entre Planejamento (Cronograma) e Medição de Contratos deve usar a PK atividade_id, não eap_codigo nem código EAP do Orçamento.
---

## O problema

"Importar do Orçamento (com avanço físico)" na Medição de Contratos trazia zero itens. O pedido real do usuário era outro: o avanço físico semanal lançado no Planejamento deveria fluir automaticamente para a Medição, casado com a atividade certa do Cronograma — não um import pontual do Orçamento.

## Causa-raiz (duas camadas)

1. **Orçamento × Cronograma têm EAPs diferentes por natureza.** Orçamento é organizado por composição/insumo; Cronograma é organizado por pacote de trabalho/atividade. Códigos EAP dos dois raramente coincidem — casar por código quase nunca encontra par.

2. **Mesmo trocando a fonte para o Cronograma, `eap_codigo` em `planejamento_atividades` só vem preenchido numa fração das atividades reais** (ex.: 11 de ~230 num projeto real validado). O resto vem como string vazia `''` — não `NULL`. Uma query que filtra `eap_codigo IS NOT NULL` não pega esse caso, e uma que faz `DISTINCT ON (eap_codigo)` colapsa dezenas de atividades diferentes numa única chave vazia, perdendo quase tudo.

## A regra

Para casar avanço físico / valor medido / qualquer dado por atividade do Cronograma, **use sempre a PK `atividade_id`** (chave primária real de `planejamento_atividades`, sempre presente e 1:1) — nunca `eap_codigo` (esparso) nem casamento por código/descrição textual entre Orçamento e Cronograma.

**Por quê:** `eap_codigo` é opcional e frequentemente vazio; código EAP do Orçamento não tem correspondência estrutural garantida com o do Cronograma. `atividade_id` é a única chave que garante 1:1 sem perda.

**Como aplicar:** qualquer tela/relatório que precise cruzar "avanço/medido no Planejamento" com "item na Medição de Contratos" deve:
- Iterar as atividades-folha do Cronograma diretamente (não os itens do Orçamento) como fonte de itens de medição.
- Calcular valor contratual do item como `pesoFinanceiro% × valorTotalContrato` (mesma lógica usada em "Cronograma Financeiro").
- Indexar avanço/medido em mapas `Record<atividadeId, valor>`, sempre usando a mesma revisão aprovada do projeto para consistência.

Validado num projeto real: 211/211 atividades com avanço casaram corretamente usando `atividade_id` (contra 15/148 usando `eap_codigo`).
