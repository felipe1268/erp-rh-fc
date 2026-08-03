---
name: PDFKit footer stamping cria páginas em branco
description: Carimbar rodapé (rubricas) em bufferedPageRange abaixo da margem inferior faz o PDFKit criar páginas vazias automaticamente
---

Regra: ao carimbar rodapés em `bufferedPageRange()` (rubricas, numeração), qualquer `doc.text()` com y abaixo de `page.height - margins.bottom` dispara **addPage automático** do PDFKit — cada carimbo gera uma página em branco extra (só com o carimbo no topo).

**Why:** boletim de medição saía com 6 páginas em branco (3 rubricas × 2 páginas); usuário via "relatório vazio".

**How to apply:** dentro do loop de páginas, salvar `doc.page.margins.bottom`, zerar antes de escrever o rodapé e restaurar depois (idealmente try/finally). `lineBreak:false` NÃO evita o addPage.
