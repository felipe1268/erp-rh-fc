import { useRoute } from "wouter";
import { useRef, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2, FileText, Users, Building2, ZoomIn, ZoomOut, Printer, Maximize2 } from "lucide-react";
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
  const [zoom, setZoom] = useState(1);

  const q = trpc.signatures.getByToken.useQuery({ token }, { enabled: token.length === 64, retry: false });
  const signMut = trpc.signatures.sign.useMutation();
  const utils = trpc.useUtils();

  // XSS hardening — sanitiza HTML do documento antes de renderizar (defense in depth).
  // IMPORTANTE: useMemo deve vir ANTES de qualquer early return pra manter a ordem dos hooks
  // estável entre renders (regra dos hooks). Por isso usamos optional chaining no input.
  const safeHtml = useMemo(() => DOMPurify.sanitize(q.data?.session?.documentHtml || "", {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "link", "meta", "base"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit", "formaction"],
    ALLOW_DATA_ATTR: false,
  }), [q.data?.session?.documentHtml]);

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
        {/* Documento — visualização tipo PDF (página A4 com toolbar) */}
        <section className="bg-slate-700 rounded-lg shadow-lg border border-slate-300 overflow-hidden flex flex-col">
          {/* Toolbar tipo viewer de PDF */}
          <div className="bg-slate-800 text-slate-100 px-4 py-2 flex items-center gap-3 text-xs">
            <FileText className="h-4 w-4 text-slate-300 flex-shrink-0" />
            <h2 className="font-medium truncate flex-1">{session.documentTitle}</h2>
            <div className="flex items-center gap-1 bg-slate-700 rounded-md px-1 py-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))}
                className="p-1 hover:bg-slate-600 rounded transition"
                aria-label="Diminuir zoom"
                title="Diminuir zoom"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="px-1.5 text-[11px] tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
                className="p-1 hover:bg-slate-600 rounded transition"
                aria-label="Aumentar zoom"
                title="Aumentar zoom"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="p-1 hover:bg-slate-600 rounded transition"
                aria-label="Resetar zoom"
                title="Tamanho real"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 rounded-md px-2 py-1 transition"
              title="Imprimir ou salvar PDF"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Imprimir / PDF</span>
            </button>
          </div>

          {/* Área de visualização — fundo escuro, página A4 branca centralizada */}
          <div className="bg-slate-600 overflow-auto" style={{ maxHeight: "75vh" }}>
            <div className="flex justify-center py-6 px-4 print:p-0 print:bg-white" style={{ minHeight: "100%" }}>
              <div
                id="fcsign-pdf-page"
                className="bg-white shadow-2xl print:shadow-none origin-top"
                style={{
                  width: "210mm",
                  minHeight: "297mm",
                  padding: "10mm 18mm 20mm 18mm",
                  transform: `scale(${zoom})`,
                  transformOrigin: "top center",
                  marginBottom: zoom > 1 ? `${(zoom - 1) * 297}mm` : 0,
                  fontFamily: "'Times New Roman', Times, Georgia, serif",
                  fontSize: "12pt",
                  lineHeight: 1.5,
                  color: "#111",
                }}
              >
                <div
                  className="fcsign-document-body"
                  dangerouslySetInnerHTML={{ __html: safeHtml }}
                />
              </div>
            </div>
          </div>
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

      <footer className="max-w-5xl mx-auto px-4 py-6 text-center text-[11px] text-slate-500 print:hidden">
        FCSign · FC Engenharia · Sistema interno de assinatura eletrônica · {new Date().getFullYear()}
      </footer>

      {/* Estilos do documento FCSign — scopados a .fcsign-document-body.
          IMPORTANTE: aplicamos AQUI no JSX (não dentro do HTML sanitizado) pra garantir
          que o DOMPurify não interfira. Cobre tipografia + layout do header + faixa azul. */}
      <style>{`
        .fcsign-document-body { color: #0f172a; }
        .fcsign-document-body p { margin: 0 0 10px 0; text-align: justify; text-justify: inter-word; hyphens: auto; -webkit-hyphens: auto; }
        .fcsign-document-body strong, .fcsign-document-body .destaque { font-weight: 700; color: #0f172a; }
        .fcsign-document-body .header { margin: 0 0 22px 0; border-bottom: 3px solid #1B2A4A; padding-bottom: 14px; }
        .fcsign-document-body .header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        .fcsign-document-body .header-table td { vertical-align: middle; padding: 0; }
        .fcsign-document-body .header-table td.logo-cell { width: 110px; padding-right: 18px; }
        .fcsign-document-body .header-table img.logo { display: block; height: 80px; width: auto; max-width: 100px; object-fit: contain; }
        .fcsign-document-body .header-table .nome { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 15pt; font-weight: 800; color: #1B2A4A; margin: 0 0 4px 0; letter-spacing: .3px; line-height: 1.15; }
        .fcsign-document-body .header-table .cnpj, .fcsign-document-body .header-table .end { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 9.5pt; color: #475569; margin: 2px 0 0 0; line-height: 1.35; }
        .fcsign-document-body .title-bar { background: #1B2A4A !important; color: #fff !important; padding: 12px 18px; text-align: center; border-radius: 3px; margin: 10px 0 4px 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .fcsign-document-body .title-bar .titulo { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 13pt; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; display: block; color: #fff; }
        .fcsign-document-body .title-bar .sub { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 9pt; font-weight: 400; display: block; margin-top: 4px; letter-spacing: .3px; opacity: .92; color: #fff; }
        .fcsign-document-body .clausula { margin-top: 16px; }
        .fcsign-document-body .clausula-title { font-weight: 700; text-transform: uppercase; margin: 0 0 6px 0; color: #1B2A4A; font-size: 11.5pt; letter-spacing: .3px; border-left: 3px solid #1B2A4A; padding-left: 8px; text-align: left; }
        .fcsign-document-body .assinaturas { margin-top: 50px; display: table; width: 100%; table-layout: fixed; page-break-inside: avoid; }
        .fcsign-document-body .assinaturas .assinatura { display: table-cell; text-align: center; padding: 0 18px; vertical-align: top; }
        .fcsign-document-body .assinaturas .linha { border-top: 1px solid #0f172a; padding-top: 6px; margin-top: 56px; font-size: 10.5pt; font-weight: 600; text-align: center; }
        .fcsign-document-body .assinaturas .linha small { display: block; font-weight: 400; color: #475569; margin-top: 2px; font-size: 9pt; }

        /* Garante cores de fundo no print (faixa azul) em todos os browsers */
        #fcsign-pdf-page, #fcsign-pdf-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        @media print {
          body * { visibility: hidden !important; }
          #fcsign-pdf-page, #fcsign-pdf-page * { visibility: visible !important; }
          #fcsign-pdf-page {
            position: absolute !important;
            top: 0 !important; left: 0 !important;
            transform: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            width: 100% !important; min-height: auto !important;
            padding: 15mm !important;
          }
          @page { size: A4; margin: 0; }
        }
      `}</style>
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
