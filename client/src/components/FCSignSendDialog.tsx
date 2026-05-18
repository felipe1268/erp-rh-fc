import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Users, Loader2, Copy, CheckCircle2, ExternalLink, Send, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: number;
  employeeId: number;
  tipo: string;
  documentTitle: string;
  documentHtml: string;
  empregadoNome: string;
  empregadoCpf?: string;
};

const SOCIO_FELIPE = { nome: "Felipe Costa Alves", cpf: "" };

export default function FCSignSendDialog({ open, onOpenChange, companyId, employeeId, tipo, documentTitle, documentHtml, empregadoNome, empregadoCpf }: Props) {
  const [t1Nome, setT1Nome] = useState("");
  const [t1Cpf, setT1Cpf] = useState("");
  const [t2Nome, setT2Nome] = useState("");
  const [t2Cpf, setT2Cpf] = useState("");
  const [empregadorCpf, setEmpregadorCpf] = useState(SOCIO_FELIPE.cpf);
  const [result, setResult] = useState<{ sessionId: number; signers: Array<{ id: number; role: string; nome: string; link: string }> } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const createMut = trpc.signatures.create.useMutation();

  const reset = () => {
    setT1Nome(""); setT1Cpf(""); setT2Nome(""); setT2Cpf("");
    setResult(null); setCopied(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!t1Nome.trim() || !t2Nome.trim()) {
      toast.error("Informe o nome das duas testemunhas.");
      return;
    }
    try {
      const r = await createMut.mutateAsync({
        companyId,
        employeeId,
        tipo,
        documentTitle,
        documentHtml,
        signers: [
          { role: "empregado", nome: empregadoNome, cpf: empregadoCpf || null },
          { role: "empregador", nome: SOCIO_FELIPE.nome, cpf: empregadorCpf || null },
          { role: "testemunha_1", nome: t1Nome.trim(), cpf: t1Cpf || null },
          { role: "testemunha_2", nome: t2Nome.trim(), cpf: t2Cpf || null },
        ],
      });
      setResult(r);
      toast.success("Sessão FCSign criada! Copie os links e envie pelo WhatsApp.");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar sessão.");
    }
  };

  const copyLink = (link: string, role: string) => {
    const fullUrl = `${window.location.origin}${link}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(role);
    setTimeout(() => setCopied(null), 2000);
    toast.success("Link copiado!");
  };

  const roleLabel: Record<string, string> = {
    empregado: "EMPREGADO(A)",
    empregador: "EMPREGADOR (FC Engenharia)",
    testemunha_1: "Testemunha 1",
    testemunha_2: "Testemunha 2",
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[100vw] h-[100dvh] max-w-none sm:w-[96vw] sm:h-auto sm:max-h-[92dvh] sm:max-w-[680px] p-0 overflow-hidden flex flex-col gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Enviar para Assinatura (FCSign)</DialogTitle>
        </DialogHeader>
        {/* Header gradient */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 text-white px-6 py-5 shadow-md">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-lg">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold leading-tight">FCSign — Enviar para Assinatura</h2>
              <p className="text-blue-100 text-sm mt-0.5">{documentTitle}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {!result ? (
            <div className="max-w-xl mx-auto space-y-4">
              {/* Card EMPREGADO (read-only) */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-700" />
                  <span className="text-xs font-bold uppercase tracking-wide text-emerald-800">Empregado(a)</span>
                </div>
                <div className="p-4 text-sm">
                  <div className="font-semibold text-slate-900">{empregadoNome}</div>
                  {empregadoCpf && <div className="text-xs text-slate-600 mt-0.5">CPF: {empregadoCpf}</div>}
                </div>
              </div>

              {/* Card EMPREGADOR (sócio fixo) */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-700" />
                  <span className="text-xs font-bold uppercase tracking-wide text-blue-800">Empregador (FC Engenharia)</span>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">Sócio responsável</label>
                    <Input value={SOCIO_FELIPE.nome} disabled className="h-9 bg-slate-100" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">CPF (opcional)</label>
                    <Input value={empregadorCpf} onChange={(e) => setEmpregadorCpf(e.target.value)} placeholder="___.___.___-__" className="h-9 bg-white" />
                  </div>
                </div>
              </div>

              {/* Card TESTEMUNHAS */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-2">
                  <Users className="h-4 w-4 text-amber-700" />
                  <span className="text-xs font-bold uppercase tracking-wide text-amber-800">Testemunhas</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
                    <div>
                      <label htmlFor="fcs-t1-nome" className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">Testemunha 1 — Nome *</label>
                      <Input id="fcs-t1-nome" value={t1Nome} onChange={(e) => setT1Nome(e.target.value)} placeholder="Nome completo" className="h-9 bg-white" />
                    </div>
                    <div>
                      <label htmlFor="fcs-t1-cpf" className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">CPF</label>
                      <Input id="fcs-t1-cpf" value={t1Cpf} onChange={(e) => setT1Cpf(e.target.value)} placeholder="___.___.___-__" className="h-9 bg-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
                    <div>
                      <label htmlFor="fcs-t2-nome" className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">Testemunha 2 — Nome *</label>
                      <Input id="fcs-t2-nome" value={t2Nome} onChange={(e) => setT2Nome(e.target.value)} placeholder="Nome completo" className="h-9 bg-white" />
                    </div>
                    <div>
                      <label htmlFor="fcs-t2-cpf" className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">CPF</label>
                      <Input id="fcs-t2-cpf" value={t2Cpf} onChange={(e) => setT2Cpf(e.target.value)} placeholder="___.___.___-__" className="h-9 bg-white" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2 text-xs text-blue-900">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-700" />
                <div>Ao criar a sessão, o sistema gera <b>4 links únicos</b> (um para cada signatário). Você copia e envia manualmente por WhatsApp. Quando todos assinarem, o contrato vai automaticamente para o RAIO-X do colaborador.</div>
              </div>
            </div>
          ) : (
            /* SUCCESS — mostrar links */
            <div className="max-w-xl mx-auto space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-700 mt-0.5" />
                <div>
                  <div className="font-bold text-emerald-900">Sessão #{result.sessionId} criada com sucesso</div>
                  <div className="text-xs text-emerald-800 mt-1">Copie cada link abaixo e envie pelo WhatsApp para o signatário correspondente.</div>
                </div>
              </div>
              {result.signers.map((s) => {
                const fullUrl = `${window.location.origin}${s.link}`;
                const isCopied = copied === s.role;
                return (
                  <div key={s.id} className="bg-white rounded-lg border border-slate-200 shadow-sm p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{roleLabel[s.role] || s.role}</div>
                        <div className="text-sm font-semibold text-slate-900">{s.nome}</div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button type="button" size="sm" variant="outline" onClick={() => window.open(s.link, "_blank")} className="h-8">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir
                        </Button>
                        <Button type="button" size="sm" onClick={() => copyLink(s.link, s.role)} className={`h-8 ${isCopied ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}>
                          {isCopied ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Copiado</> : <><Copy className="h-3.5 w-3.5 mr-1" /> Copiar link</>}
                        </Button>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded truncate">{fullUrl}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-200 px-6 py-3 flex justify-end gap-2">
          {!result ? (
            <>
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={createMut.isPending}>Cancelar</Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={createMut.isPending || !t1Nome.trim() || !t2Nome.trim()}
                className="bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800"
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Criar Sessão & Gerar Links
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => handleClose(false)} className="bg-emerald-600 hover:bg-emerald-700">Concluído</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
