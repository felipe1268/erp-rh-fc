import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { atestados, accidents, employees, obras, employeeSiteHistory, obraFuncionarios, cipaMembers } from "../../drizzle/schema";
import { and, eq, gte, lte, isNull, ne, sql, desc, inArray } from "drizzle-orm";
import { companyFilter } from "../companyHelper";

// Salário pode estar em formato BR ("2.774,20") ou decimal ("6200.00") — parseFloat direto retornaria 1.5 para "1.500,00".
function parseBRLSalario(v: string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  if (s.includes(",")) {
    const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const inputSchema = z.object({
  companyId: z.number(),
  companyIds: z.array(z.number()).optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
});

function defaultRange(input: { dataInicio?: string; dataFim?: string }) {
  const fim = input.dataFim ? new Date(input.dataFim + "T00:00:00") : new Date();
  const inicio = input.dataInicio
    ? new Date(input.dataInicio + "T00:00:00")
    : (() => {
        const d = new Date(fim);
        d.setMonth(d.getMonth() - 11);
        d.setDate(1);
        return d;
      })();
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  return { dataInicio: toISO(inicio), dataFim: toISO(fim) };
}

export const sstAnalyticsRouter = router({
  atestadosAcidentes: protectedProcedure
    .input(inputSchema)
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const { dataInicio, dataFim } = defaultRange(input);

      const atestadosBase = and(
        companyFilter(atestados.companyId, input),
        isNull(atestados.deletedAt),
        gte(atestados.dataEmissao, dataInicio),
        lte(atestados.dataEmissao, dataFim),
      );

      const acidentesBase = and(
        companyFilter(accidents.companyId, input),
        isNull(accidents.deletedAt),
        gte(accidents.dataAcidente, dataInicio),
        lte(accidents.dataAcidente, dataFim),
      );

      // ---- ATESTADOS ----
      const atRows = await db
        .select({
          id: atestados.id,
          tipo: atestados.tipo,
          dataEmissao: atestados.dataEmissao,
          diasAfastamento: atestados.diasAfastamento,
          horasAfastamento: atestados.horasAfastamento,
          afastamentoTipo: atestados.afastamentoTipo,
          afastamentoINSS: atestados.afastamentoINSS,
          dataRetorno: atestados.dataRetorno,
          cid: atestados.cid,
          motivo: atestados.motivo,
          employeeId: atestados.employeeId,
          employeeNome: employees.nomeCompleto,
          employeeMatricula: employees.matricula,
          employeeCodigoInterno: employees.codigoInterno,
          employeeFuncao: employees.funcao,
          employeeCargo: employees.cargo,
          employeeFotoUrl: employees.fotoUrl,
          employeeDataAdmissao: employees.dataAdmissao,
          employeeDataNascimento: employees.dataNascimento,
        })
        .from(atestados)
        .leftJoin(employees, eq(atestados.employeeId, employees.id))
        .where(atestadosBase)
        .orderBy(desc(atestados.dataEmissao));

      const totalAtestados = atRows.length;
      const totalDiasAfastamento = atRows.reduce((s, r) => s + (r.diasAfastamento || 0), 0);
      const totalHorasAfastamento = atRows.reduce((s, r) => s + (r.horasAfastamento || 0), 0);
      const colaboradoresAfetadosAt = new Set(atRows.map((r) => r.employeeId)).size;
      const totalAfastamentosINSS = atRows.filter((r) => (r.afastamentoINSS ?? 0) > 0).length;
      const mediaDiasAtestado = totalAtestados > 0 ? totalDiasAfastamento / totalAtestados : 0;

      // por tipo
      const porTipoMap = new Map<string, { tipo: string; quantidade: number; dias: number }>();
      for (const r of atRows) {
        const k = (r.tipo || "Não informado").trim() || "Não informado";
        const cur = porTipoMap.get(k) ?? { tipo: k, quantidade: 0, dias: 0 };
        cur.quantidade += 1;
        cur.dias += r.diasAfastamento || 0;
        porTipoMap.set(k, cur);
      }
      const porTipo = Array.from(porTipoMap.values()).sort((a, b) => b.quantidade - a.quantidade);

      // por motivo
      const porMotivoMap = new Map<string, { motivo: string; quantidade: number; dias: number }>();
      for (const r of atRows) {
        const k = (r.motivo || "").trim() || "Não informado";
        const cur = porMotivoMap.get(k) ?? { motivo: k, quantidade: 0, dias: 0 };
        cur.quantidade += 1;
        cur.dias += r.diasAfastamento || 0;
        porMotivoMap.set(k, cur);
      }
      const porMotivo = Array.from(porMotivoMap.values())
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10);

      // top CIDs
      const cidMap = new Map<string, { cid: string; quantidade: number; dias: number }>();
      for (const r of atRows) {
        const k = (r.cid || "").trim().toUpperCase();
        if (!k) continue;
        const cur = cidMap.get(k) ?? { cid: k, quantidade: 0, dias: 0 };
        cur.quantidade += 1;
        cur.dias += r.diasAfastamento || 0;
        cidMap.set(k, cur);
      }
      const topCIDs = Array.from(cidMap.values())
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10);
      const atestadosComCID = atRows.filter((r) => (r.cid || "").trim().length > 0).length;
      const atestadosSemCID = totalAtestados - atestadosComCID;

      // top funcionários (atestados)
      // Rev. 1979 — type estendido: + dataAdmissao/dataNascimento (do SELECT) + obraAtual/cipa* (preenchidos pós-slice via enrich).
      const funcMap = new Map<
        number,
        { employeeId: number; nome: string; matricula: string | null; codigoInterno: string | null; funcao: string | null; fotoUrl: string | null; dataAdmissao: string | null; dataNascimento: string | null; obraAtual: string | null; cipaAtivo: boolean; cipaEstabilidade: boolean; cipaFimEstabilidade: string | null; quantidade: number; dias: number }
      >();
      for (const r of atRows) {
        const cur = funcMap.get(r.employeeId) ?? {
          employeeId: r.employeeId,
          nome: r.employeeNome || `Funcionário #${r.employeeId}`,
          matricula: r.employeeMatricula || null,
          codigoInterno: r.employeeCodigoInterno || null,
          funcao: r.employeeFuncao || r.employeeCargo || null,
          fotoUrl: r.employeeFotoUrl || null,
          dataAdmissao: r.employeeDataAdmissao || null,
          dataNascimento: r.employeeDataNascimento || null,
          obraAtual: null,
          cipaAtivo: false,
          cipaEstabilidade: false,
          cipaFimEstabilidade: null,
          quantidade: 0,
          dias: 0,
        };
        cur.quantidade += 1;
        cur.dias += r.diasAfastamento || 0;
        funcMap.set(r.employeeId, cur);
      }
      const topFuncionariosAtestados = Array.from(funcMap.values())
        .sort((a, b) => b.quantidade - a.quantidade || b.dias - a.dias)
        .slice(0, 10);

      // ---- ACIDENTES ----
      const acRows = await db
        .select({
          id: accidents.id,
          dataAcidente: accidents.dataAcidente,
          horaAcidente: accidents.horaAcidente,
          tipoAcidente: accidents.tipoAcidente,
          gravidade: accidents.gravidade,
          localAcidente: accidents.localAcidente,
          parteCorpoAtingida: accidents.parteCorpoAtingida,
          catNumero: accidents.catNumero,
          catData: accidents.catData,
          houveCAT: accidents.houveCAT,
          diasAfastamento: accidents.diasAfastamento,
          descricao: accidents.descricao,
          acaoCorretiva: accidents.acaoCorretiva,
          statusAcaoCorretiva: accidents.statusAcaoCorretiva,
          prazoAcaoCorretiva: accidents.prazoAcaoCorretiva,
          obraId: accidents.obraId,
          obraNome: obras.nome,
          employeeId: accidents.employeeId,
          employeeNome: employees.nomeCompleto,
          employeeMatricula: employees.matricula,
          employeeCodigoInterno: employees.codigoInterno,
          employeeFuncao: employees.funcao,
          employeeCargo: employees.cargo,
          employeeFotoUrl: employees.fotoUrl,
          employeeDataAdmissao: employees.dataAdmissao,
          employeeDataNascimento: employees.dataNascimento,
        })
        .from(accidents)
        .leftJoin(employees, eq(accidents.employeeId, employees.id))
        .leftJoin(obras, eq(accidents.obraId, obras.id))
        .where(acidentesBase)
        .orderBy(desc(accidents.dataAcidente));

      const totalAcidentes = acRows.length;
      const totalDiasAfastamentoAcid = acRows.reduce((s, r) => s + (r.diasAfastamento || 0), 0);
      const colaboradoresAfetadosAc = new Set(acRows.map((r) => r.employeeId)).size;
      const acidentesComCAT = acRows.filter((r) => (r.houveCAT ?? 0) > 0 || (r.catNumero || "").trim().length > 0).length;
      const acidentesSemCAT = totalAcidentes - acidentesComCAT;
      const acidentesComAfastamento = acRows.filter((r) => (r.diasAfastamento || 0) > 0).length;
      const acidentesSemAfastamento = totalAcidentes - acidentesComAfastamento;

      // ---- Pirâmide de Bird (referência clássica de SST) ----
      // Graves+: Grave, Gravíssimo, Fatal | Moderados: Moderado, Leve c/ afastamento
      // Leves: Leve sem afastamento, Primeiros Socorros | Quase: Quase-acidente
      const isGraveBird = (g: string) => /grav|fatal/i.test(g);
      const isModeradoBird = (g: string) => /moderad|leve com afast/i.test(g);
      const isQuaseBird = (g: string) => /quase/i.test(g);
      const piramideBird = {
        graves: acRows.filter((r) => isGraveBird(r.gravidade || "")).length,
        moderados: acRows.filter((r) => isModeradoBird(r.gravidade || "")).length,
        leves: acRows.filter((r) => !isGraveBird(r.gravidade || "") && !isModeradoBird(r.gravidade || "") && !isQuaseBird(r.gravidade || "")).length,
        quaseAcidentes: acRows.filter((r) => isQuaseBird(r.gravidade || "")).length,
      };

      // ---- Heatmap dia/hora ----
      const weekdayName = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const heatmapMap = new Map<string, { dia: string; diaIdx: number; hora: number; qtd: number }>();
      for (const r of acRows) {
        const d = new Date(r.dataAcidente + "T00:00:00");
        const diaIdx = d.getDay();
        const dia = weekdayName[diaIdx];
        const hh = r.horaAcidente ? parseInt((r.horaAcidente).split(":")[0] || "0", 10) : 0;
        const k = `${diaIdx}_${hh}`;
        const cur = heatmapMap.get(k) ?? { dia, diaIdx, hora: hh, qtd: 0 };
        cur.qtd += 1;
        heatmapMap.set(k, cur);
      }
      const heatmapDiaHora = Array.from(heatmapMap.values()).sort((a, b) => a.diaIdx - b.diaIdx || a.hora - b.hora);

      // ---- Acidentes por dia da semana ----
      const dowAcMap = new Map<number, { diaIdx: number; dia: string; qtd: number }>();
      for (let i = 0; i < 7; i++) dowAcMap.set(i, { diaIdx: i, dia: weekdayName[i], qtd: 0 });
      for (const r of acRows) {
        const d = new Date(r.dataAcidente + "T00:00:00");
        const cur = dowAcMap.get(d.getDay())!;
        cur.qtd += 1;
      }
      const acidentesPorDiaSemana = Array.from(dowAcMap.values());

      // ---- Acidentes por obra + dias sem acidente ----
      const obraMap = new Map<string, { obraId: number | null; obraNome: string; qtd: number; dias: number; ultimaData: string | null }>();
      for (const r of acRows) {
        const k = String(r.obraId ?? "0");
        const cur = obraMap.get(k) ?? { obraId: r.obraId ?? null, obraNome: r.obraNome || "Sem obra", qtd: 0, dias: 0, ultimaData: null };
        cur.qtd += 1;
        cur.dias += r.diasAfastamento || 0;
        if (!cur.ultimaData || r.dataAcidente > cur.ultimaData) cur.ultimaData = r.dataAcidente;
        obraMap.set(k, cur);
      }
      const hoje = new Date();
      const rankingObras = Array.from(obraMap.values())
        .map((o) => ({
          ...o,
          diasSemAcidente: o.ultimaData
            ? Math.max(0, Math.floor((hoje.getTime() - new Date(o.ultimaData + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24)))
            : null,
        }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 15);

      // Dias sem acidente — incluir TODAS as obras ativas (mesmo sem registro)
      const obrasAtivas = await db
        .select({ id: obras.id, nome: obras.nome, status: obras.status, dataInicio: obras.dataInicio, createdAt: obras.createdAt })
        .from(obras)
        .where(and(companyFilter(obras.companyId, input), isNull(obras.deletedAt)));
      // Rev. 2947 — "Dias sem Acidente — por Obra" só lista obras ativas/em andamento.
      // Exclui as terminais (concluída/paralisada/cancelada), tolerante a acento,
      // underscore/espaço e caixa (alinhado ao padrão canônico de obra ativa do db.ts).
      const STATUS_OBRA_TERMINAL = new Set(["concluida", "paralisada", "cancelada"]);
      const obraStatusAtiva = (s: string | null | undefined): boolean => {
        const norm = (s ?? "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[_\s]+/g, " ")
          .trim();
        return !STATUS_OBRA_TERMINAL.has(norm);
      };
      const obraAtivaIds = new Set<number>();
      for (const o of obrasAtivas) if (obraStatusAtiva(o.status)) obraAtivaIds.add(o.id);
      const obraNomeById = new Map<number, string>();
      const obraInicioById = new Map<number, string | null>();
      for (const o of obrasAtivas) {
        obraNomeById.set(o.id, o.nome);
        // dataInicio (preferida) ou createdAt como fallback. Normaliza para YYYY-MM-DD.
        const ref = (o.dataInicio || (o.createdAt ? String(o.createdAt).slice(0, 10) : null));
        obraInicioById.set(o.id, ref);
      }

      // ==== Atestados & Afastamentos por Obra ====
      // Atestados não têm obraId direto. Resolução via employee_site_history:
      // para cada atestado, buscar a alocação cuja janela [dataInicio, dataFim?]
      // cobre a dataEmissao. Fallback: alocação mais recente até a data.
      const empIdsAt = Array.from(new Set(atRows.map((r) => r.employeeId))).filter((x): x is number => typeof x === "number");
      const eshRows = empIdsAt.length > 0
        ? await db
            .select({
              employeeId: employeeSiteHistory.employeeId,
              obraId: employeeSiteHistory.obraId,
              dataInicio: employeeSiteHistory.dataInicio,
              dataFim: employeeSiteHistory.dataFim,
            })
            .from(employeeSiteHistory)
            .where(and(
              companyFilter(employeeSiteHistory.companyId, input),
              inArray(employeeSiteHistory.employeeId, empIdsAt),
              // gestor_obra é designação de responsável, não alocação — não atribui atestado à obra
              ne(employeeSiteHistory.tipo, 'gestor_obra'),
            ))
        : [];
      const eshByEmp = new Map<number, { obraId: number; dataInicio: string; dataFim: string | null }[]>();
      for (const r of eshRows) {
        const arr = eshByEmp.get(r.employeeId) ?? [];
        arr.push({ obraId: r.obraId, dataInicio: r.dataInicio, dataFim: r.dataFim ?? null });
        eshByEmp.set(r.employeeId, arr);
      }
      // ordena por dataInicio desc para varredura rápida
      for (const [, arr] of eshByEmp) arr.sort((a, b) => (a.dataInicio < b.dataInicio ? 1 : -1));

      const resolveObraDoAtestado = (employeeId: number, dataEmissao: string): number | null => {
        const arr = eshByEmp.get(employeeId);
        if (!arr || arr.length === 0) return null;
        // 1) janela cobre a data
        for (const h of arr) {
          if (h.dataInicio <= dataEmissao && (!h.dataFim || h.dataFim >= dataEmissao)) return h.obraId;
        }
        // 2) última alocação iniciada antes da data
        for (const h of arr) {
          if (h.dataInicio <= dataEmissao) return h.obraId;
        }
        return null;
      };

      type ObraAfRow = {
        obraId: number | null;
        obraNome: string;
        qtdAtestados: number;
        diasAfastamento: number;
        horasAfastamento: number;
        afastamentosINSS: number;
        colaboradores: Set<number>;
      };
      const obraAfMap = new Map<string, ObraAfRow>();
      const ensureRow = (oid: number | null, oname: string): ObraAfRow => {
        const k = String(oid ?? "0");
        const cur = obraAfMap.get(k) ?? {
          obraId: oid, obraNome: oname,
          qtdAtestados: 0, diasAfastamento: 0, horasAfastamento: 0, afastamentosINSS: 0,
          colaboradores: new Set<number>(),
        };
        obraAfMap.set(k, cur);
        return cur;
      };
      for (const r of atRows) {
        const oid = resolveObraDoAtestado(r.employeeId, r.dataEmissao);
        const oname = oid != null ? (obraNomeById.get(oid) || `Obra #${oid}`) : "Sem obra/alocação";
        const row = ensureRow(oid, oname);
        row.qtdAtestados += 1;
        row.diasAfastamento += r.diasAfastamento || 0;
        row.horasAfastamento += r.horasAfastamento || 0;
        if ((r.afastamentoINSS ?? 0) > 0) row.afastamentosINSS += 1;
        row.colaboradores.add(r.employeeId);
      }
      // garante presença de TODAS as obras ativas (mesmo zeradas)
      for (const o of obrasAtivas) ensureRow(o.id, o.nome);

      const atestadosPorObra = Array.from(obraAfMap.values())
        .map((o) => ({
          obraId: o.obraId,
          obraNome: o.obraNome,
          qtdAtestados: o.qtdAtestados,
          diasAfastamento: o.diasAfastamento,
          horasAfastamento: o.horasAfastamento,
          afastamentosINSS: o.afastamentosINSS,
          colaboradoresAfetados: o.colaboradores.size,
        }))
        .sort((a, b) => b.diasAfastamento - a.diasAfastamento || b.qtdAtestados - a.qtdAtestados);

      // Lista TODAS as obras ativas. Inclui também obras que aparecem em acRows
      // mas que não estão na lista de obras ativas (defensivo, evita
      // inconsistência com o "Ranking de Obras com Mais Acidentes" abaixo).
      const obrasParaListagem = new Map<number, string>();
      for (const o of obrasAtivas) if (obraAtivaIds.has(o.id)) obrasParaListagem.set(o.id, o.nome);
      for (const r of acRows) {
        if (r.obraId != null && obraAtivaIds.has(r.obraId) && !obrasParaListagem.has(r.obraId)) {
          obrasParaListagem.set(r.obraId, r.obraNome || `Obra #${r.obraId}`);
        }
      }
      const diasSemAcidente = Array.from(obrasParaListagem.entries())
        .map(([id, nome]) => {
          const reg = obraMap.get(String(id));
          if (reg?.ultimaData) {
            return {
              obraId: id, obraNome: nome, ultimaData: reg.ultimaData,
              dias: Math.max(0, Math.floor((hoje.getTime() - new Date(reg.ultimaData + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24))),
            };
          }
          // Sem acidentes registrados: contar dias desde o início da obra
          // (ou createdAt como fallback). Se nenhum existir, dias=null.
          const inicio = obraInicioById.get(id) ?? null;
          const dias = inicio
            ? Math.max(0, Math.floor((hoje.getTime() - new Date(inicio + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24)))
            : null;
          return { obraId: id, obraNome: nome, ultimaData: null, dias };
        })
        // Ordenação: obras COM acidente primeiro (acidente mais recente no topo),
        // depois as obras sem registro (maior tempo "limpo" no topo).
        .sort((a, b) => {
          const aTeve = a.ultimaData != null;
          const bTeve = b.ultimaData != null;
          if (aTeve && bTeve) return (a.dias ?? 0) - (b.dias ?? 0);
          if (aTeve) return -1;
          if (bTeve) return 1;
          // Ambos sem registro: mais dias "limpos" primeiro
          return (b.dias ?? -1) - (a.dias ?? -1);
        });

      // Cobertura CAT (% acidentes que exigem CAT e têm CAT)
      const exigeCAT = acRows.filter((r) => !/quase|primeiros socorros/i.test(r.gravidade || ""));
      const exigeCATComCAT = exigeCAT.filter((r) => (r.houveCAT ?? 0) > 0 || (r.catNumero || "").trim().length > 0).length;
      const coberturaCAT = exigeCAT.length > 0 ? (exigeCATComCAT / exigeCAT.length) * 100 : 100;

      // Ações corretivas — abertas / vencidas
      const hojeISO = hoje.toISOString().slice(0, 10);
      const acoesAbertas = acRows.filter((r) => r.statusAcaoCorretiva && !/conclu|cancel/i.test(r.statusAcaoCorretiva));
      const acoesVencidas = acoesAbertas.filter((r) => r.prazoAcaoCorretiva && r.prazoAcaoCorretiva < hojeISO);
      const acoesCorretivas = {
        total: acRows.filter((r) => (r.acaoCorretiva || "").trim().length > 0).length,
        abertas: acoesAbertas.length,
        vencidas: acoesVencidas.length,
        listaVencidas: acoesVencidas.slice(0, 10).map((r) => ({
          id: r.id, employeeNome: r.employeeNome, obraNome: r.obraNome,
          acao: r.acaoCorretiva, status: r.statusAcaoCorretiva,
          prazo: r.prazoAcaoCorretiva, dataAcidente: r.dataAcidente,
        })),
      };

      // por gravidade
      const gravMap = new Map<string, { gravidade: string; quantidade: number; dias: number }>();
      for (const r of acRows) {
        const k = (r.gravidade || "Não informado").trim() || "Não informado";
        const cur = gravMap.get(k) ?? { gravidade: k, quantidade: 0, dias: 0 };
        cur.quantidade += 1;
        cur.dias += r.diasAfastamento || 0;
        gravMap.set(k, cur);
      }
      const porGravidade = Array.from(gravMap.values()).sort((a, b) => b.quantidade - a.quantidade);

      // por tipo de acidente
      const tipoAcMap = new Map<string, { tipo: string; quantidade: number }>();
      for (const r of acRows) {
        const k = (r.tipoAcidente || "Não informado").trim() || "Não informado";
        const cur = tipoAcMap.get(k) ?? { tipo: k, quantidade: 0 };
        cur.quantidade += 1;
        tipoAcMap.set(k, cur);
      }
      const porTipoAcidente = Array.from(tipoAcMap.values()).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);

      // por parte do corpo
      const parteMap = new Map<string, { parte: string; quantidade: number }>();
      for (const r of acRows) {
        const k = (r.parteCorpoAtingida || "Não informado").trim() || "Não informado";
        const cur = parteMap.get(k) ?? { parte: k, quantidade: 0 };
        cur.quantidade += 1;
        parteMap.set(k, cur);
      }
      const porParteCorpo = Array.from(parteMap.values()).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);

      // por local
      const localMap = new Map<string, { local: string; quantidade: number }>();
      for (const r of acRows) {
        const k = (r.localAcidente || "Não informado").trim() || "Não informado";
        const cur = localMap.get(k) ?? { local: k, quantidade: 0 };
        cur.quantidade += 1;
        localMap.set(k, cur);
      }
      const porLocal = Array.from(localMap.values()).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);

      // ---- Evolução Mensal (atestados + acidentes + dias) ----
      const monthKey = (iso: string) => iso.slice(0, 7); // YYYY-MM
      const months: string[] = [];
      {
        const start = new Date(dataInicio + "T00:00:00");
        const end = new Date(dataFim + "T00:00:00");
        const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cursor <= end) {
          months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
      const monthInit = () =>
        Object.fromEntries(
          months.map((m) => [
            m,
            { mes: m, atestados: 0, diasAtestado: 0, acidentes: 0, diasAcidente: 0 },
          ]),
        ) as Record<string, { mes: string; atestados: number; diasAtestado: number; acidentes: number; diasAcidente: number }>;
      const monthAgg = monthInit();
      for (const r of atRows) {
        const k = monthKey(r.dataEmissao);
        if (monthAgg[k]) {
          monthAgg[k].atestados += 1;
          monthAgg[k].diasAtestado += r.diasAfastamento || 0;
        }
      }
      for (const r of acRows) {
        const k = monthKey(r.dataAcidente);
        if (monthAgg[k]) {
          monthAgg[k].acidentes += 1;
          monthAgg[k].diasAcidente += r.diasAfastamento || 0;
        }
      }
      const evolucaoMensal = months.map((m) => monthAgg[m]);

      // ---- Headcount médio para taxas (TF/TG) ----
      const empRows = await db
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            companyFilter(employees.companyId, input),
            isNull(employees.deletedAt),
            eq(employees.status, "Ativo"),
          ),
        );
      const headcount = empRows.length;

      // Horas-homem estimadas no período (220h/mês padrão CLT)
      const horasHomem = headcount * 220 * months.length;
      // Taxa de Frequência = (nº acidentes c/ afastamento × 1.000.000) / HH
      const taxaFrequencia = horasHomem > 0 ? (acidentesComAfastamento * 1_000_000) / horasHomem : 0;
      // Taxa de Gravidade = (dias perdidos × 1.000.000) / HH
      const taxaGravidade = horasHomem > 0 ? (totalDiasAfastamentoAcid * 1_000_000) / horasHomem : 0;

      // top funcionários (acidentes)
      const funcAcMap = new Map<
        number,
        { employeeId: number; nome: string; matricula: string | null; codigoInterno: string | null; funcao: string | null; fotoUrl: string | null; dataAdmissao: string | null; dataNascimento: string | null; obraAtual: string | null; cipaAtivo: boolean; cipaEstabilidade: boolean; cipaFimEstabilidade: string | null; quantidade: number; dias: number }
      >();
      for (const r of acRows) {
        const cur = funcAcMap.get(r.employeeId) ?? {
          employeeId: r.employeeId,
          nome: r.employeeNome || `Funcionário #${r.employeeId}`,
          matricula: r.employeeMatricula || null,
          codigoInterno: r.employeeCodigoInterno || null,
          funcao: r.employeeFuncao || r.employeeCargo || null,
          fotoUrl: r.employeeFotoUrl || null,
          dataAdmissao: r.employeeDataAdmissao || null,
          dataNascimento: r.employeeDataNascimento || null,
          obraAtual: null,
          cipaAtivo: false,
          cipaEstabilidade: false,
          cipaFimEstabilidade: null,
          quantidade: 0,
          dias: 0,
        };
        cur.quantidade += 1;
        cur.dias += r.diasAfastamento || 0;
        funcAcMap.set(r.employeeId, cur);
      }
      const topFuncionariosAcidentes = Array.from(funcAcMap.values())
        .sort((a, b) => b.quantidade - a.quantidade || b.dias - a.dias)
        .slice(0, 10);

      // Rev. 1979 — Enriquecimento dos top-10 com obra atual + CIPA (lookup em batch só dos IDs dos top-10).
      const topIds = Array.from(new Set([
        ...topFuncionariosAtestados.map((f) => f.employeeId),
        ...topFuncionariosAcidentes.map((f) => f.employeeId),
      ]));
      if (topIds.length > 0) {
        // Obra atual (alocação ativa)
        const ofRows = await db
          .select({ employeeId: obraFuncionarios.employeeId, obraNome: obras.nome })
          .from(obraFuncionarios)
          .leftJoin(obras, eq(obras.id, obraFuncionarios.obraId))
          .where(and(inArray(obraFuncionarios.employeeId, topIds), eq(obraFuncionarios.isActive, 1)));
        const obraMap = new Map<number, string>();
        for (const r of ofRows) if (r.obraNome) obraMap.set(r.employeeId, r.obraNome);

        // CIPA: pega o registro mais relevante por funcionário —
        // prioridade: Ativo > Estabilidade (fimEstabilidade >= hoje) > nada.
        const today = new Date().toISOString().slice(0, 10);
        const cipaRows = await db
          .select({
            employeeId: cipaMembers.employeeId,
            statusMembro: cipaMembers.statusMembro,
            fimEstabilidade: cipaMembers.fimEstabilidade,
          })
          .from(cipaMembers)
          .where(inArray(cipaMembers.employeeId, topIds));
        const cipaMap = new Map<number, { ativo: boolean; estabilidade: boolean; fim: string | null }>();
        for (const r of cipaRows) {
          const ativo = r.statusMembro === "Ativo";
          const estabilidade = !ativo && !!r.fimEstabilidade && r.fimEstabilidade >= today;
          const prev = cipaMap.get(r.employeeId);
          if (!prev) {
            cipaMap.set(r.employeeId, { ativo, estabilidade, fim: r.fimEstabilidade });
          } else if (ativo && !prev.ativo) {
            cipaMap.set(r.employeeId, { ativo: true, estabilidade: false, fim: r.fimEstabilidade });
          } else if (!prev.ativo && estabilidade && (!prev.fim || (r.fimEstabilidade && r.fimEstabilidade > prev.fim))) {
            cipaMap.set(r.employeeId, { ativo: false, estabilidade: true, fim: r.fimEstabilidade });
          }
        }

        const enrich = (f: typeof topFuncionariosAtestados[number]) => {
          f.obraAtual = obraMap.get(f.employeeId) || null;
          const ci = cipaMap.get(f.employeeId);
          if (ci) {
            f.cipaAtivo = ci.ativo;
            f.cipaEstabilidade = ci.estabilidade;
            f.cipaFimEstabilidade = ci.fim;
          }
        };
        topFuncionariosAtestados.forEach(enrich);
        topFuncionariosAcidentes.forEach(enrich);
      }

      // ---- Atestados por dia da semana ----
      const dowAtMap = new Map<number, { diaIdx: number; dia: string; qtd: number; dias: number }>();
      for (let i = 0; i < 7; i++) dowAtMap.set(i, { diaIdx: i, dia: weekdayName[i], qtd: 0, dias: 0 });
      for (const r of atRows) {
        const d = new Date(r.dataEmissao + "T00:00:00");
        const cur = dowAtMap.get(d.getDay())!;
        cur.qtd += 1;
        cur.dias += r.diasAfastamento || 0;
      }
      const atestadosPorDiaSemana = Array.from(dowAtMap.values());

      // ---- Atestados recorrentes (3+ no período) ----
      const atestadosRecorrentes = Array.from(funcMap.values())
        .filter((f) => f.quantidade >= 3)
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 15);

      // ---- Comparativo período anterior (mesmo nº de dias antes do dataInicio) ----
      const diff = (new Date(dataFim + "T00:00:00").getTime() - new Date(dataInicio + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24);
      const periodoAntFim = new Date(new Date(dataInicio + "T00:00:00").getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const periodoAntIni = new Date(new Date(periodoAntFim + "T00:00:00").getTime() - diff * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const [atAntCnt] = await db.select({ c: sql<number>`COUNT(*)::int`, d: sql<number>`COALESCE(SUM(${atestados.diasAfastamento}), 0)::int` })
        .from(atestados)
        .where(and(companyFilter(atestados.companyId, input), isNull(atestados.deletedAt), gte(atestados.dataEmissao, periodoAntIni), lte(atestados.dataEmissao, periodoAntFim)));
      const [acAntCnt] = await db.select({ c: sql<number>`COUNT(*)::int`, d: sql<number>`COALESCE(SUM(${accidents.diasAfastamento}), 0)::int` })
        .from(accidents)
        .where(and(companyFilter(accidents.companyId, input), isNull(accidents.deletedAt), gte(accidents.dataAcidente, periodoAntIni), lte(accidents.dataAcidente, periodoAntFim)));
      const varPct = (atual: number, ant: number) => ant === 0 ? (atual > 0 ? 100 : 0) : ((atual - ant) / ant) * 100;
      const comparativoPeriodoAnterior = {
        periodoAnterior: { dataInicio: periodoAntIni, dataFim: periodoAntFim },
        atestados: { atual: totalAtestados, anterior: atAntCnt?.c || 0, varPct: varPct(totalAtestados, atAntCnt?.c || 0) },
        diasAtestado: { atual: totalDiasAfastamento, anterior: atAntCnt?.d || 0, varPct: varPct(totalDiasAfastamento, atAntCnt?.d || 0) },
        acidentes: { atual: totalAcidentes, anterior: acAntCnt?.c || 0, varPct: varPct(totalAcidentes, acAntCnt?.c || 0) },
        diasAcidente: { atual: totalDiasAfastamentoAcid, anterior: acAntCnt?.d || 0, varPct: varPct(totalDiasAfastamentoAcid, acAntCnt?.d || 0) },
      };

      // ---- Custo estimado de afastamento (R$ — usando salário-base / 30) ----
      const empSal = await db
        .select({ id: employees.id, salario: employees.salarioBase })
        .from(employees)
        .where(and(companyFilter(employees.companyId, input), isNull(employees.deletedAt)));
      const salMap = new Map<number, number>();
      for (const e of empSal) salMap.set(e.id, parseBRLSalario(e.salario));
      const custoAtestados = atRows.reduce((s, r) => s + ((salMap.get(r.employeeId) || 0) / 30) * (r.diasAfastamento || 0), 0);
      const custoAcidentes = acRows.reduce((s, r) => s + ((salMap.get(r.employeeId) || 0) / 30) * (r.diasAfastamento || 0), 0);

      // Memória de cálculo por colaborador
      type CustoDet = {
        employeeId: number;
        nome: string;
        codigoInterno: string | null;
        matricula: string | null;
        funcao: string | null;
        salarioBase: number;
        valorDia: number;
        diasAtestado: number;
        diasAcidente: number;
        diasTotal: number;
        custoAtestado: number;
        custoAcidente: number;
        custoTotal: number;
      };
      const detMap = new Map<number, CustoDet>();
      const ensureDet = (empId: number, nome: string, codigoInterno: string | null, matricula: string | null, funcao: string | null): CustoDet => {
        let d = detMap.get(empId);
        if (!d) {
          const sal = salMap.get(empId) || 0;
          d = {
            employeeId: empId,
            nome: nome || `Funcionário #${empId}`,
            codigoInterno,
            matricula,
            funcao,
            salarioBase: sal,
            valorDia: sal / 30,
            diasAtestado: 0,
            diasAcidente: 0,
            diasTotal: 0,
            custoAtestado: 0,
            custoAcidente: 0,
            custoTotal: 0,
          };
          detMap.set(empId, d);
        }
        return d;
      };
      for (const r of atRows) {
        const dias = r.diasAfastamento || 0;
        if (!dias) continue;
        const det = ensureDet(r.employeeId, r.employeeNome || "", r.employeeCodigoInterno || null, r.employeeMatricula || null, r.employeeFuncao || r.employeeCargo || null);
        det.diasAtestado += dias;
        det.custoAtestado += det.valorDia * dias;
      }
      for (const r of acRows) {
        const dias = r.diasAfastamento || 0;
        if (!dias) continue;
        const det = ensureDet(r.employeeId, r.employeeNome || "", r.employeeCodigoInterno || null, r.employeeMatricula || null, r.employeeFuncao || r.employeeCargo || null);
        det.diasAcidente += dias;
        det.custoAcidente += det.valorDia * dias;
      }
      const custoDetalhe = Array.from(detMap.values())
        .map((d) => ({ ...d, diasTotal: d.diasAtestado + d.diasAcidente, custoTotal: d.custoAtestado + d.custoAcidente }))
        .sort((a, b) => b.custoTotal - a.custoTotal);

      const custoEstimadoAfastamento = {
        atestados: custoAtestados,
        acidentes: custoAcidentes,
        total: custoAtestados + custoAcidentes,
        detalhe: custoDetalhe,
      };

      // ---- Listas brutas para drill-down nos gráficos ----
      const atestadosLista = atRows.map((r) => {
        const oid = resolveObraDoAtestado(r.employeeId, r.dataEmissao);
        return {
          id: r.id,
          dataEmissao: r.dataEmissao,
          dataRetorno: r.dataRetorno,
          employeeId: r.employeeId,
          nome: r.employeeNome || `Funcionário #${r.employeeId}`,
          codigoInterno: r.employeeCodigoInterno || null,
          matricula: r.employeeMatricula || null,
          funcao: r.employeeFuncao || r.employeeCargo || null,
          tipo: (r.tipo || "Não informado").trim() || "Não informado",
          cid: (r.cid || "").trim().toUpperCase() || null,
          motivo: (r.motivo || "").trim() || "Não informado",
          dias: r.diasAfastamento || 0,
          afastamentoINSS: r.afastamentoINSS || 0,
          obraId: oid,
          obraNome: oid != null ? (obraNomeById.get(oid) || `Obra #${oid}`) : "Sem obra/alocação",
        };
      });

      const acidentesLista = acRows.map((r) => ({
        id: r.id,
        dataAcidente: r.dataAcidente,
        horaAcidente: r.horaAcidente,
        employeeId: r.employeeId,
        nome: r.employeeNome || `Funcionário #${r.employeeId}`,
        codigoInterno: r.employeeCodigoInterno || null,
        matricula: r.employeeMatricula || null,
        funcao: r.employeeFuncao || r.employeeCargo || null,
        tipo: (r.tipoAcidente || "Não informado").trim() || "Não informado",
        gravidade: (r.gravidade || "Não informado").trim() || "Não informado",
        parteCorpo: (r.parteCorpoAtingida || "Não informado").trim() || "Não informado",
        local: (r.localAcidente || "Não informado").trim() || "Não informado",
        obraNome: r.obraNome || null,
        dias: r.diasAfastamento || 0,
        catNumero: r.catNumero || null,
        houveCAT: r.houveCAT || 0,
        descricao: (r.descricao || "").trim() || null,
      }));

      // ---- Indicadores acionáveis adicionais ----
      // Curta duração (1-2 dias) e longa duração (>=15 dias = INSS) — Lei 8.213/91
      const atestadosCurtaDuracao = atestadosLista.filter((a) => a.dias >= 1 && a.dias <= 2);
      const atestadosLongaDuracao = atestadosLista.filter((a) => a.dias >= 15);

      // Atestados em segunda-feira / sexta-feira (sinal de absenteísmo "fim de semana estendido")
      const dowOf = (s: string) => new Date(s + "T12:00:00").getDay();
      const atestadosSegundaFeira = atestadosLista.filter((a) => dowOf(a.dataEmissao) === 1);
      const atestadosSextaFeira = atestadosLista.filter((a) => dowOf(a.dataEmissao) === 5);
      const pctSegunda = totalAtestados > 0 ? (atestadosSegundaFeira.length / totalAtestados) * 100 : 0;
      const pctSexta = totalAtestados > 0 ? (atestadosSextaFeira.length / totalAtestados) * 100 : 0;

      // Reincidência mesmo CID (mesmo funcionário com 2+ atestados do mesmo CID)
      const cidEmpKey = (a: typeof atestadosLista[number]) => `${a.employeeId}|${a.cid || ""}`;
      const reincCount = new Map<string, number>();
      for (const a of atestadosLista) if (a.cid) reincCount.set(cidEmpKey(a), (reincCount.get(cidEmpKey(a)) || 0) + 1);
      const reincidenciaCID = atestadosLista
        .filter((a) => a.cid && (reincCount.get(cidEmpKey(a)) || 0) >= 2)
        .reduce((acc, a) => {
          const k = cidEmpKey(a);
          let row = acc.find((r) => r.key === k);
          if (!row) {
            row = { key: k, employeeId: a.employeeId, nome: a.nome, codigoInterno: a.codigoInterno, funcao: a.funcao, cid: a.cid!, quantidade: 0, dias: 0 };
            acc.push(row);
          }
          row.quantidade += 1;
          row.dias += a.dias;
          return acc;
        }, [] as Array<{ key: string; employeeId: number; nome: string; codigoInterno: string | null; funcao: string | null; cid: string; quantidade: number; dias: number }>)
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 25);

      // Absenteísmo % = (dias afastados × 8h) / HH disponíveis
      const horasAfastamentoTotal = (totalDiasAfastamento + totalDiasAfastamentoAcid) * 8;
      const absenteismoPct = horasHomem > 0 ? (horasAfastamentoTotal / horasHomem) * 100 : 0;

      // Dias entre eventos (cadência) - dias entre o atestado mais recente e o próximo (média)
      const datasOrd = atestadosLista.map((a) => a.dataEmissao).sort();
      let cadenciaMediaDias = 0;
      if (datasOrd.length >= 2) {
        const diffs: number[] = [];
        for (let i = 1; i < datasOrd.length; i++) {
          const d1 = new Date(datasOrd[i - 1] + "T00:00:00").getTime();
          const d2 = new Date(datasOrd[i] + "T00:00:00").getTime();
          diffs.push((d2 - d1) / (1000 * 60 * 60 * 24));
        }
        cadenciaMediaDias = diffs.reduce((s, x) => s + x, 0) / diffs.length;
      }

      const indicadoresAcionaveis = {
        absenteismoPct,
        atestadosCurtaDuracao: { quantidade: atestadosCurtaDuracao.length, dias: atestadosCurtaDuracao.reduce((s, a) => s + a.dias, 0), lista: atestadosCurtaDuracao },
        atestadosLongaDuracao: { quantidade: atestadosLongaDuracao.length, dias: atestadosLongaDuracao.reduce((s, a) => s + a.dias, 0), lista: atestadosLongaDuracao },
        atestadosSegundaFeira: { quantidade: atestadosSegundaFeira.length, pct: pctSegunda, lista: atestadosSegundaFeira },
        atestadosSextaFeira: { quantidade: atestadosSextaFeira.length, pct: pctSexta, lista: atestadosSextaFeira },
        reincidenciaCID,
        cadenciaMediaDias,
      };

      // últimos eventos (combinados)
      const ultimosAtestados = atRows.slice(0, 8).map((r) => ({
        id: r.id,
        data: r.dataEmissao,
        employeeId: r.employeeId,
        nome: r.employeeNome || `Funcionário #${r.employeeId}`,
        funcao: r.employeeFuncao || r.employeeCargo || null,
        fotoUrl: r.employeeFotoUrl || null,
        tipo: r.tipo,
        cid: r.cid,
        dias: r.diasAfastamento || 0,
        motivo: r.motivo,
      }));
      const ultimosAcidentes = acRows.slice(0, 8).map((r) => ({
        id: r.id,
        data: r.dataAcidente,
        hora: r.horaAcidente,
        employeeId: r.employeeId,
        nome: r.employeeNome || `Funcionário #${r.employeeId}`,
        funcao: r.employeeFuncao || r.employeeCargo || null,
        fotoUrl: r.employeeFotoUrl || null,
        tipo: r.tipoAcidente,
        gravidade: r.gravidade,
        local: r.localAcidente,
        parteCorpo: r.parteCorpoAtingida,
        catNumero: r.catNumero,
        dias: r.diasAfastamento || 0,
      }));

      return {
        periodo: { dataInicio, dataFim, meses: months.length },
        headcount,
        horasHomem,
        atestados: {
          total: totalAtestados,
          totalDiasAfastamento,
          totalHorasAfastamento,
          colaboradoresAfetados: colaboradoresAfetadosAt,
          totalAfastamentosINSS,
          mediaDiasAtestado,
          comCID: atestadosComCID,
          semCID: atestadosSemCID,
          porTipo,
          porMotivo,
          topCIDs,
          topFuncionarios: topFuncionariosAtestados,
          // Rev. 2687 — lista COMPLETA por colaborador (não fatiada) para o
          // drill-down "de onde vem o número" dos cards Total Atestados / Dias
          // Afastamento. Σ dias = totalDiasAfastamento (reconcilia com o card).
          todosFuncionarios: Array.from(funcMap.values())
            .sort((a, b) => b.dias - a.dias || b.quantidade - a.quantidade),
        },
        acidentes: {
          total: totalAcidentes,
          totalDiasAfastamento: totalDiasAfastamentoAcid,
          colaboradoresAfetados: colaboradoresAfetadosAc,
          comCAT: acidentesComCAT,
          semCAT: acidentesSemCAT,
          comAfastamento: acidentesComAfastamento,
          semAfastamento: acidentesSemAfastamento,
          taxaFrequencia,
          taxaGravidade,
          porGravidade,
          porTipo: porTipoAcidente,
          porParteCorpo,
          porLocal,
          topFuncionarios: topFuncionariosAcidentes,
        },
        evolucaoMensal,
        ultimosAtestados,
        ultimosAcidentes,
        // Indicadores avançados
        piramideBird,
        heatmapDiaHora,
        acidentesPorDiaSemana,
        atestadosPorDiaSemana,
        atestadosRecorrentes,
        rankingObras,
        diasSemAcidente,
        atestadosPorObra,
        coberturaCAT,
        acoesCorretivas,
        comparativoPeriodoAnterior,
        custoEstimadoAfastamento,
        atestadosLista,
        acidentesLista,
        indicadoresAcionaveis,
      };
    }),

  porFuncionario: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      employeeId: z.number(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const { dataInicio, dataFim } = defaultRange(input);

      const [emp] = await db.select({
        id: employees.id,
        nome: employees.nomeCompleto,
        matricula: employees.matricula,
        codigoInterno: employees.codigoInterno,
        funcao: employees.funcao,
        cargo: employees.cargo,
      }).from(employees).where(and(
        eq(employees.id, input.employeeId),
        companyFilter(employees.companyId, input),
      ));

      const ats = await db.select({
        id: atestados.id,
        tipo: atestados.tipo,
        dataEmissao: atestados.dataEmissao,
        dataRetorno: atestados.dataRetorno,
        diasAfastamento: atestados.diasAfastamento,
        horasAfastamento: atestados.horasAfastamento,
        afastamentoTipo: atestados.afastamentoTipo,
        afastamentoINSS: atestados.afastamentoINSS,
        cid: atestados.cid,
        medico: atestados.medico,
        crm: atestados.crm,
        motivo: atestados.motivo,
        descricao: atestados.descricao,
        documentoUrl: atestados.documentoUrl,
      })
        .from(atestados)
        .where(and(
          companyFilter(atestados.companyId, input),
          eq(atestados.employeeId, input.employeeId),
          isNull(atestados.deletedAt),
          gte(atestados.dataEmissao, dataInicio),
          lte(atestados.dataEmissao, dataFim),
        ))
        .orderBy(desc(atestados.dataEmissao));

      const acs = await db.select({
        id: accidents.id,
        dataAcidente: accidents.dataAcidente,
        horaAcidente: accidents.horaAcidente,
        tipoAcidente: accidents.tipoAcidente,
        gravidade: accidents.gravidade,
        localAcidente: accidents.localAcidente,
        parteCorpoAtingida: accidents.parteCorpoAtingida,
        agenteCausador: accidents.agenteCausador,
        descricao: accidents.descricao,
        diasAfastamento: accidents.diasAfastamento,
        houveCAT: accidents.houveCAT,
        catNumero: accidents.catNumero,
        catData: accidents.catData,
        statusAcaoCorretiva: accidents.statusAcaoCorretiva,
        prazoAcaoCorretiva: accidents.prazoAcaoCorretiva,
        responsavelAcao: accidents.responsavelAcao,
        acaoCorretiva: accidents.acaoCorretiva,
        documentoUrl: accidents.documentoUrl,
        obraId: accidents.obraId,
        obraNome: obras.nome,
      })
        .from(accidents)
        .leftJoin(obras, eq(accidents.obraId, obras.id))
        .where(and(
          companyFilter(accidents.companyId, input),
          eq(accidents.employeeId, input.employeeId),
          isNull(accidents.deletedAt),
          gte(accidents.dataAcidente, dataInicio),
          lte(accidents.dataAcidente, dataFim),
        ))
        .orderBy(desc(accidents.dataAcidente));

      const totalDiasAtestado = ats.reduce((s, r) => s + (r.diasAfastamento || 0), 0);
      const totalDiasAcidente = acs.reduce((s, r) => s + (r.diasAfastamento || 0), 0);

      return {
        funcionario: emp || { id: input.employeeId, nome: `Funcionário #${input.employeeId}`, matricula: null, codigoInterno: null, funcao: null, cargo: null },
        periodo: { dataInicio, dataFim },
        atestados: ats,
        acidentes: acs,
        resumo: {
          qtdAtestados: ats.length,
          totalDiasAtestado,
          qtdAcidentes: acs.length,
          totalDiasAcidente,
          comAfastamentoINSS: ats.filter((r) => (r.afastamentoINSS ?? 0) > 0).length,
          comCAT: acs.filter((r) => r.houveCAT === 1).length,
        },
      };
    }),

  // Drill-down: lista de funcionários (atestados ou acidentes) num dia da semana específico
  funcionariosPorDiaSemana: protectedProcedure
    .input(inputSchema.extend({
      tipo: z.enum(["atestado", "acidente"]),
      diaIdx: z.number().min(0).max(6), // 0=Dom..6=Sab
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const { dataInicio, dataFim } = defaultRange(input);
      const weekdayName = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

      if (input.tipo === "atestado") {
        const rows = await db.select({
          id: atestados.id,
          dataEmissao: atestados.dataEmissao,
          tipo: atestados.tipo,
          motivo: atestados.motivo,
          cid: atestados.cid,
          diasAfastamento: atestados.diasAfastamento,
          employeeId: atestados.employeeId,
          employeeNome: employees.nomeCompleto,
          employeeMatricula: employees.matricula,
          employeeFuncao: employees.funcao,
        })
          .from(atestados)
          .leftJoin(employees, eq(atestados.employeeId, employees.id))
          .where(and(
            companyFilter(atestados.companyId, input),
            isNull(atestados.deletedAt),
            gte(atestados.dataEmissao, dataInicio),
            lte(atestados.dataEmissao, dataFim),
            sql`EXTRACT(DOW FROM ${atestados.dataEmissao}::date) = ${input.diaIdx}`,
          ))
          .orderBy(desc(atestados.dataEmissao));
        return { tipo: "atestado", dia: weekdayName[input.diaIdx], total: rows.length, registros: rows };
      } else {
        const rows = await db.select({
          id: accidents.id,
          dataAcidente: accidents.dataAcidente,
          tipoAcidente: accidents.tipoAcidente,
          gravidade: accidents.gravidade,
          parteCorpoAtingida: accidents.parteCorpoAtingida,
          diasAfastamento: accidents.diasAfastamento,
          houveCAT: accidents.houveCAT,
          employeeId: accidents.employeeId,
          employeeNome: employees.nomeCompleto,
          employeeMatricula: employees.matricula,
          employeeFuncao: employees.funcao,
        })
          .from(accidents)
          .leftJoin(employees, eq(accidents.employeeId, employees.id))
          .where(and(
            companyFilter(accidents.companyId, input),
            isNull(accidents.deletedAt),
            gte(accidents.dataAcidente, dataInicio),
            lte(accidents.dataAcidente, dataFim),
            sql`EXTRACT(DOW FROM ${accidents.dataAcidente}::date) = ${input.diaIdx}`,
          ))
          .orderBy(desc(accidents.dataAcidente));
        return { tipo: "acidente", dia: weekdayName[input.diaIdx], total: rows.length, registros: rows };
      }
    }),
});
