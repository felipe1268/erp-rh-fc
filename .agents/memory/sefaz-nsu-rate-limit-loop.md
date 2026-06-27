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

## Armadilha — reset de NSU no boot re-cria o loop (mesmo com o save do 656 correto)
O save do `ultNSU` do 656 (acima) pode estar 100% certo e o loop AINDA acontecer se algum bloco de
startup zerar o NSU a cada boot. Já existiu um migration `[SyncSchema+]` que, todo boot, resetava
`ultimo_nsu=0` + `last_sync_result=NULL` para empresas com `nsuSalvo!=null` E `importadas=0`,
achando que era "corrupção". Mas `nsuSalvo + importadas=0` é exatamente o estado CORRETO após um 656.
Resultado: NSU bom → reset p/ 0 no boot → 656 de novo → loop, independente do tempo de espera.

**Why:** deploys/restarts são frequentes; um reset no boot desfaz o save do 656 antes da próxima sync.
**How to apply:** ao depurar "só dá erro / NSU inicial=0", NÃO olhe só o handler do 656 — procure
TODO bloco de boot/migration que escreve em `ultimo_nsu`/`last_sync_result`. `importadas=0` NUNCA é
sinal de corrupção por si só.

## Resume point seguro (heal manual sem pular documentos)
Para curar `ultimo_nsu=0` na mão sem risco de PULAR NF-e: derive o ponto de retomada dos NOSSOS
próprios dados — `MAX(nsu_sefaz)` em `fiscal_notes` (origem `sefaz_nfe`). Temos provadamente tudo
até esse NSU, então `ultimo_nsu = MAX(nsu_sefaz)` faz a próxima sync pedir o próximo e nada é pulado.
NUNCA chutar o NSU de um screenshot/log (pode ser maxNSU = docs ainda NÃO consumidos → pula notas).
Limpar `last_sync_at` + `last_sync_result` zera cooldown/backoff p/ a próxima cron rodar já.

## Margem do gate de cooldown deve ficar ACIMA do limite SEFAZ, não abaixo
Mesmo com NSU correto, dá 656 intermitente se o gate de tempo permitir uma chamada um pouco ANTES
das 2h. Havia `cooldownMin = intervaloHoras*60 - 2` (118 min p/ intervalo de 2h); com o cron a cada
15 min, a chamada efetiva caía em ~1h58–2h00 (< 2h) e a SEFAZ devolvia cStat=656 (Consumo Indevido).
**Why:** a SEFAZ rate-limita "1 chamada / 2h por CNPJ"; folga NEGATIVA empurra a chamada para baixo
do teto. **How to apply:** o espaçamento mínimo entre chamadas precisa ser > intervalo configurado
(ex.: `intervaloHoras*60 + 3`), nunca menor. O gate de `executarSyncNFe` é a autoridade única
(cron, syncNow e backfill passam por ele) — corrigir lá cobre todos os caminhos.

## NÃO limpar last_sync_at para "acelerar" um heal
Limpar `last_sync_at=NULL` faz o gate liberar uma chamada IMEDIATA (branch "primeiro sync"), que pode
bater na SEFAZ poucos minutos após a anterior → 656 na hora + backoff escalado. Para curar dados,
ajuste só `ultimo_nsu` (via MAX(nsu_sefaz)) e deixe o `last_sync_at` real intacto; a próxima sync
bem-espaçada resolve. Resetar `rateLimitConsecutive` é ok, mas mantenha o espaçamento de 2h.

## sync_intervalo_horas < 2 causa 656 sistemático
`sync_intervalo_horas = 1.5` → cooldown base = 93 min, abaixo do teto SEFAZ de 120 min. Toda chamada
sem backoff chega cedo demais → 656 → backoff escala → timer parece "não funcionar" (conta até 0,
sincroniza, falha, reseta para valor maior). O CNPJ acumula violações e SEFAZ pode enforçar lockout
mais longo que 2h. **Why:** a SEFAZ conta CHAMADAS, não só intervalo; um CNPJ com histórico de
violações recentes fica bloqueado mesmo após gaps de 6h+. **How to apply:** `sync_intervalo_horas`
nunca < 2; backend em `executarSyncNFe` usa `Math.max(2, intervalo)` + validação zod `.min(2)` +
UI mostra aviso âmbar "mínimo 2h (exigência da SEFAZ)". Diagnose via: `SELECT sync_intervalo_horas
FROM company_nfe_config WHERE company_id=X`.

## Importação alternativa via XML
Para histórico 2018-2026: botão "Importar XML" na aba NF-e Recebidas aceita nfeProc/NFe XML.
Endpoint `sefaz.importXml`; `listNFeRecebidas` filtra `IN ('sefaz_nfe', 'xml_upload')`.
