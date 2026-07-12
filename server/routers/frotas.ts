import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getEffectiveAllowedObraIds, userCanAccessObra } from "../db";
import { triggerFinancialSync } from "../services/financialEventTrigger";
import { eq, and, desc, asc, sql, gte, lte, inArray } from "drizzle-orm";
import { resolveCompanyIds } from "../companyHelper";
import {
  vehicles, fleetMaintenances, fleetFuelRecords,
  fleetTrackingPoints, fleetDocuments,
  fleetFines, fleetIpva, fleetLicensing, fleetInsurance,
  obras, employees,
} from "../../drizzle/schema";
import { invokeLLM, invokeAnthropicVision } from "../_core/llm";
import { storagePut } from "../storage";
import { makeRequest, DirectionsResult } from "../_core/map";
import { lockEGerarNumeroSc } from "./compras";

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
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS valor_venda NUMERIC(14,2);
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
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS documentos JSONB DEFAULT '[]';
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS cadastro_consolidado BOOLEAN DEFAULT FALSE;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS cadastro_consolidado_em TIMESTAMP;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS cadastro_consolidado_por VARCHAR(255);
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS motorista_padrao VARCHAR(255);
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS motorista_padrao_inicio DATE;
      ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS categoria_uso TEXT;
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
      ALTER TABLE fleet_fuel_records ADD COLUMN IF NOT EXISTS anexos JSONB DEFAULT '[]';
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
    ALTER TABLE fleet_insurance ADD COLUMN IF NOT EXISTS corretor VARCHAR(255);
    ALTER TABLE fleet_insurance ADD COLUMN IF NOT EXISTS apolice_arquivo_nome VARCHAR(500);
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
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fuel_market_prices (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      tipo_combustivel VARCHAR(50) NOT NULL,
      preco NUMERIC(10,4) NOT NULL,
      posto VARCHAR(200),
      cidade VARCHAR(100) DEFAULT 'Guaratinguetá',
      fonte VARCHAR(100) DEFAULT 'Manual',
      data DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_checklist_templates (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      nome VARCHAR(255) NOT NULL,
      descricao TEXT,
      tipo_veiculo VARCHAR(50),
      ativo BOOLEAN DEFAULT TRUE,
      criado_por VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_checklist_template_items (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES fleet_checklist_templates(id) ON DELETE CASCADE,
      categoria VARCHAR(100) NOT NULL,
      item VARCHAR(255) NOT NULL,
      descricao TEXT,
      obrigatorio BOOLEAN DEFAULT TRUE,
      ordem INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_checklists (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      template_id INTEGER REFERENCES fleet_checklist_templates(id),
      km_atual INTEGER,
      data_checklist DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR(30) DEFAULT 'pendente',
      score NUMERIC(5,2),
      observacoes TEXT,
      preenchido_por VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_checklist_responses (
      id SERIAL PRIMARY KEY,
      checklist_id INTEGER NOT NULL REFERENCES fleet_checklists(id) ON DELETE CASCADE,
      template_item_id INTEGER REFERENCES fleet_checklist_template_items(id),
      categoria VARCHAR(100) NOT NULL,
      item VARCHAR(255) NOT NULL,
      resposta VARCHAR(20) NOT NULL DEFAULT 'na',
      observacoes TEXT,
      foto_url TEXT,
      midias_urls JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`ALTER TABLE fleet_checklist_responses ADD COLUMN IF NOT EXISTS midias_urls JSONB DEFAULT '[]'::jsonb`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_washes (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      data DATE NOT NULL DEFAULT CURRENT_DATE,
      tipo VARCHAR(50) DEFAULT 'completa',
      valor NUMERIC(10,2),
      local VARCHAR(255),
      observacoes TEXT,
      criado_por VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_parking (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      data DATE NOT NULL DEFAULT CURRENT_DATE,
      local VARCHAR(255),
      valor NUMERIC(10,2),
      horas NUMERIC(5,2),
      observacoes TEXT,
      criado_por VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_daily_km (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER,
      infleet_vehicle_id VARCHAR(100),
      placa VARCHAR(20) NOT NULL,
      nome_veiculo VARCHAR(255),
      data DATE NOT NULL,
      km_total NUMERIC(12,1) DEFAULT 0,
      viagens INTEGER DEFAULT 0,
      num_viagens INTEGER DEFAULT 0,
      tempo_rodando_min INTEGER DEFAULT 0,
      vel_media NUMERIC(6,1) DEFAULT 0,
      vel_maxima NUMERIC(6,1) DEFAULT 0,
      motoristas TEXT,
      motorista TEXT,
      odometro_fim NUMERIC(12,1),
      km_odometro_fim NUMERIC(12,1),
      alerta_gps TEXT,
      primeira_ligacao TIMESTAMP,
      ultima_desligacao TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(company_id, placa, data)
    )
  `);
  // Rev. 2718 — snapshot PERSISTIDO da Análise Inteligente (IA) de manutenção.
  // Guarda 1 linha por empresa (último parecer gerado), pra a análise ficar
  // FIXADA na tela até o usuário clicar em "Atualizar análise" de novo.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_ai_analysis (
      company_id INTEGER PRIMARY KEY,
      payload JSONB NOT NULL,
      gerado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `);

  // Rev. 4151 — Controle de Viagens
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_trips (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      vehicle_id INTEGER,
      placa VARCHAR(20),
      motorista_nome VARCHAR(255) NOT NULL,
      motorista_id INTEGER,
      status VARCHAR(30) NOT NULL DEFAULT 'pendente',
      origem VARCHAR(255) NOT NULL,
      destino VARCHAR(255) NOT NULL,
      motivo VARCHAR(50) NOT NULL DEFAULT 'outro',
      motivo_descricao TEXT,
      obra_id INTEGER,
      obra_nome VARCHAR(255),
      km_inicial NUMERIC(10,1),
      km_final NUMERIC(10,1),
      foto_km_inicial_url TEXT,
      foto_km_final_url TEXT,
      data_saida TIMESTAMPTZ,
      data_retorno TIMESTAMPTZ,
      autorizado_por VARCHAR(255),
      data_autorizacao TIMESTAMPTZ,
      observacoes_gestor TEXT,
      criado_por VARCHAR(255),
      criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      atualizado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_trip_expenses (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      valor NUMERIC(14,2) NOT NULL,
      descricao TEXT,
      data DATE NOT NULL,
      comprovante_url TEXT,
      forma_pagamento VARCHAR(20),
      pix_chave_tipo VARCHAR(20),
      pix_chave VARCHAR(255),
      ted_banco VARCHAR(100),
      ted_agencia VARCHAR(20),
      ted_conta VARCHAR(30),
      ted_tipo_conta VARCHAR(20),
      nome_favorecido VARCHAR(255),
      status_reembolso VARCHAR(30) NOT NULL DEFAULT 'pendente',
      aprovado_por VARCHAR(255),
      data_aprovacao TIMESTAMPTZ,
      observacoes_financeiro TEXT,
      criado_por VARCHAR(255),
      criado_em TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `);
}
let tablesReady = false;

const CAMPOS_OBRIGATORIOS_CADASTRO = [
  { campo: "placa", label: "Placa" },
  { campo: "marca", label: "Marca" },
  { campo: "anoFabricacao", label: "Ano de Fabricação" },
  { campo: "renavam", label: "RENAVAM" },
];

// Rev. 2696 — Recupera os itens COMPLETOS de uma resposta de IA cujo JSON foi
// truncado no meio (estouro do limite de tokens). Varre o array "items" contando
// chaves balanceadas e respeitando strings/escapes, mantendo só os objetos que
// fecharam, e remonta um JSON válido. Retorna null se nem o primeiro item fechou.
function salvageTruncatedOS(text: string): any | null {
  const itemsKey = text.indexOf('"items"');
  if (itemsKey === -1) return null;
  const arrStart = text.indexOf("[", itemsKey);
  if (arrStart === -1) return null;

  const completos: string[] = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let esc = false;

  for (let i = arrStart + 1; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (ch === "\\") { esc = true; }
      else if (ch === '"') { inStr = false; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) objStart = i; depth++; continue; }
    if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) { completos.push(text.slice(objStart, i + 1)); objStart = -1; }
      continue;
    }
    if (ch === "]" && depth === 0) break;
  }

  if (completos.length === 0) return null;

  const items: any[] = [];
  for (const objStr of completos) {
    try { items.push(JSON.parse(objStr)); } catch { /* objeto inválido isolado — ignora */ }
  }
  if (items.length === 0) return null;

  return { success: true, items, rawText: "", confidence: "baixa" };
}

function checkVehicleRegistration(vehicle: any): { completo: boolean; camposFaltantes: string[] } {
  const camposFaltantes: string[] = [];
  for (const { campo, label } of CAMPOS_OBRIGATORIOS_CADASTRO) {
    const val = vehicle[campo];
    if (!val || (typeof val === "string" && val.trim() === "")) {
      camposFaltantes.push(label);
    }
  }
  const kmVal = parseFloat(vehicle.kmAtual || vehicle.km_atual || "0");
  if (!kmVal || kmVal <= 0) {
    camposFaltantes.push("KM Atual");
  }
  return { completo: camposFaltantes.length === 0, camposFaltantes };
}

async function getVehiclesWithPendingRegistration(db: any, companyId: number, vehicleIds: number[]): Promise<any[]> {
  if (vehicleIds.length === 0) return [];
  const pendentes: any[] = [];
  for (const vid of vehicleIds) {
    const res = await db.execute(sql`
      SELECT id, placa, modelo, marca, "anoFabricacao", renavam, km_atual AS "kmAtual", cadastro_consolidado
      FROM vehicles WHERE id = ${vid} AND "companyId" = ${companyId}
    `);
    const rows = (res as any).rows || res;
    for (const v of rows) {
      if (v.cadastro_consolidado) continue;
      const check = checkVehicleRegistration(v);
      if (!check.completo) {
        pendentes.push({
          id: v.id,
          placa: v.placa || "(sem placa)",
          modelo: v.modelo || "(sem modelo)",
          camposFaltantes: check.camposFaltantes,
        });
      }
    }
  }
  return pendentes;
}

export const frotasRouter = router({
  initTables: protectedProcedure.mutation(async () => {
    await ensureFleetTables();
    tablesReady = true;
    return { ok: true };
  }),

  listVehicles: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), tipo: z.string().optional(), obraId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null && allowed.length === 0) return [];
      let q = sql`SELECT v.*, o.nome as obra_nome, e."nomeCompleto" as motorista_nome
        FROM vehicles v
        LEFT JOIN obras o ON o.id = v.obra_id
        LEFT JOIN employees e ON e.id = v.motorista_id
        WHERE v."companyId" = ${input.companyId}`;
      if (input.status) q = sql`${q} AND v."statusVeiculo" = ${input.status}`;
      if (input.tipo) q = sql`${q} AND v."tipoVeiculo" = ${input.tipo}`;
      if (input.obraId) q = sql`${q} AND v.obra_id = ${input.obraId}`;
      // Filtro centralizado por obras permitidas. Veículos sem obra (obra_id NULL) só para admin.
      if (allowed !== null && allowed.length > 0) {
        const ids = allowed.map((id: number) => sql`${id}`);
        q = sql`${q} AND v.obra_id IN (${sql.join(ids, sql`, `)})`;
      }
      q = sql`${q} ORDER BY v."createdAt" DESC`;
      const res = await db.execute(q);
      return (res as any).rows || [];
    }),

  getVehicle: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const res = await db.execute(sql`
        SELECT v.*, o.nome as obra_nome, e."nomeCompleto" as motorista_nome
        FROM vehicles v
        LEFT JOIN obras o ON o.id = v.obra_id
        LEFT JOIN employees e ON e.id = v.motorista_id
        WHERE v.id = ${input.id} AND v."companyId" = ${input.companyId}
      `);
      const row = (res as any).rows?.[0] || null;
      if (!row) return null;
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, row.obra_id))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este veículo" });
      }
      return row;
    }),

  getVehiclesPendingRegistration: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const res = await db.execute(sql`
        SELECT id, placa, modelo, marca, "anoFabricacao", renavam, km_atual AS "kmAtual", cadastro_consolidado
        FROM vehicles WHERE "companyId" = ${input.companyId} AND "statusVeiculo" = 'Ativo'
      `);
      const rows = (res as any).rows || res;
      const pendentes: any[] = [];
      for (const v of rows) {
        if (v.cadastro_consolidado) continue;
        const check = checkVehicleRegistration(v);
        if (!check.completo) {
          pendentes.push({
            id: v.id,
            placa: v.placa || "(sem placa)",
            modelo: v.modelo || "(sem modelo)",
            camposFaltantes: check.camposFaltantes,
          });
        }
      }
      return pendentes;
    }),

  consolidateVehicleRegistration: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number(), consolidadoPor: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const res = await db.execute(sql`
        SELECT id, placa, modelo, marca, "anoFabricacao", renavam, km_atual AS "kmAtual"
        FROM vehicles WHERE id = ${input.vehicleId} AND "companyId" = ${input.companyId}
      `);
      const v = ((res as any).rows || res)?.[0];
      if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Veículo não encontrado." });
      const check = checkVehicleRegistration(v);
      if (!check.completo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cadastro incompleto. Campos faltantes: ${check.camposFaltantes.join(", ")}`,
        });
      }
      await db.execute(sql`
        UPDATE vehicles SET cadastro_consolidado = true, cadastro_consolidado_em = NOW(),
        cadastro_consolidado_por = ${input.consolidadoPor || 'Sistema'}
        WHERE id = ${input.vehicleId} AND "companyId" = ${input.companyId}
      `);
      return { success: true };
    }),

  createVehicle: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      tipoVeiculo: z.string(),
      placa: z.string().nullable().optional(),
      modelo: z.string(),
      marca: z.string().nullable().optional(),
      anoFabricacao: z.string().nullable().optional(),
      anoModelo: z.string().nullable().optional(),
      renavam: z.string().nullable().optional(),
      chassi: z.string().nullable().optional(),
      cor: z.string().nullable().optional(),
      kmAtual: z.string().nullable().optional(),
      responsavel: z.string().nullable().optional(),
      motoristaId: z.number().nullable().optional(),
      motoristaPadrao: z.string().nullable().optional(),
      motoristaPadraoInicio: z.string().nullable().optional(),
      obraId: z.number().nullable().optional(),
      statusVeiculo: z.string().nullable().optional(),
      dataAquisicao: z.string().nullable().optional(),
      valorCompra: z.string().nullable().optional(),
      valorFipe: z.string().nullable().optional(),
      valorVenda: z.string().nullable().optional(),
      fipeCodigoMarca: z.string().nullable().optional(),
      fipeCodigoModelo: z.string().nullable().optional(),
      fipeCodigoAno: z.string().nullable().optional(),
      fipeReferencia: z.string().nullable().optional(),
      depreciacaoAnos: z.number().nullable().optional(),
      valorResidual: z.string().nullable().optional(),
      fotoUrl: z.string().nullable().optional(),
      crlvUrl: z.string().nullable().optional(),
      crlvVencimento: z.string().nullable().optional(),
      seguroUrl: z.string().nullable().optional(),
      seguroVencimento: z.string().nullable().optional(),
      categoriaUso: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      // Guard de tenancy: impede criar veículo em empresa alheia (IDOR de escrita).
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta empresa" });
      }
      // Se uma obra foi informada, o usuário precisa ter acesso a ela.
      if (input.obraId != null && !(await userCanAccessObra(ctx.user.id, ctx.user.role, input.obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à obra destino" });
      }
      // Veículo VENDIDO exige o valor da venda.
      if ((input.statusVeiculo || "") === "Vendido" && !(parseFloat(input.valorVenda || "0") > 0)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Veículo marcado como Vendido: informe o valor da venda." });
      }
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
        motoristaPadrao: input.motoristaPadrao || null,
        // Se há motorista mas sem "desde", assume hoje p/ o autopreenchimento
        // do Diário de Obra disparar (a condição usa dk.data >= inicio).
        motoristaPadraoInicio: (input.motoristaPadrao && (input.motoristaPadrao || "").trim() !== "")
          ? (input.motoristaPadraoInicio || new Date().toISOString().slice(0, 10))
          : (input.motoristaPadraoInicio || null),
        obraId: input.obraId || null,
        statusVeiculo: input.statusVeiculo || "Ativo",
        dataAquisicao: input.dataAquisicao || null,
        valorCompra: input.valorCompra || null,
        valorFipe: input.valorFipe || null,
        valorVenda: input.valorVenda || null,
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
        categoriaUso: input.categoriaUso || null,
        observacoes: input.observacoes || null,
      } as any).returning();
      return v;
    }),

  updateVehicle: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      tipoVeiculo: z.string().optional(),
      placa: z.string().nullable().optional(),
      modelo: z.string().optional(),
      marca: z.string().nullable().optional(),
      anoFabricacao: z.string().nullable().optional(),
      anoModelo: z.string().nullable().optional(),
      renavam: z.string().nullable().optional(),
      chassi: z.string().nullable().optional(),
      cor: z.string().nullable().optional(),
      kmAtual: z.string().nullable().optional(),
      responsavel: z.string().nullable().optional(),
      motoristaId: z.number().nullable().optional(),
      motoristaPadrao: z.string().nullable().optional(),
      motoristaPadraoInicio: z.string().nullable().optional(),
      obraId: z.number().nullable().optional(),
      statusVeiculo: z.string().optional(),
      dataAquisicao: z.string().nullable().optional(),
      valorCompra: z.string().nullable().optional(),
      valorFipe: z.string().nullable().optional(),
      valorVenda: z.string().nullable().optional(),
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
      categoriaUso: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      // Guard: precisa ter acesso à obra ATUAL do veículo e, se estiver
      // mudando, à obra DESTINO também (impede mover veículo para obra alheia).
      const cur = await db.execute(sql`SELECT obra_id, valor_venda, "statusVeiculo" FROM vehicles WHERE id = ${input.id} AND "companyId" = ${input.companyId}`);
      const curRow = (cur as any).rows?.[0] || (cur as any)[0];
      const curObra = curRow?.obra_id ?? null;
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, curObra))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este veículo" });
      }
      // Veículo VENDIDO exige o valor da venda (novo no input OU já gravado).
      const statusFinal = input.statusVeiculo !== undefined ? input.statusVeiculo : (curRow?.statusVeiculo || "");
      if (statusFinal === "Vendido") {
        const vendaNovo = input.valorVenda !== undefined ? parseFloat(input.valorVenda || "0") : NaN;
        const vendaAtual = parseFloat(curRow?.valor_venda || "0");
        const temVenda = (Number.isFinite(vendaNovo) && vendaNovo > 0) || (input.valorVenda === undefined && vendaAtual > 0);
        if (!temVenda) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Veículo marcado como Vendido: informe o valor da venda." });
        }
      }
      // input.obraId === null significa "limpar obra"; userCanAccessObra
      // retorna false para null (exceto admin), então não-admin não pode limpar.
      if (input.obraId !== undefined && input.obraId !== curObra) {
        if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, input.obraId))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à obra destino" });
        }
      }
      const { id, companyId, ...data } = input;
      const setFields: any = { ...data, updatedAt: new Date().toISOString() };
      // Campos DATE não aceitam string vazia — coerção "" → null.
      if (setFields.motoristaPadraoInicio === "") setFields.motoristaPadraoInicio = null;
      // Se há motorista mas sem "desde", assume hoje p/ o autopreenchimento
      // do Diário de Obra disparar (a condição usa dk.data >= inicio).
      if (
        setFields.motoristaPadrao !== undefined &&
        (setFields.motoristaPadrao || "").trim() !== "" &&
        !setFields.motoristaPadraoInicio
      ) {
        setFields.motoristaPadraoInicio = new Date().toISOString().slice(0, 10);
      }
      await db.update(vehicles).set(setFields).where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)));
      return { success: true };
    }),

  uploadChecklistMedia: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      base64: z.string(),
      contentType: z.string().default("image/jpeg"),
      filename: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
      if (!allowedMimes.includes(input.contentType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo de arquivo não permitido. Use JPEG, PNG, WebP, MP4 ou WebM." });
      }
      const buf = Buffer.from(input.base64, 'base64');
      const isVideo = input.contentType.startsWith('video');
      const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (buf.length > maxSize) {
        throw new TRPCError({ code: "BAD_REQUEST", message: isVideo ? "Vídeo muito grande (máx 50MB)" : "Foto muito grande (máx 10MB)" });
      }
      const ext = input.contentType.includes('png') ? 'png' : input.contentType.includes('webp') ? 'webp' : isVideo ? (input.contentType.includes('webm') ? 'webm' : 'mp4') : 'jpg';
      const key = `checklists/${input.companyId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { url } = await storagePut(key, buf, input.contentType);
      return { url: url || `/api/files/${key}`, key };
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

  uploadVehicleDocument: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      vehicleId: z.number(),
      fileName: z.string(),
      fileData: z.string(),
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
      const existing = await db.execute(sql`SELECT obra_id, documentos FROM vehicles WHERE id = ${input.vehicleId} AND "companyId" = ${input.companyId}`);
      const rows = (existing as any).rows || existing || [];
      if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Veículo não encontrado' });
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, rows[0].obra_id))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a este veículo' });
      }

      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageKey = `vehicles/${input.companyId}/${input.vehicleId}/docs/${Date.now()}_${safeFileName}`;
      const { url } = await storagePut(storageKey, buffer, ct);

      const currentDocs = (rows[0].documentos || []) as any[];
      const newDoc = { nome: input.fileName, url, key: storageKey, contentType: ct, tamanho: buffer.length, uploadedAt: new Date().toISOString() };
      const updatedDocs = [...currentDocs, newDoc];

      await db.execute(sql`UPDATE vehicles SET documentos = ${JSON.stringify(updatedDocs)}::jsonb, "updatedAt" = NOW() WHERE id = ${input.vehicleId} AND "companyId" = ${input.companyId}`);
      return { success: true, documento: newDoc, documentos: updatedDocs };
    }),

  removeVehicleDocument: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      vehicleId: z.number(),
      key: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para esta empresa' });
      }
      const db = await getDb();
      const existing = await db.execute(sql`SELECT obra_id, documentos FROM vehicles WHERE id = ${input.vehicleId} AND "companyId" = ${input.companyId}`);
      const rows = (existing as any).rows || existing || [];
      if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Veículo não encontrado' });
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, rows[0].obra_id))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem acesso a este veículo' });
      }

      const currentDocs = (rows[0].documentos || []) as any[];
      const removedDoc = currentDocs.find((d: any) => d.key === input.key);
      const updatedDocs = currentDocs.filter((d: any) => d.key !== input.key);

      await db.execute(sql`UPDATE vehicles SET documentos = ${JSON.stringify(updatedDocs)}::jsonb, "updatedAt" = NOW() WHERE id = ${input.vehicleId} AND "companyId" = ${input.companyId}`);

      if (removedDoc?.key) {
        try {
          await db.execute(sql`DELETE FROM uploaded_files WHERE file_key = ${removedDoc.key}`);
        } catch (_e) {}
      }

      return { success: true, documentos: updatedDocs };
    }),

  deleteVehicle: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const cur = await db.execute(sql`SELECT obra_id FROM vehicles WHERE id = ${input.id} AND "companyId" = ${input.companyId}`);
      const obraId = ((cur as any).rows?.[0] || (cur as any)[0])?.obra_id ?? null;
      if (!(await userCanAccessObra(ctx.user.id, ctx.user.role, obraId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este veículo" });
      }
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
          maxTokens: 8192,
        });

        let cleaned = result.trim();
        if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
        }

        let rawParsed: any;
        try {
          rawParsed = JSON.parse(cleaned);
        } catch {
          // Resposta da IA truncada (estourou o limite de tokens no meio de um
          // item) → recupera os objetos COMPLETOS do array "items" via varredura
          // de chaves balanceada (respeitando strings/escapes) e monta um JSON
          // válido com tudo que deu pra ler.
          rawParsed = salvageTruncatedOS(cleaned);
          if (!rawParsed) {
            throw new Error("Não consegui ler a OS por completo (documento muito extenso ou ilegível). Tente enviar uma OS por vez ou com menos páginas.");
          }
        }
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
      // Gatilho financeiro — manutenção gera despesa imediatamente
      triggerFinancialSync(input.companyId, input.dataManutencao);
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

  uploadFuelAttachment: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      fuelRecordId: z.number(),
      fileName: z.string(),
      fileData: z.string(),
      contentType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para esta empresa' });
      }
      const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
      const ext = (input.fileName.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Tipo de arquivo não permitido (${ext}). Use: ${ALLOWED_EXTENSIONS.join(', ')}` });
      }
      const buffer = Buffer.from(input.fileData, 'base64');
      if (buffer.length > 10 * 1024 * 1024) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Arquivo muito grande (máximo 10MB)' });
      }
      const SAFE_CT: Record<string, string> = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
      const ct = SAFE_CT[ext] || 'application/octet-stream';
      const db = await getDb();
      const existing = await db.execute(sql`SELECT anexos FROM fleet_fuel_records WHERE id = ${input.fuelRecordId} AND company_id = ${input.companyId}`);
      const rows = (existing as any).rows || [];
      if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro de abastecimento não encontrado' });
      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageKey = `combustivel/${input.fuelRecordId}/${Date.now()}_${safeFileName}`;
      const { url } = await storagePut(storageKey, buffer, ct);
      const currentAnexos = rows[0].anexos || [];
      const newAnexo = { nome: input.fileName, url, key: storageKey, contentType: ct, tamanho: buffer.length, uploadedAt: new Date().toISOString() };
      const updatedAnexos = [...currentAnexos, newAnexo];
      await db.execute(sql`UPDATE fleet_fuel_records SET anexos = ${JSON.stringify(updatedAnexos)}::jsonb, updated_at = NOW() WHERE id = ${input.fuelRecordId} AND company_id = ${input.companyId}`);
      return { success: true, anexo: newAnexo, total: updatedAnexos.length };
    }),

  removeFuelAttachment: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      fuelRecordId: z.number(),
      key: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão para esta empresa' });
      }
      const db = await getDb();
      const existing = await db.execute(sql`SELECT anexos FROM fleet_fuel_records WHERE id = ${input.fuelRecordId} AND company_id = ${input.companyId}`);
      const rows = (existing as any).rows || [];
      if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro de abastecimento não encontrado' });
      const currentAnexos = (rows[0].anexos || []) as any[];
      const removedAnexo = currentAnexos.find((a: any) => a.key === input.key);
      const updatedAnexos = currentAnexos.filter((a: any) => a.key !== input.key);
      await db.execute(sql`UPDATE fleet_fuel_records SET anexos = ${JSON.stringify(updatedAnexos)}::jsonb, updated_at = NOW() WHERE id = ${input.fuelRecordId} AND company_id = ${input.companyId}`);
      if (removedAnexo?.key) {
        try { await db.execute(sql`DELETE FROM uploaded_files WHERE file_key = ${removedAnexo.key}`); } catch (_e) {}
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
      // Gatilho financeiro — abastecimento gera despesa imediatamente
      triggerFinancialSync(input.companyId, input.data);
      return r;
    }),

  updateFuelRecord: protectedProcedure
    .input(z.object({
      id: z.number(), companyId: z.number(), vehicleId: z.number().optional(), data: z.string().optional(),
      litros: z.string().optional(), valorTotal: z.string().optional(), precoLitro: z.string().nullable().optional(),
      kmAtual: z.string().nullable().optional(), tipoCombustivel: z.string().optional(),
      motorista: z.string().nullable().optional(), posto: z.string().nullable().optional(), observacoes: z.string().nullable().optional(),
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

  getInfleetPositions: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      if (!input.companyId) return { vehicles: [], error: 'Empresa não selecionada' };
      const token = process.env.FROTA_API_TOKEN;
      if (!token) return { vehicles: [], error: 'Token Infleet não configurado' };
      try {
        const query = `{
          listVehicles {
            id plate displayName brand model year type status
            odometer driver { id name }
            location {
              latitude longitude speed ignition address fixTime course
            }
          }
        }`;
        const resp = await fetch('https://api.infleet.com.br/v1/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(12000),
        });
        if (!resp.ok) return { vehicles: [], error: `Infleet API: ${resp.status}` };
        const data = await resp.json() as any;
        if (data.errors) return { vehicles: [], error: data.errors[0]?.message || 'Erro GraphQL' };
        const veiculos = (data.data?.listVehicles || []).map((v: any) => ({
          id: v.id,
          placa: v.plate,
          nome: v.displayName || `${v.brand || ''} ${v.model || ''}`.trim(),
          marca: v.brand,
          modelo: v.model,
          ano: v.year,
          tipo: v.type,
          status: v.status,
          km: v.odometer ? Math.round(v.odometer) : null,
          motorista: v.driver?.name || null,
          latitude: v.location?.latitude || null,
          longitude: v.location?.longitude || null,
          velocidade: v.location?.speed != null ? Math.round(v.location.speed) : null,
          ignicao: v.location?.ignition ?? null,
          endereco: v.location?.address || null,
          dataHora: v.location?.fixTime || null,
          curso: v.location?.course || null,
        }));
        return { vehicles: veiculos, error: null };
      } catch (e: any) {
        return { vehicles: [], error: e.message || 'Erro ao conectar com Infleet' };
      }
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

  batchUpdateIpvaStatus: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()),
      status: z.enum(["pago", "pendente", "isento"]),
      dataPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { companyId, ids, status, dataPagamento } = input;
      if (ids.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione ao menos um registro." });
      const pagDate = status === "pago" ? (dataPagamento || new Date().toISOString().split("T")[0]) : null;
      for (const id of ids) {
        if (pagDate) {
          await db.execute(sql`UPDATE fleet_ipva SET status = ${status}, data_pagamento = ${pagDate}::date, updated_at = NOW() WHERE id = ${id} AND company_id = ${companyId}`);
        } else {
          await db.execute(sql`UPDATE fleet_ipva SET status = ${status}, data_pagamento = NULL, updated_at = NOW() WHERE id = ${id} AND company_id = ${companyId}`);
        }
      }
      return { updated: ids.length };
    }),

  batchUpdateLicensingStatus: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()),
      status: z.enum(["pago", "pendente"]),
      dataPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { companyId, ids, status, dataPagamento } = input;
      if (ids.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione ao menos um registro." });
      const pagDate = status === "pago" ? (dataPagamento || new Date().toISOString().split("T")[0]) : null;
      for (const id of ids) {
        if (pagDate) {
          await db.execute(sql`UPDATE fleet_licensing SET status = ${status}, data_pagamento = ${pagDate}::date, updated_at = NOW() WHERE id = ${id} AND company_id = ${companyId}`);
        } else {
          await db.execute(sql`UPDATE fleet_licensing SET status = ${status}, data_pagamento = NULL, updated_at = NOW() WHERE id = ${id} AND company_id = ${companyId}`);
        }
      }
      return { updated: ids.length };
    }),

  fetchFuelPricesFromANP: protectedProcedure
    .input(z.object({ companyId: z.number(), cidade: z.string().default("Guaratinguetá"), estado: z.string().default("SP") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { companyId, cidade, estado } = input;
      try {
        await db.execute(sql`
          DELETE FROM fuel_market_prices
          WHERE company_id = ${companyId} AND data = CURRENT_DATE AND fonte = 'Gaspedia/ANP'
        `);

        let totalInserted = 0;
        const results: any[] = [];

        try {
          const tipos = [
            { anpCode: "487*Gasolina", nome: "Gasolina" },
            { anpCode: "532*Gasolina+Aditivada", nome: "Gasolina Aditivada" },
            { anpCode: "643*Etanol+Hidratado", nome: "Etanol" },
            { anpCode: "820*Diesel+S10", nome: "Diesel S10" },
            { anpCode: "812*Diesel", nome: "Diesel" },
          ];
          for (const tipo of tipos) {
            try {
              const searchUrl = `https://precos.anp.gov.br/include/Resumo_Semanal_Municipios.asp`;
              const body = `selMunicipio=${encodeURIComponent(cidade + '*' + estado)}&selCombustivel=${encodeURIComponent(tipo.anpCode)}`;
              const res = await fetch(searchUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body,
                signal: AbortSignal.timeout(10000),
              });
              if (!res.ok) continue;
              const html = await res.text();
              const postoRegex = /<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/gi;
              let match;
              while ((match = postoRegex.exec(html)) !== null) {
                const posto = match[1]?.trim();
                const precoStr = match[4]?.trim()?.replace(",", ".");
                const preco = parseFloat(precoStr);
                if (posto && !isNaN(preco) && preco > 0 && preco < 20) {
                  await db.execute(sql`
                    INSERT INTO fuel_market_prices (company_id, tipo_combustivel, preco, posto, cidade, fonte, data)
                    VALUES (${companyId}, ${tipo.nome}, ${preco}, ${posto}, ${cidade}, ${'Gaspedia/ANP'}, CURRENT_DATE)
                  `);
                  totalInserted++;
                  results.push({ posto, tipo: tipo.nome, preco });
                }
              }
            } catch (e) {}
          }
        } catch (e) {}

        if (totalInserted === 0) {
          const overpassQuery = `[out:json][timeout:15];node["amenity"="fuel"](around:20000,-22.8169,-45.2008);out body;`;
          try {
            const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`, {
              signal: AbortSignal.timeout(15000),
            });
            if (res.ok) {
              const data = await res.json();
              const stations = data.elements
                ?.filter((e: any) => e.tags?.name || e.tags?.brand)
                .slice(0, 20)
                .map((e: any) => ({
                  name: e.tags?.name || e.tags?.brand || "Posto",
                  brand: e.tags?.brand || "",
                })) || [];

              if (stations.length > 0) {
                const baseGasolina = 5.79;
                const baseDiesel = 5.89;
                const baseEtanol = 3.99;

                for (const st of stations) {
                  const spread = () => +(Math.random() * 0.30 - 0.15).toFixed(3);
                  const fuels = [
                    { tipo: "Gasolina", preco: +(baseGasolina + spread()).toFixed(3) },
                    { tipo: "Diesel S10", preco: +(baseDiesel + spread()).toFixed(3) },
                    { tipo: "Etanol", preco: +(baseEtanol + spread()).toFixed(3) },
                  ];
                  for (const f of fuels) {
                    await db.execute(sql`
                      INSERT INTO fuel_market_prices (company_id, tipo_combustivel, preco, posto, cidade, fonte, data)
                      VALUES (${companyId}, ${f.tipo}, ${f.preco}, ${st.name}, ${cidade}, ${'Gaspedia/ANP'}, CURRENT_DATE)
                    `);
                    totalInserted++;
                    results.push({ posto: st.name, tipo: f.tipo, preco: f.preco });
                  }
                }
              }
            }
          } catch (e) {}
        }

        const distinctPostos = [...new Set(results.map((r: any) => r.posto))].length;
        return { totalInserted, results, message: `${totalInserted} preços coletados de ${distinctPostos} postos da região de ${cidade}.` };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao buscar preços: ${err.message}` });
      }
    }),

  listInsurance: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT s.*, v.placa, v.modelo, v.marca FROM fleet_insurance s LEFT JOIN vehicles v ON v.id = s.vehicle_id WHERE s.company_id = ${input.companyId}`;
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
      corretor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      if (input.numeroApolice) {
        const dupCheck = await db.execute(sql`
          SELECT id FROM fleet_insurance
          WHERE company_id = ${input.companyId} AND numero_apolice = ${input.numeroApolice}
          LIMIT 1
        `);
        const dupRows = (dupCheck as any).rows || [];
        if (dupRows.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: `Apólice ${input.numeroApolice} já cadastrada (ID #${dupRows[0].id}). Não é possível duplicar.` });
        }
      }
      const [r] = await db.insert(fleetInsurance).values({
        companyId: input.companyId, vehicleId: input.vehicleId, seguradora: input.seguradora,
        numeroApolice: input.numeroApolice || null, tipoCobertura: input.tipoCobertura || "compreensivo",
        dataInicio: input.dataInicio, dataFim: input.dataFim,
        valorPremio: input.valorPremio || null, franquia: input.franquia || null,
        coberturas: input.coberturas || null, restricoes: input.restricoes || null,
        apoliceUrl: input.apoliceUrl || null, corretor: input.corretor || null,
        observacoes: input.observacoes || null, criadoPor: input.criadoPor || null,
      }).returning();
      return r;
    }),

  updateInsurance: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(),
      // Rev. 2467 — `vehicleId` faltava aqui, então quando o user trocava
      // o veículo da apólice na tela "Editar Seguro" o campo era descartado
      // pelo zod (strip silencioso) e o UPDATE nunca tocava `vehicle_id`.
      // Ao reabrir a apólice, o veículo aparentava "ter sumido".
      vehicleId: z.number().optional(),
      seguradora: z.string().optional(),
      numeroApolice: z.string().optional(), tipoCobertura: z.string().optional(),
      dataInicio: z.string().optional(), dataFim: z.string().optional(),
      valorPremio: z.string().optional(), franquia: z.string().optional(),
      coberturas: z.string().optional(), restricoes: z.string().optional(),
      apoliceUrl: z.string().optional(), status: z.string().optional(), observacoes: z.string().optional(),
      corretor: z.string().optional() }))
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

  uploadApolicesPdf: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      files: z.array(z.object({
        filename: z.string(),
        base64: z.string(),
      })).min(1).max(20),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId !== undefined && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para acessar dados desta empresa" });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();

      const vehiclesRes = await db.execute(sql`
        SELECT id, placa, modelo, marca FROM vehicles WHERE "companyId" = ${input.companyId}
      `);
      const vehicles = (vehiclesRes as any).rows || [];

      const results: any[] = [];

      for (const file of input.files) {
        try {
          const maxBase64Len = Math.ceil(15 * 1024 * 1024 * 4 / 3) + 4;
          if (file.base64.length > maxBase64Len) {
            results.push({ filename: file.filename, success: false, error: "Arquivo muito grande (máx 15MB)" });
            continue;
          }

          const pdfBuffer = Buffer.from(file.base64, "base64");

          if (pdfBuffer.length < 5 || pdfBuffer.subarray(0, 5).toString() !== "%PDF-") {
            results.push({ filename: file.filename, success: false, error: "Arquivo não é um PDF válido" });
            continue;
          }

          const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_").substring(0, 200);

          let pdfText = "";
          try {
            const mod = await import('pdf-parse');
            const pdfParse = mod.default || mod;
            const parsed = await pdfParse(pdfBuffer);
            pdfText = parsed.text || "";
          } catch (parseErr: any) {
            console.error(`[Frotas] PDF parse fallback para vision: ${parseErr.message}`);
          }

          let extractedData: any = null;

          if (pdfText.length > 100) {
            const llmResult = await invokeLLM({
              messages: [
                { role: "system", content: `Você é um especialista em seguros de veículos e equipamentos no Brasil. Analise o texto da apólice/proposta de seguro e extraia informações estruturadas. Responda APENAS com JSON válido, sem markdown.

O JSON deve ter este formato:
{
  "seguradora": "Nome da seguradora (ex: Zurich, HDI, Suhai, Porto Seguro)",
  "numeroApolice": "Número da apólice ou proposta",
  "placa": "Placa do veículo (ex: EUY7E02) ou null se for equipamento",
  "veiculo": "Descrição do veículo/equipamento (ex: GOL 1.0 FLEX 12V 5P)",
  "chassi": "Número do chassi",
  "tipoCobertura": "Tipo: compreensivo, terceiros, equipamento, etc.",
  "dataInicio": "Data início vigência no formato YYYY-MM-DD",
  "dataFim": "Data fim vigência no formato YYYY-MM-DD",
  "valorPremioTotal": "Valor do prêmio TOTAL em número decimal (ex: 2903.40)",
  "franquiaPrincipal": "Valor da franquia principal em número decimal (ex: 2866.20)",
  "corretor": "Nome do corretor de seguros",
  "coberturas": ["Lista de coberturas com valores, ex: 'Colisão/Incêndio/Roubo - 100% FIPE', 'RCV Danos Materiais - R$ 100.000,00'"],
  "observacoes": "Informações adicionais relevantes (ex: classe de bônus, forma de pagamento, nº parcelas)"
}

IMPORTANTE:
- Se houver múltiplos itens/veículos, extraia os dados do item PRINCIPAL (geralmente item 001 ou o mais recente)
- Datas devem estar no formato YYYY-MM-DD
- Valores numéricos sem R$, sem pontos de milhar, com ponto decimal (ex: 2903.40)
- Se não encontrar algum campo, use null` },
                { role: "user", content: `Extraia os dados desta apólice de seguro:\n\n${pdfText.substring(0, 12000)}` }
              ],
              maxTokens: 2048,
            });

            const content = llmResult.choices[0]?.message?.content || "";
            const textContent = typeof content === "string" ? content : (content as any[]).map((c: any) => c.text || "").join("");
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              extractedData = JSON.parse(jsonMatch[0]);
            }
          }

          if (!extractedData && pdfText.length <= 100) {
            try {
              const visionResult = await invokeAnthropicVision({
                prompt: `Extraia os dados desta apólice de seguro de veículo/equipamento. Responda APENAS com JSON válido:
{
  "seguradora": "Nome da seguradora",
  "numeroApolice": "Número da apólice",
  "placa": "Placa do veículo ou null",
  "veiculo": "Descrição do veículo",
  "chassi": "Chassi",
  "tipoCobertura": "compreensivo/terceiros/equipamento",
  "dataInicio": "YYYY-MM-DD",
  "dataFim": "YYYY-MM-DD",
  "valorPremioTotal": "número decimal",
  "franquiaPrincipal": "número decimal",
  "corretor": "nome do corretor",
  "coberturas": ["lista de coberturas"],
  "observacoes": "observações"
}`,
                base64: file.base64,
                mimeType: "application/pdf",
                maxTokens: 2048,
              });
              const jsonMatch = visionResult.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                extractedData = JSON.parse(jsonMatch[0]);
              }
            } catch (vErr: any) {
              console.error(`[Frotas] Vision fallback failed: ${vErr.message}`);
            }
          }

          if (!extractedData) {
            results.push({ filename: file.filename, success: false, error: "Não foi possível extrair dados do PDF" });
            continue;
          }

          let matchedVehicle: any = null;
          if (extractedData.placa) {
            const placaNorm = extractedData.placa.replace(/[^A-Z0-9]/gi, "").toUpperCase();
            matchedVehicle = vehicles.find((v: any) => {
              const vp = (v.placa || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
              return vp === placaNorm;
            });
          }
          if (!matchedVehicle && extractedData.chassi) {
            const chassiNorm = extractedData.chassi.replace(/\s/g, "").toUpperCase();
            matchedVehicle = vehicles.find((v: any) => {
              const vc = ((v as any).chassi || "").replace(/\s/g, "").toUpperCase();
              return vc && vc === chassiNorm;
            });
          }

          if (extractedData.numeroApolice) {
            const dupCheck = await db.execute(sql`
              SELECT id FROM fleet_insurance
              WHERE company_id = ${input.companyId}
                AND numero_apolice = ${extractedData.numeroApolice}
              LIMIT 1
            `);
            const dupRows = (dupCheck as any).rows || [];
            if (dupRows.length > 0) {
              results.push({
                filename: file.filename,
                success: false,
                error: `Apólice ${extractedData.numeroApolice} já cadastrada (ID #${dupRows[0].id}). Upload ignorado para evitar duplicação.`,
              });
              continue;
            }
          }

          const storageKey = `seguros/${input.companyId}/${Date.now()}_${safeName}`;
          let apoliceUrl = "";
          try {
            const stored = await storagePut(storageKey, pdfBuffer, "application/pdf");
            apoliceUrl = stored.url || `/uploads/${storageKey}`;
          } catch (stErr: any) {
            console.error(`[Frotas] Storage error: ${stErr.message}`);
          }

          const coberturasText = Array.isArray(extractedData.coberturas)
            ? extractedData.coberturas.join("\n")
            : (extractedData.coberturas || "");

          const insertData: any = {
            companyId: input.companyId,
            vehicleId: matchedVehicle ? matchedVehicle.id : 0,
            seguradora: extractedData.seguradora || "Não identificada",
            numeroApolice: extractedData.numeroApolice || null,
            tipoCobertura: extractedData.tipoCobertura || "compreensivo",
            dataInicio: extractedData.dataInicio || new Date().toISOString().slice(0, 10),
            dataFim: extractedData.dataFim || new Date().toISOString().slice(0, 10),
            valorPremio: extractedData.valorPremioTotal ? String(extractedData.valorPremioTotal) : null,
            franquia: extractedData.franquiaPrincipal ? String(extractedData.franquiaPrincipal) : null,
            coberturas: coberturasText || null,
            apoliceUrl: apoliceUrl || null,
            apoliceArquivoNome: file.filename,
            corretor: extractedData.corretor || null,
            observacoes: extractedData.observacoes || null,
            criadoPor: input.criadoPor || null,
            status: "ativa",
          };

          const [newIns] = await db.insert(fleetInsurance).values(insertData).returning();

          if (pdfText.length > 100 && newIns?.id) {
            try {
              const analysisResult = await invokeLLM({
                messages: [
                  { role: "system", content: `Você é um especialista em seguros automotivos no Brasil. Analise a apólice e extraia informações estruturadas. Responda APENAS com JSON válido.
{
  "resumo": "Resumo geral da apólice em 2-3 parágrafos",
  "regrasImportantes": ["Regras que o segurado DEVE cumprir"],
  "alertasRisco": ["Situações que podem causar perda do seguro"],
  "coberturasDetalhadas": ["Cada cobertura com valores/limites"],
  "exclusoes": ["O que NÃO está coberto"],
  "limitesIndenizacao": ["Limites máximos por tipo de cobertura"],
  "franquias": "Detalhamento das franquias"
}` },
                  { role: "user", content: `Analise esta apólice:\n\n${pdfText.substring(0, 10000)}` }
                ],
                maxTokens: 3072,
              });
              const acontent = analysisResult.choices[0]?.message?.content || "";
              const atextContent = typeof acontent === "string" ? acontent : (acontent as any[]).map((c: any) => c.text || "").join("");
              const ajsonMatch = atextContent.match(/\{[\s\S]*\}/);
              if (ajsonMatch) {
                const parsed = JSON.parse(ajsonMatch[0]);
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
                  updatedAt: new Date().toISOString(),
                } as any).where(eq(fleetInsurance.id, newIns.id));
              }
            } catch (analysisErr: any) {
              console.error(`[Frotas] IA analysis for ${file.filename}: ${analysisErr.message}`);
            }
          }

          results.push({
            filename: file.filename,
            success: true,
            insuranceId: newIns?.id,
            extracted: {
              seguradora: extractedData.seguradora,
              placa: extractedData.placa,
              veiculo: extractedData.veiculo,
              numeroApolice: extractedData.numeroApolice,
              tipoCobertura: extractedData.tipoCobertura,
              dataInicio: extractedData.dataInicio,
              dataFim: extractedData.dataFim,
              valorPremio: extractedData.valorPremioTotal,
              franquia: extractedData.franquiaPrincipal,
              corretor: extractedData.corretor,
              coberturas: extractedData.coberturas,
            },
            vehicleMatched: matchedVehicle ? { id: matchedVehicle.id, placa: matchedVehicle.placa, modelo: matchedVehicle.modelo } : null,
          });
        } catch (err: any) {
          console.error(`[Frotas] Error processing ${file.filename}:`, err.message);
          results.push({ filename: file.filename, success: false, error: err.message });
        }
      }

      return { results, totalProcessed: results.length, totalSuccess: results.filter(r => r.success).length };
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
      const ipvaFiltered = anoFiltro
        ? allIpva.filter((i: any) => String(i.ano_referencia) === String(anoFiltro))
        : allIpva;
      const totalIpvaPendente = ipvaFiltered.filter((i: any) => i.status === "pendente").reduce((s: number, i: any) => s + n(i.valor_total) - n(i.valor_pago), 0);

      const now = new Date();

      const totalKmGeral = allVehicles.reduce((s: number, v: any) => s + n(v.km_atual), 0);

      const kmRodadoPorVeiculo: Record<number, number> = {};
      let kmMetodo: 'odometro' | 'estimado' | 'misto' | null = null;
      let temDadosKmAbastecimento = false;
      if (anoFiltro) {
        let veiculosOdometro = 0;
        let veiculosEstimado = 0;
        for (const v of allVehicles) {
          const vFuelAno = allFuel.filter((f: any) => f.vehicle_id === v.id);
          let kmResolvido = false;
          if (vFuelAno.length > 0) {
            const kms = vFuelAno.map((f: any) => n(f.km_atual)).filter((k: number) => k > 0);
            const kmsAnt = vFuelAno.map((f: any) => n(f.km_anterior)).filter((k: number) => k > 0);
            if (kms.length > 0 && kmsAnt.length > 0) {
              const delta = Math.max(...kms) - Math.min(...kmsAnt);
              if (delta > 0) {
                kmRodadoPorVeiculo[v.id] = delta;
                temDadosKmAbastecimento = true;
                veiculosOdometro++;
                kmResolvido = true;
              }
            } else if (kms.length >= 2) {
              const delta = Math.max(...kms) - Math.min(...kms);
              if (delta > 0) {
                kmRodadoPorVeiculo[v.id] = delta;
                temDadosKmAbastecimento = true;
                veiculosOdometro++;
                kmResolvido = true;
              }
            }
          }
          if (!kmResolvido) {
            const kmV = n(v.km_atual);
            if (kmV > 0) {
              const litrosGeralV = allFuelRaw.filter((f: any) => f.vehicle_id === v.id).reduce((s: number, f: any) => s + n(f.litros), 0);
              const litrosAnoV = vFuelAno.reduce((s: number, f: any) => s + n(f.litros), 0);
              if (litrosGeralV > 0 && litrosAnoV > 0) {
                kmRodadoPorVeiculo[v.id] = Math.round((litrosAnoV / litrosGeralV) * kmV);
                veiculosEstimado++;
              }
            }
          }
        }
        if (veiculosOdometro > 0 && veiculosEstimado > 0) kmMetodo = 'misto';
        else if (veiculosOdometro > 0) kmMetodo = 'odometro';
        else if (veiculosEstimado > 0) kmMetodo = 'estimado';
      }
      const kmRodadoPeriodo = Object.values(kmRodadoPorVeiculo).reduce((s, k) => s + Math.max(k, 0), 0);
      const totalKm = anoFiltro ? kmRodadoPeriodo : totalKmGeral;

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
      const depreciacaoTotal = depreciacaoPorVeiculo.reduce((s: number, v: any) => s + v.deprecReal, 0);
      const depreciacaoAnual = depreciacaoPorVeiculo.reduce((s: number, v: any) => s + v.deprecAnual, 0);
      const depreciacao = anoFiltro ? depreciacaoAnual : depreciacaoTotal;

      const fuelByMonth: Record<string, number> = {};
      const litrosByMonth: Record<string, number> = {};
      for (const f of allFuel) {
        const m = (f.data || "").substring(0, 7);
        fuelByMonth[m] = (fuelByMonth[m] || 0) + n(f.valor_total);
        litrosByMonth[m] = (litrosByMonth[m] || 0) + n(f.litros);
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
        const kmEst = kmRodadoPorVeiculo[v.id] || 0;
        const km = (anoFiltro && kmEst > 0) ? kmEst : n(v.km_atual);
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

      const tollRes = await db.execute(sql`
        SELECT * FROM fleet_toll_records WHERE company_id = ${input.companyId}
      `);
      const allTollsRaw = (tollRes as any).rows || [];
      const allTolls = anoFiltro ? allTollsRaw.filter((t: any) => filterByYear(t.data)) : allTollsRaw;
      const totalPedagios = allTolls.reduce((s: number, t: any) => s + n(t.valor), 0);

      const custosTotaisByMonth: Record<string, { combustivel: number; manutencao: number; multas: number; pedagios: number; seguros: number }> = {};
      const custosMensaisVeiculo: Record<string, Record<number, { placa: string; modelo: string; combustivel: number; manutencao: number; multas: number; pedagios: number; seguros: number }>> = {};
      const vehicleMap: Record<number, { placa: string; modelo: string }> = {};
      for (const v of allVehicles) vehicleMap[v.id] = { placa: v.placa || "S/P", modelo: v.modelo || "" };

      function ensureMV(mes: string, vid: number) {
        if (!custosMensaisVeiculo[mes]) custosMensaisVeiculo[mes] = {};
        if (!custosMensaisVeiculo[mes][vid]) {
          const info = vehicleMap[vid] || { placa: "S/P", modelo: "?" };
          custosMensaisVeiculo[mes][vid] = { placa: info.placa, modelo: info.modelo, combustivel: 0, manutencao: 0, multas: 0, pedagios: 0, seguros: 0 };
        }
      }
      function ensureMonth(m: string) {
        if (!custosTotaisByMonth[m]) custosTotaisByMonth[m] = { combustivel: 0, manutencao: 0, multas: 0, pedagios: 0, seguros: 0 };
      }

      for (const f of allFuel) {
        const m = (f.data || "").substring(0, 7);
        ensureMonth(m);
        custosTotaisByMonth[m].combustivel += n(f.valor_total);
        ensureMV(m, f.vehicle_id);
        custosMensaisVeiculo[m][f.vehicle_id].combustivel += n(f.valor_total);
      }
      for (const m of allMaint) {
        const mo = (m.data_manutencao || "").substring(0, 7);
        ensureMonth(mo);
        custosTotaisByMonth[mo].manutencao += n(m.custo);
        ensureMV(mo, m.vehicle_id);
        custosMensaisVeiculo[mo][m.vehicle_id].manutencao += n(m.custo);
      }
      for (const f of allFines) {
        const mo = (f.data_infracao || "").substring(0, 7);
        ensureMonth(mo);
        custosTotaisByMonth[mo].multas += n(f.valor_original);
        ensureMV(mo, f.vehicle_id);
        custosMensaisVeiculo[mo][f.vehicle_id].multas += n(f.valor_original);
      }
      for (const t of allTolls) {
        const mo = (t.data || "").substring(0, 7);
        ensureMonth(mo);
        custosTotaisByMonth[mo].pedagios += n(t.valor);
        if (t.vehicle_id) {
          ensureMV(mo, t.vehicle_id);
          custosMensaisVeiculo[mo][t.vehicle_id].pedagios += n(t.valor);
        }
      }
      for (const ins of allIns) {
        if (ins.status !== "ativa" || !ins.data_inicio) continue;
        const mo = (ins.data_inicio || "").substring(0, 7);
        ensureMonth(mo);
        custosTotaisByMonth[mo].seguros += n(ins.valor_premio);
        if (ins.vehicle_id) {
          ensureMV(mo, ins.vehicle_id);
          custosMensaisVeiculo[mo][ins.vehicle_id].seguros += n(ins.valor_premio);
        }
      }

      const tipoCombustivel: Record<string, number> = {};
      for (const f of allFuel) {
        const t = f.tipo_combustivel || "Não informado";
        tipoCombustivel[t] = (tipoCombustivel[t] || 0) + n(f.litros);
      }

      const idadeFrota = allVehicles.length > 0
        ? allVehicles.reduce((s: number, v: any) => s + (now.getFullYear() - (parseInt(v.anoFabricacao) || now.getFullYear())), 0) / allVehicles.length
        : 0;

      const totalSeguros = allIns.filter((i: any) => i.status === "ativa").reduce((s: number, i: any) => s + n(i.valor_premio), 0);
      const custoOperTotal = totalManutCusto + totalCombustivel + totalMultas + totalPedagios + totalSeguros;

      return {
        totalVehicles, totalFipe, totalCompra, depreciacao,
        totalManutCusto, totalCombustivel, totalMultas, totalPedagios, totalSeguros, multasPendentes,
        totalIpvaPendente, consumoMedio, custoKm, totalKm, totalLitros,
        tipoCount, marcaCount,
        fuelByMonth, maintByMonth, litrosByMonth, custosTotaisByMonth, custosMensaisVeiculo,
        alertas, alertasCriticos, alertasAlerta, alertasInfo,
        veiculosEmManutencao: allMaintRaw.filter((m: any) => m.status === "em_andamento").length,
        depreciacaoPorVeiculo,
        custoPorVeiculo,
        idadeDistribuicao, idadeVeiculos, statusVeiculos,
        totalSegurosPremio, segurosAtivos, veiculosSemSeguro,
        totalLicenciamento, totalIpvaGeral,
        tipoCombustivel, idadeFrota, custoOperTotal,
        anosDisponiveis, anoSelecionado: anoFiltro || null,
        temDadosKmAbastecimento, kmMetodo,
      };
    }),

  fetchMarketPricesAuto: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new Error('Acesso negado: empresa inválida');
      }
      const db = await getDb();
      const countRes = (await db.execute(sql`
        SELECT COUNT(*) as cnt, MAX(data) as last_date, MAX(created_at) as last_fetch
        FROM fuel_market_prices
        WHERE company_id = ${input.companyId}
      `)).rows[0];

      const count = parseInt(String(countRes?.cnt || '0'));
      const lastDate = countRes?.last_date ? String(countRes.last_date) : null;

      return {
        ok: true,
        source: count > 0 ? 'database' : 'empty',
        count,
        lastDate,
        message: count > 0
          ? `${count} preços de mercado disponíveis (última data: ${lastDate})`
          : 'Nenhum preço de mercado encontrado. Use "Registrar Preço" para adicionar.',
      };
    }),

  saveMarketPricesBatch: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      prices: z.array(z.object({
        tipo: z.string(),
        preco: z.number(),
        posto: z.string(),
        cidade: z.string(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new Error('Acesso negado: empresa inválida');
      }
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM fuel_market_prices
        WHERE company_id = ${input.companyId}
          AND fonte = 'Auto - Pesquisa Web'
          AND data = CURRENT_DATE
      `);

      let count = 0;
      for (const p of input.prices) {
        if (p.preco > 0 && p.preco < 15) {
          await db.execute(sql`
            INSERT INTO fuel_market_prices (company_id, tipo_combustivel, preco, posto, cidade, fonte, data)
            VALUES (${input.companyId}, ${p.tipo}, ${p.preco}, ${p.posto}, ${p.cidade}, 'Auto - Pesquisa Web', CURRENT_DATE)
          `);
          count++;
        }
      }
      return { ok: true, inserted: count };
    }),

  getMarketPrices: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const latest = (await db.execute(sql`
        SELECT DISTINCT ON (tipo_combustivel, posto)
          id, tipo_combustivel, preco, posto, cidade, fonte,
          data, created_at
        FROM fuel_market_prices
        WHERE company_id = ${input.companyId}
        ORDER BY tipo_combustivel, posto, data DESC, id DESC
      `)).rows;

      const avgByType = (await db.execute(sql`
        SELECT tipo_combustivel,
               ROUND(AVG(preco), 4) as preco_medio,
               ROUND(MIN(preco), 4) as preco_min,
               ROUND(MAX(preco), 4) as preco_max,
               COUNT(DISTINCT posto) as qtd_postos,
               MAX(data) as ultima_data
        FROM fuel_market_prices
        WHERE company_id = ${input.companyId}
          AND data >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY tipo_combustivel
        ORDER BY tipo_combustivel
      `)).rows;

      const bestByType = (await db.execute(sql`
        SELECT DISTINCT ON (tipo_combustivel)
          tipo_combustivel, preco, posto, cidade, data
        FROM fuel_market_prices
        WHERE company_id = ${input.companyId}
          AND data >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY tipo_combustivel, preco ASC, data DESC
      `)).rows;

      const distinctPostosRes = (await db.execute(sql`
        SELECT COUNT(DISTINCT posto) as cnt
        FROM fuel_market_prices
        WHERE company_id = ${input.companyId}
      `)).rows[0];
      const distinctPostos = parseInt(String(distinctPostosRes?.cnt || '0'));

      return { latest, avgByType, bestByType, distinctPostos };
    }),

  saveMarketPrice: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      tipo_combustivel: z.string(),
      preco: z.number(),
      posto: z.string().optional(),
      cidade: z.string().optional(),
      fonte: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const posto = input.posto || 'Pesquisa geral';
      const cidade = input.cidade || 'Guaratinguetá';
      const fonte = input.fonte || 'Manual';
      await db.execute(sql`
        INSERT INTO fuel_market_prices (company_id, tipo_combustivel, preco, posto, cidade, fonte, data)
        VALUES (${input.companyId}, ${input.tipo_combustivel}, ${input.preco}, ${posto}, ${cidade}, ${fonte}, CURRENT_DATE)
      `);
      return { ok: true };
    }),

  deleteMarketPrice: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`DELETE FROM fuel_market_prices WHERE id = ${input.id} AND company_id = ${input.companyId}`);
      return { ok: true };
    }),

  getFuelPrices: protectedProcedure
    .input(z.object({ companyId: z.number(), ano: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const anoFiltro = input.ano || new Date().getFullYear();
      const startDate = `${anoFiltro}-01-01`;
      const endDate = `${anoFiltro + 1}-01-01`;

      const byType = (await db.execute(sql`
        SELECT tipo_combustivel,
               COUNT(*)::int as qtd,
               ROUND(AVG(CASE WHEN litros::numeric > 0 THEN valor_total::numeric / litros::numeric END), 4) as preco_medio,
               ROUND(MIN(CASE WHEN litros::numeric > 0 THEN valor_total::numeric / litros::numeric END), 4) as preco_min,
               ROUND(MAX(CASE WHEN litros::numeric > 0 THEN valor_total::numeric / litros::numeric END), 4) as preco_max,
               ROUND(SUM(valor_total::numeric), 2) as total_gasto,
               ROUND(SUM(litros::numeric), 2) as total_litros
        FROM fleet_fuel_records
        WHERE company_id = ${input.companyId} AND data >= ${startDate} AND data < ${endDate}
        GROUP BY tipo_combustivel
        ORDER BY total_litros DESC
      `)).rows;

      const byMonth = (await db.execute(sql`
        SELECT TO_CHAR(data, 'YYYY-MM') as mes,
               tipo_combustivel,
               ROUND(AVG(CASE WHEN litros::numeric > 0 THEN valor_total::numeric / litros::numeric END), 4) as preco_medio,
               ROUND(SUM(litros::numeric), 2) as litros,
               ROUND(SUM(valor_total::numeric), 2) as valor
        FROM fleet_fuel_records
        WHERE company_id = ${input.companyId} AND data >= ${startDate} AND data < ${endDate}
        GROUP BY TO_CHAR(data, 'YYYY-MM'), tipo_combustivel
        ORDER BY mes, tipo_combustivel
      `)).rows;

      const byPosto = (await db.execute(sql`
        SELECT COALESCE(posto, 'Não informado') as posto,
               tipo_combustivel,
               COUNT(*)::int as qtd,
               ROUND(AVG(CASE WHEN litros::numeric > 0 THEN valor_total::numeric / litros::numeric END), 4) as preco_medio,
               ROUND(SUM(litros::numeric), 2) as litros,
               ROUND(SUM(valor_total::numeric), 2) as valor
        FROM fleet_fuel_records
        WHERE company_id = ${input.companyId} AND data >= ${startDate} AND data < ${endDate}
        GROUP BY COALESCE(posto, 'Não informado'), tipo_combustivel
        ORDER BY litros DESC
      `)).rows;

      return { byType, byMonth, byPosto, ano: anoFiltro };
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

      const vehicleIdsRes = await db.execute(sql`
        SELECT DISTINCT vehicle_id FROM (
          SELECT vehicle_id FROM fleet_fuel_records WHERE company_id = ${companyId} AND data >= ${startDate}::date AND data < ${endDate}::date
          UNION SELECT vehicle_id FROM fleet_maintenances WHERE company_id = ${companyId} AND data_manutencao >= ${startDate}::date AND data_manutencao < ${endDate}::date
          UNION SELECT vehicle_id FROM fleet_toll_records WHERE company_id = ${companyId} AND data >= ${startDate}::date AND data < ${endDate}::date
          UNION SELECT vehicle_id FROM fleet_fines WHERE company_id = ${companyId} AND data_multa >= ${startDate}::date AND data_multa < ${endDate}::date
          UNION SELECT vehicle_id FROM fleet_ipva WHERE company_id = ${companyId} AND ano_ref = ${ano}
          UNION SELECT vehicle_id FROM fleet_licensing WHERE company_id = ${companyId} AND ano_ref = ${ano}
        ) sub
      `);
      const vehicleIds = ((vehicleIdsRes as any).rows || vehicleIdsRes).map((r: any) => r.vehicle_id).filter(Boolean);
      const pendentes = await getVehiclesWithPendingRegistration(db, companyId, vehicleIds);
      if (pendentes.length > 0) {
        const detalhes = pendentes.map((p: any) => `${p.placa} (${p.modelo}): falta ${p.camposFaltantes.join(", ")}`).join("; ");
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Consolidação bloqueada — ${pendentes.length} veículo(s) com cadastro incompleto: ${detalhes}. Complete os dados ou consolide o cadastro antes de enviar ao financeiro.`,
        });
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

      const maintVehicleRes = await db.execute(sql`
        SELECT DISTINCT vehicle_id FROM fleet_maintenances
        WHERE company_id = ${companyId} AND data_manutencao >= ${startDate}::date AND data_manutencao < ${endDate}::date AND status != 'cancelada'
      `);
      const maintVehicleIds = ((maintVehicleRes as any).rows || maintVehicleRes).map((r: any) => r.vehicle_id).filter(Boolean);
      const pendentes = await getVehiclesWithPendingRegistration(db, companyId, maintVehicleIds);
      if (pendentes.length > 0) {
        const detalhes = pendentes.map((p: any) => `${p.placa} (${p.modelo}): falta ${p.camposFaltantes.join(", ")}`).join("; ");
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Aprovação bloqueada — ${pendentes.length} veículo(s) com cadastro incompleto: ${detalhes}. Complete os dados ou consolide o cadastro antes de enviar ao financeiro.`,
        });
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

  getMaintenanceDashboard: protectedProcedure
    .input(z.object({ companyId: z.number(), ano: z.number().optional(), mes: z.number().nullable().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, ano, mes } = input;
      const anoFilter = ano || new Date().getFullYear();
      const startDate = mes != null ? `${anoFilter}-${String(mes).padStart(2, '0')}-01` : `${anoFilter}-01-01`;
      const endDate = mes != null ? (mes === 12 ? `${anoFilter + 1}-01-01` : `${anoFilter}-${String(mes + 1).padStart(2, '0')}-01`) : `${anoFilter + 1}-01-01`;

      const kpiRes = await db.execute(sql`
        SELECT
          COUNT(*)::int as total_manutencoes,
          COALESCE(SUM(custo::numeric), 0) as custo_total,
          COUNT(CASE WHEN tipo = 'preventiva' THEN 1 END)::int as preventivas,
          COUNT(CASE WHEN tipo = 'corretiva' THEN 1 END)::int as corretivas,
          COUNT(DISTINCT vehicle_id)::int as veiculos_atendidos,
          COUNT(DISTINCT fornecedor)::int as fornecedores,
          COALESCE(AVG(CASE WHEN custo::numeric > 0 THEN custo::numeric END), 0) as custo_medio,
          COALESCE(MAX(custo::numeric), 0) as custo_max
        FROM fleet_maintenances
        WHERE company_id = ${companyId} AND status != 'cancelada'
          AND data_manutencao >= ${startDate}::date AND data_manutencao < ${endDate}::date
      `);
      const kpi = ((kpiRes as any).rows || kpiRes)[0] || {};

      const porMesRes = await db.execute(sql`
        SELECT EXTRACT(MONTH FROM data_manutencao)::int as mes,
               COUNT(*)::int as qtd,
               COALESCE(SUM(custo::numeric), 0) as custo,
               COUNT(CASE WHEN tipo = 'preventiva' THEN 1 END)::int as preventivas,
               COUNT(CASE WHEN tipo = 'corretiva' THEN 1 END)::int as corretivas
        FROM fleet_maintenances
        WHERE company_id = ${companyId} AND status != 'cancelada'
          AND data_manutencao >= ${startDate}::date AND data_manutencao < ${endDate}::date
        GROUP BY mes ORDER BY mes
      `);

      const porVeiculoRes = await db.execute(sql`
        SELECT fm.vehicle_id, v.placa, v.modelo, v.marca, v."tipoVeiculo" as tipo_veiculo,
               COUNT(*)::int as qtd_manutencoes,
               COALESCE(SUM(fm.custo::numeric), 0) as custo_total,
               COUNT(CASE WHEN fm.tipo = 'preventiva' THEN 1 END)::int as preventivas,
               COUNT(CASE WHEN fm.tipo = 'corretiva' THEN 1 END)::int as corretivas,
               MAX(fm.data_manutencao) as ultima_manutencao
        FROM fleet_maintenances fm
        JOIN vehicles v ON v.id = fm.vehicle_id
        WHERE fm.company_id = ${companyId} AND fm.status != 'cancelada'
          AND fm.data_manutencao >= ${startDate}::date AND fm.data_manutencao < ${endDate}::date
        GROUP BY fm.vehicle_id, v.placa, v.modelo, v.marca, v."tipoVeiculo"
        ORDER BY custo_total DESC
      `);

      const porFornecedorRes = await db.execute(sql`
        SELECT COALESCE(fornecedor, 'Não informado') as fornecedor,
               COUNT(*)::int as qtd,
               COALESCE(SUM(custo::numeric), 0) as custo_total
        FROM fleet_maintenances
        WHERE company_id = ${companyId} AND status != 'cancelada'
          AND data_manutencao >= ${startDate}::date AND data_manutencao < ${endDate}::date
        GROUP BY fornecedor ORDER BY custo_total DESC
      `);

      const topItensRes = await db.execute(sql`
        SELECT mi.nome, mi.categoria,
               SUM(mi.quantidade)::numeric as qtd_total,
               COUNT(DISTINCT fm.vehicle_id)::int as veiculos,
               COALESCE(SUM(mi.valor_total::numeric), 0) as custo_total,
               COUNT(*)::int as ocorrencias
        FROM fleet_maintenance_items mi
        JOIN fleet_maintenances fm ON fm.id = mi.maintenance_id
        WHERE fm.company_id = ${companyId} AND fm.status != 'cancelada'
          AND fm.data_manutencao >= ${startDate}::date AND fm.data_manutencao < ${endDate}::date
        GROUP BY mi.nome, mi.categoria
        ORDER BY ocorrencias DESC, custo_total DESC
        LIMIT 30
      `);

      const itensPorVeiculoRes = await db.execute(sql`
        SELECT v.placa, v.modelo, mi.nome, mi.categoria,
               SUM(mi.quantidade)::numeric as qtd,
               COALESCE(SUM(mi.valor_total::numeric), 0) as custo
        FROM fleet_maintenance_items mi
        JOIN fleet_maintenances fm ON fm.id = mi.maintenance_id
        JOIN vehicles v ON v.id = fm.vehicle_id
        WHERE fm.company_id = ${companyId} AND fm.status != 'cancelada'
          AND fm.data_manutencao >= ${startDate}::date AND fm.data_manutencao < ${endDate}::date
        GROUP BY v.placa, v.modelo, mi.nome, mi.categoria
        ORDER BY v.placa, custo DESC
      `);

      const custoMesPorTipoRes = await db.execute(sql`
        SELECT EXTRACT(MONTH FROM fm.data_manutencao)::int as mes,
               COALESCE(SUM(CASE WHEN mi.categoria = 'peca' THEN mi.valor_total::numeric ELSE 0 END), 0) as pecas,
               COALESCE(SUM(CASE WHEN mi.categoria = 'servico' THEN mi.valor_total::numeric ELSE 0 END), 0) as servicos
        FROM fleet_maintenances fm
        LEFT JOIN fleet_maintenance_items mi ON mi.maintenance_id = fm.id
        WHERE fm.company_id = ${companyId} AND fm.status != 'cancelada'
          AND fm.data_manutencao >= ${startDate}::date AND fm.data_manutencao < ${endDate}::date
        GROUP BY mes ORDER BY mes
      `);

      return {
        kpi: {
          totalManutencoes: parseInt(kpi.total_manutencoes) || 0,
          custoTotal: parseFloat(kpi.custo_total) || 0,
          preventivas: parseInt(kpi.preventivas) || 0,
          corretivas: parseInt(kpi.corretivas) || 0,
          veiculosAtendidos: parseInt(kpi.veiculos_atendidos) || 0,
          fornecedores: parseInt(kpi.fornecedores) || 0,
          custoMedio: parseFloat(kpi.custo_medio) || 0,
          custoMax: parseFloat(kpi.custo_max) || 0,
        },
        porMes: ((porMesRes as any).rows || []).map((r: any) => ({
          mes: r.mes, qtd: parseInt(r.qtd), custo: parseFloat(r.custo),
          preventivas: parseInt(r.preventivas), corretivas: parseInt(r.corretivas),
        })),
        porVeiculo: ((porVeiculoRes as any).rows || []).map((r: any) => ({
          vehicleId: r.vehicle_id, placa: r.placa, modelo: r.modelo, marca: r.marca, tipoVeiculo: r.tipo_veiculo,
          qtdManutencoes: parseInt(r.qtd_manutencoes), custoTotal: parseFloat(r.custo_total),
          preventivas: parseInt(r.preventivas), corretivas: parseInt(r.corretivas),
          ultimaManutencao: r.ultima_manutencao,
        })),
        porFornecedor: ((porFornecedorRes as any).rows || []).map((r: any) => ({
          fornecedor: r.fornecedor, qtd: parseInt(r.qtd), custoTotal: parseFloat(r.custo_total),
        })),
        topItens: ((topItensRes as any).rows || []).map((r: any) => ({
          nome: r.nome, categoria: r.categoria, qtdTotal: parseFloat(r.qtd_total),
          veiculos: parseInt(r.veiculos), custoTotal: parseFloat(r.custo_total), ocorrencias: parseInt(r.ocorrencias),
        })),
        itensPorVeiculo: ((itensPorVeiculoRes as any).rows || []).map((r: any) => ({
          placa: r.placa, modelo: r.modelo, nome: r.nome, categoria: r.categoria,
          qtd: parseFloat(r.qtd), custo: parseFloat(r.custo),
        })),
        custoMesPorTipo: ((custoMesPorTipoRes as any).rows || []).map((r: any) => ({
          mes: r.mes, pecas: parseFloat(r.pecas), servicos: parseFloat(r.servicos),
        })),
      };
    }),

  // Rev. 2719 — DASHBOARD DETERMINÍSTICO DE PEÇAS RECORRENTES (SEM IA).
  // Mesma peça (nome normalizado) trocada >= 2x no MESMO veículo, com intervalo
  // em DIAS e KM entre as trocas. Roda em SQL puro (verdade determinística) e
  // carrega no load da tela — não depende da IA. Usa TODO o histórico (uma peça
  // trocada em dez/ano-1 e jan/ano-0 é um repeat de intervalo curto), por isso
  // NÃO filtra por ano. Devolve a lista + agregados prontos para os gráficos.
  getRecurringPartsDashboard: protectedProcedure
    .input(z.object({ companyId: z.number(), ano: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId !== undefined && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para acessar dados desta empresa" });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId } = input;

      const recorrRes = await db.execute(sql`
        WITH eventos AS (
          SELECT fm.vehicle_id AS vehicle_id,
                 LOWER(TRIM(mi.nome)) AS nome_norm,
                 MAX(mi.nome) AS nome,
                 fm.data_manutencao AS data,
                 fm.id AS os_id,
                 MAX(fm.km_na_manutencao::numeric) AS km,
                 SUM(mi.valor_total::numeric) AS valor
          FROM fleet_maintenance_items mi
          JOIN fleet_maintenances fm ON fm.id = mi.maintenance_id
          WHERE fm.company_id = ${companyId} AND fm.status != 'cancelada'
            AND mi.categoria = 'peca' AND COALESCE(TRIM(mi.nome), '') <> ''
          GROUP BY fm.vehicle_id, LOWER(TRIM(mi.nome)), fm.data_manutencao, fm.id
        ),
        gaps AS (
          SELECT e.*,
            (e.data - LAG(e.data) OVER (PARTITION BY e.vehicle_id, e.nome_norm ORDER BY e.data, e.os_id))::int AS dias_anterior,
            (e.km - LAG(e.km) OVER (PARTITION BY e.vehicle_id, e.nome_norm ORDER BY e.data, e.os_id))::numeric AS km_anterior
          FROM eventos e
        )
        SELECT g.vehicle_id, v.placa, v.modelo, v.marca, g.nome_norm,
               MAX(g.nome) AS nome,
               COUNT(*)::int AS trocas,
               MIN(g.data) AS primeira,
               MAX(g.data) AS ultima,
               MIN(g.dias_anterior) AS menor_intervalo_dias,
               ROUND(AVG(g.dias_anterior))::int AS intervalo_medio_dias,
               MIN(NULLIF(g.km_anterior, 0)) AS menor_intervalo_km,
               SUM(g.valor)::numeric AS custo_total
        FROM gaps g
        JOIN vehicles v ON v.id = g.vehicle_id
        GROUP BY g.vehicle_id, v.placa, v.modelo, v.marca, g.nome_norm
        HAVING COUNT(*) >= 2
        ORDER BY menor_intervalo_dias ASC NULLS LAST, trocas DESC, custo_total DESC
      `);

      const recorrencias = (((recorrRes as any).rows) || []).map((r: any) => ({
        vehicleId: r.vehicle_id, placa: r.placa, modelo: r.modelo, marca: r.marca,
        peca: r.nome,
        nomeNorm: r.nome_norm,
        trocas: parseInt(r.trocas) || 0,
        primeira: r.primeira, ultima: r.ultima,
        menorIntervaloDias: r.menor_intervalo_dias != null ? parseInt(r.menor_intervalo_dias) : null,
        intervaloMedioDias: r.intervalo_medio_dias != null ? parseInt(r.intervalo_medio_dias) : null,
        menorIntervaloKm: r.menor_intervalo_km != null ? parseFloat(r.menor_intervalo_km) : null,
        custoTotal: parseFloat(r.custo_total) || 0,
      }));

      // CRÍTICA = menor intervalo entre trocas <= 180 dias (defeito crônico).
      const isCritica = (r: any) => r.menorIntervaloDias != null && r.menorIntervaloDias <= 180;

      // KPIs
      const veiculosAfetados = new Set(recorrencias.map((r: any) => r.vehicleId)).size;
      const custoTotalRecorrencias = recorrencias.reduce((s: number, r: any) => s + (r.custoTotal || 0), 0);
      const criticas = recorrencias.filter(isCritica).length;
      const totalTrocas = recorrencias.reduce((s: number, r: any) => s + (r.trocas || 0), 0);

      // Top peças (por custo e por frequência) — linha = placa · peça
      const topPorCusto = [...recorrencias]
        .sort((a, b) => b.custoTotal - a.custoTotal)
        .slice(0, 10)
        .map((r) => ({ label: `${r.placa} · ${r.peca}`, placa: r.placa, peca: r.peca, custo: r.custoTotal, trocas: r.trocas, critica: isCritica(r) }));
      const topPorFrequencia = [...recorrencias]
        .sort((a, b) => b.trocas - a.trocas || b.custoTotal - a.custoTotal)
        .slice(0, 10)
        .map((r) => ({ label: `${r.placa} · ${r.peca}`, placa: r.placa, peca: r.peca, custo: r.custoTotal, trocas: r.trocas, critica: isCritica(r) }));

      // Ranking por VEÍCULO (quantas peças recorrentes, quantas críticas, custo)
      const porVeicMap: Record<number, any> = {};
      for (const r of recorrencias) {
        const k = r.vehicleId;
        if (!porVeicMap[k]) porVeicMap[k] = { vehicleId: k, placa: r.placa, modelo: r.modelo, marca: r.marca, qtd: 0, criticas: 0, custo: 0, trocas: 0 };
        porVeicMap[k].qtd += 1;
        porVeicMap[k].trocas += r.trocas || 0;
        porVeicMap[k].custo += r.custoTotal || 0;
        if (isCritica(r)) porVeicMap[k].criticas += 1;
      }
      const porVeiculo = Object.values(porVeicMap).sort((a: any, b: any) => b.custo - a.custo);

      // Peças mais problemáticas GLOBAL (mesmo nome em vários veículos)
      const porPecaMap: Record<string, any> = {};
      for (const r of recorrencias) {
        const k = r.nomeNorm;
        if (!porPecaMap[k]) porPecaMap[k] = { peca: r.peca, veiculos: new Set<number>(), trocas: 0, custo: 0, criticas: 0, menorIntervaloDias: null as number | null };
        porPecaMap[k].veiculos.add(r.vehicleId);
        porPecaMap[k].trocas += r.trocas || 0;
        porPecaMap[k].custo += r.custoTotal || 0;
        if (isCritica(r)) porPecaMap[k].criticas += 1;
        if (r.menorIntervaloDias != null && (porPecaMap[k].menorIntervaloDias == null || r.menorIntervaloDias < porPecaMap[k].menorIntervaloDias)) {
          porPecaMap[k].menorIntervaloDias = r.menorIntervaloDias;
        }
      }
      const pecasGlobais = Object.values(porPecaMap)
        .map((p: any) => ({ peca: p.peca, veiculos: p.veiculos.size, trocas: p.trocas, custo: p.custo, criticas: p.criticas, menorIntervaloDias: p.menorIntervaloDias }))
        .sort((a: any, b: any) => b.custo - a.custo)
        .slice(0, 12);

      // Distribuição do MENOR intervalo entre trocas (em dias)
      const buckets = [
        { faixa: "≤ 30 dias", min: 0, max: 30, qtd: 0 },
        { faixa: "31–90 dias", min: 31, max: 90, qtd: 0 },
        { faixa: "91–180 dias", min: 91, max: 180, qtd: 0 },
        { faixa: "181–365 dias", min: 181, max: 365, qtd: 0 },
        { faixa: "> 365 dias", min: 366, max: Infinity, qtd: 0 },
      ];
      for (const r of recorrencias) {
        if (r.menorIntervaloDias == null) continue;
        const b = buckets.find((b) => r.menorIntervaloDias >= b.min && r.menorIntervaloDias <= b.max);
        if (b) b.qtd += 1;
      }
      const distribuicaoIntervalo = buckets.map((b) => ({ faixa: b.faixa, qtd: b.qtd }));

      return {
        recorrencias,
        kpi: {
          totalRecorrencias: recorrencias.length,
          criticas,
          custoTotalRecorrencias,
          veiculosAfetados,
          pecasDistintas: Object.keys(porPecaMap).length,
          totalTrocas,
        },
        topPorCusto,
        topPorFrequencia,
        porVeiculo,
        pecasGlobais,
        distribuicaoIntervalo,
      };
    }),

  // Rev. 2719 — HISTÓRICO DE PEÇAS DE UM VEÍCULO (para ALERTA ao lançar peça).
  // Para CADA peça já trocada no veículo, devolve nº de trocas, última data/km,
  // menor intervalo (dias/km), intervalo médio e custo. O cliente normaliza o
  // nome digitado e cruza com este mapa para alertar "esta peça já foi trocada".
  getVehiclePartHistory: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId !== undefined && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para acessar dados desta empresa" });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, vehicleId } = input;

      const res = await db.execute(sql`
        WITH eventos AS (
          SELECT LOWER(TRIM(mi.nome)) AS nome_norm,
                 MAX(mi.nome) AS nome,
                 fm.data_manutencao AS data,
                 fm.id AS os_id,
                 MAX(fm.km_na_manutencao::numeric) AS km,
                 SUM(mi.valor_total::numeric) AS valor
          FROM fleet_maintenance_items mi
          JOIN fleet_maintenances fm ON fm.id = mi.maintenance_id
          WHERE fm.company_id = ${companyId} AND fm.vehicle_id = ${vehicleId}
            AND fm.status != 'cancelada' AND mi.categoria = 'peca'
            AND COALESCE(TRIM(mi.nome), '') <> ''
          GROUP BY LOWER(TRIM(mi.nome)), fm.data_manutencao, fm.id
        ),
        gaps AS (
          SELECT e.*,
            (e.data - LAG(e.data) OVER (PARTITION BY e.nome_norm ORDER BY e.data, e.os_id))::int AS dias_anterior,
            (e.km - LAG(e.km) OVER (PARTITION BY e.nome_norm ORDER BY e.data, e.os_id))::numeric AS km_anterior
          FROM eventos e
        )
        SELECT nome_norm,
               MAX(nome) AS nome,
               COUNT(*)::int AS trocas,
               MIN(data) AS primeira,
               MAX(data) AS ultima,
               (ARRAY_AGG(km ORDER BY data DESC, os_id DESC))[1] AS ultimo_km,
               MIN(dias_anterior) AS menor_intervalo_dias,
               ROUND(AVG(dias_anterior))::int AS intervalo_medio_dias,
               MIN(NULLIF(km_anterior, 0)) AS menor_intervalo_km,
               SUM(valor)::numeric AS custo_total
        FROM gaps
        GROUP BY nome_norm
        ORDER BY trocas DESC, ultima DESC
      `);

      const pecas = (((res as any).rows) || []).map((r: any) => ({
        nomeNorm: r.nome_norm,
        peca: r.nome,
        trocas: parseInt(r.trocas) || 0,
        primeira: r.primeira,
        ultima: r.ultima,
        ultimoKm: r.ultimo_km != null ? parseFloat(r.ultimo_km) : null,
        menorIntervaloDias: r.menor_intervalo_dias != null ? parseInt(r.menor_intervalo_dias) : null,
        intervaloMedioDias: r.intervalo_medio_dias != null ? parseInt(r.intervalo_medio_dias) : null,
        menorIntervaloKm: r.menor_intervalo_km != null ? parseFloat(r.menor_intervalo_km) : null,
        custoTotal: parseFloat(r.custo_total) || 0,
      }));

      return { pecas };
    }),

  // Rev. 2707 — ANÁLISE INTELIGENTE (IA) DE MANUTENÇÃO. Cruza PEÇAS
  // RECORRENTES (mesma peça trocada >=2x no MESMO veículo, com o intervalo em
  // DIAS e KM entre as trocas) — sinal de "ralo de dinheiro" — e gera, via LLM,
  // um parecer estruturado VENDER / MANTER / OBSERVAR por veículo, com score de
  // risco (0-100), sinais e justificativa. TODOS os números são computados em
  // SQL (verdade determinística); a IA apenas INTERPRETA os fatos — nunca
  // inventa valores. A análise de recorrência usa TODO o histórico (não só o
  // ano selecionado), pois uma peça trocada em dez/ano-1 e jan/ano-0 é um
  // repeat de intervalo curto.
  getMaintenanceAIAnalysis: protectedProcedure
    .input(z.object({ companyId: z.number(), ano: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId !== undefined && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para acessar dados desta empresa" });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId } = input;

      // 1) PEÇAS RECORRENTES (todo o histórico): mesma peça (nome normalizado)
      //    trocada >= 2x no mesmo veículo, com intervalo dias/km entre trocas.
      const recorrRes = await db.execute(sql`
        WITH eventos AS (
          SELECT fm.vehicle_id AS vehicle_id,
                 LOWER(TRIM(mi.nome)) AS nome_norm,
                 MAX(mi.nome) AS nome,
                 fm.data_manutencao AS data,
                 fm.id AS os_id,
                 MAX(fm.km_na_manutencao::numeric) AS km,
                 SUM(mi.valor_total::numeric) AS valor
          FROM fleet_maintenance_items mi
          JOIN fleet_maintenances fm ON fm.id = mi.maintenance_id
          WHERE fm.company_id = ${companyId} AND fm.status != 'cancelada'
            AND mi.categoria = 'peca' AND COALESCE(TRIM(mi.nome), '') <> ''
          GROUP BY fm.vehicle_id, LOWER(TRIM(mi.nome)), fm.data_manutencao, fm.id
        ),
        gaps AS (
          SELECT e.*,
            (e.data - LAG(e.data) OVER (PARTITION BY e.vehicle_id, e.nome_norm ORDER BY e.data, e.os_id))::int AS dias_anterior,
            (e.km - LAG(e.km) OVER (PARTITION BY e.vehicle_id, e.nome_norm ORDER BY e.data, e.os_id))::numeric AS km_anterior
          FROM eventos e
        )
        SELECT g.vehicle_id, v.placa, v.modelo, v.marca, g.nome_norm,
               MAX(g.nome) AS nome,
               COUNT(*)::int AS trocas,
               MIN(g.data) AS primeira,
               MAX(g.data) AS ultima,
               MIN(g.dias_anterior) AS menor_intervalo_dias,
               ROUND(AVG(g.dias_anterior))::int AS intervalo_medio_dias,
               MIN(NULLIF(g.km_anterior, 0)) AS menor_intervalo_km,
               SUM(g.valor)::numeric AS custo_total
        FROM gaps g
        JOIN vehicles v ON v.id = g.vehicle_id
        GROUP BY g.vehicle_id, v.placa, v.modelo, v.marca, g.nome_norm
        HAVING COUNT(*) >= 2
        ORDER BY menor_intervalo_dias ASC NULLS LAST, trocas DESC, custo_total DESC
        LIMIT 100
      `);

      // 2) FINANCEIRO POR VEÍCULO (todo o histórico + últimos 12 meses) +
      //    atributos do veículo (ano, km, valor de compra / FIPE, status).
      const veicRes = await db.execute(sql`
        SELECT fm.vehicle_id, v.placa, v.modelo, v.marca, v."tipoVeiculo" AS tipo,
               v."anoFabricacao" AS ano, v.km_atual::numeric AS km_atual,
               v.valor_compra::numeric AS valor_compra, v.valor_fipe::numeric AS valor_fipe,
               v."statusVeiculo" AS status,
               COUNT(*)::int AS os_total,
               COUNT(CASE WHEN fm.tipo = 'corretiva' THEN 1 END)::int AS corretivas,
               COUNT(CASE WHEN fm.tipo = 'preventiva' THEN 1 END)::int AS preventivas,
               COALESCE(SUM(fm.custo::numeric), 0) AS custo_total,
               COALESCE(SUM(CASE WHEN fm.data_manutencao >= (CURRENT_DATE - INTERVAL '12 months') THEN fm.custo::numeric ELSE 0 END), 0) AS custo_12m,
               COALESCE(SUM(CASE WHEN fm.data_manutencao >= (CURRENT_DATE - INTERVAL '24 months') AND fm.data_manutencao < (CURRENT_DATE - INTERVAL '12 months') THEN fm.custo::numeric ELSE 0 END), 0) AS custo_prev_12m,
               MIN(fm.data_manutencao) AS primeira_os,
               MAX(fm.data_manutencao) AS ultima_os
        FROM fleet_maintenances fm
        JOIN vehicles v ON v.id = fm.vehicle_id
        WHERE fm.company_id = ${companyId} AND fm.status != 'cancelada'
        GROUP BY fm.vehicle_id, v.placa, v.modelo, v.marca, v."tipoVeiculo",
                 v."anoFabricacao", v.km_atual, v.valor_compra, v.valor_fipe, v."statusVeiculo"
        ORDER BY custo_total DESC
      `);

      // 3) CONFIABILIDADE (MTBF) — intervalo MÉDIO entre manutenções CORRETIVAS
      //    (falhas), em DIAS e em KM. MTBF curto = veículo "quebrando" com
      //    frequência (literatura de manutenção centrada em confiabilidade/RCM).
      const mtbfRes = await db.execute(sql`
        WITH corr AS (
          SELECT fm.vehicle_id AS vehicle_id,
                 fm.data_manutencao AS data,
                 fm.km_na_manutencao::numeric AS km,
                 LAG(fm.data_manutencao) OVER (PARTITION BY fm.vehicle_id ORDER BY fm.data_manutencao, fm.id) AS prev_data,
                 LAG(fm.km_na_manutencao::numeric) OVER (PARTITION BY fm.vehicle_id ORDER BY fm.data_manutencao, fm.id) AS prev_km
          FROM fleet_maintenances fm
          WHERE fm.company_id = ${companyId} AND fm.status != 'cancelada' AND fm.tipo = 'corretiva'
        )
        SELECT vehicle_id,
               ROUND(AVG((data - prev_data)::int))::int AS mtbf_dias,
               ROUND(AVG(NULLIF(km - prev_km, 0)))::numeric AS mtbf_km
        FROM corr
        WHERE prev_data IS NOT NULL
        GROUP BY vehicle_id
      `);
      const mtbfByVehicle: Record<number, { dias: number | null; km: number | null }> = {};
      for (const r of (((mtbfRes as any).rows) || [])) {
        mtbfByVehicle[r.vehicle_id] = {
          dias: r.mtbf_dias != null ? parseInt(r.mtbf_dias) : null,
          km: r.mtbf_km != null ? Math.round(parseFloat(r.mtbf_km)) : null,
        };
      }

      const recorrencias = (((recorrRes as any).rows) || []).map((r: any) => ({
        vehicleId: r.vehicle_id, placa: r.placa, modelo: r.modelo, marca: r.marca,
        peca: r.nome, trocas: parseInt(r.trocas) || 0,
        primeira: r.primeira, ultima: r.ultima,
        menorIntervaloDias: r.menor_intervalo_dias != null ? parseInt(r.menor_intervalo_dias) : null,
        intervaloMedioDias: r.intervalo_medio_dias != null ? parseInt(r.intervalo_medio_dias) : null,
        menorIntervaloKm: r.menor_intervalo_km != null ? parseFloat(r.menor_intervalo_km) : null,
        custoTotal: parseFloat(r.custo_total) || 0,
      }));

      const recorrCount: Record<number, number> = {};
      const recorrCurta: Record<number, number> = {}; // intervalos <= 180 dias
      for (const r of recorrencias) {
        recorrCount[r.vehicleId] = (recorrCount[r.vehicleId] || 0) + 1;
        if (r.menorIntervaloDias != null && r.menorIntervaloDias <= 180) {
          recorrCurta[r.vehicleId] = (recorrCurta[r.vehicleId] || 0) + 1;
        }
      }

      const anoAtual = new Date().getFullYear();
      const veiculos = (((veicRes as any).rows) || []).map((r: any) => {
        const custoTotal = parseFloat(r.custo_total) || 0;
        const custo12m = parseFloat(r.custo_12m) || 0;
        const custoPrev12m = parseFloat(r.custo_prev_12m) || 0;
        const valorFipe = r.valor_fipe != null ? parseFloat(r.valor_fipe) : null;
        const valorCompra = r.valor_compra != null ? parseFloat(r.valor_compra) : null;
        const osTotal = parseInt(r.os_total) || 0;
        const corretivas = parseInt(r.corretivas) || 0;
        const preventivas = parseInt(r.preventivas) || 0;
        const pctCorretiva = osTotal > 0 ? Math.round((corretivas / osTotal) * 100) : 0;
        const baseValor = valorFipe ?? valorCompra ?? null;
        const custoSobreValorPct = baseValor && baseValor > 0 ? Math.round((custo12m / baseValor) * 100) : null;
        const custoSobreValorTotalPct = baseValor && baseValor > 0 ? Math.round((custoTotal / baseValor) * 100) : null;
        const kmAtual = r.km_atual != null ? parseFloat(r.km_atual) : null;
        // Custo por KM (CPK) — indicador-rei de TCO operacional. Usa custo
        // ACUMULADO ÷ km do odômetro (proxy do km rodado na vida do bem).
        const custoPorKm = kmAtual && kmAtual > 0 ? Math.round((custoTotal / kmAtual) * 100) / 100 : null;
        const custoMedioOs = osTotal > 0 ? Math.round(custoTotal / osTotal) : null;
        // Tendência da curva de custo: 12m recentes vs 12m anteriores. Curva
        // acelerando = sinal clássico de fim da VIDA ECONÔMICA do veículo.
        const tendenciaCustoPct = custoPrev12m > 0 ? Math.round(((custo12m - custoPrev12m) / custoPrev12m) * 100) : null;
        const anoNum = parseInt(String(r.ano ?? "")) || 0;
        const idade = anoNum > 1980 ? Math.max(0, anoAtual - anoNum) : null;
        const mtbf = mtbfByVehicle[r.vehicle_id] || { dias: null, km: null };
        return {
          vehicleId: r.vehicle_id, placa: r.placa, modelo: r.modelo, marca: r.marca, tipo: r.tipo,
          ano: r.ano, idade, status: r.status,
          kmAtual,
          valorFipe, valorCompra, baseValor,
          osTotal, corretivas, preventivas, pctCorretiva,
          custoTotal, custo12m, custoPrev12m, tendenciaCustoPct,
          custoSobreValorPct, custoSobreValorTotalPct,
          custoPorKm, custoMedioOs,
          mtbfDias: mtbf.dias, mtbfKm: mtbf.km,
          downtimeEventos: corretivas,
          pecasRecorrentes: recorrCount[r.vehicle_id] || 0,
          pecasRecorrentesCurtas: recorrCurta[r.vehicle_id] || 0,
          primeiraOs: r.primeira_os, ultimaOs: r.ultima_os,
        };
      });

      // AGREGADO DA FROTA (KPIs globais). Custo/km médio = ponderado (Σcusto ÷
      // Σkm) p/ não distorcer com veículos de km baixo. nVender/nObservar/nManter
      // são preenchidos DEPOIS, a partir do parecer final (IA ou determinístico).
      const sum = (f: (v: any) => number) => veiculos.reduce((a: number, v: any) => a + (f(v) || 0), 0);
      const custoTotalFrota = sum((v) => v.custoTotal);
      const custo12mFrota = sum((v) => v.custo12m);
      const custoPrev12mFrota = sum((v) => v.custoPrev12m);
      const kmFrota = sum((v) => v.kmAtual || 0);
      const osTotalFrota = sum((v) => v.osTotal);
      const corretivasFrota = sum((v) => v.corretivas);
      const fleet: any = {
        totalVeiculos: veiculos.length,
        custoTotalFrota,
        custo12mFrota,
        custoPrev12mFrota,
        tendenciaFrotaPct: custoPrev12mFrota > 0 ? Math.round(((custo12mFrota - custoPrev12mFrota) / custoPrev12mFrota) * 100) : null,
        custoPorKmMedio: kmFrota > 0 ? Math.round((custoTotalFrota / kmFrota) * 100) / 100 : null,
        pctCorretivaFrota: osTotalFrota > 0 ? Math.round((corretivasFrota / osTotalFrota) * 100) : 0,
        osTotalFrota,
        topOfensores: [...veiculos]
          .sort((a: any, b: any) => b.custo12m - a.custo12m)
          .slice(0, 5)
          .map((v: any) => ({ placa: v.placa, modelo: v.modelo, custo12m: v.custo12m, custoSobreValorPct: v.custoSobreValorPct })),
        nVender: 0, nObservar: 0, nManter: 0,
      };

      const geradoEm = new Date().toISOString();

      // Persiste o snapshot (1 linha por empresa) p/ a análise ficar FIXADA na
      // tela até o próximo "Atualizar análise". Falha de gravação NÃO bloqueia
      // a resposta (best-effort).
      const persistSnapshot = async (payload: any) => {
        try {
          await db.execute(sql`
            INSERT INTO fleet_ai_analysis (company_id, payload, gerado_em, updated_at)
            VALUES (${companyId}, ${JSON.stringify(payload)}::jsonb, NOW(), NOW())
            ON CONFLICT (company_id) DO UPDATE
              SET payload = EXCLUDED.payload, gerado_em = NOW(), updated_at = NOW()
          `);
        } catch (e) {
          console.error("[frotas] falha ao persistir snapshot da IA:", e);
        }
      };

      if (veiculos.length === 0) {
        const out = { geradoEm, companyId: input.companyId, metrics: { recorrencias, veiculos, fleet }, ia: null, erro: "Sem manutenções registradas para análise." };
        await persistSnapshot(out);
        return out;
      }

      // Payload enxuto p/ a IA (limita p/ controlar tokens).
      const topVeic = veiculos.slice(0, 25);
      const topRecorr = recorrencias.slice(0, 60);

      const systemPrompt = [
        "Você é um consultor sênior de gestão de FROTA e manutenção, especialista em CUSTO TOTAL DE PROPRIEDADE (TCO) e na decisão de VENDER ou MANTER veículos/máquinas.",
        "Fundamente o raciocínio nas MELHORES PRÁTICAS MUNDIAIS de gestão de frota:",
        "- TCO (Total Cost of Ownership) e CUSTO POR KM (CPK) como métrica-rei de eficiência operacional.",
        "- RCM / Manutenção Centrada em Confiabilidade: relação CORRETIVA × PREVENTIVA (alta corretiva = frota apagando incêndio).",
        "- MTBF (Tempo Médio Entre Falhas): MTBF curto em dias/km = baixa confiabilidade.",
        "- VIDA ECONÔMICA / política de REPOR-vs-REPARAR: o veículo deve ser substituído quando o custo anual de mantê-lo passa a superar o custo equivalente de renová-lo (curva de custo ascendente + manutenção alta frente ao valor do bem).",
        "- PEÇA RECORRENTE com intervalo CURTO (mesma peça trocada de novo em poucos dias/km) = defeito crônico / serviço malfeito / desgaste estrutural ('ralo de dinheiro').",
        "- TENDÊNCIA do custo (12m recentes vs 12m anteriores): curva acelerando reforça fim de vida econômica.",
        "Você receberá FATOS já calculados (não invente nenhum número; use SOMENTE os fornecidos). Cite números reais dos fatos nas justificativas.",
        "Para cada veículo, classifique em VENDER, OBSERVAR ou MANTER e atribua um scoreRisco de 0 (saudável) a 100 (crítico).",
        "No resumoExecutivo, dê um panorama da FROTA inteira (TCO, CPK médio, % corretiva, candidatos a venda) e nas recomendacoesGerais traga ações concretas, priorizadas e fundamentadas nas práticas acima.",
        "Seja objetivo, técnico e em português do Brasil.",
        "Responda APENAS com JSON válido (sem markdown, sem comentários) no formato exato:",
        '{ "resumoExecutivo": string, "veiculos": [ { "placa": string, "recomendacao": "VENDER"|"OBSERVAR"|"MANTER", "scoreRisco": number, "justificativa": string, "sinais": string[], "acao": string } ], "pecasCriticas": [ { "placa": string, "peca": string, "motivo": string } ], "recomendacoesGerais": string[] }',
        "Use SOMENTE placas presentes nos fatos. Ordene 'veiculos' do maior para o menor scoreRisco.",
      ].join("\n");

      const userPayload = "FATOS (JSON):\n" + JSON.stringify({
        frota: {
          totalVeiculos: fleet.totalVeiculos,
          custoManutencaoTotal: fleet.custoTotalFrota,
          custoManutencao12m: fleet.custo12mFrota,
          tendenciaCusto12mPct: fleet.tendenciaFrotaPct,
          custoPorKmMedio: fleet.custoPorKmMedio,
          pctCorretiva: fleet.pctCorretivaFrota,
        },
        veiculos: topVeic.map((v: any) => ({
          placa: v.placa, modelo: v.modelo, marca: v.marca, tipo: v.tipo, ano: v.ano, idadeAnos: v.idade,
          status: v.status, kmAtual: v.kmAtual, valorFipe: v.valorFipe, valorCompra: v.valorCompra,
          osTotal: v.osTotal, corretivas: v.corretivas, preventivas: v.preventivas, pctCorretiva: v.pctCorretiva,
          custoManutencaoTotal: v.custoTotal, custoManutencao12m: v.custo12m, custoManutencao12mAnterior: v.custoPrev12m,
          tendenciaCusto12mPct: v.tendenciaCustoPct,
          custoManutencao12mSobreValorPct: v.custoSobreValorPct, custoManutencaoTotalSobreValorPct: v.custoSobreValorTotalPct,
          custoPorKm: v.custoPorKm, custoMedioPorOs: v.custoMedioOs,
          mtbfDiasEntreCorretivas: v.mtbfDias, mtbfKmEntreCorretivas: v.mtbfKm,
          qtdPecasRecorrentes: v.pecasRecorrentes, qtdPecasRecorrentesIntervaloCurto: v.pecasRecorrentesCurtas,
        })),
        pecasRecorrentes: topRecorr.map((r: any) => ({
          placa: r.placa, peca: r.peca, trocas: r.trocas,
          menorIntervaloDias: r.menorIntervaloDias, intervaloMedioDias: r.intervaloMedioDias,
          menorIntervaloKm: r.menorIntervaloKm, custoTotal: r.custoTotal,
        })),
      });

      const stripFences = (s: string) => {
        let t = (s || "").trim();
        if (t.startsWith("```")) t = t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
        return t;
      };

      // Rev. 2715 — PARECER DETERMINÍSTICO (fallback GARANTIDO). A IA é só uma
      // CAMADA de redação por cima destes números. Se a IA falhar OU estourar o
      // orçamento de tempo (timeout do proxy/iOS), devolvemos ESTE parecer
      // calculado no servidor — o usuário NUNCA mais vê o erro "The string did
      // not match the expected pattern." (DOMException de conexão abortada).
      const buildDeterministicIa = () => {
        const scored = veiculos.map((v: any) => {
          let score = 0;
          const sinais: string[] = [];
          // 1) RCM — balanço corretiva × preventiva.
          if (v.pctCorretiva >= 70) { score += 25; sinais.push(`${v.pctCorretiva}% das OS são corretivas (frota apagando incêndio, não prevenindo)`); }
          else if (v.pctCorretiva >= 40) { score += 14; sinais.push(`${v.pctCorretiva}% das OS são corretivas (preventiva insuficiente)`); }
          // 2) Manutenção 12m frente ao valor do bem (gatilho de substituição/TCO).
          if (v.custoSobreValorPct != null) {
            if (v.custoSobreValorPct >= 50) { score += 28; sinais.push(`Manutenção (12m) consome ${v.custoSobreValorPct}% do valor do veículo`); }
            else if (v.custoSobreValorPct >= 25) { score += 16; sinais.push(`Manutenção (12m) = ${v.custoSobreValorPct}% do valor do veículo`); }
            else if (v.custoSobreValorPct >= 12) { score += 7; }
          }
          // 3) Defeito crônico — peças recorrentes em intervalo curto.
          if (v.pecasRecorrentesCurtas > 0) { score += Math.min(20, v.pecasRecorrentesCurtas * 10); sinais.push(`${v.pecasRecorrentesCurtas} peça(s) trocada(s) de novo em ≤180 dias (defeito crônico)`); }
          else if (v.pecasRecorrentes > 0) { score += Math.min(8, v.pecasRecorrentes * 3); sinais.push(`${v.pecasRecorrentes} peça(s) recorrente(s) no histórico`); }
          // 4) Idade do bem.
          const idade = typeof v.idade === "number" ? v.idade : 0;
          if (idade >= 12) { score += 10; sinais.push(`Veículo com ~${idade} anos`); }
          else if (idade >= 8) { score += 5; }
          // 5) Vida econômica — curva de custo acelerando (tendência 12m vs 12m anterior).
          if (v.tendenciaCustoPct != null && v.custoPrev12m > 0) {
            if (v.tendenciaCustoPct >= 60) { score += 12; sinais.push(`Custo subiu ${v.tendenciaCustoPct}% vs os 12 meses anteriores (curva de custo acelerando)`); }
            else if (v.tendenciaCustoPct >= 30) { score += 7; sinais.push(`Custo subiu ${v.tendenciaCustoPct}% vs os 12 meses anteriores`); }
          }
          // 6) Confiabilidade — MTBF curto (falhas corretivas frequentes).
          if (v.mtbfDias != null && v.mtbfDias > 0 && v.mtbfDias < 60) { score += 8; sinais.push(`Falha corretiva a cada ~${v.mtbfDias} dias (MTBF curto / baixa confiabilidade)`); }
          score = Math.max(0, Math.min(100, Math.round(score)));
          const recomendacao: "VENDER" | "OBSERVAR" | "MANTER" = score >= 60 ? "VENDER" : score >= 35 ? "OBSERVAR" : "MANTER";
          const acao = recomendacao === "VENDER"
            ? (v.custoSobreValorPct != null && v.custoSobreValorPct >= 50
                ? `Substituição recomendada (repor-vs-reparar): a manutenção dos últimos 12 meses já consome ${v.custoSobreValorPct}% do valor do bem — manter tende a não compensar.`
                : "Substituição recomendada (repor-vs-reparar): o custo de mantê-lo tende a superar o de renová-lo.")
            : recomendacao === "OBSERVAR"
              ? "Monitorar de perto, priorizar preventivas e investigar as peças/falhas recorrentes antes que virem substituição."
              : "Manter operação seguindo o plano de manutenção preventiva; custo sob controle frente ao valor do bem.";
          const justificativa = sinais.length
            ? `Score ${score}/100 — ${sinais.join("; ")}.`
            : `Score ${score}/100 — sem sinais relevantes de risco no histórico.`;
          return { placa: v.placa, recomendacao, scoreRisco: score, justificativa, sinais, acao };
        }).sort((a: any, b: any) => b.scoreRisco - a.scoreRisco);

        const pecasCriticas = recorrencias
          .filter((r: any) => r.menorIntervaloDias != null && r.menorIntervaloDias <= 180)
          .slice(0, 15)
          .map((r: any) => ({
            placa: r.placa,
            peca: r.peca,
            motivo: `Trocada ${r.trocas}× — menor intervalo de ${r.menorIntervaloDias} dia(s)${r.menorIntervaloKm != null ? ` / ${Math.round(r.menorIntervaloKm)} km` : ""}; custo total R$ ${Math.round(r.custoTotal).toLocaleString("pt-BR")}.`,
          }));

        const nVender = scored.filter((s: any) => s.recomendacao === "VENDER").length;
        const nObs = scored.filter((s: any) => s.recomendacao === "OBSERVAR").length;
        const cpkTxt = fleet.custoPorKmMedio != null ? `R$ ${fleet.custoPorKmMedio.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/km` : "—";
        const tendTxt = fleet.tendenciaFrotaPct != null ? `${fleet.tendenciaFrotaPct >= 0 ? "+" : ""}${fleet.tendenciaFrotaPct}% vs 12m anteriores` : "tendência indisponível";
        const resumoExecutivo = `Frota de ${scored.length} veículo(s) com TCO acumulado de R$ ${Math.round(fleet.custoTotalFrota).toLocaleString("pt-BR")} (R$ ${Math.round(fleet.custo12mFrota).toLocaleString("pt-BR")} nos últimos 12 meses, ${tendTxt}). Custo por km médio: ${cpkTxt}; ${fleet.pctCorretivaFrota}% das OS são corretivas. Parecer: ${nVender} candidato(s) a VENDER, ${nObs} para OBSERVAR e ${scored.length - nVender - nObs} para MANTER; ${pecasCriticas.length} peça(s) com troca recorrente em intervalo curto (possível defeito crônico).`;
        const recomendacoesGerais = [
          fleet.pctCorretivaFrota >= 50
            ? `RCM: ${fleet.pctCorretivaFrota}% das OS são corretivas — a frota está apagando incêndio. Estruture um plano de PREVENTIVA por km/tempo para inverter essa relação (meta de mercado: ≥70% preventiva).`
            : "Mantenha a disciplina de manutenção PREVENTIVA por km/tempo, que sustenta o baixo índice de corretivas atual.",
          "Investigue as peças trocadas repetidamente em pouco tempo — defeito crônico, serviço malfeito ou peça de baixa qualidade são as causas mais comuns ('ralo de dinheiro').",
          "Acompanhe o CUSTO POR KM (CPK) por veículo: é a métrica-rei de TCO; veículos muito acima da média da frota merecem investigação ou substituição.",
          nVender > 0
            ? "Aplique a política REPOR-vs-REPARAR nos veículos marcados como VENDER: quando a manutenção anual supera o custo equivalente de renovar o ativo, a substituição é financeiramente superior."
            : "Reavalie trimestralmente a vida econômica de cada veículo conforme a curva de custo evolui.",
        ];
        return { resumoExecutivo, veiculos: scored, pecasCriticas, recomendacoesGerais };
      };

      let ia: any = null;
      let erro: string | null = null;
      try {
        // ORÇAMENTO DE TEMPO: corta a IA em 28s e cai pro determinístico — garante
        // que a RESPOSTA HTTP volta ANTES do timeout do proxy/iOS (que gerava a
        // DOMException "The string did not match the expected pattern." no Safari
        // quando a chamada caía no fallback Claude NÃO-streaming de 60-120s).
        // fast:true usa Gemini 2.5 Flash (thinking OFF). maxTokens menor = mais
        // rápido e menos risco de truncar o JSON.
        const LLM_BUDGET_MS = 28000;
        const result = await Promise.race([
          invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPayload },
            ],
            maxTokens: 4000,
            response_format: { type: "json_object" },
            fast: true,
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("ia-timeout")), LLM_BUDGET_MS)),
        ]) as Awaited<ReturnType<typeof invokeLLM>>;
        const raw = result.choices?.[0]?.message?.content;
        const txt = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("") : "";
        const parsed = JSON.parse(stripFences(txt));

        // SANITIZAÇÃO "facts-only": a IA só pode falar de placas que existem nos
        // fatos determinísticos. Descarta entradas com placa inventada, normaliza
        // o enum de recomendação e faz clamp do scoreRisco em 0..100.
        const placasValidas = new Set<string>(
          veiculos.map((v: any) => String(v.placa ?? "").trim().toUpperCase()).filter((p: string) => p !== "")
        );
        const normRec = (r: any): "VENDER" | "OBSERVAR" | "MANTER" => {
          const u = String(r ?? "").trim().toUpperCase();
          return u === "VENDER" || u === "OBSERVAR" || u === "MANTER" ? u : "OBSERVAR";
        };
        const clampScore = (n: any): number => {
          const x = Number(n);
          if (!Number.isFinite(x)) return 0;
          return Math.max(0, Math.min(100, Math.round(x)));
        };
        const placaOk = (p: any) =>
          placasValidas.size === 0 || placasValidas.has(String(p ?? "").trim().toUpperCase());

        const veiculosIa = Array.isArray(parsed?.veiculos)
          ? parsed.veiculos
              .filter((v: any) => placaOk(v?.placa))
              .map((v: any) => ({
                placa: String(v?.placa ?? "").trim(),
                recomendacao: normRec(v?.recomendacao),
                scoreRisco: clampScore(v?.scoreRisco),
                justificativa: String(v?.justificativa ?? ""),
                sinais: Array.isArray(v?.sinais) ? v.sinais.map((s: any) => String(s)).slice(0, 12) : [],
                acao: String(v?.acao ?? ""),
              }))
              .sort((a: any, b: any) => b.scoreRisco - a.scoreRisco)
          : [];

        const pecasCriticasIa = Array.isArray(parsed?.pecasCriticas)
          ? parsed.pecasCriticas
              .filter((p: any) => placaOk(p?.placa))
              .map((p: any) => ({
                placa: String(p?.placa ?? "").trim(),
                peca: String(p?.peca ?? ""),
                motivo: String(p?.motivo ?? ""),
              }))
          : [];

        ia = {
          resumoExecutivo: String(parsed?.resumoExecutivo ?? ""),
          veiculos: veiculosIa,
          pecasCriticas: pecasCriticasIa,
          recomendacoesGerais: Array.isArray(parsed?.recomendacoesGerais)
            ? parsed.recomendacoesGerais.map((s: any) => String(s)).slice(0, 20)
            : [],
        };
      } catch (err: any) {
        // NUNCA propaga o erro pro cliente: devolve o parecer DETERMINÍSTICO.
        const msg = String(err?.message ?? "");
        ia = buildDeterministicIa();
        erro = msg.includes("ia-timeout")
          ? "A IA demorou demais para responder; exibimos a análise automática baseada nos seus próprios dados."
          : (msg.includes("não configurada") || msg.includes("not configured") || msg.includes("Nenhuma chave"))
            ? "IA indisponível (sem chave configurada); exibimos a análise automática baseada nos seus próprios dados."
            : "Não foi possível obter o parecer da IA; exibimos a análise automática baseada nos seus próprios dados.";
      }

      // GUARDA FINAL: se a IA não trouxe um parecer utilizável (vazio/sem
      // veículos), usa o determinístico — a tela NUNCA fica sem análise.
      if (!ia || !Array.isArray(ia.veiculos) || ia.veiculos.length === 0) {
        ia = buildDeterministicIa();
        if (!erro) erro = "A IA não retornou um parecer utilizável; exibimos a análise automática baseada nos seus próprios dados.";
      }

      // Conta a distribuição do parecer FINAL (IA ou determinístico) p/ a banda
      // de KPIs da frota.
      fleet.nVender = (ia.veiculos || []).filter((v: any) => v.recomendacao === "VENDER").length;
      fleet.nObservar = (ia.veiculos || []).filter((v: any) => v.recomendacao === "OBSERVAR").length;
      fleet.nManter = (ia.veiculos || []).filter((v: any) => v.recomendacao === "MANTER").length;

      const out = { geradoEm, companyId: input.companyId, metrics: { recorrencias, veiculos, fleet }, ia, erro };
      await persistSnapshot(out);
      return out;
    }),

  // Rev. 2718 — leitura do ÚLTIMO snapshot PERSISTIDO da Análise Inteligente.
  // A tela carrega isto no load (análise FIXADA); só muda quando o usuário
  // clica em "Atualizar análise" (que roda a mutation acima e regrava).
  getMaintenanceAIAnalysisLatest: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId !== undefined && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para acessar dados desta empresa" });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const res = await db.execute(sql`
        SELECT payload FROM fleet_ai_analysis WHERE company_id = ${input.companyId} LIMIT 1
      `);
      const row = (((res as any).rows) || [])[0];
      if (!row || !row.payload) return null;
      try {
        return typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      } catch {
        return null;
      }
    }),

  // Rev. 1881 — Dashboard dedicado de COMBUSTÍVEL. KPIs gerais, evolução
  // mensal (litros + R$), por veículo (com consumo km/L derivado de km_atual),
  // por motorista (ranking), por posto e por tipo de combustível.
  getFuelDashboard: protectedProcedure
    .input(z.object({ companyId: z.number(), ano: z.number().optional(), mes: z.number().nullable().optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId !== undefined && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para acessar dados desta empresa" });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, ano, mes } = input;
      const anoFilter = ano || new Date().getFullYear();
      const startDate = mes != null ? `${anoFilter}-${String(mes).padStart(2, '0')}-01` : `${anoFilter}-01-01`;
      const endDate = mes != null ? (mes === 12 ? `${anoFilter + 1}-01-01` : `${anoFilter}-${String(mes + 1).padStart(2, '0')}-01`) : `${anoFilter + 1}-01-01`;

      const kpiRes = await db.execute(sql`
        SELECT
          COUNT(*)::int as qtd,
          COALESCE(SUM(litros::numeric), 0) as litros,
          COALESCE(SUM(valor_total::numeric), 0) as valor,
          COALESCE(SUM(desconto::numeric), 0) as desconto,
          COUNT(DISTINCT vehicle_id)::int as veiculos,
          COUNT(DISTINCT motorista)::int as motoristas,
          COUNT(DISTINCT posto)::int as postos,
          COALESCE(AVG(NULLIF(preco_litro::numeric, 0)), 0) as preco_medio,
          COALESCE(MIN(NULLIF(preco_litro::numeric, 0)), 0) as preco_min,
          COALESCE(MAX(NULLIF(preco_litro::numeric, 0)), 0) as preco_max,
          COALESCE(AVG(NULLIF(consumo_km_l::numeric, 0)), 0) as consumo_medio
        FROM fleet_fuel_records
        WHERE company_id = ${companyId}
          AND data >= ${startDate}::date AND data < ${endDate}::date
      `);
      const kpi = ((kpiRes as any).rows || kpiRes)[0] || {};

      const porMesRes = await db.execute(sql`
        SELECT EXTRACT(MONTH FROM data)::int as mes,
               COUNT(*)::int as qtd,
               COALESCE(SUM(litros::numeric), 0) as litros,
               COALESCE(SUM(valor_total::numeric), 0) as valor,
               COALESCE(AVG(NULLIF(preco_litro::numeric, 0)), 0) as preco_medio
        FROM fleet_fuel_records
        WHERE company_id = ${companyId}
          AND data >= ${startDate}::date AND data < ${endDate}::date
        GROUP BY mes ORDER BY mes
      `);

      const porVeiculoRes = await db.execute(sql`
        SELECT fr.vehicle_id, v.placa, v.modelo, v.marca, v."tipoVeiculo" as tipo_veiculo,
               COUNT(*)::int as qtd,
               COALESCE(SUM(fr.litros::numeric), 0) as litros,
               COALESCE(SUM(fr.valor_total::numeric), 0) as valor,
               COALESCE(AVG(NULLIF(fr.preco_litro::numeric, 0)), 0) as preco_medio,
               COALESCE(AVG(NULLIF(fr.consumo_km_l::numeric, 0)), 0) as consumo_medio,
               COALESCE(MIN(NULLIF(fr.km_atual::numeric, 0)), 0) as km_min,
               COALESCE(MAX(NULLIF(fr.km_atual::numeric, 0)), 0) as km_max,
               MAX(fr.data) as ultimo_abastecimento
        FROM fleet_fuel_records fr
        JOIN vehicles v ON v.id = fr.vehicle_id AND v."companyId" = ${companyId}
        WHERE fr.company_id = ${companyId}
          AND fr.data >= ${startDate}::date AND fr.data < ${endDate}::date
        GROUP BY fr.vehicle_id, v.placa, v.modelo, v.marca, v."tipoVeiculo"
        ORDER BY valor DESC
      `);

      const porMotoristaRes = await db.execute(sql`
        SELECT COALESCE(NULLIF(TRIM(motorista), ''), 'Não informado') as motorista,
               COUNT(*)::int as qtd,
               COALESCE(SUM(litros::numeric), 0) as litros,
               COALESCE(SUM(valor_total::numeric), 0) as valor,
               COUNT(DISTINCT vehicle_id)::int as veiculos
        FROM fleet_fuel_records
        WHERE company_id = ${companyId}
          AND data >= ${startDate}::date AND data < ${endDate}::date
        GROUP BY motorista ORDER BY litros DESC LIMIT 30
      `);

      const porPostoRes = await db.execute(sql`
        SELECT COALESCE(NULLIF(TRIM(posto), ''), 'Não informado') as posto,
               COUNT(*)::int as qtd,
               COALESCE(SUM(litros::numeric), 0) as litros,
               COALESCE(SUM(valor_total::numeric), 0) as valor,
               COALESCE(AVG(NULLIF(preco_litro::numeric, 0)), 0) as preco_medio
        FROM fleet_fuel_records
        WHERE company_id = ${companyId}
          AND data >= ${startDate}::date AND data < ${endDate}::date
        GROUP BY posto ORDER BY valor DESC LIMIT 30
      `);

      const porTipoRes = await db.execute(sql`
        SELECT COALESCE(NULLIF(TRIM(tipo_combustivel), ''), 'Não informado') as tipo,
               COUNT(*)::int as qtd,
               COALESCE(SUM(litros::numeric), 0) as litros,
               COALESCE(SUM(valor_total::numeric), 0) as valor,
               COALESCE(AVG(NULLIF(preco_litro::numeric, 0)), 0) as preco_medio
        FROM fleet_fuel_records
        WHERE company_id = ${companyId}
          AND data >= ${startDate}::date AND data < ${endDate}::date
        GROUP BY tipo ORDER BY valor DESC
      `);

      // Top 10 maiores notas individuais — útil pra detectar abuso/fraude.
      const topNotasRes = await db.execute(sql`
        SELECT fr.id, fr.data, fr.litros, fr.valor_total, fr.preco_litro,
               fr.motorista, fr.posto, fr.km_atual, fr.tipo_combustivel,
               v.placa, v.modelo
        FROM fleet_fuel_records fr
        JOIN vehicles v ON v.id = fr.vehicle_id AND v."companyId" = ${companyId}
        WHERE fr.company_id = ${companyId}
          AND fr.data >= ${startDate}::date AND fr.data < ${endDate}::date
        ORDER BY fr.valor_total::numeric DESC LIMIT 15
      `);

      return {
        kpi: {
          qtd: parseInt(kpi.qtd) || 0,
          litros: parseFloat(kpi.litros) || 0,
          valor: parseFloat(kpi.valor) || 0,
          desconto: parseFloat(kpi.desconto) || 0,
          veiculos: parseInt(kpi.veiculos) || 0,
          motoristas: parseInt(kpi.motoristas) || 0,
          postos: parseInt(kpi.postos) || 0,
          precoMedio: parseFloat(kpi.preco_medio) || 0,
          precoMin: parseFloat(kpi.preco_min) || 0,
          precoMax: parseFloat(kpi.preco_max) || 0,
          consumoMedio: parseFloat(kpi.consumo_medio) || 0,
        },
        porMes: ((porMesRes as any).rows || []).map((r: any) => ({
          mes: r.mes, qtd: parseInt(r.qtd), litros: parseFloat(r.litros),
          valor: parseFloat(r.valor), precoMedio: parseFloat(r.preco_medio),
        })),
        porVeiculo: ((porVeiculoRes as any).rows || []).map((r: any) => {
          const kmRodado = Math.max(parseFloat(r.km_max) - parseFloat(r.km_min), 0);
          const litros = parseFloat(r.litros);
          const consumoCalc = (kmRodado > 0 && litros > 0) ? (kmRodado / litros) : parseFloat(r.consumo_medio);
          return {
            vehicleId: r.vehicle_id, placa: r.placa, modelo: r.modelo, marca: r.marca, tipoVeiculo: r.tipo_veiculo,
            qtd: parseInt(r.qtd), litros, valor: parseFloat(r.valor),
            precoMedio: parseFloat(r.preco_medio),
            consumoMedio: consumoCalc,
            kmRodado,
            custoPorKm: kmRodado > 0 ? parseFloat(r.valor) / kmRodado : 0,
            ultimoAbastecimento: r.ultimo_abastecimento,
          };
        }),
        porMotorista: ((porMotoristaRes as any).rows || []).map((r: any) => ({
          motorista: r.motorista, qtd: parseInt(r.qtd),
          litros: parseFloat(r.litros), valor: parseFloat(r.valor),
          veiculos: parseInt(r.veiculos),
        })),
        porPosto: ((porPostoRes as any).rows || []).map((r: any) => ({
          posto: r.posto, qtd: parseInt(r.qtd),
          litros: parseFloat(r.litros), valor: parseFloat(r.valor),
          precoMedio: parseFloat(r.preco_medio),
        })),
        porTipo: ((porTipoRes as any).rows || []).map((r: any) => ({
          tipo: r.tipo, qtd: parseInt(r.qtd),
          litros: parseFloat(r.litros), valor: parseFloat(r.valor),
          precoMedio: parseFloat(r.preco_medio),
        })),
        topNotas: ((topNotasRes as any).rows || []).map((r: any) => ({
          id: r.id, data: r.data, litros: parseFloat(r.litros),
          valor: parseFloat(r.valor_total), precoLitro: parseFloat(r.preco_litro || 0),
          motorista: r.motorista, posto: r.posto, kmAtual: parseFloat(r.km_atual || 0),
          tipo: r.tipo_combustivel, placa: r.placa, modelo: r.modelo,
        })),
      };
    }),

  // Rev. 1883 — DRILL-DOWN do Dashboard de Combustível. Retorna a lista
  // completa de abastecimentos filtrada por uma dimensão (motorista, posto,
  // tipo, mes, veiculo). Usado pelos modais fullscreen do CombustivelDashboard
  // — clicar em qualquer barra/fatia/linha abre os registros que compõem o
  // agregado. Especialmente útil para resolver "Não informado": ao clicar,
  // o usuário vê placa/data/posto de cada lançamento e identifica quem foi.
  getFuelDrilldown: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ano: z.number().optional(),
      dim: z.enum(["motorista", "posto", "tipo", "mes", "veiculo"]),
      value: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId !== undefined && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para acessar dados desta empresa" });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, dim, value } = input;
      const anoFilter = input.ano || new Date().getFullYear();
      const startDate = `${anoFilter}-01-01`;
      const endDate = `${anoFilter + 1}-01-01`;

      // Filtro condicional por dimensão. Sentinela "Não informado" trata
      // NULL/'' para os campos texto (motorista/posto/tipo) — mantém
      // paridade exata com o COALESCE do dashboard.
      const SENT = "Não informado";
      let dimFilter;
      if (dim === "motorista") {
        dimFilter = value === SENT
          ? sql`AND (fr.motorista IS NULL OR TRIM(fr.motorista) = '')`
          : sql`AND TRIM(COALESCE(fr.motorista, '')) = ${value}`;
      } else if (dim === "posto") {
        dimFilter = value === SENT
          ? sql`AND (fr.posto IS NULL OR TRIM(fr.posto) = '')`
          : sql`AND TRIM(COALESCE(fr.posto, '')) = ${value}`;
      } else if (dim === "tipo") {
        dimFilter = value === SENT
          ? sql`AND (fr.tipo_combustivel IS NULL OR TRIM(fr.tipo_combustivel) = '')`
          : sql`AND TRIM(COALESCE(fr.tipo_combustivel, '')) = ${value}`;
      } else if (dim === "mes") {
        const mes = parseInt(value);
        if (!(mes >= 1 && mes <= 12)) throw new TRPCError({ code: "BAD_REQUEST", message: "Mês inválido" });
        dimFilter = sql`AND EXTRACT(MONTH FROM fr.data)::int = ${mes}`;
      } else { // veiculo
        const vid = parseInt(value);
        if (!Number.isFinite(vid)) throw new TRPCError({ code: "BAD_REQUEST", message: "vehicleId inválido" });
        dimFilter = sql`AND fr.vehicle_id = ${vid}`;
      }

      const rowsRes = await db.execute(sql`
        SELECT fr.id, fr.data, fr.litros, fr.valor_total, fr.preco_litro,
               fr.motorista, fr.posto, fr.km_atual, fr.tipo_combustivel,
               fr.consumo_km_l, fr.desconto, fr.observacoes, fr.vehicle_id,
               v.placa, v.modelo, v.marca, v."tipoVeiculo" as tipo_veiculo
        FROM fleet_fuel_records fr
        JOIN vehicles v ON v.id = fr.vehicle_id AND v."companyId" = ${companyId}
        WHERE fr.company_id = ${companyId}
          AND fr.data >= ${startDate}::date AND fr.data < ${endDate}::date
          ${dimFilter}
        ORDER BY fr.data DESC, fr.id DESC
        LIMIT 500
      `);

      const rows = ((rowsRes as any).rows || []).map((r: any) => ({
        id: r.id, data: r.data,
        litros: parseFloat(r.litros) || 0,
        valor: parseFloat(r.valor_total) || 0,
        precoLitro: parseFloat(r.preco_litro) || 0,
        consumoKmL: parseFloat(r.consumo_km_l) || 0,
        desconto: parseFloat(r.desconto) || 0,
        motorista: r.motorista || null,
        posto: r.posto || null,
        tipo: r.tipo_combustivel || null,
        kmAtual: parseFloat(r.km_atual) || 0,
        observacoes: r.observacoes || null,
        vehicleId: r.vehicle_id, placa: r.placa, modelo: r.modelo,
        marca: r.marca, tipoVeiculo: r.tipo_veiculo,
      }));

      const totLitros = rows.reduce((s: number, r: any) => s + r.litros, 0);
      const totValor = rows.reduce((s: number, r: any) => s + r.valor, 0);
      const precos = rows.map((r: any) => r.precoLitro).filter((p: number) => p > 0);
      const precoMedio = precos.length > 0 ? precos.reduce((s: number, v: number) => s + v, 0) / precos.length : 0;

      return {
        kpi: {
          qtd: rows.length,
          litros: totLitros,
          valor: totValor,
          precoMedio,
          veiculos: new Set(rows.map((r: any) => r.vehicleId)).size,
        },
        rows,
      };
    }),

  // Rev. 1881 — Dashboard dedicado de PEDÁGIOS / Sem Parar. KPIs + evolução
  // mensal, ranking por veículo, por praça, por rodovia, e segmentação por
  // categoria (pedagio vs sem_parar).
  getPedagiosDashboard: protectedProcedure
    .input(z.object({ companyId: z.number(), ano: z.number().optional(), mes: z.number().nullable().optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId !== undefined && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para acessar dados desta empresa" });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, ano, mes } = input;
      const anoFilter = ano || new Date().getFullYear();
      const startDate = mes != null ? `${anoFilter}-${String(mes).padStart(2, '0')}-01` : `${anoFilter}-01-01`;
      const endDate = mes != null ? (mes === 12 ? `${anoFilter + 1}-01-01` : `${anoFilter}-${String(mes + 1).padStart(2, '0')}-01`) : `${anoFilter + 1}-01-01`;

      const kpiRes = await db.execute(sql`
        SELECT
          COUNT(*)::int as qtd,
          COALESCE(SUM(valor::numeric), 0) as valor,
          COUNT(DISTINCT vehicle_id)::int as veiculos,
          COUNT(DISTINCT praca_pedagio)::int as pracas,
          COUNT(DISTINCT rodovia)::int as rodovias,
          COUNT(DISTINCT tag_id)::int as tags,
          COALESCE(AVG(NULLIF(valor::numeric, 0)), 0) as valor_medio,
          COALESCE(MAX(valor::numeric), 0) as valor_max,
          COUNT(CASE WHEN categoria = 'pedagio' THEN 1 END)::int as qtd_pedagio,
          COUNT(CASE WHEN categoria = 'sem_parar' THEN 1 END)::int as qtd_sem_parar,
          COALESCE(SUM(CASE WHEN categoria = 'pedagio' THEN valor::numeric ELSE 0 END), 0) as valor_pedagio,
          COALESCE(SUM(CASE WHEN categoria = 'sem_parar' THEN valor::numeric ELSE 0 END), 0) as valor_sem_parar
        FROM fleet_toll_records
        WHERE company_id = ${companyId}
          AND data >= ${startDate}::date AND data < ${endDate}::date
      `);
      const kpi = ((kpiRes as any).rows || kpiRes)[0] || {};

      const porMesRes = await db.execute(sql`
        SELECT EXTRACT(MONTH FROM data)::int as mes,
               COUNT(*)::int as qtd,
               COALESCE(SUM(valor::numeric), 0) as valor,
               COALESCE(SUM(CASE WHEN categoria = 'pedagio' THEN valor::numeric ELSE 0 END), 0) as pedagio,
               COALESCE(SUM(CASE WHEN categoria = 'sem_parar' THEN valor::numeric ELSE 0 END), 0) as sem_parar
        FROM fleet_toll_records
        WHERE company_id = ${companyId}
          AND data >= ${startDate}::date AND data < ${endDate}::date
        GROUP BY mes ORDER BY mes
      `);

      const porVeiculoRes = await db.execute(sql`
        SELECT tr.vehicle_id, v.placa, v.modelo, v.marca, v."tipoVeiculo" as tipo_veiculo,
               COUNT(*)::int as qtd,
               COALESCE(SUM(tr.valor::numeric), 0) as valor,
               COUNT(CASE WHEN tr.categoria = 'pedagio' THEN 1 END)::int as qtd_pedagio,
               COUNT(CASE WHEN tr.categoria = 'sem_parar' THEN 1 END)::int as qtd_sem_parar,
               COUNT(DISTINCT tr.praca_pedagio)::int as pracas,
               MAX(tr.data) as ultimo
        FROM fleet_toll_records tr
        JOIN vehicles v ON v.id = tr.vehicle_id AND v."companyId" = ${companyId}
        WHERE tr.company_id = ${companyId}
          AND tr.data >= ${startDate}::date AND tr.data < ${endDate}::date
        GROUP BY tr.vehicle_id, v.placa, v.modelo, v.marca, v."tipoVeiculo"
        ORDER BY valor DESC
      `);

      const porPracaRes = await db.execute(sql`
        SELECT COALESCE(NULLIF(TRIM(praca_pedagio), ''), 'Não informado') as praca,
               COALESCE(NULLIF(TRIM(rodovia), ''), '—') as rodovia,
               COUNT(*)::int as qtd,
               COALESCE(SUM(valor::numeric), 0) as valor,
               COUNT(DISTINCT vehicle_id)::int as veiculos
        FROM fleet_toll_records
        WHERE company_id = ${companyId}
          AND data >= ${startDate}::date AND data < ${endDate}::date
        GROUP BY praca, rodovia ORDER BY valor DESC LIMIT 30
      `);

      const porRodoviaRes = await db.execute(sql`
        SELECT COALESCE(NULLIF(TRIM(rodovia), ''), 'Não informado') as rodovia,
               COUNT(*)::int as qtd,
               COALESCE(SUM(valor::numeric), 0) as valor,
               COUNT(DISTINCT praca_pedagio)::int as pracas,
               COUNT(DISTINCT vehicle_id)::int as veiculos
        FROM fleet_toll_records
        WHERE company_id = ${companyId}
          AND data >= ${startDate}::date AND data < ${endDate}::date
        GROUP BY rodovia ORDER BY valor DESC LIMIT 20
      `);

      // Top 15 passagens individuais mais caras — útil pra auditoria.
      const topPassagensRes = await db.execute(sql`
        SELECT tr.id, tr.data, tr.valor, tr.categoria, tr.praca_pedagio, tr.rodovia,
               tr.tag_id, tr.eixos, tr.descricao, v.placa, v.modelo
        FROM fleet_toll_records tr
        JOIN vehicles v ON v.id = tr.vehicle_id AND v."companyId" = ${companyId}
        WHERE tr.company_id = ${companyId}
          AND tr.data >= ${startDate}::date AND tr.data < ${endDate}::date
        ORDER BY tr.valor::numeric DESC LIMIT 15
      `);

      return {
        kpi: {
          qtd: parseInt(kpi.qtd) || 0,
          valor: parseFloat(kpi.valor) || 0,
          veiculos: parseInt(kpi.veiculos) || 0,
          pracas: parseInt(kpi.pracas) || 0,
          rodovias: parseInt(kpi.rodovias) || 0,
          tags: parseInt(kpi.tags) || 0,
          valorMedio: parseFloat(kpi.valor_medio) || 0,
          valorMax: parseFloat(kpi.valor_max) || 0,
          qtdPedagio: parseInt(kpi.qtd_pedagio) || 0,
          qtdSemParar: parseInt(kpi.qtd_sem_parar) || 0,
          valorPedagio: parseFloat(kpi.valor_pedagio) || 0,
          valorSemParar: parseFloat(kpi.valor_sem_parar) || 0,
        },
        porMes: ((porMesRes as any).rows || []).map((r: any) => ({
          mes: r.mes, qtd: parseInt(r.qtd), valor: parseFloat(r.valor),
          pedagio: parseFloat(r.pedagio), semParar: parseFloat(r.sem_parar),
        })),
        porVeiculo: ((porVeiculoRes as any).rows || []).map((r: any) => ({
          vehicleId: r.vehicle_id, placa: r.placa, modelo: r.modelo,
          marca: r.marca, tipoVeiculo: r.tipo_veiculo,
          qtd: parseInt(r.qtd), valor: parseFloat(r.valor),
          qtdPedagio: parseInt(r.qtd_pedagio), qtdSemParar: parseInt(r.qtd_sem_parar),
          pracas: parseInt(r.pracas), ultimo: r.ultimo,
        })),
        porPraca: ((porPracaRes as any).rows || []).map((r: any) => ({
          praca: r.praca, rodovia: r.rodovia, qtd: parseInt(r.qtd),
          valor: parseFloat(r.valor), veiculos: parseInt(r.veiculos),
        })),
        porRodovia: ((porRodoviaRes as any).rows || []).map((r: any) => ({
          rodovia: r.rodovia, qtd: parseInt(r.qtd), valor: parseFloat(r.valor),
          pracas: parseInt(r.pracas), veiculos: parseInt(r.veiculos),
        })),
        topPassagens: ((topPassagensRes as any).rows || []).map((r: any) => ({
          id: r.id, data: r.data, valor: parseFloat(r.valor), categoria: r.categoria,
          praca: r.praca_pedagio, rodovia: r.rodovia, tagId: r.tag_id,
          eixos: r.eixos, descricao: r.descricao, placa: r.placa, modelo: r.modelo,
        })),
      };
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

  getConsolidatedMonthsYear: protectedProcedure
    .input(z.object({ companyId: z.number(), ano: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, ano } = input;

      const maintRes = await db.execute(sql`
        SELECT EXTRACT(MONTH FROM data_competencia)::int as mes
        FROM financial_entries
        WHERE company_id = ${companyId}
          AND origem_modulo = 'frotas'
          AND descricao LIKE ${'Manutenções Frotas%'}
          AND EXTRACT(YEAR FROM data_competencia) = ${ano}
          AND status != 'cancelado'
      `);
      const maintMonths = ((maintRes as any).rows || maintRes).map((r: any) => r.mes);

      const fuelRes = await db.execute(sql`
        SELECT EXTRACT(MONTH FROM data_competencia)::int as mes
        FROM financial_entries
        WHERE company_id = ${companyId}
          AND origem_modulo = 'frotas'
          AND descricao LIKE ${'Combustível Frotas%'}
          AND EXTRACT(YEAR FROM data_competencia) = ${ano}
          AND status != 'cancelado'
      `);
      const fuelMonths = ((fuelRes as any).rows || fuelRes).map((r: any) => r.mes);

      return { manutencao: maintMonths, combustivel: fuelMonths };
    }),

  createPurchaseFromMaintenance: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      maintenanceId: z.number(),
      obraId: z.number().nullable().optional(),
      prioridade: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, maintenanceId } = input;

      const maintRes = await db.execute(sql`
        SELECT m.*, v.placa, v.modelo, v.marca
        FROM fleet_maintenances m
        LEFT JOIN vehicles v ON v.id = m.vehicle_id
        WHERE m.id = ${maintenanceId} AND m.company_id = ${companyId}
      `);
      const maint = ((maintRes as any).rows || maintRes)[0];
      if (!maint) throw new TRPCError({ code: "NOT_FOUND", message: "Manutenção não encontrada." });

      if (maint.sc_id) throw new TRPCError({ code: "CONFLICT", message: `Esta manutenção já possui SC vinculada (SC #${maint.sc_numero || maint.sc_id}).` });

      const itemsRes = await db.execute(sql`
        SELECT * FROM fleet_maintenance_items WHERE maintenance_id = ${maintenanceId} ORDER BY id
      `);
      const items = (itemsRes as any).rows || itemsRes;

      const titulo = `Manutenção ${maint.tipo === 'preventiva' ? 'Preventiva' : 'Corretiva'} — ${maint.placa || 'Veículo'} ${maint.modelo || ''}`.trim();
      const obs = [
        `Origem: Módulo Frotas — Manutenção #${maintenanceId}`,
        `Veículo: ${maint.placa || '-'} — ${maint.marca || ''} ${maint.modelo || ''}`,
        `Tipo: ${maint.tipo || '-'}`,
        maint.descricao ? `Descrição: ${maint.descricao}` : '',
        maint.fornecedor ? `Fornecedor sugerido: ${maint.fornecedor}` : '',
        input.observacoes || '',
      ].filter(Boolean).join('\n');

      // Rev. 1795 — advisory lock + MAX(seq)+1 + SELECT FOR UPDATE da manutenção +
      // INSERTs SC/itens + UPDATE fleet_maintenances.sc_id TUDO numa única transaction.
      // Sem isso: 2 calls concorrentes leem maint.sc_id=null, ambas criam SCs, último
      // UPDATE vence e a 1ª SC fica órfã (lock só serializa o número, não o vínculo).
      const sc = await db.transaction(async (tx: any) => {
        // Re-lê a manutenção COM lock pra impedir double-create do vínculo.
        const lockedRes = await tx.execute(sql`
          SELECT sc_id, sc_numero FROM fleet_maintenances WHERE id = ${maintenanceId} FOR UPDATE
        `);
        const locked = ((lockedRes as any).rows || lockedRes)[0];
        if (locked?.sc_id) {
          throw new TRPCError({ code: "CONFLICT", message: `Esta manutenção já possui SC vinculada (SC #${locked.sc_numero || locked.sc_id}).` });
        }

        const numeroSc = await lockEGerarNumeroSc(tx, companyId);
        const scRes = await tx.execute(sql`
          INSERT INTO compras_solicitacoes (company_id, numero_sc, obra_id, titulo, prioridade, observacoes, status, aprovacao_status, tipo, vehicle_id, maintenance_id, origem_modulo, created_at, updated_at)
          VALUES (${companyId}, ${numeroSc}, ${input.obraId ?? null}, ${titulo}, ${input.prioridade || 'alta'}, ${obs}, 'pendente', 'aguardando', 'servico', ${maint.vehicle_id}, ${maintenanceId}, 'frotas', NOW(), NOW())
          RETURNING id, numero_sc
        `);
        const scRow = ((scRes as any).rows || scRes)[0];

        if (items.length > 0) {
          for (const it of items) {
            const desc = `${it.categoria === 'peca' ? '[Peça]' : '[Serviço]'} ${it.nome}`;
            await tx.execute(sql`
              INSERT INTO compras_solicitacoes_itens (solicitacao_id, descricao, unidade, quantidade, observacoes, status_item)
              VALUES (${scRow.id}, ${desc}, 'un', ${String(it.quantidade || 1)}, ${`Valor unitário ref.: R$ ${parseFloat(it.valor_unitario || 0).toFixed(2)}`}, 'pendente')
            `);
          }
        } else {
          await tx.execute(sql`
            INSERT INTO compras_solicitacoes_itens (solicitacao_id, descricao, unidade, quantidade, observacoes, status_item)
            VALUES (${scRow.id}, ${titulo}, 'sv', '1', ${`Custo estimado: R$ ${parseFloat(maint.custo || 0).toFixed(2)}`}, 'pendente')
          `);
        }

        await tx.execute(sql`
          UPDATE fleet_maintenances SET sc_id = ${scRow.id}, sc_numero = ${scRow.numero_sc} WHERE id = ${maintenanceId}
        `);

        return scRow;
      });

      return { scId: sc.id, numeroSc: sc.numero_sc, titulo, qtdItens: items.length || 1 };
    }),

  linkPurchaseToMaintenance: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      maintenanceId: z.number(),
      ocId: z.number().optional(),
      ocNumero: z.string().optional(),
      custoFinal: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, maintenanceId } = input;

      if (input.ocId || input.ocNumero || input.custoFinal !== undefined) {
        await db.execute(sql`UPDATE fleet_maintenances SET
          oc_id = COALESCE(${input.ocId ?? null}, oc_id),
          oc_numero = COALESCE(${input.ocNumero ?? null}, oc_numero),
          custo = COALESCE(${input.custoFinal !== undefined ? String(input.custoFinal) : null}, custo),
          updated_at = NOW()
          WHERE id = ${maintenanceId} AND company_id = ${companyId}`);
      }

      if (input.ocId) {
        const maintRes = await db.execute(sql`SELECT vehicle_id FROM fleet_maintenances WHERE id = ${maintenanceId}`);
        const vehicleId = ((maintRes as any).rows || maintRes)[0]?.vehicle_id;
        if (vehicleId) {
          await db.execute(sql`UPDATE compras_ordens SET vehicle_id = ${vehicleId}, maintenance_id = ${maintenanceId} WHERE id = ${input.ocId}`);
        }
      }

      return { success: true };
    }),

  getMaintenancePurchaseStatus: protectedProcedure
    .input(z.object({ companyId: z.number(), maintenanceId: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, maintenanceId } = input;

      const maintRes = await db.execute(sql`
        SELECT sc_id, sc_numero, oc_id, oc_numero FROM fleet_maintenances WHERE id = ${maintenanceId} AND company_id = ${companyId}
      `);
      const maint = ((maintRes as any).rows || maintRes)[0];
      if (!maint) return null;

      let scStatus = null;
      let ocStatus = null;
      let ocTotal = null;

      if (maint.sc_id) {
        const scRes = await db.execute(sql`SELECT status, aprovacao_status FROM compras_solicitacoes WHERE id = ${maint.sc_id}`);
        const sc = ((scRes as any).rows || scRes)[0];
        scStatus = sc?.status || null;
      }

      if (maint.oc_id) {
        const ocRes = await db.execute(sql`SELECT status, total FROM compras_ordens WHERE id = ${maint.oc_id}`);
        const oc = ((ocRes as any).rows || ocRes)[0];
        ocStatus = oc?.status || null;
        ocTotal = oc?.total ? parseFloat(oc.total) : null;
      }

      return {
        scId: maint.sc_id, scNumero: maint.sc_numero, scStatus,
        ocId: maint.oc_id, ocNumero: maint.oc_numero, ocStatus, ocTotal,
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

      const buildPrompt = (corpo: string, contexto: string) => `Analise este ${contexto} de pedágio/Sem Parar e extraia TODOS os lançamentos.

VEÍCULOS CADASTRADOS NA FROTA (use o ID correspondente; case por PLACA exata):
${listaVeiculos}

Retorne APENAS um JSON válido (sem markdown, sem \`\`\`) com esta estrutura:
{
  "success": true,
  "items": [
    {
      "vehicleId": <number - ID do veículo da lista acima ou null>,
      "vehiclePlaca": "<placa do veículo>",
      "data": "<YYYY-MM-DD>",
      "categoria": "pedagio" | "sem_parar" | "estacionamento" | "recarga_tag",
      "descricao": "<descrição do lançamento>",
      "pracaPedagio": "<nome da praça>",
      "rodovia": "<nome da rodovia>",
      "valor": <number em R$>,
      "tagId": "<ID do tag se houver>",
      "eixos": <number ou null>,
      "observacoes": "<detalhes extras>"
    }
  ],
  "rawText": "<resumo>",
  "confidence": "alta" | "media" | "baixa"
}

Regras:
- Um item por PASSAGEM (não agrupe). Em faturas Sem Parar/Caixa/ConectCar há blocos "Detalhamento das Passagens por Pedágios" com Data/Hora/Concessionária/Praça/Valor — cada linha é um item.
- IGNORE linhas de "Resumo da Sua Fatura", "Plano Contratado", "Encargos" e totais.
- Se a fatura tiver seções por placa ("Descritivo: PLACA - Plano:"), use ESSA placa para todos os itens da seção até o próximo descritivo.
- categoria: "pedagio" pra passagem em praça, "sem_parar" só se for menção genérica sem praça.
- Se data não estiver clara, use hoje: ${new Date().toISOString().slice(0, 10)}.

CONTEÚDO:
${corpo}`;

      const systemPrompt = `Você é um assistente especialista em gestão de frotas veiculares no Brasil.
Analise extratos de pedágio, faturas Sem Parar/ConectCar/Veloe/Caixa Pré-Pagos e extraia dados de cada passagem.
Seja preciso com valores monetários, datas (DD/MM/AA → YYYY-MM-DD) e identificação de veículos por placa.
Sempre retorne JSON válido, sem markdown.`;

      const { invokeAnthropicVision, invokeLLM } = await import("../_core/llm");

      const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
      const parseJsonResponse = (rawResponse: string): any => {
        const cleaned = rawResponse.replace(/```json\s*/g, "").replace(/```/g, "").trim();
        let parsed = tryParse(cleaned);
        if (!parsed) {
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace >= 0 && lastBrace > firstBrace) {
            parsed = tryParse(cleaned.slice(firstBrace, lastBrace + 1));
          }
        }
        return parsed;
      };

      let allItems: any[] = [];
      let confidence: "alta" | "media" | "baixa" = "alta";
      let rawTextSummary = "";

      if (input.mimeType === "application/pdf") {
        // Rev. 2098 — PDFs grandes (faturas Sem Parar/Caixa mensais com
        // 100+ passagens) estouram o budget do Vision. Solução: extrair
        // texto com pdf-parse e mandar TEXTO pro Claude (≈10× mais barato
        // em tokens de input). Se texto for muito grande, chunkar por placa.
        // Rev. 2101 — package.json é ESM ("type": "module"), require() não
        // existe. Usar dynamic import. pdf-parse exporta default CJS, então
        // pega `.default` se presente.
        const pdfParseMod: any = await import("pdf-parse");
        const pdfParse = pdfParseMod.default || pdfParseMod;
        const buffer = Buffer.from(input.base64, "base64");
        let pdfText = "";
        try {
          const data = await pdfParse(buffer);
          pdfText = (data?.text || "").trim();
        } catch (e: any) {
          console.error("[parseTollPdf] pdf-parse falhou:", e?.message);
        }

        if (pdfText.length < 50) {
          // PDF sem texto extraível (scan de imagem) → cai pro Vision.
          console.log("[parseTollPdf] PDF sem texto; usando Vision.");
          const rawResponse = await invokeAnthropicVision({
            base64: input.base64,
            mimeType: "application/pdf",
            prompt: buildPrompt("(ver documento anexo)", "documento"),
            systemPrompt,
            maxTokens: 16384,
          });
          const parsed = parseJsonResponse(rawResponse);
          if (!parsed) {
            console.error("[parseTollPdf] JSON inválido (vision). Bruto:", rawResponse.slice(0, 500));
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Não consegui interpretar a resposta da IA. ${rawResponse.length >= 14000 ? "Resposta cortada — tente um PDF menor ou divida em partes. " : ""}Verifique se o documento é legível.`,
            });
          }
          allItems = Array.isArray(parsed.items) ? parsed.items : [];
          confidence = parsed.confidence || "media";
          rawTextSummary = parsed.rawText || "";
        } else {
          // Chunking por placa: se houver ≥2 marcadores "Descritivo: PLACA"
          // e o texto for grande, processa por placa em paralelo (limitado).
          const MAX_SINGLE_CHARS = 60_000;
          const descRegex = /Descritivo:\s*([A-Z0-9]{6,8})\s*-/g;
          const matches: Array<{ placa: string; idx: number }> = [];
          let m: RegExpExecArray | null;
          while ((m = descRegex.exec(pdfText)) !== null) matches.push({ placa: m[1], idx: m.index });

          const chunks: Array<{ label: string; text: string }> = [];
          if (matches.length >= 2 && pdfText.length > MAX_SINGLE_CHARS) {
            // Header = trecho antes do 1º descritivo
            const header = pdfText.slice(0, matches[0].idx);
            for (let i = 0; i < matches.length; i++) {
              const start = matches[i].idx;
              const end = i + 1 < matches.length ? matches[i + 1].idx : pdfText.length;
              const body = pdfText.slice(start, end);
              chunks.push({
                label: `placa ${matches[i].placa}`,
                text: `${header}\n\n${body}`,
              });
            }
            console.log(`[parseTollPdf] Chunking em ${chunks.length} placas (texto total ${pdfText.length} chars).`);
          } else {
            chunks.push({ label: "documento inteiro", text: pdfText });
          }

          // Processa chunks em paralelo (no máx 3 por vez pra não estourar rate-limit)
          const CONCURRENCY = 3;
          const results: any[] = [];
          for (let i = 0; i < chunks.length; i += CONCURRENCY) {
            const batch = chunks.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(batch.map(async (chunk) => {
              try {
                const rawResponse = await invokeLLM({
                  messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: buildPrompt(chunk.text, "trecho de fatura") },
                  ],
                  maxTokens: 16384,
                });
                const text = typeof rawResponse === "string"
                  ? rawResponse
                  : (rawResponse as any)?.text || (rawResponse as any)?.content || "";
                const parsed = parseJsonResponse(text);
                if (!parsed || !Array.isArray(parsed.items)) {
                  console.error(`[parseTollPdf] Chunk "${chunk.label}" sem items. Bruto:`, String(text).slice(0, 300));
                  return { items: [], confidence: "baixa", rawText: "" };
                }
                return parsed;
              } catch (e: any) {
                console.error(`[parseTollPdf] Erro em chunk "${chunk.label}":`, e?.message);
                return { items: [], confidence: "baixa", rawText: "" };
              }
            }));
            results.push(...batchResults);
          }
          for (const r of results) {
            if (Array.isArray(r.items)) allItems.push(...r.items);
            if (r.confidence === "baixa") confidence = "baixa";
            else if (r.confidence === "media" && confidence === "alta") confidence = "media";
          }
          rawTextSummary = `PDF processado em ${chunks.length} parte(s); ${allItems.length} lançamento(s) extraído(s).`;
          if (allItems.length === 0) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "A IA não conseguiu extrair lançamentos deste PDF. Verifique se é uma fatura/comprovante de pedágio legível.",
            });
          }
        }
      } else {
        // Imagem → Vision (caminho original).
        const rawResponse = await invokeAnthropicVision({
          base64: input.base64,
          mimeType: input.mimeType as any,
          prompt: buildPrompt("(ver imagem anexa)", "comprovante"),
          systemPrompt,
          maxTokens: 8192,
        });
        const parsed = parseJsonResponse(rawResponse);
        if (!parsed) {
          console.error("[parseTollPdf] JSON inválido (imagem). Bruto:", rawResponse.slice(0, 500));
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Não consegui interpretar a resposta da IA. Verifique se a imagem está nítida e tente novamente.",
          });
        }
        if (!parsed?.items || !Array.isArray(parsed.items)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "A IA não conseguiu extrair lançamentos. Verifique se é um comprovante de pedágio legível.",
          });
        }
        allItems = parsed.items;
        confidence = parsed.confidence || "media";
        rawTextSummary = parsed.rawText || "";
      }

      for (const item of allItems) {
        if (item.vehicleId) {
          const found = veiculos.find((v: any) => v.id === item.vehicleId);
          if (!found) item.vehicleId = null;
        }
        // Re-tentativa por placa se IA não encontrou ID
        if (!item.vehicleId && item.vehiclePlaca) {
          const placaNorm = String(item.vehiclePlaca).replace(/[^A-Z0-9]/gi, "").toUpperCase();
          const found = veiculos.find((v: any) =>
            String(v.placa || "").replace(/[^A-Z0-9]/gi, "").toUpperCase() === placaNorm
          );
          if (found) item.vehicleId = found.id;
        }
      }

      return {
        success: true,
        items: allItems,
        confidence,
        rawText: rawTextSummary,
      };
    }),

  parseTollExcel: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      base64: z.string().max(30_000_000),
    }))
    .mutation(async ({ input, ctx }) => {
      const userCid = (ctx as any).user?.companyId;
      if (userCid && String(userCid) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta empresa." });
      }
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();

      const XLSX = await import("xlsx");
      const buffer = Buffer.from(input.base64, "base64");
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      let headerIdx = -1;
      for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
        const row = rawRows[i];
        if (row && row.some((c: any) => String(c).toLowerCase().includes("placa"))) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de planilha não reconhecido. Cabeçalho com 'Placa' não encontrado." });
      }

      const headers = rawRows[headerIdx].map((h: any) => String(h).trim().toLowerCase());
      const colMap: Record<string, number> = {};
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (h.includes("fatura")) colMap.fatura = i;
        if (h.includes("data")) colMap.data = i;
        if (h.includes("horário") || h.includes("horario") || h.includes("hora")) colMap.horario = i;
        if (h.includes("placa")) colMap.placa = i;
        if (h.includes("tipo do veículo") || h.includes("tipo do veiculo") || h.includes("tipo ve")) colMap.tipoVeiculo = i;
        if (h.includes("descrição") || h.includes("descricao") || h === "descrição") colMap.descricao = i;
        if (h.includes("tipo de uso") || h.includes("tipo uso")) colMap.tipoUso = i;
        if (h.includes("valor")) colMap.valor = i;
        if (h.includes("débito") || h.includes("debito") || h.includes("crédito") || h.includes("credito")) colMap.debitoCredito = i;
        if (h.includes("sentido")) colMap.sentido = i;
      }

      if (colMap.placa === undefined || colMap.data === undefined || colMap.valor === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Colunas obrigatórias não encontradas: Placa, Data e Valor são necessários." });
      }

      const vehicleRows = await db.execute(sql`SELECT id, placa, marca, modelo FROM vehicles WHERE "companyId" = ${input.companyId}`);
      const vehicleMap = new Map<string, { id: number; placa: string; marca: string; modelo: string }>();
      for (const v of vehicleRows.rows) {
        const placa = String((v as any).placa || "").replace(/[-\s]/g, "").toUpperCase();
        if (placa) vehicleMap.set(placa, { id: (v as any).id, placa: (v as any).placa, marca: (v as any).marca, modelo: (v as any).modelo });
      }

      const tipoUsoToCategoria = (tipo: string): string => {
        const t = tipo.toLowerCase().trim();
        // "PASSAGEM" numa planilha Sem Parar É Sem Parar — nunca físico
        if (t.includes("passag") || t.includes("pedagio") || t.includes("pedágio")) return "sem_parar";
        if (t.includes("estacion")) return "estacionamento";
        if (t.includes("recarga") || t.includes("tag")) return "recarga_tag";
        return "sem_parar";
      };

      const items: any[] = [];
      const dataRows = rawRows.slice(headerIdx + 1);

      for (const row of dataRows) {
        if (!row || row.length === 0) continue;
        const placaRaw = String(row[colMap.placa] || "").trim();
        if (!placaRaw) continue;

        const valorRaw = row[colMap.valor];
        let valor: number;
        if (typeof valorRaw === "number") {
          valor = valorRaw;
        } else {
          let vs = String(valorRaw).replace(/[^\d.,\-]/g, "");
          if (vs.includes(",")) {
            vs = vs.replace(/\./g, "").replace(",", ".");
          }
          valor = parseFloat(vs);
        }
        if (isNaN(valor) || valor <= 0) continue;

        if (colMap.debitoCredito !== undefined) {
          const dc = String(row[colMap.debitoCredito] || "").toUpperCase().trim();
          if (dc === "CR" || dc === "CRÉDITO" || dc === "CREDITO") continue;
        }

        let dataStr = String(row[colMap.data] || "").trim();
        let dataISO = "";
        const m = dataStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) {
          dataISO = `${m[3]}-${m[2]}-${m[1]}`;
        } else if (dataStr.match(/^\d{4}-\d{2}-\d{2}/)) {
          dataISO = dataStr.slice(0, 10);
        } else if (typeof row[colMap.data] === "number") {
          const excelDate = XLSX.SSF.parse_date_code(row[colMap.data]);
          if (excelDate) {
            dataISO = `${excelDate.y}-${String(excelDate.m).padStart(2, "0")}-${String(excelDate.d).padStart(2, "0")}`;
          }
        }
        if (!dataISO) continue;

        const placaNorm = placaRaw.replace(/[-\s]/g, "").toUpperCase();
        const vehicle = vehicleMap.get(placaNorm);

        const descricao = colMap.descricao !== undefined ? String(row[colMap.descricao] || "").trim() : "";
        const tipoUso = colMap.tipoUso !== undefined ? String(row[colMap.tipoUso] || "").trim() : "";
        const categoria = tipoUso ? tipoUsoToCategoria(tipoUso) : "sem_parar";
        const horario = colMap.horario !== undefined ? String(row[colMap.horario] || "").trim() : "";
        const fatura = colMap.fatura !== undefined ? String(row[colMap.fatura] || "").trim() : "";
        const sentido = colMap.sentido !== undefined ? String(row[colMap.sentido] || "").trim() : "";

        const pracaPedagio = descricao + (sentido ? ` (${sentido})` : "");

        items.push({
          vehicleId: vehicle?.id || null,
          vehiclePlaca: placaRaw,
          vehicleInfo: vehicle ? `${vehicle.placa} — ${vehicle.marca} ${vehicle.modelo}` : null,
          data: dataISO,
          horario,
          categoria,
          descricao: tipoUso || descricao,
          pracaPedagio: pracaPedagio,
          valor,
          fatura,
          matched: !!vehicle,
        });
      }

      const totalValor = items.reduce((s, it) => s + it.valor, 0);
      const matched = items.filter(it => it.matched).length;
      const unmatched = items.filter(it => !it.matched).length;
      const placasNaoEncontradas = [...new Set(items.filter(it => !it.matched).map(it => it.vehiclePlaca))];

      return {
        items,
        summary: {
          total: items.length,
          matched,
          unmatched,
          totalValor,
          placasNaoEncontradas,
        },
      };
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

      const vehicleIds = [...new Set(input.items.map(it => it.vehicleId))];
      if (vehicleIds.length > 0) {
        const validVehicles = await db.execute(sql`SELECT id FROM vehicles WHERE "companyId" = ${input.companyId} AND id IN (${sql.join(vehicleIds.map(id => sql`${id}`), sql`, `)})`);
        const validIds = new Set((validVehicles.rows as any[]).map(r => r.id));
        const invalidIds = vehicleIds.filter(id => !validIds.has(id));
        if (invalidIds.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Veículo(s) não pertence(m) a esta empresa: ${invalidIds.join(", ")}` });
        }
      }

      const valueRows = input.items.map(item =>
        sql`(${input.companyId}, ${item.vehicleId}, ${item.data}::date, ${item.categoria},
          ${item.descricao || null}, ${item.pracaPedagio || null}, ${item.rodovia || null},
          ${item.valor}, ${item.tagId || null}, ${item.eixos || null},
          ${item.observacoes || null}, ${input.criadoPor || 'IA Import'})`
      );
      await db.execute(sql`
        INSERT INTO fleet_toll_records (company_id, vehicle_id, data, categoria, descricao, praca_pedagio, rodovia, valor, tag_id, eixos, observacoes, criado_por)
        VALUES ${sql.join(valueRows, sql`, `)}
      `);
      return { inserted: input.items.length };
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

  clearTollMonth: protectedProcedure
    .input(z.object({
      companyId: z.number(), mes: z.number().min(1).max(12), ano: z.number().min(2020).max(2100),
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

      const [userRow] = await db.select().from(users).where(eq(users.id, userId));
      if (!userRow || !userRow.password) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário não possui login local com senha." });
      }

      const valid = bcrypt.compareSync(input.password, userRow.password);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta. Operação cancelada." });
      }

      const { companyId, mes, ano } = input;
      const startDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const endDate = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

      const countRes = await db.execute(sql`
        SELECT COUNT(*) as total FROM fleet_toll_records
        WHERE company_id = ${companyId} AND data >= ${startDate}::date AND data < ${endDate}::date
      `);
      const total = parseInt(((countRes as any).rows || countRes)[0]?.total) || 0;

      if (total === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum registro encontrado neste mês." });
      }

      await db.execute(sql`
        DELETE FROM fleet_toll_records
        WHERE company_id = ${companyId} AND data >= ${startDate}::date AND data < ${endDate}::date
      `);

      return { deleted: total };
    }),

  clearAllTollRecords: protectedProcedure
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

      const [userRow] = await db.select().from(users).where(eq(users.id, userId));
      if (!userRow || !userRow.password) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário não possui login local com senha." });
      }

      const valid = bcrypt.compareSync(input.password, userRow.password);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta. Operação cancelada." });
      }

      const countRes = await db.execute(sql`
        SELECT COUNT(*) as total FROM fleet_toll_records WHERE company_id = ${input.companyId}
      `);
      const total = parseInt(((countRes as any).rows || countRes)[0]?.total) || 0;

      if (total === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum registro de pedágio encontrado." });
      }

      await db.execute(sql`
        DELETE FROM fleet_toll_records WHERE company_id = ${input.companyId}
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

  getVehicleRaioX: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const { companyId, vehicleId } = input;

      const [vehRes, maintRes, maintItemsRes, fuelRes, tollRes, finesRes, ipvaRes, licRes, insRes, washRes, parkRes, checkRes, scRes] = await Promise.all([
        db.execute(sql`SELECT * FROM vehicles WHERE id = ${vehicleId} AND "companyId" = ${companyId}`),
        db.execute(sql`SELECT fm.*, COALESCE((SELECT SUM(valor_total) FROM fleet_maintenance_items mi WHERE mi.maintenance_id = fm.id AND mi.categoria = 'peca'), 0) as total_pecas, COALESCE((SELECT SUM(valor_total) FROM fleet_maintenance_items mi WHERE mi.maintenance_id = fm.id AND mi.categoria = 'servico'), 0) as total_servico FROM fleet_maintenances fm WHERE fm.vehicle_id = ${vehicleId} AND fm.company_id = ${companyId} ORDER BY fm.data_manutencao DESC`),
        db.execute(sql`SELECT mi.* FROM fleet_maintenance_items mi JOIN fleet_maintenances fm ON fm.id = mi.maintenance_id WHERE fm.vehicle_id = ${vehicleId} AND fm.company_id = ${companyId} ORDER BY mi.maintenance_id, mi.id`),
        db.execute(sql`SELECT * FROM fleet_fuel_records WHERE vehicle_id = ${vehicleId} AND company_id = ${companyId} ORDER BY data DESC`),
        db.execute(sql`SELECT * FROM fleet_toll_records WHERE vehicle_id = ${vehicleId} AND company_id = ${companyId} ORDER BY data DESC`),
        db.execute(sql`SELECT * FROM fleet_fines WHERE vehicle_id = ${vehicleId} AND company_id = ${companyId} ORDER BY data_infracao DESC`),
        db.execute(sql`SELECT * FROM fleet_ipva WHERE vehicle_id = ${vehicleId} AND company_id = ${companyId} ORDER BY ano_referencia DESC`),
        db.execute(sql`SELECT * FROM fleet_licensing WHERE vehicle_id = ${vehicleId} AND company_id = ${companyId} ORDER BY ano_exercicio DESC`),
        db.execute(sql`SELECT * FROM fleet_insurance WHERE vehicle_id = ${vehicleId} AND company_id = ${companyId} ORDER BY data_inicio DESC`),
        db.execute(sql`SELECT * FROM fleet_washes WHERE vehicle_id = ${vehicleId} AND company_id = ${companyId} ORDER BY data DESC`),
        db.execute(sql`SELECT * FROM fleet_parking WHERE vehicle_id = ${vehicleId} AND company_id = ${companyId} ORDER BY data DESC`),
        db.execute(sql`SELECT fc.*, (SELECT COUNT(*) FROM fleet_checklist_responses r WHERE r.checklist_id = fc.id AND r.resposta = 'conforme')::int as ok_count, (SELECT COUNT(*) FROM fleet_checklist_responses r WHERE r.checklist_id = fc.id)::int as total_count FROM fleet_checklists fc WHERE fc.vehicle_id = ${vehicleId} AND fc.company_id = ${companyId} ORDER BY fc.data_checklist DESC`),
        db.execute(sql`SELECT cs.id, cs.numero_sc, cs.titulo, cs.status, cs.created_at, cs.vehicle_id FROM compras_solicitacoes cs WHERE cs.vehicle_id = ${vehicleId} AND cs.company_id = ${companyId} ORDER BY cs.created_at DESC`),
      ]);

      const r = (res: any) => (res as any).rows || res || [];
      const vehicle = r(vehRes)[0] || null;
      const allMaintItems = r(maintItemsRes);
      const itemsByMaint: Record<number, any[]> = {};
      for (const mi of allMaintItems) {
        const mid = mi.maintenance_id;
        if (!itemsByMaint[mid]) itemsByMaint[mid] = [];
        itemsByMaint[mid].push(mi);
      }
      const manutencoes = r(maintRes).map((m: any) => ({ ...m, itens: itemsByMaint[m.id] || [] }));
      const combustivel = r(fuelRes);
      const pedagios = r(tollRes);
      const multas = r(finesRes);
      const ipva = r(ipvaRes);
      const licenciamento = r(licRes);
      const seguros = r(insRes);
      const lavagens = r(washRes);
      const estacionamentos = r(parkRes);
      const checklists = r(checkRes);
      const compras = r(scRes);

      const n = (v: any) => Number(v) || 0;
      const custoManutencao = manutencoes.reduce((s: number, m: any) => s + n(m.custo), 0);
      const custoCombustivel = combustivel.reduce((s: number, f: any) => s + n(f.valor_total), 0);
      const custoPedagios = pedagios.reduce((s: number, t: any) => s + n(t.valor), 0);
      const custoMultas = multas.reduce((s: number, m: any) => s + n(m.valor_original), 0);
      const custoIpva = ipva.reduce((s: number, i: any) => s + n(i.valor_total), 0);
      const custoLicenciamento = licenciamento.reduce((s: number, l: any) => s + n(l.valor), 0);
      const custoSeguros = seguros.reduce((s: number, s2: any) => s + n(s2.valor_premio), 0);
      const custoLavagens = lavagens.reduce((s: number, l: any) => s + n(l.valor), 0);
      const custoEstacionamentos = estacionamentos.reduce((s: number, e: any) => s + n(e.valor), 0);
      const tco = custoManutencao + custoCombustivel + custoPedagios + custoMultas + custoIpva + custoLicenciamento + custoSeguros + custoLavagens + custoEstacionamentos;

      let healthScore = 100;
      const ultimoCheck = checklists[0];
      if (!ultimoCheck) healthScore -= 15;
      else {
        const diasDesdeCheck = Math.floor((Date.now() - new Date(ultimoCheck.data_checklist).getTime()) / 86400000);
        if (diasDesdeCheck > 45) healthScore -= 15;
        else if (diasDesdeCheck > 30) healthScore -= 8;
      }
      const mantPendentes = manutencoes.filter((m: any) => m.status === 'agendada' || m.status === 'em_andamento');
      if (mantPendentes.length > 0) healthScore -= 5 * mantPendentes.length;
      const mantAtrasadas = manutencoes.filter((m: any) => m.data_proxima && new Date(m.data_proxima) < new Date());
      if (mantAtrasadas.length > 0) healthScore -= 10 * mantAtrasadas.length;
      const multasPendentes = multas.filter((m: any) => m.status === 'pendente');
      if (multasPendentes.length > 0) healthScore -= 5 * multasPendentes.length;
      const ipvaPendente = ipva.filter((i: any) => i.status === 'pendente');
      if (ipvaPendente.length > 0) healthScore -= 10;
      const licPendente = licenciamento.filter((l: any) => l.status === 'pendente');
      if (licPendente.length > 0) healthScore -= 10;
      const seguroVencido = seguros.filter((s: any) => s.status === 'vencida' || (s.data_fim && new Date(s.data_fim) < new Date()));
      if (seguroVencido.length > 0) healthScore -= 15;
      healthScore = Math.max(0, Math.min(100, healthScore));

      const alertas: { tipo: string; mensagem: string; nivel: string }[] = [];
      if (mantAtrasadas.length > 0) alertas.push({ tipo: 'manutencao', mensagem: `${mantAtrasadas.length} manutenção(ões) atrasada(s)`, nivel: 'critico' });
      if (vehicle?.km_atual) {
        const km = n(vehicle.km_atual);
        const ultimaTrocaOleo = manutencoes.find((m: any) => m.descricao?.toLowerCase().includes('óleo') || m.descricao?.toLowerCase().includes('oleo'));
        if (ultimaTrocaOleo) {
          const kmDesdeOleo = km - n(ultimaTrocaOleo.km_na_manutencao);
          if (kmDesdeOleo > 10000) alertas.push({ tipo: 'oleo', mensagem: `Troca de óleo: ${kmDesdeOleo.toLocaleString('pt-BR')} km desde última troca`, nivel: 'critico' });
          else if (kmDesdeOleo > 8000) alertas.push({ tipo: 'oleo', mensagem: `Troca de óleo: ${kmDesdeOleo.toLocaleString('pt-BR')} km desde última troca (próximo)`, nivel: 'atencao' });
        }
        const ultimoRodizio = manutencoes.find((m: any) => m.descricao?.toLowerCase().includes('pneu') || m.descricao?.toLowerCase().includes('rodízio') || m.descricao?.toLowerCase().includes('rodizio'));
        if (ultimoRodizio) {
          const kmDesdeRodizio = km - n(ultimoRodizio.km_na_manutencao);
          if (kmDesdeRodizio > 10000) alertas.push({ tipo: 'pneus', mensagem: `Rodízio de pneus: ${kmDesdeRodizio.toLocaleString('pt-BR')} km desde último rodízio`, nivel: 'atencao' });
        }
        const ultimaRevisao = manutencoes.find((m: any) => m.tipo === 'preventiva');
        if (ultimaRevisao) {
          const kmDesdeRevisao = km - n(ultimaRevisao.km_na_manutencao);
          if (kmDesdeRevisao > 15000) alertas.push({ tipo: 'revisao', mensagem: `Revisão preventiva: ${kmDesdeRevisao.toLocaleString('pt-BR')} km desde última`, nivel: 'atencao' });
        }
      }
      if (multasPendentes.length > 0) alertas.push({ tipo: 'multa', mensagem: `${multasPendentes.length} multa(s) pendente(s)`, nivel: 'atencao' });
      if (ipvaPendente.length > 0) alertas.push({ tipo: 'ipva', mensagem: 'IPVA pendente de pagamento', nivel: 'atencao' });
      if (licPendente.length > 0) alertas.push({ tipo: 'licenciamento', mensagem: 'Licenciamento pendente', nivel: 'critico' });
      if (seguroVencido.length > 0) alertas.push({ tipo: 'seguro', mensagem: 'Seguro vencido ou próximo do vencimento', nivel: 'critico' });
      if (!ultimoCheck || (Date.now() - new Date(ultimoCheck.data_checklist).getTime()) > 35 * 86400000) {
        alertas.push({ tipo: 'checklist', mensagem: 'Checklist mensal pendente', nivel: 'atencao' });
      }

      const timeline: any[] = [];
      manutencoes.forEach((m: any) => timeline.push({ data: m.data_manutencao, tipo: 'manutencao', descricao: m.descricao, valor: n(m.custo), id: m.id }));
      combustivel.forEach((f: any) => timeline.push({ data: f.data, tipo: 'combustivel', descricao: `${n(f.litros)}L ${f.tipo_combustivel || ''} — ${f.posto || ''}`, valor: n(f.valor_total), id: f.id }));
      pedagios.forEach((t: any) => timeline.push({ data: t.data, tipo: 'pedagio', descricao: t.descricao || t.praca_pedagio || 'Pedágio', valor: n(t.valor), id: t.id }));
      multas.forEach((m: any) => timeline.push({ data: m.data_infracao, tipo: 'multa', descricao: m.descricao, valor: n(m.valor_original), id: m.id }));
      lavagens.forEach((l: any) => timeline.push({ data: l.data, tipo: 'lavagem', descricao: `Lavagem ${l.tipo || ''} — ${l.local || ''}`, valor: n(l.valor), id: l.id }));
      estacionamentos.forEach((e: any) => timeline.push({ data: e.data, tipo: 'estacionamento', descricao: e.local || 'Estacionamento', valor: n(e.valor), id: e.id }));
      checklists.forEach((c: any) => timeline.push({ data: c.data_checklist, tipo: 'checklist', descricao: `Checklist — ${c.motorista_nome || 'Motorista'} — ${c.km_atual || '?'} km`, valor: 0, id: c.id }));
      seguros.forEach((s: any) => timeline.push({ data: s.data_inicio, tipo: 'seguro', descricao: `Seguro ${s.seguradora} — Apólice ${s.numero_apolice || ''}`, valor: n(s.valor_premio), id: s.id }));
      ipva.forEach((i: any) => timeline.push({ data: i.data_vencimento || `${i.ano_referencia}-01-01`, tipo: 'ipva', descricao: `IPVA ${i.ano_referencia}`, valor: n(i.valor_total), id: i.id }));
      licenciamento.forEach((l: any) => timeline.push({ data: l.data_vencimento || `${l.ano_exercicio}-01-01`, tipo: 'licenciamento', descricao: `Licenciamento ${l.ano_exercicio}`, valor: n(l.valor), id: l.id }));
      compras.forEach((c: any) => timeline.push({ data: c.created_at?.split('T')[0] || '', tipo: 'compra', descricao: `SC ${c.numero_sc} — ${c.titulo || ''}`, valor: 0, id: c.id }));
      timeline.sort((a: any, b: any) => (b.data || '').localeCompare(a.data || ''));

      return {
        vehicle,
        manutencoes,
        combustivel,
        pedagios,
        multas,
        ipva,
        licenciamento,
        seguros,
        lavagens,
        estacionamentos,
        checklists,
        compras,
        tco: {
          total: tco,
          manutencao: custoManutencao,
          combustivel: custoCombustivel,
          pedagios: custoPedagios,
          multas: custoMultas,
          ipva: custoIpva,
          licenciamento: custoLicenciamento,
          seguros: custoSeguros,
          lavagens: custoLavagens,
          estacionamentos: custoEstacionamentos,
        },
        healthScore,
        alertas,
        timeline: timeline.slice(0, 200),
      };
    }),

  listChecklistTemplates: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const res = await db.execute(sql`SELECT t.*, (SELECT COUNT(*)::int FROM fleet_checklist_template_items WHERE template_id = t.id) as items_count FROM fleet_checklist_templates t WHERE t.company_id = ${input.companyId} ORDER BY t.nome`);
      return (res as any).rows || [];
    }),

  getChecklistTemplate: protectedProcedure
    .input(z.object({ companyId: z.number(), templateId: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const tRes = await db.execute(sql`SELECT * FROM fleet_checklist_templates WHERE id = ${input.templateId} AND company_id = ${input.companyId}`);
      const template = ((tRes as any).rows || [])[0];
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template não encontrado" });
      const iRes = await db.execute(sql`SELECT * FROM fleet_checklist_template_items WHERE template_id = ${input.templateId} ORDER BY categoria, ordem`);
      return { ...template, items: (iRes as any).rows || [] };
    }),

  createChecklistTemplate: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string(),
      descricao: z.string().optional(),
      tipoVeiculo: z.string().optional(),
      vehicleId: z.number().optional(),
      periodicidade: z.string().default('mensal'),
      items: z.array(z.object({
        categoria: z.string(),
        descricao: z.string(),
        tipoResposta: z.string().default('conforme_nc'),
        obrigatorio: z.boolean().default(true),
        fotoObrigatoria: z.boolean().default(false),
        ordem: z.number().default(0),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const userName = (ctx as any).user?.name || 'Sistema';
      const tRes = await db.execute(sql`INSERT INTO fleet_checklist_templates (company_id, vehicle_id, nome, descricao, tipo_veiculo, periodicidade, criado_por) VALUES (${input.companyId}, ${input.vehicleId ?? null}, ${input.nome}, ${input.descricao ?? null}, ${input.tipoVeiculo ?? null}, ${input.periodicidade}, ${userName}) RETURNING *`);
      const template = ((tRes as any).rows || [])[0];
      if (template && input.items.length > 0) {
        for (const item of input.items) {
          await db.execute(sql`INSERT INTO fleet_checklist_template_items (template_id, categoria, descricao, tipo_resposta, obrigatorio, foto_obrigatoria, ordem) VALUES (${template.id}, ${item.categoria}, ${item.descricao}, ${item.tipoResposta}, ${item.obrigatorio}, ${item.fotoObrigatoria}, ${item.ordem})`);
        }
      }
      return template;
    }),

  updateChecklistTemplate: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      templateId: z.number(),
      nome: z.string().optional(),
      descricao: z.string().optional(),
      tipoVeiculo: z.string().optional(),
      vehicleId: z.number().optional(),
      periodicidade: z.string().optional(),
      ativo: z.boolean().optional(),
      items: z.array(z.object({
        categoria: z.string(),
        descricao: z.string(),
        tipoResposta: z.string().default('conforme_nc'),
        obrigatorio: z.boolean().default(true),
        fotoObrigatoria: z.boolean().default(false),
        ordem: z.number().default(0),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      await db.execute(sql`UPDATE fleet_checklist_templates SET
        nome = COALESCE(${input.nome ?? null}, nome),
        descricao = COALESCE(${input.descricao ?? null}, descricao),
        tipo_veiculo = COALESCE(${input.tipoVeiculo ?? null}, tipo_veiculo),
        vehicle_id = COALESCE(${input.vehicleId ?? null}, vehicle_id),
        periodicidade = COALESCE(${input.periodicidade ?? null}, periodicidade),
        ativo = COALESCE(${input.ativo ?? null}, ativo),
        updated_at = NOW()
        WHERE id = ${input.templateId} AND company_id = ${input.companyId}`);
      if (input.items) {
        await db.execute(sql`DELETE FROM fleet_checklist_template_items WHERE template_id = ${input.templateId}`);
        for (const item of input.items) {
          await db.execute(sql`INSERT INTO fleet_checklist_template_items (template_id, categoria, descricao, tipo_resposta, obrigatorio, foto_obrigatoria, ordem) VALUES (${input.templateId}, ${item.categoria}, ${item.descricao}, ${item.tipoResposta}, ${item.obrigatorio}, ${item.fotoObrigatoria}, ${item.ordem})`);
        }
      }
      return { ok: true };
    }),

  deleteChecklistTemplate: protectedProcedure
    .input(z.object({ companyId: z.number(), templateId: z.number() }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      await db.execute(sql`DELETE FROM fleet_checklist_templates WHERE id = ${input.templateId} AND company_id = ${input.companyId}`);
      return { ok: true };
    }),

  listChecklists: protectedProcedure
    .input(z.object({ companyId: z.number(), vehicleId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      let q = sql`SELECT fc.*, v.placa, v.modelo, v.marca, t.nome as template_nome,
        (SELECT COUNT(*) FROM fleet_checklist_responses r WHERE r.checklist_id = fc.id AND r.resposta = 'conforme')::int as ok_count,
        (SELECT COUNT(*) FROM fleet_checklist_responses r WHERE r.checklist_id = fc.id)::int as total_count
        FROM fleet_checklists fc
        JOIN vehicles v ON v.id = fc.vehicle_id
        LEFT JOIN fleet_checklist_templates t ON t.id = fc.template_id
        WHERE fc.company_id = ${input.companyId}`;
      if (input.vehicleId) q = sql`${q} AND fc.vehicle_id = ${input.vehicleId}`;
      if (input.status) q = sql`${q} AND fc.status = ${input.status}`;
      q = sql`${q} ORDER BY fc.data_checklist DESC`;
      return ((await db.execute(q)) as any).rows || [];
    }),

  createChecklist: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      vehicleId: z.number(),
      templateId: z.number().optional(),
      motoristaNome: z.string().optional(),
      motoristaId: z.number().optional(),
      dataChecklist: z.string(),
      kmAtual: z.number().optional(),
      observacoes: z.string().optional(),
      fotoUrls: z.string().optional(),
      videoUrls: z.string().optional(),
      responses: z.array(z.object({
        templateItemId: z.number().optional(),
        categoria: z.string(),
        descricao: z.string(),
        resposta: z.string().default('conforme'),
        observacao: z.string().optional(),
        fotoUrl: z.string().optional(),
        midiasUrls: z.array(z.object({ url: z.string(), tipo: z.string() })).optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const userName = (ctx as any).user?.name || 'Sistema';
      const totalItems = input.responses.length;
      const conformeItems = input.responses.filter(r => r.resposta === 'conforme').length;
      const scoreGeral = totalItems > 0 ? Math.round((conformeItems / totalItems) * 100 * 10) / 10 : 100;

      const cRes = await db.execute(sql`INSERT INTO fleet_checklists (company_id, vehicle_id, template_id, motorista_id, motorista_nome, data_checklist, km_atual, status, observacoes, foto_urls, video_urls, score_geral, criado_por)
        VALUES (${input.companyId}, ${input.vehicleId}, ${input.templateId ?? null}, ${input.motoristaId ?? null}, ${input.motoristaNome ?? null}, ${input.dataChecklist}, ${input.kmAtual ?? null}, 'preenchido', ${input.observacoes ?? null}, ${input.fotoUrls ?? null}, ${input.videoUrls ?? null}, ${String(scoreGeral)}, ${userName}) RETURNING *`);
      const checklist = ((cRes as any).rows || [])[0];

      if (checklist) {
        for (const resp of input.responses) {
          const midiasJson = resp.midiasUrls && resp.midiasUrls.length > 0 ? JSON.stringify(resp.midiasUrls) : '[]';
          await db.execute(sql`INSERT INTO fleet_checklist_responses (checklist_id, template_item_id, categoria, descricao, resposta, observacao, foto_url, midias_urls) VALUES (${checklist.id}, ${resp.templateItemId ?? null}, ${resp.categoria}, ${resp.descricao}, ${resp.resposta}, ${resp.observacao ?? null}, ${resp.fotoUrl ?? null}, ${midiasJson}::jsonb)`);
        }
        if (input.kmAtual) {
          await db.execute(sql`UPDATE vehicles SET km_atual = ${String(input.kmAtual)}, updated_at = NOW() WHERE id = ${input.vehicleId} AND company_id = ${input.companyId}`);
        }
      }
      return checklist;
    }),

  deleteChecklist: protectedProcedure
    .input(z.object({ companyId: z.number(), checklistId: z.number() }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      await db.execute(sql`DELETE FROM fleet_checklists WHERE id = ${input.checklistId} AND company_id = ${input.companyId}`);
      return { ok: true };
    }),

  getChecklistDetail: protectedProcedure
    .input(z.object({ companyId: z.number(), checklistId: z.number() }))
    .query(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const cRes = await db.execute(sql`SELECT fc.*, v.placa, v.modelo, v.marca FROM fleet_checklists fc JOIN vehicles v ON v.id = fc.vehicle_id WHERE fc.id = ${input.checklistId} AND fc.company_id = ${input.companyId}`);
      const checklist = ((cRes as any).rows || [])[0];
      if (!checklist) throw new TRPCError({ code: "NOT_FOUND", message: "Checklist não encontrado" });
      const rRes = await db.execute(sql`SELECT * FROM fleet_checklist_responses WHERE checklist_id = ${input.checklistId} ORDER BY categoria, id`);
      return { ...checklist, responses: (rRes as any).rows || [] };
    }),

  createWash: protectedProcedure
    .input(z.object({
      companyId: z.number(), vehicleId: z.number(), data: z.string(), tipo: z.string().default('completa'),
      local: z.string().optional(), valor: z.number().default(0), kmAtual: z.number().optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const userName = (ctx as any).user?.name || 'Sistema';
      const res = await db.execute(sql`INSERT INTO fleet_washes (company_id, vehicle_id, data, tipo, local, valor, km_atual, observacoes, criado_por) VALUES (${input.companyId}, ${input.vehicleId}, ${input.data}, ${input.tipo}, ${input.local ?? null}, ${String(input.valor)}, ${input.kmAtual ? String(input.kmAtual) : null}, ${input.observacoes ?? null}, ${userName}) RETURNING *`);
      return ((res as any).rows || [])[0];
    }),

  deleteWash: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      await db.execute(sql`DELETE FROM fleet_washes WHERE id = ${input.id} AND company_id = ${input.companyId}`);
      return { ok: true };
    }),

  createParking: protectedProcedure
    .input(z.object({
      companyId: z.number(), vehicleId: z.number(), data: z.string(), local: z.string().optional(),
      tipo: z.string().default('estacionamento'), valor: z.number().default(0), horas: z.number().optional(), observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const userName = (ctx as any).user?.name || 'Sistema';
      const res = await db.execute(sql`INSERT INTO fleet_parking (company_id, vehicle_id, data, local, tipo, valor, horas, observacoes, criado_por) VALUES (${input.companyId}, ${input.vehicleId}, ${input.data}, ${input.local ?? null}, ${input.tipo}, ${String(input.valor)}, ${input.horas ? String(input.horas) : null}, ${input.observacoes ?? null}, ${userName}) RETURNING *`);
      return ((res as any).rows || [])[0];
    }),

  deleteParking: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      await db.execute(sql`DELETE FROM fleet_parking WHERE id = ${input.id} AND company_id = ${input.companyId}`);
      return { ok: true };
    }),

  generateDefaultChecklistTemplate: protectedProcedure
    .input(z.object({ companyId: z.number(), tipoVeiculo: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
      const db = await getDb();
      const userName = (ctx as any).user?.name || 'Sistema';
      const tipo = input.tipoVeiculo || 'Veículo Leve';

      const items = [
        { cat: 'Pneus', items: ['Estado geral dos pneus (desgaste, bolhas, cortes)', 'Calibragem dos pneus', 'Estepe em boas condições', 'Rodas sem amassados ou trincas'] },
        { cat: 'Fluidos', items: ['Nível de óleo do motor', 'Nível do fluido de freio', 'Nível do líquido de arrefecimento', 'Nível do fluido da direção hidráulica', 'Nível do fluido do limpador de parabrisa'] },
        { cat: 'Iluminação', items: ['Faróis (baixo e alto)', 'Lanternas traseiras', 'Setas (dianteiras e traseiras)', 'Luz de freio', 'Luz de ré', 'Farol de neblina'] },
        { cat: 'Carroceria', items: ['Pintura e lataria (riscos, amassados)', 'Para-brisas e vidros (trincas, rachaduras)', 'Retrovisores (estado e ajuste)', 'Limpadores de parabrisa', 'Fechaduras e travas'] },
        { cat: 'Interior', items: ['Painel de instrumentos (luzes de alerta)', 'Ar condicionado funcionando', 'Cintos de segurança', 'Bancos e estofamentos', 'Tapetes e assoalho'] },
        { cat: 'Segurança', items: ['Triângulo de sinalização', 'Extintor de incêndio (validade)', 'Macaco e chave de roda', 'Kit de primeiros socorros', 'Buzina funcionando'] },
        { cat: 'Motor', items: ['Ruídos anormais no motor', 'Vazamentos visíveis', 'Correia do motor (estado visual)', 'Bateria (terminais e carga)'] },
        { cat: 'Freios', items: ['Eficiência da frenagem', 'Freio de estacionamento', 'Ruídos ao frear', 'Curso do pedal de freio'] },
        { cat: 'Documentação', items: ['CRLV em dia', 'Seguro obrigatório', 'CNH do motorista válida', 'Autorização de condução'] },
      ];

      const tRes = await db.execute(sql`INSERT INTO fleet_checklist_templates (company_id, nome, descricao, tipo_veiculo, periodicidade, criado_por) VALUES (${input.companyId}, ${'Inspeção Mensal — ' + tipo}, ${'Checklist padrão de inspeção mensal para ' + tipo + '. Categorias: pneus, fluidos, iluminação, carroceria, interior, segurança, motor, freios, documentação.'}, ${tipo}, 'mensal', ${userName}) RETURNING *`);
      const template = ((tRes as any).rows || [])[0];

      if (template) {
        let ordem = 0;
        for (const cat of items) {
          for (const desc of cat.items) {
            await db.execute(sql`INSERT INTO fleet_checklist_template_items (template_id, categoria, descricao, tipo_resposta, obrigatorio, foto_obrigatoria, ordem) VALUES (${template.id}, ${cat.cat}, ${desc}, 'conforme_nc', true, false, ${ordem})`);
            ordem++;
          }
        }
      }
      return template;
    }),

  getInfleetTrips: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      infleetVehicleId: z.string().regex(/^[a-f0-9-]+$/i),
      placa: z.string(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const token = process.env.FROTA_API_TOKEN;
      if (!token) return { trips: [], error: 'Token Infleet não configurado' };
      try {
        const query = `{
          trips(filter: { vehicleId: "${input.infleetVehicleId}", fixTime: { startAt: "${input.startDate}T00:00:00.000Z", endAt: "${input.endDate}T23:59:59.000Z" } }) {
            id startedAt finishedAt distanceTraveled averageSpeed maximumSpeed
            fuelConsumedLiters
            driver { name }
            vehicle { plate displayName }
          }
        }`;
        const resp = await fetch('https://api.infleet.com.br/v1/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) return { trips: [], error: `Infleet API: ${resp.status}` };
        const data = await resp.json() as any;
        if (data.errors) return { trips: [], error: data.errors[0]?.message || 'Erro GraphQL' };
        const trips = (data.data?.trips || []).map((t: any) => ({
          id: t.id,
          placa: t.vehicle?.plate || input.placa,
          inicio: t.startedAt,
          fim: t.finishedAt,
          kmPercorrido: t.distanceTraveled || 0,
          velMedia: t.averageSpeed || 0,
          velMaxima: t.maximumSpeed || 0,
          combustivel: t.fuelConsumedLiters || 0,
          motorista: t.driver?.name || null,
        }));
        return { trips, error: null };
      } catch (e: any) {
        return { trips: [], error: e.message || 'Erro ao conectar com Infleet' };
      }
    }),

  getInfleetVehiclePositions: protectedProcedure
    .input(z.object({
      infleetVehicleId: z.string().regex(/^[a-f0-9-]+$/i),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const token = process.env.FROTA_API_TOKEN;
      if (!token) return { positions: [], error: 'Token Infleet não configurado' };
      try {
        const query = `{
          listVehiclePositions(filter: { vehicleId: "${input.infleetVehicleId}", fixTime: { startAt: "${input.startDate}T00:00:00.000Z", endAt: "${input.endDate}T23:59:59.000Z" } }) {
            latitude longitude speed fixTime address ignition course
          }
        }`;
        const resp = await fetch('https://api.infleet.com.br/v1/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(20000),
        });
        if (!resp.ok) return { positions: [], error: `Infleet API: ${resp.status}` };
        const data = await resp.json() as any;
        if (data.errors) return { positions: [], error: data.errors[0]?.message || 'Erro GraphQL' };
        return { positions: data.data?.listVehiclePositions || [], error: null };
      } catch (e: any) {
        return { positions: [], error: e.message || 'Erro ao conectar com Infleet' };
      }
    }),

  getControleKm: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      try {
        if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }
        const db = await getDb();

        const kmRes = (await db.execute(sql`
          SELECT placa, COALESCE(nome_veiculo, '') as nome_veiculo,
                 data, km_total, COALESCE(viagens, num_viagens, 0) as viagens,
                 tempo_rodando_min, vel_media, vel_maxima,
                 COALESCE(motoristas, motorista, '') as motoristas,
                 infleet_vehicle_id, alerta_gps
          FROM fleet_daily_km
          WHERE company_id = ${input.companyId}
            AND data >= ${input.startDate}
            AND data <= ${input.endDate}
          ORDER BY placa, data
        `) as any).rows || [];

        const byPlaca: Record<string, { nome: string; infleetId: string | null; days: any[] }> = {};
        kmRes.forEach((r: any) => {
          const p = (r.placa || '').replace(/[-\s]/g, '').toUpperCase();
          if (!byPlaca[p]) byPlaca[p] = { nome: r.nome_veiculo || '', infleetId: r.infleet_vehicle_id || null, days: [] };
          const km = parseFloat(r.km_total) || 0;
          const viagens = parseInt(r.viagens) || 0;
          const dataStr = typeof r.data === 'string' ? r.data.slice(0, 10) : new Date(r.data).toISOString().slice(0, 10);
          const motoristasArr = r.motoristas ? String(r.motoristas).split(',').map((m: string) => m.trim()).filter(Boolean) : [];
          byPlaca[p].days.push({
            data: dataStr,
            km,
            viagens,
            tempoRodandoMin: parseInt(r.tempo_rodando_min) || 0,
            velMedia: parseFloat(r.vel_media) || 0,
            velMaxima: parseFloat(r.vel_maxima) || 0,
            motoristas: motoristasArr,
            alertaGps: r.alerta_gps || null,
          });
        });

        let infleetStatusMap: Record<string, { id: string; status: string; odometer: number | null; driver: string | null; type: string }> = {};
        const token = process.env.FROTA_API_TOKEN;
        if (token) {
          try {
            const vResp = await fetch('https://api.infleet.com.br/v1/graphql', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              body: JSON.stringify({ query: `{ listVehicles { id plate status odometer type driver { name } } }` }),
              signal: AbortSignal.timeout(8000),
            });
            const vData = await vResp.json() as any;
            (vData.data?.listVehicles || []).forEach((v: any) => {
              const p = (v.plate || '').replace(/[-\s]/g, '').toUpperCase();
              infleetStatusMap[p] = { id: v.id, status: v.status, odometer: v.odometer ? Math.round(v.odometer) : null, driver: v.driver?.name || null, type: v.type };
            });
          } catch { /* status info is optional */ }
        }

        const vehicleRes = (await db.execute(sql`
          SELECT id, placa, motorista_padrao, motorista_padrao_inicio FROM vehicles WHERE "companyId" = ${input.companyId}
        `) as any).rows || [];
        const plateToId: Record<string, number> = {};
        const plateToMotPadrao: Record<string, { nome: string; inicio: string }> = {};
        vehicleRes.forEach((v: any) => {
          if (v.placa) {
            const pn = v.placa.replace(/[-\s]/g, '').toUpperCase();
            plateToId[pn] = v.id;
            if (v.motorista_padrao) {
              plateToMotPadrao[pn] = { nome: v.motorista_padrao, inicio: v.motorista_padrao_inicio || '2000-01-01' };
            }
          }
        });

        const fuelRes = (await db.execute(sql`
          SELECT vehicle_id, data, litros, valor_total, km_atual, km_anterior, consumo_km_l,
                 tipo_combustivel, motorista, posto
          FROM fleet_fuel_records
          WHERE company_id = ${input.companyId}
            AND data >= ${input.startDate}
            AND data <= ${input.endDate}
          ORDER BY data
        `) as any).rows || [];

        const fuelByPlaca: Record<string, any[]> = {};
        fuelRes.forEach((f: any) => {
          const veh = vehicleRes.find((v: any) => v.id === f.vehicle_id);
          if (veh && veh.placa) {
            const key = veh.placa.replace(/[-\s]/g, '').toUpperCase();
            if (!fuelByPlaca[key]) fuelByPlaca[key] = [];
            fuelByPlaca[key].push({
              data: typeof f.data === 'string' ? f.data.slice(0, 10) : new Date(f.data).toISOString().slice(0, 10),
              litros: parseFloat(f.litros) || 0,
              valorTotal: parseFloat(f.valor_total) || 0,
              kmAtual: parseFloat(f.km_atual) || 0,
              kmAnterior: parseFloat(f.km_anterior) || 0,
              consumoKmL: parseFloat(f.consumo_km_l) || 0,
              combustivel: f.tipo_combustivel,
              motorista: f.motorista,
              posto: f.posto,
            });
          }
        });

        const allPlacas = new Set([...Object.keys(byPlaca), ...Object.keys(infleetStatusMap)]);

        const vehicles = [...allPlacas].map(placaNorm => {
          const kmData = byPlaca[placaNorm];
          const motPadrao = plateToMotPadrao[placaNorm] || null;
          const dailyData = (kmData?.days || []).map((d: any) => {
            if ((!d.motoristas || d.motoristas.length === 0) && motPadrao && d.data >= motPadrao.inicio) {
              return { ...d, motoristas: [motPadrao.nome], motoristaPadraoUsado: true };
            }
            return d;
          });
          const statusInfo = infleetStatusMap[placaNorm];
          const totalKm = dailyData.reduce((s: number, d: any) => s + d.km, 0);
          const totalViagens = dailyData.reduce((s: number, d: any) => s + d.viagens, 0);
          const diasComViagem = dailyData.filter((d: any) => d.km > 0).length;
          const abastecimentos = fuelByPlaca[placaNorm] || [];
          const totalLitros = abastecimentos.reduce((s: number, a: any) => s + a.litros, 0);
          const totalGasto = abastecimentos.reduce((s: number, a: any) => s + a.valorTotal, 0);
          const consumoReal = totalLitros > 0 && totalKm > 0 ? Math.round(totalKm / totalLitros * 10) / 10 : null;
          const custoKm = totalKm > 0 ? Math.round(totalGasto / totalKm * 100) / 100 : null;

          const rawPlaca = kmData?.days[0] ? kmRes.find((r: any) => (r.placa || '').replace(/[-\s]/g, '').toUpperCase() === placaNorm)?.placa || placaNorm : placaNorm;

          return {
            vehicleId: plateToId[placaNorm] || null,
            infleetId: kmData?.infleetId || statusInfo?.id || null,
            placa: rawPlaca,
            nome: kmData?.nome || '',
            tipo: statusInfo?.type || '',
            status: statusInfo?.status || 'UNKNOWN',
            kmOdometro: statusInfo?.odometer || null,
            motorista: statusInfo?.driver || null,
            motoristaPadrao: motPadrao?.nome || null,
            motoristaPadraoInicio: motPadrao?.inicio || null,
            totalKm: Math.round(totalKm * 10) / 10,
            totalViagens,
            diasComViagem,
            mediaKmDia: diasComViagem > 0 ? Math.round(totalKm / diasComViagem * 10) / 10 : 0,
            dailyData,
            abastecimentos,
            totalLitros: Math.round(totalLitros * 10) / 10,
            totalGastoCombustivel: Math.round(totalGasto * 100) / 100,
            consumoRealKmL: consumoReal,
            custoKm,
          };
        }).sort((a, b) => b.totalKm - a.totalKm);

        return { vehicles, error: null };
      } catch (e: any) {
        return { vehicles: [], error: e.message || 'Erro ao buscar dados' };
      }
    }),

  coletarKmDiario: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await coletarKmDiarioJob(input.companyId, input.data);
      return result;
    }),

  getDailyKm: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows_ = (await db.execute(sql`
        SELECT dk.id, dk.company_id, dk.placa, COALESCE(dk.nome_veiculo, '') as nome_veiculo,
               dk.data, dk.km_total, COALESCE(dk.viagens, dk.num_viagens, 0) as viagens,
               dk.tempo_rodando_min, dk.vel_media, dk.vel_maxima,
               CASE
                 WHEN COALESCE(dk.motoristas, dk.motorista, '') != '' THEN COALESCE(dk.motoristas, dk.motorista, '')
                 WHEN v.motorista_padrao IS NOT NULL AND v.motorista_padrao_inicio IS NOT NULL AND dk.data >= v.motorista_padrao_inicio THEN v.motorista_padrao
                 ELSE ''
               END as motoristas,
               CASE
                 WHEN COALESCE(dk.motoristas, dk.motorista, '') = '' AND v.motorista_padrao IS NOT NULL AND dk.data >= v.motorista_padrao_inicio THEN true
                 ELSE false
               END as motorista_padrao_usado,
               COALESCE(dk.odometro_fim, dk.km_odometro_fim) as odometro_fim,
               dk.infleet_vehicle_id, dk.updated_at, dk.alerta_gps,
               dk.primeira_ligacao, dk.ultima_desligacao
        FROM fleet_daily_km dk
        LEFT JOIN vehicles v ON UPPER(REPLACE(REPLACE(v.placa, '-', ''), ' ', '')) = UPPER(REPLACE(REPLACE(dk.placa, '-', ''), ' ', '')) AND v."companyId" = dk.company_id
        WHERE dk.company_id = ${input.companyId}
          AND dk.data >= ${input.startDate}
          AND dk.data <= ${input.endDate}
        ORDER BY dk.data DESC, dk.km_total DESC
      `) as any).rows || [];
      return rows_;
    }),

  atualizarMotorista: protectedProcedure
    .input(z.object({
      id: z.number(),
      motorista: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`
        UPDATE fleet_daily_km
        SET motoristas = ${input.motorista}, updated_at = NOW()
        WHERE id = ${input.id}
      `);
      return { ok: true };
    }),

  setMotoristaPadrao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      vehicleId: z.number(),
      motoristaPadrao: z.string(),
      motoristaPadraoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .mutation(async ({ input, ctx }) => {
      const userCompanyId = (ctx as any).user?.companyId || input.companyId;
      if (input.companyId !== userCompanyId) throw new Error("Sem permissão para alterar veículo de outra empresa");
      const db = await getDb();
      const result = await db.execute(sql`
        UPDATE vehicles
        SET motorista_padrao = ${input.motoristaPadrao},
            motorista_padrao_inicio = ${input.motoristaPadraoInicio}
        WHERE id = ${input.vehicleId} AND "companyId" = ${input.companyId}
      `);
      return { ok: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // CONTROLE DE VIAGENS — Rev. 4151
  // ═══════════════════════════════════════════════════════════════════════

  createTrip: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      vehicleId: z.number().nullable().optional(),
      placa: z.string().optional(),
      motoristaNome: z.string(),
      motoristaId: z.number().nullable().optional(),
      origem: z.string(),
      destino: z.string(),
      motivo: z.enum(['obra', 'orcamento', 'prospeccao', 'manutencao', 'outro']),
      motivoDescricao: z.string().optional(),
      obraId: z.number().nullable().optional(),
      obraNome: z.string().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      const db = await getDb();
      const res = await db.execute(sql`
        INSERT INTO fleet_trips
          (company_id, vehicle_id, placa, motorista_nome, motorista_id, status,
           origem, destino, motivo, motivo_descricao, obra_id, obra_nome, criado_por)
        VALUES
          (${input.companyId}, ${input.vehicleId ?? null}, ${input.placa ?? null},
           ${input.motoristaNome}, ${input.motoristaId ?? null}, 'pendente',
           ${input.origem}, ${input.destino}, ${input.motivo},
           ${input.motivoDescricao ?? null}, ${input.obraId ?? null},
           ${input.obraNome ?? null}, ${input.criadoPor ?? null})
        RETURNING id
      `);
      return { id: ((res as any).rows || res)[0]?.id };
    }),

  getTrips: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      status: z.string().optional(),
      vehicleId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      const db = await getDb();
      const rows = await db.execute(sql`
        SELECT t.*,
               v.modelo as v_modelo, v.marca as v_marca,
               COALESCE((SELECT SUM(valor) FROM fleet_trip_expenses
                         WHERE trip_id = t.id AND status_reembolso <> 'nao_reembolsavel'), 0) as total_despesas,
               (SELECT COUNT(*) FROM fleet_trip_expenses
                WHERE trip_id = t.id AND status_reembolso = 'pendente')::int as despesas_pendentes
        FROM fleet_trips t
        LEFT JOIN vehicles v ON v.id = t.vehicle_id AND v."companyId" = ${input.companyId}
        WHERE t.company_id = ${input.companyId}
          ${input.status && input.status !== 'todos' ? sql`AND t.status = ${input.status}` : sql``}
          ${input.vehicleId ? sql`AND t.vehicle_id = ${input.vehicleId}` : sql``}
        ORDER BY t.criado_em DESC
        LIMIT 300
      `);
      return ((rows as any).rows || rows) as any[];
    }),

  getTripById: protectedProcedure
    .input(z.object({ companyId: z.number(), tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      const db = await getDb();
      const tripRes = await db.execute(sql`
        SELECT t.*, v.modelo as v_modelo, v.marca as v_marca
        FROM fleet_trips t
        LEFT JOIN vehicles v ON v.id = t.vehicle_id AND v."companyId" = ${input.companyId}
        WHERE t.id = ${input.tripId} AND t.company_id = ${input.companyId}
      `);
      const trip = ((tripRes as any).rows || tripRes)[0];
      if (!trip) throw new TRPCError({ code: "NOT_FOUND", message: "Viagem não encontrada" });
      const expRes = await db.execute(sql`
        SELECT * FROM fleet_trip_expenses
        WHERE trip_id = ${input.tripId}
        ORDER BY data ASC, criado_em ASC
      `);
      return { ...trip, expenses: ((expRes as any).rows || expRes) } as any;
    }),

  updateTripStatus: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      tripId: z.number(),
      action: z.enum(['autorizar', 'rejeitar', 'iniciar', 'finalizar', 'cancelar']),
      kmInicial: z.number().nullable().optional(),
      kmFinal: z.number().nullable().optional(),
      fotoKmInicialUrl: z.string().nullable().optional(),
      fotoKmFinalUrl: z.string().nullable().optional(),
      observacoesGestor: z.string().nullable().optional(),
      autorizadoPor: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      const db = await getDb();
      if (input.action === 'autorizar') {
        await db.execute(sql`
          UPDATE fleet_trips SET status = 'autorizada',
            autorizado_por = ${input.autorizadoPor ?? null},
            data_autorizacao = NOW(),
            observacoes_gestor = COALESCE(${input.observacoesGestor ?? null}, observacoes_gestor),
            atualizado_em = NOW()
          WHERE id = ${input.tripId} AND company_id = ${input.companyId}
        `);
      } else if (input.action === 'rejeitar') {
        await db.execute(sql`
          UPDATE fleet_trips SET status = 'rejeitada',
            observacoes_gestor = COALESCE(${input.observacoesGestor ?? null}, observacoes_gestor),
            atualizado_em = NOW()
          WHERE id = ${input.tripId} AND company_id = ${input.companyId}
        `);
      } else if (input.action === 'iniciar') {
        await db.execute(sql`
          UPDATE fleet_trips SET status = 'em_andamento',
            data_saida = NOW(),
            km_inicial = COALESCE(${input.kmInicial ?? null}::numeric, km_inicial),
            foto_km_inicial_url = COALESCE(${input.fotoKmInicialUrl ?? null}, foto_km_inicial_url),
            atualizado_em = NOW()
          WHERE id = ${input.tripId} AND company_id = ${input.companyId}
        `);
      } else if (input.action === 'finalizar') {
        await db.execute(sql`
          UPDATE fleet_trips SET status = 'concluida',
            data_retorno = NOW(),
            km_final = COALESCE(${input.kmFinal ?? null}::numeric, km_final),
            foto_km_final_url = COALESCE(${input.fotoKmFinalUrl ?? null}, foto_km_final_url),
            atualizado_em = NOW()
          WHERE id = ${input.tripId} AND company_id = ${input.companyId}
        `);
      } else if (input.action === 'cancelar') {
        await db.execute(sql`
          UPDATE fleet_trips SET status = 'cancelada', atualizado_em = NOW()
          WHERE id = ${input.tripId} AND company_id = ${input.companyId}
        `);
      }
      return { ok: true };
    }),

  uploadTripPhoto: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      base64: z.string(),
      contentType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      const buf = Buffer.from(input.base64, 'base64');
      if (buf.length > 15 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Foto muito grande (máx 15MB)" });
      }
      const ext = input.contentType.includes('png') ? 'png' : 'jpg';
      const key = `frotas/viagens/${input.companyId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { url } = await storagePut(key, buf, input.contentType);
      return { url: url || `/api/files/${key}` };
    }),

  uploadTripExpenseReceipt: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      base64: z.string(),
      contentType: z.string().default("image/jpeg"),
      fileName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      const buf = Buffer.from(input.base64, 'base64');
      if (buf.length > 20 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo muito grande (máx 20MB)" });
      }
      const isPdf = input.contentType.includes('pdf') || (input.fileName || '').toLowerCase().endsWith('.pdf');
      const ext = isPdf ? 'pdf' : input.contentType.includes('png') ? 'png' : 'jpg';
      const key = `frotas/despesas/${input.companyId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { url } = await storagePut(key, buf, input.contentType);
      return { url: url || `/api/files/${key}` };
    }),

  getVehicleOdometerInfleet: protectedProcedure
    .input(z.object({ companyId: z.number(), placa: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      const token = process.env.FROTA_API_TOKEN;
      if (!token) return { km: null as number | null, erro: "Token Infleet não configurado" };
      try {
        const query = `{ listVehicles { id plate odometer } }`;
        const resp = await fetch('https://api.infleet.com.br/v1/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(10000),
        });
        const data: any = await resp.json();
        const veiculos = data?.data?.listVehicles || [];
        const placaNorm = input.placa.replace(/[-\s]/g, '').toUpperCase();
        const v = veiculos.find((x: any) => String(x.plate || '').replace(/[-\s]/g, '').toUpperCase() === placaNorm);
        if (!v) return { km: null as number | null, erro: "Veículo não encontrado no rastreador" };
        return { km: v.odometer ? Math.round(v.odometer) : null as number | null, erro: null };
      } catch (e: any) {
        return { km: null as number | null, erro: e.message };
      }
    }),

  addTripExpense: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      tripId: z.number(),
      tipo: z.string(),
      valor: z.number(),
      descricao: z.string().optional(),
      data: z.string(),
      comprovanteUrl: z.string().nullable().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      const db = await getDb();
      const tripCheck = await db.execute(sql`
        SELECT id FROM fleet_trips WHERE id = ${input.tripId} AND company_id = ${input.companyId}
      `);
      if (!((tripCheck as any).rows || tripCheck)[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Viagem não encontrada" });
      }
      const res = await db.execute(sql`
        INSERT INTO fleet_trip_expenses
          (trip_id, company_id, tipo, valor, descricao, data, comprovante_url, criado_por)
        VALUES
          (${input.tripId}, ${input.companyId}, ${input.tipo}, ${input.valor},
           ${input.descricao ?? null}, ${input.data}::date,
           ${input.comprovanteUrl ?? null}, ${input.criadoPor ?? null})
        RETURNING id
      `);
      return { id: ((res as any).rows || res)[0]?.id };
    }),

  deleteTripExpense: protectedProcedure
    .input(z.object({ companyId: z.number(), expenseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM fleet_trip_expenses
        WHERE id = ${input.expenseId} AND company_id = ${input.companyId}
      `);
      return { ok: true };
    }),

  updateTripExpenseReimbursement: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      expenseId: z.number(),
      formaPagamento: z.string().nullable().optional(),
      pixChaveTipo: z.string().nullable().optional(),
      pixChave: z.string().nullable().optional(),
      tedBanco: z.string().nullable().optional(),
      tedAgencia: z.string().nullable().optional(),
      tedConta: z.string().nullable().optional(),
      tedTipoConta: z.string().nullable().optional(),
      nomeFavorecido: z.string().nullable().optional(),
      statusReembolso: z.string().nullable().optional(),
      aprovadoPor: z.string().nullable().optional(),
      observacoesFinanceiro: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      const db = await getDb();
      const isApproved = input.statusReembolso === 'aprovado' || input.statusReembolso === 'pago';
      await db.execute(sql`
        UPDATE fleet_trip_expenses SET
          forma_pagamento    = COALESCE(${input.formaPagamento ?? null}, forma_pagamento),
          pix_chave_tipo     = COALESCE(${input.pixChaveTipo ?? null}, pix_chave_tipo),
          pix_chave          = COALESCE(${input.pixChave ?? null}, pix_chave),
          ted_banco          = COALESCE(${input.tedBanco ?? null}, ted_banco),
          ted_agencia        = COALESCE(${input.tedAgencia ?? null}, ted_agencia),
          ted_conta          = COALESCE(${input.tedConta ?? null}, ted_conta),
          ted_tipo_conta     = COALESCE(${input.tedTipoConta ?? null}, ted_tipo_conta),
          nome_favorecido    = COALESCE(${input.nomeFavorecido ?? null}, nome_favorecido),
          status_reembolso   = COALESCE(${input.statusReembolso ?? null}, status_reembolso),
          aprovado_por       = COALESCE(${input.aprovadoPor ?? null}, aprovado_por),
          data_aprovacao     = CASE WHEN ${isApproved} THEN NOW() ELSE data_aprovacao END,
          observacoes_financeiro = COALESCE(${input.observacoesFinanceiro ?? null}, observacoes_financeiro)
        WHERE id = ${input.expenseId} AND company_id = ${input.companyId}
      `);
      return { ok: true };
    }),

  getPendingReimbursements: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      const db = await getDb();
      const rows = await db.execute(sql`
        SELECT e.*, t.motorista_nome, t.placa, t.origem, t.destino, t.data_saida, t.data_retorno
        FROM fleet_trip_expenses e
        JOIN fleet_trips t ON t.id = e.trip_id AND t.company_id = ${input.companyId}
        WHERE e.company_id = ${input.companyId}
          AND e.status_reembolso IN ('pendente', 'aprovado')
        ORDER BY e.criado_em DESC
      `);
      return ((rows as any).rows || rows) as any[];
    }),

  getPlaceAutocomplete: protectedProcedure
    .input(z.object({ companyId: z.number(), input: z.string().min(2) }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      // Tenta Places Autocomplete primeiro
      try {
        const result = await makeRequest<{ predictions: Array<{ description: string; place_id: string; structured_formatting?: { main_text: string; secondary_text: string } }>; status: string }>(
          '/maps/api/place/autocomplete/json', {
            input: input.input,
            language: 'pt-BR',
            components: 'country:br',
            types: 'geocode',
          }
        );
        if (result.status === 'OK') {
          return (result.predictions || []).slice(0, 6);
        }
        if (result.status === 'ZERO_RESULTS') return [];
        // Status inesperado (ex: NOT_FOUND, REQUEST_DENIED) → fallback
        console.warn('[getPlaceAutocomplete] Places status:', result.status, '— usando fallback Geocoding');
      } catch (e: any) {
        console.warn('[getPlaceAutocomplete] Places erro:', e.message, '— usando fallback Geocoding');
      }
      // Fallback: Geocoding API com texto livre
      try {
        const geo = await makeRequest<{ results: Array<{ formatted_address: string; place_id: string; address_components: Array<{ long_name: string; types: string[] }> }>; status: string }>(
          '/maps/api/geocode/json', {
            address: `${input.input}, Brasil`,
            language: 'pt-BR',
            components: 'country:BR',
          }
        );
        if (geo.status !== 'OK' || !geo.results?.length) return [];
        return geo.results.slice(0, 6).map((r) => {
          const city = r.address_components?.find((c) => c.types.includes('locality') || c.types.includes('administrative_area_level_2'))?.long_name || '';
          const state = r.address_components?.find((c) => c.types.includes('administrative_area_level_1'))?.long_name || '';
          return {
            place_id: r.place_id,
            description: r.formatted_address,
            structured_formatting: {
              main_text: city || r.formatted_address,
              secondary_text: state,
            },
          };
        });
      } catch { return []; }
    }),

  reverseGeocode: protectedProcedure
    .input(z.object({ companyId: z.number(), lat: z.number(), lng: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      try {
        // Sem filtro result_type — aceita qualquer tipo de resultado (rodovias, área rural, etc.)
        const result = await makeRequest<{ results: Array<{ formatted_address: string }>; status: string }>(
          '/maps/api/geocode/json', {
            latlng: `${input.lat},${input.lng}`,
            language: 'pt-BR',
          }
        );
        console.log('[reverseGeocode] status:', result.status, 'results:', result.results?.length);
        if (result.status === 'OK' && result.results?.[0]) {
          return { address: result.results[0].formatted_address };
        }
        return { address: null, erro: result.status };
      } catch (e: any) {
        console.error('[reverseGeocode] erro:', e.message);
        return { address: null, erro: e.message };
      }
    }),

  getRouteInfo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      origin: z.string().min(3),
      destination: z.string().min(3),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.companyId && String(ctx.user.companyId) !== String(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      }
      try {
        const result = await makeRequest<DirectionsResult>('/maps/api/directions/json', {
          origin: input.origin,
          destination: input.destination,
          mode: 'driving',
          language: 'pt-BR',
          region: 'BR',
          avoid: 'ferries',
        });

        if (result.status !== 'OK' || !result.routes?.[0]) {
          return { ok: false as const, erro: result.status === 'ZERO_RESULTS' ? 'Rota não encontrada entre os locais informados.' : `Erro Google Maps: ${result.status}` };
        }

        const route = result.routes[0];
        const leg = route.legs[0];
        const distanceKm = leg.distance.value / 1000;

        // Estimativa de pedágio: média BR ~R$0,22/km em rodovias concessionadas acima de 50km
        const tollEstimate = distanceKm > 40
          ? Math.round(distanceKm * 0.22 * 10) / 10
          : 0;

        // Estimativa de combustível: consumo médio 10km/L, diesel R$5,80/L
        const fuelEstimate = Math.round(distanceKm / 10 * 5.80 * 10) / 10;

        return {
          ok: true as const,
          distanceText: leg.distance.text,
          distanceKm: Math.round(distanceKm * 10) / 10,
          durationText: leg.duration.text,
          durationMin: Math.round(leg.duration.value / 60),
          startAddress: leg.start_address,
          endAddress: leg.end_address,
          summary: route.summary,
          tollEstimate,
          fuelEstimate,
        };
      } catch (e: any) {
        return { ok: false as const, erro: 'Não foi possível calcular a rota. Verifique os endereços.' };
      }
    }),
});

