---
name: Backup diário — streaming obrigatório (OOM)
description: Por que o backup do banco não pode acumular tabelas em memória e as armadilhas ao exportar tabelas gigantes via Neon.
---

Regra: o backup (backupService.executarBackup) DEVE ser streaming — lotes keyset por
ctid escritos direto num gzip stream em /tmp; nunca montar um objeto com todas as
tabelas.

**Why:** com heap de 1GB (--max-old-space-size=1024), acumular 500+ tabelas
(~319MB gz / >2GB raw) derrubava o servidor em produção com "heap out of memory"
(o crash aparecia no Safari como "The string did not match the expected pattern").
O último backup bem-sucedido tinha ficado meses parado sem ninguém notar.

**How to apply:**
- Lote adaptativo: alvo ~8MB por lote (25–2000 linhas) usando pg_table_size/reltuples;
  tabelas com linhas gigantes (equipamento_locado_eventos ~190KB/linha,
  system_revisions ~45KB/linha) travam o driver Neon se vierem 2000 de uma vez
  (ele parseia o lote inteiro em JSON na RAM).
- uploaded_files (5GB): NUNCA usar LENGTH(data_base64) — detoasta os 5GB no servidor
  e trava por 20+ min; usar pg_column_size (lê só o tamanho armazenado).
- reltuples <= 0 = tabela nunca analisada → sem estimativa; usar default.
- `WHERE ctid > '(x,y)'::tid ORDER BY ctid LIMIT n` usa TID Range Scan (PG14+), estável.
- Validação: processos avulsos (tsx em background) são reapados pelo ambiente (SIGHUP
  mesmo com nohup/setsid); testar jobs longos DENTRO do servidor (endpoint diag
  temporário dev-only) e acompanhar pela tabela backups.
- Tabela backups tem ids fora de ordem (linhas antigas com id explícito 120001+);
  consultar por "iniciadoEm", não ORDER BY id.
