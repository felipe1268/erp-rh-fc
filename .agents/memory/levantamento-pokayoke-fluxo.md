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

## Mídia do levantamento (Rev. 4823-4825)
- Consolidar SÓ com ciclo completo: todo contorno vivo precisa de ≥1 foto/vídeo (medicao_campo_fotos por contornoId) E apropriação (orcamentoItemId do contorno OU do serviço). Gate no client (UX) e no server consolidarLevantamento (verdade).
- Mídia aceita foto E vídeo; captura obrigatória NA HORA: input com `capture="environment"` (sem galeria) + recusa de arquivo com lastModified >5 min + GPS/data-hora gravados (gps_lat/lng/precisao, capturado_em) via uploadFoto e sincronizarLote.
- Numeração de contorno é SEQUENCIAL por categoria ao longo do CONTRATO (baseContrato = max nas outras medições, mesma origem, não-biblioteca) — nos DOIS caminhos de create (salvarContorno E sincronizarLote) + renumerar client com offset.
- Sync de lote: fatiar também por TAMANHO (~90M chars base64) — server rejeita lote >150M.
- GPS na foto foi REMOVIDO a pedido do Felipe (Rev. 4826) — geolocation travava no iPad (prompt pendente nunca chama callback). NÃO reintroduzir sem pedir. Colunas gps_* continuam no schema (vazias); carimbo capturado_em segue gravado.
