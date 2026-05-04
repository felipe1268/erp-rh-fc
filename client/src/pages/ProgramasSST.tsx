import { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, FileUp, Eye, FileText, Search, Upload,
  Building2, HardHat, Loader2, ArrowLeft,
} from "lucide-react";
import { useLocation } from "wouter";

type TipoDoc = "PGR" | "PCMSO" | "LTCAT";

const TIPO_INFO: Record<TipoDoc, { label: string; desc: string; color: string }> = {
  PGR: { label: "PGR", desc: "Programa de Gerenciamento de Riscos", color: "blue" },
  PCMSO: { label: "PCMSO", desc: "Programa de Controle Médico de Saúde Ocupacional", color: "emerald" },
  LTCAT: { label: "LTCAT", desc: "Laudo Técnico das Condições Ambientais de Trabalho", color: "amber" },
};

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function StatusBadge({ status, diasRestantes }: { status: string; diasRestantes: number }) {
  if (status === "VENCIDO") return <Badge variant="destructive" className="text-xs">Vencido</Badge>;
  if (status === "SEM VALIDADE") return <Badge variant="secondary" className="text-xs">Sem validade</Badge>;
  if (diasRestantes <= 30) return <Badge className="bg-red-100 text-red-700 text-xs">{diasRestantes}d p/ vencer</Badge>;
  if (diasRestantes <= 90) return <Badge className="bg-amber-100 text-amber-700 text-xs">{diasRestantes}d p/ vencer</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 text-xs">Válido</Badge>;
}

