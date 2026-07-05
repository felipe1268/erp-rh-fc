import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import { Building2, Mail, User, Users, CreditCard, Loader2, CheckCircle2 } from "lucide-react";

function formatCnpj(v: string): string {
  const n = v.replace(/\D/g, "").slice(0, 14);
  if (n.length <= 2) return n;
  if (n.length <= 5) return `${n.slice(0, 2)}.${n.slice(2)}`;
  if (n.length <= 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`;
  if (n.length <= 12) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8)}`;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ContratarPlano() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const cancelado = new URLSearchParams(search).get("cancelado") === "1";

  const { data: catalog, isLoading: loadingCatalog } = trpc.billing.getCatalog.useQuery();

  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [seats, setSeats] = useState(5);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);

  const toggleModule = (id: string) => {
    setSelectedModules((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const totalMonthlyCents = useMemo(() => {
    if (!catalog) return 0;
    const modulesTotal = catalog.modules
      .filter((m) => selectedModules.includes(m.id))
      .reduce((acc, m) => acc + m.monthlyPriceCents, 0);
    const seatsTotal = catalog.seatMonthlyPriceCents * seats;
    return modulesTotal + seatsTotal;
  }, [catalog, selectedModules, seats]);

  const checkoutMut = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!razaoSocial.trim() || !cnpj.trim() || !adminName.trim() || !adminEmail.trim()) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    if (selectedModules.length === 0) {
      toast.error("Selecione ao menos 1 módulo.");
      return;
    }
    checkoutMut.mutate({
      razaoSocial: razaoSocial.trim(),
      cnpj: cnpj.trim(),
      adminName: adminName.trim(),
      adminEmail: adminEmail.trim(),
      seats,
      moduleIds: selectedModules,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Contrate o ERP Gestão Integrada</h1>
          <p className="text-blue-200 mt-1">3 dias grátis, sem compromisso. Cancele quando quiser.</p>
        </div>

        {cancelado && (
          <div className="mb-6 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 px-4 py-3 text-sm text-center">
            Pagamento não concluído. Revise os dados e tente novamente.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-700 font-medium">Razão Social</Label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} placeholder="Nome da sua empresa" className="pl-10 h-11" />
                </div>
              </div>
              <div>
                <Label className="text-gray-700 font-medium">CNPJ</Label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input value={cnpj} onChange={(e) => setCnpj(formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" className="pl-10 h-11" />
                </div>
              </div>
              <div>
                <Label className="text-gray-700 font-medium">Seu nome (administrador)</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Nome completo" className="pl-10 h-11" />
                </div>
              </div>
              <div>
                <Label className="text-gray-700 font-medium">Seu e-mail</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="voce@empresa.com" className="pl-10 h-11" />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-gray-700 font-medium">Quantidade de usuários (assentos)</Label>
              <div className="relative mt-1 max-w-[160px]">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input type="number" min={1} max={500} value={seats} onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))} className="pl-10 h-11" />
              </div>
              {catalog && (
                <p className="text-xs text-gray-500 mt-1">
                  {formatCentsBRL(catalog.seatMonthlyPriceCents)}/usuário/mês
                </p>
              )}
            </div>

            <div>
              <Label className="text-gray-700 font-medium mb-2 block">Módulos contratados</Label>
              {loadingCatalog && <Loader2 className="w-5 h-5 animate-spin text-gray-400" />}
              <div className="grid sm:grid-cols-2 gap-2">
                {catalog?.modules.map((m) => (
                  <label
                    key={m.id}
                    className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedModules.includes(m.id) ? "border-orange-500 bg-orange-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Checkbox checked={selectedModules.includes(m.id)} onCheckedChange={() => toggleModule(m.id)} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{m.label}</p>
                      <p className="text-xs text-gray-500">{m.description}</p>
                      <p className="text-xs font-semibold text-orange-600 mt-0.5">{formatCentsBRL(m.monthlyPriceCents)}/mês</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total estimado (após os 3 dias de teste)</p>
                <p className="text-2xl font-bold text-gray-800">{formatCentsBRL(totalMonthlyCents)}<span className="text-sm font-normal text-gray-500">/mês</span></p>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" /> 3 dias grátis
              </div>
            </div>

            <Button type="submit" disabled={checkoutMut.isPending} className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600">
              {checkoutMut.isPending ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Redirecionando...</>
              ) : (
                <><CreditCard className="w-5 h-5 mr-2" /> Continuar para pagamento</>
              )}
            </Button>
            <p className="text-[11px] text-gray-400 text-center">
              Cartão exigido para iniciar o teste grátis de 3 dias. Você pode cancelar a qualquer momento antes do fim do período de teste sem ser cobrado.
            </p>
          </form>
        </div>

        <p className="text-center text-blue-200 text-sm mt-6">
          Já tem uma conta?{" "}
          <button className="underline hover:text-white" onClick={() => navigate("/login")}>
            Entrar
          </button>
        </p>
      </div>
    </div>
  );
}
