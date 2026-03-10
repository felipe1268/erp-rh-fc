/**
 * Notificação Automática - Prazo de Pagamento de Rescisão (Art. 477 §6º CLT)
 * 
 * Verifica avisos prévios em andamento cujo prazo de pagamento está:
 * - Próximo (3 dias antes): envia alerta preventivo
 * - Vencido: envia alerta urgente
 * 
 * Roda a cada 6 horas junto com o ciclo de verificação do servidor.
 */
import { getDb } from "../db";
import { terminationNotices, employees, companies } from "../../drizzle/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

let rescisaoCheckInterval: NodeJS.Timeout | null = null;

// Rastrear notificações já enviadas para evitar duplicatas (por sessão do servidor)
const notifiedIds = new Set<string>();

async function checkRescisaoDeadlines() {
  const db = await getDb();
  if (!db) return;

  try {
    // Buscar todos os avisos em andamento
    const avisos = await db.select({
      id: terminationNotices.id,
      employeeId: terminationNotices.employeeId,
      companyId: terminationNotices.companyId,
      dataFim: terminationNotices.dataFim,
      previsaoRescisao: terminationNotices.previsaoRescisao,
      status: terminationNotices.status,
    }).from(terminationNotices)
      .where(and(
        eq(terminationNotices.status, 'em_andamento'),
        isNull(terminationNotices.deletedAt),
      ));

    if (avisos.length === 0) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeStr = hoje.toISOString().split('T')[0];

    const alertasProximos: Array<{ aviso: typeof avisos[0]; empNome: string; empresaNome: string; dataLimite: string; diasRestantes: number }> = [];
    const alertasVencidos: Array<{ aviso: typeof avisos[0]; empNome: string; empresaNome: string; dataLimite: string; diasAtraso: number }> = [];

    for (const aviso of avisos) {
      // Extrair dataLimitePagamento do JSON previsaoRescisao
      let dataLimite = '';
      try {
        const prev = JSON.parse(aviso.previsaoRescisao || '{}');
        dataLimite = prev.dataLimitePagamento || '';
      } catch { }

      // Se não tem dataLimitePagamento no JSON, calcular: dataFim + 10 dias (Art. 477 §6º)
      if (!dataLimite && aviso.dataFim) {
        const dt = new Date(aviso.dataFim + 'T00:00:00');
        dt.setDate(dt.getDate() + 10);
        dataLimite = dt.toISOString().split('T')[0];
      }

      if (!dataLimite) continue;

      const dtLimite = new Date(dataLimite + 'T00:00:00');
      const diffMs = dtLimite.getTime() - hoje.getTime();
      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Verificar se já notificou este aviso nesta faixa
      const notifKey = `${aviso.id}-${diffDias <= 0 ? 'vencido' : 'proximo'}`;
      if (notifiedIds.has(notifKey)) continue;

      if (diffDias <= 3 && diffDias > 0) {
        // Prazo próximo (3 dias ou menos)
        const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, aviso.employeeId));
        const [empresa] = await db.select({ nome: companies.nomeFantasia, razao: companies.razaoSocial }).from(companies).where(eq(companies.id, aviso.companyId));
        alertasProximos.push({
          aviso,
          empNome: emp?.nome || 'Funcionário',
          empresaNome: empresa?.nome || empresa?.razao || 'Empresa',
          dataLimite,
          diasRestantes: diffDias,
        });
        notifiedIds.add(notifKey);
      } else if (diffDias <= 0) {
        // Prazo vencido
        const [emp] = await db.select({ nome: employees.nomeCompleto }).from(employees).where(eq(employees.id, aviso.employeeId));
        const [empresa] = await db.select({ nome: companies.nomeFantasia, razao: companies.razaoSocial }).from(companies).where(eq(companies.id, aviso.companyId));
        alertasVencidos.push({
          aviso,
          empNome: emp?.nome || 'Funcionário',
          empresaNome: empresa?.nome || empresa?.razao || 'Empresa',
          dataLimite,
          diasAtraso: Math.abs(diffDias),
        });
        notifiedIds.add(notifKey);
      }
    }

    // Enviar notificações agrupadas
    if (alertasProximos.length > 0) {
      const detalhes = alertasProximos.map(a =>
        `• ${a.empNome} (${a.empresaNome}) - Prazo: ${a.dataLimite.split('-').reverse().join('/')} (${a.diasRestantes} dia${a.diasRestantes > 1 ? 's' : ''} restante${a.diasRestantes > 1 ? 's' : ''})`
      ).join('\n');

      await notifyOwner({
        title: `⚠️ Prazo de Rescisão Próximo - ${alertasProximos.length} aviso(s)`,
        content: `Atenção! Os seguintes avisos prévios têm prazo de pagamento de rescisão se aproximando (Art. 477 §6º CLT - 10 dias corridos após término):\n\n${detalhes}\n\nProvidenciar pagamento para evitar multa do Art. 477 §8º CLT (salário do empregado como penalidade).`,
      });

      console.log(`[RescisaoCheck] ${alertasProximos.length} alerta(s) de prazo próximo enviado(s)`);
    }

    if (alertasVencidos.length > 0) {
      const detalhes = alertasVencidos.map(a =>
        `• ${a.empNome} (${a.empresaNome}) - Prazo vencido em: ${a.dataLimite.split('-').reverse().join('/')} (${a.diasAtraso} dia${a.diasAtraso > 1 ? 's' : ''} de atraso)`
      ).join('\n');

      await notifyOwner({
        title: `🚨 URGENTE: Prazo de Rescisão VENCIDO - ${alertasVencidos.length} aviso(s)`,
        content: `ATENÇÃO URGENTE! Os seguintes avisos prévios têm prazo de pagamento de rescisão VENCIDO (Art. 477 §6º CLT):\n\n${detalhes}\n\nO não pagamento dentro do prazo legal acarreta multa equivalente ao salário do empregado (Art. 477 §8º CLT). Regularizar imediatamente!`,
      });

      console.log(`[RescisaoCheck] ${alertasVencidos.length} alerta(s) de prazo VENCIDO enviado(s)`);
    }

  } catch (e) {
    console.error("[RescisaoCheck] Erro ao verificar prazos:", e);
  }
}

export function startRescisaoCheckJob() {
  if (rescisaoCheckInterval) clearInterval(rescisaoCheckInterval);
  // Verificar a cada 6 horas
  rescisaoCheckInterval = setInterval(checkRescisaoDeadlines, 6 * 60 * 60 * 1000);
  console.log("[RescisaoCheck] Job de verificação de prazos de rescisão iniciado (verifica a cada 6h)");
  // Executar na primeira vez com delay de 60s
  setTimeout(checkRescisaoDeadlines, 60000);
}
