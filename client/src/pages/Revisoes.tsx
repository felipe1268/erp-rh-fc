import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { GitBranch, Plus, Trash2, Bug, Sparkles, Shield, Zap, Wrench, Calendar, User, Tag, FileText, Printer } from "lucide-react";

const TIPO_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  feature: { label: "Nova Funcionalidade", color: "bg-blue-100 text-blue-800 border-blue-200", icon: <Sparkles className="h-3.5 w-3.5" /> },
  bugfix: { label: "Correção de Bug", color: "bg-red-100 text-red-800 border-red-200", icon: <Bug className="h-3.5 w-3.5" /> },
  melhoria: { label: "Melhoria", color: "bg-green-100 text-green-800 border-green-200", icon: <Wrench className="h-3.5 w-3.5" /> },
  seguranca: { label: "Segurança", color: "bg-amber-100 text-amber-800 border-amber-200", icon: <Shield className="h-3.5 w-3.5" /> },
  performance: { label: "Performance", color: "bg-purple-100 text-purple-800 border-purple-200", icon: <Zap className="h-3.5 w-3.5" /> },
};

export default function Revisoes() {
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const revisionsQuery = trpc.revisions.list.useQuery(undefined, { enabled: isMaster });
  const createMut = trpc.revisions.create.useMutation({
    onSuccess: () => { revisionsQuery.refetch(); setShowDialog(false); resetForm(); toast.success("Revisão registrada!"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.revisions.delete.useMutation({
    onSuccess: () => { revisionsQuery.refetch(); toast.success("Revisão excluída"); },
    onError: (err) => toast.error(err.message),
  });

  const [showDialog, setShowDialog] = useState(false);
  const [version, setVersion] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<string>("feature");
  const [modulos, setModulos] = useState("");

  const resetForm = () => { setVersion(""); setTitulo(""); setDescricao(""); setTipo("feature"); setModulos(""); };

  const handleCreate = () => {
    if (!version || !titulo || !descricao) { toast.error("Preencha todos os campos obrigatórios"); return; }
    createMut.mutate({
      version: parseInt(version),
      titulo,
      descricao,
      tipo: tipo as any,
      modulos: modulos || undefined,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isMaster) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <Shield className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Acesso Restrito</p>
          <p className="text-sm">Apenas o Admin Master pode acessar o Controle de Revisões.</p>
        </div>
      </div>
    );
  }

  const revisions = revisionsQuery.data || [];
  const nextVersion = revisions.length > 0 ? (revisions[0]?.version || 0) + 1 : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <GitBranch className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold">Controle de Revisões</h1>
          </div>
          <p className="text-muted-foreground mt-1">Histórico detalhado de todas as atualizações do sistema</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setVersion(String(nextVersion)); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Nova Revisão
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <div className="bg-background border rounded-lg p-2.5 text-center">
          <p className="text-xl font-bold text-primary">{revisions.length}</p>
          <p className="text-[10px] leading-tight text-muted-foreground">Total</p>
        </div>
        {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
          <div key={key} className="bg-background border rounded-lg p-2.5 text-center">
            <p className="text-xl font-bold">{revisions.filter(r => r.tipo === key).length}</p>
            <p className="text-[10px] leading-tight text-muted-foreground flex items-center justify-center gap-0.5">{cfg.icon} <span className="truncate">{cfg.label}</span></p>
          </div>
        ))}
      </div>

      {/* Revision Timeline */}
      <div className="space-y-0">
        {revisions.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma revisão registrada ainda.</p>
            <p className="text-sm">Clique em "Nova Revisão" para registrar a primeira atualização.</p>
          </div>
        )}
        {revisions.map((rev, idx) => {
          const cfg = TIPO_CONFIG[rev.tipo] || TIPO_CONFIG.feature;
          const isLatest = idx === 0;
          return (
            <div key={rev.id} className={`relative border-l-4 ${isLatest ? "border-primary" : "border-muted"} pl-6 pb-8 ml-4`}>
              {/* Timeline dot */}
              <div className={`absolute -left-[11px] top-0 w-[18px] h-[18px] rounded-full border-2 ${isLatest ? "bg-primary border-primary" : "bg-muted border-muted-foreground/30"}`} />

              <div className={`bg-background border rounded-lg p-5 ${isLatest ? "ring-2 ring-primary/20" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant="outline" className="text-sm font-mono font-bold px-2.5 py-0.5">
                        Rev. {rev.version}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${cfg.color} border`}>
                        {cfg.icon}
                        <span className="ml-1">{cfg.label}</span>
                      </Badge>
                      {isLatest && (
                        <Badge className="bg-primary text-primary-foreground text-xs">
                          Atual
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold mt-2">{rev.titulo}</h3>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{rev.descricao}</p>
                    {rev.modulos && (
                      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        {rev.modulos.split(",").map((m, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{m.trim()}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> {rev.criadoPor}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" /> {rev.dataPublicacao ? new Date(rev.dataPublicacao).toLocaleString("pt-BR") : "—"}
                      </span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0" onClick={() => {
                    if (confirm(`Excluir revisão ${rev.version}?`)) deleteMut.mutate({ id: rev.id });
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Registrar Nova Revisão
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Número da Revisão *</Label>
                <Input type="number" value={version} onChange={e => setVersion(e.target.value)} placeholder="Ex: 64" />
              </div>
              <div>
                <Label>Tipo *</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">{cfg.icon} {cfg.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Título *</Label>
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Correção de permissões de usuário" />
            </div>
            <div>
              <Label>Descrição Detalhada *</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={5} placeholder="Descreva detalhadamente o que foi alterado, corrigido ou adicionado..." />
            </div>
            <div>
              <Label>Módulos Afetados (separados por vírgula)</Label>
              <Input value={modulos} onChange={e => setModulos(e.target.value)} placeholder="Ex: Fechamento de Ponto, Configurações, Usuários" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? "Salvando..." : "Registrar Revisão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
