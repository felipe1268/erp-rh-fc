import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ShieldAlert, Plus, Pencil, Trash2, Printer, FileUp, Eye,
  Search, Building2, HardHat, MessageSquare, Users, AlertTriangle,
  PenTool, Send, Loader2,
} from "lucide-react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const TIPOS: Record<string, { label: string; titulo: string; verbo: string; badge: "outline" | "secondary" | "destructive" }> = {
  Notificacao:             { label: "Notificação",              titulo: "NOTIFICAÇÃO FORMAL",                                  verbo: "NOTIFICAR",                badge: "outline" },
  Advertencia:             { label: "Advertência",              titulo: "ADVERTÊNCIA FORMAL",                                  verbo: "ADVERTIR",                 badge: "secondary" },
  Suspensao:               { label: "Suspensão de Acesso",      titulo: "SUSPENSÃO DE ACESSO À OBRA",                          verbo: "SUSPENDER O ACESSO de",    badge: "destructive" },
  SolicitacaoSubstituicao: { label: "Solicitação de Substituição", titulo: "SOLICITAÇÃO FORMAL DE SUBSTITUIÇÃO DE COLABORADOR", verbo: "SOLICITAR A SUBSTITUIÇÃO de", badge: "destructive" },
};

function formatCPF(cpf?: string | null) {
  if (!cpf) return "-";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
function formatCNPJ(cnpj?: string | null) {
  if (!cnpj) return "-";
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
function formatDateBR(s?: string | null) {
  if (!s) return "-";
  const only = String(s).slice(0, 10);
  return only.includes("-") ? only.split("-").reverse().join("/") : only;
}
function todayLong() {
  const hoje = new Date();
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${hoje.getDate()} de ${meses[hoje.getMonth()]} de ${hoje.getFullYear()}`;
}

export default function AdvertenciasTerceiros() {
  const { user: authUser } = useAuth();
  const { selectedCompanyId, companies, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = (typeof getCompanyIdsForQuery === "function" ? getCompanyIdsForQuery() : undefined) as number[] | undefined;
  const selectedCompany = companies?.find((c: any) => String(c.id) === selectedCompanyId);
  const nomeContratante = selectedCompany?.razaoSocial || selectedCompany?.nomeFantasia || "FC ENGENHARIA";
  const cnpjContratante = (selectedCompany as any)?.cnpj || "";
  const logoUrl = (selectedCompany as any)?.logoUrl || "";

  const [search, setSearch] = useState("");
  const [filterEmpresa, setFilterEmpresa] = useState<string>("all");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});
  const [previewData, setPreviewData] = useState<any>(null);

  const { data: lista = [], refetch } = trpc.terceiros.advertencias.list.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId }
  );
  const { data: empresas = [], refetch: refetchEmpresas } = trpc.terceiros.empresas.listPrestadores.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId }
  );
  const ensureFromFornecedorMut = trpc.terceiros.empresas.ensureFromFornecedor.useMutation();
  const criarEnvelopeMut = trpc.integrasign.criarEnvelope.useMutation();
  const enviarEnvelopeMut = trpc.integrasign.enviarParaAssinatura.useMutation();
  const [assinaturaDialog, setAssinaturaDialog] = useState<null | {
    advertencia: any;
    sigEmpresa: { nome: string; email: string; cpfCnpj: string; cargo: string; empresaNome: string };
    sigGestor: { nome: string; email: string; cargo: string };
  }>(null);
  function abrirAssinatura(a: any) {
    const emp = (empresas as any[]).find((e: any) => e.source === "terceira" && e.id === a.empresaTerceiraId);
    setAssinaturaDialog({
      advertencia: a,
      sigEmpresa: {
        nome: emp?.responsavelNome || "",
        email: emp?.email || emp?.emailFinanceiro || "",
        cpfCnpj: emp?.cnpj || "",
        cargo: emp?.responsavelCargo || "Representante Legal",
        empresaNome: emp?.razaoSocial || a.empresaRazaoSocial || "",
      },
      sigGestor: {
        nome: a.aplicadoPor || authUser?.name || "",
        email: (authUser as any)?.email || "",
        cargo: "Gestor / Aplicador",
      },
    });
  }
  async function enviarParaAssinatura() {
    if (!assinaturaDialog) return;
    const { advertencia, sigEmpresa, sigGestor } = assinaturaDialog;
    if (!sigEmpresa.nome || !sigEmpresa.email) { toast.error("Informe nome e e-mail do representante da empresa prestadora."); return; }
    if (!sigGestor.nome || !sigGestor.email) { toast.error("Informe nome e e-mail do gestor (FC)."); return; }
    const tipoLabel = TIPOS[advertencia.tipoAdvertencia]?.label || "Advertência";
    try {
      const r = await criarEnvelopeMut.mutateAsync({
        companyId,
        titulo: `${tipoLabel} #${advertencia.id} — ${advertencia.empresaRazaoSocial} / ${advertencia.funcionarioNome}`,
        descricao: `${tipoLabel} aplicada em ${formatDateBR(advertencia.dataOcorrencia)}. Motivo: ${advertencia.motivo}`,
        signatarios: [
          { papel: "fornecedor", ordemAssinatura: 1, nome: sigEmpresa.nome, email: sigEmpresa.email, cpfCnpj: sigEmpresa.cpfCnpj || undefined, cargo: sigEmpresa.cargo || undefined, empresaNome: sigEmpresa.empresaNome || undefined },
          { papel: "gestor_projeto", ordemAssinatura: 2, nome: sigGestor.nome, email: sigGestor.email, cargo: sigGestor.cargo || undefined, empresaNome: nomeContratante },
        ],
      });
      // Encadeia o envio dos convites para que o e-mail seja realmente disparado
      // (criarEnvelope deixa em rascunho; enviarParaAssinatura troca p/ enviado).
      try {
        await enviarEnvelopeMut.mutateAsync({ companyId, envelopeId: r.id });
        toast.success("Envelope criado e enviado para assinatura!");
      } catch (sendErr: any) {
        toast.warning(`Envelope criado (rascunho), mas houve erro ao enviar convites: ${sendErr?.message || "verifique no IntegraSign"}.`);
      }
      setAssinaturaDialog(null);
      navigate(`/integrasign?envelope=${r.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar envelope.");
    }
  }
  const [, navigate] = useLocation();
  const [empresaInput, setEmpresaInput] = useState("");
  const empresasOrdenadas = useMemo(() => {
    const arr = [...(empresas as any[])];
    arr.sort((a, b) => (a.razaoSocial || "").localeCompare(b.razaoSocial || "", "pt-BR", { sensitivity: "base" }));
    return arr;
  }, [empresas]);
  const { data: funcionarios = [] } = trpc.terceiros.funcionarios.list.useQuery(
    { companyId, companyIds, empresaTerceiraId: form.empresaTerceiraId || undefined } as any,
    { enabled: !!companyId && !!form.empresaTerceiraId }
  );

  const createMut = trpc.terceiros.advertencias.create.useMutation({
    onSuccess: (r: any) => {
      refetch(); setShowDialog(false); setEditingId(null); setForm({});
      if (r?.alerta) toast.warning(r.alerta, { duration: 7000 });
      else toast.success(`Advertência registrada (${r?.sequencia || 1}ª deste colaborador).`);
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar"),
  });
  const updateMut = trpc.terceiros.advertencias.update.useMutation({
    onSuccess: () => { refetch(); setShowDialog(false); setEditingId(null); setForm({}); toast.success("Advertência atualizada!"); },
  });
  const deleteMut = trpc.terceiros.advertencias.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Excluída!"); } });
  const uploadMut = trpc.terceiros.advertencias.uploadDoc.useMutation({ onSuccess: () => { refetch(); toast.success("Documento anexado!"); } });

  const filtered = useMemo(() => {
    let l = lista as any[];
    if (filterEmpresa !== "all") l = l.filter(a => String(a.empresaTerceiraId) === filterEmpresa);
    if (filterTipo !== "all") l = l.filter(a => a.tipoAdvertencia === filterTipo);
    if (search) {
      const s = search.toLowerCase();
      l = l.filter(a =>
        a.funcionarioNome?.toLowerCase().includes(s) ||
        a.empresaRazaoSocial?.toLowerCase().includes(s) ||
        a.motivo?.toLowerCase().includes(s) ||
        (a.funcionarioCpf || "").includes(s)
      );
    }
    return l;
  }, [lista, filterEmpresa, filterTipo, search]);

  function openNew() {
    setEditingId(null);
    setEmpresaInput("");
    setForm({ tipoAdvertencia: "Advertencia", dataOcorrencia: new Date().toISOString().slice(0, 10) });
    setShowDialog(true);
  }
  function openEdit(a: any) {
    setEditingId(a.id);
    const empAtual = empresasOrdenadas.find((e: any) => e.source === "terceira" && e.id === a.empresaTerceiraId);
    setEmpresaInput(empAtual ? `${empAtual.razaoSocial}${empAtual.cnpj ? ` — ${formatCNPJ(empAtual.cnpj)}` : ""}` : (a.empresaRazaoSocial || ""));
    setForm({
      empresaTerceiraId: a.empresaTerceiraId,
      funcionarioTerceiroId: a.funcionarioTerceiroId,
      funcionarioNomeInput: a.funcionarioNome || "",
      funcionarioCpfManual: a.funcionarioTerceiroId ? "" : (a.funcionarioCpf || ""),
      funcionarioFuncaoManual: a.funcionarioTerceiroId ? "" : (a.funcionarioFuncao || ""),
      tipoAdvertencia: a.tipoAdvertencia,
      dataOcorrencia: String(a.dataOcorrencia || "").slice(0, 10),
      motivo: a.motivo,
      descricao: a.descricao || "",
      diasSuspensao: a.diasSuspensao || undefined,
      aplicadoPor: a.aplicadoPor || authUser?.name || "",
      testemunhas: a.testemunhas || "",
    });
    setShowDialog(true);
  }
  function handleSubmit() {
    if (!form.empresaTerceiraId) { toast.error("Selecione a empresa prestadora."); return; }
    if (!form.funcionarioTerceiroId && !(form.funcionarioNomeInput || "").trim()) { toast.error("Informe o nome do colaborador (cadastrado ou digitado)."); return; }
    if (!form.tipoAdvertencia || !form.dataOcorrencia || !form.motivo) { toast.error("Preencha tipo, data e motivo."); return; }
    if (form.tipoAdvertencia === "Suspensao" && !form.diasSuspensao) { toast.error("Informe os dias de suspensão."); return; }
    if (editingId) {
      updateMut.mutate({
        id: editingId,
        tipoAdvertencia: form.tipoAdvertencia,
        dataOcorrencia: form.dataOcorrencia,
        motivo: form.motivo,
        descricao: form.descricao || undefined,
        diasSuspensao: form.diasSuspensao ? Number(form.diasSuspensao) : undefined,
        aplicadoPor: form.aplicadoPor || undefined,
        testemunhas: form.testemunhas || undefined,
      });
    } else {
      createMut.mutate({
        companyId,
        empresaTerceiraId: Number(form.empresaTerceiraId),
        funcionarioTerceiroId: form.funcionarioTerceiroId ? Number(form.funcionarioTerceiroId) : undefined,
        funcionarioNomeManual: form.funcionarioTerceiroId ? undefined : (form.funcionarioNomeInput || "").trim(),
        funcionarioCpfManual: form.funcionarioTerceiroId ? undefined : (form.funcionarioCpfManual || undefined),
        funcionarioFuncaoManual: form.funcionarioTerceiroId ? undefined : (form.funcionarioFuncaoManual || undefined),
        tipoAdvertencia: form.tipoAdvertencia,
        dataOcorrencia: form.dataOcorrencia,
        motivo: form.motivo,
        descricao: form.descricao || undefined,
        diasSuspensao: form.diasSuspensao ? Number(form.diasSuspensao) : undefined,
        aplicadoPor: form.aplicadoPor || authUser?.name || undefined,
        testemunhas: form.testemunhas || undefined,
      });
    }
  }
  function handleUploadDoc(id: number) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/pdf,image/*";
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      const buf = await f.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      uploadMut.mutate({ id, fileBase64: b64, fileName: f.name });
    };
    inp.click();
  }

  function buildPrintHtml(a: any) {
    const tipo = TIPOS[a.tipoAdvertencia] || TIPOS.Advertencia;
    let testArr: { nome: string; doc: string }[] = [];
    try { testArr = JSON.parse(a.testemunhas || "[]"); } catch { testArr = []; }
    const t1 = testArr[0] || { nome: "", doc: "" };
    const t2 = testArr[1] || { nome: "", doc: "" };
    const t3 = testArr[2] || { nome: "", doc: "" };
    const userName = authUser?.name || authUser?.username || "Usuário";
    const dataEmissao = new Date().toLocaleString("pt-BR");

    const corpo = `
      <p>Pelo presente instrumento, a empresa <strong>${nomeContratante}</strong>${cnpjContratante ? `, inscrita no CNPJ sob o nº <strong>${formatCNPJ(cnpjContratante)}</strong>` : ""}, na qualidade de <strong>CONTRATANTE</strong> de serviços, vem por meio deste documento ${tipo.verbo} formalmente a empresa prestadora de serviços <strong>${a.empresaRazaoSocial}</strong>, inscrita no CNPJ sob o nº <strong>${formatCNPJ(a.empresaCnpj)}</strong>${a.empresaResponsavel ? `, neste ato representada por <strong>${a.empresaResponsavel}</strong>` : ""}, bem como o(a) colaborador(a) terceirizado(a) <strong>${a.funcionarioNome}</strong>, portador(a) do CPF nº <strong>${formatCPF(a.funcionarioCpf)}</strong>, ocupante da função de <strong>${a.funcionarioFuncao || "N/I"}</strong>${a.tipoAdvertencia === "Suspensao" && a.diasSuspensao ? `, com <strong style="color:#dc2626;background:#fef2f2;padding:2px 6px;border-radius:3px;">suspensão de acesso à obra pelo período de ${a.diasSuspensao} dia(s)</strong>` : ""}, em razão do fato ocorrido em <strong>${formatDateBR(a.dataOcorrencia)}</strong>, conforme a seguir descrito:</p>
      <div class="motivo-box">${a.motivo}${a.descricao ? "<br/><br/>" + a.descricao : ""}</div>
      <p>O presente documento reflete a expectativa da CONTRATANTE quanto ao integral cumprimento das normas de conduta, segurança do trabalho, disciplina e demais obrigações previstas no contrato de prestação de serviços firmado entre as partes, bem como nas normas regulamentadoras aplicáveis ao canteiro de obras.</p>
      <p>Esclarece-se, para todos os fins, que <strong>não há vínculo empregatício</strong> entre a CONTRATANTE e o(a) colaborador(a) terceirizado(a), permanecendo íntegra a relação de emprego mantida exclusivamente entre o(a) colaborador(a) e a empresa prestadora de serviços, a quem compete a aplicação das medidas disciplinares internas cabíveis nos termos da legislação trabalhista vigente.</p>
      <p>${a.tipoAdvertencia === "SolicitacaoSubstituicao"
            ? "Em razão da gravidade e/ou reincidência dos fatos apurados, a CONTRATANTE solicita formalmente à empresa prestadora a <strong>substituição do(a) colaborador(a)</strong> acima qualificado(a) na execução dos serviços contratados, no prazo máximo de 5 (cinco) dias úteis, sem prejuízo da continuidade da prestação dos serviços contratados."
            : a.tipoAdvertencia === "Suspensao"
            ? "Durante o período de suspensão de acesso à obra, o(a) colaborador(a) não deverá comparecer ao canteiro, cabendo à empresa prestadora providenciar, às suas expensas, a substituição temporária da mão de obra para que não haja descontinuidade dos serviços contratados."
            : "A reincidência dos fatos ora notificados poderá ensejar a aplicação de medidas mais gravosas, tais como suspensão de acesso à obra, solicitação formal de substituição do(a) colaborador(a) e, em última instância, rescisão motivada do contrato de prestação de serviços, nos termos das cláusulas contratuais e da legislação aplicável."}</p>
      <p>Solicita-se à empresa prestadora que dê <strong>imediata ciência</strong> ao(à) colaborador(a) acerca do teor deste documento, adote as providências disciplinares internas pertinentes e comunique formalmente à CONTRATANTE as medidas adotadas no prazo de 10 (dez) dias corridos, contados do recebimento desta.</p>
      <p style="text-indent:0; margin-top: 25px;">_________________, ${todayLong()}.</p>
    `;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${tipo.titulo}</title>
<style>
  @page { size: A4 portrait; margin: 20mm 18mm 25mm 18mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', serif; font-size: 14px; color: #000; line-height: 1.7; }
  .logo-bar { background: #1e3a6e; padding: 12px 20px; display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
  .logo-bar img { height: 50px; width: auto; object-fit: contain; }
  .logo-bar .title { color: white; flex: 1; }
  .logo-bar .title h1 { font-size: 15px; font-weight: bold; letter-spacing: 1px; }
  .logo-bar .title p { font-size: 10px; opacity: 0.85; }
  .banner-bar { position: relative; margin-bottom: 20px; }
  .banner-bar img { display: block; width: 100%; height: auto; }
  .banner-bar .num-badge { position: absolute; top: 50%; right: 16px; transform: translateY(-50%); }
  .num-badge { background: #dc2626; color: white; font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 4px; }
  .partes { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; margin-bottom: 18px; font-size: 13px; line-height: 1.55; }
  .partes b { color: #1e3a6e; }
  .doc-body { text-align: justify; padding: 0 10px; }
  .doc-body p { margin-bottom: 14px; text-indent: 35px; }
  .motivo-box { background: #f8f8f8; border-left: 4px solid #1e3a6e; padding: 10px 14px; margin: 14px 0; text-indent: 0 !important; font-style: italic; }
  .signatures { margin-top: 50px; padding: 0 10px; }
  .sig-row { display: flex; justify-content: space-between; margin-bottom: 40px; gap: 30px; }
  .sig-block { text-align: center; flex: 1; }
  .sig-block .line { border-top: 1px solid #000; padding-top: 4px; font-size: 11px; }
  .sig-row-3 { display: flex; justify-content: space-between; margin-bottom: 40px; gap: 20px; }
  .sig-block-3 { text-align: center; flex: 1; }
  .sig-block-3 .line { border-top: 1px solid #000; padding-top: 4px; font-size: 11px; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 6px 18mm; border-top: 2px solid #1e3a6e; font-size: 9.5px; display: flex; justify-content: space-between; background: white; }
  .footer .lgpd { color: #dc2626; font-weight: 600; }
</style></head><body>
${a.tipoAdvertencia === "Advertencia" ? `
<div class="banner-bar">
  <img src="/advertencia-header.png" alt="${tipo.titulo}" />
  <span class="num-badge">${a.sequencia || 1}ª MEDIDA</span>
</div>` : `
<div class="logo-bar">
  <img src="${window.location.origin}/logo-fc-branco-amarelo.png" alt="FC Engenharia" />
  <div class="title"><h1>${tipo.titulo}</h1><p>À empresa prestadora de serviços e ao colaborador terceirizado</p></div>
  <span class="num-badge">${a.sequencia || 1}ª MEDIDA</span>
</div>`}
<div class="partes">
  <div><b>CONTRATANTE:</b> ${nomeContratante}${cnpjContratante ? ` — CNPJ ${formatCNPJ(cnpjContratante)}` : ""}</div>
  <div><b>EMPRESA PRESTADORA:</b> ${a.empresaRazaoSocial} — CNPJ ${formatCNPJ(a.empresaCnpj)}${a.empresaResponsavel ? ` — Resp.: ${a.empresaResponsavel}` : ""}</div>
  <div><b>COLABORADOR TERCEIRIZADO:</b> ${a.funcionarioNome} — CPF ${formatCPF(a.funcionarioCpf)} — Função: ${a.funcionarioFuncao || "N/I"}</div>
  ${a.obraNome ? `<div><b>OBRA / LOCAL:</b> ${a.obraNome}</div>` : ""}
  <div><b>DATA DA OCORRÊNCIA:</b> ${formatDateBR(a.dataOcorrencia)}</div>
</div>
<div class="doc-body">${corpo}</div>
<div class="signatures">
  <div class="sig-row">
    <div class="sig-block"><div class="line">${nomeContratante}<br/>CONTRATANTE — Representante</div></div>
    <div class="sig-block"><div class="line">${a.empresaRazaoSocial}<br/>EMPRESA PRESTADORA — Representante</div></div>
  </div>
  <div class="sig-row">
    <div class="sig-block"><div class="line">${a.funcionarioNome}<br/>COLABORADOR TERCEIRIZADO — Ciência</div></div>
  </div>
  <div class="sig-row-3">
    <div class="sig-block-3"><div class="line">Testemunha 1${t1.nome ? "<br/><strong>" + t1.nome + "</strong>" : ""}${t1.doc ? "<br/>" + t1.doc : ""}</div></div>
    <div class="sig-block-3"><div class="line">Testemunha 2${t2.nome ? "<br/><strong>" + t2.nome + "</strong>" : ""}${t2.doc ? "<br/>" + t2.doc : ""}</div></div>
    <div class="sig-block-3"><div class="line">Testemunha 3${t3.nome ? "<br/><strong>" + t3.nome + "</strong>" : ""}${t3.doc ? "<br/>" + t3.doc : ""}</div></div>
  </div>
</div>
<div class="footer">
  <span>ERP - Gestão Integrada</span>
  <span>Documento gerado por: <strong>${userName}</strong> em ${dataEmissao}</span>
  <span class="lgpd">LGPD (Lei 13.709/2018) — Uso restrito e confidencial.</span>
</div>
</body></html>`;
  }

  function handlePrint(a: any) {
    const html = buildPrintHtml(a);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  }

  // Testemunhas helpers para o formulário
  const testArr: { nome: string; doc: string }[] = (() => {
    try { return JSON.parse(form.testemunhas || "[]"); } catch { return []; }
  })();
  function setTestemunha(idx: number, field: "nome" | "doc", value: string) {
    const arr = [...testArr];
    while (arr.length <= idx) arr.push({ nome: "", doc: "" });
    arr[idx] = { ...arr[idx], [field]: value };
    setForm({ ...form, testemunhas: JSON.stringify(arr) });
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-orange-600" />
              Advertências — Funcionários Terceiros
            </h1>
            <p className="text-sm text-muted-foreground">Notificações, advertências, suspensões de acesso à obra e solicitações de substituição.</p>
          </div>
          <Button onClick={openNew} disabled={!companyId}><Plus className="h-4 w-4 mr-1" /> Nova Advertência</Button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-semibold flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Importante</p>
          <p className="text-xs mt-1">A advertência é dirigida à <b>empresa prestadora de serviços</b> e ao <b>colaborador terceirizado</b>. Não há vínculo trabalhista entre a CONTRATANTE e o colaborador — a empresa prestadora é responsável pelas medidas disciplinares internas.</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome, CPF, motivo..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
                <SelectTrigger><SelectValue placeholder="Empresa Prestadora" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as empresas</SelectItem>
                  {empresasOrdenadas.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.razaoSocial}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {Object.entries(TIPOS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center text-sm text-muted-foreground">
                Total: <b className="ml-1">{filtered.length}</b> de {(lista as any[]).length}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Empresa Prestadora</th>
                    <th className="p-3 font-medium">Colaborador</th>
                    <th className="p-3 font-medium">Função</th>
                    <th className="p-3 font-medium">Tipo</th>
                    <th className="p-3 font-medium">Seq.</th>
                    <th className="p-3 font-medium">Data</th>
                    <th className="p-3 font-medium">Motivo</th>
                    <th className="p-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhuma advertência registrada</td></tr>
                  ) : filtered.map((a: any) => {
                    const tipo = TIPOS[a.tipoAdvertencia] || TIPOS.Advertencia;
                    return (
                      <tr key={a.id} className="border-t hover:bg-muted/30">
                        <td className="p-3"><div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-muted-foreground" />{a.empresaRazaoSocial}</div></td>
                        <td className="p-3 font-medium">{a.funcionarioNome}<div className="text-xs text-muted-foreground">{formatCPF(a.funcionarioCpf)}</div></td>
                        <td className="p-3"><div className="flex items-center gap-1.5"><HardHat className="h-3.5 w-3.5 text-muted-foreground" />{a.funcionarioFuncao || "-"}</div></td>
                        <td className="p-3"><Badge variant={tipo.badge}>{tipo.label}{a.tipoAdvertencia === "Suspensao" && a.diasSuspensao ? ` (${a.diasSuspensao}d)` : ""}</Badge></td>
                        <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded font-bold border ${(a.sequencia || 1) >= 3 ? "bg-red-100 text-red-700 border-red-300" : (a.sequencia || 1) === 2 ? "bg-yellow-100 text-yellow-700 border-yellow-300" : "bg-green-100 text-green-700 border-green-300"}`}>{a.sequencia || 1}ª</span></td>
                        <td className="p-3">{formatDateBR(a.dataOcorrencia)}</td>
                        <td className="p-3 max-w-[260px] truncate" title={a.motivo}>{a.motivo}</td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" title="Visualizar / Imprimir" onClick={() => setPreviewData(a)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" title="Imprimir" onClick={() => handlePrint(a)}>
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-purple-600" title="Enviar para Assinatura Eletrônica (IntegraSign)" onClick={() => abrirAssinatura(a)}>
                              <PenTool className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEdit(a)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar PDF assinado" onClick={() => handleUploadDoc(a.id)}>
                              <FileUp className="h-3.5 w-3.5" />
                            </Button>
                            {a.documentoUrl && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" title="Ver anexo" onClick={() => window.open(a.documentoUrl, "_blank")}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" title="Excluir" onClick={() => { if (confirm("Excluir esta advertência?")) deleteMut.mutate({ id: a.id }); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog Criar / Editar */}
      <FullScreenDialog open={showDialog} onClose={() => { setShowDialog(false); setEditingId(null); }} title={editingId ? "Editar Advertência" : "Nova Advertência — Funcionário Terceiro"} icon={<ShieldAlert className="h-5 w-5 text-white" />}>
        <div className="w-full max-w-3xl mx-auto space-y-5">
          <div className="rounded-xl border bg-gradient-to-r from-orange-50 to-amber-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-orange-600 flex items-center justify-center"><Building2 className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-orange-900">Empresa Prestadora & Colaborador</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Empresa Prestadora *</label>
                <Input
                  className="mt-1"
                  list="lista-empresas-prestadoras"
                  placeholder="Digite o nome ou selecione"
                  value={empresaInput}
                  onChange={async e => {
                    const v = e.target.value;
                    setEmpresaInput(v);
                    const match = empresasOrdenadas.find((emp: any) => {
                      const label = `${emp.razaoSocial}${emp.cnpj ? ` — ${formatCNPJ(emp.cnpj)}` : ""}`;
                      return label === v || emp.razaoSocial === v;
                    });
                    if (!match) {
                      // não encontrou — limpa seleção; usuário pode continuar digitando
                      setForm((prev: any) => ({ ...prev, empresaTerceiraId: undefined, fornecedorPendenteId: undefined, funcionarioTerceiroId: undefined }));
                      return;
                    }
                    if (match.source === "terceira") {
                      setForm((prev: any) => ({ ...prev, empresaTerceiraId: match.id, fornecedorPendenteId: undefined, funcionarioTerceiroId: undefined }));
                    } else {
                      // prestador vindo de Compras — cria/recupera empresa terceira vinculada
                      setForm((prev: any) => ({ ...prev, fornecedorPendenteId: match.fornecedorId, empresaTerceiraId: undefined, funcionarioTerceiroId: undefined }));
                      try {
                        const r = await ensureFromFornecedorMut.mutateAsync({ companyId, companyIds, fornecedorId: match.fornecedorId });
                        setForm((prev: any) => ({ ...prev, empresaTerceiraId: r.id, fornecedorPendenteId: undefined }));
                        if (r.created) toast.success("Empresa terceira vinculada ao prestador.");
                        refetchEmpresas();
                      } catch (err: any) {
                        toast.error(err?.message || "Erro ao vincular fornecedor a empresa terceira");
                        setForm((prev: any) => ({ ...prev, fornecedorPendenteId: undefined }));
                      }
                    }
                  }}
                />
                <datalist id="lista-empresas-prestadoras">
                  {empresasOrdenadas.map((e: any) => {
                    const label = `${e.razaoSocial}${e.cnpj ? ` — ${formatCNPJ(e.cnpj)}` : ""}`;
                    return (
                      <option key={`${e.source}:${e.id}`} value={label}>
                        {e.source === "fornecedor" ? "(prestador — Compras)" : ""}
                      </option>
                    );
                  })}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Colaborador Terceirizado <span className="text-gray-400 font-normal">(opcional)</span></label>
                <Input
                  className="mt-1"
                  list="lista-funcionarios-terceiros"
                  disabled={!form.empresaTerceiraId}
                  placeholder={form.empresaTerceiraId ? "Selecione um cadastrado ou digite o nome" : "Selecione a empresa primeiro"}
                  value={form.funcionarioNomeInput || ""}
                  onChange={e => {
                    const v = e.target.value;
                    const match = (funcionarios as any[]).find(f => f.nome === v);
                    setForm({
                      ...form,
                      funcionarioNomeInput: v,
                      funcionarioTerceiroId: match ? match.id : undefined,
                      funcionarioNomeManual: match ? undefined : v,
                      funcionarioCpfManual: match ? undefined : (form.funcionarioCpfManual || ""),
                      funcionarioFuncaoManual: match ? undefined : (form.funcionarioFuncaoManual || ""),
                    });
                  }}
                />
                <datalist id="lista-funcionarios-terceiros">
                  {(funcionarios as any[]).map(f => (
                    <option key={f.id} value={f.nome}>{f.cpf ? formatCPF(f.cpf) : ""}{f.funcao ? ` — ${f.funcao}` : ""}</option>
                  ))}
                </datalist>
              </div>
            </div>
            {form.funcionarioNomeInput && !form.funcionarioTerceiroId && (
              <div className="grid grid-cols-2 gap-4 mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="col-span-2 text-xs text-amber-800 font-medium">Colaborador não cadastrado — informe os dados abaixo (opcional, mas úteis no PDF):</div>
                <div>
                  <label className="text-xs font-medium text-gray-600">CPF</label>
                  <Input className="mt-1" value={form.funcionarioCpfManual || ""} onChange={e => setForm({ ...form, funcionarioCpfManual: e.target.value })} placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Função</label>
                  <Input className="mt-1" value={form.funcionarioFuncaoManual || ""} onChange={e => setForm({ ...form, funcionarioFuncaoManual: e.target.value })} placeholder="Função na obra" />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-rose-600 flex items-center justify-center"><ShieldAlert className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Dados da Ocorrência</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Tipo *</label>
                <Select value={form.tipoAdvertencia || ""} onValueChange={v => setForm({ ...form, tipoAdvertencia: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPOS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Data da Ocorrência *</label>
                <Input type="date" className="mt-1" value={form.dataOcorrencia || ""} onChange={e => setForm({ ...form, dataOcorrencia: e.target.value })} />
              </div>
              {form.tipoAdvertencia === "Suspensao" && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Dias de Suspensão de Acesso *</label>
                  <Input type="number" min={1} className="mt-1" value={form.diasSuspensao || ""} onChange={e => setForm({ ...form, diasSuspensao: parseInt(e.target.value) || 0 })} placeholder="Quantos dias de afastamento da obra" />
                </div>
              )}
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600">Aplicado por (responsável FC)</label>
                <Input className="mt-1" value={form.aplicadoPor || ""} onChange={e => setForm({ ...form, aplicadoPor: e.target.value })} placeholder={authUser?.name || "Nome do responsável"} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-orange-500 flex items-center justify-center"><MessageSquare className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Motivo e Descrição</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Motivo *</label>
                <Textarea className="mt-1" value={form.motivo || ""} onChange={e => setForm({ ...form, motivo: e.target.value })} rows={2} placeholder="Resumo do motivo (1-2 linhas)" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Descrição Detalhada</label>
                <Textarea className="mt-1" value={form.descricao || ""} onChange={e => setForm({ ...form, descricao: e.target.value })} rows={4} placeholder="Detalhamento completo da ocorrência" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-slate-600 flex items-center justify-center"><Users className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Testemunhas (opcional)</h3>
            </div>
            <div className="space-y-3">
              {[0, 1, 2].map(idx => (
                <div key={idx} className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Nome Testemunha {idx + 1}</label>
                    <Input className="mt-1" value={testArr[idx]?.nome || ""} onChange={e => setTestemunha(idx, "nome", e.target.value)} placeholder="Nome completo" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">CPF ou RG</label>
                    <Input className="mt-1" value={testArr[idx]?.doc || ""} onChange={e => setTestemunha(idx, "doc", e.target.value)} placeholder="Documento" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 pb-4">
            <Button variant="outline" size="lg" onClick={() => { setShowDialog(false); setEditingId(null); }}>Cancelar</Button>
            <Button size="lg" className="px-8 shadow-md" onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {(createMut.isPending || updateMut.isPending) ? "Salvando..." : editingId ? "Atualizar" : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* Diálogo de Assinatura Eletrônica */}
      <Dialog open={!!assinaturaDialog} onOpenChange={v => !v && setAssinaturaDialog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700"><PenTool className="h-4 w-4" /> Enviar para Assinatura Eletrônica</DialogTitle>
          </DialogHeader>
          {assinaturaDialog && (
            <div className="space-y-4">
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 text-xs text-purple-900">
                Será criado um envelope IntegraSign com 2 signatários: o representante da <b>empresa prestadora</b> (1º) e o <b>gestor / aplicador</b> da {nomeContratante} (2º). Ambos receberão e-mail com link individual de assinatura.
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">1º Signatário — Empresa Prestadora</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-600">Nome *</label><Input className="mt-1" value={assinaturaDialog.sigEmpresa.nome} onChange={e => setAssinaturaDialog({ ...assinaturaDialog, sigEmpresa: { ...assinaturaDialog.sigEmpresa, nome: e.target.value } })} /></div>
                  <div><label className="text-xs text-gray-600">E-mail *</label><Input className="mt-1" type="email" value={assinaturaDialog.sigEmpresa.email} onChange={e => setAssinaturaDialog({ ...assinaturaDialog, sigEmpresa: { ...assinaturaDialog.sigEmpresa, email: e.target.value } })} /></div>
                  <div><label className="text-xs text-gray-600">CPF/CNPJ</label><Input className="mt-1" value={assinaturaDialog.sigEmpresa.cpfCnpj} onChange={e => setAssinaturaDialog({ ...assinaturaDialog, sigEmpresa: { ...assinaturaDialog.sigEmpresa, cpfCnpj: e.target.value } })} /></div>
                  <div><label className="text-xs text-gray-600">Cargo</label><Input className="mt-1" value={assinaturaDialog.sigEmpresa.cargo} onChange={e => setAssinaturaDialog({ ...assinaturaDialog, sigEmpresa: { ...assinaturaDialog.sigEmpresa, cargo: e.target.value } })} /></div>
                  <div className="col-span-2"><label className="text-xs text-gray-600">Empresa</label><Input className="mt-1" value={assinaturaDialog.sigEmpresa.empresaNome} onChange={e => setAssinaturaDialog({ ...assinaturaDialog, sigEmpresa: { ...assinaturaDialog.sigEmpresa, empresaNome: e.target.value } })} /></div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">2º Signatário — Gestor / Aplicador (FC)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-600">Nome *</label><Input className="mt-1" value={assinaturaDialog.sigGestor.nome} onChange={e => setAssinaturaDialog({ ...assinaturaDialog, sigGestor: { ...assinaturaDialog.sigGestor, nome: e.target.value } })} /></div>
                  <div><label className="text-xs text-gray-600">E-mail *</label><Input className="mt-1" type="email" value={assinaturaDialog.sigGestor.email} onChange={e => setAssinaturaDialog({ ...assinaturaDialog, sigGestor: { ...assinaturaDialog.sigGestor, email: e.target.value } })} /></div>
                  <div className="col-span-2"><label className="text-xs text-gray-600">Cargo</label><Input className="mt-1" value={assinaturaDialog.sigGestor.cargo} onChange={e => setAssinaturaDialog({ ...assinaturaDialog, sigGestor: { ...assinaturaDialog.sigGestor, cargo: e.target.value } })} /></div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setAssinaturaDialog(null)} disabled={criarEnvelopeMut.isPending || enviarEnvelopeMut.isPending}>Cancelar</Button>
                <Button className="bg-purple-600 hover:bg-purple-700" onClick={enviarParaAssinatura} disabled={criarEnvelopeMut.isPending || enviarEnvelopeMut.isPending}>
                  {(criarEnvelopeMut.isPending || enviarEnvelopeMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  Criar envelope, enviar convites e abrir IntegraSign
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview / Imprimir */}
      {previewData && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPreviewData(null)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1e3a6e] text-white px-4 py-2 flex items-center justify-between rounded-t-lg">
              <div>
                <h2 className="text-base font-bold">{(TIPOS[previewData.tipoAdvertencia] || TIPOS.Advertencia).titulo}</h2>
                <p className="text-xs text-blue-200">{previewData.funcionarioNome} — {previewData.empresaRazaoSocial}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="gap-2 bg-white text-blue-800 hover:bg-blue-50" onClick={() => handlePrint(previewData)}>
                  <Printer className="h-4 w-4" /> Imprimir
                </Button>
                <Button size="sm" variant="outline" className="bg-white text-blue-800" onClick={() => setPreviewData(null)}>Fechar</Button>
              </div>
            </div>
            <iframe title="preview" className="flex-1 w-full" srcDoc={buildPrintHtml(previewData)} />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
