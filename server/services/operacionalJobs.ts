import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { sendEmail } from "./smtpService";
import { ENV } from "../_core/env";

function rows(result: any): any[] {
  return (result as any).rows ?? result ?? [];
}

function getBrasiliaHour(): number {
  const now = new Date();
  const utcH = now.getUTCHours();
  let brasiliaH = utcH - 3;
  if (brasiliaH < 0) brasiliaH += 24;
  return brasiliaH;
}

function getBrasiliaDate(): string {
  const now = new Date();
  const offset = -3 * 60;
  const local = new Date(now.getTime() + offset * 60 * 1000);
  return local.toISOString().split("T")[0];
}

function msUntilBrasiliaHour(targetHour: number): number {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const utcS = now.getUTCSeconds();
  const currentMinutes = utcH * 60 + utcM;
  const targetUtcHour = (targetHour + 3) % 24;
  const targetMinutes = targetUtcHour * 60;
  let diff = targetMinutes - currentMinutes;
  if (diff <= 0) diff += 24 * 60;
  return (diff * 60 - utcS) * 1000;
}

export function startOperacionalJobs() {
  scheduleAutoCriarRDO();
  scheduleAlerta18h();
  scheduleAlerta20h();

  setInterval(async () => {
    try { await buscarClimaParaRDOs(); } catch (e: any) { console.error("[OperacionalJobs] Erro clima:", e?.message); }
  }, 30 * 60 * 1000);

  setTimeout(async () => {
    try { await buscarClimaParaRDOs(); } catch (e: any) { console.error("[OperacionalJobs] Erro clima inicial:", e?.message); }
  }, 60000);

  console.log("[OperacionalJobs] Jobs do módulo operacional iniciados.");
}

function scheduleAutoCriarRDO() {
  const ms = msUntilBrasiliaHour(5);
  const horasAte = (ms / 3600000).toFixed(1);
  console.log(`[OperacionalJobs] Auto-criar RDO agendado para 05:00 Brasília (em ${horasAte}h)`);
  setTimeout(async () => {
    try { await autoCriarRDOs(); } catch (e: any) { console.error("[OperacionalJobs] Erro auto-criar RDO:", e?.message); }
    scheduleAutoCriarRDO();
  }, ms);
}

function scheduleAlerta18h() {
  const ms = msUntilBrasiliaHour(18);
  setTimeout(async () => {
    try { await alertaRDOPendente("engenheiro"); } catch (e: any) { console.error("[OperacionalJobs] Erro alerta 18h:", e?.message); }
    scheduleAlerta18h();
  }, ms);
}

function scheduleAlerta20h() {
  const ms = msUntilBrasiliaHour(20);
  setTimeout(async () => {
    try { await alertaRDOPendente("gerente"); } catch (e: any) { console.error("[OperacionalJobs] Erro alerta 20h:", e?.message); }
    scheduleAlerta20h();
  }, ms);
}

async function autoCriarRDOs() {
  const db = await getDb();
  if (!db) return;
  const hoje = getBrasiliaDate();

  const obrasAtivas = rows(await db.execute(sql`
    SELECT o.id, o.company_id, o.nome, o.latitude, o.longitude
    FROM obras o
    WHERE o.status = 'em_andamento'
  `));

  let criados = 0;
  for (const obra of obrasAtivas) {
    const existing = rows(await db.execute(sql`
      SELECT id FROM rdo_relatorios
      WHERE company_id = ${obra.company_id} AND obra_id = ${obra.id} AND data = ${hoje}
    `));
    if (existing.length > 0) continue;

    const result = rows(await db.execute(sql`
      INSERT INTO rdo_relatorios (company_id, obra_id, data, status, observacoes_gerais)
      VALUES (${obra.company_id}, ${obra.id}, ${hoje}, 'rascunho', 'RDO criado automaticamente')
      RETURNING id
    `));
    const rdoId = result[0]?.id;
    if (rdoId) {
      await autoPreencherRDO(db, rdoId, obra.company_id, obra.id);
      criados++;
    }
  }

  if (criados > 0) {
    console.log(`[OperacionalJobs] ${criados} RDO(s) criado(s) automaticamente para ${hoje}`);
  }
}

async function autoPreencherRDO(db: any, rdoId: number, companyId: number, obraId: number) {
  try {
    const equips = rows(await db.execute(sql`
      SELECT nome, tipo_equipamento as tipo FROM equipment
      WHERE company_id = ${companyId} AND status_equipamento = 'Ativo'
      AND (obra_id = ${obraId} OR obra_id IS NULL)
      LIMIT 50
    `));
    for (const eq of equips) {
      await db.execute(sql`
        INSERT INTO rdo_equipamentos (rdo_id, nome, tipo, situacao) VALUES (${rdoId}, ${eq.nome}, ${eq.tipo || null}, 'operando')
      `);
    }
  } catch (e: any) { console.warn(`[OperacionalJobs] autoPreencherRDO equips ${rdoId}:`, e?.message); }

  try {
    const funcs = rows(await db.execute(sql`
      SELECT funcao, COUNT(*) as qtd FROM employees
      WHERE company_id = ${companyId} AND status = 'Ativo'
      AND (obra_id = ${obraId} OR obra_id IS NULL)
      GROUP BY funcao ORDER BY funcao
    `));
    for (const f of funcs) {
      await db.execute(sql`
        INSERT INTO rdo_mao_obra (rdo_id, tipo, funcao, quantidade, presente)
        VALUES (${rdoId}, 'proprio', ${f.funcao || 'Geral'}, ${parseInt(f.qtd) || 0}, true)
      `);
    }
  } catch (e: any) { console.warn(`[OperacionalJobs] autoPreencherRDO mdo ${rdoId}:`, e?.message); }
}

