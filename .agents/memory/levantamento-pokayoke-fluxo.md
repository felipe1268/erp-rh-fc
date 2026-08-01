---
name: Levantamento de Campo — fluxo poka-yoke
description: Decisões de produto do Felipe para a tela de levantamento (DXF-only, categoria manda, foto por trecho)
---

Decisões confirmadas pelo usuário (metodologia poka-yoke, Revs. 4781–4783):

1. **Planta nova = SÓ DXF.** PDF novo é bloqueado no upload (era a maior fonte de erro de escala); PDFs legados continuam abrindo com o fluxo de escala nominal 1:N + conferência obrigatória de cota (±2%) que bloqueia o desenho até validar (`Calibracao.fonte/conferida`; legado sem `fonte` não bloqueia).
2. **Categoria comanda a ferramenta.** Não existe "Sem serviço" nem fileira de ferramentas: `tipoMedida` da categoria define o tool; tipo área mostra só Pontos/Retângulo/Livre. `finalizarContorno` bloqueia sem categoria válida — todo contorno nasce classificado (base da produtividade por período/equipe).
3. **"+ Categoria" rápido na paleta** (nome + o-que-mede, cor automática, chave slug única) e **"Foto do trecho"** fotografa vinculado ao último contorno da página (book de evidências).

**Why:** o objetivo declarado é medir produtividade exata por mês/equipe/fornecedor comparando medições sucessivas; velocidade e impossibilidade de erro valem mais que flexibilidade.
**How to apply:** qualquer mudança nessa tela deve preservar: classificação obrigatória, DXF-first, e zero passos de escala quando o DXF tem unidade.
