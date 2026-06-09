---
name: EPI calça size letter is derived, not stored
description: Pants (calça) sizes were converted letter→number in DB; the letter is lost and must be derived from the number on screen.
---

A conversão de tamanho das CALÇAS de letra (P/M/G…) → número é **destrutiva**: roda como UPDATE no startup (`server/_core/index.ts`, `[SyncSchema+]`) sobre `epis` onde `categoria='Uniforme'` + `nome ILIKE '%calç%'`. A letra original **NÃO** fica salva — `epis.tamanho` passa a ser só o número.

**Por quê:** a aba "Necessidade" cruza calça pelo `tamanhoCalca` NUMÉRICO do funcionário, então o estoque precisava virar número para casar.

**Como aplicar:** para exibir os dois formatos juntos ("38 (M)"), derive a letra do número com o mapa canônico em `client/src/lib/epiTamanho.ts` (`labelTamanhoEpi`/`labelTamanhoCalca`), que ESPELHA o mapa do server. Colisão XGG/EXG→50: na volta usa-se **XGG** (canônico). Números sem letra equivalente (40, 44) ficam só com o número. Nunca tente "recuperar" a letra original do banco — ela não existe mais. Mantenha o helper do cliente em sincronia com o mapa do server se ele mudar.
