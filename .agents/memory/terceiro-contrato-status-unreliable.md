---
name: terceiro_contratos.status não é sinal de "assinado/pronto"
description: por que gatear medição/prontidão pelo envelope FcSign concluído, não pelo campo status bruto
---

`terceiro_contratos.status` é um sinal INCONSISTENTE de "contrato assinado / pronto para medir".

**Why:** observado em produção — um contrato 100% assinado (envelope FcSign não-excluído
`concluido`) pode permanecer com `status` bruto = `aguardando_assinaturas`, enquanto outros
contratos ficam `status="ativo"` sem NUNCA terem ido ao FcSign (zero envelopes). A lista
"Contratos de Serviço" mostra o badge "Ativo" por uma regra de EXIBIÇÃO, não pelo campo bruto,
o que mascara a divergência. Filtrar por `status="ativo"` zerou a tela de "Contratos prontos
para medir".

**How to apply:** para decidir se um contrato de terceiro está "assinado/pronto", use a REGRA
ADESIVA do `getContrato` — existe algum `integrasign_envelopes` com `status='concluido'` e
`excluido_em IS NULL` para aquele `contrato_terceiro_id`. Trate o `status` bruto só para EXCLUIR
estados mortos (`cancelado`/`cancelada`/`rascunho`), nunca como prova de assinatura.

Coluna real no Neon é snake_case: `terceiro_contratos.status` / `company_id` (não `companyId`);
ao consultar via SQL cru use snake_case (o drizzle mapeia internamente).
