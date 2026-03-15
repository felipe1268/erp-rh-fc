import { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Building2 } from "lucide-react";
import { toast } from "sonner";

export default function ContratoNovo() {
  const [, navigate] = useLocation();
  const { companyId } = useCompany();

  const [form, setForm] = useState({
    empresaTerceiraId: "",
    obraId: "",
    descricao: "",
    numeroContrato: "",
    tipoContrato: "empreitada_global",
    valorTotal: "",
    dataInicio: "",
    dataTermino: "",
    observacoes: "",
  });

  const { data: empresas = [] } = trpc.terceiros.listarEmpresas.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const { data: obrasData = [] } = trpc.rh.listarObras.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const { data: projetos = [] } = trpc.planejamento.listarProjetos.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const criarMutation = trpc.terceiroContratos.criarContrato.useMutation({
    onSuccess: (c) => {
      toast.success("Contrato criado com sucesso!");
      navigate(`/terceiros/contratos/${c.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: typeof e === "string" ? e : e.target.value }));

  const handleSalvar = () => {
    if (!form.empresaTerceiraId) return toast.error("Selecione a empresa terceira");
    if (!form.descricao.trim()) return toast.error("Informe a descrição do contrato");
    const obraObj = obrasData.find((o: any) => String(o.id) === form.obraId);
    criarMutation.mutate({
      companyId,
      empresaTerceiraId: parseInt(form.empresaTerceiraId),
      obraId: form.obraId ? parseInt(form.obraId) : undefined,
      obraNome: obraObj?.nome,
      descricao: form.descricao,
      numeroContrato: form.numeroContrato || undefined,
      tipoContrato: form.tipoContrato,
      valorTotal: form.valorTotal ? parseFloat(form.valorTotal.replace(",", ".")) : 0,
      dataInicio: form.dataInicio || undefined,
      dataTermino: form.dataTermino || undefined,
      observacoes: form.observacoes || undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="p-5 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/terceiros/contratos")} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Novo Contrato de Serviço</h1>
            <p className="text-sm text-gray-500">Vinculado ao planejamento e orçamento da obra</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm border-b border-gray-100 pb-3">
            <Building2 className="w-4 h-4" /> Dados do Contrato
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Empresa Terceira *</Label>
              <Select value={form.empresaTerceiraId} onValueChange={set("empresaTerceiraId")}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a empresa..." /></SelectTrigger>
                <SelectContent>
                  {empresas.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nomeFantasia || e.razaoSocial} — {e.cnpj}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label>Descrição do Serviço *</Label>
              <Input className="mt-1" placeholder="Ex: Execução de gesso liso e forro — Bloco A" value={form.descricao} onChange={set("descricao")} />
            </div>

            <div>
              <Label>Nº do Contrato</Label>
              <Input className="mt-1" placeholder="Ex: CT-2025-001" value={form.numeroContrato} onChange={set("numeroContrato")} />
            </div>

            <div>
              <Label>Tipo de Contrato</Label>
              <Select value={form.tipoContrato} onValueChange={set("tipoContrato")}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="empreitada_global">Empreitada Global</SelectItem>
                  <SelectItem value="preco_unitario">Preço Unitário</SelectItem>
                  <SelectItem value="misto">Misto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label>Obra</Label>
              <Select value={form.obraId} onValueChange={set("obraId")}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                <SelectContent>
                  {obrasData.map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.codigo ? `${o.codigo} — ` : ""}{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Valor Total (R$)</Label>
              <Input className="mt-1" placeholder="0,00" value={form.valorTotal} onChange={set("valorTotal")} />
              <p className="text-xs text-gray-400 mt-1">Pode ser ajustado ao adicionar os itens</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Data Início</Label>
                <Input type="date" className="mt-1" value={form.dataInicio} onChange={set("dataInicio")} />
              </div>
              <div>
                <Label>Data Término</Label>
                <Input type="date" className="mt-1" value={form.dataTermino} onChange={set("dataTermino")} />
              </div>
            </div>

            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea className="mt-1" rows={3} placeholder="Condições especiais, retenções, etc." value={form.observacoes} onChange={set("observacoes")} />
            </div>
          </div>

          <div className="pt-2 bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
            <strong>Próximo passo:</strong> Após criar o contrato, adicione os itens vinculando às atividades do planejamento. O sistema calculará as medições automaticamente com base no avanço físico registrado.
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => navigate("/terceiros/contratos")}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={criarMutation.isPending} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Save className="w-4 h-4" /> {criarMutation.isPending ? "Salvando..." : "Criar Contrato"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
