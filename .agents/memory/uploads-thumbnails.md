---
name: Miniaturas de /uploads (?w=NN)
description: Fotos de cadastro são originais de câmera; listas com muitos avatares precisam usar a rota de miniatura ou o Safari/iPad quebra as imagens.
---

**Regra:** qualquer imagem servida por `/uploads/...` aceita `?w=NN` (32–512) → miniatura webp (sharp, rotate+cover, q78) com cache em `uploads/.thumbs/<w>/<key>.webp`. Fonte: disco → fallback `uploaded_files`; qualquer erro cai no original.

**Why:** fotos de cadastro (employees.fotoUrl, funcionarios_terceiros.foto_url) são originais de câmera — média ~865KB, até 5.7MB. Grades com dezenas de avatares (~70MB de imagens) fazem o Safari/iPad desistir no meio e renderizar o ícone azul de imagem quebrada ("?") — o servidor responde 200 normal, então o sintoma engana (parece dado faltando).

**How to apply:** toda LISTA/grade com avatares deve usar `foto.startsWith("/uploads/") ? `${foto}?w=128` : foto` + `loading="lazy"`. O crachá/impressão continua usando o original (qualidade). Ícone "?" azul no Safari = imagem QUEBRADA (não placeholder do app) — investigue tamanho/volume antes de suspeitar dos dados.
