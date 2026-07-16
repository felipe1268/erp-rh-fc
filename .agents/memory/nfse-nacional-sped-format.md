---
name: NFS-e Nacional SPED/RFB format
description: Estrutura do XML NFS-e Nacional (SPED/RFB v1.01) — completamente diferente do ABRASF/SIAP GEO.
---

# NFS-e Nacional (SPED/RFB) v1.01

## Regra
Municípios que aderiram ao Portal Nacional da RFB (ex: Guaratinguetá-SP a partir de ~2026) emitem XMLs com root `<NFSe>` e namespace `http://www.sped.fazenda.gov.br/nfse`. Isso é DIFERENTE do formato ABRASF (`<CompNfse>`) e do SIAP GEO (`<nfse>`).

## Estrutura (fast-xml-parser com removeNSPrefix:true)
```
parsed.NFSe.infNFSe         // detector: xmlParsed?.NFSe?.infNFSe
  ['@_Id']                  // "NFS" + chave 48 dígitos → strip "NFS" para chave_acesso
  .nNFSe                    // número da nota
  .dhEmi                    // data ISO 8601 "2026-07-13T10:00:00-03:00" → slice(0,10)
  .prest.CNPJ               // CNPJ prestador
  .toma.CNPJ | .toma.CPF    // CNPJ/CPF tomador
  .toma.xNome               // razão social tomador
  .serv.xDiscServ           // discriminação dos serviços
  .serv.cServ.cTribNac      // código tributação nacional (ex: "14.05")
  .serv.cServ.CNAE          // CNAE
  .valores.vCalcDR          // valor bruto (base de cálculo)
  .valores.trib.tribMun.pAliq        // alíquota ISS %
  .valores.trib.tribMun.vTrib        // valor ISS
  .valores.trib.tribMun.tpRetISSQN   // 1=retido pelo tomador, 2=prestador recolhe
  .valores.trib.retTrib.vRetCP       // retenção INSS
  .valores.trib.retTrib.vRetIRRF     // retenção IRRF
  .valores.trib.retTrib.vRetCSSL     // retenção CSLL
  .valores.trib.retTrib.vRetPIS      // retenção PIS
  .valores.trib.retTrib.vRetCOFINS   // retenção COFINS
```

## Onde está implementado
`server/routers/nfseEmitidas.ts` — bloco "Formato NFS-e Nacional (SPED/RFB) v1.01" em `importNfseXmlManual`, logo após o bloco `listaCompNfse`.

**Why:** Municípios migram progressivamente para o padrão federal RFB; qualquer novo município que emitir XMLs com root `NFSe` e namespace sped.fazenda será automaticamente suportado por este handler.
