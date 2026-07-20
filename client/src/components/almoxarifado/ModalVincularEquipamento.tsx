import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { X, Wrench, Truck, Loader2, ShieldCheck } from "lucide-react";

type Item = {
  id: number;
  nome: string;
  categoria?: string | null;
  fotoUrl?: string | null;
  valorUnitario?: string | number | null;
  obraId?: number | null;
};

type Props = {
  aberto: boolean;
  item: Item | null;
  onFechar: () => void;
  onSucesso?: (r: { equipamentoId: number; tipo: "proprio" | "locado" }) => void;
};

export function ModalVincularEquipamento({ aberto, item, onFechar, onSucesso }: Props) {
  const { selectedCompanyId } = useCompany();
  const [tipo, setTipo] = useState<"proprio" | "locado">("proprio");

  // Próprio
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [numeroSerie, setNumeroSerie] = useState("");
  const [dataAquisicao, setDataAquisicao] = useState("");
  const [valorAquisicao, setValorAquisicao] = useState("");
  const [vidaUtilMeses, setVidaUtilMeses] = useState("");

  // Locado
  const [fornecedorNome, setFornecedorNome] = useState("");
  const [dataInicio, setDataInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [dataFimPrevista, setDataFimPrevista] = useState("");
  const [valorMensal, setValorMensal] = useState("");
  const [valorDiario, setValorDiario] = useState("");
  const [codigoPatrimonioFornecedor, setCodigoPatrimonioFornecedor] = useState("");

  useEffect(() => {
    if (aberto && item) {
      setTipo("proprio");
      setMarca(""); setModelo(""); setNumeroSerie("");
      setDataAquisicao(new Date().toISOString().slice(0, 10));
      setValorAquisicao(item.valorUnitario ? String(parseFloat(String(item.valorUnitario))) : "");
      setVidaUtilMeses("");
      setFornecedorNome("");
      setDataInicio(new Date().toISOString().slice(0, 10));
      setDataFimPrevista("");
      setValorMensal(""); setValorDiario("");
      setCodigoPatrimonioFornecedor("");
    }
  }, [aberto, item]);

  const utils = trpc.useUtils();
  const mutVincular = trpc.equipamentos.vincularItemAlmoxarifado.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.tipo === "proprio"
          ? `Equipamento Próprio cadastrado (#${r.equipamentoId}).`
          : `Equipamento Locado cadastrado (#${r.equipamentoId}).`,
      );
      utils.compras.listarItens.invalidate?.();
      onSucesso?.(r);
      onFechar();
    },
    onError: (e) => toast.error(e.message || "Falha ao vincular."),
  });

  if (!aberto || !item || !selectedCompanyId) return null;

  const podeSubmeter = (() => {
    if (mutVincular.isPending) return false;
    if (tipo === "proprio") return true;
    return fornecedorNome.trim().length > 0 && !!dataInicio && !!dataFimPrevista;
  })();

  const submeter = () => {
    if (tipo === "proprio") {
      mutVincular.mutate({
        companyId: Number(selectedCompanyId),
        itemId: item.id,
        tipo: "proprio",
        proprio: {
          marca: marca.trim() || undefined,
          modelo: modelo.trim() || undefined,
          numeroSerie: numeroSerie.trim() || undefined,
          dataAquisicao: dataAquisicao || undefined,
          valorAquisicao: valorAquisicao ? parseFloat(valorAquisicao) : undefined,
          vidaUtilMeses: vidaUtilMeses ? parseInt(vidaUtilMeses, 10) : undefined,
        },
      });
    } else {
      mutVincular.mutate({
        companyId: Number(selectedCompanyId),
        itemId: item.id,
        tipo: "locado",
        locado: {
          fornecedorNome: fornecedorNome.trim(),
          obraId: item.obraId ?? undefined,
          dataInicio,
          dataFimPrevista,
          valorMensal: valorMensal ? parseFloat(valorMensal) : undefined,
          valorDiario: valorDiario ? parseFloat(valorDiario) : undefined,
          codigoPatrimonioFornecedor: codigoPatrimonioFornecedor.trim() || undefined,
        },
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-violet-50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Marcar como equipamento</h2>
              <p className="text-xs text-gray-500 line-clamp-1">{item.nome}</p>
            </div>
          </div>
          <button onClick={onFechar} className="p-1.5 hover:bg-white rounded-lg transition">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Tipo */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Tipo do equipamento</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTipo("proprio")}
                className={`flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition text-left ${
                  tipo === "proprio"
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100"
                    : "border-gray-200 hover:border-indigo-200 bg-white"
                }`}
              >
                <Wrench className={`h-5 w-5 ${tipo === "proprio" ? "text-indigo-600" : "text-gray-400"}`} />
                <div>
                  <p className={`text-sm font-semibold ${tipo === "proprio" ? "text-indigo-700" : "text-gray-700"}`}>Próprio</p>
                  <p className="text-[11px] text-gray-500">Ativo da empresa (patrimônio)</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setTipo("locado")}
                className={`flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition text-left ${
                  tipo === "locado"
                    ? "border-amber-500 bg-amber-50 ring-2 ring-amber-100"
                    : "border-gray-200 hover:border-amber-200 bg-white"
                }`}
              >
                <Truck className={`h-5 w-5 ${tipo === "locado" ? "text-amber-600" : "text-gray-400"}`} />
                <div>
                  <p className={`text-sm font-semibold ${tipo === "locado" ? "text-amber-700" : "text-gray-700"}`}>Locado</p>
                  <p className="text-[11px] text-gray-500">Alugado de fornecedor externo</p>
                </div>
              </button>
            </div>
          </div>

          {!item.fotoUrl && tipo === "locado" && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[12px] text-amber-800">
              ⚠ Equipamentos locados exigem foto de recebimento. Cadastre uma foto no item primeiro (botão <strong>Buscar na web</strong> ou upload manual).
            </div>
          )}

          {tipo === "proprio" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Marca</label>
                <input value={marca} onChange={(e) => setMarca(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-indigo-500 outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Modelo</label>
                <input value={modelo} onChange={(e) => setModelo(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-indigo-500 outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Número de Série</label>
                <input value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-indigo-500 outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Data de Aquisição</label>
                <input type="date" value={dataAquisicao} onChange={(e) => setDataAquisicao(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-indigo-500 outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Valor de Aquisição (R$)</label>
                <input type="number" step="0.01" value={valorAquisicao} onChange={(e) => setValorAquisicao(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-indigo-500 outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Vida Útil (meses)</label>
                <input type="number" value={vidaUtilMeses} onChange={(e) => setVidaUtilMeses(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-indigo-500 outline-none" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Fornecedor (Locadora) <span className="text-red-500">*</span></label>
                <input
                  value={fornecedorNome}
                  onChange={(e) => setFornecedorNome(e.target.value)}
                  placeholder="ex.: Jalves Locação"
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Início <span className="text-red-500">*</span></label>
                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-amber-500 outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Fim Previsto <span className="text-red-500">*</span></label>
                <input type="date" value={dataFimPrevista} onChange={(e) => setDataFimPrevista(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-amber-500 outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Valor Mensal (R$)</label>
                <input type="number" step="0.01" value={valorMensal} onChange={(e) => setValorMensal(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-amber-500 outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Valor Diário (R$)</label>
                <input type="number" step="0.01" value={valorDiario} onChange={(e) => setValorDiario(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-amber-500 outline-none" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Patrimônio do Fornecedor</label>
                <input value={codigoPatrimonioFornecedor} onChange={(e) => setCodigoPatrimonioFornecedor(e.target.value)} placeholder="ex.: BT-1234 (etiqueta da locadora)" className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-amber-500 outline-none" />
              </div>
            </div>
          )}

          <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-[11px] text-gray-600">
            <p><strong>O que será reaproveitado do item:</strong> nome ({item.nome}), categoria{item.categoria ? ` (${item.categoria})` : ""}{item.fotoUrl ? ", foto" : ""}{item.valorUnitario ? `, valor unitário (R$ ${parseFloat(String(item.valorUnitario)).toFixed(2)})` : ""}.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
          <button onClick={onFechar} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-white rounded-lg transition">
            Cancelar
          </button>
          <button
            onClick={submeter}
            disabled={!podeSubmeter}
            className={`px-5 py-2 text-sm font-semibold text-white rounded-lg shadow transition flex items-center gap-2 ${
              tipo === "proprio"
                ? "bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700"
                : "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {mutVincular.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Cadastrar como {tipo === "proprio" ? "Próprio" : "Locado"}
          </button>
        </div>
      </div>
    </div>
  );
}
