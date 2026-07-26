---
name: Neon template republish — aborted tx prints fake success
description: Publishing system_document_templates via ad-hoc pg script — a failed audit INSERT inside BEGIN aborts the tx; COMMIT silently rolls back but the earlier RETURNING already printed the "new" version.
---
Rule: em scripts pg ad-hoc, um erro em QUALQUER statement dentro de BEGIN aborta a transação; o RETURNING do UPDATE anterior já foi impresso e parece sucesso, mas o COMMIT vira ROLLBACK.

**Why:** Rev. 4604 — o UPDATE do template id 8 "retornou" versão 15, mas o INSERT de auditoria usou coluna errada (`criado_em` vs `created_at`) e derrubou a transação inteira; o template ficou na versão antiga sem nenhum erro visível.

**How to apply:** ao republicar templates (system_document_templates + system_document_template_versions), SEMPRE re-verificar o estado com um SELECT novo após o commit (ex.: `conteudo_html LIKE '%trecho novo%'`), e escrever o script idempotente (checa se já aplicado antes de aplicar). Colunas da tabela de versões: template_id, versao, conteudo_html, comentario, criado_por_id, criado_por_nome, created_at.
