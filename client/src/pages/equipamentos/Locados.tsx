import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Plus, Search, X, Truck, CheckCircle2, RotateCcw, ClipboardCheck, Eye, FileText, Upload, Sparkles, Trash2 } from "lucide-react";
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

  // Rev. 2308 — Importação em lote via PDF da locadora (Gemini Vision)
  const [modalImport, setModalImport] = useState(false);
  const [importArquivo, setImportArquivo] = useState<{ nome: string; mimeType: string; base64: string } | null>(null);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const parsearPdf = trpc.equipamentos.parsearContratoLocacaoPdf.useMutation({
    onSuccess: (res) => {
      setImportPreview(res.contratos);
      toast.success(`IA detectou ${res.totalContratos} contrato(s) · ${res.totalItens} item(ns).`);
    },
    onError: (e) => toast.error(e.message),
  });
  const importarLote = trpc.equipamentos.importarContratosLocacaoLote.useMutation({
    onSuccess: (res) => {
      utils.equipamentos.locadosListar.invalidate();
      toast.success(`${res.contratosImportados} contrato(s) e ${res.itensImportados} item(ns) cadastrados.`);
      setModalImport(false); setImportArquivo(null); setImportPreview(null);
    },
    onError: (e) => toast.error(e.message),
  });

  function abrirImportar() {
    setImportArquivo(null);
    setImportPreview(null);
    setModalImport(true);
  }
  async function handlePdfPick(file: File) {
    if (file.size > 15 * 1024 * 1024) return toast.error("Arquivo > 15MB. Reduza ou divida o PDF.");
    const okMimes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!okMimes.includes(file.type)) return toast.error("Formato não suportado. Use PDF, JPG, PNG ou WEBP.");
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    setImportArquivo({ nome: file.name, mimeType: file.type, base64 });
    setImportPreview(null);
    parsearPdf.mutate({ companyId, pdfBase64: base64, mimeType: file.type as any, nomeArquivo: file.name });
  }
  function confirmarImport() {
    if (!importPreview || importPreview.length === 0) return;
    const limpos = importPreview
      .filter(c => c.numeroContrato && c.periodoInicio && c.periodoFim && c.itens?.length)
      .map(c => ({
        numeroContrato: String(c.numeroContrato).slice(0, 50),
        fornecedorNome: c.fornecedorNome ? String(c.fornecedorNome).slice(0, 255) : undefined,
        localObra: c.localObra ? String(c.localObra) : undefined,
        periodoInicio: c.periodoInicio,
        periodoFim: c.periodoFim,
        valorTotal: Number(c.valorTotal) || undefined,
        atendenteResponsavel: c.atendenteResponsavel ? String(c.atendenteResponsavel).slice(0, 255) : undefined,
        itens: c.itens.map((it: any) => ({
          patrimonio: it.patrimonio ? String(it.patrimonio).slice(0, 100) : undefined,
          descricao: String(it.descricao || "").slice(0, 255),
          quantidade: Math.max(1, parseInt(String(it.quantidade)) || 1),
          subtotal: Number(it.subtotal) || undefined,
        })).filter((it: any) => it.descricao),
      }))
      .filter(c => c.itens.length > 0);
    if (limpos.length === 0) return toast.error("Nenhum contrato válido após revisão.");
    importarLote.mutate({ companyId, nomeArquivo: importArquivo?.nome, contratos: limpos });
  }
  function removerContratoPreview(idx: number) {
    setImportPreview(prev => prev ? prev.filter((_, i) => i !== idx) : prev);
  }
  function removerItemPreview(ci: number, ii: number) {
    setImportPreview(prev => prev ? prev.map((c, i) => i === ci ? { ...c, itens: c.itens.filter((_: any, j: number) => j !== ii) } : c) : prev);
  }
  function updateContratoField(ci: number, field: string, value: any) {
    setImportPreview(prev => prev ? prev.map((c, i) => i === ci ? { ...c, [field]: value } : c) : prev);
  }
  function updateItemField(ci: number, ii: number, field: string, value: any) {
    setImportPreview(prev => prev ? prev.map((c, i) => i === ci ? {
      ...c, itens: c.itens.map((it: any, j: number) => j === ii ? { ...it, [field]: value } : it)
    } : c) : prev);
  }

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
          <div className="flex items-center gap-2">
            <button onClick={abrirImportar}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded shadow-sm" title="Importar PDF de relatório da locadora (Jalves, Mills, etc.) — a IA detecta o layout e cadastra em lote">
              <Sparkles className="h-4 w-4" /> Importar PDF (IA)
            </button>
            <button onClick={() => { setForm({ ...EMPTY }); setFotos([]); setModal(true); }}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded shadow-sm">
              <Plus className="h-4 w-4" /> Receber locação
            </button>
          </div>
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
      {/* Rev. 2308 — Modal Importar PDF da locadora (IA detecta layout) */}
      {modalImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { if (!parsearPdf.isPending && !importarLote.isPending) setModalImport(false); }}>
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                <h2 className="font-semibold text-slate-800">Importar contratos de locação (PDF · IA)</h2>
              </div>
              <button onClick={() => setModalImport(false)} disabled={parsearPdf.isPending || importarLote.isPending}>
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {!importArquivo && (
                <div
                  onClick={() => importFileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handlePdfPick(f); }}
                  className="border-2 border-dashed border-indigo-300 rounded-lg p-10 text-center cursor-pointer hover:bg-indigo-50/50 transition"
                >
                  <Upload className="h-10 w-10 text-indigo-400 mx-auto mb-3" />
                  <div className="text-slate-700 font-medium">Arraste o PDF da locadora aqui</div>
                  <div className="text-xs text-slate-500 mt-1">ou clique para selecionar · PDF/JPG/PNG até 15MB</div>
                  <div className="text-[11px] text-slate-400 mt-3">A IA (Gemini) detecta automaticamente o layout — Jalves, Mills, Locamerica etc.</div>
                  <input ref={importFileRef} type="file" accept=".pdf,image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfPick(f); }} />
                </div>
              )}

              {importArquivo && (
                <div className="flex items-center justify-between bg-slate-50 border rounded p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    <span className="font-medium">{importArquivo.nome}</span>
                    <span className="text-xs text-slate-500">({(importArquivo.base64.length * 0.75 / 1024).toFixed(0)} KB)</span>
                  </div>
                  {!parsearPdf.isPending && (
                    <button onClick={() => { setImportArquivo(null); setImportPreview(null); }} className="text-xs text-red-600 hover:underline">Trocar arquivo</button>
                  )}
                </div>
              )}

              {parsearPdf.isPending && (
                <div className="flex items-center justify-center gap-3 py-8 text-indigo-600">
                  <Spinner />
                  <span className="text-sm">IA analisando layout do documento — isso leva 10–30s…</span>
                </div>
              )}

              {importPreview && importPreview.length > 0 && (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm text-emerald-800">
                    ✅ IA detectou <b>{importPreview.length}</b> contrato(s) totalizando <b>{importPreview.reduce((a, c) => a + (c.itens?.length || 0), 0)}</b> item(ns).
                    Revise os dados abaixo (campos são editáveis) e confirme.
                  </div>
                  <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                    {importPreview.map((c, ci) => (
                      <div key={ci} className="border rounded-lg overflow-hidden">
                        <div className="bg-indigo-50 px-3 py-2 grid grid-cols-12 gap-2 items-center text-xs">
                          <div className="col-span-2">
                            <label className="text-[10px] text-slate-500 uppercase block">Contrato</label>
                            <input value={c.numeroContrato || ""} onChange={e => updateContratoField(ci, "numeroContrato", e.target.value)} className="inp" />
                          </div>
                          <div className="col-span-3">
                            <label className="text-[10px] text-slate-500 uppercase block">Fornecedor</label>
                            <input value={c.fornecedorNome || ""} onChange={e => updateContratoField(ci, "fornecedorNome", e.target.value)} className="inp" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-slate-500 uppercase block">Início</label>
                            <input type="date" value={c.periodoInicio || ""} onChange={e => updateContratoField(ci, "periodoInicio", e.target.value)} className="inp" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-slate-500 uppercase block">Fim</label>
                            <input type="date" value={c.periodoFim || ""} onChange={e => updateContratoField(ci, "periodoFim", e.target.value)} className="inp" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-slate-500 uppercase block">Valor total</label>
                            <input type="number" step="0.01" value={c.valorTotal || ""} onChange={e => updateContratoField(ci, "valorTotal", parseFloat(e.target.value) || 0)} className="inp" />
                          </div>
                          <div className="col-span-1 text-right">
                            <button onClick={() => removerContratoPreview(ci)} className="text-red-600 hover:bg-red-50 p-1 rounded" title="Remover contrato">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {c.localObra && (
                            <div className="col-span-12 text-[11px] text-slate-600">📍 {c.localObra}</div>
                          )}
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr className="text-left text-[10px] text-slate-500 uppercase">
                              <th className="px-2 py-1 w-24">Patrim.</th>
                              <th className="px-2 py-1">Descrição</th>
                              <th className="px-2 py-1 w-16 text-right">Qtde</th>
                              <th className="px-2 py-1 w-24 text-right">Subtotal</th>
                              <th className="px-2 py-1 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(c.itens || []).map((it: any, ii: number) => (
                              <tr key={ii} className="border-t">
                                <td className="px-2 py-1"><input value={it.patrimonio || ""} onChange={e => updateItemField(ci, ii, "patrimonio", e.target.value)} className="inp" /></td>
                                <td className="px-2 py-1"><input value={it.descricao || ""} onChange={e => updateItemField(ci, ii, "descricao", e.target.value)} className="inp" /></td>
                                <td className="px-2 py-1"><input type="number" min={1} value={it.quantidade || 1} onChange={e => updateItemField(ci, ii, "quantidade", parseInt(e.target.value) || 1)} className="inp text-right" /></td>
                                <td className="px-2 py-1"><input type="number" step="0.01" value={it.subtotal || ""} onChange={e => updateItemField(ci, ii, "subtotal", parseFloat(e.target.value) || 0)} className="inp text-right" /></td>
                                <td className="px-2 py-1 text-right">
                                  <button onClick={() => removerItemPreview(ci, ii)} className="text-red-500 hover:bg-red-50 p-0.5 rounded" title="Remover item">
                                    <X className="h-3 w-3" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                {importPreview ? `Total: ${importPreview.length} contrato(s) · ${importPreview.reduce((a, c) => a + (c.itens?.length || 0), 0)} unidade(s) a cadastrar` : "Cadastro inicial — fotos serão exigidas nos próximos recebimentos."}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setModalImport(false)} disabled={parsearPdf.isPending || importarLote.isPending} className="px-3 py-1.5 text-sm border rounded">Cancelar</button>
                <button onClick={confirmarImport} disabled={!importPreview || importPreview.length === 0 || importarLote.isPending}
                  className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50 inline-flex items-center gap-1">
                  {importarLote.isPending ? "Cadastrando…" : <><CheckCircle2 className="h-4 w-4" /> Confirmar e cadastrar</>}
                </button>
              </div>
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
