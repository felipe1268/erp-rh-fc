// ============================================================================
// EmpregadorAssinaturaSection — configuração de co-assinatura institucional
// do sócio administrador para documentos recorrentes padrão.
// Azul/ice-blue/branco/cinza — sem verde nesta UI.
//
// API canônica:
//   rhDocumentos.employerSigStatus({ companyId })
//     → { configurada, autoSignAtivo, socioAdminEmployeeId, socioAdminNome,
//          canManage, updatedAt, configuradoPorNome }
//   rhDocumentos.saveEmployerSigConfig({ companyId, socioAdminEmployeeId,
//     assinaturaBase64, autoSignAtivo, consentimentoConfirmado })
//   rhDocumentos.pendentesAssinaturaEmpregador({ companyId })
//     → { docs: [...], total: number }
//
// NOTA: employerSigStatus NÃO devolve a imagem PNG — mostramos apenas o
//       estado de auditoria (configurada/não configurada, quem atualizou).
// ============================================================================
import { useRef, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { toast } from "sonner";
import {
  Building2, Info, Loader2, Save, ShieldCheck, ToggleLeft, ToggleRight,
  AlertTriangle, CheckCircle2, Clock, UserCircle2,
} from "lucide-react";

interface Props {
  companyId: number;
  /** employeeId do sócio cujo card está aberto — enviado como socioAdminEmployeeId */
  socioAdminEmployeeId: number;
  isCurrentAdmin: boolean;
}

export function EmpregadorAssinaturaSection({ companyId, socioAdminEmployeeId, isCurrentAdmin }: Props) {
  const padRef = useRef<SignaturePadHandle>(null);

  // ── Queries (safe optional-cast pois tipagem gerada pode estar atrasada) ──
  const statusQ = (trpc as any).rhDocumentos?.employerSigStatus?.useQuery
    ? (trpc as any).rhDocumentos.employerSigStatus.useQuery(
        { companyId },
        { enabled: !!companyId && isCurrentAdmin }
      )
    : { data: null, isLoading: false, refetch: () => {} };

  const pendentesQ = (trpc as any).rhDocumentos?.pendentesAssinaturaEmpregador?.useQuery
    ? (trpc as any).rhDocumentos.pendentesAssinaturaEmpregador.useQuery(
        { companyId },
        { enabled: !!companyId && isCurrentAdmin }
      )
    : { data: null, isLoading: false };

  // ── Mutation ──
  const salvarMut = (trpc as any).rhDocumentos?.saveEmployerSigConfig?.useMutation
    ? (trpc as any).rhDocumentos.saveEmployerSigConfig.useMutation({
        onSuccess: () => {
          toast.success("Configuração de assinatura institucional salva!");
          statusQ.refetch();
          padRef.current?.clear();
          setNovaAssinatura(null);
          setConsentimento(false);
        },
        onError: (e: any) => toast.error(e?.message || "Erro ao salvar configuração."),
      })
    : { mutate: () => {}, isPending: false };

  // ── Estado local ──
  const cfg = statusQ.data as any;
  const [autoSignAtivo, setAutoSignAtivo] = useState<boolean>(false);
  const [consentimento, setConsentimento] = useState(false);
  const [novaAssinatura, setNovaAssinatura] = useState<string | null>(null);

  // Sincroniza toggle ao carregar
  useEffect(() => {
    if (cfg != null) {
      setAutoSignAtivo(!!cfg.autoSignAtivo);
    }
  }, [cfg]);

  if (!isCurrentAdmin) return null;

  const pendingTotal: number = (pendentesQ.data as any)?.total ?? 0;
  // "Configurada" vem do campo booleano do status — nunca do PNG
  const configurada: boolean = !!cfg?.configurada;
  const podeSubmit = !!novaAssinatura && consentimento;

  const handleSalvar = () => {
    if (!novaAssinatura) {
      toast.error("Registre a assinatura institucional antes de salvar.");
      return;
    }
    if (!consentimento) {
      toast.error("Você precisa aceitar o termo de autorização.");
      return;
    }
    (salvarMut as any).mutate({
      companyId,
      socioAdminEmployeeId,
      assinaturaBase64: novaAssinatura,
      autoSignAtivo,
      consentimentoConfirmado: true,
    });
  };

  return (
    <div className="mt-5 rounded-2xl overflow-hidden border border-blue-200 shadow-sm">
      {/* Cabeçalho azul */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/20">
            <Building2 className="w-5 h-5" />
          </span>
          <div>
            <h4 className="text-base font-semibold leading-tight">Assinatura Institucional do Empregador</h4>
            <p className="text-sm text-white/85 leading-tight">
              Co-assinatura do sócio administrador em documentos padrão após assinatura do colaborador.
            </p>
          </div>
        </div>
      </div>

      {/* Explicação */}
      <div className="bg-blue-50 px-5 py-3 flex items-start gap-2 text-sm text-blue-900 border-b border-blue-100">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600" />
        <p>
          Aplica-se <strong>somente</strong> em documentos recorrentes padrão (ficha de registro,
          termos, regulamentos etc.) — <strong>somente após</strong> a assinatura do colaborador.
          <strong> Contratos CLT/Experiência</strong> e documentos individuais
          <strong> nunca</strong> entram neste fluxo e continuam exigindo assinatura manual.
        </p>
      </div>

      <div className="bg-white px-5 py-4 space-y-5">
        {statusQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando configuração…
          </div>
        ) : (
          <>
            {/* ── Estado de auditoria ── */}
            <div className="rounded-lg border border-blue-100 bg-blue-50/40 px-4 py-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {configurada ? (
                  <span className="inline-flex items-center gap-1.5 text-blue-800 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" /> Assinatura configurada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-700 font-semibold">
                    <AlertTriangle className="w-4 h-4" /> Assinatura ainda não configurada
                  </span>
                )}
                {pendingTotal > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    <Clock className="w-3 h-3" /> {pendingTotal} doc(s) aguardando co-assinatura
                  </span>
                )}
              </div>
              {cfg?.updatedAt && (
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Última atualização: {new Date(cfg.updatedAt).toLocaleString("pt-BR")}
                  {cfg.configuradoPorNome && (
                    <span className="inline-flex items-center gap-1">
                      <UserCircle2 className="w-3 h-3" /> {cfg.configuradoPorNome}
                    </span>
                  )}
                </p>
              )}
              {cfg?.socioAdminNome && (
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <UserCircle2 className="w-3 h-3" /> Responsável: {cfg.socioAdminNome}
                </p>
              )}
            </div>

            {/* ── Pad de assinatura (sempre fresh — não exibimos PNG salvo) ── */}
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">
                {configurada
                  ? "Registre nova assinatura para substituir a atual:"
                  : "Registre a assinatura institucional:"}
              </p>
              <SignaturePad
                ref={padRef}
                height={130}
                label=""
                onChange={(v) => setNovaAssinatura(v)}
              />
              {novaAssinatura && (
                <button
                  type="button"
                  onClick={() => { padRef.current?.clear(); setNovaAssinatura(null); }}
                  className="mt-1 text-[11px] text-slate-400 hover:text-rose-600 flex items-center gap-1"
                >
                  ✕ Limpar assinatura
                </button>
              )}
            </div>

            {/* ── Toggle assinatura automática ── */}
            <div className="flex items-start gap-3 p-3 rounded-xl border border-blue-100 bg-blue-50/40">
              <button
                type="button"
                onClick={() => setAutoSignAtivo(v => !v)}
                className="mt-0.5 text-blue-700 flex-shrink-0"
                aria-label="Alternar assinatura automática"
              >
                {autoSignAtivo
                  ? <ToggleRight className="w-7 h-7" />
                  : <ToggleLeft className="w-7 h-7 text-slate-400" />}
              </button>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {autoSignAtivo ? "Assinatura automática ativada" : "Assinatura automática desativada"}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {autoSignAtivo
                    ? "Documentos padrão são co-assinados automaticamente após o colaborador assinar."
                    : "Os documentos entrarão em fila e a co-assinatura em lote deve ser feita manualmente em Documentos do Colaborador."}
                </p>
              </div>
            </div>

            {/* ── Termo de autorização ── */}
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={consentimento}
                onCheckedChange={(v) => setConsentimento(!!v)}
                className="mt-0.5 data-[state=checked]:bg-blue-700 data-[state=checked]:border-blue-700"
              />
              <span className="text-slate-700 leading-snug">
                Autorizo o uso desta assinatura digital como co-assinatura institucional do empregador
                nos documentos recorrentes padrão, conforme explicado acima. Confirmo que sou o
                representante legal da empresa e que esta assinatura tem validade jurídica (MP 2.200-2/2001).
              </span>
            </label>

            {/* ── Aviso de segurança ── */}
            <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
              <span>
                A assinatura é armazenada criptografada e registrada em log de auditoria a cada uso.
                O acesso é restrito ao sócio administrador designado.
              </span>
            </div>

            {/* ── Botão salvar ── */}
            <div className="flex justify-end">
              <Button
                size="sm"
                className="h-9 px-4 gap-2 bg-blue-700 hover:bg-blue-800 text-white"
                disabled={(salvarMut as any).isPending || !podeSubmit}
                onClick={handleSalvar}
              >
                {(salvarMut as any).isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando…</>
                  : <><Save className="w-3.5 h-3.5" /> Salvar configuração</>}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
