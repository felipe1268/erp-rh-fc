#!/usr/bin/env python3
"""Import all missing CSV data into Neon DB tables."""

import csv
import os
import sys
import glob
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime

DB_URL = os.environ.get('NEON_DATABASE_URL') or os.environ.get('DATABASE_URL')
if not DB_URL:
    print("ERROR: No DB URL found")
    sys.exit(1)

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()
print("Connected to Neon DB")

def find_csv(table_name):
    pattern = f"attached_assets/{table_name}_*.csv"
    files = glob.glob(pattern)
    return files[0] if files else None

def safe_val(v):
    """Convert empty string to None."""
    if v == '' or v is None:
        return None
    return v

def parse_ts(v):
    """Parse timestamps, return None if empty or invalid."""
    if not v or v.strip() == '':
        return None
    v = v.strip()
    # Handle various formats
    for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d/%m/%Y']:
        try:
            return datetime.strptime(v, fmt).isoformat()
        except:
            pass
    return None

def import_csv_generic(table, csv_file, col_map=None, skip_cols=None, fixed_vals=None, where_filter=None):
    """Generic CSV importer with column mapping support."""
    skip_cols = skip_cols or []
    fixed_vals = fixed_vals or {}
    
    with open(csv_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    if not rows:
        print(f"  {table}: CSV empty, skipping")
        return 0
    
    # Apply where filter
    if where_filter:
        rows = [r for r in rows if where_filter(r)]
    
    if not rows:
        print(f"  {table}: No rows after filter, skipping")
        return 0

    # Build column mapping: csv_col -> db_col
    # col_map: {csv_col: db_col} for renames
    # skip_cols: csv columns to skip entirely
    
    sample = rows[0]
    csv_cols = list(sample.keys())
    
    # Get Neon table columns
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=%s AND table_schema='public' ORDER BY ordinal_position", (table,))
    neon_cols = set(r[0] for r in cur.fetchall())
    
    # Build insert columns
    insert_cols = []
    csv_col_order = []
    
    for csv_col in csv_cols:
        if csv_col in skip_cols:
            continue
        db_col = col_map.get(csv_col, csv_col) if col_map else csv_col
        if db_col in neon_cols:
            insert_cols.append(db_col)
            csv_col_order.append(csv_col)
    
    # Add fixed vals
    for db_col, val in fixed_vals.items():
        if db_col in neon_cols and db_col not in insert_cols:
            insert_cols.append(db_col)
            csv_col_order.append(f'__fixed__{db_col}')
    
    if not insert_cols:
        print(f"  {table}: No columns to insert")
        return 0
    
    data = []
    for row in rows:
        vals = []
        for i, csv_col in enumerate(csv_col_order):
            if csv_col.startswith('__fixed__'):
                key = csv_col.replace('__fixed__', '')
                vals.append(fixed_vals[key])
            else:
                vals.append(safe_val(row.get(csv_col)))
        data.append(tuple(vals))
    
    cols_str = ', '.join(f'"{c}"' for c in insert_cols)
    sql = f'INSERT INTO {table} ({cols_str}) VALUES %s ON CONFLICT DO NOTHING'
    
    try:
        execute_values(cur, sql, data)
        conn.commit()
        print(f"  {table}: Inserted {len(data)} rows")
        return len(data)
    except Exception as e:
        conn.rollback()
        print(f"  {table}: ERROR - {e}")
        return 0


# ============================================================
# 1. empresas_terceiras
# ============================================================
print("\n[1] empresas_terceiras")
f = find_csv('empresas_terceiras')
if f:
    import_csv_generic(
        'empresas_terceiras', f,
        col_map={
            'company_id': 'companyId',
            'tipo_conta': 'tipoConta',
            'forma_pagamento': 'formaPagamento',
            'pix_tipo_chave': 'pixTipoChave',
            'status_terceira': 'status',
        },
        skip_cols=['login_token', 'login_email', 'login_senha_hash'],
    )

# ============================================================
# 2. funcionarios_terceiros
# ============================================================
print("\n[2] funcionarios_terceiros")
f = find_csv('funcionarios_terceiros')
if f:
    import_csv_generic(
        'funcionarios_terceiros', f,
        col_map={
            'empresa_terceira_id': 'empresaTerceiraId',
            'company_id': 'companyId',
            'obra_id': 'obraId',
            'status_aptidao_terceiro': 'statusAptidao',
            'status_func_terceiro': 'status',
        },
    )

# ============================================================
# 3. obrigacoes_mensais_terceiros
# ============================================================
print("\n[3] obrigacoes_mensais_terceiros")
f = find_csv('obrigacoes_mensais_terceiros')
if f:
    import_csv_generic(
        'obrigacoes_mensais_terceiros', f,
        col_map={
            'empresa_terceira_id': 'empresaTerceiraId',
            'company_id': 'companyId',
            'fgts_status': 'fgtsStatus',
            'inss_status': 'inssStatus',
            'folha_pagamento_status': 'folhaPagamentoStatus',
            'comprovante_pagamento_status': 'comprovantePagamentoStatus',
            'gps_status': 'gpsStatus',
            'cnd_status': 'cndStatus',
            'status_geral_obrigacao': 'statusGeral',
        },
    )

# ============================================================
# 4. portal_credentials
# ============================================================
print("\n[4] portal_credentials")
f = find_csv('portal_credentials')
if f:
    import_csv_generic(
        'portal_credentials', f,
        col_map={
            'empresa_terceira_id': 'empresaTerceiraId',
            'parceiro_id': 'parceiroId',
            'company_id': 'companyId',
            'primeiro_acesso': 'primeiroAcesso',
        },
    )

# ============================================================
# 5. user_permissions
# ============================================================
print("\n[5] user_permissions")
f = find_csv('user_permissions')
if f:
    import_csv_generic(
        'user_permissions', f,
        col_map={
            'user_id': 'userId',
            'can_access': 'canAccess',
        },
    )

# ============================================================
# 6. epi_kits (skip wrong company IDs)
# ============================================================
print("\n[6] epi_kits")
f = find_csv('epi_kits')
if f:
    import_csv_generic(
        'epi_kits', f,
        where_filter=lambda r: r.get('companyId','') not in ('1','999',''),
    )

# ============================================================
# 7. epi_transferencias
# ============================================================
print("\n[7] epi_transferencias")
f = find_csv('epi_transferencias')
if f:
    import_csv_generic(
        'epi_transferencias', f,
        col_map={
            'tipo_origem': 'tipoOrigem',
            'origem_obra_id': 'origemObraId',
            'destino_obra_id': 'destinoObraId',
            'criado_por_user_id': 'criadoPorUserId',
        },
    )

# ============================================================
# 8. eval_criteria
# ============================================================
print("\n[8] eval_criteria")
f = find_csv('eval_criteria')
if f:
    import_csv_generic('eval_criteria', f)

# ============================================================
# Also import accidents and action_plans (might have data)
# ============================================================
print("\n[9] accidents")
f = find_csv('accidents')
if f:
    import_csv_generic('accidents', f)

print("\n[10] action_plans")
f = find_csv('action_plans')
if f:
    import_csv_generic('action_plans', f)

# ============================================================
# Check tables we might have missed: dissidios, advances, etc.
# ============================================================
print("\n[11] dissidios")
f = find_csv('dissidios')
if f:
    import_csv_generic('dissidios', f)
else:
    print("  No CSV for dissidios")

print("\n[12] advances")
f = find_csv('advances')
if f:
    import_csv_generic('advances', f)
else:
    print("  No CSV for advances")

print("\n[13] payroll (main table)")
f = find_csv('payroll')
if f:
    import_csv_generic('payroll', f)
else:
    print("  No CSV for payroll main table")

print("\n[14] ponto_descontos")
f = find_csv('ponto_descontos')
if f:
    import_csv_generic('ponto_descontos', f)
else:
    print("  No CSV for ponto_descontos")

print("\n[15] vr_benefits (check if data matches)")
cur.execute("SELECT COUNT(*) FROM vr_benefits")
cnt = cur.fetchone()[0]
print(f"  vr_benefits already has {cnt} rows")

# ============================================================
# Summary
# ============================================================
print("\n=== SUMMARY ===")
tables_to_check = [
    'empresas_terceiras','funcionarios_terceiros','obrigacoes_mensais_terceiros',
    'portal_credentials','user_permissions','epi_kits','epi_transferencias',
    'eval_criteria','accidents','action_plans'
]
for t in tables_to_check:
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    cnt = cur.fetchone()[0]
    print(f"  {t}: {cnt} rows")

cur.close()
conn.close()
print("\nDone!")
