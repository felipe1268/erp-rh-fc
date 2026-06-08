---
name: Levantamento de Campo em PDF (Medição)
description: Guardas anti-IDOR e convenções do módulo de levantamento de campo sobre PDF (medicao_campo*).
---

# Levantamento de Campo em PDF (módulo Medição)

Módulo que mede área/volume/perímetro/contagem sobre o PDF da planta e consolida
por item do orçamento em R$ → boletim. Tabelas: `medicao_campo` / `_pdfs` /
`_contornos` / `_fotos` (todas com `companyId`, `uuid` client-stable p/ PWA futura,
`deletedAt` soft-delete). Geometria pura em `shared/levantamentoGeo.ts`.

## Regra: tenant guard relacional (anti-IDOR)
Validar só o `companyId` da tabela-pai NÃO basta. Toda leitura/escrita das tabelas
filhas (pdfs/contornos/fotos) deve filtrar `companyId` explicitamente, mesmo já
tendo validado o campo-pai. E `gerarBoletimDoCampo` deve validar que o `contratoId`
de entrada pertence à empresa E é o MESMO `campo.contratoId` (senão dá pra emitir
boletim em contrato arbitrário).

**Why:** revisão (architect) da Rev. 2893 apontou IDOR: subconsultas de getCampo/
getConsolidadoCampo/gerarBoletimDoCampo buscavam contornos só por medicaoCampoId, e
o boletim aceitava contratoId arbitrário.
**How to apply:** ao adicionar procedure nova nesse módulo, sempre `and(eq(tabela.medicaoCampoId, id), eq(tabela.companyId, companyId), isNull(deletedAt))` nas filhas; em writes que cruzam contrato/orçamento, revalidar pertencimento.

## Convenção client↔geometria
Pontos dos contornos são gravados normalizados [0..1] (independem do zoom/render).
No client (`MedicaoLevantamento.tsx`) converte-se para pontos-PDF via `pageDims`
(do onLoadSuccess do react-pdf) ANTES de chamar `calcularContorno`. Calibração
(2 pontos → m/ponto) é obrigatória antes de medir. `bindItem` NÃO pode resetar
`pagina` (schema salvarContorno tem `.default(1)`): passar `pagina: c.pagina ?? pagina`.
