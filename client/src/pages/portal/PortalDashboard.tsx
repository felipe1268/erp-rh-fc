import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Building2, Users, Plus, LogOut, FileText, Upload, CheckCircle, XCircle,
  Clock, Edit, ChevronDown, ChevronUp, AlertTriangle, User, UserPlus,
  Store, Send, Eye, Search, ShoppingCart, DollarSign, Receipt, Camera,
  Trash2, Pencil, MessageSquare
} from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";

export default function PortalDashboard() {
  const [, navigate] = useLocation();
  const token = localStorage.getItem("portal_token") || "";
  const nome = localStorage.getItem("portal_nome") || "Empresa";
  const tipo = localStorage.getItem("portal_tipo") || "terceiro";

  // ========== SHARED STATE ==========
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});
  const [deletingFuncionario, setDeletingFuncionario] = useState<any>(null);

  // ========== PARCEIRO STATE ==========
  const [buscaFuncionario, setBuscaFuncionario] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [novoLancamento, setNovoLancamento] = useState({
    dataCompra: new Date().toISOString().split("T")[0],
    descricaoItens: "",
    valor: "",
    observacoes: "",
  });
  const [notaFile, setNotaFile] = useState<File | null>(null);
  const [editingLancamento, setEditingLancamento] = useState<any>(null);
  const [editForm, setEditForm] = useState({ valor: "", descricaoItens: "", observacoes: "" });
  const [deletingLancamento, setDeletingLancamento] = useState<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ========== TERCEIRO QUERIES ==========
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
  const excluirFuncMut = trpc.portalExterno.terceiro.excluirFuncionario.useMutation({
    onSuccess: () => { toast.success("Funcionário excluído!"); setDeletingFuncionario(null); funcionarios.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // ========== PARCEIRO QUERIES ==========
  const parceiroDados = trpc.portalExterno.parceiro.meusDados.useQuery({ token }, { enabled: !!token && tipo === "parceiro" });
  const parceiroLancamentos = trpc.portalExterno.parceiro.meusLancamentos.useQuery({ token }, { enabled: !!token && tipo === "parceiro" });
  const parceiroBusca = trpc.portalExterno.parceiro.buscarFuncionarios.useQuery(
    { token, busca: buscaFuncionario },
    { enabled: !!token && tipo === "parceiro" && buscaFuncionario.length >= 2 }
  );
  const criarLancamentoMut = trpc.portalExterno.parceiro.criarLancamento.useMutation({
    onSuccess: (data) => {
      toast.success("Lançamento registrado com sucesso!");
      // Upload nota fiscal if file selected
      if (notaFile && data.id) {
        handleUploadNota(Number(data.id), notaFile);
      }
      setNovoLancamento({ dataCompra: new Date().toISOString().split("T")[0], descricaoItens: "", valor: "", observacoes: "" });
      setSelectedEmployee(null);
      setBuscaFuncionario("");
      setNotaFile(null);
      parceiroLancamentos.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const uploadNotaMut = trpc.portalExterno.parceiro.uploadNotaFiscal.useMutation({
    onSuccess: () => { toast.success("Nota fiscal enviada!"); parceiroLancamentos.refetch(); },
    onError: (e) => toast.error("Erro ao enviar nota: " + e.message),
  });
  const editarLancamentoMut = trpc.portalExterno.parceiro.editarLancamento.useMutation({
    onSuccess: () => { toast.success("Lançamento atualizado!"); setEditingLancamento(null); parceiroLancamentos.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const excluirLancamentoMut = trpc.portalExterno.parceiro.excluirLancamento.useMutation({
    onSuccess: () => { toast.success("Lançamento excluído!"); setDeletingLancamento(null); parceiroLancamentos.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // ========== HANDLERS ==========
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
    setForm({ nomeCompleto: func.nomeCompleto || func.nome, cpf: func.cpf, rg: func.rg, funcao: func.funcao, telefone: func.telefone, email: func.email, dataAdmissao: func.dataAdmissao, asoValidade: func.asoValidade, nr35Validade: func.nr35Validade, nr10Validade: func.nr10Validade, nr33Validade: func.nr33Validade });
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

  const handleCriarLancamento = () => {
    if (!selectedEmployee) { toast.error("Selecione um colaborador"); return; }
    if (!novoLancamento.valor || parseFloat(novoLancamento.valor) <= 0) { toast.error("Informe o valor da compra"); return; }
    if (!novoLancamento.dataCompra) { toast.error("Informe a data da compra"); return; }
    criarLancamentoMut.mutate({
      token,
      employeeId: selectedEmployee.id,
      employeeNome: selectedEmployee.nomeCompleto,
      dataCompra: novoLancamento.dataCompra,
      descricaoItens: novoLancamento.descricaoItens || undefined,
      valor: novoLancamento.valor,
      observacoes: novoLancamento.observacoes || undefined,
    });
  };

  const handleUploadNota = (lancamentoId: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadNotaMut.mutate({
        token,
        lancamentoId,
        fileName: file.name,
        fileBase64: base64,
        contentType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const selectEmployee = (emp: any) => {
    setSelectedEmployee(emp);
    setBuscaFuncionario(emp.nomeCompleto + (emp.cpf ? ` - ${emp.cpf}` : ""));
    setShowDropdown(false);
  };

  const statusBadge = (func: any) => {
    const st = func.statusAptidao || func.status_aptidao_terceiro || "pendente";
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

  const formatCurrency = (v: any) => {
    const num = parseFloat(v || "0");
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  // ========== TERCEIRO DATA ==========
  const funcs = (funcionarios.data || []) as any[];
  const aptos = funcs.filter((f: any) => (f.statusAptidao || f.status_aptidao_terceiro) === "apto").length;
  const pendentes = funcs.filter((f: any) => (f.statusAptidao || f.status_aptidao_terceiro || "pendente") === "pendente").length;
  const inaptos = funcs.filter((f: any) => (f.statusAptidao || f.status_aptidao_terceiro) === "inapto").length;

  // ========== PARCEIRO DATA ==========
  const lancamentos = (parceiroLancamentos.data || []) as any[];
  const totalMes = lancamentos.reduce((sum: number, l: any) => sum + parseFloat(l.valor || "0"), 0);
  const lancPendentes = lancamentos.filter((l: any) => l.status === "pendente").length;
  const lancAprovados = lancamentos.filter((l: any) => l.status === "aprovado").length;
  const filteredEmployees = (parceiroBusca.data || []) as any[];

  // ========== RENDER PARCEIRO ==========
  if (tipo === "parceiro") {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b shadow-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-purple-600 flex items-center justify-center">
                <Store className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-gray-900">{nome}</h1>
                <p className="text-xs text-gray-500">Portal do Parceiro - FC Gestão Integrada</p>
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
              <ShoppingCart className="h-6 w-6 text-purple-500 mx-auto mb-1" />
              <p className="text-2xl font-bold">{lancamentos.length}</p>
              <p className="text-xs text-gray-500">Lançamentos</p>
            </div>
            <div className="bg-white rounded-xl border p-4 text-center">
              <DollarSign className="h-6 w-6 text-green-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalMes)}</p>
              <p className="text-xs text-gray-500">Total do Mês</p>
            </div>
            <div className="bg-white rounded-xl border p-4 text-center">
              <Clock className="h-6 w-6 text-amber-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-amber-600">{lancPendentes}</p>
              <p className="text-xs text-gray-500">Pendentes</p>
            </div>
            <div className="bg-white rounded-xl border p-4 text-center">
              <CheckCircle className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-emerald-600">{lancAprovados}</p>
              <p className="text-xs text-gray-500">Aprovados</p>
            </div>
          </div>

          {/* Novo Lançamento */}
          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-purple-500" /> Novo Lançamento de Consumo
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Busca Colaborador por Nome/CPF */}
                <div className="relative" ref={dropdownRef}>
                  <Label className="text-sm font-medium mb-1 block">Colaborador * (digite nome ou CPF)</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      value={buscaFuncionario}
                      onChange={(e) => {
                        setBuscaFuncionario(e.target.value);
                        setSelectedEmployee(null);
                        if (e.target.value.length >= 2) setShowDropdown(true);
                        else setShowDropdown(false);
                      }}
                      onFocus={() => { if (buscaFuncionario.length >= 2) setShowDropdown(true); }}
                      placeholder="Digite o nome ou CPF do colaborador..."
                      className="pl-10 h-11"
                    />
                  </div>
                  {showDropdown && filteredEmployees.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredEmployees.map((emp: any) => (
                        <button
                          key={emp.id}
                          type="button"
                          className="w-full text-left px-4 py-3 hover:bg-purple-50 border-b last:border-b-0 transition-colors"
                          onClick={() => selectEmployee(emp)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                              <User className="h-4 w-4 text-purple-600" />
                            </div>
                            <div>
                              <p className="font-medium text-sm text-gray-900">{emp.nomeCompleto}</p>
                              <p className="text-xs text-gray-500">
                                CPF: {emp.cpf || "N/A"} {emp.funcao ? `| ${emp.funcao}` : emp.cargo ? `| ${emp.cargo}` : ""}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {showDropdown && buscaFuncionario.length >= 2 && filteredEmployees.length === 0 && !parceiroBusca.isLoading && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg p-4 text-center text-sm text-gray-500">
                      Nenhum colaborador encontrado
                    </div>
                  )}
                  {selectedEmployee && (
                    <div className="mt-2 flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                      <CheckCircle className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-800">{selectedEmployee.nomeCompleto}</span>
                      <span className="text-xs text-purple-500">CPF: {selectedEmployee.cpf || "N/A"}</span>
                      <button onClick={() => { setSelectedEmployee(null); setBuscaFuncionario(""); }} className="ml-auto text-purple-400 hover:text-purple-600">
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Data da Compra */}
                <div>
                  <Label className="text-sm font-medium mb-1 block">Data da Compra *</Label>
                  <Input
                    type="date"
                    value={novoLancamento.dataCompra}
                    onChange={(e) => setNovoLancamento({ ...novoLancamento, dataCompra: e.target.value })}
                    className="h-11"
                  />
                </div>

                {/* Valor */}
                <div>
                  <Label className="text-sm font-medium mb-1 block">Valor (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={novoLancamento.valor}
                    onChange={(e) => setNovoLancamento({ ...novoLancamento, valor: e.target.value })}
                    className="h-11"
                  />
                </div>

                {/* Descrição */}
                <div>
                  <Label className="text-sm font-medium mb-1 block">Descrição dos Itens</Label>
                  <Input
                    placeholder="Ex: Medicamentos, combustível..."
                    value={novoLancamento.descricaoItens}
                    onChange={(e) => setNovoLancamento({ ...novoLancamento, descricaoItens: e.target.value })}
                    className="h-11"
                  />
                </div>
              </div>

              {/* Upload Nota Fiscal */}
              <div>
                <Label className="text-sm font-medium mb-1 block">Nota Fiscal / Cupom Fiscal</Label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) setNotaFile(f); }}
                    />
                    <div className={`flex items-center gap-3 border-2 border-dashed rounded-lg p-4 transition-colors ${notaFile ? "border-purple-400 bg-purple-50" : "border-gray-300 hover:border-purple-400 hover:bg-purple-50/50"}`}>
                      {notaFile ? (
                        <>
                          <Receipt className="h-6 w-6 text-purple-500" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-purple-700 truncate">{notaFile.name}</p>
                            <p className="text-xs text-purple-500">{(notaFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <button onClick={(e) => { e.preventDefault(); setNotaFile(null); }} className="text-purple-400 hover:text-purple-600">
                            <XCircle className="h-5 w-5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <Camera className="h-6 w-6 text-gray-400" />
                          <div>
                            <p className="text-sm font-medium text-gray-600">Clique para anexar nota/cupom fiscal</p>
                            <p className="text-xs text-gray-400">PDF, JPG ou PNG (máx. 5MB)</p>
                          </div>
                        </>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Observações */}
              <div>
                <Label className="text-sm font-medium mb-1 block">Observações</Label>
                <Input
                  placeholder="Observações adicionais (opcional)"
                  value={novoLancamento.observacoes}
                  onChange={(e) => setNovoLancamento({ ...novoLancamento, observacoes: e.target.value })}
                  className="h-11"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={handleCriarLancamento}
                  disabled={criarLancamentoMut.isPending || !selectedEmployee}
                >
                  <Send className="w-4 h-4 mr-1" /> {criarLancamentoMut.isPending ? "Enviando..." : "Registrar Consumo"}
                </Button>
              </div>
            </div>
          </div>

          {/* Lançamentos do Mês */}
          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-500" /> Lançamentos Registrados
              </h2>
            </div>
            <div className="divide-y">
              {lancamentos.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhum lançamento registrado</p>
                  <p className="text-sm mt-1">Registre o consumo dos colaboradores acima</p>
                </div>
              ) : (
                <>
                  {lancamentos.map((l: any) => (
                    <div key={l.id} className={`p-4 flex items-center justify-between ${
                      l.status === "aprovado" ? "border-l-4 border-l-green-400" :
                      l.status === "rejeitado" ? "border-l-4 border-l-red-400" :
                      "border-l-4 border-l-yellow-400"
                    }`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{l.employeeNome}</span>
                          <Badge variant={
                            l.status === "aprovado" ? "default" :
                            l.status === "rejeitado" ? "destructive" : "secondary"
                          } className={`text-xs ${l.status === "aprovado" ? "bg-green-100 text-green-700" : ""}`}>
                            {l.status === "aprovado" ? "Aprovado" : l.status === "rejeitado" ? "Rejeitado" : "Pendente"}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {l.dataCompra ? new Date(l.dataCompra).toLocaleDateString("pt-BR") : ""}
                          {l.descricaoItens ? ` — ${l.descricaoItens}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-purple-600">{formatCurrency(l.valor)}</span>
                        {l.comprovanteUrl ? (
                          <a href={l.comprovanteUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" title="Ver nota fiscal">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </a>
                        ) : (
                          <label className="cursor-pointer">
                            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadNota(l.id, f); }} />
                            <Button variant="ghost" size="sm" asChild title="Enviar nota fiscal">
                              <span><Upload className="w-4 h-4 text-purple-500" /></span>
                            </Button>
                          </label>
                        )}
                        {l.status === "pendente" && (
                          <>
                            <Button variant="ghost" size="sm" title="Editar" onClick={() => {
                              setEditingLancamento(l);
                              setEditForm({ valor: String(l.valor || ""), descricaoItens: l.descricaoItens || "", observacoes: l.observacoes || "" });
                            }}>
                              <Pencil className="w-4 h-4 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Excluir" onClick={() => setDeletingLancamento(l)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </>
                        )}
                        {l.comentarioAdmin && (
                          <span title={`Comentário do RH: ${l.comentarioAdmin}`}>
                            <MessageSquare className="w-4 h-4 text-blue-400" />
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="p-4 flex items-center justify-between font-bold bg-purple-50">
                    <span>Total</span>
                    <span className="text-purple-600">{formatCurrency(totalMes)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Dados do Parceiro */}
          {parceiroDados.data && (
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-purple-500" /> Dados do Estabelecimento
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Razão Social:</span>
                  <p className="font-medium">{(parceiroDados.data as any).razaoSocial}</p>
                </div>
                <div>
                  <span className="text-gray-500">CNPJ:</span>
                  <p className="font-medium">{(parceiroDados.data as any).cnpj}</p>
                </div>
                <div>
                  <span className="text-gray-500">Nome Fantasia:</span>
                  <p className="font-medium">{(parceiroDados.data as any).nomeFantasia || "—"}</p>
                </div>
                <div>
                  <span className="text-gray-500">Contato:</span>
                  <p className="font-medium">{(parceiroDados.data as any).responsavelNome || "—"} | {(parceiroDados.data as any).telefone || "—"}</p>
                </div>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm text-purple-800">
            <p className="font-medium mb-1">Como funciona?</p>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li>Busque o colaborador pelo nome ou CPF no campo de busca</li>
              <li>Preencha os dados da compra e anexe a nota/cupom fiscal</li>
              <li>O RH da FC irá analisar e aprovar ou rejeitar cada lançamento</li>
              <li>Lançamentos aprovados serão descontados na folha de pagamento do colaborador</li>
            </ul>
          </div>
        </div>

        {/* Editar Lançamento Dialog */}
        <Dialog open={!!editingLancamento} onOpenChange={(o) => { if (!o) setEditingLancamento(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-purple-500" /> Editar Lançamento
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Colaborador</Label>
                <p className="text-sm text-muted-foreground mt-1">{editingLancamento?.employeeNome}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Valor (R$) *</Label>
                <Input type="number" step="0.01" value={editForm.valor} onChange={(e) => setEditForm({ ...editForm, valor: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">Descrição dos Itens</Label>
                <Input value={editForm.descricaoItens} onChange={(e) => setEditForm({ ...editForm, descricaoItens: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">Observações</Label>
                <Input value={editForm.observacoes} onChange={(e) => setEditForm({ ...editForm, observacoes: e.target.value })} className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingLancamento(null)}>Cancelar</Button>
              <Button className="bg-purple-600 hover:bg-purple-700" disabled={editarLancamentoMut.isPending}
                onClick={() => {
                  if (!editForm.valor || parseFloat(editForm.valor) <= 0) { toast.error("Informe o valor"); return; }
                  editarLancamentoMut.mutate({
                    token,
                    lancamentoId: editingLancamento.id,
                    valor: editForm.valor,
                    descricaoItens: editForm.descricaoItens || undefined,

                  });
                }}>
                {editarLancamentoMut.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Excluir Lançamento Dialog */}
        <Dialog open={!!deletingLancamento} onOpenChange={(o) => { if (!o) setDeletingLancamento(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5" /> Excluir Lançamento
              </DialogTitle>
            </DialogHeader>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">
                Deseja realmente excluir o lançamento de <strong>{deletingLancamento?.employeeNome}</strong> no valor de <strong>{deletingLancamento ? formatCurrency(deletingLancamento.valor) : ""}</strong>?
              </p>
              <p className="text-xs text-red-600 mt-1">Esta ação não pode ser desfeita.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingLancamento(null)}>Cancelar</Button>
              <Button variant="destructive" disabled={excluirLancamentoMut.isPending}
                onClick={() => excluirLancamentoMut.mutate({ token, lancamentoId: deletingLancamento.id })}>
                {excluirLancamentoMut.isPending ? "Excluindo..." : "Confirmar Exclusão"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ========== RENDER TERCEIRO ==========
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
                        <p className="font-medium">{f.nomeCompleto || f.nome}</p>
                        <p className="text-xs text-gray-500">CPF: {f.cpf} {f.funcao && `| ${f.funcao}`}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(f)}
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
                      <div className="flex items-center gap-2 pt-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(f)}>
                          <Edit className="h-3 w-3 mr-1" /> Editar
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDeletingFuncionario(f)}>
                          <Trash2 className="h-3 w-3 mr-1" /> Excluir
                        </Button>
                        {f.status === 'ativo' && (
                          <Button size="sm" variant="outline" className="text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => { atualizarMut.mutate({ token, id: f.id, status: 'desligado' }); }}>
                            Desligar
                          </Button>
                        )}
                        {f.status === 'desligado' && (
                          <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => { atualizarMut.mutate({ token, id: f.id, status: 'ativo' }); }}>
                            Reativar
                          </Button>
                        )}
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

      {/* Full Screen Form Dialog */}
      <FullScreenDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditingId(null); setForm({}); }}
        title={editingId ? "Editar Funcionário" : "Novo Funcionário"}
        subtitle="Preencha os dados do funcionário e documentos obrigatórios"
        icon={<UserPlus className="h-5 w-5 text-white" />}
        headerColor="bg-gradient-to-r from-orange-500 to-orange-700"
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setForm({}); }}>Cancelar</Button>
            <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600" disabled={cadastrarMut.isPending || atualizarMut.isPending}>
              {cadastrarMut.isPending || atualizarMut.isPending ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Dados Pessoais */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <User className="h-5 w-5 text-orange-500" /> Dados Pessoais
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="sm:col-span-2 lg:col-span-3">
                <Label className="text-sm font-medium">Nome Completo *</Label>
                <Input value={form.nomeCompleto || ""} onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })} placeholder="Nome completo do funcionário" className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">CPF *</Label>
                <Input value={form.cpf || ""} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">RG</Label>
                <Input value={form.rg || ""} onChange={(e) => setForm({ ...form, rg: e.target.value })} placeholder="Número do RG" className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">Função</Label>
                <Input value={form.funcao || ""} onChange={(e) => setForm({ ...form, funcao: e.target.value })} placeholder="Ex: Eletricista, Pintor" className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">Telefone</Label>
                <Input value={form.telefone || ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">E-mail</Label>
                <Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">Data Admissão</Label>
                <Input type="date" value={form.dataAdmissao || ""} onChange={(e) => setForm({ ...form, dataAdmissao: e.target.value })} className="mt-1" />
              </div>
            </div>
          </div>

          {/* Documentos e Treinamentos */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-orange-500" /> Documentos e Treinamentos
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label className="text-sm font-medium">ASO - Validade</Label>
                <Input type="date" value={form.asoValidade || ""} onChange={(e) => setForm({ ...form, asoValidade: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">NR-35 - Validade</Label>
                <Input type="date" value={form.nr35Validade || ""} onChange={(e) => setForm({ ...form, nr35Validade: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">NR-10 - Validade</Label>
                <Input type="date" value={form.nr10Validade || ""} onChange={(e) => setForm({ ...form, nr10Validade: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">NR-33 - Validade</Label>
                <Input type="date" value={form.nr33Validade || ""} onChange={(e) => setForm({ ...form, nr33Validade: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              Mantenha os documentos sempre atualizados. Funcionários com ASO ou NRs vencidos serão considerados <strong>INAPTOS</strong>.
            </div>
          </div>
        </div>
      </FullScreenDialog>

      {/* Dialog Confirmar Exclusão de Funcionário */}
      <Dialog open={!!deletingFuncionario} onOpenChange={(o) => { if (!o) setDeletingFuncionario(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" /> Excluir Funcionário
            </DialogTitle>
          </DialogHeader>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm">
              Deseja realmente excluir <strong>{deletingFuncionario?.nomeCompleto || deletingFuncionario?.nome}</strong>?
            </p>
            <p className="text-xs text-red-600 mt-1">Esta ação não pode ser desfeita.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingFuncionario(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={excluirFuncMut.isPending}
              onClick={() => excluirFuncMut.mutate({ token, id: deletingFuncionario.id })}>
              {excluirFuncMut.isPending ? "Excluindo..." : "Confirmar Exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
