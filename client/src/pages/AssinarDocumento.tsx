import { useRoute } from "wouter";
import { useRef, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2, FileText, Users, Building2, ZoomIn, ZoomOut, Printer, Maximize2, Eye, X, PenLine, Hourglass, RotateCcw, ChevronDown } from "lucide-react";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";
import { toast } from "sonner";
import DOMPurify from "dompurify";

const roleLabel: Record<string, string> = {
  empregado: "EMPREGADO(A)",
  empregador: "EMPREGADOR (FC Engenharia)",
  contratado: "CONTRATADA (Prestador)",
  contratante: "CONTRATANTE (FC Engenharia)",
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
  const [readerOpen, setReaderOpen] = useState(false);
  const [showRevision, setShowRevision] = useState(false);
  const [revMotivo, setRevMotivo] = useState("");
  const [revSubmitting, setRevSubmitting] = useState(false);
  const [revisionSent, setRevisionSent] = useState(false);

  const q = trpc.signatures.getByToken.useQuery({ token }, { enabled: token.length === 64, retry: false });
  const signMut = trpc.signatures.sign.useMutation();
  const revisionMut = trpc.signatures.requestRevision.useMutation();
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

  const handleRequestRevision = async () => {
    if (revMotivo.trim().length < 10) { toast.error("Descreva o que precisa ser ajustado (mínimo 10 caracteres)."); return; }
    setRevSubmitting(true);
    try {
      await revisionMut.mutateAsync({ token, motivo: revMotivo.trim() });
      setRevisionSent(true);
      toast.success("Solicitação de revisão enviada. O RH será notificado.");
      await utils.signatures.getByToken.invalidate({ token });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar solicitação de revisão.");
    } finally {
      setRevSubmitting(false);
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

  const { signer, session, employee, company, allSigners, canSignNow, aguardando } = q.data as any;
  const alreadySigned = !!signer.signedAt || justSigned;
  const sessionDone = session.status === "completo";
  const sessionCancelled = session.status === "cancelado";
  // Rev. 2119: bloqueio por ordem — só pode assinar se for sua vez na fila
  const blockedByOrder = !alreadySigned && !sessionCancelled && !sessionDone && !canSignNow;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header institucional FC */}
      <header className="bg-[#1B2A4A] text-white print:hidden">
        <div className="max-w-[1400px] mx-auto px-4 py-4 flex items-center gap-3">
          <div className="bg-white/10 p-2 rounded-lg">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight">FCSign — Assinatura Digital</h1>
            <p className="text-blue-100 text-xs">FC Engenharia · MP 2.200-2/2001 · Sessão #{session.id}</p>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6 grid lg:grid-cols-[1fr_340px] gap-6 print:block print:p-0">
        {/* Documento — visualização tipo PDF (página A4 com toolbar) */}
        <section className="bg-slate-700 rounded-lg shadow-lg border border-slate-300 overflow-hidden flex flex-col">
          {/* Toolbar tipo viewer de PDF */}
          <div className="bg-slate-800 text-slate-100 px-4 py-2 flex items-center gap-3 text-xs print:hidden">
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
              onClick={() => setReaderOpen(true)}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md px-2.5 py-1 transition font-medium"
              title="Abrir em tela cheia para leitura completa"
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ler em tela cheia</span>
            </button>
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
          <div className="bg-slate-600 overflow-auto fc-print-viewer-wrap" style={{ maxHeight: "82vh" }}>
            <div className="flex justify-center py-6 px-4 print:block print:p-0 print:bg-white" style={{ minHeight: "100%" }}>
              <div
                id="fcsign-pdf-page"
                className="bg-white shadow-2xl print:shadow-none origin-top"
                style={{
                  width: "210mm",
                  minHeight: "297mm",
                  padding: "15mm 18mm 15mm 18mm",
                  transform: `scale(${zoom})`,
                  transformOrigin: "top center",
                  marginBottom: zoom > 1 ? `${(zoom - 1) * 297}mm` : 0,
                  fontFamily: "'Helvetica', 'Arial', 'Liberation Sans', sans-serif",
                  fontSize: "10.5pt",
                  lineHeight: 1.5,
                  color: "#1a1a1a",
                  overflow: "hidden",
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
        <aside className="space-y-4 print:hidden">
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

          {/* Status das assinaturas — Rev. 2119: layout empilhado (label em cima,
              nome embaixo) pra acomodar nomes longos sem sobreposição. */}
          <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1"><Users className="h-3 w-3" /> Assinaturas (em ordem)</div>
            <ul className="space-y-2">
              {allSigners.map((s: any) => {
                const isMe = s.id === signer.id;
                return (
                  <li key={s.id} className={`flex items-start gap-2 text-xs ${isMe ? "bg-blue-50 -mx-2 px-2 py-1.5 rounded" : ""}`}>
                    {s.signedAt ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-slate-300 flex-shrink-0 mt-0.5 flex items-center justify-center text-[8px] font-bold text-slate-500">{s.ordem || "·"}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 leading-tight">
                        {s.ordem ? `${s.ordem}ª · ` : ""}{roleLabel[s.role] || s.role}
                      </div>
                      <div className={`leading-tight break-words ${s.signedAt ? "text-slate-900 font-medium" : "text-slate-600"}`}>
                        {s.nome}{isMe ? <span className="text-blue-700 font-semibold"> (você)</span> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
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
                {sessionDone || (justSigned && allSigners.every((s: any) => s.signedAt))
                  ? "Obrigado! O documento foi arquivado no RAIO-X do colaborador."
                  : "Aguardando as demais assinaturas para conclusão."}
              </p>
            </div>
          ) : blockedByOrder ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                <Hourglass className="h-4 w-4" /> Aguardando assinatura anterior
              </div>
              <p className="text-xs text-amber-800 mt-2 leading-relaxed">
                Este documento segue um fluxo sequencial. Sua assinatura ({signer.ordem}ª) só será liberada após:
              </p>
              {aguardando && (
                <div className="mt-2 bg-white border border-amber-200 rounded p-2 text-xs">
                  <div className="text-amber-700 font-bold">{aguardando.ordem}ª · {roleLabel[aguardando.role] || aguardando.role}</div>
                  <div className="text-slate-700 font-medium">{aguardando.nome}</div>
                </div>
              )}
              <p className="text-[11px] text-amber-700 mt-2">Atualize esta página ou aguarde a notificação do RH quando for sua vez.</p>
            </div>
          ) : revisionSent ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm"><RotateCcw className="h-4 w-4" /> Revisão solicitada</div>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                Sua solicitação foi registrada. O RH receberá o motivo e entrará em contato para os ajustes necessários.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sua assinatura ({signer.ordem}ª na ordem)</div>
                <button
                  type="button"
                  onClick={() => padRef.current?.clear()}
                  className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                  title="Limpar e desenhar novamente"
                >
                  <RotateCcw className="h-3 w-3" /> Limpar
                </button>
              </div>
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

              {/* Solicitar Revisão — expansível */}
              {!showRevision ? (
                <button
                  type="button"
                  onClick={() => setShowRevision(true)}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 border border-amber-200 hover:border-amber-400 bg-amber-50 hover:bg-amber-100 rounded-md py-2 transition"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Não concordo — Solicitar revisão
                  <ChevronDown className="h-3 w-3 ml-0.5" />
                </button>
              ) : (
                <div className="mt-2 border border-amber-300 bg-amber-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-800 flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" /> Solicitar revisão do contrato</span>
                    <button type="button" onClick={() => { setShowRevision(false); setRevMotivo(""); }} className="text-amber-600 hover:text-amber-800">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    Descreva o que precisa ser ajustado. O RH será notificado e o contrato ficará bloqueado até a correção.
                  </p>
                  <textarea
                    value={revMotivo}
                    onChange={(e) => setRevMotivo(e.target.value)}
                    placeholder="Ex: O valor do contrato está incorreto — deveria ser R$ 5.000,00..."
                    maxLength={1000}
                    rows={4}
                    className="w-full text-xs border border-amber-300 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleRequestRevision}
                      disabled={revSubmitting || revMotivo.trim().length < 10}
                      size="sm"
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                    >
                      {revSubmitting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
                      Enviar solicitação
                    </Button>
                    <button
                      type="button"
                      onClick={() => { setShowRevision(false); setRevMotivo(""); }}
                      className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </main>

      <footer className="max-w-[1400px] mx-auto px-4 py-6 text-center text-[11px] text-slate-500 print:hidden">
        FCSign · FC Engenharia · Sistema interno de assinatura eletrônica · {new Date().getFullYear()}
      </footer>

      {/* Modal de Leitura em Tela Cheia — documento ocupa toda a tela pra leitura confortável.
          Ao final, botão grande "Ir para Assinatura" fecha o modal e foca a área de assinatura.
          Botão de assinatura desabilitado se sessão cancelada/já assinada. */}
      {readerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex flex-col print:hidden">
          {/* Header do reader */}
          <div className="bg-[#1B2A4A] text-white px-4 py-3 flex items-center gap-3 shadow-lg">
            <FileText className="h-5 w-5 text-blue-200 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-sm truncate">{session.documentTitle}</h2>
              <p className="text-[11px] text-blue-200">Modo Leitura · Role até o fim para assinar</p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1 bg-white/10 hover:bg-white/20 rounded-md px-2.5 py-1.5 transition text-xs"
              title="Imprimir ou salvar PDF"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
            <button
              type="button"
              onClick={() => setReaderOpen(false)}
              className="flex items-center gap-1 bg-white/10 hover:bg-white/20 rounded-md px-2.5 py-1.5 transition text-xs"
              title="Fechar modo leitura"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Fechar</span>
            </button>
          </div>

          {/* Área de leitura — página A4 centralizada com mais respiro */}
          <div className="flex-1 overflow-auto bg-slate-700">
            <div className="flex justify-center py-8 px-4">
              <div
                className="bg-white shadow-2xl"
                style={{
                  width: "210mm",
                  maxWidth: "100%",
                  minHeight: "297mm",
                  padding: "15mm 18mm 15mm 18mm",
                  fontFamily: "'Helvetica', 'Arial', 'Liberation Sans', sans-serif",
                  fontSize: "10.5pt",
                  lineHeight: 1.5,
                  color: "#1a1a1a",
                  overflow: "hidden",
                }}
              >
                <div
                  className="fcsign-document-body"
                  dangerouslySetInnerHTML={{ __html: safeHtml }}
                />

                {/* Call-to-action no final do documento — fluxo "leu → assinou" */}
                {!sessionCancelled && !alreadySigned && (
                  <div className="mt-12 pt-6 border-t-2 border-dashed border-slate-300 text-center">
                    <p className="text-sm text-slate-600 mb-3" style={{ fontFamily: "'Helvetica','Arial',sans-serif" }}>
                      Você leu o documento até o final. Clique abaixo para registrar sua assinatura.
                    </p>
                    <Button
                      onClick={() => setReaderOpen(false)}
                      className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-8 py-6 text-base font-semibold shadow-lg"
                    >
                      <PenLine className="h-5 w-5 mr-2" />
                      Ir para Assinatura
                    </Button>
                  </div>
                )}
                {alreadySigned && (
                  <div className="mt-12 pt-6 border-t-2 border-dashed border-emerald-300 text-center">
                    <div className="inline-flex items-center gap-2 text-emerald-700 font-semibold">
                      <CheckCircle2 className="h-5 w-5" /> Documento já assinado por você.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer sticky com botão grande de assinar */}
          {!sessionCancelled && !alreadySigned && (
            <div className="bg-white border-t-2 border-slate-200 px-4 py-3 shadow-2xl flex items-center justify-between gap-3">
              <div className="text-xs text-slate-600 hidden sm:block">
                Após fechar a leitura, desenhe sua assinatura no painel direito.
              </div>
              <Button
                onClick={() => setReaderOpen(false)}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold px-6"
              >
                <PenLine className="h-4 w-4 mr-2" />
                Ir para Assinatura
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Estilos do documento FCSign — scopados a .fcsign-document-body.
          IMPORTANTE: aplicamos AQUI no JSX (não dentro do HTML sanitizado) pra garantir
          que o DOMPurify não interfira. Cobre tipografia + layout do header + faixa azul. */}
      <style>{`
        /* Rev. 2109: CSS scopado MÍNIMO. Toda formatação visual fica nos inline styles
           do contratoHtml (gerado em Colaboradores.tsx) pra garantir fidelidade ao PDF
           modelo. Aqui só fallbacks de tipografia e print. */
        .fcsign-document-body { color: #1a1a1a; font-family: 'Helvetica', 'Arial', 'Liberation Sans', sans-serif; }
        .fcsign-document-body p { margin: 0 0 8px 0; text-align: justify; text-justify: inter-word; hyphens: auto; -webkit-hyphens: auto; }
        .fcsign-document-body strong, .fcsign-document-body .destaque { font-weight: 700; color: #1a1a1a; }

        /* Garante cores de fundo no print (faixa azul) em todos os browsers */
        #fcsign-pdf-page, #fcsign-pdf-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        @media print {
          /* header, aside e toolbar já têm print:hidden (display:none) via Tailwind */
          /* Remove restrições de altura/overflow do wrapper do viewer */
          .fc-print-viewer-wrap {
            max-height: none !important;
            overflow: visible !important;
            background: white !important;
          }
          #fcsign-pdf-page {
            position: static !important;
            transform: none !important;
            box-shadow: none !important;
            margin: 0 auto !important;
            width: 100% !important;
            min-height: auto !important;
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
