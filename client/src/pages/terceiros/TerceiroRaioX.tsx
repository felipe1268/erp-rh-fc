import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { naturezaInfo } from "@shared/terceiroNatureza";
import {
  ArrowLeft, Building2, FileText, Users, ShieldCheck, AlertTriangle, Truck,
  DollarSign, MapPin, Loader2, CheckCircle, XCircle, ExternalLink,
} from "lucide-react";

const BRL = (v: any) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return new Date(String(d)).toLocaleDateString("pt-BR"); } catch { return "—"; }
};

const STATUS_CONTRATO: Record<string, string> = {
  ativo: "bg-green-100 text-green-700 border-green-200",
  encerrado: "bg-gray-100 text-gray-600 border-gray-200",
  suspenso: "bg-amber-100 text-amber-700 border-amber-200",
  concluido: "bg-blue-100 text-blue-700 border-blue-200",
};

export default function TerceiroRaioXWrapper() {
  const [, params] = useRoute("/terceiros/empresas/:id");
  const id = parseInt(params?.id || "0");
  if (!id) return <DashboardLayout><div className="p-6 text-gray-400">Empresa inválida.</div></DashboardLayout>;
  return <TerceiroRaioXInner id={id} />;
}

type Tab = "contratos" | "funcionarios" | "documentos";

