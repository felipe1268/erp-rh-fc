import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ShieldCheck, CheckCircle2, Clock, Copy, ExternalLink, Eye, Download, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Rev. 2129 — Helper defensivo de parsing de timestamp do Postgres p/ iOS
// Safari. Drizzle/superjson às vezes devolve TIMESTAMP como string crua
// "YYYY-MM-DD HH:MM:SS.fff" (espaço, não T). iOS Safari rejeita esse
// formato com "RangeError: The string did not match the expected pattern"
// e o erro sobe até o toast global (parecendo erro da última mutation).
// Padrão idêntico ao usado em FinanceiroContasAPagar.tsx L154 e
// PlanejamentoDetalhe.tsx L83 (Rev. 1848+).
function fmtTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    const safe = typeof ts === "string" ? ts.replace(" ", "T") : ts;
    const d = new Date(safe);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString("pt-BR");
  } catch {
    return String(ts);
  }
}

type Props = {
  companyId: number;
  employeeId: number;
  empNome: string;
  isAdminMaster: boolean;
  onEnviar: () => void;
  // Rev. 2682 — generalizado: além do Contrato de Experiência, o mesmo painel
  // reativo serve qualquer documento FCSign por colaborador (ex.: Termo de
  // Isenção Art. 62). `tipo` casa com `signatureSessions.tipo`; `docLabel` é o
  // rótulo humano usado nos textos/nome do arquivo baixado. Defaults preservam
  // o comportamento original (contrato_experiencia).
  tipo?: string;
  docLabel?: string;
};

