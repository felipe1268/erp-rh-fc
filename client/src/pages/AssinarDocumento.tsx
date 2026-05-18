import { useRoute } from "wouter";
import { useRef, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2, FileText, Users, Building2 } from "lucide-react";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";
import { toast } from "sonner";
import DOMPurify from "dompurify";

const roleLabel: Record<string, string> = {
  empregado: "EMPREGADO(A)",
  empregador: "EMPREGADOR (FC Engenharia)",
  testemunha_1: "Testemunha 1",
  testemunha_2: "Testemunha 2",
};

export default function AssinarDocumento() {
  const [, params] = useRoute("/assinar/:token");
  const token = params?.token || "";
  const padRef = useRef<SignaturePadHandle>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [justSigned, setJustSigned] = useState(false);

  const q = trpc.signatures.getByToken.useQuery({ token }, { enabled: token.length === 64, retry: false });
  const signMut = trpc.signatures.sign.useMutation();
  const utils = trpc.useUtils();

  const handleSign = async () => {
    const dataUrl = padRef.current?.toDataURL();
    if (!dataUrl) { toast.error("Desenhe sua assinatura antes de confirmar."); return; }
    if (!agreed) { toast.error("Confirme a declaração legal."); return; }
    setSubmitting(true);
    try {
      await signMut.mutateAsync({ token, signatureDataUrl: dataUrl, userAgent: navigator.userAgent.substring(0, 500) });
      setJustSigned(true);
      toast.success("Assinatura registrada com sucesso!");
      await utils.signatures.getByToken.invalidate({ token });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao registrar assinatura.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token || token.length !== 64) {
    return <CenteredCard><ErrorBox msg="Link inválido." /></CenteredCard>;
  }
  if (q.isLoading) {
    return <CenteredCard><div className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Carregando documento…</div></CenteredCard>;
  }
  if (q.error || !q.data) {
    return <CenteredCard><ErrorBox msg={q.error?.message || "Documento não encontrado."} /></CenteredCard>;
  }

  const { signer, session, employee, company, allSigners } = q.data;
  const alreadySigned = !!signer.signedAt || justSigned;
  // XSS hardening — sanitiza HTML do documento antes de renderizar (defense in depth)
  const safeHtml = useMemo(() => DOMPurify.sanitize(session.documentHtml, {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "link", "meta", "base"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit", "formaction"],
    ALLOW_DATA_ATTR: false,
  }), [session.documentHtml]);
  const sessionDone = session.status === "completo";
  const sessionCancelled = session.status === "cancelado";

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header institucional FC */}
      <header className="bg-[#1B2A4A] text-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="bg-white/10 p-2 rounded-lg">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight">FCSign — Assinatura Digital</h1>
            <p className="text-blue-100 text-xs">FC Engenharia · MP 2.200-2/2001 · Sessão #{session.id}</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 grid lg:grid-cols-[1fr_360px] gap-6">
        {/* Documento */}
        <section className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-600" />
            <h2 className="font-semibold text-slate-800 text-sm">{session.documentTitle}</h2>
          </div>
          <div className="p-6 max-h-[70vh] overflow-y-auto prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml }} />
        </section>

        {/* Painel lateral */}
        <aside className="space-y-4">
          {/* Identificação */}
          <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Você está assinando como</div>
            <div className="text-xs text-slate-500">{roleLabel[signer.role] || signer.role}</div>
            <div className="text-base font-bold text-slate-900">{signer.nome}</div>
            {signer.cpf && <div className="text-xs text-slate-600 mt-0.5">CPF: {signer.cpf}</div>}
            {employee && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
                <div className="font-semibold text-slate-700">Colaborador</div>
                <div>{employee.nome}</div>
              </div>
            )}
            {company && (
              <div className="mt-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-700 flex items-center gap-1"><Building2 className="h-3 w-3" /> Empresa</div>
                <div>{company.razaoSocial}</div>
                {company.cnpj && <div className="text-slate-500">CNPJ: {company.cnpj}</div>}
              </div>
            )}
          </div>

          {/* Status das assinaturas */}
          <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1"><Users className="h-3 w-3" /> Assinaturas</div>
            <ul className="space-y-1.5">
              {allSigners.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  {s.signedAt ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                  )}
                  <span className="text-slate-500 w-20 flex-shrink-0">{roleLabel[s.role]?.split(" ")[0] || s.role}</span>
                  <span className={s.signedAt ? "text-slate-900 font-medium" : "text-slate-500"}>{s.nome}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Área de assinatura */}
          {sessionCancelled ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-800 font-semibold text-sm"><AlertTriangle className="h-4 w-4" /> Solicitação cancelada</div>
              <p className="text-xs text-red-700 mt-1">Esta sessão foi cancelada pelo emissor. Entre em contato com o RH.</p>
            </div>
          ) : alreadySigned ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm"><CheckCircle2 className="h-4 w-4" /> Sua assinatura foi registrada</div>
              <p className="text-xs text-emerald-700 mt-1">
                {sessionDone || justSigned
                  ? "Obrigado! O documento foi arquivado no RAIO-X do colaborador."
                  : "Aguardando as demais assinaturas para conclusão."}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Sua assinatura</div>
              <SignaturePad ref={padRef} height={180} disabled={submitting} />
              <label className="flex items-start gap-2 mt-3 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
                <span>Declaro ser <b>{signer.nome}</b> e que esta assinatura tem validade jurídica nos termos da MP 2.200-2/2001.</span>
              </label>
              <Button
                onClick={handleSign}
                disabled={submitting || !agreed}
                className="w-full mt-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
              >
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                Confirmar Assinatura
              </Button>
            </div>
          )}
        </aside>
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-6 text-center text-[11px] text-slate-500">
        FCSign · FC Engenharia · Sistema interno de assinatura eletrônica · {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white rounded-lg shadow border border-slate-200 p-6 max-w-md w-full">{children}</div>
    </div>
  );
}
function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="text-center">
      <div className="bg-red-50 p-4 rounded-full inline-block mb-3"><AlertTriangle className="h-8 w-8 text-red-600" /></div>
      <h2 className="text-lg font-bold text-slate-900">Erro ao abrir documento</h2>
      <p className="text-sm text-slate-600 mt-1">{msg}</p>
    </div>
  );
}
