import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Plus, Search, X, Truck, CheckCircle2, RotateCcw, ClipboardCheck, Eye } from "lucide-react";
import { FotosUploader, FotoItem, fmtMoney, fmtDate, Spinner } from "./_shared";

const STATUS_LABELS: Record<string, string> = {
  em_uso: "Em uso", devolvido: "Devolvido", atrasado: "Atrasado",
  em_renovacao: "Em renovação", localizacao_pendente: "Local pendente", em_manutencao: "Manutenção",
};
const STATUS_COLORS: Record<string, string> = {
  em_uso: "bg-blue-100 text-blue-700",
  devolvido: "bg-slate-200 text-slate-700",
  atrasado: "bg-red-100 text-red-700",
  em_renovacao: "bg-amber-100 text-amber-700",
  localizacao_pendente: "bg-orange-100 text-orange-700",
  em_manutencao: "bg-purple-100 text-purple-700",
};

const EMPTY = {
  descricao: "", categoria: "", fornecedorNome: "",
  codigoPatrimonioFornecedor: "", codigoInternoErp: "", numeroSerie: "",
  dataInicio: new Date().toISOString().slice(0, 10),
  dataFimPrevista: "",
  valorDiario: "", valorMensal: "",
  funcionarioResponsavelNome: "",
  observacoes: "",
};

