/**
 * Patrimônio Imobiliário — Rev. 5089
 * Inclui leitura de Plano Diretor (zoneamento) via IA.
 * Acesso EXCLUSIVO: admin_master.
 */
import { z } from "zod";
import { sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";
import { invokeAnthropicVision, invokeLLM } from "../_core/llm";

function assertMaster(ctx: any) {
  if (ctx.user.role !== "admin_master")
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao Admin Master." });
}

const TIPOS_IMOVEL = ["terreno","casa","apartamento","galpao","sala_comercial","rural","outro"] as const;
const STATUS_IMOVEL = ["disponivel","financiado","quitado","locado","vendido"] as const;
const TIPOS_DOC     = ["escritura","matricula","boleto_iptu","projeto","laudo","contrato","foto","video","outro"] as const;

const imovelFields = {
  tipo:  z.enum(TIPOS_IMOVEL).default("outro"),
  nome:  z.string().min(1).max(200),
  status:z.enum(STATUS_IMOVEL).default("disponivel"),
  // Localização
  logradouro:  z.string().max(300).nullable().optional(),
  numero:      z.string().max(20).nullable().optional(),
  complemento: z.string().max(100).nullable().optional(),
  bairro:      z.string().max(100).nullable().optional(),
  cidade:      z.string().max(100).nullable().optional(),
  estado:      z.string().max(2).nullable().optional(),
  cep:         z.string().max(10).nullable().optional(),
  lat:         z.number().nullable().optional(),
  lng:         z.number().nullable().optional(),
  // Área
  areaTotal:       z.number().nullable().optional(),
  areaConstruida:  z.number().nullable().optional(),
  // Dados cartoriais
  matricula:       z.string().max(100).nullable().optional(),
  livro:           z.string().max(100).nullable().optional(),
  folha:           z.string().max(100).nullable().optional(),
  tabelionato:     z.string().max(200).nullable().optional(),
  cidadeCartorio:  z.string().max(100).nullable().optional(),
  dataEscritura:   z.string().nullable().optional(),
  numeroRegistro:  z.string().max(100).nullable().optional(),
  vendedores:      z.string().nullable().optional(),
  compradores:     z.string().nullable().optional(),
  itbiValor:       z.number().nullable().optional(),
  // Financeiro
  dataCompra:      z.string().nullable().optional(),
  valorCompra:     z.number().nullable().optional(),
  valorVenal:      z.number().nullable().optional(),
  valorComercial:  z.number().nullable().optional(),
  valorVenda:      z.number().nullable().optional(),
  // IPTU / Prefeitura
  iptuValor:           z.number().nullable().optional(),
  iptuVencimento:      z.string().nullable().optional(),
  cadastroPrefeitura:  z.string().max(100).nullable().optional(),
  inscricaoMunicipal:  z.string().max(100).nullable().optional(),
  // Financiamento
  financiamentoBanco:        z.string().max(100).nullable().optional(),
  financiamentoParcela:      z.number().nullable().optional(),
  financiamentoSaldoDevedor: z.number().nullable().optional(),
  financiamentoVencimento:   z.string().nullable().optional(),
  financiamentoTaxaAnual:    z.number().nullable().optional(),
  financiamentoIndice:       z.string().max(20).nullable().optional(),
  financiamentoNumeroParcelas: z.number().int().nullable().optional(),
  financiamentoParcelasPagas:  z.number().int().nullable().optional(),
  financiamentoDataInicio:   z.string().nullable().optional(),
  // Zoneamento / Plano Diretor
  zoneamento:                z.string().max(150).nullable().optional(),
  planoDiretorMunicipio:     z.string().max(100).nullable().optional(),
  usoPermitido:              z.string().nullable().optional(),
  coefAproveitamentoBasico:  z.number().nullable().optional(),
  coefAproveitamentoMaximo:  z.number().nullable().optional(),
  taxaOcupacao:              z.number().nullable().optional(),
  taxaPermeabilidade:        z.number().nullable().optional(),
  gabaritoMaximo:            z.string().max(80).nullable().optional(),
  recuoFrontal:              z.number().nullable().optional(),
  recuoLateral:              z.number().nullable().optional(),
  recuoFundos:               z.number().nullable().optional(),
  observacoesZoneamento:     z.string().nullable().optional(),
  planoDiretorUrl:           z.string().nullable().optional(),
  // Dimensões do terreno
  terrenoLargura:      z.number().nullable().optional(),
  terrenoComprimento:  z.number().nullable().optional(),
  terrenoFrente:       z.number().int().nullable().optional(),
  // Situação construtiva
  imovelAverbado:  z.boolean().nullable().optional(),
  areaAverbada:    z.number().nullable().optional(),
  anoConstrucao:   z.number().int().nullable().optional(),
  // Renda mensal
  geraRenda:            z.boolean().nullable().optional(),
  rendaMensal:          z.number().nullable().optional(),
  rendaLocatario:       z.string().max(200).nullable().optional(),
  rendaDiaVencimento:   z.number().int().min(1).max(31).nullable().optional(),
  rendaContratoInicio:  z.string().nullable().optional(),
  rendaContratoFim:     z.string().nullable().optional(),
  // Proprietário
  ownerType: z.enum(["empresa","socio"]).default("empresa"),
  socioNome: z.string().max(200).nullable().optional(),
  socioCpf:  z.string().max(20).nullable().optional(),
  socioDoc:  z.string().max(100).nullable().optional(),
  // Outros
  observacoes: z.string().nullable().optional(),
  fotoCapaUrl: z.string().nullable().optional(),
  fotoCapaKey: z.string().nullable().optional(),
};

function mapRow(r: any) {
  return {
    id: Number(r.id), companyId: Number(r.company_id),
    tipo: r.tipo, nome: r.nome, status: r.status,
    logradouro:  r.logradouro  || null, numero:      r.numero      || null,
    complemento: r.complemento || null, bairro:      r.bairro      || null,
    cidade:      r.cidade      || null, estado:      r.estado      || null,
    cep:         r.cep         || null,
    lat: r.lat ? Number(r.lat) : null, lng: r.lng ? Number(r.lng) : null,
    areaTotal:      r.area_total      ? Number(r.area_total)      : null,
    areaConstruida: r.area_construida ? Number(r.area_construida) : null,
    matricula:      r.matricula      || null, livro:          r.livro          || null,
    folha:          r.folha          || null, tabelionato:    r.tabelionato    || null,
    cidadeCartorio: r.cidade_cartorio || null, dataEscritura:  r.data_escritura  || null,
    numeroRegistro: r.numero_registro || null, vendedores:     r.vendedores      || null,
    compradores:    r.compradores    || null,
    itbiValor:      r.itbi_valor     ? Number(r.itbi_valor)     : null,
    dataCompra:     r.data_compra    || null,
    valorCompra:    r.valor_compra   ? Number(r.valor_compra)   : null,
    valorVenal:     r.valor_venal    ? Number(r.valor_venal)    : null,
    valorComercial: r.valor_comercial? Number(r.valor_comercial): null,
    valorVenda:     r.valor_venda    ? Number(r.valor_venda)    : null,
    iptuValor:      r.iptu_valor     ? Number(r.iptu_valor)     : null,
    iptuVencimento: r.iptu_vencimento || null,
    cadastroPrefeitura:   r.cadastro_prefeitura  || null,
    inscricaoMunicipal:   r.inscricao_municipal  || null,
    financiamentoBanco:   r.financiamento_banco  || null,
    financiamentoParcela: r.financiamento_parcela? Number(r.financiamento_parcela): null,
    financiamentoSaldoDevedor: r.financiamento_saldo_devedor ? Number(r.financiamento_saldo_devedor) : null,
    financiamentoVencimento:   r.financiamento_vencimento    || null,
    financiamentoTaxaAnual:    r.financiamento_taxa_anual    ? Number(r.financiamento_taxa_anual)    : null,
    financiamentoIndice:       r.financiamento_indice        || null,
    financiamentoNumeroParcelas: r.financiamento_numero_parcelas ? Number(r.financiamento_numero_parcelas) : null,
    financiamentoParcelasPagas:  r.financiamento_parcelas_pagas  ? Number(r.financiamento_parcelas_pagas)  : null,
    financiamentoDataInicio:   r.financiamento_data_inicio   || null,
    zoneamento:               r.zoneamento                || null,
    planoDiretorMunicipio:    r.plano_diretor_municipio   || null,
    usoPermitido:             r.uso_permitido             || null,
    coefAproveitamentoBasico: r.coef_aproveitamento_basico? Number(r.coef_aproveitamento_basico): null,
    coefAproveitamentoMaximo: r.coef_aproveitamento_maximo? Number(r.coef_aproveitamento_maximo): null,
    taxaOcupacao:             r.taxa_ocupacao             ? Number(r.taxa_ocupacao)             : null,
    taxaPermeabilidade:       r.taxa_permeabilidade       ? Number(r.taxa_permeabilidade)       : null,
    gabaritoMaximo:           r.gabarito_maximo           || null,
    recuoFrontal:             r.recuo_frontal             ? Number(r.recuo_frontal)             : null,
    recuoLateral:             r.recuo_lateral             ? Number(r.recuo_lateral)             : null,
    recuoFundos:              r.recuo_fundos              ? Number(r.recuo_fundos)              : null,
    observacoesZoneamento:    r.observacoes_zoneamento    || null,
    planoDiretorUrl:          r.plano_diretor_url         || null,
    terrenoLargura:     r.terreno_largura     ? Number(r.terreno_largura)     : null,
    terrenoComprimento: r.terreno_comprimento ? Number(r.terreno_comprimento) : null,
    terrenoFrente:      r.terreno_frentes     ? Number(r.terreno_frentes)     : null,
    imovelAverbado:     r.imovel_averbado === true || r.imovel_averbado === "true",
    areaAverbada:       r.area_averbada   ? Number(r.area_averbada)   : null,
    anoConstrucao:      r.ano_construcao  ? Number(r.ano_construcao)  : null,
    geraRenda:          r.gera_renda === true || r.gera_renda === "true",
    rendaMensal:        r.renda_mensal          ? Number(r.renda_mensal)          : null,
    rendaLocatario:     r.renda_locatario       || null,
    rendaDiaVencimento: r.renda_dia_vencimento  ? Number(r.renda_dia_vencimento)  : null,
    rendaContratoInicio: r.renda_contrato_inicio || null,
    rendaContratoFim:    r.renda_contrato_fim    || null,
    ownerType:    r.owner_type || "empresa",
    socioNome:    r.socio_nome || null,
    socioCpf:     r.socio_cpf  || null,
    socioDoc:     r.socio_doc  || null,
    observacoes:  r.observacoes   || null,
    fotoCapaUrl:  r.foto_capa_url || null,
    fotoCapaKey:  r.foto_capa_key || null,
    createdAt:    r.created_at,
    totalDocs:    Number(r.total_docs ?? 0),
    encargoVencido: r.encargo_vencido === true || r.encargo_vencido === "true",
  };
}

export const patrimonioRouter = router({

  /* ─── LISTAR ─── */
  listar: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      assertMaster(ctx);
      const db = (await getDb())!;
      const rows = ((await db.execute(sql`
        SELECT i.*,
               (SELECT COUNT(*) FROM imovel_documentos d
                WHERE d.imovel_id = i.id AND d.deleted_at IS NULL)::int AS total_docs,
               EXISTS (
                 SELECT 1 FROM imovel_pagamentos p
                 WHERE p.imovel_id = i.id AND p.company_id = i.company_id
                   AND p.deleted_at IS NULL
                   AND p.data_pagamento IS NULL
                   AND p.data_vencimento < CURRENT_DATE
               ) AS encargo_vencido
        FROM imoveis i
        WHERE i.company_id = ${input.companyId} AND i.deleted_at IS NULL
        ORDER BY i.nome ASC
      `)) as any).rows || [];
      return rows.map(mapRow);
    }),

  /* ─── CRIAR ─── */
  criar: protectedProcedure
    .input(z.object({ companyId: z.number(), ...imovelFields }))
    .mutation(async ({ input, ctx }) => {
      assertMaster(ctx);
      const db = (await getDb())!;
      const rows = ((await db.execute(sql`
        INSERT INTO imoveis (
          company_id, tipo, nome, status,
          logradouro, numero, complemento, bairro, cidade, estado, cep, lat, lng,
          area_total, area_construida,
          matricula, livro, folha, tabelionato, cidade_cartorio,
          data_escritura, numero_registro, vendedores, compradores, itbi_valor,
          data_compra, valor_compra, valor_venal, valor_comercial, valor_venda,
          iptu_valor, iptu_vencimento, cadastro_prefeitura, inscricao_municipal,
          financiamento_banco, financiamento_parcela, financiamento_saldo_devedor, financiamento_vencimento,
          financiamento_taxa_anual, financiamento_indice, financiamento_numero_parcelas, financiamento_parcelas_pagas, financiamento_data_inicio,
          zoneamento, plano_diretor_municipio, uso_permitido,
          coef_aproveitamento_basico, coef_aproveitamento_maximo,
          taxa_ocupacao, taxa_permeabilidade, gabarito_maximo,
          recuo_frontal, recuo_lateral, recuo_fundos,
          observacoes_zoneamento, plano_diretor_url,
          terreno_largura, terreno_comprimento, terreno_frentes,
          imovel_averbado, area_averbada, ano_construcao,
          gera_renda, renda_mensal, renda_locatario, renda_dia_vencimento,
          renda_contrato_inicio, renda_contrato_fim,
          owner_type, socio_nome, socio_cpf, socio_doc,
          observacoes, foto_capa_url, foto_capa_key, created_by
        ) VALUES (
          ${input.companyId}, ${input.tipo}, ${input.nome}, ${input.status},
          ${input.logradouro??null}, ${input.numero??null}, ${input.complemento??null},
          ${input.bairro??null}, ${input.cidade??null}, ${input.estado??null}, ${input.cep??null},
          ${input.lat??null}, ${input.lng??null},
          ${input.areaTotal??null}, ${input.areaConstruida??null},
          ${input.matricula??null}, ${input.livro??null}, ${input.folha??null},
          ${input.tabelionato??null}, ${input.cidadeCartorio??null},
          ${input.dataEscritura??null}, ${input.numeroRegistro??null},
          ${input.vendedores??null}, ${input.compradores??null}, ${input.itbiValor??null},
          ${input.dataCompra??null}, ${input.valorCompra??null}, ${input.valorVenal??null},
          ${input.valorComercial??null}, ${input.valorVenda??null},
          ${input.iptuValor??null}, ${input.iptuVencimento??null},
          ${input.cadastroPrefeitura??null}, ${input.inscricaoMunicipal??null},
          ${input.financiamentoBanco??null}, ${input.financiamentoParcela??null},
          ${input.financiamentoSaldoDevedor??null}, ${input.financiamentoVencimento??null},
          ${input.financiamentoTaxaAnual??null}, ${input.financiamentoIndice??null},
          ${input.financiamentoNumeroParcelas??null}, ${input.financiamentoParcelasPagas??null}, ${input.financiamentoDataInicio??null},
          ${input.zoneamento??null}, ${input.planoDiretorMunicipio??null}, ${input.usoPermitido??null},
          ${input.coefAproveitamentoBasico??null}, ${input.coefAproveitamentoMaximo??null},
          ${input.taxaOcupacao??null}, ${input.taxaPermeabilidade??null}, ${input.gabaritoMaximo??null},
          ${input.recuoFrontal??null}, ${input.recuoLateral??null}, ${input.recuoFundos??null},
          ${input.observacoesZoneamento??null}, ${input.planoDiretorUrl??null},
          ${input.terrenoLargura??null}, ${input.terrenoComprimento??null}, ${input.terrenoFrente??null},
          ${input.imovelAverbado??false}, ${input.areaAverbada??null}, ${input.anoConstrucao??null},
          ${input.geraRenda??false}, ${input.rendaMensal??null}, ${input.rendaLocatario??null},
          ${input.rendaDiaVencimento??null}, ${input.rendaContratoInicio??null}, ${input.rendaContratoFim??null},
          ${input.ownerType??'empresa'}, ${input.socioNome??null}, ${input.socioCpf??null}, ${input.socioDoc??null},
          ${input.observacoes??null}, ${input.fotoCapaUrl??null}, ${input.fotoCapaKey??null},
          ${ctx.user.id}
        ) RETURNING id
      `)) as any).rows || [];
      return { id: Number(rows[0]?.id) };
    }),

  /* ─── ATUALIZAR ─── */
  atualizar: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), ...imovelFields }))
    .mutation(async ({ input, ctx }) => {
      assertMaster(ctx);
      const db = (await getDb())!;
      await db.execute(sql`
        UPDATE imoveis SET
          tipo   = COALESCE(${input.tipo??null}, tipo),
          nome   = COALESCE(${input.nome??null}, nome),
          status = COALESCE(${input.status??null}, status),
          logradouro  = ${input.logradouro??null},  numero      = ${input.numero??null},
          complemento = ${input.complemento??null}, bairro      = ${input.bairro??null},
          cidade      = ${input.cidade??null},       estado      = ${input.estado??null},
          cep         = ${input.cep??null},
          lat = ${input.lat??null}, lng = ${input.lng??null},
          area_total       = ${input.areaTotal??null},
          area_construida  = ${input.areaConstruida??null},
          matricula        = ${input.matricula??null},
          livro            = ${input.livro??null},
          folha            = ${input.folha??null},
          tabelionato      = ${input.tabelionato??null},
          cidade_cartorio  = ${input.cidadeCartorio??null},
          data_escritura   = ${input.dataEscritura??null},
          numero_registro  = ${input.numeroRegistro??null},
          vendedores       = ${input.vendedores??null},
          compradores      = ${input.compradores??null},
          itbi_valor       = ${input.itbiValor??null},
          data_compra      = ${input.dataCompra??null},
          valor_compra     = ${input.valorCompra??null},
          valor_venal      = ${input.valorVenal??null},
          valor_comercial  = ${input.valorComercial??null},
          valor_venda      = ${input.valorVenda??null},
          iptu_valor       = ${input.iptuValor??null},
          iptu_vencimento  = ${input.iptuVencimento??null},
          cadastro_prefeitura  = ${input.cadastroPrefeitura??null},
          inscricao_municipal  = ${input.inscricaoMunicipal??null},
          financiamento_banco             = ${input.financiamentoBanco??null},
          financiamento_parcela          = ${input.financiamentoParcela??null},
          financiamento_saldo_devedor    = ${input.financiamentoSaldoDevedor??null},
          financiamento_vencimento       = ${input.financiamentoVencimento??null},
          financiamento_taxa_anual       = ${input.financiamentoTaxaAnual??null},
          financiamento_indice           = ${input.financiamentoIndice??null},
          financiamento_numero_parcelas  = ${input.financiamentoNumeroParcelas??null},
          financiamento_parcelas_pagas   = ${input.financiamentoParcelasPagas??null},
          financiamento_data_inicio      = ${input.financiamentoDataInicio??null},
          zoneamento                = ${input.zoneamento??null},
          plano_diretor_municipio   = ${input.planoDiretorMunicipio??null},
          uso_permitido             = ${input.usoPermitido??null},
          coef_aproveitamento_basico= ${input.coefAproveitamentoBasico??null},
          coef_aproveitamento_maximo= ${input.coefAproveitamentoMaximo??null},
          taxa_ocupacao             = ${input.taxaOcupacao??null},
          taxa_permeabilidade       = ${input.taxaPermeabilidade??null},
          gabarito_maximo           = ${input.gabaritoMaximo??null},
          recuo_frontal             = ${input.recuoFrontal??null},
          recuo_lateral             = ${input.recuoLateral??null},
          recuo_fundos              = ${input.recuoFundos??null},
          observacoes_zoneamento    = ${input.observacoesZoneamento??null},
          plano_diretor_url         = ${input.planoDiretorUrl??null},
          terreno_largura      = ${input.terrenoLargura??null},
          terreno_comprimento  = ${input.terrenoComprimento??null},
          terreno_frentes      = ${input.terrenoFrente??null},
          imovel_averbado      = ${input.imovelAverbado??false},
          area_averbada        = ${input.areaAverbada??null},
          ano_construcao       = ${input.anoConstrucao??null},
          gera_renda           = ${input.geraRenda??false},
          renda_mensal         = ${input.rendaMensal??null},
          renda_locatario      = ${input.rendaLocatario??null},
          renda_dia_vencimento = ${input.rendaDiaVencimento??null},
          renda_contrato_inicio = ${input.rendaContratoInicio??null},
          renda_contrato_fim    = ${input.rendaContratoFim??null},
          owner_type = ${input.ownerType??'empresa'},
          socio_nome = ${input.socioNome??null},
          socio_cpf  = ${input.socioCpf??null},
          socio_doc  = ${input.socioDoc??null},
          observacoes   = ${input.observacoes??null},
          foto_capa_url = ${input.fotoCapaUrl??null},
          foto_capa_key = ${input.fotoCapaKey??null},
          updated_at    = now()
        WHERE id = ${input.id} AND company_id = ${input.companyId} AND deleted_at IS NULL
      `);
      return { ok: true };
    }),

  /* ─── EXCLUIR ─── */
  excluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertMaster(ctx);
      const db = (await getDb())!;
      await db.execute(sql`UPDATE imoveis SET deleted_at=now() WHERE id=${input.id} AND company_id=${input.companyId}`);
      return { ok: true };
    }),

  /* ─── LEITURA IA: ESCRITURA/CONTRATO ─── */
  lerDocumento: protectedProcedure
    .input(z.object({
      companyId: z.number(), base64: z.string().max(40_000_000),
      contentType: z.string().default("application/pdf"),
      nomeOriginal: z.string().max(200).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertMaster(ctx);
      const ext = input.contentType.includes("pdf") ? "pdf"
        : input.contentType.includes("png") ? "png"
        : input.contentType.includes("webp") ? "webp" : "jpg";
      const key = `patrimonio/${input.companyId}/leitura-ia/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const buf = Buffer.from(input.base64, "base64");
      const { url } = await storagePut(key, buf, input.contentType);

      const mimeType = input.contentType.includes("pdf") ? "application/pdf" : input.contentType as any;
      let txt = "";
      try {
        txt = await invokeAnthropicVision({
          base64: input.base64, mimeType, maxTokens: 4096,
          systemPrompt: "Você é especialista em leitura de documentos imobiliários brasileiros. Extraia todos os dados com máxima precisão. Responda APENAS com JSON válido, sem markdown.",
          prompt: `Leia este documento imobiliário e extraia as informações no JSON abaixo. Use null para o que não encontrar.

{
  "tipoDocumento": "escritura|contrato_compra_venda|matricula|boleto_iptu|laudo|outro",
  "nome": "apelido curto descritivo (tipo + logradouro + cidade)",
  "tipo": "terreno|casa|apartamento|galpao|sala_comercial|rural|outro",
  "logradouro": null, "numero": null, "complemento": null, "bairro": null,
  "cidade": null, "estado": null, "cep": null,
  "areaTotal": null, "areaConstruida": null,
  "matricula": null, "livro": null, "folha": null,
  "tabelionato": null, "cidadeCartorio": null,
  "dataEscritura": null, "numeroRegistro": null,
  "vendedores": null, "compradores": null, "itbiValor": null,
  "dataCompra": null, "valorCompra": null, "valorVenal": null,
  "iptuValor": null, "iptuVencimento": null,
  "cadastroPrefeitura": null, "inscricaoMunicipal": null,
  "financiamentoBanco": null,
  "financiamentoParcela": null,
  "financiamentoSaldoDevedor": null,
  "financiamentoVencimento": null,
  "financiamentoTaxaAnual": null,
  "financiamentoIndice": null,
  "financiamentoNumeroParcelas": null,
  "financiamentoParcelasPagas": null,
  "financiamentoDataInicio": null,
  "observacoes": null
}

REGRAS: Datas YYYY-MM-DD. Valores monetários número com ponto decimal sem R$. Áreas número com ponto decimal sem m².
financiamentoTaxaAnual: taxa de juros/correção anual em % (ex: 8.5 para 8,5% a.a.). financiamentoIndice: sigla do índice (TR, IPCA, INPC, PREFIXADO, TJLP ou null).
ATENÇÃO: vendedores e compradores DEVEM ser strings de texto simples (nomes separados por vírgula), NUNCA arrays ou objetos. Ex: "João da Silva, Maria Oliveira Ltda."`,
        });
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha na leitura do documento pela IA." });
      }

      let dados: any = {};
      try { const m = txt.match(/\{[\s\S]*\}/); if (m) dados = JSON.parse(m[0]); } catch { /**/ }

      const toNum = (v: any): number | null => {
        if (v == null) return null;
        if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
        const s = String(v).replace(/[^\d.,-]/g, "");
        const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const toDate = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v||"")) ? String(v) : null;
      // toStr: normaliza strings, arrays e objetos para texto legível
      const toStr = (v: any, max = 300): string | null => {
        if (v == null) return null;
        if (Array.isArray(v)) {
          const s = v.map((item: any) => {
            if (item == null) return "";
            if (typeof item === "object") {
              return (item.nome || item.name || item.razao_social || item.razaoSocial ||
                item.vendedor || item.comprador || Object.values(item).filter(Boolean).join(" ")).toString();
            }
            return String(item);
          }).filter(Boolean).join(", ");
          return s.slice(0, max) || null;
        }
        if (typeof v === "object") {
          const s = (v.nome || v.name || v.razao_social || v.razaoSocial ||
            Object.values(v).filter(Boolean).join(" ")).toString();
          return s.slice(0, max) || null;
        }
        const s = String(v).trim();
        return s ? s.slice(0, max) : null;
      };
      const TIPOS_V = ["terreno","casa","apartamento","galpao","sala_comercial","rural","outro"];

      return {
        arquivoUrl: url, arquivoKey: key,
        tipoDocumento:     toStr(dados.tipoDocumento, 40) || "outro",
        nome:              toStr(dados.nome, 200),
        tipo:              TIPOS_V.includes(dados.tipo) ? dados.tipo : null,
        logradouro:        toStr(dados.logradouro, 300),
        numero:            toStr(dados.numero, 20),
        complemento:       toStr(dados.complemento, 100),
        bairro:            toStr(dados.bairro, 100),
        cidade:            toStr(dados.cidade, 100),
        estado:            dados.estado ? String(dados.estado).slice(0,2).toUpperCase() : null,
        cep:               dados.cep ? String(dados.cep).replace(/[^\d-]/g,"").slice(0,10) : null,
        areaTotal:         toNum(dados.areaTotal),
        areaConstruida:    toNum(dados.areaConstruida),
        matricula:         toStr(dados.matricula, 100),
        livro:             toStr(dados.livro, 100),
        folha:             toStr(dados.folha, 100),
        tabelionato:       toStr(dados.tabelionato, 200),
        cidadeCartorio:    toStr(dados.cidadeCartorio, 100),
        dataEscritura:     toDate(dados.dataEscritura),
        numeroRegistro:    toStr(dados.numeroRegistro, 100),
        vendedores:        toStr(dados.vendedores, 500),
        compradores:       toStr(dados.compradores, 500),
        itbiValor:         toNum(dados.itbiValor),
        dataCompra:        toDate(dados.dataCompra),
        valorCompra:       toNum(dados.valorCompra),
        valorVenal:        toNum(dados.valorVenal),
        iptuValor:         toNum(dados.iptuValor),
        iptuVencimento:    toDate(dados.iptuVencimento),
        cadastroPrefeitura: toStr(dados.cadastroPrefeitura, 100),
        inscricaoMunicipal: toStr(dados.inscricaoMunicipal, 100),
        financiamentoBanco:          toStr(dados.financiamentoBanco, 100),
        financiamentoParcela:        toNum(dados.financiamentoParcela),
        financiamentoSaldoDevedor:   toNum(dados.financiamentoSaldoDevedor),
        financiamentoVencimento:     toDate(dados.financiamentoVencimento),
        financiamentoTaxaAnual:      toNum(dados.financiamentoTaxaAnual),
        financiamentoIndice:         dados.financiamentoIndice ? String(dados.financiamentoIndice).slice(0,20).toUpperCase() : null,
        financiamentoNumeroParcelas: dados.financiamentoNumeroParcelas ? Math.round(Number(dados.financiamentoNumeroParcelas)) : null,
        financiamentoParcelasPagas:  dados.financiamentoParcelasPagas  ? Math.round(Number(dados.financiamentoParcelasPagas))  : null,
        financiamentoDataInicio:     toDate(dados.financiamentoDataInicio),
        observacoes:                 toStr(dados.observacoes, 400),
      };
    }),

  /* ─── LEITURA IA: PLANO DIRETOR ─── */
  lerPlanoDiretor: protectedProcedure
    .input(z.object({
      companyId:   z.number(),
      base64:      z.string().max(40_000_000),
      contentType: z.string().default("application/pdf"),
      municipio:   z.string().max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertMaster(ctx);
      const ext = input.contentType.includes("pdf") ? "pdf"
        : input.contentType.includes("png") ? "png" : "jpg";
      const key = `patrimonio/${input.companyId}/plano-diretor/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const buf = Buffer.from(input.base64, "base64");
      const { url } = await storagePut(key, buf, input.contentType);

      const mimeType = input.contentType.includes("pdf") ? "application/pdf" : input.contentType as any;
      const municipioCtx = input.municipio ? `O imóvel está em ${input.municipio}.` : "";
      let txt = "";
      try {
        txt = await invokeAnthropicVision({
          base64: input.base64, mimeType, maxTokens: 4096,
          systemPrompt: "Você é especialista em urbanismo, legislação urbana e Planos Diretores municipais brasileiros (Lei de Zoneamento, Lei de Uso e Ocupação do Solo - LUOS). Extraia parâmetros urbanísticos com precisão. Responda APENAS com JSON válido, sem markdown.",
          prompt: `${municipioCtx} Leia este Plano Diretor, Lei de Zoneamento ou documento urbanístico e extraia os parâmetros da zona principal descrita. Use null para o que não encontrar.

{
  "municipio": "nome do município",
  "zoneamento": "código + nome completo da zona (ex: 'ZM-1 - Zona Mista de Baixa Densidade')",
  "usoPermitido": "lista dos usos permitidos separados por vírgula (ex: 'Residencial unifamiliar, Residencial multifamiliar, Comércio varejista, Serviços de saúde')",
  "coefAproveitamentoBasico": 1.5,
  "coefAproveitamentoMaximo": 3.0,
  "taxaOcupacao": 60.0,
  "taxaPermeabilidade": 20.0,
  "gabaritoMaximo": "ex: '8 pavimentos' ou '25m' ou 'sem limite'",
  "recuoFrontal": 5.0,
  "recuoLateral": 1.5,
  "recuoFundos": 2.0,
  "observacoesZoneamento": "outras restrições, instrumentos (IPTU progressivo, EIV, outorga onerosa), incentivos ou condições especiais em até 400 caracteres"
}

REGRAS: Coeficientes e taxas são números com ponto decimal. Recuos em metros. Taxa de ocupação e permeabilidade em %.`,
        });
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha na leitura do Plano Diretor pela IA." });
      }

      let dados: any = {};
      try { const m = txt.match(/\{[\s\S]*\}/); if (m) dados = JSON.parse(m[0]); } catch { /**/ }

      const toNum = (v: any): number | null => {
        if (v == null) return null;
        if (typeof v === "number") return Number.isFinite(v) ? v : null;
        const n = Number(String(v).replace(",", ".").replace(/[^\d.-]/g,""));
        return Number.isFinite(n) ? n : null;
      };
      const toStr = (v: any, max=200) => v ? String(v).slice(0, max) : null;

      return {
        arquivoUrl: url, arquivoKey: key,
        municipio:                toStr(dados.municipio, 100),
        zoneamento:               toStr(dados.zoneamento, 150),
        usoPermitido:             toStr(dados.usoPermitido, 1000),
        coefAproveitamentoBasico: toNum(dados.coefAproveitamentoBasico),
        coefAproveitamentoMaximo: toNum(dados.coefAproveitamentoMaximo),
        taxaOcupacao:             toNum(dados.taxaOcupacao),
        taxaPermeabilidade:       toNum(dados.taxaPermeabilidade),
        gabaritoMaximo:           toStr(dados.gabaritoMaximo, 80),
        recuoFrontal:             toNum(dados.recuoFrontal),
        recuoLateral:             toNum(dados.recuoLateral),
        recuoFundos:              toNum(dados.recuoFundos),
        observacoesZoneamento:    toStr(dados.observacoesZoneamento, 400),
      };
    }),

  /* ─── FOTO CAPA ─── */
  uploadFoto: protectedProcedure
    .input(z.object({
      companyId: z.number(), base64: z.string().max(20_000_000),
      contentType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input, ctx }) => {
      assertMaster(ctx);
      const buf = Buffer.from(input.base64, "base64");
      const ext = input.contentType.includes("png") ? "png" : input.contentType.includes("webp") ? "webp" : "jpg";
      const key = `patrimonio/${input.companyId}/fotos/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const { url } = await storagePut(key, buf, input.contentType);
      return { url, key };
    }),

  /* ─── AVALIAÇÃO DE MERCADO VIA BUSCA + IA ─── */
  avaliarMercado: protectedProcedure
    .input(z.object({ imovelId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      assertMaster(ctx);
      const db = (await getDb())!;
      const rows = ((await db.execute(sql`
        SELECT tipo, nome, logradouro, numero, bairro, cidade, estado,
               area_total, area_construida, valor_compra, valor_comercial
        FROM imoveis
        WHERE id=${input.imovelId} AND company_id=${input.companyId} AND deleted_at IS NULL
        LIMIT 1
      `)) as any).rows || [];
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não encontrado." });
      const im = rows[0];

      const tipoLabel: Record<string, string> = {
        terreno: "terreno", casa: "casa", apartamento: "apartamento",
        galpao: "galpão", sala_comercial: "sala comercial", rural: "rural", outro: "imóvel",
      };
      const tipo = tipoLabel[String(im.tipo)] ?? "imóvel";
      const cidade = String(im.cidade || "");
      const bairro = String(im.bairro || "");
      const estado = String(im.estado || "");
      const area = im.area_total ? `${Number(im.area_total)}m2` : "";

      const queries = [
        `${tipo} venda ${bairro} ${cidade} ${estado} preço`.trim(),
        `${tipo} ${area} valor metro quadrado ${cidade} ${estado}`.trim(),
        `imóvel compra ${cidade} ${bairro} valor mercado 2025`.trim(),
      ].filter(q => q.length > 8);

      // Google Custom Search — graceful: falha silenciosa se não configurado
      const googleKey = process.env.GOOGLE_API_KEY ?? "";
      const cseId = process.env.GOOGLE_CSE_ID ?? "";
      const buscas: { titulo: string; url: string; snippet: string }[] = [];

      if (googleKey && cseId) {
        for (const q of queries.slice(0, 2)) {
          try {
            const resp = await fetch(
              `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${cseId}&q=${encodeURIComponent(q)}&num=5`,
              { headers: { "Accept": "application/json" } }
            );
            if (resp.ok) {
              const data = await resp.json();
              for (const item of (data.items ?? [])) {
                buscas.push({ titulo: String(item.title ?? ""), url: String(item.link ?? ""), snippet: String(item.snippet ?? "") });
              }
            }
          } catch { /* ignora falha de busca */ }
        }
      }

      const infoImovel = [
        `Tipo: ${tipo}`,
        im.logradouro ? `Endereço: ${im.logradouro}, ${im.numero || ""}, ${bairro}, ${cidade} - ${estado}` : `Cidade: ${cidade} - ${estado}`,
        im.area_total ? `Área total: ${Number(im.area_total)} m²` : null,
        im.area_construida ? `Área construída: ${Number(im.area_construida)} m²` : null,
        im.valor_compra ? `Valor de compra original: R$ ${Number(im.valor_compra).toLocaleString("pt-BR")}` : null,
        im.valor_comercial ? `Valor comercial cadastrado: R$ ${Number(im.valor_comercial).toLocaleString("pt-BR")}` : null,
      ].filter(Boolean).join("\n");

      const resultadosBusca = buscas.length > 0
        ? buscas.map(r => `- ${r.titulo}\n  ${r.snippet}\n  ${r.url}`).join("\n\n")
        : "Nenhum resultado de busca online disponível — use seu conhecimento geral do mercado imobiliário brasileiro.";

      let analise: any = {};
      try {
        const res = await invokeLLM({
          fast: true,
          messages: [{
            role: "user",
            content: `Você é especialista em avaliação imobiliária no Brasil. Com base nos dados do imóvel e nos resultados de busca na internet, estime o valor de mercado atual. Responda APENAS com JSON válido, sem markdown nem explicações fora do JSON.

IMÓVEL:
${infoImovel}

RESULTADOS DE BUSCA NA INTERNET:
${resultadosBusca}

JSON esperado:
{
  "valorEstimadoMin": <número em R$ sem formatação, obrigatório>,
  "valorEstimadoMax": <número em R$ sem formatação, obrigatório>,
  "valorPorM2Min": <número ou null>,
  "valorPorM2Max": <número ou null>,
  "metodologia": "Como chegou a essa estimativa (2-3 frases objetivas)",
  "confianca": "alta|media|baixa",
  "observacoes": "Limitações ou ressalvas (máx 200 chars) ou null"
}

REGRAS: valorEstimadoMin e valorEstimadoMax são obrigatórios mesmo sem dados de busca (use conhecimento geral do mercado regional). Valores em R$ sem formatação (só número inteiro). Se área disponível, calcule valor/m².`,
          }],
        });
        const m = (res.text ?? "").match(/\{[\s\S]*\}/);
        if (m) analise = JSON.parse(m[0]);
      } catch { /* retorna estimativa vazia */ }

      const toN = (v: any) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
      return {
        imovel: { nome: String(im.nome), tipo: String(im.tipo), cidade, bairro, area: im.area_total ? Number(im.area_total) : null },
        estimativa: {
          valorMin:      toN(analise.valorEstimadoMin),
          valorMax:      toN(analise.valorEstimadoMax),
          valorPorM2Min: toN(analise.valorPorM2Min),
          valorPorM2Max: toN(analise.valorPorM2Max),
          metodologia:   analise.metodologia ? String(analise.metodologia).slice(0, 600) : null,
          confianca:     ["alta","media","baixa"].includes(analise.confianca) ? analise.confianca : "baixa",
          observacoes:   analise.observacoes ? String(analise.observacoes).slice(0, 200) : null,
          buscas:        buscas.slice(0, 8),
        },
        geradoEm: new Date().toISOString(),
      };
    }),

  /* ─── PAGAMENTOS DE ENCARGOS ─── */
  pagamentos: router({
    listar: protectedProcedure
      .input(z.object({ imovelId: z.number(), companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        assertMaster(ctx);
        const db = (await getDb())!;
        const rows = ((await db.execute(sql`
          SELECT id, imovel_id, tipo, descricao, valor, data_vencimento, data_pagamento,
                 comprovante_url, created_at
          FROM imovel_pagamentos
          WHERE imovel_id=${input.imovelId} AND company_id=${input.companyId} AND deleted_at IS NULL
          ORDER BY data_vencimento DESC
        `)) as any).rows || [];
        const hoje = new Date().toISOString().slice(0, 10);
        return rows.map((r: any) => {
          const pago = !!r.data_pagamento;
          const vencido = !pago && String(r.data_vencimento).slice(0, 10) < hoje;
          const status = pago ? "pago" : vencido ? "vencido" : "pendente";
          return {
            id: Number(r.id), imovelId: Number(r.imovel_id),
            tipo: r.tipo, descricao: r.descricao || null,
            valor: r.valor ? Number(r.valor) : null,
            dataVencimento: String(r.data_vencimento).slice(0, 10),
            dataPagamento: r.data_pagamento ? String(r.data_pagamento).slice(0, 10) : null,
            comprovanteUrl: r.comprovante_url || null,
            status, createdAt: r.created_at,
          };
        });
      }),

    criar: protectedProcedure
      .input(z.object({
        imovelId: z.number(), companyId: z.number(),
        tipo: z.enum(["iptu","laudemio","itbi","condominio","outro"]).default("iptu"),
        descricao: z.string().max(300).nullable().optional(),
        valor: z.number().positive().nullable().optional(),
        dataVencimento: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        assertMaster(ctx);
        const db = (await getDb())!;
        const check = ((await db.execute(sql`SELECT id FROM imoveis WHERE id=${input.imovelId} AND company_id=${input.companyId} AND deleted_at IS NULL LIMIT 1`)) as any).rows || [];
        if (!check.length) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não encontrado." });
        const rows = ((await db.execute(sql`
          INSERT INTO imovel_pagamentos (imovel_id, company_id, tipo, descricao, valor, data_vencimento, created_by)
          VALUES (${input.imovelId}, ${input.companyId}, ${input.tipo}, ${input.descricao??null}, ${input.valor??null}, ${input.dataVencimento}, ${ctx.user.id})
          RETURNING id
        `)) as any).rows || [];
        return { id: Number(rows[0]?.id) };
      }),

    marcarPago: protectedProcedure
      .input(z.object({
        id: z.number(), companyId: z.number(),
        dataPagamento: z.string().optional(),
        comprovanteUrl: z.string().nullable().optional(),
        comprovanteKey: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        assertMaster(ctx);
        const db = (await getDb())!;
        const dataPag = input.dataPagamento || new Date().toISOString().slice(0, 10);
        await db.execute(sql`
          UPDATE imovel_pagamentos
          SET data_pagamento=${dataPag},
              comprovante_url=${input.comprovanteUrl??null},
              comprovante_key=${input.comprovanteKey??null}
          WHERE id=${input.id} AND company_id=${input.companyId} AND deleted_at IS NULL
        `);
        return { ok: true };
      }),

    excluir: protectedProcedure
      .input(z.object({ id: z.number(), companyId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        assertMaster(ctx);
        const db = (await getDb())!;
        await db.execute(sql`UPDATE imovel_pagamentos SET deleted_at=now() WHERE id=${input.id} AND company_id=${input.companyId}`);
        return { ok: true };
      }),
  }),

  /* ─── DOCUMENTOS ─── */
  documentos: router({
    listar: protectedProcedure
      .input(z.object({ imovelId: z.number(), companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        assertMaster(ctx);
        const db = (await getDb())!;
        const rows = ((await db.execute(sql`
          SELECT id, imovel_id, tipo, descricao, arquivo_url, arquivo_key,
                 data_documento, data_vencimento, created_at
          FROM imovel_documentos
          WHERE imovel_id=${input.imovelId} AND company_id=${input.companyId} AND deleted_at IS NULL
          ORDER BY tipo ASC, created_at DESC
        `)) as any).rows || [];
        return rows.map((r: any) => ({
          id: Number(r.id), imovelId: Number(r.imovel_id), tipo: r.tipo,
          descricao: r.descricao || null, arquivoUrl: r.arquivo_url || null,
          arquivoKey: r.arquivo_key || null, dataDocumento: r.data_documento || null,
          dataVencimento: r.data_vencimento || null, createdAt: r.created_at,
        }));
      }),

    criar: protectedProcedure
      .input(z.object({
        imovelId: z.number(), companyId: z.number(),
        tipo: z.enum(TIPOS_DOC).default("outro"),
        descricao: z.string().max(500).nullable().optional(),
        arquivoUrl: z.string().nullable().optional(),
        arquivoKey: z.string().nullable().optional(),
        dataDocumento: z.string().nullable().optional(),
        dataVencimento: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        assertMaster(ctx);
        const db = (await getDb())!;
        const check = ((await db.execute(sql`SELECT id FROM imoveis WHERE id=${input.imovelId} AND company_id=${input.companyId} AND deleted_at IS NULL LIMIT 1`)) as any).rows || [];
        if (!check.length) throw new TRPCError({ code: "NOT_FOUND", message: "Imóvel não encontrado." });
        const rows = ((await db.execute(sql`
          INSERT INTO imovel_documentos (imovel_id, company_id, tipo, descricao, arquivo_url, arquivo_key, data_documento, data_vencimento, created_by)
          VALUES (${input.imovelId}, ${input.companyId}, ${input.tipo}, ${input.descricao??null}, ${input.arquivoUrl??null}, ${input.arquivoKey??null}, ${input.dataDocumento??null}, ${input.dataVencimento??null}, ${ctx.user.id})
          RETURNING id
        `)) as any).rows || [];
        return { id: Number(rows[0]?.id) };
      }),

    excluir: protectedProcedure
      .input(z.object({ id: z.number(), companyId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        assertMaster(ctx);
        const db = (await getDb())!;
        await db.execute(sql`UPDATE imovel_documentos SET deleted_at=now() WHERE id=${input.id} AND company_id=${input.companyId}`);
        return { ok: true };
      }),

    upload: protectedProcedure
      .input(z.object({
        companyId: z.number(), imovelId: z.number(),
        base64: z.string().max(30_000_000),
        contentType: z.string().default("application/pdf"),
        nomeOriginal: z.string().max(200).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        assertMaster(ctx);
        const buf = Buffer.from(input.base64, "base64");
        const ext = input.contentType.includes("pdf") ? "pdf" : input.contentType.includes("png") ? "png" : input.contentType.includes("webp") ? "webp" : "jpg";
        const key = `patrimonio/${input.companyId}/docs/${input.imovelId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const { url } = await storagePut(key, buf, input.contentType);
        return { url, key };
      }),
  }),
});
