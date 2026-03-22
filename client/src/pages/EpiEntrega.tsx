import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { FaceCaptureCamera } from "@/components/FaceCaptureCamera";
import type { FaceMatch, KnownFace } from "@/components/FaceCaptureCamera";
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
  Camera, CheckCircle, Plus, Minus, Trash2,
  Package, User, ArrowRight, ArrowLeft, FileText, ShieldCheck,
  Search, UserPlus, X,
} from "lucide-react";
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
}

export default function EpiEntrega() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = isConstrutoras ? 0 : (selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0);
  const companyIds = getCompanyIdsForQuery();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [step, setStep] = useState<Step>("identificar");
  const [funcionario, setFuncionario] = useState<any | null>(null);
  const [biometriaFoto, setBiometriaFoto] = useState<string | null>(null);
  const [obraId, setObraId] = useState<string>("");
  const [itens, setItens] = useState<ItemEntrega[]>([]);
  const [showAddEpi, setShowAddEpi] = useState(false);
  const [epiSearch, setEpiSearch] = useState("");
  const [idMode, setIdMode] = useState<"facial" | "manual">("manual");

  const [searchText, setSearchText] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<"recognize" | "enroll">("recognize");
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [enrollEmployee, setEnrollEmployee] = useState<any | null>(null);
  const [enrollDescriptor, setEnrollDescriptor] = useState<Float32Array | null>(null);
  const [enrollFoto, setEnrollFoto] = useState<string | null>(null);
  const [enrollSearch, setEnrollSearch] = useState("");

  const { data: faceDescriptors = [] } = trpc.faceRecognition.getFaceDescriptors.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId }
  );

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
    onSuccess: () => setStep("concluido"),
    onError: (e) => toast({ title: "Erro ao registrar entrega", description: e.message, variant: "destructive" }),
  });

  const enrollFaceMutation = trpc.faceRecognition.enrollFace.useMutation({
    onSuccess: (data) => {
      toast({ title: "Biometria cadastrada!", description: "A foto do funcionário foi salva como foto de perfil." });
      utils.faceRecognition.getFaceDescriptors.invalidate();
      utils.faceRecognition.getEnrolledEmployees.invalidate();
      if (enrollEmployee) {
        setFuncionario({ ...enrollEmployee, fotoUrl: data.fotoUrl || enrollEmployee.fotoUrl });
        setBiometriaFoto(enrollFoto);
        setIdMode("facial");
        setShowEnrollDialog(false);
        setShowCamera(false);
        setTimeout(() => setStep("selecionar"), 300);
      }
    },
    onError: (e) => toast({ title: "Erro ao cadastrar biometria", description: e.message, variant: "destructive" }),
  });

  const knownFaces: KnownFace[] = useMemo(() =>
    faceDescriptors.map((f: any) => ({
      employeeId: f.employeeId,
      nomeCompleto: f.nomeCompleto,
      numeroInterno: f.numeroInterno,
      cargo: f.cargo,
      fotoUrl: f.fotoUrl,
      descriptor: JSON.parse(f.descriptor),
    })),
    [faceDescriptors]
  );

  const filteredEmployees = useMemo(() => {
    if (!searchText.trim()) return allEmployees;
    const lower = searchText.toLowerCase();
    return (allEmployees as any[]).filter((e: any) =>
      e.nomeCompleto?.toLowerCase().includes(lower) ||
      e.numeroInterno?.toLowerCase().includes(lower) ||
      e.cargo?.toLowerCase().includes(lower)
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

  const handleFaceMatch = (match: FaceMatch, foto: string) => {
    setBiometriaFoto(foto);
    setIdMode("facial");
    setFuncionario({
      id: match.employeeId,
      nomeCompleto: match.nomeCompleto,
      numeroInterno: match.numeroInterno,
      cargo: match.cargo,
      fotoUrl: match.fotoUrl,
    });
    setShowCamera(false);
    setTimeout(() => setStep("selecionar"), 500);
  };

  const handleNoMatch = () => {
    toast({
      title: "Rosto não reconhecido",
      description: "Selecione o funcionário manualmente ou cadastre a biometria dele.",
    });
  };

  const handleSelectEmployee = (emp: any) => {
    setFuncionario(emp);
    setIdMode("manual");
    setStep("selecionar");
  };

  const handleEnrollFromCamera = (descriptor: Float32Array, foto: string) => {
    setEnrollDescriptor(descriptor);
    setEnrollFoto(foto);
    setShowCamera(false);
    setShowEnrollDialog(true);
  };

  const confirmEnroll = () => {
    if (!enrollEmployee || !enrollDescriptor || !enrollFoto) return;
    enrollFaceMutation.mutate({
      companyId,
      employeeId: enrollEmployee.id,
      descriptor: Array.from(enrollDescriptor),
      fotoBase64: enrollFoto,
    });
  };

  const addItem = (epi: any) => {
    if (itens.find((i) => i.epiId === epi.id)) return;
    setItens((prev) => [
      ...prev,
      {
        epiId: epi.id,
        epiNome: epi.nome,
        ca: epi.ca || null,
        quantidade: 1,
        dataValidade: "",
        motivo: "Entrega",
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
    createDelivery.mutate({
      companyId,
      employeeId: funcionario.id,
      obraId: obraId ? Number(obraId) : undefined,
      itens: itens.map((i) => ({
        epiId: i.epiId,
        quantidade: i.quantidade,
        dataValidade: i.dataValidade || undefined,
        motivo: i.motivo,
      })),
      modoIdentificacao: idMode === "facial" ? "facial" : "manual",
      biometriaFotoBase64: biometriaFoto || undefined,
    });
  };

  const handleGerarPdf = () => {
    if (!funcionario) return;
    generateEpiReceiptPdf({
      funcionario,
      itens,
      obraId,
      obras: obras as any[],
      modoIdentificacao: idMode === "facial" ? "facial" : "manual",
      biometriaFoto: biometriaFoto || undefined,
    });
  };

  const resetAll = () => {
    setStep("identificar");
    setFuncionario(null);
    setBiometriaFoto(null);
    setItens([]);
    setObraId("");
    setSearchText("");
    setShowCamera(false);
    setCameraMode("recognize");
    setShowEnrollDialog(false);
    setEnrollEmployee(null);
    setEnrollDescriptor(null);
    setEnrollFoto(null);
    setIdMode("manual");
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Entrega de EPI</h1>
        <p className="text-sm text-gray-500 mt-1">Registre a entrega com identificação do funcionário — NR-6</p>
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
          {!showCamera ? (
            <>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Buscar por nome ou número..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  onClick={() => setShowCamera(true)}
                  className="bg-gray-900 text-white gap-1.5"
                  title="Identificar por câmera"
                >
                  <Camera className="h-4 w-4" />
                  Câmera
                </Button>
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
                        <p className="text-xs text-gray-500">#{emp.numeroInterno} · {emp.cargo}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {emp.faceId ? (
                          <Badge className="bg-green-50 text-green-600 border-green-200 text-[10px]">
                            <Camera className="h-2.5 w-2.5 mr-0.5" />
                            Bio
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-400 border-gray-200 text-[10px]">
                            Sem foto
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  <Camera className="h-4 w-4 inline mr-1.5" />
                  {cameraMode === "recognize" ? "Identificar funcionário" : "Cadastrar biometria"}
                </p>
                <Button variant="ghost" size="sm" onClick={() => setShowCamera(false)} className="text-gray-500">
                  <X className="h-4 w-4 mr-1" /> Voltar
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={cameraMode === "recognize" ? "default" : "outline"}
                  onClick={() => setCameraMode("recognize")}
                  className={`flex-1 text-xs ${cameraMode === "recognize" ? "bg-gray-900 text-white" : ""}`}
                >
                  <Search className="h-3.5 w-3.5 mr-1" />
                  Reconhecer
                </Button>
                <Button
                  size="sm"
                  variant={cameraMode === "enroll" ? "default" : "outline"}
                  onClick={() => setCameraMode("enroll")}
                  className={`flex-1 text-xs ${cameraMode === "enroll" ? "bg-gray-900 text-white" : ""}`}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Cadastrar Novo
                </Button>
              </div>

              {cameraMode === "recognize" && knownFaces.length > 0 && (
                <p className="text-xs text-gray-500 text-center">
                  {knownFaces.length} funcionário(s) com biometria cadastrada
                </p>
              )}
              {cameraMode === "recognize" && knownFaces.length === 0 && (
                <div className="text-center py-3 rounded-lg border border-amber-200 bg-amber-50">
                  <p className="text-xs text-amber-700">Nenhuma biometria cadastrada ainda.</p>
                  <p className="text-xs text-amber-600 mt-1">Use "Cadastrar Novo" para registrar o primeiro funcionário.</p>
                </div>
              )}

              {cameraMode === "recognize" ? (
                <FaceCaptureCamera
                  key="cam-recognize"
                  mode="recognize"
                  knownFaces={knownFaces}
                  onMatch={handleFaceMatch}
                  onNoMatch={handleNoMatch}
                />
              ) : (
                <FaceCaptureCamera
                  key="cam-enroll"
                  mode="enroll"
                  onCapture={handleEnrollFromCamera}
                  autoCapture={false}
                />
              )}
            </div>
          )}
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
              <p className="text-xs text-green-700">#{funcionario.numeroInterno} · {funcionario.cargo}</p>
              {idMode === "facial" && (
                <Badge className="bg-green-100 text-green-700 border-0 text-xs mt-1">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Identificado por biometria
                </Badge>
              )}
            </div>
          </div>

          <div>
            <Label className="text-sm">Obra (opcional)</Label>
            <Select value={obraId} onValueChange={setObraId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione a obra..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Almoxarifado Central</SelectItem>
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
                  <div key={item.epiId} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 bg-white">
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
                <span className="text-gray-400">#{funcionario.numeroInterno}</span>
              </div>

              {obraId && (obras as any[]).find((o: any) => o.id === Number(obraId)) && (
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

              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center gap-2 text-xs">
                  {idMode === "facial" && <><ShieldCheck className="h-3 w-3 text-green-500" /><span className="text-green-600">Identificação biométrica registrada</span></>}
                  {idMode === "manual" && <><User className="h-3 w-3 text-gray-400" /><span className="text-gray-500">Identificação manual</span></>}
                </div>
              </div>

              {biometriaFoto && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Foto capturada na entrega:</p>
                  <img src={biometriaFoto} className="w-24 h-24 rounded-lg object-cover border border-gray-200" alt="Biometria" />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
            <p className="font-medium mb-1">Declaração NR-6</p>
            <p>O funcionário declara ter recebido os EPIs listados, estar ciente da obrigatoriedade de uso, conservação e devolução quando solicitado.</p>
          </div>

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

      <Dialog open={showEnrollDialog} onOpenChange={(open) => { setShowEnrollDialog(open); if (!open) setEnrollSearch(""); }}>
        <DialogContent className="max-w-lg" style={{ maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Cadastrar Biometria
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            <div className="flex items-center gap-3 flex-shrink-0">
              {enrollFoto && (
                <img src={enrollFoto} className="w-14 h-14 rounded-full object-cover border-2 border-green-200 flex-shrink-0" alt="Captura" />
              )}
              <div className="flex-1">
                <p className="text-sm text-gray-600">Selecione o funcionário para vincular esta foto:</p>
                {enrollEmployee && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-sm text-green-700 font-medium">{enrollEmployee.nomeCompleto}</span>
                  </div>
                )}
              </div>
            </div>
            <Input
              placeholder="Buscar funcionário por nome ou número..."
              value={enrollSearch}
              onChange={(e) => setEnrollSearch(e.target.value)}
              className="flex-shrink-0"
            />
            <div className="flex-1 overflow-y-auto space-y-1 border rounded-lg p-1.5 min-h-[200px]">
              {(() => {
                const all = allEmployees as any[];
                const filtrados = all.filter((e: any) => {
                  if (!enrollSearch.trim()) return true;
                  const lower = enrollSearch.toLowerCase();
                  return e.nomeCompleto?.toLowerCase().includes(lower) || e.numeroInterno?.toLowerCase().includes(lower);
                });
                if (filtrados.length === 0) return (
                  <p className="text-center text-sm text-gray-400 py-8">
                    {all.length === 0 ? "Carregando funcionários..." : "Nenhum funcionário encontrado"}
                  </p>
                );
                return filtrados.map((emp: any) => (
                  <button
                    key={emp.id}
                    className={`w-full text-left p-2 rounded-lg border transition-colors ${
                      enrollEmployee?.id === emp.id ? "border-green-500 bg-green-50" : "border-gray-100 hover:bg-gray-50"
                    }`}
                    onClick={() => setEnrollEmployee(emp)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{emp.nomeCompleto}</p>
                      {enrollEmployee?.id === emp.id && <CheckCircle className="h-4 w-4 text-green-600" />}
                    </div>
                    <p className="text-xs text-gray-500">#{emp.numeroInterno} · {emp.cargo}</p>
                  </button>
                ));
              })()}
            </div>
            <div className="flex-shrink-0 space-y-2">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                disabled={!enrollEmployee || enrollFaceMutation.isPending}
                onClick={confirmEnroll}
              >
                <Camera className="h-4 w-4 mr-2" />
                {enrollFaceMutation.isPending ? "Cadastrando..." : "Cadastrar e Selecionar"}
              </Button>
              <p className="text-xs text-gray-400 text-center">
                A foto será salva como foto de perfil do funcionário
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
