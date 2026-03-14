import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  obras, fornecedores, almoxarifadoItens,
  masControleConfig, migrationLogs,
} from "../../drizzle/schema";

// ── Constantes da API do Mas Controle ──────────────────────────────────────
const MC_BASE_URLS = [
  "https://api.maiscontroleerp.com.br/v1",
  "https://app.maiscontroleerp.com.br/api/v1",
  "https://maiscontroleerp.com.br/api/v1",
];
const MC_TEST_PATHS = ["/obras", "/empresa", "/usuarios", "/dashboard"];
const REQ_TIMEOUT  = 8000;

function makeBasicAuth(login: string, token: string) {
  return `Basic ${Buffer.from(`${login}:${token}`).toString("base64")}`;
}

async function tryMCRequest(login: string, token: string, path: string): Promise<any> {
  const auth = makeBasicAuth(login, token);
  for (const base of MC_BASE_URLS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT);
      const res = await fetch(`${base}${path}`, {
        headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, base, data };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "Credenciais inválidas (401/403)", base };
      }
    } catch { /* try next base */ }
  }
  return { ok: false, error: "API inacessível — use importação via CSV" };
}

async function logMigration(db: any, params: {
  companyId: number; tipoDado: string; totalEncontrado: number;
  totalImportado: number; totalDuplicado: number; totalErro: number;
  detalhes: any[]; userId?: number; userName?: string; via?: string;
}) {
  await db.insert(migrationLogs).values({
    companyId:        params.companyId,
    tipoDado:         params.tipoDado,
    totalEncontrado:  params.totalEncontrado,
    totalImportado:   params.totalImportado,
    totalDuplicado:   params.totalDuplicado,
    totalErro:        params.totalErro,
    detalhes:         params.detalhes,
    executadoPorId:   params.userId ?? null,
    executadoPorNome: params.userName ?? null,
    via:              params.via ?? "csv",
  });
}

// ────────────────────────────────────────────────────────────────────────────

