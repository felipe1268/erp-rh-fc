---
name: ASO sem botão "olho" (documentoUrl vazio)
description: Por que o botão de visualizar ASO some e onde o PDF costuma estar mal-arquivado
---

O botão "olho" da aba ASO em `ControleDocumentos.tsx` só renderiza quando `asos.documentoUrl` está preenchido. Quando some, NÃO é bug de render — é o registro de ASO sem arquivo anexado.

**Onde o PDF costuma estar:** o usuário às vezes escaneia o ASO e envia pela aba **"Documentos"** geral do funcionário (`employee_documents`, normalmente `tipo='outros'`) em vez de usar o botão "Anexar PDF" do próprio ASO. Aí o arquivo existe no sistema, mas não está vinculado ao registro de ASO.

**Como resolver (após confirmar com o usuário qual arquivo é):** `UPDATE asos SET "documentoUrl" = <employee_documents.fileUrl>` no(s) registro(s) do funcionário. Cuidado: ASOs costumam ter **duplicatas** (mesmo exame, ids diferentes); grave em todos os registros sem doc do funcionário pra o olho aparecer na linha "atual" e na "histórico".

**Why:** envolve um registro médico — nunca chutar qual PDF é o ASO; confirmar com o usuário antes do UPDATE.

**How to apply:** caso de suporte "fulano não tem ASO pra visualizar, beltrano tem" → checar `documentoUrl` dos `asos` (camelCase quoted) via Neon, depois `employee_documents` do mesmo `employeeId`.
