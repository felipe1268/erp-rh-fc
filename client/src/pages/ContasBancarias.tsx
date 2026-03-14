import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Pencil, Trash2, Landmark, CreditCard, Building2, CheckCircle2, XCircle } from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { Badge } from "@/components/ui/badge";
import { removeAccents } from "@/lib/searchUtils";
import { fmtNum } from "@/lib/formatters";

type ContaForm = {
  banco: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  tipoConta: "corrente" | "poupanca";
};

const emptyForm: ContaForm = {
  banco: "",
  codigoBanco: "",
  agencia: "",
  conta: "",
  tipoConta: "corrente",
};

const BANCOS_COMUNS = [
  { codigo: "001", nome: "Banco do Brasil" },
  { codigo: "033", nome: "Santander" },
  { codigo: "104", nome: "Caixa Econômica Federal" },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "341", nome: "Itaú Unibanco" },
  { codigo: "756", nome: "Sicoob" },
  { codigo: "748", nome: "Sicredi" },
  { codigo: "077", nome: "Inter" },
  { codigo: "260", nome: "Nubank" },
  { codigo: "336", nome: "C6 Bank" },
];

export default function ContasBancarias() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();

  const contasQ = trpc.folha.listarContasBancarias.useQuery(
    { companyId },
    { enabled: !!companyId || companyIds?.length > 0 }
  );
  const contas = contasQ.data ?? [];

  const createMut = trpc.folha.criarContaBancaria.useMutation({
    onSuccess: () => { contasQ.refetch(); setDialogOpen(false); toast.success("Conta bancária cadastrada com sucesso!"); },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = trpc.folha.atualizarContaBancaria.useMutation({
    onSuccess: () => { contasQ.refetch(); setDialogOpen(false); toast.success("Conta bancária atualizada!"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.folha.excluirContaBancaria.useMutation({
    onSuccess: () => { contasQ.refetch(); toast.success("Conta bancária excluída!"); },
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ContaForm>(emptyForm);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return contas;
    const s = removeAccents(search);
    return contas.filter((c: any) =>
      removeAccents(c.banco || '').includes(s) ||

      (c.agencia || "").includes(s) ||
      (c.conta || "").includes(s) ||
      (c.codigoBanco || "").includes(s)
    );
  }, [contas, search]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (conta: any) => {
    setEditingId(conta.id);
    setForm({
      banco: conta.banco || "",
      codigoBanco: conta.codigoBanco || "",
      agencia: conta.agencia || "",
      conta: conta.conta || "",
      tipoConta: conta.tipoConta || "corrente",

    });
    setDialogOpen(true);
  };

  const handleBancoSelect = (codigo: string) => {
    const banco = BANCOS_COMUNS.find(b => b.codigo === codigo);
    if (banco) {
      setForm(f => ({ ...f, banco: banco.nome, codigoBanco: banco.codigo }));
    }
  };

  const handleSave = () => {
    if (!form.banco.trim()) { toast.error("Nome do banco é obrigatório"); return; }
    if (!form.agencia.trim()) { toast.error("Agência é obrigatória"); return; }
    if (!form.conta.trim()) { toast.error("Conta é obrigatória"); return; }

    if (editingId) {
      updateMut.mutate({
        id: editingId,
        banco: form.banco,
        codigoBanco: form.codigoBanco || undefined,
        agencia: form.agencia,
        conta: form.conta,
        tipoConta: form.tipoConta,

      });
    } else {
      createMut.mutate({ companyId, companyIds, banco: form.banco,
        codigoBanco: form.codigoBanco || undefined,
        agencia: form.agencia,
        conta: form.conta,
        tipoConta: form.tipoConta,

      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir esta conta bancária?")) {
      deleteMut.mutate({ id });
    }
  };

  const handleToggleAtivo = (conta: any) => {
    updateMut.mutate({
      id: conta.id,
      ativo: conta.ativo === 1 ? 0 : 1,
    });
  };

  const ativas = contas.filter((c: any) => c.ativo !== 0).length;
  const inativas = contas.filter((c: any) => c.ativo === 0).length;

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Contas Bancárias</h1>
            <p className="text-muted-foreground text-sm">
              Contas bancárias da empresa para pagamento de folha
            </p>
          </div>
          <DraggableCommandBar barId="contas-bancarias" items={[
            { id: "print", node: <PrintActions title="Contas Bancárias" /> },
            { id: "nova", node: <Button onClick={openNew} className="bg-[#1B2A4A] hover:bg-[#243660]"><Plus className="h-4 w-4 mr-2" /> Nova Conta</Button> },
          ]} />
        </div>

        {/* Cards resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{fmtNum(contas.length)}</p>
                <p className="text-xs text-muted-foreground">Total de Contas</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{fmtNum(ativas)}</p>
                <p className="text-xs text-muted-foreground">Ativas</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{fmtNum(inativas)}</p>
                <p className="text-xs text-muted-foreground">Inativas</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Busca */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por banco, agência ou conta..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Lista de contas */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Landmark className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg">Nenhuma conta bancária cadastrada</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Cadastre as contas bancárias da empresa para vincular aos funcionários.
              </p>
              <Button onClick={openNew} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                <Plus className="h-4 w-4 mr-2" /> Nova Conta
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((conta: any) => (
              <Card key={conta.id} className={`hover:shadow-md transition-shadow ${conta.ativo === 0 ? "opacity-60" : ""}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                        conta.banco?.toLowerCase().includes("caixa") ? "bg-blue-100" :
                        conta.banco?.toLowerCase().includes("santander") ? "bg-red-100" :
                        conta.banco?.toLowerCase().includes("itaú") || conta.banco?.toLowerCase().includes("itau") ? "bg-orange-100" :
                        conta.banco?.toLowerCase().includes("bradesco") ? "bg-pink-100" :
                        conta.banco?.toLowerCase().includes("brasil") ? "bg-yellow-100" :
                        "bg-gray-100"
                      }`}>
                        <Landmark className={`h-5 w-5 ${
                          conta.banco?.toLowerCase().includes("caixa") ? "text-blue-700" :
                          conta.banco?.toLowerCase().includes("santander") ? "text-red-700" :
                          conta.banco?.toLowerCase().includes("itaú") || conta.banco?.toLowerCase().includes("itau") ? "text-orange-700" :
                          conta.banco?.toLowerCase().includes("bradesco") ? "text-pink-700" :
                          conta.banco?.toLowerCase().includes("brasil") ? "text-yellow-700" :
                          "text-gray-700"
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base truncate">
                          {conta.banco}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          {conta.codigoBanco && (
                            <span className="text-xs text-muted-foreground font-mono">
                              Cód: {conta.codigoBanco}
                            </span>
                          )}
                          <Badge variant={conta.ativo !== 0 ? "default" : "destructive"} className="text-xs">
                            {conta.ativo !== 0 ? "Ativa" : "Inativa"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-sm">

                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Agência:</span>
                      <span className="font-mono font-medium">{conta.agencia}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Conta:</span>
                      <span className="font-mono font-medium">{conta.conta}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Tipo:</span>
                      <span className="capitalize">{conta.tipoConta === "poupanca" ? "Poupança" : "Corrente"}</span>
                    </div>

                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-3 border-t">
                    <Button variant="outline" size="sm" onClick={() => openEdit(conta)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleAtivo(conta)}
                      className={conta.ativo !== 0 ? "text-amber-700 hover:text-amber-800" : "text-green-700 hover:text-green-800"}
                    >
                      {conta.ativo !== 0 ? (
                        <><XCircle className="h-3.5 w-3.5 mr-1" /> Desativar</>
                      ) : (
                        <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Ativar</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(conta.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog de criação/edição */}
      <FullScreenDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? "Editar Conta Bancária" : "Nova Conta Bancária"}
        icon={<Landmark className="h-5 w-5 text-white" />}
      >
        <div className="w-full max-w-2xl">
          <div className="space-y-4">
            {/* Seleção rápida de banco */}
            <div>
              <Label>Banco Comum (seleção rápida)</Label>
              <Select
                value={form.codigoBanco || undefined}
                onValueChange={handleBancoSelect}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um banco..." />
                </SelectTrigger>
                <SelectContent>
                  {BANCOS_COMUNS.map(b => (
                    <SelectItem key={b.codigo} value={b.codigo}>
                      {b.codigo} - {b.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome do Banco *</Label>
                <Input
                  value={form.banco}
                  onChange={e => setForm(f => ({ ...f, banco: e.target.value }))}
                  placeholder="Ex: Caixa Econômica Federal"
                />
              </div>
              <div>
                <Label>Código do Banco</Label>
                <Input
                  value={form.codigoBanco}
                  onChange={e => setForm(f => ({ ...f, codigoBanco: e.target.value }))}
                  placeholder="Ex: 104"
                />
              </div>
              <div>
                <Label>Tipo de Conta *</Label>
                <Select
                  value={form.tipoConta}
                  onValueChange={(v: "corrente" | "poupanca") => setForm(f => ({ ...f, tipoConta: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Conta Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Agência *</Label>
                <Input
                  value={form.agencia}
                  onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))}
                  placeholder="Ex: 0001"
                />
              </div>
              <div>
                <Label>Conta *</Label>
                <Input
                  value={form.conta}
                  onChange={e => setForm(f => ({ ...f, conta: e.target.value }))}
                  placeholder="Ex: 12345-6"
                />
              </div>
            </div>


          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending}
              className="bg-[#1B2A4A] hover:bg-[#243660]"
            >
              {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
