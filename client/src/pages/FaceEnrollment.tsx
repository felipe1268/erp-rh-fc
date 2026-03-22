import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { FaceCaptureCamera } from "@/components/FaceCaptureCamera";
import type { FaceMatch } from "@/components/FaceCaptureCamera";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle, Camera, Search, Trash2, AlertCircle, Users, UserCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function FaceEnrollment() {
  const { companyId, companyIds } = useCompany();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [enrollingEmployee, setEnrollingEmployee] = useState<any | null>(null);
  const [filter, setFilter] = useState<"todos" | "cadastrados" | "pendentes">("todos");

  const { data: employees = [], refetch } = trpc.faceRecognition.getEnrolledEmployees.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId }
  );

  const enrollMutation = trpc.faceRecognition.enrollFace.useMutation({
    onSuccess: () => {
      toast({ title: "Biometria cadastrada com sucesso!" });
      refetch();
      setEnrollingEmployee(null);
    },
    onError: (e) => toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = trpc.faceRecognition.deleteEnrollment.useMutation({
    onSuccess: () => {
      toast({ title: "Biometria removida." });
      refetch();
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    return employees.filter((e: any) => {
      const matchSearch =
        !search ||
        e.nomeCompleto?.toLowerCase().includes(search.toLowerCase()) ||
        e.numeroInterno?.includes(search);

      const matchFilter =
        filter === "todos" ||
        (filter === "cadastrados" && e.faceId) ||
        (filter === "pendentes" && !e.faceId);

      return matchSearch && matchFilter;
    });
  }, [employees, search, filter]);

  const totalCadastrados = employees.filter((e: any) => e.faceId).length;
  const totalPendentes = employees.filter((e: any) => !e.faceId).length;

  const handleCapture = (descriptor: Float32Array, fotoBase64: string) => {
    if (!enrollingEmployee) return;
    enrollMutation.mutate({
      companyId,
      employeeId: enrollingEmployee.id,
      descriptor: Array.from(descriptor),
      fotoBase64,
    });
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Cadastro de Biometria Facial</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cadastre o rosto dos funcionários para identificação automática na entrega de EPIs e ferramentas.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border border-gray-200">
          <CardContent className="p-3 flex items-center gap-3">
            <Users className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xl font-bold text-gray-900">{employees.length}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-green-200 bg-green-50">
          <CardContent className="p-3 flex items-center gap-3">
            <UserCheck className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-xl font-bold text-green-700">{totalCadastrados}</p>
              <p className="text-xs text-green-600">Cadastrados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-amber-200 bg-amber-50">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xl font-bold text-amber-700">{totalPendentes}</p>
              <p className="text-xs text-amber-600">Pendentes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome ou número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1">
          {(["todos", "cadastrados", "pendentes"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className={filter === f ? "bg-gray-900 text-white" : ""}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((emp: any) => (
          <div
            key={emp.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white"
          >
            <div className="relative">
              {emp.fotoUrl ? (
                <img
                  src={emp.fotoUrl}
                  alt={emp.nomeCompleto}
                  className="w-10 h-10 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-gray-400" />
                </div>
              )}
              {emp.faceId && (
                <CheckCircle className="absolute -bottom-1 -right-1 h-4 w-4 text-green-500 bg-white rounded-full" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm truncate">{emp.nomeCompleto}</p>
              <p className="text-xs text-gray-500">#{emp.numeroInterno} · {emp.cargo}</p>
              {emp.faceId && (
                <p className="text-xs text-green-600">
                  Cadastrado por {emp.enrolledBy || "Sistema"}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {emp.faceId ? (
                <>
                  <Badge className="bg-green-100 text-green-700 border-0 text-xs">Cadastrado</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-gray-400 hover:text-red-500"
                    onClick={() => deleteMutation.mutate({ employeeId: emp.id })}
                    title="Remover biometria"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setEnrollingEmployee(emp)}
                  >
                    <Camera className="h-3 w-3 mr-1" />
                    Recadastrar
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                  onClick={() => setEnrollingEmployee(emp)}
                >
                  <Camera className="h-3 w-3 mr-1" />
                  Cadastrar
                </Button>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <Users className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">Nenhum funcionário encontrado</p>
          </div>
        )}
      </div>

      <Dialog open={!!enrollingEmployee} onOpenChange={(o) => !o && setEnrollingEmployee(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              Cadastrar Rosto — {enrollingEmployee?.nomeCompleto}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
              {enrollingEmployee?.fotoUrl ? (
                <img
                  src={enrollingEmployee.fotoUrl}
                  className="w-12 h-12 rounded-full object-cover"
                  alt={enrollingEmployee.nomeCompleto}
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                  <Users className="h-6 w-6 text-gray-400" />
                </div>
              )}
              <div>
                <p className="font-semibold text-sm">{enrollingEmployee?.nomeCompleto}</p>
                <p className="text-xs text-gray-500">#{enrollingEmployee?.numeroInterno}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 text-center">
              Peça ao funcionário que olhe diretamente para a câmera e clique em Cadastrar Rosto.
            </p>
            {enrollingEmployee && (
              <FaceCaptureCamera
                mode="enroll"
                onCapture={handleCapture}
              />
            )}
            {enrollMutation.isPending && (
              <p className="text-xs text-center text-blue-600">Salvando biometria...</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
