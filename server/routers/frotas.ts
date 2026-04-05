import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, asc, sql, gte, lte, inArray } from "drizzle-orm";
import {
  vehicles, fleetMaintenances, fleetFuelRecords,
  fleetTrackingPoints, fleetDocuments,
  fleetFines, fleetIpva, fleetLicensing, fleetInsurance,
  obras, employees,
} from "../../drizzle/schema";
import { invokeLLM, invokeAnthropicVision } from "../_core/llm";
import { storagePut } from "../storage";

const n = (v: any) => parseFloat(v ?? "0") || 0;

async function ensureFleetTables() {
  const db = await getDb();
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ano_modelo VARCHAR(4);
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS cor VARCHAR(30);
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS km_atual NUMERIC(12,1) DEFAULT 0;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS motorista_id INTEGER;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS obra_id INTEGER;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS data_aquisicao DATE;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS valor_compra NUMERIC(14,2);
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS valor_fipe NUMERIC(14,2);
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fipe_codigo_marca VARCHAR(10);
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fipe_codigo_modelo VARCHAR(10);
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fipe_codigo_ano VARCHAR(10);
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fipe_referencia VARCHAR(20);
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS depreciacao_anos INTEGER DEFAULT 5;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS valor_residual NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS foto_url TEXT;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS crlv_url TEXT;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS crlv_vencimento DATE;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS seguro_url TEXT;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS seguro_vencimento DATE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$;
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_maintenances (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      tipo VARCHAR(30) NOT NULL DEFAULT 'corretiva',
      descricao TEXT NOT NULL,
      custo NUMERIC(14,2) DEFAULT 0,
      km_na_manutencao NUMERIC(12,1),
      fornecedor VARCHAR(255),
      data_manutencao DATE NOT NULL,
      data_proxima DATE,
      km_proxima NUMERIC(12,1),
      status VARCHAR(30) NOT NULL DEFAULT 'realizada',
      observacoes TEXT,
      criado_por VARCHAR(255),
      anexos JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`ALTER TABLE fleet_maintenances ADD COLUMN IF NOT EXISTS anexos JSONB DEFAULT '[]'`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_maintenance_items (
      id SERIAL PRIMARY KEY,
      maintenance_id INTEGER NOT NULL REFERENCES fleet_maintenances(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL,
      categoria VARCHAR(30) NOT NULL DEFAULT 'peca',
      nome VARCHAR(255) NOT NULL,
      quantidade NUMERIC(10,2) NOT NULL DEFAULT 1,
      valor_unitario NUMERIC(14,2) NOT NULL DEFAULT 0,
      valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_fuel_records (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      data DATE NOT NULL,
      litros NUMERIC(10,3) NOT NULL,
      valor_total NUMERIC(14,2) NOT NULL,
      preco_litro NUMERIC(8,4),
      km_atual NUMERIC(12,1),
      km_anterior NUMERIC(12,1),
      consumo_km_l NUMERIC(8,2),
      tipo_combustivel VARCHAR(30) DEFAULT 'gasolina',
      motorista VARCHAR(255),
      posto VARCHAR(255),
      observacoes TEXT,
      criado_por VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE fleet_fuel_records ADD COLUMN IF NOT EXISTS num_doc VARCHAR(20);
      ALTER TABLE fleet_fuel_records ADD COLUMN IF NOT EXISTS desconto NUMERIC(14,2);
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$;
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_tracking_points (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      latitude NUMERIC(10,7) NOT NULL,
      longitude NUMERIC(10,7) NOT NULL,
      velocidade NUMERIC(6,1),
      ignicao BOOLEAN DEFAULT FALSE,
      data_hora TIMESTAMP NOT NULL,
      origem VARCHAR(30) DEFAULT 'csv',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_documents (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      nome VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      vencimento DATE,
      observacoes TEXT,
      criado_por VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_fines (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      auto_infracao VARCHAR(50),
      data_infracao DATE NOT NULL,
      data_vencimento DATE,
      codigo_infracao VARCHAR(20),
      descricao TEXT NOT NULL,
      gravidade VARCHAR(20) DEFAULT 'media',
      pontos INTEGER DEFAULT 0,
      valor_original NUMERIC(10,2) NOT NULL,
      valor_com_desconto NUMERIC(10,2),
      valor_pago NUMERIC(10,2),
      status VARCHAR(30) NOT NULL DEFAULT 'pendente',
      motorista VARCHAR(255),
      local TEXT,
      recurso BOOLEAN DEFAULT FALSE,
      recurso_status VARCHAR(30),
      recurso_observacoes TEXT,
      comprovante_url TEXT,
      observacoes TEXT,
      criado_por VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_ipva (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      ano_referencia INTEGER NOT NULL,
      valor_total NUMERIC(10,2) NOT NULL,
      parcelas INTEGER DEFAULT 1,
      parcela_atual INTEGER DEFAULT 0,
      valor_pago NUMERIC(10,2) DEFAULT 0,
      data_vencimento DATE,
      data_pagamento DATE,
      status VARCHAR(30) NOT NULL DEFAULT 'pendente',
      comprovante_url TEXT,
      observacoes TEXT,
      criado_por VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_licensing (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      ano_exercicio INTEGER NOT NULL,
      data_vencimento DATE,
      data_pagamento DATE,
      valor NUMERIC(10,2),
      status VARCHAR(30) NOT NULL DEFAULT 'pendente',
      crlv_digital_url TEXT,
      observacoes TEXT,
      criado_por VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_insurance (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      seguradora VARCHAR(255) NOT NULL,
      numero_apolice VARCHAR(100),
      tipo_cobertura VARCHAR(50) DEFAULT 'compreensivo',
      data_inicio DATE NOT NULL,
      data_fim DATE NOT NULL,
      valor_premio NUMERIC(14,2),
      franquia NUMERIC(14,2),
      coberturas TEXT,
      restricoes TEXT,
      apolice_url TEXT,
      ia_analisada BOOLEAN DEFAULT FALSE,
      ia_resumo TEXT,
      ia_regras_importantes TEXT,
      ia_alertas_risco TEXT,
      ia_coberturas_detalhadas TEXT,
      ia_exclusoes TEXT,
      ia_limites_indenizacao TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'ativa',
      observacoes TEXT,
      criado_por VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_toll_records (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      data DATE NOT NULL,
      categoria VARCHAR(50) NOT NULL DEFAULT 'pedagio',
      descricao VARCHAR(500),
      praca_pedagio VARCHAR(255),
      rodovia VARCHAR(100),
      valor NUMERIC(14,2) NOT NULL,
      tag_id VARCHAR(100),
      placa VARCHAR(20),
      eixos INTEGER,
      status VARCHAR(30) NOT NULL DEFAULT 'pago',
      observacoes TEXT,
      criado_por VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_driver_aliases (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      alias_name VARCHAR(255) NOT NULL,
      canonical_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(company_id, alias_name)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_consolidations (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      custo_combustivel NUMERIC(14,2) DEFAULT 0,
      custo_manutencao NUMERIC(14,2) DEFAULT 0,
      custo_ipva NUMERIC(14,2) DEFAULT 0,
      custo_multas NUMERIC(14,2) DEFAULT 0,
      custo_licenciamento NUMERIC(14,2) DEFAULT 0,
      custo_seguro NUMERIC(14,2) DEFAULT 0,
      custo_total NUMERIC(14,2) DEFAULT 0,
      qtd_abastecimentos INTEGER DEFAULT 0,
      qtd_manutencoes INTEGER DEFAULT 0,
      qtd_multas INTEGER DEFAULT 0,
      litros_total NUMERIC(12,3) DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'pendente',
      financial_entry_id INTEGER,
      observacoes TEXT,
      consolidado_por_id INTEGER,
      consolidado_por_nome VARCHAR(255),
      data_consolidacao TIMESTAMP,
      data_envio_financeiro TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(company_id, mes, ano)
    )
  `);
}
let tablesReady = false;

export const frotasRouter = router({
  initTables: protectedProcedure.mutation(async () => {
    await ensureFleetTables();
    tablesReady = true;
    return { ok: true };
  }),

  listVehicles: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), tipo: z.string().optional(), obraId: z.number().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT v.*, o.nome as obra_nome, e."nomeCompleto" as motorista_nome
        FROM vehicles v
        LEFT JOIN obras o ON o.id = v.obra_id
        LEFT JOIN employees e ON e.id = v.motorista_id
        WHERE v."companyId" = ${input.companyId}`;
      if (input.status) q = sql`${q} AND v."statusVeiculo" = ${input.status}`;
      if (input.tipo) q = sql`${q} AND v."tipoVeiculo" = ${input.tipo}`;
      if (input.obraId) q = sql`${q} AND v.obra_id = ${input.obraId}`;
      q = sql`${q} ORDER BY v."createdAt" DESC`;
      const res = await db.execute(q);
      return (res as any).rows || [];
    }),

  getVehicle: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const res = await db.execute(sql`
        SELECT v.*, o.nome as obra_nome, e."nomeCompleto" as motorista_nome
        FROM vehicles v
        LEFT JOIN obras o ON o.id = v.obra_id
        LEFT JOIN employees e ON e.id = v.motorista_id
        WHERE v.id = ${input.id} AND v."companyId" = ${input.companyId}
      `);
      return (res as any).rows?.[0] || null;
    }),

  createVehicle: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      tipoVeiculo: z.string(),
      placa: z.string().optional(),
      modelo: z.string(),
      marca: z.string().optional(),
      anoFabricacao: z.string().optional(),
      anoModelo: z.string().optional(),
      renavam: z.string().optional(),
      chassi: z.string().optional(),
      cor: z.string().optional(),
      kmAtual: z.string().optional(),
      responsavel: z.string().optional(),
      motoristaId: z.number().optional(),
      obraId: z.number().optional(),
      statusVeiculo: z.string().optional(),
      dataAquisicao: z.string().optional(),
      valorCompra: z.string().optional(),
      valorFipe: z.string().optional(),
      fipeCodigoMarca: z.string().optional(),
      fipeCodigoModelo: z.string().optional(),
      fipeCodigoAno: z.string().optional(),
      fipeReferencia: z.string().optional(),
      depreciacaoAnos: z.number().optional(),
      valorResidual: z.string().optional(),
      fotoUrl: z.string().optional(),
      crlvUrl: z.string().optional(),
      crlvVencimento: z.string().optional(),
      seguroUrl: z.string().optional(),
      seguroVencimento: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const [v] = await db.insert(vehicles).values({
        companyId: input.companyId,
        tipoVeiculo: input.tipoVeiculo,
        placa: input.placa || null,
        modelo: input.modelo,
        marca: input.marca || null,
        anoFabricacao: input.anoFabricacao || null,
        anoModelo: input.anoModelo || null,
        renavam: input.renavam || null,
        chassi: input.chassi || null,
        cor: input.cor || null,
        kmAtual: input.kmAtual || "0",
        responsavel: input.responsavel || null,
        motoristaId: input.motoristaId || null,
        obraId: input.obraId || null,
        statusVeiculo: input.statusVeiculo || "Ativo",
        dataAquisicao: input.dataAquisicao || null,
        valorCompra: input.valorCompra || null,
        valorFipe: input.valorFipe || null,
        fipeCodigoMarca: input.fipeCodigoMarca || null,
        fipeCodigoModelo: input.fipeCodigoModelo || null,
        fipeCodigoAno: input.fipeCodigoAno || null,
        fipeReferencia: input.fipeReferencia || null,
        depreciacaoAnos: input.depreciacaoAnos || 5,
        valorResidual: input.valorResidual || "0",
        fotoUrl: input.fotoUrl || null,
        crlvUrl: input.crlvUrl || null,
        crlvVencimento: input.crlvVencimento || null,
        seguroUrl: input.seguroUrl || null,
        seguroVencimento: input.seguroVencimento || null,
        observacoes: input.observacoes || null,
      } as any).returning();
      return v;
    }),

  updateVehicle: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      tipoVeiculo: z.string().optional(),
      placa: z.string().optional(),
      modelo: z.string().optional(),
      marca: z.string().optional(),
      anoFabricacao: z.string().optional(),
      anoModelo: z.string().optional(),
      renavam: z.string().optional(),
      chassi: z.string().optional(),
      cor: z.string().optional(),
      kmAtual: z.string().optional(),
      responsavel: z.string().optional(),
      motoristaId: z.number().nullable().optional(),
      obraId: z.number().nullable().optional(),
      statusVeiculo: z.string().optional(),
      dataAquisicao: z.string().nullable().optional(),
      valorCompra: z.string().nullable().optional(),
      valorFipe: z.string().nullable().optional(),
      fipeCodigoMarca: z.string().nullable().optional(),
      fipeCodigoModelo: z.string().nullable().optional(),
      fipeCodigoAno: z.string().nullable().optional(),
      fipeReferencia: z.string().nullable().optional(),
      depreciacaoAnos: z.number().optional(),
      valorResidual: z.string().nullable().optional(),
      fotoUrl: z.string().nullable().optional(),
      crlvUrl: z.string().nullable().optional(),
      crlvVencimento: z.string().nullable().optional(),
      seguroUrl: z.string().nullable().optional(),
      seguroVencimento: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { id, companyId, ...data } = input;
      const setFields: any = { ...data, updatedAt: new Date().toISOString() };
      await db.update(vehicles).set(setFields).where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)));
      return { success: true };
    }),

  uploadVehiclePhoto: protectedProcedure
    .input(z.object({
      vehicleId: z.number(),
      companyId: z.number(),
      base64: z.string(),
      contentType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const buf = Buffer.from(input.base64, 'base64');
      const ext = input.contentType.includes('png') ? 'png' : 'jpg';
      const key = `vehicles/${input.companyId}/${input.vehicleId}_${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buf, input.contentType);
      const fotoUrl = url || `/api/files/${key}`;
      await db.update(vehicles).set({ fotoUrl, updatedAt: new Date().toISOString() } as any)
        .where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.companyId, input.companyId)));
      return { fotoUrl };
    }),

  deleteVehicle: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(vehicles).set({ statusVeiculo: "Inativo", updatedAt: new Date().toISOString() } as any)
        .where(and(eq(vehicles.id, input.id), eq(vehicles.companyId, input.companyId)));
      return { success: true };
    }),

  fipeMarcas: protectedProcedure
    .input(z.object({ tipo: z.string().default("carros") }))
    .query(async ({ input }) => {
      try {
        const res = await fetch(`https://parallelum.com.br/fipe/api/v1/${input.tipo}/marcas`);
        if (!res.ok) return [];
        return await res.json();
      } catch { return []; }
    }),

  fipeModelos: protectedProcedure
    .input(z.object({ tipo: z.string().default("carros"), marcaCodigo: z.string() }))
    .query(async ({ input }) => {
      try {
        const res = await fetch(`https://parallelum.com.br/fipe/api/v1/${input.tipo}/marcas/${input.marcaCodigo}/modelos`);
        if (!res.ok) return { modelos: [], anos: [] };
        return await res.json();
      } catch { return { modelos: [], anos: [] }; }
    }),

  fipeAnos: protectedProcedure
    .input(z.object({ tipo: z.string().default("carros"), marcaCodigo: z.string(), modeloCodigo: z.string() }))
    .query(async ({ input }) => {
      try {
        const res = await fetch(`https://parallelum.com.br/fipe/api/v1/${input.tipo}/marcas/${input.marcaCodigo}/modelos/${input.modeloCodigo}/anos`);
        if (!res.ok) return [];
        return await res.json();
      } catch { return []; }
    }),

  fipeValor: protectedProcedure
    .input(z.object({ tipo: z.string().default("carros"), marcaCodigo: z.string(), modeloCodigo: z.string(), anoCodigo: z.string() }))
    .query(async ({ input }) => {
      try {
        const res = await fetch(`https://parallelum.com.br/fipe/api/v1/${input.tipo}/marcas/${input.marcaCodigo}/modelos/${input.modeloCodigo}/anos/${input.anoCodigo}`);
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    }),

  autoFillFipe: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const userCompanyId = (ctx.user as any)?.companyId;
      if (userCompanyId && userCompanyId !== input.companyId) {
        throw new Error("Acesso negado: empresa inválida");
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let vQuery = sql`SELECT id, modelo, marca, "anoFabricacao", ano_modelo, "tipoVeiculo", fipe_codigo_marca, fipe_codigo_modelo, fipe_codigo_ano, valor_fipe FROM vehicles WHERE "companyId" = ${input.companyId}`;
      if (input.vehicleId) vQuery = sql`${vQuery} AND id = ${input.vehicleId}`;
      const vRes = await db.execute(vQuery);
      const veiculos = (vRes as any).rows || vRes;

      function tipoFipe(tipo: string): string {
        const t = (tipo || "").toLowerCase();
        if (t.includes("caminh")) return "caminhoes";
        if (t.includes("moto")) return "motos";
        return "carros";
      }

      function normalize(s: string): string {
        return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      }

      function similarity(a: string, b: string): number {
        const na = normalize(a);
        const nb = normalize(b);
        if (na === nb) return 1;
        const wordsA = na.split(" ");
        const wordsB = nb.split(" ");
        let matches = 0;
        for (const w of wordsA) {
          if (w.length < 2) continue;
          if (wordsB.some(wb => wb.includes(w) || w.includes(wb))) matches++;
        }
        return wordsA.length > 0 ? matches / Math.max(wordsA.length, 1) : 0;
      }

      const marcasCache: Record<string, any[]> = {};
      async function getMarcas(tipo: string) {
        if (marcasCache[tipo]) return marcasCache[tipo];
        try {
          const res = await fetch(`https://parallelum.com.br/fipe/api/v1/${tipo}/marcas`);
          if (!res.ok) return [];
          marcasCache[tipo] = await res.json();
          return marcasCache[tipo];
        } catch { return []; }
      }

      const results: any[] = [];
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

      for (const v of veiculos) {
        const tipo = tipoFipe(v.tipoVeiculo);
        const result: any = { id: v.id, modelo: v.modelo, marca: v.marca, status: "skipped", detail: "" };

        try {
          const marcas = await getMarcas(tipo);
          if (!marcas.length) { result.detail = "Sem marcas na FIPE para tipo " + tipo; results.push(result); continue; }

          let bestMarca: any = null;
          let bestScore = 0;
          const marcaSearch = (v.marca || "").split("/")[0].trim();
          for (const m of marcas) {
            const score = similarity(marcaSearch, m.nome);
            if (score > bestScore) { bestScore = score; bestMarca = m; }
          }
          if (!bestMarca || bestScore < 0.3) {
            result.detail = `Marca "${marcaSearch}" não encontrada (melhor: ${bestMarca?.nome} score: ${bestScore.toFixed(2)})`;
            results.push(result);
            continue;
          }

          await delay(200);
          let modelosRes: any;
          try {
            const res = await fetch(`https://parallelum.com.br/fipe/api/v1/${tipo}/marcas/${bestMarca.codigo}/modelos`);
            modelosRes = res.ok ? await res.json() : { modelos: [] };
          } catch { modelosRes = { modelos: [] }; }

          const modelos = modelosRes.modelos || [];
          if (!modelos.length) { result.detail = `Sem modelos para marca ${bestMarca.nome}`; results.push(result); continue; }

          let bestModelo: any = null;
          let bestMScore = 0;
          const modeloSearch = (v.modelo || "").replace(/^[A-Z]+\//, "").trim();
          for (const m of modelos) {
            const score = similarity(modeloSearch, m.nome);
            if (score > bestMScore) { bestMScore = score; bestModelo = m; }
          }
          if (!bestModelo || bestMScore < 0.2) {
            result.detail = `Modelo "${modeloSearch}" não encontrado em ${bestMarca.nome} (melhor: ${bestModelo?.nome} score: ${bestMScore.toFixed(2)})`;
            results.push(result);
            continue;
          }

          await delay(200);
          let anosRes: any[];
          try {
            const res = await fetch(`https://parallelum.com.br/fipe/api/v1/${tipo}/marcas/${bestMarca.codigo}/modelos/${bestModelo.codigo}/anos`);
            anosRes = res.ok ? await res.json() : [];
          } catch { anosRes = []; }

          if (!anosRes.length) { result.detail = `Sem anos para ${bestMarca.nome} ${bestModelo.nome}`; results.push(result); continue; }

          const anoTarget = v.ano_modelo || v.anoFabricacao || "";
          let bestAno = anosRes.find((a: any) => a.codigo.startsWith(anoTarget + "-"));
          if (!bestAno) bestAno = anosRes.find((a: any) => a.nome.includes(anoTarget));
          if (!bestAno) bestAno = anosRes[0];

          await delay(200);
          let valorData: any;
          try {
            const res = await fetch(`https://parallelum.com.br/fipe/api/v1/${tipo}/marcas/${bestMarca.codigo}/modelos/${bestModelo.codigo}/anos/${bestAno.codigo}`);
            valorData = res.ok ? await res.json() : null;
          } catch { valorData = null; }

          if (!valorData || !valorData.Valor) {
            result.detail = `Valor não encontrado para ${bestMarca.nome} ${bestModelo.nome} ${bestAno.nome}`;
            results.push(result);
            continue;
          }

          const valorFipe = parseFloat(valorData.Valor.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
          const ref = valorData.MesReferencia || "";

          await db.execute(sql`
            UPDATE vehicles SET
              fipe_codigo_marca = ${String(bestMarca.codigo)},
              fipe_codigo_modelo = ${String(bestModelo.codigo)},
              fipe_codigo_ano = ${bestAno.codigo},
              valor_fipe = ${valorFipe},
              fipe_referencia = ${ref}
            WHERE id = ${v.id}
          `);

          result.status = "updated";
          result.detail = `${bestMarca.nome} > ${bestModelo.nome} > ${bestAno.nome} = ${valorData.Valor} (ref: ${ref})`;
          result.fipeMarca = bestMarca.nome;
          result.fipeModelo = bestModelo.nome;
          result.fipeAno = bestAno.nome;
          result.valorFipe = valorFipe;
          result.valorAnterior = parseFloat(v.valor_fipe) || 0;
        } catch (e: any) {
          result.status = "error";
          result.detail = e.message || "Erro desconhecido";
        }
        results.push(result);
      }

      const updated = results.filter(r => r.status === "updated").length;
      const skipped = results.filter(r => r.status === "skipped").length;
      const errors = results.filter(r => r.status === "error").length;

      return { total: veiculos.length, updated, skipped, errors, results };
    }),

  parseMaintenanceOS: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      base64: z.string().max(15_000_000),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }

      const userCompanyId = (ctx as any).user?.companyId;
      if (userCompanyId && String(userCompanyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta empresa." });
      }

      const decodedSize = Math.ceil(input.base64.length * 3 / 4);
      if (decodedSize > 10 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo muito grande (máx 10MB)." });
      }

      const db = await getDb();

      const vRes = await db.execute(sql`
        SELECT id, placa, modelo, marca, "tipoVeiculo" FROM vehicles
        WHERE "companyId" = ${input.companyId} ORDER BY placa
      `);
      const veiculos = (vRes as any).rows || vRes;
      const listaVeiculos = veiculos.map((v: any) =>
        `ID:${v.id} | Placa: ${v.placa || "S/P"} | ${v.marca} ${v.modelo} (${v.tipoVeiculo})`
      ).join("\n");

      const prompt = `Analise esta Ordem de Serviço (OS) de manutenção de veículo e extraia as informações.

VEÍCULOS CADASTRADOS NA FROTA (use o ID correspondente):
${listaVeiculos}

Retorne APENAS um JSON válido (sem markdown, sem \`\`\`) com esta estrutura:
{
  "success": true,
  "items": [
    {
      "vehicleId": <number - ID do veículo da lista acima que corresponde à placa/modelo da OS>,
      "vehiclePlaca": "<placa encontrada na OS>",
      "vehicleModelo": "<modelo encontrado na OS>",
      "tipo": "corretiva" ou "preventiva",
      "descricao": "<descrição do serviço realizado - inclua o número da OS se houver>",
      "custo": <number - valor total em R$, 0 se não informado>,
      "kmNaManutencao": <number ou null>,
      "fornecedor": "<nome da oficina/fornecedor>",
      "dataManutencao": "<data no formato YYYY-MM-DD>",
      "observacoes": "<detalhes extras, peças trocadas, garantia etc>"
    }
  ],
  "rawText": "<resumo do que foi lido na OS>",
  "confidence": "alta" | "media" | "baixa"
}

Se houver múltiplos serviços/itens na OS, crie um item para cada.
Se não encontrar o veículo na lista, coloque vehicleId: null e preencha placa/modelo encontrados.
Se a data não estiver clara, use a data de hoje: ${new Date().toISOString().slice(0, 10)}.
Se o tipo não estiver claro, assuma "corretiva".
Na descrição, inclua "OS #XXXX — " com o número se houver.`;

      const systemPrompt = `Você é um assistente especialista em manutenção de frotas veiculares no Brasil.
Analise documentos de Ordem de Serviço (OS) de oficinas mecânicas e extraia dados estruturados.
Seja preciso com valores monetários, datas e identificação de veículos.
Sempre retorne JSON válido, sem markdown.`;

      const osItemSchema = z.object({
        vehicleId: z.number().nullable().optional(),
        vehiclePlaca: z.string().optional().default(""),
        vehicleModelo: z.string().optional().default(""),
        tipo: z.string().optional().default("corretiva"),
        descricao: z.string().optional().default("Manutenção importada via OS"),
        custo: z.number().optional().default(0),
        kmNaManutencao: z.number().nullable().optional(),
        fornecedor: z.string().optional().default(""),
        dataManutencao: z.string().optional().default(new Date().toISOString().slice(0, 10)),
        observacoes: z.string().optional().default(""),
      });

      const osResultSchema = z.object({
        success: z.boolean().optional().default(true),
        items: z.array(osItemSchema).optional().default([]),
        rawText: z.string().optional().default(""),
        confidence: z.enum(["alta", "media", "baixa"]).optional().default("media"),
      });

      try {
        const result = await invokeAnthropicVision({
          prompt,
          base64: input.base64,
          mimeType: input.mimeType,
          systemPrompt,
          maxTokens: 2048,
        });

        let cleaned = result.trim();
        if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
        }
        const rawParsed = JSON.parse(cleaned);
        const validated = osResultSchema.parse(rawParsed);

        const vehicleIds = new Set(veiculos.map((v: any) => v.id));
        validated.items = validated.items.map(item => ({
          ...item,
          vehicleId: item.vehicleId && vehicleIds.has(item.vehicleId) ? item.vehicleId : null,
        }));

        return validated;
      } catch (e: any) {
        return {
          success: false,
          error: e.message || "Erro ao processar a OS",
          items: [],
          rawText: "",
          confidence: "baixa" as const,
        };
      }
    }),

  listMaintenances: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT fm.*, v.placa, v.modelo, v.marca,
        COALESCE((SELECT COUNT(*) FROM fleet_maintenance_items mi WHERE mi.maintenance_id = fm.id)::int, 0) as items_count,
        COALESCE((SELECT SUM(valor_total) FROM fleet_maintenance_items mi WHERE mi.maintenance_id = fm.id AND mi.categoria = 'peca'), 0) as total_pecas,
        COALESCE((SELECT SUM(valor_total) FROM fleet_maintenance_items mi WHERE mi.maintenance_id = fm.id AND mi.categoria = 'servico'), 0) as total_servico
        FROM fleet_maintenances fm JOIN vehicles v ON v.id = fm.vehicle_id WHERE fm.company_id = ${input.companyId}`;
      if (input.vehicleId) q = sql`${q} AND fm.vehicle_id = ${input.vehicleId}`;
      if (input.status) q = sql`${q} AND fm.status = ${input.status}`;
      q = sql`${q} ORDER BY fm.data_manutencao DESC`;
      const res = await db.execute(q);
      return (res as any).rows || [];
    }),

  createMaintenance: protectedProcedure
    .input(z.object({
      companyId: z.number(), vehicleId: z.number(), tipo: z.string(), descricao: z.string(),
      custo: z.string().optional(), kmNaManutencao: z.string().optional(), fornecedor: z.string().optional(),
      dataManutencao: z.string(), dataProxima: z.string().optional(), kmProxima: z.string().optional(),
      status: z.string().optional(), observacoes: z.string().optional(), criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const [m] = await db.insert(fleetMaintenances).values({
        companyId: input.companyId, vehicleId: input.vehicleId, tipo: input.tipo, descricao: input.descricao,
        custo: input.custo || "0", kmNaManutencao: input.kmNaManutencao || null, fornecedor: input.fornecedor || null,
        dataManutencao: input.dataManutencao, dataProxima: input.dataProxima || null, kmProxima: input.kmProxima || null,
        status: input.status || "realizada", observacoes: input.observacoes || null, criadoPor: input.criadoPor || null,
      }).returning();
      if (input.kmNaManutencao) {
        await db.update(vehicles).set({ kmAtual: input.kmNaManutencao, updatedAt: new Date().toISOString() } as any)
          .where(eq(vehicles.id, input.vehicleId));
      }
      return m;
    }),

  updateMaintenance: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), tipo: z.string().optional(), descricao: z.string().optional(),
      custo: z.string().optional(), kmNaManutencao: z.string().optional(), fornecedor: z.string().optional(),
      dataManutencao: z.string().optional(), dataProxima: z.string().optional(), kmProxima: z.string().optional(),
      status: z.string().optional(), observacoes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(fleetMaintenances).set({ ...data, updatedAt: new Date().toISOString() } as any)
        .where(and(eq(fleetMaintenances.id, id), eq(fleetMaintenances.companyId, companyId)));
      return { success: true };
    }),

  deleteMaintenance: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(fleetMaintenances).where(and(eq(fleetMaintenances.id, input.id), eq(fleetMaintenances.companyId, input.companyId)));
      return { success: true };
    }),

  listMaintenanceItems: protectedProcedure
    .input(z.object({ companyId: z.number(), maintenanceId: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const res = await db.execute(sql`
        SELECT * FROM fleet_maintenance_items
        WHERE company_id = ${input.companyId} AND maintenance_id = ${input.maintenanceId}
        ORDER BY id ASC
      `);
      return (res as any).rows || [];
    }),

  saveMaintenanceItems: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      maintenanceId: z.number(),
      items: z.array(z.object({
        id: z.number().optional(),
        categoria: z.string(),
        nome: z.string(),
        quantidade: z.number(),
        valorUnitario: z.number(),
        valorTotal: z.number(),
      })),
      updateCusto: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      await db.execute(sql`DELETE FROM fleet_maintenance_items WHERE maintenance_id = ${input.maintenanceId} AND company_id = ${input.companyId}`);
      for (const item of input.items) {
        await db.execute(sql`
          INSERT INTO fleet_maintenance_items (maintenance_id, company_id, categoria, nome, quantidade, valor_unitario, valor_total)
          VALUES (${input.maintenanceId}, ${input.companyId}, ${item.categoria}, ${item.nome}, ${item.quantidade}, ${item.valorUnitario}, ${item.valorTotal})
        `);
      }
      if (input.updateCusto !== false) {
        const totalPecas = input.items.filter(i => i.categoria === 'peca').reduce((s, i) => s + i.valorTotal, 0);
        const totalServico = input.items.filter(i => i.categoria === 'servico').reduce((s, i) => s + i.valorTotal, 0);
        const custoTotal = totalPecas + totalServico;
        await db.execute(sql`
          UPDATE fleet_maintenances SET custo = ${custoTotal.toFixed(2)}, updated_at = NOW()
          WHERE id = ${input.maintenanceId} AND company_id = ${input.companyId}
        `);
      }
      return { success: true, count: input.items.length };
    }),

  uploadMaintenanceAttachment: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      maintenanceId: z.number(),
      fileName: z.string(),
      fileData: z.string(),
      contentType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para esta empresa' });
      }

      const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp', '.xls', '.xlsx', '.txt', '.csv'];
      const ext = (input.fileName.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Tipo de arquivo não permitido (${ext}). Use: ${ALLOWED_EXTENSIONS.join(', ')}` });
      }

      const buffer = Buffer.from(input.fileData, 'base64');
      if (buffer.length > 10 * 1024 * 1024) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo muito grande (máximo 10MB)' });
      }

      const SAFE_CONTENT_TYPES: Record<string, string> = {
        '.pdf': 'application/pdf', '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
        '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.txt': 'text/plain', '.csv': 'text/csv',
      };
      const ct = SAFE_CONTENT_TYPES[ext] || 'application/octet-stream';

      const db = await getDb();
      const existing = await db.execute(sql`SELECT anexos FROM fleet_maintenances WHERE id = ${input.maintenanceId} AND company_id = ${input.companyId}`);
      const rows = (existing as any).rows || [];
      if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Manutenção não encontrada' });

      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageKey = `manutencoes/${input.maintenanceId}/${Date.now()}_${safeFileName}`;
      const { url } = await storagePut(storageKey, buffer, ct);

      const currentAnexos = rows[0].anexos || [];
      const newAnexo = { nome: input.fileName, url, key: storageKey, contentType: ct, tamanho: buffer.length, uploadedAt: new Date().toISOString() };
      const updatedAnexos = [...currentAnexos, newAnexo];

      await db.execute(sql`UPDATE fleet_maintenances SET anexos = ${JSON.stringify(updatedAnexos)}::jsonb, updated_at = NOW() WHERE id = ${input.maintenanceId} AND company_id = ${input.companyId}`);
      return { success: true, anexo: newAnexo, total: updatedAnexos.length };
    }),

  removeMaintenanceAttachment: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      maintenanceId: z.number(),
      key: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para esta empresa' });
      }

      const db = await getDb();
      const existing = await db.execute(sql`SELECT anexos FROM fleet_maintenances WHERE id = ${input.maintenanceId} AND company_id = ${input.companyId}`);
      const rows = (existing as any).rows || [];
      if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Manutenção não encontrada' });

      const currentAnexos = (rows[0].anexos || []) as any[];
      const removedAnexo = currentAnexos.find((a: any) => a.key === input.key);
      const updatedAnexos = currentAnexos.filter((a: any) => a.key !== input.key);

      await db.execute(sql`UPDATE fleet_maintenances SET anexos = ${JSON.stringify(updatedAnexos)}::jsonb, updated_at = NOW() WHERE id = ${input.maintenanceId} AND company_id = ${input.companyId}`);

      if (removedAnexo?.key) {
        try {
          await db.execute(sql`DELETE FROM uploaded_files WHERE file_key = ${removedAnexo.key}`);
        } catch (_e) {}
      }

      return { success: true, total: updatedAnexos.length };
    }),

  listFuelRecords: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT fr.*, v.placa, v.modelo, v.marca FROM fleet_fuel_records fr JOIN vehicles v ON v.id = fr.vehicle_id WHERE fr.company_id = ${input.companyId}`;
      if (input.vehicleId) q = sql`${q} AND fr.vehicle_id = ${input.vehicleId}`;
      q = sql`${q} ORDER BY fr.data DESC, fr.id DESC`;
      const res = await db.execute(q);
      return (res as any).rows || [];
    }),

  createFuelRecord: protectedProcedure
    .input(z.object({
      companyId: z.number(), vehicleId: z.number(), data: z.string(), litros: z.string(), valorTotal: z.string(),
      precoLitro: z.string().optional(), kmAtual: z.string().optional(), kmAnterior: z.string().optional(),
      tipoCombustivel: z.string().optional(), motorista: z.string().optional(), posto: z.string().optional(),
      observacoes: z.string().optional(), criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let consumo: string | null = null;
      if (input.kmAtual && input.kmAnterior) {
        const dist = n(input.kmAtual) - n(input.kmAnterior);
        const lit = n(input.litros);
        if (dist > 0 && lit > 0) consumo = (dist / lit).toFixed(2);
      }
      const precoL = input.precoLitro || (n(input.litros) > 0 ? (n(input.valorTotal) / n(input.litros)).toFixed(4) : null);
      const [r] = await db.insert(fleetFuelRecords).values({
        companyId: input.companyId, vehicleId: input.vehicleId, data: input.data,
        litros: input.litros, valorTotal: input.valorTotal, precoLitro: precoL,
        kmAtual: input.kmAtual || null, kmAnterior: input.kmAnterior || null,
        consumoKmL: consumo, tipoCombustivel: input.tipoCombustivel || "gasolina",
        motorista: input.motorista || null, posto: input.posto || null,
        observacoes: input.observacoes || null, criadoPor: input.criadoPor || null,
      }).returning();
      if (input.kmAtual) {
        await db.update(vehicles).set({ kmAtual: input.kmAtual, updatedAt: new Date().toISOString() } as any)
          .where(eq(vehicles.id, input.vehicleId));
      }
      return r;
    }),

  updateFuelRecord: protectedProcedure
    .input(z.object({
      id: z.number(), companyId: z.number(), vehicleId: z.number().optional(), data: z.string().optional(),
      litros: z.string().optional(), valorTotal: z.string().optional(), precoLitro: z.string().optional(),
      kmAtual: z.string().optional(), tipoCombustivel: z.string().optional(),
      motorista: z.string().optional(), posto: z.string().optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(fleetFuelRecords).set({ ...data, updatedAt: new Date().toISOString() } as any)
        .where(and(eq(fleetFuelRecords.id, id), eq(fleetFuelRecords.companyId, companyId)));
      return { success: true };
    }),

  deleteFuelRecord: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(fleetFuelRecords).where(and(eq(fleetFuelRecords.id, input.id), eq(fleetFuelRecords.companyId, input.companyId)));
      return { success: true };
    }),

  listTracking: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional(), dateFrom: z.string().optional(), dateTo: z.string().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT tp.*, v.placa, v.modelo FROM fleet_tracking_points tp JOIN vehicles v ON v.id = tp.vehicle_id WHERE tp.company_id = ${input.companyId}`;
      if (input.vehicleId) q = sql`${q} AND tp.vehicle_id = ${input.vehicleId}`;
      if (input.dateFrom) q = sql`${q} AND tp.data_hora >= ${input.dateFrom}`;
      if (input.dateTo) q = sql`${q} AND tp.data_hora <= ${input.dateTo}`;
      q = sql`${q} ORDER BY tp.data_hora DESC LIMIT 2000`;
      const res = await db.execute(q);
      return (res as any).rows || [];
    }),

  listTrackingPoints: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional(), from: z.string().optional(), to: z.string().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT tp.*, v.placa, v.modelo FROM fleet_tracking_points tp JOIN vehicles v ON v.id = tp.vehicle_id WHERE tp.company_id = ${input.companyId}`;
      if (input.vehicleId) q = sql`${q} AND tp.vehicle_id = ${input.vehicleId}`;
      if (input.from) q = sql`${q} AND tp.data_hora >= ${input.from}`;
      if (input.to) q = sql`${q} AND tp.data_hora <= ${input.to}`;
      q = sql`${q} ORDER BY tp.data_hora DESC LIMIT 5000`;
      const res = await db.execute(q);
      return (res as any).rows || [];
    }),

  getLatestPositions: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const res = await db.execute(sql`
        SELECT DISTINCT ON (tp.vehicle_id)
          tp.*, v.placa, v.modelo, v.marca, v."tipoVeiculo", v."statusVeiculo"
        FROM fleet_tracking_points tp
        JOIN vehicles v ON v.id = tp.vehicle_id AND v."companyId" = ${input.companyId}
        WHERE tp.company_id = ${input.companyId}
        ORDER BY tp.vehicle_id, tp.data_hora DESC
      `);
      return (res as any).rows || [];
    }),

  importTrackingCsv: protectedProcedure
    .input(z.object({ companyId: z.number(), data: z.array(z.object({
      vehicleId: z.number(), latitude: z.string(), longitude: z.string(),
      dataHora: z.string(), velocidade: z.string().optional(), ignicao: z.boolean().optional(),
    })) }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let inserted = 0;
      for (const p of input.data) {
        await db.insert(fleetTrackingPoints).values({
          companyId: input.companyId, vehicleId: p.vehicleId,
          latitude: p.latitude, longitude: p.longitude,
          velocidade: p.velocidade || null, ignicao: p.ignicao || false,
          dataHora: p.dataHora, origem: "csv",
        });
        inserted++;
      }
      return { inserted };
    }),

  importFuelCsv: protectedProcedure
    .input(z.object({ companyId: z.number(), criadoPor: z.string().optional(), data: z.array(z.object({
      vehicleId: z.number(), data: z.string(), litros: z.string(), valorTotal: z.string(),
      precoLitro: z.string().optional(), kmAtual: z.string().optional(), kmAnterior: z.string().optional(),
      tipoCombustivel: z.string().optional(), motorista: z.string().optional(), posto: z.string().optional(),
    })) }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();

      const aliasRes = await db.execute(sql`
        SELECT alias_name, canonical_name FROM fleet_driver_aliases WHERE company_id = ${input.companyId}
      `);
      const aliasMap: Record<string, string> = {};
      for (const a of ((aliasRes as any).rows || aliasRes) as any[]) {
        aliasMap[a.alias_name.trim().toUpperCase()] = a.canonical_name;
      }

      let inserted = 0;
      for (const r of input.data) {
        let consumo: string | null = null;
        if (r.kmAtual && r.kmAnterior) {
          const dist = n(r.kmAtual) - n(r.kmAnterior);
          const lit = n(r.litros);
          if (dist > 0 && lit > 0) consumo = (dist / lit).toFixed(2);
        }
        let motorista = r.motorista || null;
        if (motorista) {
          const key = motorista.trim().toUpperCase();
          if (aliasMap[key]) motorista = aliasMap[key];
        }
        await db.insert(fleetFuelRecords).values({
          companyId: input.companyId, vehicleId: r.vehicleId, data: r.data,
          litros: r.litros, valorTotal: r.valorTotal,
          precoLitro: r.precoLitro || null, kmAtual: r.kmAtual || null, kmAnterior: r.kmAnterior || null,
          consumoKmL: consumo, tipoCombustivel: r.tipoCombustivel || "gasolina",
          motorista, posto: r.posto || null,
          criadoPor: input.criadoPor || null,
        });
        inserted++;
      }
      return { inserted };
    }),

  importFuelPdf: protectedProcedure
    .input(z.object({ companyId: z.number(), pdfBase64: z.string(), criadoPor: z.string().optional() }))
    .mutation(async ({ input }) => {
      try {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let pdfParse: any;
      try {
        const mod = await import('pdf-parse');
        pdfParse = mod.default || mod;
      } catch (e: any) {
        console.error('[FuelPDF] pdf-parse not available:', e.message);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Módulo pdf-parse não disponível. Contate o suporte.' });
      }
      const buf = Buffer.from(input.pdfBase64, 'base64');
      console.log('[FuelPDF] Buffer size:', buf.length);
      if (buf.length < 100) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo PDF inválido ou muito pequeno.' });
      }
      let pdfData: any;
      try {
        pdfData = await pdfParse(buf);
      } catch (e: any) {
        console.error('[FuelPDF] Erro ao processar PDF:', e.message);
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Erro ao ler o PDF. Verifique se o arquivo não está corrompido ou protegido.' });
      }
      const text = pdfData?.text || '';
      if (!text || text.length < 10) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'PDF não contém texto legível. Pode ser uma imagem/escaneado.' });
      }
      console.log('[FuelPDF] Text length:', text.length, '| First 300 chars:', text.substring(0, 300));

      const vRows = await db.execute(sql`SELECT id, placa FROM vehicles WHERE "companyId" = ${input.companyId} AND placa IS NOT NULL`);
      const vehicleList = (vRows as any).rows as { id: number; placa: string }[];
      const plateToVehicle: Record<string, number> = {};
      for (const v of vehicleList) if (v.placa) plateToVehicle[v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '')] = v.id;
      const knownPlates = Object.keys(plateToVehicle);
      console.log('[FuelPDF] Known plates:', knownPlates.join(', '));
      if (knownPlates.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum veículo com placa cadastrada' });

      const eRows = await db.execute(sql`SELECT id, "nomeCompleto" FROM employees WHERE "companyId" = ${input.companyId}`);
      const empList = (eRows as any).rows as { id: number; nomeCompleto: string }[];

      const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
      function matchEmployee(pdfName: string) {
        if (!pdfName || pdfName.length < 2) return null;
        const pn = norm(pdfName);
        const pTokens = pn.split(/\s+/).filter((t: string) => t.length > 2);
        if (pTokens.length === 0) return null;
        let best: { id: number; nomeCompleto: string } | null = null;
        let bestScore = 0;
        for (const emp of empList) {
          const en = norm(emp.nomeCompleto);
          const eTokens = en.split(/\s+/);
          let matchCount = 0;
          for (const pt of pTokens) {
            for (const et of eTokens) {
              if (pt === et || (pt.length > 3 && et.length > 3 && (pt.includes(et) || et.includes(pt)))) {
                matchCount++;
                break;
              }
            }
          }
          const score = matchCount / pTokens.length;
          if (score > bestScore && matchCount >= Math.min(2, pTokens.length)) {
            bestScore = score;
            best = emp;
          }
        }
        return best;
      }

      const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      const dateRe = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      const timeRe = /^\d{2}:\d{2}/;
      const platePattern = knownPlates.map((p: string) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const plateRe = new RegExp(`(${platePattern})`);
      const skipRe = /^(logo|Auto Posto|Relatorio|Numero de registros|Data$|Num\.$|Doc\.$|MotoristaPlaca|KM$|Ant\.$|Atual$|MediaProdutoQuantidade|Valor$|unit\.$|Valor desc|https:|postogestor|\d+\/\d+$)/;

      interface ParsedRecord {
        date: string; numDoc: string; driver: string; plate: string;
        tipoCombustivel: string; litros: string; precoLitro: string;
        desconto: string; valorTotal: string;
      }
      const parsed: ParsedRecord[] = [];

      let i = 0;
      while (i < lines.length) {
        if (skipRe.test(lines[i]) || /^Totais Placa:/.test(lines[i])) { i++; continue; }
        const dm = lines[i].match(dateRe);
        if (!dm) { i++; continue; }
        const dateStr = `${dm[3]}-${dm[2]}-${dm[1]}`;
        i++;
        if (i >= lines.length) break;
        if (!timeRe.test(lines[i])) continue;
        i++;
        if (i >= lines.length) break;

        const bLines: string[] = [];
        while (i < lines.length) {
          const cl = lines[i];
          if (dateRe.test(cl)) break;
          if (/^Totais Placa:/.test(cl)) { i++; break; }
          if (skipRe.test(cl)) { i++; continue; }
          bLines.push(cl);
          i++;
        }
        if (bLines.length === 0) continue;

        const blockText = bLines.join('\u0000');
        const pm = blockText.match(plateRe);
        if (!pm) continue;
        const plate = pm[1];

        let numDoc = '';
        const driverParts: string[] = [];
        let valuesStr = '';
        let productParts: string[] = [];
        let foundValues = false;

        for (const bl of bLines) {
          const hasPl = plateRe.test(bl);
          const rCount = (bl.match(/R\$/g) || []).length;

          if (hasPl && rCount >= 2) {
            const pidx = bl.indexOf(plate);
            const before = bl.substring(0, pidx);
            const after = bl.substring(pidx + plate.length);
            const ndm = before.match(/^(\d+)/);
            if (ndm && !numDoc) numDoc = ndm[1];
            const nameInBefore = before.replace(/^\d+/, '').trim();
            if (nameInBefore) driverParts.push(nameInBefore);
            const firstR = after.indexOf('R$');
            const beforeR = after.substring(0, firstR);
            const rSection = after.substring(firstR);
            let productInBefore = beforeR.replace(/^[\d,]+/, '');
            const knownProducts = [
              /OLEO\s*DIESEL\s*S10/i, /OLEO\s*DIESEL\s*S500/i, /OLEO\s*DIESEL/i,
              /GASOLINA\s*ADITIVADA/i, /GASOLINA\s*COMUM/i, /GASOLINA/i,
              /DIESEL\s*S10/i, /DIESEL\s*S500/i, /DIESEL/i,
              /ETANOL/i, /GNV/i,
            ];
            let prodMatched = '';
            for (const kp of knownProducts) {
              const km = productInBefore.match(kp);
              if (km) {
                prodMatched = km[0];
                productInBefore = productInBefore.substring(productInBefore.indexOf(prodMatched) + prodMatched.length);
                break;
              }
            }
            const qm = productInBefore.match(/([\d.]+)\s*$/);
            const qty = qm ? qm[1] : '0';
            if (prodMatched) productParts.push(prodMatched);
            else {
              const prodText = productInBefore.replace(/([\d.]+)\s*$/, '').trim();
              if (prodText) productParts.push(prodText);
            }
            valuesStr = qty + rSection;
            foundValues = true;
          } else if (hasPl) {
            const pidx = bl.indexOf(plate);
            const before = bl.substring(0, pidx);
            const ndm = before.match(/^(\d+)/);
            if (ndm && !numDoc) numDoc = ndm[1];
            const nameInBefore = before.replace(/^\d+/, '').trim();
            if (nameInBefore) driverParts.push(nameInBefore);
          } else if (rCount >= 2 && !foundValues) {
            valuesStr = bl;
            foundValues = true;
          } else if (/GASOLINA|DIESEL|ETANOL|COMUM|GNV/i.test(bl) && !foundValues) {
            productParts.push(bl);
          } else if (/^\d+$/.test(bl) && !numDoc) {
            numDoc = bl;
          } else if (/^\d+[A-Z]/.test(bl) && !numDoc) {
            const ndm = bl.match(/^(\d+)/);
            if (ndm) numDoc = ndm[1];
            const rest = bl.replace(/^\d+/, '').trim();
            if (rest && !plateRe.test(rest)) driverParts.push(rest);
          } else if (/^[A-ZÀ-Ú\s]+$/i.test(bl) && bl.length > 1 && !foundValues) {
            if (!/GASOLINA|DIESEL|ETANOL|COMUM|GNV|LUBRAX|CASTROL|FILTRO|ARLA/i.test(bl)) {
              driverParts.push(bl);
            } else {
              productParts.push(bl);
            }
          } else if (/^[\d.]+$/.test(bl) && !foundValues) {
            valuesStr = bl;
          }
        }

        if (!foundValues && valuesStr) {
          const nextBLines = [];
          let j = i;
          while (j < lines.length && nextBLines.length < 3) {
            if (dateRe.test(lines[j]) || /^Totais Placa:/.test(lines[j])) break;
            if (skipRe.test(lines[j])) { j++; continue; }
            nextBLines.push(lines[j]);
            j++;
          }
          for (const nb of nextBLines) {
            if ((nb.match(/R\$/g) || []).length >= 2) {
              valuesStr = valuesStr + nb;
              foundValues = true;
              break;
            }
          }
        }

        if (!foundValues) continue;

        const productText = productParts.join(' ').toUpperCase();
        let tipoCombustivel = '';
        if (/DIESEL\s*S10|OLEO\s*DIESEL\s*S10/i.test(productText)) tipoCombustivel = 'Diesel S10';
        else if (/DIESEL/i.test(productText)) tipoCombustivel = 'Diesel';
        else if (/GASOLINA/i.test(productText)) tipoCombustivel = 'Gasolina';
        else if (/ETANOL/i.test(productText)) tipoCombustivel = 'Etanol';
        else if (/GNV/i.test(productText)) tipoCombustivel = 'GNV';
        else continue;

        const rMatches = [...valuesStr.matchAll(/R\$\s*([\d.,]+)/g)].map((m: RegExpMatchArray) => m[1]);
        if (rMatches.length < 2) continue;
        const firstR = valuesStr.indexOf('R$');
        const qtyStr = valuesStr.substring(0, firstR).trim();

        const normVal = (v: string) => v.replace(/\./g, '').replace(',', '.');
        let valorUnit = '0', valorDesc = '0', valorTotal = '0';
        if (rMatches.length >= 3) {
          valorUnit = normVal(rMatches[rMatches.length - 3]);
          valorDesc = normVal(rMatches[rMatches.length - 2]);
          valorTotal = normVal(rMatches[rMatches.length - 1]);
        } else {
          valorDesc = normVal(rMatches[0]);
          valorTotal = normVal(rMatches[1]);
        }

        parsed.push({
          date: dateStr, numDoc,
          driver: driverParts.join(' ').replace(/\s+/g, ' ').trim(),
          plate, tipoCombustivel,
          litros: qtyStr.replace(',', '.') || '0',
          precoLitro: valorUnit,
          desconto: valorDesc,
          valorTotal,
        });
      }

      const firstRec = parsed.length > 0 ? JSON.stringify(parsed[0]) : 'No records found';
      console.log('[FuelPDF] Parsed records:', parsed.length, firstRec);
      if (parsed.length === 0) {
        const dateMatches = text.match(/\d{2}\/\d{2}\/\d{4}/g);
        const plateMatches = text.match(new RegExp(platePattern, 'g'));
        console.log('[FuelPDF] Debug: dates found in text:', dateMatches?.length || 0, '| plates found:', plateMatches?.length || 0);
        console.log('[FuelPDF] First 10 lines:', lines.slice(0, 10).join(' | '));
      }

      let inserted = 0, duplicates = 0, noVehicle = 0;
      const matchedDrivers: Record<string, string> = {};
      const unmatchedDrivers: Set<string> = new Set();

      const existingRes = await db.execute(
        sql`SELECT vehicle_id, data, num_doc FROM fleet_fuel_records WHERE company_id = ${input.companyId} AND num_doc IS NOT NULL`
      );
      const existingSet = new Set(
        ((existingRes as any).rows || []).map((r: any) => `${r.vehicle_id}|${r.data}|${r.num_doc}`)
      );

      const aliasRes = await db.execute(sql`
        SELECT alias_name, canonical_name FROM fleet_driver_aliases WHERE company_id = ${input.companyId}
      `);
      const aliasMap: Record<string, string> = {};
      for (const a of ((aliasRes as any).rows || aliasRes) as any[]) {
        aliasMap[a.alias_name.trim().toUpperCase()] = a.canonical_name;
      }

      const toInsert: any[] = [];
      for (const rec of parsed) {
        const vehicleId = plateToVehicle[rec.plate];
        if (!vehicleId) { noVehicle++; continue; }

        if (rec.numDoc && existingSet.has(`${vehicleId}|${rec.date}|${rec.numDoc}`)) {
          duplicates++;
          continue;
        }

        let motoristaFinal = rec.driver;
        if (rec.driver) {
          const driverUpper = rec.driver.trim().toUpperCase();
          if (aliasMap[driverUpper]) {
            motoristaFinal = aliasMap[driverUpper];
            matchedDrivers[rec.driver] = aliasMap[driverUpper];
          } else {
            const emp = matchEmployee(rec.driver);
            if (emp) {
              motoristaFinal = emp.nomeCompleto;
              matchedDrivers[rec.driver] = emp.nomeCompleto;
            } else {
              unmatchedDrivers.add(rec.driver);
            }
          }
        }

        const litros = n(rec.litros);
        if (litros <= 0 || litros > 1000) continue;

        toInsert.push({
          companyId: input.companyId, vehicleId, data: rec.date,
          litros: rec.litros, valorTotal: rec.valorTotal,
          precoLitro: n(rec.precoLitro) > 0 ? rec.precoLitro : (litros > 0 ? (n(rec.valorTotal) / litros).toFixed(4) : null),
          tipoCombustivel: rec.tipoCombustivel,
          motorista: motoristaFinal || null,
          posto: 'Auto Posto Umuarama',
          numDoc: rec.numDoc || null,
          desconto: n(rec.desconto) > 0 ? rec.desconto : null,
          criadoPor: input.criadoPor || 'PDF Import',
        });
      }

      const BATCH = 50;
      for (let b = 0; b < toInsert.length; b += BATCH) {
        const chunk = toInsert.slice(b, b + BATCH);
        try {
          await db.insert(fleetFuelRecords).values(chunk as any);
          inserted += chunk.length;
        } catch (dbErr: any) {
          for (const row of chunk) {
            try {
              await db.insert(fleetFuelRecords).values(row as any);
              inserted++;
            } catch (singleErr: any) {
              console.error('[FuelPDF] Insert error:', singleErr.message);
            }
          }
        }
      }

      console.log('[FuelPDF] Done:', inserted, 'inserted,', duplicates, 'duplicates,', noVehicle, 'noVehicle');
      return {
        inserted, duplicates, noVehicle,
        totalParsed: parsed.length,
        matchedDrivers: Object.entries(matchedDrivers).map(([pdf, emp]) => `${pdf} → ${emp}`),
        unmatchedDrivers: [...unmatchedDrivers],
      };
      } catch (outerErr: any) {
        if (outerErr instanceof TRPCError) throw outerErr;
        console.error('[FuelPDF] Unexpected error:', outerErr.message, outerErr.stack?.substring(0, 500));
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro inesperado ao processar PDF: ' + (outerErr.message || 'Erro desconhecido') });
      }
    }),

  previewFuelPdf: protectedProcedure
    .input(z.object({ companyId: z.number(), pdfBase64: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let pdfParse: any;
      try {
        const mod = await import('pdf-parse');
        pdfParse = mod.default || mod;
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Módulo pdf-parse não disponível.' });
      }
      const buf = Buffer.from(input.pdfBase64, 'base64');
      if (buf.length < 100) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo PDF inválido ou muito pequeno.' });
      let pdfData: any;
      try { pdfData = await pdfParse(buf); } catch (e: any) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Erro ao ler o PDF.' });
      }
      const text = pdfData?.text || '';
      if (!text || text.length < 10) throw new TRPCError({ code: 'BAD_REQUEST', message: 'PDF não contém texto legível.' });

      const vRows = await db.execute(sql`SELECT id, placa, modelo, marca FROM vehicles WHERE "companyId" = ${input.companyId} AND placa IS NOT NULL`);
      const vehicleList = (vRows as any).rows as { id: number; placa: string; modelo: string; marca: string }[];
      const plateToVehicle: Record<string, { id: number; placa: string; modelo: string; marca: string }> = {};
      for (const v of vehicleList) if (v.placa) plateToVehicle[v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '')] = v;
      const knownPlates = Object.keys(plateToVehicle);
      if (knownPlates.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum veículo com placa cadastrada' });

      const eRows = await db.execute(sql`SELECT id, "nomeCompleto" FROM employees WHERE "companyId" = ${input.companyId}`);
      const empList = (eRows as any).rows as { id: number; nomeCompleto: string }[];

      const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
      function matchEmployee(pdfName: string) {
        if (!pdfName || pdfName.length < 2) return null;
        const pn = norm(pdfName);
        const pTokens = pn.split(/\s+/).filter((t: string) => t.length > 2);
        if (pTokens.length === 0) return null;
        let best: { id: number; nomeCompleto: string } | null = null;
        let bestScore = 0;
        for (const emp of empList) {
          const en = norm(emp.nomeCompleto);
          const eTokens = en.split(/\s+/);
          let matchCount = 0;
          for (const pt of pTokens) {
            for (const et of eTokens) {
              if (pt === et || (pt.length > 3 && et.length > 3 && (pt.includes(et) || et.includes(pt)))) { matchCount++; break; }
            }
          }
          const score = matchCount / pTokens.length;
          if (score > bestScore && matchCount >= Math.min(2, pTokens.length)) { bestScore = score; best = emp; }
        }
        return best;
      }

      const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      const dateRe = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      const timeRe = /^\d{2}:\d{2}/;
      const platePattern = knownPlates.map((p: string) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const plateRe = new RegExp(`(${platePattern})`);
      const skipRe = /^(logo|Auto Posto|Relatorio|Numero de registros|Data$|Num\.$|Doc\.$|MotoristaPlaca|KM$|Ant\.$|Atual$|MediaProdutoQuantidade|Valor$|unit\.$|Valor desc|https:|postogestor|\d+\/\d+$)/;

      interface ParsedRecord {
        date: string; numDoc: string; driver: string; plate: string;
        tipoCombustivel: string; litros: string; precoLitro: string;
        desconto: string; valorTotal: string;
      }
      const parsed: ParsedRecord[] = [];

      let i = 0;
      while (i < lines.length) {
        if (skipRe.test(lines[i]) || /^Totais Placa:/.test(lines[i])) { i++; continue; }
        const dm = lines[i].match(dateRe);
        if (!dm) { i++; continue; }
        const dateStr = `${dm[3]}-${dm[2]}-${dm[1]}`;
        i++;
        if (i >= lines.length) break;
        if (!timeRe.test(lines[i])) continue;
        i++;
        if (i >= lines.length) break;

        const bLines: string[] = [];
        while (i < lines.length) {
          const cl = lines[i];
          if (dateRe.test(cl)) break;
          if (/^Totais Placa:/.test(cl)) { i++; break; }
          if (skipRe.test(cl)) { i++; continue; }
          bLines.push(cl);
          i++;
        }
        if (bLines.length === 0) continue;

        const blockText = bLines.join('\u0000');
        const pm = blockText.match(plateRe);
        if (!pm) continue;
        const plate = pm[1];

        let numDoc = '';
        const driverParts: string[] = [];
        let valuesStr = '';
        let productParts: string[] = [];
        let foundValues = false;

        for (const bl of bLines) {
          const hasPl = plateRe.test(bl);
          const rCount = (bl.match(/R\$/g) || []).length;

          if (hasPl && rCount >= 2) {
            const pidx = bl.indexOf(plate);
            const before = bl.substring(0, pidx);
            const after = bl.substring(pidx + plate.length);
            const ndm = before.match(/^(\d+)/);
            if (ndm && !numDoc) numDoc = ndm[1];
            const nameInBefore = before.replace(/^\d+/, '').trim();
            if (nameInBefore) driverParts.push(nameInBefore);
            const firstR = after.indexOf('R$');
            const beforeR = after.substring(0, firstR);
            const rSection = after.substring(firstR);
            let productInBefore = beforeR.replace(/^[\d,]+/, '');
            const knownProducts = [
              /OLEO\s*DIESEL\s*S10/i, /OLEO\s*DIESEL\s*S500/i, /OLEO\s*DIESEL/i,
              /GASOLINA\s*ADITIVADA/i, /GASOLINA\s*COMUM/i, /GASOLINA/i,
              /DIESEL\s*S10/i, /DIESEL\s*S500/i, /DIESEL/i,
              /ETANOL/i, /GNV/i,
            ];
            let prodMatched = '';
            for (const kp of knownProducts) {
              const km = productInBefore.match(kp);
              if (km) { prodMatched = km[0]; productInBefore = productInBefore.substring(productInBefore.indexOf(prodMatched) + prodMatched.length); break; }
            }
            const qm = productInBefore.match(/([\d.]+)\s*$/);
            const qty = qm ? qm[1] : '0';
            if (prodMatched) productParts.push(prodMatched);
            else { const prodText = productInBefore.replace(/([\d.]+)\s*$/, '').trim(); if (prodText) productParts.push(prodText); }
            valuesStr = qty + rSection;
            foundValues = true;
          } else if (hasPl) {
            const pidx = bl.indexOf(plate);
            const before = bl.substring(0, pidx);
            const ndm = before.match(/^(\d+)/);
            if (ndm && !numDoc) numDoc = ndm[1];
            const nameInBefore = before.replace(/^\d+/, '').trim();
            if (nameInBefore) driverParts.push(nameInBefore);
          } else if (rCount >= 2 && !foundValues) {
            valuesStr = bl; foundValues = true;
          } else if (/GASOLINA|DIESEL|ETANOL|COMUM|GNV/i.test(bl) && !foundValues) {
            productParts.push(bl);
          } else if (/^\d+$/.test(bl) && !numDoc) {
            numDoc = bl;
          } else if (/^\d+[A-Z]/.test(bl) && !numDoc) {
            const ndm = bl.match(/^(\d+)/);
            if (ndm) numDoc = ndm[1];
            const rest = bl.replace(/^\d+/, '').trim();
            if (rest && !plateRe.test(rest)) driverParts.push(rest);
          } else if (/^[A-ZÀ-Ú\s]+$/i.test(bl) && bl.length > 1 && !foundValues) {
            if (!/GASOLINA|DIESEL|ETANOL|COMUM|GNV|LUBRAX|CASTROL|FILTRO|ARLA/i.test(bl)) driverParts.push(bl);
            else productParts.push(bl);
          } else if (/^[\d.]+$/.test(bl) && !foundValues) {
            valuesStr = bl;
          }
        }

        if (!foundValues && valuesStr) {
          const nextBLines: string[] = [];
          let j = i;
          while (j < lines.length && nextBLines.length < 3) {
            if (dateRe.test(lines[j]) || /^Totais Placa:/.test(lines[j])) break;
            if (skipRe.test(lines[j])) { j++; continue; }
            nextBLines.push(lines[j]); j++;
          }
          for (const nb of nextBLines) {
            if ((nb.match(/R\$/g) || []).length >= 2) { valuesStr = valuesStr + nb; foundValues = true; break; }
          }
        }

        if (!foundValues) continue;

        const productText = productParts.join(' ').toUpperCase();
        let tipoCombustivel = '';
        if (/DIESEL\s*S10|OLEO\s*DIESEL\s*S10/i.test(productText)) tipoCombustivel = 'Diesel S10';
        else if (/DIESEL/i.test(productText)) tipoCombustivel = 'Diesel';
        else if (/GASOLINA/i.test(productText)) tipoCombustivel = 'Gasolina';
        else if (/ETANOL/i.test(productText)) tipoCombustivel = 'Etanol';
        else if (/GNV/i.test(productText)) tipoCombustivel = 'GNV';
        else continue;

        const rMatches = [...valuesStr.matchAll(/R\$\s*([\d.,]+)/g)].map((m: RegExpMatchArray) => m[1]);
        if (rMatches.length < 2) continue;
        const firstR = valuesStr.indexOf('R$');
        const qtyStr = valuesStr.substring(0, firstR).trim();

        const normVal = (v: string) => v.replace(/\./g, '').replace(',', '.');
        let valorUnit = '0', valorDesc = '0', valorTotal = '0';
        if (rMatches.length >= 3) {
          valorUnit = normVal(rMatches[rMatches.length - 3]);
          valorDesc = normVal(rMatches[rMatches.length - 2]);
          valorTotal = normVal(rMatches[rMatches.length - 1]);
        } else {
          valorDesc = normVal(rMatches[0]);
          valorTotal = normVal(rMatches[1]);
        }

        parsed.push({
          date: dateStr, numDoc,
          driver: driverParts.join(' ').replace(/\s+/g, ' ').trim(),
          plate, tipoCombustivel,
          litros: qtyStr.replace(',', '.') || '0',
          precoLitro: valorUnit, desconto: valorDesc, valorTotal,
        });
      }

      const aliasRes = await db.execute(sql`SELECT alias_name, canonical_name FROM fleet_driver_aliases WHERE company_id = ${input.companyId}`);
      const aliasMap: Record<string, string> = {};
      for (const a of ((aliasRes as any).rows || aliasRes) as any[]) {
        aliasMap[a.alias_name.trim().toUpperCase()] = a.canonical_name;
      }

      const existingRes = await db.execute(
        sql`SELECT vehicle_id, data, num_doc FROM fleet_fuel_records WHERE company_id = ${input.companyId} AND num_doc IS NOT NULL`
      );
      const existingSet = new Set(
        ((existingRes as any).rows || []).map((r: any) => `${r.vehicle_id}|${r.data}|${r.num_doc}`)
      );

      const matchedDriversMap: Record<string, { employeeName: string; source: string }> = {};
      const unmatchedDriversSet = new Set<string>();

      const previewRecords: any[] = [];
      let duplicates = 0, noVehicle = 0;

      for (const rec of parsed) {
        const veh = plateToVehicle[rec.plate];
        if (!veh) { noVehicle++; continue; }

        const isDuplicate = !!(rec.numDoc && existingSet.has(`${veh.id}|${rec.date}|${rec.numDoc}`));
        if (isDuplicate) { duplicates++; }

        const litros = parseFloat(rec.litros);
        if (litros <= 0 || litros > 1000) continue;

        let driverMatched: string | null = null;
        let matchSource: string | null = null;

        if (rec.driver) {
          const driverUpper = rec.driver.trim().toUpperCase();
          if (aliasMap[driverUpper]) {
            driverMatched = aliasMap[driverUpper];
            matchSource = 'alias';
            matchedDriversMap[rec.driver] = { employeeName: aliasMap[driverUpper], source: 'alias' };
          } else {
            const emp = matchEmployee(rec.driver);
            if (emp) {
              driverMatched = emp.nomeCompleto;
              matchSource = 'fuzzy';
              matchedDriversMap[rec.driver] = { employeeName: emp.nomeCompleto, source: 'fuzzy' };
            } else {
              unmatchedDriversSet.add(rec.driver);
            }
          }
        }

        previewRecords.push({
          date: rec.date, numDoc: rec.numDoc, plate: rec.plate,
          vehicleId: veh.id, vehicleLabel: `${veh.placa} - ${veh.marca || ''} ${veh.modelo || ''}`.trim(),
          tipoCombustivel: rec.tipoCombustivel,
          litros: rec.litros, precoLitro: rec.precoLitro,
          desconto: rec.desconto, valorTotal: rec.valorTotal,
          driverPdf: rec.driver, driverMatched, matchSource,
          isDuplicate,
        });
      }

      const matchedDrivers = Object.entries(matchedDriversMap).map(([pdf, m]) => ({
        pdfName: pdf, employeeName: m.employeeName, source: m.source,
      }));

      return {
        totalParsed: parsed.length,
        duplicates,
        noVehicle,
        records: previewRecords,
        matchedDrivers,
        unmatchedDrivers: [...unmatchedDriversSet],
        employees: empList.map(e => ({ id: e.id, nomeCompleto: e.nomeCompleto })).sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto)),
      };
      } catch (outerErr: any) {
        if (outerErr instanceof TRPCError) throw outerErr;
        console.error('[FuelPDF Preview] Unexpected error:', outerErr.message);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao analisar PDF: ' + (outerErr.message || 'Erro desconhecido') });
      }
    }),

  confirmFuelImport: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      records: z.array(z.object({
        vehicleId: z.number(),
        date: z.string(),
        litros: z.string(),
        valorTotal: z.string(),
        precoLitro: z.string(),
        tipoCombustivel: z.string(),
        motorista: z.string().nullable(),
        numDoc: z.string().nullable(),
        desconto: z.string().nullable(),
      })),
      driverMappings: z.array(z.object({
        pdfName: z.string(),
        canonicalName: z.string(),
      })),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();

      const vRows = await db.execute(sql`SELECT id FROM vehicles WHERE "companyId" = ${input.companyId}`);
      const validVehicleIds = new Set(((vRows as any).rows || []).map((r: any) => r.id));
      const validRecords = input.records.filter(r => validVehicleIds.has(r.vehicleId));

      const existingRes = await db.execute(
        sql`SELECT vehicle_id, data, num_doc FROM fleet_fuel_records WHERE company_id = ${input.companyId} AND num_doc IS NOT NULL`
      );
      const existingSet = new Set(
        ((existingRes as any).rows || []).map((r: any) => `${r.vehicle_id}|${r.data}|${r.num_doc}`)
      );
      const nonDupRecords = validRecords.filter(r => !(r.numDoc && existingSet.has(`${r.vehicleId}|${r.date}|${r.numDoc}`)));

      for (const mapping of input.driverMappings) {
        if (!mapping.pdfName || !mapping.canonicalName) continue;
        const aliasUpper = mapping.pdfName.trim().toUpperCase();
        const existing = await db.execute(sql`
          SELECT id FROM fleet_driver_aliases WHERE company_id = ${input.companyId} AND alias_name = ${aliasUpper}
        `);
        if (((existing as any).rows || []).length === 0) {
          await db.execute(sql`
            INSERT INTO fleet_driver_aliases (company_id, alias_name, canonical_name)
            VALUES (${input.companyId}, ${aliasUpper}, ${mapping.canonicalName})
          `);
        }
      }

      let inserted = 0;
      const BATCH = 50;
      const toInsert = nonDupRecords.map(r => ({
        companyId: input.companyId,
        vehicleId: r.vehicleId,
        data: r.date,
        litros: r.litros,
        valorTotal: r.valorTotal,
        precoLitro: parseFloat(r.precoLitro) > 0 ? r.precoLitro : (parseFloat(r.litros) > 0 ? (parseFloat(r.valorTotal) / parseFloat(r.litros)).toFixed(4) : null),
        tipoCombustivel: r.tipoCombustivel,
        motorista: r.motorista || null,
        posto: 'Auto Posto Umuarama',
        numDoc: r.numDoc || null,
        desconto: r.desconto && parseFloat(r.desconto) > 0 ? r.desconto : null,
        criadoPor: input.criadoPor || 'PDF Import',
      }));

      for (let b = 0; b < toInsert.length; b += BATCH) {
        const chunk = toInsert.slice(b, b + BATCH);
        try {
          await db.insert(fleetFuelRecords).values(chunk as any);
          inserted += chunk.length;
        } catch (dbErr: any) {
          for (const row of chunk) {
            try {
              await db.insert(fleetFuelRecords).values(row as any);
              inserted++;
            } catch (singleErr: any) {
              console.error('[FuelImport] Insert error:', singleErr.message);
            }
          }
        }
      }

      return { inserted, aliasesCreated: input.driverMappings.length };
      } catch (outerErr: any) {
        if (outerErr instanceof TRPCError) throw outerErr;
        console.error('[FuelImport Confirm] Unexpected error:', outerErr.message);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao importar: ' + (outerErr.message || 'Erro desconhecido') });
      }
    }),

  listFines: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT f.*, v.placa, v.modelo, v.marca FROM fleet_fines f JOIN vehicles v ON v.id = f.vehicle_id WHERE f.company_id = ${input.companyId}`;
      if (input.vehicleId) q = sql`${q} AND f.vehicle_id = ${input.vehicleId}`;
      if (input.status) q = sql`${q} AND f.status = ${input.status}`;
      q = sql`${q} ORDER BY f.data_infracao DESC`;
      const res = await db.execute(q);
      return (res as any).rows || [];
    }),

  createFine: protectedProcedure
    .input(z.object({
      companyId: z.number(), vehicleId: z.number(), autoInfracao: z.string().optional(),
      dataInfracao: z.string(), dataVencimento: z.string().optional(), codigoInfracao: z.string().optional(),
      descricao: z.string(), gravidade: z.string().optional(), pontos: z.number().optional(),
      valorOriginal: z.string(), valorComDesconto: z.string().optional(),
      motorista: z.string().optional(), local: z.string().optional(),
      observacoes: z.string().optional(), criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const [f] = await db.insert(fleetFines).values({
        companyId: input.companyId, vehicleId: input.vehicleId,
        autoInfracao: input.autoInfracao || null, dataInfracao: input.dataInfracao,
        dataVencimento: input.dataVencimento || null, codigoInfracao: input.codigoInfracao || null,
        descricao: input.descricao, gravidade: input.gravidade || "media",
        pontos: input.pontos || 0, valorOriginal: input.valorOriginal,
        valorComDesconto: input.valorComDesconto || null,
        motorista: input.motorista || null, local: input.local || null,
        observacoes: input.observacoes || null, criadoPor: input.criadoPor || null,
      }).returning();
      return f;
    }),

  updateFine: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), status: z.string().optional(), valorPago: z.string().optional(),
      recurso: z.boolean().optional(), recursoStatus: z.string().optional(), recursoObservacoes: z.string().optional(),
      comprovanteUrl: z.string().optional(), observacoes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(fleetFines).set({ ...data, updatedAt: new Date().toISOString() } as any)
        .where(and(eq(fleetFines.id, id), eq(fleetFines.companyId, companyId)));
      return { success: true };
    }),

  deleteFine: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(fleetFines).where(and(eq(fleetFines.id, input.id), eq(fleetFines.companyId, input.companyId)));
      return { success: true };
    }),

  listIpva: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional(), anoReferencia: z.number().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT i.*, v.placa, v.modelo, v.marca FROM fleet_ipva i JOIN vehicles v ON v.id = i.vehicle_id WHERE i.company_id = ${input.companyId}`;
      if (input.vehicleId) q = sql`${q} AND i.vehicle_id = ${input.vehicleId}`;
      if (input.anoReferencia) q = sql`${q} AND i.ano_referencia = ${input.anoReferencia}`;
      q = sql`${q} ORDER BY i.ano_referencia DESC, v.placa`;
      const res = await db.execute(q);
      return (res as any).rows || [];
    }),

  createIpva: protectedProcedure
    .input(z.object({
      companyId: z.number(), vehicleId: z.number(), anoReferencia: z.number(),
      valorTotal: z.string(), parcelas: z.number().optional(),
      dataVencimento: z.string().optional(), observacoes: z.string().optional(), criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const [r] = await db.insert(fleetIpva).values({
        companyId: input.companyId, vehicleId: input.vehicleId, anoReferencia: input.anoReferencia,
        valorTotal: input.valorTotal, parcelas: input.parcelas || 1,
        dataVencimento: input.dataVencimento || null,
        observacoes: input.observacoes || null, criadoPor: input.criadoPor || null,
      }).returning();
      return r;
    }),

  updateIpva: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), parcelaAtual: z.number().optional(),
      valorPago: z.string().optional(), dataPagamento: z.string().optional(), status: z.string().optional(),
      comprovanteUrl: z.string().optional(), observacoes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(fleetIpva).set({ ...data, updatedAt: new Date().toISOString() } as any)
        .where(and(eq(fleetIpva.id, id), eq(fleetIpva.companyId, companyId)));
      return { success: true };
    }),

  deleteIpva: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(fleetIpva).where(and(eq(fleetIpva.id, input.id), eq(fleetIpva.companyId, input.companyId)));
      return { success: true };
    }),

  listLicensing: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT l.*, v.placa, v.modelo, v.marca FROM fleet_licensing l JOIN vehicles v ON v.id = l.vehicle_id WHERE l.company_id = ${input.companyId}`;
      if (input.vehicleId) q = sql`${q} AND l.vehicle_id = ${input.vehicleId}`;
      q = sql`${q} ORDER BY l.ano_exercicio DESC, v.placa`;
      const res = await db.execute(q);
      return (res as any).rows || [];
    }),

  createLicensing: protectedProcedure
    .input(z.object({
      companyId: z.number(), vehicleId: z.number(), anoExercicio: z.number(),
      dataVencimento: z.string().optional(), valor: z.string().optional(),
      observacoes: z.string().optional(), criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const [r] = await db.insert(fleetLicensing).values({
        companyId: input.companyId, vehicleId: input.vehicleId, anoExercicio: input.anoExercicio,
        dataVencimento: input.dataVencimento || null, valor: input.valor || null,
        observacoes: input.observacoes || null, criadoPor: input.criadoPor || null,
      }).returning();
      return r;
    }),

  updateLicensing: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), dataPagamento: z.string().optional(),
      status: z.string().optional(), crlvDigitalUrl: z.string().optional(), observacoes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(fleetLicensing).set({ ...data, updatedAt: new Date().toISOString() } as any)
        .where(and(eq(fleetLicensing.id, id), eq(fleetLicensing.companyId, companyId)));
      return { success: true };
    }),

  deleteLicensing: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(fleetLicensing).where(and(eq(fleetLicensing.id, input.id), eq(fleetLicensing.companyId, input.companyId)));
      return { success: true };
    }),

  listInsurance: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT s.*, v.placa, v.modelo, v.marca FROM fleet_insurance s JOIN vehicles v ON v.id = s.vehicle_id WHERE s.company_id = ${input.companyId}`;
      if (input.vehicleId) q = sql`${q} AND s.vehicle_id = ${input.vehicleId}`;
      q = sql`${q} ORDER BY s.data_fim DESC`;
      const res = await db.execute(q);
      return (res as any).rows || [];
    }),

  createInsurance: protectedProcedure
    .input(z.object({
      companyId: z.number(), vehicleId: z.number(), seguradora: z.string(),
      numeroApolice: z.string().optional(), tipoCobertura: z.string().optional(),
      dataInicio: z.string(), dataFim: z.string(), valorPremio: z.string().optional(),
      franquia: z.string().optional(), coberturas: z.string().optional(), restricoes: z.string().optional(),
      apoliceUrl: z.string().optional(), observacoes: z.string().optional(), criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const [r] = await db.insert(fleetInsurance).values({
        companyId: input.companyId, vehicleId: input.vehicleId, seguradora: input.seguradora,
        numeroApolice: input.numeroApolice || null, tipoCobertura: input.tipoCobertura || "compreensivo",
        dataInicio: input.dataInicio, dataFim: input.dataFim,
        valorPremio: input.valorPremio || null, franquia: input.franquia || null,
        coberturas: input.coberturas || null, restricoes: input.restricoes || null,
        apoliceUrl: input.apoliceUrl || null,
        observacoes: input.observacoes || null, criadoPor: input.criadoPor || null,
      }).returning();
      return r;
    }),

  updateInsurance: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), seguradora: z.string().optional(),
      numeroApolice: z.string().optional(), tipoCobertura: z.string().optional(),
      dataInicio: z.string().optional(), dataFim: z.string().optional(),
      valorPremio: z.string().optional(), franquia: z.string().optional(),
      coberturas: z.string().optional(), restricoes: z.string().optional(),
      apoliceUrl: z.string().optional(), status: z.string().optional(), observacoes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(fleetInsurance).set({ ...data, updatedAt: new Date().toISOString() } as any)
        .where(and(eq(fleetInsurance.id, id), eq(fleetInsurance.companyId, companyId)));
      return { success: true };
    }),

  deleteInsurance: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(fleetInsurance).where(and(eq(fleetInsurance.id, input.id), eq(fleetInsurance.companyId, input.companyId)));
      return { success: true };
    }),

  analyzeInsurancePolicy: protectedProcedure
    .input(z.object({ companyId: z.number(), policyText: z.string(), id: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: `Você é um especialista em seguros automotivos no Brasil. Analise a apólice de seguro fornecida e extraia informações estruturadas. Responda APENAS com JSON válido, sem markdown.

