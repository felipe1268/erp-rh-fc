import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, Loader2, Copy, CheckCircle2, ExternalLink, Send,
  Lock, Building2, FileSignature, AlertTriangle, Eye,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { renderTemplate } from "@shared/documentTemplates";
import { buildFcDocument } from "@/lib/fcDocumentTemplate";
import { useDocumentMargins } from "@/hooks/useDocumentMargins";

const FELIPE_SOCIO = { nome: "FELIPE COSTA ALVES", cpf: "362.506.888-54" } as const;

const roleLabel: Record<string, string> = {
  contratante: "CONTRATANTE (FC Engenharia — Assina)",
  contratado:  "CONTRATADA (Prestador — Ciente)",
};

function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contratoId: number;
  geradoPor?: string;
};

type SessionResult = {
  sessionId: number;
  signers: Array<{ id: number; role: string; nome: string; link: string }>;
};

export default function FCSignAvisoEncerramentoPJDialog({ open, onOpenChange, contratoId, geradoPor }: Props) {
  const documentMargins = useDocumentMargins();
  const [motivoEncerramento, setMotivoEncerramento] = useState("");
  const [dataEncerramento, setDataEncerramento]   = useState("");
  const [prazoAviso, setPrazoAviso]               = useState("15 dias");
  const [docNumero, setDocNumero]                 = useState("");
  const [docData, setDocData]                     = useState(todayIso());
  const [docLocal, setDocLocal]                   = useState("Guaratinguetá/SP");
  const [result, setResult]                       = useState<SessionResult | null>(null);
  const [copied, setCopied]                       = useState<string | null>(null);

  const contratoQ = (trpc as any).pj.contratos.getById.useQuery(
    { id: contratoId },
    { enabled: open && contratoId > 0 },
  );
  const contrato = contratoQ.data;

  const templateQ = trpc.systemDocumentTemplates.getVigente.useQuery(
    { tipo: "aviso_encerramento_pj" },
    { enabled: open },
  );

  const createMut = trpc.signatures.create.useMutation();

  const prestadorNome = contrato?.razaoSocialPrestador || contrato?.employeeName || "Prestador";
  const prestadorCnpj = contrato?.cnpjPrestador || "";

  const reset = () => {
    setMotivoEncerramento(""); setDataEncerramento(""); setPrazoAviso("30 dias");
    setDocNumero(""); setDocData(todayIso()); setDocLocal("Guaratinguetá/SP");
    setResult(null); setCopied(null);
  };

  const handleClose = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  // Helper: monta os dados + HTML do documento com o estado atual do form.
  // preview=true usa placeholders legíveis para campos ainda em branco.
  function buildDocData(preview = false) {
    if (!contrato) return null;
    const templateHtml = (templateQ.data as any)?.conteudoHtml ?? "";
    if (!templateHtml) return null;
    const nomeEmpresa    = (contrato as any).companyRazaoSocial || "FC ENGENHARIA E CONSTRUÇÃO LTDA";
    const cnpjEmpresa    = (contrato as any).companyCnpj || "";
    const enderecoEmpresa = [(contrato as any).companyEndereco, (contrato as any).companyCidade, (contrato as any).companyEstado]
      .filter(Boolean).join(", ");
    const dados: Record<string, string> = {
      empresaRazaoSocial:       nomeEmpresa,
      empresaCnpj:              cnpjEmpresa,
      empresaEndereco:          enderecoEmpresa,
      representanteLegal:       (contrato as any).companyRepresentante || FELIPE_SOCIO.nome,
      contratadaRazaoSocial:    prestadorNome,
      contratadaCnpj:           prestadorCnpj,
      numeroContrato:           (contrato as any).numeroContrato || "",
      dataInicioContrato:       formatDateBR((contrato as any).dataInicio),
      dataEncerramentoContrato: dataEncerramento ? formatDateBR(dataEncerramento) : (preview ? "[ DATA DE ENCERRAMENTO ]" : ""),
      motivoEncerramento:       motivoEncerramento.trim() || (preview ? "[ MOTIVO DO ENCERRAMENTO ]" : ""),
      prazoAviso:               prazoAviso.trim() || "15 dias",
      docNumero:                docNumero.trim() || "—",
      docData:                  formatDateBR(docData),
      docLocal:                 docLocal.trim() || "Guaratinguetá/SP",
    };
    const corpoHtml     = renderTemplate(templateHtml, dados);
    const documentHtml  = buildFcDocument({
      empresa: { razaoSocial: nomeEmpresa, cnpj: cnpjEmpresa, endereco: enderecoEmpresa, logoUrl: (contrato as any).companyLogoUrl ?? undefined },
      titulo:      "AVISO DE ENCERRAMENTO DE CONTRATO PJ",
      numero:      dados.docNumero,
      dataEmissao: dados.docData,
      assunto:     { valor: `Encerramento do Contrato Nº ${dados.numeroContrato || "—"}` },
      corpoHtml,
      assinaturas: {
        partes: [
          { nome: FELIPE_SOCIO.nome, subtitulo: `${nomeEmpresa}${cnpjEmpresa ? ` — CNPJ: ${cnpjEmpresa}` : ""}`, role: "contratante" },
          { nome: prestadorNome,     subtitulo: prestadorCnpj ? `CNPJ: ${prestadorCnpj}` : undefined,           role: "contratado"  },
        ],
      },
      geradoPor: geradoPor || "Sistema",
      pageTitle: `Aviso de Encerramento — ${(contrato as any).numeroContrato || ""} — ${prestadorNome}`,
      margins: documentMargins,
    });
    return { dados, documentHtml };
  }

  const handlePreview = () => {
    if (!contrato) { toast.error("Contrato ainda carregando."); return; }
    if (!(templateQ.data as any)?.conteudoHtml) { toast.error("Template não vigente — configure em Configurações → Templates de Documentos."); return; }
    const built = buildDocData(true);
    if (!built) return;
    const w = window.open("", "_blank");
    if (w) { w.document.write(built.documentHtml); w.document.close(); }
  };

  const handleSubmit = async () => {
    if (!contrato) { toast.error("Contrato ainda carregando."); return; }
    if (!motivoEncerramento.trim()) { toast.error("Informe o motivo do encerramento."); return; }
    if (!dataEncerramento) { toast.error("Informe a data de encerramento."); return; }

    const templateHtml = (templateQ.data as any)?.conteudoHtml ?? "";
    if (!templateHtml) {
      toast.error(
        "Template 'Aviso de Encerramento de Contrato PJ' não está Vigente. " +
        "Acesse Configurações → Templates de Documentos → Contratos e aprove o template.",
      );
      return;
    }

    const nomeEmpresa = (contrato as any).companyRazaoSocial || "FC ENGENHARIA E CONSTRUÇÃO LTDA";
    const cnpjEmpresa = (contrato as any).companyCnpj || "";
    const enderecoEmpresa = [(contrato as any).companyEndereco, (contrato as any).companyCidade, (contrato as any).companyEstado]
      .filter(Boolean).join(", ");

    const dados: Record<string, string> = {
      empresaRazaoSocial:       nomeEmpresa,
      empresaCnpj:              cnpjEmpresa,
      empresaEndereco:          enderecoEmpresa,
      representanteLegal:       (contrato as any).companyRepresentante || FELIPE_SOCIO.nome,
      contratadaRazaoSocial:    prestadorNome,
      contratadaCnpj:           prestadorCnpj,
      numeroContrato:           (contrato as any).numeroContrato || "",
      dataInicioContrato:       formatDateBR((contrato as any).dataInicio),
      dataEncerramentoContrato: formatDateBR(dataEncerramento),
      motivoEncerramento:       motivoEncerramento.trim(),
      prazoAviso:               prazoAviso.trim() || "15 dias",
      docNumero:                docNumero.trim() || "—",
      docData:                  formatDateBR(docData),
      docLocal:                 docLocal.trim() || "Guaratinguetá/SP",
    };

    const corpoHtml = renderTemplate(templateHtml, dados);

    try {
      const documentHtml = buildFcDocument({
        empresa: {
          razaoSocial: nomeEmpresa,
          cnpj:        cnpjEmpresa,
          endereco:    enderecoEmpresa,
          logoUrl:     (contrato as any).companyLogoUrl ?? undefined,
        },
        titulo:      "AVISO DE ENCERRAMENTO DE CONTRATO PJ",
        numero:      dados.docNumero,
        dataEmissao: dados.docData,
        assunto:     { valor: `Encerramento do Contrato Nº ${dados.numeroContrato || "—"}` },
        corpoHtml,
        assinaturas: {
          partes: [
            {
              nome:      FELIPE_SOCIO.nome,
              subtitulo: `${nomeEmpresa}${cnpjEmpresa ? ` — CNPJ: ${cnpjEmpresa}` : ""}`,
              role:      "contratante",
            },
            {
              nome:      prestadorNome,
              subtitulo: prestadorCnpj ? `CNPJ: ${prestadorCnpj}` : undefined,
              role:      "contratado",
            },
          ],
        },
        geradoPor: geradoPor || "Sistema",
        pageTitle: `Aviso de Encerramento — ${contrato.numeroContrato || ""} — ${prestadorNome}`,
        margins: documentMargins,
      });

      const r = await createMut.mutateAsync({
        companyId:     Number(contrato.companyId),
        employeeId:    Number(contrato.employeeId),
        tipo:          "aviso_encerramento_pj",
        documentTitle: `Aviso de Encerramento PJ — ${contrato.numeroContrato || ""} — ${prestadorNome}`.trim(),
        documentHtml,
        signers: [
          { role: "contratante", nome: FELIPE_SOCIO.nome, cpf: FELIPE_SOCIO.cpf },
          { role: "contratado",  nome: prestadorNome,      cpf: null },
        ],
        observacoes: `aviso_encerramento_pj:${contratoId}`,
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

  const isLoading  = contratoQ.isLoading || templateQ.isLoading;
  const canSubmit  = !createMut.isPending && !isLoading && !!contrato;
  const noTemplate = !templateQ.isLoading && templateQ.data && !(templateQ.data as any).vigente;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        resizable={false}
        className="!w-[100vw] !max-w-none !h-[100dvh] !max-h-[100dvh] !rounded-none !p-0 !top-0 !left-0 !translate-x-0 !translate-y-0 overflow-hidden flex flex-col gap-0"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Enviar Aviso de Encerramento PJ para Assinatura (FCSign)</DialogTitle>
        </DialogHeader>

        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 via-red-600 to-rose-700 text-white px-6 py-5 shadow-md">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-lg">
              <FileSignature className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold leading-tight">FCSign — Aviso de Encerramento de Contrato PJ</h2>
              <p className="text-orange-100 text-sm mt-0.5">
                {contrato
                  ? `${contrato.numeroContrato || "S/N"} — ${prestadorNome}`
                  : "Carregando contrato…"}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando…
            </div>
          ) : !result ? (
            <div className="space-y-4 max-w-4xl mx-auto w-full">

              {/* Aviso de template não vigente */}
              {noTemplate && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-2 text-xs text-amber-900">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
                  <div>
                    Template <b>Aviso de Encerramento de Contrato PJ (FC-CON-003)</b> não está Vigente.
                    Acesse <b>Configurações → Templates de Documentos → Contratos</b> e aprove o template antes de continuar.
                  </div>
                </div>
              )}

              {/* Partes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* CONTRATANTE */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-blue-700" />
                    <span className="text-xs font-bold uppercase tracking-wide text-blue-800">Contratante (FC Engenharia)</span>
                    <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto">Assina</span>
                  </div>
                  <div className="p-4 space-y-3 text-sm">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 flex items-center gap-1">
                        Representante legal <Lock className="h-3 w-3 text-slate-400" />
                        <span className="text-slate-400 normal-case font-normal ml-1">· fixo</span>
                      </label>
                      <Input value={FELIPE_SOCIO.nome} disabled className="h-9 bg-slate-100 font-medium" />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">CPF</label>
                      <Input value={FELIPE_SOCIO.cpf} disabled className="h-9 bg-slate-100" />
                    </div>
                  </div>
                </div>

                {/* CONTRATADA */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-600" />
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Contratada (Prestador)</span>
                    <span className="bg-slate-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto">Ciente</span>
                  </div>
                  <div className="p-4 space-y-3 text-sm">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">Razão Social / Nome</label>
                      <Input value={prestadorNome} disabled className="h-9 bg-slate-100" />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">CNPJ</label>
                      <Input value={prestadorCnpj || "—"} disabled className="h-9 bg-slate-100" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Dados do encerramento */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-red-50 border-b border-red-100 px-4 py-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-xs font-bold uppercase tracking-wide text-red-800">Dados do Encerramento</span>
                </div>
                <div className="p-4 space-y-4 text-sm">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">
                      Motivo do encerramento <span className="text-red-500">*</span>
                    </label>
                    <Textarea
                      value={motivoEncerramento}
                      onChange={(e) => setMotivoEncerramento(e.target.value)}
                      placeholder="Ex.: Conclusão das atividades previstas no objeto contratual. / Encerramento por mútuo acordo entre as partes."
                      rows={3}
                      className="resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">
                        Data de encerramento <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="date"
                        value={dataEncerramento}
                        onChange={(e) => setDataEncerramento(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">Prazo de aviso</label>
                      <Input
                        value={prazoAviso}
                        onChange={(e) => setPrazoAviso(e.target.value)}
                        placeholder="Ex.: 30 dias"
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Dados do documento */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Dados do Documento</span>
                </div>
                <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">Nº do documento</label>
                    <Input
                      value={docNumero}
                      onChange={(e) => setDocNumero(e.target.value)}
                      placeholder="Ex.: 001/2026"
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">Data de emissão</label>
                    <Input
                      type="date"
                      value={docData}
                      onChange={(e) => setDocData(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">Local</label>
                    <Input
                      value={docLocal}
                      onChange={(e) => setDocLocal(e.target.value)}
                      placeholder="Ex.: Guaratinguetá/SP"
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2 text-xs text-blue-900">
                <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-700" />
                <div>
                  O documento será gerado a partir do template vigente <b>FC-CON-003 — Aviso de Encerramento de Contrato PJ</b>.
                  Ao criar a sessão, o sistema gera <b>links únicos por signatário</b> para assinatura via FCSign.
                </div>
              </div>
            </div>
          ) : (
            /* SUCCESS — links gerados */
            <div className="space-y-3 max-w-4xl mx-auto w-full">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-700 mt-0.5" />
                <div>
                  <div className="font-bold text-emerald-900">Sessão #{result.sessionId} criada com sucesso</div>
                  <div className="text-xs text-emerald-800 mt-1">Copie cada link abaixo e envie ao signatário correspondente.</div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {result.signers.map((s) => {
                  const fullUrl  = `${window.location.origin}${s.link}`;
                  const isCopied = copied === s.role;
                  return (
                    <div key={s.id} className="bg-white rounded-lg border border-slate-200 shadow-sm p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            {roleLabel[s.role] || s.role}
                          </div>
                          <div className="text-sm font-semibold text-slate-900">{s.nome}</div>
                        </div>
                        <div className="flex gap-1.5">
                          <Button type="button" size="sm" variant="outline" onClick={() => window.open(s.link, "_blank")} className="h-8">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir
                          </Button>
                          <Button
                            type="button" size="sm"
                            onClick={() => copyLink(s.link, s.role)}
                            className={`h-8 ${isCopied ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                          >
                            {isCopied
                              ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Copiado</>
                              : <><Copy className="h-3.5 w-3.5 mr-1" /> Copiar link</>}
                          </Button>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded truncate">
                        {fullUrl}
                      </div>
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
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={createMut.isPending}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={!contrato || !(templateQ.data as any)?.conteudoHtml}
                className="gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50"
              >
                <Eye className="h-4 w-4" />
                Prévia do Documento
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="bg-gradient-to-r from-orange-600 to-red-700 hover:from-orange-700 hover:to-red-800"
              >
                {createMut.isPending
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Send className="h-4 w-4 mr-2" />}
                Criar Sessão &amp; Gerar Links
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => handleClose(false)} className="bg-emerald-600 hover:bg-emerald-700">
              Concluído
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