// Rev. 2122 — Painel de status da assinatura FCSign do Contrato de Experiência.
// Substitui o botão estático "Enviar para Assinatura" por um painel reativo:
//  - Sem sessão (ou todas canceladas) → mostra botão "Enviar para Assinatura" (delega ao parent).
//  - Sessão pendente/em_andamento → "Aguardando assinaturas" + lista signatários
//    (com link de assinatura copiável) + admin_master pode cancelar.
//  - Sessão completa → "✅ Documento assinado" + Visualizar + Baixar + admin_master
//    pode "Apagar para nova emissão" (soft-delete via signatures.adminDelete).
export default function FCSignContratoExperienciaPanel({ companyId, employeeId, empNome, isAdminMaster, onEnviar, tipo = "contrato_experiencia", docLabel = "Contrato de Experiência" }: Props) {
  const q = trpc.signatures.getForEmployeeTipo.useQuery(
    { companyId, employeeId, tipo },
    { enabled: !!companyId && !!employeeId, staleTime: 30 * 1000 }
  );
  const adminDeleteMut = trpc.signatures.adminDelete.useMutation();
  const [copied, setCopied] = useState<string | null>(null);

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Verificando assinatura...
      </div>
    );
  }

  const sess = q.data;

  if (!sess) {
    return (
      <Button
        type="button"
        size="sm"
        className="bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white border-0"
        onClick={onEnviar}
      >
        <ShieldCheck className="h-4 w-4 mr-1" /> Enviar para Assinatura (FCSign)
      </Button>
    );
  }

  const copyLink = async (token: string, who: string) => {
    const url = `${window.location.origin}/assinar/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      toast.success(`Link de ${who} copiado.`);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const handleAdminDelete = () => {
    if (!isAdminMaster) return;
    const msg = sess.status === "completo"
      ? `Apagar este ${docLabel} assinado de ${empNome}? Isso vai liberar uma NOVA emissão. O documento atual será removido da RAIO-X (soft-delete).`
      : `Cancelar a sessão de assinatura em andamento de ${empNome}? Os links enviados deixarão de funcionar.`;
    if (!window.confirm(msg)) return;
    adminDeleteMut.mutate(
      { companyId, id: sess.id },
      {
        onSuccess: () => {
          toast.success(sess.status === "completo" ? "Documento removido. Nova emissão liberada." : "Sessão cancelada.");
          q.refetch();
        },
        onError: (err) => toast.error(err.message || "Falha ao apagar."),
      }
    );
  };

  // STATUS: COMPLETO
  if (sess.status === "completo") {
    return (
      <div className="w-full rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 px-4 py-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div>
              <div className="font-semibold text-sm text-emerald-800 dark:text-emerald-300">{docLabel} assinado</div>
              <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                Todas as partes assinaram. Documento arquivado na RAIO-X do colaborador.
                {sess.completedAt && (
                  <> · Concluído em {fmtTs(sess.completedAt)}</>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {sess.finalDocumentUrl && (
              <>
                <Button
                  type="button" size="sm" variant="outline"
                  className="border-emerald-400 text-emerald-700 hover:bg-emerald-100"
                  onClick={() => window.open(sess.finalDocumentUrl!, "_blank", "noopener")}
                >
                  <Eye className="h-4 w-4 mr-1" /> Visualizar
                </Button>
                <Button
                  type="button" size="sm" variant="outline"
                  className="border-emerald-400 text-emerald-700 hover:bg-emerald-100"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = sess.finalDocumentUrl!;
                    a.download = `${docLabel.replace(/\s+/g, "_")}_${empNome.replace(/\s+/g, "_")}.html`;
                    a.target = "_blank";
                    a.rel = "noopener";
                    document.body.appendChild(a); a.click(); a.remove();
                  }}
                >
                  <Download className="h-4 w-4 mr-1" /> Baixar
                </Button>
              </>
            )}
            {isAdminMaster && (
              <Button
                type="button" size="sm" variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                disabled={adminDeleteMut.isPending}
                onClick={handleAdminDelete}
              >
                {adminDeleteMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Apagar p/ nova emissão
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // STATUS: PENDENTE / EM_ANDAMENTO
  const signers = (sess.signers || []) as Array<{ id: number; role: string; ordem: number; nome: string; token: string; signedAt: string | null }>;
  const pendentes = signers.filter(s => !s.signedAt).length;
  const assinados = signers.length - pendentes;
  return (
    <div className="w-full rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <div className="font-semibold text-sm text-amber-800 dark:text-amber-300">
              Aguardando assinaturas ({assinados}/{signers.length})
            </div>
            <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Já existe uma sessão FCSign em andamento p/ este contrato. Não é possível reemitir enquanto ela estiver ativa.
              {sess.createdAt && (
                <> · Criada em {fmtTs(sess.createdAt)}</>
              )}
            </div>
          </div>
        </div>
        {isAdminMaster && (
          <Button
            type="button" size="sm" variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50"
            disabled={adminDeleteMut.isPending}
            onClick={handleAdminDelete}
          >
            {adminDeleteMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
            Cancelar sessão
          </Button>
        )}
      </div>
      <div className="mt-3 space-y-1.5">
        {signers.map(s => {
          const sigUrl = `${window.location.origin}/assinar/${s.token}`;
          const done = !!s.signedAt;
          return (
            <div key={s.id} className="flex items-center justify-between gap-2 text-xs bg-white dark:bg-amber-900/20 rounded px-2 py-1.5 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2 min-w-0">
                {done
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  : <Clock className="h-4 w-4 text-amber-600 shrink-0" />}
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    <span className="uppercase text-[10px] tracking-wider text-muted-foreground mr-1">{s.ordem}ª · {s.role}</span>
                    {s.nome}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {done ? `Assinou em ${fmtTs(s.signedAt)}` : "Pendente"}
                  </div>
                </div>
              </div>
              {!done && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button" size="sm" variant="ghost" className="h-7 px-2"
                    title="Copiar link"
                    onClick={() => copyLink(s.token, s.nome)}
                  >
                    {copied === s.token ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  </Button>
                  <Button
                    type="button" size="sm" variant="ghost" className="h-7 px-2"
                    title="Abrir em nova aba"
                    onClick={() => window.open(sigUrl, "_blank", "noopener")}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
