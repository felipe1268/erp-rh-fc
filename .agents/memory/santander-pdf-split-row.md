---
name: Santander PDF Consolidado — armadilhas do parser
description: Extrato Consolidado Inteligente (pdf-parse) — linhas divididas, mescla pós-valor, validação contra o Resumo
---

Layout (pdf-parse): cada transação = linha(s) de descrição SEM valor + linha de valor separada ("1.648,78-" = débito, trailing "-"). Data DD/MM só na 1ª transação do dia (carry-forward). Doc de 6 dígitos concatenado ou em linha própria.

Armadilhas:
1. **Linha de texto DEPOIS do valor de uma transação completa é quase sempre transação NOVA** cuja descrição não começa com verbo canônico ("CONTA DE AGUA...", "PRESTACAO CONSORCIO..."). Tratar como continuação mescla as descrições e DESCARTA o valor da segunda (vira "saldo órfão"). Continuações reais pós-valor: só PERIODO/dd-mm-aaaa/MOTIVO/REF/DEVOLUÇÃO (CONTINUATION_RE em santanderPdfParser.ts).
2. **Valide sempre contra o Resumo do próprio PDF** ("(+)Total de Créditos"/"(-)Total de Débitos") — o parser devolve `avisoTotais` e a UI mostra toast; qualquer mudança no parser deve manter essa checagem.

**Why:** a mescla silenciosa deixou 3 débitos (R$ 13.256,37) fora do extrato do hotel jan/2026 e ninguém percebeu por meses.

**How to apply:** ao mexer em santanderPdfParser.ts, rodar contra um PDF real e conferir soma de créditos/débitos == Resumo antes de aceitar.
