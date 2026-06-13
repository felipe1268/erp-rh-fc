import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Crown, UserCheck, ShieldCheck, FileSignature, Loader2, Save,
  Percent, Banknote, CalendarDays, KeyRound, Users,
} from "lucide-react";
import { toast } from "sonner";

function fmtCpf(cpf?: string | null) {
  if (!cpf) return "";
  const d = String(cpf).replace(/[^0-9]/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// ── Máscara BRL local (digita-se em centavos → "2.500,00") ──
function fmtCentsMask(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function digitsToCents(s: string) {
  return Number(String(s).replace(/\D/g, "") || "0");
}
function valorToMask(v: any): string {
  if (v == null || v === "") return "";
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "")) ||
    parseFloat(String(v));
  if (isNaN(n)) return "";
  return fmtCentsMask(Math.round(n * 100));
}

type FinForm = { percentual: string; proLabore: string; dia: string; pix: string };

export function SociosAdministradorSection({ companyId, isAdmin }: { companyId: number; isAdmin: boolean }) {
  const [forms, setForms] = useState<Record<number, FinForm>>({});

  const sociosQ = (trpc as any).financial.listSociosUnificado.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const adminQ = (trpc as any).financial.getSocioAdministrador.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  const socios: any[] = sociosQ.data ?? [];

  // Semeia os formulários financeiros a partir dos dados carregados (não sobrescreve digitação).
  useEffect(() => {
    if (!socios.length) return;
    setForms((prev) => {
      const next = { ...prev };
      for (const s of socios) {
        if (next[s.employeeId] === undefined) {
          next[s.employeeId] = {
            percentual: s.percentualSociedade != null ? String(s.percentualSociedade) : "",
            proLabore: valorToMask(s.valorProLabore),
            dia: s.diaVencimento != null ? String(s.diaVencimento) : "5",
            pix: s.pixChave ?? "",
          };
        }
      }
      return next;
    });
  }, [sociosQ.dataUpdatedAt]);

  const setMut = (trpc as any).financial.setSocioAdministrador.useMutation({
    onSuccess: () => {
      toast.success("Sócio administrador atualizado!");
      adminQ.refetch();
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao definir o sócio administrador."),
  });

  const upsertMut = (trpc as any).financial.upsertPartnerByEmployee.useMutation({
    onSuccess: () => {
      toast.success("Dados financeiros do sócio salvos!");
      sociosQ.refetch();
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar dados financeiros."),
  });

  const currentId = adminQ.data?.employeeId ?? null;

  const setField = (empId: number, key: keyof FinForm, value: string) =>
    setForms((f) => ({ ...f, [empId]: { ...(f[empId] ?? { percentual: "", proLabore: "", dia: "5", pix: "" }), [key]: value } }));

  const salvarFinanceiro = (empId: number) => {
    const f = forms[empId] ?? { percentual: "", proLabore: "", dia: "5", pix: "" };
    const cents = digitsToCents(f.proLabore);
    upsertMut.mutate({
      companyId,
      employeeId: empId,
      percentualSociedade: f.percentual.trim() !== "" ? Number(f.percentual.replace(",", ".")) : null,
      valorProLabore: f.proLabore.trim() !== "" ? cents / 100 : null,
      diaVencimento: f.dia.trim() !== "" ? Number(f.dia) : 5,
      pixChave: f.pix.trim() || null,
    });
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="rounded-2xl overflow-hidden border border-emerald-200 shadow-sm">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/20">
              <Users className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold leading-tight">Sócios</h3>
              <p className="text-sm text-white/85 leading-tight">
                Local único do quadro societário — cadastro (de Colaboradores), sócio administrador e dados financeiros (pró-labore, participação, PIX).
              </p>
            </div>
          </div>
        </div>
        <div className="bg-emerald-50/60 px-5 py-3 flex items-start gap-2 text-sm text-emerald-900">
          <FileSignature className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
          <p>
            O sócio marcado como <strong>administrador</strong> assina todos os contratos e documentos
            online (IntegraSign / FCSign) — entra automaticamente como signatário "Diretor / Sócio
            Administrador" nos contratos gerados a partir das Ordens de Compra.
          </p>
        </div>
      </div>

      {/* Administrador atual */}
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

        <div className="space-y-3">
          {socios.map((s) => {
            const isAdminCurrent = currentId === s.employeeId;
            const f = forms[s.employeeId] ?? { percentual: "", proLabore: "", dia: "5", pix: "" };
            const settingThis = setMut.isPending && setMut.variables?.employeeId === s.employeeId;
            return (
              <div
                key={s.employeeId}
                className={`rounded-xl border transition-all ${
                  isAdminCurrent ? "border-emerald-500 ring-2 ring-emerald-200" : "border-gray-200"
                } bg-white overflow-hidden`}
              >
                {/* Cabeçalho do sócio */}
                <div className="w-full flex items-center gap-3 px-4 py-3">
                  <span
                    className={`flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border-2 ${
                      isAdminCurrent ? "border-emerald-600 bg-emerald-600" : "border-gray-300 bg-white"
                    }`}
                  >
                    {isAdminCurrent && <Crown className="w-3 h-3 text-white" />}
                  </span>
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-100 text-emerald-700">
                    <UserCheck className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 truncate flex items-center gap-2">
                      {s.nomeCompleto}
                      {isAdminCurrent && (
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
                </div>

                {/* Dados financeiros */}
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs flex items-center gap-1 text-gray-600">
                        <Percent className="w-3 h-3" /> % Sociedade
                      </Label>
                      <Input
                        type="number" step="0.01" min="0" max="100"
                        className="mt-1 h-9"
                        disabled={!isAdmin}
                        value={f.percentual}
                        onChange={(e) => setField(s.employeeId, "percentual", e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1 text-gray-600">
                        <Banknote className="w-3 h-3" /> Pró-labore (R$/mês)
                      </Label>
                      <div className="relative mt-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                        <Input
                          inputMode="numeric"
                          className="h-9 pl-7"
                          disabled={!isAdmin}
                          value={f.proLabore}
                          onChange={(e) => {
                            const cents = digitsToCents(e.target.value);
                            setField(s.employeeId, "proLabore", cents ? fmtCentsMask(cents) : "");
                          }}
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1 text-gray-600">
                        <CalendarDays className="w-3 h-3" /> Dia de vencimento
                      </Label>
                      <Input
                        type="number" min="1" max="28"
                        className="mt-1 h-9"
                        disabled={!isAdmin}
                        value={f.dia}
                        onChange={(e) => setField(s.employeeId, "dia", e.target.value)}
                        placeholder="5"
                      />
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1 text-gray-600">
                        <KeyRound className="w-3 h-3" /> Chave PIX
                      </Label>
                      <Input
                        className="mt-1 h-9"
                        disabled={!isAdmin}
                        value={f.pix}
                        onChange={(e) => setField(s.employeeId, "pix", e.target.value)}
                        placeholder="CPF, e-mail, telefone…"
                      />
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                      {isAdminCurrent ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <ShieldCheck className="w-3.5 h-3.5" /> Sócio administrador atual
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          className="h-8 bg-emerald-600 hover:bg-emerald-700"
                          disabled={setMut.isPending || adminQ.isLoading}
                          onClick={() => setMut.mutate({ companyId, employeeId: s.employeeId })}
                        >
                          {settingThis ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Definindo…</>
                          ) : (
                            <><Crown className="w-3.5 h-3.5 mr-1.5" /> Definir como administrador</>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        disabled={upsertMut.isPending}
                        onClick={() => salvarFinanceiro(s.employeeId)}
                      >
                        {upsertMut.isPending && upsertMut.variables?.employeeId === s.employeeId ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Salvando…</>
                        ) : (
                          <><Save className="w-3.5 h-3.5 mr-1.5" /> Salvar dados financeiros</>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
