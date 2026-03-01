import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ClipboardCheck, Plus, CheckCircle, XCircle, Clock, Upload, FileText, Building2, Eye } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const DOC_FIELDS = [
  { key: "fgtsStatus", urlKey: "fgtsUrl", label: "FGTS" },
  { key: "inssStatus", urlKey: "inssUrl", label: "INSS/GPS" },
  { key: "folhaPagamentoStatus", urlKey: "folhaPagamentoUrl", label: "Folha de Pagamento" },
  { key: "comprovantePagamentoStatus", urlKey: "comprovantePagamentoUrl", label: "Comprovante Pagamento" },
  { key: "gpsStatus", urlKey: "gpsUrl", label: "GPS" },
  { key: "cndStatus", urlKey: "cndUrl", label: "CND" },
];

export default function ObrigacoesMensais() {
  const { user } = useAuth();
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [filterEmpresa, setFilterEmpresa] = useState<string>("all");
  const competencia = `${ano}-${String(mes).padStart(2, "0")}`;

  const { data: obrigacoes = [], refetch } = trpc.terceiros.obrigacoes.list.useQuery(
    { companyId: companyId ?? 0, competencia, empresaTerceiraId: filterEmpresa !== "all" ? parseInt(filterEmpresa) : undefined },
    { enabled: !!companyId }
  );
  const { data: empresas = [] } = trpc.terceiros.empresas.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const createMut = trpc.terceiros.obrigacoes.create.useMutation({ onSuccess: () => { refetch(); toast.success("Obrigação criada!"); } });
  const updateStatusMut = trpc.terceiros.obrigacoes.updateDocStatus.useMutation({ onSuccess: () => { refetch(); toast.success("Status atualizado!"); } });
  const uploadMut = trpc.terceiros.obrigacoes.uploadDoc.useMutation({ onSuccess: () => { refetch(); toast.success("Documento enviado!"); } });

  const handleUpload = (obrigacaoId: number, field: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMut.mutate({ obrigacaoId, field, fileName: file.name, fileBase64: base64, contentType: file.type });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const getEmpresaNome = (empresaId: number) => {
    const emp = empresas.find((e: any) => e.id === empresaId);
    return emp ? (emp as any).nomeFantasia || (emp as any).razaoSocial : "—";
  };

  const statusIcon = (status: string) => {
    if (status === "aprovado") return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    if (status === "rejeitado") return <XCircle className="h-4 w-4 text-red-500" />;
    if (status === "enviado") return <Eye className="h-4 w-4 text-blue-500" />;
    return <Clock className="h-4 w-4 text-amber-500" />;
  };

  const statusBg = (status: string) => {
    if (status === "aprovado") return "bg-emerald-50 border-emerald-200";
    if (status === "rejeitado") return "bg-red-50 border-red-200";
    if (status === "enviado") return "bg-blue-50 border-blue-200";
    return "bg-amber-50 border-amber-200";
  };

  const geralBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      completo: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Completo" },
      parcial: { bg: "bg-blue-100", text: "text-blue-700", label: "Parcial" },
      pendente: { bg: "bg-amber-100", text: "text-amber-700", label: "Pendente" },
    };
    const s = map[status] || map.pendente;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  const criarObrigacaoParaTodas = () => {
    const empresasAtivas = empresas.filter((e: any) => e.status === "ativa");
    const jaExistem = new Set(obrigacoes.map((o: any) => o.empresaTerceiraId));
    const novas = empresasAtivas.filter((e: any) => !jaExistem.has(e.id));
    if (novas.length === 0) { toast.info("Todas as empresas já têm obrigação para este mês"); return; }
    novas.forEach((e: any) => {
      createMut.mutate({ empresaTerceiraId: e.id, companyId: companyId ?? 0, competencia });
    });
    toast.success(`Criando obrigações para ${novas.length} empresa(s)`);
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500 flex items-center justify-center">
              <ClipboardCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Obrigações Mensais</h1>
              <p className="text-sm text-muted-foreground">Controle de documentos trabalhistas mensais</p>
            </div>
          </div>
          <Button onClick={criarObrigacaoParaTodas} className="bg-orange-500 hover:bg-orange-600">
            <Plus className="h-4 w-4 mr-1" /> Gerar Obrigações do Mês
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={String(mes)} onValueChange={(v) => setMes(parseInt(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={(v) => setAno(parseInt(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Empresas</SelectItem>
              {empresas.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nomeFantasia || e.razaoSocial}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        <div className="space-y-4">
          {obrigacoes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma obrigação para {MESES[mes - 1]} de {ano}</p>
              <p className="text-xs mt-1">Clique em "Gerar Obrigações do Mês" para criar</p>
            </div>
          ) : (
            obrigacoes.map((obr: any) => (
              <div key={obr.id} className="bg-card rounded-xl border p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-orange-500" />
                    <h3 className="font-semibold">{getEmpresaNome(obr.empresaTerceiraId)}</h3>
                    {geralBadge(obr.statusGeralObrigacao)}
                  </div>
                  <span className="text-xs text-muted-foreground">Competência: {MESES[mes - 1]}/{ano}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {DOC_FIELDS.map((doc) => (
                    <div key={doc.key} className={`rounded-lg border p-3 ${statusBg(obr[doc.key])}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          {statusIcon(obr[doc.key])}
                          <span className="text-sm font-medium">{doc.label}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {obr[doc.urlKey] && (
                          <a href={obr[doc.urlKey]} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
                            <FileText className="h-3 w-3" /> Ver
                          </a>
                        )}
                        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => handleUpload(obr.id, doc.urlKey)}>
                          <Upload className="h-3 w-3 mr-0.5" /> Upload
                        </Button>
                        <Select value={obr[doc.key]} onValueChange={(v: any) => updateStatusMut.mutate({ id: obr.id, field: doc.key, status: v })}>
                          <SelectTrigger className="h-6 text-xs w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendente">Pendente</SelectItem>
                            <SelectItem value="enviado">Enviado</SelectItem>
                            <SelectItem value="aprovado">Aprovado</SelectItem>
                            <SelectItem value="rejeitado">Rejeitado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
                {obr.validadoPor && (
                  <p className="text-xs text-muted-foreground mt-3">Validado por: {obr.validadoPor} em {obr.validadoEm ? new Date(obr.validadoEm).toLocaleDateString("pt-BR") : "—"}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