export default function EquipamentosLocados() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("em_uso");

  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.equipamentos.locadosListar.useQuery(
    { companyId, busca: busca || undefined, status: filtroStatus || undefined },
    { enabled: !!companyId }
  );

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [fotos, setFotos] = useState<FotoItem[]>([]);

  const [modalDev, setModalDev] = useState<any>(null);
  const [devFotos, setDevFotos] = useState<FotoItem[]>([]);
  const [devData, setDevData] = useState(new Date().toISOString().slice(0, 10));
  const [devObs, setDevObs] = useState("");

  const [modalCheckin, setModalCheckin] = useState<any>(null);
  const [checkinObs, setCheckinObs] = useState("");

  const [modalEventos, setModalEventos] = useState<any>(null);
  const eventos = trpc.equipamentos.eventosListar.useQuery(
    { companyId, equipamentoLocadoId: modalEventos?.id || 0 },
    { enabled: !!modalEventos }
  );

  const criar = trpc.equipamentos.locadoCriar.useMutation({
    onSuccess: () => { utils.equipamentos.locadosListar.invalidate(); setModal(false); setForm({ ...EMPTY }); setFotos([]); toast.success("Equipamento locado cadastrado!"); },
    onError: (e) => toast.error(e.message),
  });
  const devolver = trpc.equipamentos.locadoDevolver.useMutation({
    onSuccess: () => { utils.equipamentos.locadosListar.invalidate(); setModalDev(null); setDevFotos([]); toast.success("Equipamento devolvido."); },
    onError: (e) => toast.error(e.message),
  });
  const checkIn = trpc.equipamentos.locadoCheckIn.useMutation({
    onSuccess: () => { utils.equipamentos.locadosListar.invalidate(); setModalCheckin(null); setCheckinObs(""); toast.success("Check-in registrado."); },
    onError: (e) => toast.error(e.message),
  });

  function salvar() {
    if (!form.descricao.trim()) return toast.error("Descrição é obrigatória.");
    if (!form.dataFimPrevista) return toast.error("Data fim prevista é obrigatória.");
    if (fotos.length === 0) return toast.error("Foto de recebimento é obrigatória.");
    criar.mutate({
      companyId,
      descricao: form.descricao,
      categoria: form.categoria || undefined,
      fornecedorNome: form.fornecedorNome || undefined,
      codigoPatrimonioFornecedor: form.codigoPatrimonioFornecedor || undefined,
      codigoInternoErp: form.codigoInternoErp || undefined,
      numeroSerie: form.numeroSerie || undefined,
      dataInicio: form.dataInicio,
      dataFimPrevista: form.dataFimPrevista,
      valorDiario: parseFloat(form.valorDiario.replace(",", ".")) || undefined,
      valorMensal: parseFloat(form.valorMensal.replace(",", ".")) || undefined,
      funcionarioResponsavelNome: form.funcionarioResponsavelNome || undefined,
      observacoes: form.observacoes || undefined,
      fotosRecebimento: fotos,
    });
  }
  function fazerDevolucao() {
    if (devFotos.length === 0) return toast.error("Foto de devolução é obrigatória.");
    devolver.mutate({
      companyId, id: modalDev.id, dataFimReal: devData,
      fotosDevolucao: devFotos, observacao: devObs || undefined,
    });
  }
  function fazerCheckIn() {
    checkIn.mutate({ companyId, id: modalCheckin.id, observacao: checkinObs || undefined });
  }

  const stats = useMemo(() => {
    const s = { ativos: 0, vencendo: 0, atrasados: 0, valorMes: 0 };
    const hoje = Date.now();
    const limite30 = hoje + 30 * 86400 * 1000;
    for (const l of data as any[]) {
      if (l.status === "em_uso") {
        s.ativos++;
        s.valorMes += Number(l.valorMensal) || 0;
        const fim = new Date(l.dataFimPrevista).getTime();
        if (fim < hoje) s.atrasados++;
        else if (fim < limite30) s.vencendo++;
      }
    }
    return s;
  }, [data]);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Truck className="h-6 w-6 text-emerald-600" /> Equipamentos Locados
            </h1>
            <p className="text-sm text-slate-600">Rastreio de equipamentos em locação. Foto obrigatória no recebimento e devolução.</p>
          </div>
          <button onClick={() => { setForm({ ...EMPTY }); setFotos([]); setModal(true); }}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded shadow-sm">
            <Plus className="h-4 w-4" /> Receber locação
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Stat title="Ativos" value={stats.ativos} color="text-blue-700" />
          <Stat title="Vencendo (30d)" value={stats.vencendo} color="text-amber-700" />
          <Stat title="Atrasados" value={stats.atrasados} color="text-red-700" />
          <Stat title="R$ / mês" value={fmtMoney(stats.valorMes)} color="text-slate-800" small />
        </div>

        <div className="bg-white border rounded-lg shadow-sm p-3 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…"
              className="w-full pl-9 pr-3 py-2 border rounded text-sm" />
          </div>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="px-3 py-2 border rounded text-sm">
            <option value="">Todos</option>
            <option value="em_uso">Em uso</option>
            <option value="devolvido">Devolvidos</option>
            <option value="atrasado">Atrasados</option>
            <option value="em_renovacao">Em renovação</option>
          </select>
        </div>

        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          {isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> :
            data.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhum equipamento locado.</div> : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs text-slate-600 uppercase">
                  <th className="px-3 py-2">Foto</th>
                  <th className="px-3 py-2">Equipamento</th>
                  <th className="px-3 py-2">Fornecedor</th>
                  <th className="px-3 py-2">Início → Fim previsto</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">R$/mês</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(data as any[]).map(l => {
                  const fotos = (l.fotosRecebimentoJson as FotoItem[]) || [];
                  return (
                    <tr key={l.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2">
                        {fotos[0] ? <img src={fotos[0].url} className="w-10 h-10 object-cover rounded" />
                          : <div className="w-10 h-10 rounded bg-slate-100" />}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{l.descricao}</div>
                        <div className="text-xs text-slate-500">{l.categoria || "—"} · {l.codigoPatrimonioFornecedor || "s/ patr."}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{l.fornecedorNome || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {fmtDate(l.dataInicio)} → <b>{fmtDate(l.dataFimPrevista)}</b>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[l.status] || "bg-slate-100"}`}>
                          {STATUS_LABELS[l.status] || l.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{fmtMoney(l.valorMensal)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setModalEventos(l)} className="text-slate-600 hover:bg-slate-100 p-1 rounded" title="Histórico">
                            <Eye className="h-4 w-4" />
                          </button>
                          {l.status === "em_uso" && (
                            <>
                              <button onClick={() => { setModalCheckin(l); setCheckinObs(""); }} className="text-blue-600 hover:bg-blue-50 p-1 rounded" title="Check-in semanal">
                                <ClipboardCheck className="h-4 w-4" />
                              </button>
                              <button onClick={() => { setModalDev(l); setDevFotos([]); setDevObs(""); setDevData(new Date().toISOString().slice(0, 10)); }}
                                className="text-emerald-600 hover:bg-emerald-50 p-1 rounded" title="Devolver">
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal receber locação */}
      {modal && (
        <Modal title="Receber Locação" onClose={() => setModal(false)} onSave={salvar} loading={criar.isPending}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Descrição*"><input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} className="inp" /></Field>
            <Field label="Categoria"><input value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} className="inp" /></Field>
            <Field label="Fornecedor"><input value={form.fornecedorNome} onChange={e => setForm(p => ({ ...p, fornecedorNome: e.target.value }))} className="inp" /></Field>
            <Field label="Patrim. fornecedor"><input value={form.codigoPatrimonioFornecedor} onChange={e => setForm(p => ({ ...p, codigoPatrimonioFornecedor: e.target.value }))} className="inp" /></Field>
            <Field label="N° série"><input value={form.numeroSerie} onChange={e => setForm(p => ({ ...p, numeroSerie: e.target.value }))} className="inp" /></Field>
            <Field label="Código interno ERP"><input value={form.codigoInternoErp} onChange={e => setForm(p => ({ ...p, codigoInternoErp: e.target.value }))} className="inp" /></Field>
            <Field label="Data início*"><input type="date" value={form.dataInicio} onChange={e => setForm(p => ({ ...p, dataInicio: e.target.value }))} className="inp" /></Field>
            <Field label="Data fim prevista*"><input type="date" value={form.dataFimPrevista} onChange={e => setForm(p => ({ ...p, dataFimPrevista: e.target.value }))} className="inp" /></Field>
            <Field label="Valor diário"><input value={form.valorDiario} onChange={e => setForm(p => ({ ...p, valorDiario: e.target.value }))} placeholder="0,00" className="inp" /></Field>
            <Field label="Valor mensal"><input value={form.valorMensal} onChange={e => setForm(p => ({ ...p, valorMensal: e.target.value }))} placeholder="0,00" className="inp" /></Field>
          </div>
          <Field label="Funcionário responsável">
            <input value={form.funcionarioResponsavelNome} onChange={e => setForm(p => ({ ...p, funcionarioResponsavelNome: e.target.value }))} className="inp" />
          </Field>
          <Field label="Observações">
            <textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} className="inp" />
          </Field>
          <FotosUploader fotos={fotos} onChange={setFotos} label="Fotos de recebimento" required />
        </Modal>
      )}

      {/* Modal devolução */}
      {modalDev && (
        <Modal title={`Devolver: ${modalDev.descricao}`} onClose={() => setModalDev(null)} onSave={fazerDevolucao}
          saveLabel="Confirmar devolução" loading={devolver.isPending}>
          <Field label="Data devolução*">
            <input type="date" value={devData} onChange={e => setDevData(e.target.value)} className="inp" />
          </Field>
          <Field label="Observação">
            <textarea value={devObs} onChange={e => setDevObs(e.target.value)} rows={2} className="inp" />
          </Field>
          <FotosUploader fotos={devFotos} onChange={setDevFotos} label="Fotos de devolução" required />
        </Modal>
      )}

      {/* Modal check-in */}
      {modalCheckin && (
        <Modal title={`Check-in: ${modalCheckin.descricao}`} onClose={() => setModalCheckin(null)} onSave={fazerCheckIn}
          saveLabel="Confirmar presença" loading={checkIn.isPending}>
          <p className="text-sm text-slate-600">
            Confirma que o equipamento <b>está fisicamente na obra</b> nesta semana?
          </p>
          <Field label="Observação (opcional)">
            <textarea value={checkinObs} onChange={e => setCheckinObs(e.target.value)} rows={2} className="inp" />
          </Field>
        </Modal>
      )}

      {/* Modal eventos */}
      {modalEventos && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalEventos(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Histórico — {modalEventos.descricao}</h2>
              <button onClick={() => setModalEventos(null)}><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            <div className="p-5 space-y-2">
              {eventos.isLoading ? <Spinner /> :
                (eventos.data || []).length === 0 ? <div className="text-sm text-slate-500">Sem eventos.</div> :
                (eventos.data || []).map((e: any) => (
                  <div key={e.id} className="border rounded p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-blue-700">{e.tipo}</span>
                      <span className="text-xs text-slate-500">{new Date(e.dataEvento).toLocaleString("pt-BR")}</span>
                    </div>
                    {e.observacao && <div className="text-slate-700 mt-1">{e.observacao}</div>}
                    {e.usuarioNome && <div className="text-xs text-slate-500 mt-1">por {e.usuarioNome}</div>}
                    {Array.isArray(e.fotosJson) && e.fotosJson.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {e.fotosJson.slice(0, 4).map((f: any, i: number) => (
                          <img key={i} src={f.url} className="w-12 h-12 object-cover rounded" />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
      <style>{`.inp{width:100%;padding:6px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:14px}`}</style>
    </DashboardLayout>
  );
}

function Stat({ title, value, color, small }: { title: string; value: any; color: string; small?: boolean }) {
  return (
    <div className="bg-white border rounded-lg shadow-sm p-3">
      <div className="text-xs text-slate-500 uppercase">{title}</div>
      <div className={`${small ? "text-lg" : "text-2xl"} font-bold ${color}`}>{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1 text-slate-700">{label}</label>
      {children}
    </div>
  );
}
function Modal({ title, onClose, onSave, children, saveLabel = "Salvar", loading }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-500" /></button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
        <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded">Cancelar</button>
          <button onClick={onSave} disabled={loading} className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 inline-flex items-center gap-1">
            {loading ? "Salvando…" : <><CheckCircle2 className="h-4 w-4" /> {saveLabel}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
