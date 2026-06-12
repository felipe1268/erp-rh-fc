---
name: Raio-X — fontes de avaliação de desempenho
description: As duas avaliações distintas no Raio-X do Funcionário e como cruzar a avaliação do cliente
---

# Avaliação INTERNA vs avaliação do CLIENTE no Raio-X

No Raio-X do Funcionário existem DUAS avaliações de desempenho de fontes/modelos diferentes:

- **Interna**: vem de `trpc.avaliacao.avaliacoes.getByEmployee` (router `avaliacaoFuncionarios`),
  modelo de PILARES (`mediaPilar1/2/3`, critérios, `recomendacao`). NÃO é a tabela `avaliacoes`
  (que tem `notaFinal` numeric — modelo mais simples e separado). Ao surfacar avaliação interna no
  Raio-X, reutilize `avaliacoesList` (já carregado), não a tabela `avaliacoes`.
- **Cliente**: tabela `clienteAvaliacoes` (Portal do Cliente, anônima, notas 0-10:
  geral/gestor/equipe/prazo/qualidade). `canceladaEm IS NULL` = válida.

**Cruzar avaliação do cliente a um colaborador (gestor):**
- Obras geridas = `obras.responsavelId == employeeId` **OU** `ilike(obras.responsavel, nomeCompleto)`.
  **Por quê o OU:** o form de Obra só grava `responsavel_id` quando o usuário CLICA num item da
  lista de sugestões; se digita o nome direto, `responsavel_id` fica NULL e só a coluna-texto
  `obras.responsavel` guarda o nome. Cruzar SÓ por `responsavelId` zera "Obras Geridas" / mostra
  "Não é gestor" para essas obras (sintoma clássico: aval. cliente aparece — pq já tinha fallback
  por nome — mas obras geridas dá 0). NÃO há FK de gestor em `clienteAvaliacoes`.
- Match aval. cliente = `obraId ∈ obrasGeridas` **OU** `ilike(gestorNome, nomeCompleto)` —
  `gestorNome` é um SNAPSHOT textual gravado no momento da avaliação. Use ilike SEM wildcard
  (igualdade case-insensitive) para não agregar homônimos por match parcial. Trade-off conhecido:
  homônimos na MESMA company podem dar falso positivo (aceito; mesmo risco dos dois cruzamentos).

**Why:** o pedido "avaliação interna + avaliação do cliente" parece uma coisa só, mas são tabelas e
routers distintos; confundir leva a duplicar a interna ou ler a tabela errada (`avaliacoes` vazia).

**How to apply:** qualquer indicador de desempenho do colaborador deve montar o bloco no proc
`docs.raioX` (`server/routers/controleDocumentos.ts`), após o guard LGPD `userCanAccessEmployeeDossier`
e escopado por `emp.companyId`.
