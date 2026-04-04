import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Camera, Plus, Loader2, Upload, X, Image as ImageIcon, Calendar,
} from "lucide-react";

const DISCIPLINAS = ["Civil", "Elétrica", "Hidráulica", "Estrutura", "Acabamento", "Fundação", "Impermeabilização", "Pintura", "Segurança", "Geral"];

export default function RegistroFotografico() {
  const { companyId } = useCompany();
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const obraIdParam = Number(params.get("obra")) || 0;
  const obras = trpc.obras.listActive.useQuery({ companyId }, { enabled: !!companyId });
  const [obraId, setObraId] = useState<number>(obraIdParam);
  const selectedObraId = obraId || obraIdParam || (obras.data as any)?.[0]?.id || 0;
  const [filtroDisciplina, setFiltroDisciplina] = useState<string>("");
  const [filtroData, setFiltroData] = useState<string>("");

  const fotos = trpc.operacional.listarFotos.useQuery(
    { companyId, obraId: selectedObraId, data: filtroData || undefined },
    { enabled: !!companyId && !!selectedObraId },
  );

  const [dialogUpload, setDialogUpload] = useState(false);
  const [dialogViewer, setDialogViewer] = useState<any>(null);
  const [uploadForm, setUploadForm] = useState({ legenda: "", disciplina: "", local: "", pavimento: "" });
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const adicionarFoto = trpc.operacional.adicionarFoto.useMutation({
    onSuccess: () => { toast.success("Foto adicionada!"); fotos.refetch(); setDialogUpload(false); setPreviewUrl(""); },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 5MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const fotosExibidas = filtroDisciplina
    ? (fotos.data as any[])?.filter((f: any) => f.disciplina === filtroDisciplina)
    : (fotos.data as any[]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Registro Fotográfico</h1>
          <p className="text-sm text-gray-500">Galeria de fotos da obra</p>
        </div>
        <div className="flex gap-3">
          <Select value={String(selectedObraId || "")} onValueChange={(v) => setObraId(Number(v))}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Obra" /></SelectTrigger>
            <SelectContent>
              {(obras.data as any[])?.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroDisciplina} onValueChange={setFiltroDisciplina}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Disciplina" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todas</SelectItem>
              {DISCIPLINAS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" className="w-40" value={filtroData} onChange={(e) => setFiltroData(e.target.value)} />
          <Button onClick={() => { setUploadForm({ legenda: "", disciplina: "", local: "", pavimento: "" }); setPreviewUrl(""); setDialogUpload(true); }} disabled={!selectedObraId}>
            <Camera className="w-4 h-4 mr-2" /> Nova Foto
          </Button>
        </div>
      </div>

      {fotos.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : !fotosExibidas?.length ? (
        <div className="text-center py-20 text-gray-400">
          <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Nenhuma foto registrada</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {fotosExibidas.map((f: any) => (
            <Card key={f.id} className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden" onClick={() => setDialogViewer(f)}>
              <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                {f.foto_url ? (
                  <img src={f.foto_url} alt={f.legenda || "Foto"} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-12 h-12 text-gray-300" />
                )}
              </div>
              <CardContent className="p-2">
                {f.legenda && <p className="text-xs font-medium truncate">{f.legenda}</p>}
                <div className="flex items-center gap-1 mt-1">
                  {f.disciplina && <Badge variant="outline" className="text-xs py-0">{f.disciplina}</Badge>}
                  <span className="text-xs text-gray-400">{f.data ? new Date(f.data + "T12:00:00").toLocaleDateString("pt-BR") : ""}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogUpload} onOpenChange={setDialogUpload}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Foto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50" onClick={() => fileRef.current?.click()}>
              {previewUrl ? (
                <div className="relative">
                  <img src={previewUrl} alt="Preview" className="max-h-48 mx-auto rounded" />
                  <Button size="sm" variant="ghost" className="absolute top-0 right-0" onClick={(e) => { e.stopPropagation(); setPreviewUrl(""); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="py-6">
                  <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500">Clique para selecionar uma foto</p>
                  <p className="text-xs text-gray-400">Máx. 5MB</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
            <div><Label>Legenda</Label><Input value={uploadForm.legenda} onChange={(e) => setUploadForm({ ...uploadForm, legenda: e.target.value })} placeholder="Descreva a foto..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Disciplina</Label>
                <Select value={uploadForm.disciplina} onValueChange={(v) => setUploadForm({ ...uploadForm, disciplina: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{DISCIPLINAS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Local</Label><Input value={uploadForm.local} onChange={(e) => setUploadForm({ ...uploadForm, local: e.target.value })} placeholder="Ex: Bloco A" /></div>
            </div>
            <div><Label>Pavimento</Label><Input value={uploadForm.pavimento} onChange={(e) => setUploadForm({ ...uploadForm, pavimento: e.target.value })} placeholder="Ex: Térreo" /></div>
            <Button className="w-full" disabled={!previewUrl || adicionarFoto.isPending}
              onClick={() => adicionarFoto.mutate({ companyId, obraId: selectedObraId, fotoUrl: previewUrl, ...uploadForm })}>
              {adicionarFoto.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
              Salvar Foto
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dialogViewer} onOpenChange={() => setDialogViewer(null)}>
        <DialogContent className="max-w-2xl">
          {dialogViewer && (
            <div>
              <img src={dialogViewer.foto_url} alt={dialogViewer.legenda || "Foto"} className="w-full rounded-lg" />
              <div className="mt-3">
                {dialogViewer.legenda && <p className="font-medium">{dialogViewer.legenda}</p>}
                <div className="flex gap-2 mt-1">
                  {dialogViewer.disciplina && <Badge variant="outline">{dialogViewer.disciplina}</Badge>}
                  {dialogViewer.local && <Badge variant="secondary">{dialogViewer.local}</Badge>}
                  {dialogViewer.pavimento && <Badge variant="secondary">{dialogViewer.pavimento}</Badge>}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {dialogViewer.data ? new Date(dialogViewer.data + "T12:00:00").toLocaleDateString("pt-BR") : ""}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
