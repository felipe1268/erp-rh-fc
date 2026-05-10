import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Sliders, Plus, Pencil, Trash2, ArrowUp, ArrowDown,
  Eye, EyeOff, Lock, AlertCircle, ListChecks, Type, AlignLeft, ThumbsUp,
  Loader2, RotateCcw, Crown,
} from "lucide-react";

type Tipo = "nota_0_10" | "texto_curto" | "texto_longo" | "sim_nao_talvez";

const TIPO_LABEL: Record<Tipo, string> = {
  nota_0_10: "Nota 0–10",
  texto_curto: "Texto curto",
  texto_longo: "Texto longo",
  sim_nao_talvez: "Sim / Talvez / Não",
};
const TIPO_ICON: Record<Tipo, any> = {
  nota_0_10: ListChecks,
  texto_curto: Type,
  texto_longo: AlignLeft,
  sim_nao_talvez: ThumbsUp,
};

// 8 perguntas core: chave/tipo/seção são fixos (preserva NPS + paridade Portal × Planejamento).
// Os rótulos default vêm de shared/portalPerguntasCore.ts (mesma fonte usada pelo Portal),
// garantindo que o "texto padrão" exibido aqui case 1:1 com o fallback do Portal — assim a
// detecção de reset (digitar o texto padrão) funciona corretamente.
import { PERGUNTAS_CORE_DEFAULTS } from "../../../shared/portalPerguntasCore";
const PERGUNTAS_CORE: Array<{ chave: string; tipo: Tipo; label: string; secao: string }> =
  PERGUNTAS_CORE_DEFAULTS.map(p => ({ chave: p.chave, tipo: "nota_0_10" as Tipo, label: p.label, secao: p.secao }));

