---
name: Central de Documentos ISO — gate de aprovação
description: Regra de vigência/aprovação dos system_document_templates e como os geradores consomem o template Vigente.
---

A aba "Templates de Documentos" (Configurações) é a fonte oficial ISO dos documentos institucionais FC.

**Regra:** `getVigente(tipo)` só entrega `conteudoHtml` quando `status === 'vigente'`. Toda mudança de CONTEÚDO no `save` REBAIXA o template para `rascunho` e LIMPA a aprovação (`aprovadoPorId/Nome/Em = null`) — a revisão editada só volta a circular após `aprovar` de novo.

**Why:** Sem o rebaixamento, editar um documento já vigente publicaria texto institucional novo sem aprovação formal (fura o fluxo ISO rascunho→vigente→obsoleto). Apontado em review do architect na criação do módulo.

**How to apply:** TODO writer de `system_document_templates.conteudoHtml` deve manter esse gate (setar `status='rascunho'` + limpar aprovação ao mudar conteúdo). Há DOIS caminhos de escrita de conteúdo: `save` E `restoreVersion` (restaurar versão antiga TAMBÉM rebaixa — senão restaurar num doc vigente publicaria conteúdo histórico sem aprovação; achado de review). Geradores (contrato de experiência em `Colaboradores.tsx`, termo em `TermoResponsabilidadeDialog.tsx`) consomem via `getVigente` + `renderTemplate(html, dados)` com FALLBACK ao HTML inline quando não houver vigente. Os placeholders dos `dados` devem cobrir TODO o seed (ex.: contrato precisa de `prazoTotal`/`dataFimFinal` além de `prazo1/prazo2/dataFim`), senão o doc gerado perde conteúdo material vs o HTML antigo.
