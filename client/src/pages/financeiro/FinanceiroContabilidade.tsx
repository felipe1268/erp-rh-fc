// Rev. 3719 — Módulo Contabilidade: painel de documentos com abas antes do download
// Layout: padrão white-card com chips de mês (igual Conciliação Bancária)

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, Send,
  FileText, Download, RefreshCw, Archive,
  Receipt, Landmark, ShoppingCart, Plus, X, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL  = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                     "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

interface MesData {
  mes: number; label: string; futuro: boolean; status: string;
  envelopeId: number | null; envelopeStatus: string | null;
  enviadoEm: string | null; enviadoPorNome: string | null; observacoes: string | null;
  contagens: { nfse: number; nfe: number; extratos: number; ocs: number };
}

function statusDotColor(s: string) {
  if (s === "assinado") return "bg-green-500";
  if (s === "enviado")  return "bg-blue-500";
  if (s === "pendente") return "bg-amber-400";
  return "bg-gray-300";
}

function fmtDate(s: string | Date | null | undefined) {
  if (s == null) return "—";
  try {
    const d = s instanceof Date ? s : new Date(String(s).replace(" ", "T"));
    return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });
  }
  catch { return "—"; }
}

function fmtBRL(v: number | null | undefined) {
  if (v == null || isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type DocTab = "nfse" | "nfe" | "extrato" | "ocs";

// ── Painel de detalhe do mês ──────────────────────────────────────────────────
function PainelMes({
  mes, dados, ano, companyId, companyNome,
  onClose, onRefetch,
}: {
  mes: number; dados: MesData | null; ano: number;
  companyId: number; companyNome: string;
  onClose: () => void; onRefetch: () => void;
}) {
  const [tab, setTab] = useState<DocTab>("nfse");
  const [dlgEnvio, setDlgEnvio] = useState(false);
  const [dlgFCSign, setDlgFCSign] = useState(false);
  const [obsEnvio, setObsEnvio] = useState("");
  const [fcSignatarios, setFcSignatarios] = useState([
    { papel: "diretor" as const, ordemAssinatura: 1, nome: "", email: "", cargo: "Sócio Administrador", empresaNome: companyNome },
    { papel: "fornecedor" as const, ordemAssinatura: 2, nome: "Pronus Tributário", email: "contabil@pronustributario.com.br", cargo: "Contabilista", empresaNome: "Pronus Tributário" },
  ]);

  const docsQuery = trpc.contabilidade.getDocumentosMes.useQuery(
    { companyId, mes, ano },
    { enabled: !!companyId, staleTime: 60_000 }
  );

  const registrarMut = trpc.contabilidade.registrarEnvio.useMutation({
    onSuccess: () => { toast({ title: "Envio registrado!" }); setDlgEnvio(false); setObsEnvio(""); onRefetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const criarEnvMut = trpc.contabilidade.criarEnvelope.useMutation({
    onSuccess: (d) => { toast({ title: "Lista Mestre gerada!", description: `Envelope FCSign #${d.envelopeId}` }); setDlgFCSign(false); onRefetch(); },
    onError: (e) => toast({ title: "Erro ao criar envelope", description: e.message, variant: "destructive" }),
  });

  const syncMut = trpc.contabilidade.syncEnvelope.useMutation({
    onSuccess: (d) => { toast({ title: d.ok ? `Status: ${d.envelopeStatus}` : d.message ?? "OK" }); onRefetch(); },
  });

  const atualizarMut = trpc.contabilidade.atualizarStatus.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado!" }); onRefetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!dados) return null;

  const mesLabel = MESES_FULL[mes - 1];
  const cont = dados.contagens;
  const docs = docsQuery.data;

  const tabs: { id: DocTab; label: string; icon: React.ReactNode; count: number; color: string }[] = [
    { id: "nfse",    label: "NFS-e Emitidas",    icon: <Receipt className="w-3.5 h-3.5" />,    count: cont.nfse,     color: "text-violet-600" },
    { id: "nfe",     label: "NF-e Recebidas",     icon: <FileText className="w-3.5 h-3.5" />,   count: cont.nfe,      color: "text-blue-600" },
    { id: "extrato", label: "Extrato Bancário",   icon: <Landmark className="w-3.5 h-3.5" />,   count: cont.extratos, color: "text-green-600" },
    { id: "ocs",     label: "Ordens de Compra",   icon: <ShoppingCart className="w-3.5 h-3.5" />, count: cont.ocs,   color: "text-orange-600" },
  ];

  return (
    <div className="mt-4 border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className={cn("w-2.5 h-2.5 rounded-full", statusDotColor(dados.status))} />
          <span className="font-semibold text-slate-800">{mesLabel} / {ano}</span>
          <span className="text-xs text-slate-500 capitalize">— {dados.status}</span>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Abas de categorias */}
      <div className="flex gap-0 border-b border-slate-200 bg-white overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
              tab === t.id
                ? "border-indigo-500 text-indigo-700 bg-indigo-50"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            )}
          >
            {t.icon}
            {t.label}
            <span className={cn(
              "ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full",
              t.count > 0 ? cn("bg-opacity-10", t.color, t.color.replace("text-","bg-").replace("-600","-100")) : "bg-gray-100 text-gray-400"
            )}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      <div className="min-h-[220px]">
        {docsQuery.isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando documentos…</span>
          </div>
        ) : docsQuery.error ? (
          <div className="flex items-center justify-center py-12 text-red-500 text-sm">
            Erro ao carregar: {docsQuery.error.message}
          </div>
        ) : (
          <>
            {/* NFS-e Emitidas */}
            {tab === "nfse" && (
              <div>
                {!docs?.nfseEmitidas.length ? (
                  <p className="text-center text-slate-400 text-sm py-10">Nenhuma NFS-e emitida neste mês.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-6 px-4 py-2 bg-violet-50 border-b border-violet-100 text-xs">
                      <span className="font-semibold text-slate-600">{docs.nfseEmitidas.length} notas</span>
                      <span className="text-slate-500">Bruto: <strong className="text-slate-700">{fmtBRL(docs.nfseEmitidas.reduce((s: number, n: any) => s + (n.valor_bruto ?? 0), 0))}</strong></span>
                      <span className="text-slate-500">Líquido: <strong className="text-green-700">{fmtBRL(docs.nfseEmitidas.reduce((s: number, n: any) => s + (n.valor_liquido ?? 0), 0))}</strong></span>
                      <span className="text-slate-500">ISS: <strong className="text-slate-600">{fmtBRL(docs.nfseEmitidas.reduce((s: number, n: any) => s + (n.iss_retido ?? 0), 0))}</strong></span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                            <th className="text-left px-4 py-2 font-medium">Nº Nota</th>
                            <th className="text-left px-4 py-2 font-medium">Tomador</th>
                            <th className="text-left px-4 py-2 font-medium">Data</th>
                            <th className="text-right px-4 py-2 font-medium">Bruto</th>
                            <th className="text-right px-4 py-2 font-medium">Líquido</th>
                            <th className="text-right px-4 py-2 font-medium">ISS</th>
                            <th className="text-center px-4 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docs.nfseEmitidas.map((n: any, i: number) => (
                            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="px-4 py-2 font-medium text-indigo-700">{n.numero_nf || "—"}</td>
                              <td className="px-4 py-2 text-slate-700 max-w-[180px] truncate" title={n.tomador_razao_social}>{n.tomador_razao_social || "—"}</td>
                              <td className="px-4 py-2 text-slate-500">{fmtDate(n.data_emissao)}</td>
                              <td className="px-4 py-2 text-right text-slate-700">{fmtBRL(n.valor_bruto)}</td>
                              <td className="px-4 py-2 text-right text-green-700 font-medium">{fmtBRL(n.valor_liquido)}</td>
                              <td className="px-4 py-2 text-right text-slate-500">{fmtBRL(n.iss_retido)}</td>
                              <td className="px-4 py-2 text-center">
                                <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
                                  n.status === "conciliada" ? "bg-green-100 text-green-700" :
                                  n.status === "enviada"    ? "bg-blue-100 text-blue-700" :
                                  "bg-amber-50 text-amber-700"
                                )}>{n.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* NF-e Recebidas */}
            {tab === "nfe" && (
              <div>
                {!docs?.nfeRecebidas.length ? (
                  <p className="text-center text-slate-400 text-sm py-10">Nenhuma NF-e recebida neste mês.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-6 px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs">
                      <span className="font-semibold text-slate-600">{docs.nfeRecebidas.length} notas</span>
                      <span className="text-slate-500">Total: <strong className="text-blue-700">{fmtBRL(docs.nfeRecebidas.reduce((s: number, n: any) => s + (n.valor_bruto ?? 0), 0))}</strong></span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                            <th className="text-left px-4 py-2 font-medium">Nº Nota</th>
                            <th className="text-left px-4 py-2 font-medium">Emitente</th>
                            <th className="text-left px-4 py-2 font-medium">CNPJ</th>
                            <th className="text-left px-4 py-2 font-medium">Data</th>
                            <th className="text-right px-4 py-2 font-medium">Valor</th>
                            <th className="text-center px-4 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docs.nfeRecebidas.map((n: any, i: number) => (
                            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="px-4 py-2 font-medium text-blue-700">{n.numero_nf || "—"}</td>
                              <td className="px-4 py-2 text-slate-700 max-w-[160px] truncate" title={n.emitente_nome}>{n.emitente_nome || "—"}</td>
                              <td className="px-4 py-2 text-slate-500 font-mono">{n.emitente_cnpj || "—"}</td>
                              <td className="px-4 py-2 text-slate-500">{fmtDate(n.data_emissao)}</td>
                              <td className="px-4 py-2 text-right font-medium text-slate-700">{fmtBRL(n.valor_bruto)}</td>
                              <td className="px-4 py-2 text-center">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">{n.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Extrato Bancário */}
            {tab === "extrato" && (
              <div>
                {!docs?.extrato.length ? (
                  <p className="text-center text-slate-400 text-sm py-10">Nenhum extrato bancário importado neste mês.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-6 px-4 py-2 bg-green-50 border-b border-green-100 text-xs flex-wrap">
                      <span className="font-semibold text-slate-600">
                        {docs.extrato.length} linhas{cont.extratos > 300 ? ` (de ${cont.extratos} — ZIP inclui todas)` : ""}
                      </span>
                      <span className="text-slate-500">Saldo: <strong className={docs.extrato.reduce((s: number, e: any) => s + (e.valor ?? 0), 0) >= 0 ? "text-green-700" : "text-red-700"}>{fmtBRL(docs.extrato.reduce((s: number, e: any) => s + (e.valor ?? 0), 0))}</strong></span>
                      <span className="text-slate-500">Entradas: <strong className="text-green-700">{fmtBRL(docs.extrato.filter((e: any) => e.valor > 0).reduce((s: number, e: any) => s + e.valor, 0))}</strong></span>
                      <span className="text-slate-500">Saídas: <strong className="text-red-700">{fmtBRL(Math.abs(docs.extrato.filter((e: any) => e.valor < 0).reduce((s: number, e: any) => s + e.valor, 0)))}</strong></span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                            <th className="text-left px-4 py-2 font-medium">Data</th>
                            <th className="text-left px-4 py-2 font-medium">Conta</th>
                            <th className="text-left px-4 py-2 font-medium">Descrição</th>
                            <th className="text-right px-4 py-2 font-medium">Valor</th>
                            <th className="text-center px-4 py-2 font-medium">Conc.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docs.extrato.map((e: any, i: number) => (
                            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="px-4 py-1.5 text-slate-500">{fmtDate(e.data)}</td>
                              <td className="px-4 py-1.5 text-slate-500 max-w-[100px] truncate" title={e.conta_nome}>{e.conta_nome || e.banco || "—"}</td>
                              <td className="px-4 py-1.5 text-slate-700 max-w-[200px] truncate" title={e.descricao}>{e.descricao || "—"}</td>
                              <td className={cn("px-4 py-1.5 text-right font-medium",
                                e.valor >= 0 ? "text-green-700" : "text-red-700"
                              )}>
                                {fmtBRL(Math.abs(e.valor))}{e.valor < 0 ? " D" : " C"}
                              </td>
                              <td className="px-4 py-1.5 text-center">
                                {e.conciliado ? <span className="text-green-600">✓</span> : <span className="text-slate-300">–</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Ordens de Compra */}
            {tab === "ocs" && (
              <div>
                {!docs?.ocs.length ? (
                  <p className="text-center text-slate-400 text-sm py-10">Nenhuma ordem de compra neste mês.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-6 px-4 py-2 bg-orange-50 border-b border-orange-100 text-xs">
                      <span className="font-semibold text-slate-600">{docs.ocs.length} ordens</span>
                      <span className="text-slate-500">Total: <strong className="text-orange-700">{fmtBRL(docs.ocs.reduce((s: number, o: any) => s + (o.valor_total ?? 0), 0))}</strong></span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                            <th className="text-left px-4 py-2 font-medium">Nº OC</th>
                            <th className="text-left px-4 py-2 font-medium">Fornecedor</th>
                            <th className="text-left px-4 py-2 font-medium">Obra</th>
                            <th className="text-left px-4 py-2 font-medium">Data</th>
                            <th className="text-right px-4 py-2 font-medium">Total</th>
                            <th className="text-center px-4 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docs.ocs.map((o: any, i: number) => (
                            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="px-4 py-2 font-medium text-orange-700">{o.numero || "—"}</td>
                              <td className="px-4 py-2 text-slate-700 max-w-[160px] truncate" title={o.fornecedor}>{o.fornecedor || "—"}</td>
                              <td className="px-4 py-2 text-slate-500 max-w-[120px] truncate" title={o.obra_nome}>{o.obra_nome || "—"}</td>
                              <td className="px-4 py-2 text-slate-500">{fmtDate(o.created_at)}</td>
                              <td className="px-4 py-2 text-right font-medium text-slate-700">{fmtBRL(o.valor_total)}</td>
                              <td className="px-4 py-2 text-center">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-700">{o.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Rodapé: ações e downloads ─────────────────────────────────────── */}
      <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          {/* Downloads */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline" size="sm" className="gap-1.5 text-sm"
              onClick={() => window.open(`/api/download/pacote-contador?companyId=${companyId}&mes=${mes}&ano=${ano}`, "_blank")}
              disabled={dados.futuro || docsQuery.isLoading}
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              Baixar Pacote ZIP
            </Button>
            <Button
              variant="outline" size="sm" className="gap-1.5 text-sm"
              onClick={() => window.open(`/api/download/contabilidade-xlsx?companyId=${companyId}&mes=${mes}&ano=${ano}`, "_blank")}
              disabled={dados.futuro || docsQuery.isLoading}
            >
              <Download className="w-3.5 h-3.5 text-green-600" />
              Planilha XLSX
            </Button>
          </div>

          {/* Registro e FCSign */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Alterar status */}
            {!dados.futuro && (
              <div className="flex gap-1 items-center">
                {(["pendente","enviado","assinado"] as const).map(s => (
                  <button
                    key={s} type="button"
                    disabled={dados.status === s || atualizarMut.isPending}
                    onClick={() => atualizarMut.mutate({ companyId, mes, ano, status: s })}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-medium border transition-all",
                      dados.status === s
                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-default"
                        : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"
                    )}
                  >
                    {s === "pendente" ? "Pendente" : s === "enviado" ? "Enviado" : "Assinado"}
                  </button>
                ))}
              </div>
            )}

            <Button size="sm" className="gap-1.5 text-sm bg-blue-600 hover:bg-blue-700"
              onClick={() => setDlgEnvio(true)} disabled={dados.futuro}>
              <Send className="w-3.5 h-3.5" />
              {dados.status === "pendente" ? "Registrar Envio" : "Atualizar Envio"}
            </Button>

            <Button size="sm" variant="outline" className="gap-1.5 text-sm border-violet-300 text-violet-700 hover:bg-violet-50"
              onClick={() => setDlgFCSign(true)} disabled={dados.futuro}>
              <Plus className="w-3.5 h-3.5" />
              {dados.envelopeId ? "Novo FCSign" : "Gerar FCSign"}
            </Button>

            {dados.envelopeId && (
              <Button size="sm" variant="ghost" className="gap-1.5 text-sm text-slate-500"
                onClick={() => syncMut.mutate({ companyId, mes, ano })} disabled={syncMut.isPending}>
                <RefreshCw className={cn("w-3.5 h-3.5", syncMut.isPending && "animate-spin")} />
                Sync envelope
                {dados.envelopeStatus && <span className="text-xs text-slate-400">({dados.envelopeStatus})</span>}
              </Button>
            )}
          </div>
        </div>

        {/* Info envio */}
        {dados.enviadoEm && (
          <p className="mt-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded px-2.5 py-1.5">
            Enviado em {fmtDate(dados.enviadoEm)}{dados.enviadoPorNome ? ` por ${dados.enviadoPorNome}` : ""}
            {dados.observacoes ? ` — ${dados.observacoes}` : ""}
          </p>
        )}
      </div>

      {/* Dialog: Registrar Envio */}
      <Dialog open={dlgEnvio} onOpenChange={setDlgEnvio}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Envio — {mesLabel} / {ano}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">Confirma o envio dos documentos abaixo ao contador (Pronus Tributário)?</p>
            <ul className="text-sm text-slate-700 space-y-0.5 pl-4 list-disc">
              <li>{cont.nfse} NFS-e emitidas</li>
              <li>{cont.nfe} NF-e recebidas</li>
              <li>{cont.extratos} linhas de extrato bancário</li>
              <li>{cont.ocs} ordens de compra</li>
            </ul>
            <div>
              <Label>Observações (opcional)</Label>
              <Textarea value={obsEnvio} onChange={e => setObsEnvio(e.target.value)} rows={3} placeholder="Alguma observação…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgEnvio(false)}>Cancelar</Button>
            <Button onClick={() => registrarMut.mutate({ companyId, mes, ano, observacoes: obsEnvio || null })} disabled={registrarMut.isPending}>
              {registrarMut.isPending ? "Salvando…" : "Confirmar Envio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: FCSign */}
      <Dialog open={dlgFCSign} onOpenChange={setDlgFCSign}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lista Mestre FCSign — {mesLabel} / {ano}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">Gera um protocolo de entrega digital com assinatura eletrônica das partes.</p>
            <div className="space-y-3">
              {fcSignatarios.map((s, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase">{i === 0 ? "Signatário 1 — FC Engenharia" : "Signatário 2 — Contabilidade"}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Nome</Label>
                      <Input value={s.nome} onChange={e => setFcSignatarios(arr => arr.map((x,j) => j===i ? {...x,nome:e.target.value} : x))} placeholder="Nome completo" className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">E-mail</Label>
                      <Input type="email" value={s.email} onChange={e => setFcSignatarios(arr => arr.map((x,j) => j===i ? {...x,email:e.target.value} : x))} placeholder="email@exemplo.com" className="h-8 text-sm" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgFCSign(false)}>Cancelar</Button>
            <Button onClick={() => criarEnvMut.mutate({ companyId, mes, ano, nomeEmpresa: companyNome, contagens: cont, signatarios: fcSignatarios.filter(s => s.nome && s.email) })}
              disabled={criarEnvMut.isPending || fcSignatarios.filter(s => s.nome && s.email).length < 1}>
              {criarEnvMut.isPending ? "Gerando…" : "Gerar Envelope"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function FinanceiroContabilidade() {
  const { companyId, company } = useCompany();
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mesSel, setMesSel] = useState<number | null>(null);

  const anoQuery = trpc.contabilidade.getAno.useQuery(
    { companyId: companyId!, ano },
    { enabled: !!companyId, staleTime: 30_000 }
  );

  const meses: MesData[] = anoQuery.data ?? [];
  const mesDados = mesSel ? meses.find(m => m.mes === mesSel) ?? null : null;

  const kpis = useMemo(() => ({
    assinados: meses.filter(m => m.status === "assinado").length,
    enviados:  meses.filter(m => m.status === "enviado").length,
    pendentes: meses.filter(m => m.status === "pendente" && !m.futuro).length,
  }), [meses]);

  return (
    <DashboardLayout>
    <div className="flex flex-col gap-4 p-4 md:p-6 bg-gray-50 min-h-full">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Archive className="w-5 h-5 text-indigo-600" />
              Contabilidade — Controle de Envios
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Visualize e confirme os documentos antes de enviar ao contador
            </p>
          </div>
          {anoQuery.isFetching && (
            <span className="flex items-center gap-1 text-xs text-gray-400 mt-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> Atualizando…
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
            Assinados: <strong className="text-green-700">{kpis.assinados}</strong>
          </span>
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            Enviados: <strong className="text-blue-700">{kpis.enviados}</strong>
          </span>
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            Pendentes: <strong className="text-amber-700">{kpis.pendentes}</strong>
          </span>
        </div>
      </div>

      {/* ── Seletor de período — white-card ─────────────────────────────────── */}
      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setAno(a => a - 1); setMesSel(null); }}
                className="p-1 rounded hover:bg-gray-100 text-gray-500">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
              <button type="button" onClick={() => { setAno(a => a + 1); setMesSel(null); }}
                disabled={ano >= anoAtual + 1}
                className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Assinado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Enviado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Pendente</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Futuro</span>
            </div>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
            {anoQuery.isLoading
              ? Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />)
              : anoQuery.error
              ? <p className="col-span-12 text-sm text-red-500 py-2">Erro: {anoQuery.error.message}</p>
              : MESES_ABREV.map((abrev, i) => {
                  const num = i + 1;
                  const d = meses.find(m => m.mes === num);
                  const s = d?.status ?? "futuro";
                  const isSelected = mesSel === num;
                  return (
                    <button key={abrev} type="button"
                      onClick={() => setMesSel(isSelected ? null : num)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 py-2 rounded-lg border text-xs font-medium transition-all",
                        isSelected
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      <span>{abrev}</span>
                      <span className={cn("w-1.5 h-1.5 rounded-full", statusDotColor(s))} />
                    </button>
                  );
                })
            }
          </div>
        </CardContent>
      </Card>

      {/* ── Painel do mês ──────────────────────────────────────────────────── */}
      {mesSel !== null && (
        <PainelMes
          mes={mesSel} dados={mesDados} ano={ano}
          companyId={companyId!} companyNome={company?.nome ?? "FC Engenharia"}
          onClose={() => setMesSel(null)} onRefetch={() => anoQuery.refetch()}
        />
      )}

      {mesSel === null && !anoQuery.isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Archive className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">Selecione um mês para ver os documentos do período.</p>
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}
