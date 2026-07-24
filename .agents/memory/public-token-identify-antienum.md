---
name: Fluxo público de identificação (token + CPF/nascimento)
description: Padrão anti-enumeração e sanitização p/ links públicos e PDFs server-side
---
Regra: todo endpoint público que identifica pessoa por CPF+dado pessoal deve (1) devolver UMA mensagem genérica para qualquer falha (CPF inexistente, inativo, data errada, fora da lista) e (2) rate-limitar por token+IP.
**Why:** mensagens específicas permitem enumerar CPFs e sondar status de RH só com posse do link (achado de code review na feature de ciência de comunicados).
**How to apply:** wrapper `identificarComRateLimit` em comunicadosCiencia.ts é o modelo; replicar em novos fluxos públicos (portal, coleta, votação).

Regra 2: HTML de usuário renderizado em Puppeteer no SERVIDOR deve passar por DOMPurify server-side (dompurify+jsdom, allowlist igual à do RichTextEditor) + `setJavaScriptEnabled(false)` + request interception bloqueando tudo exceto `data:`.
**Why:** conteúdo ativo rodaria em contexto privilegiado (SSRF/rede interna).
**How to apply:** ver sanitizeServerHtml em comunicadoPdf.ts; usar em qualquer nova rota Puppeteer que renderize conteúdo editável.
