/**
 * Monitor diário de saúde: dispara notificação ao owner quando:
 *  - o backup de dados está atrasado (stale) ou o último falhou; OU
 *  - o código em execução não está no GitHub (github_atrasado) ou falha ao consultar.
 *
 * Dedupe simples em memória (uma notificação por dia por tipo de problema).
 * O alerta visual SEMPRE aparece no painel (não depende deste job).
 */

import { getBackupHealth } from "./backupService";
import { getCodeSyncStatus } from "./codeSyncService";
import { notifyOwner } from "../_core/notification";

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let ultimaChaveNotificada = "";

function chaveDia(): string {
  return new Date().toISOString().slice(0, 10);
}

async function verificar() {
  const problemas: string[] = [];

  try {
    const bh = await getBackupHealth();
    if (bh.alerta) {
      if (bh.motivo === "ultimo_falhou") problemas.push("• O último backup do banco FALHOU.");
      else if (bh.motivo === "sem_backup") problemas.push("• Nenhum backup concluído encontrado.");
      else if (bh.motivo === "stale") {
        problemas.push(`• Backup atrasado: o último concluído tem ~${bh.idadeHoras}h (limite ${bh.staleLimiteHoras}h).`);
      } else if (bh.motivo === "sem_db") {
        problemas.push("• Banco de dados indisponível para verificar o backup.");
      }
    }
  } catch (e: any) {
    console.warn("[SyncMonitor] Falha ao checar backup:", e?.message);
  }

  try {
    const cs = await getCodeSyncStatus();
    if (cs.alerta) {
      if (cs.status === "github_atrasado") {
        problemas.push(
          `• Código não sincronizado: a versão em execução é mais nova que a salva no GitHub (último commit no GitHub há ${cs.diasDesdeGithub ?? "?"} dia(s)).`
        );
      } else if (cs.status === "erro") {
        problemas.push(`• Não foi possível verificar o GitHub${cs.erro ? `: ${cs.erro}` : "."}`);
      }
    }
  } catch (e: any) {
    console.warn("[SyncMonitor] Falha ao checar GitHub:", e?.message);
  }

  if (problemas.length === 0) {
    return;
  }

  const chave = `${chaveDia()}|${problemas.join("|")}`;
  if (chave === ultimaChaveNotificada) {
    return; // já notificou esse mesmo conjunto hoje
  }

  try {
    await notifyOwner({
      title: "Backup & Sincronização — atenção necessária",
      content: [
        "Foram detectados pontos de atenção no backup/sincronização do ERP:",
        "",
        ...problemas,
        "",
        "Verifique em Configurações → Backup & Sincronização.",
      ].join("\n"),
    });
    ultimaChaveNotificada = chave;
    console.log(`[SyncMonitor] Notificação enviada (${problemas.length} problema(s)).`);
  } catch (e: any) {
    console.warn("[SyncMonitor] Falha ao notificar:", e?.message);
  }
}

export function startSyncMonitorJob() {
  if (monitorInterval) return;
  // Primeira verificação após 5min do boot; depois a cada 12h.
  setTimeout(() => {
    verificar().catch((e) => console.error("[SyncMonitor] Erro:", e?.message));
  }, 5 * 60 * 1000);
  monitorInterval = setInterval(() => {
    verificar().catch((e) => console.error("[SyncMonitor] Erro:", e?.message));
  }, 12 * 60 * 60 * 1000);
  console.log("[SyncMonitor] Monitor de backup/sincronização iniciado");
}
