---
name: EPI "restrito não escreve no Central" — cobrir TODAS as rotas
description: Ao impor que usuário restrito (allowedObraIds != null) não mexe no Almoxarifado Central, é fácil esquecer rotas de escrita laterais.
---

Regra de negócio: usuário com `users.allowedObraIds != null` (restrito a obras) NÃO pode
escrever no Almoxarifado Central; só cadastra/ajusta nas obras que tem acesso. admin /
allowedObraIds === null = global.

**Why:** ao implementar isso no módulo EPI (`server/routers/epis.ts`), a primeira passada
guardou só `create`/`update`/`ajustarEstoqueObra`/`entradaDiretaObra`. Code review pegou
bypasses: `transferir` debita/credita o Central sem guard (origem central OU destino central),
`entradaEstoque` credita o Central sem guard nenhum, e `create` só checava `quantidadeEstoque > 0`
(qtd negativa escapava). Faltava enumerar TODA rota que toca `epis.quantidadeEstoque`.

**How to apply:** ao impor uma regra de permissão sobre um recurso (ex.: Central), faça um
inventário de TODAS as procedures que escrevem nele e aplique o guard (`assertCentralWrite`)
ANTES da escrita em cada uma — não só nas rotas "óbvias" da feature. Em transferências,
lembrar que origem=central é débito e destino=central é crédito (ambos são escrita). Validar
inputs numéricos (`z.number().min(0)`) e checar `!= 0`, não `> 0`, pra negativo não furar.

**Gap conhecido (follow-up):** os fluxos de ENTREGA `createDelivery`/`updateDelivery`/
`deleteDelivery` também debitam/creditam estoque central e de obra e seguem SEM
`assertCentralWrite`/`assertObraWrite` — ficaram fora do escopo do Catálogo e precisam do
mesmo hardening.
