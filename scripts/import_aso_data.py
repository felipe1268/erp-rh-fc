#!/usr/bin/env python3
"""Parse ASO data from pasted_content.txt and generate SQL INSERT statements."""

import re
from datetime import datetime, timedelta

lines = open("/home/ubuntu/upload/pasted_content.txt", "r").readlines()

# Parse data lines (starting from line 12 which is the header, data from line 13)
records = []
for line in lines[12:]:  # Skip header and intro
    line = line.strip()
    if not line:
        continue
    parts = line.split("\t")
    if len(parts) < 2:
        continue
    
    try:
        num = int(parts[0].strip())
    except:
        continue
    
    nome = parts[1].strip() if len(parts) > 1 else ""
    tipo = parts[2].strip() if len(parts) > 2 else ""
    data_emissao = parts[3].strip() if len(parts) > 3 else ""
    validade_dias = parts[4].strip() if len(parts) > 4 else ""
    status_aso = parts[5].strip() if len(parts) > 5 else ""
    data_vencimento = parts[6].strip() if len(parts) > 6 else ""
    resultado = parts[7].strip() if len(parts) > 7 else ""
    medico = parts[8].strip() if len(parts) > 8 else ""
    crm = parts[9].strip() if len(parts) > 9 else ""
    ja_atualizou = parts[10].strip() if len(parts) > 10 else ""
    exames = parts[11].strip() if len(parts) > 11 else ""
    
    if not nome:
        continue
    
    records.append({
        "num": num,
        "nome": nome,
        "tipo": tipo,
        "dataEmissao": data_emissao,
        "validadeDias": validade_dias,
        "statusAso": status_aso,
        "dataVencimento": data_vencimento,
        "resultado": resultado,
        "medico": medico,
        "crm": crm,
        "jaAtualizou": ja_atualizou,
        "exames": exames
    })

print(f"Total records parsed: {len(records)}")
print(f"Records with data: {len([r for r in records if r['tipo']])}")
print(f"Records without data: {len([r for r in records if not r['tipo']])}")

# Generate JSON for import
import json
output = json.dumps(records, ensure_ascii=False, indent=2)
with open("/home/ubuntu/erp-rh-fc/scripts/aso_data.json", "w") as f:
    f.write(output)
print("JSON saved to /home/ubuntu/erp-rh-fc/scripts/aso_data.json")
