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
import { invokeLLM } from "../_core/llm";

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
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
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
      let q = sql`SELECT v.*, o.nome as obra_nome, e.nome as motorista_nome
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
        SELECT v.*, o.nome as obra_nome, e.nome as motorista_nome
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
      crlvVencimento: z.string().optional(),
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
        crlvVencimento: input.crlvVencimento || null,
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
      crlvVencimento: z.string().nullable().optional(),
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

  listMaintenances: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT fm.*, v.placa, v.modelo, v.marca FROM fleet_maintenances fm JOIN vehicles v ON v.id = fm.vehicle_id WHERE fm.company_id = ${input.companyId}`;
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

  listFuelRecords: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT fr.*, v.placa, v.modelo, v.marca FROM fleet_fuel_records fr JOIN vehicles v ON v.id = fr.vehicle_id WHERE fr.company_id = ${input.companyId}`;
      if (input.vehicleId) q = sql`${q} AND fr.vehicle_id = ${input.vehicleId}`;
      q = sql`${q} ORDER BY fr.data DESC`;
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
      let inserted = 0;
      for (const r of input.data) {
        let consumo: string | null = null;
        if (r.kmAtual && r.kmAnterior) {
          const dist = n(r.kmAtual) - n(r.kmAnterior);
          const lit = n(r.litros);
          if (dist > 0 && lit > 0) consumo = (dist / lit).toFixed(2);
        }
        await db.insert(fleetFuelRecords).values({
          companyId: input.companyId, vehicleId: r.vehicleId, data: r.data,
          litros: r.litros, valorTotal: r.valorTotal,
          precoLitro: r.precoLitro || null, kmAtual: r.kmAtual || null, kmAnterior: r.kmAnterior || null,
          consumoKmL: consumo, tipoCombustivel: r.tipoCombustivel || "gasolina",
          motorista: r.motorista || null, posto: r.posto || null,
          criadoPor: input.criadoPor || null,
        });
        inserted++;
      }
      return { inserted };
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
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const vehiclesRes = await db.execute(sql`
        SELECT * FROM vehicles WHERE "companyId" = ${input.companyId} AND "statusVeiculo" != 'Inativo'
      `);
      const allVehicles = (vehiclesRes as any).rows || [];

      const maintRes = await db.execute(sql`
        SELECT * FROM fleet_maintenances WHERE company_id = ${input.companyId}
      `);
      const allMaint = (maintRes as any).rows || [];

      const fuelRes = await db.execute(sql`
        SELECT * FROM fleet_fuel_records WHERE company_id = ${input.companyId}
      `);
      const allFuel = (fuelRes as any).rows || [];

      const finesRes = await db.execute(sql`
        SELECT * FROM fleet_fines WHERE company_id = ${input.companyId}
      `);
      const allFines = (finesRes as any).rows || [];

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

      const totalVehicles = allVehicles.length;
      const totalFipe = allVehicles.reduce((s: number, v: any) => s + n(v.valor_fipe), 0);
      const totalCompra = allVehicles.reduce((s: number, v: any) => s + n(v.valor_compra), 0);
      const totalManutCusto = allMaint.reduce((s: number, m: any) => s + n(m.custo), 0);
      const totalCombustivel = allFuel.reduce((s: number, f: any) => s + n(f.valor_total), 0);
      const totalMultas = allFines.reduce((s: number, f: any) => s + n(f.valor_original), 0);
      const multasPendentes = allFines.filter((f: any) => f.status === "pendente").length;
      const totalIpvaPendente = allIpva.filter((i: any) => i.status === "pendente").reduce((s: number, i: any) => s + n(i.valor_total) - n(i.valor_pago), 0);

      const now = new Date();
      const depreciacao = allVehicles.reduce((s: number, v: any) => {
        const valorC = n(v.valor_compra);
        if (!valorC || !v.data_aquisicao) return s;
        const anos = (now.getTime() - new Date(v.data_aquisicao).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        const deprecAnos = v.depreciacao_anos || 5;
        const residual = n(v.valor_residual);
        const deprecAnual = (valorC - residual) / deprecAnos;
        const deprecTotal = Math.min(deprecAnual * anos, valorC - residual);
        return s + deprecTotal;
      }, 0);

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

      for (const m of allMaint) {
        if (m.status === "agendada" && m.data_proxima && m.data_proxima <= in30) {
          alertas.push({ tipo: "manutencao", msg: `Manutenção agendada: ${m.descricao}`, veiculoId: m.vehicle_id, urgencia: m.data_proxima <= today ? "critico" : "alerta" });
        }
      }

      for (const f of allFines) {
        if (f.status === "pendente" && f.data_vencimento && f.data_vencimento <= in30) {
          alertas.push({ tipo: "multa", msg: `Multa pendente: ${f.descricao} - R$ ${n(f.valor_original).toFixed(2)}`, veiculoId: f.vehicle_id, placa: f.placa, urgencia: f.data_vencimento <= today ? "critico" : "alerta" });
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

      const consumoMedio = allFuel.length > 0
        ? allFuel.reduce((s: number, f: any) => s + n(f.consumo_km_l), 0) / allFuel.filter((f: any) => n(f.consumo_km_l) > 0).length || 0
        : 0;

      const totalKm = allVehicles.reduce((s: number, v: any) => s + n(v.km_atual), 0);
      const custoKm = totalKm > 0 ? (totalManutCusto + totalCombustivel) / totalKm : 0;

      return {
        totalVehicles, totalFipe, totalCompra, depreciacao,
        totalManutCusto, totalCombustivel, totalMultas, multasPendentes,
        totalIpvaPendente, consumoMedio, custoKm, totalKm,
        tipoCount, marcaCount,
        fuelByMonth, maintByMonth,
        alertas,
        veiculosEmManutencao: allMaint.filter((m: any) => m.status === "em_andamento").length,
      };
    }),
});
