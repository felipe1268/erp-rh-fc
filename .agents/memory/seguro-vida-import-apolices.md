---
name: Seguro de Vida — importação de apólices e alerta consolidado
description: Convenções da tabela seguro_vida_coberturas e do job de e-mail consolidado
---

- Valores em `seguro_vida_coberturas` são TEXT em formato BR ("28.290,38"; prêmio "12,37176"); `item_segurador` sem zeros à esquerda ("46", não "00000000046").
- Status válidos: ativo | pendente_inclusao | pendente_cancelamento | cancelado. "Desligado ainda pago na apólice" = `pendente_cancelamento` (chip já existe na tela).
- Funcionário readmitido: cancelar a cobertura do cadastro antigo (Desligado) e criar nova no recadastro — nunca duas ativas para o mesmo CPF.
- Apólices podem cruzar empresas (ex.: apólice CF Hotelaria com funcionário cadastrado na FC): lançar no cadastro real do funcionário com observação da apólice de origem (decisão do user 08/08/2026).
- Job `seguroVidaAlertJobs` (08:00 BRT): e-mail consolidado por empresa via `notification_recipients."notificarSeguroVida"`; dedup = claim atômico pré-envio em `seguro_vida_alertas_enviados` (company_id, checksum de estado renderizado).

**Why:** importações de relatório do corretor recorrem mensalmente; formatos errados quebram os totais da tela (parse BR-aware).
