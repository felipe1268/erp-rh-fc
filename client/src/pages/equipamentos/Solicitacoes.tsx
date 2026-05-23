import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Plus, FileText, X, CheckCircle2, ShieldCheck } from "lucide-react";
import { fmtDate, fmtMoney, Spinner } from "./_shared";

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-700",
  analisada: "bg-blue-100 text-blue-700",
  aprovada: "bg-emerald-100 text-emerald-700",
  rejeitada: "bg-red-100 text-red-700",
  concluida: "bg-slate-200 text-slate-700",
  cancelada: "bg-slate-100 text-slate-500",
};

const EMPTY = {
  descricaoEquipamento: "", categoria: "", quantidade: "1",
  dataInicioUso: new Date().toISOString().slice(0, 10), dataFimUso: "",
  duracaoMeses: "", valorEstimado: "", recomendacaoErp: "" as "" | "USAR_PROPRIO" | "LOCAR" | "COMPRAR",
};

export default function SolicitacoesEquipamento() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;
  const [filtroStatus, setFiltroStatus] = useState<string>("");

  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.equipamentos.solicitacoesListar.useQuery(
    { companyId, status: (filtroStatus as any) || undefined },
    { enabled: !!companyId }
  );

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [modalDec, setModalDec] = useState<any>(null);
  const [decFinal, setDecFinal] = useState<"USAR_PROPRIO" | "LOCAR" | "COMPRAR">("LOCAR");
  const [decJust, setDecJust] = useState("");

  const criar = trpc.equipamentos.solicitacaoCriar.useMutation({
    onSuccess: (r) => { utils.equipamentos.solicitacoesListar.invalidate(); setModal(false); setForm({ ...EMPTY }); toast.success(`SE ${r.numero} criada!`); },
    onError: (e) => toast.error(e.message),
  });
  const decidir = trpc.equipamentos.solicitacaoDecidir.useMutation({
    onSuccess: (r) => {
      utils.equipamentos.solicitacoesListar.invalidate(); setModalDec(null);
      if (r.precisaAprovacao) toast.warning("Decisão registrada — precisa aprovação por exceder alçada.");
      else toast.success(r.decisaoOverride ? "Override aprovado automaticamente." : "Decisão registrada.");
    },
    onError: (e) => toast.error(e.message),
  });
  const aprovarOverride = trpc.equipamentos.solicitacaoAprovarOverride.useMutation({
    onSuccess: () => { utils.equipamentos.solicitacoesListar.invalidate(); toast.success("Override aprovado."); },
    onError: (e) => toast.error(e.message),
  });

  function salvar() {
    if (!form.descricaoEquipamento.trim()) return toast.error("Descrição é obrigatória.");
    if (!form.dataFimUso) return toast.error("Data fim é obrigatória.");
    const valor = parseFloat(form.valorEstimado.replace(",", ".")) || 0;
    criar.mutate({
      companyId,
      descricaoEquipamento: form.descricaoEquipamento,
      categoria: form.categoria || undefined,
      quantidade: parseInt(form.quantidade) || 1,
      dataInicioUso: form.dataInicioUso,
      dataFimUso: form.dataFimUso,
      duracaoMeses: parseFloat(form.duracaoMeses.replace(",", ".")) || undefined,
      recomendacaoErp: form.recomendacaoErp || undefined,
      analiseCapex: valor > 0 ? { valorEstimado: valor } : undefined,
    });
  }
  function decidirSE() {
    decidir.mutate({
      companyId, id: modalDec.id, decisaoFinal: decFinal,
      decisaoJustificativa: decJust || undefined,
    });
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-6 w-6 text-purple-600" /> Solicitações de Equipamento
            </h1>
            <p className="text-sm text-slate-600">SE — fluxo CAPEX (USAR PRÓPRIO / LOCAR / COMPRAR).</p>
          </div>
          <button onClick={() => { setForm({ ...EMPTY }); setModal(true); }}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded shadow-sm">
            <Plus className="h-4 w-4" /> Nova SE
          </button>
        </div>

        <div className="bg-white border rounded-lg shadow-sm p-3">
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="px-3 py-2 border rounded text-sm">
            <option value="">Todos os status</option>
            <option value="pendente">Pendentes</option>
            <option value="analisada">Aguardando aprovação</option>
            <option value="aprovada">Aprovadas</option>
            <option value="rejeitada">Rejeitadas</option>
          </select>
        </div>

        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          {isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> :
            data.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhuma SE.</div> : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs text-slate-600 uppercase">
                  <th className="px-3 py-2">N°</th>
                  <th className="px-3 py-2">Equipamento</th>
                  <th className="px-3 py-2">Uso</th>
                  <th className="px-3 py-2">Recom. ERP</th>
                  <th className="px-3 py-2">Decisão</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(data as any[]).map(s => {
                  const capex = s.analiseCapexJson || {};
                  const valor = Number(capex.valorEstimado || 0);
                  return (
                    <tr key={s.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs">{s.numero}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{s.descricaoEquipamento}</div>
                        <div className="text-xs text-slate-500">
                          {s.categoria || "—"} · qtd {s.quantidade} {valor > 0 && `· ${fmtMoney(valor)}`}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {fmtDate(s.dataInicioUso)} → {fmtDate(s.dataFimUso)}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700">{s.recomendacaoErp || "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {s.decisaoFinal ? (
                          <span>
                            <b className="text-slate-800">{s.decisaoFinal}</b>
                            {s.decisaoOverride && <span className="ml-1 text-amber-700">⚠ override</span>}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[s.status] || "bg-slate-100"}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {s.status === "pendente" && (
                          <button onClick={() => {
                            setModalDec(s);
                            setDecFinal((s.recomendacaoErp as any) || "LOCAR");
                            setDecJust("");
                          }} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">
                            Decidir
                          </button>
                        )}
                        {s.status === "analisada" && (
                          <button onClick={() => aprovarOverride.mutate({ companyId, id: s.id })}
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded inline-flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" /> Aprovar
                          </button>
                        )}
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
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Nova Solicitação de Equipamento</h2>
              <button onClick={() => setModal(false)}><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            <div className="p-5 space-y-3">
              <F label="Descrição*"><input value={form.descricaoEquipamento} onChange={e => setForm(p => ({ ...p, descricaoEquipamento: e.target.value }))} className="inp" /></F>
              <div className="grid grid-cols-2 gap-3">
                <F label="Categoria"><input value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} className="inp" /></F>
                <F label="Quantidade"><input value={form.quantidade} onChange={e => setForm(p => ({ ...p, quantidade: e.target.value }))} className="inp" /></F>
                <F label="Data início*"><input type="date" value={form.dataInicioUso} onChange={e => setForm(p => ({ ...p, dataInicioUso: e.target.value }))} className="inp" /></F>
                <F label="Data fim*"><input type="date" value={form.dataFimUso} onChange={e => setForm(p => ({ ...p, dataFimUso: e.target.value }))} className="inp" /></F>
                <F label="Duração (meses)"><input value={form.duracaoMeses} onChange={e => setForm(p => ({ ...p, duracaoMeses: e.target.value }))} className="inp" /></F>
                <F label="Valor estimado (R$)"><input value={form.valorEstimado} onChange={e => setForm(p => ({ ...p, valorEstimado: e.target.value }))} placeholder="0,00" className="inp" /></F>
              </div>
              <F label="Recomendação ERP (opcional)">
                <select value={form.recomendacaoErp} onChange={e => setForm(p => ({ ...p, recomendacaoErp: e.target.value as any }))} className="inp">
                  <option value="">— Sem recomendação prévia —</option>
                  <option value="USAR_PROPRIO">USAR PRÓPRIO</option>
                  <option value="LOCAR">LOCAR</option>
                  <option value="COMPRAR">COMPRAR</option>
                </select>
              </F>
            </div>
            <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-end gap-2">
              <button onClick={() => setModal(false)} className="px-3 py-1.5 text-sm border rounded">Cancelar</button>
              <button onClick={salvar} disabled={criar.isPending}
                className="px-4 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50">
                {criar.isPending ? "Salvando…" : "Criar SE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalDec && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalDec(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Decidir SE {modalDec.numero}</h2>
              <button onClick={() => setModalDec(null)}><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm text-slate-700">{modalDec.descricaoEquipamento}</div>
              {modalDec.recomendacaoErp && (
                <div className="text-xs bg-blue-50 text-blue-800 p-2 rounded">
                  Recomendação ERP: <b>{modalDec.recomendacaoErp}</b>
                </div>
              )}
              <F label="Decisão final*">
                <select value={decFinal} onChange={e => setDecFinal(e.target.value as any)} className="inp">
                  <option value="USAR_PROPRIO">USAR PRÓPRIO</option>
                  <option value="LOCAR">LOCAR</option>
                  <option value="COMPRAR">COMPRAR</option>
                </select>
              </F>
              {modalDec.recomendacaoErp && decFinal !== modalDec.recomendacaoErp && (
                <div className="text-xs bg-amber-50 text-amber-800 p-2 rounded">
                  ⚠ Override da recomendação ERP. Acima da alçada exigirá aprovação adicional.
                </div>
              )}
              <F label="Justificativa">
                <textarea value={decJust} onChange={e => setDecJust(e.target.value)} rows={3} className="inp" />
              </F>
            </div>
            <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-end gap-2">
              <button onClick={() => setModalDec(null)} className="px-3 py-1.5 text-sm border rounded">Cancelar</button>
              <button onClick={decidirSE} disabled={decidir.isPending}
                className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 inline-flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> {decidir.isPending ? "Salvando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`.inp{width:100%;padding:6px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:14px}`}</style>
    </DashboardLayout>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium mb-1 text-slate-700">{label}</label>{children}</div>;
}
