---
name: QR restrição operacional — saída canônica
description: Como a rota pública do QR de aptidão expõe restrição de atividade sem vazar dado de saúde (LGPD)
---

**Regra:** a rota pública `portalExterno.verificar.funcionario` NUNCA devolve texto livre de `asos.restricoes`. Ela devolve `restricoesOperacionais`: frases FIXAS de um dicionário canônico (ex.: "Trabalho em altura: NÃO permitido"), disparadas quando uma linha do texto (a) tem cara de instrução ("não pode…", "proibido…", "evitar…") e (b) cita atividade conhecida (altura, espaço confinado, peso, ruído, máquinas, veículos…). `aptoAltura` negativo adiciona a frase de altura deterministicamente.

**Why:** restrição do ASO é dado de saúde (art. 11 LGPD, sensível) e o texto real do banco é recomendação médica ("picos pressóricos", "acuidade visual"). Blacklist sobre texto livre foi reprovada em code review — "não pode X devido a [doença não listada]" vazaria. Saída canônica torna o vazamento impossível por construção.

**Fonte estruturada:** o RH marca checkboxes no formulário de ASO (Controle de Documentos) → coluna `asos."restricoesOperacionais"` (JSON array de keys de `shared/restricoesOperacionais.ts`, sanitizada server-side deny-by-default). O QR dá prioridade a essa fonte; a detecção por texto é fallback.

**How to apply:** qualquer nova superfície pública que queira mostrar restrição deve reusar o dicionário canônico (nunca pass-through do texto). Se nada casar, mantém só a flag genérica `restricaoAtividade` (banner "RESTRIÇÃO DE ATIVIDADE"). Para o detalhe completo, exigir usuário autenticado com permissão.
