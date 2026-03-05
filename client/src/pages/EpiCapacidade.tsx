import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Users, AlertTriangle, CheckCircle2, XCircle, ShieldAlert,
  Package, Settings, Plus, Trash2, Save, ChevronDown, ChevronUp,
  Building2, TrendingUp, Info
} from "lucide-react";

const NIVEL_CONFIG = {
  critico: { cor: "#DC2626", bg: "#FEE2E2", icon: XCircle, label: "CRÍTICO", desc: "Estoque insuficiente para novas contratações" },
  baixo: { cor: "#EA580C", bg: "#FFF7ED", icon: ShieldAlert, label: "BAIXO", desc: "Capacidade muito limitada" },
  medio: { cor: "#EAB308", bg: "#FEFCE8", icon: AlertTriangle, label: "MÉDIO", desc: "Capacidade razoável" },
  bom: { cor: "#16A34A", bg: "#F0FDF4", icon: CheckCircle2, label: "BOM", desc: "Boa capacidade de contratação" },
  otimo: { cor: "#059669", bg: "#ECFDF5", icon: TrendingUp, label: "ÓTIMO", desc: "Excelente capacidade" },
};

interface EpiCapacidadeProps {
  companyId: number;
}

export default function EpiCapacidade({ companyId }: EpiCapacidadeProps) {

  const [showConfig, setShowConfig] = useState(false);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [showPorObra, setShowPorObra] = useState(false);
  const [obraFiltro, setObraFiltro] = useState<number | undefined>(undefined);

  // Queries
  const capacidade = trpc.epiAvancado.capacidadeContratacao.useQuery(
    { companyId, obraId: obraFiltro },
    { enabled: !!companyId }
  );
  const capacidadePorObra = trpc.epiAvancado.capacidadePorObra.useQuery(
    { companyId },
    { enabled: !!companyId && showPorObra }
  );
  const kitBasico = trpc.epiAvancado.kitBasicoContratacao.useQuery(
    { companyId },
    { enabled: !!companyId && showConfig }
  );
  const episList = trpc.epis.list.useQuery(
    { companyId },
    { enabled: !!companyId && showConfig }
  );
  const obrasQ = trpc.obras.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Mutation para salvar kit
  const salvarKit = trpc.epiAvancado.salvarKitBasicoContratacao.useMutation({
    onSuccess: () => {
      toast.success("Kit básico de contratação atualizado com sucesso.");
      capacidade.refetch();
      kitBasico.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // State para edição do kit
  const [editItens, setEditItens] = useState<{
    epiId: number | null;
    nomeEpi: string;
    categoria: "EPI" | "Uniforme" | "Calcado";
    quantidade: number;
    obrigatorio: number;
  }[]>([]);
  const [editMode, setEditMode] = useState(false);

  const startEdit = () => {
    if (kitBasico.data?.itens && kitBasico.data.itens.length > 0) {
      setEditItens(kitBasico.data.itens.map(i => ({
        epiId: i.epiId,
        nomeEpi: i.nomeEpi,
        categoria: i.categoria,
        quantidade: i.quantidade,
        obrigatorio: i.obrigatorio,
      })));
    } else {
      // Carregar kit padrão
      setEditItens([
        { epiId: null, nomeEpi: "Capacete de Segurança", categoria: "EPI", quantidade: 1, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Óculos de Proteção", categoria: "EPI", quantidade: 1, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Protetor Auricular", categoria: "EPI", quantidade: 1, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Luva de Segurança", categoria: "EPI", quantidade: 1, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Botina de Segurança", categoria: "Calcado", quantidade: 1, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Camisa Manga Longa", categoria: "Uniforme", quantidade: 2, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Calça de Brim", categoria: "Uniforme", quantidade: 2, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Máscara PFF2", categoria: "EPI", quantidade: 1, obrigatorio: 1 },
      ]);
    }
    setEditMode(true);
  };

  const addItem = () => {
    setEditItens([...editItens, { epiId: null, nomeEpi: "", categoria: "EPI", quantidade: 1, obrigatorio: 1 }]);
  };

  const removeItem = (idx: number) => {
    setEditItens(editItens.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...editItens];
    (updated[idx] as any)[field] = value;
    setEditItens(updated);
  };

  const saveKit = () => {
    const valid = editItens.filter(i => i.nomeEpi.trim());
    if (valid.length === 0) {
      toast.error("Adicione pelo menos um item ao kit.");
      return;
    }
    salvarKit.mutate({ companyId, itens: valid });
    setEditMode(false);
  };

  const data = capacidade.data;
  const nivel = data?.nivel ? NIVEL_CONFIG[data.nivel] : NIVEL_CONFIG.critico;

  return (
    <div className="space-y-6">
      {/* Card Principal de Capacidade */}
      <div className="rounded-xl border-2 overflow-hidden" style={{ borderColor: nivel.cor + '40' }}>
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: nivel.bg }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: nivel.cor + '20' }}>
              <Users className="w-6 h-6" style={{ color: nivel.cor }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Capacidade de Contratação</h2>
              <p className="text-sm text-gray-600">Quantos novos funcionários você consegue equipar com o estoque atual</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {obrasQ.data && obrasQ.data.length > 0 && (
              <Select
                value={obraFiltro?.toString() || "todas"}
                onValueChange={(v) => setObraFiltro(v === "todas" ? undefined : parseInt(v))}
              >
                <SelectTrigger className="w-[200px] bg-white">
                  <SelectValue placeholder="Todas as obras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Estoque Geral (Central + Obras)</SelectItem>
                  {obrasQ.data.map((o: any) => (
                    <SelectItem key={o.id} value={o.id.toString()}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={() => { setShowConfig(!showConfig); if (!showConfig) startEdit(); }}>
              <Settings className="w-4 h-4 mr-1" /> Configurar Kit
            </Button>
          </div>
        </div>

        {/* Número Grande */}
        <div className="px-6 py-8 flex items-center justify-between bg-white">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-7xl font-black" style={{ color: nivel.cor }}>
                {capacidade.isLoading ? "..." : (data?.capacidade ?? 0)}
              </div>
              <div className="text-sm font-medium text-gray-500 mt-1">
                {data?.capacidade === 1 ? "funcionário" : "funcionários"}
              </div>
            </div>
            <div className="border-l pl-6 space-y-1">
              <div className="flex items-center gap-2">
                <nivel.icon className="w-5 h-5" style={{ color: nivel.cor }} />
                <span className="text-sm font-bold" style={{ color: nivel.cor }}>{nivel.label}</span>
              </div>
              <p className="text-sm text-gray-600 max-w-md">
                {data?.mensagem || "Carregando..."}
              </p>
              {data?.gargalo && (
                <div className="flex items-center gap-1 mt-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-xs text-amber-800">
                    <strong>Gargalo:</strong> {data.gargalo.nomeEpi} (estoque: {data.gargalo.estoqueTotal})
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="text-right space-y-1">
            {data?.kitConfigurado && (
              <>
                <div className="text-xs text-gray-400">Kit: {data.kitNome}</div>
                <div className="text-xs text-gray-400">{data.totalItensKit} itens ({data.itensObrigatorios} obrigatórios)</div>
              </>
            )}
          </div>
        </div>

        {/* Botões de expansão */}
        <div className="px-6 py-3 bg-gray-50 border-t flex gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetalhes(!showDetalhes)}
            className="text-gray-600"
          >
            <Package className="w-4 h-4 mr-1" />
            Detalhes por Item
            {showDetalhes ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPorObra(!showPorObra)}
            className="text-gray-600"
          >
            <Building2 className="w-4 h-4 mr-1" />
            Capacidade por Obra
            {showPorObra ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      </div>

      {/* Detalhes por Item */}
      {showDetalhes && data?.detalhes && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Package className="w-4 h-4" /> Detalhes por Item do Kit
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Item do Kit</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Categoria</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Qtd/Pessoa</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Estoque Central</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Estoque Obras</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Total</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Capacidade</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.detalhes.map((item, idx) => {
                  const isGargalo = data.gargalo && item.nomeEpi === data.gargalo.nomeEpi;
                  const corItem = item.capacidade === 0 ? "#DC2626" : item.capacidade <= 3 ? "#EA580C" : item.capacidade <= 10 ? "#EAB308" : "#16A34A";
                  return (
                    <tr key={idx} className={`border-b ${isGargalo ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {isGargalo && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                          <span className={`font-medium ${isGargalo ? 'text-red-700' : 'text-gray-800'}`}>
                            {item.nomeEpi}
                          </span>
                          {!item.encontradoNoCatalogo && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Não vinculado</span>
                          )}
                        </div>
                      </td>
                      <td className="text-center px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{item.categoria}</span>
                      </td>
                      <td className="text-center px-4 py-2.5 font-medium">{item.qtdNecessariaPorPessoa}</td>
                      <td className="text-center px-4 py-2.5">{item.estoqueCentral}</td>
                      <td className="text-center px-4 py-2.5">{item.estoqueObra}</td>
                      <td className="text-center px-4 py-2.5 font-bold">{item.estoqueTotal}</td>
                      <td className="text-center px-4 py-2.5">
                        <span className="font-bold text-lg" style={{ color: corItem }}>{item.capacidade}</span>
                      </td>
                      <td className="text-center px-4 py-2.5">
                        {item.capacidade === 0 ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">Sem estoque</span>
                        ) : item.capacidade <= 3 ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">Crítico</span>
                        ) : item.capacidade <= 10 ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium">Atenção</span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-blue-50 border-t flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-blue-700">
              A capacidade geral é determinada pelo item com menor disponibilidade (gargalo). Itens "Não vinculado" não foram encontrados no catálogo — vincule-os na configuração do kit.
            </span>
          </div>
        </div>
      )}

      {/* Capacidade por Obra */}
      {showPorObra && capacidadePorObra.data && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Capacidade por Obra (somente estoque da obra)
            </h3>
          </div>
          {!capacidadePorObra.data.kitConfigurado ? (
            <div className="p-6 text-center text-gray-500">Configure o kit básico primeiro.</div>
          ) : capacidadePorObra.data.obras.length === 0 ? (
            <div className="p-6 text-center text-gray-500">Nenhuma obra ativa encontrada.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
              {capacidadePorObra.data.obras.map((obra) => {
                const corObra = obra.capacidade === 0 ? "#DC2626" : obra.capacidade <= 3 ? "#EA580C" : obra.capacidade <= 10 ? "#EAB308" : "#16A34A";
                return (
                  <div key={obra.obraId} className="rounded-lg border p-4 text-center" style={{ borderColor: corObra + '40' }}>
                    <div className="text-3xl font-black" style={{ color: corObra }}>{obra.capacidade}</div>
                    <div className="text-xs text-gray-500 mt-1">funcionários</div>
                    <div className="text-sm font-medium text-gray-800 mt-2 truncate" title={obra.obraNome}>
                      {obra.obraNome}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Configuração do Kit Básico */}
      {showConfig && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Settings className="w-4 h-4" /> Configuração do Kit Básico de Contratação
            </h3>
            <div className="flex gap-2">
              {!editMode ? (
                <Button size="sm" onClick={startEdit}>Editar Kit</Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
                  <Button size="sm" onClick={saveKit} disabled={salvarKit.isPending}>
                    <Save className="w-4 h-4 mr-1" /> {salvarKit.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {editMode ? (
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-500 mb-3">
                Defina os itens obrigatórios para equipar um novo funcionário. A capacidade será calculada com base no estoque disponível.
              </p>
              {editItens.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                  <span className="text-xs text-gray-400 w-6">{idx + 1}.</span>
                  <Input
                    value={item.nomeEpi}
                    onChange={(e) => updateItem(idx, "nomeEpi", e.target.value)}
                    placeholder="Nome do EPI"
                    className="flex-1 bg-white"
                  />
                  <Select
                    value={item.categoria}
                    onValueChange={(v) => updateItem(idx, "categoria", v)}
                  >
                    <SelectTrigger className="w-[130px] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EPI">EPI</SelectItem>
                      <SelectItem value="Uniforme">Uniforme</SelectItem>
                      <SelectItem value="Calcado">Calçado</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">Qtd:</span>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantidade}
                      onChange={(e) => updateItem(idx, "quantidade", parseInt(e.target.value) || 1)}
                      className="w-16 bg-white text-center"
                    />
                  </div>
                  {episList.data && (
                    <Select
                      value={item.epiId?.toString() || "none"}
                      onValueChange={(v) => updateItem(idx, "epiId", v === "none" ? null : parseInt(v))}
                    >
                      <SelectTrigger className="w-[200px] bg-white">
                        <SelectValue placeholder="Vincular ao catálogo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem vínculo</SelectItem>
                        {episList.data.map((epi: any) => (
                          <SelectItem key={epi.id} value={epi.id.toString()}>
                            {epi.nome} (est: {epi.quantidadeEstoque || 0})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addItem} className="mt-2">
                <Plus className="w-4 h-4 mr-1" /> Adicionar Item
              </Button>
            </div>
          ) : (
            <div className="p-4">
              {kitBasico.isLoading ? (
                <div className="text-center text-gray-400 py-4">Carregando...</div>
              ) : !kitBasico.data?.kit ? (
                <div className="text-center py-6">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">Nenhum kit básico configurado.</p>
                  <Button size="sm" className="mt-3" onClick={startEdit}>Configurar Agora</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {kitBasico.data.itens.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{idx + 1}.</span>
                        <span className="font-medium text-gray-800">{item.nomeEpi}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{item.categoria}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">{item.quantidade}x por pessoa</span>
                        {item.epiId && <span className="text-xs text-green-600">Vinculado</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