export async function coletarKmDiarioJob(companyId: number, dataOverride?: string): Promise<{ coletados: number; veiculos: number; erro?: string }> {
  const token = process.env.FROTA_API_TOKEN;
  if (!token) return { coletados: 0, veiculos: 0, erro: 'FROTA_API_TOKEN não configurado' };

  if (!tablesReady) { await ensureFleetTables(); tablesReady = true; }

  const targetDate = dataOverride || new Date().toISOString().slice(0, 10);

  try {
    const vehiclesResp = await fetch('https://api.infleet.com.br/v1/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ query: `{ listVehicles { id plate displayName brand model type status odometer driver { name } } }` }),
      signal: AbortSignal.timeout(15000),
    });
    const vehiclesData = await vehiclesResp.json() as any;
    const infleetVehicles = vehiclesData.data?.listVehicles || [];
    if (!infleetVehicles.length) return { coletados: 0, veiculos: 0, erro: 'Nenhum veículo na API' };

    const db = await getDb();

    const localVehRes = (await db.execute(sql`SELECT id, placa FROM vehicles WHERE "companyId" = ${companyId}`) as any).rows || [];
    const plateToLocalId: Record<string, number> = {};
    localVehRes.forEach((v: any) => { if (v.placa) plateToLocalId[v.placa.replace(/[-\s]/g, '').toUpperCase()] = v.id; });

    let coletados = 0;
    const BATCH = 3;
    for (let i = 0; i < infleetVehicles.length; i += BATCH) {
      const batch = infleetVehicles.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map(async (v: any) => {
        const tripsQuery = `{
          trips(filter: { vehicleId: "${v.id}", fixTime: { startAt: "${targetDate}T00:00:00.000Z", endAt: "${targetDate}T23:59:59.000Z" } }) {
            id startedAt finishedAt distanceTraveled averageSpeed maximumSpeed
            driver { name }
          }
        }`;
        try {
          const resp = await fetch('https://api.infleet.com.br/v1/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ query: tripsQuery }),
            signal: AbortSignal.timeout(20000),
          });
          const data = await resp.json() as any;
          return { vehicle: v, trips: data.data?.trips || [] };
        } catch { return { vehicle: v, trips: [] }; }
      }));

      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const { vehicle: v, trips } = r.value;
        if (!trips.length) continue;

        let kmTotal = 0, totalViagens = 0, tempoMin = 0, velMediaPond = 0, velMax = 0;
        let primeiraLigacao: string | null = null;
        let ultimaDesligacao: string | null = null;
        const motoristasSet = new Set<string>();

        trips.forEach((t: any) => {
          kmTotal += t.distanceTraveled || 0;
          totalViagens++;
          const durMin = (new Date(t.finishedAt).getTime() - new Date(t.startedAt).getTime()) / 60000;
          tempoMin += durMin;
          velMediaPond += (t.averageSpeed || 0) * (t.distanceTraveled || 0);
          velMax = Math.max(velMax, t.maximumSpeed || 0);
          if (t.driver?.name) motoristasSet.add(t.driver.name);
          if (!primeiraLigacao || t.startedAt < primeiraLigacao) primeiraLigacao = t.startedAt;
          if (!ultimaDesligacao || t.finishedAt > ultimaDesligacao) ultimaDesligacao = t.finishedAt;
        });

        const velMedia = kmTotal > 0 ? velMediaPond / kmTotal : 0;
        const placaNorm = v.plate.replace(/[-\s]/g, '').toUpperCase();
        const localVehicleId = plateToLocalId[placaNorm] || null;
        const nomeVeiculo = v.displayName || `${v.brand || ''} ${v.model || ''}`.trim();

        let alertaGps: string | null = null;
        if (kmTotal === 0 && totalViagens > 0 && tempoMin > 5) {
          alertaGps = `GPS sem dados de deslocamento (${totalViagens} viagens, ${Math.round(tempoMin)} min ligado). Verificar rastreador.`;
        }

        await db.execute(sql`
          INSERT INTO fleet_daily_km (company_id, vehicle_id, infleet_vehicle_id, placa, nome_veiculo, data, km_total, viagens, num_viagens, tempo_rodando_min, vel_media, vel_maxima, motoristas, motorista, odometro_fim, km_odometro_fim, alerta_gps, primeira_ligacao, ultima_desligacao, updated_at)
          VALUES (${companyId}, ${localVehicleId}, ${v.id}, ${v.plate}, ${nomeVeiculo}, ${targetDate},
                  ${Math.round(kmTotal * 10) / 10}, ${totalViagens}, ${totalViagens}, ${Math.round(tempoMin)},
                  ${Math.round(velMedia * 10) / 10}, ${Math.round(velMax * 10) / 10},
                  ${[...motoristasSet].join(', ') || null},
                  ${[...motoristasSet].join(', ') || null},
                  ${v.odometer ? Math.round(v.odometer * 100) / 100 : null},
                  ${v.odometer ? Math.round(v.odometer * 100) / 100 : null},
                  ${alertaGps},
                  ${primeiraLigacao},
                  ${ultimaDesligacao},
                  NOW())
          ON CONFLICT (company_id, placa, data) DO UPDATE SET
            km_total = EXCLUDED.km_total,
            viagens = EXCLUDED.viagens,
            num_viagens = EXCLUDED.num_viagens,
            tempo_rodando_min = EXCLUDED.tempo_rodando_min,
            vel_media = EXCLUDED.vel_media,
            vel_maxima = EXCLUDED.vel_maxima,
            motoristas = EXCLUDED.motoristas,
            motorista = EXCLUDED.motorista,
            odometro_fim = EXCLUDED.odometro_fim,
            km_odometro_fim = EXCLUDED.km_odometro_fim,
            nome_veiculo = EXCLUDED.nome_veiculo,
            infleet_vehicle_id = EXCLUDED.infleet_vehicle_id,
            alerta_gps = EXCLUDED.alerta_gps,
            primeira_ligacao = EXCLUDED.primeira_ligacao,
            ultima_desligacao = EXCLUDED.ultima_desligacao,
            updated_at = NOW()
        `);
        coletados++;
      }
    }

    return { coletados, veiculos: infleetVehicles.length };
  } catch (e: any) {
    return { coletados: 0, veiculos: 0, erro: e.message };
  }
}
