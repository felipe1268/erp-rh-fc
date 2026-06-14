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

## Duas fontes de itens vinculáveis (Cliente/obra vs Terceiros)
A MESMA tela de Levantamento (`MedicaoLevantamento.tsx`) abre em 2 origens. Os
itens que alimentam o combobox de vínculo + a consolidação em R$ vêm de fontes
DIFERENTES: Cliente/obra → `medicao.getItensOrcamento({orcamentoId})`; Terceiros →
`terceiroContratos.listarItens({contratoId})` (itens em `terceiro_contrato_itens`),
pois contrato de terceiro NÃO tem orçamento de obra (`orcamentoId` 0/null).

**Why:** assumir só a fonte de orçamento deixava o combobox vazio com a dica errada
"sem orçamento vinculado" em medições de terceiro. O hook `useLevantamentoOffline`
aceita `itensOverride` (undefined=query orçamento; null=carregando; array=resolvido)
p/ a tela injetar a fonte certa sem duplicar a engine offline.

**How to apply:** qualquer item passado como override deve ter `vendaUnitTotal`
(consolidação usa essa chave) e `eapCodigo` (item de terceiro é folha → passa no
`buildItensVinculaveis`). `contornos.orcamentoItemId` é integer SEM FK e guarda
`itemEapCodigo`/`itemDescricao` denormalizados → salvar id de terceiro ali é seguro.
