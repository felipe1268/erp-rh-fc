---
name: cheques.criarManual explicit-id IDOR
description: manual single-row insert endpoints that accept explicit FK ids must validate ownership
---

Endpoints that INSERT a single row and accept explicit foreign-key ids (e.g. `fornecedorId`, `contaBancariaId`) must validate those ids belong to the request's `companyId` BEFORE persisting them — even when the current UI only sends names.

**Why:** an `assertCompanyAccess(companyId)` guard authorizes the COMPANY but not the referenced resources; a forged API call can attach another tenant's fornecedor/conta id. The import path was safe because it only matched by name within the company's loaded lists; the manual path added explicit-id inputs that bypassed that.

**How to apply:** reuse the per-company loaders (`carregarFornecedores`/`carregarContas`) you already need for name matching, and reject (`FORBIDDEN`) any explicit id not in those lists. Same pattern applies to any new "criarManual"-style writer with explicit FK inputs.
