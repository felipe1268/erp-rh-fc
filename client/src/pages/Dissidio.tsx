import { useState, useMemo } from "react";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { TrendingUp, Plus, Play, CheckCircle2, AlertTriangle, Users, DollarSign, Calendar, FileText, Loader2, Eye, Pencil } from "lucide-react";
import { fmtNum } from "@/lib/formatters";

type ViewMode = "lista" | "detalhes" | "simular" | "aplicar";

export default function Dissidio() {
  const { selectedCompany, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = selectedCompany ? parseInt(selectedCompany) : 0;
  const companyIds = getCompanyIdsForQuery();
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCriarDialog, setShowCriarDialog] = useState(false);
  const [form, setForm] = useState({
    anoReferencia: new Date().getFullYear(),
    titulo: "",
    mesDataBase: 5,
    percentualReajuste: "",
    pisoSalarial: "",
    dataBaseInicio: "",
    dataBaseFim: "",
    sindicato: "",
    numeroCct: "",
    percentualInpc: "",
    percentualGanhoReal: "",
    pisoSalarialAnterior: "",
    valorVA: "",
    valorVT: "",
    valorSeguroVida: "",
    contribuicaoAssistencial: "",
    retroativo: 1,
    dataRetroativoInicio: "",
    observacoes: "",
  });

  const utils = trpc.useUtils();
  const dissidiosQuery = trpc.dissidio.listar.useQuery({ companyId, companyIds }, { enabled: !!companyId });
  const detalhesQuery = trpc.dissidio.buscarPorId.useQuery(
    { id: selectedId || 0 },
    { enabled: !!selectedId && (viewMode === "detalhes" || viewMode === "aplicar") }
  );
  const simularQuery = trpc.dissidio.simular.useQuery(
    { dissidioId: selectedId || 0, companyId },
    { enabled: !!selectedId && (viewMode === "simular" || viewMode === "aplicar") }
  );

  const criarMut = trpc.dissidio.criar.useMutation({
    onSuccess: () => { toast.success("Dissídio criado!"); utils.dissidio.listar.invalidate(); setShowCriarDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMut = trpc.dissidio.atualizar.useMutation({
    onSuccess: () => { toast.success("Dissídio atualizado!"); utils.dissidio.buscarPorId.invalidate(); utils.dissidio.listar.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const aplicarMut = trpc.dissidio.aplicar.useMutation({
    onSuccess: (data) => { toast.success(`Dissídio aplicado a ${data.aplicados} funcionários!`); utils.dissidio.buscarPorId.invalidate(); utils.dissidio.listar.invalidate(); setViewMode("detalhes"); },
    onError: (e) => toast.error(e.message),
  });

  const dissidios = dissidiosQuery.data || [];
  const detalhes = detalhesQuery.data;
  const simulacao = simularQuery.data;

  const meses = [
    { value: 1, label: "Janeiro" }, { value: 2, label: "Fevereiro" }, { value: 3, label: "Março" },
    { value: 4, label: "Abril" }, { value: 5, label: "Maio" }, { value: 6, label: "Junho" },
    { value: 7, label: "Julho" }, { value: 8, label: "Agosto" }, { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" }, { value: 11, label: "Novembro" }, { value: 12, label: "Dezembro" },
  ];
  const mesNome = (n: number) => meses.find(m => m.value === n)?.label || String(n);

  const handleCriar = () => {
    if (!form.percentualReajuste || !form.dataBaseInicio || !form.titulo) return toast.error("Preencha título, percentual e data-base");
    criarMut.mutate({ companyId, companyIds, anoReferencia: form.anoReferencia,
      titulo: form.titulo,
      mesDataBase: form.mesDataBase,
      percentualReajuste: form.percentualReajuste,
      pisoSalarial: form.pisoSalarial || undefined,
      pisoSalarialAnterior: form.pisoSalarialAnterior || undefined,
      dataBaseInicio: form.dataBaseInicio,
      dataBaseFim: form.dataBaseFim || form.dataBaseInicio,
      sindicato: form.sindicato || undefined,
      numeroCct: form.numeroCct || undefined,
      percentualInpc: form.percentualInpc || undefined,
      percentualGanhoReal: form.percentualGanhoReal || undefined,
      valorVA: form.valorVA || undefined,
      valorVT: form.valorVT || undefined,
      valorSeguroVida: form.valorSeguroVida || undefined,
      contribuicaoAssistencial: form.contribuicaoAssistencial || undefined,
      retroativo: form.retroativo,
      dataRetroativoInicio: form.dataRetroativoInicio || undefined,
      observacoes: form.observacoes || undefined,
    });
  };

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);

  const abrirDetalhes = (d: any) => {
    setSelectedId(d.id);
    setViewMode("detalhes");
    setEditMode(false);
  };

  // ===== LISTA DE DISSÍDIOS POR ANO =====
  if (viewMode === "lista") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="w-6 h-6 text-primary" /> Dissídio Coletivo</h2>
            <p className="text-sm text-muted-foreground mt-1">Gestão de reajustes salariais por ano — CLT Art. 611-A / MTE</p>
          </div>
          <DraggableCommandBar barId="dissidio" items={[
            { id: "novo", node: <Button onClick={() => { setForm({ ...form, anoReferencia: new Date().getFullYear(), titulo: `Dissídio ${new Date().getFullYear()}` }); setShowCriarDialog(true); }}><Plus className="w-4 h-4 mr-2" /> Novo Dissídio</Button> },
          ]} />
        </div>

        {/* Critérios CLT/MTE */}
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Fundamentação Legal — Dissídio Coletivo</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1 text-muted-foreground">
            <p><strong>CLT Art. 611-A:</strong> A convenção coletiva e o acordo coletivo de trabalho têm prevalência sobre a lei quando dispuserem sobre remuneração, jornada, banco de horas, entre outros.</p>
            <p><strong>CLT Art. 614 §1º:</strong> As Convenções e os Acordos entrarão em vigor 3 dias após a data de entrega dos mesmos no órgão competente.</p>
            <p><strong>CLT Art. 616:</strong> Os Sindicatos representativos de categorias econômicas ou profissionais e as empresas, inclusive as que não tenham representação sindical, quando provocados, não podem recusar-se à negociação coletiva.</p>
            <p><strong>MTE — Data-base:</strong> A data-base é o mês em que o sindicato negocia o reajuste salarial da categoria. Geralmente definida na convenção coletiva anterior.</p>
            <p><strong>Piso Salarial:</strong> Valor mínimo que deve ser pago à categoria, definido na convenção coletiva. Nenhum funcionário da categoria pode receber abaixo do piso.</p>
            <p><strong>INPC:</strong> Índice Nacional de Preços ao Consumidor — base para reposição inflacionária. Ganho real = percentual acima do INPC.</p>
          </CardContent>
        </Card>

        {dissidios.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum dissídio cadastrado</p>
              <p className="text-xs mt-1">Clique em "Novo Dissídio" para registrar o reajuste do ano</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dissidios.map((d: any) => (
              <Card key={d.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => abrirDetalhes(d)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{d.anoReferencia}</CardTitle>
                    <Badge variant={d.status === 'aplicado' ? 'default' : d.status === 'pendente' ? 'secondary' : 'outline'}>
                      {d.status === 'aplicado' ? 'Aplicado' : d.status === 'pendente' ? 'Pendente' : d.status === 'parcial' ? 'Parcial' : 'Rascunho'}
                    </Badge>
                  </div>
                  <CardDescription>{d.titulo} | Data-base: {mesNome(d.mesDataBase)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Reajuste</span>
                      <p className="font-bold text-primary text-lg">{d.percentualReajuste}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Piso Salarial</span>
                      <p className="font-semibold">{d.pisoSalarial ? `R$ ${Number(d.pisoSalarial).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Sindicato</span>
                      <p className="text-xs truncate">{d.sindicato || '—'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Vigência</span>
                      <p className="text-xs">{d.dataBaseInicio ? new Date(d.dataBaseInicio + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Dialog Criar */}
        <Dialog open={showCriarDialog} onOpenChange={setShowCriarDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo Dissídio Coletivo</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>Ano Referência</Label>
                  <Input type="number" value={form.anoReferencia} onChange={e => setForm(p => ({ ...p, anoReferencia: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Título</Label>
                  <Input placeholder="Ex: Dissídio 2026" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} />
                </div>
                <div>
                  <Label>Mês Data-base</Label>
                  <Select value={String(form.mesDataBase)} onValueChange={v => setForm(p => ({ ...p, mesDataBase: Number(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {meses.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>Reajuste Total (%)</Label>
                  <Input type="number" step="0.01" placeholder="Ex: 5.50" value={form.percentualReajuste} onChange={e => setForm(p => ({ ...p, percentualReajuste: e.target.value }))} />
                </div>
                <div>
                  <Label>INPC (%)</Label>
                  <Input type="number" step="0.01" placeholder="Ex: 4.20" value={form.percentualInpc} onChange={e => setForm(p => ({ ...p, percentualInpc: e.target.value }))} />
                </div>
                <div>
                  <Label>Ganho Real (%)</Label>
                  <Input type="number" step="0.01" placeholder="Ex: 1.30" value={form.percentualGanhoReal} onChange={e => setForm(p => ({ ...p, percentualGanhoReal: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Piso Salarial Anterior (R$)</Label>
                  <Input type="number" step="0.01" placeholder="Ex: 1700.00" value={form.pisoSalarialAnterior} onChange={e => setForm(p => ({ ...p, pisoSalarialAnterior: e.target.value }))} />
                </div>
                <div>
                  <Label>Piso Salarial Novo (R$)</Label>
                  <Input type="number" step="0.01" placeholder="Ex: 1800.00" value={form.pisoSalarial} onChange={e => setForm(p => ({ ...p, pisoSalarial: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vigência Início</Label>
                  <Input type="date" value={form.dataBaseInicio} onChange={e => setForm(p => ({ ...p, dataBaseInicio: e.target.value }))} />
                </div>
                <div>
                  <Label>Vigência Fim</Label>
                  <Input type="date" value={form.dataBaseFim} onChange={e => setForm(p => ({ ...p, dataBaseFim: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Sindicato</Label>
                  <Input placeholder="Nome do sindicato" value={form.sindicato} onChange={e => setForm(p => ({ ...p, sindicato: e.target.value }))} />
                </div>
                <div>
                  <Label>Nº CCT</Label>
                  <Input placeholder="Número da convenção" value={form.numeroCct} onChange={e => setForm(p => ({ ...p, numeroCct: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>Valor VA (R$)</Label>
                  <Input type="number" step="0.01" value={form.valorVA} onChange={e => setForm(p => ({ ...p, valorVA: e.target.value }))} />
                </div>
                <div>
                  <Label>Valor VT (R$)</Label>
                  <Input type="number" step="0.01" value={form.valorVT} onChange={e => setForm(p => ({ ...p, valorVT: e.target.value }))} />
                </div>
                <div>
                  <Label>Seguro Vida (R$)</Label>
                  <Input type="number" step="0.01" value={form.valorSeguroVida} onChange={e => setForm(p => ({ ...p, valorSeguroVida: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Contribuição Assistencial (R$)</Label>
                  <Input type="number" step="0.01" value={form.contribuicaoAssistencial} onChange={e => setForm(p => ({ ...p, contribuicaoAssistencial: e.target.value }))} />
                </div>
                <div>
                  <Label>Data Início Retroativo</Label>
                  <Input type="date" value={form.dataRetroativoInicio} onChange={e => setForm(p => ({ ...p, dataRetroativoInicio: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea placeholder="Observações sobre a convenção coletiva..." value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCriarDialog(false)}>Cancelar</Button>
              <Button onClick={handleCriar} disabled={criarMut.isPending}>
                {criarMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Criar Dissídio
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ===== DETALHES DO DISSÍDIO =====
  if (viewMode === "detalhes" && detalhes) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => { setViewMode("lista"); setSelectedId(null); }} className="mb-2">← Voltar</Button>
            <h2 className="text-2xl font-bold">{detalhes.titulo || `Dissídio ${detalhes.anoReferencia}`}</h2>
            <p className="text-sm text-muted-foreground">Data-base: {mesNome(detalhes.mesDataBase)} | Sindicato: {detalhes.sindicato || '—'} | CCT: {detalhes.numeroCct || '—'}</p>
          </div>
          <div className="flex gap-2">
            {detalhes.status !== 'aplicado' && (
              <>
                <Button variant="outline" onClick={() => { setEditMode(!editMode); setEditForm({ ...detalhes }); }}>
                  <Pencil className="w-4 h-4 mr-2" /> Editar
                </Button>
                <Button variant="outline" onClick={() => setViewMode("simular")}>
                  <Eye className="w-4 h-4 mr-2" /> Simular
                </Button>
                <Button onClick={() => setViewMode("aplicar")}>
                  <Play className="w-4 h-4 mr-2" /> Aplicar Dissídio
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Edit form */}
        {editMode && editForm && (
          <Card className="border-primary">
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs">Reajuste (%)</Label>
                  <Input type="number" step="0.01" value={editForm.percentualReajuste} onChange={e => setEditForm((p: any) => ({ ...p, percentualReajuste: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Piso Salarial</Label>
                  <Input type="number" step="0.01" value={editForm.pisoSalarial || ""} onChange={e => setEditForm((p: any) => ({ ...p, pisoSalarial: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Sindicato</Label>
                  <Input value={editForm.sindicato || ""} onChange={e => setEditForm((p: any) => ({ ...p, sindicato: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Nº CCT</Label>
                  <Input value={editForm.numeroCct || ""} onChange={e => setEditForm((p: any) => ({ ...p, numeroCct: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => {
                  atualizarMut.mutate({ id: editForm.id, percentualReajuste: editForm.percentualReajuste, pisoSalarial: editForm.pisoSalarial, sindicato: editForm.sindicato, numeroCct: editForm.numeroCct });
                  setEditMode(false);
                }}>Salvar</Button>
                <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">{detalhes.percentualReajuste}%</p>
              <p className="text-xs text-muted-foreground">Reajuste Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-600" />
              <p className="text-2xl font-bold">{detalhes.pisoSalarial ? `R$ ${Number(detalhes.pisoSalarial).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</p>
              <p className="text-xs text-muted-foreground">Piso Salarial</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-blue-600" />
              <p className="text-2xl font-bold">{fmtNum(detalhes.funcionarios?.length || 0)}</p>
              <p className="text-xs text-muted-foreground">Funcionários Aplicados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-orange-600" />
              <p className="text-2xl font-bold">{detalhes.dataBaseInicio ? new Date(detalhes.dataBaseInicio + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</p>
              <p className="text-xs text-muted-foreground">Vigência Início</p>
            </CardContent>
          </Card>
        </div>

        {/* INPC / Ganho Real */}
        {(detalhes.percentualInpc || detalhes.percentualGanhoReal) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <Card><CardContent className="pt-4 text-center"><p className="text-lg font-bold">{detalhes.percentualInpc || '—'}%</p><p className="text-xs text-muted-foreground">INPC</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-lg font-bold">{detalhes.percentualGanhoReal || '—'}%</p><p className="text-xs text-muted-foreground">Ganho Real</p></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><p className="text-lg font-bold">{detalhes.retroativo ? 'Sim' : 'Não'}</p><p className="text-xs text-muted-foreground">Retroativo</p></CardContent></Card>
          </div>
        )}

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <Badge variant={detalhes.status === 'aplicado' ? 'default' : 'secondary'} className="text-sm px-3 py-1">
            {detalhes.status === 'aplicado' ? <><CheckCircle2 className="w-4 h-4 mr-1" /> Aplicado</> : <><AlertTriangle className="w-4 h-4 mr-1" /> {detalhes.status}</>}
          </Badge>
          {detalhes.dataAplicacao && (
            <span className="text-xs text-muted-foreground">Aplicado em: {new Date(detalhes.dataAplicacao).toLocaleDateString('pt-BR')}</span>
          )}
        </div>

        {/* Observações */}
        {detalhes.observacoes && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-medium mb-1">Observações</p>
              <p className="text-sm text-muted-foreground">{detalhes.observacoes}</p>
            </CardContent>
          </Card>
        )}

        {/* Funcionários aplicados */}
        {detalhes.funcionarios && detalhes.funcionarios.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Funcionários com Dissídio Aplicado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 px-2">Funcionário</th>
                      <th className="py-2 px-2 text-right">Salário Anterior</th>
                      <th className="py-2 px-2 text-right">Salário Novo</th>
                      <th className="py-2 px-2 text-right">Diferença</th>
                      <th className="py-2 px-2 text-right">Retroativo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhes.funcionarios.map((f: any) => (
                      <tr key={f.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2 font-medium">ID {f.employeeId}</td>
                        <td className="py-2 px-2 text-right">R$ {Number(f.salarioAnterior).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 px-2 text-right font-semibold text-green-600">R$ {Number(f.salarioNovo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 px-2 text-right text-primary">+R$ {(Number(f.salarioNovo) - Number(f.salarioAnterior)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 px-2 text-right">{f.valorRetroativo ? `R$ ${Number(f.valorRetroativo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ===== SIMULAÇÃO =====
  if (viewMode === "simular" && simulacao) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setViewMode("detalhes")} className="mb-2">← Voltar</Button>
            <h2 className="text-2xl font-bold">Simulação do Dissídio {simulacao.dissidio.anoReferencia}</h2>
            <p className="text-sm text-muted-foreground">Reajuste de {simulacao.dissidio.percentualReajuste}% — Prévia antes de aplicar</p>
          </div>
          <Button onClick={() => setViewMode("aplicar")}>
            <Play className="w-4 h-4 mr-2" /> Prosseguir para Aplicação
          </Button>
        </div>

        {/* Resumo da simulação */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-blue-200">
            <CardContent className="pt-4 text-center">
              <p className="text-3xl font-bold text-blue-600">{fmtNum(simulacao.resumo.totalFuncionarios)}</p>
              <p className="text-xs text-muted-foreground">Funcionários Elegíveis</p>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-green-600">R$ {Number(simulacao.resumo.totalDiferencaMensal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground">Impacto Mensal</p>
            </CardContent>
          </Card>
          <Card className="border-orange-200">
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-orange-600">R$ {Number(simulacao.resumo.totalRetroativo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground">Total Retroativo</p>
            </CardContent>
          </Card>
          <Card className="border-red-200">
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-red-600">R$ {Number(simulacao.resumo.custoTotalEstimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground">Custo Total Estimado</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabela de simulação */}
        <Card>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 px-2">Funcionário</th>
                    <th className="py-2 px-2">Função</th>
                    <th className="py-2 px-2 text-right">Salário Atual</th>
                    <th className="py-2 px-2 text-right">Salário Novo</th>
                    <th className="py-2 px-2 text-right">Diferença</th>
                    <th className="py-2 px-2 text-right">Retroativo</th>
                  </tr>
                </thead>
                <tbody>
                  {simulacao.simulacao.map((f: any) => (
                    <tr key={f.employeeId} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-2 font-medium">{f.nome}</td>
                      <td className="py-2 px-2 text-muted-foreground">{f.funcao || '—'}</td>
                      <td className="py-2 px-2 text-right">R$ {Number(f.salarioAtual).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-2 text-right font-semibold text-green-600">R$ {Number(f.salarioNovo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-2 text-right text-primary">+R$ {Number(f.diferenca).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-2 text-right">{Number(f.valorRetroativo) > 0 ? `R$ ${Number(f.valorRetroativo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== APLICAR DISSÍDIO =====
  if (viewMode === "aplicar" && selectedId) {
    return <AplicarDissidioView dissidioId={selectedId} companyId={companyId} onVoltar={() => setViewMode("detalhes")} onAplicado={() => { utils.dissidio.buscarPorId.invalidate(); utils.dissidio.listar.invalidate(); setViewMode("detalhes"); }} />;
  }

  // Loading
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function AplicarDissidioView({ dissidioId, companyId, onVoltar, onAplicado }: { dissidioId: number; companyId: number; onVoltar: () => void; onAplicado: () => void }) {
  const simularQuery = trpc.dissidio.simular.useQuery({ dissidioId, companyId });
  const aplicarMut = trpc.dissidio.aplicar.useMutation({
    onSuccess: (data) => { toast.success(`Dissídio aplicado com sucesso a ${data.aplicados} funcionários!`); onAplicado(); },
    onError: (e) => toast.error(e.message),
  });

  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());
  const simulacao = simularQuery.data;

  const toggleExclude = (id: number) => {
    const next = new Set(excludedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExcludedIds(next);
  };

  if (!simulacao) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  const selectedCount = simulacao.simulacao.length - excludedIds.size;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={onVoltar} className="mb-2">← Voltar</Button>
          <h2 className="text-2xl font-bold">Aplicar Dissídio {simulacao.dissidio.anoReferencia}</h2>
          <p className="text-sm text-muted-foreground">Reajuste de {simulacao.dissidio.percentualReajuste}% — Desmarque funcionários que não devem receber</p>
        </div>
        <Button
          onClick={() => aplicarMut.mutate({ dissidioId, companyId, funcionariosExcluidos: Array.from(excludedIds) })}
          disabled={selectedCount === 0 || aplicarMut.isPending}
          className="bg-green-600 hover:bg-green-700"
        >
          {aplicarMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Aplicar a {selectedCount} funcionário(s)
        </Button>
      </div>

      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="pt-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Atenção: esta ação é irreversível</p>
            <p className="text-xs text-muted-foreground">Os salários dos funcionários selecionados serão atualizados permanentemente. O histórico será mantido na tabela de dissídio.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 px-2 w-10">Incluir</th>
                  <th className="py-2 px-2">Funcionário</th>
                  <th className="py-2 px-2">Função</th>
                  <th className="py-2 px-2 text-right">Salário Atual</th>
                  <th className="py-2 px-2 text-right">Salário Novo</th>
                  <th className="py-2 px-2 text-right">Diferença</th>
                  <th className="py-2 px-2 text-right">Retroativo</th>
                </tr>
              </thead>
              <tbody>
                {simulacao.simulacao.map((f: any) => {
                  const excluded = excludedIds.has(f.employeeId);
                  return (
                    <tr key={f.employeeId} className={`border-b hover:bg-muted/50 ${excluded ? 'opacity-40' : ''}`}>
                      <td className="py-2 px-2">
                        <Checkbox checked={!excluded} onCheckedChange={() => toggleExclude(f.employeeId)} />
                      </td>
                      <td className="py-2 px-2 font-medium">{f.nome}</td>
                      <td className="py-2 px-2 text-muted-foreground">{f.funcao || '—'}</td>
                      <td className="py-2 px-2 text-right">R$ {Number(f.salarioAtual).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-2 text-right font-semibold text-green-600">R$ {Number(f.salarioNovo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-2 text-right text-primary">+R$ {Number(f.diferenca).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-2 text-right">{Number(f.valorRetroativo) > 0 ? `R$ ${Number(f.valorRetroativo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