async function alertaRDOPendente(nivel: "engenheiro" | "gerente") {
  const db = await getDb();
  if (!db) return;
  const hoje = getBrasiliaDate();

  const pendentes = rows(await db.execute(sql`
    SELECT r.id, r.obra_id, r.company_id, r.responsavel_nome,
           o.nome as obra_nome
    FROM rdo_relatorios r
    JOIN obras o ON o.id = r.obra_id
    WHERE r.data = ${hoje} AND r.status != 'finalizado'
  `));

  if (pendentes.length === 0) return;

  for (const rdo of pendentes) {
    const roleFilter = nivel === "engenheiro"
      ? sql`(u.role = 'engenheiro' OR u.role = 'admin_master')`
      : sql`(u.role = 'gerente' OR u.role = 'diretor' OR u.role = 'admin_master')`;

    const destinatarios = rows(await db.execute(sql`
      SELECT DISTINCT u.email, u.name as nome
      FROM users u
      WHERE u.company_id = ${rdo.company_id}
        AND ${roleFilter}
        AND u.email IS NOT NULL AND u.email != ''
    `));

    if (destinatarios.length === 0) continue;

    const horario = nivel === "engenheiro" ? "18:00" : "20:00";
    const urgencia = nivel === "gerente" ? "URGENTE: " : "";

    for (const dest of destinatarios) {
      try {
        await sendEmail({
          to: dest.email,
          subject: `${urgencia}RDO não finalizado - ${rdo.obra_nome} (${hoje})`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #f59e0b; color: white; padding: 16px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">⚠️ RDO Pendente de Finalização</h2>
              </div>
              <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p>Olá <strong>${dest.nome}</strong>,</p>
                <p>O Relatório Diário de Obra (RDO) da obra <strong>${rdo.obra_nome}</strong>
                   do dia <strong>${hoje}</strong> ainda não foi finalizado às <strong>${horario}</strong>.</p>
                ${rdo.responsavel_nome ? `<p>Responsável: <strong>${rdo.responsavel_nome}</strong></p>` : ""}
                ${nivel === "gerente" ? '<p style="color: #dc2626; font-weight: bold;">Este é o segundo alerta. Favor verificar com urgência.</p>' : ""}
                <p>Acesse o sistema para revisar e finalizar o RDO.</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                <p style="color: #6b7280; font-size: 12px;">FC Engenharia — Módulo Operacional</p>
              </div>
            </div>
          `,
        });
      } catch {}
    }
  }

  console.log(`[OperacionalJobs] Alerta ${nivel} enviado para ${pendentes.length} RDO(s) pendente(s)`);
}

async function buscarClimaParaRDOs() {
  const db = await getDb();
  if (!db) return;
  const hoje = getBrasiliaDate();

  const rdosSemClima = rows(await db.execute(sql`
    SELECT r.id, o.latitude, o.longitude
    FROM rdo_relatorios r
    JOIN obras o ON o.id = r.obra_id
    WHERE r.data = ${hoje}
      AND r.clima_manha IS NULL
      AND r.status = 'rascunho'
      AND o.latitude IS NOT NULL AND o.longitude IS NOT NULL
  `));

  if (rdosSemClima.length === 0) return;

  let atualizados = 0;
  for (const rdo of rdosSemClima) {
    try {
      const lat = parseFloat(rdo.latitude);
      const lng = parseFloat(rdo.longitude);
      if (isNaN(lat) || isNaN(lng)) continue;

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=America/Sao_Paulo&forecast_days=1`;
      const resp = await fetch(url);
      if (!resp.ok) { console.warn(`[OperacionalJobs] Open-Meteo HTTP ${resp.status} para RDO ${rdo.id}`); continue; }
      const data = await resp.json();
      const daily = data?.daily;
      if (!daily) continue;

      const tempMax = daily.temperature_2m_max?.[0];
      const tempMin = daily.temperature_2m_min?.[0];
      const precip = daily.precipitation_sum?.[0] || 0;
      const wCode = daily.weathercode?.[0] || 0;

      const clima = weatherCodeToClima(wCode);
      const choveu = precip > 0.5;

      await db.execute(sql`
        UPDATE rdo_relatorios
        SET clima_manha = ${clima},
            clima_tarde = ${clima},
            temperatura_min = ${tempMin},
            temperatura_max = ${tempMax},
            choveu = ${choveu}
        WHERE id = ${rdo.id} AND clima_manha IS NULL
      `);
      atualizados++;
    } catch (e: any) { console.warn(`[OperacionalJobs] Erro clima RDO ${rdo.id}:`, e?.message); }
  }

  if (atualizados > 0) {
    console.log(`[OperacionalJobs] Clima atualizado para ${atualizados}/${rdosSemClima.length} RDO(s)`);
  }
}

function weatherCodeToClima(code: number): string {
  if (code === 0) return "Ensolarado";
  if (code <= 3) return "Parcialmente Nublado";
  if (code <= 49) return "Nublado";
  if (code <= 59) return "Garoa";
  if (code <= 69) return "Chuvoso";
  if (code <= 79) return "Chuvoso";
  if (code <= 99) return "Tempestade";
  return "Nublado";
}