export const masControleRouter = router({

  // ── Configuração ───────────────────────────────────────────────────────────

  carregarConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [cfg] = await db.select({
        id: masControleConfig.id,
        loginEmail: masControleConfig.loginEmail,
        apiOk: masControleConfig.apiOk,
        migratedAt: masControleConfig.migratedAt,
      }).from(masControleConfig).where(eq(masControleConfig.companyId, input.companyId));
      return cfg ?? null;
    }),

  salvarConfig: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      loginEmail: z.string(),
      token:      z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [existing] = await db.select({ id: masControleConfig.id })
        .from(masControleConfig).where(eq(masControleConfig.companyId, input.companyId));
      if (existing) {
        await db.update(masControleConfig).set({
          loginEmail: input.loginEmail, token: input.token,
          atualizadoEm: new Date().toISOString(),
        }).where(eq(masControleConfig.companyId, input.companyId));
      } else {
        await db.insert(masControleConfig).values({
          companyId: input.companyId, loginEmail: input.loginEmail, token: input.token,
        });
      }
      return { success: true };
    }),

  // ── Teste de conexão com a API ─────────────────────────────────────────────

  testarConexao: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      loginEmail: z.string(),
      token:      z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      let resultado = { ok: false, base: "", error: "", apiUrl: "" };
      for (const path of MC_TEST_PATHS) {
        const r = await tryMCRequest(input.loginEmail, input.token, path);
        if (r.ok) { resultado = { ok: true, base: r.base, error: "", apiUrl: r.base + path }; break; }
        if (r.error?.includes("Credenciais")) { resultado = { ok: false, base: r.base ?? "", error: r.error, apiUrl: "" }; break; }
      }

      // Salva resultado do teste
      const [existing] = await db.select({ id: masControleConfig.id })
        .from(masControleConfig).where(eq(masControleConfig.companyId, input.companyId));
      if (existing) {
        await db.update(masControleConfig)
          .set({ apiOk: resultado.ok, loginEmail: input.loginEmail, token: input.token, atualizadoEm: new Date().toISOString() })
          .where(eq(masControleConfig.companyId, input.companyId));
      } else {
        await db.insert(masControleConfig).values({
          companyId: input.companyId, loginEmail: input.loginEmail, token: input.token, apiOk: resultado.ok,
        });
      }

      return resultado;
    }),

  // ── Importação via API ─────────────────────────────────────────────────────

  importarObrasAPI: protectedProcedure
    .input(z.object({ companyId: z.number(), loginEmail: z.string(), token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const erros: string[] = [];
      let importados = 0, duplicados = 0;

      // Tenta buscar obras via API
      const res = await tryMCRequest(input.loginEmail, input.token, "/obras");
      if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: res.error || "API inacessível" });

      const rawObras: any[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? res.data?.obras ?? []);
      const total = rawObras.length;

      for (const o of rawObras) {
        try {
          const nome = o.nome || o.name || o.descricao || "";
          if (!nome) { erros.push("Registro sem nome — ignorado"); continue; }
          // Verifica duplicata por nome
          const [dup] = await db.select({ id: obras.id })
            .from(obras).where(and(eq(obras.companyId, input.companyId), eq(obras.nome, nome)));
          if (dup) { duplicados++; continue; }
          await db.insert(obras).values({
            companyId: input.companyId,
            nome,
            codigo:         o.codigo || o.code || null,
            cliente:        o.cliente || o.client || null,
            endereco:       o.endereco || o.address || null,
            status:         o.status || "Planejamento",
            dataInicio:     o.data_inicio || o.dataInicio || o.start_date || null,
            dataPrevisaoFim: o.data_previsao_fim || o.dataPrevisaoFim || o.end_date || null,
            observacoes:    `Importado do Mas Controle em ${new Date().toLocaleDateString("pt-BR")}. ID original: ${o.id ?? "—"}`,
          });
          importados++;
        } catch (e: any) {
          erros.push(`Erro em "${o.nome ?? "?"}": ${e.message}`);
        }
      }

      await logMigration(db, {
        companyId: input.companyId, tipoDado: "obras", totalEncontrado: total,
        totalImportado: importados, totalDuplicado: duplicados, totalErro: erros.length,
        detalhes: erros, userId: ctx.user?.id, userName: ctx.user?.name, via: "api",
      });

      return { total, importados, duplicados, erros: erros.length, detalhesErros: erros };
    }),

  importarFornecedoresAPI: protectedProcedure
    .input(z.object({ companyId: z.number(), loginEmail: z.string(), token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const erros: string[] = [];
      let importados = 0, duplicados = 0;

      const res = await tryMCRequest(input.loginEmail, input.token, "/fornecedores");
      if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: res.error || "API inacessível" });

      const rawForn: any[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? res.data?.fornecedores ?? []);
      const total = rawForn.length;

      for (const f of rawForn) {
        try {
          const razao = f.razao_social || f.razaoSocial || f.nome || f.name || "";
          if (!razao) { erros.push("Registro sem razão social — ignorado"); continue; }
          const cnpj = (f.cnpj || "").replace(/\D/g, "");

          // Verifica duplicata por CNPJ (se existir) ou razão social
          if (cnpj) {
            const [dup] = await db.select({ id: fornecedores.id })
              .from(fornecedores).where(and(eq(fornecedores.companyId, input.companyId), eq(fornecedores.cnpj, cnpj)));
            if (dup) { duplicados++; continue; }
          }

          await db.insert(fornecedores).values({
            companyId:       input.companyId,
            razaoSocial:     razao,
            nomeFantasia:    f.nome_fantasia || f.nomeFantasia || null,
            cnpj:            cnpj || null,
            email:           f.email || null,
            telefone:        f.telefone || f.phone || null,
            observacoes:     `Importado do Mas Controle em ${new Date().toLocaleDateString("pt-BR")}`,
          });
          importados++;
          // Rate limiting
          await new Promise(r => setTimeout(r, 100));
        } catch (e: any) {
          erros.push(`Erro em "${f.razao_social ?? "?"}": ${e.message}`);
        }
      }

      await logMigration(db, {
        companyId: input.companyId, tipoDado: "fornecedores", totalEncontrado: total,
        totalImportado: importados, totalDuplicado: duplicados, totalErro: erros.length,
        detalhes: erros, userId: ctx.user?.id, userName: ctx.user?.name, via: "api",
      });

      return { total, importados, duplicados, erros: erros.length, detalhesErros: erros };
    }),

  importarInsumosAPI: protectedProcedure
    .input(z.object({ companyId: z.number(), loginEmail: z.string(), token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const erros: string[] = [];
      let importados = 0, duplicados = 0;

      const res = await tryMCRequest(input.loginEmail, input.token, "/insumos");
      if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: res.error || "API inacessível" });

      const rawIns: any[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? res.data?.insumos ?? res.data?.materiais ?? []);
      const total = rawIns.length;

      for (const ins of rawIns) {
        try {
          const nome = ins.descricao || ins.nome || ins.name || "";
          if (!nome) { erros.push("Registro sem nome — ignorado"); continue; }

          const [dup] = await db.select({ id: almoxarifadoItens.id })
            .from(almoxarifadoItens).where(and(
              eq(almoxarifadoItens.companyId, input.companyId),
              eq(almoxarifadoItens.nome, nome),
            ));
          if (dup) { duplicados++; continue; }

          await db.insert(almoxarifadoItens).values({
            companyId:     input.companyId,
            nome,
            unidade:       ins.unidade || ins.unit || "un",
            categoria:     ins.grupo || ins.categoria || ins.categoria || null,
            codigoInterno: ins.codigo || ins.code || null,
            observacoes:   `Importado do Mas Controle em ${new Date().toLocaleDateString("pt-BR")}`,
          });
          importados++;
        } catch (e: any) {
          erros.push(`Erro em "${ins.descricao ?? "?"}": ${e.message}`);
        }
      }

      await logMigration(db, {
        companyId: input.companyId, tipoDado: "insumos", totalEncontrado: total,
        totalImportado: importados, totalDuplicado: duplicados, totalErro: erros.length,
        detalhes: erros, userId: ctx.user?.id, userName: ctx.user?.name, via: "api",
      });

      return { total, importados, duplicados, erros: erros.length, detalhesErros: erros };
    }),

  // ── Importação via CSV ─────────────────────────────────────────────────────

  importarObrasCSV: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      rows: z.array(z.record(z.string())),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const erros: string[] = [];
      let importados = 0, duplicados = 0;
      const total = input.rows.length;

      // Mapeamento de colunas (aceita variações de nome)
      function col(row: any, ...candidates: string[]) {
        for (const c of candidates) {
          const v = row[c] ?? row[c.toLowerCase()] ?? row[c.toUpperCase()];
          if (v !== undefined && v !== "") return String(v).trim();
        }
        return "";
      }

      for (const row of input.rows) {
        try {
          const nome = col(row, "Nome da Obra", "Nome", "nome", "OBRA", "Obra", "Descrição");
          if (!nome) { erros.push(`Linha ignorada — sem nome: ${JSON.stringify(row)}`); continue; }

          const [dup] = await db.select({ id: obras.id })
            .from(obras).where(and(eq(obras.companyId, input.companyId), eq(obras.nome, nome)));
          if (dup) { duplicados++; continue; }

          await db.insert(obras).values({
            companyId:       input.companyId,
            nome,
            codigo:          col(row, "Código", "Codigo", "codigo", "Cód.", "code") || null,
            cliente:         col(row, "Cliente", "cliente", "CLIENTE") || null,
            endereco:        col(row, "Endereço", "Endereco", "endereco", "Endereço Completo") || null,
            cidade:          col(row, "Cidade", "cidade") || null,
            estado:          col(row, "Estado", "UF", "estado") || null,
            status:          col(row, "Status", "status", "Situação", "Situacao") || "Planejamento",
            dataInicio:      col(row, "Data de Início", "Data Início", "data_inicio", "Inicio", "DataInicio") || null,
            dataPrevisaoFim: col(row, "Previsão de Término", "Data Fim", "data_previsao_fim", "Término", "Termino") || null,
            valorContrato:   col(row, "Valor do Contrato", "Valor", "valor") || null,
            observacoes:     `Importado do Mas Controle via CSV em ${new Date().toLocaleDateString("pt-BR")}`,
          });
          importados++;
        } catch (e: any) {
          erros.push(`Erro na linha: ${e.message}`);
        }
      }

      await logMigration(db, {
        companyId: input.companyId, tipoDado: "obras", totalEncontrado: total,
        totalImportado: importados, totalDuplicado: duplicados, totalErro: erros.length,
        detalhes: erros, userId: ctx.user?.id, userName: ctx.user?.name, via: "csv",
      });

      return { total, importados, duplicados, erros: erros.length, detalhesErros: erros };
    }),

  importarFornecedoresCSV: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      rows: z.array(z.record(z.string())),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const erros: string[] = [];
      let importados = 0, duplicados = 0;
      const total = input.rows.length;

      function col(row: any, ...candidates: string[]) {
        for (const c of candidates) {
          const v = row[c] ?? row[c.toLowerCase()] ?? row[c.toUpperCase()];
          if (v !== undefined && v !== "") return String(v).trim();
        }
        return "";
      }

      for (const row of input.rows) {
        try {
          const razao = col(row, "Razão Social", "Razao Social", "razao_social", "Nome", "FORNECEDOR", "Fornecedor");
          if (!razao) { erros.push("Linha ignorada — sem razão social"); continue; }

          const cnpjRaw = col(row, "CNPJ", "cnpj");
          const cnpj = cnpjRaw.replace(/\D/g, "").slice(0, 14) || null;

          if (cnpj) {
            const [dup] = await db.select({ id: fornecedores.id })
              .from(fornecedores).where(and(eq(fornecedores.companyId, input.companyId), eq(fornecedores.cnpj, cnpj)));
            if (dup) { duplicados++; continue; }
          } else {
            const [dup] = await db.select({ id: fornecedores.id })
              .from(fornecedores).where(and(eq(fornecedores.companyId, input.companyId), eq(fornecedores.razaoSocial, razao)));
            if (dup) { duplicados++; continue; }
          }

          await db.insert(fornecedores).values({
            companyId:       input.companyId,
            razaoSocial:     razao,
            nomeFantasia:    col(row, "Nome Fantasia", "nomeFantasia", "nome_fantasia", "Fantasia") || null,
            cnpj,
            email:           col(row, "E-mail", "Email", "email", "E-Mail") || null,
            telefone:        col(row, "Telefone", "Fone", "telefone", "Tel", "Celular") || null,
            cidade:          col(row, "Cidade", "cidade") || null,
            estado:          col(row, "Estado", "UF", "estado") || null,
            categorias:      [],
            observacoes:     `Importado do Mas Controle via CSV em ${new Date().toLocaleDateString("pt-BR")}`,
          });
          importados++;
        } catch (e: any) {
          erros.push(`Erro: ${e.message}`);
        }
      }

      await logMigration(db, {
        companyId: input.companyId, tipoDado: "fornecedores", totalEncontrado: total,
        totalImportado: importados, totalDuplicado: duplicados, totalErro: erros.length,
        detalhes: erros, userId: ctx.user?.id, userName: ctx.user?.name, via: "csv",
      });

      return { total, importados, duplicados, erros: erros.length, detalhesErros: erros };
    }),

  importarInsumosCSV: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      rows: z.array(z.record(z.string())),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const erros: string[] = [];
      let importados = 0, duplicados = 0;
      const total = input.rows.length;

      function col(row: any, ...candidates: string[]) {
        for (const c of candidates) {
          const v = row[c] ?? row[c.toLowerCase()] ?? row[c.toUpperCase()];
          if (v !== undefined && v !== "") return String(v).trim();
        }
        return "";
      }

      for (const row of input.rows) {
        try {
          const nome = col(row, "Descrição", "Descricao", "Nome", "nome", "INSUMO", "Insumo", "Material", "descricao");
          if (!nome) { erros.push("Linha ignorada — sem nome/descrição"); continue; }

          const [dup] = await db.select({ id: almoxarifadoItens.id })
            .from(almoxarifadoItens).where(and(
              eq(almoxarifadoItens.companyId, input.companyId),
              eq(almoxarifadoItens.nome, nome),
            ));
          if (dup) { duplicados++; continue; }

          await db.insert(almoxarifadoItens).values({
            companyId:     input.companyId,
            nome,
            unidade:       col(row, "Unidade", "Un", "unidade", "UN") || "un",
            categoria:     col(row, "Grupo", "Categoria", "grupo", "categoria", "Tipo") || null,
            codigoInterno: col(row, "Código", "Codigo", "codigo", "Cód.", "Cod") || null,
            observacoes:   `Importado do Mas Controle via CSV em ${new Date().toLocaleDateString("pt-BR")}`,
          });
          importados++;
        } catch (e: any) {
          erros.push(`Erro: ${e.message}`);
        }
      }

      await logMigration(db, {
        companyId: input.companyId, tipoDado: "insumos", totalEncontrado: total,
        totalImportado: importados, totalDuplicado: duplicados, totalErro: erros.length,
        detalhes: erros, userId: ctx.user?.id, userName: ctx.user?.name, via: "csv",
      });

      return { total, importados, duplicados, erros: erros.length, detalhesErros: erros };
    }),

  // ── Histórico de migrações ─────────────────────────────────────────────────

  listarLogs: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(migrationLogs)
        .where(eq(migrationLogs.companyId, input.companyId))
        .orderBy(desc(migrationLogs.executadoEm))
        .limit(100);
    }),

  // ── Marcar migração como concluída ─────────────────────────────────────────

  marcarMigracaoConcluida: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(masControleConfig)
        .set({ migratedAt: new Date().toISOString(), atualizadoEm: new Date().toISOString() })
        .where(eq(masControleConfig.companyId, input.companyId));
      return { success: true };
    }),
});