export default function QuestionarioPortalAdmin() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";

  const { data: perguntas = [], isLoading } = trpc.portalExterno.admin.listarPerguntasExtras.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  // Rev. 1597 — Overrides de rótulo das 8 perguntas CORE (Admin Master).
  const { data: labelsCoreOverride = {} } = trpc.portalExterno.admin.listarLabelsCoreOverride.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const salvarLabelCoreMut = trpc.portalExterno.admin.salvarLabelCoreOverride.useMutation({
    onSuccess: () => {
      toast.success("Rótulo da pergunta atualizado.");
      utils.portalExterno.admin.listarLabelsCoreOverride.invalidate();
      setEditandoCore(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const resetarLabelCoreMut = trpc.portalExterno.admin.resetarLabelCoreOverride.useMutation({
    onSuccess: () => {
      toast.success("Rótulo restaurado para o padrão.");
      utils.portalExterno.admin.listarLabelsCoreOverride.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const [editandoCore, setEditandoCore] = useState<{ chave: string; labelOriginal: string; label: string } | null>(null);

  const [editando, setEditando] = useState<any | null>(null);
  const [criando, setCriando] = useState(false);

  const salvarMut = trpc.portalExterno.admin.salvarPerguntaExtra.useMutation({
    onSuccess: () => {
      toast.success("Pergunta salva.");
      utils.portalExterno.admin.listarPerguntasExtras.invalidate();
      setEditando(null); setCriando(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const removerMut = trpc.portalExterno.admin.removerPerguntaExtra.useMutation({
    onSuccess: () => {
      toast.success("Pergunta removida.");
      utils.portalExterno.admin.listarPerguntasExtras.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const reordenarMut = trpc.portalExterno.admin.reordenarPerguntasExtras.useMutation({
    onSuccess: () => utils.portalExterno.admin.listarPerguntasExtras.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const mover = (idx: number, dir: -1 | 1) => {
    const lista = [...(perguntas as any[])];
    const novo = idx + dir;
    if (novo < 0 || novo >= lista.length) return;
    [lista[idx], lista[novo]] = [lista[novo], lista[idx]];
    reordenarMut.mutate({ companyId, ordemIds: lista.map(p => p.id) });
  };

  const remover = (p: any) => {
    if (!confirm(`Remover a pergunta "${p.label}"?\n\nIsso APAGA também todas as respostas históricas atreladas (CASCADE).`)) return;
    removerMut.mutate({ id: p.id, companyId });
  };

  const grupos = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of perguntas as any[]) {
      const sec = p.secaoTitulo || "Personalizadas";
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(p);
    }
    return Array.from(map.entries());
  }, [perguntas]);

  if (!companyId) {
    return (
      <DashboardLayout>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-sm text-yellow-800">
          Selecione uma empresa para configurar o questionário.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-2xl p-6 shadow">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <Sliders className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Editor do Questionário — Portal do Cliente</h1>
              <p className="text-sm text-indigo-100 mt-1">
                Edite as perguntas que o cliente responde no Portal. As 8 perguntas <b>core</b> (NPS, equipe, gestor, empresa, obra, prazo, qualidade e escritório) ficam fixas no <b>tipo</b> e na <b>seção</b> para preservar o histórico do NPS — mas o <b>texto exibido</b> pode ser personalizado pelo Admin Master.
                Você pode adicionar perguntas <b>personalizadas</b> à vontade.
              </p>
            </div>
          </div>
        </div>

        {/* CORE — tipo/seção fixos; rótulo editável pelo Admin Master (Rev. 1597) */}
        <div className="bg-white border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-800">Perguntas core</h2>
            <Badge variant="outline" className="ml-2 text-[10px]">tipo e seção fixos</Badge>
            {isMaster && (
              <Badge className="ml-1 text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1">
                <Crown className="w-3 h-3" /> rótulo editável
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Estas perguntas alimentam o cálculo de NPS e a paridade entre o Portal do Cliente e o módulo Planejamento — por isso o <b>tipo</b> (Nota 0–10) e a <b>seção</b> não podem mudar.
            {isMaster ? " Como Admin Master, você pode personalizar o texto exibido para o cliente." : " Apenas o Admin Master pode personalizar o texto exibido."}
          </p>
          <div className="grid md:grid-cols-2 gap-2">
            {PERGUNTAS_CORE.map((p) => {
              const Icon = TIPO_ICON[p.tipo];
              const override = (labelsCoreOverride as Record<string, string>)[p.chave];
              const labelEfetivo = override || p.label;
              const customizado = !!override && override !== p.label;
              return (
                <div key={p.chave} className="border rounded-lg px-3 py-2 flex items-center gap-2 bg-slate-50/60">
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 truncate" title={labelEfetivo}>{labelEfetivo}</p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <span>{p.secao} · {TIPO_LABEL[p.tipo]}</span>
                      {customizado && <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-300 text-amber-700">personalizado</Badge>}
                    </p>
                  </div>
                  {isMaster && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        title="Editar rótulo (Admin Master)"
                        onClick={() => setEditandoCore({ chave: p.chave, labelOriginal: p.label, label: labelEfetivo })}
                        className="p-1.5 rounded hover:bg-white"
                      >
                        <Pencil className="w-3.5 h-3.5 text-blue-600" />
                      </button>
                      {customizado && (
                        <button
                          title="Restaurar texto padrão"
                          onClick={() => {
                            if (!confirm(`Restaurar o texto padrão da pergunta?\n\nPadrão: "${p.label}"`)) return;
                            resetarLabelCoreMut.mutate({ companyId, chave: p.chave });
                          }}
                          disabled={resetarLabelCoreMut.isPending}
                          className="p-1.5 rounded hover:bg-white"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* EXTRAS */}
        <div className="bg-white border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <ListChecks className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-800">Perguntas personalizadas</h2>
            <Badge className="ml-1 bg-indigo-100 text-indigo-700 hover:bg-indigo-100">{(perguntas as any[]).length}</Badge>
            <div className="ml-auto">
              <Button onClick={() => { setCriando(true); setEditando({
                companyId, secaoTitulo: "Personalizadas", tipo: "nota_0_10",
                label: "", ajuda: "", placeholder: "", obrigatoria: false, ativa: true,
              }); }} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4" /> Nova pergunta
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
          ) : (perguntas as any[]).length === 0 ? (
            <div className="border border-dashed rounded-xl p-8 text-center text-slate-400">
              <ListChecks className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma pergunta personalizada cadastrada.</p>
              <p className="text-xs mt-1">Use <b>Nova pergunta</b> para começar.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {grupos.map(([sec, lista]) => (
                <div key={sec}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{sec}</p>
                  <div className="border rounded-lg divide-y">
                    {lista.map((p: any) => {
                      const Icon = TIPO_ICON[p.tipo as Tipo];
                      const idxGlobal = (perguntas as any[]).findIndex(x => x.id === p.id);
                      return (
                        <div key={p.id} className={`px-3 py-2.5 flex items-center gap-3 ${p.ativa ? "" : "bg-slate-50 opacity-70"}`}>
                          <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-800 truncate">{p.label}</p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                              <span>{TIPO_LABEL[p.tipo as Tipo]}</span>
                              {p.obrigatoria && <Badge variant="outline" className="text-[9px] py-0 px-1 border-rose-300 text-rose-600">obrigatória</Badge>}
                              {!p.ativa && <Badge variant="outline" className="text-[9px] py-0 px-1 border-slate-300 text-slate-500">inativa</Badge>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button title="Subir" onClick={() => mover(idxGlobal, -1)} disabled={idxGlobal <= 0 || reordenarMut.isPending}
                              className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30">
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button title="Descer" onClick={() => mover(idxGlobal, 1)} disabled={idxGlobal >= (perguntas as any[]).length - 1 || reordenarMut.isPending}
                              className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30">
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button title={p.ativa ? "Desativar" : "Ativar"} onClick={() => salvarMut.mutate({ ...p, ativa: !p.ativa })}
                              className="p-1.5 rounded hover:bg-slate-100">
                              {p.ativa ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                            </button>
                            <button title="Editar" onClick={() => { setCriando(false); setEditando(p); }}
                              className="p-1.5 rounded hover:bg-slate-100">
                              <Pencil className="w-3.5 h-3.5 text-blue-600" />
                            </button>
                            {isMaster && (
                              <button title="Remover (Admin Master)" onClick={() => remover(p)} disabled={removerMut.isPending}
                                className="p-1.5 rounded hover:bg-rose-50">
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <b>Regras:</b> o <b>tipo</b> de uma pergunta não pode ser alterado depois que ela já recebeu respostas (preservar consistência analítica) — crie uma nova pergunta em vez disso.
              Apenas o <b>Admin Master</b> pode remover (apaga as respostas históricas em CASCADE).
            </div>
          </div>
        </div>
      </div>

      {/* Modal de edição do RÓTULO de pergunta CORE (Admin Master — Rev. 1597) */}
      <Dialog open={!!editandoCore} onOpenChange={(o) => { if (!o) setEditandoCore(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-600" />
              Editar texto da pergunta core
            </DialogTitle>
          </DialogHeader>
          {editandoCore && (
            <div className="space-y-3">
              <div className="bg-slate-50 border rounded-lg p-3 text-xs text-slate-600">
                <p><b>Texto padrão:</b> {editandoCore.labelOriginal}</p>
                <p className="mt-1 text-slate-500">O <b>tipo</b> (Nota 0–10) e a <b>seção</b> permanecem inalterados — apenas o texto exibido para o cliente muda.</p>
              </div>
              <div>
                <Label className="text-xs">Texto da pergunta exibido no Portal</Label>
                <textarea
                  value={editandoCore.label} maxLength={240} rows={3}
                  onChange={(e) => setEditandoCore({ ...editandoCore, label: e.target.value })}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                  placeholder="Ex.: Como você avalia o andamento das obras da FC?"
                />
                <p className="text-[11px] text-slate-400 mt-1">{editandoCore.label.length}/240 caracteres</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditandoCore(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!editandoCore) return;
                const novo = editandoCore.label.trim();
                if (!novo) { toast.error("Informe o texto da pergunta"); return; }
                if (novo === editandoCore.labelOriginal) {
                  // Voltou ao padrão → equivalente a remover override
                  resetarLabelCoreMut.mutate({ companyId, chave: editandoCore.chave });
                  setEditandoCore(null);
                  return;
                }
                salvarLabelCoreMut.mutate({ companyId, chave: editandoCore.chave as any, label: novo });
              }}
              disabled={salvarLabelCoreMut.isPending || resetarLabelCoreMut.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {salvarLabelCoreMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de edição/criação */}
      <Dialog open={!!editando} onOpenChange={(o) => { if (!o) { setEditando(null); setCriando(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{criando ? "Nova pergunta personalizada" : "Editar pergunta"}</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Seção (agrupador visual)</Label>
                <Input value={editando.secaoTitulo} maxLength={80}
                  onChange={(e) => setEditando({ ...editando, secaoTitulo: e.target.value })}
                  placeholder="Ex.: Pós-obra · Qualidade · Comercial" />
              </div>
              <div>
                <Label className="text-xs">Tipo de resposta</Label>
                <select
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                  value={editando.tipo}
                  disabled={!criando && (editando.totalRespostas ?? 0) > 0}
                  onChange={(e) => setEditando({ ...editando, tipo: e.target.value as Tipo })}
                >
                  {(Object.keys(TIPO_LABEL) as Tipo[]).map(t => (
                    <option key={t} value={t}>{TIPO_LABEL[t]}</option>
                  ))}
                </select>
                {!criando && (
                  <p className="text-[11px] text-slate-400 mt-1">O tipo só pode ser alterado se a pergunta ainda não tiver respostas.</p>
                )}
              </div>
              <div>
                <Label className="text-xs">Pergunta (texto exibido para o cliente)</Label>
                <textarea
                  value={editando.label} maxLength={240} rows={2}
                  onChange={(e) => setEditando({ ...editando, label: e.target.value })}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                  placeholder="Ex.: Como você avalia a comunicação na fase pós-obra?"
                />
              </div>
              <div>
                <Label className="text-xs">Ajuda / contexto <span className="text-slate-400">(opcional)</span></Label>
                <textarea
                  value={editando.ajuda || ""} rows={2}
                  onChange={(e) => setEditando({ ...editando, ajuda: e.target.value })}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                  placeholder="Texto auxiliar abaixo da pergunta"
                />
              </div>
              {(editando.tipo === "texto_curto" || editando.tipo === "texto_longo") && (
                <div>
                  <Label className="text-xs">Placeholder do campo <span className="text-slate-400">(opcional)</span></Label>
                  <Input value={editando.placeholder || ""} maxLength={240}
                    onChange={(e) => setEditando({ ...editando, placeholder: e.target.value })} />
                </div>
              )}
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!editando.obrigatoria}
                    onChange={(e) => setEditando({ ...editando, obrigatoria: e.target.checked })} />
                  Obrigatória
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editando.ativa !== false}
                    onChange={(e) => setEditando({ ...editando, ativa: e.target.checked })} />
                  Ativa (visível no Portal)
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditando(null); setCriando(false); }}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!editando?.label?.trim()) { toast.error("Informe o texto da pergunta"); return; }
                if (!editando?.secaoTitulo?.trim()) { toast.error("Informe a seção"); return; }
                salvarMut.mutate({
                  id: criando ? undefined : editando.id,
                  companyId,
                  secaoTitulo: editando.secaoTitulo.trim(),
                  tipo: editando.tipo,
                  label: editando.label.trim(),
                  ajuda: editando.ajuda?.trim() || null,
                  placeholder: editando.placeholder?.trim() || null,
                  obrigatoria: !!editando.obrigatoria,
                  ativa: editando.ativa !== false,
                });
              }}
              disabled={salvarMut.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {salvarMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
