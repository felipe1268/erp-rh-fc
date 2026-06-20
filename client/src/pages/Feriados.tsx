import { useState, useMemo } from "react";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar, Plus, Trash2, Download, Upload, Search, Loader2, CheckCircle2, CircleSlash, MapPin } from "lucide-react";
import { toast } from "sonner";
import { removeAccents } from "@/lib/searchUtils";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
type FeriadoTipo = "nacional" | "estadual" | "municipal" | "ponto_facultativo" | "compensado";

const UF_NOMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

export default function Feriados() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = selectedCompanyId ? Number(selectedCompanyId) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const [anoFiltro, setAnoFiltro] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ nome: "", data: "", tipo: "nacional" as string, recorrente: "1", estado: "", cidade: "", observado: "1" });

  const { data: feriados, isLoading, refetch } = trpc.feriados.listar.useQuery(
    { companyId, ano: anoFiltro },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  // Rev. 3352 — cidades/UF das obras ativas p/ autocompletar o campo Cidade.
  const { data: obrasAtivas } = trpc.obras.listActive.useQuery(
    { companyId, companyIds },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );
  const cidadesObras = useMemo(() => {
    const map = new Map<string, string>(); // cidade(lower) → "Cidade/UF" exibido
    for (const o of (obrasAtivas as any[] | undefined) || []) {
      const cid = String(o?.cidade || '').trim();
      if (!cid) continue;
      const uf = String(o?.estado || '').trim().toUpperCase();
      const label = uf ? `${cid}/${uf}` : cid;
      if (!map.has(cid.toLowerCase())) map.set(cid.toLowerCase(), label);
    }
    return Array.from(map.entries()).map(([cidLower, label]) => ({ cidLower, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [obrasAtivas]);
  // Ao escolher uma cidade conhecida, autopreenche a UF.
  const ufByCidade = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of (obrasAtivas as any[] | undefined) || []) {
      const cid = String(o?.cidade || '').trim().toLowerCase();
      const uf = String(o?.estado || '').trim().toUpperCase();
      if (cid && uf && !m.has(cid)) m.set(cid, uf);
    }
    return m;
  }, [obrasAtivas]);

  // Rev. 3355 — UFs com base estadual curada (p/ o seletor do diálogo).
  const { data: ufsDisponiveis } = trpc.feriados.ufsEstaduaisDisponiveis.useQuery(undefined, { staleTime: 1000 * 60 * 60 });
  // UFs detectadas nas obras ativas (pré-marcação do seletor).
  const ufsDasObras = useMemo(() => {
    const s = new Set<string>();
    for (const o of (obrasAtivas as any[] | undefined) || []) {
      const uf = String(o?.estado || '').trim().toUpperCase();
      if (uf.length === 2) s.add(uf);
    }
    return s;
  }, [obrasAtivas]);

  // Rev. 3355 — diálogo "Baixar Feriados": nacionais (sempre) + estaduais das UFs escolhidas.
  // Municipais ficam por conta do cadastro manual (sem base pública confiável).
  const [showBaixar, setShowBaixar] = useState(false);
  const [ufsBaixar, setUfsBaixar] = useState<Set<string>>(new Set());
  const abrirBaixar = () => { setUfsBaixar(new Set(ufsDasObras)); setShowBaixar(true); };
  const toggleUf = (uf: string) => setUfsBaixar(prev => {
    const n = new Set(prev);
    if (n.has(uf)) n.delete(uf); else n.add(uf);
    return n;
  });
  const baixarMut = trpc.feriados.baixarFeriados.useMutation({
    onSuccess: (r: any) => {
      const ufs = (r?.ufsComFeriado || []).length ? r.ufsComFeriado.join(", ") : "—";
      toast.success(
        `${r.nacionaisCriados} nacionais + ${r.estaduaisCriados} estaduais inseridos (UFs: ${ufs}).`,
        { description: "Feriados municipais não são baixados — cadastre-os manualmente em \"Novo Feriado\"." }
      );
      if ((r?.ufsSemBase || []).length) {
        toast.info(`Sem base estadual para: ${r.ufsSemBase.join(", ")}. Cadastre manualmente se necessário.`);
      }
      setShowBaixar(false);
      refetch();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao baixar feriados"),
  });

  const criarMut = trpc.feriados.criar.useMutation({
    onSuccess: () => { toast.success("Feriado salvo"); setShowDialog(false); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const atualizarMut = trpc.feriados.atualizar.useMutation({
    onSuccess: () => { toast.success("Feriado atualizado"); setShowDialog(false); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar"),
  });

  const excluirMut = trpc.feriados.excluir.useMutation({
    onSuccess: () => { toast.success("Feriado excluído"); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao excluir"),
  });

  const definirObsMut = trpc.feriados.definirObservancia.useMutation({
    onSuccess: (r: any) => { toast.success(r?.observado === false ? "Feriado não será seguido" : "Observância atualizada"); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar observância"),
  });

  // Rev. 3352 — alterna "empresa segue / não segue" o feriado. Copy-on-write nos
  // defaults (id=0). Para facultativo que passa a observado SEM cidade, avisa que
  // valerá p/ todas as cidades.
  const toggleObservancia = (f: any) => {
    const novo = !(Number(f.observado) === 1);
    if (novo && f.tipo === 'ponto_facultativo' && !f.cidade) {
      // facultativo virando observado sem cidade → abre o diálogo p/ escolher a cidade
      abrirEditar({ ...f, observado: 1 });
      toast.info("Informe a cidade que seguirá este ponto facultativo (vazio = todas).");
      return;
    }
    definirObsMut.mutate({
      companyId,
      id: f.id || 0,
      nome: f.nome,
      data: f.data,
      tipo: (f.tipo || 'nacional') as FeriadoTipo,
      recorrente: Number(f.recorrente ?? 1) === 1,
      estado: f.estado || null,
      cidade: f.cidade || null,
      observado: novo,
    });
  };

  const filtered = useMemo(() => {
    if (!feriados) return [];
    if (!search) return feriados;
    const s = removeAccents(search);
    return feriados.filter(f => removeAccents(f.nome || '').includes(s) || removeAccents(f.tipo || '').includes(s));
  }, [feriados, search]);

  const abrirNovo = () => {
    setEditId(null);
    setForm({ nome: "", data: `${anoFiltro}-01-01`, tipo: "nacional", recorrente: "1", estado: "", cidade: "", observado: "1" });
    setShowDialog(true);
  };

  // Rev. 3352 — para defaults (id=0) o "editar" vira definirObservancia (copy-on-write).
  // Guarda o registro original p/ saber se é default.
  const [editOrig, setEditOrig] = useState<any>(null);
  const abrirEditar = (f: any) => {
    setEditId(f.id || null);
    setEditOrig(f);
    setForm({
      nome: f.nome,
      data: f.data,
      tipo: f.tipo || "nacional",
      recorrente: String(f.recorrente ?? 1),
      estado: f.estado || "",
      cidade: f.cidade || "",
      observado: String(f.observado ?? (f.tipo === 'ponto_facultativo' ? 0 : 1)),
    });
    setShowDialog(true);
  };

  const salvar = () => {
    if (!form.nome || !form.data) return toast.error("Preencha nome e data");
    const tipo = form.tipo as FeriadoTipo;
    const base = {
      tipo,
      recorrente: form.recorrente === "1",
      estado: form.estado || null,
      cidade: form.cidade || null,
      observado: form.observado === "1",
    };
    if (editId) {
      atualizarMut.mutate({ id: editId, nome: form.nome, data: form.data, ...base });
    } else if (editOrig && (!editOrig.id || editOrig.id === 0)) {
      // editando um DEFAULT injetado → materializa via copy-on-write
      definirObsMut.mutate({ companyId, id: 0, nome: form.nome, data: form.data, ...base });
      setShowDialog(false);
    } else {
      criarMut.mutate({ companyId, companyIds, nome: form.nome, data: form.data, ...base });
    }
  };

  // Group by month
  const byMonth = useMemo(() => {
    const map: Record<number, typeof filtered> = {};
    for (const f of filtered) {
      const m = new Date(f.data + 'T12:00:00').getMonth();
      if (!map[m]) map[m] = [];
      map[m].push(f);
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Feriados
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Gerencie feriados nacionais, estaduais e municipais para cálculos de ponto e folha</p>
        </div>
        <DraggableCommandBar barId="feriados" items={[
          { id: "carregar", node: <Button variant="outline" size="sm" onClick={abrirBaixar} disabled={baixarMut.isPending} title="Baixa feriados nacionais + estaduais (escolha as UFs). Municipais: cadastre manualmente.">{baixarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}Baixar Feriados {anoFiltro}</Button> },
          { id: "novo", node: <Button size="sm" onClick={abrirNovo}><Plus className="w-4 h-4 mr-1" /> Novo Feriado</Button> },
        ]} />
      </div>

      {/* Filtros */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar feriado..." className="pl-9" />
        </div>
        <Select value={String(anoFiltro)} onValueChange={v => setAnoFiltro(Number(v))}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027, 2028].map(a => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} feriado(s)</span>
      </div>

      {/* Calendar Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }, (_, i) => i).map(m => {
            const items = byMonth[m] || [];
            return (
              <div key={m} className="border border-border rounded-lg overflow-hidden">
                <div className="bg-primary/10 px-3 py-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-primary">{MESES[m]}</span>
                  <span className="text-xs text-muted-foreground">{items.length} feriado(s)</span>
                </div>
                <div className="p-2 space-y-1 min-h-[60px]">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2 text-center">Nenhum feriado</p>
                  ) : items.map((f: any, idx: number) => {
                    const observado = Number(f.observado ?? (f.tipo === 'ponto_facultativo' ? 0 : 1)) === 1;
                    const tipoLabel = f.tipo === 'ponto_facultativo' ? 'facultativo' : f.tipo;
                    return (
                    <div key={f.id || `def-${f.data}-${idx}`} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/50 group cursor-pointer" onClick={() => abrirEditar(f)}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{f.nome}</div>
                        <div className="text-[10px] text-muted-foreground flex gap-1.5 flex-wrap items-center mt-0.5">
                          <span>{new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                          <span className={`px-1 rounded ${f.tipo === 'nacional' ? 'bg-blue-100 text-blue-700' : f.tipo === 'estadual' ? 'bg-green-100 text-green-700' : f.tipo === 'municipal' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                            {tipoLabel}
                          </span>
                          {f.cidade && (
                            <span className="px-1 rounded bg-slate-100 text-slate-600 inline-flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5" />{f.cidade}{f.estado ? `/${f.estado}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          title={observado ? 'A empresa segue este feriado — clique para NÃO seguir' : 'A empresa NÃO segue — clique para seguir'}
                          className={`h-6 px-1.5 rounded inline-flex items-center gap-1 text-[10px] font-medium transition-colors ${observado ? 'text-green-700 hover:bg-green-100' : 'text-muted-foreground hover:bg-muted'}`}
                          onClick={e => { e.stopPropagation(); toggleObservancia(f); }}
                        >
                          {observado ? <CheckCircle2 className="w-3.5 h-3.5" /> : <CircleSlash className="w-3.5 h-3.5" />}
                          {observado ? 'Segue' : 'Não segue'}
                        </button>
                        {!!f.id && (
                          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0" onClick={e => { e.stopPropagation(); excluirMut.mutate({ id: f.id }); }}>
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Feriado" : "Novo Feriado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Nome do Feriado</Label>
              <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} className="mt-1" placeholder="Ex: Natal" />
            </div>
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v, observado: v === 'ponto_facultativo' && p.observado === '1' && !editId ? '0' : p.observado }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nacional">Nacional</SelectItem>
                  <SelectItem value="estadual">Estadual</SelectItem>
                  <SelectItem value="municipal">Municipal</SelectItem>
                  <SelectItem value="ponto_facultativo">Ponto Facultativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Cidade {form.tipo === 'ponto_facultativo' && <span className="text-amber-600">(quem segue)</span>}</Label>
                <Input
                  list="cidades-obras"
                  value={form.cidade}
                  onChange={e => {
                    const cidade = e.target.value;
                    const uf = ufByCidade.get(cidade.trim().toLowerCase());
                    setForm(p => ({ ...p, cidade, estado: uf || p.estado }));
                  }}
                  className="mt-1"
                  placeholder="Vazio = todas"
                />
                <datalist id="cidades-obras">
                  {cidadesObras.map(c => <option key={c.cidLower} value={c.label.includes('/') ? c.label.split('/')[0] : c.label} />)}
                </datalist>
              </div>
              <div>
                <Label className="text-xs">UF</Label>
                <Input value={form.estado} maxLength={2} onChange={e => setForm(p => ({ ...p, estado: e.target.value.toUpperCase() }))} className="mt-1" placeholder="SP" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground -mt-2">
              {cidadesObras.length > 0
                ? <>Comece a digitar para escolher entre as <b>{cidadesObras.length}</b> cidade(s) das obras ativas. </>
                : null}
              Deixe a cidade em branco para valer em <b>todas</b> as obras. Preenchida, o feriado só conta como HE para quem bateu ponto naquela cidade/UF.
            </p>
            <div>
              <Label className="text-xs">A empresa segue (observa) este feriado?</Label>
              <Select value={form.observado} onValueChange={v => setForm(p => ({ ...p, observado: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Sim — folga remunerada / HE 100% no dia</SelectItem>
                  <SelectItem value="0">Não — dia normal (sem HE de feriado)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Recorrente (anual)?</Label>
              <Select value={form.recorrente} onValueChange={v => setForm(p => ({ ...p, recorrente: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Sim</SelectItem>
                  <SelectItem value="0">Não (apenas este ano)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={criarMut.isPending || atualizarMut.isPending}>
              {(criarMut.isPending || atualizarMut.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 3355 — Diálogo "Baixar Feriados": nacionais (sempre) + estaduais por UF */}
      <Dialog open={showBaixar} onOpenChange={setShowBaixar}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Download className="w-4 h-4" /> Baixar Feriados {anoFiltro}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Feriados nacionais</p>
              <p className="text-muted-foreground text-xs mt-1">
                Os feriados nacionais ({anoFiltro}) — fixos e móveis (Sexta-Feira Santa, Carnaval e Corpus Christi) — são baixados automaticamente.
              </p>
            </div>

            <div>
              <Label className="text-xs flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Feriados estaduais — selecione as UFs</Label>
              {ufsDasObras.size > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">UFs das obras ativas vêm pré-marcadas.</p>
              )}
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pr-1">
                {(ufsDisponiveis as string[] | undefined || []).map(uf => {
                  const sel = ufsBaixar.has(uf);
                  const daObra = ufsDasObras.has(uf);
                  return (
                    <button
                      type="button"
                      key={uf}
                      onClick={() => toggleUf(uf)}
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${sel ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
                    >
                      {sel ? <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" /> : <CircleSlash className="w-3.5 h-3.5 shrink-0 opacity-40" />}
                      <span className="font-mono font-semibold">{uf}</span>
                      <span className="truncate">{UF_NOMES[uf] || ''}{daObra ? ' •' : ''}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                Os estaduais só contam como HE de feriado para quem tem a <b>UF preenchida na obra</b> onde bateu ponto. Feriados <b>municipais</b> não têm base pública — cadastre-os em "Novo Feriado".
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBaixar(false)}>Cancelar</Button>
            <Button
              onClick={() => baixarMut.mutate({ companyId, companyIds, ano: anoFiltro, ufs: Array.from(ufsBaixar) })}
              disabled={baixarMut.isPending}
            >
              {baixarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
              Baixar {ufsBaixar.size > 0 ? `(nacionais + ${ufsBaixar.size} UF)` : '(só nacionais)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
