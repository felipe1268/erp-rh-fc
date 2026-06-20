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
import { MoneyInput } from "@/components/ui/money-input";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Pencil, Trash2, Landmark, CreditCard, Building2, CheckCircle2, XCircle, Wallet, BookCopy, TrendingUp, Hash, Sparkles, Check, Calendar } from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import TaloesDialog from "@/pages/financeiro/TaloesDialog";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { Badge } from "@/components/ui/badge";
import { removeAccents } from "@/lib/searchUtils";
import { fmtNum, formatConta, formatAgencia } from "@/lib/formatters";

type ContaForm = {
  banco: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  tipoConta: "corrente" | "poupanca";
  temTalao: boolean;
  temAplicacaoAutomatica: boolean;
  saldoInicial: string;
  saldoInicialData: string;
};

const emptyForm: ContaForm = {
  banco: "",
  codigoBanco: "",
  agencia: "",
  conta: "",
  tipoConta: "corrente",
  temTalao: false,
  temAplicacaoAutomatica: false,
  saldoInicial: "",
  saldoInicialData: "",
};

function fmtDataBR(iso?: string | null): string {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : String(iso);
}

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
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
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
  const [taloesConta, setTaloesConta] = useState<any | null>(null);

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
      temTalao: Number(conta.temTalao) === 1,
      temAplicacaoAutomatica: Number(conta.temAplicacaoAutomatica) === 1,
      saldoInicial: conta.saldoInicial != null ? String(conta.saldoInicial) : "",
      saldoInicialData: conta.saldoInicialData ? String(conta.saldoInicialData).slice(0, 10) : "",
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

    if (form.saldoInicial && !form.saldoInicialData) {
      toast.error("Informe a data do saldo inicial");
      return;
    }

    const saldoFields = form.saldoInicialData
      ? { saldoInicial: parseFloat(form.saldoInicial) || 0, saldoInicialData: form.saldoInicialData }
      : {};

    if (editingId) {
      updateMut.mutate({
        id: editingId,
        banco: form.banco,
        codigoBanco: form.codigoBanco || undefined,
        agencia: form.agencia,
        conta: form.conta,
        tipoConta: form.tipoConta,
        temTalao: form.temTalao ? 1 : 0,
        temAplicacaoAutomatica: form.temAplicacaoAutomatica ? 1 : 0,
        ...saldoFields,
      });
    } else {
      createMut.mutate({ companyId, companyIds, banco: form.banco,
        codigoBanco: form.codigoBanco || undefined,
        agencia: form.agencia,
        conta: form.conta,
        tipoConta: form.tipoConta,
        temTalao: form.temTalao ? 1 : 0,
        temAplicacaoAutomatica: form.temAplicacaoAutomatica ? 1 : 0,
        ...saldoFields,
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
                          {Number(conta.temTalao) === 1 && (
                            <Badge variant="outline" className="text-xs border-[#1B2A4A]/30 text-[#1B2A4A] gap-1">
                              <BookCopy className="h-3 w-3" /> Talão
                            </Badge>
                          )}
                          {Number(conta.temAplicacaoAutomatica) === 1 && (
                            <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700 gap-1">
                              <TrendingUp className="h-3 w-3" /> Aplicação automática
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-sm">

                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Agência:</span>
                      <span className="font-mono font-medium tracking-wide">{formatAgencia(conta.agencia)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Conta:</span>
                      <span className="font-mono font-medium tracking-wide">{formatConta(conta.conta)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Tipo:</span>
                      <span className="capitalize">{conta.tipoConta === "poupanca" ? "Poupança" : "Corrente"}</span>
                    </div>
                    {conta.saldoInicialData != null && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Saldo inicial:</span>
                        <span className="font-medium">
                          R$ {fmtNum(Number(conta.saldoInicial ?? 0))}
                          <span className="text-muted-foreground font-normal"> em {fmtDataBR(conta.saldoInicialData)}</span>
                        </span>
                      </div>
                    )}

                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-3 border-t flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => openEdit(conta)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    {Number(conta.temTalao) === 1 && (
                      <Button variant="outline" size="sm" className="text-[#1B2A4A]" onClick={() => setTaloesConta(conta)}>
                        <BookCopy className="h-3.5 w-3.5 mr-1" /> Talões
                      </Button>
                    )}
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
        subtitle={editingId ? "Atualize os dados da conta e os recursos vinculados" : "Cadastre uma conta para usar em cheques, conciliação e fluxo de caixa"}
        icon={<Landmark className="h-5 w-5 text-white" />}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending}
              className="bg-[#1B2A4A] hover:bg-[#243660] gap-1.5"
            >
              <Check className="h-4 w-4" />
              {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar conta"}
            </Button>
          </>
        }
      >
        <div className="w-full max-w-3xl mx-auto space-y-5">

          {/* ── Cartão-preview ao vivo da conta ── */}
          <div className="rounded-2xl p-5 bg-gradient-to-br from-[#1B2A4A] via-[#243660] to-[#2d4a7a] text-white shadow-lg ring-1 ring-black/5 relative overflow-hidden">
            <div className="absolute -right-8 -top-10 w-40 h-40 rounded-full bg-white/5" />
            <div className="absolute -right-2 top-10 w-28 h-28 rounded-full bg-white/5" />
            <div className="relative flex items-start justify-between">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/60 font-semibold">
                  <span className={`w-1.5 h-1.5 rounded-full ${form.tipoConta === "corrente" ? "bg-emerald-400" : "bg-sky-300"}`} />
                  {form.tipoConta === "corrente" ? "Conta Corrente" : "Conta Poupança"}
                </span>
                <div className="mt-1.5 text-lg font-bold leading-tight truncate">{form.banco || "Nome do banco"}</div>
              </div>
              <div className="shrink-0 w-10 h-10 rounded-xl bg-white/15 ring-1 ring-white/25 flex items-center justify-center">
                <Landmark className="h-5 w-5 text-white/90" />
              </div>
            </div>
            <div className="relative mt-5 flex items-end gap-6 font-mono">
              <div>
                <div className="text-[9px] tracking-widest text-white/45">AGÊNCIA</div>
                <div className="text-sm tracking-wide">{form.agencia || "----"}</div>
              </div>
              <div>
                <div className="text-[9px] tracking-widest text-white/45">CONTA</div>
                <div className="text-sm tracking-wide">{form.conta || "--------"}</div>
              </div>
              {form.codigoBanco && (
                <div className="ml-auto text-right">
                  <div className="text-[9px] tracking-widest text-white/45">CÓDIGO</div>
                  <div className="text-sm tracking-wide">{form.codigoBanco}</div>
                </div>
              )}
            </div>
          </div>

          {/* ── Seção 1 · Identificação ── */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-100 bg-slate-50/70">
              <div className="w-8 h-8 rounded-lg bg-[#1B2A4A]/10 flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-[#1B2A4A]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#1B2A4A]">Identificação do banco</h3>
                <p className="text-[11px] text-slate-400">Toque num banco comum para preencher rápido, ou digite manualmente</p>
              </div>
            </header>
            <div className="p-5 space-y-4">
              {/* Seleção rápida via chips */}
              <div>
                <Label className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-[#1B2A4A]" /> Banco comum (seleção rápida)
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BANCOS_COMUNS.map(b => {
                    const ativo = form.codigoBanco === b.codigo;
                    return (
                      <button
                        key={b.codigo}
                        type="button"
                        onClick={() => handleBancoSelect(b.codigo)}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${
                          ativo
                            ? "border-[#1B2A4A] bg-[#1B2A4A]/5 ring-1 ring-[#1B2A4A]/20"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <span className={`font-mono text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0 ${ativo ? "bg-[#1B2A4A] text-white" : "bg-slate-100 text-slate-500"}`}>
                          {b.codigo}
                        </span>
                        <span className="truncate text-xs text-slate-700">{b.nome}</span>
                        {ativo && <Check className="h-3.5 w-3.5 text-[#1B2A4A] ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label>Nome do Banco *</Label>
                  <Input
                    value={form.banco}
                    onChange={e => setForm(f => ({ ...f, banco: e.target.value }))}
                    placeholder="Ex: Caixa Econômica Federal"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 text-slate-400" /> Código do Banco</Label>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Agência *</Label>
                  <Input
                    className="font-mono tracking-wide"
                    value={form.agencia}
                    onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))}
                    onBlur={e => setForm(f => ({ ...f, agencia: formatAgencia(e.target.value) }))}
                    placeholder="Ex: 0633"
                  />
                </div>
                <div>
                  <Label>Conta *</Label>
                  <Input
                    className="font-mono tracking-wide"
                    value={form.conta}
                    onChange={e => setForm(f => ({ ...f, conta: e.target.value }))}
                    onBlur={e => setForm(f => ({ ...f, conta: formatConta(e.target.value) }))}
                    placeholder="Ex: 13.002.609-3"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── Seção 2 · Recursos da conta (toggles interativos) ── */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-100 bg-slate-50/70">
              <div className="w-8 h-8 rounded-lg bg-[#1B2A4A]/10 flex items-center justify-center shrink-0">
                <CreditCard className="h-4 w-4 text-[#1B2A4A]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#1B2A4A]">Recursos da conta</h3>
                <p className="text-[11px] text-slate-400">Ative o que esta conta usa — muda como ela aparece em cheques e na conciliação</p>
              </div>
            </header>
            <div className="p-5 space-y-3">
              {/* Talão de cheque */}
              <label
                className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition ${
                  form.temTalao ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <Checkbox
                  checked={form.temTalao}
                  onCheckedChange={(v) => setForm(f => ({ ...f, temTalao: v === true }))}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <BookCopy className="h-4 w-4 text-[#1B2A4A]" /> Esta conta tem talão de cheque
                  </span>
                  <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
                    Só contas marcadas aparecem no seletor de "Lançar cheque". Após salvar, use o botão
                    <span className="font-medium"> Talões</span> no card para cadastrar os talões e controlar folhas perdidas.
                  </span>
                </span>
                {form.temTalao && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                    <Check className="h-3 w-3" /> Ativo
                  </span>
                )}
              </label>

              {/* Aplicação/resgate automático */}
              <label
                className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition ${
                  form.temAplicacaoAutomatica ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <Checkbox
                  checked={form.temAplicacaoAutomatica}
                  onCheckedChange={(v) => setForm(f => ({ ...f, temAplicacaoAutomatica: v === true }))}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-[#1B2A4A]" /> Aplicação/resgate automático (varredura diária)
                  </span>
                  <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
                    Marque se o banco aplica o saldo ocioso no fim do dia e resgata na abertura (ex.: <span className="font-medium">ContaMax / Resgate Automático</span>). Na Conciliação, as linhas de <span className="font-medium">aplicação e resgate</span> são tratadas como <span className="font-medium">movimentação interna</span> (não são entrada/saída de caixa), e o <span className="font-medium">rendimento</span> é proposto como receita financeira.
                  </span>
                </span>
                {form.temAplicacaoAutomatica && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                    <Check className="h-3 w-3" /> Ativo
                  </span>
                )}
              </label>
            </div>
          </section>

          {/* ── Seção 3 · Saldo inicial ── */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-100 bg-slate-50/70">
              <div className="w-8 h-8 rounded-lg bg-[#1B2A4A]/10 flex items-center justify-center shrink-0">
                <Wallet className="h-4 w-4 text-[#1B2A4A]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#1B2A4A]">Saldo inicial</h3>
                <p className="text-[11px] text-slate-400">Ponto de partida do Fluxo de Caixa para bater com o extrato</p>
              </div>
            </header>
            <div className="p-5">
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                Saldo real da conta no dia em que você começou a registrar os lançamentos.
                Ele é usado como ponto de partida do Fluxo de Caixa para bater com o extrato do banco na conciliação.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Saldo Inicial (R$)</Label>
                  <MoneyInput
                    value={form.saldoInicial}
                    onChange={(v) => setForm(f => ({ ...f, saldoInicial: v }))}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-slate-400" /> Data do Saldo Inicial</Label>
                  <Input
                    type="date"
                    value={form.saldoInicialData}
                    onChange={e => setForm(f => ({ ...f, saldoInicialData: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </section>

        </div>
      </FullScreenDialog>

      <TaloesDialog
        open={taloesConta != null}
        onClose={() => setTaloesConta(null)}
        conta={taloesConta}
        companyId={companyId}
      />
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
