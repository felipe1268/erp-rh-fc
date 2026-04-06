import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import EpiAssinatura from "./EpiAssinatura";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle, Plus, Minus, Trash2,
  Package, User, ArrowRight, ArrowLeft, FileText,
  Search, PenTool, AlertTriangle, Camera,
} from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { generateEpiReceiptPdf } from "@/lib/epiReceiptPdf";

type Step = "identificar" | "selecionar" | "confirmar" | "concluido";

interface ItemEntrega {
  epiId: number;
  epiNome: string;
  ca: string | null;
  quantidade: number;
  dataValidade: string;
  motivo: string;
  motivoTroca?: string;
  fotoEstadoAnteriorBase64?: string;
  fotoEstadoAnteriorFileName?: string;
  alertaVidaUtil?: {
    alerta: boolean;
    vidaUtilMeses?: number;
    ultimaEntrega?: string;
    dataExpiracao?: string;
    diasRestantes?: number;
    mensagem?: string;
  };
}

export default function EpiEntrega() {
  const [, navigate] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = isConstrutoras ? 0 : (selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0);
  const companyIds = getCompanyIdsForQuery();
  const { toast } = useToast();
  const trpcUtils = trpc.useUtils();

  const [step, setStep] = useState<Step>("identificar");
  const [funcionario, setFuncionario] = useState<any | null>(null);
  const [obraId, setObraId] = useState<string>("");
  const [itens, setItens] = useState<ItemEntrega[]>([]);
  const [showAddEpi, setShowAddEpi] = useState(false);
  const [epiSearch, setEpiSearch] = useState("");
  const [searchText, setSearchText] = useState("");
  const [showAssinatura, setShowAssinatura] = useState(false);
  const [assinaturaUrl, setAssinaturaUrl] = useState<string | null>(null);
  const [deliveryId, setDeliveryId] = useState<number | null>(null);

  const { data: obras = [] } = trpc.sprint1.obras.list.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId }
  );

  const { data: episList = [] } = trpc.epis.list.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId }
  );

  const { data: allEmployees = [] } = trpc.employees.list.useQuery(
    { companyId, companyIds, excludeTerminated: true },
    { enabled: !!companyId }
  );

  const createDelivery = trpc.faceRecognition.createDeliveryWithFace.useMutation({
    onSuccess: (data: any) => {
      setDeliveryId(data?.deliveryId || null);
      setStep("concluido");
    },
    onError: (e) => toast({ title: "Erro ao registrar entrega", description: e.message, variant: "destructive" }),
  });

  const filteredEmployees = useMemo(() => {
    if (!searchText.trim()) return allEmployees;
    const lower = searchText.toLowerCase();
    const digitsOnly = searchText.replace(/\D/g, '');
    return (allEmployees as any[]).filter((e: any) =>
      e.nomeCompleto?.toLowerCase().includes(lower) ||
      e.codigoInterno?.toLowerCase().includes(lower) ||
      e.funcao?.toLowerCase().includes(lower) ||
      e.cpf?.toLowerCase().includes(lower) ||
      (digitsOnly.length >= 3 && (e.cpf?.replace(/\D/g, '') || '').includes(digitsOnly))
    );
  }, [allEmployees, searchText]);

  const episFiltrados = useMemo(() =>
    episList.filter((e: any) =>
      !epiSearch ||
      e.nome?.toLowerCase().includes(epiSearch.toLowerCase()) ||
      e.ca?.toLowerCase().includes(epiSearch.toLowerCase())
    ),
    [episList, epiSearch]
  );

  const handleSelectEmployee = (emp: any) => {
    setFuncionario(emp);
    setStep("selecionar");
  };

  const [pendingEpiAlert, setPendingEpiAlert] = useState<{ epi: any; alerta: any } | null>(null);

  const addItem = async (epi: any) => {
    if (itens.find((i) => i.epiId === epi.id)) return;
    if (!funcionario) return;
    try {
      const result = await trpcUtils.epis.checkVidaUtil.fetch({
        companyId,
        employeeId: funcionario.id,
        epiId: epi.id,
      });
      if ((result as any).alerta) {
        setPendingEpiAlert({ epi, alerta: result });
      } else {
        addItemDirect(epi);
      }
    } catch (err: any) {
      toast({ title: "Erro ao verificar vida útil", description: "Não foi possível validar. Tente novamente.", variant: "destructive" });
      return;
    }
  };

  const addItemDirect = (epi: any, alertaVidaUtil?: any) => {
    setItens((prev) => [
      ...prev,
      {
        epiId: epi.id,
        epiNome: epi.nome,
        ca: epi.ca || null,
        quantidade: 1,
        dataValidade: "",
        motivo: "Entrega",
        alertaVidaUtil: alertaVidaUtil || undefined,
        motivoTroca: alertaVidaUtil?.alerta ? '' : undefined,
      },
    ]);
    setShowAddEpi(false);
    setEpiSearch("");
  };

  const updateQtd = (epiId: number, delta: number) => {
    setItens((prev) =>
      prev.map((i) =>
        i.epiId === epiId ? { ...i, quantidade: Math.max(1, i.quantidade + delta) } : i
      )
    );
  };

  const removeItem = (epiId: number) => {
    setItens((prev) => prev.filter((i) => i.epiId !== epiId));
  };

  const confirmarEntrega = () => {
    if (!funcionario || itens.length === 0) return;
    const itensComAlerta = itens.filter(i => i.alertaVidaUtil?.alerta && ['desgaste_normal', 'mau_uso'].includes(i.motivoTroca || '') && !i.fotoEstadoAnteriorBase64);
    if (itensComAlerta.length > 0) {
      toast({ title: "Foto obrigatória", description: `Anexe a foto do estado do EPI danificado para: ${itensComAlerta.map(i => i.epiNome).join(', ')}`, variant: "destructive" });
      return;
    }
    const itensComAlertaSemMotivo = itens.filter(i => i.alertaVidaUtil?.alerta && !i.motivoTroca);
    if (itensComAlertaSemMotivo.length > 0) {
      toast({ title: "Motivo obrigatório", description: `Informe o motivo da troca para: ${itensComAlertaSemMotivo.map(i => i.epiNome).join(', ')}`, variant: "destructive" });
      return;
    }
    createDelivery.mutate({
      companyId,
      employeeId: funcionario.id,
      obraId: obraId && obraId !== "central" ? Number(obraId) : undefined,
      itens: itens.map((i) => ({
        epiId: i.epiId,
        quantidade: i.quantidade,
        dataValidade: i.dataValidade || undefined,
        motivo: i.motivo,
        motivoTroca: i.motivoTroca || undefined,
        fotoEstadoAnteriorBase64: i.fotoEstadoAnteriorBase64 || undefined,
        fotoEstadoAnteriorFileName: i.fotoEstadoAnteriorFileName || undefined,
      })),
      modoIdentificacao: "manual",
    });
  };

  const handleGerarPdf = () => {
    if (!funcionario) return;
    generateEpiReceiptPdf({
      funcionario,
      itens,
      obraId,
      obras: obras as any[],
      modoIdentificacao: "manual",
    });
  };

  const resetAll = () => {
    setStep("identificar");
    setFuncionario(null);
    setItens([]);
    setObraId("");
    setSearchText("");
    setShowAssinatura(false);
    setAssinaturaUrl(null);
    setDeliveryId(null);
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Entrega de EPI</h1>
          <p className="text-sm text-gray-500 mt-1">Registre a entrega com identificação do funcionário — NR-6</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/painel/sst")}
          className="text-gray-500 shrink-0"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
      </div>

      <div className="flex gap-1 text-xs">
        {(["identificar", "selecionar", "confirmar", "concluido"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`px-2 py-1 rounded font-medium ${step === s ? "bg-gray-900 text-white" : i < (["identificar", "selecionar", "confirmar", "concluido"] as Step[]).indexOf(step) ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            </div>
            {i < 3 && <ArrowRight className="h-3 w-3 text-gray-300" />}
          </div>
        ))}
      </div>

      {step === "identificar" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por nome, código ou CPF..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto space-y-1.5">
            {(filteredEmployees as any[]).length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhum funcionário encontrado</p>
              </div>
            ) : (
              (filteredEmployees as any[]).map((emp: any) => (
                <button
                  key={emp.id}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors flex items-center gap-3"
                  onClick={() => handleSelectEmployee(emp)}
                >
                  {emp.fotoUrl ? (
                    <img src={emp.fotoUrl} className="w-10 h-10 rounded-full object-cover border border-gray-200" alt="" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{emp.nomeCompleto}</p>
                    <p className="text-xs text-gray-500">{emp.codigoInterno} · {emp.funcao || "—"}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {step === "selecionar" && funcionario && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
            {funcionario.fotoUrl ? (
              <img src={funcionario.fotoUrl} className="w-12 h-12 rounded-full object-cover border border-green-200" alt={funcionario.nomeCompleto} />
            ) : (
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <User className="h-6 w-6 text-green-600" />
              </div>
            )}
            <div className="flex-1">
              <p className="font-semibold text-green-900">{funcionario.nomeCompleto}</p>
              <p className="text-xs text-green-700">#{funcionario.codigoInterno} · {funcionario.funcao}</p>
            </div>
          </div>

          <div>
            <Label className="text-sm">Obra (opcional)</Label>
            <Select value={obraId} onValueChange={setObraId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione a obra..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="central">Almoxarifado Central</SelectItem>
                {(obras as any[]).map((o: any) => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">EPIs a Entregar</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddEpi(true)}
                className="text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Adicionar EPI
              </Button>
            </div>

            {itens.length === 0 ? (
              <div className="text-center py-6 rounded-lg border-2 border-dashed border-gray-200">
                <Package className="h-7 w-7 text-gray-300 mx-auto mb-1" />
                <p className="text-xs text-gray-400">Nenhum EPI adicionado</p>
              </div>
            ) : (
              <div className="space-y-2">
                {itens.map((item) => (
                  <div key={item.epiId} className={`p-2.5 rounded-lg border bg-white ${item.alertaVidaUtil?.alerta ? 'border-amber-400 bg-amber-50/50' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.epiNome}</p>
                        {item.ca && <p className="text-xs text-gray-500">CA: {item.ca}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQtd(item.epiId, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium">{item.quantidade}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQtd(item.epiId, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-500" onClick={() => removeItem(item.epiId)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {item.alertaVidaUtil?.alerta && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-start gap-2 bg-amber-100 rounded-lg p-2 text-xs text-amber-800">
                          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-bold">EPI dentro da vida útil!</p>
                            <p>{item.alertaVidaUtil.mensagem}</p>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-amber-800 font-semibold">Motivo da troca *</Label>
                          <Select value={item.motivoTroca || ''} onValueChange={(v) => setItens(prev => prev.map(i => i.epiId === item.epiId ? { ...i, motivoTroca: v } : i))}>
                            <SelectTrigger className="mt-1 h-8 text-xs border-amber-300">
                              <SelectValue placeholder="Selecione o motivo..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="desgaste_normal">Desgaste normal</SelectItem>
                              <SelectItem value="mau_uso">Mau uso</SelectItem>
                              <SelectItem value="perda">Perda</SelectItem>
                              <SelectItem value="furto">Furto</SelectItem>
                              <SelectItem value="defeito_fabricacao">Defeito de fabricação</SelectItem>
                              <SelectItem value="tamanho_inadequado">Tamanho inadequado</SelectItem>
                              <SelectItem value="outro">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {item.motivoTroca && ['desgaste_normal', 'mau_uso'].includes(item.motivoTroca) && (
                        <div>
                          <Label className="text-xs text-amber-800 font-semibold">Foto do EPI danificado *</Label>
                          <div className="mt-1">
                            {item.fotoEstadoAnteriorBase64 ? (
                              <div className="flex items-center gap-2">
                                <img src={item.fotoEstadoAnteriorBase64} alt="Foto EPI" className="h-16 w-16 object-cover rounded border" />
                                <div className="flex-1">
                                  <p className="text-xs text-green-700 font-medium flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Foto anexada</p>
                                  <Button variant="ghost" size="sm" className="text-xs h-6 text-red-500 p-0" onClick={() => setItens(prev => prev.map(i => i.epiId === item.epiId ? { ...i, fotoEstadoAnteriorBase64: undefined, fotoEstadoAnteriorFileName: undefined } : i))}>
                                    Remover
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <label className="flex items-center gap-2 p-2 rounded border-2 border-dashed border-amber-300 cursor-pointer hover:bg-amber-50 transition-colors">
                                <Camera className="h-5 w-5 text-amber-600" />
                                <span className="text-xs text-amber-700">Tirar foto ou escolher arquivo</span>
                                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    setItens(prev => prev.map(i => i.epiId === item.epiId ? {
                                      ...i,
                                      fotoEstadoAnteriorBase64: reader.result as string,
                                      fotoEstadoAnteriorFileName: file.name,
                                    } : i));
                                  };
                                  reader.readAsDataURL(file);
                                }} />
                              </label>
                            )}
                          </div>
                        </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep("identificar")} className="flex-1">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
            <Button
              className="flex-1 bg-gray-900 text-white"
              disabled={itens.length === 0}
              onClick={() => setStep("confirmar")}
            >
              Continuar
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {step === "confirmar" && funcionario && (
        <div className="space-y-4">
          <Card className="border border-gray-200">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-gray-700">Resumo da Entrega</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{funcionario.nomeCompleto}</span>
                <span className="text-gray-400">#{funcionario.codigoInterno}</span>
              </div>

              {obraId && obraId !== "central" && (obras as any[]).find((o: any) => o.id === Number(obraId)) && (
                <div className="text-xs text-gray-500">
                  Obra: {(obras as any[]).find((o: any) => o.id === Number(obraId))?.nome}
                </div>
              )}

              <div className="space-y-1">
                {itens.map((i) => (
                  <div key={i.epiId} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{i.epiNome}</span>
                    <span className="font-medium text-gray-900">x{i.quantidade}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
            <p className="font-medium mb-1">Declaração NR-6</p>
            <p>O funcionário declara ter recebido os EPIs listados, estar ciente da obrigatoriedade de uso, conservação e devolução quando solicitado.</p>
          </div>

          {assinaturaUrl ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-2 text-sm text-green-700 mb-2">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">Assinatura registrada</span>
              </div>
              <img src={assinaturaUrl} className="h-16 bg-white rounded border border-green-200" alt="Assinatura" />
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full border-dashed border-2 py-6 text-gray-500 hover:border-gray-400"
              onClick={() => setShowAssinatura(true)}
            >
              <PenTool className="h-5 w-5 mr-2" />
              Assinar Digitalmente
            </Button>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("selecionar")} className="flex-1">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={confirmarEntrega}
              disabled={createDelivery.isPending}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {createDelivery.isPending ? "Salvando..." : "Confirmar Entrega"}
            </Button>
          </div>
        </div>
      )}

      {step === "concluido" && (
        <div className="text-center space-y-4 py-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-9 w-9 text-green-600" />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Entrega Registrada!</h2>
            <p className="text-sm text-gray-500 mt-1">
              {itens.length} EPI(s) entregue(s) para {funcionario?.nomeCompleto}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={handleGerarPdf}
              className="w-full"
            >
              <FileText className="h-4 w-4 mr-2" />
              Gerar Recibo PDF (NR-6)
            </Button>
            <Button
              className="w-full bg-gray-900 text-white"
              onClick={resetAll}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Entrega
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showAddEpi} onOpenChange={setShowAddEpi}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Selecionar EPI</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Buscar por nome ou CA..."
              value={epiSearch}
              onChange={(e) => setEpiSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {episFiltrados.map((epi: any) => (
                <button
                  key={epi.id}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors"
                  onClick={() => addItem(epi)}
                  disabled={!!itens.find((i) => i.epiId === epi.id)}
                >
                  <p className="text-sm font-medium text-gray-900">{epi.nome}</p>
                  <div className="flex gap-2 mt-0.5">
                    {epi.ca && <span className="text-xs text-gray-500">CA: {epi.ca}</span>}
                    {itens.find((i) => i.epiId === epi.id) && (
                      <span className="text-xs text-green-600">Adicionado</span>
                    )}
                  </div>
                </button>
              ))}
              {episFiltrados.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">Nenhum EPI encontrado</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingEpiAlert} onOpenChange={(open) => { if (!open) setPendingEpiAlert(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" /> EPI dentro da vida útil
            </DialogTitle>
          </DialogHeader>
          {pendingEpiAlert && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <p className="font-semibold mb-1">{pendingEpiAlert.alerta.epiNome}</p>
                <p>{pendingEpiAlert.alerta.mensagem}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white rounded p-1.5">
                    <span className="text-amber-600 font-semibold">Última entrega:</span>
                    <br />{pendingEpiAlert.alerta.ultimaEntrega?.split('-').reverse().join('/')}
                  </div>
                  <div className="bg-white rounded p-1.5">
                    <span className="text-amber-600 font-semibold">Vida útil expira:</span>
                    <br />{pendingEpiAlert.alerta.dataExpiracao?.split('-').reverse().join('/')}
                  </div>
                  <div className="bg-white rounded p-1.5">
                    <span className="text-amber-600 font-semibold">Dias restantes:</span>
                    <br />{pendingEpiAlert.alerta.diasRestantes} dias
                  </div>
                  <div className="bg-white rounded p-1.5">
                    <span className="text-amber-600 font-semibold">Vida útil:</span>
                    <br />{pendingEpiAlert.alerta.vidaUtilMeses} meses
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                Para prosseguir, será necessário informar o <strong>motivo da troca</strong>. Para desgaste normal ou mau uso, é obrigatório anexar a <strong>foto do EPI danificado</strong>.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPendingEpiAlert(null)}>
                  Cancelar
                </Button>
                <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => {
                  addItemDirect(pendingEpiAlert.epi, pendingEpiAlert.alerta);
                  setPendingEpiAlert(null);
                }}>
                  Entendi, continuar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAssinatura} onOpenChange={setShowAssinatura}>
        <DialogContent className="max-w-md" style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              <PenTool className="h-4 w-4" />
              Assinatura do Funcionário
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {funcionario && (
              <EpiAssinatura
                employeeId={funcionario.id}
                employeeName={funcionario.nomeCompleto}
                deliveryId={deliveryId || undefined}
                tipo="entrega"
                tipoAssinante="funcionario"
                onComplete={(url) => {
                  setAssinaturaUrl(url);
                  setShowAssinatura(false);
                }}
                onCancel={() => setShowAssinatura(false)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
