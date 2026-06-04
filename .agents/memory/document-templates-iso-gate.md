---
name: Central de Documentos ISO — gate de aprovação
description: Regra de vigência/aprovação dos templates de documentos institucionais e como os geradores os consomem.
---

A aba "Templates de Documentos" (Configurações) é a fonte oficial ISO dos documentos institucionais FC.

**Regra:** o consumo pelos módulos só entrega conteúdo de um template com status `vigente`. Toda mudança de CONTEÚDO rebaixa o template para `rascunho` e LIMPA a aprovação — a revisão editada só volta a circular após ser aprovada de novo.

**Why:** sem o rebaixamento, editar um documento já vigente publicaria texto institucional novo sem aprovação formal, furando o fluxo ISO rascunho→vigente→obsoleto.

**How to apply:**
- TODO caminho de escrita de conteúdo deve manter o gate (rebaixar p/ rascunho + limpar aprovação). Lembrar que RESTAURAR uma versão antiga também é escrita de conteúdo — também precisa rebaixar, senão restaurar num doc vigente republica conteúdo histórico sem aprovação.
- Geradores consomem o vigente com FALLBACK ao HTML inline quando não houver vigente.
- Os dados passados ao render devem cobrir TODOS os placeholders do seed; se faltar algum, o documento gerado perde conteúdo material vs o HTML antigo.
- Garantir que os 7 tipos existam sem ação manual: auto-seed quando a tabela está vazia (idempotente) além do botão manual de inicializar padrões — usuário nunca deve cair em "Não criado".

**Soft-delete (excluir):** a remoção é soft-delete via `deleted_at` (nunca DELETE físico — R-001). TODA leitura/ação deve filtrar `deleted_at IS NULL` (listAll/get/listVersions/getVigente + aprovar/marcarObsoleto/voltarParaRascunho/restoreVersion). Re-salvar revive (limpa `deleted_at`) — inclusive no path no-op de conteúdo, então o SELECT FOR UPDATE do save precisa trazer `deleted_at`. O `tipo` é único: reviver um FIXO excluído (seedDefaults) é UPDATE, nunca INSERT (senão viola o uniq). Custom excluído não tem lixeira na UI mas o slug fica reservado (criarNovo conta TODOS os slugs, incl. deletados).
