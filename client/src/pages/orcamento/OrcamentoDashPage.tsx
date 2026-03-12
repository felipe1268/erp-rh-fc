import React, { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import OrcamentoDashTab from "./OrcamentoDashTab";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, ArrowLeft } from "lucide-react";

const n = (v: any) => parseFloat(v || "0") || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function OrcamentoDashPage() {
  const [, params] = useRoute("/orcamento/:id/dash");
  const [, setLocation] = useLocation();
  const { company } = useCompany();
  const companyId = parseInt(company?.id ? String(company.id) : "0");

  const [selectedId, setSelectedId] = useState<number | null>(
    params?.id ? parseInt(params.id) : null
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  // Lista de orçamentos para o seletor
  const { data: lista = [], isLoading: loadingLista } = trpc.orcamento.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Auto-seleciona o primeiro se nenhum foi passado na URL
  useEffect(() => {
    if (!selectedId && lista.length > 0) {
      setSelectedId(n(lista[0].id));
    }
  }, [lista, selectedId]);

  // Dados completos do orçamento selecionado
  const { data, isLoading: loadingOrc } = trpc.orcamento.getById.useQuery(
    { id: selectedId ?? 0 },
    { enabled: !!selectedId }
  );

  const orc = data as any;

  // ── Cálculos (replicados de OrcamentoDetalhe) ──────────────────
  const itens    = orc?.itens    ?? [];
  const insumos  = orc?.insumos  ?? [];
  const bdiLinhas = orc?.bdiLinhas ?? [];

  const bdiPct  = n(orc?.bdiPercentual) * 100;
  const metaPct = n(orc?.metaPercentual) * 100;

  // Mapa de grupos
  const childMap: Record<string, boolean> = {};
  itens.forEach((item: any) => {
    const dot = item.eapCodigo?.lastIndexOf(".");
    if (dot > 0) childMap[item.eapCodigo.slice(0, dot)] = true;
  });

  const leafItems = itens.filter((i: any) => !childMap[i.eapCodigo]);
  const calcMat   = r2(leafItems.reduce((s: number, i: any) => r2(s) + r2(n(i.custoTotalMat)), 0));
  const calcMdo   = r2(leafItems.reduce((s: number, i: any) => r2(s) + r2(n(i.custoTotalMdo)), 0));
  const calcCusto = r2(leafItems.reduce((s: number, i: any) => r2(s) + r2(n(i.custoTotal)),    0));
  const calcVenda = r2(leafItems.reduce((s: number, i: any) => r2(s) + r2(n(i.vendaTotal)),    0));

  const totalCusto     = r2(n(orc?.totalCusto) || calcCusto);
  const totalVenda     = r2(n(orc?.totalVenda) || calcVenda);
  const totalMat       = r2(n(orc?.totalMateriais) || calcMat);
  const totalMdo       = r2(n(orc?.totalMdo) || calcMdo);
  const valorNegociado = r2(n(orc?.valorNegociado));
  const totalMeta      = r2(totalCusto * (1 - metaPct / 100));

  const margemLucroPct = n(orc?.margemLucroBdi) > 0
    ? n(orc?.margemLucroBdi)
    : (totalVenda > 0 && totalCusto > 0 ? (totalVenda - totalCusto) / totalVenda : 0);

  const composicoesCatalogo: any[] = [];

  const selectedOrc = lista.find((o: any) => n(o.id) === selectedId);

  return (
    <DashboardLayout>
      <div className="p-4">

        {/* ── Cabeçalho ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost" size="sm"
              className="text-muted-foreground -ml-2"
              onClick={() => selectedId ? setLocation(`/orcamento/${selectedId}`) : setLocation("/orcamento/lista")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Dashboard do Orçamento</h1>
              {selectedOrc && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedOrc.descricao ?? selectedOrc.nome ?? `Orçamento #${selectedOrc.id}`}
                  {selectedOrc.cliente ? ` · ${selectedOrc.cliente}` : ""}
                </p>
              )}
            </div>
          </div>

          {/* Seletor de Orçamento */}
          <div className="relative">
            <button
              onClick={() => setPickerOpen(v => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium shadow-sm transition-all min-w-[240px] justify-between"
            >
              <span className="truncate">
                {loadingLista ? "Carregando..." : selectedOrc
                  ? (selectedOrc.descricao ?? selectedOrc.nome ?? `Orçamento #${selectedOrc.id}`)
                  : "Selecionar orçamento"}
              </span>
              <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
            </button>

            {pickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-80 max-h-72 overflow-y-auto">
                {lista.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">Nenhum orçamento encontrado</p>
                ) : (
                  lista.map((o: any) => (
                    <button
                      key={o.id}
                      onClick={() => { setSelectedId(n(o.id)); setPickerOpen(false); setLocation(`/orcamento/${o.id}/dash`); }}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 ${n(o.id) === selectedId ? "bg-emerald-50 text-emerald-700 font-medium" : "text-slate-700"}`}
                    >
                      <p className="font-medium truncate">{o.descricao ?? o.nome ?? `Orçamento #${o.id}`}</p>
                      {o.cliente && <p className="text-[10px] text-muted-foreground mt-0.5">{o.cliente}</p>}
                      {n(o.totalVenda) > 0 && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Venda: {formatBRL(n(o.totalVenda))} · BDI: {(n(o.bdiPercentual)*100).toFixed(1)}%
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Conteúdo ──────────────────────────────────────────────── */}
        {!selectedId && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
            <p className="text-lg font-medium">Selecione um orçamento para ver o dashboard</p>
            <p className="text-sm">Use o seletor acima para escolher</p>
          </div>
        )}

        {selectedId && loadingOrc && (
          <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Carregando dados do orçamento...</span>
          </div>
        )}

        {selectedId && !loadingOrc && orc && (
          <OrcamentoDashTab
            orc={orc}
            orcamentoId={selectedId ?? 0}
            itens={itens}
            insumos={insumos}
            bdiLinhas={bdiLinhas}
            totalCusto={totalCusto}
            totalVenda={totalVenda}
            totalMat={totalMat}
            totalMdo={totalMdo}
            totalMeta={totalMeta}
            valorNegociado={valorNegociado}
            margemLucroPct={margemLucroPct}
            bdiPct={bdiPct}
            metaPct={metaPct}
            childMap={childMap}
            composicoesCatalogo={composicoesCatalogo}
            formatBRL={formatBRL}
          />
        )}

      </div>
    </DashboardLayout>
  );
}