function TerceiroRaioXInner({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("contratos");
  const { data, isLoading, error } = trpc.terceiros.empresas.raioX.useQuery({ id });

  if (isLoading) {
    return <DashboardLayout><div className="p-10 flex items-center justify-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando Raio-X…</div></DashboardLayout>;
  }
  if (error || !data) {
    return <DashboardLayout><div className="p-6 text-red-500">{error?.message || "Empresa não encontrada."}</div></DashboardLayout>;
  }

  const emp: any = data.empresa;
  const r = data.resumo;
  const conformidadeOk = r.asoVencidos === 0 && r.asoSemData === 0 && r.docsVencidos === 0 && r.docsAusentes === 0;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <button onClick={() => navigate("/terceiros/empresas")} className="p-2 hover:bg-gray-100 rounded-lg shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="w-5 h-5 text-orange-500 shrink-0" />
              <h1 className="text-lg font-bold text-gray-900 truncate">{emp.razaoSocial}</h1>
              <Badge className={`text-xs border ${emp.status === "ativa" ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>{emp.status}</Badge>
            </div>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
              {emp.nomeFantasia && <span>{emp.nomeFantasia}</span>}
              <span className="font-mono">CNPJ: {emp.cnpj}</span>
              {emp.cidade && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{emp.cidade}/{emp.estado}</span>}
              {emp.tipoServico && <span>{emp.tipoServico}</span>}
            </div>
          </div>
          <Badge className={`text-xs border shrink-0 ${conformidadeOk ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}`}>
            {conformidadeOk ? <CheckCircle className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
            {conformidadeOk ? "Conforme" : "Pendências"}
          </Badge>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Contratado", value: BRL(r.totalContratado), color: "text-gray-900", icon: DollarSign, sub: `${r.contratosAtivos} ativo(s) / ${r.contratosTotal}` },
            { label: "Total Pago", value: BRL(r.totalPago), color: "text-green-700", icon: DollarSign, sub: `Saldo ${BRL(r.saldo)}` },
            { label: "Material em FD", value: BRL(r.fdMaterialTotal), color: "text-amber-700", icon: Truck, sub: "desconta dos contratos" },
            { label: "Funcionários", value: `${r.funcionariosAtivos}`, color: "text-blue-700", icon: Users, sub: `${r.funcionariosTotal} no total` },
          ].map((k, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{k.label}</p>
                <k.icon className="w-4 h-4 text-gray-300" />
              </div>
              <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
              {k.sub && <p className="text-xs text-gray-400">{k.sub}</p>}
            </div>
          ))}
        </div>

        {/* Alertas de conformidade */}
        {!conformidadeOk && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-red-700">
            {r.asoVencidos > 0 && <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{r.asoVencidos} ASO vencido(s)</span>}
            {r.asoSemData > 0 && <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{r.asoSemData} sem data de ASO</span>}
            {r.docsVencidos > 0 && <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{r.docsVencidos} documento(s) vencido(s)</span>}
            {r.docsAusentes > 0 && <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{r.docsAusentes} documento(s) ausente(s)</span>}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {([
            ["contratos", `Contratos (${data.contratos.length})`, FileText],
            ["funcionarios", `Funcionários (${data.funcionarios.length})`, Users],
            ["documentos", `Documentos (${data.documentos.length})`, ShieldCheck],
          ] as [Tab, string, any][]).map(([t, label, Icon]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${tab === t ? "border-b-2 border-orange-500 text-orange-600" : "text-gray-500 hover:text-gray-700"}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* Tab: Contratos */}
        {tab === "contratos" && (
          data.contratos.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm"><FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />Nenhum contrato com esta empresa.</div>
          ) : (
            <div className="space-y-2">
              {data.contratos.map((c: any) => {
                const nt = naturezaInfo(c.naturezaContrato);
                return (
                  <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-3 hover:shadow-sm transition-shadow cursor-pointer"
                    onClick={() => navigate(`/terceiros/contratos/${c.id}`)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {c.numeroContrato && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{c.numeroContrato}</span>}
                          <Badge className={`text-xs border ${STATUS_CONTRATO[c.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>{c.status}</Badge>
                          <Badge className={`text-xs border ${nt.cls}`}>{nt.label}</Badge>
                          {c.obraNome && <span className="text-xs text-gray-500 flex items-center gap-0.5"><MapPin className="w-3 h-3" />{c.obraNome}</span>}
                        </div>
                        <p className="text-sm text-gray-700 mt-1 line-clamp-1">{c.descricao}</p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-300 shrink-0" />
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2 text-xs">
                      <div><span className="text-gray-400">Valor: </span><span className="font-semibold text-gray-900">{BRL(c.valorTotal)}</span></div>
                      {c.fdMaterialObra > 0 && <div><span className="text-gray-400">FD material: </span><span className="font-semibold text-amber-700">− {BRL(c.fdMaterialObra)}</span></div>}
                      {c.fdMaterialObra > 0 && <div><span className="text-gray-400">Líq. MDO: </span><span className="font-semibold text-blue-700">{BRL(c.valorLiquidoMdo)}</span></div>}
                      <div><span className="text-gray-400">Pago: </span><span className="font-semibold text-green-700">{BRL(c.valorPago)}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Tab: Funcionários */}
        {tab === "funcionarios" && (
          data.funcionarios.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm"><Users className="w-8 h-8 mx-auto mb-2 opacity-30" />Nenhum funcionário cadastrado.</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Nome</th>
                    <th className="text-left px-3 py-2 font-medium">Função</th>
                    <th className="text-left px-3 py-2 font-medium">Obra</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium">ASO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.funcionarios.map((f: any) => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{f.nome}</td>
                      <td className="px-3 py-2 text-gray-600">{f.funcao || "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{f.obraNome || "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${f.status === "ativo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{f.status}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {f.asoStatus === "ok" ? <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" />{fmtDate(f.asoValidade)}</span>
                          : f.asoStatus === "vencido" ? <span className="text-red-600 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />Vencido {fmtDate(f.asoValidade)}</span>
                          : <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Sem data</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Tab: Documentos */}
        {tab === "documentos" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.documentos.map((d: any, i: number) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">{d.tipo}</p>
                  {d.status === "ok" ? <CheckCircle className="w-4 h-4 text-green-500" />
                    : d.status === "vencido" ? <XCircle className="w-4 h-4 text-red-500" />
                    : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                </div>
                <p className={`text-xs mt-1 ${d.status === "ok" ? "text-gray-500" : d.status === "vencido" ? "text-red-600" : "text-amber-600"}`}>
                  {d.status === "ausente" ? "Não enviado" : d.validade ? `Validade: ${fmtDate(d.validade)}` : "Enviado"}
                </p>
                {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-orange-600 hover:underline flex items-center gap-1 mt-2"><ExternalLink className="w-3 h-3" />Abrir documento</a>}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
