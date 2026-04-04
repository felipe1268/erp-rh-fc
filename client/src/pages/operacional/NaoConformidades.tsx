import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  AlertTriangle, Plus, Loader2, CheckCircle, Eye,
  XCircle, Clock,
} from "lucide-react";

const ORIGENS = ["RDO", "Checklist", "Concretagem", "Inspeção", "Auditoria", "Cliente", "Outro"];
const GRAVIDADES = [
  { value: "baixa", label: "Baixa", color: "text-blue-600" },
  { value: "media", label: "Média", color: "text-amber-600" },
  { value: "alta", label: "Alta", color: "text-orange-600" },
  { value: "critica", label: "Crítica", color: "text-red-600" },
];
const DISCIPLINAS = ["Civil", "Elétrica", "Hidráulica", "Estrutura", "Acabamento", "Fundação", "Impermeabilização", "Pintura", "Segurança"];

export default function NaoConformidades() {
  const { companyId } = useCompany();
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const obraIdParam = Number(params.get("obra")) || 0;
  const obras = trpc.obras.listActive.useQuery({ companyId }, { enabled: !!companyId });
  const [obraId, setObraId] = useState<number>(obraIdParam);
  const selectedObraId = obraId || obraIdParam || (obras.data as any)?.[0]?.id || 0;
  const [filtroStatus, setFiltroStatus] = useState<string>("");

  const ncs = trpc.operacional.listarNCs.useQuery(
    { companyId, obraId: selectedObraId, status: filtroStatus || undefined },
    { enabled: !!companyId && !!selectedObraId },
  );

  const [dialogNova, setDialogNova] = useState(false);
  const [dialogDetalhe, setDialogDetalhe] = useState<any>(null);
  const [novaNC, setNovaNC] = useState({ origem: "", descricao: "", disciplina: "", local: "", gravidade: "media", responsavelNome: "", prazo: "" });

  const criarNC = trpc.operacional.criarNC.useMutation({
    onSuccess: (data) => { toast.success(`NC ${data.numero} criada!`); ncs.refetch(); setDialogNova(false); },
  });
  const atualizarNC = trpc.operacional.atualizarNC.useMutation({
    onSuccess: () => { toast.success("NC atualizada!"); ncs.refetch(); setDialogDetalhe(null); },
  });

  const [planoAcao, setPlanoAcao] = useState("");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Não Conformidades</h1>
          <p className="text-sm text-gray-500">Registro e tratativa de não conformidades</p>
        </div>
        <div className="flex gap-3">
          <Select value={String(selectedObraId || "")} onValueChange={(v) => setObraId(Number(v))}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Obra" /></SelectTrigger>
            <SelectContent>
              {(obras.data as any[])?.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos</SelectItem>
              <SelectItem value="aberta">Abertas</SelectItem>
              <SelectItem value="em_tratativa">Em Tratativa</SelectItem>
              <SelectItem value="fechada">Fechadas</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => { setNovaNC({ origem: "", descricao: "", disciplina: "", local: "", gravidade: "media", responsavelNome: "", prazo: "" }); setDialogNova(true); }} disabled={!selectedObraId}>
            <Plus className="w-4 h-4 mr-2" /> Nova NC
          </Button>
        </div>
      </div>

      {ncs.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : (ncs.data as any[])?.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Nenhuma não conformidade registrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(ncs.data as any[])?.map((nc: any) => {
            const grav = GRAVIDADES.find(g => g.value === nc.gravidade);
            return (
              <div key={nc.id}
                className={`border rounded-lg p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer ${nc.status === "aberta" ? "border-l-4 border-l-red-400" : nc.status === "em_tratativa" ? "border-l-4 border-l-amber-400" : ""}`}
                onClick={() => { setDialogDetalhe(nc); setPlanoAcao(nc.plano_acao || ""); }}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm">{nc.numero_nc}</span>
                    <Badge variant="outline" className={grav?.color}>{grav?.label || nc.gravidade}</Badge>
                    <Badge variant="outline">{nc.origem}</Badge>
                    {nc.disciplina && <Badge variant="secondary">{nc.disciplina}</Badge>}
                  </div>
                  <p className="text-sm mt-1">{nc.descricao}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Aberta em {new Date(nc.data_abertura).toLocaleDateString("pt-BR")}
                    {nc.prazo && ` • Prazo: ${new Date(nc.prazo).toLocaleDateString("pt-BR")}`}
                    {nc.responsavel_nome && ` • ${nc.responsavel_nome}`}
                  </p>
                </div>
                <Badge variant={nc.status === "fechada" ? "default" : nc.status === "em_tratativa" ? "secondary" : "destructive"}>
                  {nc.status === "fechada" ? "Fechada" : nc.status === "em_tratativa" ? "Em Tratativa" : "Aberta"}
                </Badge>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogNova} onOpenChange={setDialogNova}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Não Conformidade</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Origem</Label>
                <Select value={novaNC.origem} onValueChange={(v) => setNovaNC({ ...novaNC, origem: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{ORIGENS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Gravidade</Label>
                <Select value={novaNC.gravidade} onValueChange={(v) => setNovaNC({ ...novaNC, gravidade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GRAVIDADES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Descrição</Label><Textarea value={novaNC.descricao} onChange={(e) => setNovaNC({ ...novaNC, descricao: e.target.value })} placeholder="Descreva a não conformidade..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Disciplina</Label>
                <Select value={novaNC.disciplina} onValueChange={(v) => setNovaNC({ ...novaNC, disciplina: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{DISCIPLINAS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Local</Label><Input value={novaNC.local} onChange={(e) => setNovaNC({ ...novaNC, local: e.target.value })} placeholder="Ex: Bloco A, 3° Pav." /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Responsável</Label><Input value={novaNC.responsavelNome} onChange={(e) => setNovaNC({ ...novaNC, responsavelNome: e.target.value })} /></div>
              <div><Label>Prazo</Label><Input type="date" value={novaNC.prazo} onChange={(e) => setNovaNC({ ...novaNC, prazo: e.target.value })} /></div>
            </div>
            <Button className="w-full" disabled={!novaNC.descricao || !novaNC.origem || criarNC.isPending}
              onClick={() => criarNC.mutate({ companyId, obraId: selectedObraId, ...novaNC })}>
              {criarNC.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Registrar NC
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dialogDetalhe} onOpenChange={() => setDialogDetalhe(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>NC {dialogDetalhe?.numero_nc}</DialogTitle></DialogHeader>
          {dialogDetalhe && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded p-3">
                <p className="text-sm">{dialogDetalhe.descricao}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline">{dialogDetalhe.origem}</Badge>
                  <Badge variant="outline">{GRAVIDADES.find(g => g.value === dialogDetalhe.gravidade)?.label}</Badge>
                  {dialogDetalhe.disciplina && <Badge variant="secondary">{dialogDetalhe.disciplina}</Badge>}
                </div>
              </div>
              {dialogDetalhe.status !== "fechada" && (
                <>
                  <div><Label>Plano de Ação</Label><Textarea value={planoAcao} onChange={(e) => setPlanoAcao(e.target.value)} placeholder="Descreva o plano de ação..." /></div>
                  <div className="flex gap-2">
                    <Button className="flex-1" variant="outline"
                      onClick={() => atualizarNC.mutate({ id: dialogDetalhe.id, companyId, planoAcao, status: "em_tratativa" })}>
                      <Clock className="w-4 h-4 mr-2" /> Em Tratativa
                    </Button>
                    <Button className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => atualizarNC.mutate({ id: dialogDetalhe.id, companyId, planoAcao, status: "fechada" })}>
                      <CheckCircle className="w-4 h-4 mr-2" /> Fechar NC
                    </Button>
                  </div>
                </>
              )}
              {dialogDetalhe.status === "fechada" && dialogDetalhe.plano_acao && (
                <div className="bg-green-50 rounded p-3">
                  <p className="text-xs font-semibold text-green-700 mb-1">Plano de Ação</p>
                  <p className="text-sm">{dialogDetalhe.plano_acao}</p>
                  {dialogDetalhe.data_fechamento && (
                    <p className="text-xs text-green-600 mt-1">Fechada em {new Date(dialogDetalhe.data_fechamento).toLocaleDateString("pt-BR")}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
