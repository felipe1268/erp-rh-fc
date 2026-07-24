// Rev. 4542 — Página PÚBLICA de leitura/ciência de Comunicado Interno.
// Fluxo: funcionário abre o link (WhatsApp) → se identifica (CPF + data de nascimento) →
// sistema registra a VISUALIZAÇÃO → lê o comunicado → clica "Li e estou ciente" →
// registrada a assinatura eletrônica simples (Lei 14.063/2020) com trilha de auditoria.
import { useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitizeHtml, isHtmlContent } from "@/components/RichTextEditor";
import { renderTemplate } from "@shared/documentTemplates";
import { Loader2, AlertTriangle, CheckCircle2, ShieldCheck, FileText, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatCPF } from "@/lib/formatters";

function formatDateBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const s = String(dateStr).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

function formatDateTimeBR(v: string | null | undefined): string {
  if (!v) return "-";
  const s = String(v);
  const data = formatDateBR(s);
  const hora = s.length >= 16 ? s.slice(11, 16) : "";
  return hora ? `${data} às ${hora}` : data;
}

export default function ComunicadoCiencia() {
  const [, params] = useRoute("/ciencia/:token");
  const token = params?.token || "";

  const [cpf, setCpf] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [identificado, setIdentificado] = useState<any>(null);
  const [confirmouAgora, setConfirmouAgora] = useState(false);

  const metaQ = trpc.comunicadosCiencia.obterPorToken.useQuery(
    { token }, { enabled: token.length >= 32, retry: false },
  );

  const identificarMut = trpc.comunicadosCiencia.identificar.useMutation({
    onSuccess: (data) => setIdentificado(data),
    onError: (e: any) => toast.error(e.message),
  });

  const cienciaMut = trpc.comunicadosCiencia.confirmarCiencia.useMutation({
    onSuccess: (data) => {
      setConfirmouAgora(true);
      setIdentificado((prev: any) => prev ? { ...prev, jaConfirmou: true, confirmadoEm: data.confirmadoEm } : prev);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const Frame = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) => (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 flex items-start justify-center p-4 py-8">
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} bg-white rounded-2xl shadow-xl overflow-hidden`}>{children}</div>
    </div>
  );

  if (token.length < 32) {
    return <Frame><div className="p-10 text-center"><AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-3" /><p className="text-lg font-semibold">Link inválido</p><p className="text-sm text-muted-foreground mt-1">O link do comunicado está incompleto.</p></div></Frame>;
  }
  if (metaQ.isLoading) {
    return <Frame><div className="p-16 text-center"><Loader2 className="h-10 w-10 mx-auto animate-spin text-blue-500" /><p className="text-sm text-muted-foreground mt-4">Carregando comunicado...</p></div></Frame>;
  }
  if (metaQ.error || !metaQ.data) {
    return <Frame><div className="p-10 text-center"><AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-3" /><p className="text-lg font-semibold">Link inválido ou expirado</p><p className="text-sm text-muted-foreground mt-1">{metaQ.error?.message || "Solicite um novo link ao RH."}</p></div></Frame>;
  }

  const meta = metaQ.data;

  const Cabecalho = () => (
    <div className="bg-[#1B2A4A] text-white px-6 py-5 text-center">
      {meta.empresaLogoUrl && (
        <img src={meta.empresaLogoUrl} alt="" className="h-12 mx-auto mb-2 object-contain bg-white rounded p-1" onError={(e: any) => e.target.style.display = "none"} />
      )}
      <div className="text-sm font-bold tracking-wide">{meta.empresaNome}</div>
      <div className="text-[11px] text-white/70 mt-1 uppercase tracking-widest">Comunicado Interno — Nº {meta.numero}</div>
    </div>
  );

  // ── Tela 1: identificação ──────────────────────────────────────────────
  if (!identificado) {
    const nascOk = /^\d{4}-\d{2}-\d{2}$/.test(nascimento);
    const cpfOk = cpf.replace(/\D/g, "").length === 11;
    return (
      <Frame>
        <Cabecalho />
        <div className="p-6">
          <div className="border rounded-lg p-4 mb-5 bg-slate-50">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Assunto:</p>
            <p className="font-bold text-[#1B2A4A]">{meta.titulo}</p>
            <p className="text-xs text-gray-500 mt-1">Data de Emissão: {formatDateBR(meta.dataEmissao)}</p>
          </div>
          <div className="flex items-start gap-2 mb-4 text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-3">
            <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <span>Para ler o comunicado, identifique-se. Seu acesso e sua confirmação de ciência serão registrados (data, hora e IP) para fins de auditoria.</span>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">CPF</Label>
              <Input
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(formatCPF(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Data de nascimento</Label>
              <Input
                type="date"
                value={nascimento}
                onChange={(e) => setNascimento(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button
              className="w-full bg-[#1B2A4A] hover:bg-[#25395f]"
              disabled={!cpfOk || !nascOk || identificarMut.isPending}
              onClick={() => identificarMut.mutate({ token, cpf, dataNascimento: nascimento })}
            >
              {identificarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              Acessar o comunicado
            </Button>
          </div>
        </div>
      </Frame>
    );
  }

  // ── Tela 2: leitura + ciência ──────────────────────────────────────────
  const conteudo = identificado.conteudo as string | null;
  const tplVigente = identificado.templateVigenteHtml as string | null;
  const escC = (s: any) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[ch]);

  let corpoHtml: string | null = null;
  if (conteudo) {
    const corpoMsg = isHtmlContent(conteudo) ? conteudo : escC(conteudo).replace(/\n/g, "<br/>");
    corpoHtml = tplVigente
      ? renderTemplate(tplVigente, {
          empNome: "", corpoMsg, assunto: escC(meta.titulo || ""),
          empresaRazaoSocial: escC(meta.empresaNome), empresaCnpj: escC(meta.empresaCnpj),
          docNumero: escC(String(meta.numero || "")), docData: escC(formatDateBR(meta.dataEmissao)),
        })
      : corpoMsg;
  }

  const jaConfirmou = identificado.jaConfirmou;

  return (
    <Frame wide>
      <Cabecalho />
      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <p className="text-sm font-semibold text-[#1B2A4A]">{identificado.funcionario?.nome}</p>
            {identificado.funcionario?.cargo && <p className="text-xs text-gray-500">{identificado.funcionario.cargo}</p>}
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Eye className="h-3 w-3" /> Visualizado em {formatDateTimeBR(identificado.visualizadoEm)}
          </span>
        </div>

        <div className="border rounded-lg p-4 mb-4 bg-slate-50">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Assunto:</p>
          <p className="font-bold text-[#1B2A4A]">{meta.titulo}</p>
          <p className="text-xs text-gray-500 mt-1">Nº {meta.numero} · Data de Emissão: {formatDateBR(meta.dataEmissao)}</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-5 mb-4 min-h-[160px]">
          {corpoHtml ? (
            <div
              className="prose prose-sm max-w-none text-gray-800 leading-relaxed prose-headings:text-[#1B2A4A] prose-p:my-2 break-words"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(corpoHtml) }}
            />
          ) : (
            <p className="text-sm text-gray-500 italic">Este comunicado não possui texto — veja o documento anexo abaixo.</p>
          )}
          {identificado.documentoUrl && (
            <a
              href={identificado.documentoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-blue-700 hover:underline"
            >
              <FileText className="h-4 w-4" /> {identificado.fileName || "Abrir documento anexo"}
            </a>
          )}
        </div>

        {jaConfirmou ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
            <CheckCircle2 className="h-8 w-8 mx-auto text-green-600 mb-2" />
            <p className="font-semibold text-green-800">
              {confirmouAgora ? "Ciência registrada com sucesso!" : "Você já registrou ciência deste comunicado."}
            </p>
            <p className="text-xs text-green-700 mt-1">
              Registrado em {formatDateTimeBR(identificado.confirmadoEm)} · vale como assinatura eletrônica de ciência.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-800 mb-3 text-center italic">
              Declaro que recebi, li e estou ciente do conteúdo do comunicado acima identificado. Esta confirmação, autenticada pela minha identificação pessoal, vale como assinatura eletrônica de ciência.
            </p>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 h-12 text-base font-bold"
              disabled={cienciaMut.isPending}
              onClick={() => cienciaMut.mutate({ token, cpf, dataNascimento: nascimento })}
            >
              {cienciaMut.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
              Li e estou ciente
            </Button>
          </div>
        )}
      </div>
    </Frame>
  );
}
