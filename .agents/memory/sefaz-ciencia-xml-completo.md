---
name: SEFAZ Ciência da Operação libera XML completo
description: Por que uma NF-e recebida via distribuição SEFAZ chega só como resumo (resNFe) sem XML completo, e como liberar
---

Quando uma NF-e chega via WebService NFeDistribuicaoDFe (consulta por NSU) e a
SEFAZ só entregou o evento resumido `resNFe`, o `nfeProc` (XML completo, com
todos os itens/impostos) frequentemente NÃO é liberado automaticamente para o
destinatário. Em várias UFs a liberação do XML completo exige que o
destinatário registre o evento **"Ciência da Operação" (tpEvento 210210)**
junto à SEFAZ — um ato de baixo compromisso (não confirma nem recusa a
compra), diferente de "Confirmação da Operação" (210200) ou "Desconhecimento"
(210220).

**Como aplicar:** depois de registrar a Ciência com sucesso (cStat 135/136/573
= já registrada), refazer a consulta específica por chave (`consChNFe`, mesmo
endpoint NFeDistribuicaoDFe, filtrando por `chNFe`) — se a SEFAZ já processou
a Ciência, essa nova consulta tende a devolver o `nfeProc` completo, que deve
ser salvo em `fiscal_notes.xml_payload`.

Isso é distinto do mecanismo de backfill por NSU (`recuperarXmlsBackfill`),
que só re-tenta pegar `nfeProc` se a SEFAZ já tinha enfileirado — não força a
liberação. A ação de Ciência deve ser DISPARADA MANUALMENTE pelo usuário por
nota (nunca automática em lote), pois é um ato oficial registrado junto ao
governo.
