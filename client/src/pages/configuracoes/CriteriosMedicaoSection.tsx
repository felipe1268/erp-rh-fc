import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Ruler, Plus, Pencil, Trash2, Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";

// Rev. — CRITÉRIOS DE MEDIÇÃO (catálogo global por empresa).
// Cada ficha: regra de vão (limite m², desconto), requadro (paga? fórmula? quem paga),
// referência de literatura (TCPO/SINAPI) + regra FC, com maturidade
// rascunho → em estudo → definido. Só "definido" é congelado em contratos novos.

const STATUS_META: Record<string, { label: string; cls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  em_estudo: { label: "Em estudo", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  definido: { label: "Definido", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

// Famílias de serviço (validadas pelo usuário) — classificação pelo nome.
const FAMILIAS = [
  { key: "vedacao", label: "Vedação", emoji: "🧱", re: /alvenaria|veda/i,
    band: "bg-amber-50 border-amber-200", dot: "bg-amber-500", text: "text-amber-800" },
  { key: "argamassa", label: "Revestimento argamassado", emoji: "🟠", re: /chapisco|reboco|embo[çc]o|massa corrida|gesso liso/i,
    band: "bg-orange-50 border-orange-200", dot: "bg-orange-500", text: "text-orange-800" },
  { key: "pintura", label: "Pintura", emoji: "🟣", re: /pintura|textura|grafiato/i,
    band: "bg-violet-50 border-violet-200", dot: "bg-violet-500", text: "text-violet-800" },
  { key: "ceramica", label: "Cerâmica e pisos", emoji: "🔵", re: /cer[âa]mica|porcelanato|azulejo|contrapiso|piso|fachada/i,
    band: "bg-sky-50 border-sky-200", dot: "bg-sky-500", text: "text-sky-800" },
  { key: "outros", label: "Complementares", emoji: "⚪", re: /./,
    band: "bg-slate-50 border-slate-200", dot: "bg-slate-400", text: "text-slate-700" },
];
const familiaDe = (servico: string) => FAMILIAS.find(f => f.re.test(servico || "")) || FAMILIAS[FAMILIAS.length - 1];

const brNum = (v: any) => {
  const n = Number(v);
  return isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
};
const parseBr = (s: string) => {
  const v = parseFloat(String(s).replace(/\./g, "").replace(",", "."));
  return isFinite(v) && v >= 0 ? v : 0;
};

export function CriteriosMedicaoSection() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const [expanded, setExpanded] = useState(true); // aba própria → já abre expandido
  const [editando, setEditando] = useState<any | null>(null);

  const utils = trpc.useUtils();
  const listQ = trpc.medicaoCriterios.listar.useQuery({ companyId }, { enabled: !!companyId && expanded });
  const rows: any[] = (listQ.data as any[]) ?? [];

  const salvarMut = trpc.medicaoCriterios.salvar.useMutation({
    onSuccess: () => {
      toast.success("Critério salvo!");
      utils.medicaoCriterios.listar.invalidate({ companyId });
      setEditando(null);
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar critério"),
  });
  const definirTodosMut = trpc.medicaoCriterios.definirTodos.useMutation({
    onSuccess: (r: any) => { toast.success(`${r.atualizados} critério(s) marcados como Definido!`); utils.medicaoCriterios.listar.invalidate({ companyId }); },
    onError: (e: any) => toast.error(e?.message || "Erro ao definir critérios"),
  });
  const excluirMut = trpc.medicaoCriterios.excluir.useMutation({
    onSuccess: () => { toast.success("Critério removido."); utils.medicaoCriterios.listar.invalidate({ companyId }); },
    onError: (e: any) => toast.error(e?.message || "Erro ao remover"),
  });

  const definidos = rows.filter(r => r.status === "definido").length;

  return (
    <div className="border rounded-lg overflow-hidden border-indigo-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-3">
          <Ruler className="w-5 h-5 text-indigo-600" />
          <span className="font-semibold text-gray-800">Critérios de Medição (vãos e requadros)</span>
          {rows.length > 0 && (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
              {definidos} definido{definidos === 1 ? "" : "s"} / {rows.length}
            </span>
          )}
        </div>
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="bg-white p-4 space-y-3">
          <p className="text-sm text-gray-500">
            Como cada serviço é medido: desconto de vão (portas/janelas), requadro e quem o paga.
            Fichas nascem com o critério de literatura (TCPO/SINAPI) em <b>rascunho</b> — estude, ajuste a regra FC
            e mude para <b>definido</b>. Contratos de terceiros <b>congelam</b> os critérios definidos na criação
            (mudanças aqui não afetam contratos em andamento).
          </p>

          {listQ.isLoading ? (
            <div className="text-center py-8 text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando critérios...</div>
          ) : (
            <div className="space-y-5">
              {FAMILIAS.map((fam) => {
                const doGrupo = rows.filter(c => familiaDe(c.servico) === fam);
                if (!doGrupo.length && fam.key === "outros") return null;
                return (
                  <div key={fam.key}>
                    {/* Cabeçalho da família */}
                    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 mb-2 ${fam.band}`}>
                      <span className="text-sm">{fam.emoji}</span>
                      <span className={`text-sm font-bold ${fam.text}`}>{fam.label}</span>
                      <span className="text-[11px] text-gray-400">{doGrupo.length} serviço{doGrupo.length === 1 ? "" : "s"}</span>
                      <button type="button"
                        className={`ml-auto flex items-center gap-1 text-[11px] font-medium ${fam.text} opacity-80 hover:opacity-100`}
                        onClick={() => setEditando({ id: undefined, servico: "", unidade: "m2", status: "rascunho", limiteVaoM2: "2.00", descontaAcima: "integral", pagaRequadro: 0, requadroIncluiPeitoril: 0 })}>
                        <Plus className="w-3 h-3" /> Novo
                      </button>
                    </div>
                    {/* Cards da família */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {doGrupo.map((c) => {
                        const st = STATUS_META[c.status] || STATUS_META.rascunho;
                        const limite = Number(c.limiteVaoM2) || 0;
                        const naoDesconta = c.descontaAcima === "nao_desconta";
                        return (
                          <div key={c.id}
                            className="group relative rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer"
                            onClick={() => setEditando({ ...c })}>
                            <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${fam.dot}`} />
                            <div className="pl-2">
                              <div className="flex items-start gap-2">
                                <span className="font-semibold text-[13px] text-gray-800 break-words flex-1">{c.servico}</span>
                                <Badge variant="outline" className={`text-[9px] shrink-0 ${st.cls}`}>{st.label}</Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                {naoDesconta ? (
                                  <span className="rounded-full bg-slate-100 text-slate-500 text-[10px] font-medium px-2 py-0.5">não desconta vãos</span>
                                ) : limite > 0 ? (
                                  <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5">≤ {brNum(limite)} m² paga fechado</span>
                                ) : (
                                  <span className="rounded-full bg-sky-100 text-sky-700 text-[10px] font-medium px-2 py-0.5">área líquida</span>
                                )}
                                {Number(c.pagaRequadro) ? (
                                  <span className="rounded-full bg-violet-100 text-violet-700 text-[10px] font-medium px-2 py-0.5"
                                    title={c.quemPagaRequadro || undefined}>
                                    requadro {Number(c.requadroIncluiPeitoril) ? "2×(L+A)" : "2A+L"}
                                  </span>
                                ) : null}
                                <span className="rounded-full bg-slate-50 text-gray-400 text-[10px] px-2 py-0.5 uppercase">{c.unidade === "m2" ? "m²" : c.unidade}</span>
                              </div>
                              {c.quemPagaRequadro && (
                                <div className="text-[10px] text-gray-400 mt-1 truncate" title={c.quemPagaRequadro}>{c.quemPagaRequadro}</div>
                              )}
                            </div>
                            <button type="button"
                              className="absolute right-2 bottom-2 hidden group-hover:flex text-red-300 hover:text-red-500"
                              disabled={excluirMut.isPending}
                              onClick={(ev) => { ev.stopPropagation(); if (confirm(`Remover o critério "${c.servico}"? Contratos já criados mantêm o critério congelado.`)) excluirMut.mutate({ companyId, id: c.id }); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1 text-indigo-700 border-indigo-300"
              onClick={() => setEditando({ id: undefined, servico: "", unidade: "m2", status: "rascunho", limiteVaoM2: "2.00", descontaAcima: "integral", pagaRequadro: 0, requadroIncluiPeitoril: 0 })}>
              <Plus className="w-3.5 h-3.5" /> Novo critério
            </Button>
            {rows.length > 0 && definidos < rows.length && (
              <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={definirTodosMut.isPending}
                onClick={() => { if (confirm(`Marcar TODOS os ${rows.length - definidos} critério(s) pendentes como "Definido"? Eles passam a entrar (congelados) nos contratos de terceiros criados a partir de agora.`)) definirTodosMut.mutate({ companyId }); }}>
                {definirTodosMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "✅"} Definir todos ({rows.length - definidos})
              </Button>
            )}
          </div>
          <p className="text-[11px] text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5 items-center">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> ≤ limite paga fechado</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /> área líquida (desconta tudo)</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400 inline-block" /> paga requadro (1× por vão)</span>
          </p>

          {editando && (() => {
            const fam = familiaDe(editando.servico || "");
            const naoDesconta = editando.descontaAcima === "nao_desconta";
            const limite = parseBr(String(editando.limiteVaoM2 ?? "0").replace(".", ","));
            const regraVao: "fechado" | "liquida" | "nao" = naoDesconta ? "nao" : limite > 0 ? "fechado" : "liquida";
            const setRegraVao = (r: typeof regraVao) => {
              if (r === "nao") setEditando({ ...editando, descontaAcima: "nao_desconta" });
              else if (r === "liquida") setEditando({ ...editando, descontaAcima: "integral", limiteVaoM2: "0" });
              else setEditando({ ...editando, descontaAcima: "integral", limiteVaoM2: Number(editando.limiteVaoM2) > 0 ? editando.limiteVaoM2 : "2.00" });
            };
            const seg = (ativo: boolean, extra = "") =>
              `rounded-lg border px-3 py-2 text-xs font-semibold text-left transition-all ${ativo ? "border-indigo-500 bg-indigo-50 text-indigo-800 shadow-sm" : "border-slate-200 bg-white text-gray-500 hover:bg-slate-50"} ${extra}`;
            return (
            <Dialog open onOpenChange={(o) => { if (!o) setEditando(null); }}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
                {/* Cabeçalho na cor da família */}
                <div className={`px-5 pt-4 pb-3 border-b ${fam.band}`}>
                  <DialogHeader>
                    <DialogTitle className={`flex items-center gap-2 ${fam.text}`}>
                      <span>{fam.emoji}</span>
                      {editando.id ? editando.servico : "Novo critério de medição"}
                      <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 bg-white/70 ${fam.text}`}>{fam.label}</span>
                    </DialogTitle>
                  </DialogHeader>
                </div>
                <div className="px-5 pb-5 pt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <Label className="text-xs">Serviço</Label>
                      <Input value={editando.servico || ""} onChange={e => setEditando({ ...editando, servico: e.target.value })} placeholder="Ex.: Reboco Externo" />
                      <p className="text-[10px] text-gray-400 mt-0.5">A família (cor) é reconhecida pelo nome do serviço.</p>
                    </div>
                    <div>
                      <Label className="text-xs">Unidade</Label>
                      <div className="grid grid-cols-3 gap-1 mt-1">
                        {[["m2", "m²"], ["m", "m"], ["un", "un"]].map(([v, l]) => (
                          <button key={v} type="button" className={seg(editando.unidade === v, "text-center")}
                            onClick={() => setEditando({ ...editando, unidade: v })}>{l}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Status — segmentado compacto */}
                  <div className="flex items-center gap-3">
                    <Label className="text-xs shrink-0">Status</Label>
                    <div className="flex-1 grid grid-cols-3 gap-0 rounded-xl bg-slate-100 p-1">
                      {([["rascunho", "📝 Rascunho"], ["em_estudo", "🔎 Em estudo"], ["definido", "✅ Definido"]] as const).map(([v, l]) => (
                        <button key={v} type="button"
                          className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-all ${editando.status === v ? "bg-white shadow text-gray-900" : "text-gray-400"}`}
                          onClick={() => setEditando({ ...editando, status: v })}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editando.status === "definido" && (
                    <p className="text-[10px] text-emerald-600 -mt-2">✓ Entra congelado nos contratos de terceiros criados a partir de agora.</p>
                  )}

                  {/* Regra de vão — cards categóricos */}
                  <div>
                    <Label className="text-xs">Como tratar os vãos (portas/janelas)?</Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
                      <button type="button" className={seg(regraVao === "fechado")} onClick={() => setRegraVao("fechado")}>
                        <div>🟡 Tolerância</div>
                        <div className="text-[9px] font-normal opacity-70 mt-0.5">vão pequeno paga fechado; acima do limite desconta tudo</div>
                      </button>
                      <button type="button" className={seg(regraVao === "liquida")} onClick={() => setRegraVao("liquida")}>
                        <div>🔵 Área líquida</div>
                        <div className="text-[9px] font-normal opacity-70 mt-0.5">desconta TODOS os vãos, sem tolerância</div>
                      </button>
                      <button type="button" className={seg(regraVao === "nao")} onClick={() => setRegraVao("nao")}>
                        <div>⚪ Não desconta</div>
                        <div className="text-[9px] font-normal opacity-70 mt-0.5">vãos não afetam a medição</div>
                      </button>
                    </div>
                    {regraVao === "fechado" && (
                      <div className="flex items-center gap-2 mt-2">
                        <Label className="text-xs whitespace-nowrap">Limite do vão:</Label>
                        <Input inputMode="decimal" className="text-right w-24 h-9"
                          value={String(editando.limiteVaoM2 ?? "2.00").replace(".", ",")}
                          onChange={e => setEditando({ ...editando, limiteVaoM2: e.target.value.replace(",", ".") })} />
                        <span className="text-xs text-gray-500">m² — até isso o vão paga fechado</span>
                      </div>
                    )}
                  </div>

                  {/* Requadro */}
                  <div className="border rounded-xl p-3 space-y-3 bg-violet-50/40 border-violet-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">🟣 Paga requadro?</Label>
                        <p className="text-[11px] text-gray-500">Metro linear do contorno do vão. Cada vão é pago <b>uma única vez</b> (controle automático por pin no mapa de vãos).</p>
                      </div>
                      <Switch checked={!!Number(editando.pagaRequadro)} onCheckedChange={v => setEditando({ ...editando, pagaRequadro: v ? 1 : 0 })} />
                    </div>
                    {!!Number(editando.pagaRequadro) && (
                      <>
                        <div>
                          <Label className="text-xs">Fórmula na janela <span className="font-normal text-gray-400">(porta é sempre 2×altura + largura)</span></Label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <button type="button" className={seg(!Number(editando.requadroIncluiPeitoril))} onClick={() => setEditando({ ...editando, requadroIncluiPeitoril: 0 })}>
                              <div>2A + L</div>
                              <div className="text-[9px] font-normal opacity-70 mt-0.5">laterais + verga (sem peitoril)</div>
                            </button>
                            <button type="button" className={seg(!!Number(editando.requadroIncluiPeitoril))} onClick={() => setEditando({ ...editando, requadroIncluiPeitoril: 1 })}>
                              <div>2×(L + A)</div>
                              <div className="text-[9px] font-normal opacity-70 mt-0.5">perímetro completo, com peitoril</div>
                            </button>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Quem paga o requadro</Label>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {["Somente se ainda não pago", "Fachada (externo) tem prioridade", "Este serviço paga sempre"].map(op => (
                              <button key={op} type="button"
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${editando.quemPagaRequadro === op ? "border-violet-500 bg-violet-100 text-violet-800" : "border-slate-200 bg-white text-gray-500 hover:bg-slate-50"}`}
                                onClick={() => setEditando({ ...editando, quemPagaRequadro: editando.quemPagaRequadro === op ? "" : op })}>
                                {op}
                              </button>
                            ))}
                          </div>
                          <Input className="mt-1.5 h-9 text-xs" value={editando.quemPagaRequadro || ""}
                            onChange={e => setEditando({ ...editando, quemPagaRequadro: e.target.value })}
                            placeholder="Ou escreva uma regra própria..." />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Textos longos ficam recolhidos p/ não poluir */}
                  <details className="rounded-xl border border-slate-200 bg-slate-50/50 open:bg-white">
                    <summary className="cursor-pointer select-none px-3 py-2.5 text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-gray-400" /> Literatura, regra FC e observações
                      {(editando.referencia || editando.regraFc) && <span className="text-[9px] font-normal text-gray-400">— preenchido</span>}
                    </summary>
                    <div className="px-3 pb-3 space-y-3">
                      <div>
                        <Label className="text-xs">Critério de literatura (TCPO/SINAPI)</Label>
                        <Textarea rows={3} value={editando.referencia || ""} onChange={e => setEditando({ ...editando, referencia: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Regra FC (nossa decisão)</Label>
                          <Textarea rows={3} value={editando.regraFc || ""} onChange={e => setEditando({ ...editando, regraFc: e.target.value })} placeholder="Ajustes da empresa sobre a literatura..." />
                        </div>
                        <div>
                          <Label className="text-xs">Incluso no preço</Label>
                          <Textarea rows={3} value={editando.incluso || ""} onChange={e => setEditando({ ...editando, incluso: e.target.value })} placeholder="Taliscamento, andaime, limpeza..." />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Observações</Label>
                        <Textarea rows={2} value={editando.observacoes || ""} onChange={e => setEditando({ ...editando, observacoes: e.target.value })} />
                      </div>
                    </div>
                  </details>

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" onClick={() => setEditando(null)}>Cancelar</Button>
                    <Button size="sm" disabled={salvarMut.isPending || !(editando.servico || "").trim()}
                      onClick={() => salvarMut.mutate({
                        companyId,
                        id: editando.id || undefined,
                        servico: String(editando.servico).trim(),
                        chaveServico: editando.chaveServico || null,
                        unidade: editando.unidade || "m2",
                        status: editando.status || "rascunho",
                        limiteVaoM2: parseBr(String(editando.limiteVaoM2 ?? "2")),
                        descontaAcima: editando.descontaAcima || "integral",
                        pagaRequadro: !!Number(editando.pagaRequadro),
                        requadroIncluiPeitoril: !!Number(editando.requadroIncluiPeitoril),
                        quemPagaRequadro: editando.quemPagaRequadro || null,
                        referencia: editando.referencia || null,
                        regraFc: editando.regraFc || null,
                        incluso: editando.incluso || null,
                        observacoes: editando.observacoes || null,
                      })}>
                      {salvarMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                      Salvar critério
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            );
          })()}
        </div>
      )}
    </div>
  );
}
