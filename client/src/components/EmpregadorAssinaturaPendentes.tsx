// ============================================================================
// EmpregadorAssinaturaPendentes — fila de documentos aguardando co-assinatura
// do empregador. Visível somente para admins com canManageEmployerSignature.
// Azul/ice-blue/branco/cinza — sem verde nesta UI; âmbar/vermelho p/ alertas.
//
// API canônica:
//   rhDocumentos.employerSigStatus({ companyId })
//     → { configurada, autoSignAtivo, canManage, ... }
//   rhDocumentos.pendentesAssinaturaEmpregador({ companyId })
//     → { docs: [{ id, titulo, nomeColaborador, assinadoEm }], total }
//   rhDocumentos.assinarLoteEmpregador({ companyId, docIds })
//     → { assinados: number }
// ============================================================================
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Building2, Loader2, CheckSquare, AlertTriangle,
  Info, FileSignature, CheckCircle2, Clock,
} from "lucide-react";

interface Props {
  companyId: number;
}

export default function EmpregadorAssinaturaPendentes({ companyId }: Props) {
  const utils = trpc.useUtils();
  const [selIds, setSelIds] = useState<Set<number>>(new Set());
  const [confirmando, setConfirmando] = useState(false);

  // ── Busca pendências ──
  const pendQ = (trpc as any).rhDocumentos?.pendentesAssinaturaEmpregador?.useQuery
    ? (trpc as any).rhDocumentos.pendentesAssinaturaEmpregador.useQuery(
        { companyId },
        { enabled: !!companyId }
      )
    : { data: null, isLoading: false, refetch: () => {} };

  // ── Status de configuração (verifica se assinatura está registrada) ──
  const statusQ = (trpc as any).rhDocumentos?.employerSigStatus?.useQuery
    ? (trpc as any).rhDocumentos.employerSigStatus.useQuery(
        { companyId },
        { enabled: !!companyId }
      )
    : { data: null, isLoading: false };

  // ── Mutation de lote ──
  const assinarLoteMut = (trpc as any).rhDocumentos?.assinarLoteEmpregador?.useMutation
    ? (trpc as any).rhDocumentos.assinarLoteEmpregador.useMutation({
        onSuccess: (r: any) => {
          const ok = r?.assinados ?? selIds.size;
          toast.success(`${ok} documento(s) co-assinado(s) com sucesso!`);
          setSelIds(new Set());
          setConfirmando(false);
          // Invalida todos os caches relevantes
          utils.rhDocumentos.listar.invalidate();
          utils.rhDocumentos.checklist.invalidate();
          utils.rhDocumentos.checklistGeral.invalidate();
          utils.rhDocumentos.get.invalidate();
          pendQ.refetch?.();
        },
        onError: (e: any) => {
          toast.error(e?.message || "Erro ao co-assinar documentos.");
          setConfirmando(false);
        },
      })
    : { mutate: () => {}, isPending: false };

  // ── Derivações ──
  const docs: any[] = (pendQ.data as any)?.docs ?? [];
  const total: number = (pendQ.data as any)?.total ?? docs.length;
  const cfg = statusQ.data as any;
  // Usa o campo booleano `configurada` — nunca tenta ler o PNG
  const configurada: boolean = !!cfg?.configurada;

  const toggleId = (id: number) => {
    setSelIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const todosSelec = docs.length > 0 && docs.every((d: any) => selIds.has(d.id));
  const toggleTodos = () =>
    setSelIds(todosSelec ? new Set() : new Set(docs.map((d: any) => d.id)));

  const handleAssinarLote = () => {
    if (selIds.size === 0) return;
    if (!configurada) {
      toast.error("Configure a assinatura institucional primeiro em Configurações → Sócios.");
      return;
    }
    (assinarLoteMut as any).mutate({ companyId, docIds: Array.from(selIds) });
    setConfirmando(false);
  };

  // ── Estados de carregamento ──
  if (pendQ.isLoading || statusQ.isLoading) {
    return (
      <Card className="border-blue-200">
        <CardContent className="py-6 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Carregando fila de co-assinatura…
        </CardContent>
      </Card>
    );
  }

  // ── Config não pronta ──
  if (!configurada) {
    return (
      <Card className="border-blue-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-blue-800">
            <Building2 className="h-4 w-4" /> Co-assinatura do Empregador
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Assinatura institucional não configurada.</p>
              <p className="mt-0.5">
                Acesse <strong>Configurações → Sócios</strong> e registre a assinatura do sócio
                administrador para habilitar a co-assinatura em lote dos documentos padrão.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Sem pendências ──
  if (docs.length === 0) {
    return (
      <Card className="border-blue-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-blue-800">
            <Building2 className="h-4 w-4" /> Co-assinatura do Empregador
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
            Nenhum documento aguardando co-assinatura do empregador.
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Contratos CLT/Experiência e documentos individuais não aparecem aqui — eles exigem assinatura individual.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Fila com documentos pendentes ──
  return (
    <Card className="border-blue-200 overflow-hidden">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-blue-800 to-blue-950 text-white px-4 py-3 flex items-center gap-3">
        <FileSignature className="h-5 w-5 text-blue-200 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">Co-assinatura do Empregador</h3>
          <p className="text-[11px] text-blue-200">
            Documentos padrão assinados pelo colaborador aguardando co-assinatura institucional.
          </p>
        </div>
        <Badge className="bg-amber-400 text-amber-900 border-0 text-[11px] font-bold">
          {total} pendente{total !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Aviso sobre contratos excluídos */}
      <div className="flex items-start gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 text-[11px] text-blue-800">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
        <span>
          Apenas documentos padrão recorrentes aparecem aqui.
          <strong> Contratos CLT, de experiência e documentos individuais são excluídos</strong> e exigem assinatura manual.
        </span>
      </div>

      <CardContent className="pt-3 space-y-2">
        {/* Controles de seleção */}
        <div className="flex items-center justify-between gap-2 pb-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <Checkbox
              checked={todosSelec ? true : selIds.size > 0 ? "indeterminate" : false}
              onCheckedChange={(c) => {
                if (c === true || c === "indeterminate") toggleTodos();
                else setSelIds(new Set());
              }}
              disabled={(assinarLoteMut as any).isPending}
              className="h-4 w-4 data-[state=checked]:bg-blue-700 data-[state=checked]:border-blue-700 data-[state=indeterminate]:bg-blue-700 data-[state=indeterminate]:border-blue-700"
            />
            <span className="text-slate-600">
              {todosSelec ? "Desmarcar todos" : `Selecionar todos (${docs.length})`}
            </span>
          </label>
          {selIds.size > 0 && (
            <span className="text-xs text-blue-700 font-medium">{selIds.size} selecionado(s)</span>
          )}
        </div>

        {/* Lista de documentos */}
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {docs.map((d: any) => (
            <div
              key={d.id}
              className={`flex items-center gap-2 border rounded-lg px-2.5 py-2 transition-colors ${
                selIds.has(d.id) ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Checkbox
                checked={selIds.has(d.id)}
                onCheckedChange={() => toggleId(d.id)}
                disabled={(assinarLoteMut as any).isPending}
                className="h-4 w-4 flex-shrink-0 data-[state=checked]:bg-blue-700 data-[state=checked]:border-blue-700"
              />
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium block truncate" title={d.titulo}>
                  {d.titulo}
                </span>
                <span className="text-[10px] text-slate-400">
                  {d.nomeColaborador && <span>{d.nomeColaborador} · </span>}
                  <Clock className="inline w-2.5 h-2.5 mb-0.5" />{" "}
                  {d.assinadoEm
                    ? `Col. assinou em ${new Date(d.assinadoEm).toLocaleDateString("pt-BR")}`
                    : "Aguardando"}
                </span>
              </div>
              <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] flex-shrink-0">
                Aguarda empregador
              </Badge>
            </div>
          ))}
        </div>

        {/* Botão / confirmação */}
        {!confirmando ? (
          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              className="h-8 px-4 gap-2 bg-blue-700 hover:bg-blue-800 text-white"
              disabled={selIds.size === 0 || (assinarLoteMut as any).isPending}
              onClick={() => setConfirmando(true)}
            >
              <FileSignature className="w-3.5 h-3.5" />
              Co-assinar selecionados ({selIds.size})
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-blue-900">
              Confirmar co-assinatura de {selIds.size} documento(s) com a assinatura institucional cadastrada?
            </p>
            <p className="text-[11px] text-blue-700">
              A assinatura será aplicada usando a imagem registrada na configuração. Esta ação é auditada e irreversível.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] border-slate-300"
                disabled={(assinarLoteMut as any).isPending}
                onClick={() => setConfirmando(false)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="h-7 text-[11px] gap-1.5 bg-blue-700 hover:bg-blue-800 text-white"
                disabled={(assinarLoteMut as any).isPending}
                onClick={handleAssinarLote}
              >
                {(assinarLoteMut as any).isPending
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Assinando…</>
                  : <><CheckSquare className="w-3 h-3" /> Confirmar assinatura</>}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
