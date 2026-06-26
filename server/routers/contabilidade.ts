// Rev. 3717 — Módulo Contabilidade: controle mensal/anual de envios ao contador
// Tabela: contabilidade_envios (criada via SyncSchema+ Rev.3717)
// Integração: IntegraSign para lista mestre com assinatura digital

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb, getCompaniesForUser } from "../db";
import crypto from "crypto";

function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

async function assertAccess(userId: number, role: string, companyId: number) {
  const allowed = await getCompaniesForUser(userId, role);
  const ids = (allowed as any[]).map((c: any) => (typeof c === "number" ? c : c?.id));
  if (!ids.includes(Number(companyId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
               "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fmtMesAno(mes: number, ano: number) {
  return `${MESES[mes - 1]} / ${ano}`;
}

function gerarHtmlProtocolo(
  mes: number, ano: number, empresa: string,
  itens: { label: string; quantidade: number; ok: boolean }[]
): string {
  const mesAno = fmtMesAno(mes, ano);
  const dataGeracao = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const rows = itens.map(it => `
    <tr style="background:${it.ok ? "#f0fff4" : "#fff8f0"}">
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${it.label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${it.ok ? "#16a34a" : "#d97706"}">${it.quantidade}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${it.ok ? "OK" : "Verificar"}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Protocolo de Entrega - ${mesAno}</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#111827}h1{font-size:20px;color:#1e3a5f}
table{width:100%;border-collapse:collapse;margin-top:12px}
th{background:#1e3a5f;color:#fff;padding:10px 12px;text-align:left;font-size:13px}
td{font-size:13px}.footer{margin-top:32px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:16px}
</style></head><body>
<h1>Protocolo de Entrega de Documentos Contabeis</h1>
<p><strong>Empresa:</strong> ${empresa}<br><strong>Periodo:</strong> ${mesAno}<br><strong>Data:</strong> ${dataGeracao}</p>
<table><thead><tr>
  <th>Documento</th><th style="text-align:center;width:100px">Qtd.</th><th style="text-align:center;width:120px">Status</th>
</tr></thead><tbody>${rows}</tbody></table>
<p style="margin-top:16px;font-size:13px">Os documentos acima foram gerados pelo ERP FC Engenharia e enviados eletronicamente ao escritorio de contabilidade Pronus Tributario para apuracao fiscal do periodo ${mesAno}.</p>
<div class="footer">Este protocolo foi assinado digitalmente como confirmacao de entrega e recebimento dos documentos listados acima.</div>
</body></html>`;
}

export const contabilidadeRouter = router({

  // ── GET ANO: 12 meses com status + contagens ─────────────────────────────
  getAno: protectedProcedure
    .input(z.object({ companyId: z.number(), ano: z.number().int().min(2020).max(2035) }))
    .query(async ({ input, ctx }) => {
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const [envios, nfse, nfe, extratos, ocs] = await Promise.all([
        db.$client.query<{
          mes: number; ano: number; status: string;
          envelope_id: number | null; envelope_status: string | null;
          enviado_em: string | null; enviado_por_nome: string | null; observacoes: string | null;
        }>(
          `SELECT mes, ano, status, envelope_id, envelope_status, enviado_em, enviado_por_nome, observacoes
           FROM contabilidade_envios WHERE company_id=$1 AND ano=$2 ORDER BY mes`,
          [input.companyId, input.ano]
        ),
        db.$client.query<{ mes: number; total: string }>(
          `SELECT EXTRACT(MONTH FROM data_emissao)::int AS mes, COUNT(*) AS total
           FROM fiscal_notes
           WHERE company_id=$1 AND EXTRACT(YEAR FROM data_emissao)=$2
             AND origem IN ('nfse_siapgeo_export','nfse_siapgeo','nfse_nacional','nfse_xml_manual')
           GROUP BY 1`,
          [input.companyId, input.ano]
        ),
        db.$client.query<{ mes: number; total: string }>(
          `SELECT EXTRACT(MONTH FROM data_emissao)::int AS mes, COUNT(*) AS total
           FROM fiscal_notes
           WHERE company_id=$1 AND EXTRACT(YEAR FROM data_emissao)=$2
             AND (origem = 'sefaz_nfe' OR origem = 'xml_upload')
             AND status != 'cancelada'
           GROUP BY 1`,
          [input.companyId, input.ano]
        ),
        db.$client.query<{ mes: number; total: string }>(
          `SELECT EXTRACT(MONTH FROM data)::int AS mes, COUNT(*) AS total
           FROM bank_statement_lines
           WHERE company_id=$1 AND EXTRACT(YEAR FROM data)=$2
             AND excluido_em IS NULL
           GROUP BY 1`,
          [input.companyId, input.ano]
        ),
        db.$client.query<{ mes: number; total: string }>(
          `SELECT EXTRACT(MONTH FROM created_at)::int AS mes, COUNT(*) AS total
           FROM compras_ordens
           WHERE company_id=$1 AND EXTRACT(YEAR FROM created_at)=$2
             AND status NOT IN ('cancelado','rascunho')
           GROUP BY 1`,
          [input.companyId, input.ano]
        ),
      ]);

      const toMap = (rows: { mes: number; total: string }[]) =>
        Object.fromEntries(rows.map(r => [r.mes, Number(r.total)]));

      const nfseMap = toMap(nfse.rows);
      const nfeMap  = toMap(nfe.rows);
      const extMap  = toMap(extratos.rows);
      const ocMap   = toMap(ocs.rows);
      const envMap  = Object.fromEntries(envios.rows.map(e => [e.mes, e]));

      const hoje = new Date();
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const envio = envMap[m] ?? null;
        const futuro = input.ano > hoje.getFullYear() ||
          (input.ano === hoje.getFullYear() && m > hoje.getMonth() + 1);
        return {
          mes: m,
          label: MESES[i],
          futuro,
          status: (envio?.status ?? (futuro ? "futuro" : "pendente")) as string,
          envelopeId: envio?.envelope_id ?? null,
          envelopeStatus: envio?.envelope_status ?? null,
          enviadoEm: envio?.enviado_em ?? null,
          enviadoPorNome: envio?.enviado_por_nome ?? null,
          observacoes: envio?.observacoes ?? null,
          contagens: {
            nfse: nfseMap[m] ?? 0,
            nfe: nfeMap[m] ?? 0,
            extratos: extMap[m] ?? 0,
            ocs: ocMap[m] ?? 0,
          },
        };
      });
    }),

  // ── REGISTRAR ENVIO ───────────────────────────────────────────────────────
  registrarEnvio: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mes: z.number().int().min(1).max(12),
      ano: z.number().int().min(2020).max(2035),
      arquivos: z.array(z.string()).optional(),
      observacoes: z.string().max(1000).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const userName: string = (ctx.user as any).name || (ctx.user as any).email || "Sistema";
      const arquivosJson = input.arquivos ? JSON.stringify(input.arquivos) : null;

      await db.$client.query(
        `INSERT INTO contabilidade_envios
           (company_id, mes, ano, status, arquivos_json, observacoes, enviado_em, enviado_por_id, enviado_por_nome, created_at, updated_at)
         VALUES ($1,$2,$3,'enviado',$4,$5,NOW(),$6,$7,NOW(),NOW())
         ON CONFLICT (company_id, mes, ano) DO UPDATE SET
           status='enviado',
           arquivos_json=COALESCE(EXCLUDED.arquivos_json, contabilidade_envios.arquivos_json),
           observacoes=COALESCE(EXCLUDED.observacoes, contabilidade_envios.observacoes),
           enviado_em=NOW(), enviado_por_id=EXCLUDED.enviado_por_id,
           enviado_por_nome=EXCLUDED.enviado_por_nome, updated_at=NOW()`,
        [input.companyId, input.mes, input.ano, arquivosJson,
         input.observacoes ?? null, ctx.user.id, userName]
      );
      return { ok: true };
    }),

  // ── CRIAR ENVELOPE INTEGRASIGN ────────────────────────────────────────────
  criarEnvelope: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mes: z.number().int().min(1).max(12),
      ano: z.number().int().min(2020).max(2035),
      nomeEmpresa: z.string(),
      contagens: z.object({
        nfse: z.number(), nfe: z.number(), extratos: z.number(), ocs: z.number(),
      }),
      signatarios: z.array(z.object({
        papel: z.enum(["fornecedor","gestor_projeto","financeiro","diretor","testemunha"]),
        ordemAssinatura: z.number(),
        nome: z.string(),
        email: z.string().email(),
        cpfCnpj: z.string().optional(),
        cargo: z.string().optional(),
        empresaNome: z.string().optional(),
      })).min(1).max(5),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const mesAno = fmtMesAno(input.mes, input.ano);
      const itens = [
        { label: "NFS-e Emitidas (Servicos Prestados)", quantidade: input.contagens.nfse, ok: input.contagens.nfse > 0 },
        { label: "NF-e Recebidas (Compras de Materiais)", quantidade: input.contagens.nfe, ok: true },
        { label: "Linhas de Extrato Bancario", quantidade: input.contagens.extratos, ok: input.contagens.extratos > 0 },
        { label: "Ordens de Compra", quantidade: input.contagens.ocs, ok: true },
      ];
      const htmlDoc = gerarHtmlProtocolo(input.mes, input.ano, input.nomeEmpresa, itens);
      const userName = (ctx.user as any).name || "Sistema";

      const envelopeRes = await db.$client.query<{ id: number }>(
        `INSERT INTO integrasign_envelopes
           (company_id, titulo, descricao, texto_contrato, status, total_signatarios_obrigatorios,
            total_assinaturas_realizadas, criado_por_id, criado_por_nome, criado_em, atualizado_em)
         VALUES ($1,$2,$3,$4,'ativo',$5,0,$6,$7,NOW(),NOW())
         RETURNING id`,
        [
          input.companyId,
          `Protocolo de Entrega - ${mesAno}`,
          `Lista mestre de documentos contabeis - ${input.nomeEmpresa} - ${mesAno}`,
          htmlDoc,
          input.signatarios.length,
          ctx.user.id,
          userName,
        ]
      );

      const envelopeId = envelopeRes.rows[0]?.id;
      if (!envelopeId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar envelope." });

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      for (const s of input.signatarios) {
        await db.$client.query(
          `INSERT INTO integrasign_signatarios
             (company_id, envelope_id, papel, ordem_assinatura, nome, email,
              cpf_cnpj, cargo, empresa_nome, token, token_expira_em, status, criado_em, atualizado_em)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pendente',NOW(),NOW())`,
          [
            input.companyId, envelopeId, s.papel, s.ordemAssinatura, s.nome, s.email,
            s.cpfCnpj ?? null, s.cargo ?? null, s.empresaNome ?? null,
            generateToken(), expiresAt,
          ]
        );
      }

      await db.$client.query(
        `INSERT INTO contabilidade_envios
           (company_id, mes, ano, status, envelope_id, envelope_status,
            enviado_por_id, enviado_por_nome, enviado_em, created_at, updated_at)
         VALUES ($1,$2,$3,'enviado',$4,'ativo',$5,$6,NOW(),NOW(),NOW())
         ON CONFLICT (company_id, mes, ano) DO UPDATE SET
           envelope_id=EXCLUDED.envelope_id, envelope_status='ativo',
           status='enviado', enviado_em=NOW(),
           enviado_por_id=EXCLUDED.enviado_por_id,
           enviado_por_nome=EXCLUDED.enviado_por_nome,
           updated_at=NOW()`,
        [input.companyId, input.mes, input.ano, envelopeId, ctx.user.id, userName]
      );

      return { ok: true, envelopeId };
    }),

  // ── ATUALIZAR STATUS MANUAL ───────────────────────────────────────────────
  atualizarStatus: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mes: z.number().int().min(1).max(12),
      ano: z.number().int().min(2020).max(2035),
      status: z.enum(["pendente","enviado","assinado"]),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const userName = (ctx.user as any).name || "Sistema";

      await db.$client.query(
        `INSERT INTO contabilidade_envios
           (company_id, mes, ano, status, enviado_por_id, enviado_por_nome, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
         ON CONFLICT (company_id, mes, ano) DO UPDATE SET
           status=EXCLUDED.status, updated_at=NOW()`,
        [input.companyId, input.mes, input.ano, input.status, ctx.user.id, userName]
      );
      return { ok: true };
    }),

  // ── SYNC STATUS ENVELOPE ─────────────────────────────────────────────────
  syncEnvelope: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mes: z.number().int().min(1).max(12),
      ano: z.number().int().min(2020).max(2035),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const rec = await db.$client.query<{ envelope_id: number | null }>(
        `SELECT envelope_id FROM contabilidade_envios WHERE company_id=$1 AND mes=$2 AND ano=$3`,
        [input.companyId, input.mes, input.ano]
      );
      const envelopeId = rec.rows[0]?.envelope_id;
      if (!envelopeId) return { ok: false, message: "Nenhum envelope criado para este mês." };

      const envRes = await db.$client.query<{ status: string }>(
        `SELECT status FROM integrasign_envelopes WHERE id=$1 LIMIT 1`,
        [envelopeId]
      );
      const envStatus = envRes.rows[0]?.status ?? null;
      const novoStatus = envStatus === "concluido" ? "assinado" : "enviado";

      await db.$client.query(
        `UPDATE contabilidade_envios SET envelope_status=$1, status=$2, updated_at=NOW()
         WHERE company_id=$3 AND mes=$4 AND ano=$5`,
        [envStatus, novoStatus, input.companyId, input.mes, input.ano]
      );
      return { ok: true, envelopeStatus: envStatus, status: novoStatus };
    }),

  // ── DOCUMENTOS DO MÊS (listas completas para visualização antes do download) ─
  getDocumentosMes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mes: z.number().int().min(1).max(12),
      ano: z.number().int().min(2020).max(2035),
    }))
    .query(async ({ input, ctx }) => {
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const { companyId, mes, ano } = input;
      const mesProx = mes === 12 ? 1 : mes + 1;
      const anoProx = mes === 12 ? ano + 1 : ano;
      const di = `${ano}-${String(mes).padStart(2,"0")}-01`;
      const df = `${anoProx}-${String(mesProx).padStart(2,"0")}-01`;

      const [nfseQ, nfeQ, extratoQ, ocQ] = await Promise.all([
        // NFS-e emitidas
        db.$client.query(`
          SELECT id, numero_nf, tomador_razao_social, tomador_cnpj,
                 valor_bruto::float, valor_liquido::float,
                 iss_retido::float, data_emissao, status
          FROM fiscal_notes
          WHERE company_id=$1 AND data_emissao >= $2 AND data_emissao < $3
            AND origem NOT LIKE '%tomada%'
            AND origem NOT IN ('sefaz_nfe','xml_upload')
            AND status != 'cancelada'
          ORDER BY data_emissao ASC
          LIMIT 500
        `, [companyId, di, df]),

        // NF-e recebidas SEFAZ
        db.$client.query(`
          SELECT numero_nf, emitente_nome, emitente_cnpj,
                 valor_bruto::float, data_emissao, status, chave_acesso
          FROM fiscal_notes
          WHERE company_id=$1 AND data_emissao >= $2 AND data_emissao < $3
            AND (origem = 'sefaz_nfe' OR origem = 'xml_upload')
            AND status != 'cancelada'
          ORDER BY data_emissao ASC
          LIMIT 500
        `, [companyId, di, df]),

        // Extrato bancário (limitado a 300 para não sobrecarregar)
        db.$client.query(`
          SELECT bsl.data, bsl.descricao, bsl.valor::float, bsl.tipo, bsl.conciliado,
                 COALESCE(cba.apelido, cba.banco, '') AS conta_nome,
                 cba.banco
          FROM bank_statement_lines bsl
          LEFT JOIN company_bank_accounts cba ON cba.id = bsl.conta_bancaria_id
          WHERE bsl.company_id=$1 AND bsl.data >= $2 AND bsl.data < $3
            AND bsl.excluido_em IS NULL
          ORDER BY bsl.data ASC, bsl.id ASC
          LIMIT 300
        `, [companyId, di, df]),

        // Ordens de compra
        db.$client.query(`
          SELECT co.numero_oc AS numero,
                 COALESCE(f.razao_social, co.fornecedor_nome, '') AS fornecedor,
                 co.total::float AS valor_total,
                 co.status, co.created_at,
                 COALESCE(o.nome, '') AS obra_nome
          FROM compras_ordens co
          LEFT JOIN fornecedores f ON f.id = co.fornecedor_id AND f.company_id=$1
          LEFT JOIN obras o ON o.id = co.obra_id
          WHERE co.company_id=$1 AND co.status NOT IN ('cancelada','rascunho')
            AND co.created_at >= $2 AND co.created_at < $3
          ORDER BY co.created_at ASC
          LIMIT 300
        `, [companyId, di, df]),
      ]);

      // pg retorna TIMESTAMP como Date object — converter para ISO string antes de serializar
      const sanitize = (rows: any[]) =>
        rows.map(row => Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])
        ));

      return {
        nfseEmitidas: sanitize(nfseQ.rows),
        nfeRecebidas: sanitize(nfeQ.rows),
        extrato:      sanitize(extratoQ.rows),
        ocs:          sanitize(ocQ.rows),
      };
    }),

  // ── HISTÓRICO PLURIANUAL ──────────────────────────────────────────────────
  getHistorico: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      anoInicio: z.number().int().min(2020).max(2035).optional(),
      anoFim: z.number().int().min(2020).max(2035).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await assertAccess(ctx.user.id, ctx.user.role, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const anoI = input.anoInicio ?? new Date().getFullYear() - 2;
      const anoF = input.anoFim ?? new Date().getFullYear();
      const rows = await db.$client.query<{
        id: number; mes: number; ano: number; status: string;
        envelope_id: number | null; envelope_status: string | null;
        enviado_em: string | null; enviado_por_nome: string | null; observacoes: string | null;
      }>(
        `SELECT id, mes, ano, status, envelope_id, envelope_status, enviado_em, enviado_por_nome, observacoes
         FROM contabilidade_envios
         WHERE company_id=$1 AND ano BETWEEN $2 AND $3
         ORDER BY ano DESC, mes DESC`,
        [input.companyId, anoI, anoF]
      );
      return rows.rows;
    }),
});
