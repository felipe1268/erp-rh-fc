import React, { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft, Plus, Loader2, FileText, ChevronRight, CheckCircle2,
  Clock, Send, AlertCircle, DollarSign, Percent, Settings,
  Edit, Trash2, Eye, TrendingUp, Package,
} from "lucide-react";

const n = (v: unknown) => parseFloat(String(v || "0")) || 0;
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(v: number) {
  return v.toFixed(2) + "%";
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho:  { label: "Rascunho",  color: "bg-gray-100 text-gray-600",    icon: <Edit className="h-3 w-3" /> },
  enviado:   { label: "Enviado",   color: "bg-blue-100 text-blue-700",    icon: <Send className="h-3 w-3" /> },
  aprovado:  { label: "Aprovado",  color: "bg-amber-100 text-amber-700",  icon: <CheckCircle2 className="h-3 w-3" /> },
  finalizado:{ label: "Finalizado",color: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.rascunho;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

const PROXIMOS_STATUS: Record<string, { label: string; status: string } | null> = {
  rascunho:  { label: "Marcar como Enviado", status: "enviado" },
  enviado:   { label: "Marcar como Aprovado", status: "aprovado" },
  aprovado:  { label: "Finalizar Medição", status: "finalizado" },
  finalizado: null,
};

export default function MedicaoDetalhe() {
  const params = useParams<{ id: string }>();
  const contratoId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;

  const [abaAtiva, setAbaAtiva] = useState("boletins");
  const [modalBoletim, setModalBoletim] = useState(false);
  const [boletimSelecionado, setBoletimSelecionado] = useState<any | null>(null);
  const [modalFd, setModalFd] = useState(false);
  const [modalItens, setModalItens] = useState(false);
  const [editandoContrato, setEditandoContrato] = useState(false);

  const [formBoletim, setFormBoletim] = useState({ periodoReferencia: "", observacoes: "" });
  const [formFd, setFormFd] = useState({ descricao: "", valor: "", dataRegistro: "", origem: "manual", observacoes: "" });
  const [formContrato, setFormContrato] = useState<any>({});

  const utils = trpc.useUtils();

  const { data: contrato, isLoading: loadingContrato } = trpc.medicao.getContrato.useQuery(
    { id: contratoId },
    { enabled: contratoId > 0 }
  );
  const { data: boletins = [], isLoading: loadingBoletins } = trpc.medicao.listarBoletins.useQuery(
    { contratoId },
    { enabled: contratoId > 0 }
  );
  const { data: fdRegistros = [] } = trpc.medicao.listarFdRegistros.useQuery(
    { contratoId },
    { enabled: contratoId > 0 }
  );
  const { data: boletimDetalhe } = trpc.medicao.getBoletim.useQuery(
    { id: boletimSelecionado?.id ?? 0 },
    { enabled: !!boletimSelecionado?.id }
  );
  const { data: atividades = [] } = trpc.medicao.getAtividadesProjeto.useQuery(
    { projetoId: contrato?.projetoId ?? 0 },
    { enabled: !!contrato?.projetoId }
  );
  const { data: itensOrcamento = [] } = trpc.medicao.getItensOrcamento.useQuery(
    { orcamentoId: contrato?.orcamentoId ?? 0 },
    { enabled: !!contrato?.orcamentoId }
  );

  const criarBoletimMutation = trpc.medicao.criarBoletim.useMutation({
    onSuccess: (novo) => {
      utils.medicao.listarBoletins.invalidate({ contratoId });
      setModalBoletim(false);
      setFormBoletim({ periodoReferencia: "", observacoes: "" });
      setBoletimSelecionado(novo);
      setModalItens(true);
    },
  });

  const avancarStatusMutation = trpc.medicao.avancarStatusBoletim.useMutation({
    onSuccess: () => utils.medicao.listarBoletins.invalidate({ contratoId }),
  });

  const criarFdMutation = trpc.medicao.criarFdRegistro.useMutation({
    onSuccess: () => {
      utils.medicao.listarFdRegistros.invalidate({ contratoId });
      setModalFd(false);
      setFormFd({ descricao: "", valor: "", dataRegistro: "", origem: "manual", observacoes: "" });
    },
  });

  const excluirFdMutation = trpc.medicao.excluirFdRegistro.useMutation({
    onSuccess: () => utils.medicao.listarFdRegistros.invalidate({ contratoId }),
  });

  const atualizarContratoMutation = trpc.medicao.atualizarContrato.useMutation({
    onSuccess: () => {
      utils.medicao.getContrato.invalidate({ id: contratoId });
      setEditandoContrato(false);
    },
  });

  const salvarItensMutation = trpc.medicao.salvarItensBoletim.useMutation({
    onSuccess: () => {
      utils.medicao.listarBoletins.invalidate({ contratoId });
      utils.medicao.getBoletim.invalidate({ id: boletimSelecionado?.id });
      setModalItens(false);
    },
  });

  const recalcularMutation = trpc.medicao.recalcularDeducoes.useMutation({
    onSuccess: () => {
      utils.medicao.listarBoletins.invalidate({ contratoId });
      utils.medicao.getBoletim.invalidate({ id: boletimSelecionado?.id });
    },
  });

  const [itensEdicao, setItensEdicao] = useState<any[]>([]);

  function abrirItens(boletim: any) {
    setBoletimSelecionado(boletim);
    setModalItens(true);
  }

  function popularItensDoOrcamento() {
    if (!itensOrcamento.length) return;
    const ativMap = new Map((atividades as any[]).map((a: any) => [a.eapCodigo, a]));
    const novos = (itensOrcamento as any[]).filter((i: any) => i.nivel > 1 && !i.tipo?.includes("grupo")).map((i: any) => {
      const atv = ativMap.get(i.eapCodigo);
      return {
        atividadeId: atv?.id ?? null,
        eapCodigo: i.eapCodigo,
        descricao: i.descricao,
        valorContratual: n(i.vendaTotal).toFixed(2),
        percentualAcumuladoAnterior: "0",
        percentualPeriodo: "0",
        percentualAcumuladoAtual: "0",
        valorPeriodo: "0",
        tipoAvanco: "fisico",
        isFd: false,
      };
    });
    setItensEdicao(novos);
  }

  function calcularItem(item: any, field: string, value: string) {
    const updated = { ...item, [field]: value };
    const pctAnt = n(updated.percentualAcumuladoAnterior);
    const pctPer = n(updated.percentualPeriodo);
    const pctAtu = Math.min(pctAnt + pctPer, 100);
    const valContr = n(updated.valorContratual);
    const valPer = (valContr * pctPer) / 100;
    return { ...updated, percentualAcumuladoAtual: pctAtu.toFixed(4), valorPeriodo: valPer.toFixed(2) };
  }

  const totalBruto = useMemo(() =>
    itensEdicao.filter(i => !i.isFd).reduce((acc, i) => acc + n(i.valorPeriodo), 0), [itensEdicao]);
  const totalFdEdicao = useMemo(() =>
    itensEdicao.filter(i => i.isFd).reduce((acc, i) => acc + n(i.valorPeriodo), 0), [itensEdicao]);

  const totalMedido = (boletins as any[]).reduce((acc: number, b: any) =>
    b.status === "finalizado" ? acc + n(b.valorLiquido) : acc, 0);
  const saldoRestante = n(contrato?.valorTotalContrato) - totalMedido;
  const sinalQuitado = (boletins as any[]).reduce((acc: number, b: any) =>
    acc + n(b.descontoSinal), 0);
  const sinalRestante = Math.max(0, n(contrato?.valorSinalRecebido) - sinalQuitado);

  if (loadingContrato) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  if (!contrato) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center text-gray-400">Contrato não encontrado.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/medicao")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />Voltar
          </Button>
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">{contrato.nomeProjeto}</h1>
            <p className="text-sm text-gray-500">{contrato.cliente || "—"} {contrato.local ? `· ${contrato.local}` : ""}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setFormContrato({ ...contrato }); setEditandoContrato(true); }} className="gap-1.5">
            <Settings className="h-4 w-4" />Configurações
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Valor do Contrato", value: brl(n(contrato.valorTotalContrato)), icon: DollarSign, color: "text-blue-600" },
            { label: "Total Medido", value: brl(totalMedido), icon: TrendingUp, color: "text-emerald-600" },
            { label: "Saldo Restante", value: brl(saldoRestante), icon: FileText, color: saldoRestante < 0 ? "text-red-600" : "text-gray-700" },
            { label: "Sinal a Descontar", value: brl(sinalRestante), icon: Percent, color: "text-amber-600" },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <card.icon className={`h-4 w-4 ${card.color}`} />
                <span className="text-xs text-gray-500">{card.label}</span>
              </div>
              <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
          <TabsList>
            <TabsTrigger value="boletins">Boletins de Medição</TabsTrigger>
            <TabsTrigger value="fd">Faturamento Direto (FD)</TabsTrigger>
          </TabsList>

          <TabsContent value="boletins" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button onClick={() => setModalBoletim(true)} className="gap-2" size="sm">
                <Plus className="h-4 w-4" />Novo Boletim
              </Button>
            </div>

            {loadingBoletins ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : (boletins as any[]).length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">Nenhum boletim emitido</p>
                <p className="text-sm mt-1">Crie o primeiro boletim de medição para este contrato</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-12">Nº</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor Bruto</TableHead>
                      <TableHead className="text-right">Desc. Sinal</TableHead>
                      <TableHead className="text-right">Retenção</TableHead>
                      <TableHead className="text-right">Glosa</TableHead>
                      <TableHead className="text-right">FD</TableHead>
                      <TableHead className="text-right">Valor Líquido</TableHead>
                      <TableHead className="w-28"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(boletins as any[]).map((b: any) => {
                      const prox = PROXIMOS_STATUS[b.status];
                      return (
                        <TableRow key={b.id} className="hover:bg-gray-50">
                          <TableCell className="font-mono text-sm font-semibold">{String(b.numero).padStart(2, "0")}</TableCell>
                          <TableCell className="font-medium">{b.periodoReferencia}</TableCell>
                          <TableCell><StatusBadge status={b.status} /></TableCell>
                          <TableCell className="text-right text-sm">{brl(n(b.valorBruto))}</TableCell>
                          <TableCell className="text-right text-sm text-red-600">-{brl(n(b.descontoSinal))}</TableCell>
                          <TableCell className="text-right text-sm text-amber-600">-{brl(n(b.descontoRetencao))}</TableCell>
                          <TableCell className="text-right text-sm text-red-600">-{brl(n(b.glosa))}</TableCell>
                          <TableCell className="text-right text-sm text-violet-600">-{brl(n(b.deducaoFd))}</TableCell>
                          <TableCell className="text-right text-sm font-bold text-emerald-700">{brl(n(b.valorLiquido))}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => abrirItens(b)} title="Ver/editar itens">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {prox && (
                                <Button variant="ghost" size="sm" className="text-xs text-blue-600 hover:text-blue-700"
                                  onClick={() => avancarStatusMutation.mutate({ id: b.id, status: prox.status as any })}>
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="fd" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">
                  Registros de itens pagos diretamente pelo cliente que serão deduzidos nas medições.
                  {n(contrato.valorMinimoFd) > 0 && (
                    <span className="ml-2 text-amber-600 font-medium">Valor mínimo FD: {brl(n(contrato.valorMinimoFd))}</span>
                  )}
                </p>
              </div>
              <Button size="sm" onClick={() => setModalFd(true)} className="gap-2">
                <Plus className="h-4 w-4" />Registrar FD
              </Button>
            </div>

            {(fdRegistros as any[]).length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">Nenhum registro de FD</p>
                <p className="text-sm mt-1">Registre aqui os itens que o cliente pagará diretamente</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>Descrição</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(fdRegistros as any[]).map((fd: any) => (
                      <TableRow key={fd.id}>
                        <TableCell className="font-medium">{fd.descricao}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${fd.origem === "bdi" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-600"}`}>
                            {fd.origem === "bdi" ? "BDI" : "Manual"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{fd.dataRegistro}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${fd.status === "descontado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {fd.status === "descontado" ? "Descontado" : "Pendente"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{brl(n(fd.valor))}</TableCell>
                        <TableCell>
                          {fd.status === "pendente" && (
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600"
                              onClick={() => { if (confirm("Excluir este registro?")) excluirFdMutation.mutate({ id: fd.id }); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="p-3 border-t bg-gray-50 text-right text-sm">
                  <span className="text-gray-500 mr-3">Total FD Pendente:</span>
                  <span className="font-bold text-violet-700">
                    {brl((fdRegistros as any[]).filter((f: any) => f.status === "pendente").reduce((acc: number, f: any) => acc + n(f.valor), 0))}
                  </span>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={modalBoletim} onOpenChange={setModalBoletim}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo Boletim de Medição</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Período de Referência *</Label>
              <Input
                type="month"
                value={formBoletim.periodoReferencia}
                onChange={e => setFormBoletim(f => ({ ...f, periodoReferencia: e.target.value }))}
              />
              <p className="text-xs text-gray-400 mt-1">Mês e ano desta medição</p>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações desta medição..."
                value={formBoletim.observacoes}
                onChange={e => setFormBoletim(f => ({ ...f, observacoes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalBoletim(false)}>Cancelar</Button>
              <Button
                disabled={!formBoletim.periodoReferencia || criarBoletimMutation.isPending}
                onClick={() => criarBoletimMutation.mutate({
                  companyId,
                  contratoId,
                  periodoReferencia: formBoletim.periodoReferencia,
                  observacoes: formBoletim.observacoes || null,
                })}
              >
                {criarBoletimMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Criar e Lançar Itens
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modalFd} onOpenChange={setModalFd}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Registrar Faturamento Direto</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Descrição do Item *</Label>
              <Input
                placeholder="Ex: Elevadores — fornecimento direto"
                value={formFd.descricao}
                onChange={e => setFormFd(f => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor (R$) *</Label>
                <Input
                  placeholder="0,00"
                  value={formFd.valor}
                  onChange={e => setFormFd(f => ({ ...f, valor: e.target.value }))}
                />
                {n(formFd.valor) > 0 && n(contrato.valorMinimoFd) > 0 && n(formFd.valor) < n(contrato.valorMinimoFd) && (
                  <p className="text-xs text-red-500 mt-1">Abaixo do mínimo FD ({brl(n(contrato.valorMinimoFd))})</p>
                )}
              </div>
              <div>
                <Label>Data de Registro *</Label>
                <Input
                  type="date"
                  value={formFd.dataRegistro}
                  onChange={e => setFormFd(f => ({ ...f, dataRegistro: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={formFd.origem} onValueChange={v => setFormFd(f => ({ ...f, origem: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="bdi">BDI do Orçamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Input
                placeholder="Observações..."
                value={formFd.observacoes}
                onChange={e => setFormFd(f => ({ ...f, observacoes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalFd(false)}>Cancelar</Button>
              <Button
                disabled={!formFd.descricao || !formFd.valor || !formFd.dataRegistro || criarFdMutation.isPending}
                onClick={() => criarFdMutation.mutate({
                  companyId,
                  contratoId,
                  descricao: formFd.descricao,
                  valor: formFd.valor,
                  dataRegistro: formFd.dataRegistro,
                  origem: formFd.origem as "bdi" | "manual",
                  observacoes: formFd.observacoes || null,
                })}
              >
                {criarFdMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Registrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modalItens} onOpenChange={open => { setModalItens(open); if (!open) setItensEdicao([]); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Itens do Boletim {boletimSelecionado ? String(boletimSelecionado.numero).padStart(2, "0") : ""} — {boletimSelecionado?.periodoReferencia}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {itensEdicao.length === 0 && boletimDetalhe && (
              <div>
                {(boletimDetalhe.itens?.length ?? 0) === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500 mb-3">Nenhum item lançado ainda.</p>
                    <Button variant="outline" size="sm" onClick={() => { popularItensDoOrcamento(); }}>
                      Importar itens do Orçamento
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 text-xs">
                          <TableHead className="w-20">EAP</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right w-28">Valor Contratual</TableHead>
                          <TableHead className="text-right w-24">% Ant.</TableHead>
                          <TableHead className="text-right w-24">% Período</TableHead>
                          <TableHead className="text-right w-24">% Acum.</TableHead>
                          <TableHead className="text-right w-28">Valor Período</TableHead>
                          <TableHead className="w-16 text-center">FD</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {boletimDetalhe.itens.map((item: any) => (
                          <TableRow key={item.id} className={item.isFd ? "bg-violet-50" : ""}>
                            <TableCell className="font-mono text-xs">{item.eapCodigo}</TableCell>
                            <TableCell className="text-sm">{item.descricao}</TableCell>
                            <TableCell className="text-right text-sm">{brl(n(item.valorContratual))}</TableCell>
                            <TableCell className="text-right text-sm">{pct(n(item.percentualAcumuladoAnterior))}</TableCell>
                            <TableCell className="text-right text-sm font-medium text-blue-700">{pct(n(item.percentualPeriodo))}</TableCell>
                            <TableCell className="text-right text-sm">{pct(n(item.percentualAcumuladoAtual))}</TableCell>
                            <TableCell className="text-right text-sm font-semibold">{brl(n(item.valorPeriodo))}</TableCell>
                            <TableCell className="text-center text-xs">
                              {item.isFd ? <span className="text-violet-600 font-medium">FD</span> : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="p-3 border-t bg-gray-50 flex justify-between text-sm">
                      <div className="space-x-4">
                        <span className="text-gray-500">Bruto: <strong className="text-gray-900">{brl(n(boletimSelecionado?.valorBruto))}</strong></span>
                        <span className="text-violet-600">FD: <strong>-{brl(n(boletimSelecionado?.deducaoFd))}</strong></span>
                      </div>
                      <span className="font-bold text-emerald-700">Líquido: {brl(n(boletimSelecionado?.valorLiquido))}</span>
                    </div>
                  </div>
                )}
                {(boletimDetalhe.itens?.length ?? 0) > 0 && boletimSelecionado?.status === "rascunho" && (
                  <div className="flex justify-end mt-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      const mapped = boletimDetalhe.itens.map((i: any) => ({ ...i }));
                      setItensEdicao(mapped);
                    }}>Editar Itens</Button>
                  </div>
                )}
              </div>
            )}

            {itensEdicao.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">{itensEdicao.length} itens — edite os percentuais do período</p>
                  <Button variant="outline" size="sm" onClick={popularItensDoOrcamento}>Reimportar do Orçamento</Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 text-xs sticky top-0 z-10">
                        <TableHead className="w-20">EAP</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right w-28">V. Contratual</TableHead>
                        <TableHead className="text-center w-24">% Ant.</TableHead>
                        <TableHead className="text-center w-28">% Período *</TableHead>
                        <TableHead className="text-center w-24">% Acum.</TableHead>
                        <TableHead className="text-right w-28">V. Período</TableHead>
                        <TableHead className="text-center w-16">FD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensEdicao.map((item, idx) => (
                        <TableRow key={idx} className={item.isFd ? "bg-violet-50" : ""}>
                          <TableCell className="font-mono text-xs">{item.eapCodigo}</TableCell>
                          <TableCell className="text-xs truncate max-w-[200px]" title={item.descricao}>{item.descricao}</TableCell>
                          <TableCell className="text-right text-xs">{brl(n(item.valorContratual))}</TableCell>
                          <TableCell className="text-center text-xs">{pct(n(item.percentualAcumuladoAnterior))}</TableCell>
                          <TableCell>
                            <Input
                              className="h-7 text-xs text-center"
                              value={item.percentualPeriodo}
                              onChange={e => {
                                const updated = calcularItem(item, "percentualPeriodo", e.target.value);
                                setItensEdicao(prev => prev.map((it, i) => i === idx ? updated : it));
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-center text-xs font-medium">{pct(n(item.percentualAcumuladoAtual))}</TableCell>
                          <TableCell className="text-right text-xs font-semibold">{brl(n(item.valorPeriodo))}</TableCell>
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              checked={item.isFd}
                              onChange={e => setItensEdicao(prev => prev.map((it, i) => i === idx ? { ...it, isFd: e.target.checked } : it))}
                              className="h-3.5 w-3.5 accent-violet-600"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-between items-center border-t pt-3">
                  <div className="text-sm space-x-4">
                    <span className="text-gray-500">Bruto (não-FD): <strong>{brl(totalBruto)}</strong></span>
                    <span className="text-violet-600">FD: <strong>-{brl(totalFdEdicao)}</strong></span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setItensEdicao([])}>Cancelar</Button>
                    <Button
                      onClick={() => {
                        if (!boletimSelecionado) return;
                        salvarItensMutation.mutate({
                          boletimId: boletimSelecionado.id,
                          itens: itensEdicao.map(i => ({
                            atividadeId: i.atividadeId ?? null,
                            eapCodigo: i.eapCodigo ?? null,
                            descricao: i.descricao,
                            valorContratual: String(i.valorContratual),
                            percentualAcumuladoAnterior: String(i.percentualAcumuladoAnterior),
                            percentualPeriodo: String(i.percentualPeriodo),
                            percentualAcumuladoAtual: String(i.percentualAcumuladoAtual),
                            valorPeriodo: String(i.valorPeriodo),
                            tipoAvanco: i.tipoAvanco ?? "fisico",
                            isFd: i.isFd ?? false,
                          })),
                        });
                        recalcularMutation.mutate({ boletimId: boletimSelecionado.id });
                      }}
                      disabled={salvarItensMutation.isPending}
                    >
                      {salvarItensMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Salvar e Calcular Deduções
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editandoContrato} onOpenChange={setEditandoContrato}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Configurações do Contrato</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Critério de Medição</Label>
                <Select value={formContrato.criterio} onValueChange={v => setFormContrato((f: any) => ({ ...f, criterio: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="avanco_fisico">Avanço Físico</SelectItem>
                    <SelectItem value="parcela_fixa">Parcela Fixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formContrato.status} onValueChange={v => setFormContrato((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="encerrado">Encerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor Total do Contrato (R$)</Label>
                <Input value={formContrato.valorTotalContrato ?? ""} onChange={e => setFormContrato((f: any) => ({ ...f, valorTotalContrato: e.target.value }))} />
              </div>
              <div>
                <Label>Valor Sinal Recebido (R$)</Label>
                <Input value={formContrato.valorSinalRecebido ?? ""} onChange={e => setFormContrato((f: any) => ({ ...f, valorSinalRecebido: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>% Desconto de Sinal</Label>
                <Input value={formContrato.percentualSinal ?? ""} onChange={e => setFormContrato((f: any) => ({ ...f, percentualSinal: e.target.value }))} />
              </div>
              <div>
                <Label>% Retenção de Garantia</Label>
                <Input value={formContrato.percentualRetencao ?? ""} onChange={e => setFormContrato((f: any) => ({ ...f, percentualRetencao: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Valor Mínimo FD (R$)</Label>
              <Input value={formContrato.valorMinimoFd ?? ""} onChange={e => setFormContrato((f: any) => ({ ...f, valorMinimoFd: e.target.value }))} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={formContrato.observacoes ?? ""} onChange={e => setFormContrato((f: any) => ({ ...f, observacoes: e.target.value }))} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditandoContrato(false)}>Cancelar</Button>
              <Button
                disabled={atualizarContratoMutation.isPending}
                onClick={() => atualizarContratoMutation.mutate({ id: contratoId, ...formContrato })}
              >
                {atualizarContratoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
