---
name: NFS-e Valor Líquido formula
description: Correct formula for computing the net NFS-e value that hits the bank account, and which fields count as "retido" vs prestador's own liability.
---

Valor Líquido (o que entra no banco) = Valor Bruto do Serviço − ISS (se retido pelo tomador) − INSS retido − IRRF retido − PIS/COFINS retido pelo tomador.

**Why:** Verified against a real DANFSe (municipal NFS-e document) where ISSQN was explicitly "Retido pelo Tomador" — the official "VALOR TOTAL DA NFS-e" section subtracts ISS retido + Total das Retenções Federais from Valor do Serviço to arrive at Valor Líquido da NFS-e. A prior fix wrongly assumed ISS is never retained and removed it from the formula, which broke the calculation for services where the client (tomador) does withhold ISS at source (common in construction services performed in a municipality other than the prestador's, per LC 116/2003 reverse-charge rules).

**How to apply:** The PIS/COFINS field must capture ONLY amounts explicitly marked as retained by the tomador (e.g. "Contribuições Sociais - Retidas") — NEVER the "Débito de Apuração Própria" PIS/COFINS values, which are the prestador's own tax liability paid separately and do NOT reduce the amount deposited to their bank account. Always validate any NFS-e financial field logic against the DANFSe's own "VALOR TOTAL DA NFS-e" section math before assuming a component should or shouldn't be retained.
