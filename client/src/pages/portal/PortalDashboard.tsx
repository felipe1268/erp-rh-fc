import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Building2, Users, Plus, LogOut, FileText, Upload, CheckCircle, XCircle, Clock, Edit, ChevronDown, ChevronUp, AlertTriangle, User } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function PortalDashboard() {
  const [, navigate] = useLocation();
  const token = localStorage.getItem("portal_token") || "";
  const nome = localStorage.getItem("portal_nome") || "Empresa";
  const tipo = localStorage.getItem("portal_tipo") || "terceiro";
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});

  // Verify token
  const tokenCheck = trpc.portalExterno.auth.verificarToken.useQuery({ token }, { enabled: !!token });

  useEffect(() => {
    if (!token) { navigate("/portal/login"); return; }
    if (tokenCheck.data && !tokenCheck.data.valid) {
      localStorage.removeItem("portal_token");
      toast.error("Sessão expirada. Faça login novamente.");
      navigate("/portal/login");
    }
  }, [token, tokenCheck.data]);

  const empresa = trpc.portalExterno.terceiro.meusDados.useQuery({ token }, { enabled: !!token && tipo === "terceiro" });
  const funcionarios = trpc.portalExterno.terceiro.meusFuncionarios.useQuery({ token }, { enabled: !!token && tipo === "terceiro" });
  const cadastrarMut = trpc.portalExterno.terceiro.cadastrarFuncionario.useMutation({
    onSuccess: () => { toast.success("Funcionário cadastrado! Aguardando aprovação do RH."); setShowForm(false); setForm({}); funcionarios.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMut = trpc.portalExterno.terceiro.atualizarFuncionario.useMutation({
    onSuccess: () => { toast.success("Funcionário atualizado!"); setShowForm(false); setEditingId(null); setForm({}); funcionarios.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const handleLogout = () => {
    localStorage.removeItem("portal_token");
    localStorage.removeItem("portal_tipo");
    localStorage.removeItem("portal_nome");
    localStorage.removeItem("portal_cnpj");
    navigate("/portal/login");
  };

  const handleSave = () => {
    if (!form.nomeCompleto || !form.cpf) { toast.error("Nome e CPF são obrigatórios"); return; }
    if (editingId) {
      atualizarMut.mutate({ token, id: editingId, ...form });
    } else {
      cadastrarMut.mutate({ token, ...form });
    }
  };

  const openEdit = (func: any) => {
    setEditingId(func.id);
    setForm({ ...func });
    setShowForm(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm({});
    setShowForm(true);
  };

  const handleFileUpload = async (funcId: number, tipoDoc: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        const result = await (trpc.portalExterno.terceiro.uploadDocumento as any).mutate({
          token, funcionarioId: funcId, tipoDocumento: tipoDoc, base64, fileName: file.name, contentType: file.type,
        });
        toast.success(`Documento ${tipoDoc} enviado!`);
        funcionarios.refetch();
      } catch (e: any) {
        toast.error("Erro ao enviar documento: " + e.message);
      }
    };
    reader.readAsDataURL(file);
  };

  const statusBadge = (status: string | null | undefined) => {
    const st = status || "pendente";
    const map: Record<string, { bg: string; text: string; icon: any; label: string }> = {
      apto: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle, label: "Apto" },
      inapto: { bg: "bg-red-100", text: "text-red-700", icon: XCircle, label: "Inapto" },
      pendente: { bg: "bg-amber-100", text: "text-amber-700", icon: Clock, label: "Pendente" },
    };
    const s = map[st] || map.pendente;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        <s.icon className="h-3 w-3" />{s.label}
      </span>
    );
  };

  const funcs = (funcionarios.data || []) as any[];
  const aptos = funcs.filter((f: any) => f.status === "apto").length;
  const pendentes = funcs.filter((f: any) => f.status === "pendente").length;
  const inaptos = funcs.filter((f: any) => f.status === "inapto").length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-500 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">{nome}</h1>
              <p className="text-xs text-gray-500">Portal do Terceiro - FC Gestão Integrada</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border p-4 text-center">
            <Users className="h-6 w-6 text-blue-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{funcs.length}</p>
            <p className="text-xs text-gray-500">Total Funcionários</p>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <CheckCircle className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-emerald-600">{aptos}</p>
            <p className="text-xs text-gray-500">Aptos</p>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <Clock className="h-6 w-6 text-amber-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-amber-600">{pendentes}</p>
            <p className="text-xs text-gray-500">Pendentes</p>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <XCircle className="h-6 w-6 text-red-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-600">{inaptos}</p>
            <p className="text-xs text-gray-500">Inaptos</p>
          </div>
        </div>

        {/* Funcionários */}
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-lg flex items-center gap-2"><Users className="h-5 w-5 text-orange-500" /> Meus Funcionários</h2>
            <Button onClick={openNew} className="bg-orange-500 hover:bg-orange-600" size="sm">
              <Plus className="h-4 w-4 mr-1" /> Novo Funcionário
            </Button>
          </div>
          <div className="divide-y">
            {funcs.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum funcionário cadastrado</p>
                <p className="text-sm mt-1">Clique em "Novo Funcionário" para começar</p>
              </div>
            ) : (
              funcs.map((f: any) => (
                <div key={f.id} className="p-4">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                        <User className="h-4 w-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-medium">{f.nomeCompleto}</p>
                        <p className="text-xs text-gray-500">CPF: {f.cpf} {f.funcao && `| ${f.funcao}`}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(f.status)}
                      {expandedId === f.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </div>
                  {expandedId === f.id && (
                    <div className="mt-3 pl-12 space-y-3">
                      {f.observacaoAprovacao && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-sm text-amber-800">
                          <AlertTriangle className="h-3 w-3 inline mr-1" /> Observação do RH: {f.observacaoAprovacao}
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                        {f.telefone && <div><span className="text-gray-500">Tel:</span> {f.telefone}</div>}
                        {f.email && <div><span className="text-gray-500">E-mail:</span> {f.email}</div>}
                        {f.dataAdmissao && <div><span className="text-gray-500">Admissão:</span> {f.dataAdmissao}</div>}
                        {f.asoValidade && <div><span className="text-gray-500">ASO válido até:</span> {f.asoValidade}</div>}
                        {f.nr35Validade && <div><span className="text-gray-500">NR-35 até:</span> {f.nr35Validade}</div>}
                        {f.nr10Validade && <div><span className="text-gray-500">NR-10 até:</span> {f.nr10Validade}</div>}
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(f)}>
                          <Edit className="h-3 w-3 mr-1" /> Editar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-medium mb-1">Como funciona?</p>
          <ul className="list-disc pl-4 space-y-1 text-xs">
            <li>Cadastre seus funcionários com dados pessoais e documentos</li>
            <li>O RH da FC irá analisar e aprovar ou rejeitar cada funcionário</li>
            <li>Funcionários aprovados ficam com status "Apto" para trabalhar na obra</li>
            <li>Mantenha os documentos (ASO, NRs) sempre atualizados</li>
          </ul>
        </div>
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome Completo *</Label>
                <Input value={form.nomeCompleto || ""} onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })} />
              </div>
              <div>
                <Label>CPF *</Label>
                <Input value={form.cpf || ""} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
              </div>
              <div>
                <Label>RG</Label>
                <Input value={form.rg || ""} onChange={(e) => setForm({ ...form, rg: e.target.value })} />
              </div>
              <div>
                <Label>Função</Label>
                <Input value={form.funcao || ""} onChange={(e) => setForm({ ...form, funcao: e.target.value })} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.telefone || ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Data Admissão</Label>
                <Input type="date" value={form.dataAdmissao || ""} onChange={(e) => setForm({ ...form, dataAdmissao: e.target.value })} />
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="font-medium text-sm mb-2">Documentos e Treinamentos</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>ASO - Validade</Label>
                  <Input type="date" value={form.asoValidade || ""} onChange={(e) => setForm({ ...form, asoValidade: e.target.value })} />
                </div>
                <div>
                  <Label>NR-35 - Validade</Label>
                  <Input type="date" value={form.nr35Validade || ""} onChange={(e) => setForm({ ...form, nr35Validade: e.target.value })} />
                </div>
                <div>
                  <Label>NR-10 - Validade</Label>
                  <Input type="date" value={form.nr10Validade || ""} onChange={(e) => setForm({ ...form, nr10Validade: e.target.value })} />
                </div>
                <div>
                  <Label>NR-33 - Validade</Label>
                  <Input type="date" value={form.nr33Validade || ""} onChange={(e) => setForm({ ...form, nr33Validade: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600" disabled={cadastrarMut.isPending || atualizarMut.isPending}>
              {cadastrarMut.isPending || atualizarMut.isPending ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
