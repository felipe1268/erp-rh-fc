import DashboardLayout from "@/components/DashboardLayout";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Scale, Search, Building2, Landmark, Eye, FileText, Filter, CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useMemo } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { removeAccents } from "@/lib/searchUtils";

export default function ConvencoesColetivas() {
  const { companies } = useCompany();
  const [search, setSearch] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>("todas");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos"); // sede, obra, todos
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: convencoes, isLoading } = trpc.sprint1.convencao.listGlobal.useQuery();

  const filtered = useMemo(() => {
    if (!convencoes) return [];
    return convencoes.filter((c: any) => {
      // Filtro por empresa
      if (filtroEmpresa !== "todas" && String(c.companyId) !== filtroEmpresa) return false;
      // Filtro por status
      if (filtroStatus !== "todos" && c.status !== filtroStatus) return false;
      // Filtro por tipo (sede vs obra)
      if (filtroTipo === "sede" && c.obraId) return false;
      if (filtroTipo === "obra" && !c.obraId) return false;
      // Busca textual
      if (search) {
        const term = removeAccents(search.toLowerCase());
        const nome = removeAccents((c.nome || "").toLowerCase());
        const sindicato = removeAccents((c.sindicato || "").toLowerCase());
        const empresa = removeAccents((c.nomeEmpresa || "").toLowerCase());
        const obra = removeAccents((c.nomeObra || "").toLowerCase());
        if (!nome.includes(term) && !sindicato.includes(term) && !empresa.includes(term) && !obra.includes(term)) return false;
      }
      return true;
    });
  }, [convencoes, search, filtroEmpresa, filtroStatus, filtroTipo]);

  // Stats
  const stats = useMemo(() => {
    if (!convencoes) return { total: 0, vigentes: 0, vencidas: 0, negociacao: 0, sede: 0, obra: 0 };
    return {
      total: convencoes.length,
      vigentes: convencoes.filter((c: any) => c.status === "vigente").length,
      vencidas: convencoes.filter((c: any) => c.status === "vencida").length,
      negociacao: convencoes.filter((c: any) => c.status === "em_negociacao").length,
      sede: convencoes.filter((c: any) => !c.obraId).length,
      obra: convencoes.filter((c: any) => !!c.obraId).length,
    };
  }, [convencoes]);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      vigente: { label: "Vigente", cls: "bg-green-100 text-green-700" },
      vencida: { label: "Vencida", cls: "bg-red-100 text-red-700" },
      em_negociacao: { label: "Em Negociação", cls: "bg-amber-100 text-amber-700" },
    };
    const s = map[status] || { label: status, cls: "bg-gray-100 text-gray-700" };
    return <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${s.cls}`}>{s.label}</span>;
  };

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Scale className="h-6 w-6 text-indigo-600" />
            Convenções Coletivas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visão geral de todas as convenções coletivas cadastradas nas empresas
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-[11px] text-muted-foreground">Total</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.vigentes}</p>
            <p className="text-[11px] text-muted-foreground">Vigentes</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.vencidas}</p>
            <p className="text-[11px] text-muted-foreground">Vencidas</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.negociacao}</p>
            <p className="text-[11px] text-muted-foreground">Em Negociação</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.sede}</p>
            <p className="text-[11px] text-muted-foreground">Sede</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">{stats.obra}</p>
            <p className="text-[11px] text-muted-foreground">Por Obra</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome, sindicato, empresa ou obra..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-[180px]">
            <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
              <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as Empresas</SelectItem>
                {(companies || []).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px]">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="vigente">Vigente</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="em_negociacao">Em Negociação</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px]">
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="sede">Padrão (Sede)</SelectItem>
                <SelectItem value="obra">Por Obra</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Carregando convenções...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Scale className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma convenção encontrada</p>
            <p className="text-xs mt-1">Cadastre convenções coletivas na aba "Convenção Coletiva" dentro de cada empresa.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((conv: any) => {
              const isExpanded = expandedId === conv.id;
              return (
                <div key={conv.id} className="bg-white border rounded-lg overflow-hidden">
                  {/* Card Header */}
                  <div
                    className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : conv.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{conv.nome}</p>
                          {!conv.obraId ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full">SEDE</span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 rounded-full">OBRA</span>
                          )}
                          {conv.isMatriz ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-primary/10 text-primary rounded-full">MATRIZ</span>
                          ) : null}
                          {statusBadge(conv.status)}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {conv.nomeEmpresa}
                          </span>
                          {conv.nomeObra ? (
                            <span className="flex items-center gap-1">
                              <Landmark className="h-3 w-3" /> {conv.nomeObra}
                            </span>
                          ) : null}
                          {conv.sindicato ? (
                            <span>{conv.sindicato}</span>
                          ) : null}
                          {conv.vigenciaInicio && conv.vigenciaFim ? (
                            <span>
                              Vigência: {new Date(conv.vigenciaInicio + "T12:00:00").toLocaleDateString("pt-BR")} a {new Date(conv.vigenciaFim + "T12:00:00").toLocaleDateString("pt-BR")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        {conv.documentoUrl ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); window.open(conv.documentoUrl, "_blank"); }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded ? (
                    <div className="border-t px-4 pb-4 pt-3 bg-muted/10">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                        <DetailItem label="Piso Salarial" value={conv.pisoSalarial ? `R$ ${conv.pisoSalarial}` : null} />
                        <DetailItem label="Reajuste" value={conv.percentualReajuste ? `${conv.percentualReajuste}%` : null} />
                        <DetailItem label="Data Base" value={conv.dataBase} />
                        <DetailItem label="CNPJ Sindicato" value={conv.cnpjSindicato} />
                        <DetailItem label="Adic. Insalubridade" value={conv.adicionalInsalubridade ? `${conv.adicionalInsalubridade}%` : null} />
                        <DetailItem label="Adic. Periculosidade" value={conv.adicionalPericulosidade ? `${conv.adicionalPericulosidade}%` : null} />
                        <DetailItem label="HE Diurna" value={conv.horaExtraDiurna ? `${conv.horaExtraDiurna}%` : null} />
                        <DetailItem label="HE Noturna" value={conv.horaExtraNoturna ? `${conv.horaExtraNoturna}%` : null} />
                        <DetailItem label="HE Domingo" value={conv.horaExtraDomingo ? `${conv.horaExtraDomingo}%` : null} />
                        <DetailItem label="Adic. Noturno" value={conv.adicionalNoturno ? `${conv.adicionalNoturno}%` : null} />
                        <DetailItem label="Vale Refeição" value={conv.valeRefeicao ? `R$ ${conv.valeRefeicao}` : null} />
                        <DetailItem label="Vale Alimentação" value={conv.valeAlimentacao ? `R$ ${conv.valeAlimentacao}` : null} />
                        <DetailItem label="Vale Transporte" value={conv.valeTransporte ? `R$ ${conv.valeTransporte}` : null} />
                        <DetailItem label="Cesta Básica" value={conv.cestaBasica ? `R$ ${conv.cestaBasica}` : null} />
                        <DetailItem label="Auxílio Farmácia" value={conv.auxilioFarmacia ? `R$ ${conv.auxilioFarmacia}` : null} />
                        <DetailItem label="Seguro de Vida" value={conv.seguroVida ? `R$ ${conv.seguroVida}` : null} />
                        <DetailItem label="Plano de Saúde" value={conv.planoSaude} className="sm:col-span-2" />
                      </div>
                      {conv.outrosBeneficios ? (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">Outros Benefícios</p>
                          <p className="text-xs bg-white p-2 rounded border">{conv.outrosBeneficios}</p>
                        </div>
                      ) : null}
                      {conv.clausulasEspeciais ? (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">Cláusulas Especiais</p>
                          <p className="text-xs bg-white p-2 rounded border">{conv.clausulasEspeciais}</p>
                        </div>
                      ) : null}
                      {conv.observacoes ? (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">Observações</p>
                          <p className="text-xs bg-white p-2 rounded border">{conv.observacoes}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground text-center">
          Para cadastrar ou editar convenções, acesse a aba "Convenção Coletiva" dentro do cadastro de cada empresa.
        </p>
      </div>
      <PrintFooterLGPD />
    </DashboardLayout>
  );
}

function DetailItem({ label, value, className }: { label: string; value: string | null | undefined; className?: string }) {
  if (!value) return null;
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="text-xs font-medium">{value}</p>
    </div>
  );
}
