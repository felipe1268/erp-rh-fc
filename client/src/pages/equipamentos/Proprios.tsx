import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Plus, Search, Pencil, X, HardHat } from "lucide-react";
import { FotosUploader, FotoItem, fmtMoney, fmtDate, Spinner } from "./_shared";

const EMPTY_FORM = {
  codigoPatrimonio: "", descricao: "", categoria: "", numeroSerie: "",
  marca: "", modelo: "", dataAquisicao: "", valorAquisicao: "",
  vidaUtilMeses: "", observacoes: "",
};

const STATUS_LABELS: Record<string, string> = {
  disponivel: "Disponível", em_obra: "Em obra", manutencao: "Manutenção", baixado: "Baixado",
};
const STATUS_COLORS: Record<string, string> = {
  disponivel: "bg-emerald-100 text-emerald-700",
  em_obra: "bg-blue-100 text-blue-700",
  manutencao: "bg-amber-100 text-amber-700",
  baixado: "bg-slate-200 text-slate-700",
};

export default function EquipamentosProprios() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("");

  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.equipamentos.propriosListar.useQuery(
    { companyId, busca: busca || undefined, status: (filtroStatus as any) || undefined },
    { enabled: !!companyId }
  );

  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [fotos, setFotos] = useState<FotoItem[]>([]);

  function abrirNovo() {
    setForm({ ...EMPTY_FORM }); setFotos([]); setEditingId(null); setModal(true);
  }
  function abrirEdit(p: any) {
    setForm({
      codigoPatrimonio: p.codigoPatrimonio,
      descricao: p.descricao,
      categoria: p.categoria || "",
      numeroSerie: p.numeroSerie || "",
      marca: p.marca || "",
      modelo: p.modelo || "",
      dataAquisicao: (p.dataAquisicao || "").slice(0, 10),
      valorAquisicao: p.valorAquisicao ? String(Number(p.valorAquisicao)).replace(".", ",") : "",
      vidaUtilMeses: p.vidaUtilMeses ? String(p.vidaUtilMeses) : "",
      observacoes: p.observacoes || "",
    });
    setFotos((p.fotosJson as FotoItem[]) || []);
    setEditingId(p.id);
    setModal(true);
  }

  const criar = trpc.equipamentos.proprioCriar.useMutation({
    onSuccess: () => { utils.equipamentos.propriosListar.invalidate(); setModal(false); toast.success("Equipamento cadastrado!"); },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.equipamentos.proprioAtualizar.useMutation({
    onSuccess: () => { utils.equipamentos.propriosListar.invalidate(); setModal(false); toast.success("Atualizado."); },
    onError: (e) => toast.error(e.message),
  });

  function salvar() {
    if (!form.codigoPatrimonio.trim()) return toast.error("Patrimônio é obrigatório.");
    if (!form.descricao.trim()) return toast.error("Descrição é obrigatória.");
    const valor = parseFloat(form.valorAquisicao.replace(",", ".")) || undefined;
    const vida = parseInt(form.vidaUtilMeses) || undefined;
    if (editingId) {
      atualizar.mutate({
        companyId, id: editingId,
        descricao: form.descricao,
        categoria: form.categoria || null,
        marca: form.marca || null,
        modelo: form.modelo || null,
        valorAquisicao: valor ?? null,
        vidaUtilMeses: vida ?? null,
        observacoes: form.observacoes || null,
        fotos: fotos.length > 0 ? fotos : undefined,
      });
    } else {
      criar.mutate({
        companyId,
        codigoPatrimonio: form.codigoPatrimonio,
        descricao: form.descricao,
        categoria: form.categoria || undefined,
        numeroSerie: form.numeroSerie || undefined,
        marca: form.marca || undefined,
        modelo: form.modelo || undefined,
        dataAquisicao: form.dataAquisicao || undefined,
        valorAquisicao: valor,
        vidaUtilMeses: vida,
        fotos: fotos.length > 0 ? fotos : undefined,
        observacoes: form.observacoes || undefined,
      });
    }
  }

  const stats = useMemo(() => {
    const s = { total: data.length, em_obra: 0, disponivel: 0, manutencao: 0 };
    for (const p of data as any[]) {
      if (p.status === "em_obra") s.em_obra++;
      else if (p.status === "disponivel") s.disponivel++;
      else if (p.status === "manutencao") s.manutencao++;
    }
    return s;
  }, [data]);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HardHat className="h-6 w-6 text-blue-600" /> Equipamentos Próprios
            </h1>
            <p className="text-sm text-slate-600">Cadastro unitário do parque próprio da empresa.</p>
          </div>
          <button onClick={abrirNovo} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm">
            <Plus className="h-4 w-4" /> Novo
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Stat title="Total" value={stats.total} color="text-slate-800" />
          <Stat title="Em obra" value={stats.em_obra} color="text-blue-700" />
          <Stat title="Disponíveis" value={stats.disponivel} color="text-emerald-700" />
          <Stat title="Manutenção" value={stats.manutencao} color="text-amber-700" />
        </div>

        <div className="bg-white border rounded-lg shadow-sm p-3 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por descrição, patrimônio, série…"
              className="w-full pl-9 pr-3 py-2 border rounded text-sm" />
          </div>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="px-3 py-2 border rounded text-sm">
            <option value="">Todos os status</option>
            <option value="disponivel">Disponíveis</option>
            <option value="em_obra">Em obra</option>
            <option value="manutencao">Manutenção</option>
            <option value="baixado">Baixados</option>
          </select>
        </div>

        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Spinner /></div>
          ) : data.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Nenhum equipamento cadastrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs text-slate-600 uppercase">
                  <th className="px-3 py-2">Foto</th>
                  <th className="px-3 py-2">Patrimônio</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Valor aquis.</th>
                  <th className="px-3 py-2">Aquisição</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(data as any[]).map(p => {
                  const fotos = (p.fotosJson as FotoItem[]) || [];
                  return (
                    <tr key={p.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2">
                        {fotos[0]
                          ? <img src={fotos[0].url} className="w-10 h-10 object-cover rounded" />
                          : <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-400 text-xs">—</div>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{p.codigoPatrimonio}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{p.descricao}</td>
                      <td className="px-3 py-2 text-slate-600">{p.categoria || "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[p.status] || "bg-slate-100"}`}>
                          {STATUS_LABELS[p.status] || p.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{p.valorAquisicao ? fmtMoney(p.valorAquisicao) : "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{fmtDate(p.dataAquisicao)}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => abrirEdit(p)} className="text-blue-600 hover:bg-blue-50 p-1 rounded">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">{editingId ? "Editar Equipamento" : "Novo Equipamento Próprio"}</h2>
              <button onClick={() => setModal(false)}><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Patrimônio*" disabled={!!editingId}>
                  <input value={form.codigoPatrimonio} disabled={!!editingId}
                    onChange={e => setForm(p => ({ ...p, codigoPatrimonio: e.target.value }))}
                    className="w-full px-2 py-1.5 border rounded text-sm disabled:bg-slate-100" />
                </Field>
                <Field label="N° Série">
                  <input value={form.numeroSerie} disabled={!!editingId}
                    onChange={e => setForm(p => ({ ...p, numeroSerie: e.target.value }))}
                    className="w-full px-2 py-1.5 border rounded text-sm disabled:bg-slate-100" />
                </Field>
              </div>
              <Field label="Descrição*">
                <input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                  className="w-full px-2 py-1.5 border rounded text-sm" />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Categoria">
                  <input value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
                    placeholder="andaime, betoneira…"
                    className="w-full px-2 py-1.5 border rounded text-sm" />
                </Field>
                <Field label="Marca">
                  <input value={form.marca} onChange={e => setForm(p => ({ ...p, marca: e.target.value }))}
                    className="w-full px-2 py-1.5 border rounded text-sm" />
                </Field>
                <Field label="Modelo">
                  <input value={form.modelo} onChange={e => setForm(p => ({ ...p, modelo: e.target.value }))}
                    className="w-full px-2 py-1.5 border rounded text-sm" />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Data Aquisição">
                  <input type="date" value={form.dataAquisicao} disabled={!!editingId}
                    onChange={e => setForm(p => ({ ...p, dataAquisicao: e.target.value }))}
                    className="w-full px-2 py-1.5 border rounded text-sm disabled:bg-slate-100" />
                </Field>
                <Field label="Valor (R$)">
                  <input value={form.valorAquisicao} onChange={e => setForm(p => ({ ...p, valorAquisicao: e.target.value }))}
                    placeholder="0,00" className="w-full px-2 py-1.5 border rounded text-sm" />
                </Field>
                <Field label="Vida útil (meses)">
                  <input value={form.vidaUtilMeses} onChange={e => setForm(p => ({ ...p, vidaUtilMeses: e.target.value }))}
                    placeholder="ex: 84" className="w-full px-2 py-1.5 border rounded text-sm" />
                </Field>
              </div>
              <Field label="Observações">
                <textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                  rows={2} className="w-full px-2 py-1.5 border rounded text-sm" />
              </Field>
              <FotosUploader fotos={fotos} onChange={setFotos} label="Fotos do equipamento" />
            </div>
            <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-end gap-2">
              <button onClick={() => setModal(false)} className="px-3 py-1.5 text-sm border rounded">Cancelar</button>
              <button onClick={salvar} disabled={criar.isPending || atualizar.isPending}
                className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50">
                {criar.isPending || atualizar.isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function Stat({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="bg-white border rounded-lg shadow-sm p-3">
      <div className="text-xs text-slate-500 uppercase">{title}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
function Field({ label, children, disabled }: { label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div>
      <label className={`block text-xs font-medium mb-1 ${disabled ? "text-slate-400" : "text-slate-700"}`}>{label}</label>
      {children}
    </div>
  );
}
