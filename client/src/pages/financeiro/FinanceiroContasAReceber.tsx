import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, ChevronLeft, ChevronRight, RefreshCw,
  FileText, AlertCircle, Clock, CheckCircle2, ReceiptText,
  ChevronDown, ChevronUp, Building2, Send, ThumbsUp,
  TrendingUp, TrendingDown, Settings, Info
} from "lucide-react";

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES     = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function BRL(v: number) {
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v);
}
function K(v: number) {
  if (v === 0) return "—";
  const abs = Math.abs(v), s = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${s}R$\u00A0${(abs/1_000_000).toFixed(1).replace(".",",")}M`;
  if (abs >= 1_000)     return `${s}R$\u00A0${(abs/1_000).toFixed(1).replace(".",",")}K`;
  return `${s}R$\u00A0${abs.toFixed(0)}`;
}
function fmtData(s?: string|null) {
  if (!s) return "—";
  return new Date(s+"T00:00:00").toLocaleDateString("pt-BR");
}
function getMes(s?: string|null): number|null {
  if (!s) return null;
  return new Date(s+"T00:00:00").getMonth() + 1;
}
function PCT(v: number, sign = true) {
  if (v === 0) return "0%";
  return (sign && v > 0 ? "+" : "") + v.toFixed(1).replace(".",",") + "%";
}

// ─── Status ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string,{label:string;color:string;bg:string;icon:any;order:number}> = {
  a_faturar:        {label:"A Faturar",       color:"text-amber-700",  bg:"bg-amber-50",   icon:Clock,        order:1},
  medicao_enviada:  {label:"Med. Enviada",     color:"text-sky-700",    bg:"bg-sky-50",     icon:Send,         order:2},
  aprovada_parcial: {label:"Aprov. Parcial",   color:"text-orange-700", bg:"bg-orange-50",  icon:ThumbsUp,     order:3},
  faturado:         {label:"Faturado",         color:"text-blue-700",   bg:"bg-blue-50",    icon:FileText,     order:4},
  a_receber:        {label:"A Receber",        color:"text-purple-700", bg:"bg-purple-50",  icon:ReceiptText,  order:5},
  recebido_parcial: {label:"Parc. Recebido",   color:"text-teal-700",   bg:"bg-teal-50",    icon:CheckCircle2, order:6},
  recebido_total:   {label:"Recebido",         color:"text-green-700",  bg:"bg-green-50",   icon:CheckCircle2, order:7},
  cancelado:        {label:"Cancelado",        color:"text-gray-400",   bg:"bg-gray-50",    icon:AlertCircle,  order:8},
};
const STATUS_NEXT: Record<string,string> = {
  a_faturar: "medicao_enviada", medicao_enviada: "faturado",
  aprovada_parcial: "faturado", faturado: "a_receber",
  a_receber: "recebido_total", recebido_parcial: "recebido_total",
};

// ─── Formulários ──────────────────────────────────────────────────────────────

const FORM_EMPTY = {
  obraId:"", obraNome:"", clienteNome:"", clienteCnpj:"",
  valorContrato:"", valorMedicao:"", medicaoNumero:"",
  percentualMedicao:"", dataVencimento:"",
  retencaoISS:"0", retencaoINSS:"0", retencaoIR:"0",
  retencaoContratual:"0", observacoes:"",
};
const UPD_EMPTY = {
  status:"", nfNumero:"", nfEmitidaEm:"",
  dataRecebimento:"", valorRecebido:"", formaPagamento:"",
  valorAprovado:"", dataAprovacao:"", medicaoEnviadaEm:"",
};

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function StatusBadge({status}:{status:string}) {
  const cfg = STATUS_CFG[status] ?? {label:status,color:"text-gray-500",bg:"bg-gray-50",icon:Clock};
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function ReceitaRow({r, hojeStr, onUpdate}:{r:any;hojeStr:string;onUpdate:(r:any)=>void}) {
  const vencida = r.dataVencimento && r.dataVencimento < hojeStr
    && !["recebido_total","cancelado"].includes(r.status);
  const temGlosa = Number(r.glosa) > 0;
  return (
    <tr className={`border-b border-gray-100 hover:bg-gray-50/60 transition-colors ${vencida?"bg-red-50/30":""}`}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800 leading-tight">{r.obraNome ?? "—"}</p>
            {r.clienteNome && <p className="text-xs text-gray-400 mt-0.5">{r.clienteNome}</p>}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-center text-xs text-gray-400">
        {r.medicaoNumero ? `#${r.medicaoNumero}` : "—"}
      </td>
      <td className="px-3 py-2.5 text-right">
        {Number(r.valorMedicao) > 0 ? (
          <div>
            <span className="text-sm font-bold text-green-700">{BRL(Number(r.valorMedicao))}</span>
            {Number(r.retencaoContratual) > 0 && (
              <p className="text-[10px] text-gray-400">Ret.{Number(r.retencaoContratual).toFixed(0)}% · Liq: {BRL(Number(r.valorLiquidoReceber??r.valorMedicao))}</p>
            )}
            {temGlosa && (
              <p className="text-[10px] text-orange-600 font-medium">Glosa: {BRL(Number(r.glosa))}</p>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-300 italic">Sem valor</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        {r.nfNumero
          ? <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">{r.nfNumero}</span>
          : <span className="text-xs text-gray-300">—</span>
        }
      </td>
      <td className="px-3 py-2.5 text-center">
        {r.dataVencimento ? (
          <div>
            <span className={`text-xs font-medium ${vencida?"text-red-600":"text-gray-600"}`}>{fmtData(r.dataVencimento)}</span>
            {vencida && <p className="text-[10px] text-red-500 font-semibold">Em atraso</p>}
          </div>
        ) : <span className="text-xs text-gray-300">—</span>}
      </td>
      <td className="px-3 py-2.5 text-right">
        {Number(r.valorRecebido) > 0
          ? <span className="text-xs font-semibold text-green-700">{BRL(Number(r.valorRecebido))}</span>
          : <span className="text-xs text-gray-300">—</span>
        }
      </td>
      <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
      <td className="px-3 py-2.5">
        {!["cancelado","recebido_total"].includes(r.status) && (
          <Button size="sm" variant="outline" onClick={()=>onUpdate(r)}
            className="h-7 text-xs px-3 border-gray-200 hover:border-blue-400 hover:text-blue-600">
            Avançar
          </Button>
        )}
      </td>
    </tr>
  );
}

// ─── Aba Previsão ─────────────────────────────────────────────────────────────

function TabPrevisao({companyId, ano}:{companyId:number; ano:number}) {
  const {toast} = useToast();
  const {data, isLoading, refetch} = (trpc as any).financial.getRevenuePrevisao.useQuery(
    {companyId, ano}, {enabled: !!companyId}
  );
  const {data: obras} = (trpc as any).obras.getObras.useQuery({companyId},{enabled:!!companyId});

  const baselineMut   = (trpc as any).financial.upsertRevenueBaseline.useMutation({onSuccess:()=>refetch()});
  const previstoMut   = (trpc as any).financial.upsertRevenuePrevisto.useMutation({onSuccess:()=>refetch()});

  const [editObra, setEditObra] = useState<null|{obraId:number;obraNome:string;meses:any[];layer:"baseline"|"previsto"}>(null);
  const [editVals, setEditVals] = useState<Record<number,string>>({});
  const [newObraId, setNewObraId] = useState("");

  function openEdit(o: any, layer: "baseline"|"previsto") {
    const vals: Record<number,string> = {};
    o.meses.forEach((m:any) => { vals[m.mes] = layer === "baseline" ? String(m.baseline||"") : String(m.previsto||""); });
    setEditVals(vals);
    setEditObra({obraId:o.obraId, obraNome:o.obraNome, meses:o.meses, layer});
  }

  async function saveEdit() {
    if (!editObra) return;
    const fn = editObra.layer === "baseline" ? baselineMut : previstoMut;
    for (let mes = 1; mes <= 12; mes++) {
      const v = parseFloat(editVals[mes]||"0")||0;
      await fn.mutateAsync({
        companyId, obraId: editObra.obraId, obraNome: editObra.obraNome,
        mes: `${ano}-${String(mes).padStart(2,"0")}-01`, valor: v,
      });
    }
    toast({title:"Valores salvos!"});
    setEditObra(null);
  }

  const obrasList: any[] = data?.obras ?? [];
  const rolling: any[] = data?.rolling ?? [];

  // Add new obra to previsão
  async function addObra() {
    if (!newObraId) return;
    const o = obras?.find((ob:any)=>String(ob.id)===newObraId);
    if (!o) return;
    await baselineMut.mutateAsync({companyId, obraId:o.id, obraNome:o.nome, mes:`${ano}-01-01`, valor:0});
    refetch();
    setNewObraId("");
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-40 gap-3">
      <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
      <span className="text-gray-400 text-sm">Carregando previsão...</span>
    </div>
  );

  return (
    <div className="space-y-5">

      {/* Rolling Forecast */}
      {rolling.some(r=>r.valor>0) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-800">Previsão próximos 3 meses</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {rolling.map((r,i)=>(
              <div key={i} className="bg-white rounded-lg p-3 border border-blue-100">
                <p className="text-xs text-gray-500">{MESES_ABR[r.mes-1]}/{r.ano}</p>
                <p className="text-lg font-bold text-blue-700 mt-0.5">{K(r.valor)}</p>
                <p className="text-[10px] text-gray-400">Previsto</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Adicionar obra */}
      <div className="flex items-center gap-3 bg-white border border-dashed border-gray-300 rounded-xl px-4 py-3">
        <span className="text-sm text-gray-500 flex-shrink-0">Adicionar obra à previsão:</span>
        <Select value={newObraId} onValueChange={setNewObraId}>
          <SelectTrigger className="max-w-xs h-8 text-xs"><SelectValue placeholder="Selecionar obra..." /></SelectTrigger>
          <SelectContent>
            {(obras??[]).filter((o:any)=>!obrasList.find(ob=>ob.obraId===o.id)).map((o:any)=>(
              <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addObra} disabled={!newObraId}>
          <Plus className="w-3 h-3 mr-1" />Adicionar
        </Button>
      </div>

      {obrasList.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Info className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Nenhuma obra com previsão configurada para {ano}.</p>
          <p className="text-xs mt-1">Adicione uma obra acima para começar.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {obrasList.map((obra:any)=>{
            const spi = obra.spi;
            const spiColor = spi === null ? "text-gray-400" : spi >= 0.9 ? "text-green-700" : spi >= 0.7 ? "text-amber-600" : "text-red-600";
            const spiLabel = spi === null ? "—" : spi.toFixed(2);

            return (
              <div key={obra.obraId} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Obra header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-bold text-gray-800">{obra.obraNome}</span>
                    {spi !== null && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        spi>=0.9 ? "bg-green-100 text-green-700" : spi>=0.7 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                      }`}>
                        SPI {spiLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2.5"
                      onClick={()=>openEdit(obra,"baseline")}>
                      <Settings className="w-3 h-3 mr-1" />Base Line
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2.5"
                      onClick={()=>openEdit(obra,"previsto")}>
                      <Settings className="w-3 h-3 mr-1" />Previsto
                    </Button>
                  </div>
                </div>

                {/* Matriz 3 camadas */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500 font-semibold w-28">Camada</th>
                        {MESES_ABR.map(m=>(
                          <th key={m} className="px-1.5 py-2 text-center text-gray-400 font-medium w-16">{m}</th>
                        ))}
                        <th className="px-3 py-2 text-right text-gray-500 font-semibold w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Base Line */}
                      <tr className="border-b border-gray-50 bg-gray-50/50">
                        <td className="px-3 py-2 font-semibold text-gray-500">Base Line</td>
                        {obra.meses.map((m:any)=>(
                          <td key={m.mes} className="px-1.5 py-2 text-right tabular-nums">
                            <span className={m.baseline>0?"text-gray-600":"text-gray-200"}>{K(m.baseline)}</span>
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-bold text-gray-600">{K(obra.totBaseline)}</td>
                      </tr>
                      {/* Previsto */}
                      <tr className="border-b border-gray-50">
                        <td className="px-3 py-2 font-semibold text-blue-600">Previsto</td>
                        {obra.meses.map((m:any)=>{
                          const desvio = obra.totBaseline > 0 && m.baseline > 0
                            ? ((m.previsto - m.baseline) / m.baseline) * 100 : null;
                          return (
                            <td key={m.mes} className="px-1.5 py-2 text-right tabular-nums">
                              <span className={m.previsto>0?"text-blue-600":"text-gray-200"}>{K(m.previsto)}</span>
                              {desvio !== null && Math.abs(desvio) > 1 && (
                                <div className={`text-[9px] ${desvio>0?"text-green-600":"text-red-500"}`}>{PCT(desvio)}</div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right font-bold text-blue-600">{K(obra.totPrevisto)}</td>
                      </tr>
                      {/* Realizado */}
                      <tr>
                        <td className="px-3 py-2 font-semibold text-green-700">Realizado</td>
                        {obra.meses.map((m:any)=>{
                          const aderencia = m.previsto > 0 ? (m.realizado / m.previsto) * 100 : null;
                          return (
                            <td key={m.mes} className="px-1.5 py-2 text-right tabular-nums">
                              <span className={m.realizado>0?"text-green-700":"text-gray-200"}>{K(m.realizado)}</span>
                              {aderencia !== null && m.realizado > 0 && (
                                <div className={`text-[9px] ${aderencia>=90?"text-green-600":aderencia>=70?"text-amber-500":"text-red-500"}`}>
                                  {aderencia.toFixed(0)}%
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right font-bold text-green-700">{K(obra.totRealizado)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal edição de valores */}
      <Dialog open={!!editObra} onOpenChange={v=>{ if(!v) setEditObra(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editObra?.layer === "baseline" ? "Base Line" : "Previsto"} — {editObra?.obraNome}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-3">
            {MESES.map((m,i)=>(
              <div key={i}>
                <Label className="text-xs text-gray-500">{m}</Label>
                <Input type="number" step="1000" className="h-8 text-xs"
                  value={editVals[i+1]||""}
                  onChange={e=>setEditVals(v=>({...v,[i+1]:e.target.value}))}
                  placeholder="0" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setEditObra(null)}>Cancelar</Button>
            <Button onClick={saveEdit} className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={baselineMut.isPending || previstoMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function FinanceiroContasAReceber() {
  const { companyId } = useCompany();
  const { toast }     = useToast();

  const hoje    = new Date();
  const hojeStr = hoje.toISOString().split("T")[0];

  const [tab, setTab]               = useState<"medicoes"|"previsao">("medicoes");
  const [ano, setAno]               = useState(hoje.getFullYear());
  const [mesSel, setMesSel]         = useState(hoje.getMonth()+1);
  const [filtroStatus, setFiltro]   = useState<string|null>(null);
  const [search, setSearch]         = useState("");
  const [showNew, setShowNew]       = useState(false);
  const [showUpdate, setShowUpdate] = useState<any|null>(null);
  const [showAnual, setShowAnual]   = useState(false);
  const [form, setForm]             = useState(FORM_EMPTY);
  const [upd, setUpd]               = useState(UPD_EMPTY);

  const { data: allReceitas, isLoading, refetch } =
    (trpc as any).financial.getRevenueByYear.useQuery({companyId, ano},{enabled:!!companyId});
  const { data: obras } =
    (trpc as any).obras.getObras.useQuery({companyId},{enabled:!!companyId});

  const createMut = (trpc as any).financial.createRevenue.useMutation({
    onSuccess:()=>{ toast({title:"Medição registrada!"}); setShowNew(false); setForm(FORM_EMPTY); refetch(); },
    onError:(e:any)=>toast({title:"Erro",description:e.message,variant:"destructive"}),
  });
  const updateMut = (trpc as any).financial.updateRevenueStatus.useMutation({
    onSuccess:()=>{ toast({title:"Status atualizado!"}); setShowUpdate(null); refetch(); },
    onError:(e:any)=>toast({title:"Erro",description:e.message,variant:"destructive"}),
  });

  // Dados do mês — exclui entradas auto-geradas sem valor (obra_previsto com valor_medicao = 0/null)
  const mesData = useMemo(()=>{
    if (!allReceitas) return [];
    return allReceitas.filter((r:any)=>{
      const m = getMes(r.dataVencimento ?? r.createdAt);
      if (m !== mesSel || r.status === "cancelado") return false;
      // Ocultar entradas auto-geradas sem valor (observacoes='obra_previsto' sem medicao_id e sem valor)
      const temValor = Number(r.valorMedicao ?? 0) > 0;
      const temMedicaoId = !!r.medicaoId;
      if (!temValor && !temMedicaoId) return false;
      return true;
    });
  },[allReceitas, mesSel]);

  // Pipeline
  const pipeline = useMemo(()=>{
    const map: Record<string,{total:number;count:number}> = {};
    for (const r of mesData) {
      if (!map[r.status]) map[r.status]={total:0,count:0};
      map[r.status].total += Number(r.valorMedicao??0);
      map[r.status].count += 1;
    }
    return map;
  },[mesData]);

  // Tabela filtrada + ordenada
  const filtered = useMemo(()=>{
    let list = mesData;
    if (filtroStatus) list = list.filter((r:any)=>r.status===filtroStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r:any)=>(r.obraNome??"").toLowerCase().includes(q)||(r.clienteNome??"").toLowerCase().includes(q));
    }
    return [...list].sort((a,b)=>{
      const aV = a.dataVencimento&&a.dataVencimento<hojeStr&&!["recebido_total"].includes(a.status);
      const bV = b.dataVencimento&&b.dataVencimento<hojeStr&&!["recebido_total"].includes(b.status);
      if (aV&&!bV) return -1; if (!aV&&bV) return 1;
      return (a.dataVencimento??"9999").localeCompare(b.dataVencimento??"9999");
    });
  },[mesData,filtroStatus,search,hojeStr]);

  // KPIs
  const totalMes      = mesData.reduce((s:number,r:any)=>s+Number(r.valorMedicao??0),0);
  const totalRecebido = mesData.reduce((s:number,r:any)=>s+Number(r.valorRecebido??0),0);
  const totalVencidas = mesData.filter((r:any)=>r.dataVencimento&&r.dataVencimento<hojeStr&&r.status!=="recebido_total")
                               .reduce((s:number,r:any)=>s+Number(r.valorMedicao??0),0);

  const mesesComDados = useMemo(()=>{
    const s=new Set<number>();
    for(const r of allReceitas??[]){const m=getMes(r.dataVencimento??r.createdAt);if(m)s.add(m);}
    return s;
  },[allReceitas]);

  function nextMes(){if(mesSel===12){setAno(a=>a+1);setMesSel(1);}else setMesSel(m=>m+1);}
  function prevMes(){if(mesSel===1){setAno(a=>a-1);setMesSel(12);}else setMesSel(m=>m-1);}

  function handleSave() {
    if (!form.valorMedicao) {toast({title:"Informe o valor da medição",variant:"destructive"});return;}
    createMut.mutate({
      companyId,
      obraId: parseInt(form.obraId)||0,
      obraNome: form.obraNome||undefined, clienteNome: form.clienteNome||undefined,
      clienteCnpj: form.clienteCnpj||undefined,
      valorContrato: parseFloat(form.valorContrato)||undefined,
      valorMedicao: parseFloat(form.valorMedicao),
      medicaoNumero: parseInt(form.medicaoNumero)||undefined,
      percentualMedicao: parseFloat(form.percentualMedicao)||undefined,
      dataVencimento: form.dataVencimento||undefined,
      retencaoISS: parseFloat(form.retencaoISS)||0,
      retencaoINSS: parseFloat(form.retencaoINSS)||0,
      retencaoIR: parseFloat(form.retencaoIR)||0,
      retencaoContratual: parseFloat(form.retencaoContratual)||0,
      observacoes: form.observacoes||undefined,
    });
  }

  function handleUpdate() {
    updateMut.mutate({
      id: showUpdate.id, companyId,
      status: upd.status||showUpdate.status,
      nfNumero: upd.nfNumero||undefined,
      nfEmitidaEm: upd.nfEmitidaEm||undefined,
      dataRecebimento: upd.dataRecebimento||undefined,
      valorRecebido: parseFloat(upd.valorRecebido)||undefined,
      formaPagamento: upd.formaPagamento||undefined,
      valorAprovado: parseFloat(upd.valorAprovado)||undefined,
      dataAprovacao: upd.dataAprovacao||undefined,
      medicaoEnviadaEm: upd.medicaoEnviadaEm||undefined,
    });
  }

  const glosaPreview = upd.valorAprovado && showUpdate
    ? Math.max(0, Number(showUpdate.valorMedicao) - parseFloat(upd.valorAprovado||"0"))
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Contas a Receber</h1>
            <p className="text-xs text-gray-400 mt-0.5">Medições, faturamento e recebimentos das obras</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={()=>setShowNew(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />Nova Medição
            </Button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {([["medicoes","Medições"],["previsao","Previsão de Faturamento"]] as const).map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all
                ${tab===k?"bg-white text-gray-900 shadow-sm":"text-gray-500 hover:text-gray-700"}`}>
              {l}
            </button>
          ))}
        </div>

        {tab === "previsao" ? (
          <>
            <div className="flex items-center gap-2">
              <button onClick={()=>setAno(a=>a-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-bold text-gray-700 w-12 text-center">{ano}</span>
              <button onClick={()=>setAno(a=>a+1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <TabPrevisao companyId={companyId} ano={ano} />
          </>
        ) : (
          <>
            {/* ── Navegação Mês ── */}
            <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2.5">
              <button onClick={prevMes} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 flex gap-1 overflow-x-auto">
                {MESES_ABR.map((m,i)=>{
                  const num=i+1, temDados=mesesComDados.has(num), isAt=num===mesSel;
                  return (
                    <button key={m} onClick={()=>setMesSel(num)}
                      className={`flex-shrink-0 flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all min-w-[40px]
                        ${isAt?"bg-blue-600 text-white":temDados?"bg-blue-50 text-blue-700 hover:bg-blue-100":"text-gray-400 hover:bg-gray-100"}`}>
                      {m}
                      <span className={`w-1 h-1 rounded-full ${isAt?"bg-white":temDados?"bg-blue-400":"bg-gray-200"}`} />
                    </button>
                  );
                })}
              </div>
              <button onClick={nextMes} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1 border-l border-gray-200 pl-2.5 ml-1">
                <button onClick={()=>setAno(a=>a-1)} className="text-gray-400 hover:text-gray-700"><ChevronLeft className="w-3.5 h-3.5" /></button>
                <span className="text-sm font-bold text-gray-700 w-10 text-center">{ano}</span>
                <button onClick={()=>setAno(a=>a+1)} className="text-gray-400 hover:text-gray-700"><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
              <button onClick={()=>refetch()} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* ── KPIs ── */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 font-medium">{MESES[mesSel-1]} {ano}</p>
                <p className="text-xl font-bold text-gray-800 mt-1">{BRL(totalMes)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{mesData.length} medição(ões)</p>
              </div>
              <div className={`border rounded-xl p-4 ${totalVencidas>0?"bg-red-50 border-red-200":"bg-white border-gray-200"}`}>
                <p className={`text-xs font-medium ${totalVencidas>0?"text-red-600":"text-gray-500"}`}>
                  {totalVencidas>0?"⚠ Vencidas":"Vencidas"}
                </p>
                <p className={`text-xl font-bold mt-1 ${totalVencidas>0?"text-red-700":"text-gray-300"}`}>{BRL(totalVencidas)}</p>
                <p className={`text-xs mt-0.5 ${totalVencidas>0?"text-red-500":"text-gray-400"}`}>
                  {mesData.filter((r:any)=>r.dataVencimento&&r.dataVencimento<hojeStr&&r.status!=="recebido_total").length} em atraso
                </p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="text-xs text-green-700 font-medium">Recebido</p>
                <p className="text-xl font-bold text-green-700 mt-1">{BRL(totalRecebido)}</p>
                <p className="text-xs text-green-600 mt-0.5">{mesData.filter((r:any)=>r.status==="recebido_total").length} finalizado(s)</p>
              </div>
            </div>

            {/* ── Filtros de status ── */}
            <div className="flex gap-2 flex-wrap items-center">
              <button onClick={()=>setFiltro(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                  ${!filtroStatus?"bg-gray-800 text-white border-gray-800":"bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}>
                Todos ({mesData.length})
              </button>
              {Object.entries(STATUS_CFG).filter(([k])=>k!=="cancelado").map(([key,cfg])=>{
                const d=pipeline[key]; if(!d?.count) return null;
                const Icon=cfg.icon;
                return (
                  <button key={key} onClick={()=>setFiltro(filtroStatus===key?null:key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                      ${filtroStatus===key?`${cfg.bg} ${cfg.color} border-current shadow-sm`:"bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                    <Icon className="w-3 h-3" />{cfg.label} ({d.count})
                  </button>
                );
              })}
            </div>

            {/* ── Busca ── */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9 bg-white border-gray-200" placeholder="Buscar obra ou cliente..."
                value={search} onChange={e=>setSearch(e.target.value)} />
            </div>

            {/* ── Tabela ── */}
            <Card className="border border-gray-200 shadow-none overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">
                  {MESES[mesSel-1]} {ano}
                  {filtroStatus && <span className={`ml-2 text-xs ${STATUS_CFG[filtroStatus]?.color}`}>· {STATUS_CFG[filtroStatus]?.label}</span>}
                </h2>
                <span className="text-xs text-gray-400">{filtered.length} registro(s)</span>
              </div>
              {isLoading ? (
                <div className="p-12 text-center"><RefreshCw className="w-6 h-6 text-gray-300 animate-spin mx-auto mb-2" /><p className="text-gray-400 text-sm">Carregando...</p></div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center">
                  <ReceiptText className="w-9 h-9 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm font-medium">Nenhuma medição em {MESES[mesSel-1]} {ano}</p>
                  <p className="text-gray-400 text-xs mt-1">
                    {filtroStatus
                      ? "Tente remover o filtro."
                      : "As medições são sincronizadas automaticamente a partir do cronograma financeiro. Cadastre o cronograma da obra ou registre manualmente."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Obra / Cliente</th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">Med.</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">Valor / Retenção</th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">NF</th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">Vencimento</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">Recebido</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Status</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r:any)=>(
                        <ReceitaRow key={r.id} r={r} hojeStr={hojeStr} onUpdate={row=>{
                          setShowUpdate(row);
                          setUpd({...UPD_EMPTY, status:STATUS_NEXT[row.status]??row.status, nfNumero:row.nfNumero??""});
                        }} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* ── Resumo Anual ── */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={()=>setShowAnual(v=>!v)}
                className="w-full flex items-center justify-between px-5 py-3 bg-white hover:bg-gray-50 transition-colors">
                <span className="text-sm font-semibold text-gray-700">Resumo Anual {ano}</span>
                {showAnual?<ChevronUp className="w-4 h-4 text-gray-400"/>:<ChevronDown className="w-4 h-4 text-gray-400"/>}
              </button>
              {showAnual && (
                <div className="overflow-x-auto border-t border-gray-200">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Mês</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Medições</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Recebido</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">A Receber</th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Registros</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {MESES_ABR.map((m,i)=>{
                        const num=i+1;
                        const ents=(allReceitas??[]).filter((r:any)=>getMes(r.dataVencimento??r.createdAt)===num&&r.status!=="cancelado");
                        const totM=ents.reduce((s:number,r:any)=>s+Number(r.valorMedicao??0),0);
                        const recM=ents.reduce((s:number,r:any)=>s+Number(r.valorRecebido??0),0);
                        return (
                          <tr key={m} onClick={()=>{setMesSel(num);setShowAnual(false);}}
                            className={`cursor-pointer hover:bg-blue-50/40 transition-colors ${mesSel===num?"bg-blue-50":""}`}>
                            <td className="px-4 py-2.5"><span className={`text-sm font-medium ${mesSel===num?"text-blue-700":"text-gray-700"}`}>{m}/{ano}</span></td>
                            <td className="px-4 py-2.5 text-right"><span className={`text-sm font-semibold ${totM>0?"text-gray-800":"text-gray-300"}`}>{BRL(totM)}</span></td>
                            <td className="px-4 py-2.5 text-right"><span className={`text-sm ${recM>0?"text-green-700 font-semibold":"text-gray-300"}`}>{BRL(recM)}</span></td>
                            <td className="px-4 py-2.5 text-right"><span className={`text-sm ${totM-recM>0?"text-orange-600 font-semibold":"text-gray-300"}`}>{BRL(totM-recM)}</span></td>
                            <td className="px-4 py-2.5 text-center">
                              {ents.length>0
                                ? <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-medium">{ents.length}</span>
                                : <span className="text-xs text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Modal: Nova Medição ── */}
      <Dialog open={showNew} onOpenChange={v=>{setShowNew(v);if(!v)setForm(FORM_EMPTY);}}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-blue-600" />Nova Medição
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Obra *</Label>
                <Select value={form.obraId} onValueChange={v=>{
                  const o=obras?.find((ob:any)=>String(ob.id)===v);
                  setForm(f=>({...f,obraId:v,obraNome:o?.nome??""}));
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{(obras??[]).map((o:any)=><SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nº Medição</Label>
                <Input type="number" value={form.medicaoNumero} onChange={e=>setForm(f=>({...f,medicaoNumero:e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cliente</Label>
                <Input value={form.clienteNome} onChange={e=>setForm(f=>({...f,clienteNome:e.target.value}))} />
              </div>
              <div>
                <Label>Data de Vencimento</Label>
                <Input type="date" value={form.dataVencimento} onChange={e=>setForm(f=>({...f,dataVencimento:e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor da Medição (R$) *</Label>
                <Input type="number" step="0.01" value={form.valorMedicao} onChange={e=>setForm(f=>({...f,valorMedicao:e.target.value}))} />
              </div>
              <div>
                <Label>Retenção Contratual (%)</Label>
                <Input type="number" step="0.01" value={form.retencaoContratual}
                  onChange={e=>setForm(f=>({...f,retencaoContratual:e.target.value}))}
                  placeholder="Ex: 5 = 5%" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">Retenções Tributárias</Label>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">ISS (R$)</Label><Input type="number" step="0.01" value={form.retencaoISS} onChange={e=>setForm(f=>({...f,retencaoISS:e.target.value}))} /></div>
                <div><Label className="text-xs">INSS (R$)</Label><Input type="number" step="0.01" value={form.retencaoINSS} onChange={e=>setForm(f=>({...f,retencaoINSS:e.target.value}))} /></div>
                <div><Label className="text-xs">IR (R$)</Label><Input type="number" step="0.01" value={form.retencaoIR} onChange={e=>setForm(f=>({...f,retencaoIR:e.target.value}))} /></div>
              </div>
            </div>
            {/* Preview valor líquido */}
            {parseFloat(form.valorMedicao) > 0 && (
              <div className="bg-blue-50 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-blue-700">Valor Líquido Estimado:</span>
                <span className="text-sm font-bold text-blue-800">
                  {BRL(parseFloat(form.valorMedicao) -
                    (parseFloat(form.retencaoISS)||0) - (parseFloat(form.retencaoINSS)||0) -
                    (parseFloat(form.retencaoIR)||0) -
                    (parseFloat(form.valorMedicao)*(parseFloat(form.retencaoContratual)||0)/100)
                  )}
                </span>
              </div>
            )}
            <div>
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={e=>setForm(f=>({...f,observacoes:e.target.value}))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
              {createMut.isPending?"Salvando...":"Salvar Medição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Avançar Status ── */}
      <Dialog open={!!showUpdate} onOpenChange={v=>{if(!v)setShowUpdate(null);}}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Avançar Status</DialogTitle></DialogHeader>
          {showUpdate && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-3">
                <Building2 className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-gray-800">{showUpdate.obraNome ?? "—"}</p>
                  {showUpdate.clienteNome && <p className="text-xs text-gray-400">{showUpdate.clienteNome}</p>}
                  <p className="text-lg font-bold text-blue-700 mt-1">{BRL(Number(showUpdate.valorMedicao??0))}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={showUpdate.status} />
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                    <StatusBadge status={upd.status||showUpdate.status} />
                  </div>
                </div>
              </div>

              <div>
                <Label>Novo Status</Label>
                <Select value={upd.status} onValueChange={v=>setUpd(f=>({...f,status:v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CFG).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Medição enviada */}
              {upd.status==="medicao_enviada" && (
                <div>
                  <Label>Data de Envio</Label>
                  <Input type="date" value={upd.medicaoEnviadaEm} onChange={e=>setUpd(f=>({...f,medicaoEnviadaEm:e.target.value}))} />
                </div>
              )}

              {/* Aprovação (total ou parcial) */}
              {["faturado","aprovada_parcial"].includes(upd.status) && (
                <div className="space-y-3">
                  <div>
                    <Label>Valor Aprovado pelo Cliente (R$)</Label>
                    <Input type="number" step="0.01" value={upd.valorAprovado}
                      onChange={e=>setUpd(f=>({...f,valorAprovado:e.target.value}))}
                      placeholder={String(showUpdate.valorMedicao??"")} />
                  </div>
                  <div>
                    <Label>Data de Aprovação</Label>
                    <Input type="date" value={upd.dataAprovacao} onChange={e=>setUpd(f=>({...f,dataAprovacao:e.target.value}))} />
                  </div>
                  {glosaPreview > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-orange-700 font-medium">⚠ Glosa calculada:</span>
                      <span className="text-sm font-bold text-orange-700">{BRL(glosaPreview)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* NF */}
              {["faturado","a_receber"].includes(upd.status) && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nº da NF</Label><Input value={upd.nfNumero} onChange={e=>setUpd(f=>({...f,nfNumero:e.target.value}))} placeholder="Ex: 1234" /></div>
                  <div><Label>Data Emissão NF</Label><Input type="date" value={upd.nfEmitidaEm} onChange={e=>setUpd(f=>({...f,nfEmitidaEm:e.target.value}))} /></div>
                </div>
              )}

              {/* Recebimento */}
              {["recebido_total","recebido_parcial"].includes(upd.status) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Valor Recebido (R$)</Label>
                    <Input type="number" step="0.01" value={upd.valorRecebido}
                      onChange={e=>setUpd(f=>({...f,valorRecebido:e.target.value}))}
                      placeholder={String(showUpdate.valorAprovado??showUpdate.valorMedicao??"")} />
                  </div>
                  <div><Label>Data do Recebimento</Label><Input type="date" value={upd.dataRecebimento} onChange={e=>setUpd(f=>({...f,dataRecebimento:e.target.value}))} /></div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={()=>setShowUpdate(null)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={updateMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
              {updateMut.isPending?"Salvando...":"Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