function removeAccents(str: string) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function ProgramasSST() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || undefined : undefined;
  const companyIds = isConstrutoras ? getCompanyIdsForQuery() : undefined;

  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = (urlParams.get("tab") as TipoDoc) || "PGR";
  const [activeTab, setActiveTab] = useState<TipoDoc>(initialTab);
  const [search, setSearch] = useState("");

  const { data: allDocs = [], refetch } = trpc.sstDocuments.list.useQuery(
    { companyId: companyId!, companyIds },
    { enabled: !!companyId }
  );
  const { data: obrasAtivas = [] } = trpc.obras.listActive.useQuery(
    { companyId: companyId!, companyIds },
    { enabled: !!companyId }
  );

  const createDoc = trpc.sstDocuments.create.useMutation({ onSuccess: () => { refetch(); toast.success("Documento cadastrado!"); } });
  const updateDoc = trpc.sstDocuments.update.useMutation({ onSuccess: () => { refetch(); toast.success("Documento atualizado!"); } });
  const deleteDoc = trpc.sstDocuments.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Documento excluído!"); } });

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [replacingDocId, setReplacingDocId] = useState<number | null>(null);

  useEffect(() => {
    const handler = () => {
      const stored = sessionStorage.getItem("_navParams");
      if (stored) {
        const params = new URLSearchParams(stored);
        const tab = params.get("tab") as TipoDoc;
        if (tab && TIPO_INFO[tab]) setActiveTab(tab);
        sessionStorage.removeItem("_navParams");
      }
    };
    window.addEventListener("navParamsUpdated", handler);
    return () => window.removeEventListener("navParamsUpdated", handler);
  }, []);

  const filteredDocs = useMemo(() => {
    let list = (allDocs as any[]).filter((d: any) => d.tipo === activeTab);
    if (search) {
      const s = removeAccents(search);
      list = list.filter((d: any) =>
        removeAccents(d.descricao || "").includes(s) ||
        removeAccents(d.lotacao || "").includes(s) ||
        removeAccents(d.responsavelElaboracao || "").includes(s) ||
        removeAccents(d.empresaElaboradora || "").includes(s)
      );
    }
    return list;
  }, [allDocs, activeTab, search]);

  const resumo = useMemo(() => {
    const byTipo: Record<TipoDoc, { total: number; vencidos: number; aVencer: number }> = {
      PGR: { total: 0, vencidos: 0, aVencer: 0 },
      PCMSO: { total: 0, vencidos: 0, aVencer: 0 },
      LTCAT: { total: 0, vencidos: 0, aVencer: 0 },
    };
    (allDocs as any[]).forEach((d: any) => {
      const t = d.tipo as TipoDoc;
      if (!byTipo[t]) return;
      byTipo[t].total++;
      if (d.statusCalculado === "VENCIDO") byTipo[t].vencidos++;
      else if (d.diasRestantes <= 90 && d.statusCalculado !== "SEM VALIDADE") byTipo[t].aVencer++;
    });
    return byTipo;
  }, [allDocs]);

  const openNew = () => {
    setEditingId(null);
    setForm({ tipo: activeTab, obraId: null });
    setSelectedFile(null);
    setShowDialog(true);
  };

  const openEdit = (doc: any) => {
    setEditingId(doc.id);
    setForm({
      tipo: doc.tipo,
      obraId: doc.obraId,
      descricao: doc.descricao || "",
      dataElaboracao: doc.dataElaboracao || "",
      dataValidade: doc.dataValidade || "",
      responsavelElaboracao: doc.responsavelElaboracao || "",
      registroProfissional: doc.registroProfissional || "",
      empresaElaboradora: doc.empresaElaboradora || "",
      observacoes: doc.observacoes || "",
    });
    setSelectedFile(null);
    setShowDialog(true);
  };

  async function uploadFileMultipart(file: File, tipo: string, extract = false): Promise<{ url: string; fileName: string; extracted?: any }> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("tipo", tipo);
    formData.append("companyId", String(companyId || 0));
    if (extract) formData.append("extract", "true");

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload/sst-document");
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error("Erro ao processar resposta")); }
        } else {
          reject(new Error(`Erro ${xhr.status}: ${xhr.statusText}`));
        }
      };
      xhr.onerror = () => reject(new Error("Erro de rede durante upload"));
      xhr.send(formData);
    });
  }

  const handleFileSelect = async (file: File) => {
    if (file.size > 150 * 1024 * 1024) {
      toast.error("Arquivo muito grande! Limite: 150MB");
      return;
    }
    setSelectedFile(file);

    const isPdfOrImage = file.type === "application/pdf" || file.type.startsWith("image/");
    if (!isPdfOrImage) return;

    try {
      setExtracting(true);
      toast.info("Lendo documento com IA...", { duration: 5000 });
      const result = await uploadFileMultipart(file, form.tipo || activeTab, true);

      if (result.extracted) {
        const ext = result.extracted;
        const updated: any = { ...form };
        let fieldsFound = 0;
        if (ext.descricao && !form.descricao) { updated.descricao = ext.descricao; fieldsFound++; }
        if (ext.dataElaboracao && !form.dataElaboracao) { updated.dataElaboracao = ext.dataElaboracao; fieldsFound++; }
        if (ext.dataValidade && !form.dataValidade) { updated.dataValidade = ext.dataValidade; fieldsFound++; }
        if (ext.responsavelElaboracao && !form.responsavelElaboracao) { updated.responsavelElaboracao = ext.responsavelElaboracao; fieldsFound++; }
        if (ext.registroProfissional && !form.registroProfissional) { updated.registroProfissional = ext.registroProfissional; fieldsFound++; }
        if (ext.empresaElaboradora && !form.empresaElaboradora) { updated.empresaElaboradora = ext.empresaElaboradora; fieldsFound++; }
        if (ext.observacoes && !form.observacoes) { updated.observacoes = ext.observacoes; fieldsFound++; }

        updated._preUploadedUrl = result.url;
        updated._preUploadedName = result.fileName;
        setForm(updated);

        if (fieldsFound > 0) {
          toast.success(`IA preencheu ${fieldsFound} campo(s) automaticamente!`);
        } else {
          toast.info("IA não encontrou dados adicionais no documento.");
        }
      } else {
        setForm({ ...form, _preUploadedUrl: result.url, _preUploadedName: result.fileName });
        toast.info("Documento enviado. IA não conseguiu extrair dados.");
      }
    } catch (err: any) {
      console.error("Erro na extração IA:", err);
      toast.warning("Arquivo selecionado, mas a leitura automática falhou. Preencha os campos manualmente.");
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!companyId) return;
    try {
      setUploading(true);
      setUploadProgress(0);

      let arquivoUrl: string | undefined;
      let arquivoNome: string | undefined;

      if (form._preUploadedUrl) {
        arquivoUrl = form._preUploadedUrl;
        arquivoNome = form._preUploadedName;
      } else if (selectedFile) {
        const result = await uploadFileMultipart(selectedFile, form.tipo || activeTab);
        arquivoUrl = result.url;
        arquivoNome = result.fileName;
      }

      if (editingId) {
        await updateDoc.mutateAsync({
          id: editingId,
          obraId: form.obraId || null,
          descricao: form.descricao || "",
          dataElaboracao: form.dataElaboracao || "",
          dataValidade: form.dataValidade || "",
          responsavelElaboracao: form.responsavelElaboracao || "",
          registroProfissional: form.registroProfissional || "",
          empresaElaboradora: form.empresaElaboradora || "",
          observacoes: form.observacoes || "",
          ...(arquivoUrl ? { arquivoUrl, arquivoNome } : {}),
        });
      } else {
        await createDoc.mutateAsync({
          companyId,
          obraId: form.obraId || null,
          tipo: form.tipo || activeTab,
          descricao: form.descricao || "",
          dataElaboracao: form.dataElaboracao || "",
          dataValidade: form.dataValidade || "",
          responsavelElaboracao: form.responsavelElaboracao || "",
          registroProfissional: form.registroProfissional || "",
          empresaElaboradora: form.empresaElaboradora || "",
          observacoes: form.observacoes || "",
          ...(arquivoUrl ? { arquivoUrl, arquivoNome } : {}),
        });
      }
      setShowDialog(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar documento");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleReplaceFile = async (docId: number, file: File) => {
    try {
      setUploading(true);
      setUploadProgress(0);
      const doc = (allDocs as any[]).find((d: any) => d.id === docId);
      const result = await uploadFileMultipart(file, doc?.tipo || activeTab);
      await updateDoc.mutateAsync({
        id: docId,
        arquivoUrl: result.url,
        arquivoNome: result.fileName,
      });
      toast.success("Arquivo atualizado!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao substituir arquivo");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setReplacingDocId(null);
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => navigate("/painel/sst")}
            title="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Programas SST</h1>
            <p className="text-muted-foreground text-sm">PGR, PCMSO e LTCAT — Gestão de documentos legais de SST</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["PGR", "PCMSO", "LTCAT"] as TipoDoc[]).map((tipo) => {
          const info = TIPO_INFO[tipo];
          const r = resumo[tipo];
          return (
            <Card
              key={tipo}
              className={`cursor-pointer transition-all hover:shadow-md ${activeTab === tipo ? "ring-2 ring-offset-1 ring-" + info.color + "-500" : ""}`}
              onClick={() => setActiveTab(tipo)}
            >
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className={`h-5 w-5 text-${info.color}-600`} />
                    <span className="font-bold text-lg">{info.label}</span>
                  </div>
                  <span className="text-2xl font-bold">{r.total}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{info.desc}</p>
                <div className="flex gap-2">
                  {r.vencidos > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      {r.vencidos} vencido{r.vencidos > 1 ? "s" : ""}
                    </span>
                  )}
                  {r.aVencer > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      {r.aVencer} a vencer
                    </span>
                  )}
                  {r.vencidos === 0 && r.aVencer === 0 && r.total > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      Todos válidos
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {TIPO_INFO[activeTab].label} — {TIPO_INFO[activeTab].desc}
            </CardTitle>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                className="pl-9 h-9 w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Novo {TIPO_INFO[activeTab].label}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Lotação</th>
                  <th className="pb-2 font-medium">Descrição</th>
                  <th className="pb-2 font-medium">Elaboração</th>
                  <th className="pb-2 font-medium">Validade</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Responsável</th>
                  <th className="pb-2 font-medium">Empresa Elaboradora</th>
                  <th className="pb-2 font-medium">Arquivo</th>
                  <th className="pb-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground">
                      Nenhum {TIPO_INFO[activeTab].label} cadastrado
                    </td>
                  </tr>
                ) : (
                  filteredDocs.map((doc: any) => (
                    <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2">
                        <div className="flex items-center gap-1.5">
                          {doc.obraId ? (
                            <HardHat className="h-3.5 w-3.5 text-orange-500" />
                          ) : (
                            <Building2 className="h-3.5 w-3.5 text-blue-500" />
                          )}
                          <span className="text-xs font-medium">{doc.lotacao}</span>
                        </div>
                      </td>
                      <td className="py-2 max-w-[200px]">
                        <span className="text-xs">{doc.descricao || "—"}</span>
                      </td>
                      <td className="py-2 text-xs">{formatDate(doc.dataElaboracao)}</td>
                      <td className="py-2 text-xs">{formatDate(doc.dataValidade)}</td>
                      <td className="py-2">
                        <StatusBadge status={doc.statusCalculado} diasRestantes={doc.diasRestantes} />
                      </td>
                      <td className="py-2">
                        <div className="text-xs">{doc.responsavelElaboracao || "—"}</div>
                        {doc.registroProfissional && (
                          <div className="text-xs text-muted-foreground">{doc.registroProfissional}</div>
                        )}
                      </td>
                      <td className="py-2 text-xs">{doc.empresaElaboradora || "—"}</td>
                      <td className="py-2">
                        {doc.arquivoUrl ? (
                          <a
                            href={doc.arquivoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            {doc.arquivoNome ? (
                              <span className="max-w-[100px] truncate">{doc.arquivoNome}</span>
                            ) : "Ver"}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEdit(doc)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Substituir/Anexar arquivo"
                            onClick={() => {
                              setReplacingDocId(doc.id);
                              replaceFileRef.current?.click();
                            }}
                          >
                            <FileUp className="h-3.5 w-3.5" />
                          </Button>
                          {doc.arquivoUrl && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Ver arquivo"
                              onClick={() => window.open(doc.arquivoUrl, "_blank")}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-500"
                            title="Excluir"
                            onClick={() => {
                              if (confirm("Excluir este documento?")) deleteDoc.mutate({ id: doc.id });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <input
        ref={replaceFileRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && replacingDocId) handleReplaceFile(replacingDocId, f);
          e.target.value = "";
        }}
      />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar" : "Novo"} {TIPO_INFO[form.tipo || activeTab]?.label || activeTab}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Lotação *</Label>
                <Select
                  value={form.obraId ? String(form.obraId) : "matriz"}
                  onValueChange={(v) => setForm({ ...form, obraId: v === "matriz" ? null : parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="matriz">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-blue-500" /> Matriz
                      </div>
                    </SelectItem>
                    {(obrasAtivas as any[]).map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        <div className="flex items-center gap-2">
                          <HardHat className="h-4 w-4 text-orange-500" /> {o.nome}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={form.descricao || ""}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder={`Ex: ${TIPO_INFO[form.tipo || activeTab]?.label} 2026`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data de Elaboração</Label>
                <Input
                  type="date"
                  value={form.dataElaboracao || ""}
                  onChange={(e) => setForm({ ...form, dataElaboracao: e.target.value })}
                />
              </div>
              <div>
                <Label>Data de Validade</Label>
                <Input
                  type="date"
                  value={form.dataValidade || ""}
                  onChange={(e) => setForm({ ...form, dataValidade: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Responsável pela Elaboração</Label>
                <Input
                  value={form.responsavelElaboracao || ""}
                  onChange={(e) => setForm({ ...form, responsavelElaboracao: e.target.value })}
                  placeholder="Nome do responsável técnico"
                />
              </div>
              <div>
                <Label>Registro Profissional (CREA/CRM)</Label>
                <Input
                  value={form.registroProfissional || ""}
                  onChange={(e) => setForm({ ...form, registroProfissional: e.target.value })}
                  placeholder="Ex: CREA-RJ 2024/123456"
                />
              </div>
            </div>

            <div>
              <Label>Empresa Elaboradora</Label>
              <Input
                value={form.empresaElaboradora || ""}
                onChange={(e) => setForm({ ...form, empresaElaboradora: e.target.value })}
                placeholder="Nome da empresa que elaborou o documento"
              />
            </div>

            <div>
              <Label>Arquivo (até 150MB)</Label>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  extracting ? "border-blue-400 bg-blue-50/50 animate-pulse" :
                  selectedFile ? "border-emerald-300 bg-emerald-50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/30"
                }`}
                onClick={() => !extracting && fileInputRef.current?.click()}
              >
                {extracting ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <p className="text-sm font-medium text-blue-700">Lendo documento com IA...</p>
                    <p className="text-xs text-muted-foreground">Extraindo validade, responsável, empresa e mais</p>
                  </div>
                ) : selectedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700">{selectedFile.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {editingId ? "Clique para substituir o arquivo" : "Clique para selecionar o arquivo"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, ZIP — até 150MB</p>
                    <p className="text-xs text-blue-500 mt-1">A IA lerá o documento e preencherá os campos automaticamente</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes || ""}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Observações adicionais..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={uploading || extracting}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={uploading || extracting || createDoc.isPending || updateDoc.isPending}>
              {uploading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando... {uploadProgress}%
                </span>
              ) : editingId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {uploading && (
        <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 border z-50 w-72">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <span className="text-sm font-medium">Enviando arquivo...</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground mt-1 block">{uploadProgress}%</span>
        </div>
      )}
    </div>
  );
}
