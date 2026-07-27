---
name: Rescisão — tipos especiais (justa causa, indireta, acordo)
description: Regras de verbas e branches de código dos tipos justa_causa, rescisao_indireta e acordo_mutuo no Aviso Prévio
---

Além dos 4 tipos clássicos (`empregador_*`/`empregado_*`), existem 3 tipos especiais (Rev. 4686):

- **justa_causa** (Art. 482): SEM aviso (0 dias, saída imediata, status nasce `aguardando_pagamento`); verbas SÓ saldo + férias VENCIDAS + 1/3 (+banco de horas); zera férias proporcionais e 13º; sem multa; etapa FGTS da baixa não se aplica.
- **rescisao_indireta** (Art. 483): idêntica a `empregador_indenizado` (aviso cheio 30+3/ano, multa 40%), mas NÃO contém "empregador" na string.
- **acordo_mutuo** (Art. 484-A): aviso indenizado PELA METADE, multa FGTS 20%, demais verbas integrais.

**Why:** predicados espalhados usam `tipo.includes('empregador')`/`startsWith('empregador')` para multa/custo/FGTS-real — rescisao_indireta e acordo_mutuo NÃO casam com eles e precisam de OR explícito; e checagens de "saída imediata" usavam só `empregado_indenizado` — justa_causa precisa entrar em TODAS (calcular preview, update recalcular, recalcularTodos, criarAvisoPrevioInterno).

**How to apply:** ao criar qualquer novo branch por tipo de rescisão (cálculo, dashboard, baixa, PDF), tratar explicitamente os 3 tipos especiais; nunca confiar só em includes/startsWith de 'empregador'. `motivoLegal`/`motivoDescricao` são obrigatórios (server-side) p/ justa_causa e rescisao_indireta. CIPA estável: server bloqueia `empregador_*` (Súmula 379 TST), justa causa liberada. Motores paralelos que precisam espelhar: `calcularRescisaoCompleta`, `calcularRescisaoComplementar` e `calcularRescisaoCompletaDash` (dashboards).
