import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Users, Loader2, Copy, CheckCircle2, ExternalLink, Send, Lock, Building2, FileSignature } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { buildContratoPjSignHtml } from "@/lib/contratoPjDocument";
import { useDocumentMargins } from "@/hooks/useDocumentMargins";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contratoId: number;
  geradoPor?: string;
};

// REGRA DE NEGÓCIO (definida pelo user em 2026-05-18):
// Felipe Costa Alves é o ÚNICO sócio autorizado a assinar QUALQUER documento
// da FC Engenharia. Aqui ele assina como CONTRATANTE. Nome/CPF travados.
const FELIPE_SOCIO = { nome: "FELIPE COSTA ALVES", cpf: "362.506.888-54" } as const;

function maskCpf(v: string): string {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const roleLabel: Record<string, string> = {
  contratado: "CONTRATADA (Prestador)",
  contratante: "CONTRATANTE (FC Engenharia)",
  testemunha_1: "Testemunha 1",
  testemunha_2: "Testemunha 2",
};

export default function FCSignPJSendDialog({ open, onOpenChange, contratoId, geradoPor }: Props) {
  const documentMargins = useDocumentMargins();
  const [t1Nome, setT1Nome] = useState("");
  const [t1Cpf, setT1Cpf] = useState("");
  const [t2Nome, setT2Nome] = useState("");
  const [t2Cpf, setT2Cpf] = useState("");
  const [result, setResult] = useState<{ sessionId: number; signers: Array<{ id: number; role: string; nome: string; link: string }> } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const contratoQ = (trpc as any).pj.contratos.getById.useQuery({ id: contratoId }, { enabled: open && contratoId > 0 });
  const contrato = contratoQ.data;
  const modeloQ = trpc.pj.modeloContrato.useQuery(
    { companyId: Number((contrato as any)?.companyId || 0) },
    { enabled: open && !!(contrato as any)?.companyId }
  );
  const createMut = trpc.signatures.create.useMutation();

  const prestadorNome = contrato?.razaoSocialPrestador || contrato?.employeeName || "Prestador";
  const prestadorCnpj = contrato?.cnpjPrestador || "";

  const reset = () => {
    setT1Nome(""); setT1Cpf(""); setT2Nome(""); setT2Cpf("");
    setResult(null); setCopied(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!contrato) { toast.error("Contrato ainda carregando."); return; }
    const modeloHtml = modeloQ.data?.modeloHtml || null;
    const modelo = modeloQ.data?.modelo || "";
    if (!modeloHtml && !modelo) { toast.error("Modelo de contrato não configurado. Configure em Configurações → Templates de Documentos → Contrato PJ."); return; }
    try {
      const documentHtml = buildContratoPjSignHtml({
        contrato,
        modelo,
        modeloHtml,
        contratanteNome: FELIPE_SOCIO.nome,
        geradoPor: geradoPor || "Sistema",
        margins: documentMargins,
      });
      const signers: Array<{ role: "contratado" | "contratante" | "testemunha_1" | "testemunha_2"; nome: string; cpf: string | null }> = [
        // Ordem PJ: prestador assina 1º, FC (CONTRATANTE) valida 2º.
        { role: "contratado", nome: prestadorNome, cpf: null },
        { role: "contratante", nome: FELIPE_SOCIO.nome, cpf: FELIPE_SOCIO.cpf },
      ];
      if (t1Nome.trim()) signers.push({ role: "testemunha_1", nome: t1Nome.trim(), cpf: t1Cpf || null });
      if (t2Nome.trim()) signers.push({ role: "testemunha_2", nome: t2Nome.trim(), cpf: t2Cpf || null });

      const r = await createMut.mutateAsync({
        companyId: Number(contrato.companyId),
        employeeId: Number(contrato.employeeId),
        tipo: "contrato_pj",
        documentTitle: `Contrato PJ ${contrato.numeroContrato || ""} — ${prestadorNome}`.trim(),
        documentHtml,
        signers,
        observacoes: `contrato_pj:${contratoId}`,
      });
      setResult(r);
      toast.success("Sessão FCSign criada! Copie os links e envie aos signatários.");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar sessão de assinatura.");
    }
  };

  const copyLink = (link: string, role: string) => {
    const fullUrl = `${window.location.origin}${link}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(role);
    setTimeout(() => setCopied(null), 2000);
    toast.success("Link copiado!");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        resizable={false}
        className="!w-[100vw] !max-w-none !h-[100dvh] !max-h-[100dvh] !rounded-none !p-0 !top-0 !left-0 !translate-x-0 !translate-y-0 overflow-hidden flex flex-col gap-0"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Enviar Contrato PJ para Assinatura (FCSign)</DialogTitle>
        </DialogHeader>
        {/* Header gradient */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 text-white px-6 py-5 shadow-md">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-lg">
              <FileSignature className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold leading-tight">FCSign — Contrato PJ para Assinatura</h2>
              <p className="text-blue-100 text-sm mt-0.5">
                {contrato ? `${contrato.numeroContrato || "S/N"} — ${prestadorNome}` : "Carregando contrato…"}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {contratoQ.isLoading ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando contrato…
            </div>
          ) : !result ? (
            <div className="space-y-4 max-w-6xl mx-auto w-full">
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-start gap-2 text-xs text-indigo-900">
                <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0 text-indigo-700" />
                <div>
                  <b>Fluxo sequencial:</b> a CONTRATADA (prestador) assina em 1º; em seguida a CONTRATANTE (FC Engenharia). Testemunhas, se houver, assinam ao final.
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* CONTRATADA (Prestador) */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-emerald-700" />
                    <span className="text-xs font-bold uppercase tracking-wide text-emerald-800">Contratada (Prestador)</span>
                    <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto">1ª</span>
                  </div>
                  <div className="p-4 text-sm">
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">Razão social / Nome</label>
                    <Input value={prestadorNome} disabled className="h-9 bg-slate-100" />
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block mt-3">CNPJ</label>
                    <Input value={prestadorCnpj || ""} disabled className="h-9 bg-slate-100" placeholder="—" />
                  </div>
                </div>

                {/* CONTRATANTE (FC) */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-blue-700" />
                    <span className="text-xs font-bold uppercase tracking-wide text-blue-800">Contratante (FC Engenharia)</span>
                    <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto">2ª</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 flex items-center gap-1">
                        Sócio responsável
                        <Lock className="h-3 w-3 text-slate-400" />
                        <span className="text-slate-400 normal-case font-normal ml-1">· fixo (única assinatura autorizada)</span>
                      </label>
                      <Input value={FELIPE_SOCIO.nome} disabled className="h-9 bg-slate-100 font-medium" />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">CPF</label>
                      <Input value={FELIPE_SOCIO.cpf} disabled className="h-9 bg-slate-100" />
                    </div>
                    <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-2.5 py-2 leading-tight">
                      <ShieldCheck className="h-3 w-3 inline mr-1" />
                      Por política da FC Engenharia, <b>somente Felipe Costa Alves</b> pode assinar como CONTRATANTE.
                    </p>
                  </div>
                </div>
              </div>

              {/* TESTEMUNHAS */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-2">
                  <Users className="h-4 w-4 text-amber-700" />
                  <span className="text-xs font-bold uppercase tracking-wide text-amber-800">Testemunhas (opcional)</span>
                </div>
                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2 lg:border-r lg:border-slate-100 lg:pr-4">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Testemunha 1</div>
                    <div>
                      <label htmlFor="pj-t1-nome" className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">Nome completo <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
                      <Input id="pj-t1-nome" value={t1Nome} onChange={(e) => setT1Nome(e.target.value)} placeholder="Ex.: João da Silva" className="h-9 bg-white" />
                    </div>
                    <div>
                      <label htmlFor="pj-t1-cpf" className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">CPF <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
                      <Input id="pj-t1-cpf" value={t1Cpf} onChange={(e) => setT1Cpf(maskCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} className="h-9 bg-white" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Testemunha 2</div>
                    <div>
                      <label htmlFor="pj-t2-nome" className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">Nome completo <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
                      <Input id="pj-t2-nome" value={t2Nome} onChange={(e) => setT2Nome(e.target.value)} placeholder="Ex.: Maria Souza" className="h-9 bg-white" />
                    </div>
                    <div>
                      <label htmlFor="pj-t2-cpf" className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">CPF <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
                      <Input id="pj-t2-cpf" value={t2Cpf} onChange={(e) => setT2Cpf(maskCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} className="h-9 bg-white" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2 text-xs text-blue-900">
                <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-700" />
                <div>Ao criar a sessão, o sistema gera <b>um link único por signatário</b>. Copie e envie manualmente (ex.: WhatsApp). As assinaturas têm validade jurídica nos termos da MP 2.200-2/2001.</div>
              </div>
            </div>
          ) : (
            /* SUCCESS — links */
            <div className="space-y-3 max-w-6xl mx-auto w-full">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-700 mt-0.5" />
                <div>
                  <div className="font-bold text-emerald-900">Sessão #{result.sessionId} criada com sucesso</div>
                  <div className="text-xs text-emerald-800 mt-1">Copie cada link abaixo e envie ao signatário correspondente.</div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-200 px-6 py-3 flex justify-end gap-2">
          {!result ? (
            <>
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={createMut.isPending}>Cancelar</Button>
              <Button type="button" variant="outline" className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50" onClick={() => window.open(`/contrato-pj/${contratoId}`, "_blank")}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Prévia do Contrato
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={createMut.isPending || contratoQ.isLoading || !contrato}
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
