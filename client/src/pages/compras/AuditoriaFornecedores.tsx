import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle, CheckCircle2, RefreshCw, Merge, FileText,
  ShoppingCart, CreditCard, ChevronDown, ChevronRight, Wrench, Package, BookOpen,
} from "lucide-react";
import ItemCatalogo from "@/components/compras/ItemCatalogo";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";

type Aba = "ocs" | "lancamentos" | "cadastro" | "itens" | "catalogo";

export default function AuditoriaFornecedores() {
  const { user } = useAuth();
  const { toast } = useToast();
  const companyId = user?.companyId ?? 0;
  const [aba, setAba] = useState<Aba>("ocs");
  const [expandedFE, setExpandedFE] = useState<Set<string>>(new Set());
  const [expandedDup, setExpandedDup] = useState<Set<string>>(new Set());
  const [expandedItem, setExpandedItem] = useState<Set<string>>(new Set());
  const [mergeDialog, setMergeDialog] = useState<{
    canonicalId: number; duplicateId: number;
    canonicalNome: string; duplicateNome: string;
  } | null>(null);

  const { data, isLoading, refetch } = trpc.compras.auditarFornecedores.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const itensQ = trpc.compras.auditarItens.useQuery(
    { companyId },
    { enabled: companyId > 0 && aba === "itens" }
  );

  const padronizarItens = trpc.compras.padronizarItens.useMutation({
    onSuccess: (r) => {
      toast({ title: "Itens padronizados", description: `${r.updated} registro(s) corrigido(s) em OCs, SCs e Cotações.` });
      itensQ.refetch();
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const padronizarOC = trpc.compras.padronizarNomesOC.useMutation({
    onSuccess: (r) => {
      toast({ title: "OCs padronizadas", description: `${r.updated} registro(s) corrigido(s).` });
      refetch();
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const padronizarFE = trpc.compras.padronizarNomeFE.useMutation({
    onSuccess: (r) => {
      toast({ title: "Lançamentos padronizados", description: `${r.updated} registro(s) corrigido(s).` });
      refetch();
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const mesclarForn = trpc.compras.mesclarFornecedor.useMutation({
    onSuccess: (r) => {
      toast({
        title: "Fornecedor mesclado",
        description: `"${r.duplicateNome}" → "${r.canonicalNome}". ${r.ocsReatribuidas} OC(s) + ${r.lancamentosAtualizados} lançamento(s) atualizados.`,
      });
      setMergeDialog(null);
      refetch();
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const ocIssues = data?.variantesOC ?? [];
  const feIssues = data?.variantesFE ?? [];
  const dupIssues = data?.duplicatasCadastro ?? [];
  const itemIssues = itensQ.data?.duplicatas ?? [];

  const totalProblemas = ocIssues.length + feIssues.length + dupIssues.length + itemIssues.length;

  function toggleFE(key: string) {
    setExpandedFE(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleDup(key: string) {
    setExpandedDup(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleItem(key: string) {
    setExpandedItem(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-500" />
            Auditoria de Fornecedores
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Detecta nomes duplicados ou variantes que fragmentam a análise de custos
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Summary cards */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Variantes em OCs", count: ocIssues.length, icon: ShoppingCart, color: "text-blue-500", tab: "ocs" as Aba },
            { label: "Variantes em Lançamentos", count: feIssues.length, icon: CreditCard, color: "text-amber-500", tab: "lancamentos" as Aba },
            { label: "Duplicatas no Cadastro", count: dupIssues.length, icon: FileText, color: "text-red-500", tab: "cadastro" as Aba },
            { label: "Itens com Nomes Variantes", count: itemIssues.length, icon: Package, color: "text-purple-500", tab: "itens" as Aba },
          ].map(c => (
            <button
              key={c.tab}
              onClick={() => setAba(c.tab)}
              className={`rounded-xl border p-3 text-left transition-all ${aba === c.tab ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <c.icon className={`w-4 h-4 ${c.color}`} />
                <span className="text-xs text-slate-500">{c.label}</span>
              </div>
              <div className={`text-2xl font-bold ${c.count > 0 ? c.color : "text-slate-400"}`}>{c.count}</div>
            </button>
          ))}
        </div>
      )}

      {totalProblemas === 0 && !isLoading && (
        <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-300">
            Nenhuma inconsistência encontrada. Todos os nomes estão padronizados.
          </AlertDescription>
        </Alert>
      )}

      {/* Tab selector */}
      <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {([
          ["ocs", "OCs", ShoppingCart, ocIssues.length],
          ["lancamentos", "Lançamentos Fin.", CreditCard, feIssues.length],
          ["cadastro", "Duplicatas Cadastro", FileText, dupIssues.length],
          ["itens", "Itens", Package, itemIssues.length],
          ["catalogo", "Catálogo de Itens", BookOpen, 0],
        ] as [Aba, string, any, number][]).map(([tab, label, Icon, count]) => (
          <button
            key={tab}
            onClick={() => setAba(tab)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${aba === tab ? "bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700"}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {count > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${aba === tab ? "bg-amber-100 text-amber-700" : "bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300"}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── ABA: OCs ─── */}
      {aba === "ocs" && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Ordens de Compra com nomes inconsistentes
              </CardTitle>
              {ocIssues.length > 0 && (
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                  disabled={padronizarOC.isPending}
                  onClick={() => padronizarOC.mutate({ companyId })}
                >
                  {padronizarOC.isPending ? (
                    <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Padronizando…</>
                  ) : (
                    <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Padronizar Todos</>
                  )}
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Mesmo fornecedor (mesmo ID) registrado com nomes diferentes nas OCs — padroniza para a Razão Social do cadastro.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-slate-400 text-sm">Carregando…</div>
            ) : ocIssues.length === 0 ? (
              <div className="text-center py-8 text-green-600 text-sm flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8" />
                Todas as OCs estão com nomes padronizados
              </div>
            ) : (
              <div className="space-y-2">
                {ocIssues.map((item) => (
                  <div key={item.fornecedorId} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800">
                      <div>
                        <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{item.razaoCanonical}</span>
                        <span className="ml-2 text-xs text-slate-400">ID #{item.fornecedorId} · {item.totalOcs} OC(s)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
                          {item.qtdVariantes} variantes
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          disabled={padronizarOC.isPending}
                          onClick={() => padronizarOC.mutate({ companyId, fornecedorId: item.fornecedorId })}
                        >
                          Corrigir
                        </Button>
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-xs text-slate-500 mb-1">Nomes encontrados:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {item.nomesUsados.map((nome: string) => (
                          <span
                            key={nome}
                            className={`text-xs px-2 py-0.5 rounded-full border ${nome === item.razaoCanonical ? "bg-green-50 border-green-300 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}
                          >
                            {nome === item.razaoCanonical ? "✓ " : "⚠ "}{nome}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">→ Será padronizado para: <strong>{item.razaoCanonical}</strong></p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── ABA: Lançamentos Financeiros ─── */}
      {aba === "lancamentos" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Lançamentos financeiros com nomes variantes
            </CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Nomes similares agrupados por prefixo — fragmentam relatórios por fornecedor. Escolha o nome canônico e aplique.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-slate-400 text-sm">Carregando…</div>
            ) : feIssues.length === 0 ? (
              <div className="text-center py-8 text-green-600 text-sm flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8" />
                Todos os lançamentos estão com nomes consistentes
              </div>
            ) : (
              <div className="space-y-2">
                {feIssues.map((grp) => {
                  const isOpen = expandedFE.has(grp.prefixo);
                  const variantes: Array<{ nome: string; n: number; total: number }> =
                    Array.isArray(grp.variantes) ? grp.variantes : [];
                  // O nome com mais lançamentos é o sugerido como canônico
                  const sugerido = variantes[0]?.nome ?? "";
                  return (
                    <div key={grp.prefixo} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-left"
                        onClick={() => toggleFE(grp.prefixo)}
                      >
                        <div className="flex items-center gap-2">
                          {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                          <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{sugerido}</span>
                          <span className="text-xs text-slate-400">{grp.totalLancamentos} lançamento(s)</span>
                        </div>
                        <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
                          {grp.qtdVariantes} variantes
                        </Badge>
                      </button>
                      {isOpen && (
                        <div className="px-3 py-3 space-y-3">
                          <p className="text-xs text-slate-500 font-medium">Variantes encontradas — selecione qual manter:</p>
                          {variantes.map((v) => (
                            <div key={v.nome} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-sm text-slate-700 dark:text-slate-300 break-all">{v.nome}</span>
                                <span className="text-xs text-slate-400 shrink-0">{v.n} lançamento(s)</span>
                              </div>
                              {v.nome !== sugerido && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 shrink-0"
                                  disabled={padronizarFE.isPending}
                                  onClick={() => padronizarFE.mutate({
                                    companyId,
                                    substituicoes: [{ de: v.nome, para: sugerido }],
                                  })}
                                >
                                  → "{sugerido.substring(0, 30)}{sugerido.length > 30 ? "…" : ""}"
                                </Button>
                              )}
                              {v.nome === sugerido && (
                                <span className="text-xs text-green-600 font-medium shrink-0">✓ mais frequente</span>
                              )}
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                              disabled={padronizarFE.isPending}
                              onClick={() => {
                                const subs = variantes
                                  .filter(v => v.nome !== sugerido)
                                  .map(v => ({ de: v.nome, para: sugerido }));
                                if (subs.length > 0) padronizarFE.mutate({ companyId, substituicoes: subs });
                              }}
                            >
                              Padronizar todos para "{sugerido.substring(0, 25)}{sugerido.length > 25 ? "…" : ""}"
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── ABA: Duplicatas no Cadastro ─── */}
      {aba === "cadastro" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Fornecedores duplicados no cadastro
            </CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Mesmos fornecedores cadastrados mais de uma vez com nomes ligeiramente diferentes. Mesclar transfere todas as OCs e lançamentos para o registro canônico e desativa o duplicado.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-slate-400 text-sm">Carregando…</div>
            ) : dupIssues.length === 0 ? (
              <div className="text-center py-8 text-green-600 text-sm flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8" />
                Nenhuma duplicata encontrada no cadastro
              </div>
            ) : (
              <div className="space-y-2">
                {dupIssues.map((grp) => {
                  const isOpen = expandedDup.has(grp.razaoNorm);
                  const registros: Array<{ id: number; razaoSocial: string; nomeFantasia: string; cnpj: string; ativo: boolean }> =
                    Array.isArray(grp.registros) ? grp.registros : [];
                  const ativos = registros.filter(r => r.ativo);
                  const inativos = registros.filter(r => !r.ativo);
                  return (
                    <div key={grp.razaoNorm} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-left"
                        onClick={() => toggleDup(grp.razaoNorm)}
                      >
                        <div className="flex items-center gap-2">
                          {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                          <span className="font-medium text-sm text-slate-800 dark:text-slate-200">
                            {registros[0]?.razaoSocial ?? grp.razaoNorm}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {ativos.length > 1 && (
                            <Badge className="text-xs bg-red-100 text-red-700 border-red-200">
                              {ativos.length} ativos
                            </Badge>
                          )}
                          {inativos.length > 0 && (
                            <Badge variant="outline" className="text-xs text-slate-500">
                              {inativos.length} inativo(s)
                            </Badge>
                          )}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-3 py-3 space-y-2">
                          {registros.map((r) => (
                            <div key={r.id} className={`flex items-start justify-between gap-2 p-2 rounded-lg ${r.ativo ? "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600" : "bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 opacity-70"}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-sm text-slate-800 dark:text-slate-200 break-all">{r.razaoSocial}</span>
                                  <Badge variant={r.ativo ? "default" : "outline"} className={`text-[10px] shrink-0 ${r.ativo ? "bg-green-100 text-green-700 border-green-200" : "text-slate-400"}`}>
                                    {r.ativo ? "Ativo" : "Inativo"}
                                  </Badge>
                                </div>
                                {r.nomeFantasia && r.nomeFantasia !== r.razaoSocial && (
                                  <p className="text-xs text-slate-400">Fantasia: {r.nomeFantasia}</p>
                                )}
                                <p className="text-xs text-slate-400">CNPJ: {r.cnpj ?? "—"} · ID #{r.id}</p>
                              </div>
                              {/* Só mostra merge se há 2 ativos OU se é o duplicado inativo e existe 1 ativo */}
                              {r.ativo && ativos.length > 1 && (
                                <div className="flex flex-col gap-1 shrink-0">
                                  {registros.filter(o => o.id !== r.id && o.ativo).map(outro => (
                                    <Button
                                      key={outro.id}
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7 border-red-200 text-red-600 hover:bg-red-50"
                                      onClick={() => setMergeDialog({
                                        canonicalId: r.id,
                                        duplicateId: outro.id,
                                        canonicalNome: r.razaoSocial,
                                        duplicateNome: outro.razaoSocial,
                                      })}
                                    >
                                      <Merge className="w-3 h-3 mr-1" />
                                      Mesclar #{outro.id}
                                    </Button>
                                  ))}
                                </div>
                              )}
                              {!r.ativo && ativos.length === 1 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 border-red-200 text-red-600 hover:bg-red-50 shrink-0"
                                  onClick={() => setMergeDialog({
                                    canonicalId: ativos[0].id,
                                    duplicateId: r.id,
                                    canonicalNome: ativos[0].razaoSocial,
                                    duplicateNome: r.razaoSocial,
                                  })}
                                >
                                  <Merge className="w-3 h-3 mr-1" />
                                  Migrar para ativo
                                </Button>
                              )}
                            </div>
                          ))}
                          {ativos.length <= 1 && inativos.length > 0 && (
                            <p className="text-xs text-slate-400 italic">Duplicato(s) inativo(s) — use "Migrar para ativo" para garantir que dados históricos apontem para o registro correto.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── ABA: Itens ─── */}
      {aba === "itens" && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Itens com descrições variantes
                </CardTitle>
                <p className="text-xs text-slate-400 mt-1">
                  Mesmo produto digitado de formas diferentes (acento, número romano vs arábico, abreviações). Padronize para um único nome.
                </p>
              </div>
              {itemIssues.length > 0 && (
                <Button
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs shrink-0"
                  disabled={padronizarItens.isPending}
                  onClick={() => {
                    const subs = itemIssues.flatMap(g =>
                      g.variantes.filter(v => v.nome !== g.canonical).map(v => ({ de: v.nome, para: g.canonical }))
                    );
                    if (subs.length > 0) padronizarItens.mutate({ companyId, substituicoes: subs });
                  }}
                >
                  {padronizarItens.isPending ? (
                    <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Padronizando…</>
                  ) : (
                    <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Padronizar Todos</>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {itensQ.isLoading ? (
              <div className="text-center py-8 text-slate-400 text-sm">Analisando itens…</div>
            ) : itemIssues.length === 0 ? (
              <div className="text-center py-8 text-green-600 text-sm flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8" />
                Todos os itens estão com nomes consistentes
              </div>
            ) : (
              <div className="space-y-2">
                {itemIssues.map((grp) => {
                  const isOpen = expandedItem.has(grp.key);
                  return (
                    <div key={grp.key} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-left"
                        onClick={() => toggleItem(grp.key)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                          <span className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">{grp.canonical}</span>
                          <span className="text-xs text-slate-400 shrink-0">{grp.totalOcs} OC(s)</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="text-xs text-slate-400">
                            R${grp.totalGasto.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <Badge variant="outline" className="text-xs border-purple-300 text-purple-700 bg-purple-50">
                            {grp.variantes.length} variantes
                          </Badge>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-3 py-3 space-y-2">
                          <p className="text-xs text-slate-500 font-medium mb-1">
                            Será padronizado para: <strong className="text-green-700">"{grp.canonical}"</strong>
                          </p>
                          {grp.variantes.map((v) => (
                            <div key={v.nome} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {v.nome === grp.canonical ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                ) : (
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                )}
                                <span className={`text-sm break-all ${v.nome === grp.canonical ? "text-green-700 font-medium" : "text-slate-700 dark:text-slate-300"}`}>
                                  {v.nome}
                                </span>
                                <span className="text-xs text-slate-400 shrink-0">{v.n_ocs} OC(s) · {v.unidade}</span>
                              </div>
                              {v.nome !== grp.canonical && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 shrink-0"
                                  disabled={padronizarItens.isPending}
                                  onClick={() => padronizarItens.mutate({
                                    companyId,
                                    substituicoes: [{ de: v.nome, para: grp.canonical }],
                                  })}
                                >
                                  Corrigir
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── ABA: Catálogo de Itens ─── */}
      {aba === "catalogo" && (
        <Card>
          <CardHeader className="pb-2">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Catálogo de Itens
              </CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                Todos os itens comprados agrupados por família de produto. Expanda uma família para ver as variantes e, em cada variante, as OCs por obra.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <ItemCatalogo companyId={companyId} />
          </CardContent>
        </Card>
      )}

      {/* Dialog de confirmação de mesclagem */}
      {mergeDialog && (
        <Dialog open onOpenChange={() => setMergeDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Merge className="w-5 h-5 text-red-500" />
                Confirmar mesclagem de fornecedor
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm">
                  Esta operação não pode ser desfeita automaticamente.
                </AlertDescription>
              </Alert>
              <div className="space-y-1 text-sm">
                <p className="text-slate-600 dark:text-slate-300">
                  <strong>Será desativado:</strong>{" "}
                  <span className="text-red-600 break-all">{mergeDialog.duplicateNome}</span>{" "}
                  (ID #{mergeDialog.duplicateId})
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  <strong>Será mantido:</strong>{" "}
                  <span className="text-green-600 break-all">{mergeDialog.canonicalNome}</span>{" "}
                  (ID #{mergeDialog.canonicalId})
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Todas as OCs e lançamentos financeiros vinculados ao registro duplicado serão atualizados para o registro canônico.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMergeDialog(null)}>Cancelar</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={mesclarForn.isPending}
                onClick={() => mesclarForn.mutate({
                  companyId,
                  canonicalId: mergeDialog.canonicalId,
                  duplicateId: mergeDialog.duplicateId,
                })}
              >
                {mesclarForn.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Mesclando…</> : <><Merge className="w-4 h-4 mr-2" /> Mesclar e Desativar</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
