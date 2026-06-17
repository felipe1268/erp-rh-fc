---
name: Server-side fetch of client-stored URL = SSRF
description: Reler/baixar anexo a partir de uma URL gravada pelo cliente não pode usar fetch genérico
---

Quando um endpoint grava uma URL fornecida pelo cliente (ex.: `financial_entries.comprovante_url` via `anexarComprovanteEntry`) e DEPOIS um job/endpoint baixa esse recurso server-side para processar (ex.: reler comprovante por IA), um `fetch(url)` genérico abre SSRF: o usuário autenticado aponta para serviço interno / metadata.

**Regra:** baixar SÓ anexos internos. Resolver `/uploads/<key>` via `dbRetrieve(key)` (uploaded_files) e retornar `null` para qualquer URL não-interna — NUNCA `fetch` de host arbitrário.

**Why:** comprovante_url é gravável pelo cliente; o caminho de releitura (`relerComprovantesPendentes` → `_baixarComprovante`) torna a URL alcançável server-side.

**How to apply:** ao tocar qualquer helper que baixe bytes a partir de uma coluna *_url gravada pelo cliente, confirme allowlist interna. E sanitize o write path: campos extraídos enviados pelo cliente (`extraido`) devem passar pela MESMA sanitização da saída da IA (`_sanitizeComprovante`), não confiar no payload.
