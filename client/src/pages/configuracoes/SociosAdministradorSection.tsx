import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Crown, UserCheck, ShieldCheck, FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";

function fmtCpf(cpf?: string | null) {
  if (!cpf) return "";
  const d = String(cpf).replace(/[^0-9]/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function SociosAdministradorSection({ companyId, isAdmin }: { companyId: number; isAdmin: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);

  const sociosQ = (trpc as any).financial.listSociosFromEmployees.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const adminQ = (trpc as any).financial.getSocioAdministrador.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  useEffect(() => {
    if (adminQ.data?.employeeId != null) setSelected(adminQ.data.employeeId);
  }, [adminQ.data?.employeeId]);

  const setMut = (trpc as any).financial.setSocioAdministrador.useMutation({
    onSuccess: () => {
      toast.success("Sócio administrador atualizado!");
      adminQ.refetch();
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao definir o sócio administrador."),
  });

  const socios: any[] = sociosQ.data ?? [];
  const currentId = adminQ.data?.employeeId ?? null;
  const dirty = selected !== currentId;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="rounded-2xl overflow-hidden border border-emerald-200 shadow-sm">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/20">
              <Crown className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold leading-tight">Sócio Administrador</h3>
              <p className="text-sm text-white/85 leading-tight">
                Critério exclusivo de sócios — define quem assina os contratos e documentos online.
              </p>
            </div>
          </div>
        </div>
        <div className="bg-emerald-50/60 px-5 py-3 flex items-start gap-2 text-sm text-emerald-900">
          <FileSignature className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
          <p>
            O sócio marcado abaixo será o responsável por <strong>assinar todos os contratos e
            documentos online</strong> da empresa (IntegraSign / FCSign) — ele entra automaticamente
            como signatário "Diretor / Sócio Administrador" nos contratos gerados a partir das Ordens de Compra.
          </p>
        </div>
      </div>

      {/* Atual */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div className="text-sm">
          <span className="text-gray-500">Sócio administrador atual: </span>
          {adminQ.isLoading ? (
            <span className="text-gray-400">carregando…</span>
          ) : adminQ.data?.nome ? (
            <span className="font-semibold text-gray-900">{adminQ.data.nome}</span>
          ) : (
            <span className="font-medium text-amber-600">Nenhum definido</span>
          )}
        </div>
      </div>

      {/* Lista de sócios */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700">Sócios cadastrados</h4>
          {sociosQ.isLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>

        {!sociosQ.isLoading && socios.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            Nenhum sócio cadastrado. Cadastre funcionários com tipo de contrato "Sócio" no módulo Colaboradores.
          </div>
        )}

        <div className="space-y-2">
          {socios.map((s) => {
            const isSel = selected === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!isAdmin}
                onClick={() => setSelected(s.id)}
                className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                  isSel
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300"
                    : "border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40"
                } ${!isAdmin ? "opacity-70 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border-2 ${
                    isSel ? "border-emerald-600 bg-emerald-600" : "border-gray-300 bg-white"
                  }`}
                >
                  {isSel && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
                <span className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-100 text-emerald-700">
                  <UserCheck className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 truncate flex items-center gap-2">
                    {s.nomeCompleto}
                    {currentId === s.id && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <Crown className="w-3 h-3" /> Administrador
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {fmtCpf(s.cpf) || "CPF não informado"}
                    {s.cargo ? ` · ${s.cargo}` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ações */}
      {isAdmin && (
        <div className="flex items-center justify-end gap-2 pt-1">
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => setSelected(currentId)}
              disabled={setMut.isPending}
            >
              Cancelar
            </Button>
          )}
          <Button
            onClick={() => setMut.mutate({ companyId, employeeId: selected })}
            disabled={!dirty || setMut.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {setMut.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando…</>
            ) : (
              <><Crown className="w-4 h-4 mr-2" /> Definir como sócio administrador</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
