---
name: Importação de planilha financeira (FC=60002)
description: Gotchas ao importar a planilha-mestre de pagamentos (003_DADOS_TRATADOS) para financial_entries no Neon
---

# Importar planilha de pagamentos → financial_entries (FC=60002)

Importação feita por script externo psycopg2 (fora do app) escrevendo no **Neon** (`NEON_DATABASE_URL`), espelhando as colunas/semântica do `financial.createEntry`. Lote carimbado com `origem_modulo='importacao_excel'` + `origem_descricao='IMP_PLANILHA_v2_<YYYY-MM>'` (rastreável/reversível).

## Gotchas (não-óbvios, não-derivam do código)
- **Cada aba mensal tem uma linha `TOTAL` no rodapé** (col Data = "TOTAL", col Parcela = soma do mês). Sem filtrar, o total IMPORTADO **dobra** (deu ~R$ 24,8 mi / 8.097 em vez de R$ 12,43 mi / 8.080). **Filtro:** só entra linha cuja col Data casa o regex `DD/MM/AAAA`.
- **Abas recorrentes Mai–Dez/2026 são projeção** — EXCLUÍDAS do import real (o usuário só quer o realizado Ago/2024→Abr/2026).
- **De-para fuzzy (SequenceMatcher token-aware, thr 0.62)** é caríssimo por linha (~23ms) → **memoizar por nome único** (obras/categorias) derruba o import de ~186s p/ ~10s. Usar `execute_values` (multi-linha), não `executemany` (1 round-trip/linha = timeout).
- **`nohup ... &` NÃO sobrevive entre tool calls** no ambiente Replit (o processo é morto ao retornar a tool). Rode import pesado em **foreground** dentro do cap de 2 min (após otimizar p/ ~10s).
- **Contas sem banco resolvível** ("CAIXA ECONOMICA" genérico, multi-conta com vírgula, Faturamento Direto, Pagamento Cliente) ficam com `conta_bancaria_id=NULL` e o rótulo preservado em `observacoes` — resolver na conciliação (Etapa 2).

## Para reexecuções futuras (recomendação do code review)
- DELETE pré-flight devia restringir por `origem_descricao LIKE 'IMP_PLANILHA_v2_%'` (hoje apaga todo `origem_modulo='importacao_excel'` da empresa).
- Adicionar dedupe idempotente no INSERT (anti-join por company+data+valor+tipo+fornecedor) em vez de confiar só na validação prévia.
