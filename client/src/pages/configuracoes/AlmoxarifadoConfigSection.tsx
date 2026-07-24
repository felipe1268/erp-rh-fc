import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Warehouse, Tag, ExternalLink, ChevronRight, AlertTriangle, Loader2, ShieldAlert, BellRing } from "lucide-react";
import { toast } from "sonner";

export function AlmoxarifadoConfigSection() {
  const [, navigate] = useLocation();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const { data: categorias = [] } = trpc.compras.listarCategorias.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: contagens = {} as Record<string, number>, refetch: refetchCount } =
    trpc.compras.contarItensPorCategoria.useQuery({ companyId }, { enabled: !!companyId });

  const utils = trpc.useUtils();
  // Rev. 2400 — Toggle global do controle de auditoria do Almoxarifado.
  const auditCfgQ = trpc.compras.getAuditoriaConfig.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const setAuditCfgMut = trpc.compras.setAuditoriaConfig.useMutation({
    onSuccess: () => { auditCfgQ.refetch(); toast.success("Controle de auditoria atualizado."); },
    onError: (e) => toast.error(e.message),
  });
  const exigeSenha = !!auditCfgQ.data?.exigeSenha;
  const exigeJustificativa = !!auditCfgQ.data?.exigeJustificativa;
  // Rev. 2462 — toggle independente de "Exigir aprovação do gestor".
  // Default true (preserva comportamento anterior) quando ainda não há
  // resposta do servidor / coluna ainda não populada.
  const exigeAprovacao = auditCfgQ.data
    ? (auditCfgQ.data as any).exigeAprovacao !== false
    : true;

  // Rev. 4555 — toggle do alerta automático de locações a vencer (abre no login).
  // Lê/grava o critério `almox_alerta_locacao_auto` (Critérios do Sistema).
  const alertaCritQ = trpc.criteria.getByCategory.useQuery(
    { companyId, categoria: "almoxarifado" }, { enabled: !!companyId }
  );
  const alertaCrit = (alertaCritQ.data as any[] | undefined)?.find(
    (c) => c.chave === "almox_alerta_locacao_auto"
  );
  const alertaLocacaoAtivo = alertaCritQ.isSuccess
    ? (alertaCrit ? alertaCrit.valor === "1" : true) // sem seed = ligado por padrão
    : true;
  const initCritMut = trpc.criteria.initDefaults.useMutation();
  const updateCritMut = trpc.criteria.updateBatch.useMutation({
    onSuccess: () => {
      alertaCritQ.refetch();
      utils.criteria.getByCategory.invalidate({ companyId, categoria: "almoxarifado" });
      toast.success("Alerta de locações atualizado.");
    },
    onError: (e) => toast.error(e.message),
  });
  const [salvandoAlerta, setSalvandoAlerta] = useState(false);
  async function toggleAlertaLocacao(v: boolean) {
    if (!companyId) return;
    setSalvandoAlerta(true);
    try {
      if (!alertaCrit) await initCritMut.mutateAsync({ companyId });
      await updateCritMut.mutateAsync({
        companyId,
        criterios: [{ chave: "almox_alerta_locacao_auto", valor: v ? "1" : "0" }],
      });
    } catch { /* onError já mostra o toast */ }
    finally { setSalvandoAlerta(false); }
  }

  const limparMut = trpc.compras.limparCategoriasOrfas.useMutation({
    onSuccess: (r: any) => {
      const n = Number(r?.itensMigrados ?? 0);
      if (n === 0) {
        toast.success("Nenhuma categoria órfã encontrada — tudo limpo!");
      } else {
        const cats = (r?.categoriasOrfas ?? []).map((o: any) => `"${o.categoria}"`).join(", ");
        toast.success(`${n} ${n === 1 ? "item movido" : "itens movidos"} para "Sem categoria". Categorias removidas: ${cats}.`);
      }
      refetchCount();
      utils.compras.listarCategoriasAlmoxarifado.invalidate({ companyId });
      utils.compras.listarItens.invalidate();
      utils.compras.listarItensConsolidado.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalItens = Object.values(contagens).reduce((a, b) => a + Number(b || 0), 0);
  const semCategoria = Number(contagens["__sem__"] ?? 0);
  const nomesCadastrados = new Set(categorias.map(c => c.nome));
  const orfas = Object.entries(contagens)
    .filter(([k]) => k !== "__sem__" && !nomesCadastrados.has(k))
    .map(([k, v]) => ({ categoria: k, total: Number(v) }))
    .sort((a, b) => b.total - a.total);
  const totalOrfaos = orfas.reduce((s, o) => s + o.total, 0);

  return (
    <div className="border rounded-lg overflow-hidden border-emerald-200">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-xs font-bold text-emerald-700 uppercase tracking-wider border-b border-emerald-200">
        <Warehouse className="w-4 h-4" />
        Almoxarifado
      </div>

      <button
        onClick={() => navigate("/almoxarifado/categorias")}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-emerald-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Tag className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-medium text-gray-800 text-sm flex items-center gap-2 flex-wrap">
              Categorias do Almoxarifado
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-mono">
                {categorias.length} {categorias.length === 1 ? "categoria" : "categorias"}
              </span>
              {semCategoria > 0 && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-mono">
                  ⚠ {semCategoria} sem categoria
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Criar, renomear e excluir categorias. Ao excluir, os itens vão para "Sem categoria".
              {totalItens > 0 && ` • ${totalItens} ${totalItens === 1 ? "item ativo" : "itens ativos"} no total.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-emerald-600 flex-shrink-0 ml-2">
          <ExternalLink className="w-3.5 h-3.5" />
          <ChevronRight className="w-4 h-4" />
        </div>
      </button>

      {/* Rev. 2400 — Toggle de controle de auditoria (senha + justificativa). */}
      <div className="border-t border-emerald-100 bg-white px-4 py-3">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-800 text-sm">Controle de auditoria do Almoxarifado</div>
            <p className="text-xs text-gray-500 mt-0.5">
              Toda exclusão / alteração manual fica registrada no log com usuário, horário e IP — independente dos toggles abaixo. Os toggles controlam apenas o que é exigido na hora da ação e se a aprovação do gestor é necessária.
            </p>
            <div className="mt-3 space-y-2">
              <label className="flex items-center justify-between gap-3 py-1.5 px-2 rounded hover:bg-emerald-50/40">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800">Exigir senha do usuário</div>
                  <p className="text-[11px] text-gray-500">Só se aplica a quem tem login local (OAuth nunca pede senha).</p>
                </div>
                <Switch
                  checked={exigeSenha}
                  disabled={!companyId || auditCfgQ.isLoading || setAuditCfgMut.isPending}
                  onCheckedChange={(v) => setAuditCfgMut.mutate({ companyId, exigeSenha: !!v, exigeJustificativa, exigeAprovacao })}
                />
              </label>
              <label className="flex items-center justify-between gap-3 py-1.5 px-2 rounded hover:bg-emerald-50/40">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800">Exigir justificativa</div>
                  <p className="text-[11px] text-gray-500">Texto livre (mín. 10 caracteres) registrado no log de auditoria.</p>
                </div>
                <Switch
                  checked={exigeJustificativa}
                  disabled={!companyId || auditCfgQ.isLoading || setAuditCfgMut.isPending}
                  onCheckedChange={(v) => setAuditCfgMut.mutate({ companyId, exigeSenha, exigeJustificativa: !!v, exigeAprovacao })}
                />
              </label>
              {/* Rev. 2462 — toggle de aprovação do gestor (independente). */}
              <label className="flex items-center justify-between gap-3 py-1.5 px-2 rounded hover:bg-emerald-50/40">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800">Exigir aprovação do gestor</div>
                  <p className="text-[11px] text-gray-500">Quando ligado, cada ação entra como <b>pendente</b> e o gestor da obra precisa aprovar/rejeitar em <i>Almoxarifado › Auditoria</i>. Quando desligado, o registro vai direto como <b>validado</b> (log continua).</p>
                </div>
                <Switch
                  checked={exigeAprovacao}
                  disabled={!companyId || auditCfgQ.isLoading || setAuditCfgMut.isPending}
                  onCheckedChange={(v) => setAuditCfgMut.mutate({ companyId, exigeSenha, exigeJustificativa, exigeAprovacao: !!v })}
                />
              </label>
            </div>
            {!exigeAprovacao && (
              <div className="mt-2 bg-blue-50 border border-blue-200 text-blue-800 text-[11px] rounded-md px-2.5 py-1.5">
                ℹ Aprovação dispensada: ações vão direto como validadas. O log completo (usuário, horário, IP, antes/depois) continua sendo gravado.
              </div>
            )}
            {!exigeSenha && !exigeJustificativa && exigeAprovacao && (
              <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-md px-2.5 py-1.5">
                ⚠ Senha e justificativa desligadas: qualquer usuário pode confirmar a ação sem barreira no momento — mas o gestor ainda precisa aprovar depois.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rev. 4555 — Toggle do alerta automático de locações a vencer (abre no login). */}
      <div className="border-t border-emerald-100 bg-white px-4 py-3">
        <div className="flex items-start gap-3">
          <BellRing className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <label className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-gray-800 text-sm">Alerta automático de locações a vencer</div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Quando ligado, ao <b>entrar no sistema</b> abre automaticamente o aviso de equipamentos locados vencendo ou vencidos (1x por sessão), mostrando somente os itens das obras que o usuário tem acesso — para validar a renovação ou devolução.
                </p>
              </div>
              <Switch
                checked={alertaLocacaoAtivo}
                disabled={!companyId || alertaCritQ.isLoading || salvandoAlerta}
                onCheckedChange={(v) => toggleAlertaLocacao(!!v)}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Rev. 2395 — Banner de categorias órfãs (itens com string de categoria que não existe mais) */}
      {orfas.length > 0 && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                {totalOrfaos} {totalOrfaos === 1 ? "item está marcado" : "itens estão marcados"} com categoria que não existe mais
              </p>
              <p className="text-xs text-amber-800 mt-1">
                {orfas.slice(0, 5).map(o => `"${o.categoria}" (${o.total})`).join(", ")}
                {orfas.length > 5 && ` e mais ${orfas.length - 5}…`}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Mover {totalOrfaos === 1 ? "este item" : "estes itens"} para "Sem categoria" para você reclassificar depois.
              </p>
            </div>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
              onClick={() => limparMut.mutate({ companyId })}
              disabled={limparMut.isPending}
            >
              {limparMut.isPending
                ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Movendo…</>
                : "Mover para Sem categoria"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
