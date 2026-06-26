---
name: Caixa Interno — import de planilha (Caixinha) e gotchas
description: Onde vivem os lançamentos do Caixa Interno, como deduplicar ao importar planilha, e a obra UTC duplicada.
---

# Caixa Interno (FC Engenharia)

- **Não há endpoint de importação em massa** para Caixa Interno; lançamentos são `financial_entries`
  com `conta_bancaria_id` apontando p/ uma conta `company_bank_accounts.caixaInterno=1`.
- Só existe **UMA** conta caixa interno: **id=22, companyId=60002 ("CAIXA INTERNO - ADM")**.
- Importação de planilha (ex.: "Caixinha_janeiro") é feita via INSERT direto (script pg no
  `NEON_DATABASE_URL`). Tag os inserts com `origem_modulo='importacao_excel'` +
  `origem_descricao` único (ex.: `IMP_CAIXA_PLANILHA_2026-01`) p/ rastrear/reverter.

## Dedup ao reimportar
**Regra:** uma linha da planilha já existe se houver `financial_entries` na conta 22 (status<>cancelado)
com a MESMA `data_competencia` e o MESMO `abs(valor_previsto)`. Inserir só as que faltam.
**Why:** o usuário reenvia a mesma planilha atualizada; reimportar tudo duplica.
**Cuidado:** divergências de VALOR (ex.: BRAVO LOCAÇÕES gravado 1168 vs planilha 1948) ou de DATA
(Movimentação Interna gravada 01/01 vs planilha 30/01) fazem o match por data+valor falhar →
não re-inserir cegamente; sinalizar a divergência ao usuário.

## Gotcha: obra "UTC - UNIDADE DE COMPOSTAGEM" duplicada
Existem DUAS obras com esse nome em company 60002: **id=60004 (sem uso)** e **id=120001 (canônica,
com lançamentos)**. Lookup de obra por NOME é ambíguo aqui — prefira a que tem atividade (120001).
