import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, UtensilsCrossed, Coffee, MapPin, Save, X, Info } from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";

interface Props {
  companyId: number;
}

function parseBRL(val: string | number | null | undefined): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const str = val.toString().trim();
  if (str.includes(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(str) || 0;
}

function formatBRL(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BeneficiosAlimentacaoTab({ companyId }: Props) {
  const utils = trpc.useUtils();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    nome: '',
    obraId: null as number | null,
    cafeManhaDia: '0,00',
    lancheTardeDia: '0,00',
    valeAlimentacaoMes: '0,00',
    jantaDia: '0,00',
    diasUteisRef: 22,
    observacoes: '',
    vigenciaInicio: '',
    vigenciaFim: '',
  });

  function formatDateBR(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = String(iso).slice(0, 10);
    const [y, m, dd] = d.split('-');
    if (!y || !m || !dd) return '';
    return `${dd}/${m}/${y}`;
  }

  function vigenciaStatus(cfg: any): { label: string; className: string } {
    const hoje = new Date().toISOString().slice(0, 10);
    const inicio = cfg.vigencia_inicio ? String(cfg.vigencia_inicio).slice(0, 10) : null;
    const fim = cfg.vigencia_fim ? String(cfg.vigencia_fim).slice(0, 10) : null;
    if (cfg.ativo !== 1) return { label: 'Inativa', className: 'bg-gray-100 text-gray-500' };
    if (inicio && inicio > hoje) return { label: `Agendada p/ ${formatDateBR(inicio)}`, className: 'bg-blue-50 text-blue-700' };
    if (fim && fim < hoje) return { label: `Encerrada em ${formatDateBR(fim)}`, className: 'bg-gray-100 text-gray-500' };
    return { label: inicio ? `Vigente desde ${formatDateBR(inicio)}` : 'Vigente', className: 'bg-green-50 text-green-700' };
  }

  // Buscar configurações
  const { data: configs, isLoading } = (trpc as any).avisoPrevio.avisoPrevio.listMealBenefitConfigs.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  // Buscar obras para o select
  const { data: obrasData } = (trpc as any).obras?.list?.useQuery?.(
    { companyId },
    { enabled: companyId > 0 }
  ) ?? { data: [] };

  const saveMutation = (trpc as any).avisoPrevio.avisoPrevio.saveMealBenefitConfig.useMutation({
    onSuccess: () => {
      toast.success(editingId ? "Configuração atualizada!" : "Configuração criada!");
      utils.avisoPrevio.avisoPrevio.listMealBenefitConfigs.invalidate();
      setShowDialog(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const deleteMutation = (trpc as any).avisoPrevio.avisoPrevio.deleteMealBenefitConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração removida!");
      utils.avisoPrevio.avisoPrevio.listMealBenefitConfigs.invalidate();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao remover"),
  });

  function resetForm() {
    setEditingId(null);
    setForm({
      nome: '',
      obraId: null,
      cafeManhaDia: '0,00',
      lancheTardeDia: '0,00',
      valeAlimentacaoMes: '0,00',
      jantaDia: '0,00',
      diasUteisRef: 22,
      observacoes: '',
      vigenciaInicio: new Date().toISOString().slice(0, 10),
      vigenciaFim: '',
    });
  }

  function openEdit(cfg: any) {
    setEditingId(cfg.id);
    setForm({
      nome: cfg.nome || '',
      obraId: cfg.obraId || null,
      cafeManhaDia: cfg.cafeManhaDia || '0,00',
      lancheTardeDia: cfg.lancheTardeDia || '0,00',
      valeAlimentacaoMes: cfg.valeAlimentacaoMes || '0,00',
      jantaDia: cfg.jantaDia || '0,00',
      diasUteisRef: cfg.diasUteisRef || 22,
      observacoes: cfg.observacoes || '',
      vigenciaInicio: cfg.vigencia_inicio ? String(cfg.vigencia_inicio).slice(0, 10) : '',
      vigenciaFim: cfg.vigencia_fim ? String(cfg.vigencia_fim).slice(0, 10) : '',
    });
    setShowDialog(true);
  }

  // Existe outra config VIGENTE hoje no mesmo escopo (obra ou "todas")? Ajuda a
  // avisar o usuário quando ele está prestes a criar/editar algo que vai
  // sobrepor ou encerrar outra configuração.
  const conflitoVigencia = useMemo(() => {
    const escopoObraId = form.obraId ?? null;
    return (configs || []).find((c: any) =>
      c.id !== editingId &&
      (c.obraId ?? null) === escopoObraId &&
      vigenciaStatus(c).label.startsWith('Vigente')
    ) || null;
  }, [configs, form.obraId, editingId]);

  function calcularTotais() {
    const cafe = parseBRL(form.cafeManhaDia);
    const lanche = parseBRL(form.lancheTardeDia);
    const va = parseBRL(form.valeAlimentacaoMes);
    const janta = parseBRL(form.jantaDia);
    const dias = form.diasUteisRef || 22;

    const cafeMes = cafe * dias;
    const lancheMes = lanche * dias;
    const jantaMes = janta * dias;
    const totalMes = cafeMes + lancheMes + va + jantaMes;
    const totalVA = cafeMes + lancheMes + va; // sem janta

    return { cafeMes, lancheMes, jantaMes, totalMes, totalVA, cafe, lanche, va, janta };
  }

  function handleSave() {
    if (!form.nome.trim()) {
      toast.error("Informe o nome da configuração");
      return;
    }
    const totais = calcularTotais();
    saveMutation.mutate({
      id: editingId || undefined,
      companyId,
      obraId: form.obraId,
      nome: form.nome,
      cafeManhaDia: form.cafeManhaDia,
      lancheTardeDia: form.lancheTardeDia,
      valeAlimentacaoMes: form.valeAlimentacaoMes,
      jantaDia: form.jantaDia,
      totalVA_iFood: formatBRL(totais.totalVA),
      diasUteisRef: form.diasUteisRef,
      observacoes: form.observacoes,
      vigenciaInicio: form.vigenciaInicio || undefined,
      vigenciaFim: form.vigenciaFim || undefined,
      limparVigenciaFim: !!editingId && !form.vigenciaFim,
    });
  }

  const configsList = (configs || []) as any[];
  const totais = calcularTotais();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <UtensilsCrossed className="w-5 h-5 text-orange-600" />
                Benefícios de Alimentação por Obra
              </CardTitle>
              <CardDescription>
                Configure os valores de café da manhã, lanche, vale alimentação e jantar por obra/localidade.
                Esses valores são usados no cálculo de rescisão.
              </CardDescription>
            </div>
            <Button
              onClick={() => { resetForm(); setShowDialog(true); }}
              className="gap-1.5"
              size="sm"
            >
              <Plus className="w-4 h-4" />
              Nova Configuração
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Carregando...</div>
          ) : configsList.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Nenhuma configuração cadastrada</p>
              <p className="text-sm mt-1">Clique em "Nova Configuração" para começar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-2 font-medium">Nome</th>
                    <th className="text-left p-2 font-medium">Obra</th>
                    <th className="text-left p-2 font-medium">Vigência</th>
                    <th className="text-right p-2 font-medium">Café/dia</th>
                    <th className="text-right p-2 font-medium">Lanche/dia</th>
                    <th className="text-right p-2 font-medium">VA/mês</th>
                    <th className="text-right p-2 font-medium">Janta/dia</th>
                    <th className="text-right p-2 font-medium">Total VA</th>
                    <th className="text-center p-2 font-medium">Dias Ref</th>
                    <th className="text-center p-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {configsList.map((cfg: any) => {
                    const cafe = parseBRL(cfg.cafeManhaDia);
                    const lanche = parseBRL(cfg.lancheTardeDia);
                    const va = parseBRL(cfg.valeAlimentacaoMes);
                    const dias = cfg.diasUteisRef || 22;
                    const totalVA = cafe * dias + lanche * dias + va;
                    const vig = vigenciaStatus(cfg);
                    return (
                      <tr key={cfg.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{cfg.nome}</td>
                        <td className="p-2">
                          {cfg.obraId ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                              <MapPin className="w-3 h-3" />
                              {cfg.obraNome || `Obra #${cfg.obraId}`}
                            </span>
                          ) : (
                            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">Padrão (todas)</span>
                          )}
                        </td>
                        <td className="p-2">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded whitespace-nowrap ${vig.className}`}>
                            {vig.label}
                          </span>
                        </td>
                        <td className="p-2 text-right">R$ {cfg.cafeManhaDia}</td>
                        <td className="p-2 text-right">R$ {cfg.lancheTardeDia}</td>
                        <td className="p-2 text-right">R$ {cfg.valeAlimentacaoMes}</td>
                        <td className="p-2 text-right">R$ {cfg.jantaDia}</td>
                        <td className="p-2 text-right font-semibold text-green-700">R$ {formatBRL(totalVA)}</td>
                        <td className="p-2 text-center">{dias}</td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(cfg)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => {
                                if (confirm("Remover esta configuração?")) {
                                  deleteMutation.mutate({ id: cfg.id });
                                }
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Como funciona:</p>
              <ul className="space-y-1 list-disc list-inside text-blue-700">
                <li>A configuração <strong>"Padrão"</strong> (sem obra) é usada quando o funcionário não tem uma obra específica</li>
                <li>Se o funcionário está alocado em uma obra com configuração própria, os valores da obra são usados</li>
                <li>Esses valores são automaticamente incluídos no cálculo de rescisão (VR proporcional aos dias trabalhados)</li>
                <li>O <strong>Total VA</strong> = (Café × dias) + (Lanche × dias) + VA mensal</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog para criar/editar */}
      <FullScreenDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); resetForm(); }}
        title={editingId ? "Editar Configuração" : "Nova Configuração de Benefícios"}
        icon={<UtensilsCrossed className="h-5 w-5 text-white" />}
      >
        <div className="max-w-2xl mx-auto space-y-6 p-4">
          {/* Nome e Obra */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Nome da Configuração *</Label>
              <Input
                value={form.nome}
                onChange={e => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Padrão Empresa"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Obra (opcional)</Label>
              <Select
                value={form.obraId ? String(form.obraId) : "none"}
                onValueChange={v => setForm({ ...form, obraId: v === "none" ? null : Number(v) })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Padrão (todas as obras)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Padrão (todas as obras)</SelectItem>
                  {(obrasData || []).map((obra: any) => (
                    <SelectItem key={obra.id} value={String(obra.id)}>
                      {obra.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Vigência */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Vigência — Início</Label>
              <Input
                type="date"
                value={form.vigenciaInicio}
                onChange={e => setForm({ ...form, vigenciaInicio: e.target.value })}
                className="mt-1"
              />
              <p className="text-xs text-gray-400 mt-0.5">
                {editingId ? "Data a partir da qual esta configuração passa a valer." : "Ao criar, qualquer configuração aberta deste mesmo escopo (obra/padrão) será encerrada automaticamente no dia anterior a esta data."}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Vigência — Fim (opcional)</Label>
              <Input
                type="date"
                value={form.vigenciaFim}
                onChange={e => setForm({ ...form, vigenciaFim: e.target.value })}
                className="mt-1"
              />
              <p className="text-xs text-gray-400 mt-0.5">Deixe em branco para manter em aberto (vale até ser encerrada por uma nova).</p>
            </div>
          </div>

          {conflitoVigencia && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Atenção: já existe uma configuração vigente para este mesmo escopo</p>
                <p>
                  <strong>"{conflitoVigencia.nome}"</strong> está vigente desde {formatDateBR(conflitoVigencia.vigencia_inicio)} para {conflitoVigencia.obraId ? (conflitoVigencia.obraNome || `Obra #${conflitoVigencia.obraId}`) : 'todas as obras (Padrão)'}.
                  {!editingId
                    ? ' Ao criar esta nova configuração, ela será encerrada automaticamente na véspera do início informado acima.'
                    : ' Ajuste as datas de vigência para evitar duas configurações valendo ao mesmo tempo (o cálculo usa a de início mais recente).'}
                </p>
              </div>
            </div>
          )}

          {/* Valores diários */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Coffee className="w-4 h-4 text-orange-600" />
                Valores de Alimentação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">Café da Manhã (R$/dia)</Label>
                  <Input
                    value={form.cafeManhaDia}
                    onChange={e => setForm({ ...form, cafeManhaDia: e.target.value })}
                    placeholder="5,45"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Mensal: R$ {formatBRL(totais.cafeMes)}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Lanche da Tarde (R$/dia)</Label>
                  <Input
                    value={form.lancheTardeDia}
                    onChange={e => setForm({ ...form, lancheTardeDia: e.target.value })}
                    placeholder="4,55"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Mensal: R$ {formatBRL(totais.lancheMes)}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Vale Alimentação (R$/mês)</Label>
                  <Input
                    value={form.valeAlimentacaoMes}
                    onChange={e => setForm({ ...form, valeAlimentacaoMes: e.target.value })}
                    placeholder="460,75"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">iFood Benefícios</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Jantar (R$/dia)</Label>
                  <Input
                    value={form.jantaDia}
                    onChange={e => setForm({ ...form, jantaDia: e.target.value })}
                    placeholder="25,00"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Mensal: R$ {formatBRL(totais.jantaMes)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">Dias Úteis Referência</Label>
                  <Input
                    type="number"
                    value={form.diasUteisRef}
                    onChange={e => setForm({ ...form, diasUteisRef: Number(e.target.value) || 22 })}
                    className="mt-1"
                  />
                </div>
                <div className="flex items-end">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 w-full text-center">
                    <p className="text-xs text-green-600 font-medium">Total VA Mensal (sem janta)</p>
                    <p className="text-xl font-bold text-green-700">R$ {formatBRL(totais.totalVA)}</p>
                  </div>
                </div>
              </div>

              {/* Resumo completo */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                <p className="font-medium text-gray-700 mb-2">Resumo Mensal ({form.diasUteisRef} dias úteis):</p>
                <div className="flex justify-between"><span>Café da Manhã:</span><span>R$ {formatBRL(totais.cafe)}/dia × {form.diasUteisRef} = <strong>R$ {formatBRL(totais.cafeMes)}</strong></span></div>
                <div className="flex justify-between"><span>Lanche da Tarde:</span><span>R$ {formatBRL(totais.lanche)}/dia × {form.diasUteisRef} = <strong>R$ {formatBRL(totais.lancheMes)}</strong></span></div>
                <div className="flex justify-between"><span>Vale Alimentação (iFood):</span><span><strong>R$ {formatBRL(totais.va)}</strong></span></div>
                <div className="flex justify-between"><span>Jantar (se necessário):</span><span>R$ {formatBRL(totais.janta)}/dia × {form.diasUteisRef} = <strong>R$ {formatBRL(totais.jantaMes)}</strong></span></div>
                <div className="border-t pt-1 mt-1 flex justify-between font-bold text-green-700">
                  <span>Total VA (sem janta):</span><span>R$ {formatBRL(totais.totalVA)}</span>
                </div>
                <div className="flex justify-between font-bold text-orange-700">
                  <span>Total Completo (com janta):</span><span>R$ {formatBRL(totais.totalMes)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Observações */}
          <div>
            <Label className="text-sm font-medium">Observações</Label>
            <textarea
              value={form.observacoes}
              onChange={e => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Observações adicionais..."
              className="mt-1 w-full rounded-md border border-gray-200 p-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>
              <X className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-1" />
              {saveMutation.isPending ? "Salvando..." : editingId ? "Atualizar" : "Criar Configuração"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>
    </div>
  );
}
