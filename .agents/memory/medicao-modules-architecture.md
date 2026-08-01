---
name: Medição modules — cliente vs terceiros architecture
description: How the two measurement modules map to different contract tables and why medicao_campo needs an origem discriminator
---

# Medição: dois mundos com tabelas de contrato DIFERENTES

- **Medição de CLIENTE (a receber)** = router `server/routers/medicao.ts`, tabela `medicaoContratos`
  (`medicao_contratos`) ligada a `planejamentoProjetos` (nome/cliente/local/orcamentoId/obraId).
  Tem `criterio` (avanco_fisico), `percentualSinal`, `valorSinalRecebido`, `percentualRetencao`,
  `valorMinimoFd`. A engine de levantamento em PDF (`medicao_campo` + `_pdfs/_contornos/_fotos`,
  Rev. 2893) NASCEU acoplada a ESTE lado: `medicao_campo.contrato_id` → `medicaoContratos.id`,
  e `medicao_fd_registros.contrato_id` → `medicaoContratos.id`.

- **Medição de TERCEIROS (a pagar)** = router `server/routers/terceiroContratos.ts`,
  tabelas `terceiroContratos`/`terceiro_contratos` + `terceiroMedicoes`/`terceiro_medicoes`
  + `terceiroMedicaoItens`. `gerarMedicao` usa o avanço físico de `planejamento_avancos`.

**Why this matters / armadilha:** os IDs de `medicao_contratos` e `terceiro_contratos` são
sequências independentes que COLIDEM (contrato cliente id=5 e terceiro id=5 coexistem). Se a
engine de levantamento passar a servir terceiros usando só `contrato_id`, listar "levantamentos
do contrato terceiro 5" também traria os do contrato cliente 5.

**How to apply:** ao compartilhar a engine, `medicao_campo` precisa de um discriminador
`origem` ('cliente' | 'terceiro'); rows legadas defaultam 'cliente' (todas eram cliente).
Para vincular um levantamento a UMA medição de terceiro específica use `medicao_campo.medicao_id`
→ `terceiro_medicoes.id` (coluna adicionada junto). A engine (`MedicaoLevantamento.tsx`) sabe a
origem pela ROTA e chama o `getContrato` da fonte certa; não confie só no `contrato_id`.

## Sync offline (sincronizarLote) valida contrato nos DOIS módulos
O guard raiz do `sincronizarLote` deve aceitar contratoId de `medicao_contratos` OU `terceiro_contratos` (IDs colidem). Só validar um lado fez TODA sync de levantamento de terceiros falhar com "Contrato não encontrado" — pendências eternas, servidor sem NENHUM contorno, e cada aparelho com dados divergentes (deletes locais não propagavam = "fantasmas").
**How to apply:** qualquer endpoint novo da engine compartilhada que receba contratoId precisa resolver o módulo (cliente × terceiro) e casar com `medicao_campo.origem`.