O JSON deve ter este formato:
{
  "resumo": "Resumo geral da apólice em 2-3 parágrafos",
  "regrasImportantes": ["Lista de regras que o segurado DEVE cumprir para não perder o seguro"],
  "alertasRisco": ["Lista de situações que podem causar perda do seguro ou recusa de sinistro"],
  "coberturasDetalhadas": ["Lista detalhada de cada cobertura incluída com valores/limites"],
  "exclusoes": ["Lista do que NÃO está coberto pelo seguro"],
  "limitesIndenizacao": ["Limites máximos de indenização por tipo de cobertura"],
  "franquias": "Detalhamento das franquias aplicáveis",
  "restricoesUso": ["Restrições de uso do veículo (ex: não usar para fins comerciais, limite de km, etc.)"],
  "obrigacoesSegurado": ["Obrigações que o segurado deve cumprir"],
  "prazoCarencia": "Informações sobre períodos de carência se houver",
  "procedimentoSinistro": "Passo a passo do que fazer em caso de sinistro"
}

FOCO PRINCIPAL: Identifique TUDO que pode fazer o segurado PERDER o direito ao seguro. Seja extremamente detalhado nas regras e restrições.` },
            { role: "user", content: `Analise esta apólice de seguro e extraia todas as informações relevantes:\n\n${input.policyText}` }
          ],
          maxTokens: 4096,
        });

        const content = result.choices[0]?.message?.content || "";
        const textContent = typeof content === "string" ? content : (content as any[]).map((c: any) => c.text || "").join("");
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          await db.update(fleetInsurance).set({
            iaAnalisada: true,
            iaResumo: parsed.resumo || null,
            iaRegrasImportantes: JSON.stringify(parsed.regrasImportantes || []),
            iaAlertasRisco: JSON.stringify(parsed.alertasRisco || []),
            iaCoberturasDetalhadas: JSON.stringify(parsed.coberturasDetalhadas || []),
            iaExclusoes: JSON.stringify(parsed.exclusoes || []),
            iaLimitesIndenizacao: JSON.stringify([
              ...(parsed.limitesIndenizacao || []),
              parsed.franquias ? `Franquias: ${parsed.franquias}` : null,
            ].filter(Boolean)),
            restricoes: JSON.stringify({
              restricoesUso: parsed.restricoesUso || [],
              obrigacoesSegurado: parsed.obrigacoesSegurado || [],
              prazoCarencia: parsed.prazoCarencia || "",
              procedimentoSinistro: parsed.procedimentoSinistro || "",
            }),
            updatedAt: new Date().toISOString(),
          } as any).where(and(eq(fleetInsurance.id, input.id), eq(fleetInsurance.companyId, input.companyId)));

          return { success: true, analysis: parsed };
        }
        return { success: false, error: "Não foi possível extrair dados da apólice" };
      } catch (e: any) {
        console.error("[Frotas] Erro ao analisar apólice:", e.message);
        return { success: false, error: e.message };
      }
    }),

  getDashboard: protectedProcedure
    .input(z.object({ companyId: z.number(), ano: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId !== undefined && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para acessar dados desta empresa" });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const vehiclesRes = await db.execute(sql`
        SELECT * FROM vehicles WHERE "companyId" = ${input.companyId} AND "statusVeiculo" != 'Inativo'
      `);
      const allVehicles = (vehiclesRes as any).rows || [];

      const allMaintRaw = ((await db.execute(sql`
        SELECT * FROM fleet_maintenances WHERE company_id = ${input.companyId}
      `)) as any).rows || [];

      const allFuelRaw = ((await db.execute(sql`
        SELECT * FROM fleet_fuel_records WHERE company_id = ${input.companyId}
      `)) as any).rows || [];

      const allFinesRaw = ((await db.execute(sql`
        SELECT * FROM fleet_fines WHERE company_id = ${input.companyId}
      `)) as any).rows || [];

      const ipvaRes = await db.execute(sql`
        SELECT * FROM fleet_ipva WHERE company_id = ${input.companyId}
      `);
      const allIpva = (ipvaRes as any).rows || [];

      const licRes = await db.execute(sql`
        SELECT * FROM fleet_licensing WHERE company_id = ${input.companyId}
      `);
      const allLic = (licRes as any).rows || [];

      const insRes = await db.execute(sql`
        SELECT * FROM fleet_insurance WHERE company_id = ${input.companyId}
      `);
      const allIns = (insRes as any).rows || [];

      const anosSet = new Set<number>();
      for (const m of allMaintRaw) { const y = parseInt((m.data_manutencao || "").substring(0, 4)); if (y > 2000) anosSet.add(y); }
      for (const f of allFuelRaw) { const y = parseInt((f.data || "").substring(0, 4)); if (y > 2000) anosSet.add(y); }
      for (const f of allFinesRaw) { const y = parseInt((f.data_infracao || "").substring(0, 4)); if (y > 2000) anosSet.add(y); }
      const anosDisponiveis = Array.from(anosSet).sort((a, b) => b - a);

      const anoFiltro = input.ano;
      const filterByYear = (dateStr: string | null | undefined) => {
        if (!anoFiltro) return true;
        const y = parseInt((dateStr || "").substring(0, 4));
        return y === anoFiltro;
      };

      const allMaint = anoFiltro ? allMaintRaw.filter((m: any) => filterByYear(m.data_manutencao)) : allMaintRaw;
      const allFuel = anoFiltro ? allFuelRaw.filter((f: any) => filterByYear(f.data)) : allFuelRaw;
      const allFines = anoFiltro ? allFinesRaw.filter((f: any) => filterByYear(f.data_infracao)) : allFinesRaw;

      const totalVehicles = allVehicles.length;
      const totalFipe = allVehicles.reduce((s: number, v: any) => s + n(v.valor_fipe), 0);
      const totalCompra = allVehicles.reduce((s: number, v: any) => s + n(v.valor_compra), 0);
      const totalManutCusto = allMaint.reduce((s: number, m: any) => s + n(m.custo), 0);
      const totalCombustivel = allFuel.reduce((s: number, f: any) => s + n(f.valor_total), 0);
      const totalMultas = allFines.reduce((s: number, f: any) => s + n(f.valor_original), 0);
      const multasPendentes = allFines.filter((f: any) => f.status === "pendente").length;
      const totalIpvaPendente = allIpva.filter((i: any) => i.status === "pendente").reduce((s: number, i: any) => s + n(i.valor_total) - n(i.valor_pago), 0);

      const now = new Date();
      const depreciacaoPorVeiculo = allVehicles.map((v: any) => {
        const valorC = n(v.valor_compra);
        const fipe = n(v.valor_fipe);
        let anos = 0;
        if (v.data_aquisicao) {
          anos = (now.getTime() - new Date(v.data_aquisicao).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        } else if (v.anoFabricacao) {
          anos = now.getFullYear() - parseInt(v.anoFabricacao);
        }
        const deprecReal = valorC > 0 ? Math.max(valorC - fipe, 0) : 0;
        const deprecAnual = anos > 0 ? Math.round(deprecReal / anos) : 0;
        const pctDep = valorC > 0 ? Math.round((deprecReal / valorC) * 100) : 0;
        const statusDep = pctDep >= 80 ? 'alta' : pctDep >= 50 ? 'media' : pctDep >= 20 ? 'moderada' : 'baixa';
        return {
          id: v.id, placa: v.placa, modelo: v.modelo, marca: v.marca,
          tipo: v.tipoVeiculo, anoFab: v.anoFabricacao,
          valorCompra: valorC, valorFipe: fipe,
          idadeAnos: Math.round(anos * 10) / 10,
          deprecAnual,
          deprecReal: Math.round(deprecReal),
          pctDep,
          statusDep,
        };
      });
      const depreciacao = depreciacaoPorVeiculo.reduce((s: number, v: any) => s + v.deprecReal, 0);

      const fuelByMonth: Record<string, number> = {};
      for (const f of allFuel) {
        const m = (f.data || "").substring(0, 7);
        fuelByMonth[m] = (fuelByMonth[m] || 0) + n(f.valor_total);
      }

      const maintByMonth: Record<string, number> = {};
      for (const m of allMaint) {
        const mo = (m.data_manutencao || "").substring(0, 7);
        maintByMonth[mo] = (maintByMonth[mo] || 0) + n(m.custo);
      }

      const tipoCount: Record<string, number> = {};
      const marcaCount: Record<string, number> = {};
      for (const v of allVehicles) {
        tipoCount[v.tipoVeiculo] = (tipoCount[v.tipoVeiculo] || 0) + 1;
        if (v.marca) marcaCount[v.marca] = (marcaCount[v.marca] || 0) + 1;
      }

      const today = now.toISOString().slice(0, 10);
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const alertas: { tipo: string; msg: string; veiculoId?: number; placa?: string; urgencia: string }[] = [];

      for (const v of allVehicles) {
        if (v.crlv_vencimento && v.crlv_vencimento <= in30) {
          alertas.push({ tipo: "crlv", msg: `CRLV vence em ${v.crlv_vencimento}`, veiculoId: v.id, placa: v.placa, urgencia: v.crlv_vencimento <= today ? "critico" : "alerta" });
        }
        if (v.seguro_vencimento && v.seguro_vencimento <= in30) {
          alertas.push({ tipo: "seguro", msg: `Seguro vence em ${v.seguro_vencimento}`, veiculoId: v.id, placa: v.placa, urgencia: v.seguro_vencimento <= today ? "critico" : "alerta" });
        }
      }

      for (const m of allMaintRaw) {
        if (m.status === "agendada" && m.data_proxima && m.data_proxima <= in30) {
          alertas.push({ tipo: "manutencao", msg: `Manutenção agendada: ${m.descricao}`, veiculoId: m.vehicle_id, urgencia: m.data_proxima <= today ? "critico" : "alerta" });
        }
      }

      for (const f of allFinesRaw) {
        if (f.status === "pendente" && f.data_vencimento && f.data_vencimento <= in30) {
          const fVehicle = allVehicles.find((v: any) => v.id === f.vehicle_id);
          alertas.push({ tipo: "multa", msg: `Multa pendente: ${f.descricao} - R$ ${n(f.valor_original).toFixed(2)}`, veiculoId: f.vehicle_id, placa: fVehicle?.placa || f.placa, urgencia: f.data_vencimento <= today ? "critico" : "alerta" });
        }
      }

      for (const i of allIpva) {
        if (i.status === "pendente" && i.data_vencimento && i.data_vencimento <= in30) {
          alertas.push({ tipo: "ipva", msg: `IPVA ${i.ano_referencia} pendente - R$ ${n(i.valor_total).toFixed(2)}`, veiculoId: i.vehicle_id, urgencia: i.data_vencimento <= today ? "critico" : "alerta" });
        }
      }

      for (const l of allLic) {
        if (l.status === "pendente" && l.data_vencimento && l.data_vencimento <= in30) {
          alertas.push({ tipo: "licenciamento", msg: `Licenciamento ${l.ano_exercicio} pendente`, veiculoId: l.vehicle_id, urgencia: l.data_vencimento <= today ? "critico" : "alerta" });
        }
      }

      for (const ins of allIns) {
        if (ins.status === "ativa" && ins.data_fim && ins.data_fim <= in30) {
          alertas.push({ tipo: "seguro_apolice", msg: `Apólice ${ins.numero_apolice || ''} vence em ${ins.data_fim}`, veiculoId: ins.vehicle_id, urgencia: ins.data_fim <= today ? "critico" : "alerta" });
        }
      }

      const anoAtual = now.getFullYear();
      for (const v of allVehicles) {
        const temIpva = allIpva.some((i: any) => i.vehicle_id === v.id && String(i.ano_referencia) === String(anoAtual));
        if (!temIpva) {
          alertas.push({ tipo: "ipva", msg: `IPVA ${anoAtual} não cadastrado`, veiculoId: v.id, placa: v.placa, urgencia: "info" });
        }
        const temLic = allLic.some((l: any) => l.vehicle_id === v.id && String(l.ano_exercicio) === String(anoAtual));
        if (!temLic) {
          alertas.push({ tipo: "licenciamento", msg: `Licenciamento ${anoAtual} não cadastrado`, veiculoId: v.id, placa: v.placa, urgencia: "info" });
        }
        if (!v.crlv_vencimento) {
          alertas.push({ tipo: "crlv", msg: `Vencimento do CRLV não informado`, veiculoId: v.id, placa: v.placa, urgencia: "info" });
        }
      }

      const alertasCriticos = alertas.filter(a => a.urgencia === "critico").length;
      const alertasAlerta = alertas.filter(a => a.urgencia === "alerta").length;
      const alertasInfo = alertas.filter(a => a.urgencia === "info").length;

      const fuelWithConsumo = allFuel.filter((f: any) => n(f.consumo_km_l) > 0);
      const consumoMedio = fuelWithConsumo.length > 0
        ? fuelWithConsumo.reduce((s: number, f: any) => s + n(f.consumo_km_l), 0) / fuelWithConsumo.length
        : 0;

      const totalKm = allVehicles.reduce((s: number, v: any) => s + n(v.km_atual), 0);
      const custoKm = totalKm > 0 ? (totalManutCusto + totalCombustivel) / totalKm : 0;
      const totalLitros = allFuel.reduce((s: number, f: any) => s + n(f.litros), 0);

      const custoPorVeiculo = allVehicles.map((v: any) => {
        const vFuel = allFuel.filter((f: any) => f.vehicle_id === v.id);
        const vMaint = allMaint.filter((m: any) => m.vehicle_id === v.id);
        const vFines = allFines.filter((f: any) => f.vehicle_id === v.id);
        const custoManut = vMaint.reduce((s: number, m: any) => s + n(m.custo), 0);
        const custoComb = vFuel.reduce((s: number, f: any) => s + n(f.valor_total), 0);
        const custoMultas = vFines.reduce((s: number, f: any) => s + n(f.valor_original), 0);
        const litros = vFuel.reduce((s: number, f: any) => s + n(f.litros), 0);
        const fuelRecs = vFuel.filter((f: any) => n(f.consumo_km_l) > 0);
        const consumo = fuelRecs.length > 0 ? fuelRecs.reduce((s: number, f: any) => s + n(f.consumo_km_l), 0) / fuelRecs.length : 0;
        const km = n(v.km_atual);
        const custoTotal = custoManut + custoComb + custoMultas;
        const custoKmV = km > 0 ? custoTotal / km : 0;
        return {
          id: v.id, placa: v.placa, modelo: v.modelo, marca: v.marca,
          tipo: v.tipoVeiculo, km,
          custoManut, custoComb, custoMultas, custoTotal, custoKmV,
          litros, consumo, abastecimentos: vFuel.length, manutencoes: vMaint.length,
          multasPend: vFines.filter((f: any) => f.status === "pendente").length,
        };
      }).sort((a: any, b: any) => b.custoTotal - a.custoTotal);

      const idadeDistribuicao: Record<string, number> = {};
      const idadeVeiculos: Record<string, Array<{id: number, placa: string, modelo: string, marca: string, ano: string, idade: number}>> = {};
      for (const v of allVehicles) {
        const ano = parseInt(v.anoFabricacao) || 0;
        const idade = ano > 0 ? now.getFullYear() - ano : 0;
        const faixa = idade <= 2 ? "0-2 anos" : idade <= 5 ? "3-5 anos" : idade <= 10 ? "6-10 anos" : "10+ anos";
        idadeDistribuicao[faixa] = (idadeDistribuicao[faixa] || 0) + 1;
        if (!idadeVeiculos[faixa]) idadeVeiculos[faixa] = [];
        idadeVeiculos[faixa].push({ id: v.id, placa: v.placa || "S/P", modelo: v.modelo || "", marca: v.marca || "", ano: v.anoFabricacao || "—", idade });
      }

      const statusVeiculos: Record<string, number> = {};
      for (const v of allVehicles) {
        const st = v.statusVeiculo || "Em operação";
        statusVeiculos[st] = (statusVeiculos[st] || 0) + 1;
      }

      const totalSegurosPremio = allIns.filter((i: any) => i.status === "ativa").reduce((s: number, i: any) => s + n(i.valor_premio), 0);
      const segurosAtivos = allIns.filter((i: any) => i.status === "ativa").length;
      const veiculosSemSeguro = allVehicles.filter((v: any) => !allIns.some((i: any) => i.vehicle_id === v.id && i.status === "ativa")).length;

      const totalLicenciamento = allLic.reduce((s: number, l: any) => s + n(l.valor), 0);
      const totalIpvaGeral = allIpva.reduce((s: number, i: any) => s + n(i.valor_total), 0);

      const custosTotaisByMonth: Record<string, { combustivel: number; manutencao: number; multas: number }> = {};
      const custosMensaisVeiculo: Record<string, Record<number, { placa: string; modelo: string; combustivel: number; manutencao: number; multas: number }>> = {};
      const vehicleMap: Record<number, { placa: string; modelo: string }> = {};
      for (const v of allVehicles) vehicleMap[v.id] = { placa: v.placa || "S/P", modelo: v.modelo || "" };

      function ensureMV(mes: string, vid: number) {
        if (!custosMensaisVeiculo[mes]) custosMensaisVeiculo[mes] = {};
        if (!custosMensaisVeiculo[mes][vid]) {
          const info = vehicleMap[vid] || { placa: "S/P", modelo: "?" };
          custosMensaisVeiculo[mes][vid] = { placa: info.placa, modelo: info.modelo, combustivel: 0, manutencao: 0, multas: 0 };
        }
      }

      for (const f of allFuel) {
        const m = (f.data || "").substring(0, 7);
        if (!custosTotaisByMonth[m]) custosTotaisByMonth[m] = { combustivel: 0, manutencao: 0, multas: 0 };
        custosTotaisByMonth[m].combustivel += n(f.valor_total);
        ensureMV(m, f.vehicle_id);
        custosMensaisVeiculo[m][f.vehicle_id].combustivel += n(f.valor_total);
      }
      for (const m of allMaint) {
        const mo = (m.data_manutencao || "").substring(0, 7);
        if (!custosTotaisByMonth[mo]) custosTotaisByMonth[mo] = { combustivel: 0, manutencao: 0, multas: 0 };
        custosTotaisByMonth[mo].manutencao += n(m.custo);
        ensureMV(mo, m.vehicle_id);
        custosMensaisVeiculo[mo][m.vehicle_id].manutencao += n(m.custo);
      }
      for (const f of allFines) {
        const mo = (f.data_infracao || "").substring(0, 7);
        if (!custosTotaisByMonth[mo]) custosTotaisByMonth[mo] = { combustivel: 0, manutencao: 0, multas: 0 };
        custosTotaisByMonth[mo].multas += n(f.valor_original);
        ensureMV(mo, f.vehicle_id);
        custosMensaisVeiculo[mo][f.vehicle_id].multas += n(f.valor_original);
      }

      const tipoCombustivel: Record<string, number> = {};
      for (const f of allFuel) {
        const t = f.tipo_combustivel || "Não informado";
        tipoCombustivel[t] = (tipoCombustivel[t] || 0) + n(f.litros);
      }

      const idadeFrota = allVehicles.length > 0
        ? allVehicles.reduce((s: number, v: any) => s + (now.getFullYear() - (parseInt(v.anoFabricacao) || now.getFullYear())), 0) / allVehicles.length
        : 0;

      const custoOperTotal = totalManutCusto + totalCombustivel + totalMultas;

      return {
        totalVehicles, totalFipe, totalCompra, depreciacao,
        totalManutCusto, totalCombustivel, totalMultas, multasPendentes,
        totalIpvaPendente, consumoMedio, custoKm, totalKm, totalLitros,
        tipoCount, marcaCount,
        fuelByMonth, maintByMonth, custosTotaisByMonth, custosMensaisVeiculo,
        alertas, alertasCriticos, alertasAlerta, alertasInfo,
        veiculosEmManutencao: allMaintRaw.filter((m: any) => m.status === "em_andamento").length,
        depreciacaoPorVeiculo,
        custoPorVeiculo,
        idadeDistribuicao, idadeVeiculos, statusVeiculos,
        totalSegurosPremio, segurosAtivos, veiculosSemSeguro,
        totalLicenciamento, totalIpvaGeral,
        tipoCombustivel, idadeFrota, custoOperTotal,
        anosDisponiveis, anoSelecionado: anoFiltro || null,
      };
    }),

  getMaintenanceAnalytics: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ano: z.number().optional(),
      mes: z.number().min(1).max(12).optional(),
      vehiclePlaca: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para esta empresa' });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();

      const itemsRes = await db.execute(sql`
        SELECT mi.*, fm.vehicle_id, fm.data_manutencao, fm.fornecedor, fm.tipo as manut_tipo,
               fm.descricao as manut_descricao, fm.custo as manut_custo, fm.id as manut_id,
               v.placa, v.modelo, v.marca
        FROM fleet_maintenance_items mi
        JOIN fleet_maintenances fm ON fm.id = mi.maintenance_id
        JOIN vehicles v ON v.id = fm.vehicle_id
        WHERE mi.company_id = ${input.companyId}
        ORDER BY fm.data_manutencao DESC
      `);
      const rawItems = (itemsRes as any).rows || [];

      const maintRes = await db.execute(sql`
        SELECT fm.*, v.placa, v.modelo, v.marca
        FROM fleet_maintenances fm
        JOIN vehicles v ON v.id = fm.vehicle_id
        WHERE fm.company_id = ${input.companyId}
        ORDER BY fm.data_manutencao DESC
      `);
      const rawMaint = (maintRes as any).rows || [];

      const filterByPeriod = (dateStr: string) => {
        if (!dateStr) return true;
        const d = new Date(dateStr);
        if (input.ano && d.getFullYear() !== input.ano) return false;
        if (input.mes && (d.getMonth() + 1) !== input.mes) return false;
        return true;
      };
      const filterByVehicle = (placa: string) => {
        if (!input.vehiclePlaca) return true;
        return placa === input.vehiclePlaca;
      };

      const allItems = rawItems.filter((i: any) => filterByPeriod(i.data_manutencao) && filterByVehicle(i.placa));
      const allMaint = rawMaint.filter((m: any) => filterByPeriod(m.data_manutencao) && filterByVehicle(m.placa));

      const anosDisp = [...new Set(rawMaint.map((m: any) => {
        const d = m.data_manutencao;
        return d ? new Date(d).getFullYear() : null;
      }).filter(Boolean))].sort() as number[];

      const mesesDisp = input.ano
        ? [...new Set(rawMaint.filter((m: any) => m.data_manutencao && new Date(m.data_manutencao).getFullYear() === input.ano)
            .map((m: any) => new Date(m.data_manutencao).getMonth() + 1))].sort((a, b) => (a as number) - (b as number)) as number[]
        : [];

      const veiculosDisp = [...new Set(rawMaint.map((m: any) => m.placa))].sort() as string[];

      const pecaFreq: Record<string, { nome: string; count: number; totalGasto: number; veiculos: Set<string>; datas: string[] }> = {};
      for (const item of allItems) {
        if (item.categoria !== 'peca') continue;
        const key = item.nome.toLowerCase().trim();
        if (!pecaFreq[key]) pecaFreq[key] = { nome: item.nome, count: 0, totalGasto: 0, veiculos: new Set(), datas: [] };
        pecaFreq[key].count += parseInt(item.quantidade) || 1;
        pecaFreq[key].totalGasto += n(item.valor_total);
        pecaFreq[key].veiculos.add(item.placa);
        pecaFreq[key].datas.push(item.data_manutencao);
      }
      const pecasMaisTrocadas = Object.values(pecaFreq)
        .map((p: any) => ({ ...p, veiculos: Array.from(p.veiculos), numVeiculos: p.veiculos.size }))
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 20);

      const trocasRapidas: any[] = [];
      const pecaPorVeiculo: Record<string, { nome: string; placa: string; modelo: string; datas: string[] }> = {};
      for (const item of allItems) {
        if (item.categoria !== 'peca') continue;
        const key = `${item.nome.toLowerCase().trim()}::${item.placa}`;
        if (!pecaPorVeiculo[key]) pecaPorVeiculo[key] = { nome: item.nome, placa: item.placa, modelo: item.modelo, datas: [] };
        pecaPorVeiculo[key].datas.push(item.data_manutencao);
      }
      for (const entry of Object.values(pecaPorVeiculo)) {
        if (entry.datas.length < 2) continue;
        const sorted = entry.datas.map(d => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
        for (let i = 1; i < sorted.length; i++) {
          const dias = Math.round((sorted[i].getTime() - sorted[i-1].getTime()) / (1000 * 60 * 60 * 24));
          if (dias <= 180) {
            trocasRapidas.push({
              peca: entry.nome, placa: entry.placa, modelo: entry.modelo, dias,
              de: sorted[i-1].toISOString().slice(0,10), ate: sorted[i].toISOString().slice(0,10),
            });
          }
        }
      }
      trocasRapidas.sort((a, b) => a.dias - b.dias);

      const fornecedorStats: Record<string, { nome: string; totalGasto: number; numOS: number; veiculos: Set<string> }> = {};
      for (const m of allMaint) {
        const forn = m.fornecedor || 'Não informado';
        if (!fornecedorStats[forn]) fornecedorStats[forn] = { nome: forn, totalGasto: 0, numOS: 0, veiculos: new Set() };
        fornecedorStats[forn].totalGasto += n(m.custo);
        fornecedorStats[forn].numOS += 1;
        fornecedorStats[forn].veiculos.add(m.placa);
      }
      const fornecedores = Object.values(fornecedorStats)
        .map((f: any) => ({ ...f, veiculos: Array.from(f.veiculos), numVeiculos: f.veiculos.size, ticketMedio: f.totalGasto / f.numOS }))
        .sort((a: any, b: any) => b.totalGasto - a.totalGasto);

      const categoriaTotais = { pecas: 0, servicos: 0, pecasCount: 0, servicosCount: 0 };
      for (const item of allItems) {
        if (item.categoria === 'peca') { categoriaTotais.pecas += n(item.valor_total); categoriaTotais.pecasCount += parseInt(item.quantidade) || 1; }
        else { categoriaTotais.servicos += n(item.valor_total); categoriaTotais.servicosCount += 1; }
      }

      const custoVeiculo: Record<string, { placa: string; modelo: string; marca: string; totalPecas: number; totalServicos: number; numOS: number; vehicleId: number }> = {};
      for (const m of allMaint) {
        if (!custoVeiculo[m.placa]) custoVeiculo[m.placa] = { placa: m.placa, modelo: m.modelo, marca: m.marca, totalPecas: 0, totalServicos: 0, numOS: 0, vehicleId: m.vehicle_id };
        custoVeiculo[m.placa].numOS += 1;
      }
      for (const item of allItems) {
        if (!custoVeiculo[item.placa]) custoVeiculo[item.placa] = { placa: item.placa, modelo: item.modelo, marca: item.marca, totalPecas: 0, totalServicos: 0, numOS: 0, vehicleId: item.vehicle_id };
        if (item.categoria === 'peca') custoVeiculo[item.placa].totalPecas += n(item.valor_total);
        else custoVeiculo[item.placa].totalServicos += n(item.valor_total);
      }
      const custoPorVeiculoManut = Object.values(custoVeiculo)
        .map((v: any) => ({ ...v, total: v.totalPecas + v.totalServicos }))
        .sort((a: any, b: any) => b.total - a.total);

      const evolucaoMensal: Record<string, { pecas: number; servicos: number; total: number; numOS: number }> = {};
      for (const item of allItems) {
        const mes = item.data_manutencao?.substring(0, 7) || '';
        if (!mes) continue;
        if (!evolucaoMensal[mes]) evolucaoMensal[mes] = { pecas: 0, servicos: 0, total: 0, numOS: 0 };
        if (item.categoria === 'peca') evolucaoMensal[mes].pecas += n(item.valor_total);
        else evolucaoMensal[mes].servicos += n(item.valor_total);
        evolucaoMensal[mes].total += n(item.valor_total);
      }
      for (const m of allMaint) {
        const mes = m.data_manutencao?.substring(0, 7) || '';
        if (!mes) continue;
        if (!evolucaoMensal[mes]) evolucaoMensal[mes] = { pecas: 0, servicos: 0, total: 0, numOS: 0 };
        evolucaoMensal[mes].numOS += 1;
      }

      let comparativoAnual: any = null;
      if (input.ano && anosDisp.length > 1) {
        const anoAnterior = input.ano - 1;
        if (anosDisp.includes(anoAnterior)) {
          const itemsAnt = rawItems.filter((i: any) => i.data_manutencao && new Date(i.data_manutencao).getFullYear() === anoAnterior && filterByVehicle(i.placa));
          const maintAnt = rawMaint.filter((m: any) => m.data_manutencao && new Date(m.data_manutencao).getFullYear() === anoAnterior && filterByVehicle(m.placa));
          const catAnt = { pecas: 0, servicos: 0, pecasCount: 0, servicosCount: 0 };
          for (const item of itemsAnt) {
            if (item.categoria === 'peca') { catAnt.pecas += n(item.valor_total); catAnt.pecasCount += parseInt(item.quantidade) || 1; }
            else { catAnt.servicos += n(item.valor_total); catAnt.servicosCount += 1; }
          }
          const pecaFreqAnt: Record<string, { nome: string; count: number; totalGasto: number }> = {};
          for (const item of itemsAnt) {
            if (item.categoria !== 'peca') continue;
            const key = item.nome.toLowerCase().trim();
            if (!pecaFreqAnt[key]) pecaFreqAnt[key] = { nome: item.nome, count: 0, totalGasto: 0 };
            pecaFreqAnt[key].count += parseInt(item.quantidade) || 1;
            pecaFreqAnt[key].totalGasto += n(item.valor_total);
          }
          comparativoAnual = {
            anoAnterior,
            categoriaTotaisAnterior: catAnt,
            totalManutAnterior: maintAnt.length,
            totalItensAnterior: itemsAnt.length,
            pecasAnterior: Object.values(pecaFreqAnt).sort((a: any, b: any) => b.count - a.count).slice(0, 20),
          };
        }
      }

      let detalheVeiculo: any = null;
      if (input.vehiclePlaca) {
        const osVeiculo = allMaint.map((m: any) => {
          const itensOS = allItems.filter((i: any) => String(i.manut_id) === String(m.id));
          return {
            id: m.id, data: m.data_manutencao, tipo: m.tipo, descricao: m.descricao,
            fornecedor: m.fornecedor, custo: n(m.custo), status: m.status,
            itens: itensOS.map((i: any) => ({
              nome: i.nome, categoria: i.categoria,
              quantidade: parseInt(i.quantidade) || 1,
              valorUnit: n(i.valor_unitario), valorTotal: n(i.valor_total),
            })),
          };
        });
        const evolMensalVeic: Record<string, { pecas: number; servicos: number; total: number; numOS: number }> = {};
        for (const item of allItems) {
          const mes = item.data_manutencao?.substring(0, 7) || '';
          if (!mes) continue;
          if (!evolMensalVeic[mes]) evolMensalVeic[mes] = { pecas: 0, servicos: 0, total: 0, numOS: 0 };
          if (item.categoria === 'peca') evolMensalVeic[mes].pecas += n(item.valor_total);
          else evolMensalVeic[mes].servicos += n(item.valor_total);
          evolMensalVeic[mes].total += n(item.valor_total);
        }
        for (const m of allMaint) {
          const mes = m.data_manutencao?.substring(0, 7) || '';
          if (!mes) continue;
          if (!evolMensalVeic[mes]) evolMensalVeic[mes] = { pecas: 0, servicos: 0, total: 0, numOS: 0 };
          evolMensalVeic[mes].numOS += 1;
        }
        const fornVeic: Record<string, { nome: string; total: number; numOS: number }> = {};
        for (const m of allMaint) {
          const f = m.fornecedor || 'Não informado';
          if (!fornVeic[f]) fornVeic[f] = { nome: f, total: 0, numOS: 0 };
          fornVeic[f].total += n(m.custo); fornVeic[f].numOS += 1;
        }
        const pecasVeic: Record<string, { nome: string; count: number; totalGasto: number }> = {};
        for (const item of allItems) {
          if (item.categoria !== 'peca') continue;
          const key = item.nome.toLowerCase().trim();
          if (!pecasVeic[key]) pecasVeic[key] = { nome: item.nome, count: 0, totalGasto: 0 };
          pecasVeic[key].count += parseInt(item.quantidade) || 1;
          pecasVeic[key].totalGasto += n(item.valor_total);
        }
        const veicInfo = rawMaint.find((m: any) => m.placa === input.vehiclePlaca);
        detalheVeiculo = {
          placa: input.vehiclePlaca,
          modelo: veicInfo?.modelo || '',
          marca: veicInfo?.marca || '',
          ordens: osVeiculo,
          evolucaoMensal: evolMensalVeic,
          fornecedores: Object.values(fornVeic).sort((a: any, b: any) => b.total - a.total),
          pecas: Object.values(pecasVeic).sort((a: any, b: any) => b.count - a.count),
        };
      }

      return {
        pecasMaisTrocadas,
        trocasRapidas,
        fornecedores,
        categoriaTotais,
        custoPorVeiculoManut,
        evolucaoMensal,
        totalItens: allItems.length,
        totalManutencoes: allMaint.length,
        anosDisponiveis: anosDisp,
        mesesDisponiveis: mesesDisp,
        veiculosDisponiveis: veiculosDisp,
        filtroAno: input.ano || null,
        filtroMes: input.mes || null,
        filtroVeiculo: input.vehiclePlaca || null,
        comparativoAnual,
        detalheVeiculo,
      };
    }),

  getConsolidationData: protectedProcedure
    .input(z.object({ companyId: z.number(), mes: z.number().min(1).max(12), ano: z.number().min(2020).max(2100) }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, mes, ano } = input;
      const startDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const endDate = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

      const fuelRes = await db.execute(sql`
        SELECT COALESCE(SUM(valor_total::numeric),0) as total, COUNT(*) as qtd,
               COALESCE(SUM(litros::numeric),0) as litros,
               COALESCE(AVG(preco_litro::numeric),0) as preco_medio
        FROM fleet_fuel_records
        WHERE company_id = ${companyId} AND data >= ${startDate}::date AND data < ${endDate}::date
      `);
      const fuel = (fuelRes as any).rows?.[0] || (fuelRes as any)[0] || {};

      const maintRes = await db.execute(sql`
        SELECT COALESCE(SUM(custo::numeric),0) as total, COUNT(*) as qtd
        FROM fleet_maintenances
        WHERE company_id = ${companyId} AND data_manutencao >= ${startDate}::date AND data_manutencao < ${endDate}::date
      `);
      const maint = (maintRes as any).rows?.[0] || (maintRes as any)[0] || {};

      const finesRes = await db.execute(sql`
        SELECT COALESCE(SUM(valor_original::numeric),0) as total, COUNT(*) as qtd
        FROM fleet_fines
        WHERE company_id = ${companyId} AND data_infracao >= ${startDate}::date AND data_infracao < ${endDate}::date
      `);
      const fines = (finesRes as any).rows?.[0] || (finesRes as any)[0] || {};

      const ipvaRes = await db.execute(sql`
        SELECT COALESCE(SUM(valor_total::numeric),0) as total
        FROM fleet_ipva
        WHERE company_id = ${companyId} AND ano_referencia = ${ano}
          AND data_vencimento >= ${startDate}::date AND data_vencimento < ${endDate}::date
      `);
      const ipva = (ipvaRes as any).rows?.[0] || (ipvaRes as any)[0] || {};

      const licRes = await db.execute(sql`
        SELECT COALESCE(SUM(valor::numeric),0) as total
        FROM fleet_licensing
        WHERE company_id = ${companyId}
          AND data_vencimento >= ${startDate}::date AND data_vencimento < ${endDate}::date
      `);
      const lic = (licRes as any).rows?.[0] || (licRes as any)[0] || {};

      const segRes = await db.execute(sql`
        SELECT COALESCE(SUM(valor_premio::numeric),0) as total
        FROM fleet_insurance
        WHERE company_id = ${companyId} AND status = 'ativa'
          AND data_inicio <= ${endDate}::date AND data_fim >= ${startDate}::date
      `);
      const seg = (segRes as any).rows?.[0] || (segRes as any)[0] || {};

      const topPostos = await db.execute(sql`
        SELECT posto, COUNT(*) as qtd, COALESCE(SUM(valor_total::numeric),0) as total,
               COALESCE(SUM(litros::numeric),0) as litros,
               COALESCE(AVG(preco_litro::numeric),0) as preco_medio
        FROM fleet_fuel_records
        WHERE company_id = ${companyId} AND data >= ${startDate}::date AND data < ${endDate}::date
          AND posto IS NOT NULL AND posto != ''
        GROUP BY posto ORDER BY total DESC LIMIT 10
      `);
      const postos = (topPostos as any).rows || topPostos;

      const existingRes = await db.execute(sql`
        SELECT * FROM fleet_consolidations
        WHERE company_id = ${companyId} AND mes = ${mes} AND ano = ${ano}
      `);
      const existing = ((existingRes as any).rows || existingRes)[0] || null;

      const custoCombustivel = n(fuel.total);
      const custoManutencao = n(maint.total);
      const custoIpva = n(ipva.total);
      const custoMultas = n(fines.total);
      const custoLicenciamento = n(lic.total);
      const custoSeguro = n(seg.total);
      const custoTotal = custoCombustivel + custoManutencao + custoIpva + custoMultas + custoLicenciamento + custoSeguro;

      return {
        custoCombustivel, custoManutencao, custoIpva, custoMultas, custoLicenciamento, custoSeguro,
        custoTotal,
        qtdAbastecimentos: parseInt(fuel.qtd) || 0,
        qtdManutencoes: parseInt(maint.qtd) || 0,
        qtdMultas: parseInt(fines.qtd) || 0,
        litrosTotal: n(fuel.litros),
        precoMedioCombustivel: n(fuel.preco_medio),
        postos: Array.isArray(postos) ? postos : [],
        existing,
      };
    }),

  consolidateMonth: protectedProcedure
    .input(z.object({
      companyId: z.number(), mes: z.number().min(1).max(12), ano: z.number().min(2020).max(2100),
      observacoes: z.string().max(2000).optional(),
      enviarFinanceiro: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, mes, ano } = input;
      const startDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const endDate = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

      const fuelRes = await db.execute(sql`
        SELECT COALESCE(SUM(valor_total::numeric),0) as total, COUNT(*) as qtd, COALESCE(SUM(litros::numeric),0) as litros
        FROM fleet_fuel_records WHERE company_id = ${companyId} AND data >= ${startDate}::date AND data < ${endDate}::date
      `);
      const fuel = ((fuelRes as any).rows || fuelRes)[0] || {};

      const maintRes = await db.execute(sql`
        SELECT COALESCE(SUM(custo::numeric),0) as total, COUNT(*) as qtd
        FROM fleet_maintenances WHERE company_id = ${companyId} AND data_manutencao >= ${startDate}::date AND data_manutencao < ${endDate}::date
      `);
      const maint = ((maintRes as any).rows || maintRes)[0] || {};

      const finesRes = await db.execute(sql`
        SELECT COALESCE(SUM(valor_original::numeric),0) as total, COUNT(*) as qtd
        FROM fleet_fines WHERE company_id = ${companyId} AND data_infracao >= ${startDate}::date AND data_infracao < ${endDate}::date
      `);
      const fines = ((finesRes as any).rows || finesRes)[0] || {};

      const ipvaRes = await db.execute(sql`
        SELECT COALESCE(SUM(valor_total::numeric),0) as total
        FROM fleet_ipva WHERE company_id = ${companyId} AND ano_referencia = ${ano}
          AND data_vencimento >= ${startDate}::date AND data_vencimento < ${endDate}::date
      `);
      const ipva = ((ipvaRes as any).rows || ipvaRes)[0] || {};

      const licRes = await db.execute(sql`
        SELECT COALESCE(SUM(valor::numeric),0) as total
        FROM fleet_licensing WHERE company_id = ${companyId}
          AND data_vencimento >= ${startDate}::date AND data_vencimento < ${endDate}::date
      `);
      const lic = ((licRes as any).rows || licRes)[0] || {};

      const segRes = await db.execute(sql`
        SELECT COALESCE(SUM(valor_premio::numeric),0) as total
        FROM fleet_insurance WHERE company_id = ${companyId} AND status = 'ativa'
          AND data_inicio <= ${endDate}::date AND data_fim >= ${startDate}::date
      `);
      const seg = ((segRes as any).rows || segRes)[0] || {};

      const custoCombustivel = n(fuel.total);
      const custoManutencao = n(maint.total);
      const custoIpva = n(ipva.total);
      const custoMultas = n(fines.total);
      const custoLicenciamento = n(lic.total);
      const custoSeguro = n(seg.total);
      const custoTotal = custoCombustivel + custoManutencao + custoIpva + custoMultas + custoLicenciamento + custoSeguro;

      if (custoTotal === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum custo encontrado para este mês." });
      }

      const meses = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const descricao = `Consolidação Frotas - ${meses[mes]}/${ano}`;
      const obsFinanceiro = `Combustível: R$ ${custoCombustivel.toFixed(2)} | Manutenção: R$ ${custoManutencao.toFixed(2)} | IPVA: R$ ${custoIpva.toFixed(2)} | Multas: R$ ${custoMultas.toFixed(2)} | Licenciamento: R$ ${custoLicenciamento.toFixed(2)} | Seguro: R$ ${custoSeguro.toFixed(2)}`;
      const userId = ctx.user?.id ?? null;
      const userName = ctx.user?.name ?? null;
      const qtdAbast = parseInt(fuel.qtd) || 0;
      const qtdMaint = parseInt(maint.qtd) || 0;
      const qtdFines = parseInt(fines.qtd) || 0;
      const litrosTotal = n(fuel.litros);
      const obsText = input.observacoes || null;

      await db.execute(sql`BEGIN`);
      try {
        const prevRes = await db.execute(sql`
          SELECT financial_entry_id FROM fleet_consolidations
          WHERE company_id = ${companyId} AND mes = ${mes} AND ano = ${ano}
        `);
        const prevEntryId = ((prevRes as any).rows || prevRes)[0]?.financial_entry_id;
        if (prevEntryId) {
          await db.execute(sql`
            UPDATE financial_entries SET status = 'cancelado', updated_at = NOW()
            WHERE id = ${prevEntryId}
          `);
        }

        let financialEntryId: number | null = null;
        if (input.enviarFinanceiro) {
          const feRes = await db.execute(sql`
            INSERT INTO financial_entries
              (company_id, tipo, natureza, valor_previsto, data_competencia, data_vencimento,
               status, descricao, observacoes, origem_modulo, criado_por_id, criado_por_nome, created_at, updated_at)
            VALUES (${companyId}, 'despesa', 'variavel', ${custoTotal}, ${startDate}::date, ${startDate}::date,
              'previsto', ${descricao}, ${obsFinanceiro},
              'frotas', ${userId}, ${userName}, NOW(), NOW())
            RETURNING id
          `);
          financialEntryId = ((feRes as any).rows || feRes)[0]?.id || null;
        }

        const status = input.enviarFinanceiro ? "enviado_financeiro" : "consolidado";
        const consRes = await db.execute(sql`
          INSERT INTO fleet_consolidations
            (company_id, mes, ano, custo_combustivel, custo_manutencao, custo_ipva, custo_multas,
             custo_licenciamento, custo_seguro, custo_total, qtd_abastecimentos, qtd_manutencoes, qtd_multas,
             litros_total, status, financial_entry_id, observacoes,
             consolidado_por_id, consolidado_por_nome, data_consolidacao, data_envio_financeiro,
             created_at, updated_at)
          VALUES (${companyId}, ${mes}, ${ano}, ${custoCombustivel}, ${custoManutencao}, ${custoIpva}, ${custoMultas},
            ${custoLicenciamento}, ${custoSeguro}, ${custoTotal}, ${qtdAbast}, ${qtdMaint}, ${qtdFines},
            ${litrosTotal}, ${status}, ${financialEntryId}, ${obsText},
            ${userId}, ${userName}, NOW(), ${input.enviarFinanceiro ? sql`NOW()` : sql`NULL`},
            NOW(), NOW())
          ON CONFLICT (company_id, mes, ano) DO UPDATE SET
            custo_combustivel = EXCLUDED.custo_combustivel,
            custo_manutencao = EXCLUDED.custo_manutencao,
            custo_ipva = EXCLUDED.custo_ipva,
            custo_multas = EXCLUDED.custo_multas,
            custo_licenciamento = EXCLUDED.custo_licenciamento,
            custo_seguro = EXCLUDED.custo_seguro,
            custo_total = EXCLUDED.custo_total,
            qtd_abastecimentos = EXCLUDED.qtd_abastecimentos,
            qtd_manutencoes = EXCLUDED.qtd_manutencoes,
            qtd_multas = EXCLUDED.qtd_multas,
            litros_total = EXCLUDED.litros_total,
            status = EXCLUDED.status,
            financial_entry_id = EXCLUDED.financial_entry_id,
            observacoes = EXCLUDED.observacoes,
            consolidado_por_id = EXCLUDED.consolidado_por_id,
            consolidado_por_nome = EXCLUDED.consolidado_por_nome,
            data_consolidacao = NOW(),
            data_envio_financeiro = EXCLUDED.data_envio_financeiro,
            updated_at = NOW()
          RETURNING id
        `);

        await db.execute(sql`COMMIT`);

        return {
          id: ((consRes as any).rows || consRes)[0]?.id,
          financialEntryId,
          custoTotal,
        };
      } catch (err) {
        await db.execute(sql`ROLLBACK`);
        throw err;
      }
    }),

  listConsolidations: protectedProcedure
    .input(z.object({ companyId: z.number(), ano: z.number().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      if (input.ano) {
        const res = await db.execute(sql`
          SELECT * FROM fleet_consolidations
          WHERE company_id = ${input.companyId} AND ano = ${input.ano}
          ORDER BY ano DESC, mes DESC
        `);
        return (res as any).rows || res;
      }
      const res = await db.execute(sql`
        SELECT * FROM fleet_consolidations
        WHERE company_id = ${input.companyId}
        ORDER BY ano DESC, mes DESC
      `);
      return (res as any).rows || res;
    }),

  desconsolidateMonth: protectedProcedure
    .input(z.object({ companyId: z.number(), mes: z.number().min(1).max(12), ano: z.number().min(2020).max(2100) }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const consRes = await db.execute(sql`
        SELECT * FROM fleet_consolidations
        WHERE company_id = ${input.companyId} AND mes = ${input.mes} AND ano = ${input.ano}
      `);
      const cons = ((consRes as any).rows || consRes)[0];
      if (!cons) throw new TRPCError({ code: "NOT_FOUND", message: "Consolidação não encontrada." });

      await db.execute(sql`BEGIN`);
      try {
        if (cons.financial_entry_id) {
          await db.execute(sql`
            UPDATE financial_entries SET status = 'cancelado', updated_at = NOW()
            WHERE id = ${cons.financial_entry_id}
          `);
        }
        await db.execute(sql`
          DELETE FROM fleet_consolidations
          WHERE company_id = ${input.companyId} AND mes = ${input.mes} AND ano = ${input.ano}
        `);
        await db.execute(sql`COMMIT`);
      } catch (err) {
        await db.execute(sql`ROLLBACK`);
        throw err;
      }

      return { ok: true };
    }),

  approveMaintenanceMonth: protectedProcedure
    .input(z.object({
      companyId: z.number(), mes: z.number().min(1).max(12), ano: z.number().min(2020).max(2100),
      observacoes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, mes, ano } = input;
      const startDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const endDate = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

      const existingRes = await db.execute(sql`
        SELECT id FROM financial_entries
        WHERE company_id = ${companyId} AND origem_modulo = 'frotas'
          AND descricao LIKE ${'Manutenções Frotas%'}
          AND data_competencia >= ${startDate}::date AND data_competencia < ${endDate}::date
          AND status != 'cancelado'
        LIMIT 1
      `);
      const existing = ((existingRes as any).rows || existingRes)[0];
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Este mês já possui consolidação ativa no Financeiro. Reverta antes de consolidar novamente." });
      }

      const maintRes = await db.execute(sql`
        SELECT COALESCE(SUM(custo::numeric),0) as total, COUNT(*) as qtd
        FROM fleet_maintenances WHERE company_id = ${companyId}
          AND data_manutencao >= ${startDate}::date AND data_manutencao < ${endDate}::date
          AND status != 'cancelada'
      `);
      const maint = ((maintRes as any).rows || maintRes)[0] || {};
      const custoTotal = parseFloat(maint.total) || 0;
      const qtdManutencoes = parseInt(maint.qtd) || 0;

      if (custoTotal === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma manutenção com custo encontrada para este mês." });
      }

      const detailRes = await db.execute(sql`
        SELECT fm.descricao, fm.custo, fm.tipo, v.placa, v.modelo
        FROM fleet_maintenances fm
        JOIN vehicles v ON v.id = fm.vehicle_id
        WHERE fm.company_id = ${companyId}
          AND fm.data_manutencao >= ${startDate}::date AND fm.data_manutencao < ${endDate}::date
          AND fm.status != 'cancelada'
          AND fm.custo IS NOT NULL AND fm.custo::numeric > 0
        ORDER BY fm.custo::numeric DESC
        LIMIT 10
      `);
      const details = (detailRes as any).rows || detailRes;
      const detailLines = details.map((d: any) =>
        `${d.placa || d.modelo} - ${d.descricao}: R$ ${parseFloat(d.custo).toFixed(2)} (${d.tipo})`
      ).join(" | ");

      const meses = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const descricao = `Manutenções Frotas - ${meses[mes]}/${ano} (${qtdManutencoes} OS)`;
      const obsFinanceiro = detailLines || `${qtdManutencoes} manutenções totalizando R$ ${custoTotal.toFixed(2)}`;
      const userId = ctx.user?.id ?? null;
      const userName = ctx.user?.name ?? null;

      await db.execute(sql`BEGIN`);
      try {
        const feRes = await db.execute(sql`
          INSERT INTO financial_entries
            (company_id, tipo, natureza, valor_previsto, data_competencia, data_vencimento,
             status, descricao, observacoes, origem_modulo, criado_por_id, criado_por_nome, created_at, updated_at)
          VALUES (${companyId}, 'despesa', 'variavel', ${custoTotal}, ${startDate}::date, ${startDate}::date,
            'previsto', ${descricao}, ${input.observacoes || obsFinanceiro},
            'frotas', ${userId}, ${userName}, NOW(), NOW())
          RETURNING id
        `);
        const financialEntryId = ((feRes as any).rows || feRes)[0]?.id || null;

        await db.execute(sql`COMMIT`);

        return { financialEntryId, custoTotal, qtdManutencoes };
      } catch (err) {
        await db.execute(sql`ROLLBACK`);
        throw err;
      }
    }),

  revertMaintenanceApproval: protectedProcedure
    .input(z.object({
      companyId: z.number(), financialEntryId: z.number(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();

      const checkRes = await db.execute(sql`
        SELECT id FROM financial_entries
        WHERE id = ${input.financialEntryId} AND company_id = ${input.companyId}
          AND origem_modulo = 'frotas' AND descricao LIKE ${'Manutenções Frotas%'}
          AND status != 'cancelado'
      `);
      const entry = ((checkRes as any).rows || checkRes)[0];
      if (!entry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento financeiro de manutenção não encontrado ou já revertido." });
      }

      await db.execute(sql`
        UPDATE financial_entries SET status = 'cancelado', updated_at = NOW()
        WHERE id = ${input.financialEntryId} AND company_id = ${input.companyId}
          AND origem_modulo = 'frotas'
      `);
      return { ok: true };
    }),

  getMaintenanceMonthSummary: protectedProcedure
    .input(z.object({ companyId: z.number(), mes: z.number(), ano: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, mes, ano } = input;
      const startDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const endDate = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

      const res = await db.execute(sql`
        SELECT COALESCE(SUM(CASE WHEN status != 'cancelada' THEN custo::numeric ELSE 0 END),0) as total,
               COUNT(CASE WHEN status != 'cancelada' THEN 1 END) as qtd,
               COUNT(CASE WHEN tipo = 'preventiva' AND status != 'cancelada' THEN 1 END) as preventivas,
               COUNT(CASE WHEN tipo = 'corretiva' AND status != 'cancelada' THEN 1 END) as corretivas
        FROM fleet_maintenances WHERE company_id = ${companyId}
          AND data_manutencao >= ${startDate}::date AND data_manutencao < ${endDate}::date
      `);
      const row = ((res as any).rows || res)[0] || {};

      const feRes = await db.execute(sql`
        SELECT id, status, valor_previsto FROM financial_entries
        WHERE company_id = ${companyId}
          AND origem_modulo = 'frotas'
          AND descricao LIKE ${'Manutenções Frotas%'}
          AND data_competencia >= ${startDate}::date AND data_competencia < ${endDate}::date
          AND status != 'cancelado'
        ORDER BY created_at DESC LIMIT 1
      `);
      const financialEntry = ((feRes as any).rows || feRes)[0] || null;

      return {
        total: parseFloat(row.total) || 0,
        qtd: parseInt(row.qtd) || 0,
        preventivas: parseInt(row.preventivas) || 0,
        corretivas: parseInt(row.corretivas) || 0,
        approved: !!financialEntry,
        financialEntryId: financialEntry?.id || null,
        financialStatus: financialEntry?.status || null,
      };
    }),

  compareGasPrices: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();

      const fuelRes = await db.execute(sql`
        SELECT posto, tipo_combustivel,
               AVG(preco_litro::numeric) as preco_medio,
               SUM(litros::numeric) as total_litros,
               SUM(valor_total::numeric) as total_gasto,
               COUNT(*) as qtd,
               MIN(preco_litro::numeric) as menor_preco,
               MAX(preco_litro::numeric) as maior_preco,
               MAX(data) as ultimo_abastecimento
        FROM fleet_fuel_records
        WHERE company_id = ${input.companyId}
          AND data >= NOW() - INTERVAL '6 months'
          AND posto IS NOT NULL AND posto != ''
        GROUP BY posto, tipo_combustivel
        ORDER BY total_gasto DESC
      `);
      const historico = (fuelRes as any).rows || fuelRes;

      let postosProximos: any[] = [];
      let regiaoLabel = "";
      try {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (apiKey) {
          const companyRes = await db.execute(sql`
            SELECT endereco, cidade, estado, cep FROM companies WHERE id = ${input.companyId} LIMIT 1
          `);
          const companyRow = ((companyRes as any).rows || companyRes)[0];
          const cidade = companyRow?.cidade || "";
          const estado = companyRow?.estado || "";
          const endereco = companyRow?.endereco || "";
          const cep = companyRow?.cep || "";
          regiaoLabel = cidade && estado ? `${cidade}-${estado}` : cidade || "Região da Empresa";

          let lat = 0, lng = 0;
          const geoAddress = endereco && cidade ? `${endereco}, ${cidade}, ${estado}, Brasil` : cidade && estado ? `${cidade}, ${estado}, Brasil` : cep ? `${cep}, Brasil` : "";
          if (geoAddress) {
            const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(geoAddress)}&key=${apiKey}`;
            const geoResp = await fetch(geoUrl);
            const geoData = await geoResp.json();
            if (geoData.results && geoData.results.length > 0) {
              lat = geoData.results[0].geometry.location.lat;
              lng = geoData.results[0].geometry.location.lng;
            }
          }

          if (lat !== 0 && lng !== 0) {
            const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=15000&type=gas_station&language=pt-BR&key=${apiKey}`;
            const resp = await fetch(url);
            const data = await resp.json();
            if (data.results) {
              postosProximos = data.results.map((p: any) => ({
                nome: p.name,
                endereco: p.vicinity,
                rating: p.rating || 0,
                totalRatings: p.user_ratings_total || 0,
                aberto: p.opening_hours?.open_now ?? null,
                lat: p.geometry?.location?.lat,
                lng: p.geometry?.location?.lng,
                placeId: p.place_id,
              }));
            }
          }
        }
      } catch (_e) {}

      const globalAvgRes = await db.execute(sql`
        SELECT tipo_combustivel,
               AVG(preco_litro::numeric) as preco_medio_geral,
               MIN(preco_litro::numeric) as menor_preco_geral,
               MAX(preco_litro::numeric) as maior_preco_geral
        FROM fleet_fuel_records
        WHERE company_id = ${input.companyId}
          AND data >= NOW() - INTERVAL '3 months'
          AND preco_litro IS NOT NULL AND preco_litro > 0
        GROUP BY tipo_combustivel
      `);
      const mediaGeral = (globalAvgRes as any).rows || globalAvgRes;

      return { historico, postosProximos, mediaGeral, regiaoLabel };
    }),

  getFuelMonthSummary: protectedProcedure
    .input(z.object({ companyId: z.number(), mes: z.number(), ano: z.number() }))
    .query(async ({ input, ctx }) => {
      const userCid = (ctx as any).user?.companyId;
      if (userCid && String(userCid) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta empresa." });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, mes, ano } = input;
      const startDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const endDate = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

      const res = await db.execute(sql`
        SELECT COALESCE(SUM(valor_total::numeric),0) as total_valor,
               COALESCE(SUM(litros::numeric),0) as total_litros,
               COUNT(*) as qtd,
               COUNT(DISTINCT vehicle_id) as veiculos
        FROM fleet_fuel_records WHERE company_id = ${companyId}
          AND data >= ${startDate}::date AND data < ${endDate}::date
      `);
      const row = ((res as any).rows || res)[0] || {};

      const feRes = await db.execute(sql`
        SELECT id, status, valor_previsto FROM financial_entries
        WHERE company_id = ${companyId}
          AND origem_modulo = 'frotas'
          AND descricao LIKE ${'Combustível Frotas%'}
          AND data_competencia >= ${startDate}::date AND data_competencia < ${endDate}::date
          AND status != 'cancelado'
        ORDER BY created_at DESC LIMIT 1
      `);
      const financialEntry = ((feRes as any).rows || feRes)[0] || null;

      return {
        totalValor: parseFloat(row.total_valor) || 0,
        totalLitros: parseFloat(row.total_litros) || 0,
        qtd: parseInt(row.qtd) || 0,
        veiculos: parseInt(row.veiculos) || 0,
        consolidated: !!financialEntry,
        financialEntryId: financialEntry?.id || null,
        financialStatus: financialEntry?.status || null,
      };
    }),

  consolidateFuelMonth: protectedProcedure
    .input(z.object({
      companyId: z.number(), mes: z.number().min(1).max(12), ano: z.number().min(2020).max(2100),
      observacoes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userCid = (ctx as any).user?.companyId;
      if (userCid && String(userCid) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta empresa." });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, mes, ano } = input;
      const startDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const endDate = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

      const existingRes = await db.execute(sql`
        SELECT id FROM financial_entries
        WHERE company_id = ${companyId} AND origem_modulo = 'frotas'
          AND descricao LIKE ${'Combustível Frotas%'}
          AND data_competencia >= ${startDate}::date AND data_competencia < ${endDate}::date
          AND status != 'cancelado'
        LIMIT 1
      `);
      const existing = ((existingRes as any).rows || existingRes)[0];
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Este mês já possui consolidação ativa no Financeiro. Reverta antes de consolidar novamente." });
      }

      const fuelRes = await db.execute(sql`
        SELECT COALESCE(SUM(valor_total::numeric),0) as total,
               COALESCE(SUM(litros::numeric),0) as litros,
               COUNT(*) as qtd,
               COUNT(DISTINCT vehicle_id) as veiculos
        FROM fleet_fuel_records WHERE company_id = ${companyId}
          AND data >= ${startDate}::date AND data < ${endDate}::date
      `);
      const fuel = ((fuelRes as any).rows || fuelRes)[0] || {};
      const totalValor = parseFloat(fuel.total) || 0;
      const totalLitros = parseFloat(fuel.litros) || 0;
      const qtdAbastecimentos = parseInt(fuel.qtd) || 0;
      const qtdVeiculos = parseInt(fuel.veiculos) || 0;

      if (totalValor === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum abastecimento com valor encontrado para este mês." });
      }

      const meses = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const descricao = `Combustível Frotas - ${meses[mes]}/${ano} (${qtdAbastecimentos} abast., ${qtdVeiculos} veíc.)`;
      const obsFinanceiro = input.observacoes || `${qtdAbastecimentos} abastecimentos, ${totalLitros.toFixed(0)}L, totalizando R$ ${totalValor.toFixed(2)}`;
      const userId = ctx.user?.id ?? null;
      const userName = ctx.user?.name ?? null;

      await db.execute(sql`BEGIN`);
      try {
        const feRes = await db.execute(sql`
          INSERT INTO financial_entries
            (company_id, tipo, natureza, valor_previsto, data_competencia, data_vencimento,
             status, descricao, observacoes, origem_modulo, criado_por_id, criado_por_nome, created_at, updated_at)
          VALUES (${companyId}, 'despesa', 'variavel', ${totalValor}, ${startDate}::date, ${startDate}::date,
            'previsto', ${descricao}, ${obsFinanceiro},
            'frotas', ${userId}, ${userName}, NOW(), NOW())
          RETURNING id
        `);
        const financialEntryId = ((feRes as any).rows || feRes)[0]?.id || null;
        await db.execute(sql`COMMIT`);
        return { financialEntryId, totalValor, totalLitros, qtdAbastecimentos };
      } catch (err) {
        await db.execute(sql`ROLLBACK`);
        throw err;
      }
    }),

  revertFuelConsolidation: protectedProcedure
    .input(z.object({ companyId: z.number(), financialEntryId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const userCid = (ctx as any).user?.companyId;
      if (userCid && String(userCid) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta empresa." });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();

      const checkRes = await db.execute(sql`
        SELECT id FROM financial_entries
        WHERE id = ${input.financialEntryId} AND company_id = ${input.companyId}
          AND origem_modulo = 'frotas' AND descricao LIKE ${'Combustível Frotas%'}
          AND status != 'cancelado'
      `);
      const entry = ((checkRes as any).rows || checkRes)[0];
      if (!entry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento financeiro de combustível não encontrado ou já cancelado." });
      }

      await db.execute(sql`
        UPDATE financial_entries SET status = 'cancelado', updated_at = NOW()
        WHERE id = ${input.financialEntryId} AND company_id = ${input.companyId}
          AND origem_modulo = 'frotas'
      `);
      return { ok: true };
    }),

  listTollRecords: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT tr.*, v.placa, v.modelo, v.marca FROM fleet_toll_records tr JOIN vehicles v ON v.id = tr.vehicle_id WHERE tr.company_id = ${input.companyId}`;
      if (input.vehicleId) q = sql`${q} AND tr.vehicle_id = ${input.vehicleId}`;
      q = sql`${q} ORDER BY tr.data DESC, tr.id DESC`;
      const res = await db.execute(q);
      return ((res as any).rows || res) as any[];
    }),

  createTollRecord: protectedProcedure
    .input(z.object({
      companyId: z.number(), vehicleId: z.number(), data: z.string(),
      categoria: z.string().default("pedagio"), descricao: z.string().optional(),
      pracaPedagio: z.string().optional(), rodovia: z.string().optional(),
      valor: z.string(), tagId: z.string().optional(), placa: z.string().optional(),
      eixos: z.number().optional(), status: z.string().default("pago"),
      observacoes: z.string().optional(), criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO fleet_toll_records (company_id, vehicle_id, data, categoria, descricao, praca_pedagio, rodovia, valor, tag_id, placa, eixos, status, observacoes, criado_por)
        VALUES (${input.companyId}, ${input.vehicleId}, ${input.data}::date, ${input.categoria},
          ${input.descricao || null}, ${input.pracaPedagio || null}, ${input.rodovia || null},
          ${parseFloat(input.valor)}, ${input.tagId || null}, ${input.placa || null},
          ${input.eixos || null}, ${input.status}, ${input.observacoes || null}, ${input.criadoPor || null})
      `);
      return { ok: true };
    }),

  updateTollRecord: protectedProcedure
    .input(z.object({
      id: z.number(), companyId: z.number(), vehicleId: z.number().optional(), data: z.string().optional(),
      categoria: z.string().optional(), descricao: z.string().optional(),
      pracaPedagio: z.string().optional(), rodovia: z.string().optional(),
      valor: z.string().optional(), tagId: z.string().optional(), placa: z.string().optional(),
      eixos: z.number().optional(), status: z.string().optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const sets: string[] = [];
      const vals: any = {};
      if (input.vehicleId !== undefined) sets.push(`vehicle_id = ${input.vehicleId}`);
      if (input.data) sets.push(`data = '${input.data}'::date`);
      if (input.categoria) sets.push(`categoria = '${input.categoria}'`);
      if (input.valor) sets.push(`valor = ${parseFloat(input.valor)}`);
      await db.execute(sql`
        UPDATE fleet_toll_records SET
          vehicle_id = COALESCE(${input.vehicleId ?? null}, vehicle_id),
          data = COALESCE(${input.data ?? null}::date, data),
          categoria = COALESCE(${input.categoria ?? null}, categoria),
          descricao = COALESCE(${input.descricao ?? null}, descricao),
          praca_pedagio = COALESCE(${input.pracaPedagio ?? null}, praca_pedagio),
          rodovia = COALESCE(${input.rodovia ?? null}, rodovia),
          valor = COALESCE(${input.valor ? parseFloat(input.valor) : null}, valor),
          tag_id = COALESCE(${input.tagId ?? null}, tag_id),
          placa = COALESCE(${input.placa ?? null}, placa),
          eixos = COALESCE(${input.eixos ?? null}, eixos),
          status = COALESCE(${input.status ?? null}, status),
          observacoes = COALESCE(${input.observacoes ?? null}, observacoes),
          updated_at = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId}
      `);
      return { ok: true };
    }),

  deleteTollRecord: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      await db.execute(sql`DELETE FROM fleet_toll_records WHERE id = ${input.id} AND company_id = ${input.companyId}`);
      return { ok: true };
    }),

  parseTollPdf: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      base64: z.string().max(15_000_000),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const userCompanyId = (ctx as any).user?.companyId;
      if (userCompanyId && String(userCompanyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta empresa." });
      }
      const db = await getDb();
      const vRes = await db.execute(sql`
        SELECT id, placa, modelo, marca, "tipoVeiculo" FROM vehicles WHERE "companyId" = ${input.companyId} ORDER BY placa
      `);
      const veiculos = (vRes as any).rows || vRes;
      const listaVeiculos = veiculos.map((v: any) =>
        `ID:${v.id} | Placa: ${v.placa || "S/P"} | ${v.marca} ${v.modelo} (${v.tipoVeiculo})`
      ).join("\n");

      const prompt = `Analise este documento de pedágio/Sem Parar e extraia TODOS os lançamentos.

VEÍCULOS CADASTRADOS NA FROTA (use o ID correspondente):
${listaVeiculos}

Retorne APENAS um JSON válido (sem markdown, sem \`\`\`) com esta estrutura:
{
  "success": true,
  "items": [
    {
      "vehicleId": <number - ID do veículo da lista acima>,
      "vehiclePlaca": "<placa do veículo>",
      "data": "<data no formato YYYY-MM-DD>",
      "categoria": "pedagio" | "sem_parar" | "estacionamento" | "recarga_tag",
      "descricao": "<descrição do lançamento>",
      "pracaPedagio": "<nome da praça de pedágio>",
      "rodovia": "<nome da rodovia>",
      "valor": <number - valor em R$>,
      "tagId": "<ID do tag se houver>",
      "eixos": <number ou null - quantidade de eixos>,
      "observacoes": "<detalhes extras>"
    }
  ],
  "rawText": "<resumo do que foi lido>",
  "confidence": "alta" | "media" | "baixa"
}

Se houver múltiplos lançamentos, crie um item para cada.
Se não encontrar o veículo na lista, coloque vehicleId: null e preencha placa encontrada.
Se a data não estiver clara, use hoje: ${new Date().toISOString().slice(0, 10)}.`;

      const systemPrompt = `Você é um assistente especialista em gestão de frotas veiculares no Brasil.
Analise extratos de pedágio, faturas Sem Parar/ConectCar/Veloe e extraia dados de cada passagem.
Seja preciso com valores monetários, datas e identificação de veículos por placa.
Sempre retorne JSON válido, sem markdown.`;

      const { invokeAnthropicVision } = await import("../_core/llm");
      const rawResponse = await invokeAnthropicVision({
        base64: input.base64,
        mimeType: input.mimeType as any,
        prompt,
        systemPrompt,
      });

      let parsed: any;
      try {
        const cleaned = rawResponse.replace(/```json\s*/g, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao interpretar resposta da IA." });
      }

      if (!parsed?.items || !Array.isArray(parsed.items)) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Nenhum item encontrado no documento." });
      }

      for (const item of parsed.items) {
        if (item.vehicleId) {
          const found = veiculos.find((v: any) => v.id === item.vehicleId);
          if (!found) item.vehicleId = null;
        }
      }

      return parsed;
    }),

  importTollBatch: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      items: z.array(z.object({
        vehicleId: z.number(),
        data: z.string(),
        categoria: z.string().default("pedagio"),
        descricao: z.string().optional(),
        pracaPedagio: z.string().optional(),
        rodovia: z.string().optional(),
        valor: z.number(),
        tagId: z.string().optional(),
        eixos: z.number().optional(),
        observacoes: z.string().optional(),
      })),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userCid = (ctx as any).user?.companyId;
      if (userCid && String(userCid) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta empresa." });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let inserted = 0;
      for (const item of input.items) {
        await db.execute(sql`
          INSERT INTO fleet_toll_records (company_id, vehicle_id, data, categoria, descricao, praca_pedagio, rodovia, valor, tag_id, eixos, observacoes, criado_por)
          VALUES (${input.companyId}, ${item.vehicleId}, ${item.data}::date, ${item.categoria},
            ${item.descricao || null}, ${item.pracaPedagio || null}, ${item.rodovia || null},
            ${item.valor}, ${item.tagId || null}, ${item.eixos || null},
            ${item.observacoes || null}, ${input.criadoPor || 'IA Import'})
        `);
        inserted++;
      }
      return { inserted };
    }),

  clearFuelMonth: protectedProcedure
    .input(z.object({
      companyId: z.number(), mes: z.number().min(1).max(12), ano: z.number().min(2020).max(2100),
    }))
    .mutation(async ({ input, ctx }) => {
      const userCid = (ctx as any).user?.companyId;
      if (userCid && String(userCid) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta empresa." });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, mes, ano } = input;
      const startDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const endDate = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

      const countRes = await db.execute(sql`
        SELECT COUNT(*) as total FROM fleet_fuel_records
        WHERE company_id = ${companyId} AND data >= ${startDate}::date AND data < ${endDate}::date
      `);
      const total = parseInt(((countRes as any).rows || countRes)[0]?.total) || 0;

      if (total === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum registro encontrado neste mês." });
      }

      await db.execute(sql`
        DELETE FROM fleet_fuel_records
        WHERE company_id = ${companyId} AND data >= ${startDate}::date AND data < ${endDate}::date
      `);

      return { deleted: total };
    }),

  clearAllFuelRecords: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      password: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const userCid = (ctx as any).user?.companyId;
      if (userCid && String(userCid) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta empresa." });
      }

      const bcrypt = await import("bcryptjs");
      const { users } = await import("../../drizzle/schema");

      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();

      const userId = (ctx as any).user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não autenticado." });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.password) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário não possui login local com senha." });
      }

      const valid = bcrypt.compareSync(input.password, user.password);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta. Operação cancelada." });
      }

      const countRes = await db.execute(sql`
        SELECT COUNT(*) as total FROM fleet_fuel_records WHERE company_id = ${input.companyId}
      `);
      const total = parseInt(((countRes as any).rows || countRes)[0]?.total) || 0;

      if (total === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum registro de combustível encontrado." });
      }

      await db.execute(sql`
        DELETE FROM fleet_fuel_records WHERE company_id = ${input.companyId}
      `);

      return { deleted: total };
    }),

  listDriverNames: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const driversRes = await db.execute(sql`
        SELECT motorista, COUNT(*) as qtd, MAX(data) as ultimo_uso
        FROM fleet_fuel_records
        WHERE company_id = ${input.companyId} AND motorista IS NOT NULL AND motorista != ''
        GROUP BY motorista
        ORDER BY motorista
      `);
      const drivers = ((driversRes as any).rows || driversRes) as Array<{ motorista: string; qtd: string; ultimo_uso: string }>;

      const aliasesRes = await db.execute(sql`
        SELECT id, alias_name, canonical_name FROM fleet_driver_aliases WHERE company_id = ${input.companyId} ORDER BY canonical_name
      `);
      const aliases = ((aliasesRes as any).rows || aliasesRes) as Array<{ id: number; alias_name: string; canonical_name: string }>;

      return { drivers, aliases };
    }),

  mergeDriverNames: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      canonicalName: z.string().min(1),
      aliasNames: z.array(z.string().min(1)),
      updateExisting: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const userCid = (ctx as any).user?.companyId;
      if (userCid && String(userCid) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta empresa." });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();

      let aliasesCreated = 0;
      let recordsUpdated = 0;

      for (const alias of input.aliasNames) {
        if (alias.trim().toUpperCase() === input.canonicalName.trim().toUpperCase()) continue;

        await db.execute(sql`
          INSERT INTO fleet_driver_aliases (company_id, alias_name, canonical_name)
          VALUES (${input.companyId}, ${alias.trim().toUpperCase()}, ${input.canonicalName.trim().toUpperCase()})
          ON CONFLICT (company_id, alias_name) DO UPDATE SET canonical_name = ${input.canonicalName.trim().toUpperCase()}
        `);
        aliasesCreated++;

        if (input.updateExisting) {
          const upd = await db.execute(sql`
            UPDATE fleet_fuel_records SET motorista = ${input.canonicalName.trim().toUpperCase()}
            WHERE company_id = ${input.companyId} AND UPPER(TRIM(motorista)) = ${alias.trim().toUpperCase()}
          `);
          recordsUpdated += (upd as any).rowCount || 0;

          const updFines = await db.execute(sql`
            UPDATE fleet_fines SET motorista = ${input.canonicalName.trim().toUpperCase()}
            WHERE company_id = ${input.companyId} AND UPPER(TRIM(motorista)) = ${alias.trim().toUpperCase()}
          `);
          recordsUpdated += (updFines as any).rowCount || 0;
        }
      }

      return { aliasesCreated, recordsUpdated };
    }),

  deleteDriverAlias: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const userCid = (ctx as any).user?.companyId;
      if (userCid && String(userCid) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta empresa." });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      await db.execute(sql`DELETE FROM fleet_driver_aliases WHERE id = ${input.id} AND company_id = ${input.companyId}`);
      return { ok: true };
    }),
});
