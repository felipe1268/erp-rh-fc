---
name: Databook ficha → fornecedor link
description: The non-obvious join used to resolve a databook ficha's supplier data for the PDF.
---

# Databook ficha → fornecedor data resolution

`databook_fichas.fornecedor_id` is copied from the purchase order, so it references **`fornecedores.id`** (Compras master), NOT `empresas_terceiras.id`. The rich address/contact data the user edits in "Editar Empresa Terceira" lives in `empresas_terceiras`, which links to the master via its own `fornecedor_id` column.

**Why:** a long-standing bug matched `empresas_terceiras.id = ficha.fornecedor_id`, almost never found the row, and the PDF's DADOS CONTRATUAIS came out half-empty.

**How to apply:** load BOTH `empresas_terceiras WHERE fornecedor_id = ficha.fornecedor_id` (tenant + not-deleted) AND `fornecedores WHERE id = ficha.fornecedor_id`, then merge first-non-empty (empresas_terceiras first, fornecedores fallback). The two tables use different column names for the same concepts, so map them when merging.
