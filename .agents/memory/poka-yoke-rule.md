---
name: Poka-Yoke em toda revisão
description: Regra de ouro do usuário (25/07/2026) — aplicar mistake-proofing em toda nova revisão/feature.
---

O usuário (Felipe) exige que TODA revisão/feature nova aplique Poka-Yoke, preferindo o nível mais forte viável:
1. Prevenção pelo design (máscara R$, select em vez de texto livre, campo que só aceita valor válido)
2. Bloqueio (validação client E server: valor > 0, data coerente, duplicidade, `disabled={isPending}` em botões de mutation)
3. Aviso (alerta visual) — só quando 1 e 2 não são viáveis.

**Why:** pedido explícito do usuário após aprender o conceito; ERP com muitos fluxos financeiros onde erro de digitação custa dinheiro.
**How to apply:** ao tocar qualquer fluxo, identificar e propor Poka-Yokes faltantes na área tocada; validações de valor/data devem existir também no servidor (Zod .positive(), guards de data), não só na UI.
