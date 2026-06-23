---
name: SEFAZ NSU rate-limit loop
description: cStat=656 retorna ultNSU correto — salvar esse NSU é crítico; ignorar causa loop eterno.
---

# SEFAZ NSU após rate-limit (cStat=656)

## A regra
Quando a SEFAZ retorna `cStat=656` (Consumo Indevido), ela **também retorna `ultNSU`** com o valor
que deve ser usado na próxima chamada. Esse NSU DEVE ser salvo em `company_nfe_config.ultimo_nsu`.

**Why:** Se o código não salvar o `ultNSU` retornado, toda chamada subsequente envia `ultNSU=0`
(o valor inicial), a SEFAZ rejeita novamente com 656, criando um loop eterno que nunca é resolvido
mesmo esperando 1 hora.

## Exemplo concreto (log real)
```
cStat=656 · ultNSU enviado=000000000000000 · ultNSU retornado=000000000009615
"Deve ser utilizado o ultNSU nas solicitacoes subsequentes. Tente apos 1 hora"
```

## How to apply
- Variável `rateLimitedNsu` captura `novoUltNSU` quando `cStat === "656"` e `novoUltNSU > 0`
- No save final: se `rateLimitedNsu` existe, incluir `ultimo_nsu = rateLimitedNsu` no UPDATE
- O NSU avançado não significa que documentos foram processados — apenas que a SEFAZ quer que
  a próxima consulta parta desse ponto
- Cooldown de 58min (`rateLimitedAt` no JSON) evita queimar a cota com chamadas extras

## Importação alternativa via XML
Para histórico 2018-2026: botão "Importar XML" na aba NF-e Recebidas aceita nfeProc/NFe XML.
Endpoint `sefaz.importXml`; `listNFeRecebidas` filtra `IN ('sefaz_nfe', 'xml_upload')`.
